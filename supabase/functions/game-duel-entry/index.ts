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

const LAMPORTS_PER_SOL = 1_000_000_000;
const TOLERANCE_LAMPORTS = 5000;
const MIN_TREASURY_SOL = 0.005;

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

// ─── Solana JSON-RPC helpers ─────────────────────────────────────────────────

async function solanaRpc(method: string, params: unknown[]): Promise<unknown> {
  if (!SOLANA_RPC_URL) throw new Error("SOLANA_RPC_URL not configured");
  const resp = await fetch(SOLANA_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await resp.json() as { result?: unknown; error?: { message: string } };
  if (json.error) throw new Error(`RPC error: ${json.error.message}`);
  return json.result;
}

async function verifyPaymentTx(
  signature: string,
  fromWallet: string,
  toWallet: string,
  expectedAmountSol: number,
): Promise<{ ok: boolean; error?: string }> {
  let tx: unknown;
  try {
    tx = await solanaRpc("getTransaction", [
      signature,
      { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "confirmed" },
    ]);
  } catch (e) {
    return { ok: false, error: `RPC fetch failed: ${(e as Error).message}` };
  }

  if (!tx) return { ok: false, error: "Transaction not found on chain" };

  const txObj = tx as Record<string, unknown>;
  if (txObj.meta && (txObj.meta as Record<string, unknown>).err) {
    return { ok: false, error: "Transaction failed on chain" };
  }

  const status = txObj.slot ? "confirmed" : null;
  if (!status) return { ok: false, error: "Transaction not confirmed" };

  const msg = (txObj as any).transaction?.message;
  const instructions: unknown[] = msg?.instructions ?? [];
  const expectedLamports = Math.floor(expectedAmountSol * LAMPORTS_PER_SOL);

  for (const instr of instructions) {
    const i = instr as Record<string, unknown>;
    const parsed = i.parsed as Record<string, unknown> | undefined;
    if (!parsed) continue;
    const typ = parsed.type as string;
    const info = parsed.info as Record<string, unknown> | undefined;
    if (!info) continue;

    if (typ === "transfer" || typ === "transferChecked") {
      const actualFrom = (info.source ?? info.authority) as string;
      const actualTo = (info.destination ?? info.newAuthority) as string;
      const lamports = Number((info.lamports ?? info.tokenAmount ?? 0));

      if (
        actualFrom === fromWallet &&
        actualTo === toWallet &&
        Math.abs(lamports - expectedLamports) <= TOLERANCE_LAMPORTS
      ) {
        return { ok: true };
      }
    }
  }

  return { ok: false, error: "Payment instruction not found or amounts mismatch" };
}

// ─── Treasury refund sender ───────────────────────────────────────────────────

async function sendRefundFromTreasury(
  toWallet: string,
  amountSol: number,
): Promise<string> {
  if (!TREASURY_PRIVATE_KEY_B58) {
    throw new Error("TREASURY_PRIVATE_KEY_BASE58 not set. Admin must configure this secret to enable refunds.");
  }

  const { Keypair, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL: SOL } =
    await import("npm:@solana/web3.js@1.98.4");

  const secretKey = loadTreasuryKeypairBytes();
  const treasuryKeypair = Keypair.fromSecretKey(secretKey);

  // Verify treasury public key if env var is set
  if (TREASURY_PUBLIC_KEY && treasuryKeypair.publicKey.toBase58() !== TREASURY_PUBLIC_KEY) {
    throw new Error(`Treasury keypair mismatch: derived ${treasuryKeypair.publicKey.toBase58()}, expected ${TREASURY_PUBLIC_KEY}`);
  }

  // Check treasury SOL balance before sending refund
  const solBalResult = await solanaRpc("getBalance", [treasuryKeypair.publicKey.toBase58(), { commitment: "confirmed" }]) as any;
  const solBalance = Number(solBalResult ?? 0) / 1e9;
  console.log(`[game-duel-entry] treasury SOL balance: ${solBalance}`);
  if (solBalance < amountSol + MIN_TREASURY_SOL) {
    throw new Error(`INSUFFICIENT_SOL: treasury has ${solBalance.toFixed(6)} SOL, need ${(amountSol + MIN_TREASURY_SOL).toFixed(6)} SOL`);
  }

  const toPubkey = new PublicKey(toWallet);
  const lamports = Math.floor(amountSol * SOL);

  const bhResult = await solanaRpc("getLatestBlockhash", [{ commitment: "confirmed" }]) as Record<string, unknown>;
  const blockhash = (bhResult as any)?.value?.blockhash ?? (bhResult as any)?.blockhash;
  if (!blockhash) throw new Error("Could not fetch blockhash");

  const tx = new Transaction();
  tx.add(SystemProgram.transfer({ fromPubkey: treasuryKeypair.publicKey, toPubkey, lamports }));
  tx.recentBlockhash = blockhash;
  tx.feePayer = treasuryKeypair.publicKey;
  tx.sign(treasuryKeypair);

  const rawBase64 = btoa(String.fromCharCode(...tx.serialize()));
  const sig = await solanaRpc("sendTransaction", [
    rawBase64,
    { encoding: "base64", skipPreflight: false, preflightCommitment: "confirmed" },
  ]) as string;

  if (!sig || typeof sig !== "string") {
    throw new Error("RPC returned invalid signature for refund");
  }

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));
    try {
      const statusRes = await solanaRpc("getSignatureStatuses", [
        [sig],
        { searchTransactionHistory: true },
      ]) as { value: Array<{ confirmationStatus?: string; err?: unknown } | null> };
      const st = statusRes?.value?.[0];
      if (st) {
        if (st.err) throw new Error(`Refund tx failed on-chain: ${JSON.stringify(st.err)}`);
        if (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized") {
          return sig;
        }
      }
    } catch (e) {
      if ((e as Error).message?.includes("failed on-chain")) throw e;
    }
  }
  throw new Error("Refund transaction not confirmed within 60 seconds");
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const db = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const body = await req.json() as Record<string, unknown>;
    const action = body.action as string;

    // ── CREATE: verify payment and create entry ──────────────────────────────
    if (action === "create") {
      const walletAddress = body.wallet_address as string;
      const paymentTxSignature = body.payment_tx_signature as string;
      const entryAmountSol = Number(body.entry_amount_sol);
      const treasuryWallet = body.treasury_wallet as string;

      if (!walletAddress || !paymentTxSignature || !entryAmountSol || !treasuryWallet) {
        return new Response(
          JSON.stringify({ error: "Missing required fields" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!SOLANA_RPC_URL) {
        return new Response(
          JSON.stringify({ error: "Server configuration error: SOLANA_RPC_URL not set" }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check for duplicate payment tx
      const { data: existing } = await db
        .from("duel_entries")
        .select("id")
        .eq("payment_tx_signature", paymentTxSignature)
        .maybeSingle();

      if (existing) {
        return new Response(
          JSON.stringify({ error: "Payment transaction already used" }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const verification = await verifyPaymentTx(
        paymentTxSignature,
        walletAddress,
        treasuryWallet,
        entryAmountSol,
      );

      if (!verification.ok) {
        return new Response(
          JSON.stringify({ error: `Payment verification failed: ${verification.error}` }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: profile } = await db
        .from("user_profiles")
        .select("id,username,avatar_url,is_premium")
        .eq("wallet_address", walletAddress)
        .maybeSingle();

      const badgeStatus = profile?.is_premium ? "premium" : "none";

      const gameId = (body.game_id as string) || "dawen_rush";

      const { data: entry, error: insertErr } = await db
        .from("duel_entries")
        .insert({
          user_id: profile?.id ?? null,
          wallet_address: walletAddress,
          username: (body.username as string) ?? profile?.username ?? null,
          avatar_url: (body.avatar_url as string) ?? profile?.avatar_url ?? null,
          badge_status: badgeStatus,
          entry_amount_sol: entryAmountSol,
          payment_tx_signature: paymentTxSignature,
          status: "waiting",
          mode: "sol_duel",
          game_id: gameId,
        })
        .select()
        .single();

      if (insertErr) {
        return new Response(
          JSON.stringify({ error: insertErr.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(JSON.stringify(entry), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── CANCEL: refund entry ──────────────────────────────────────────────────
    if (action === "cancel") {
      const entryId = body.entry_id as string;
      const walletAddress = body.wallet_address as string;

      if (!entryId || !walletAddress) {
        return new Response(
          JSON.stringify({ error: "Missing entry_id or wallet_address" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!TREASURY_PRIVATE_KEY_B58) {
        return new Response(
          JSON.stringify({ error: "Server configuration error: TREASURY_PRIVATE_KEY_BASE58 not set" }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: entry } = await db
        .from("duel_entries")
        .select("*")
        .eq("id", entryId)
        .maybeSingle();

      if (!entry) {
        return new Response(
          JSON.stringify({ error: "Entry not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (entry.wallet_address !== walletAddress) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (entry.status !== "waiting") {
        return new Response(
          JSON.stringify({ error: `Cannot cancel entry with status: ${entry.status}` }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (entry.refund_tx_signature) {
        return new Response(
          JSON.stringify({ error: "Refund already processed" }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: match } = await db
        .from("duel_matches")
        .select("id")
        .or(`player1_entry_id.eq.${entryId},player2_entry_id.eq.${entryId}`)
        .maybeSingle();

      if (match) {
        return new Response(
          JSON.stringify({ error: "Entry is already matched — cannot cancel" }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Atomic cancel lock
      const { error: cancelErr } = await db
        .from("duel_entries")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", entryId)
        .eq("status", "waiting");

      if (cancelErr) {
        return new Response(
          JSON.stringify({ error: "Failed to cancel entry" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let refundSig: string;
      try {
        refundSig = await sendRefundFromTreasury(walletAddress, entry.entry_amount_sol);
      } catch (refundError) {
        await db.from("duel_entries").update({ status: "refund_failed", updated_at: new Date().toISOString() }).eq("id", entryId);
        await db.from("game_admin_records").insert({
          record_type: "failed_refund",
          entry_id: entryId,
          wallet_address: walletAddress,
          details: { error: (refundError as Error).message, entry_amount_sol: entry.entry_amount_sol },
        });
        return new Response(
          JSON.stringify({ error: `Refund failed: ${(refundError as Error).message}. Your entry has been marked for admin review.` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: updated } = await db
        .from("duel_entries")
        .update({ status: "refunded", refund_tx_signature: refundSig, updated_at: new Date().toISOString() })
        .eq("id", entryId)
        .select()
        .single();

      return new Response(
        JSON.stringify({ entry: updated, refund_tx_signature: refundSig }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Unknown action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[game-duel-entry]", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
