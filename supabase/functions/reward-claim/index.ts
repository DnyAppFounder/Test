import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import bs58 from "npm:bs58@5";

// NOTE: @solana/spl-token is intentionally NOT imported.
// Version 0.4.x pulls in @solana/spl-token-group which imports mapEncoder from
// @solana/codecs — a missing export that crashes the edge runtime.
// All Token-2022 instructions are built manually below using only @solana/web3.js.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SOLANA_RPC_URL = Deno.env.get("SOLANA_RPC_URL") || "";
const TREASURY_PRIVATE_KEY_B58 = Deno.env.get("TREASURY_PRIVATE_KEY_BASE58") || "";
const TREASURY_PUBLIC_KEY = Deno.env.get("TREASURY_PUBLIC_KEY")?.trim() || "";
const DWC_MINT_ENV = Deno.env.get("DWC_MINT") || "";

// Token-2022 (Token Extensions) program — DWORLD is a Token-2022 token
const TOKEN_2022_PROGRAM_ID_STR = "TokenzQdBNbEquxqMsNaHqQiPFULmGE3kfFU53DnFmwR";
const ASSOC_TOKEN_PROGRAM_ID_STR = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1bv8";
const SYSTEM_PROGRAM_ID_STR = "11111111111111111111111111111111";
const MIN_SOL_BALANCE = 0.002;
const CLAIM_DISPLAY_AMOUNT = 10_000; // display units of DWORLD

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
    throw new Error(
      `Invalid TREASURY_PRIVATE_KEY_BASE58: decoded to ${decoded.length} bytes, expected 64`,
    );
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
    const result = await solanaRpc("getSignatureStatuses", [
      [sig],
      { searchTransactionHistory: true },
    ]) as any;
    const status = result?.value?.[0];
    if (status) {
      if (status.err) {
        throw new Error(`Transaction failed on-chain: ${JSON.stringify(status.err)}`);
      }
      if (
        status.confirmationStatus === "confirmed" ||
        status.confirmationStatus === "finalized"
      ) return;
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

  // ── Only @solana/web3.js — no spl-token dependency ────────────────────────
  const { Keypair, PublicKey, Transaction, TransactionInstruction } =
    await import("npm:@solana/web3.js@1.98.4");

  // ── 1. Load and verify treasury keypair ──────────────────────────────────
  const secretKey = loadTreasuryKeypairBytes();
  const treasury = Keypair.fromSecretKey(secretKey);
  const treasuryPubStr = treasury.publicKey.toBase58();
  console.log(`[reward-claim] treasury: ${treasuryPubStr}`);

  // Validate TREASURY_PUBLIC_KEY is present and is a parseable Solana address
  if (!TREASURY_PUBLIC_KEY) {
    throw new Error("Invalid TREASURY_PUBLIC_KEY. It must be the treasury wallet address.");
  }
  try {
    new PublicKey(TREASURY_PUBLIC_KEY);
  } catch {
    throw new Error("Invalid TREASURY_PUBLIC_KEY. It must be the treasury wallet address.");
  }

  // Verify the private key's derived public key matches TREASURY_PUBLIC_KEY
  if (treasuryPubStr !== TREASURY_PUBLIC_KEY) {
    throw new Error("Treasury private key does not match treasury public key");
  }

  const mintPubkey = new PublicKey(mintAddress);
  const toPubkey = new PublicKey(toWallet);
  const token2022ProgramId = new PublicKey(TOKEN_2022_PROGRAM_ID_STR);
  const assocTokenProgramId = new PublicKey(ASSOC_TOKEN_PROGRAM_ID_STR);
  const systemProgramId = new PublicKey(SYSTEM_PROGRAM_ID_STR);

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

  console.log(`[reward-claim] mint ${mintAddress} | program: Token-2022 | decimals: ${mintDecimals}`);

  // ── 3. Derive Token-2022 ATAs ─────────────────────────────────────────────
  // ATA seeds: [owner, TOKEN_2022_PROGRAM_ID, mint]  →  AssociatedTokenProgram
  function deriveATA(owner: typeof PublicKey.prototype): typeof PublicKey.prototype {
    const [ata] = PublicKey.findProgramAddressSync(
      [owner.toBuffer(), token2022ProgramId.toBuffer(), mintPubkey.toBuffer()],
      assocTokenProgramId,
    );
    return ata;
  }

  const treasuryATA = deriveATA(treasury.publicKey);
  const userATA = deriveATA(toPubkey);

  console.log(`[reward-claim] treasury T22 ATA: ${treasuryATA.toBase58()}`);
  console.log(`[reward-claim] user T22 ATA: ${userATA.toBase58()}`);

  // ── 4. Check treasury Token-2022 DWORLD balance ───────────────────────────
  // Use getTokenAccountBalance — works for both classic and Token-2022 ATAs
  let treasuryDworldBalance = 0;
  try {
    const balResult = await solanaRpc("getTokenAccountBalance", [
      treasuryATA.toBase58(),
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
      `Treasury Token-2022 ATA not found: ${treasuryATA.toBase58()}. ` +
      `Ensure treasury wallet holds DWORLD in a Token-2022 account. (${e?.message || e})`,
    );
  }

  if (treasuryDworldBalance < CLAIM_DISPLAY_AMOUNT) {
    throw new Error(
      `Treasury has insufficient DWORLD: has ${treasuryDworldBalance}, needs ${CLAIM_DISPLAY_AMOUNT}`,
    );
  }

  // ── 5. Check if user Token-2022 ATA exists ────────────────────────────────
  const userAtaInfo = await solanaRpc("getAccountInfo", [
    userATA.toBase58(),
    { encoding: "base64", commitment: "confirmed" },
  ]) as any;
  const userATAExists = !!userAtaInfo?.value;

  // ── 6. Raw amount from on-chain decimals ──────────────────────────────────
  // 10,000 DWORLD × 10^6 = 10,000,000,000 raw units
  const rawAmount = BigInt(CLAIM_DISPLAY_AMOUNT) * BigInt(Math.pow(10, mintDecimals));

  const debug: Record<string, unknown> = {
    dwcMint: mintAddress,
    tokenProgramDetected,
    mintDecimals,
    treasuryPublicKey: treasuryPubStr,
    treasuryDworldAta: treasuryATA.toBase58(),
    treasuryDworldBalance,
    userDworldAta: userATA.toBase58(),
    userDworldAtaExists: userATAExists,
    rawAmount: rawAmount.toString(),
  };

  console.log("[reward-claim] debug:", JSON.stringify(debug));

  // Check treasury SOL for fees
  const solBalResult = await solanaRpc("getBalance", [
    treasuryPubStr,
    { commitment: "confirmed" },
  ]) as any;
  const solBalance = Number(solBalResult ?? 0) / 1e9;
  if (solBalance < MIN_SOL_BALANCE) {
    throw new Error(
      `INSUFFICIENT_SOL: treasury has ${solBalance.toFixed(6)} SOL, ` +
      `need at least ${MIN_SOL_BALANCE} SOL for fees`,
    );
  }

  // ── 7. Build transaction with manual Token-2022 instructions ──────────────
  const tx = new Transaction();

  // Create user Token-2022 ATA if missing
  // Associated Token Account Program: CreateIdempotent (discriminator = 1)
  // keys: [payer, ata, owner, mint, systemProgram, tokenProgram]
  if (!userATAExists) {
    console.log("[reward-claim] user ATA missing — adding createATA instruction");
    tx.add(new TransactionInstruction({
      programId: assocTokenProgramId,
      keys: [
        { pubkey: treasury.publicKey, isSigner: true,  isWritable: true  }, // payer
        { pubkey: userATA,            isSigner: false, isWritable: true  }, // ATA
        { pubkey: toPubkey,           isSigner: false, isWritable: false }, // owner
        { pubkey: mintPubkey,         isSigner: false, isWritable: false }, // mint
        { pubkey: systemProgramId,    isSigner: false, isWritable: false }, // system
        { pubkey: token2022ProgramId, isSigner: false, isWritable: false }, // Token-2022
      ],
      // 0x01 = CreateIdempotent (succeeds even if account already exists)
      data: Buffer.from([1]),
    }));
  }

  // Token-2022 transferChecked (instruction discriminator = 12)
  // Layout: [12 u8][amount u64 LE][decimals u8] = 10 bytes
  // keys: [source, mint, destination, authority]
  const transferData = new Uint8Array(10);
  transferData[0] = 12; // transferChecked
  new DataView(transferData.buffer).setBigUint64(1, rawAmount, true); // little-endian
  transferData[9] = mintDecimals;

  tx.add(new TransactionInstruction({
    programId: token2022ProgramId,
    keys: [
      { pubkey: treasuryATA,         isSigner: false, isWritable: true  }, // source
      { pubkey: mintPubkey,          isSigner: false, isWritable: false }, // mint
      { pubkey: userATA,             isSigner: false, isWritable: true  }, // destination
      { pubkey: treasury.publicKey,  isSigner: true,  isWritable: false }, // authority
    ],
    data: transferData,
  }));

  // ── 8. Sign and send ──────────────────────────────────────────────────────
  const bhResult = await solanaRpc("getLatestBlockhash", [
    { commitment: "confirmed" },
  ]) as any;
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

  console.log(`[reward-claim] tx sent: ${sig}`);
  await pollConfirmation(sig);
  console.log(`[reward-claim] confirmed: ${sig}`);

  return { signature: sig, debug };
}

// ── HTTP handler ──────────────────────────────────────────────────────────────

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

    const { data: reward, error: fetchErr } = await db
      .from("user_rewards")
      .select("*")
      .eq("id", reward_id)
      .eq("wallet_address", wallet_address)
      .maybeSingle();

    if (fetchErr) throw fetchErr;

    if (!reward) {
      return new Response(
        JSON.stringify({ success: false, error: "Reward not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (reward.status === "sent") {
      return new Response(
        JSON.stringify({
          success: false,
          error: "User already claimed",
          signature: reward.transaction_signature,
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (reward.status === "claiming") {
      return new Response(
        JSON.stringify({ success: false, error: "Reward claim already in progress, please wait" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (reward.status !== "ready") {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Reward cannot be claimed (status: ${reward.status})`,
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Mint address comes exclusively from env — never from reward record or symbol
    const mintAddress = DWC_MINT_ENV;

    // Early member reward: enforce 100-user cap
    let totalClaimsUsed = 0;
    if (reward.reason === "early_user_first_100") {
      const { count } = await db
        .from("user_rewards")
        .select("id", { count: "exact", head: true })
        .eq("reason", "early_user_first_100")
        .eq("status", "sent");
      totalClaimsUsed = count ?? 0;
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

    let sendResult: SendResult;
    try {
      sendResult = await sendRewardTokens(wallet_address, mintAddress);
    } catch (sendErr: any) {
      const msg = String(sendErr?.message || sendErr);
      console.error("[reward-claim] transfer failed:", msg);

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
          JSON.stringify({ success: false, error: `Configuration error: ${msg}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (msg.includes("Treasury Token-2022 ATA not found")) {
        return new Response(
          JSON.stringify({ success: false, error: msg }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (msg.includes("Transaction simulation failed")) {
        return new Response(
          JSON.stringify({ success: false, error: `Transaction simulation failed: ${msg}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (msg.includes("Token-2022 transfer failed") || msg.includes("confirmation failed")) {
        return new Response(
          JSON.stringify({ success: false, error: `Transfer failed: ${msg}` }),
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

    // Mark claimed only after on-chain confirmation
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
          totalClaimsUsed,
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
