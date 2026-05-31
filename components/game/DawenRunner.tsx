import { useRef, useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Platform, useWindowDimensions,
} from 'react-native';
import Svg, {
  Rect, Circle, Ellipse, Path, G, Line, Text as SvgText, Defs,
  LinearGradient as SvgGrad, Stop,
} from 'react-native-svg';
import { colors, spacing, borderRadius, fontSize } from '@/constants/theme';
import type { UnifiedGameResult } from '@/services/game/gameTypes';
import type { GameMode } from './GameModeSelector';

// ─── Seeded RNG ───────────────────────────────────────────────────────────────
function makeRng(seed: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 0x01000193);
  let s = (h >>> 0) || 1;
  return () => { s ^= s << 13; s ^= s >> 17; s ^= s << 5; return (s >>> 0) / 0x100000000; };
}

// ─── Constants ────────────────────────────────────────────────────────────────
const TICK_MS = 33;
const GRAVITY = 1.4;     // lower gravity = more air time, easier to clear obstacles
const JUMP_VEL = -24;    // stronger initial jump velocity
const GROUND_Y_FRAC = 0.75; // fraction of arena height
const CHAR_X_FRAC = 0.18;
const CHAR_W = 28;
const CHAR_H = 46;       // slightly shorter hitbox so collisions feel fair
const COIN_R = 10;
const COIN_SCORE = 50;
const DIST_SCORE_PER_UNIT = 0.4;
const INITIAL_SPEED = 4.5;
const SPEED_INC_PER_SEC = 0.06;
const OBSTACLE_SPAWN_BASE = 2200; // ms — extra lead time before first obstacle
const COIN_SPAWN_BASE = 1200;     // ms

interface Obstacle { id: number; x: number; w: number; h: number }
interface Coin     { id: number; x: number; y: number; collected: boolean }

interface GS {
  running: boolean; ended: boolean;
  startTime: number; elapsed: number; score: number; distance: number;
  playerY: number; velY: number; onGround: boolean;
  obstacles: Obstacle[]; coins: Coin[];
  lastObstacleSpawn: number; lastCoinSpawn: number;
  combo: number; maxCombo: number; mistakes: number;
  legPhase: number;
}

interface Props {
  seed: string;
  mode: GameMode;
  onGameEnd: (r: UnifiedGameResult) => void;
}

// ─── Avatar component ─────────────────────────────────────────────────────────
// Straw-hat runner avatar — drawn in SVG, centered at cx,cy (bottom of feet)
function Avatar({ cx, cy, legPhase, alive }: { cx: number; cy: number; legPhase: number; alive: boolean }) {
  const baseY = cy;
  const leg1Angle = Math.sin(legPhase) * 22;
  const leg2Angle = Math.sin(legPhase + Math.PI) * 22;
  const armAngle = Math.sin(legPhase) * 18;
  const opacity = alive ? 1 : 0.4;

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const legLen = 20;
  const armLen = 16;

  const l1x2 = cx + legLen * Math.sin(toRad(leg1Angle));
  const l1y2 = baseY - CHAR_H * 0.12 + legLen * Math.cos(toRad(leg1Angle));
  const l2x2 = cx + legLen * Math.sin(toRad(leg2Angle));
  const l2y2 = baseY - CHAR_H * 0.12 + legLen * Math.cos(toRad(leg2Angle));

  const a1x2 = cx - armLen * Math.sin(toRad(armAngle + 30));
  const a1y2 = baseY - CHAR_H * 0.55 - armLen * Math.cos(toRad(armAngle));
  const a2x2 = cx + armLen * Math.sin(toRad(-armAngle + 30));
  const a2y2 = baseY - CHAR_H * 0.55 + armLen * 0.3;

  return (
    <G opacity={opacity}>
      {/* Shadow */}
      <Ellipse cx={cx} cy={baseY + 3} rx={15} ry={4} fill="rgba(0,0,0,0.25)" />

      {/* Legs */}
      <Line x1={cx} y1={baseY - CHAR_H * 0.12} x2={l1x2} y2={l1y2} stroke="#6D28D9" strokeWidth={7} strokeLinecap="round" />
      <Line x1={cx} y1={baseY - CHAR_H * 0.12} x2={l2x2} y2={l2y2} stroke="#7C3AED" strokeWidth={7} strokeLinecap="round" />
      {/* Shoes */}
      <Ellipse cx={l1x2} cy={l1y2 + 2} rx={7} ry={4} fill="#1C1917" />
      <Ellipse cx={l2x2} cy={l2y2 + 2} rx={7} ry={4} fill="#1C1917" />

      {/* Body — purple jacket */}
      <Rect x={cx - 12} y={baseY - CHAR_H * 0.62} width={24} height={30} rx={8} fill="#7C3AED" />
      {/* Gold chest detail */}
      <Rect x={cx - 4} y={baseY - CHAR_H * 0.58} width={8} height={12} rx={3} fill="#F59E0B" />

      {/* Arms */}
      <Line x1={cx - 11} y1={baseY - CHAR_H * 0.55} x2={a1x2} y2={a1y2} stroke="#8B5CF6" strokeWidth={7} strokeLinecap="round" />
      <Line x1={cx + 11} y1={baseY - CHAR_H * 0.55} x2={a2x2} y2={a2y2} stroke="#8B5CF6" strokeWidth={7} strokeLinecap="round" />

      {/* Neck */}
      <Rect x={cx - 5} y={baseY - CHAR_H * 0.72} width={10} height={8} rx={3} fill="#FBBF24" />

      {/* Head */}
      <Circle cx={cx} cy={baseY - CHAR_H * 0.82} r={14} fill="#FBBF24" />
      {/* Face */}
      <Circle cx={cx - 4} cy={baseY - CHAR_H * 0.84} r={2} fill="#1C1917" />
      <Circle cx={cx + 4} cy={baseY - CHAR_H * 0.84} r={2} fill="#1C1917" />
      <Path d={`M ${cx - 4} ${baseY - CHAR_H * 0.78} Q ${cx} ${baseY - CHAR_H * 0.74} ${cx + 4} ${baseY - CHAR_H * 0.78}`} stroke="#78350F" strokeWidth={1.5} fill="none" strokeLinecap="round" />

      {/* Straw hat brim */}
      <Ellipse cx={cx} cy={baseY - CHAR_H * 0.94} rx={22} ry={5} fill="#D97706" />
      {/* Straw hat dome */}
      <Path
        d={`M ${cx - 16} ${baseY - CHAR_H * 0.94} Q ${cx - 14} ${baseY - CHAR_H * 1.14} ${cx} ${baseY - CHAR_H * 1.16} Q ${cx + 14} ${baseY - CHAR_H * 1.14} ${cx + 16} ${baseY - CHAR_H * 0.94} Z`}
        fill="#F59E0B"
      />
      {/* Hat band */}
      <Path
        d={`M ${cx - 15} ${baseY - CHAR_H * 0.95} Q ${cx} ${baseY - CHAR_H * 0.96} ${cx + 15} ${baseY - CHAR_H * 0.95}`}
        stroke="#7C3AED"
        strokeWidth={3}
        fill="none"
        strokeLinecap="round"
      />
    </G>
  );
}

export function DawenRunner({ seed, onGameEnd }: Props) {
  const { width: sw, height: sh } = useWindowDimensions();
  const arenaW = Math.min(sw - 32, 480);
  const arenaH = Math.min(sh * 0.5, 360);
  const groundY = Math.floor(arenaH * GROUND_Y_FRAC);
  const charX = Math.floor(arenaW * CHAR_X_FRAC);
  const sessionId = useRef(`run-${seed}-${Date.now()}`).current;

  const [phase, setPhase] = useState<'countdown' | 'playing' | 'ended'>('countdown');
  const [countdown, setCountdown] = useState(3);
  const [display, setDisplay] = useState<GS | null>(null);
  const phaseRef = useRef<'countdown' | 'playing' | 'ended'>('countdown');
  phaseRef.current = phase;

  const rngRef = useRef(makeRng(seed));
  const obstacleIdRef = useRef(0);
  const coinIdRef = useRef(0);
  const gsRef = useRef<GS>({
    running: false, ended: false,
    startTime: 0, elapsed: 0, score: 0, distance: 0,
    playerY: groundY, velY: 0, onGround: true,
    obstacles: [], coins: [],
    lastObstacleSpawn: 0, lastCoinSpawn: 0,
    combo: 0, maxCombo: 0, mistakes: 0,
    legPhase: 0,
  });

  // Countdown
  useEffect(() => {
    if (phase !== 'countdown') return;
    if (countdown <= 0) { setPhase('playing'); return; }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown, phase]);

  const endGame = useCallback(() => {
    const gs = gsRef.current;
    if (gs.ended) return;
    gs.ended = true;
    setPhase('ended');
    const survMs = gs.elapsed;
    const total = Math.max(0, Math.round(gs.score));
    onGameEnd({
      score: total, sessionId,
      survivalTimeMs: survMs,
      completionTimeMs: survMs,
      orbsCollected: 0, trapsHit: 0, obstaclesHit: gs.mistakes, comboMax: gs.maxCombo,
      accuracy: 0, hits: 0, misses: 0,
      distanceUnits: Math.round(gs.distance),
      pairsFound: 0, fragmentsFound: 0, mistakes: gs.mistakes,
    });
  }, [onGameEnd, sessionId]);

  // Jump handler
  const handleJump = useCallback(() => {
    if (phaseRef.current !== 'playing') return;
    const gs = gsRef.current;
    if (gs.onGround) {
      gs.velY = JUMP_VEL;
      gs.onGround = false;
    }
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') {
      const onKey = (e: KeyboardEvent) => {
        if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); handleJump(); }
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }
  }, [handleJump]);

  // Game loop
  useEffect(() => {
    if (phase !== 'playing') return;
    const gs = gsRef.current;
    gs.running = true;
    gs.startTime = Date.now();
    // Initialize spawn timestamps to now so the first obstacle appears after
    // OBSTACLE_SPAWN_BASE ms (not immediately on the first tick).
    gs.lastObstacleSpawn = Date.now();
    gs.lastCoinSpawn = Date.now();

    let lastTick = Date.now();
    let intervalId: ReturnType<typeof setInterval>;

    const tick = () => {
      if (!gs.running || gs.ended) return;
      const now = Date.now();
      const dt = Math.min(now - lastTick, 100);
      lastTick = now;
      gs.elapsed += dt;
      const speed = INITIAL_SPEED + (gs.elapsed / 1000) * SPEED_INC_PER_SEC;

      // Physics
      gs.velY += GRAVITY;
      gs.playerY = Math.min(groundY, gs.playerY + gs.velY);
      if (gs.playerY >= groundY) { gs.playerY = groundY; gs.velY = 0; gs.onGround = true; }
      else { gs.onGround = false; }

      // Distance + score
      gs.distance += speed;
      gs.score += DIST_SCORE_PER_UNIT * speed;

      // Leg animation
      gs.legPhase += gs.onGround ? 0.2 : 0.05;

      // Spawn obstacles
      const spawnInterval = OBSTACLE_SPAWN_BASE * (1 / (1 + gs.elapsed / 30000));
      if (now - gs.lastObstacleSpawn > spawnInterval) {
        gs.lastObstacleSpawn = now;
        const r = rngRef.current;
        // Max height capped at 42px so the jump always has enough clearance.
        const h = 18 + r() * 24;
        gs.obstacles.push({ id: obstacleIdRef.current++, x: arenaW + 20, w: 16 + r() * 16, h });
      }

      // Spawn coins
      if (now - gs.lastCoinSpawn > COIN_SPAWN_BASE) {
        gs.lastCoinSpawn = now;
        const r = rngRef.current;
        const yOff = r() > 0.5 ? 0 : -(groundY * 0.3 + r() * groundY * 0.2);
        gs.coins.push({ id: coinIdRef.current++, x: arenaW + 20, y: groundY + yOff, collected: false });
      }

      // Move obstacles + coins
      gs.obstacles = gs.obstacles.map(o => ({ ...o, x: o.x - speed })).filter(o => o.x > -60);
      gs.coins = gs.coins.map(c => ({ ...c, x: c.x - speed })).filter(c => c.x > -30);

      // Collision with obstacles
      const charTop = gs.playerY - CHAR_H;
      const charBottom = gs.playerY;
      const charLeft = charX - CHAR_W / 2;
      const charRight = charX + CHAR_W / 2;

      for (const ob of gs.obstacles) {
        const obsTop = groundY - ob.h;
        const obsLeft = ob.x;
        const obsRight = ob.x + ob.w;
        if (charRight - 6 > obsLeft && charLeft + 6 < obsRight && charBottom > obsTop + 6) {
          gs.mistakes++;
          endGame();
          return;
        }
      }

      // Collect coins
      for (const coin of gs.coins) {
        if (coin.collected) continue;
        const dx = Math.abs(charX - coin.x);
        const dy = Math.abs((gs.playerY - CHAR_H / 2) - coin.y);
        if (dx < COIN_R + CHAR_W / 2 && dy < COIN_R + CHAR_H / 2) {
          coin.collected = true;
          gs.score += COIN_SCORE;
          gs.combo++;
          if (gs.combo > gs.maxCombo) gs.maxCombo = gs.combo;
        }
      }
      gs.coins = gs.coins.filter(c => !c.collected);

      setDisplay({ ...gs });
    };

    intervalId = setInterval(tick, TICK_MS);
    return () => { gs.running = false; clearInterval(intervalId); };
  }, [phase, groundY, charX, arenaW, endGame]);

  const gs = display;

  return (
    <View style={styles.container}>
      {/* HUD */}
      {phase === 'playing' && gs && (
        <View style={styles.hud}>
          <View style={styles.hudItem}>
            <Text style={[styles.hudVal, { color: '#10B981' }]}>{Math.round(gs.distance)}</Text>
            <Text style={styles.hudLabel}>DIST</Text>
          </View>
          <View style={styles.hudItem}>
            <Text style={[styles.hudVal, { color: '#F59E0B' }]}>{Math.round(gs.score)}</Text>
            <Text style={styles.hudLabel}>SCORE</Text>
          </View>
          <View style={styles.hudItem}>
            <Text style={styles.hudVal}>{Math.floor(gs.elapsed / 1000)}s</Text>
            <Text style={styles.hudLabel}>TIME</Text>
          </View>
        </View>
      )}

      {/* Arena */}
      <TouchableOpacity
        activeOpacity={1}
        onPressIn={handleJump}
        style={[styles.arena, { width: arenaW, height: arenaH }]}
      >
        <Svg width={arenaW} height={arenaH}>
          <Defs>
            <SvgGrad id="skyGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor="#0D0618" />
              <Stop offset="100%" stopColor="#1A0A2E" />
            </SvgGrad>
            <SvgGrad id="groundGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor="#4C1D95" />
              <Stop offset="100%" stopColor="#2D1060" />
            </SvgGrad>
          </Defs>

          {/* Sky */}
          <Rect x={0} y={0} width={arenaW} height={arenaH} fill="url(#skyGrad)" />

          {/* Scrolling background tiles */}
          {gs && [0, 1, 2, 3].map(i => {
            const bx = ((gs.distance * 0.3 * -1) % arenaW + i * (arenaW / 2) + arenaW) % (arenaW * 2) - arenaW / 2;
            return (
              <G key={i} opacity={0.15}>
                <Rect x={bx} y={groundY - 60} width={3} height={60} fill="#8B5CF6" rx={2} />
                <Rect x={bx + 30} y={groundY - 40} width={3} height={40} fill="#8B5CF6" rx={2} />
              </G>
            );
          })}

          {/* Ground */}
          <Rect x={0} y={groundY} width={arenaW} height={arenaH - groundY} fill="url(#groundGrad)" />
          <Rect x={0} y={groundY} width={arenaW} height={3} fill="#A78BFA" opacity={0.6} />

          {/* Ground detail: moving lines */}
          {gs && [0, 1, 2, 3, 4, 5].map(i => {
            const lx = (((-gs.distance * 1.2) % 80 + i * 80 + 400) % 480);
            return <Rect key={i} x={lx} y={groundY + 8} width={40} height={2} fill="rgba(167,139,250,0.2)" rx={1} />;
          })}

          {/* Coins */}
          {gs && gs.coins.map(c => (
            <G key={c.id}>
              <Circle cx={c.x} cy={c.y} r={COIN_R + 3} fill="rgba(245,158,11,0.15)" />
              <Circle cx={c.x} cy={c.y} r={COIN_R} fill="#F59E0B" />
              <SvgText x={c.x} y={c.y + 4} textAnchor="middle" fontSize={9} fontWeight="800" fill="#78350F">$</SvgText>
            </G>
          ))}

          {/* Obstacles */}
          {gs && gs.obstacles.map(ob => (
            <G key={ob.id}>
              <Rect
                x={ob.x} y={groundY - ob.h}
                width={ob.w} height={ob.h}
                fill="#EC4899" rx={3}
                opacity={0.9}
              />
              <Rect
                x={ob.x} y={groundY - ob.h}
                width={ob.w} height={4}
                fill="#F9A8D4" rx={2}
              />
            </G>
          ))}

          {/* Character */}
          {gs && (
            <Avatar
              cx={charX}
              cy={gs.playerY}
              legPhase={gs.legPhase}
              alive={!gs.ended}
            />
          )}

          {/* Countdown overlay */}
          {phase === 'countdown' && (
            <>
              <Rect x={0} y={0} width={arenaW} height={arenaH} fill="rgba(0,0,0,0.75)" />
              <SvgText x={arenaW / 2} y={arenaH / 2 - 10} textAnchor="middle" fontSize={64} fontWeight="900" fill="#A78BFA">
                {countdown > 0 ? String(countdown) : 'GO!'}
              </SvgText>
              <SvgText x={arenaW / 2} y={arenaH / 2 + 32} textAnchor="middle" fontSize={16} fill="rgba(255,255,255,0.5)">
                Tap or press SPACE to jump
              </SvgText>
            </>
          )}
        </Svg>
      </TouchableOpacity>

      <Text style={styles.hint}>
        {phase === 'playing' ? 'TAP to jump over obstacles' : phase === 'countdown' ? '' : 'Calculating result…'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: spacing.md },
  hud: {
    flexDirection: 'row',
    gap: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  hudItem: { alignItems: 'center', minWidth: 52 },
  hudVal: { fontSize: fontSize.lg, fontWeight: '900', color: colors.textPrimary },
  hudLabel: { fontSize: 9, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.8 },
  arena: {
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(139,92,246,0.35)',
  },
  hint: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '500',
    textAlign: 'center',
  },
});
