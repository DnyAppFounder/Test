import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import bs58 from "npm:bs58@5";

// NOTE: @solana/spl-token is intentionally NOT imported.
// Version 0.4.x pulls in @solana/spl-token-group which imports mapEncoder from
// @solana/codecs — a missing export that crashes the edge runtime.
// All token instructions are built manually using only @solana/web3.js.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SOLANA_RPC_URL = Deno.env.get("SOLANA_RPC_URL") || "";
const TREASURY_PRIVATE_KEY_B58 = Deno.env.get("TREASURY_PRIVATE_KEY_BASE58") || "";
const TREASURY_PUBLIC_KEY = (Deno.env.get("TREASURY_PUBLIC_KEY") ?? "")
  .trim()
  .replace(/^["']|["']$/g, "");
const DWC_MINT_ENV = (Deno.env.get("DWC_MINT") ?? "").trim().replace(/^["']|["']$/g, "");

const DEPLOYED_AT = "2026-05-31T08:00:00Z";

const TOKEN_PROGRAM_ID_STR       = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM_ID_STR  = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const ASSOC_TOKEN_PROGRAM_ID_STR = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
const SYSTEM_PROGRAM_ID_STR      = "11111111111111111111111111111111";

// Treasury only needs SOL for tx fee — NOT for ATA rent (user pays their own ATA)
// 5000 lamports = typical fee; keep 0.0002 buffer so treasury doesn't drop below rent-exempt
const MIN_SOL_BALANCE = 0.0002;

// ── Error helpers ─────────────────────────────────────────────────────────────

class ClaimError extends Error {
  debug: Record<string, unknown>;
  code: string;
  constructor(message: string, code = "CLAIM_ERROR", debug: Record<string, unknown> = {}) {
    super(message);
    this.code  = code;
    this.debug = debug;
  }
}

interface SendResult {
  signature: string;
  debug: Record<string, unknown>;
}

// ── RPC helper ────────────────────────────────────────────────────────────────

function loadTreasuryKeypairBytes(): Uint8Array {
  const raw = TREASURY_PRIVATE_KEY_B58.trim();
  if (!raw) throw new ClaimError("TREASURY_PRIVATE_KEY_BASE58 is not set", "CONFIG_ERROR");
  let decoded: Uint8Array;
  try {
    decoded = bs58.decode(raw);
  } catch {
    throw new ClaimError("Invalid TREASURY_PRIVATE_KEY_BASE58: not valid base58", "CONFIG_ERROR");
  }
  if (decoded.length !== 64) {
    throw new ClaimError(
      `Invalid TREASURY_PRIVATE_KEY_BASE58: decoded to ${decoded.length} bytes, expected 64`,
      "CONFIG_ERROR",
    );
  }
  return decoded;
}

async function solanaRpc(method: string, params: unknown[]): Promise<unknown> {
  if (!SOLANA_RPC_URL) throw new ClaimError("SOLANA_RPC_URL not configured", "CONFIG_ERROR");
  const resp = await fetch(SOLANA_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await resp.json() as { result?: unknown; error?: { message: string } };
  if (json.error) throw new ClaimError(`RPC ${method}: ${json.error.message}`, "RPC_ERROR");
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
      if (status.err) throw new ClaimError(
        `Transaction failed on-chain: ${JSON.stringify(status.err)}`,
        "TX_FAILED_ONCHAIN",
      );
      if (
        status.confirmationStatus === "confirmed" ||
        status.confirmationStatus === "finalized"
      ) return;
    }
  }
  throw new ClaimError("Transaction confirmation failed: not confirmed within 60s", "TX_TIMEOUT");
}

// ── SHA-256 helper (Web Crypto available in Deno) ─────────────────────────────

async function sha256hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ── Core token-send function (treasury only sends tokens, never pays ATA rent) ─

async function sendRewardTokens(
  toWallet: string,
  mintAddress: string,
  rewardAmount: number,
): Promise<SendResult> {
  if (!SOLANA_RPC_URL) throw new ClaimError("SOLANA_RPC_URL is not configured", "CONFIG_ERROR");
  if (!TREASURY_PRIVATE_KEY_B58) throw new ClaimError("TREASURY_PRIVATE_KEY_BASE58 is not configured", "CONFIG_ERROR");

  const { Keypair, PublicKey, Transaction, TransactionInstruction } =
    await import("npm:@solana/web3.js@1.98.4");

  const configDebug: Record<string, unknown> = {
    deployedAt: DEPLOYED_AT,
    hasTreasuryPublicKey: TREASURY_PUBLIC_KEY.length > 0,
    treasuryPublicKeyFirst4: TREASURY_PUBLIC_KEY.slice(0, 4) || "(empty)",
    treasuryPublicKeyLast4: TREASURY_PUBLIC_KEY.length >= 4 ? TREASURY_PUBLIC_KEY.slice(-4) : "(too short)",
    treasuryPublicKeyParseOk: false,
    keyMatches: false,
  };

  // 1. Load treasury keypair
  let treasury: InstanceType<typeof Keypair>;
  try {
    const secretKey = loadTreasuryKeypairBytes();
    treasury = Keypair.fromSecretKey(secretKey);
  } catch (e: any) {
    throw new ClaimError(e.message, e.code ?? "CONFIG_ERROR", configDebug);
  }

  const derivedPubStr = treasury.publicKey.toBase58();
  configDebug.decodedPublicKeyFirst4 = derivedPubStr.slice(0, 4);
  configDebug.decodedPublicKeyLast4  = derivedPubStr.slice(-4);

  // 2. Validate TREASURY_PUBLIC_KEY
  if (!TREASURY_PUBLIC_KEY) {
    throw new ClaimError("Invalid TREASURY_PUBLIC_KEY — must be the full wallet address", "CONFIG_ERROR", configDebug);
  }
  try {
    new PublicKey(TREASURY_PUBLIC_KEY);
    configDebug.treasuryPublicKeyParseOk = true;
  } catch {
    throw new ClaimError("Invalid TREASURY_PUBLIC_KEY — failed to parse as public key", "CONFIG_ERROR", configDebug);
  }

  const keyMatches = derivedPubStr === TREASURY_PUBLIC_KEY;
  configDebug.keyMatches = keyMatches;
  if (!keyMatches) {
    throw new ClaimError("Treasury private key does not match treasury public key", "CONFIG_ERROR", configDebug);
  }

  // 3. Parse user wallet and mint
  const safeMint   = (mintAddress ?? "").trim().replace(/^["']|["']$/g, "");
  const safeWallet = (toWallet    ?? "").trim().replace(/^["']|["']$/g, "");

  if (!safeWallet) throw new ClaimError("Invalid user wallet address", "INVALID_WALLET", configDebug);
  if (!safeMint)   throw new ClaimError("Invalid DWC_MINT", "CONFIG_ERROR", configDebug);

  let toPubkey: InstanceType<typeof PublicKey>;
  try { toPubkey = new PublicKey(safeWallet); } catch {
    throw new ClaimError("Invalid user wallet address — parse failed", "INVALID_WALLET", configDebug);
  }

  let mintPubkey: InstanceType<typeof PublicKey>;
  try { mintPubkey = new PublicKey(safeMint); } catch {
    throw new ClaimError("Invalid DWC_MINT — parse failed", "CONFIG_ERROR", configDebug);
  }

  const assocTokenProgramId = new PublicKey(ASSOC_TOKEN_PROGRAM_ID_STR);
  const systemProgramId     = new PublicKey(SYSTEM_PROGRAM_ID_STR);

  // 4. Detect token program from on-chain mint account
  const mintAccResult = await solanaRpc("getAccountInfo", [
    safeMint,
    { encoding: "jsonParsed", commitment: "confirmed" },
  ]) as any;

  if (!mintAccResult?.value) {
    throw new ClaimError(`DWC_MINT not found on-chain: ${safeMint}`, "CONFIG_ERROR", configDebug);
  }

  const tokenProgramDetected: string = mintAccResult.value.owner;
  if (
    tokenProgramDetected !== TOKEN_PROGRAM_ID_STR &&
    tokenProgramDetected !== TOKEN_2022_PROGRAM_ID_STR
  ) {
    throw new ClaimError(
      `Unrecognised token program: ${tokenProgramDetected}`,
      "CONFIG_ERROR",
      configDebug,
    );
  }

  const isToken2022 = tokenProgramDetected === TOKEN_2022_PROGRAM_ID_STR;
  const mintDecimals: number = mintAccResult.value.data?.parsed?.info?.decimals;
  if (typeof mintDecimals !== "number") {
    throw new ClaimError(`Could not read decimals from on-chain mint: ${safeMint}`, "CONFIG_ERROR", configDebug);
  }

  const detectedTokenProgramId = new PublicKey(tokenProgramDetected);

  // 5. Derive ATAs
  function deriveATA(owner: InstanceType<typeof PublicKey>): InstanceType<typeof PublicKey> {
    const [ata] = PublicKey.findProgramAddressSync(
      [owner.toBuffer(), detectedTokenProgramId.toBuffer(), mintPubkey.toBuffer()],
      assocTokenProgramId,
    );
    return ata;
  }

  const treasuryATA = deriveATA(treasury.publicKey);
  const userATA     = deriveATA(toPubkey);

  const transferDebug: Record<string, unknown> = {
    ...configDebug,
    tokenProgram: tokenProgramDetected,
    isToken2022,
    mintDecimals,
    treasuryAta: treasuryATA.toBase58(),
    userAta: userATA.toBase58(),
  };

  console.log(`[reward-claim] mint: ${safeMint.slice(0,4)}...${safeMint.slice(-4)} | program: ${isToken2022 ? "Token-2022" : "SPL"} | decimals: ${mintDecimals}`);
  console.log(`[reward-claim] treasury ATA: ${treasuryATA.toBase58()}`);
  console.log(`[reward-claim] user ATA:     ${userATA.toBase58()}`);

  // 6. Check treasury DWORLD balance
  let treasuryDworldBalance = 0;
  try {
    const balResult = await solanaRpc("getTokenAccountBalance", [treasuryATA.toBase58()]) as any;
    treasuryDworldBalance = balResult?.value?.uiAmount != null
      ? Number(balResult.value.uiAmount)
      : Number(balResult?.value?.amount ?? "0") / Math.pow(10, mintDecimals);
  } catch (e: any) {
    throw new ClaimError(
      `Treasury ATA not found: ${treasuryATA.toBase58()}. Ensure treasury holds DWORLD tokens. (${e?.message})`,
      "TREASURY_NO_ATA",
    );
  }

  if (treasuryDworldBalance < rewardAmount) {
    throw new ClaimError(
      `Treasury has insufficient DWORLD: has ${treasuryDworldBalance}, needs ${rewardAmount}`,
      "INSUFFICIENT_DWORLD",
    );
  }

  // 7. Check user ATA — if missing, return ATA_NOT_FOUND so client creates it
  const userAtaInfo = await solanaRpc("getAccountInfo", [
    userATA.toBase58(),
    { encoding: "base64", commitment: "confirmed" },
  ]) as any;
  const userATAExists = !!userAtaInfo?.value;

  if (!userATAExists) {
    console.log(`[reward-claim] user ATA missing: ${userATA.toBase58()}`);
    throw new ClaimError(
      `User DWORLD token account not found. The user must create it first.`,
      "ATA_NOT_FOUND",
      { ...transferDebug, userAta: userATA.toBase58() },
    );
  }

  // 8. Check treasury SOL balance (only needs fee, not ATA rent)
  const solBalResult = await solanaRpc("getBalance", [derivedPubStr, { commitment: "confirmed" }]) as any;
  const solBalance = Number(solBalResult ?? 0) / 1e9;
  if (solBalance < MIN_SOL_BALANCE) {
    throw new ClaimError(
      `INSUFFICIENT_SOL: treasury has ${solBalance.toFixed(6)} SOL, need at least ${MIN_SOL_BALANCE} SOL for fees`,
      "INSUFFICIENT_SOL",
    );
  }

  // 9. Build transferChecked instruction only (no ATA creation — user pays their own ATA)
  // Layout: [12 u8][amount u64 LE][decimals u8] = 10 bytes
  const rawAmount = BigInt(rewardAmount) * BigInt(Math.pow(10, mintDecimals));
  const transferData = new Uint8Array(10);
  transferData[0] = 12;
  new DataView(transferData.buffer).setBigUint64(1, rawAmount, true);
  transferData[9] = mintDecimals;

  const tx = new Transaction();
  tx.add(new TransactionInstruction({
    programId: detectedTokenProgramId,
    keys: [
      { pubkey: treasuryATA,        isSigner: false, isWritable: true  }, // source
      { pubkey: mintPubkey,         isSigner: false, isWritable: false }, // mint
      { pubkey: userATA,            isSigner: false, isWritable: true  }, // destination
      { pubkey: treasury.publicKey, isSigner: true,  isWritable: false }, // authority
    ],
    data: transferData,
  }));

  // 10. Sign and send
  const bhResult = await solanaRpc("getLatestBlockhash", [{ commitment: "confirmed" }]) as any;
  const blockhash = bhResult?.value?.blockhash ?? bhResult?.blockhash;
  if (!blockhash) throw new ClaimError("Could not fetch blockhash from RPC", "RPC_ERROR");

  tx.recentBlockhash = blockhash;
  tx.feePayer = treasury.publicKey;
  tx.sign(treasury);

  const rawBase64 = btoa(String.fromCharCode(...tx.serialize()));

  // ── Pre-send diagnostic log ──────────────────────────────────────────────────
  console.log("[reward-claim] ── PRE-SEND DIAGNOSTICS ──────────────────────────────");
  console.log(`[reward-claim] connected wallet (fee payer / treasury): ${derivedPubStr}`);
  console.log(`[reward-claim] treasury authority:   ${derivedPubStr}`);
  console.log(`[reward-claim] treasury ATA:         ${treasuryATA.toBase58()}`);
  console.log(`[reward-claim] recipient wallet:     ${safeWallet}`);
  console.log(`[reward-claim] recipient ATA:        ${userATA.toBase58()} (exists: true)`);
  console.log(`[reward-claim] DWORLD mint:          ${safeMint}`);
  console.log(`[reward-claim] token program:        ${tokenProgramDetected} (${isToken2022 ? "Token-2022" : "SPL Token"})`);
  console.log(`[reward-claim] transfer amount (UI): ${rewardAmount} DWORLD`);
  console.log(`[reward-claim] transfer amount (raw): ${rawAmount.toString()} (decimals: ${mintDecimals})`);
  console.log(`[reward-claim] treasury DWORLD bal:  ${treasuryDworldBalance}`);
  console.log(`[reward-claim] treasury SOL bal:     ${solBalance.toFixed(6)} SOL`);
  console.log("[reward-claim] ──────────────────────────────────────────────────────");

  // Simulate before sending
  const simResult = await solanaRpc("simulateTransaction", [
    rawBase64,
    { encoding: "base64", commitment: "confirmed" },
  ]) as any;
  if (simResult?.value?.err) {
    throw new ClaimError(
      `Transaction simulation failed: ${JSON.stringify(simResult.value.err)}`,
      "SIM_FAILED",
      { ...transferDebug, simLogs: simResult?.value?.logs },
    );
  }

  const sig = await solanaRpc("sendTransaction", [
    rawBase64,
    { encoding: "base64", skipPreflight: false, preflightCommitment: "confirmed" },
  ]) as string;

  if (!sig || typeof sig !== "string") {
    throw new ClaimError("Invalid signature returned from RPC", "RPC_ERROR");
  }

  console.log(`[reward-claim] tx sent: ${sig}`);
  await pollConfirmation(sig);
  console.log(`[reward-claim] confirmed: ${sig}`);

  return {
    signature: sig,
    debug: {
      ...transferDebug,
      rawAmount: rawAmount.toString(),
      treasuryDworldBalance,
      userDworldAtaExists: true,
    },
  };
}

// ── HTTP handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json() as {
      reward_id: string;
      wallet_address: string;
      device_fingerprint_hash?: string;
    };

    const { reward_id, wallet_address, device_fingerprint_hash } = body;

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

    // Hash the caller IP for duplicate detection
    const rawIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const claimIpHash = await sha256hex(rawIp);

    const db = createClient(SUPABASE_URL, SERVICE_KEY);

    // ── Load and validate reward record ────────────────────────────────────────
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
          error: "Reward already claimed",
          signature: reward.transaction_signature,
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (reward.status === "claiming") {
      return new Response(
        JSON.stringify({ success: false, error: "Claim already in progress — please wait" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (reward.status !== "ready") {
      return new Response(
        JSON.stringify({ success: false, error: `Reward cannot be claimed (status: ${reward.status})` }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Security checks ────────────────────────────────────────────────────────

    // 1. verification_status — only verified users can claim
    const { data: profile } = await db
      .from("user_profiles")
      .select("verification_status")
      .eq("wallet_address", wallet_address)
      .maybeSingle();

    const verStatus = profile?.verification_status ?? "pending";
    if (verStatus === "rejected") {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Your account has been rejected and cannot claim rewards.",
          code: "ACCOUNT_REJECTED",
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (verStatus === "flagged") {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Your account is under review. Claims are temporarily paused.",
          code: "ACCOUNT_FLAGGED",
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (verStatus === "pending") {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Account verification is pending. Please wait for approval.",
          code: "ACCOUNT_PENDING",
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    // verStatus === "verified" — proceed

    // 2. Check claim_logs: duplicate wallet+reason
    const { data: existingLog } = await db
      .from("reward_claim_logs")
      .select("id, status, transaction_signature")
      .eq("wallet_address", wallet_address)
      .eq("reward_type", reward.reason)
      .eq("status", "claimed")
      .maybeSingle();

    if (existingLog) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "This wallet has already claimed this reward.",
          signature: existingLog.transaction_signature,
          code: "DUPLICATE_WALLET",
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 3. Check claim_logs: duplicate IP
    const { data: ipLog } = await db
      .from("reward_claim_logs")
      .select("id")
      .eq("claim_ip_hash", claimIpHash)
      .eq("reward_type", reward.reason)
      .eq("status", "claimed")
      .maybeSingle();

    if (ipLog) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "A reward has already been claimed from your network. One claim per network.",
          code: "DUPLICATE_IP",
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 4. Check claim_logs: duplicate device fingerprint
    if (device_fingerprint_hash) {
      const { data: fpLog } = await db
        .from("reward_claim_logs")
        .select("id")
        .eq("device_fingerprint_hash", device_fingerprint_hash)
        .eq("reward_type", reward.reason)
        .eq("status", "claimed")
        .maybeSingle();

      if (fpLog) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "A reward has already been claimed from this device.",
            code: "DUPLICATE_DEVICE",
          }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // ── Early member cap check ─────────────────────────────────────────────────
    let totalClaimsUsed = 0;
    if (reward.reason === "early_user_first_100") {
      const { data: limitSetting } = await db
        .from("reward_settings")
        .select("value")
        .eq("key", "first_100_limit")
        .maybeSingle();
      const claimLimit = limitSetting?.value != null ? Number(limitSetting.value) : 10000;

      const { count } = await db
        .from("user_rewards")
        .select("id", { count: "exact", head: true })
        .eq("reason", "early_user_first_100")
        .eq("status", "sent");
      totalClaimsUsed = count ?? 0;
      if (totalClaimsUsed >= claimLimit) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `Early member claim limit reached (${totalClaimsUsed}/${claimLimit} users)`,
            debug: { totalClaimsUsed, claimLimit, deployedAt: DEPLOYED_AT },
          }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // ── Atomic claim lock ──────────────────────────────────────────────────────
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

    // ── Send tokens ────────────────────────────────────────────────────────────
    const mintAddress = DWC_MINT_ENV;
    console.log(`[reward-claim] initiating claim | reward_type: ${reward.reason} | user_id: ${reward.user_id ?? "null"} | wallet: ${wallet_address.slice(0,8)}...${wallet_address.slice(-4)} | amount: ${reward.reward_amount}`);
    let sendResult: SendResult;

    try {
      sendResult = await sendRewardTokens(wallet_address, mintAddress, reward.reward_amount);
    } catch (sendErr: any) {
      const msg   = String(sendErr?.message || sendErr);
      const code  = sendErr?.code ?? "SEND_ERROR";
      const debug = sendErr?.debug ?? { deployedAt: DEPLOYED_AT };

      console.error("[reward-claim] transfer failed:", code, msg);

      // ATA_NOT_FOUND: do NOT roll back to ready — user must create ATA then retry
      // Roll back to ready so user can retry after creating ATA
      await db
        .from("user_rewards")
        .update({ status: "ready", updated_at: new Date().toISOString() })
        .eq("id", reward_id);

      // Log failed attempt (not 'claimed' so unique indexes won't block retry)
      await db.from("reward_claim_logs").insert({
        user_id: reward.user_id ?? null,
        wallet_address,
        reward_type: reward.reason,
        amount: reward.reward_amount,
        token: "DWORLD",
        claim_ip_hash: claimIpHash,
        device_fingerprint_hash: device_fingerprint_hash ?? null,
        status: "failed",
        error_message: msg.slice(0, 500),
      });

      if (code === "ATA_NOT_FOUND") {
        return new Response(
          JSON.stringify({
            success: false,
            error: "ATA_NOT_FOUND",
            code: "ATA_NOT_FOUND",
            userAta: debug?.userAta,
            debug,
          }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      if (msg.includes("INSUFFICIENT_SOL") || code === "INSUFFICIENT_SOL") {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Treasury is low on SOL for transaction fees. Please try again later.",
            debug,
          }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (msg.includes("insufficient DWORLD") || code === "INSUFFICIENT_DWORLD") {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Reward pool temporarily unavailable. Please try again later.",
            debug,
          }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({ success: false, error: msg, code, debug }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── On-chain confirmed — mark claimed ──────────────────────────────────────
    const now = new Date().toISOString();
    await db.from("user_rewards").update({
      status: "sent",
      transaction_signature: sendResult.signature,
      claimed_at: now,
      sent_at: now,
      updated_at: now,
    }).eq("id", reward_id);

    // Append claim audit log
    await db.from("reward_claim_logs").insert({
      user_id: reward.user_id ?? null,
      wallet_address,
      reward_type: reward.reason,
      amount: reward.reward_amount,
      token: "DWORLD",
      claim_ip_hash: claimIpHash,
      device_fingerprint_hash: device_fingerprint_hash ?? null,
      transaction_signature: sendResult.signature,
      status: "claimed",
    });

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
