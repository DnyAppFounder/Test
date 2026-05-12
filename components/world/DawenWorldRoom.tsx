import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, KeyboardAvoidingView, Platform, useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Users, ShoppingBag, Package, Map, CreditCard as Edit3, Trash2, RotateCw, Save, X, Crown } from 'lucide-react-native';
import {
  WorldRoom, WorldPresence, WorldMessage, WorldRoomItem, WorldCatalogItem, WorldInventoryItem,
  AvatarConfig, GRID_W, GRID_H,
  upsertPresence, leaveRoom, getRoomPresence, sendMessage, getMessages,
  getRoomItems, placeRoomItem, removeRoomItem, moveRoomItem,
  subscribeToRoomMessages, subscribeToRoomPresence, subscribeToRoomItems,
} from '@/services/worldService';
import { AvatarPreview } from './DawenWorldAvatarEditor';
import { colors, spacing, fontSize, borderRadius } from '@/constants/theme';

const RARITY_COLORS: Record<string, string> = {
  common: '#6B7280', uncommon: '#10B981', rare: '#3B82F6', epic: '#8B5CF6', legendary: '#F59E0B',
};

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

const PRESENCE_INTERVAL = 8000;
const TILE_COLORS = ['#0A0A14', '#0D0D1A'];

export function DawenWorldRoom({
  room, walletAddress, username, avatarConfig, isPremium,
  inventory, onBack, onOpenShop, onOpenInventory, onOpenDirectory,
}: Props) {
  const { width: screenW } = useWindowDimensions();
  const tileSize = Math.floor(Math.min(screenW - 32, 360) / GRID_W);

  // State
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

  const chatRef = useRef<ScrollView>(null);
  const presenceRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isOwner = room.type !== 'official' && room.owner_wallet === walletAddress;

  // ── Load initial data ───────────────────────────────────────────────────────
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

    // Upsert presence immediately
    upsertPresence({ walletAddress, roomId: room.id, x: myX, y: myY, username, avatarConfig, isPremium });

    // Heartbeat
    presenceRef.current = setInterval(() => {
      upsertPresence({ walletAddress, roomId: room.id, x: myX, y: myY, username, avatarConfig, isPremium });
    }, PRESENCE_INTERVAL);

    // Realtime subscriptions
    const msgCh = subscribeToRoomMessages(room.id, (msg) => {
      setMessages(prev => [...prev.slice(-60), msg]);
      setTimeout(() => chatRef.current?.scrollToEnd({ animated: true }), 100);
    });
    const presCh = subscribeToRoomPresence(room.id, loadPresence);
    const itemsCh = subscribeToRoomItems(room.id, loadRoomItems);

    return () => {
      if (presenceRef.current) clearInterval(presenceRef.current);
      leaveRoom(walletAddress, room.id);
      supabaseCleanup(msgCh, presCh, itemsCh);
    };
  }, [room.id]);

  // Update heartbeat position when user moves
  useEffect(() => {
    upsertPresence({ walletAddress, roomId: room.id, x: myX, y: myY, username, avatarConfig, isPremium });
  }, [myX, myY]);

  // ── Tile tap: move or place furniture ────────────────────────────────────────
  const handleTileTap = async (col: number, row: number) => {
    if (decMode && isOwner) {
      if (selectedInvItem) {
        // Place item
        const placed = await placeRoomItem({
          roomId: room.id,
          walletAddress,
          inventoryItemId: selectedInvItem.id,
          itemId: selectedInvItem.item_id,
          x: col,
          y: row,
          rotation: 0,
        });
        if (placed) {
          setRoomItems(prev => [...prev, placed]);
          setSelectedInvItem(null);
        }
        return;
      }
      // Select/deselect room item at this tile
      const hit = roomItems.find(ri => ri.x === col && ri.y === row && ri.owner_wallet === walletAddress);
      if (hit) {
        setSelectedRoomItem(prev => prev?.id === hit.id ? null : hit);
        return;
      }
      setSelectedRoomItem(null);
      return;
    }
    // Move avatar
    setMyX(col);
    setMyY(row);
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
    setSending(false);
  };

  // ── My presence in merged list ────────────────────────────────────────────
  const myPresence: WorldPresence = {
    id: 'me', wallet_address: walletAddress, room_id: room.id,
    x: myX, y: myY, username, avatar_config: avatarConfig,
    is_premium: isPremium, is_online: true, last_seen: new Date().toISOString(),
  };
  const allPresence = [
    myPresence,
    ...presence.filter(p => p.wallet_address !== walletAddress),
  ];

  const gridW = tileSize * GRID_W;
  const gridH = tileSize * GRID_H;

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* HUD */}
      <View style={styles.hud}>
        <TouchableOpacity onPress={onBack} style={styles.hudBtn}>
          <ArrowLeft size={18} color="#fff" strokeWidth={2.5} />
        </TouchableOpacity>
        <View style={styles.hudCenter}>
          <Text style={styles.hudRoomName} numberOfLines={1}>{room.name}</Text>
          <View style={styles.hudOnline}>
            <Users size={11} color={colors.primary} strokeWidth={2.5} />
            <Text style={styles.hudOnlineText}>{allPresence.length}</Text>
          </View>
        </View>
        <View style={styles.hudRight}>
          {isOwner && (
            <TouchableOpacity
              style={[styles.hudBtn, decMode && { backgroundColor: colors.primary }]}
              onPress={() => { setDecMode(d => !d); setSelectedInvItem(null); setSelectedRoomItem(null); }}
            >
              <Edit3 size={16} color={decMode ? '#fff' : 'rgba(255,255,255,0.6)'} strokeWidth={2} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Decor toolbar */}
      {decMode && isOwner && (
        <View style={styles.decorBar}>
          <Text style={styles.decorInfo}>
            {selectedInvItem ? `Placing: ${selectedInvItem.catalog_item?.item_name}` :
             selectedRoomItem ? `Selected: ${selectedRoomItem.catalog_item?.item_name}` :
             'Tap inventory to select item, then tap tile to place'}
          </Text>
          <View style={styles.decorActions}>
            {selectedRoomItem && (
              <>
                <TouchableOpacity style={styles.decorBtn} onPress={handleRotateRoomItem}>
                  <RotateCw size={16} color={colors.primary} strokeWidth={2} />
                </TouchableOpacity>
                <TouchableOpacity style={[styles.decorBtn, { backgroundColor: 'rgba(239,68,68,0.15)' }]} onPress={handleRemoveRoomItem}>
                  <Trash2 size={16} color="#EF4444" strokeWidth={2} />
                </TouchableOpacity>
              </>
            )}
            {selectedInvItem && (
              <TouchableOpacity style={styles.decorBtn} onPress={() => setSelectedInvItem(null)}>
                <X size={16} color="rgba(255,255,255,0.5)" strokeWidth={2} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Room Grid */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
        <View style={[styles.gridContainer, { width: gridW, height: gridH }]}>
          <LinearGradient colors={['#060610', '#0D0D1A']} style={StyleSheet.absoluteFill} />

          {/* Floor tiles */}
          {Array.from({ length: GRID_H }, (_, row) =>
            Array.from({ length: GRID_W }, (_, col) => {
              const isSelected = selectedRoomItem?.x === col && selectedRoomItem?.y === row;
              const hasItem = roomItems.some(ri => ri.x === col && ri.y === row);
              return (
                <TouchableOpacity
                  key={`${col}-${row}`}
                  style={[
                    styles.tile,
                    {
                      left: col * tileSize, top: row * tileSize,
                      width: tileSize, height: tileSize,
                      backgroundColor: (col + row) % 2 === 0 ? 'rgba(139,92,246,0.04)' : 'rgba(109,40,217,0.06)',
                    },
                    isSelected && { backgroundColor: 'rgba(139,92,246,0.25)' },
                    decMode && hasItem && !isSelected && { backgroundColor: 'rgba(139,92,246,0.1)' },
                  ]}
                  onPress={() => handleTileTap(col, row)}
                  activeOpacity={0.6}
                />
              );
            })
          )}

          {/* Room items (furniture) */}
          {roomItems.map(ri => (
            <View key={ri.id} style={[
              styles.roomItem,
              {
                left: ri.x * tileSize + 2,
                top: ri.y * tileSize + 2,
                width: tileSize - 4,
                height: tileSize - 4,
                backgroundColor: ri.catalog_item?.color_hex + '33' || 'rgba(139,92,246,0.2)',
                borderColor: ri.id === selectedRoomItem?.id ? '#fff' : ri.catalog_item?.color_hex || colors.primary,
              },
            ]}>
              <Text style={styles.roomItemEmoji}>{ri.catalog_item?.icon_emoji || '📦'}</Text>
            </View>
          ))}

          {/* Avatars */}
          {allPresence.map(p => (
            <View key={p.wallet_address} style={[
              styles.avatarWrap,
              { left: p.x * tileSize, top: p.y * tileSize },
            ]}>
              <AvatarPreview
                config={p.avatar_config ?? { bodyColor: '#8B5CF6', outfitColor: '#EC4899', hairStyle: 0, auraColor: null }}
                username=""
                isPremium={p.is_premium}
                size={Math.min(tileSize - 4, 32)}
              />
              <View style={styles.avatarLabel}>
                <Text style={styles.avatarName} numberOfLines={1}>{p.username || p.wallet_address.slice(0, 4)}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Decor inventory quick bar */}
      {decMode && isOwner && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.invBar} contentContainerStyle={styles.invBarContent}>
          {inventory.filter(i => i.quantity > 0).map(inv => (
            <TouchableOpacity
              key={inv.id}
              style={[styles.invBarItem, selectedInvItem?.id === inv.id && styles.invBarItemActive]}
              onPress={() => setSelectedInvItem(prev => prev?.id === inv.id ? null : inv)}
            >
              <Text style={styles.invBarEmoji}>{inv.catalog_item?.icon_emoji || '📦'}</Text>
              {inv.quantity > 1 && <Text style={styles.invBarQty}>×{inv.quantity}</Text>}
            </TouchableOpacity>
          ))}
          {inventory.length === 0 && <Text style={styles.invBarEmpty}>No items — visit the Shop!</Text>}
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
            <View key={m.id} style={[styles.chatMsg, m.wallet_address === walletAddress && styles.chatMsgMine]}>
              <Text style={styles.chatUser}>{m.username || m.wallet_address.slice(0, 4)}</Text>
              <Text style={styles.chatText}>{m.message_text}</Text>
            </View>
          ))}
          {messages.length === 0 && <Text style={styles.chatEmpty}>No messages yet — say hello!</Text>}
        </ScrollView>
        <View style={styles.chatInputRow}>
          <TextInput
            style={styles.chatInput}
            value={chatText}
            onChangeText={setChatText}
            placeholder="Chat in room..."
            placeholderTextColor="rgba(255,255,255,0.3)"
            returnKeyType="send"
            onSubmitEditing={handleSendChat}
            maxLength={200}
          />
          <TouchableOpacity style={[styles.sendBtn, (!chatText.trim() || sending) && { opacity: 0.4 }]} onPress={handleSendChat} disabled={!chatText.trim() || sending}>
            <Text style={styles.sendBtnText}>→</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Bottom Nav */}
      <View style={styles.bottomNav}>
        <NavBtn icon={Map} label="Rooms" onPress={onOpenDirectory} />
        <NavBtn icon={ShoppingBag} label="Shop" onPress={onOpenShop} />
        <NavBtn icon={Package} label="Items" onPress={onOpenInventory} />
      </View>
    </KeyboardAvoidingView>
  );
}

function NavBtn({ icon: Icon, label, onPress }: { icon: any; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.navBtn} onPress={onPress} activeOpacity={0.75}>
      <Icon size={20} color="rgba(255,255,255,0.6)" strokeWidth={2} />
      <Text style={styles.navBtnLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

// Cleanup supabase channels
function supabaseCleanup(...channels: any[]) {
  const { supabase: sb } = require('@/lib/supabase');
  channels.forEach(ch => { try { sb.removeChannel(ch); } catch {} });
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#060610' },
  hud: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md,
    paddingVertical: 10, backgroundColor: 'rgba(0,0,0,0.6)',
    borderBottomWidth: 1, borderBottomColor: 'rgba(139,92,246,0.2)', gap: 8,
  },
  hudBtn: { width: 34, height: 34, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.08)', justifyContent: 'center', alignItems: 'center' },
  hudCenter: { flex: 1, alignItems: 'center' },
  hudRoomName: { fontSize: fontSize.md, fontWeight: '800', color: '#fff' },
  hudOnline: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  hudOnlineText: { fontSize: 10, color: colors.primary, fontWeight: '700' },
  hudRight: { flexDirection: 'row', gap: 6 },
  decorBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: 8,
    backgroundColor: 'rgba(139,92,246,0.15)', borderBottomWidth: 1, borderBottomColor: 'rgba(139,92,246,0.3)',
  },
  decorInfo: { fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: '600', flex: 1 },
  decorActions: { flexDirection: 'row', gap: 6 },
  decorBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.08)', justifyContent: 'center', alignItems: 'center' },
  gridContainer: { position: 'relative', overflow: 'hidden', borderRadius: 4 },
  tile: { position: 'absolute', borderWidth: 0.5, borderColor: 'rgba(139,92,246,0.08)' },
  roomItem: { position: 'absolute', borderRadius: 4, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  roomItemEmoji: { fontSize: 18 },
  avatarWrap: { position: 'absolute', alignItems: 'center', pointerEvents: 'none' as any },
  avatarLabel: { backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4, maxWidth: 56 },
  avatarName: { fontSize: 9, color: '#fff', fontWeight: '700', textAlign: 'center' },
  invBar: { maxHeight: 60, borderTopWidth: 1, borderTopColor: 'rgba(139,92,246,0.2)', backgroundColor: 'rgba(0,0,0,0.5)' },
  invBarContent: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.sm, paddingVertical: 8, gap: 6 },
  invBarItem: { width: 44, height: 44, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.07)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'transparent' },
  invBarItemActive: { borderColor: colors.primary, backgroundColor: colors.primaryMuted },
  invBarEmoji: { fontSize: 22 },
  invBarQty: { fontSize: 9, color: colors.primary, fontWeight: '800', position: 'absolute', bottom: 2, right: 4 },
  invBarEmpty: { fontSize: 11, color: 'rgba(255,255,255,0.3)', padding: spacing.sm },
  chatArea: { borderTopWidth: 1, borderTopColor: 'rgba(139,92,246,0.15)', backgroundColor: 'rgba(0,0,0,0.4)', maxHeight: 180 },
  chatScroll: { maxHeight: 120, paddingHorizontal: spacing.md, paddingVertical: 6 },
  chatMsg: { marginBottom: 4 },
  chatMsgMine: { opacity: 0.9 },
  chatUser: { fontSize: 10, fontWeight: '800', color: colors.primary, marginBottom: 1 },
  chatText: { fontSize: 12, color: 'rgba(255,255,255,0.85)', fontWeight: '500' },
  chatEmpty: { fontSize: 11, color: 'rgba(255,255,255,0.25)', padding: 8 },
  chatInputRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: 8, gap: 8, borderTopWidth: 1, borderTopColor: 'rgba(139,92,246,0.1)' },
  chatInput: { flex: 1, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: borderRadius.md, paddingHorizontal: spacing.md, paddingVertical: 8, fontSize: 13, color: '#fff', borderWidth: 1, borderColor: 'rgba(139,92,246,0.2)' },
  sendBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  sendBtnText: { fontSize: 18, color: '#fff', fontWeight: '700' },
  bottomNav: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.8)', borderTopWidth: 1, borderTopColor: 'rgba(139,92,246,0.2)' },
  navBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, gap: 3 },
  navBtnLabel: { fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: '600' },
});
