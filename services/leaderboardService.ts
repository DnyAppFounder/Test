import { supabase } from '@/lib/supabase';

export type LeaderboardTimeframe = '24H' | '7D' | '30D' | 'ALL';
export type LeaderboardCategory =
  | 'overall'
  | 'games'
  | 'pulse'
  | 'trading'
  | 'community'
  | 'dworld'
  | 'launchpad';

// ─── Entry interfaces ─────────────────────────────────────────────────────────

export interface BaseEntry {
  wallet_address: string;
  username: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  is_premium: boolean;
}

export interface OverallEntry extends BaseEntry {
  dawen_score: number;
  game_score_pts: number;
  pulse_score_pts: number;
  dworld_score_pts: number;
  community_score_pts: number;
  launchpad_score_pts: number;
}

export interface GamesEntry extends BaseEntry {
  best_score: number;
  best_combo: number;
  total_games: number;
  duel_wins: number;
  duel_total: number;
  total_sol_won: number;
  win_rate: number;
  game_score_pts: number;
}

export interface PulseEntry extends BaseEntry {
  post_count: number;
  total_likes_received: number;
  total_comments_received: number;
  total_reposts_received: number;
  follower_count: number;
  pulse_score_pts: number;
}

export interface DworldEntry extends BaseEntry {
  total_earned: number;
  total_claimed: number;
  total_pending: number;
  dworld_score_pts: number;
}

export interface CommunityEntry extends BaseEntry {
  referral_count: number;
  follower_count: number;
  community_score_pts: number;
}

export interface LaunchpadEntry extends BaseEntry {
  total_launches: number;
  successful_launches: number;
  launchpad_score_pts: number;
}

export type LeaderboardEntry =
  | OverallEntry
  | GamesEntry
  | PulseEntry
  | DworldEntry
  | CommunityEntry
  | LaunchpadEntry;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSinceTs(timeframe: LeaderboardTimeframe): string | null {
  if (timeframe === 'ALL') return null;
  const msMap: Record<LeaderboardTimeframe, number> = {
    '24H': 86_400_000,
    '7D': 7 * 86_400_000,
    '30D': 30 * 86_400_000,
    ALL: 0,
  };
  return new Date(Date.now() - msMap[timeframe]).toISOString();
}

const RPC_MAP: Record<LeaderboardCategory, string | null> = {
  overall:   'get_overall_leaderboard',
  games:     'get_games_leaderboard',
  pulse:     'get_pulse_leaderboard',
  trading:   null,
  community: 'get_community_leaderboard',
  dworld:    'get_dworld_leaderboard',
  launchpad: 'get_launchpad_leaderboard',
};

// ─── Public API ───────────────────────────────────────────────────────────────

export async function fetchLeaderboard(
  category: LeaderboardCategory,
  timeframe: LeaderboardTimeframe,
  limit = 50,
): Promise<LeaderboardEntry[]> {
  const fn = RPC_MAP[category];
  if (!fn) return [];

  const since = getSinceTs(timeframe);

  const { data, error } = await supabase.rpc(fn, {
    since_ts: since,
    lim: limit,
  });

  if (error) {
    console.error(`[Leaderboard] ${fn} error:`, error.message);
    return [];
  }

  return ((data as LeaderboardEntry[]) || []).map(row => ({
    ...row,
    // Coerce numeric strings from Postgres to JS numbers
    ...(('best_score' in row) && { best_score: Number(row.best_score), total_games: Number(row.total_games) }),
    ...(('dawen_score' in row) && { dawen_score: Number((row as OverallEntry).dawen_score) }),
    ...(('total_earned' in row) && { total_earned: Number((row as DworldEntry).total_earned) }),
    ...(('pulse_score_pts' in row) && { pulse_score_pts: Number((row as PulseEntry).pulse_score_pts) }),
    ...(('post_count' in row) && { post_count: Number((row as PulseEntry).post_count), follower_count: Number((row as PulseEntry).follower_count) }),
    ...(('referral_count' in row) && { referral_count: Number((row as CommunityEntry).referral_count) }),
    ...(('total_launches' in row) && { total_launches: Number((row as LaunchpadEntry).total_launches) }),
  }));
}

export function getPrimaryScore(entry: LeaderboardEntry, category: LeaderboardCategory): number {
  switch (category) {
    case 'overall':   return Number((entry as OverallEntry).dawen_score) || 0;
    case 'games':     return Number((entry as GamesEntry).best_score) || 0;
    case 'pulse':     return Number((entry as PulseEntry).pulse_score_pts) || 0;
    case 'community': return Number((entry as CommunityEntry).community_score_pts) || 0;
    case 'dworld':    return Number((entry as DworldEntry).total_earned) || 0;
    case 'launchpad': return Number((entry as LaunchpadEntry).total_launches) || 0;
    default:          return 0;
  }
}

export function formatScore(score: number, category: LeaderboardCategory): string {
  if (category === 'dworld') {
    if (score >= 1_000_000) return `${(score / 1_000_000).toFixed(1)}M DWORLD`;
    if (score >= 1_000) return `${(score / 1_000).toFixed(1)}K DWORLD`;
    return `${score} DWORLD`;
  }
  if (category === 'launchpad') return `${score} ${score === 1 ? 'token' : 'tokens'}`;
  if (score >= 1_000_000) return `${(score / 1_000_000).toFixed(1)}M`;
  if (score >= 1_000) return `${(score / 1_000).toFixed(1)}K`;
  return String(Math.round(score));
}
