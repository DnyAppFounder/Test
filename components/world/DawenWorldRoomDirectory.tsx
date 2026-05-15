import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Modal,
  TextInput,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Map as MapIcon, Users, Plus, Lock, Globe, UserCheck, Trash2, CreditCard as Edit3, Grid3x3 } from 'lucide-react-native';
import {
  WorldRoom, type RoomLayout,
  getPublicRooms, getMyRooms, getRoomsWithCounts,
  createRoom, deleteRoom, updateRoom, PLAZA_ROOM_ID,
  saveRoomLayout, fetchRoomWithLayout,
} from '@/services/worldService';
import { colors, spacing, fontSize, borderRadius } from '@/constants/theme';
import { UnityRoomBuilder } from './UnityRoomBuilder';

const VISIBILITY_ICON: Record<string, any> = {
  public: Globe, private: Lock, invite_only: UserCheck,
};
const VISIBILITY_COLOR: Record<string, string> = {
  public: '#10B981', private: '#EF4444', invite_only: '#F59E0B',
};

interface Props {
  walletAddress: string;
  username: string;
  isPremium: boolean;
  connectedWalletId?: string | null;
  internalAccountIndex?: number;
  onJoinRoom: (room: WorldRoom) => void;
  onClose: () => void;
}

export function DawenWorldRoomDirectory({
  walletAddress, username, isPremium,
  connectedWalletId, internalAccountIndex,
  onJoinRoom, onClose,
}: Props) {
  const [publicRooms, setPublicRooms] = useState<WorldRoom[]>([]);
  const [myRooms, setMyRooms] = useState<WorldRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'public' | 'mine'>('public');
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [nameError, setNameError] = useState('');
  const [creating, setCreating] = useState(false);
  const [editRoom, setEditRoom] = useState<WorldRoom | null>(null);
  const [editName, setEditName] = useState('');
  const [editVis, setEditVis] = useState<'public' | 'private' | 'invite_only'>('public');
  const [saving, setSaving] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [builderRoom, setBuilderRoom] = useState<WorldRoom | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pub, mine] = await Promise.all([getPublicRooms(), getMyRooms(walletAddress)]);
      const [pubCounted, mineCounted] = await Promise.all([
        getRoomsWithCounts(pub), getRoomsWithCounts(mine),
      ]);
      setPublicRooms(pubCounted);
      setMyRooms(mineCounted);
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    const trimmed = newName.trim();
    if (!trimmed) { setNameError('Please enter a room name.'); return; }
    if (trimmed.length > 40) { setNameError('Name must be 40 characters or less.'); return; }
    if (!walletAddress) { setNameError('Wallet not connected. Please reconnect and try again.'); return; }
    if (creating) return;
    setNameError('');
    setCreating(true);
    try {
      const room = await createRoom({ walletAddress, name: trimmed, theme: 'Empty Grid Room', visibility: 'public' });
      setCreateOpen(false);
      setNewName('');
      await load();
      setTab('mine');
      // Open builder immediately so user can design the layout
      const roomWithLayout = await fetchRoomWithLayout(room.id);
      setBuilderRoom(roomWithLayout ?? room);
      setBuilderOpen(true);
    } catch (e: any) {
      const msg = e?.message ?? e?.error_description ?? 'Failed to create room. Please try again.';
      setNameError(msg);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (room: WorldRoom) => {
    if (room.is_default_personal_room) return;
    await deleteRoom(room.id);
    await load();
  };

  const handleSaveEdit = async () => {
    if (!editRoom || saving) return;
    setSaving(true);
    await updateRoom(editRoom.id, { name: editName.trim(), visibility: editVis });
    setSaving(false);
    setEditRoom(null);
    await load();
  };

  const handleBuilderSave = async (layout?: RoomLayout) => {
    if (!builderRoom) return;
    if (layout) await saveRoomLayout(builderRoom.id, layout);
    setBuilderOpen(false);
    setBuilderRoom(null);
    await load();
  };

  const handleBuilderCancel = () => {
    setBuilderOpen(false);
    setBuilderRoom(null);
  };

  const handleOpenBuilder = async (room: WorldRoom) => {
    const roomWithLayout = await fetchRoomWithLayout(room.id);
    setBuilderRoom(roomWithLayout ?? room);
    setBuilderOpen(true);
  };

  const canAccess = (room: WorldRoom) => {
    if (room.visibility === 'public') return true;
    if (room.owner_wallet === walletAddress) return true;
    return false;
  };

  const displayed = tab === 'public' ? publicRooms : myRooms;

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#0D0A1A', '#1A0A2E']} style={StyleSheet.absoluteFill} />

      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn}>
          <ArrowLeft size={20} color="#fff" strokeWidth={2.5} />
        </TouchableOpacity>
        <MapIcon size={18} color={colors.primary} strokeWidth={2} />
        <Text style={styles.title}>Room Directory</Text>
        <TouchableOpacity style={styles.createBtn} onPress={() => setCreateOpen(true)}>
          <Plus size={16} color="#fff" strokeWidth={2.5} />
          <Text style={styles.createText}>Create</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {(['public', 'mine'] as const).map(t => (
          <TouchableOpacity key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'public' ? 'Public Rooms' : 'My Rooms'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.loader}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {tab === 'public' && (() => {
            const plaza = publicRooms.find(r => r.id === PLAZA_ROOM_ID);
            if (!plaza) return null;
            return (
              <TouchableOpacity key={plaza.id} style={[styles.roomCard, styles.plazaCard]} onPress={() => onJoinRoom(plaza)}>
                <LinearGradient colors={['rgba(139,92,246,0.3)','rgba(109,40,217,0.1)']} style={StyleSheet.absoluteFill} />
                <View style={styles.roomIcon}><Text style={{ fontSize: 28 }}>🌐</Text></View>
                <View style={styles.roomInfo}>
                  <Text style={styles.plazaName}>{plaza.name}</Text>
                  <Text style={styles.roomType}>Official Public Lobby</Text>
                  <View style={styles.roomMeta}>
                    <Users size={11} color={colors.primary} strokeWidth={2.5} />
                    <Text style={styles.metaText}>{plaza.online_count ?? 0} online</Text>
                  </View>
                </View>
                <TouchableOpacity style={styles.joinBtn} onPress={() => onJoinRoom(plaza)}>
                  <Text style={styles.joinText}>Enter</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })()}

          {displayed.filter(r => r.id !== PLAZA_ROOM_ID).map(room => {
            const VisIcon = VISIBILITY_ICON[room.visibility] ?? Globe;
            const visColor = VISIBILITY_COLOR[room.visibility] ?? '#10B981';
            const accessible = canAccess(room);
            const isMyRoom = room.owner_wallet === walletAddress;

            return (
              <View key={room.id} style={styles.roomCard}>
                <View style={styles.roomIcon}>
                  <Text style={{ fontSize: 24 }}>{room.type === 'personal' ? '🏠' : '🏢'}</Text>
                </View>
                <View style={styles.roomInfo}>
                  <View style={styles.roomNameRow}>
                    <Text style={styles.roomName} numberOfLines={1}>{room.name}</Text>
                    {room.layout_saved_at && (
                      <View style={styles.sizeBadge}>
                        <Text style={styles.sizeBadgeText}>Custom</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.roomTheme} numberOfLines={1}>{room.theme}</Text>
                  <View style={styles.roomMeta}>
                    <VisIcon size={10} color={visColor} strokeWidth={2.5} />
                    <Text style={[styles.metaText, { color: visColor }]}>{room.visibility}</Text>
                    {(room.online_count ?? 0) > 0 && (
                      <>
                        <Text style={styles.dot}>·</Text>
                        <Users size={10} color="rgba(255,255,255,0.4)" strokeWidth={2.5} />
                        <Text style={styles.metaText}>{room.online_count}</Text>
                      </>
                    )}
                  </View>
                </View>

                <View style={styles.cardActions}>
                  {isMyRoom && (
                    <>
                      <TouchableOpacity onPress={() => handleOpenBuilder(room)} style={styles.layoutBtn}>
                        <Grid3x3 size={13} color={colors.primary} strokeWidth={2} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => { setEditRoom(room); setEditName(room.name); setEditVis(room.visibility as any); }}>
                        <Edit3 size={14} color="rgba(255,255,255,0.4)" strokeWidth={2} />
                      </TouchableOpacity>
                      {!room.is_default_personal_room && (
                        <TouchableOpacity onPress={() => handleDelete(room)}>
                          <Trash2 size={14} color="rgba(239,68,68,0.6)" strokeWidth={2} />
                        </TouchableOpacity>
                      )}
                    </>
                  )}
                  {accessible ? (
                    <TouchableOpacity style={styles.joinBtn} onPress={() => onJoinRoom(room)}>
                      <Text style={styles.joinText}>Join</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.lockedBtn}>
                      <Lock size={12} color="rgba(255,255,255,0.3)" strokeWidth={2} />
                    </View>
                  )}
                </View>
              </View>
            );
          })}

          {displayed.filter(r => r.id !== PLAZA_ROOM_ID).length === 0 && (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>{tab === 'mine' ? '🏠' : '🌐'}</Text>
              <Text style={styles.emptyText}>
                {tab === 'mine' ? 'No rooms yet. Create one!' : 'No other public rooms yet.'}
              </Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* Create modal — name only, builder handles the layout */}
      <Modal visible={createOpen} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <LinearGradient colors={['#1A0A2E','#0D0D1A']} style={StyleSheet.absoluteFill} />
            <Text style={styles.modalTitle}>Create Room</Text>
            <Text style={styles.modalHint}>Name your room. You'll design the layout in the Room Builder next.</Text>

            <TextInput
              style={styles.input}
              placeholder="Room name…"
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={newName}
              onChangeText={t => { setNewName(t); if (nameError) setNameError(''); }}
              maxLength={40}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleCreate}
            />
            {nameError ? <Text style={styles.nameError}>{nameError}</Text> : null}

            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={[styles.createRoomBtn, (!newName.trim() || creating) && { opacity: 0.45 }]}
                onPress={handleCreate}
                disabled={!newName.trim() || creating}
              >
                {creating
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.createRoomText}>Create Room</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setCreateOpen(false); setNewName(''); setNameError(''); }} style={styles.cancelBtn}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Room Builder — full-screen overlay */}
      {builderOpen && builderRoom && (
        <View style={StyleSheet.absoluteFillObject}>
          <UnityRoomBuilder
            roomName={builderRoom.name}
            roomId={builderRoom.id}
            onSave={handleBuilderSave}
            onCancel={handleBuilderCancel}
          />
        </View>
      )}

      {/* Edit modal */}
      <Modal visible={!!editRoom} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <LinearGradient colors={['#1A0A2E','#0D0D1A']} style={StyleSheet.absoluteFill} />
            <Text style={styles.modalTitle}>Edit Room</Text>
            <TextInput style={styles.input} placeholder="Room name…" placeholderTextColor="rgba(255,255,255,0.3)" value={editName} onChangeText={setEditName} maxLength={40} />

            <Text style={styles.inputLabel}>Visibility</Text>
            <View style={styles.visRow}>
              {(['public', 'private', 'invite_only'] as const).map(v => (
                <TouchableOpacity key={v} style={[styles.visBtn, editVis === v && styles.visBtnActive]} onPress={() => setEditVis(v)}>
                  <Text style={[styles.visText, editVis === v && styles.visTextActive]}>{v.replace('_',' ')}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.createRoomBtn, saving && { opacity: 0.5 }]} onPress={handleSaveEdit} disabled={saving}>
                {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.createRoomText}>Save</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setEditRoom(null)} style={styles.cancelBtn}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0D0A1A' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: 'rgba(139,92,246,0.2)' },
  backBtn: { width: 34, height: 34, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.08)', justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: fontSize.lg, fontWeight: '900', color: '#fff', flex: 1 },
  createBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primary, borderRadius: borderRadius.md, paddingHorizontal: 12, paddingVertical: 7 },
  createText: { fontSize: fontSize.sm, fontWeight: '700', color: '#fff' },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: 'rgba(139,92,246,0.15)' },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: colors.primary },
  tabText: { fontSize: fontSize.sm, fontWeight: '700', color: 'rgba(255,255,255,0.4)' },
  tabTextActive: { color: colors.primary },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.md, gap: 8 },
  roomCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: borderRadius.lg,
    padding: spacing.md, borderWidth: 1, borderColor: 'rgba(139,92,246,0.15)',
    overflow: 'hidden', position: 'relative',
  },
  plazaCard: { borderColor: 'rgba(139,92,246,0.5)' },
  roomIcon: { width: 48, height: 48, borderRadius: 12, backgroundColor: 'rgba(139,92,246,0.15)', justifyContent: 'center', alignItems: 'center' },
  roomInfo: { flex: 1, gap: 3 },
  plazaName: { fontSize: fontSize.md, fontWeight: '900', color: colors.primary },
  roomName: { fontSize: fontSize.sm, fontWeight: '700', color: '#fff' },
  roomType: { fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: '500' },
  roomTheme: { fontSize: 10, color: 'rgba(255,255,255,0.35)', fontWeight: '500' },
  roomMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: '600' },
  dot: { color: 'rgba(255,255,255,0.3)' },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  layoutBtn: { width: 28, height: 28, borderRadius: 7, backgroundColor: colors.primaryMuted, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(139,92,246,0.4)' },
  joinBtn: { backgroundColor: colors.primary, borderRadius: borderRadius.md, paddingHorizontal: 14, paddingVertical: 7 },
  joinText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  lockedBtn: { width: 30, height: 30, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)', justifyContent: 'center', alignItems: 'center' },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 12 },
  emptyEmoji: { fontSize: 40 },
  emptyText: { fontSize: fontSize.sm, color: 'rgba(255,255,255,0.4)', textAlign: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#1A0A2E', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.xxl, gap: 12, overflow: 'hidden', borderTopWidth: 1, borderColor: 'rgba(139,92,246,0.3)' },
  modalTitle: { fontSize: fontSize.xl, fontWeight: '900', color: '#fff', marginBottom: 2 },
  modalHint: { fontSize: 12, color: 'rgba(255,255,255,0.4)', fontWeight: '500', lineHeight: 17, marginBottom: 4 },
  input: { backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: borderRadius.md, paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: 14, color: '#fff', borderWidth: 1, borderColor: 'rgba(139,92,246,0.2)' },
  nameError: { fontSize: 11, color: '#EF4444', fontWeight: '600', marginTop: -4 },
  modalBtns: { gap: 8, marginTop: 4 },
  createRoomBtn: { backgroundColor: colors.primary, borderRadius: borderRadius.lg, paddingVertical: spacing.md, alignItems: 'center' },
  createRoomText: { fontSize: fontSize.md, fontWeight: '800', color: '#fff' },
  cancelBtn: { alignItems: 'center', paddingVertical: spacing.sm },
  cancelText: { fontSize: fontSize.sm, color: 'rgba(255,255,255,0.4)', fontWeight: '600' },
  roomNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sizeBadge: { backgroundColor: 'rgba(139,92,246,0.2)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: 'rgba(139,92,246,0.4)' },
  sizeBadgeText: { fontSize: 9, fontWeight: '700', color: colors.primary },
});
