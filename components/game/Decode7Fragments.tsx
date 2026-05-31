import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  useWindowDimensions,
} from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { colors, spacing, borderRadius, fontSize } from '@/constants/theme';
import type { UnifiedGameResult } from '@/services/game/gameTypes';
import type { GameMode } from './GameModeSelector';

// ─── Grid dimensions ─────────────────────────────────────────────────────────
// 18×18 gives DECENTRALIZATION (16 chars) enough room to be placed without
// dominating the entire grid. Larger grid = more placement freedom for all words.
const ROWS = 18;
const COLS = 18;

// ─── Timer ───────────────────────────────────────────────────────────────────
const GAME_DURATION_MS = 300_000; // 5 minutes

// ─── Anti-cheat ──────────────────────────────────────────────────────────────
// Finding all 7 words in under 15 seconds is not humanly possible — flag as suspicious.
const MIN_COMPLETION_MS = 15_000;

// ─── Official lore words — Free Practice only, NEVER rotates ─────────────────
const LORE_WORDS: string[] = [
  'DECENTRALIZATION',
  'DETERMINATION',
  'DIGITALERA',   // displayed as "DIGITAL ERA"
  'DOMINANCE',
  'DISRUPTION',
  'DESTINY',
  'DYNASTY',
];

// Stable seed for Free Practice — same grid every time so it feels like
// an "official stone tablet" rather than a random puzzle.
export const FREE_PRACTICE_SEED = 'DAWEN_LORE_SEED_V1';

// ─── Rotating pool — Ranked Practice + SOL Duel only ─────────────────────────
const ROTATING_POOL: string[] = [
  'DAWEN', 'DYNASTY', 'DESTINY', 'DIGITALERA', 'DETERMINATION',
  'DOMINANCE', 'DISRUPTION', 'DECENTRALIZATION', 'FRAGMENT', 'PILLAR',
  'TREASURE', 'LEGACY', 'CREW', 'WORLD', 'POWER', 'KING', 'OATH',
  'CODE', 'RELIC', 'CROWN', 'ERA', 'QUEST', 'AWAKENING', 'BUILDER',
  'ORDER', 'TRUTH', 'COLLAPSE', 'SYSTEM', 'DYNASTYCODE', 'WILLOFD',
];

// Display overrides for words that contain spaces or need formatting
const WORD_DISPLAY_OVERRIDE: Record<string, string> = {
  DIGITALERA:  'DIGITAL ERA',
  DYNASTYCODE: 'DYNASTY CODE',
  WILLOFD:     'WILL OF D',
};

function getDisplayName(word: string): string {
  return WORD_DISPLAY_OVERRIDE[word] ?? word;
}

// ─── Directions ───────────────────────────────────────────────────────────────
const DIRS: [number, number][] = [
  [0, 1], [0, -1], [1, 0], [-1, 0],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

// ─── Seeded RNG ───────────────────────────────────────────────────────────────
function makeRng(seed: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 0x01000193);
  let s = (h >>> 0) || 1;
  return () => {
    s ^= s << 13; s ^= s >> 17; s ^= s << 5;
    return (s >>> 0) / 0x100000000;
  };
}

// ─── Word selection ───────────────────────────────────────────────────────────
// Free Practice: always the official 7 lore words.
// Ranked/SOL Duel: pick 7 from the rotating pool deterministically from seed.
function getActiveWords(mode: GameMode, seed: string): string[] {
  if (mode === 'free') return [...LORE_WORDS];
  const rng = makeRng(`ws-${seed}`);
  const pool = [...ROTATING_POOL];
  const selected: string[] = [];
  while (selected.length < 7 && pool.length > 0) {
    const i = Math.floor(rng() * pool.length);
    selected.push(pool.splice(i, 1)[0]);
  }
  return selected;
}

// ─── Puzzle ID ────────────────────────────────────────────────────────────────
// Free Practice: stable ID that never changes.
// Ranked/SOL Duel: rotates every 2 hours based on time bucket.
function getPuzzleId(mode: GameMode, seed: string): string {
  if (mode === 'free') return 'decode-lore-v1';
  return `decode-${mode}-${seed}`;
}

// ─── Grid builder ─────────────────────────────────────────────────────────────
interface WordPosition { word: string; row: number; col: number; dr: number; dc: number; }

function buildGrid(seed: string, words: string[]): { grid: string[][]; positions: WordPosition[] } {
  const rng = makeRng(seed);
  const grid: string[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(''));
  const positions: WordPosition[] = [];

  for (const word of words) {
    let placed = false;
    for (let attempt = 0; attempt < 500 && !placed; attempt++) {
      const [dr, dc] = DIRS[Math.floor(rng() * DIRS.length)];
      const row = Math.floor(rng() * ROWS);
      const col = Math.floor(rng() * COLS);
      const endRow = row + dr * (word.length - 1);
      const endCol = col + dc * (word.length - 1);
      if (endRow < 0 || endRow >= ROWS || endCol < 0 || endCol >= COLS) continue;
      let ok = true;
      for (let i = 0; i < word.length; i++) {
        const r = row + dr * i, c = col + dc * i;
        if (grid[r][c] !== '' && grid[r][c] !== word[i]) { ok = false; break; }
      }
      if (!ok) continue;
      for (let i = 0; i < word.length; i++) grid[row + dr * i][col + dc * i] = word[i];
      positions.push({ word, row, col, dr, dc });
      placed = true;
    }
  }

  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (grid[r][c] === '') grid[r][c] = LETTERS[Math.floor(rng() * LETTERS.length)];

  return { grid, positions };
}

// ─── Geometry helper ──────────────────────────────────────────────────────────
function getCells(r1: number, c1: number, r2: number, c2: number): [number, number][] | null {
  const dr = r2 - r1, dc = c2 - c1;
  if (dr === 0 && dc === 0) return null;
  const len = Math.max(Math.abs(dr), Math.abs(dc));
  const normDr = dr / len, normDc = dc / len;
  if (!Number.isInteger(normDr) || !Number.isInteger(normDc)) return null;
  const cells: [number, number][] = [];
  for (let i = 0; i <= len; i++) cells.push([r1 + normDr * i, c1 + normDc * i]);
  return cells;
}

// ─── Component ────────────────────────────────────────────────────────────────
interface Props {
  seed: string;
  mode: GameMode;
  entryId?: string;
  matchId?: string;
  onGameEnd: (result: UnifiedGameResult) => void;
  onBack?: () => void;
}

export function Decode7Fragments({ seed, mode, matchId, onGameEnd, onBack }: Props) {
  const { width: sw } = useWindowDimensions();
  // Size cells to fit the 18-column grid in available width
  const cellSize = Math.min(Math.floor((Math.min(sw - 32, 460)) / COLS), 26);

  // Derive active words + puzzle components from mode + seed
  const activeWords  = useMemo(() => getActiveWords(mode, seed), [mode, seed]);
  const puzzleId     = useMemo(() => getPuzzleId(mode, seed), [mode, seed]);
  const { grid, positions } = useMemo(() => buildGrid(seed, activeWords), [seed, activeWords]);

  // ── Game state ──────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<'countdown' | 'playing' | 'ended'>('countdown');
  const [countdown, setCountdown] = useState(3);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION_MS / 1000);
  const [score, setScore] = useState(0);
  const [foundWords, setFoundWords] = useState<Set<string>>(new Set());
  const [mistakes, setMistakes] = useState(0);
  const [selStart, setSelStart] = useState<[number, number] | null>(null);
  const [selEnd, setSelEnd] = useState<[number, number] | null>(null);
  const [flash, setFlash] = useState<{ cells: string; success: boolean } | null>(null);
  // true when timer expired before all words found
  const [timedOut, setTimedOut] = useState(false);

  // Refs: mutable values used inside timer/callbacks without triggering re-renders
  const phaseRef     = useRef<'countdown' | 'playing' | 'ended'>('countdown');
  const scoreRef     = useRef(0);
  const foundRef     = useRef<Set<string>>(new Set());
  const mistakesRef  = useRef(0);
  const startTimeRef = useRef(0);
  const sessionId    = useRef(`dec-${seed}-${Date.now()}`).current;
  phaseRef.current   = phase;

  // ── Countdown: 3 → 2 → 1 → GO → playing ────────────────────────────────────
  useEffect(() => {
    if (phase !== 'countdown') return;
    if (countdown <= 0) {
      setPhase('playing');
      startTimeRef.current = Date.now();
      return;
    }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown, phase]);

  // ── 3-minute countdown timer ─────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'playing') return;
    const iv = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const tLeft = Math.max(0, (GAME_DURATION_MS - elapsed) / 1000);
      setTimeLeft(Math.ceil(tLeft));
      if (elapsed >= GAME_DURATION_MS) {
        clearInterval(iv);
        endGame(false, true); // timed out
      }
    }, 500);
    return () => clearInterval(iv);
  }, [phase]);

  // ── End game ──────────────────────────────────────────────────────────────────
  const endGame = useCallback((allFound: boolean, expired = false) => {
    if (phaseRef.current === 'ended') return;
    setPhase('ended');
    if (expired) setTimedOut(true);

    const elapsed = startTimeRef.current > 0 ? Date.now() - startTimeRef.current : GAME_DURATION_MS;
    const completionMs = allFound ? elapsed : GAME_DURATION_MS;

    // Anti-cheat: flag suspiciously fast completions
    const suspicious = allFound && elapsed < MIN_COMPLETION_MS;

    const base = foundRef.current.size * 500;
    const speedBonus = allFound && !suspicious
      ? Math.round(Math.max(0, (GAME_DURATION_MS - elapsed) / 1000) * 15)
      : 0;
    const mistakePenalty = mistakesRef.current * 20;
    const finalScore = Math.max(0, base + speedBonus - mistakePenalty);

    onGameEnd({
      score: finalScore,
      sessionId,
      survivalTimeMs: elapsed,
      completionTimeMs: completionMs,
      orbsCollected: 0, trapsHit: 0, obstaclesHit: 0, comboMax: 0,
      accuracy: foundRef.current.size / activeWords.length,
      hits: 0, misses: 0, distanceUnits: 0, pairsFound: 0,
      fragmentsFound: foundRef.current.size,
      mistakes: mistakesRef.current,
      suspicious,
      timedOut: expired,
    });
  }, [onGameEnd, sessionId, activeWords]);

  // ── Cell press handler ────────────────────────────────────────────────────────
  const handleCellPress = useCallback((row: number, col: number) => {
    // Block input during countdown or after game ends
    if (phaseRef.current !== 'playing') return;

    if (!selStart) {
      setSelStart([row, col]);
      setSelEnd(null);
      return;
    }

    // Second tap — evaluate the selected range
    const [r1, c1] = selStart;
    if (r1 === row && c1 === col) { setSelStart(null); setSelEnd(null); return; }

    const cells = getCells(r1, c1, row, col);
    if (!cells) { setSelStart([row, col]); setSelEnd(null); return; }

    const selectedWord = cells.map(([r, c]) => grid[r][c]).join('');
    const reversed = [...selectedWord].reverse().join('');
    const matched = activeWords.find(w => w === selectedWord || w === reversed);
    const cellKey = cells.map(([r, c]) => `${r},${c}`).join('|');

    if (matched && !foundRef.current.has(matched)) {
      foundRef.current.add(matched);
      setFoundWords(new Set(foundRef.current));
      const gained = 500 + Math.round(Math.max(0, timeLeft) * 3);
      scoreRef.current += gained;
      setScore(scoreRef.current);
      setFlash({ cells: cellKey, success: true });
      setTimeout(() => setFlash(null), 700);
      if (foundRef.current.size === activeWords.length) endGame(true, false);
    } else {
      mistakesRef.current++;
      setMistakes(m => m + 1);
      setFlash({ cells: cellKey, success: false });
      setTimeout(() => setFlash(null), 500);
    }

    setSelStart(null);
    setSelEnd(null);
  }, [selStart, grid, timeLeft, endGame, activeWords]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  // ── Derived cell sets ─────────────────────────────────────────────────────────
  const selectedCellSet = useMemo(() => {
    if (!selStart) return new Set<string>();
    const set = new Set<string>();
    set.add(`${selStart[0]},${selStart[1]}`);
    if (selEnd) {
      const cells = getCells(selStart[0], selStart[1], selEnd[0], selEnd[1]);
      cells?.forEach(([r, c]) => set.add(`${r},${c}`));
    }
    return set;
  }, [selStart, selEnd]);

  const foundCellSet = useMemo(() => {
    const set = new Set<string>();
    for (const pos of positions) {
      if (foundRef.current.has(pos.word)) {
        for (let i = 0; i < pos.word.length; i++)
          set.add(`${pos.row + pos.dr * i},${pos.col + pos.dc * i}`);
      }
    }
    return set;
  }, [foundWords, positions]);

  const flashCellSet = useMemo(() => {
    if (!flash) return new Set<string>();
    return new Set(flash.cells.split('|'));
  }, [flash]);

  // ── Puzzle label for ranked/duel ──────────────────────────────────────────────
  const puzzleLabel = mode === 'free'
    ? 'Official Lore Fragment'
    : `Puzzle ${puzzleId.split('-').pop()?.slice(-4).toUpperCase() ?? ''}`;

  return (
    <View style={styles.container}>
      {/* HUD */}
      {phase === 'playing' && (
        <View style={styles.hud}>
          <View style={styles.hudItem}>
            <Text style={[styles.hudVal, { color: timeLeft <= 30 ? '#F87171' : timeLeft <= 60 ? '#F59E0B' : colors.textPrimary }]}>
              {formatTime(timeLeft)}
            </Text>
            <Text style={styles.hudLabel}>TIME</Text>
          </View>
          <View style={styles.hudItem}>
            <Text style={[styles.hudVal, { color: '#EC4899' }]}>{score.toLocaleString()}</Text>
            <Text style={styles.hudLabel}>SCORE</Text>
          </View>
          <View style={styles.hudItem}>
            <Text style={[styles.hudVal, { color: '#F472B6' }]}>{foundWords.size}/{activeWords.length}</Text>
            <Text style={styles.hudLabel}>FOUND</Text>
          </View>
          <View style={styles.hudItem}>
            <Text style={[styles.hudVal, { color: mistakes > 5 ? '#F87171' : colors.textPrimary }]}>{mistakes}</Text>
            <Text style={styles.hudLabel}>ERRORS</Text>
          </View>
        </View>
      )}

      {/* Back button — below HUD, outside puzzle grid */}
      {onBack && phase === 'playing' && (
        <TouchableOpacity style={styles.backRow} onPress={onBack} activeOpacity={0.75} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <ArrowLeft size={14} color="rgba(255,255,255,0.55)" strokeWidth={2.5} />
          <Text style={styles.backRowText}>Back</Text>
        </TouchableOpacity>
      )}

      {/* Puzzle mode label */}
      {phase === 'playing' && (
        <Text style={styles.puzzleLabel}>{puzzleLabel}</Text>
      )}

      {/* Touch instruction */}
      {phase === 'playing' && !selStart && (
        <Text style={styles.hint}>Tap first letter, then tap last letter of a hidden word</Text>
      )}
      {phase === 'playing' && selStart && (
        <Text style={[styles.hint, { color: '#F472B6' }]}>
          Start locked — tap the last letter of the word
        </Text>
      )}

      {/* Grid */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.grid}>
          {grid.map((row, r) => (
            <View key={r} style={styles.row}>
              {row.map((letter, c) => {
                const key = `${r},${c}`;
                const isFound = foundCellSet.has(key);
                const isSel = selectedCellSet.has(key);
                const isFlash = flashCellSet.has(key);
                const isStart = selStart && selStart[0] === r && selStart[1] === c;
                return (
                  <TouchableOpacity
                    key={c}
                    onPress={() => handleCellPress(r, c)}
                    onPressIn={() => { if (selStart) setSelEnd([r, c]); }}
                    disabled={phase !== 'playing'}
                  >
                    <View style={[
                      styles.cell,
                      { width: cellSize, height: cellSize },
                      isFound && styles.cellFound,
                      isSel && !isFound && styles.cellSelected,
                      isStart && styles.cellStart,
                      isFlash && (flash?.success ? styles.cellFlashOk : styles.cellFlashErr),
                    ]}>
                      <Text style={[
                        styles.cellText,
                        { fontSize: Math.max(7, cellSize * 0.44) },
                        isFound && styles.cellTextFound,
                        (isSel || isStart) && styles.cellTextSel,
                        isFlash && (flash?.success ? styles.cellTextFlashOk : styles.cellTextFlashErr),
                      ]}>
                        {letter}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Word list */}
      {phase === 'playing' && (
        <View style={styles.wordList}>
          {activeWords.map(w => (
            <View key={w} style={[styles.wordPill, foundWords.has(w) && styles.wordPillFound]}>
              <Text style={[styles.wordText, foundWords.has(w) && styles.wordTextFound]}>
                {getDisplayName(w)}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Countdown overlay */}
      {phase === 'countdown' && (
        <View style={styles.overlay}>
          <Text style={styles.countdownNum}>{countdown > 0 ? countdown : 'GO!'}</Text>
          <Text style={styles.countdownSub}>
            {mode === 'free' ? 'Find the 7 official DAWEN fragments!' : 'Find all 7 hidden words!'}
          </Text>
          <Text style={styles.countdownTimer}>3:00</Text>
        </View>
      )}

      {/* Time expired overlay */}
      {phase === 'ended' && timedOut && (
        <View style={[styles.endBox, styles.endBoxExpired]}>
          <Text style={styles.endTitleExpired}>Time's Up!</Text>
          <Text style={styles.endSub}>
            {foundWords.size}/{activeWords.length} fragments found
          </Text>
          <Text style={styles.endCalculating}>Calculating score…</Text>
        </View>
      )}

      {/* Completed overlay */}
      {phase === 'ended' && !timedOut && (
        <View style={styles.endBox}>
          <Text style={styles.endTitle}>All Found!</Text>
          <Text style={styles.endSub}>Calculating score…</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: spacing.sm },
  hud: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    alignSelf: 'stretch',
    justifyContent: 'space-around',
  },
  hudItem: { alignItems: 'center', minWidth: 54 },
  hudVal: { fontSize: fontSize.lg, fontWeight: '900', color: colors.textPrimary },
  hudLabel: { fontSize: 9, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.8 },
  puzzleLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: 'rgba(244,114,182,0.5)',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  hint: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '500',
    textAlign: 'center',
  },
  grid: { gap: 2 },
  row: { flexDirection: 'row', gap: 2 },
  cell: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  cellFound: {
    backgroundColor: 'rgba(244,114,182,0.25)',
    borderColor: 'rgba(244,114,182,0.5)',
  },
  cellSelected: {
    backgroundColor: 'rgba(244,114,182,0.15)',
    borderColor: 'rgba(244,114,182,0.35)',
  },
  cellStart: {
    backgroundColor: 'rgba(236,72,153,0.35)',
    borderColor: '#EC4899',
  },
  cellFlashOk: {
    backgroundColor: 'rgba(52,211,153,0.4)',
    borderColor: '#34D399',
  },
  cellFlashErr: {
    backgroundColor: 'rgba(248,113,113,0.4)',
    borderColor: '#F87171',
  },
  cellText: {
    fontWeight: '700',
    color: 'rgba(255,255,255,0.75)',
    letterSpacing: 0,
  },
  cellTextFound: { color: '#F472B6', fontWeight: '800' },
  cellTextSel: { color: '#F472B6', fontWeight: '800' },
  cellTextFlashOk: { color: '#34D399' },
  cellTextFlashErr: { color: '#F87171' },
  wordList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  wordPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  wordPillFound: {
    backgroundColor: 'rgba(244,114,182,0.15)',
    borderColor: 'rgba(244,114,182,0.4)',
  },
  wordText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.textMuted },
  wordTextFound: { color: '#F472B6', textDecorationLine: 'line-through' },
  overlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.82)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: borderRadius.xl,
  },
  countdownNum: { fontSize: 72, fontWeight: '900', color: '#EC4899' },
  countdownSub: { fontSize: fontSize.md, fontWeight: '600', color: colors.textMuted, textAlign: 'center', paddingHorizontal: spacing.xl },
  countdownTimer: { fontSize: fontSize.sm, fontWeight: '700', color: 'rgba(244,114,182,0.5)', letterSpacing: 2 },
  endBox: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl },
  endBoxExpired: { gap: spacing.xs },
  endTitle: { fontSize: fontSize.xxl, fontWeight: '900', color: '#34D399' },
  endTitleExpired: { fontSize: fontSize.xxl, fontWeight: '900', color: '#F87171' },
  endSub: { fontSize: fontSize.md, color: colors.textSecondary, fontWeight: '600' },
  endCalculating: { fontSize: fontSize.sm, color: colors.textMuted, fontWeight: '500', marginTop: 4 },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  backRowText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.55)',
  },
});
