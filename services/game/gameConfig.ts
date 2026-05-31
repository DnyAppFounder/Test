import { TREASURY_WALLET } from '@/services/treasuryService';

// Game treasury receives all entry payments — same wallet the app already uses
export const GAME_TREASURY_WALLET = TREASURY_WALLET;

// Platform fee: 500 bps = 5%
export const GAME_PLATFORM_FEE_BPS = 500;

export const ENTRY_AMOUNTS_SOL = [0.01, 0.05, 0.1] as const;
export type EntrySol = (typeof ENTRY_AMOUNTS_SOL)[number];

export const GAME_DURATION_MS = 60_000; // 1 minute (Dawen Rush)
export const MAX_SCORE = 10_000_000; // No practical cap — save real scores
export const PLAYER_LIVES = 3;

// Scoring formula constants
export const ORB_SCORE     = 120;
export const COMBO_SCORE   = 40;
export const SURVIVAL_DIV  = 100;   // ms per point
export const TRAP_PENALTY  = 250;
export const OBSTACLE_PENALTY = 150;

export function computePlatformFee(totalPotSol: number): number {
  return totalPotSol * (GAME_PLATFORM_FEE_BPS / 10_000);
}

export function computeWinnerPayout(entry1Sol: number, entry2Sol: number): {
  totalPot: number;
  platformFee: number;
  winnerPayout: number;
} {
  const totalPot = entry1Sol + entry2Sol;
  const platformFee = computePlatformFee(totalPot);
  const winnerPayout = totalPot - platformFee;
  return { totalPot, platformFee, winnerPayout };
}

export function computeScore(params: {
  orbsCollected: number;
  totalSpawnedOrbs: number;
  maxCombo: number;
  survivalTimeMs: number;
  trapsHit: number;
  obstaclesHit: number;
}): number {
  const { orbsCollected, totalSpawnedOrbs, maxCombo, survivalTimeMs, trapsHit, obstaclesHit } = params;
  const baseScore = orbsCollected * ORB_SCORE;
  const comboBonus = maxCombo * COMBO_SCORE;
  const survivalBonus = Math.floor(survivalTimeMs / SURVIVAL_DIV);
  const accuracy = orbsCollected / Math.max(1, totalSpawnedOrbs);
  const penalty = trapsHit * TRAP_PENALTY + obstaclesHit * OBSTACLE_PENALTY;
  const raw = (baseScore + comboBonus + survivalBonus) * accuracy - penalty;
  return Math.max(0, Math.round(raw));
}
