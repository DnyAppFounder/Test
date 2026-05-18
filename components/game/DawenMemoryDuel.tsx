import { useRef, useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Zap, Star, Triangle, Shield, Flame, Globe, Cpu, Gem,
} from 'lucide-react-native';
import { colors, spacing, borderRadius, fontSize } from '@/constants/theme';
import type { UnifiedGameResult } from '@/services/game/gameTypes';
import type { GameMode } from './GameModeSelector';

const GAME_DURATION_MS = 180_000; // 3 minutes
const GRID_SIZE = 4; // 4×4
const TOTAL_PAIRS = 8;
const FLIP_BACK_DELAY = 900; // ms before mismatched cards flip back

// ─── Symbol definitions ───────────────────────────────────────────────────────
const SYMBOLS = [
  { id: 0, Icon: Zap,      color: '#F59E0B', label: 'ZAP' },
  { id: 1, Icon: Star,     color: '#60A5FA', label: 'STAR' },
  { id: 2, Icon: Shield,   color: '#34D399', label: 'SHIELD' },
  { id: 3, Icon: Flame,    color: '#F87171', label: 'FLAME' },
  { id: 4, Icon: Globe,    color: '#A78BFA', label: 'GLOBE' },
  { id: 5, Icon: Cpu,      color: '#FB923C', label: 'CPU' },
  { id: 6, Icon: Gem,      color: '#E879F9', label: 'GEM' },
  { id: 7, Icon: Triangle, color: '#4ADE80', label: 'TRI' },
] as const;

// ─── Seeded shuffle ───────────────────────────────────────────────────────────
function makeRng(seed: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 0x01000193);
  let s = (h >>> 0) || 1;
  return () => {
    s ^= s << 13; s ^= s >> 17; s ^= s << 5;
    return (s >>> 0) / 0x100000000;
  };
}

function shuffleSeeded<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Card type ────────────────────────────────────────────────────────────────
interface Card {
  uid: number;       // unique per cell
  symbolId: number;  // 0-7
  flip: Animated.Value; // 0=face-down, 1=face-up (drives scaleX)
  isFlipped: boolean;
  isMatched: boolean;
}

interface Props {
  seed: string;
  mode: GameMode;
  entryId?: string;
  matchId?: string;
  onGameEnd: (result: UnifiedGameResult) => void;
}

export function DawenMemoryDuel({ seed, mode, onGameEnd }: Props) {
  const { width: sw } = useWindowDimensions();
  const cardSize = Math.min(Math.floor((Math.min(sw, 480) - 48) / GRID_SIZE), 80);

  const [phase, setPhase] = useState<'countdown' | 'playing' | 'ended'>('countdown');
  const [countdown, setCountdown] = useState(3);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION_MS / 1000);
  const [score, setScore] = useState(0);
  const [pairsFound, setPairsFound] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [cards, setCards] = useState<Card[]>([]);
  const [flippedUids, setFlippedUids] = useState<number[]>([]);
  const [locked, setLocked] = useState(false);

  const phaseRef = useRef<'countdown' | 'playing' | 'ended'>('countdown');
  const scoreRef = useRef(0);
  const pairsRef = useRef(0);
  const mistakesRef = useRef(0);
  const startTimeRef = useRef(0);
  const sessionId = useRef(`mem-${seed}-${Date.now()}`).current;
  phaseRef.current = phase;

  // Build shuffled deck
  useEffect(() => {
    const rng = makeRng(seed);
    const pairs = [...SYMBOLS.map(s => s.id), ...SYMBOLS.map(s => s.id)]; // 16 cards
    const shuffled = shuffleSeeded(pairs, rng);
    setCards(shuffled.map((symbolId, idx) => ({
      uid: idx,
      symbolId,
      flip: new Animated.Value(0),
      isFlipped: false,
      isMatched: false,
    })));
  }, [seed]);

  // Countdown
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

  // Game timer
  useEffect(() => {
    if (phase !== 'playing') return;
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const tLeft = Math.max(0, (GAME_DURATION_MS - elapsed) / 1000);
      setTimeLeft(Math.ceil(tLeft));
      if (elapsed >= GAME_DURATION_MS) {
        clearInterval(interval);
        endGame(false);
      }
    }, 250);
    return () => clearInterval(interval);
  }, [phase]);

  const endGame = useCallback((allPairsFound: boolean) => {
    if (phaseRef.current === 'ended') return;
    setPhase('ended');
    const elapsed = startTimeRef.current > 0 ? Date.now() - startTimeRef.current : GAME_DURATION_MS;
    // Score: base pairs * 500, speed bonus if all found, penalty for mistakes
    const pairScore = pairsRef.current * 500;
    const speedBonus = allPairsFound ? Math.round(Math.max(0, (GAME_DURATION_MS - elapsed) / 1000) * 20) : 0;
    const mistakePenalty = mistakesRef.current * 30;
    const finalScore = Math.min(10_000, Math.max(0, pairScore + speedBonus - mistakePenalty));
    onGameEnd({
      score: finalScore,
      sessionId,
      survivalTimeMs: elapsed,
      completionTimeMs: allPairsFound ? elapsed : GAME_DURATION_MS,
      orbsCollected: 0, trapsHit: 0, obstaclesHit: 0, comboMax: 0,
      accuracy: pairsRef.current / TOTAL_PAIRS,
      hits: 0, misses: 0, distanceUnits: 0,
      pairsFound: pairsRef.current,
      fragmentsFound: 0,
      mistakes: mistakesRef.current,
    });
  }, [onGameEnd, sessionId]);

  const flipCard = useCallback((card: Card, toValue: number, cb?: () => void) => {
    // Animate scaleX: 1→0 (first half) then 0→1 (second half via cb)
    Animated.timing(card.flip, {
      toValue,
      duration: 180,
      useNativeDriver: true,
    }).start(cb);
  }, []);

  const handleCardPress = useCallback((uid: number) => {
    if (phaseRef.current !== 'playing') return;
    if (locked) return;

    setCards(prev => {
      const card = prev.find(c => c.uid === uid);
      if (!card || card.isFlipped || card.isMatched) return prev;
      return prev;
    });

    setFlippedUids(prevFlipped => {
      const card = cards.find(c => c.uid === uid);
      if (!card || card.isFlipped || card.isMatched) return prevFlipped;
      if (prevFlipped.includes(uid)) return prevFlipped;

      // Flip this card up
      card.isFlipped = true;
      flipCard(card, 1);

      const newFlipped = [...prevFlipped, uid];

      if (newFlipped.length === 2) {
        setLocked(true);
        const [uid1, uid2] = newFlipped;
        const c1 = cards.find(c => c.uid === uid1)!;
        const c2 = cards.find(c => c.uid === uid2)!;

        if (c1.symbolId === c2.symbolId) {
          // Match!
          setTimeout(() => {
            setCards(prev => prev.map(c =>
              c.uid === uid1 || c.uid === uid2 ? { ...c, isMatched: true } : c
            ));
            pairsRef.current++;
            const newPairs = pairsRef.current;
            setPairsFound(newPairs);
            const gained = 500 + Math.round(Math.max(0, timeLeft - 10) * 2);
            scoreRef.current += gained;
            setScore(scoreRef.current);
            setLocked(false);
            if (newPairs === TOTAL_PAIRS) endGame(true);
          }, 300);
        } else {
          // Mismatch
          mistakesRef.current++;
          setMistakes(m => m + 1);
          setTimeout(() => {
            flipCard(c1, 0, () => { c1.isFlipped = false; });
            flipCard(c2, 0, () => { c2.isFlipped = false; });
            setCards(prev => prev.map(c =>
              c.uid === uid1 || c.uid === uid2 ? { ...c, isFlipped: false } : c
            ));
            setLocked(false);
          }, FLIP_BACK_DELAY);
        }
        return [];
      }

      return newFlipped;
    });
  }, [cards, locked, flipCard, endGame, timeLeft]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const timeColor = timeLeft <= 30 ? '#F87171' : timeLeft <= 60 ? '#F59E0B' : colors.textPrimary;

  return (
    <View style={styles.container}>
      {/* HUD */}
      {phase === 'playing' && (
        <View style={styles.hud}>
          <View style={styles.hudItem}>
            <Text style={[styles.hudVal, { color: timeColor }]}>{formatTime(timeLeft)}</Text>
            <Text style={styles.hudLabel}>TIME</Text>
          </View>
          <View style={styles.hudItem}>
            <Text style={[styles.hudVal, { color: '#60A5FA' }]}>{score.toLocaleString()}</Text>
            <Text style={styles.hudLabel}>SCORE</Text>
          </View>
          <View style={styles.hudItem}>
            <Text style={[styles.hudVal, { color: '#34D399' }]}>{pairsFound}/{TOTAL_PAIRS}</Text>
            <Text style={styles.hudLabel}>PAIRS</Text>
          </View>
          <View style={styles.hudItem}>
            <Text style={[styles.hudVal, { color: mistakes > 5 ? '#F87171' : colors.textPrimary }]}>{mistakes}</Text>
            <Text style={styles.hudLabel}>ERRORS</Text>
          </View>
        </View>
      )}

      {/* Grid */}
      <View style={[styles.grid, { width: cardSize * GRID_SIZE + spacing.xs * (GRID_SIZE - 1) }]}>
        {cards.map(card => {
          const sym = SYMBOLS[card.symbolId];
          const Icon = sym.Icon;
          // scaleX: 0=hidden (mid-flip), 1=full
          const scaleX = card.flip.interpolate({
            inputRange: [0, 0.5, 1],
            outputRange: [1, 0, 1],
          });
          const isFaceUp = card.isFlipped || card.isMatched;

          return (
            <TouchableOpacity
              key={card.uid}
              onPress={() => handleCardPress(card.uid)}
              activeOpacity={0.85}
              disabled={card.isMatched || phase !== 'playing'}
            >
              <Animated.View
                style={[
                  styles.card,
                  {
                    width: cardSize,
                    height: cardSize,
                    transform: [{ scaleX }],
                  },
                  card.isMatched && styles.cardMatched,
                  isFaceUp && !card.isMatched && styles.cardFlipped,
                ]}
              >
                {isFaceUp ? (
                  <LinearGradient
                    colors={[`${sym.color}33`, `${sym.color}11`]}
                    style={[StyleSheet.absoluteFill, { borderRadius: borderRadius.lg }]}
                  />
                ) : null}
                {isFaceUp ? (
                  <>
                    <Icon size={Math.round(cardSize * 0.38)} color={sym.color} strokeWidth={2} />
                    <Text style={[styles.cardLabel, { color: sym.color }]}>{sym.label}</Text>
                  </>
                ) : (
                  <View style={styles.cardBack}>
                    <Text style={styles.cardBackText}>D</Text>
                  </View>
                )}
                {card.isMatched && (
                  <View style={styles.matchedOverlay}>
                    <Text style={styles.matchTick}>✓</Text>
                  </View>
                )}
              </Animated.View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Countdown overlay */}
      {phase === 'countdown' && (
        <View style={styles.overlay}>
          <Text style={styles.countdownNum}>{countdown > 0 ? countdown : 'GO!'}</Text>
          <Text style={styles.countdownSub}>Memorize the pairs!</Text>
        </View>
      )}

      {phase === 'ended' && (
        <View style={styles.endBox}>
          <Text style={styles.endTitle}>{pairsFound === TOTAL_PAIRS ? 'Cleared!' : "Time's Up!"}</Text>
          <Text style={styles.endSub}>Calculating score…</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: spacing.md },
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    justifyContent: 'center',
  },
  card: {
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    borderColor: colors.surfaceBorder,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 2,
    overflow: 'hidden',
  },
  cardFlipped: {
    borderColor: 'rgba(96,165,250,0.5)',
    backgroundColor: colors.surfaceAlt ?? colors.surface,
  },
  cardMatched: {
    borderColor: 'rgba(52,211,153,0.6)',
    opacity: 0.75,
  },
  cardBack: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(59,130,246,0.08)',
  },
  cardBackText: {
    fontSize: 26,
    fontWeight: '900',
    color: 'rgba(96,165,250,0.4)',
    letterSpacing: -1,
  },
  cardLabel: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  matchedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(52,211,153,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  matchTick: { fontSize: 20, color: '#34D399', fontWeight: '900' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: borderRadius.xl,
  },
  countdownNum: { fontSize: 72, fontWeight: '900', color: '#60A5FA' },
  countdownSub: { fontSize: fontSize.lg, fontWeight: '600', color: colors.textMuted },
  endBox: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl },
  endTitle: { fontSize: fontSize.xxl, fontWeight: '900', color: '#60A5FA' },
  endSub: { fontSize: fontSize.md, color: colors.textMuted, fontWeight: '600' },
});
