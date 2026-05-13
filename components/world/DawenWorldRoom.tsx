import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, KeyboardAvoidingView, Platform, useWindowDimensions,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft, Users, ShoppingBag, Package, Map,
  CreditCard as Edit3, Trash2, RotateCw, X, Crown,
} from 'lucide-react-native';
import {
  WorldRoom, WorldPresence, WorldMessage, WorldRoomItem, WorldInventoryItem,
  AvatarConfig, GRID_W, GRID_H, PLAZA_ROOM_ID,
  upsertPresence, leaveRoom, getRoomPresence, sendMessage, getMessages,
  getRoomItems, placeRoomItem, removeRoomItem, moveRoomItem,
  subscribeToRoomMessages, subscribeToRoomPresence, subscribeToRoomItems,
} from '@/services/worldService';
import { colors, spacing, fontSize, borderRadius } from '@/constants/theme';

// ─── Constants ────────────────────────────────────────────────────────────────

const PRESENCE_INTERVAL = 8000;
const WALL_H = 68;
const BUBBLE_DURATION = 3200;
const HAIR_EMOJIS = ['', '✨', '💫', '🎩', '👒', '⭐'];

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
}

function WorldAvatarChar({ config, username, isPremium, size = 34 }: AvatarCharProps) {
  const headSize = Math.round(size * 0.42);
  const bodyW = Math.round(size * 0.38);
  const bodyH = Math.round(size * 0.28);
  const legW = Math.round(size * 0.15);
  const legH = Math.round(size * 0.2);
  const eyeSize = Math.max(2, Math.round(headSize * 0.2));
  const hair = HAIR_EMOJIS[config.hairStyle ?? 0] ?? '';

  return (
    <View style={ch.root}>
      {/* Aura glow */}
      {config.auraColor ? (
        <View style={[ch.aura, {
          width: bodyW + 12,
          height: headSize + bodyH + legH + 12,
          borderRadius: (bodyW + 12) / 2,
          borderColor: config.auraColor,
          shadowColor: config.auraColor,
        }]} />
      ) : null}

      {/* Hair */}
      {hair ? (
        <Text style={[ch.hair, { fontSize: Math.round(headSize * 0.6) }]}>{hair}</Text>
      ) : (
        <View style={{ height: 4 }} />
      )}

      {/* Crown for premium */}
      {isPremium ? (
        <View style={ch.crownWrap}>
          <Crown size={Math.round(headSize * 0.55)} color="#F59E0B" fill="#F59E0B" strokeWidth={0} />
        </View>
      ) : null}

      {/* Head */}
      <View style={[ch.head, {
        width: headSize, height: headSize,
        borderRadius: headSize / 2,
        backgroundColor: config.bodyColor,
      }]}>
        <View style={ch.eyes}>
          <View style={[ch.eye, { width: eyeSize, height: eyeSize, borderRadius: eyeSize / 2 }]} />
          <View style={[ch.eye, { width: eyeSize, height: eyeSize, borderRadius: eyeSize / 2 }]} />
        </View>
        {/* Smile */}
        <View style={ch.smile} />
      </View>

      {/* Body */}
      <View style={[ch.body, {
        width: bodyW, height: bodyH,
        backgroundColor: config.outfitColor,
        marginTop: -2,
      }]} />

      {/* Legs */}
      <View style={[ch.legs, { marginTop: 1 }]}>
        <View style={[ch.leg, { width: legW, height: legH, backgroundColor: config.outfitColor }]} />
        <View style={{ width: Math.max(2, legW * 0.3) }} />
        <View style={[ch.leg, { width: legW, height: legH, backgroundColor: config.outfitColor }]} />
      </View>

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
    position: 'absolute', top: 0, borderWidth: 1.5, opacity: 0.75,
    shadowRadius: 8, shadowOpacity: 0.7, elevation: 4,
  },
  hair: { lineHeight: 16, marginBottom: -2, zIndex: 2 },
  crownWrap: { position: 'absolute', top: 0, right: -3, zIndex: 10 },
  head: {
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
  },
  eyes: { flexDirection: 'row', gap: 3, marginTop: 3 },
  eye: { backgroundColor: 'rgba(255,255,255,0.9)' },
  smile: {
    width: 8, height: 4, borderBottomLeftRadius: 4, borderBottomRightRadius: 4,
    borderBottomWidth: 1.5, borderLeftWidth: 1, borderRightWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)', marginTop: 2,
  },
  body: {
    borderTopLeftRadius: 3, borderTopRightRadius: 3,
    borderBottomLeftRadius: 2, borderBottomRightRadius: 2,
  },
  legs: { flexDirection: 'row' },
  leg: { borderRadius: 2 },
  nameTag: {
    backgroundColor: 'rgba(0,0,0,0.75)', paddingHorizontal: 4, paddingVertical: 1,
    borderRadius: 4, maxWidth: 60, marginTop: 3,
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
  const tileSize = Math.floor(Math.min(screenW - 16, 400) / GRID_W);
  const charSize = Math.round(tileSize * 0.94);

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
  const [chatText, setChatText] = useState('');
  const [sending, setSending] = useState(false);
  const [decMode, setDecMode] = useState(false);
  const [selectedInvItem, setSelectedInvItem] = useState<WorldInventoryItem | null>(null);
  const [selectedRoomItem, setSelectedRoomItem] = useState<WorldRoomItem | null>(null);
  const [chatBubble, setChatBubble] = useState<string | null>(null);

  // ── Smooth movement via Animated ──────────────────────────────────────────
  const animX = useRef(new Animated.Value(5 * tileSize)).current;
  const animY = useRef(new Animated.Value(4 * tileSize)).current;
  const [avatarLeft, setAvatarLeft] = useState(5 * tileSize);
  const [avatarTop, setAvatarTop] = useState(4 * tileSize);

  useEffect(() => {
    const xId = animX.addListener(({ value }) => setAvatarLeft(value));
    const yId = animY.addListener(({ value }) => setAvatarTop(value));
    return () => { animX.removeListener(xId); animY.removeListener(yId); };
  }, []);

  const animateToTile = useCallback((col: number, row: number) => {
    Animated.parallel([
      Animated.spring(animX, { toValue: col * tileSize, useNativeDriver: false, tension: 160, friction: 16 }),
      Animated.spring(animY, { toValue: row * tileSize, useNativeDriver: false, tension: 160, friction: 16 }),
    ]).start();
  }, [tileSize]);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const chatRef = useRef<ScrollView>(null);
  const presenceRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bubbleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const otherAnimsRef = useRef<Map<string, { x: Animated.Value; y: Animated.Value }>>(new Map());

  const getOtherAnim = useCallback((wallet: string, startX: number, startY: number) => {
    if (!otherAnimsRef.current.has(wallet)) {
      otherAnimsRef.current.set(wallet, {
        x: new Animated.Value(startX * tileSize),
        y: new Animated.Value(startY * tileSize),
      });
    }
    return otherAnimsRef.current.get(wallet)!;
  }, [tileSize]);

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

    return () => {
      if (presenceRef.current) clearInterval(presenceRef.current);
      if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
      leaveRoom(walletAddress, room.id);
      supabaseCleanup(msgCh, presCh, itemsCh);
    };
  }, [room.id]); // eslint-disable-line

  useEffect(() => {
    upsertPresence({ walletAddress, roomId: room.id, x: myX, y: myY, username, avatarConfig, isPremium });
  }, [myX, myY]); // eslint-disable-line

  // Animate other users to their new positions when presence updates
  useEffect(() => {
    presence.filter(p => p.wallet_address !== walletAddress).forEach(p => {
      const anim = getOtherAnim(p.wallet_address, p.x, p.y);
      Animated.parallel([
        Animated.spring(anim.x, { toValue: p.x * tileSize, useNativeDriver: false, tension: 160, friction: 16 }),
        Animated.spring(anim.y, { toValue: p.y * tileSize, useNativeDriver: false, tension: 160, friction: 16 }),
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
    // Move avatar with animation
    setMyX(col);
    setMyY(row);
    animateToTile(col, row);
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

  const gridW = tileSize * GRID_W;
  const gridH = tileSize * GRID_H;

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

      {/* Room scene */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
        style={styles.sceneScroll}
      >
        <View style={{ width: Math.max(gridW, screenW - 8) }}>
          {/* ── Wall area ── */}
          <View style={[styles.wall, { width: Math.max(gridW, screenW - 8) }]}>
            <LinearGradient
              colors={themeVis.wallGradient}
              style={StyleSheet.absoluteFill}
            />

            {/* Wall panels / depth lines */}
            <View style={[styles.wallPanel, { left: '10%', width: '18%' }]} />
            <View style={[styles.wallPanel, { left: '35%', width: '28%' }]} />
            <View style={[styles.wallPanel, { left: '70%', width: '20%' }]} />

            {/* DAWEN Plaza sign */}
            {isPlaza ? (
              <View style={styles.plazaSign}>
                <Text style={styles.plazaSignText}>DAWEN WORLD</Text>
                <View style={styles.plazaSignGlow} />
              </View>
            ) : (
              <View style={styles.roomSignWrap}>
                <Text style={styles.roomSignText}>{room.name}</Text>
              </View>
            )}

            {/* Floor/wall divider line */}
            <View style={[styles.wallDivider, { backgroundColor: themeVis.dividerColor + '88', shadowColor: themeVis.dividerColor }]} />
          </View>

          {/* ── Floor grid ── */}
          <View style={[styles.gridContainer, { width: Math.max(gridW, screenW - 8), height: gridH }]}>
            {/* Floor background gradient */}
            <LinearGradient
              colors={[themeVis.floorOdd, themeVis.floorEven, 'rgba(0,0,0,0.02)']}
              style={StyleSheet.absoluteFill}
            />

            {/* Floor tiles */}
            {Array.from({ length: GRID_H }, (_, row) =>
              Array.from({ length: GRID_W }, (_, col) => {
                const isEven = (col + row) % 2 === 0;
                const isSelected = selectedRoomItem?.x === col && selectedRoomItem?.y === row;
                const tileOpacity = 1 - (row / GRID_H) * 0.3;

                return (
                  <TouchableOpacity
                    key={`${col}-${row}`}
                    style={[
                      styles.tile,
                      {
                        left: col * tileSize, top: row * tileSize,
                        width: tileSize, height: tileSize,
                        backgroundColor: isEven ? themeVis.floorEven : themeVis.floorOdd,
                        opacity: isSelected ? 1 : tileOpacity,
                      },
                      isSelected && styles.tileSelected,
                    ]}
                    onPress={() => handleTileTap(col, row)}
                    activeOpacity={0.55}
                  />
                );
              })
            )}

            {/* Room items (furniture) */}
            {roomItems.map(ri => {
              const color = ri.catalog_item?.color_hex ?? '#8B5CF6';
              const isSelectedItem = ri.id === selectedRoomItem?.id;
              return (
                <View key={ri.id} style={[
                  styles.roomItem,
                  {
                    left: ri.x * tileSize + 2,
                    top: ri.y * tileSize + 2,
                    width: tileSize - 4,
                    height: tileSize - 4,
                    backgroundColor: color + '28',
                    borderColor: isSelectedItem ? '#fff' : color + '88',
                    shadowColor: color,
                  },
                ]}>
                  <Text style={[styles.roomItemEmoji, { fontSize: Math.round(tileSize * 0.52) }]}>
                    {ri.catalog_item?.icon_emoji ?? '📦'}
                  </Text>
                </View>
              );
            })}

            {/* Other users' avatars (animated positions) */}
            {otherPresence.map(p => {
              const cfg = p.avatar_config ?? { bodyColor: '#8B5CF6', outfitColor: '#EC4899', hairStyle: 0, auraColor: null };
              const anim = getOtherAnim(p.wallet_address, p.x, p.y);
              return (
                <Animated.View
                  key={p.wallet_address}
                  style={[styles.avatarWrap, { left: anim.x, top: anim.y }]}
                >
                  <WorldAvatarChar
                    config={cfg}
                    username={p.username || p.wallet_address.slice(0, 4)}
                    isPremium={p.is_premium}
                    size={charSize}
                  />
                </Animated.View>
              );
            })}

            {/* My avatar (animated) */}
            <View style={[styles.avatarWrap, { left: avatarLeft, top: avatarTop }]}>
              {/* Chat bubble above */}
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
              />
            </View>
          </View>
        </View>
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
              <Text style={[styles.invBarEmoji, { fontSize: Math.round(tileSize * 0.55) }]}>
                {inv.catalog_item?.icon_emoji ?? '📦'}
              </Text>
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
        <NavBtn icon={Map} label="Rooms" onPress={onOpenDirectory} />
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

  // Avatars
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
