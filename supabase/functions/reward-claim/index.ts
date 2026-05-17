import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import bs58 from "npm:bs58@5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SOLANA_RPC_URL = Deno.env.get("SOLANA_RPC_URL") || "";
const TREASURY_PRIVATE_KEY_B58 = Deno.env.get("TREASURY_PRIVATE_KEY_BASE58") || "";
const TREASURY_PUBLIC_KEY = Deno.env.get("TREASURY_PUBLIC_KEY") || "";
const DWC_MINT_ENV = Deno.env.get("DWC_MINT") || "";
const DWC_DECIMALS_ENV = parseInt(Deno.env.get("DWC_DECIMALS") || "6", 10);

const TOKEN_PROGRAM_ID_STR = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const ASSOC_TOKEN_PROGRAM_ID_STR = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1bv8";
const SYSTEM_PROGRAM_ID_STR = "11111111111111111111111111111111";
const MIN_SOL_BALANCE = 0.002;

function loadTreasuryKeypairBytes(): Uint8Array {
  const raw = TREASURY_PRIVATE_KEY_B58.trim();
  if (!raw) throw new Error("TREASURY_PRIVATE_KEY_BASE58 is not set");
  let decoded: Uint8Array;
  try {
    decoded = bs58.decode(raw);
  } catch {
    throw new Error("Invalid TREASURY_PRIVATE_KEY_BASE58: not valid base58");
  }
  if (decoded.length !== 64) {
    throw new Error(`Invalid TREASURY_PRIVATE_KEY_BASE58: decoded to ${decoded.length} bytes, expected 64`);
  }
  return decoded;
}

async function solanaRpc(method: string, params: unknown[]): Promise<unknown> {
  if (!SOLANA_RPC_URL) throw new Error("SOLANA_RPC_URL not configured");
  const resp = await fetch(SOLANA_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await resp.json() as { result?: unknown; error?: { message: string } };
  if (json.error) throw new Error(`RPC ${method}: ${json.error.message}`);
  return json.result;
}

async function pollConfirmation(sig: string, timeoutMs = 60000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 2500));
    const result = await solanaRpc("getSignatureStatuses", [[sig], { searchTransactionHistory: true }]) as any;
    const status = result?.value?.[0];
    if (status) {
      if (status.err) throw new Error(`Transaction failed on-chain: ${JSON.stringify(status.err)}`);
      if (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized") return;
    }
  }
  throw new Error("Transaction not confirmed within 60s");
}

async function sendRewardTokens(toWallet: string, mintAddress: string, amount: number): Promise<string> {
  if (!SOLANA_RPC_URL) throw new Error("SOLANA_RPC_URL is not configured");
  if (!TREASURY_PRIVATE_KEY_B58) throw new Error("TREASURY_PRIVATE_KEY_BASE58 is not configured");

  const secretKey = loadTreasuryKeypairBytes();
  const decimals = DWC_DECIMALS_ENV;

  const { Keypair, PublicKey, Transaction, TransactionInstruction } =
    await import("npm:@solana/web3.js@1.98.4");

  const treasury = Keypair.fromSecretKey(secretKey);
  console.log(`[reward-claim] treasury wallet: ${treasury.publicKey.toBase58()}`);

  // Verify treasury public key if env var is set
  if (TREASURY_PUBLIC_KEY && treasury.publicKey.toBase58() !== TREASURY_PUBLIC_KEY) {
    throw new Error(`Treasury keypair mismatch: derived ${treasury.publicKey.toBase58()}, expected ${TREASURY_PUBLIC_KEY}`);
  }

  const tokenProgramId = new PublicKey(TOKEN_PROGRAM_ID_STR);
  const assocTokenProgramId = new PublicKey(ASSOC_TOKEN_PROGRAM_ID_STR);
  const systemProgramId = new PublicKey(SYSTEM_PROGRAM_ID_STR);
  const mintPubkey = new PublicKey(mintAddress);
  const toPubkey = new PublicKey(toWallet);

  function findATA(owner: InstanceType<typeof PublicKey>): InstanceType<typeof PublicKey> {
    const [ata] = PublicKey.findProgramAddressSync(
      [owner.toBuffer(), tokenProgramId.toBuffer(), mintPubkey.toBuffer()],
      assocTokenProgramId,
    );
    return ata;
  }

  const treasuryATA = findATA(treasury.publicKey);
  const destinationATA = findATA(toPubkey);

  // Check treasury SOL balance for fees
  const solBalResult = await solanaRpc("getBalance", [treasury.publicKey.toBase58(), { commitment: "confirmed" }]) as any;
  const solBalance = Number(solBalResult ?? 0) / 1e9;
  console.log(`[reward-claim] treasury SOL balance: ${solBalance}`);
  if (solBalance < MIN_SOL_BALANCE) {
    throw new Error(`INSUFFICIENT_SOL: treasury has ${solBalance.toFixed(6)} SOL, need at least ${MIN_SOL_BALANCE} SOL for fees`);
  }

  // Check treasury token balance
  let treasuryBalance = 0;
  try {
    const treasuryAccInfo = await solanaRpc("getTokenAccountBalance", [treasuryATA.toBase58()]) as any;
    const uiAmount = treasuryAccInfo?.value?.uiAmount;
    if (uiAmount != null) {
      treasuryBalance = Number(uiAmount);
    } else {
      const rawAmt = Number(treasuryAccInfo?.value?.amount ?? "0");
      treasuryBalance = rawAmt / Math.pow(10, decimals);
    }
  } catch {
    treasuryBalance = 0;
  }

  const rawAmount = BigInt(Math.round(amount * Math.pow(10, decimals)));
  console.log(`[reward-claim] transfer: ${amount} DWC (${rawAmount} raw units), treasury balance: ${treasuryBalance}`);

  if (treasuryBalance < amount) {
    throw new Error(`INSUFFICIENT_POOL: treasury has ${treasuryBalance} DWC, need ${amount} DWC`);
  }

  // Check if destination ATA exists
  const destInfo = await solanaRpc("getAccountInfo", [destinationATA.toBase58(), { encoding: "base64" }]) as any;

  const tx = new Transaction();

  // Create destination ATA if missing
  if (!destInfo?.value) {
    tx.add(new TransactionInstruction({
      programId: assocTokenProgramId,
      keys: [
        { pubkey: treasury.publicKey, isSigner: true, isWritable: true },
        { pubkey: destinationATA, isSigner: false, isWritable: true },
        { pubkey: toPubkey, isSigner: false, isWritable: false },
        { pubkey: mintPubkey, isSigner: false, isWritable: false },
        { pubkey: systemProgramId, isSigner: false, isWritable: false },
        { pubkey: tokenProgramId, isSigner: false, isWritable: false },
      ],
      data: new Uint8Array(0),
    }));
  }

  // SPL Token transfer instruction (instruction index 3)
  const transferData = new Uint8Array(9);
  transferData[0] = 3;
  const view = new DataView(transferData.buffer);
  view.setBigUint64(1, rawAmount, true);

  tx.add(new TransactionInstruction({
    programId: tokenProgramId,
    keys: [
      { pubkey: treasuryATA, isSigner: false, isWritable: true },
      { pubkey: destinationATA, isSigner: false, isWritable: true },
      { pubkey: treasury.publicKey, isSigner: true, isWritable: false },
    ],
    data: transferData,
  }));

  const bhResult = await solanaRpc("getLatestBlockhash", [{ commitment: "confirmed" }]) as any;
  const blockhash = bhResult?.value?.blockhash ?? bhResult?.blockhash;
  if (!blockhash) throw new Error("Could not fetch blockhash from RPC");

  tx.recentBlockhash = blockhash;
  tx.feePayer = treasury.publicKey;
  tx.sign(treasury);

  const rawBase64 = btoa(String.fromCharCode(...tx.serialize()));
  const sig = await solanaRpc("sendTransaction", [
    rawBase64,
    { encoding: "base64", skipPreflight: false, preflightCommitment: "confirmed" },
  ]) as string;

  if (!sig || typeof sig !== "string") throw new Error("Invalid signature returned from RPC");

  console.log(`[reward-claim] tx sent: ${sig}, waiting for confirmation...`);
  await pollConfirmation(sig);
  console.log(`[reward-claim] confirmed: ${sig}`);
  return sig;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { reward_id, wallet_address } = await req.json() as { reward_id: string; wallet_address: string };

    if (!reward_id || !wallet_address) {
      return new Response(
        JSON.stringify({ success: false, error: "reward_id and wallet_address required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!SOLANA_RPC_URL) {
      return new Response(
        JSON.stringify({ success: false, error: "Server configuration error: SOLANA_RPC_URL not set" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!TREASURY_PRIVATE_KEY_B58) {
      return new Response(
        JSON.stringify({ success: false, error: "Server configuration error: TREASURY_PRIVATE_KEY_BASE58 not set" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const db = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: rewardAny, error: fetchErr } = await db
      .from("user_rewards")
      .select("*")
      .eq("id", reward_id)
      .eq("wallet_address", wallet_address)
      .maybeSingle();

    if (fetchErr) throw fetchErr;

    if (!rewardAny) {
      return new Response(
        JSON.stringify({ success: false, error: "Reward not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (rewardAny.status === "sent") {
      return new Response(
        JSON.stringify({ success: false, error: "Reward already claimed", signature: rewardAny.transaction_signature }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (rewardAny.status === "claiming") {
      return new Response(
        JSON.stringify({ success: false, error: "Reward claim already in progress, please wait" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (rewardAny.status !== "ready") {
      return new Response(
        JSON.stringify({ success: false, error: `Reward cannot be claimed (status: ${rewardAny.status})` }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Resolve mint: use env var DWC_MINT if reward record doesn't have one
    const mintAddress = rewardAny.reward_token_mint || DWC_MINT_ENV;
    if (!mintAddress) {
      return new Response(
        JSON.stringify({ success: false, error: "Server configuration error: DWC_MINT not set and reward has no mint" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Early member reward: enforce 100-user cap
    if (rewardAny.reason === "early_user_first_100") {
      const { count: sentCount } = await db
        .from("user_rewards")
        .select("id", { count: "exact", head: true })
        .eq("reason", "early_user_first_100")
        .eq("status", "sent");
      if ((sentCount ?? 0) >= 100) {
        return new Response(
          JSON.stringify({ success: false, error: "Early member claim limit reached (100/100 users)" }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Atomic lock — only succeeds if status is still 'ready'
    const { error: lockErr, data: lockData } = await db
      .from("user_rewards")
      .update({ status: "claiming", updated_at: new Date().toISOString() })
      .eq("id", reward_id)
      .eq("status", "ready")
      .select("id");

    if (lockErr) throw lockErr;
    if (!lockData || lockData.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "Reward is being claimed or already sent" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let signature: string;
    try {
      signature = await sendRewardTokens(wallet_address, mintAddress, rewardAny.reward_amount);
    } catch (sendErr: any) {
      const msg = String(sendErr?.message || sendErr);
      console.error("[reward-claim] send failed:", msg);

      await db
        .from("user_rewards")
        .update({ status: "ready", updated_at: new Date().toISOString() })
        .eq("id", reward_id);

      if (msg.includes("INSUFFICIENT_SOL")) {
        return new Response(
          JSON.stringify({ success: false, error: "Treasury is low on SOL for transaction fees. Please try again later." }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (msg.includes("INSUFFICIENT_POOL")) {
        return new Response(
          JSON.stringify({ success: false, error: "Reward pool temporarily unavailable. Please try again later." }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (msg.includes("mismatch") || msg.includes("not configured") || msg.includes("not set") || msg.includes("Invalid TREASURY")) {
        return new Response(
          JSON.stringify({ success: false, error: `Server configuration error: ${msg}` }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      throw sendErr;
    }

    const now = new Date().toISOString();
    await db.from("user_rewards").update({
      status: "sent",
      transaction_signature: signature,
      claimed_at: now,
      sent_at: now,
      updated_at: now,
    }).eq("id", reward_id);

    return new Response(
      JSON.stringify({ success: true, signature }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("[reward-claim] unhandled error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err?.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
