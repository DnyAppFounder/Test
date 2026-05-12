import { useRef, useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, PanResponder, Platform, ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Play, Shield } from 'lucide-react-native';
import { colors, spacing, borderRadius, fontSize } from '@/constants/theme';
import { computeScore, GAME_DURATION_MS, PLAYER_LIVES } from '@/services/game/gameConfig';
import type { GameResultData } from './GameResultCard';

// ─── Virtual arena dimensions ─────────────────────────────────────────────────
const VW = 320;
const VH = 450;
const MAX_ARENA_W = 600;
const PR = 14;   // player radius
const OR = 9;    // orb radius
const TR = 11;   // trap radius
const SPEED = 2.6;
const TICK_MS = 33;
const ORB_INITIAL = 5;
const ORB_POOL = 10;
const INVINCIBLE_MS = 2000;
const COMBO_TIMEOUT = 3000;

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

// ─── Types ────────────────────────────────────────────────────────────────────
interface Orb { id: number; x: number; y: number; collected: boolean; visible: boolean; respawnAt: number }
interface Trap { id: number; x: number; y: number; vx: number; vy: number }
interface Obstacle { id: number; x: number; y: number; w: number; h: number; vx: number; vy: number }
interface Player { x: number; y: number }

interface GS {
  running: boolean; ended: boolean;
  startTime: number; elapsed: number;
  lives: number; score: number;
  combo: number; maxCombo: number;
  orbsCollected: number; totalSpawned: number;
  trapsHit: number; obstaclesHit: number;
  player: Player; orbs: Orb[]; traps: Trap[]; obstacles: Obstacle[];
  rawActions: any[];
  invincibleUntil: number; lastComboTime: number;
  lastMovementRecord: number;
}

interface RS {
  px: number; py: number;
  orbs: Orb[]; traps: Trap[]; obstacles: Obstacle[];
  lives: number; score: number; combo: number; elapsed: number;
  invincible: boolean; ended: boolean;
}

// ─── Map generation ───────────────────────────────────────────────────────────
function generateMap(seed: string) {
  const r = makeRng(seed);
  const orbs: Orb[] = Array.from({ length: ORB_POOL }, (_, i) => ({
    id: i,
    x: 24 + r() * (VW - 48),
    y: 24 + r() * (VH - 80),
    collected: false,
    visible: i < ORB_INITIAL,
    respawnAt: 0,
  }));
  const traps: Trap[] = Array.from({ length: 4 }, (_, i) => ({
    id: i,
    x: 40 + r() * (VW - 80),
    y: 40 + r() * (VH - 120),
    vx: (r() - 0.5) * 2.6,
    vy: (r() - 0.5) * 2.6,
  }));
  const obstacles: Obstacle[] = Array.from({ length: 3 }, (_, i) => ({
    id: i,
    x: 20 + r() * (VW - 100),
    y: 60 + r() * (VH - 160),
    w: 50 + r() * 60,
    h: 12 + r() * 10,
    vx: (r() - 0.5) * 1.6,
    vy: (r() - 0.5) * 0.8,
  }));
  return { orbs, traps, obstacles };
}

// ─── Collision helpers ────────────────────────────────────────────────────────
function dist(ax: number, ay: number, bx: number, by: number) {
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
}
function circleRect(cx: number, cy: number, cr: number, rx: number, ry: number, rw: number, rh: number) {
  const nx = Math.max(rx, Math.min(cx, rx + rw));
  const ny = Math.max(ry, Math.min(cy, ry + rh));
  return dist(cx, cy, nx, ny) < cr;
}

// ─── DawenRushArena ───────────────────────────────────────────────────────────

interface Props {
  seed: string;
  mode: 'free' | 'ranked' | 'sol_duel';
  entryId?: string | null;
  matchId?: string | null;
  entryAmountSol?: number;
  onGameEnd: (result: GameResultData) => void;
}

export function DawenRushArena({ seed, mode, entryId, matchId, entryAmountSol, onGameEnd }: Props) {
  const [containerW, setContainerW] = useState(Math.min(300, MAX_ARENA_W));
  const [containerH, setContainerH] = useState(500);
  const effectiveW = Math.min(containerW, MAX_ARENA_W);
  // Scale is constrained by both width AND available height so arena never clips on mobile
  const scale = Math.min(effectiveW / VW, containerH / VH);
  const arenaW = VW * scale;
  const arenaH = VH * scale;

  const [gameStarted, setGameStarted] = useState(false);
  const [snap, setSnap] = useState<RS>({
    px: VW / 2, py: VH - 80, orbs: [], traps: [], obstacles: [],
    lives: PLAYER_LIVES, score: 0, combo: 0, elapsed: 0, invincible: false, ended: false,
  });

  const gsRef = useRef<GS | null>(null);
  const loopRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const joyRef = useRef({ dx: 0, dy: 0, active: false, ox: 0, oy: 0 }); // joystick
  const keysRef = useRef<Set<string>>(new Set());
  const sessionId = useRef(`${Date.now()}-${Math.random().toString(36).slice(2)}`);

  // ── Keyboard (web) ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const down = (e: KeyboardEvent) => keysRef.current.add(e.key);
    const up   = (e: KeyboardEvent) => keysRef.current.delete(e.key);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  // ── Game tick ───────────────────────────────────────────────────────────────
  const tick = useCallback(() => {
    const gs = gsRef.current;
    if (!gs || !gs.running || gs.ended) return;

    const now = Date.now();
    gs.elapsed = now - gs.startTime;

    // ── Input ──
    let dx = joyRef.current.dx;
    let dy = joyRef.current.dy;
    if (Platform.OS === 'web') {
      const k = keysRef.current;
      if (k.has('ArrowLeft')  || k.has('a') || k.has('A')) dx -= 1;
      if (k.has('ArrowRight') || k.has('d') || k.has('D')) dx += 1;
      if (k.has('ArrowUp')    || k.has('w') || k.has('W')) dy -= 1;
      if (k.has('ArrowDown')  || k.has('s') || k.has('S')) dy += 1;
    }
    const mag = Math.sqrt(dx * dx + dy * dy);
    if (mag > 0) { dx /= mag; dy /= mag; }

    // ── Move player ──
    gs.player.x = Math.max(PR, Math.min(VW - PR, gs.player.x + dx * SPEED));
    gs.player.y = Math.max(PR, Math.min(VH - PR, gs.player.y + dy * SPEED));

    // ── Move traps ──
    for (const t of gs.traps) {
      t.x += t.vx; t.y += t.vy;
      if (t.x < TR || t.x > VW - TR) t.vx *= -1;
      if (t.y < TR || t.y > VH - TR) t.vy *= -1;
      t.x = Math.max(TR, Math.min(VW - TR, t.x));
      t.y = Math.max(TR, Math.min(VH - TR, t.y));
    }

    // ── Move obstacles ──
    for (const o of gs.obstacles) {
      o.x += o.vx; o.y += o.vy;
      if (o.x < 0 || o.x + o.w > VW) o.vx *= -1;
      if (o.y < 0 || o.y + o.h > VH - 60) o.vy *= -1;
      o.x = Math.max(0, Math.min(VW - o.w, o.x));
      o.y = Math.max(0, Math.min(VH - 60 - o.h, o.y));
    }

    // ── Check orb collection ──
    for (const orb of gs.orbs) {
      if (!orb.visible || orb.collected) continue;
      if (dist(gs.player.x, gs.player.y, orb.x, orb.y) < PR + OR) {
        orb.collected = true; orb.visible = false;
        gs.orbsCollected++; gs.totalSpawned++;
        // Combo
        const comboOk = now - gs.lastComboTime < COMBO_TIMEOUT;
        gs.combo = comboOk ? gs.combo + 1 : 1;
        gs.maxCombo = Math.max(gs.maxCombo, gs.combo);
        gs.lastComboTime = now;
        gs.rawActions.push({ type: 'orb_collect', id: orb.id, x: orb.x, y: orb.y, t: now - gs.startTime });
        orb.respawnAt = now + 1800;
      }
    }

    // ── Respawn orbs ──
    for (const orb of gs.orbs) {
      if (orb.collected && !orb.visible && orb.respawnAt > 0 && now >= orb.respawnAt) {
        const r = makeRng(`${seed}-${orb.id}-${gs.orbsCollected}`);
        orb.x = 20 + r() * (VW - 40);
        orb.y = 20 + r() * (VH - 80);
        orb.collected = false; orb.visible = true; orb.respawnAt = 0;
        gs.totalSpawned++;
      }
    }

    // ── Collision with traps ──
    if (now >= gs.invincibleUntil) {
      for (const t of gs.traps) {
        if (dist(gs.player.x, gs.player.y, t.x, t.y) < PR + TR) {
          gs.lives--;
          gs.trapsHit++;
          gs.combo = 0;
          gs.invincibleUntil = now + INVINCIBLE_MS;
          gs.rawActions.push({ type: 'trap_hit', id: t.id, x: t.x, y: t.y, t: now - gs.startTime });
          break;
        }
      }
    }

    // ── Collision with obstacles ──
    if (now >= gs.invincibleUntil) {
      for (const o of gs.obstacles) {
        if (circleRect(gs.player.x, gs.player.y, PR, o.x, o.y, o.w, o.h)) {
          gs.lives--;
          gs.obstaclesHit++;
          gs.combo = 0;
          gs.invincibleUntil = now + INVINCIBLE_MS;
          gs.rawActions.push({ type: 'obstacle_hit', id: o.id, x: o.x, y: o.y, t: now - gs.startTime });
          break;
        }
      }
    }

    // ── Record movement snapshot every 2s ──
    if (now - gs.lastMovementRecord >= 2000) {
      gs.rawActions.push({ type: 'pos', x: gs.player.x, y: gs.player.y, t: now - gs.startTime });
      gs.lastMovementRecord = now;
    }

    // ── Combo timeout ──
    if (now - gs.lastComboTime >= COMBO_TIMEOUT && gs.combo > 0) {
      gs.combo = 0;
    }

    // ── Score ──
    gs.score = computeScore({
      orbsCollected: gs.orbsCollected,
      totalSpawnedOrbs: Math.max(1, gs.totalSpawned),
      maxCombo: gs.maxCombo,
      survivalTimeMs: gs.elapsed,
      trapsHit: gs.trapsHit,
      obstaclesHit: gs.obstaclesHit,
    });

    // ── End conditions ──
    const timeUp = gs.elapsed >= GAME_DURATION_MS;
    const dead = gs.lives <= 0;

    if (timeUp || dead) {
      gs.running = false; gs.ended = true;
      const finalSurvival = dead ? gs.elapsed : GAME_DURATION_MS;
      const finalScore = computeScore({
        orbsCollected: gs.orbsCollected,
        totalSpawnedOrbs: Math.max(1, gs.totalSpawned),
        maxCombo: gs.maxCombo,
        survivalTimeMs: finalSurvival,
        trapsHit: gs.trapsHit,
        obstaclesHit: gs.obstaclesHit,
      });
      if (loopRef.current) { clearInterval(loopRef.current); loopRef.current = null; }
      onGameEnd({
        score: finalScore,
        survivalTimeMs: finalSurvival,
        orbsCollected: gs.orbsCollected,
        trapsHit: gs.trapsHit,
        obstaclesHit: gs.obstaclesHit,
        comboMax: gs.maxCombo,
        accuracy: gs.orbsCollected / Math.max(1, gs.totalSpawned),
        sessionId: sessionId.current,
      });
    }

    // ── Update render snapshot ──
    setSnap({
      px: gs.player.x, py: gs.player.y,
      orbs: [...gs.orbs], traps: [...gs.traps], obstacles: [...gs.obstacles],
      lives: gs.lives, score: gs.score, combo: gs.combo,
      elapsed: gs.elapsed, invincible: now < gs.invincibleUntil, ended: gs.ended,
    });
  }, [seed, onGameEnd]);

  // ── Start game ────────────────────────────────────────────────────────────
  const startGame = useCallback(() => {
    const { orbs, traps, obstacles } = generateMap(seed);
    sessionId.current = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const now = Date.now();
    gsRef.current = {
      running: true, ended: false,
      startTime: now, elapsed: 0,
      lives: PLAYER_LIVES, score: 0,
      combo: 0, maxCombo: 0,
      orbsCollected: 0, totalSpawned: ORB_INITIAL,
      trapsHit: 0, obstaclesHit: 0,
      player: { x: VW / 2, y: VH - 80 },
      orbs, traps, obstacles,
      rawActions: [],
      invincibleUntil: 0, lastComboTime: 0, lastMovementRecord: now,
    };
    joyRef.current = { dx: 0, dy: 0, active: false, ox: 0, oy: 0 };
    setGameStarted(true);
    loopRef.current = setInterval(tick, TICK_MS);
  }, [seed, tick]);

  useEffect(() => () => { if (loopRef.current) clearInterval(loopRef.current); }, []);

  // ── Joystick PanResponder ─────────────────────────────────────────────────
  const joy = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        joyRef.current.ox = e.nativeEvent.locationX;
        joyRef.current.oy = e.nativeEvent.locationY;
        joyRef.current.active = true;
        joyRef.current.dx = 0; joyRef.current.dy = 0;
      },
      onPanResponderMove: (_, g) => {
        const maxR = 40;
        let dx = g.dx; let dy = g.dy;
        const mag = Math.sqrt(dx * dx + dy * dy);
        if (mag > maxR) { dx = dx / mag * maxR; dy = dy / mag * maxR; }
        joyRef.current.dx = dx / maxR;
        joyRef.current.dy = dy / maxR;
      },
      onPanResponderRelease: () => {
        joyRef.current.dx = 0; joyRef.current.dy = 0; joyRef.current.active = false;
      },
      onPanResponderTerminate: () => {
        joyRef.current.dx = 0; joyRef.current.dy = 0;
      },
    })
  ).current;

  // ── Timer display ─────────────────────────────────────────────────────────
  const remaining = Math.max(0, Math.ceil((GAME_DURATION_MS - snap.elapsed) / 1000));
  const timerColor = remaining <= 10 ? '#D946EF' : remaining <= 20 ? colors.warning : colors.textPrimary;

  // ── Pre-game screen ───────────────────────────────────────────────────────
  if (!gameStarted) {
    return (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.preGame} onLayout={e => setContainerW(e.nativeEvent.layout.width)}>
          <LinearGradient colors={['rgba(139,92,246,0.2)', 'rgba(0,0,0,0)']} style={StyleSheet.absoluteFill} />
          <Text style={styles.preTitle}>DAWEN Rush Duel</Text>
          <Text style={styles.preSub}>45 seconds • Collect orbs • Avoid traps</Text>
          {mode === 'sol_duel' && entryAmountSol && (
            <View style={styles.preBadge}>
              <Text style={styles.preBadgeText}>{entryAmountSol} SOL on the line</Text>
            </View>
          )}
          <View style={styles.preRules}>
            <Rule icon="🟣" text="Purple orbs = +score" />
            <Rule icon="🔴" text="Magenta traps = -1 life" />
            <Rule icon="⚡" text="Combos multiply score" />
            <Rule icon="🛡️" text={`${PLAYER_LIVES} lives — survive all 45 seconds`} />
          </View>
          <TouchableOpacity style={styles.startBtn} onPress={startGame} activeOpacity={0.85}>
            <Play size={20} color={colors.white} fill={colors.white} strokeWidth={0} />
            <Text style={styles.startBtnText}>Start Game</Text>
          </TouchableOpacity>
          {mode === 'sol_duel' && (
            <View style={styles.fairnessRow}>
              <Shield size={12} color='#C084FC' strokeWidth={2} />
              <Text style={styles.fairnessText}>Both players receive the same map seed</Text>
            </View>
          )}
        </View>
      </ScrollView>
    );
  }

  // ── Arena ─────────────────────────────────────────────────────────────────
  return (
    <View
      style={{ flex: 1, alignItems: 'center' }}
      onLayout={e => {
        setContainerW(e.nativeEvent.layout.width);
        setContainerH(e.nativeEvent.layout.height);
      }}
    >
    <View
      style={[styles.arenaWrap, { height: containerH, width: arenaW }]}>
      {/* Game surface */}
      <View style={[styles.arena, { height: containerH }]}>
        {/* Background */}
        <LinearGradient
          colors={['#0A0A14', '#0D0D1A']}
          style={StyleSheet.absoluteFill}
        />
        {/* Grid lines */}
        {Array.from({ length: 6 }, (_, i) => (
          <View key={`vg${i}`} style={[styles.gridV, { left: ((i + 1) / 7) * arenaW }]} />
        ))}
        {Array.from({ length: 7 }, (_, i) => (
          <View key={`hg${i}`} style={[styles.gridH, { top: ((i + 1) / 8) * containerH }]} />
        ))}

        {/* Obstacles */}
        {snap.obstacles.map(o => (
          <View key={o.id} style={[
            styles.obstacle,
            { left: o.x * scale, top: o.y * scale, width: o.w * scale, height: o.h * scale },
          ]} />
        ))}

        {/* Orbs */}
        {snap.orbs.filter(o => o.visible && !o.collected).map(o => (
          <View key={o.id} style={[
            styles.orb,
            { left: (o.x - OR) * scale, top: (o.y - OR) * scale,
              width: OR * 2 * scale, height: OR * 2 * scale, borderRadius: OR * scale },
          ]} />
        ))}

        {/* Traps */}
        {snap.traps.map(t => (
          <View key={t.id} style={[
            styles.trap,
            { left: (t.x - TR) * scale, top: (t.y - TR) * scale,
              width: TR * 2 * scale, height: TR * 2 * scale, borderRadius: TR * scale },
          ]} />
        ))}

        {/* Player */}
        <View style={[
          styles.player,
          snap.invincible && { opacity: 0.4 },
          { left: (snap.px - PR) * scale, top: (snap.py - PR) * scale,
            width: PR * 2 * scale, height: PR * 2 * scale, borderRadius: PR * scale },
        ]} />

        {/* HUD */}
        <View style={styles.hud}>
          <View style={styles.hudLeft}>
            {Array.from({ length: PLAYER_LIVES }, (_, i) => (
              <View key={i} style={[styles.lifeOrb, i >= snap.lives && styles.lifeOrbEmpty]} />
            ))}
          </View>
          <View style={styles.hudCenter}>
            <Text style={[styles.timerText, { color: timerColor }]}>{remaining}s</Text>
          </View>
          <View style={styles.hudRight}>
            <Text style={styles.scoreText}>{snap.score.toLocaleString()}</Text>
            {snap.combo > 1 && <Text style={styles.comboText}>×{snap.combo}</Text>}
          </View>
        </View>

        {/* Joystick zone (bottom half of arena) */}
        <View
          style={styles.joystickZone}
          {...joy.panHandlers}
        >
          <View style={styles.joystickHint}>
            <Text style={styles.joystickHintText}>
              {Platform.OS === 'web' ? 'WASD / Arrows to move' : 'Drag anywhere to move'}
            </Text>
          </View>
        </View>
      </View>
    </View>
    </View>
  );
}

function Rule({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={ruleStyles.row}>
      <Text style={ruleStyles.icon}>{icon}</Text>
      <Text style={ruleStyles.text}>{text}</Text>
    </View>
  );
}

const ruleStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  icon: { fontSize: 15 },
  text: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: '500' },
});

const styles = StyleSheet.create({
  preGame: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xxl,
    borderWidth: 1,
    borderColor: colors.surfaceBorderLight,
    gap: spacing.lg,
    alignItems: 'center',
    width: '100%',
    maxWidth: MAX_ARENA_W,
    alignSelf: 'center',
  },
  preTitle: { fontSize: fontSize.xxl, fontWeight: '900', color: colors.textPrimary, textAlign: 'center' },
  preSub: { fontSize: fontSize.sm, color: colors.textAccent, fontWeight: '600', textAlign: 'center' },
  preBadge: {
    backgroundColor: colors.primaryMuted,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  preBadgeText: { fontSize: fontSize.sm, fontWeight: '800', color: colors.primary },
  preRules: {
    width: '100%',
    gap: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
  },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xxxl,
    width: '100%',
  },
  startBtnText: { fontSize: fontSize.lg, fontWeight: '800', color: colors.white },
  fairnessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  fairnessText: { fontSize: fontSize.xs, color: '#C084FC', fontWeight: '600' },

  arenaWrap: { borderRadius: borderRadius.xl, overflow: 'hidden' },
  arena: {
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.surfaceBorderLight,
  },
  gridV: {
    position: 'absolute', top: 0, bottom: 0, width: 1,
    backgroundColor: 'rgba(139,92,246,0.06)',
  },
  gridH: {
    position: 'absolute', left: 0, right: 0, height: 1,
    backgroundColor: 'rgba(139,92,246,0.06)',
  },
  player: {
    position: 'absolute',
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
    elevation: 8,
  },
  orb: {
    position: 'absolute',
    backgroundColor: '#A78BFA',
    shadowColor: '#A78BFA',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 6,
  },
  trap: {
    position: 'absolute',
    backgroundColor: '#D946EF',
    shadowColor: '#D946EF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 7,
    elevation: 7,
  },
  obstacle: {
    position: 'absolute',
    backgroundColor: 'rgba(217,70,239,0.4)',
    borderWidth: 1,
    borderColor: '#D946EF',
  },
  hud: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  hudLeft: { flexDirection: 'row', gap: 4 },
  lifeOrb: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOpacity: 0.6,
    shadowRadius: 3,
    elevation: 3,
  },
  lifeOrbEmpty: { backgroundColor: 'rgba(139,92,246,0.2)', shadowOpacity: 0 },
  hudCenter: { },
  timerText: { fontSize: fontSize.xl, fontWeight: '900' },
  hudRight: { alignItems: 'flex-end' },
  scoreText: { fontSize: fontSize.md, fontWeight: '800', color: colors.textPrimary },
  comboText: { fontSize: fontSize.sm, fontWeight: '700', color: '#C084FC' },
  joystickZone: {
    position: 'absolute',
    top: 0, bottom: 0, left: 0, right: 0,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: spacing.md,
  },
  joystickHint: {
    backgroundColor: 'rgba(139,92,246,0.12)',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.2)',
  },
  joystickHintText: {
    fontSize: fontSize.xs,
    color: 'rgba(139,92,246,0.6)',
    fontWeight: '600',
  },
});
