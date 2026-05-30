import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import bs58 from "npm:bs58@5";

// NOTE: @solana/spl-token intentionally NOT imported — v0.4.x crashes Deno runtime.
// All SPL/Token-2022 instructions are built manually using only @solana/web3.js.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SOLANA_RPC_URL = Deno.env.get("SOLANA_RPC_URL") || "";
const TREASURY_PRIVATE_KEY_B58 = Deno.env.get("TREASURY_PRIVATE_KEY_BASE58") || "";
const TREASURY_PUBLIC_KEY = (Deno.env.get("TREASURY_PUBLIC_KEY") ?? "")
  .trim().replace(/^["']|["']$/g, "");
const DWC_MINT_ENV = (Deno.env.get("DWC_MINT") ?? "")
  .trim().replace(/^["']|["']$/g, "");

const TOKEN_PROGRAM_ID_STR       = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM_ID_STR  = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const ASSOC_TOKEN_PROGRAM_ID_STR = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
const SYSTEM_PROGRAM_ID_STR      = "11111111111111111111111111111111";
const MIN_SOL_BALANCE            = 0.003;

const REFERRER_AMOUNT = 3000;
const REFERRED_AMOUNT = 5000;

function db() {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function loadTreasuryKeypairBytes(): Uint8Array {
  const raw = TREASURY_PRIVATE_KEY_B58.trim();
  if (!raw) throw new Error("TREASURY_PRIVATE_KEY_BASE58 is not set");
  let decoded: Uint8Array;
  try { decoded = bs58.decode(raw); } catch {
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
  const data = await resp.json() as { result?: unknown; error?: { message: string } };
  if (data.error) throw new Error(`RPC ${method}: ${data.error.message}`);
  return data.result;
}

async function pollConfirmation(sig: string, timeoutMs = 90000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 3000));
    const result = await solanaRpc("getSignatureStatuses", [
      [sig],
      { searchTransactionHistory: true },
    ]) as any;
    const status = result?.value?.[0];
    if (status) {
      if (status.err) throw new Error(`Transaction failed on-chain: ${JSON.stringify(status.err)}`);
      if (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized") return;
    }
  }
  throw new Error("Transaction confirmation timeout: not confirmed within 90s");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { referral_id } = await req.json() as { referral_id: string };

    if (!referral_id) return json({ success: false, error: "referral_id required" }, 400);

    if (!SOLANA_RPC_URL)           return json({ success: false, error: "Server config error: SOLANA_RPC_URL not set" }, 503);
    if (!TREASURY_PRIVATE_KEY_B58) return json({ success: false, error: "Server config error: TREASURY_PRIVATE_KEY_BASE58 not set" }, 503);
    if (!DWC_MINT_ENV)             return json({ success: false, error: "Server config error: DWC_MINT not set" }, 503);

    const supabase = db();

    // Fetch referral with wallet addresses for both parties
    const { data: referral, error: refErr } = await supabase
      .from("referrals")
      .select(`
        id, status, referrer_id, referred_id, referred_wallet_address,
        referrer:user_profiles!referrals_referrer_id_fkey(wallet_address)
      `)
      .eq("id", referral_id)
      .maybeSingle();

    if (refErr) throw refErr;
    if (!referral) return json({ success: false, error: "Referral not found" }, 404);
    if (referral.status === "paid") return json({ success: false, error: "Referral already paid" }, 409);
    if (referral.status !== "qualified") {
      return json({ success: false, error: `Referral not qualified (status: ${referral.status})` }, 409);
    }

    const referrerWallet: string = (referral as any).referrer?.wallet_address ?? "";
    const referredWallet: string = referral.referred_wallet_address ?? "";

    if (!referrerWallet) return json({ success: false, error: "Referrer wallet address not found" }, 400);
    if (!referredWallet) return json({ success: false, error: "Referred wallet address not found" }, 400);

    // ── Ensure reward records exist for both parties ──────────────────────────
    const { error: rewardRpcErr } = await supabase.rpc("create_referral_rewards", {
      p_referrer_user_id: referral.referrer_id,
      p_referrer_wallet:  referrerWallet,
      p_referred_user_id: referral.referred_id,
      p_referred_wallet:  referredWallet,
    });
    if (rewardRpcErr) {
      console.warn("[referral-payout] create_referral_rewards RPC warning:", rewardRpcErr.message);
    }

    // Fetch reward records for both parties
    const { data: rewards } = await supabase
      .from("user_rewards")
      .select("id, wallet_address, reward_amount, reason, status")
      .eq("referral_id", referral_id)
      .in("reason", ["referral_referrer", "referral_referred"])
      .in("status", ["ready", "sent"]);

    // Check if any are already sent
    const referrerReward = rewards?.find(r => r.reason === "referral_referrer");
    const referredReward = rewards?.find(r => r.reason === "referral_referred");

    if (referrerReward?.status === "sent" && referredReward?.status === "sent") {
      return json({ success: false, error: "Both referral rewards already sent" }, 409);
    }

    // If no rewards by referral_id, try by wallet + reason
    let finalReferrerReward = referrerReward;
    let finalReferredReward = referredReward;

    if (!finalReferrerReward) {
      const { data: r } = await supabase
        .from("user_rewards")
        .select("id, wallet_address, reward_amount, reason, status")
        .eq("wallet_address", referrerWallet)
        .eq("reason", "referral_referrer")
        .in("status", ["ready", "claiming"])
        .maybeSingle();
      finalReferrerReward = r ?? null;
    }

    if (!finalReferredReward) {
      const { data: r } = await supabase
        .from("user_rewards")
        .select("id, wallet_address, reward_amount, reason, status")
        .eq("wallet_address", referredWallet)
        .eq("reason", "referral_referred")
        .in("status", ["ready", "claiming"])
        .maybeSingle();
      finalReferredReward = r ?? null;
    }

    if (!finalReferrerReward || !finalReferredReward) {
      return json({ success: false, error: "Reward records not found; rewards may still be pending creation" }, 503);
    }

    if (finalReferrerReward.status === "claiming" || finalReferredReward.status === "claiming") {
      return json({ success: false, error: "Payout already in progress, please wait" }, 409);
    }

    // Atomic lock — mark both as claiming
    const rewardIds = [finalReferrerReward.id, finalReferredReward.id];
    const { error: lockErr, data: locked } = await supabase
      .from("user_rewards")
      .update({ status: "claiming", updated_at: new Date().toISOString() })
      .in("id", rewardIds)
      .eq("status", "ready")
      .select("id");

    if (lockErr) throw lockErr;
    if (!locked || locked.length < 2) {
      return json({ success: false, error: "Rewards being claimed or already sent" }, 409);
    }

    const rollback = async () => {
      await supabase
        .from("user_rewards")
        .update({ status: "ready", updated_at: new Date().toISOString() })
        .in("id", rewardIds);
    };

    // ── Build and send the combined transaction ───────────────────────────────
    let signature: string;
    try {
      signature = await sendDualTransfer(
        referrerWallet,
        REFERRER_AMOUNT,
        referredWallet,
        REFERRED_AMOUNT,
        DWC_MINT_ENV,
      );
    } catch (sendErr: any) {
      console.error("[referral-payout] transfer error:", sendErr.message);
      await rollback();
      return json({
        success: false,
        error: sendErr.message ?? "On-chain transfer failed",
        payout_pending: true,
      }, 500);
    }

    // Mark both rewards sent
    const now = new Date().toISOString();
    await supabase
      .from("user_rewards")
      .update({ status: "sent", transaction_signature: signature, claimed_at: now, sent_at: now, updated_at: now })
      .in("id", rewardIds);

    // Mark referral paid
    await supabase
      .from("referrals")
      .update({ status: "paid", reward_claimed: true })
      .eq("id", referral_id);

    console.log(`[referral-payout] paid referral ${referral_id} | sig: ${signature}`);
    return json({ success: true, signature });

  } catch (err: any) {
    console.error("[referral-payout] unhandled error:", err);
    return json({ success: false, error: err?.message || "Internal error" }, 500);
  }
});

// ── On-chain transfer helper ──────────────────────────────────────────────────

async function sendDualTransfer(
  walletA: string,
  amountA: number,
  walletB: string,
  amountB: number,
  mintAddress: string,
): Promise<string> {
  const { Keypair, PublicKey, Transaction, TransactionInstruction } =
    await import("npm:@solana/web3.js@1.98.4");

  // Load treasury keypair
  const treasury = Keypair.fromSecretKey(loadTreasuryKeypairBytes());
  const derivedPub = treasury.publicKey.toBase58();

  if (TREASURY_PUBLIC_KEY && derivedPub !== TREASURY_PUBLIC_KEY) {
    throw new Error("Treasury private key does not match TREASURY_PUBLIC_KEY");
  }

  const safeMint    = mintAddress.trim().replace(/^["']|["']$/g, "");
  const safeWalletA = walletA.trim().replace(/^["']|["']$/g, "");
  const safeWalletB = walletB.trim().replace(/^["']|["']$/g, "");

  const mintPubkey    = new PublicKey(safeMint);
  const pubkeyA       = new PublicKey(safeWalletA);
  const pubkeyB       = new PublicKey(safeWalletB);
  const systemProgId  = new PublicKey(SYSTEM_PROGRAM_ID_STR);
  const assocProgId   = new PublicKey(ASSOC_TOKEN_PROGRAM_ID_STR);

  // Detect token program from on-chain mint owner
  const mintAccInfo = await solanaRpc("getAccountInfo", [safeMint, { encoding: "jsonParsed", commitment: "confirmed" }]) as any;
  if (!mintAccInfo?.value) throw new Error(`Mint account not found on-chain: ${safeMint}`);

  const mintOwner  = mintAccInfo.value.owner as string;
  const isToken2022 = mintOwner === TOKEN_2022_PROGRAM_ID_STR;
  if (mintOwner !== TOKEN_PROGRAM_ID_STR && mintOwner !== TOKEN_2022_PROGRAM_ID_STR) {
    throw new Error(`Unrecognised token program: ${mintOwner}`);
  }
  const tokenProgId = new PublicKey(mintOwner);

  const decimals: number = mintAccInfo.value.data?.parsed?.info?.decimals;
  if (typeof decimals !== "number") throw new Error(`Could not read decimals from mint ${safeMint}`);

  console.log(`[referral-payout] mint ${safeMint.slice(0,4)} program: ${isToken2022 ? "Token-2022" : "SPL"} decimals: ${decimals}`);

  // Derive ATAs
  function ata(owner: InstanceType<typeof PublicKey>): InstanceType<typeof PublicKey> {
    const [derived] = PublicKey.findProgramAddressSync(
      [owner.toBuffer(), tokenProgId.toBuffer(), mintPubkey.toBuffer()],
      assocProgId,
    );
    return derived;
  }

  const treasuryATA = ata(treasury.publicKey);
  const ataA        = ata(pubkeyA);
  const ataB        = ata(pubkeyB);

  // Check treasury DWORLD balance
  const balResult = await solanaRpc("getTokenAccountBalance", [treasuryATA.toBase58()]) as any;
  const treasuryBalance = Number(balResult?.value?.uiAmount ?? 0);
  const totalNeeded = amountA + amountB;
  if (treasuryBalance < totalNeeded) {
    throw new Error(`Treasury has insufficient tokens: has ${treasuryBalance}, needs ${totalNeeded}`);
  }

  // Check treasury SOL
  const solBal = Number(await solanaRpc("getBalance", [derivedPub, { commitment: "confirmed" }]) as any) / 1e9;
  if (solBal < MIN_SOL_BALANCE) {
    throw new Error(`INSUFFICIENT_SOL: treasury has ${solBal.toFixed(6)} SOL, need ${MIN_SOL_BALANCE}`);
  }

  // Check which ATAs need creation
  const [ataAInfo, ataBInfo] = await Promise.all([
    solanaRpc("getAccountInfo", [ataA.toBase58(), { encoding: "base64", commitment: "confirmed" }]) as any,
    solanaRpc("getAccountInfo", [ataB.toBase58(), { encoding: "base64", commitment: "confirmed" }]) as any,
  ]);
  const ataAExists = !!(ataAInfo as any)?.value;
  const ataBExists = !!(ataBInfo as any)?.value;

  const tx = new Transaction();

  // Helper: create ATA instruction (CreateIdempotent discriminator = 1)
  function createAtaIx(owner: InstanceType<typeof PublicKey>, ataAddr: InstanceType<typeof PublicKey>) {
    return new TransactionInstruction({
      programId: assocProgId,
      keys: [
        { pubkey: treasury.publicKey, isSigner: true,  isWritable: true  },
        { pubkey: ataAddr,            isSigner: false, isWritable: true  },
        { pubkey: owner,              isSigner: false, isWritable: false },
        { pubkey: mintPubkey,         isSigner: false, isWritable: false },
        { pubkey: systemProgId,       isSigner: false, isWritable: false },
        { pubkey: tokenProgId,        isSigner: false, isWritable: false },
      ],
      data: new Uint8Array([1]),
    });
  }

  // Helper: transferChecked instruction
  // Layout: [12 u8][amount u64 LE][decimals u8] = 10 bytes
  function transferIx(
    fromATA: InstanceType<typeof PublicKey>,
    toATA: InstanceType<typeof PublicKey>,
    amount: number,
  ) {
    const rawAmt = BigInt(amount) * BigInt(Math.pow(10, decimals));
    const data = new Uint8Array(10);
    data[0] = 12;
    new DataView(data.buffer).setBigUint64(1, rawAmt, true);
    data[9] = decimals;
    return new TransactionInstruction({
      programId: tokenProgId,
      keys: [
        { pubkey: fromATA,            isSigner: false, isWritable: true  },
        { pubkey: mintPubkey,         isSigner: false, isWritable: false },
        { pubkey: toATA,              isSigner: false, isWritable: true  },
        { pubkey: treasury.publicKey, isSigner: true,  isWritable: false },
      ],
      data,
    });
  }

  if (!ataAExists) tx.add(createAtaIx(pubkeyA, ataA));
  if (!ataBExists) tx.add(createAtaIx(pubkeyB, ataB));
  tx.add(transferIx(treasuryATA, ataA, amountA));
  tx.add(transferIx(treasuryATA, ataB, amountB));

  // Sign and send
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

  console.log(`[referral-payout] tx sent: ${sig}`);
  await pollConfirmation(sig);
  console.log(`[referral-payout] confirmed: ${sig}`);

  return sig;
}
