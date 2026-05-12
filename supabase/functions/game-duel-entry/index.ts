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
// Treasury private key stored as JSON array of numbers, e.g. [12,34,...]
// MUST be set as a secret: supabase secrets set GAME_TREASURY_PRIVATE_KEY='[...]'
const TREASURY_PK_RAW = Deno.env.get("GAME_TREASURY_PRIVATE_KEY") || "";

const LAMPORTS_PER_SOL = 1_000_000_000;
const TOLERANCE_LAMPORTS = 5000; // ~0.000005 SOL tolerance for rounding

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

  // Check confirmation
  const status = txObj.slot ? "confirmed" : null;
  if (!status) return { ok: false, error: "Transaction not confirmed" };

  // Parse instructions to find SystemProgram.transfer
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
  if (!TREASURY_PK_RAW) {
    throw new Error(
      "GAME_TREASURY_PRIVATE_KEY not set. Admin must configure this secret to enable refunds."
    );
  }

  // Dynamically import @solana/web3.js for signing
  const {
    Keypair,
    PublicKey,
    Transaction,
    SystemProgram,
    LAMPORTS_PER_SOL: SOL,
  } = await import("npm:@solana/web3.js@1.98.4");

  const secretArray: number[] = JSON.parse(TREASURY_PK_RAW);
  const treasuryKeypair = Keypair.fromSecretKey(new Uint8Array(secretArray));

  const toPubkey = new PublicKey(toWallet);
  const lamports = Math.floor(amountSol * SOL);

  // Fetch blockhash
  const bhResult = await solanaRpc("getLatestBlockhash", [{ commitment: "confirmed" }]) as Record<string, unknown>;
  const blockhash = (bhResult as any)?.value?.blockhash ?? (bhResult as any)?.blockhash;
  if (!blockhash) throw new Error("Could not fetch blockhash");

  const tx = new Transaction();
  tx.add(SystemProgram.transfer({ fromPubkey: treasuryKeypair.publicKey, toPubkey, lamports }));
  tx.recentBlockhash = blockhash;
  tx.feePayer = treasuryKeypair.publicKey;
  tx.sign(treasuryKeypair);

  const rawTx = tx.serialize();
  const rawBase64 = btoa(String.fromCharCode(...rawTx));

  const sig = await solanaRpc("sendTransaction", [
    rawBase64,
    { encoding: "base64", skipPreflight: false, preflightCommitment: "confirmed" },
  ]) as string;

  if (!sig || typeof sig !== "string") {
    throw new Error("RPC returned invalid signature for refund");
  }

  // Poll for confirmation
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
        return Response.json({ error: "Missing required fields" }, { status: 400, headers: corsHeaders });
      }

      // Check for duplicate payment tx
      const { data: existing } = await db
        .from("duel_entries")
        .select("id")
        .eq("payment_tx_signature", paymentTxSignature)
        .maybeSingle();

      if (existing) {
        return Response.json({ error: "Payment transaction already used" }, { status: 409, headers: corsHeaders });
      }

      // Verify on-chain
      const verification = await verifyPaymentTx(
        paymentTxSignature,
        walletAddress,
        treasuryWallet,
        entryAmountSol,
      );

      if (!verification.ok) {
        return Response.json(
          { error: `Payment verification failed: ${verification.error}` },
          { status: 422, headers: corsHeaders }
        );
      }

      // Look up profile
      const { data: profile } = await db
        .from("user_profiles")
        .select("id,username,avatar_url,is_premium")
        .eq("wallet_address", walletAddress)
        .maybeSingle();

      const badgeStatus = profile?.is_premium ? "premium" : "none";

      // Create entry
      const { data: entry, error: insertErr } = await db
        .from("duel_entries")
        .insert({
          user_id: profile?.id ?? null,
          wallet_address: walletAddress,
          username: body.username as string ?? profile?.username ?? null,
          avatar_url: body.avatar_url as string ?? profile?.avatar_url ?? null,
          badge_status: badgeStatus,
          entry_amount_sol: entryAmountSol,
          payment_tx_signature: paymentTxSignature,
          status: "waiting",
          mode: "sol_duel",
        })
        .select()
        .single();

      if (insertErr) {
        return Response.json({ error: insertErr.message }, { status: 500, headers: corsHeaders });
      }

      return Response.json(entry, { headers: corsHeaders });
    }

    // ── CANCEL: refund entry ──────────────────────────────────────────────────
    if (action === "cancel") {
      const entryId = body.entry_id as string;
      const walletAddress = body.wallet_address as string;

      if (!entryId || !walletAddress) {
        return Response.json({ error: "Missing entry_id or wallet_address" }, { status: 400, headers: corsHeaders });
      }

      // Fetch entry
      const { data: entry } = await db
        .from("duel_entries")
        .select("*")
        .eq("id", entryId)
        .maybeSingle();

      if (!entry) return Response.json({ error: "Entry not found" }, { status: 404, headers: corsHeaders });
      if (entry.wallet_address !== walletAddress) {
        return Response.json({ error: "Unauthorized" }, { status: 403, headers: corsHeaders });
      }
      if (entry.status !== "waiting") {
        return Response.json(
          { error: `Cannot cancel entry with status: ${entry.status}` },
          { status: 409, headers: corsHeaders }
        );
      }
      if (entry.refund_tx_signature) {
        return Response.json({ error: "Refund already processed" }, { status: 409, headers: corsHeaders });
      }

      // Check no match exists
      const { data: match } = await db
        .from("duel_matches")
        .select("id")
        .or(`player1_entry_id.eq.${entryId},player2_entry_id.eq.${entryId}`)
        .maybeSingle();

      if (match) {
        return Response.json({ error: "Entry is already matched — cannot cancel" }, { status: 409, headers: corsHeaders });
      }

      // Mark as cancelled first (optimistic lock)
      const { error: cancelErr } = await db
        .from("duel_entries")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", entryId)
        .eq("status", "waiting");

      if (cancelErr) {
        return Response.json({ error: "Failed to cancel entry" }, { status: 500, headers: corsHeaders });
      }

      // Send refund
      let refundSig: string;
      try {
        refundSig = await sendRefundFromTreasury(walletAddress, entry.entry_amount_sol);
      } catch (refundError) {
        // Mark as refund_failed
        await db.from("duel_entries").update({ status: "refund_failed", updated_at: new Date().toISOString() }).eq("id", entryId);
        await db.from("game_admin_records").insert({
          record_type: "failed_refund",
          entry_id: entryId,
          wallet_address: walletAddress,
          details: { error: (refundError as Error).message, entry_amount_sol: entry.entry_amount_sol },
        });
        return Response.json(
          { error: `Refund failed: ${(refundError as Error).message}. Your entry has been marked for admin review.` },
          { status: 500, headers: corsHeaders }
        );
      }

      // Update with refund signature
      const { data: updated } = await db
        .from("duel_entries")
        .update({ status: "refunded", refund_tx_signature: refundSig, updated_at: new Date().toISOString() })
        .eq("id", entryId)
        .select()
        .single();

      return Response.json(
        { entry: updated, refund_tx_signature: refundSig },
        { headers: corsHeaders }
      );
    }

    return Response.json({ error: "Unknown action" }, { status: 400, headers: corsHeaders });
  } catch (err) {
    console.error("[game-duel-entry]", err);
    return Response.json(
      { error: (err as Error).message || "Internal server error" },
      { status: 500, headers: corsHeaders }
    );
  }
});
