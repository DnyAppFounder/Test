import { supabase } from '@/lib/supabase';
import { GAME_TREASURY_WALLET } from './gameConfig';
import type { GameId } from './gameTypes';

// ─── Types ──────────────────────────────────────────────────────────────────

export type DuelEntryStatus =
  | 'waiting'
  | 'matched'
  | 'completed'
  | 'refunded'
  | 'refund_failed'
  | 'cancelled';

export type DuelMode = 'free' | 'ranked' | 'sol_duel';

export interface DuelEntry {
  id: string;
  user_id: string | null;
  wallet_address: string;
  username: string | null;
  avatar_url: string | null;
  badge_status: string;
  entry_amount_sol: number;
  payment_tx_signature: string | null;
  refund_tx_signature: string | null;
  status: DuelEntryStatus;
  mode: DuelMode;
  game_id: GameId;
  created_at: string;
}

export interface DuelMatch {
  id: string;
  match_seed: string;
  entry_amount_sol: number;
  player1_entry_id: string;
  player2_entry_id: string;
  player1_wallet: string;
  player2_wallet: string;
  player1_score: number | null;
  player2_score: number | null;
  winner_wallet: string | null;
  winner_payout_sol: number | null;
  payout_status: string;
  status: string;
}

export interface GameResultInput {
  match_id: string | null;
  entry_id: string | null;
  wallet_address: string;
  mode: DuelMode;
  game_id: GameId;
  score: number;
  survival_time_ms: number;
  completion_time_ms?: number;
  orbs_collected: number;
  obstacles_hit: number;
  traps_hit: number;
  combo_max: number;
  accuracy: number;
  // Aim Duel
  hits?: number;
  misses?: number;
  // Runner
  distance_units?: number;
  // Memory Duel
  pairs_found?: number;
  // Decode 7 Fragments
  fragments_found?: number;
  mistakes?: number;
  raw_actions: object;
  session_id: string;
  map_seed: string | null;
}

// ─── Edge function caller ────────────────────────────────────────────────────

async function callGameFunction(fn: string, action: string, body: object): Promise<any> {
  const { data, error } = await supabase.functions.invoke(fn, {
    body: { action, ...body },
  });
  if (error) throw new Error(error.message || 'Edge function error');
  if (data?.error) throw new Error(data.error);
  return data;
}

// ─── Entry creation (after confirmed payment) ────────────────────────────────

export async function createDuelEntryAfterPayment(params: {
  walletAddress: string;
  username: string | null;
  avatarUrl: string | null;
  badgeStatus: string;
  entryAmountSol: number;
  paymentTxSignature: string;
  gameId: GameId;
}): Promise<DuelEntry> {
  return callGameFunction('game-duel-entry', 'create', {
    wallet_address: params.walletAddress,
    username: params.username,
    avatar_url: params.avatarUrl,
    badge_status: params.badgeStatus,
    entry_amount_sol: params.entryAmountSol,
    payment_tx_signature: params.paymentTxSignature,
    treasury_wallet: GAME_TREASURY_WALLET,
    game_id: params.gameId,
  });
}

// ─── Cancel + refund ─────────────────────────────────────────────────────────

export async function cancelDuelEntryAndRefund(params: {
  entryId: string;
  walletAddress: string;
}): Promise<{ entry: DuelEntry; refund_tx_signature: string }> {
  return callGameFunction('game-duel-entry', 'cancel', {
    entry_id: params.entryId,
    wallet_address: params.walletAddress,
  });
}

// ─── Matchmaking ─────────────────────────────────────────────────────────────

export async function triggerMatchmaking(params: {
  entryId: string;
  walletAddress: string;
  gameId: GameId;
}): Promise<{ matched: boolean; match?: DuelMatch }> {
  return callGameFunction('game-duel-payout', 'match', {
    entry_id: params.entryId,
    wallet_address: params.walletAddress,
    game_id: params.gameId,
  });
}

// ─── Submit game result ───────────────────────────────────────────────────────

export async function submitGameResult(result: GameResultInput): Promise<{ result_id: string }> {
  return callGameFunction('game-duel-payout', 'submit_result', { result });
}

// ─── Finalize match payout ────────────────────────────────────────────────────

export async function finalizeMatchPayout(matchId: string): Promise<{
  winner_wallet: string;
  payout_sol: number;
  payout_tx: string;
}> {
  return callGameFunction('game-duel-payout', 'finalize', { match_id: matchId });
}

// ─── DB queries ────────────────────────────────────────────────────────────────

export async function getDuelEntry(entryId: string): Promise<DuelEntry | null> {
  const { data } = await supabase
    .from('duel_entries')
    .select('*')
    .eq('id', entryId)
    .maybeSingle();
  return data as DuelEntry | null;
}

export async function getMatchForEntry(entryId: string): Promise<DuelMatch | null> {
  const { data } = await supabase
    .from('duel_matches')
    .select('*')
    .or(`player1_entry_id.eq.${entryId},player2_entry_id.eq.${entryId}`)
    .maybeSingle();
  return data as DuelMatch | null;
}

export async function saveRankedResult(result: GameResultInput): Promise<void> {
  await submitGameResult(result);
}

export async function getLeaderboard(params: {
  sort: 'score' | 'wins' | 'sol';
  limit?: number;
}): Promise<any[]> {
  const colMap = {
    score: 'best_score',
    wins: 'duel_wins',
    sol: 'total_sol_won',
  };
  const col = colMap[params.sort];
  const { data } = await supabase
    .from('game_leaderboard_scores')
    .select(
      'wallet_address,username,avatar_url,badge_status,best_score,best_combo,total_games,duel_wins,duel_losses,duel_total,total_sol_won,win_rate'
    )
    .order(col, { ascending: false })
    .limit(params.limit ?? 50);
  if (!data || data.length === 0) return [];

  // Enrich with profile UUIDs for navigation
  const wallets = data.map((r: any) => r.wallet_address).filter(Boolean);
  const { data: profiles } = await supabase
    .from('user_profiles')
    .select('id, wallet_address')
    .in('wallet_address', wallets);
  const profileMap = new Map((profiles || []).map((p: any) => [p.wallet_address, p.id]));
  return data.map((r: any) => ({
    ...r,
    profile_id: profileMap.get(r.wallet_address) ?? null,
  }));
}

export async function getMyBestResult(walletAddress: string): Promise<any | null> {
  const { data } = await supabase
    .from('game_results')
    .select('*')
    .eq('wallet_address', walletAddress)
    .order('score', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}
