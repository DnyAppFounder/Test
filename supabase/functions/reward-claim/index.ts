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
// Trim whitespace and surrounding quotes that may be present in the env value
const TREASURY_PUBLIC_KEY = (Deno.env.get("TREASURY_PUBLIC_KEY") ?? "")
  .trim()
  .replace(/^["']|["']$/g, ""); // strip surrounding " or ' if any
const DWC_MINT_ENV = (Deno.env.get("DWC_MINT") ?? "").trim().replace(/^["']|["']$/g, "");

// Increment this string each deploy so the client can verify freshness
const DEPLOYED_AT = "2026-05-18T14:00:00Z";

// Token-2022 (Token Extensions) program — DWORLD is a Token-2022 token
const TOKEN_2022_PROGRAM_ID_STR = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const ASSOC_TOKEN_PROGRAM_ID_STR = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
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

// Error subclass that carries safe debug info back to the HTTP handler
class ClaimError extends Error {
  debug: Record<string, unknown>;
  constructor(message: string, debug: Record<string, unknown> = {}) {
    super(message);
    this.debug = debug;
  }
}

interface SendResult {
  signature: string;
  debug: Record<string, unknown>;
}

async function sendRewardTokens(toWallet: string, mintAddress: string): Promise<SendResult> {
  if (!SOLANA_RPC_URL) throw new ClaimError("SOLANA_RPC_URL is not configured");
  if (!TREASURY_PRIVATE_KEY_B58) throw new ClaimError("TREASURY_PRIVATE_KEY_BASE58 is not configured");

  // ── Only @solana/web3.js — no spl-token dependency ────────────────────────
  const { Keypair, PublicKey, Transaction, TransactionInstruction } =
    await import("npm:@solana/web3.js@1.98.4");

  // ── Safe config diagnostics (no private key, no full public key) ──────────
  const configDebug: Record<string, unknown> = {
    deployedAt: DEPLOYED_AT,
    hasTreasuryPublicKey: TREASURY_PUBLIC_KEY.length > 0,
    treasuryPublicKeyLength: TREASURY_PUBLIC_KEY.length,
    treasuryPublicKeyFirst4: TREASURY_PUBLIC_KEY.slice(0, 4) || "(empty)",
    treasuryPublicKeyLast4: TREASURY_PUBLIC_KEY.length >= 4
      ? TREASURY_PUBLIC_KEY.slice(-4)
      : "(too short)",
    treasuryPublicKeyParseOk: false,
    decodedPrivateKeyPublicKeyFirst4: "(not loaded)",
    decodedPrivateKeyPublicKeyLast4: "(not loaded)",
    keyMatches: false,
  };

  // ── 1. Load treasury keypair — derive public key first ────────────────────
  let treasury: InstanceType<typeof Keypair>;
  try {
    const secretKey = loadTreasuryKeypairBytes();
    treasury = Keypair.fromSecretKey(secretKey);
  } catch (e: any) {
    throw new ClaimError(e.message, configDebug);
  }

  const derivedPubStr = treasury.publicKey.toBase58();
  configDebug.decodedPrivateKeyPublicKeyFirst4 = derivedPubStr.slice(0, 4);
  configDebug.decodedPrivateKeyPublicKeyLast4 = derivedPubStr.slice(-4);

  // ── 2. Validate TREASURY_PUBLIC_KEY is present and parseable ─────────────
  if (!TREASURY_PUBLIC_KEY) {
    throw new ClaimError(
      "Invalid TREASURY_PUBLIC_KEY. It must be the full treasury wallet address, " +
      "not the private key and not a shortened address.",
      configDebug,
    );
  }

  try {
    new PublicKey(TREASURY_PUBLIC_KEY);
    configDebug.treasuryPublicKeyParseOk = true;
  } catch {
    throw new ClaimError(
      "Invalid TREASURY_PUBLIC_KEY. It must be the full treasury wallet address, " +
      "not the private key and not a shortened address.",
      configDebug,
    );
  }

  // ── 3. Verify keypair match ───────────────────────────────────────────────
  const keyMatches = derivedPubStr === TREASURY_PUBLIC_KEY;
  configDebug.keyMatches = keyMatches;

  if (!keyMatches) {
    throw new ClaimError(
      "Treasury private key does not match treasury public key.",
      configDebug,
    );
  }

  console.log(
    `[reward-claim] treasury verified: ${derivedPubStr.slice(0, 4)}...${derivedPubStr.slice(-4)}`,
  );

  // ── 4. Validate and parse all transfer-related public keys individually ───
  // Each field is validated before use so the error response identifies exactly
  // which value is wrong — never exposes private key.
  const safeMint   = (mintAddress  ?? "").trim().replace(/^["']|["']$/g, "");
  const safeWallet = (toWallet     ?? "").trim().replace(/^["']|["']$/g, "");

  function keyDebug(field: string, raw: string): Record<string, unknown> {
    const exists = raw.length > 0;
    let parseOk = false;
    try { if (exists) { new PublicKey(raw); parseOk = true; } } catch {}
    return {
      [`${field}Exists`]:  exists,
      [`${field}Length`]:  raw.length,
      [`${field}First4`]:  raw.slice(0, 4) || "(empty)",
      [`${field}Last4`]:   raw.length >= 4 ? raw.slice(-4) : "(short)",
      [`${field}ParseOk`]: parseOk,
    };
  }

  const transferDebug: Record<string, unknown> = {
    deployedAt: DEPLOYED_AT,
    treasuryVerified: true,
    tokenProgram: TOKEN_2022_PROGRAM_ID_STR,
    ...keyDebug("userWallet", safeWallet),
    ...keyDebug("dwcMint",    safeMint),
  };

  // Validate user wallet
  if (!safeWallet) {
    throw new ClaimError("Invalid user wallet address for claim.", {
      ...transferDebug, userWalletError: "empty or missing",
    });
  }
  let toPubkey: InstanceType<typeof PublicKey>;
  try {
    toPubkey = new PublicKey(safeWallet);
  } catch {
    throw new ClaimError("Invalid user wallet address for claim.", {
      ...transferDebug, userWalletError: "failed to parse as Solana public key",
    });
  }

  // Validate DWC_MINT
  if (!safeMint) {
    throw new ClaimError("Invalid DWC_MINT.", {
      ...transferDebug, dwcMintError: "empty or missing",
    });
  }
  let mintPubkey: InstanceType<typeof PublicKey>;
  try {
    mintPubkey = new PublicKey(safeMint);
  } catch {
    throw new ClaimError("Invalid DWC_MINT.", {
      ...transferDebug, dwcMintError: "failed to parse as Solana public key",
    });
  }

  let token2022ProgramId: InstanceType<typeof PublicKey>;
  let assocTokenProgramId: InstanceType<typeof PublicKey>;
  let systemProgramId: InstanceType<typeof PublicKey>;
  try {
    token2022ProgramId  = new PublicKey(TOKEN_2022_PROGRAM_ID_STR);
    assocTokenProgramId = new PublicKey(ASSOC_TOKEN_PROGRAM_ID_STR);
    systemProgramId     = new PublicKey(SYSTEM_PROGRAM_ID_STR);
  } catch (e: any) {
    throw new ClaimError(`Program ID parse failed: ${e?.message}`, {
      ...transferDebug,
      programIdError: e?.message,
      token2022ProgramIdStr: TOKEN_2022_PROGRAM_ID_STR,
      assocTokenProgramIdStr: ASSOC_TOKEN_PROGRAM_ID_STR,
    });
  }

  console.log(
    `[reward-claim] deployedAt: ${DEPLOYED_AT}` +
    ` | userWallet: ${safeWallet.slice(0, 4)}...${safeWallet.slice(-4)}` +
    ` | mint: ${safeMint.slice(0, 4)}...${safeMint.slice(-4)}`,
  );

  // ── 5. Fetch mint info — detect token program and decimals ────────────────
  const mintAccResult = await solanaRpc("getAccountInfo", [
    safeMint,
    { encoding: "jsonParsed", commitment: "confirmed" },
  ]) as any;

  if (!mintAccResult?.value) {
    throw new ClaimError(
      `Invalid DWC_MINT: mint account not found on-chain for ${safeMint}`,
      transferDebug,
    );
  }

  const tokenProgramDetected: string = mintAccResult.value.owner;

  if (tokenProgramDetected !== TOKEN_2022_PROGRAM_ID_STR) {
    throw new ClaimError(
      `Token program mismatch: mint owner is ${tokenProgramDetected}, ` +
      `expected Token-2022 (${TOKEN_2022_PROGRAM_ID_STR}). ` +
      `Do not use classic SPL TOKEN_PROGRAM_ID for DWORLD.`,
      transferDebug,
    );
  }

  const mintDecimals: number = mintAccResult.value.data?.parsed?.info?.decimals;
  if (typeof mintDecimals !== "number") {
    throw new ClaimError(
      `Could not read decimals from on-chain mint info for ${safeMint}`,
      transferDebug,
    );
  }

  console.log(
    `[reward-claim] mint ${safeMint} | program: Token-2022 | decimals: ${mintDecimals}`,
  );

  // ── 6. Derive Token-2022 ATAs ─────────────────────────────────────────────
  // ATA seeds: [owner, TOKEN_2022_PROGRAM_ID, mint]  →  AssociatedTokenProgram
  function deriveATA(owner: InstanceType<typeof PublicKey>): InstanceType<typeof PublicKey> {
    const [ata] = PublicKey.findProgramAddressSync(
      [owner.toBuffer(), token2022ProgramId.toBuffer(), mintPubkey.toBuffer()],
      assocTokenProgramId,
    );
    return ata;
  }

  let treasuryATA: InstanceType<typeof PublicKey>;
  let userATA: InstanceType<typeof PublicKey>;
  try {
    treasuryATA = deriveATA(treasury.publicKey);
    userATA     = deriveATA(toPubkey);
  } catch (e: any) {
    throw new ClaimError("Token-2022 ATA derivation failed.", {
      ...transferDebug,
      ataError: e?.message ?? String(e),
    });
  }

  transferDebug.treasuryAta = treasuryATA.toBase58();
  transferDebug.userAta     = userATA.toBase58();

  console.log(`[reward-claim] treasury T22 ATA: ${treasuryATA.toBase58()}`);
  console.log(`[reward-claim] user T22 ATA: ${userATA.toBase58()}`);

  // ── 6. Check treasury Token-2022 DWORLD balance ───────────────────────────
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
    throw new ClaimError(
      `Treasury Token-2022 ATA not found: ${treasuryATA.toBase58()}. ` +
      `Ensure treasury wallet holds DWORLD in a Token-2022 account. (${e?.message || e})`,
    );
  }

  if (treasuryDworldBalance < CLAIM_DISPLAY_AMOUNT) {
    throw new ClaimError(
      `Treasury has insufficient DWORLD: has ${treasuryDworldBalance}, needs ${CLAIM_DISPLAY_AMOUNT}`,
    );
  }

  // ── 7. Check if user Token-2022 ATA exists ────────────────────────────────
  const userAtaInfo = await solanaRpc("getAccountInfo", [
    userATA.toBase58(),
    { encoding: "base64", commitment: "confirmed" },
  ]) as any;
  const userATAExists = !!userAtaInfo?.value;

  // ── 8. Raw amount from on-chain decimals ──────────────────────────────────
  // 10,000 DWORLD × 10^6 = 10,000,000,000 raw units
  const rawAmount = BigInt(CLAIM_DISPLAY_AMOUNT) * BigInt(Math.pow(10, mintDecimals));

  const txDebug: Record<string, unknown> = {
    ...configDebug,
    ...transferDebug,
    dwcMint: safeMint,
    tokenProgramDetected,
    mintDecimals,
    treasuryDworldAta: treasuryATA.toBase58(),
    treasuryDworldBalance,
    userDworldAta: userATA.toBase58(),
    userDworldAtaExists: userATAExists,
    rawAmount: rawAmount.toString(),
  };

  console.log("[reward-claim] txDebug:", JSON.stringify(txDebug));

  // Check treasury SOL for fees
  const solBalResult = await solanaRpc("getBalance", [
    derivedPubStr,
    { commitment: "confirmed" },
  ]) as any;
  const solBalance = Number(solBalResult ?? 0) / 1e9;
  if (solBalance < MIN_SOL_BALANCE) {
    throw new ClaimError(
      `INSUFFICIENT_SOL: treasury has ${solBalance.toFixed(6)} SOL, ` +
      `need at least ${MIN_SOL_BALANCE} SOL for fees`,
    );
  }

  // ── 9. Build transaction with manual Token-2022 instructions ──────────────
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
      // 0x01 = CreateIdempotent
      data: Buffer.from([1]),
    }));
  }

  // Token-2022 transferChecked (discriminator = 12)
  // Layout: [12 u8][amount u64 LE][decimals u8] = 10 bytes
  // keys: [source, mint, destination, authority]
  const transferData = new Uint8Array(10);
  transferData[0] = 12;
  new DataView(transferData.buffer).setBigUint64(1, rawAmount, true);
  transferData[9] = mintDecimals;

  tx.add(new TransactionInstruction({
    programId: token2022ProgramId,
    keys: [
      { pubkey: treasuryATA,        isSigner: false, isWritable: true  }, // source
      { pubkey: mintPubkey,         isSigner: false, isWritable: false }, // mint
      { pubkey: userATA,            isSigner: false, isWritable: true  }, // destination
      { pubkey: treasury.publicKey, isSigner: true,  isWritable: false }, // authority
    ],
    data: transferData,
  }));

  // ── 10. Sign and send ─────────────────────────────────────────────────────
  const bhResult = await solanaRpc("getLatestBlockhash", [
    { commitment: "confirmed" },
  ]) as any;
  const blockhash = bhResult?.value?.blockhash ?? bhResult?.blockhash;
  if (!blockhash) throw new ClaimError("Could not fetch blockhash from RPC");

  tx.recentBlockhash = blockhash;
  tx.feePayer = treasury.publicKey;
  tx.sign(treasury);

  const rawBase64 = btoa(String.fromCharCode(...tx.serialize()));
  const sig = await solanaRpc("sendTransaction", [
    rawBase64,
    { encoding: "base64", skipPreflight: false, preflightCommitment: "confirmed" },
  ]) as string;

  if (!sig || typeof sig !== "string") {
    throw new ClaimError("Token-2022 transfer failed: invalid signature returned from RPC");
  }

  console.log(`[reward-claim] tx sent: ${sig}`);
  await pollConfirmation(sig);
  console.log(`[reward-claim] confirmed: ${sig}`);

  return { signature: sig, debug: txDebug };
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
            debug: { totalClaimsUsed, eligibilityStatus: "limit_reached", deployedAt: DEPLOYED_AT },
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
      // ClaimError carries safe debug info — always include in response
      const errDebug: Record<string, unknown> = sendErr?.debug ?? { deployedAt: DEPLOYED_AT };
      console.error("[reward-claim] transfer failed:", msg, errDebug);

      // Roll back lock so user can retry
      await db
        .from("user_rewards")
        .update({ status: "ready", updated_at: new Date().toISOString() })
        .eq("id", reward_id);

      // Map well-known error categories to appropriate HTTP status + message
      if (msg.includes("INSUFFICIENT_SOL")) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Treasury is low on SOL for transaction fees. Please try again later.",
            debug: errDebug,
          }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (msg.includes("insufficient DWORLD")) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Reward pool temporarily unavailable. Please try again later.",
            debug: errDebug,
          }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      // Config / key errors — return full error + debug so the admin can diagnose
      if (
        msg.includes("Invalid TREASURY_PUBLIC_KEY") ||
        msg.includes("Treasury private key does not match") ||
        msg.includes("Treasury keypair mismatch") ||
        msg.includes("Token program mismatch") ||
        msg.includes("not configured") ||
        msg.includes("not set") ||
        msg.includes("Invalid TREASURY") ||
        msg.includes("Invalid DWC_MINT") ||
        msg.includes("Treasury Token-2022 ATA not found")
      ) {
        return new Response(
          JSON.stringify({ success: false, error: msg, debug: errDebug }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (
        msg.includes("Transaction simulation failed") ||
        msg.includes("Token-2022 transfer failed") ||
        msg.includes("confirmation failed") ||
        msg.includes("Transaction failed on-chain")
      ) {
        return new Response(
          JSON.stringify({ success: false, error: msg, debug: errDebug }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Unknown — still include debug
      return new Response(
        JSON.stringify({ success: false, error: msg, debug: errDebug }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
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
      JSON.stringify({
        success: false,
        error: err?.message || "Internal server error",
        debug: { deployedAt: DEPLOYED_AT },
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
