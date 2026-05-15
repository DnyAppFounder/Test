import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SOLANA_RPC_URL = Deno.env.get("SOLANA_RPC_URL") || "";
const TREASURY_PK_RAW = Deno.env.get("GAME_TREASURY_PRIVATE_KEY") || "";

const REWARD_TOKEN_DECIMALS = 6;
const TOKEN_PROGRAM_ID_STR = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const ASSOC_TOKEN_PROGRAM_ID_STR = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1bv8";
const SYSTEM_PROGRAM_ID_STR = "11111111111111111111111111111111";

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
      if (status.err) throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
      if (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized") return;
    }
  }
  throw new Error("Transaction not confirmed within 60s");
}

async function sendRewardTokens(toWallet: string, mintAddress: string, amount: number): Promise<string> {
  if (!TREASURY_PK_RAW) throw new Error("GAME_TREASURY_PRIVATE_KEY not set");

  const { Keypair, PublicKey, Transaction, TransactionInstruction } =
    await import("npm:@solana/web3.js@1.98.4");

  const secretArray: number[] = JSON.parse(TREASURY_PK_RAW);
  const treasury = Keypair.fromSecretKey(new Uint8Array(secretArray));

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

  // Check treasury token balance
  const treasuryAccInfo = await solanaRpc("getTokenAccountBalance", [treasuryATA.toBase58()]) as any;
  const treasuryBalance = Number(treasuryAccInfo?.value?.amount || "0") / Math.pow(10, REWARD_TOKEN_DECIMALS);
  if (treasuryBalance < amount) {
    throw new Error(`INSUFFICIENT_POOL: treasury has ${treasuryBalance} tokens, need ${amount}`);
  }

  // Check if destination ATA exists
  const destInfo = await solanaRpc("getAccountInfo", [destinationATA.toBase58(), { encoding: "base64" }]) as any;

  const tx = new Transaction();

  // Create destination ATA if missing (treasury pays the rent)
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

  // Transfer instruction (SPL Token transfer: instruction 3)
  const rawAmount = BigInt(Math.floor(amount * Math.pow(10, REWARD_TOKEN_DECIMALS)));
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
  if (!blockhash) throw new Error("Could not fetch blockhash");

  tx.recentBlockhash = blockhash;
  tx.feePayer = treasury.publicKey;
  tx.sign(treasury);

  const rawBase64 = btoa(String.fromCharCode(...tx.serialize()));
  const sig = await solanaRpc("sendTransaction", [
    rawBase64,
    { encoding: "base64", skipPreflight: false, preflightCommitment: "confirmed" },
  ]) as string;

  if (!sig || typeof sig !== "string") throw new Error("Invalid signature from RPC");

  await pollConfirmation(sig);
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

    const db = createClient(SUPABASE_URL, SERVICE_KEY);

    // Fetch reward — must be owned by this wallet and status = ready
    const { data: reward, error: fetchErr } = await db
      .from("user_rewards")
      .select("*")
      .eq("id", reward_id)
      .eq("wallet_address", wallet_address)
      .eq("status", "ready")
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!reward) {
      return new Response(
        JSON.stringify({ success: false, error: "Reward not found or already claimed" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Atomic lock — only succeeds if still 'ready' (prevents concurrent double-claims)
    const { error: lockErr, count } = await db
      .from("user_rewards")
      .update({ status: "claiming", updated_at: new Date().toISOString() })
      .eq("id", reward_id)
      .eq("status", "ready")
      .select("id", { count: "exact", head: true });

    if (lockErr) throw lockErr;
    if (!count || count === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "Reward is being claimed or already sent" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Send tokens from treasury
    let signature: string;
    try {
      signature = await sendRewardTokens(wallet_address, reward.reward_token_mint, reward.reward_amount);
    } catch (sendErr: any) {
      // Revert to ready so user can try again
      await db
        .from("user_rewards")
        .update({ status: "ready", updated_at: new Date().toISOString() })
        .eq("id", reward_id);

      const msg = String(sendErr?.message || sendErr);
      if (msg.startsWith("INSUFFICIENT_POOL")) {
        return new Response(
          JSON.stringify({ success: false, error: "Reward pool temporarily unavailable" }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      throw sendErr;
    }

    // Mark as sent
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
    console.error("[reward-claim]", err);
    return new Response(
      JSON.stringify({ success: false, error: err?.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
