import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, KeyboardAvoidingView, Platform, useWindowDimensions,
  Animated,
} from 'react-native';
import Svg, {
  Polygon, Rect as SvgRect, Text as SvgText, Line as SvgLine, G as SvgG,
  Circle as SvgCircle, Defs as SvgDefs,
  LinearGradient as SvgLinearGradient, Stop as SvgStop,
} from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft, Users, ShoppingBag, Package, Map as MapIcon,
  CreditCard as Edit3, Trash2, RotateCw, X, Crown,
} from 'lucide-react-native';
import {
  WorldRoom, WorldPresence, WorldMessage, WorldRoomItem, WorldInventoryItem,
  AvatarConfig, GRID_W, GRID_H, PLAZA_ROOM_ID,
  upsertPresence, leaveRoom, getRoomPresence, sendMessage, getMessages,
  getRoomItems, placeRoomItem, removeRoomItem, moveRoomItem,
  subscribeToRoomMessages, subscribeToRoomPresence, subscribeToRoomItems,
  subscribeToPositionBroadcasts, broadcastPosition,
} from '@/services/worldService';
import { colors, spacing, fontSize, borderRadius } from '@/constants/theme';
import { WorldSprite, HAIR_SPRITES } from './WorldSprite';

// ─── Constants ────────────────────────────────────────────────────────────────

const PRESENCE_INTERVAL = 8000;
const WALL_H = 68;
const BUBBLE_DURATION = 3200;

interface ThemeVisual {
  wallGradient: readonly [string, string, string];
  floorEven: string;
  floorOdd: string;
  dividerColor: string;
}

const THEME_VISUALS: Record<string, ThemeVisual> = {
  'DAWEN Neon Room':      { wallGradient: ['#0A0520','#130830','#0D0920'], floorEven: 'rgba(100,50,220,0.07)', floorOdd: 'rgba(70,30,160,0.11)', dividerColor: '#8B5CF6' },
  'Purple Lounge':        { wallGradient: ['#120530','#1E0840','#120530'], floorEven: 'rgba(120,60,240,0.08)', floorOdd: 'rgba(90,40,200,0.13)', dividerColor: '#9D4EDD' },
  'Trading Room':         { wallGradient: ['#051005','#0A1F0A','#051005'], floorEven: 'rgba(16,185,129,0.07)', floorOdd: 'rgba(10,120,80,0.11)', dividerColor: '#10B981' },
  'Crew Room':            { wallGradient: ['#0A0A1A','#131328','#0A0A1A'], floorEven: 'rgba(59,130,246,0.07)', floorOdd: 'rgba(37,99,235,0.11)', dividerColor: '#3B82F6' },
  'Cyber Apartment':      { wallGradient: ['#050A15','#0A1525','#050A15'], floorEven: 'rgba(6,182,212,0.07)', floorOdd: 'rgba(8,145,178,0.11)', dividerColor: '#06B6D4' },
  'Solana Studio':        { wallGradient: ['#0A0A05','#141410','#0A0A05'], floorEven: 'rgba(245,158,11,0.06)', floorOdd: 'rgba(217,119,6,0.10)', dividerColor: '#F59E0B' },
  'Royal Purple Suite':   { wallGradient: ['#1A0A30','#260F4A','#1A0A30'], floorEven: 'rgba(167,139,250,0.09)', floorOdd: 'rgba(139,92,246,0.14)', dividerColor: '#A78BFA' },
  'Empty Grid Room':      { wallGradient: ['#080808','#101010','#080808'], floorEven: 'rgba(255,255,255,0.025)', floorOdd: 'rgba(255,255,255,0.04)', dividerColor: 'rgba(255,255,255,0.2)' },
};

const DEFAULT_THEME_VISUAL: ThemeVisual = {
  wallGradient: ['#080812','#0D0D1A','#080812'],
  floorEven: 'rgba(80,60,180,0.05)',
  floorOdd: 'rgba(50,35,130,0.09)',
  dividerColor: 'rgba(139,92,246,0.35)',
};

// ─── WorldAvatarChar ──────────────────────────────────────────────────────────

type AvatarGesture = 'none' | 'wave' | 'dance';

interface AvatarCharProps {
  config: AvatarConfig;
  username: string;
  isPremium: boolean;
  size?: number;
  sitting?: boolean;
  walking?: boolean;
  gesture?: AvatarGesture;
}

function WorldAvatarChar({ config, username, isPremium, size = 48, sitting = false, walking = false, gesture = 'none' }: AvatarCharProps) {
  const walkAnim  = useRef(new Animated.Value(0)).current;
  const waveAnim  = useRef(new Animated.Value(0)).current;
  const danceAnim = useRef(new Animated.Value(0)).current;
  const walkLoopRef  = useRef<Animated.CompositeAnimation | null>(null);
  const waveLoopRef  = useRef<Animated.CompositeAnimation | null>(null);
  const danceLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  // Walk loop — only when walking and no gesture active
  useEffect(() => {
    if (walking && !sitting && gesture === 'none') {
      walkLoopRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(walkAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
          Animated.timing(walkAnim, { toValue: 0, duration: 180, useNativeDriver: true }),
        ])
      );
      walkLoopRef.current.start();
    } else {
      walkLoopRef.current?.stop();
      walkLoopRef.current = null;
      walkAnim.setValue(0);
    }
    return () => { walkLoopRef.current?.stop(); };
  }, [walking, sitting, gesture]);

  // Wave loop
  useEffect(() => {
    if (gesture === 'wave') {
      waveLoopRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(waveAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(waveAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
        ])
      );
      waveLoopRef.current.start();
    } else {
      waveLoopRef.current?.stop();
      waveLoopRef.current = null;
      waveAnim.setValue(0);
    }
    return () => { waveLoopRef.current?.stop(); };
  }, [gesture]);

  // Dance loop
  useEffect(() => {
    if (gesture === 'dance') {
      danceLoopRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(danceAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
          Animated.timing(danceAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
        ])
      );
      danceLoopRef.current.start();
    } else {
      danceLoopRef.current?.stop();
      danceLoopRef.current = null;
      danceAnim.setValue(0);
    }
    return () => { danceLoopRef.current?.stop(); };
  }, [gesture]);

  // Scale everything relative to size (base design at 56px)
  const sc = Math.max(0.5, size / 56);
  const s = (n: number) => Math.max(1, Math.round(n * sc));

  const skinColor = config.bodyColor ?? '#F4C08A';
  const outfitColor = config.outfitColor ?? '#3B82F6';
  const hairIdx = config.hairStyle ?? 0;
  const HairSprite = HAIR_SPRITES[hairIdx] ?? null;
  const hairSize = s(18);

  // Walk — leg/arm alternation
  const leg1Y = walkAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -s(4)] });
  const leg2Y = walkAnim.interpolate({ inputRange: [0, 1], outputRange: [-s(4), 0] });
  const arm1Y = walkAnim.interpolate({ inputRange: [0, 1], outputRange: [0, s(2)] });
  const arm2Y = walkAnim.interpolate({ inputRange: [0, 1], outputRange: [s(2), 0] });

  // Wave — right arm raises up
  const waveArmRot = waveAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-70deg'] });
  const waveArmTY  = waveAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -s(8)] });

  // Dance — body bounce + arms spread
  const danceBodyY  = danceAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -s(5)] });
  const danceArm1R  = danceAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '40deg'] });
  const danceArm2R  = danceAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-40deg'] });

  // Compute arm transforms based on active gesture
  const leftArmTransform  = gesture === 'dance' ? [{ rotate: danceArm1R }] : [{ translateY: arm1Y }];
  const rightArmTransform = gesture === 'wave'
    ? [{ rotate: waveArmRot }, { translateY: waveArmTY }]
    : gesture === 'dance' ? [{ rotate: danceArm2R }] : [{ translateY: arm2Y }];

  return (
    <Animated.View style={[ch.root, gesture === 'dance' && { transform: [{ translateY: danceBodyY }] }]}>
      {/* Aura glow ring */}
      {config.auraColor ? (
        <View style={[ch.aura, {
          width: s(30), height: s(50),
          borderColor: config.auraColor,
          shadowColor: config.auraColor,
        }]} />
      ) : null}

      {/* Premium crown */}
      {isPremium ? (
        <View style={ch.crownWrap}>
          <Crown size={s(10)} color="#F59E0B" fill="#F59E0B" strokeWidth={0} />
        </View>
      ) : null}

      {/* Cap / hat */}
      {HairSprite ? (
        <View style={{ height: hairSize, marginBottom: -s(2) }}>
          <HairSprite size={hairSize} />
        </View>
      ) : (
        <View style={{ alignItems: 'center', marginBottom: -s(1) }}>
          {/* Cap brim */}
          <View style={{
            width: s(22), height: s(3),
            backgroundColor: '#111',
            borderRadius: s(1),
            marginBottom: -s(1),
          }} />
          {/* Cap body */}
          <View style={{
            width: s(20), height: s(8),
            backgroundColor: '#111',
            borderTopLeftRadius: s(5), borderTopRightRadius: s(5),
            justifyContent: 'center', alignItems: 'center',
          }}>
            <Text style={{ fontSize: s(4), color: '#fff', fontWeight: '900', letterSpacing: 0 }}>D</Text>
          </View>
        </View>
      )}

      {/* Head — Habbo-style square with slight rounding */}
      <View style={{
        width: s(18), height: s(16),
        backgroundColor: skinColor,
        borderRadius: s(3),
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.25)',
        justifyContent: 'flex-start',
        alignItems: 'center',
        overflow: 'hidden',
      }}>
        {/* Sunglasses — single dark bar */}
        <View style={{
          marginTop: s(4), width: s(16), height: s(4),
          backgroundColor: '#111', borderRadius: s(1.5),
          flexDirection: 'row', alignItems: 'center',
          justifyContent: 'space-between', paddingHorizontal: s(1),
        }}>
          <View style={{ width: s(6), height: s(3), backgroundColor: '#222', borderRadius: s(1), opacity: 0.8 }} />
          <View style={{ width: s(1), height: s(2), backgroundColor: '#555' }} />
          <View style={{ width: s(6), height: s(3), backgroundColor: '#222', borderRadius: s(1), opacity: 0.8 }} />
        </View>
        {/* Smile line */}
        <View style={{
          width: s(7), height: 1,
          borderBottomWidth: 1.5,
          borderColor: 'rgba(0,0,0,0.35)',
          borderBottomLeftRadius: s(2), borderBottomRightRadius: s(2),
          marginTop: s(3),
        }} />
      </View>

      {/* Neck */}
      <View style={{ width: s(7), height: s(3), backgroundColor: skinColor }} />

      {/* Body row: left arm + torso + right arm */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        {/* Left arm */}
        {sitting ? (
          <View style={{
            width: s(5), height: s(7),
            backgroundColor: outfitColor,
            borderTopLeftRadius: s(2), borderBottomLeftRadius: s(3),
            marginTop: s(1),
            transform: [{ rotate: '50deg' }, { translateX: s(2) }],
          }} />
        ) : (
          <Animated.View style={{
            width: s(5), height: s(12),
            backgroundColor: outfitColor,
            borderTopLeftRadius: s(2), borderBottomLeftRadius: s(3),
            marginTop: s(1),
            transform: leftArmTransform as any,
          }} />
        )}

        {/* Torso */}
        <View style={{
          width: s(14), height: sitting ? s(10) : s(13),
          backgroundColor: outfitColor,
          borderTopLeftRadius: s(2), borderTopRightRadius: s(2),
          justifyContent: 'center', alignItems: 'center',
        }}>
          {/* DAWEN text on chest */}
          <Text style={{ fontSize: s(3.5), color: 'rgba(255,255,255,0.75)', fontWeight: '900', letterSpacing: 0, marginTop: -s(1) }}>DAWEN</Text>
          {/* Belt line */}
          <View style={{
            position: 'absolute',
            bottom: 0, left: 0, right: 0,
            height: s(3),
            backgroundColor: 'rgba(0,0,0,0.25)',
          }} />
        </View>

        {/* Right arm */}
        {sitting ? (
          <View style={{
            width: s(5), height: s(7),
            backgroundColor: outfitColor,
            borderTopRightRadius: s(2), borderBottomRightRadius: s(3),
            marginTop: s(1),
            transform: [{ rotate: '-50deg' }, { translateX: -s(2) }],
          }} />
        ) : (
          <Animated.View style={{
            width: s(5), height: s(12),
            backgroundColor: outfitColor,
            borderTopRightRadius: s(2), borderBottomRightRadius: s(3),
            marginTop: s(1),
            transform: rightArmTransform as any,
          }} />
        )}
      </View>

      {/* Legs */}
      {sitting ? (
        // Sitting: legs extend horizontally forward
        <View style={{ flexDirection: 'row', gap: s(2), marginTop: s(1) }}>
          <View style={{
            width: s(13), height: s(6),
            backgroundColor: '#1A1A2E',
            borderRadius: s(2),
          }} />
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: s(2), marginTop: s(1) }}>
          {/* Left leg */}
          <Animated.View style={{
            width: s(6), height: s(11),
            backgroundColor: '#1C1C3A',
            borderBottomLeftRadius: s(2),
            transform: [{ translateY: leg1Y }],
          }}>
            <View style={{
              position: 'absolute', bottom: 0, left: -s(1),
              width: s(8), height: s(4),
              backgroundColor: '#E8E8E8',
              borderRadius: s(2),
            }} />
          </Animated.View>
          {/* Right leg */}
          <Animated.View style={{
            width: s(6), height: s(11),
            backgroundColor: '#1C1C3A',
            borderBottomRightRadius: s(2),
            transform: [{ translateY: leg2Y }],
          }}>
            <View style={{
              position: 'absolute', bottom: 0, left: -s(1),
              width: s(8), height: s(4),
              backgroundColor: '#E8E8E8',
              borderRadius: s(2),
            }} />
          </Animated.View>
        </View>
      )}

      {/* Name tag */}
      <View style={ch.nameTag}>
        <Text style={ch.nameText} numberOfLines={1}>{username || '???'}</Text>
      </View>
    </Animated.View>
  );
}

const ch = StyleSheet.create({
  root: { alignItems: 'center' },
  aura: {
    position: 'absolute', top: 0, borderWidth: 1.5, opacity: 0.7,
    borderRadius: 20,
    shadowRadius: 8, shadowOpacity: 0.7, elevation: 4,
  },
  crownWrap: { position: 'absolute', top: -6, right: -2, zIndex: 10 },
  nameTag: {
    backgroundColor: 'rgba(0,0,0,0.78)', paddingHorizontal: 4, paddingVertical: 1,
    borderRadius: 4, maxWidth: 64, marginTop: 3,
  },
  nameText: { fontSize: 9, color: '#fff', fontWeight: '700', textAlign: 'center' },
});

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  room: WorldRoom;
  walletAddress: string;
  username: string;
  avatarConfig: AvatarConfig;
  isPremium: boolean;
  inventory: WorldInventoryItem[];
  onBack: () => void;
  onOpenShop: () => void;
  onOpenInventory: () => void;
  onOpenDirectory: () => void;
}

// ─── DawenWorldRoom ───────────────────────────────────────────────────────────

export function DawenWorldRoom({
  room, walletAddress, username, avatarConfig, isPremium,
  inventory, onBack, onOpenShop, onOpenInventory, onOpenDirectory,
}: Props) {
  const { width: screenW } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // ── Isometric projection constants ───────────────────────────────────────
  // ISO_TW = tile diamond width, ISO_TH = tile diamond height (2:1 ratio)
  const ISO_TW = Math.max(40, Math.floor(Math.min(screenW - 8, 480) / ((GRID_W + GRID_H) * 0.5)));
  const ISO_TH = Math.round(ISO_TW / 2);
  const WALL_H = Math.round(ISO_TW * 0.9);
  const ISO_ORIGIN_X = Math.round(GRID_H * ISO_TW / 2);
  const ISO_ORIGIN_Y = WALL_H;
  const ISO_CANVAS_W = (GRID_W + GRID_H) * Math.round(ISO_TW / 2) + 2;
  const ISO_CANVAS_H = WALL_H + (GRID_W + GRID_H) * Math.round(ISO_TH / 2) + ISO_TH + 8;

  function isoToScreen(col: number, row: number) {
    return {
      x: ISO_ORIGIN_X + (col - row) * (ISO_TW / 2),
      y: ISO_ORIGIN_Y + (col + row) * (ISO_TH / 2),
    };
  }

  // Tile top-vertex → diamond polygon points string for SVG
  function tilePoly(col: number, row: number): string {
    const { x, y } = isoToScreen(col, row);
    const hw = ISO_TW / 2, hh = ISO_TH / 2;
    return `${x},${y} ${x + hw},${y + hh} ${x},${y + ISO_TH} ${x - hw},${y + hh}`;
  }

  // Left wall panel polygon (col=0 wall, for each row)
  function leftWallPoly(row: number): string {
    const { x, y } = isoToScreen(0, row);
    const lx = x - ISO_TW / 2, ly = y + ISO_TH / 2;
    return `${x},${y} ${lx},${ly} ${lx},${ly - WALL_H} ${x},${y - WALL_H}`;
  }

  // Back wall panel polygon (row=0 wall, for each col)
  function backWallPoly(col: number): string {
    const { x, y } = isoToScreen(col, 0);
    const rx = x + ISO_TW / 2, ry = y + ISO_TH / 2;
    return `${x},${y} ${rx},${ry} ${rx},${ry - WALL_H} ${x},${y - WALL_H}`;
  }

  // Screen position of the CENTER of a tile (for placing sprites)
  function tileCenterScreen(col: number, row: number) {
    const { x, y } = isoToScreen(col, row);
    return { x, y: y + ISO_TH / 2 };
  }

  const SITTABLE = new Set(['Chairs', 'Sofas', 'Beds', 'Gaming Items']);
  const charSize = Math.max(26, Math.round(ISO_TW * 0.9));

  const isPlaza = room.id === PLAZA_ROOM_ID;
  const isOwner = room.type !== 'official' && room.owner_wallet === walletAddress;
  const themeVis = isPlaza
    ? THEME_VISUALS['DAWEN Neon Room']
    : (THEME_VISUALS[room.theme] ?? DEFAULT_THEME_VISUAL);

  // ── State ──────────────────────────────────────────────────────────────────
  const [presence, setPresence] = useState<WorldPresence[]>([]);
  const [messages, setMessages] = useState<WorldMessage[]>([]);
  const [roomItems, setRoomItems] = useState<WorldRoomItem[]>([]);
  const [myX, setMyX] = useState(5);
  const [myY, setMyY] = useState(4);
  const [sittingOnItemId, setSittingOnItemId] = useState<string | null>(null);
  const [chatText, setChatText] = useState('');
  const [sending, setSending] = useState(false);
  const [decMode, setDecMode] = useState(false);
  const [selectedInvItem, setSelectedInvItem] = useState<WorldInventoryItem | null>(null);
  const [selectedRoomItem, setSelectedRoomItem] = useState<WorldRoomItem | null>(null);
  const [chatBubble, setChatBubble] = useState<string | null>(null);
  const [isWalking, setIsWalking] = useState(false);
  const [myGesture, setMyGesture] = useState<AvatarGesture>('none');
  const walkTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gestureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Smooth movement via Animated (in isometric screen coords) ─────────────
  const initScreen = isoToScreen(5, 4);
  const animX = useRef(new Animated.Value(initScreen.x)).current;
  const animY = useRef(new Animated.Value(initScreen.y)).current;
  const [avatarLeft, setAvatarLeft] = useState(initScreen.x);
  const [avatarTop, setAvatarTop] = useState(initScreen.y);

  useEffect(() => {
    const xId = animX.addListener(({ value }) => setAvatarLeft(value));
    const yId = animY.addListener(({ value }) => setAvatarTop(value));
    return () => { animX.removeListener(xId); animY.removeListener(yId); };
  }, []);

  const animateToTile = useCallback((col: number, row: number) => {
    const { x, y } = isoToScreen(col, row);
    Animated.parallel([
      Animated.spring(animX, { toValue: x, useNativeDriver: false, tension: 160, friction: 16 }),
      Animated.spring(animY, { toValue: y, useNativeDriver: false, tension: 160, friction: 16 }),
    ]).start();
  }, [ISO_TW, ISO_TH, ISO_ORIGIN_X, ISO_ORIGIN_Y]); // eslint-disable-line

  // ── Refs ───────────────────────────────────────────────────────────────────
  const chatRef = useRef<ScrollView>(null);
  const presenceRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bubbleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const otherAnimsRef = useRef<Map<string, { x: Animated.Value; y: Animated.Value }>>(new Map());
  // Channel for instant position broadcasts (lower latency than DB → realtime roundtrip)
  const posChRef = useRef<ReturnType<typeof subscribeToPositionBroadcasts> | null>(null);

  const getOtherAnim = useCallback((wallet: string, startCol: number, startRow: number) => {
    if (!otherAnimsRef.current.has(wallet)) {
      const { x, y } = isoToScreen(startCol, startRow);
      otherAnimsRef.current.set(wallet, {
        x: new Animated.Value(x),
        y: new Animated.Value(y),
      });
    }
    return otherAnimsRef.current.get(wallet)!;
  }, [ISO_TW, ISO_TH, ISO_ORIGIN_X, ISO_ORIGIN_Y]); // eslint-disable-line

  // ── Load initial data ─────────────────────────────────────────────────────
  const loadPresence = useCallback(async () => {
    const p = await getRoomPresence(room.id);
    setPresence(p);
  }, [room.id]);

  const loadMessages = useCallback(async () => {
    const m = await getMessages(room.id, 40);
    setMessages(m);
  }, [room.id]);

  const loadRoomItems = useCallback(async () => {
    const ri = await getRoomItems(room.id);
    setRoomItems(ri);
  }, [room.id]);

  useEffect(() => {
    loadPresence();
    loadMessages();
    loadRoomItems();

    upsertPresence({ walletAddress, roomId: room.id, x: myX, y: myY, username, avatarConfig, isPremium });

    presenceRef.current = setInterval(() => {
      upsertPresence({ walletAddress, roomId: room.id, x: myX, y: myY, username, avatarConfig, isPremium });
    }, PRESENCE_INTERVAL);

    const msgCh = subscribeToRoomMessages(room.id, (msg) => {
      setMessages(prev => {
        if (prev.some(m => m.id === msg.id)) return prev;
        return [...prev.slice(-60), msg];
      });
      setTimeout(() => chatRef.current?.scrollToEnd({ animated: true }), 100);
    });
    // Only reload full presence on INSERT/DELETE (user joins/leaves).
    // UPDATE (position changes) are handled via instant broadcast channel below.
    const presCh = subscribeToRoomPresence(room.id, (eventType) => {
      if (eventType === 'INSERT' || eventType === 'DELETE') loadPresence();
    });
    const itemsCh = subscribeToRoomItems(room.id, loadRoomItems);

    // Subscribe to instant position broadcasts so avatar movement is smooth
    // and not dependent on the slower DB → realtime → loadPresence() roundtrip.
    const posCh = subscribeToPositionBroadcasts(room.id, (data) => {
      if (data.walletAddress === walletAddress) return; // ignore own echoes
      setPresence(prev => {
        const exists = prev.some(p => p.wallet_address === data.walletAddress);
        if (!exists) return prev; // presence subscription handles new player joins
        return prev.map(p =>
          p.wallet_address === data.walletAddress ? { ...p, x: data.x, y: data.y } : p
        );
      });
    });
    posChRef.current = posCh;

    return () => {
      if (presenceRef.current) clearInterval(presenceRef.current);
      if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
      if (walkTimerRef.current) clearTimeout(walkTimerRef.current);
      if (gestureTimerRef.current) clearTimeout(gestureTimerRef.current);
      leaveRoom(walletAddress, room.id);
      supabaseCleanup(msgCh, presCh, itemsCh, posCh);
      posChRef.current = null;
    };
  }, [room.id]); // eslint-disable-line

  useEffect(() => {
    upsertPresence({ walletAddress, roomId: room.id, x: myX, y: myY, username, avatarConfig, isPremium });
  }, [myX, myY]); // eslint-disable-line

  // Animate other users to their new positions when presence updates
  useEffect(() => {
    presence.filter(p => p.wallet_address !== walletAddress).forEach(p => {
      const anim = getOtherAnim(p.wallet_address, p.x, p.y);
      const { x, y } = isoToScreen(p.x, p.y);
      Animated.parallel([
        Animated.spring(anim.x, { toValue: x, useNativeDriver: false, tension: 160, friction: 16 }),
        Animated.spring(anim.y, { toValue: y, useNativeDriver: false, tension: 160, friction: 16 }),
      ]).start();
    });
  }, [presence]); // eslint-disable-line

  // ── Tile tap ──────────────────────────────────────────────────────────────
  const handleTileTap = async (col: number, row: number) => {
    if (decMode && isOwner) {
      if (selectedInvItem) {
        const placed = await placeRoomItem({
          roomId: room.id, walletAddress,
          inventoryItemId: selectedInvItem.id,
          itemId: selectedInvItem.item_id,
          x: col, y: row, rotation: 0,
        });
        if (placed) { setRoomItems(prev => [...prev, placed]); setSelectedInvItem(null); }
        return;
      }
      const hit = roomItems.find(ri => ri.x === col && ri.y === row && ri.owner_wallet === walletAddress);
      if (hit) { setSelectedRoomItem(prev => prev?.id === hit.id ? null : hit); return; }
      setSelectedRoomItem(null);
      return;
    }

    // Check if the tile has a sittable item (chair, sofa, bed, gaming seat)
    const sittableItem = roomItems.find(
      ri => ri.x === col && ri.y === row && SITTABLE.has(ri.catalog_item?.category ?? '')
    );
    if (sittableItem) {
      if (sittingOnItemId === sittableItem.id && myX === col && myY === row) {
        // Already sitting here — stand up
        setSittingOnItemId(null);
      } else {
        // Move to chair and sit
        setMyX(col); setMyY(row);
        animateToTile(col, row);
        setSittingOnItemId(sittableItem.id);
        if (posChRef.current) {
          broadcastPosition(posChRef.current, { walletAddress, x: col, y: row, username, avatarConfig, isPremium });
        }
      }
      return;
    }

    // Moving to empty tile clears sitting state
    setSittingOnItemId(null);
    setMyX(col);
    setMyY(row);
    animateToTile(col, row);
    // Walking animation
    setIsWalking(true);
    if (walkTimerRef.current) clearTimeout(walkTimerRef.current);
    walkTimerRef.current = setTimeout(() => setIsWalking(false), 700);
    if (posChRef.current) {
      broadcastPosition(posChRef.current, { walletAddress, x: col, y: row, username, avatarConfig, isPremium });
    }
  };

  const triggerGesture = (g: AvatarGesture) => {
    if (gestureTimerRef.current) clearTimeout(gestureTimerRef.current);
    if (g === 'none' || myGesture === g) {
      setMyGesture('none');
      return;
    }
    setMyGesture(g);
    // Auto-clear after 6 seconds
    gestureTimerRef.current = setTimeout(() => setMyGesture('none'), 6000);
  };

  const handleRemoveRoomItem = async () => {
    if (!selectedRoomItem) return;
    await removeRoomItem(selectedRoomItem.id);
    setRoomItems(prev => prev.filter(ri => ri.id !== selectedRoomItem.id));
    setSelectedRoomItem(null);
  };

  const handleRotateRoomItem = async () => {
    if (!selectedRoomItem) return;
    const newRot = (selectedRoomItem.rotation + 90) % 360;
    await moveRoomItem(selectedRoomItem.id, selectedRoomItem.x, selectedRoomItem.y, newRot);
    setRoomItems(prev => prev.map(ri => ri.id === selectedRoomItem.id ? { ...ri, rotation: newRot } : ri));
    setSelectedRoomItem(prev => prev ? { ...prev, rotation: newRot } : null);
  };

  const handleSendChat = async () => {
    const text = chatText.trim();
    if (!text || sending) return;
    setSending(true);
    setChatText('');
    await sendMessage({ roomId: room.id, walletAddress, username, text, avatarConfig });
    // Show bubble
    setChatBubble(text.length > 40 ? text.slice(0, 40) + '…' : text);
    if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
    bubbleTimer.current = setTimeout(() => setChatBubble(null), BUBBLE_DURATION);
    setSending(false);
  };

  // ── Merged presence ───────────────────────────────────────────────────────
  const myPresence: WorldPresence = {
    id: 'me', wallet_address: walletAddress, room_id: room.id,
    x: myX, y: myY, username, avatar_config: avatarConfig,
    is_premium: isPremium, is_online: true, last_seen: new Date().toISOString(),
  };
  const otherPresence = presence.filter(p => p.wallet_address !== walletAddress);
  const allCount = 1 + otherPresence.length;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* HUD — matches screenshot layout */}
      <View style={styles.hud}>
        {/* Left info card */}
        <View style={styles.hudInfoCard}>
          <View style={styles.hudTitleRow}>
            <Text style={styles.hudGlobe}>🌐</Text>
            <Text style={styles.hudTitle}>Dawen World</Text>
          </View>
          <Text style={styles.hudRoomName} numberOfLines={1}>Room: {room.name}</Text>
          <View style={styles.hudOnline}>
            <View style={styles.onlineDot} />
            <Text style={styles.hudOnlineText}>Players: {allCount}</Text>
          </View>
        </View>

        <View style={{ flex: 1 }} />

        {/* Right action buttons */}
        <View style={styles.hudRight}>
          <TouchableOpacity style={styles.hudActionBtn}>
            <Users size={17} color="#fff" strokeWidth={2} />
            <View style={styles.hudBadge}><Text style={styles.hudBadgeText}>{allCount}</Text></View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.hudActionBtn}>
            <Text style={{ fontSize: 17 }}>💬</Text>
          </TouchableOpacity>
          {isOwner && (
            <TouchableOpacity
              style={[styles.hudActionBtn, decMode && styles.hudActionBtnActive]}
              onPress={() => { setDecMode(d => !d); setSelectedInvItem(null); setSelectedRoomItem(null); }}
            >
              <Edit3 size={16} color={decMode ? '#fff' : 'rgba(255,255,255,0.7)'} strokeWidth={2} />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.hudActionBtn} onPress={onBack}>
            <ArrowLeft size={17} color="rgba(255,255,255,0.7)" strokeWidth={2} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Decor toolbar */}
      {decMode && isOwner && (
        <View style={styles.decorBar}>
          <Text style={styles.decorInfo} numberOfLines={1}>
            {selectedInvItem
              ? `Placing: ${selectedInvItem.catalog_item?.icon_emoji} ${selectedInvItem.catalog_item?.item_name}`
              : selectedRoomItem
              ? `Selected: ${selectedRoomItem.catalog_item?.icon_emoji} ${selectedRoomItem.catalog_item?.item_name}`
              : 'Pick item below, then tap tile to place'}
          </Text>
          <View style={styles.decorActions}>
            {selectedRoomItem && (
              <>
                <TouchableOpacity style={styles.decorBtn} onPress={handleRotateRoomItem}>
                  <RotateCw size={15} color={colors.primary} strokeWidth={2} />
                </TouchableOpacity>
                <TouchableOpacity style={[styles.decorBtn, styles.decorBtnDanger]} onPress={handleRemoveRoomItem}>
                  <Trash2 size={15} color="#EF4444" strokeWidth={2} />
                </TouchableOpacity>
              </>
            )}
            {selectedInvItem && (
              <TouchableOpacity style={styles.decorBtn} onPress={() => setSelectedInvItem(null)}>
                <X size={15} color="rgba(255,255,255,0.5)" strokeWidth={2} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Room scene — isometric Habbo-style */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'flex-start' }}
        style={styles.sceneScroll}
      >
        <LinearGradient
          colors={['#060610', '#0A0A1A', '#060610']}
          style={{ width: Math.max(ISO_CANVAS_W, screenW), height: ISO_CANVAS_H + 4 }}
        >
          {/* Tap responder layer — inverse iso projection maps touches to grid coords */}
          <View
            style={{ width: ISO_CANVAS_W, height: ISO_CANVAS_H, alignSelf: 'center', position: 'relative' }}
            onStartShouldSetResponder={() => true}
            onResponderRelease={(e) => {
              const lx = e.nativeEvent.locationX;
              const ly = e.nativeEvent.locationY;
              const dx = lx - ISO_ORIGIN_X;
              const dy = ly - ISO_ORIGIN_Y;
              const col = Math.round((dx / (ISO_TW / 2) + dy / (ISO_TH / 2)) / 2);
              const row = Math.round((dy / (ISO_TH / 2) - dx / (ISO_TW / 2)) / 2);
              const cc = Math.max(0, Math.min(GRID_W - 1, col));
              const rr = Math.max(0, Math.min(GRID_H - 1, row));
              handleTileTap(cc, rr);
            }}
          >
            {/* ── SVG: walls + floor tiles ── */}
            <Svg width={ISO_CANVAS_W} height={ISO_CANVAS_H} style={StyleSheet.absoluteFill}>
              {/* Back wall panels (row=0, along all cols) */}
              {Array.from({ length: GRID_W }, (_, col) => (
                <Polygon
                  key={`bw-${col}`}
                  points={backWallPoly(col)}
                  fill={themeVis.wallGradient[1]}
                  stroke={themeVis.dividerColor}
                  strokeWidth={0.6}
                  opacity={0.92}
                />
              ))}

              {/* Left wall panels (col=0, along all rows) */}
              {Array.from({ length: GRID_H }, (_, row) => (
                <Polygon
                  key={`lw-${row}`}
                  points={leftWallPoly(row)}
                  fill={themeVis.wallGradient[0]}
                  stroke={themeVis.dividerColor}
                  strokeWidth={0.6}
                  opacity={0.88}
                />
              ))}

              {/* Floor tiles — depth-sorted (ascending col+row = back to front) */}
              {(() => {
                const tiles: ReactNode[] = [];
                // Sort tiles by depth: col+row ascending
                const sorted: [number, number][] = [];
                for (let col = 0; col < GRID_W; col++) {
                  for (let row = 0; row < GRID_H; row++) {
                    sorted.push([col, row]);
                  }
                }
                sorted.sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]));
                for (const [col, row] of sorted) {
                  const isEven = (col + row) % 2 === 0;
                  const isSelected = selectedRoomItem?.x === col && selectedRoomItem?.y === row;
                  const hasSittable = roomItems.some(
                    ri => ri.x === col && ri.y === row && SITTABLE.has(ri.catalog_item?.category ?? '')
                  );
                  tiles.push(
                    <Polygon
                      key={`t-${col}-${row}`}
                      points={tilePoly(col, row)}
                      fill={
                        isSelected
                          ? themeVis.dividerColor + '55'
                          : hasSittable
                          ? themeVis.dividerColor + '22'
                          : isEven
                          ? themeVis.floorEven
                          : themeVis.floorOdd
                      }
                      stroke={themeVis.dividerColor}
                      strokeWidth={isSelected ? 1.5 : 0.35}
                      strokeOpacity={isSelected ? 0.9 : 0.3}
                    />
                  );
                }
                return tiles;
              })()}
              {/* ── Plaza-specific SVG decorations ───────────────────────────── */}
              {isPlaza && (() => {
                // Wall coord helpers
                // Back wall col c: right edge x at bwX(c), top y at bwYT(c), bottom y at bwYB(c)
                const bwX  = (c: number) => ISO_ORIGIN_X + c * (ISO_TW / 2);
                const bwYT = (c: number) => c * (ISO_TH / 2);
                const bwYB = (c: number) => WALL_H + c * (ISO_TH / 2);
                // Parallelogram polygon on back wall from col c1 to c2, fractions f1-f2 of wall height
                const bwPoly = (c1: number, c2: number, f1: number, f2: number) =>
                  `${bwX(c1)},${bwYT(c1) + f1 * WALL_H} ${bwX(c2)},${bwYT(c2) + f1 * WALL_H} ${bwX(c2)},${bwYT(c2) + f2 * WALL_H} ${bwX(c1)},${bwYT(c1) + f2 * WALL_H}`;

                // Left wall row r: right-edge x at lwXR(r), left-edge x at lwXL(r)
                const lwXR  = (r: number) => ISO_ORIGIN_X - r * (ISO_TW / 2);
                const lwXL  = (r: number) => ISO_ORIGIN_X - r * (ISO_TW / 2) - ISO_TW / 2;
                const lwYTR = (r: number) => r * (ISO_TH / 2);
                const lwYTL = (r: number) => r * (ISO_TH / 2) + ISO_TH / 2;
                // Parallelogram on left wall rows r1 to r2, fractions f1-f2
                const lwPoly = (r1: number, r2: number, f1: number, f2: number) =>
                  `${lwXR(r1)},${lwYTR(r1) + f1 * WALL_H} ${lwXL(r1)},${lwYTL(r1) + f1 * WALL_H} ${lwXL(r2 + 1)},${lwYTL(r2 + 1) + f2 * WALL_H} ${lwXR(r2 + 1)},${lwYTR(r2 + 1) + f2 * WALL_H}`;

                // Floor diamond covering tiles (c1,r1) to (c2,r2)
                const floorDiamond = (c1: number, r1: number, c2: number, r2: number) => {
                  const top  = isoToScreen(c1, r1);
                  const rpt  = isoToScreen(c2, r1);
                  const bot  = isoToScreen(c2, r2);
                  const lpt  = isoToScreen(c1, r2);
                  return `${top.x},${top.y} ${rpt.x + ISO_TW / 2},${rpt.y + ISO_TH / 2} ${bot.x},${bot.y + ISO_TH} ${lpt.x - ISO_TW / 2},${lpt.y + ISO_TH / 2}`;
                };

                const hw = ISO_TW / 2, hh = ISO_TH / 2;

                return (
                  <SvgG>
                    <SvgDefs>
                      <SvgLinearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
                        <SvgStop offset="0%" stopColor="#1A0B3B" stopOpacity="1" />
                        <SvgStop offset="60%" stopColor="#0D0620" stopOpacity="1" />
                        <SvgStop offset="100%" stopColor="#0A0418" stopOpacity="1" />
                      </SvgLinearGradient>
                      <SvgLinearGradient id="rugGrad" x1="0" y1="0" x2="1" y2="1">
                        <SvgStop offset="0%" stopColor="#4C1D95" stopOpacity="0.7" />
                        <SvgStop offset="100%" stopColor="#5B21B6" stopOpacity="0.5" />
                      </SvgLinearGradient>
                    </SvgDefs>

                    {/* ── Brick texture on back wall ── */}
                    {Array.from({ length: GRID_W }, (_, col) =>
                      [1, 2, 3, 4].map(i => {
                        const fy = i * WALL_H / 5;
                        const odd = i % 2 === 1;
                        return (
                          <SvgLine key={`bh${col}-${i}`}
                            x1={bwX(col) + (odd ? hw * 0.3 : 0)} y1={bwYT(col) + fy}
                            x2={bwX(col + 1) + (odd ? hw * 0.3 : 0)} y2={bwYT(col + 1) + fy}
                            stroke="rgba(0,0,0,0.55)" strokeWidth={0.8} />
                        );
                      })
                    )}

                    {/* ── Brick texture on left wall ── */}
                    {Array.from({ length: GRID_H }, (_, row) =>
                      [1, 2, 3, 4].map(i => {
                        const fy = i * WALL_H / 5;
                        return (
                          <SvgLine key={`lh${row}-${i}`}
                            x1={lwXR(row)} y1={lwYTR(row) + fy}
                            x2={lwXL(row)} y2={lwYTL(row) + fy}
                            stroke="rgba(0,0,0,0.55)" strokeWidth={0.8} />
                        );
                      })
                    )}

                    {/* ── DAWEN D banner on left wall (rows 0-1) ── */}
                    <Polygon points={lwPoly(0, 1, 0.05, 0.92)} fill="#0D0820" stroke="#6D28D9" strokeWidth={1.5} />
                    <Polygon points={lwPoly(0, 1, 0.07, 0.9)} fill="#12082E" />
                    {/* "D" symbol */}
                    {(() => {
                      const cx = (lwXR(0) + lwXR(1) + lwXL(0) + lwXL(1)) / 4;
                      const cy = (lwYTR(0) + lwYTR(1) + lwYTL(0) + lwYTL(1)) / 4 + WALL_H * 0.48;
                      const r = Math.min(ISO_TW * 0.22, WALL_H * 0.3);
                      return (
                        <>
                          <SvgCircle cx={cx} cy={cy} r={r + 4} fill="#6D28D9" opacity={0.3} />
                          <SvgCircle cx={cx} cy={cy} r={r} fill="#0D0820" stroke="#A78BFA" strokeWidth={2} />
                          <SvgText x={cx} y={cy + r * 0.35} fill="#A78BFA" fontSize={r * 1.1} fontWeight="900" textAnchor="middle" fontFamily="monospace">D</SvgText>
                        </>
                      );
                    })()}

                    {/* ── "DAWEN" neon text on left wall (rows 2-5) ── */}
                    {(() => {
                      const cx = (lwXR(2) + lwXR(5) + lwXL(2) + lwXL(5)) / 4;
                      const cy = (lwYTR(2) + lwYTR(5) + lwYTL(2) + lwYTL(5)) / 4 + WALL_H * 0.48;
                      const fontSize = Math.max(10, Math.min(ISO_TW * 0.55, WALL_H * 0.38));
                      return (
                        <>
                          {/* Glow layer */}
                          <SvgText x={cx} y={cy} fill="#9D4EDD" fontSize={fontSize} fontWeight="900" textAnchor="middle" opacity={0.6} letterSpacing={2}>DAWEN</SvgText>
                          {/* Crisp layer */}
                          <SvgText x={cx} y={cy} fill="#D4A5FF" fontSize={fontSize} fontWeight="900" textAnchor="middle" letterSpacing={2}>DAWEN</SvgText>
                        </>
                      );
                    })()}

                    {/* ── Left wall flag / banner (rows 5-7) ── */}
                    <Polygon points={lwPoly(5, 6, 0.08, 0.88)} fill="#0A0520" stroke="rgba(109,40,217,0.5)" strokeWidth={1} />
                    {(() => {
                      const cx = (lwXR(5) + lwXR(7) + lwXL(5) + lwXL(7)) / 4;
                      const cy = (lwYTR(5) + lwYTR(7) + lwYTL(5) + lwYTL(7)) / 4 + WALL_H * 0.45;
                      return (
                        <SvgText x={cx} y={cy} fill="rgba(167,139,250,0.6)" fontSize={Math.max(8, ISO_TW * 0.25)} fontWeight="700" textAnchor="middle">DAWEN</SvgText>
                      );
                    })()}

                    {/* ── "DAWEN WORLD" Artwork poster (back wall, cols 2-5) ── */}
                    <Polygon points={bwPoly(2, 6, 0.04, 0.93)} fill="#0D0818" stroke="#6D28D9" strokeWidth={2} />
                    <Polygon points={bwPoly(2.1, 5.9, 0.07, 0.90)} fill="url(#skyGrad)" />
                    {/* City skyline buildings */}
                    {[
                      [2.2, 0.55, 0.2, 0.32], [2.5, 0.45, 0.18, 0.44], [2.9, 0.6, 0.22, 0.29],
                      [3.3, 0.35, 0.2, 0.54], [3.7, 0.5, 0.25, 0.39], [4.1, 0.65, 0.18, 0.24],
                      [4.5, 0.4, 0.22, 0.49], [4.9, 0.55, 0.2, 0.34],
                    ].map(([c, f1, w, h], i) => (
                      <Polygon key={`bld${i}`} points={bwPoly(c, c + w, f1, f1 + h)} fill="rgba(30,10,60,0.9)" stroke="rgba(109,40,217,0.35)" strokeWidth={0.5} />
                    ))}
                    {/* Moon */}
                    {(() => {
                      const moonX = bwX(4.8) + ISO_TW * 0.1;
                      const moonY = bwYT(4.8) + WALL_H * 0.12;
                      const r = Math.min(ISO_TW * 0.12, WALL_H * 0.1);
                      return (
                        <>
                          <SvgCircle cx={moonX} cy={moonY} r={r * 1.6} fill="#4C1D95" opacity={0.4} />
                          <SvgCircle cx={moonX} cy={moonY} r={r} fill="#E9D5FF" />
                        </>
                      );
                    })()}
                    {/* "DAWEN WORLD" text on poster */}
                    {(() => {
                      const cx = bwX(4);
                      const cy = bwYT(4) + WALL_H * 0.2;
                      const fs = Math.max(8, Math.min(ISO_TW * 0.35, WALL_H * 0.22));
                      return (
                        <>
                          <SvgText x={cx} y={cy} fill="#9D4EDD" fontSize={fs + 2} fontWeight="900" textAnchor="middle" opacity={0.5}>DAWEN</SvgText>
                          <SvgText x={cx} y={cy} fill="#C4B5FD" fontSize={fs} fontWeight="900" textAnchor="middle" letterSpacing={1}>DAWEN</SvgText>
                          <SvgText x={cx} y={cy + fs * 1.3} fill="#A78BFA" fontSize={fs * 0.75} fontWeight="700" textAnchor="middle" letterSpacing={2}>WORLD</SvgText>
                        </>
                      );
                    })()}

                    {/* ── Window / City view (back wall, cols 6-8) ── */}
                    <Polygon points={bwPoly(6, 9, 0.05, 0.88)} fill="#050310" stroke="#3B0764" strokeWidth={1.5} />
                    <Polygon points={bwPoly(6.1, 8.9, 0.08, 0.85)} fill="url(#skyGrad)" />
                    {/* Window frame dividers */}
                    <SvgLine x1={bwX(7.5)} y1={bwYT(7.5) + 0.08 * WALL_H} x2={bwX(7.5)} y2={bwYT(7.5) + 0.85 * WALL_H} stroke="#3B0764" strokeWidth={2} />
                    <SvgLine x1={bwX(6.1)} y1={bwYT(6.1) + WALL_H * 0.47} x2={bwX(8.9)} y2={bwYT(8.9) + WALL_H * 0.47} stroke="#3B0764" strokeWidth={1.5} />
                    {/* City buildings in window */}
                    {[
                      [6.2, 0.5, 0.25, 0.34], [6.6, 0.4, 0.2, 0.44], [7.0, 0.55, 0.22, 0.29],
                      [7.6, 0.38, 0.2, 0.46], [8.0, 0.52, 0.18, 0.32], [8.4, 0.45, 0.22, 0.38],
                    ].map(([c, f1, w, h], i) => (
                      <Polygon key={`win${i}`} points={bwPoly(c, c + w, f1, f1 + h)} fill="rgba(20,5,45,0.95)" stroke="rgba(109,40,217,0.3)" strokeWidth={0.5} />
                    ))}
                    {/* Moon in window */}
                    {(() => {
                      const mx = bwX(8.2) + ISO_TW * 0.05;
                      const my = bwYT(8.2) + WALL_H * 0.13;
                      const r = Math.min(ISO_TW * 0.1, WALL_H * 0.09);
                      return (
                        <>
                          <SvgCircle cx={mx} cy={my} r={r * 1.5} fill="#4C1D95" opacity={0.35} />
                          <SvgCircle cx={mx} cy={my} r={r} fill="#F3E8FF" />
                        </>
                      );
                    })()}

                    {/* ── "BUILD TRADE PLAY EARN" sign (back wall, cols 6-8, upper half) ── */}
                    <Polygon points={bwPoly(6.15, 7.4, 0.09, 0.43)} fill="#0A0218" stroke="#4C1D95" strokeWidth={1} />
                    {(() => {
                      const cx = bwX(6.8);
                      const baseY = bwYT(6.8) + WALL_H * 0.15;
                      const fs = Math.max(5, Math.min(ISO_TW * 0.17, WALL_H * 0.12));
                      const lines = ['BUILD', 'TRADE', 'PLAY', 'EARN'];
                      return lines.map((line, i) => (
                        <SvgText key={`sign${i}`} x={cx} y={baseY + i * fs * 1.35} fill="#C4B5FD" fontSize={fs} fontWeight="800" textAnchor="middle" letterSpacing={1}>{line}</SvgText>
                      ));
                    })()}
                    {/* D logo under text */}
                    {(() => {
                      const cx = bwX(7.0);
                      const cy = bwYT(7.0) + WALL_H * 0.73;
                      const r = Math.min(ISO_TW * 0.1, WALL_H * 0.08);
                      return (
                        <>
                          <SvgCircle cx={cx} cy={cy} r={r} fill="#0D0820" stroke="#6D28D9" strokeWidth={1.5} />
                          <SvgText x={cx} y={cy + r * 0.35} fill="#A78BFA" fontSize={r * 1.0} fontWeight="900" textAnchor="middle" fontFamily="monospace">D</SvgText>
                        </>
                      );
                    })()}

                    {/* ── "DAWEN ARCADE" neon sign (far right, back wall cols 8-10) ── */}
                    <Polygon points={bwPoly(8, 10, 0.06, 0.55)} fill="#0A0520" stroke="#9D4EDD" strokeWidth={1.5} />
                    {(() => {
                      const cx = bwX(9);
                      const cy = bwYT(9) + WALL_H * 0.22;
                      const fs = Math.max(7, Math.min(ISO_TW * 0.28, WALL_H * 0.18));
                      return (
                        <>
                          <SvgText x={cx} y={cy} fill="#9D4EDD" fontSize={fs + 2} fontWeight="900" textAnchor="middle" opacity={0.7}>DAWEN</SvgText>
                          <SvgText x={cx} y={cy} fill="#E9D5FF" fontSize={fs} fontWeight="900" textAnchor="middle">DAWEN</SvgText>
                          <SvgText x={cx} y={cy + fs * 1.3} fill="#E9D5FF" fontSize={fs} fontWeight="900" textAnchor="middle">ARCADE</SvgText>
                        </>
                      );
                    })()}

                    {/* ── Shelving units along back wall (cols 0-2) ── */}
                    {(() => {
                      const shelfX = bwX(0.3);
                      const shelfY = bwYT(0.3) + WALL_H * 0.15;
                      const sw = bwX(1.8) - bwX(0.3);
                      const sh = WALL_H * 0.7;
                      // Shelf box
                      return (
                        <Polygon points={bwPoly(0.1, 1.9, 0.12, 0.88)} fill="#0E0A1A" stroke="#3B0764" strokeWidth={1} />
                      );
                    })()}

                    {/* ── Purple rug on floor (center tiles 3-6, rows 2-5) ── */}
                    <Polygon points={floorDiamond(3, 2, 6, 5)} fill="url(#rugGrad)" stroke="#7C3AED" strokeWidth={1.8} opacity={0.85} />
                    {/* Rug border inner */}
                    <Polygon points={floorDiamond(3.5, 2.5, 5.5, 4.5)} fill="none" stroke="#9D4EDD" strokeWidth={1} strokeDasharray="3,2" opacity={0.6} />
                    {/* Rug D logo */}
                    {(() => {
                      const center = isoToScreen(4.5, 3.5);
                      const cx = center.x;
                      const cy = center.y + ISO_TH / 2;
                      const r = Math.min(ISO_TW * 0.3, ISO_TH * 1.2);
                      return (
                        <>
                          <SvgCircle cx={cx} cy={cy} r={r} fill="#5B21B6" opacity={0.5} />
                          <SvgText x={cx} y={cy + r * 0.35} fill="#C4B5FD" fontSize={r * 1.2} fontWeight="900" textAnchor="middle" fontFamily="monospace" opacity={0.7}>D</SvgText>
                        </>
                      );
                    })()}

                    {/* ── Checkered floor section (right, cols 7-9, rows 3-6) ── */}
                    {Array.from({ length: 3 }, (_, ci) =>
                      Array.from({ length: 4 }, (_, ri) => {
                        const col = 7 + ci, row = 3 + ri;
                        const isEvenCheck = (col + row) % 2 === 0;
                        return (
                          <Polygon key={`ck-${col}-${row}`}
                            points={tilePoly(col, row)}
                            fill={isEvenCheck ? 'rgba(30,15,60,0.6)' : 'rgba(200,200,210,0.12)'}
                            stroke="rgba(100,60,180,0.2)" strokeWidth={0.3} />
                        );
                      })
                    )}

                    {/* ── Sofa frame (lower left, cols 1-3, rows 5-7) ── */}
                    {(() => {
                      const pos1 = isoToScreen(1, 6);
                      const pos2 = isoToScreen(3, 5);
                      const sofaW = Math.abs(pos2.x - pos1.x) + ISO_TW;
                      const sofaH = ISO_TH * 2;
                      return null; // Rendered as world items from DB
                    })()}

                    {/* ── Arcade machine outline (right, col 8-9, row 1-2) ── */}
                    {(() => {
                      const p = isoToScreen(8.5, 1.5);
                      const aw = ISO_TW * 0.7;
                      const ah = WALL_H * 0.7;
                      return (
                        <SvgRect x={p.x - aw / 2} y={p.y - ah + ISO_TH / 4} width={aw} height={ah} fill="#0D0820" stroke="#9D4EDD" strokeWidth={1.5} rx={3} />
                      );
                    })()}

                    {/* ── Elevation tile glow under avatar spawn ── */}
                    <Polygon points={tilePoly(5, 4)} fill="rgba(139,92,246,0.12)" stroke="#8B5CF6" strokeWidth={1.5} />
                  </SvgG>
                );
              })()}

            </Svg>

            {/* Room name label — only for non-plaza rooms */}
            {!isPlaza && (
              <View
                style={[styles.isoRoomLabel, {
                  left: ISO_ORIGIN_X - 60,
                  top: Math.round(WALL_H * 0.2),
                }]}
              >
                <Text style={styles.isoRoomLabelText} numberOfLines={1}>
                  {room.name}
                </Text>
              </View>
            )}

            {/* ── Furniture + avatars (depth-sorted Views on top of SVG) ── */}
            {(() => {
              type DepthNode = { depth: number; node: ReactNode };
              const nodes: DepthNode[] = [];

              // Furniture
              roomItems.forEach(ri => {
                const center = tileCenterScreen(ri.x, ri.y);
                const color = ri.catalog_item?.color_hex ?? '#8B5CF6';
                const isSelectedItem = ri.id === selectedRoomItem?.id;
                const spriteSize = Math.round(ISO_TW * 0.88);
                nodes.push({
                  depth: ri.x + ri.y,
                  node: (
                    <View
                      key={`ri-${ri.id}`}
                      pointerEvents="none"
                      style={[styles.isoFurniture, {
                        left: center.x - spriteSize / 2,
                        top: center.y - spriteSize + ISO_TH / 4,
                        width: spriteSize,
                        height: spriteSize,
                        borderColor: isSelectedItem ? '#ffffff' : 'transparent',
                        shadowColor: color,
                      }]}
                    >
                      <WorldSprite emoji={ri.catalog_item?.icon_emoji ?? '📦'} size={spriteSize - 4} color={color} />
                    </View>
                  ),
                });
              });

              // Other players
              otherPresence.forEach(p => {
                const cfg = p.avatar_config ?? { bodyColor: '#8B5CF6', outfitColor: '#EC4899', hairStyle: 0, auraColor: null };
                const anim = getOtherAnim(p.wallet_address, p.x, p.y);
                nodes.push({
                  depth: p.x + p.y + 0.5,
                  node: (
                    <Animated.View
                      key={`op-${p.wallet_address}`}
                      style={[styles.isoAvatarWrap, {
                        left: Animated.subtract(anim.x, charSize / 2) as any,
                        top: Animated.subtract(anim.y, charSize - ISO_TH / 4) as any,
                      }]}
                    >
                      <WorldAvatarChar config={cfg} username={p.username || p.wallet_address.slice(0, 4)} isPremium={p.is_premium} size={charSize} />
                    </Animated.View>
                  ),
                });
              });

              // My avatar
              nodes.push({
                depth: myX + myY + 0.5,
                node: (
                  <Animated.View
                    key="my-avatar"
                    pointerEvents="none"
                    style={[styles.isoAvatarWrap, {
                      left: Animated.subtract(animX, charSize / 2) as any,
                      top: Animated.subtract(animY, charSize - ISO_TH / 4) as any,
                    }]}
                  >
                    {chatBubble ? (
                      <View style={styles.chatBubble}>
                        <Text style={styles.chatBubbleText}>{chatBubble}</Text>
                        <View style={styles.chatBubbleTail} />
                      </View>
                    ) : null}
                    <WorldAvatarChar
                      config={avatarConfig}
                      username={username}
                      isPremium={isPremium}
                      size={charSize}
                      sitting={sittingOnItemId !== null}
                      walking={isWalking && sittingOnItemId === null && myGesture === 'none'}
                      gesture={myGesture}
                    />
                  </Animated.View>
                ),
              });

              nodes.sort((a, b) => a.depth - b.depth);
              return nodes.map(n => n.node);
            })()}
          </View>
        </LinearGradient>
      </ScrollView>

      {/* Decor inventory quick bar */}
      {decMode && isOwner && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.invBar}
          contentContainerStyle={styles.invBarContent}
        >
          {inventory.filter(i => i.quantity > 0).map(inv => (
            <TouchableOpacity
              key={inv.id}
              style={[styles.invBarItem, selectedInvItem?.id === inv.id && styles.invBarItemActive]}
              onPress={() => setSelectedInvItem(prev => prev?.id === inv.id ? null : inv)}
            >
              <WorldSprite
                emoji={inv.catalog_item?.icon_emoji ?? '📦'}
                size={Math.round(ISO_TW * 0.72)}
                color={inv.catalog_item?.color_hex ?? '#8B5CF6'}
              />
              {inv.quantity > 1 && <Text style={styles.invBarQty}>×{inv.quantity}</Text>}
            </TouchableOpacity>
          ))}
          {inventory.length === 0 && (
            <Text style={styles.invBarEmpty}>No items — visit the Shop!</Text>
          )}
        </ScrollView>
      )}

      {/* Chat */}
      <View style={styles.chatArea}>
        <ScrollView
          ref={chatRef}
          style={styles.chatScroll}
          onContentSizeChange={() => chatRef.current?.scrollToEnd({ animated: false })}
          showsVerticalScrollIndicator={false}
        >
          {messages.map(m => (
            <View key={m.id} style={styles.chatMsg}>
              <Text style={styles.chatUser}>
                {m.username || m.wallet_address.slice(0, 4)}
                {m.wallet_address === walletAddress ? ' (you)' : ''}
              </Text>
              <Text style={styles.chatText}>{m.message_text}</Text>
            </View>
          ))}
          {messages.length === 0 && (
            <Text style={styles.chatEmpty}>Say hello to the room!</Text>
          )}
        </ScrollView>
        {/* Gesture bar */}
        <View style={styles.gestureBar}>
          {(['wave', 'dance', 'sit'] as const).map((g) => {
            const labels: Record<string, string> = { wave: '👋 Wave', dance: '🕺 Dance', sit: '🪑 Sit' };
            const isActive = g === 'sit' ? sittingOnItemId !== null : myGesture === g;
            return (
              <TouchableOpacity
                key={g}
                style={[styles.gestureBtn, isActive && styles.gestureBtnActive]}
                onPress={() => {
                  if (g === 'sit') {
                    if (sittingOnItemId !== null) setSittingOnItemId(null);
                  } else {
                    triggerGesture(g as AvatarGesture);
                  }
                }}
                activeOpacity={0.75}
              >
                <Text style={[styles.gestureBtnText, isActive && styles.gestureBtnTextActive]}>
                  {labels[g]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.chatInputRow}>
          <TextInput
            style={styles.chatInput}
            value={chatText}
            onChangeText={setChatText}
            placeholder="Say something..."
            placeholderTextColor="rgba(255,255,255,0.28)"
            returnKeyType="send"
            onSubmitEditing={handleSendChat}
            maxLength={200}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!chatText.trim() || sending) && { opacity: 0.35 }]}
            onPress={handleSendChat}
            disabled={!chatText.trim() || sending}
          >
            <Text style={styles.sendBtnText}>→</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Bottom Nav */}
      <View style={[styles.bottomNav, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <NavBtn icon={MapIcon} label="Rooms" onPress={onOpenDirectory} />
        <NavBtn icon={ShoppingBag} label="Shop" onPress={onOpenShop} />
        <NavBtn icon={Package} label="Items" onPress={onOpenInventory} />
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── NavBtn ───────────────────────────────────────────────────────────────────

function NavBtn({ icon: Icon, label, onPress }: { icon: any; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.navBtn} onPress={onPress} activeOpacity={0.75}>
      <Icon size={20} color="rgba(255,255,255,0.6)" strokeWidth={2} />
      <Text style={styles.navBtnLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Cleanup helper ───────────────────────────────────────────────────────────

function supabaseCleanup(...channels: any[]) {
  const { supabase: sb } = require('@/lib/supabase');
  channels.forEach(ch => { try { sb.removeChannel(ch); } catch {} });
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#060610' },

  // HUD
  hud: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.82)', gap: 8,
    borderBottomWidth: 0,
  },
  hudInfoCard: {
    backgroundColor: 'rgba(0,0,0,0.78)',
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.15)',
  },
  hudTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 },
  hudGlobe: { fontSize: 14 },
  hudTitle: { fontSize: 14, fontWeight: '800', color: '#fff' },
  hudBtn: {
    width: 34, height: 34, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center', alignItems: 'center',
  },
  hudBtnActive: { backgroundColor: colors.primary },
  hudCenter: { flex: 1, alignItems: 'center' },
  hudRoomName: { fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: '500' },
  hudOnline: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  onlineDot: {
    width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981',
    shadowColor: '#10B981', shadowRadius: 4, shadowOpacity: 0.8, elevation: 3,
  },
  hudOnlineText: { fontSize: 11, color: '#10B981', fontWeight: '600' },
  hudRight: { flexDirection: 'row', gap: 8 },
  hudActionBtn: {
    width: 42, height: 42, borderRadius: 12,
    backgroundColor: 'rgba(30,20,60,0.85)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.2)',
    position: 'relative',
  },
  hudActionBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  hudBadge: {
    position: 'absolute', top: -4, right: -4,
    backgroundColor: colors.primary, borderRadius: 8,
    minWidth: 16, height: 16, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 3,
  },
  hudBadgeText: { fontSize: 9, color: '#fff', fontWeight: '800' },

  // Decor bar
  decorBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: 7,
    backgroundColor: 'rgba(139,92,246,0.15)',
    borderBottomWidth: 1, borderBottomColor: 'rgba(139,92,246,0.3)',
  },
  decorInfo: { fontSize: 11, color: 'rgba(255,255,255,0.75)', fontWeight: '600', flex: 1 },
  decorActions: { flexDirection: 'row', gap: 6 },
  decorBtn: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center', alignItems: 'center',
  },
  decorBtnDanger: { backgroundColor: 'rgba(239,68,68,0.15)' },

  // Scene
  sceneScroll: { flex: 1 },

  // Wall
  wall: {
    height: WALL_H, position: 'relative', overflow: 'hidden',
  },
  wallPanel: {
    position: 'absolute', top: 8, height: WALL_H - 24,
    backgroundColor: 'rgba(139,92,246,0.06)',
    borderWidth: 0.5, borderColor: 'rgba(139,92,246,0.12)',
    borderRadius: 4,
  },
  wallDivider: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 2,
    backgroundColor: 'rgba(139,92,246,0.35)',
    shadowOpacity: 0.8, shadowRadius: 6,
  },
  plazaSign: {
    position: 'absolute', alignSelf: 'center', top: 10,
    alignItems: 'center', left: 0, right: 0,
  },
  plazaSignText: {
    fontSize: 18, fontWeight: '900', color: '#fff', letterSpacing: 3,
    textShadowColor: '#8B5CF6', textShadowRadius: 12, textShadowOffset: { width: 0, height: 0 },
  },
  plazaSignGlow: {
    position: 'absolute', top: -4, left: -20, right: -20, bottom: -4,
    backgroundColor: 'rgba(139,92,246,0.08)', borderRadius: 8,
  },
  roomSignWrap: {
    position: 'absolute', top: 12, alignSelf: 'center', left: 0, right: 0, alignItems: 'center',
  },
  roomSignText: {
    fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.35)', letterSpacing: 1.5,
    textTransform: 'uppercase',
  },

  // Floor grid
  gridContainer: { position: 'relative', overflow: 'hidden' },
  tile: {
    position: 'absolute',
    borderWidth: 0.5, borderColor: 'rgba(139,92,246,0.1)',
  },
  tileSelected: { backgroundColor: 'rgba(139,92,246,0.28)' },

  // Room items
  roomItem: {
    position: 'absolute', borderRadius: 5, borderWidth: 1,
    justifyContent: 'center', alignItems: 'center',
    shadowRadius: 4, shadowOpacity: 0.4, elevation: 3,
  },
  roomItemEmoji: {},

  // Isometric scene
  isoRoomLabel: {
    position: 'absolute', zIndex: 2, alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 4,
  },
  isoRoomLabelText: {
    fontSize: 13, fontWeight: '900', color: 'rgba(255,255,255,0.45)',
    letterSpacing: 2.5, textTransform: 'uppercase',
  },
  isoFurniture: {
    position: 'absolute', justifyContent: 'center', alignItems: 'center',
    zIndex: 3,
    borderWidth: 1, borderRadius: 4,
    shadowOpacity: 0.35, shadowRadius: 4, elevation: 3,
  },
  isoAvatarWrap: { position: 'absolute', alignItems: 'center', zIndex: 5 },

  // Avatars (legacy, keep for compatibility)
  avatarWrap: { position: 'absolute', alignItems: 'center' },
  chatBubble: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 5,
    maxWidth: 110,
    marginBottom: 4,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 4, elevation: 4,
    position: 'relative',
    alignSelf: 'center',
  },
  chatBubbleText: { fontSize: 11, color: '#111', fontWeight: '600', lineHeight: 15 },
  chatBubbleTail: {
    position: 'absolute', bottom: -5, left: '50%', marginLeft: -5,
    width: 10, height: 10, backgroundColor: '#fff',
    transform: [{ rotate: '45deg' }],
  },

  // Inventory quick bar
  invBar: {
    maxHeight: 60, borderTopWidth: 1,
    borderTopColor: 'rgba(139,92,246,0.2)',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  invBarContent: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.sm, paddingVertical: 7, gap: 6,
  },
  invBarItem: {
    width: 44, height: 44, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.07)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: 'transparent',
  },
  invBarItemActive: { borderColor: colors.primary, backgroundColor: colors.primaryMuted },
  invBarEmoji: {},
  invBarQty: {
    fontSize: 9, color: colors.primary, fontWeight: '800',
    position: 'absolute', bottom: 2, right: 4,
  },
  invBarEmpty: { fontSize: 11, color: 'rgba(255,255,255,0.3)', padding: spacing.sm },

  // Chat
  chatArea: {
    borderTopWidth: 1, borderTopColor: 'rgba(139,92,246,0.15)',
    backgroundColor: 'rgba(0,0,0,0.45)', maxHeight: 160,
  },
  chatScroll: { maxHeight: 100, paddingHorizontal: spacing.md, paddingVertical: 5 },
  chatMsg: { marginBottom: 4 },
  chatUser: { fontSize: 10, fontWeight: '800', color: colors.primary, marginBottom: 1 },
  chatText: { fontSize: 12, color: 'rgba(255,255,255,0.85)', fontWeight: '500' },
  chatEmpty: { fontSize: 11, color: 'rgba(255,255,255,0.25)', padding: 8 },
  chatInputRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10, gap: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  chatInput: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.09)',
    borderRadius: 24, paddingHorizontal: 16,
    paddingVertical: 9, fontSize: 14, color: '#fff',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  sendBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: colors.primary,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: colors.primary, shadowRadius: 6, shadowOpacity: 0.5, elevation: 4,
  },
  sendBtnText: { fontSize: 18, color: '#fff', fontWeight: '700', marginTop: -1 },
  gestureBar: {
    flexDirection: 'row', gap: 6,
    paddingHorizontal: spacing.md, paddingVertical: 5,
    borderTopWidth: 1, borderTopColor: 'rgba(139,92,246,0.08)',
  },
  gestureBtn: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.2)',
  },
  gestureBtnActive: {
    backgroundColor: 'rgba(139,92,246,0.22)', borderColor: colors.primary,
  },
  gestureBtnText: { fontSize: 11, color: 'rgba(255,255,255,0.55)', fontWeight: '600' },
  gestureBtnTextActive: { color: colors.primary },

  // Bottom nav
  bottomNav: {
    flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.85)',
    borderTopWidth: 1, borderTopColor: 'rgba(139,92,246,0.2)',
  },
  navBtn: { flex: 1, alignItems: 'center', paddingVertical: 9, gap: 3 },
  navBtnLabel: { fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: '600' },
});
