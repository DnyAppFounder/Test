import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, KeyboardAvoidingView, Platform, useWindowDimensions,
  Animated,
} from 'react-native';
import Svg, { Polygon } from 'react-native-svg';
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

interface AvatarCharProps {
  config: AvatarConfig;
  username: string;
  isPremium: boolean;
  size?: number;
  sitting?: boolean;
  walking?: boolean;
}

function WorldAvatarChar({ config, username, isPremium, size = 48, sitting = false, walking = false }: AvatarCharProps) {
  const walkAnim = useRef(new Animated.Value(0)).current;
  const walkLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (walking && !sitting) {
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
  }, [walking, sitting]);

  // Scale everything relative to size (base design at 56px)
  const sc = Math.max(0.5, size / 56);
  const s = (n: number) => Math.max(1, Math.round(n * sc));

  const skinColor = config.bodyColor ?? '#F4C08A';
  const outfitColor = config.outfitColor ?? '#3B82F6';
  const hairIdx = config.hairStyle ?? 0;
  const HairSprite = HAIR_SPRITES[hairIdx] ?? null;
  const hairSize = s(18);

  // Leg alternation — opposite phases
  const leg1Y = walkAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -s(4)] });
  const leg2Y = walkAnim.interpolate({ inputRange: [0, 1], outputRange: [-s(4), 0] });
  const arm1Y = walkAnim.interpolate({ inputRange: [0, 1], outputRange: [0, s(2)] });
  const arm2Y = walkAnim.interpolate({ inputRange: [0, 1], outputRange: [s(2), 0] });

  return (
    <View style={ch.root}>
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

      {/* Hair / hat */}
      {HairSprite ? (
        <View style={{ height: hairSize, marginBottom: -s(2) }}>
          <HairSprite size={hairSize} />
        </View>
      ) : (
        <View style={{
          width: s(20), height: s(9),
          backgroundColor: '#5B3A1A',
          borderTopLeftRadius: s(5), borderTopRightRadius: s(5),
          marginBottom: -s(2),
        }} />
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
        {/* Eyes — rectangular Habbo-style */}
        <View style={{ flexDirection: 'row', gap: s(4), marginTop: s(4) }}>
          <View style={{ width: s(3), height: s(4), backgroundColor: '#1A1A2E', borderRadius: 1 }} />
          <View style={{ width: s(3), height: s(4), backgroundColor: '#1A1A2E', borderRadius: 1 }} />
        </View>
        {/* Smile line */}
        <View style={{
          width: s(7), height: 1,
          borderBottomWidth: 1.5,
          borderColor: 'rgba(0,0,0,0.35)',
          borderBottomLeftRadius: s(2), borderBottomRightRadius: s(2),
          marginTop: s(2),
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
            transform: [{ translateY: arm1Y }],
          }} />
        )}

        {/* Torso */}
        <View style={{
          width: s(14), height: sitting ? s(10) : s(13),
          backgroundColor: outfitColor,
          borderTopLeftRadius: s(2), borderTopRightRadius: s(2),
        }}>
          {/* Shirt pocket detail */}
          <View style={{
            position: 'absolute',
            width: s(4), height: s(4),
            top: s(3), left: s(3),
            backgroundColor: 'rgba(255,255,255,0.18)',
            borderRadius: 1,
          }} />
          {/* Belt line */}
          <View style={{
            position: 'absolute',
            bottom: 0, left: 0, right: 0,
            height: s(3),
            backgroundColor: 'rgba(0,0,0,0.18)',
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
            transform: [{ translateY: arm2Y }],
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
              backgroundColor: '#2C2020',
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
              backgroundColor: '#2C2020',
              borderRadius: s(2),
            }} />
          </Animated.View>
        </View>
      )}

      {/* Name tag */}
      <View style={ch.nameTag}>
        <Text style={ch.nameText} numberOfLines={1}>{username || '???'}</Text>
      </View>
    </View>
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
  const walkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    const presCh = subscribeToRoomPresence(room.id, loadPresence);
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
      {/* HUD */}
      <View style={styles.hud}>
        <TouchableOpacity onPress={onBack} style={styles.hudBtn}>
          <ArrowLeft size={18} color="#fff" strokeWidth={2.5} />
        </TouchableOpacity>
        <View style={styles.hudCenter}>
          <Text style={styles.hudRoomName} numberOfLines={1}>{room.name}</Text>
          <View style={styles.hudOnline}>
            <View style={styles.onlineDot} />
            <Users size={11} color={colors.primary} strokeWidth={2.5} />
            <Text style={styles.hudOnlineText}>{allCount} online</Text>
          </View>
        </View>
        <View style={styles.hudRight}>
          {isOwner && (
            <TouchableOpacity
              style={[styles.hudBtn, decMode && styles.hudBtnActive]}
              onPress={() => { setDecMode(d => !d); setSelectedInvItem(null); setSelectedRoomItem(null); }}
            >
              <Edit3 size={16} color={decMode ? '#fff' : 'rgba(255,255,255,0.5)'} strokeWidth={2} />
            </TouchableOpacity>
          )}
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
            </Svg>

            {/* Room name label on back wall */}
            <View
              style={[styles.isoRoomLabel, {
                left: ISO_ORIGIN_X - 60,
                top: Math.round(WALL_H * 0.2),
              }]}
            >
              <Text style={styles.isoRoomLabelText} numberOfLines={1}>
                {isPlaza ? 'DAWEN WORLD' : room.name}
              </Text>
            </View>

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
                      walking={isWalking && sittingOnItemId === null}
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
        <View style={styles.chatInputRow}>
          <TextInput
            style={styles.chatInput}
            value={chatText}
            onChangeText={setChatText}
            placeholder="Chat in room…"
            placeholderTextColor="rgba(255,255,255,0.3)"
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
    paddingHorizontal: spacing.md, paddingVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderBottomWidth: 1, borderBottomColor: 'rgba(139,92,246,0.25)', gap: 8,
  },
  hudBtn: {
    width: 34, height: 34, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center', alignItems: 'center',
  },
  hudBtnActive: { backgroundColor: colors.primary },
  hudCenter: { flex: 1, alignItems: 'center' },
  hudRoomName: { fontSize: fontSize.md, fontWeight: '800', color: '#fff' },
  hudOnline: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  onlineDot: {
    width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981',
    shadowColor: '#10B981', shadowRadius: 4, shadowOpacity: 0.8, elevation: 3,
  },
  hudOnlineText: { fontSize: 10, color: colors.primary, fontWeight: '700' },
  hudRight: { flexDirection: 'row', gap: 6 },

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
    paddingHorizontal: spacing.md, paddingVertical: 7, gap: 8,
    borderTopWidth: 1, borderTopColor: 'rgba(139,92,246,0.1)',
  },
  chatInput: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: borderRadius.md, paddingHorizontal: spacing.md,
    paddingVertical: 7, fontSize: 13, color: '#fff',
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.2)',
  },
  sendBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: colors.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  sendBtnText: { fontSize: 16, color: '#fff', fontWeight: '700' },

  // Bottom nav
  bottomNav: {
    flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.85)',
    borderTopWidth: 1, borderTopColor: 'rgba(139,92,246,0.2)',
  },
  navBtn: { flex: 1, alignItems: 'center', paddingVertical: 9, gap: 3 },
  navBtnLabel: { fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: '600' },
});
