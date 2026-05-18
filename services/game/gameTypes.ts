// Shared types for the multi-game system.
// All game arenas produce a UnifiedGameResult that maps to GameResultInput.

export type GameId =
  | 'dawen_rush'
  | 'dawen_aim_duel'
  | 'dawen_runner'
  | 'dawen_memory'
  | 'decode_7_fragments';

export type GameMode = 'free' | 'ranked' | 'sol_duel';

export interface GameDefinition {
  id: GameId;
  name: string;
  tagline: string;
  description: string;
  color: string;
  accentColor: string;
  maxScore: number;
  durationMs: number;
}

export const GAME_DEFINITIONS: GameDefinition[] = [
  {
    id: 'dawen_rush',
    name: 'Dawen Rush',
    tagline: 'Collect. Dodge. Dominate.',
    description: 'Navigate the arena, collect orbs and dodge traps in 45 seconds.',
    color: '#8B5CF6',
    accentColor: '#A78BFA',
    maxScore: 10_000,
    durationMs: 45_000,
  },
  {
    id: 'dawen_aim_duel',
    name: 'Aim Duel',
    tagline: 'Tap fast. Hit true.',
    description: 'Tap targets before they vanish. Speed and accuracy decide the winner.',
    color: '#F59E0B',
    accentColor: '#FCD34D',
    maxScore: 10_000,
    durationMs: 30_000,
  },
  {
    id: 'dawen_runner',
    name: 'Runner',
    tagline: 'Run. Jump. Survive.',
    description: 'Dodge obstacles, collect coins and survive as long as possible.',
    color: '#10B981',
    accentColor: '#34D399',
    maxScore: 10_000,
    durationMs: 60_000,
  },
  {
    id: 'dawen_memory',
    name: 'Memory Duel',
    tagline: 'Flip. Match. Win.',
    description: 'Find all matching pairs before time runs out.',
    color: '#3B82F6',
    accentColor: '#60A5FA',
    maxScore: 10_000,
    durationMs: 180_000,
  },
  {
    id: 'decode_7_fragments',
    name: 'Decode 7 Fragments',
    tagline: 'Find the seven hidden words.',
    description: 'Hunt down 7 DAWEN words hidden in an ancient stone tablet.',
    color: '#EC4899',
    accentColor: '#F472B6',
    maxScore: 10_000,
    durationMs: 300_000,
  },
];

export function getGameDef(id: GameId): GameDefinition {
  return GAME_DEFINITIONS.find(g => g.id === id) ?? GAME_DEFINITIONS[0];
}

// Unified result produced by every game arena.
// Maps directly to the GameResultInput fields plus game-specific extras.
export interface UnifiedGameResult {
  score: number;
  sessionId: string;
  // Time metrics
  survivalTimeMs: number;
  completionTimeMs: number;
  // Dawen Rush fields
  orbsCollected: number;
  trapsHit: number;
  obstaclesHit: number;
  comboMax: number;
  accuracy: number;
  // Aim Duel
  hits: number;
  misses: number;
  // Runner
  distanceUnits: number;
  // Memory Duel
  pairsFound: number;
  // Decode 7 Fragments
  fragmentsFound: number;
  mistakes: number;
}

export function emptyResult(sessionId: string, survivalTimeMs = 0): UnifiedGameResult {
  return {
    score: 0, sessionId,
    survivalTimeMs, completionTimeMs: 0,
    orbsCollected: 0, trapsHit: 0, obstaclesHit: 0, comboMax: 0, accuracy: 0,
    hits: 0, misses: 0,
    distanceUnits: 0,
    pairsFound: 0,
    fragmentsFound: 0, mistakes: 0,
  };
}
