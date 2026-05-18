import { useRef, useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Platform,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Target } from 'lucide-react-native';
import { colors, spacing, borderRadius, fontSize } from '@/constants/theme';
import type { UnifiedGameResult } from '@/services/game/gameTypes';
import type { GameMode } from './GameModeSelector';

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

const GAME_DURATION_MS = 30_000;
const TARGET_VISIBLE_MS = 1400;
const TARGET_R = 30;
const HIT_SCORE = 100;
const COMBO_BONUS = 30;
const MISS_PENALTY = 50;
const MAX_SIMULTANEOUS_TARGETS = 3;

interface AimTarget {
  id: number;
  x: number;
  y: number;
  spawnAt: number;
  hitAt: number | null;
  missedAt: number | null;
  scale: Animated.Value;
  opacity: Animated.Value;
  ripple: Animated.Value;
}

interface Props {
  seed: string;
  mode: GameMode;
  entryId?: string;
  matchId?: string;
  onGameEnd: (result: UnifiedGameResult) => void;
}

export function DawenAimDuel({ seed, mode, onGameEnd }: Props) {
  const { width: sw, height: sh } = useWindowDimensions();
  const arenaW = Math.min(sw - 32, 500);
  const arenaH = Math.min(sh * 0.55, 420);

  const [phase, setPhase] = useState<'countdown' | 'playing' | 'ended'>('countdown');
  const [countdown, setCountdown] = useState(3);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION_MS / 1000);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [hits, setHits] = useState(0);
  const [misses, setMisses] = useState(0);
  const [targets, setTargets] = useState<AimTarget[]>([]);

  const rngRef = useRef(makeRng(seed));
  const targetIdRef = useRef(0);
  const phaseRef = useRef<'countdown' | 'playing' | 'ended'>('countdown');
  const scoreRef = useRef(0);
  const comboRef = useRef(0);
  const maxComboRef = useRef(0);
  const hitsRef = useRef(0);
  const missesRef = useRef(0);
  const startTimeRef = useRef(0);
  const sessionId = useRef(`aim-${seed}-${Date.now()}`).current;

  phaseRef.current = phase;
  scoreRef.current = score;
  comboRef.current = combo;
  maxComboRef.current = maxCombo;
  hitsRef.current = hits;
  missesRef.current = misses;

  const spawnTarget = useCallback(() => {
    const r = rngRef.current;
    const pad = TARGET_R + 8;
    const x = pad + r() * (arenaW - pad * 2);
    const y = pad + r() * (arenaH - pad * 2);
    const id = targetIdRef.current++;
    const t: AimTarget = {
      id, x, y,
      spawnAt: Date.now(),
      hitAt: null,
      missedAt: null,
      scale: new Animated.Value(0),
      opacity: new Animated.Value(1),
      ripple: new Animated.Value(0),
    };
    Animated.spring(t.scale, { toValue: 1, useNativeDriver: true, speed: 22, bounciness: 8 }).start();
    return t;
  }, [arenaW, arenaH]);

  const endGame = useCallback(() => {
    if (phaseRef.current === 'ended') return;
    setPhase('ended');
    const survivalMs = GAME_DURATION_MS;
    const totalShotsAtempted = hitsRef.current + missesRef.current;
    const acc = totalShotsAtempted > 0 ? hitsRef.current / totalShotsAtempted : 0;
    const accBonus = Math.round(acc * 500);
    const finalScore = Math.min(10_000, Math.max(0, scoreRef.current + accBonus));
    onGameEnd({
      score: finalScore,
      sessionId,
      survivalTimeMs: survivalMs,
      completionTimeMs: survivalMs,
      orbsCollected: 0, trapsHit: 0, obstaclesHit: 0,
      comboMax: maxComboRef.current,
      accuracy: acc,
      hits: hitsRef.current,
      misses: missesRef.current,
      distanceUnits: 0, pairsFound: 0, fragmentsFound: 0, mistakes: 0,
    });
  }, [onGameEnd, sessionId]);

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

  // Main game timer + target spawning
  useEffect(() => {
    if (phase !== 'playing') return;
    let rafId = 0;
    let lastSpawn = 0;
    const SPAWN_INTERVAL = 900;

    const tick = () => {
      if (phaseRef.current !== 'playing') return;
      const elapsed = Date.now() - startTimeRef.current;
      const tLeft = Math.max(0, (GAME_DURATION_MS - elapsed) / 1000);
      setTimeLeft(Math.ceil(tLeft));

      if (elapsed >= GAME_DURATION_MS) { endGame(); return; }

      const now = Date.now();
      // Expire old targets
      setTargets(prev => {
        const updated = prev.map(t => {
          if (t.hitAt !== null || t.missedAt !== null) return t;
          if (now - t.spawnAt > TARGET_VISIBLE_MS) {
            // Mark as missed
            t.missedAt = now;
            missesRef.current++;
            setMisses(m => m + 1);
            comboRef.current = 0;
            setCombo(0);
            Animated.parallel([
              Animated.timing(t.opacity, { toValue: 0, duration: 150, useNativeDriver: true }),
              Animated.timing(t.scale, { toValue: 0.5, duration: 150, useNativeDriver: true }),
            ]).start();
          }
          return t;
        });
        return updated;
      });

      // Spawn new target
      if (now - lastSpawn > SPAWN_INTERVAL) {
        lastSpawn = now;
        setTargets(prev => {
          const active = prev.filter(t => t.hitAt === null && t.missedAt === null);
          if (active.length < MAX_SIMULTANEOUS_TARGETS) {
            return [...prev.filter(t => now - (t.hitAt ?? t.missedAt ?? 0) < 500 || t.hitAt === null && t.missedAt === null), spawnTarget()];
          }
          return prev;
        });
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [phase, endGame, spawnTarget]);

  const handleTargetPress = useCallback((target: AimTarget) => {
    if (phaseRef.current !== 'playing') return;
    if (target.hitAt !== null || target.missedAt !== null) return;
    target.hitAt = Date.now();

    // Combo + score
    const newCombo = comboRef.current + 1;
    comboRef.current = newCombo;
    setCombo(newCombo);
    if (newCombo > maxComboRef.current) { maxComboRef.current = newCombo; setMaxCombo(newCombo); }

    const bonus = newCombo >= 3 ? Math.floor((newCombo - 2) * COMBO_BONUS) : 0;
    const gained = HIT_SCORE + bonus;
    scoreRef.current += gained;
    setScore(s => s + gained);
    hitsRef.current++;
    setHits(h => h + 1);

    // Ripple + fade
    Animated.parallel([
      Animated.timing(target.ripple, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(target.opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
      Animated.timing(target.scale, { toValue: 1.4, duration: 250, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleMissPress = () => {
    if (phaseRef.current !== 'playing') return;
    scoreRef.current = Math.max(0, scoreRef.current - MISS_PENALTY);
    setScore(scoreRef.current);
    missesRef.current++;
    setMisses(m => m + 1);
    comboRef.current = 0;
    setCombo(0);
  };

  const totalShots = hits + misses;
  const accuracy = totalShots > 0 ? Math.round((hits / totalShots) * 100) : 100;

  return (
    <View style={styles.container}>
      {/* HUD */}
      {phase === 'playing' && (
        <View style={styles.hud}>
          <View style={styles.hudItem}>
            <Text style={styles.hudVal}>{timeLeft}s</Text>
            <Text style={styles.hudLabel}>TIME</Text>
          </View>
          <View style={styles.hudItem}>
            <Text style={[styles.hudVal, { color: '#F59E0B' }]}>{score.toLocaleString()}</Text>
            <Text style={styles.hudLabel}>SCORE</Text>
          </View>
          <View style={styles.hudItem}>
            <Text style={[styles.hudVal, { color: '#10B981' }]}>×{combo}</Text>
            <Text style={styles.hudLabel}>COMBO</Text>
          </View>
          <View style={styles.hudItem}>
            <Text style={styles.hudVal}>{accuracy}%</Text>
            <Text style={styles.hudLabel}>ACC</Text>
          </View>
        </View>
      )}

      {/* Arena */}
      <TouchableOpacity
        activeOpacity={1}
        onPress={handleMissPress}
        style={[styles.arena, { width: arenaW, height: arenaH }]}
      >
        <LinearGradient
          colors={['rgba(245,158,11,0.08)', 'rgba(0,0,0,0.4)']}
          style={StyleSheet.absoluteFill}
        />

        {/* Countdown overlay */}
        {phase === 'countdown' && (
          <View style={styles.countdownOverlay}>
            <Text style={styles.countdownNum}>{countdown > 0 ? countdown : 'GO!'}</Text>
            <Text style={styles.countdownSub}>Get ready to aim!</Text>
          </View>
        )}

        {/* Targets */}
        {phase === 'playing' && targets.map(t => {
          if (t.hitAt !== null || t.missedAt !== null) {
            if (Date.now() - (t.hitAt ?? t.missedAt ?? 0) > 400) return null;
          }
          const rippleScale = t.ripple.interpolate({ inputRange: [0, 1], outputRange: [1, 2] });
          return (
            <Animated.View
              key={t.id}
              style={[
                styles.targetWrap,
                {
                  left: t.x - TARGET_R,
                  top: t.y - TARGET_R,
                  opacity: t.opacity,
                  transform: [{ scale: t.scale }],
                },
              ]}
            >
              {/* Ripple ring */}
              <Animated.View
                style={[styles.ripple, { transform: [{ scale: rippleScale }], opacity: t.ripple.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }) }]}
              />
              <TouchableOpacity
                style={styles.target}
                onPress={e => { e.stopPropagation?.(); handleTargetPress(t); }}
                activeOpacity={0.7}
              >
                <LinearGradient
                  colors={['#FCD34D', '#F59E0B', '#D97706']}
                  style={styles.targetGrad}
                >
                  <Target size={16} color="#78350F" strokeWidth={2.5} />
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>
          );
        })}
      </TouchableOpacity>

      {/* Result summary (phase = ended) shown in parent via onGameEnd */}
      {phase === 'ended' && (
        <View style={styles.endOverlay}>
          <Text style={styles.endText}>Time's up!</Text>
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
  },
  hudItem: { alignItems: 'center', minWidth: 54 },
  hudVal: { fontSize: fontSize.lg, fontWeight: '900', color: colors.textPrimary },
  hudLabel: { fontSize: 9, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.8 },
  arena: {
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(245,158,11,0.3)',
    position: 'relative',
  },
  countdownOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    gap: spacing.md,
  },
  countdownNum: {
    fontSize: 72,
    fontWeight: '900',
    color: '#FCD34D',
  },
  countdownSub: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.textMuted,
  },
  targetWrap: {
    position: 'absolute',
    width: TARGET_R * 2,
    height: TARGET_R * 2,
  },
  ripple: {
    position: 'absolute',
    width: TARGET_R * 2,
    height: TARGET_R * 2,
    borderRadius: TARGET_R,
    borderWidth: 2,
    borderColor: '#FCD34D',
  },
  target: {
    width: TARGET_R * 2,
    height: TARGET_R * 2,
    borderRadius: TARGET_R,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
  },
  targetGrad: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: TARGET_R,
    borderWidth: 2,
    borderColor: '#FCD34D',
  },
  endOverlay: {
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
  },
  endText: { fontSize: fontSize.xxl, fontWeight: '900', color: '#FCD34D' },
  endSub: { fontSize: fontSize.md, color: colors.textMuted, fontWeight: '600' },
});
