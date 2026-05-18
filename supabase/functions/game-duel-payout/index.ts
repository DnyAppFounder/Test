import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SOLANA_RPC_URL = Deno.env.get("SOLANA_RPC_URL") || "";
const TREASURY_PK_RAW = Deno.env.get("GAME_TREASURY_PRIVATE_KEY") || "";

const LAMPORTS_PER_SOL = 1_000_000_000;
const PLATFORM_FEE_BPS = 500; // 5%
const MAX_SCORE = 10_000;

const GAME_DURATION_MAP: Record<string, number> = {
  dawen_rush:         45_000,
  dawen_aim_duel:     30_000,
  dawen_runner:       60_000,
  dawen_memory:      180_000,
  decode_7_fragments: 300_000,
};

// ─── Solana helpers ───────────────────────────────────────────────────────────

async function solanaRpc(method: string, params: unknown[]): Promise<unknown> {
  if (!SOLANA_RPC_URL) throw new Error("SOLANA_RPC_URL not configured");
  const resp = await fetch(SOLANA_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await resp.json() as { result?: unknown; error?: { message: string } };
  if (json.error) throw new Error(`RPC: ${json.error.message}`);
  return json.result;
}

async function sendSolFromTreasury(toWallet: string, amountSol: number): Promise<string> {
  if (!TREASURY_PK_RAW) throw new Error("GAME_TREASURY_PRIVATE_KEY not set");

  const { Keypair, PublicKey, Transaction, SystemProgram } =
    await import("npm:@solana/web3.js@1.98.4");

  const secretArray: number[] = JSON.parse(TREASURY_PK_RAW);
  const keypair = Keypair.fromSecretKey(new Uint8Array(secretArray));

  const bhResult = await solanaRpc("getLatestBlockhash", [{ commitment: "confirmed" }]) as Record<string, unknown>;
  const blockhash = (bhResult as any)?.value?.blockhash ?? (bhResult as any)?.blockhash;
  if (!blockhash) throw new Error("Could not fetch blockhash");

  const tx = new Transaction();
  tx.add(SystemProgram.transfer({
    fromPubkey: keypair.publicKey,
    toPubkey: new PublicKey(toWallet),
    lamports: Math.floor(amountSol * LAMPORTS_PER_SOL),
  }));
  tx.recentBlockhash = blockhash;
  tx.feePayer = keypair.publicKey;
  tx.sign(keypair);

  const rawBase64 = btoa(String.fromCharCode(...tx.serialize()));
  const sig = await solanaRpc("sendTransaction", [
    rawBase64,
    { encoding: "base64", skipPreflight: false, preflightCommitment: "confirmed" },
  ]) as string;
  if (typeof sig !== "string") throw new Error("Invalid signature from RPC");

  // Poll confirmation
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));
    try {
      const res = await solanaRpc("getSignatureStatuses", [[sig], { searchTransactionHistory: true }]) as { value: Array<{ confirmationStatus?: string; err?: unknown } | null> };
      const st = res?.value?.[0];
      if (st) {
        if (st.err) throw new Error(`Payout tx failed on-chain: ${JSON.stringify(st.err)}`);
        if (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized") return sig;
      }
    } catch (e) {
      if ((e as Error).message?.includes("failed on-chain")) throw e;
    }
  }
  throw new Error("Payout transaction not confirmed within 60 seconds");
}

// ─── Scoring helpers ──────────────────────────────────────────────────────────

function validateScore(result: Record<string, unknown>): { valid: boolean; reason?: string } {
  const score = Number(result.score);
  if (score < 0 || score > MAX_SCORE) return { valid: false, reason: "Score out of range" };

  const gameId = (result.game_id as string) || "dawen_rush";
  const maxDurationMs = (GAME_DURATION_MAP[gameId] ?? 300_000) + 10_000;
  const survMs = Number(result.survival_time_ms);
  if (survMs < 0 || survMs > maxDurationMs) {
    return { valid: false, reason: "Survival time out of range" };
  }

  if (gameId === "dawen_rush") {
    const orbs = Number(result.orbs_collected ?? 0);
    const traps = Number(result.traps_hit ?? 0);
    const obs = Number(result.obstacles_hit ?? 0);
    if (orbs < 0 || traps < 0 || obs < 0) return { valid: false, reason: "Negative action counts" };
  } else if (gameId === "dawen_aim_duel") {
    if (Number(result.hits ?? 0) < 0 || Number(result.misses ?? 0) < 0) return { valid: false, reason: "Negative hit counts" };
  } else if (gameId === "dawen_memory") {
    const pairs = Number(result.pairs_found ?? 0);
    if (pairs < 0 || pairs > 8) return { valid: false, reason: "Invalid pairs count" };
  } else if (gameId === "decode_7_fragments") {
    const frags = Number(result.fragments_found ?? 0);
    if (frags < 0 || frags > 7) return { valid: false, reason: "Invalid fragments count" };
  }

  return { valid: true };
}

function determineWinner(p1: Record<string, unknown>, p2: Record<string, unknown>): 1 | 2 {
  const s1 = Number(p1.score), s2 = Number(p2.score);
  if (s1 !== s2) return s1 > s2 ? 1 : 2;
  const t1 = Number(p1.survival_time_ms), t2 = Number(p2.survival_time_ms);
  if (t1 !== t2) return t1 > t2 ? 1 : 2;
  const trap1 = Number(p1.traps_hit), trap2 = Number(p2.traps_hit);
  if (trap1 !== trap2) return trap1 < trap2 ? 1 : 2;
  // Tiebreaker: earliest submitted
  const c1 = new Date(p1.created_at as string).getTime();
  const c2 = new Date(p2.created_at as string).getTime();
  return c1 <= c2 ? 1 : 2;
}

// ─── Leaderboard upsert ───────────────────────────────────────────────────────

async function upsertLeaderboard(
  db: ReturnType<typeof createClient>,
  walletAddress: string,
  result: Record<string, unknown>,
  isWin?: boolean,
  solWon?: number,
  solWagered?: number,
) {
  const { data: existing } = await db
    .from("game_leaderboard_scores")
    .select("*")
    .eq("wallet_address", walletAddress)
    .maybeSingle();

  const score = Number(result.score);
  const survMs = Number(result.survival_time_ms);
  const combo = Number(result.combo_max);
  const mode = result.mode as string;

  if (!existing) {
    await db.from("game_leaderboard_scores").insert({
      user_id: result.user_id ?? null,
      wallet_address: walletAddress,
      username: result.username ?? null,
      avatar_url: result.avatar_url ?? null,
      badge_status: result.badge_status ?? "none",
      best_score: score,
      best_survival_ms: survMs,
      best_combo: combo,
      total_games: 1,
      ranked_games: mode === "ranked" || mode === "sol_duel" ? 1 : 0,
      duel_wins: isWin ? 1 : 0,
      duel_losses: isWin === false ? 1 : 0,
      duel_total: isWin !== undefined ? 1 : 0,
      total_sol_won: solWon ?? 0,
      total_sol_wagered: solWagered ?? 0,
      win_rate: isWin !== undefined ? (isWin ? 1 : 0) : 0,
      updated_at: new Date().toISOString(),
    });
  } else {
    const newWins = existing.duel_wins + (isWin ? 1 : 0);
    const newLosses = existing.duel_losses + (isWin === false ? 1 : 0);
    const newTotal = existing.duel_total + (isWin !== undefined ? 1 : 0);
    await db.from("game_leaderboard_scores").update({
      best_score: Math.max(existing.best_score, score),
      best_survival_ms: Math.max(existing.best_survival_ms, survMs),
      best_combo: Math.max(existing.best_combo, combo),
      total_games: existing.total_games + 1,
      ranked_games: existing.ranked_games + (mode === "ranked" || mode === "sol_duel" ? 1 : 0),
      duel_wins: newWins,
      duel_losses: newLosses,
      duel_total: newTotal,
      total_sol_won: Number(existing.total_sol_won) + (solWon ?? 0),
      total_sol_wagered: Number(existing.total_sol_wagered) + (solWagered ?? 0),
      win_rate: newTotal > 0 ? newWins / newTotal : 0,
      updated_at: new Date().toISOString(),
    }).eq("wallet_address", walletAddress);
  }
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

    // ── MATCH: find opponent and create match ─────────────────────────────────
    if (action === "match") {
      const entryId = body.entry_id as string;
      const walletAddress = body.wallet_address as string;

      const { data: myEntry } = await db
        .from("duel_entries")
        .select("*")
        .eq("id", entryId)
        .eq("status", "waiting")
        .maybeSingle();

      if (!myEntry) {
        return Response.json({ matched: false, reason: "Entry not waiting" }, { headers: corsHeaders });
      }

      const gameId = (body.game_id as string) || myEntry.game_id || "dawen_rush";

      // Find opponent: same game, same amount, different wallet, oldest first
      const { data: opponent } = await db
        .from("duel_entries")
        .select("*")
        .eq("status", "waiting")
        .eq("entry_amount_sol", myEntry.entry_amount_sol)
        .eq("game_id", gameId)
        .neq("wallet_address", walletAddress)
        .neq("id", entryId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!opponent) {
        return Response.json({ matched: false }, { headers: corsHeaders });
      }

      // Generate deterministic seed
      const seedInput = `${myEntry.id}:${opponent.id}:${Date.now()}`;
      const seedBytes = new TextEncoder().encode(seedInput);
      const hashBuffer = await crypto.subtle.digest("SHA-256", seedBytes);
      const matchSeed = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
        .slice(0, 32);

      const totalPot = Number(myEntry.entry_amount_sol) * 2;
      const platformFee = totalPot * (PLATFORM_FEE_BPS / 10_000);
      const winnerPayout = totalPot - platformFee;

      // Create match (use upsert-like insert to prevent race)
      const { data: match, error: matchErr } = await db
        .from("duel_matches")
        .insert({
          entry_amount_sol: myEntry.entry_amount_sol,
          match_seed: matchSeed,
          game_id: gameId,
          player1_entry_id: opponent.id,
          player2_entry_id: myEntry.id,
          player1_user_id: opponent.user_id,
          player2_user_id: myEntry.user_id,
          player1_wallet: opponent.wallet_address,
          player2_wallet: walletAddress,
          total_pot_sol: totalPot,
          platform_fee_sol: platformFee,
          winner_payout_sol: winnerPayout,
          payout_status: "pending",
          status: "active",
        })
        .select()
        .single();

      if (matchErr) {
        return Response.json({ matched: false, reason: matchErr.message }, { headers: corsHeaders });
      }

      // Update both entries to matched
      await db.from("duel_entries")
        .update({ status: "matched", updated_at: new Date().toISOString() })
        .in("id", [myEntry.id, opponent.id]);

      return Response.json({ matched: true, match }, { headers: corsHeaders });
    }

    // ── SUBMIT_RESULT: validate and store game result ─────────────────────────
    if (action === "submit_result") {
      const result = body.result as Record<string, unknown>;
      if (!result) return Response.json({ error: "Missing result" }, { status: 400, headers: corsHeaders });

      const sessionId = result.session_id as string;
      if (!sessionId) return Response.json({ error: "Missing session_id" }, { status: 400, headers: corsHeaders });

      // Reject duplicates
      const { data: dup } = await db
        .from("game_results")
        .select("id")
        .eq("session_id", sessionId)
        .maybeSingle();

      if (dup) {
        await db.from("game_admin_records").insert({
          record_type: "duplicate_submission",
          wallet_address: result.wallet_address as string,
          details: { session_id: sessionId },
        });
        return Response.json({ error: "Duplicate session" }, { status: 409, headers: corsHeaders });
      }

      // Validate score
      const scoreCheck = validateScore(result);
      if (!scoreCheck.valid) {
        await db.from("game_admin_records").insert({
          record_type: "invalid_score",
          wallet_address: result.wallet_address as string,
          details: { reason: scoreCheck.reason, result },
        });
        return Response.json({ error: `Invalid result: ${scoreCheck.reason}` }, { status: 422, headers: corsHeaders });
      }

      // For sol_duel: verify match is active and entry belongs to player
      if (result.mode === "sol_duel" && result.match_id) {
        const { data: match } = await db
          .from("duel_matches")
          .select("*")
          .eq("id", result.match_id)
          .maybeSingle();

        if (!match) return Response.json({ error: "Match not found" }, { status: 404, headers: corsHeaders });
        if (match.status !== "active") {
          return Response.json({ error: "Match is not active" }, { status: 409, headers: corsHeaders });
        }
        if (
          match.player1_wallet !== result.wallet_address &&
          match.player2_wallet !== result.wallet_address
        ) {
          return Response.json({ error: "Not a participant in this match" }, { status: 403, headers: corsHeaders });
        }
        // Verify map_seed matches
        if (result.map_seed && result.map_seed !== match.match_seed) {
          await db.from("game_admin_records").insert({
            record_type: "anti_cheat_flag",
            match_id: result.match_id as string,
            wallet_address: result.wallet_address as string,
            details: { reason: "seed_mismatch", submitted_seed: result.map_seed, expected_seed: match.match_seed },
          });
          return Response.json({ error: "Map seed mismatch" }, { status: 422, headers: corsHeaders });
        }
      }

      // Save result
      const { data: saved, error: saveErr } = await db
        .from("game_results")
        .insert({
          match_id: result.match_id ?? null,
          entry_id: result.entry_id ?? null,
          user_id: result.user_id ?? null,
          wallet_address: result.wallet_address,
          mode: result.mode,
          game_id: result.game_id ?? "dawen_rush",
          score: result.score,
          survival_time_ms: result.survival_time_ms,
          completion_time_ms: result.completion_time_ms ?? null,
          orbs_collected: result.orbs_collected ?? 0,
          obstacles_hit: result.obstacles_hit ?? 0,
          traps_hit: result.traps_hit ?? 0,
          combo_max: result.combo_max ?? 0,
          accuracy: result.accuracy ?? 0,
          hits: result.hits ?? null,
          misses: result.misses ?? null,
          distance_units: result.distance_units ?? null,
          pairs_found: result.pairs_found ?? null,
          fragments_found: result.fragments_found ?? null,
          mistakes: result.mistakes ?? null,
          raw_actions: result.raw_actions,
          session_id: sessionId,
          map_seed: result.map_seed ?? null,
        })
        .select()
        .single();

      if (saveErr) return Response.json({ error: saveErr.message }, { status: 500, headers: corsHeaders });

      // Update match result pointers
      if (result.mode === "sol_duel" && result.match_id) {
        const { data: match } = await db
          .from("duel_matches")
          .select("*")
          .eq("id", result.match_id)
          .single();

        const isP1 = match.player1_wallet === result.wallet_address;
        const updateField = isP1 ? { player1_result_id: saved.id, player1_score: result.score } : { player2_result_id: saved.id, player2_score: result.score };
        await db.from("duel_matches").update(updateField).eq("id", result.match_id);
      }

      // Update leaderboard for ranked/free
      if (result.mode !== "sol_duel") {
        const { data: profile } = await db.from("user_profiles").select("id,username,avatar_url,is_premium").eq("wallet_address", result.wallet_address as string).maybeSingle();
        await upsertLeaderboard(db, result.wallet_address as string, { ...result, user_id: profile?.id, username: profile?.username, avatar_url: profile?.avatar_url, badge_status: profile?.is_premium ? "premium" : "none" });
      }

      return Response.json({ result_id: saved.id }, { headers: corsHeaders });
    }

    // ── FINALIZE: determine winner and send payout ────────────────────────────
    if (action === "finalize") {
      const matchId = body.match_id as string;
      if (!matchId) return Response.json({ error: "Missing match_id" }, { status: 400, headers: corsHeaders });

      const { data: match } = await db
        .from("duel_matches")
        .select("*")
        .eq("id", matchId)
        .maybeSingle();

      if (!match) return Response.json({ error: "Match not found" }, { status: 404, headers: corsHeaders });
      if (match.status === "completed") {
        return Response.json({
          already_completed: true,
          winner_wallet: match.winner_wallet,
          payout_sol: match.winner_payout_sol,
          payout_tx: match.payout_tx_signature,
        }, { headers: corsHeaders });
      }
      if (match.status !== "active") {
        return Response.json({ error: `Match status is: ${match.status}` }, { status: 409, headers: corsHeaders });
      }
      if (match.payout_status === "paid") {
        return Response.json({ error: "Payout already processed" }, { status: 409, headers: corsHeaders });
      }

      // Verify both results exist
      if (!match.player1_result_id || !match.player2_result_id) {
        return Response.json({
          waiting_for_results: true,
          p1_done: !!match.player1_result_id,
          p2_done: !!match.player2_result_id,
        }, { headers: corsHeaders });
      }

      const { data: r1 } = await db.from("game_results").select("*").eq("id", match.player1_result_id).single();
      const { data: r2 } = await db.from("game_results").select("*").eq("id", match.player2_result_id).single();

      if (!r1 || !r2) return Response.json({ error: "Results not found" }, { status: 404, headers: corsHeaders });

      const winnerNum = determineWinner(r1, r2);
      const winnerWallet = winnerNum === 1 ? match.player1_wallet : match.player2_wallet;
      const loserWallet  = winnerNum === 1 ? match.player2_wallet : match.player1_wallet;
      const payoutSol = Number(match.winner_payout_sol);

      // Atomically mark as paying (prevent double-payout)
      const { error: lockErr } = await db
        .from("duel_matches")
        .update({ payout_status: "pending", status: "active", winner_wallet: winnerWallet, updated_at: new Date().toISOString() })
        .eq("id", matchId)
        .eq("payout_status", "pending")
        .is("payout_tx_signature", null);

      if (lockErr) {
        return Response.json({ error: "Could not lock match for payout (possible race)" }, { status: 409, headers: corsHeaders });
      }

      // Send payout
      let payoutTx: string;
      try {
        payoutTx = await sendSolFromTreasury(winnerWallet, payoutSol);
      } catch (e) {
        await db.from("duel_matches").update({ payout_status: "failed", status: "completed_with_failed_payout" }).eq("id", matchId);
        await db.from("game_admin_records").insert({
          record_type: "failed_payout",
          match_id: matchId,
          wallet_address: winnerWallet,
          details: { error: (e as Error).message, payout_sol: payoutSol },
        });
        return Response.json({ error: `Payout failed: ${(e as Error).message}` }, { status: 500, headers: corsHeaders });
      }

      // Complete match
      await db.from("duel_matches").update({
        payout_tx_signature: payoutTx,
        payout_status: "paid",
        status: "completed",
        winner_wallet: winnerWallet,
        player1_score: Number(r1.score),
        player2_score: Number(r2.score),
        completed_at: new Date().toISOString(),
      }).eq("id", matchId);

      // Mark entries completed
      await db.from("duel_entries").update({ status: "completed", updated_at: new Date().toISOString() })
        .in("id", [match.player1_entry_id, match.player2_entry_id]);

      // Update leaderboards
      const { data: wp } = await db.from("user_profiles").select("id,username,avatar_url,is_premium").eq("wallet_address", winnerWallet).maybeSingle();
      const { data: lp } = await db.from("user_profiles").select("id,username,avatar_url,is_premium").eq("wallet_address", loserWallet).maybeSingle();

      await upsertLeaderboard(db, winnerWallet, { ...r1, user_id: wp?.id, username: wp?.username, avatar_url: wp?.avatar_url, badge_status: wp?.is_premium ? "premium" : "none", mode: "sol_duel" }, true, payoutSol, Number(match.entry_amount_sol));
      await upsertLeaderboard(db, loserWallet,  { ...r2, user_id: lp?.id, username: lp?.username, avatar_url: lp?.avatar_url, badge_status: lp?.is_premium ? "premium" : "none", mode: "sol_duel" }, false, 0, Number(match.entry_amount_sol));

      return Response.json({
        winner_wallet: winnerWallet,
        payout_sol: payoutSol,
        payout_tx: payoutTx,
      }, { headers: corsHeaders });
    }

    return Response.json({ error: "Unknown action" }, { status: 400, headers: corsHeaders });
  } catch (err) {
    console.error("[game-duel-payout]", err);
    return Response.json(
      { error: (err as Error).message || "Internal server error" },
      { status: 500, headers: corsHeaders }
    );
  }
});
