import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, borderRadius, fontSize } from '@/constants/theme';
import type { UnifiedGameResult } from '@/services/game/gameTypes';
import type { GameMode } from './GameModeSelector';

const ROWS = 16;
const COLS = 16;
const GAME_DURATION_MS = 300_000; // 5 minutes
// DECENTRALIZATION placed first to give it priority in the 16×16 grid (it fills a full row/column).
// DIGITALERA appears as "DIGITAL ERA" in the UI via WORD_DISPLAY.
const WORDS = [
  'DECENTRALIZATION',
  'DETERMINATION',
  'DIGITALERA',
  'DOMINANCE',
  'DISRUPTION',
  'DESTINY',
  'DYNASTY',
] as const;
type Word = typeof WORDS[number];

const WORD_DISPLAY: Record<Word, string> = {
  DECENTRALIZATION: 'DECENTRALIZATION',
  DETERMINATION:    'DETERMINATION',
  DIGITALERA:       'DIGITAL ERA',
  DOMINANCE:        'DOMINANCE',
  DISRUPTION:       'DISRUPTION',
  DESTINY:          'DESTINY',
  DYNASTY:          'DYNASTY',
};

const DIRS: [number, number][] = [
  [0, 1], [0, -1], [1, 0], [-1, 0],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

interface WordPosition { word: Word; row: number; col: number; dr: number; dc: number; }

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

// ─── Build grid ───────────────────────────────────────────────────────────────
function buildGrid(seed: string): { grid: string[][]; positions: WordPosition[] } {
  const rng = makeRng(seed);
  const grid: string[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(''));
  const positions: WordPosition[] = [];

  for (const word of WORDS) {
    let placed = false;
    for (let attempt = 0; attempt < 300 && !placed; attempt++) {
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

// ─── Geometry helpers ─────────────────────────────────────────────────────────
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

interface Props {
  seed: string;
  mode: GameMode;
  entryId?: string;
  matchId?: string;
  onGameEnd: (result: UnifiedGameResult) => void;
}

export function Decode7Fragments({ seed, mode, onGameEnd }: Props) {
  const { width: sw } = useWindowDimensions();
  const cellSize = Math.min(Math.floor((Math.min(sw - 32, 460)) / COLS), 30);

  const { grid, positions } = useMemo(() => buildGrid(seed), [seed]);

  const [phase, setPhase] = useState<'countdown' | 'playing' | 'ended'>('countdown');
  const [countdown, setCountdown] = useState(3);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION_MS / 1000);
  const [score, setScore] = useState(0);
  const [foundWords, setFoundWords] = useState<Set<Word>>(new Set());
  const [mistakes, setMistakes] = useState(0);
  const [selStart, setSelStart] = useState<[number, number] | null>(null);
  const [selEnd, setSelEnd] = useState<[number, number] | null>(null);
  const [flash, setFlash] = useState<{ cells: string; success: boolean } | null>(null);

  const phaseRef = useRef<'countdown' | 'playing' | 'ended'>('countdown');
  const scoreRef = useRef(0);
  const foundRef = useRef<Set<Word>>(new Set());
  const mistakesRef = useRef(0);
  const startTimeRef = useRef(0);
  const sessionId = useRef(`dec-${seed}-${Date.now()}`).current;
  phaseRef.current = phase;

  // Countdown
  useEffect(() => {
    if (phase !== 'countdown') return;
    if (countdown <= 0) { setPhase('playing'); startTimeRef.current = Date.now(); return; }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown, phase]);

  // Timer
  useEffect(() => {
    if (phase !== 'playing') return;
    const iv = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const tLeft = Math.max(0, (GAME_DURATION_MS - elapsed) / 1000);
      setTimeLeft(Math.ceil(tLeft));
      if (elapsed >= GAME_DURATION_MS) { clearInterval(iv); endGame(false); }
    }, 500);
    return () => clearInterval(iv);
  }, [phase]);

  const endGame = useCallback((allFound: boolean) => {
    if (phaseRef.current === 'ended') return;
    setPhase('ended');
    const elapsed = startTimeRef.current > 0 ? Date.now() - startTimeRef.current : GAME_DURATION_MS;
    const base = foundRef.current.size * 500;
    const speedBonus = allFound ? Math.round(Math.max(0, (GAME_DURATION_MS - elapsed) / 1000) * 15) : 0;
    const mistakePenalty = mistakesRef.current * 20;
    const finalScore = Math.min(10_000, Math.max(0, base + speedBonus - mistakePenalty));
    onGameEnd({
      score: finalScore, sessionId,
      survivalTimeMs: elapsed,
      completionTimeMs: allFound ? elapsed : GAME_DURATION_MS,
      orbsCollected: 0, trapsHit: 0, obstaclesHit: 0, comboMax: 0,
      accuracy: foundRef.current.size / WORDS.length,
      hits: 0, misses: 0, distanceUnits: 0, pairsFound: 0,
      fragmentsFound: foundRef.current.size,
      mistakes: mistakesRef.current,
    });
  }, [onGameEnd, sessionId]);

  const handleCellPress = useCallback((row: number, col: number) => {
    if (phaseRef.current !== 'playing') return;

    if (!selStart) {
      setSelStart([row, col]);
      setSelEnd(null);
      return;
    }

    // Second tap — evaluate selection
    const [r1, c1] = selStart;
    if (r1 === row && c1 === col) { setSelStart(null); setSelEnd(null); return; }

    const cells = getCells(r1, c1, row, col);
    if (!cells) { setSelStart([row, col]); setSelEnd(null); return; }

    const selectedWord = cells.map(([r, c]) => grid[r][c]).join('');
    const reversed = [...selectedWord].reverse().join('');
    const matched = WORDS.find(w => w === selectedWord || w === reversed);
    const cellKey = cells.map(([r, c]) => `${r},${c}`).join('|');

    if (matched && !foundRef.current.has(matched)) {
      foundRef.current.add(matched);
      setFoundWords(new Set(foundRef.current));
      const gained = 500 + Math.round(Math.max(0, timeLeft) * 3);
      scoreRef.current += gained;
      setScore(scoreRef.current);
      setFlash({ cells: cellKey, success: true });
      setTimeout(() => setFlash(null), 700);
      if (foundRef.current.size === WORDS.length) endGame(true);
    } else {
      mistakesRef.current++;
      setMistakes(m => m + 1);
      setFlash({ cells: cellKey, success: false });
      setTimeout(() => setFlash(null), 500);
    }

    setSelStart(null);
    setSelEnd(null);
  }, [selStart, grid, timeLeft, endGame]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  // Compute highlighted cells
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

  // Found word cells
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

  return (
    <View style={styles.container}>
      {/* HUD */}
      {phase === 'playing' && (
        <View style={styles.hud}>
          <View style={styles.hudItem}>
            <Text style={[styles.hudVal, { color: timeLeft <= 60 ? '#F87171' : colors.textPrimary }]}>
              {formatTime(timeLeft)}
            </Text>
            <Text style={styles.hudLabel}>TIME</Text>
          </View>
          <View style={styles.hudItem}>
            <Text style={[styles.hudVal, { color: '#EC4899' }]}>{score.toLocaleString()}</Text>
            <Text style={styles.hudLabel}>SCORE</Text>
          </View>
          <View style={styles.hudItem}>
            <Text style={[styles.hudVal, { color: '#F472B6' }]}>{foundWords.size}/{WORDS.length}</Text>
            <Text style={styles.hudLabel}>FOUND</Text>
          </View>
          <View style={styles.hudItem}>
            <Text style={[styles.hudVal, { color: mistakes > 5 ? '#F87171' : colors.textPrimary }]}>{mistakes}</Text>
            <Text style={styles.hudLabel}>ERRORS</Text>
          </View>
        </View>
      )}

      {/* Instructions */}
      {phase === 'playing' && !selStart && (
        <Text style={styles.hint}>Tap first letter, then tap last letter of a D-word</Text>
      )}
      {phase === 'playing' && selStart && (
        <Text style={[styles.hint, { color: '#F472B6' }]}>
          Start: [{selStart[0]},{selStart[1]}] — now tap the end letter
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
                        { fontSize: Math.max(8, cellSize * 0.45) },
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
          {WORDS.map(w => (
            <View key={w} style={[styles.wordPill, foundWords.has(w) && styles.wordPillFound]}>
              <Text style={[styles.wordText, foundWords.has(w) && styles.wordTextFound]}>
                {WORD_DISPLAY[w]}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Countdown */}
      {phase === 'countdown' && (
        <View style={styles.overlay}>
          <Text style={styles.countdownNum}>{countdown > 0 ? countdown : 'GO!'}</Text>
          <Text style={styles.countdownSub}>Find the 7 D-words!</Text>
        </View>
      )}

      {phase === 'ended' && (
        <View style={styles.endBox}>
          <Text style={styles.endTitle}>{foundWords.size === WORDS.length ? 'All Found!' : "Time's Up!"}</Text>
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
  hint: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '500',
    textAlign: 'center',
  },
  grid: { gap: 1 },
  row: { flexDirection: 'row', gap: 1 },
  cell: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
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
    color: colors.textSecondary,
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
    backgroundColor: 'rgba(0,0,0,0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: borderRadius.xl,
  },
  countdownNum: { fontSize: 72, fontWeight: '900', color: '#EC4899' },
  countdownSub: { fontSize: fontSize.lg, fontWeight: '600', color: colors.textMuted },
  endBox: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl },
  endTitle: { fontSize: fontSize.xxl, fontWeight: '900', color: '#EC4899' },
  endSub: { fontSize: fontSize.md, color: colors.textMuted, fontWeight: '600' },
});
