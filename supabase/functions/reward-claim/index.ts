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

// Token-2022 (Token Extensions) program — DWORLD uses this, not classic SPL
const TOKEN_2022_PROGRAM_ID_STR = "TokenzQdBNbEquxqMsNaHqQiPFULmGE3kfFU53DnFmwR";
const ASSOC_TOKEN_PROGRAM_ID_STR = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1bv8";
const SYSTEM_PROGRAM_ID_STR = "11111111111111111111111111111111";
const MIN_SOL_BALANCE = 0.002;
const CLAIM_DISPLAY_AMOUNT = 10_000; // display units

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
  throw new Error("Transaction confirmation failed: not confirmed within 60s");
}

interface SendResult {
  signature: string;
  debug: Record<string, unknown>;
}

async function sendRewardTokens(toWallet: string, mintAddress: string): Promise<SendResult> {
  if (!SOLANA_RPC_URL) throw new Error("SOLANA_RPC_URL is not configured");
  if (!TREASURY_PRIVATE_KEY_B58) throw new Error("TREASURY_PRIVATE_KEY_BASE58 is not configured");

  // ── 1. Load treasury keypair ──────────────────────────────────────────────
  const secretKey = loadTreasuryKeypairBytes();

  const { Keypair, PublicKey, Transaction, TransactionInstruction } =
    await import("npm:@solana/web3.js@1.98.4");

  const {
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    getAssociatedTokenAddressSync,
    createAssociatedTokenAccountInstruction,
    createTransferCheckedInstruction,
  } = await import("npm:@solana/spl-token@0.4.6");

  const treasury = Keypair.fromSecretKey(secretKey);
  const treasuryPubStr = treasury.publicKey.toBase58();
  console.log(`[reward-claim] treasury wallet: ${treasuryPubStr}`);

  if (TREASURY_PUBLIC_KEY && treasuryPubStr !== TREASURY_PUBLIC_KEY) {
    throw new Error(
      `Treasury keypair mismatch: derived ${treasuryPubStr}, expected ${TREASURY_PUBLIC_KEY}`,
    );
  }

  const mintPubkey = new PublicKey(mintAddress);
  const toPubkey = new PublicKey(toWallet);

  // ── 2. Fetch mint info — detect token program and decimals ────────────────
  const mintAccResult = await solanaRpc("getAccountInfo", [
    mintAddress,
    { encoding: "jsonParsed", commitment: "confirmed" },
  ]) as any;

  if (!mintAccResult?.value) {
    throw new Error(`Invalid DWC_MINT: mint account not found on-chain for ${mintAddress}`);
  }

  const tokenProgramDetected: string = mintAccResult.value.owner;

  if (tokenProgramDetected !== TOKEN_2022_PROGRAM_ID_STR) {
    throw new Error(
      `Token program mismatch: mint owner is ${tokenProgramDetected}, ` +
      `expected Token-2022 (${TOKEN_2022_PROGRAM_ID_STR}). ` +
      `Do not use classic SPL TOKEN_PROGRAM_ID for DWORLD.`,
    );
  }

  const mintDecimals: number = mintAccResult.value.data?.parsed?.info?.decimals;
  if (typeof mintDecimals !== "number") {
    throw new Error(`Could not read decimals from on-chain mint info for ${mintAddress}`);
  }

  console.log(`[reward-claim] mint: ${mintAddress}, program: ${tokenProgramDetected}, decimals: ${mintDecimals}`);

  // ── 3. Derive Token-2022 ATAs ─────────────────────────────────────────────
  // ATA seed: [owner, TOKEN_2022_PROGRAM_ID, mint]  →  AssociatedTokenProgram
  const treasuryDworldAta = getAssociatedTokenAddressSync(
    mintPubkey,
    treasury.publicKey,
    false,             // allowOwnerOffCurve
    TOKEN_2022_PROGRAM_ID,
  );

  const userDworldAta = getAssociatedTokenAddressSync(
    mintPubkey,
    toPubkey,
    false,
    TOKEN_2022_PROGRAM_ID,
  );

  console.log(`[reward-claim] treasury T22 ATA: ${treasuryDworldAta.toBase58()}`);
  console.log(`[reward-claim] user T22 ATA: ${userDworldAta.toBase58()}`);

  // ── 4. Check treasury Token-2022 DWORLD balance ───────────────────────────
  let treasuryDworldBalance = 0;
  try {
    const balResult = await solanaRpc("getTokenAccountBalance", [
      treasuryDworldAta.toBase58(),
    ]) as any;
    const ui = balResult?.value?.uiAmount;
    if (ui != null) {
      treasuryDworldBalance = Number(ui);
    } else {
      const raw = Number(balResult?.value?.amount ?? "0");
      treasuryDworldBalance = raw / Math.pow(10, mintDecimals);
    }
  } catch (e: any) {
    throw new Error(
      `Treasury Token-2022 ATA not found: ${treasuryDworldAta.toBase58()}. ` +
      `Ensure the treasury wallet holds DWORLD tokens in a Token-2022 account. ` +
      `(${e?.message || e})`,
    );
  }

  if (treasuryDworldBalance < CLAIM_DISPLAY_AMOUNT) {
    throw new Error(
      `Treasury has insufficient DWORLD: has ${treasuryDworldBalance}, needs ${CLAIM_DISPLAY_AMOUNT}`,
    );
  }

  // ── 5. Check if user Token-2022 ATA exists ────────────────────────────────
  const userAtaInfo = await solanaRpc("getAccountInfo", [
    userDworldAta.toBase58(),
    { encoding: "base64", commitment: "confirmed" },
  ]) as any;
  const userDworldAtaExists = !!userAtaInfo?.value;

  // ── 6. Compute raw amount from on-chain decimals ──────────────────────────
  // display = 10,000 DWORLD,  decimals = 6  →  raw = 10,000,000,000
  const rawAmount = BigInt(CLAIM_DISPLAY_AMOUNT) * BigInt(Math.pow(10, mintDecimals));

  const debug: Record<string, unknown> = {
    dwcMint: mintAddress,
    tokenProgramDetected,
    mintDecimals,
    treasuryPublicKey: treasuryPubStr,
    treasuryDworldAta: treasuryDworldAta.toBase58(),
    treasuryDworldBalance,
    userDworldAta: userDworldAta.toBase58(),
    userDworldAtaExists,
    rawAmount: rawAmount.toString(),
  };

  console.log("[reward-claim] debug:", JSON.stringify(debug));

  // Check treasury SOL balance for fees
  const solBalResult = await solanaRpc("getBalance", [
    treasuryPubStr,
    { commitment: "confirmed" },
  ]) as any;
  const solBalance = Number(solBalResult ?? 0) / 1e9;
  console.log(`[reward-claim] treasury SOL balance: ${solBalance}`);
  if (solBalance < MIN_SOL_BALANCE) {
    throw new Error(
      `INSUFFICIENT_SOL: treasury has ${solBalance.toFixed(6)} SOL, need at least ${MIN_SOL_BALANCE} SOL for fees`,
    );
  }

  // ── 7. Build Token-2022 transaction ──────────────────────────────────────
  const tx = new Transaction();

  // Create user Token-2022 ATA if it doesn't exist yet
  if (!userDworldAtaExists) {
    console.log("[reward-claim] user ATA missing — adding createAssociatedTokenAccount instruction");
    tx.add(
      createAssociatedTokenAccountInstruction(
        treasury.publicKey,  // payer
        userDworldAta,       // associated token account
        toPubkey,            // owner
        mintPubkey,          // mint
        TOKEN_2022_PROGRAM_ID, // token program (Token-2022)
        ASSOCIATED_TOKEN_PROGRAM_ID,
      ),
    );
  }

  // transferChecked using Token-2022 program
  tx.add(
    createTransferCheckedInstruction(
      treasuryDworldAta,   // source (treasury's Token-2022 ATA)
      mintPubkey,          // mint
      userDworldAta,       // destination (user's Token-2022 ATA)
      treasury.publicKey,  // authority (treasury)
      rawAmount,           // amount in raw units (10,000 * 10^6)
      mintDecimals,        // decimals from on-chain mint info
      [],                  // multisigners (none)
      TOKEN_2022_PROGRAM_ID, // token program (Token-2022)
    ),
  );

  // ── 8. Sign and send ──────────────────────────────────────────────────────
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

  if (!sig || typeof sig !== "string") {
    throw new Error("Token-2022 transfer failed: invalid signature returned from RPC");
  }

  console.log(`[reward-claim] tx sent: ${sig}, waiting for confirmation...`);
  await pollConfirmation(sig);
  console.log(`[reward-claim] confirmed: ${sig}`);

  return { signature: sig, debug };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { reward_id, wallet_address } = await req.json() as {
      reward_id: string;
      wallet_address: string;
    };

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
    if (!DWC_MINT_ENV) {
      return new Response(
        JSON.stringify({ success: false, error: "Server configuration error: DWC_MINT not set" }),
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
        JSON.stringify({
          success: false,
          error: "User already claimed",
          signature: rewardAny.transaction_signature,
        }),
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

    // Use DWC_MINT env as source of truth — never derive from symbol
    const mintAddress = DWC_MINT_ENV;

    // Early member reward: enforce 100-user cap
    if (rewardAny.reason === "early_user_first_100") {
      const { count: sentCount } = await db
        .from("user_rewards")
        .select("id", { count: "exact", head: true })
        .eq("reason", "early_user_first_100")
        .eq("status", "sent");

      const totalClaimsUsed = sentCount ?? 0;
      if (totalClaimsUsed >= 100) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Early member claim limit reached (100/100 users)",
            debug: { totalClaimsUsed, eligibilityStatus: "limit_reached" },
          }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      console.log(`[reward-claim] early member slot available: ${totalClaimsUsed + 1}/100`);
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

    let sendResult: { signature: string; debug: Record<string, unknown> };
    try {
      sendResult = await sendRewardTokens(wallet_address, mintAddress);
    } catch (sendErr: any) {
      const msg = String(sendErr?.message || sendErr);
      console.error("[reward-claim] Token-2022 send failed:", msg);

      // Roll back lock so user can retry
      await db
        .from("user_rewards")
        .update({ status: "ready", updated_at: new Date().toISOString() })
        .eq("id", reward_id);

      if (msg.includes("INSUFFICIENT_SOL")) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Treasury is low on SOL for transaction fees. Please try again later.",
          }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (msg.includes("insufficient DWORLD")) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Reward pool temporarily unavailable. Please try again later.",
          }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (msg.includes("Token program mismatch")) {
        return new Response(
          JSON.stringify({ success: false, error: `Token program mismatch: ${msg}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (msg.includes("Treasury Token-2022 ATA not found")) {
        return new Response(
          JSON.stringify({ success: false, error: msg }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (msg.includes("Token-2022 transfer failed") || msg.includes("Transaction simulation failed")) {
        return new Response(
          JSON.stringify({ success: false, error: `Token-2022 transfer failed: ${msg}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (msg.includes("Transaction confirmation failed")) {
        return new Response(
          JSON.stringify({ success: false, error: `Transaction confirmation failed: ${msg}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (
        msg.includes("mismatch") ||
        msg.includes("not configured") ||
        msg.includes("not set") ||
        msg.includes("Invalid TREASURY") ||
        msg.includes("Invalid DWC_MINT")
      ) {
        return new Response(
          JSON.stringify({ success: false, error: `Server configuration error: ${msg}` }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      throw sendErr;
    }

    // ── Only mark as claimed after on-chain confirmation ───────────────────
    const now = new Date().toISOString();
    await db.from("user_rewards").update({
      status: "sent",
      transaction_signature: sendResult.signature,
      claimed_at: now,
      sent_at: now,
      updated_at: now,
    }).eq("id", reward_id);

    return new Response(
      JSON.stringify({
        success: true,
        signature: sendResult.signature,
        debug: {
          ...sendResult.debug,
          totalClaimsUsed: undefined, // set per-reward-reason below if needed
          eligibilityStatus: "claimed",
        },
      }),
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
