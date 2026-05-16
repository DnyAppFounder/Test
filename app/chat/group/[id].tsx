import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  TextInput,
  FlatList,
  ScrollView,
  Image,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Send, User, Users, Pin, Settings, Image as ImageIcon, Plus, X, Hash, Trash2 } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { colors, spacing, borderRadius, fontSize } from '@/constants/theme';
import { useProfile } from '@/contexts/ProfileContext';
import { SocialService, GroupTopic, GroupPin } from '@/services/socialService';
import { supabase } from '@/lib/supabase';

export default function GroupChatScreen() {
  const router = useRouter();
  const { id: groupId } = useLocalSearchParams<{ id: string }>();
  const { profile } = useProfile();

  const [messages, setMessages] = useState<any[]>([]);
  const [groupDetails, setGroupDetails] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [topics, setTopics] = useState<GroupTopic[]>([]);
  const [activeTopic, setActiveTopic] = useState<GroupTopic | null>(null);
  const [pins, setPins] = useState<GroupPin[]>([]);
  const [isCreator, setIsCreator] = useState(false);

  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [newTopicName, setNewTopicName] = useState('');
  const [creatingTopic, setCreatingTopic] = useState(false);

  const [longPressMsg, setLongPressMsg] = useState<any>(null);
  const [showMsgActions, setShowMsgActions] = useState(false);

  const listRef = useRef<FlatList>(null);

  const loadData = useCallback(async () => {
    if (!groupId || !profile?.id) return;
    setLoading(true);
    try {
      const [msgs, details, topicList, pinList, creatorCheck] = await Promise.all([
        SocialService.getGroupMessages(groupId),
        SocialService.getGroupDetails(groupId),
        SocialService.getGroupTopics(groupId),
        SocialService.getGroupPins(groupId),
        SocialService.isGroupCreator(groupId, profile.id),
      ]);
      setMessages(msgs);
      setGroupDetails(details);
      setPins(pinList);
      setIsCreator(creatorCheck);

      if (topicList.length > 0) {
        setTopics(topicList);
        const def = topicList.find(t => t.is_default) ?? topicList[0];
        setActiveTopic(def);
      } else {
        // Ensure a default General topic exists
        const def = await SocialService.ensureDefaultTopic(groupId, profile.id);
        if (def) {
          setTopics([def]);
          setActiveTopic(def);
        }
      }
    } catch (e) {
      console.error('[GroupChat] loadData error:', e);
    } finally {
      setLoading(false);
    }
  }, [groupId, profile?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  // Realtime
  useEffect(() => {
    if (!groupId || !profile?.id) return;
    const channel = supabase
      .channel(`group_chat:${groupId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'group_messages',
        filter: `group_id=eq.${groupId}`,
      }, async (payload) => {
        const raw = payload.new as any;
        if (raw.sender_id === profile.id) return;
        const sender = await SocialService.getProfile(raw.sender_id);
        const newMsg = { ...raw, sender };
        setMessages(prev => {
          if (prev.some((m: any) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [groupId, profile?.id]);

  const visibleMessages = messages.filter(m => {
    if (!activeTopic) return true;
    if (activeTopic.is_default) return !m.topic_id || m.topic_id === activeTopic.id;
    return m.topic_id === activeTopic.id;
  });

  const pinnedMsg = pins.length > 0 ? pins[0] : null;
  const pinnedContent: string = (pinnedMsg?.message as any)?.content ?? '';

  const send = async () => {
    const text = input.trim();
    if (!text || !profile || !groupId || sending) return;
    setSending(true);
    const optimistic = {
      id: `opt-${Date.now()}`,
      group_id: groupId,
      sender_id: profile.id,
      content: text,
      topic_id: activeTopic?.id,
      created_at: new Date().toISOString(),
      sender: profile,
    };
    setMessages(prev => [...prev, optimistic]);
    setInput('');
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    try {
      await SocialService.sendGroupMessageFull(groupId, profile.id, text, activeTopic?.id);
    } catch {
      setMessages(prev => prev.filter((m: any) => m.id !== optimistic.id));
    } finally {
      setSending(false);
    }
  };

  const pickAndSendImage = async () => {
    if (!profile || !groupId || uploading) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setUploading(true);
    const optimistic = {
      id: `opt-img-${Date.now()}`,
      group_id: groupId,
      sender_id: profile.id,
      content: '',
      media_url: asset.uri,
      media_type: 'image',
      topic_id: activeTopic?.id,
      created_at: new Date().toISOString(),
      sender: profile,
    };
    setMessages(prev => [...prev, optimistic]);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    try {
      const ext = asset.uri.split('.').pop() ?? 'jpg';
      const publicUrl = await SocialService.uploadChatMedia({
        uri: asset.uri,
        type: asset.mimeType ?? 'image/jpeg',
        name: `group.${ext}`,
      });
      if (!publicUrl) { setMessages(prev => prev.filter((m: any) => m.id !== optimistic.id)); return; }
      await SocialService.sendGroupMessageFull(groupId, profile.id, '', activeTopic?.id, publicUrl, 'image');
    } catch {
      setMessages(prev => prev.filter((m: any) => m.id !== optimistic.id));
    } finally {
      setUploading(false);
    }
  };

  const handlePinMessage = async () => {
    if (!longPressMsg || !profile) return;
    await SocialService.pinMessage(groupId!, longPressMsg.id, profile.id);
    const updated = await SocialService.getGroupPins(groupId!);
    setPins(updated);
    setLongPressMsg(null);
    setShowMsgActions(false);
  };

  const handleUnpinMessage = async () => {
    if (!longPressMsg || !profile) return;
    const pin = pins.find(p => p.message_id === longPressMsg.id);
    if (pin) {
      await SocialService.unpinMessage(pin.id);
      const updated = await SocialService.getGroupPins(groupId!);
      setPins(updated);
    }
    setLongPressMsg(null);
    setShowMsgActions(false);
  };

  const createTopic = async () => {
    if (!newTopicName.trim() || !profile || !groupId) return;
    setCreatingTopic(true);
    const topic = await SocialService.createGroupTopic(groupId, newTopicName.trim(), profile.id);
    if (topic) setTopics(prev => [...prev, topic]);
    setNewTopicName('');
    setCreatingTopic(false);
  };

  const deleteTopic = async (topicId: string) => {
    await SocialService.deleteGroupTopic(topicId);
    setTopics(prev => prev.filter(t => t.id !== topicId));
    if (activeTopic?.id === topicId) {
      const def = topics.find(t => t.is_default);
      setActiveTopic(def ?? null);
    }
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const renderMessage = ({ item, index }: { item: any; index: number }) => {
    const mine = item.sender_id === profile?.id;
    const prev = index > 0 ? visibleMessages[index - 1] : null;
    const showSenderInfo = !mine && (!prev || prev.sender_id !== item.sender_id);
    const senderName = item.sender?.username
      || (item.sender?.wallet_address ? `${item.sender.wallet_address.slice(0, 6)}...` : 'User');
    const isPinned = pins.some(p => p.message_id === item.id);

    return (
      <TouchableOpacity
        onLongPress={() => { if (isCreator) { setLongPressMsg(item); setShowMsgActions(true); } }}
        activeOpacity={0.95}
        delayLongPress={400}
      >
        <View style={[styles.msgRow, mine ? styles.msgRowRight : styles.msgRowLeft]}>
          {!mine && (
            <View style={styles.avatarCol}>
              {showSenderInfo ? (
                <View style={styles.msgAvatar}>
                  {item.sender?.avatar_url ? (
                    <Image source={{ uri: item.sender.avatar_url }} style={styles.msgAvatarImg} />
                  ) : (
                    <User size={14} color={colors.textMuted} />
                  )}
                </View>
              ) : (
                <View style={styles.avatarPlaceholder} />
              )}
            </View>
          )}
          <View style={[styles.bubbleWrap, mine ? styles.bubbleWrapRight : styles.bubbleWrapLeft]}>
            {!mine && showSenderInfo && (
              <Text style={styles.senderName}>{senderName}</Text>
            )}
            {item.media_url ? (
              mine ? (
                <View style={styles.imgBubbleMine}>
                  <Image source={{ uri: item.media_url }} style={styles.msgImage} resizeMode="cover" />
                  <Text style={[styles.bubbleTimeMine, { paddingHorizontal: 8, paddingBottom: 6 }]}>{formatTime(item.created_at)}</Text>
                </View>
              ) : (
                <View style={styles.imgBubbleOther}>
                  <Image source={{ uri: item.media_url }} style={styles.msgImage} resizeMode="cover" />
                  <Text style={[styles.bubbleTimeOther, { paddingHorizontal: 8, paddingBottom: 6 }]}>{formatTime(item.created_at)}</Text>
                </View>
              )
            ) : mine ? (
              <LinearGradient
                colors={['#8B5CF6', '#6D28D9']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.bubble, styles.bubbleMine, isPinned && styles.bubblePinned]}
              >
                {isPinned && <Pin size={10} color="rgba(255,255,255,0.6)" strokeWidth={2} style={{ marginBottom: 3 }} />}
                <Text style={styles.bubbleTextMine}>{item.content}</Text>
                <Text style={styles.bubbleTimeMine}>{formatTime(item.created_at)}</Text>
              </LinearGradient>
            ) : (
              <View style={[styles.bubble, styles.bubbleOther, isPinned && styles.bubblePinnedOther]}>
                {isPinned && <Pin size={10} color={colors.primary} strokeWidth={2} style={{ marginBottom: 3 }} />}
                <Text style={styles.bubbleTextOther}>{item.content}</Text>
                <Text style={styles.bubbleTimeOther}>{formatTime(item.created_at)}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const memberCount = groupDetails?.members?.length ?? 0;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
            <ArrowLeft size={22} color={colors.textPrimary} strokeWidth={2.5} />
          </TouchableOpacity>
          <View style={styles.groupAvatarWrap}>
            <View style={styles.groupAvatar}>
              <Users size={18} color={colors.primary} strokeWidth={2} />
            </View>
          </View>
          <View style={styles.topUserInfo}>
            <Text style={styles.topUsername} numberOfLines={1}>{groupDetails?.name || 'Group Chat'}</Text>
            <Text style={styles.memberText}>{memberCount} member{memberCount !== 1 ? 's' : ''}</Text>
          </View>
          {isCreator && (
            <TouchableOpacity style={styles.adminBtn} onPress={() => setShowAdminPanel(true)} activeOpacity={0.7}>
              <Settings size={20} color={colors.textSecondary} strokeWidth={2} />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.divider} />

        {/* Topics bar */}
        {topics.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.topicsBar}
            style={styles.topicsBarWrap}
          >
            {topics.map(topic => (
              <TouchableOpacity
                key={topic.id}
                style={[styles.topicChip, activeTopic?.id === topic.id && styles.topicChipActive]}
                onPress={() => setActiveTopic(topic)}
                activeOpacity={0.8}
              >
                <Hash size={11} color={activeTopic?.id === topic.id ? colors.primary : colors.textMuted} strokeWidth={2} />
                <Text style={[styles.topicChipText, activeTopic?.id === topic.id && styles.topicChipTextActive]}>
                  {topic.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Pinned message banner */}
        {pinnedMsg && pinnedContent ? (
          <TouchableOpacity style={styles.pinnedBanner} activeOpacity={0.9}>
            <Pin size={12} color={colors.primary} strokeWidth={2} />
            <Text style={styles.pinnedText} numberOfLines={1}>
              <Text style={styles.pinnedLabel}>Pinned: </Text>
              {pinnedContent}
            </Text>
          </TouchableOpacity>
        ) : null}

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          {loading ? (
            <View style={styles.loadingCenter}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : visibleMessages.length === 0 ? (
            <View style={styles.emptyCenter}>
              <Hash size={36} color={colors.primary} strokeWidth={1.5} />
              <Text style={styles.emptyText}>No messages in #{activeTopic?.name ?? 'General'}</Text>
              <Text style={styles.emptySubText}>Be the first to say something!</Text>
            </View>
          ) : (
            <FlatList
              ref={listRef}
              data={visibleMessages}
              keyExtractor={(item: any) => item.id}
              renderItem={renderMessage}
              contentContainerStyle={styles.msgList}
              showsVerticalScrollIndicator={false}
              onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            />
          )}

          <View style={styles.inputBar}>
            <TouchableOpacity style={styles.imgBtn} activeOpacity={0.8} onPress={pickAndSendImage} disabled={uploading}>
              {uploading ? (
                <ActivityIndicator size="small" color={colors.textMuted} />
              ) : (
                <ImageIcon size={20} color={colors.textMuted} strokeWidth={2} />
              )}
            </TouchableOpacity>
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.input}
                placeholder={`Message #${activeTopic?.name ?? 'General'}...`}
                placeholderTextColor={colors.textMuted}
                value={input}
                onChangeText={setInput}
                multiline
                returnKeyType="send"
                onSubmitEditing={send}
              />
            </View>
            <TouchableOpacity
              style={[styles.sendBtn, input.trim() ? styles.sendBtnActive : styles.sendBtnInactive]}
              onPress={send}
              activeOpacity={0.8}
              disabled={sending || !input.trim()}
            >
              {sending ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Send size={18} color={colors.white} strokeWidth={2.5} />
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>

      {/* Message long-press actions */}
      <Modal visible={showMsgActions} transparent animationType="fade" onRequestClose={() => setShowMsgActions(false)}>
        <TouchableWithoutFeedback onPress={() => { setShowMsgActions(false); setLongPressMsg(null); }}>
          <View style={styles.actionOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.actionSheet}>
                <Text style={styles.actionTitle} numberOfLines={1}>
                  {longPressMsg?.content?.slice(0, 40) || 'Message'}
                </Text>
                {longPressMsg && pins.some(p => p.message_id === longPressMsg.id) ? (
                  <TouchableOpacity style={styles.actionRow} onPress={handleUnpinMessage} activeOpacity={0.8}>
                    <Pin size={16} color="#EF4444" strokeWidth={2} />
                    <Text style={[styles.actionText, { color: '#EF4444' }]}>Unpin Message</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={styles.actionRow} onPress={handlePinMessage} activeOpacity={0.8}>
                    <Pin size={16} color={colors.primary} strokeWidth={2} />
                    <Text style={styles.actionText}>Pin Message</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.actionRow, styles.actionRowCancel]}
                  onPress={() => { setShowMsgActions(false); setLongPressMsg(null); }}
                  activeOpacity={0.8}
                >
                  <X size={16} color={colors.textMuted} strokeWidth={2} />
                  <Text style={[styles.actionText, { color: colors.textMuted }]}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Admin panel */}
      <Modal visible={showAdminPanel} transparent animationType="slide" onRequestClose={() => setShowAdminPanel(false)}>
        <View style={styles.adminOverlay}>
          <View style={styles.adminSheet}>
            <View style={styles.adminHandle} />
            <View style={styles.adminHeader}>
              <Settings size={18} color={colors.primary} strokeWidth={2} />
              <Text style={styles.adminTitle}>Group Settings</Text>
              <TouchableOpacity onPress={() => setShowAdminPanel(false)} activeOpacity={0.7}>
                <X size={20} color={colors.textPrimary} strokeWidth={2} />
              </TouchableOpacity>
            </View>

            <Text style={styles.adminSection}>Topics</Text>
            <ScrollView style={styles.topicsList} showsVerticalScrollIndicator={false}>
              {topics.map(topic => (
                <View key={topic.id} style={styles.adminTopicRow}>
                  <Hash size={13} color={colors.textMuted} strokeWidth={2} />
                  <Text style={styles.adminTopicName}>{topic.name}</Text>
                  {topic.is_default && (
                    <View style={styles.defaultBadge}>
                      <Text style={styles.defaultBadgeText}>default</Text>
                    </View>
                  )}
                  {!topic.is_default && (
                    <TouchableOpacity onPress={() => deleteTopic(topic.id)} activeOpacity={0.7} style={styles.deleteTopicBtn}>
                      <Trash2 size={14} color="#EF4444" strokeWidth={2} />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </ScrollView>

            <View style={styles.newTopicRow}>
              <TextInput
                style={styles.newTopicInput}
                placeholder="New topic name..."
                placeholderTextColor={colors.textMuted}
                value={newTopicName}
                onChangeText={setNewTopicName}
                maxLength={32}
              />
              <TouchableOpacity
                style={[styles.addTopicBtn, (!newTopicName.trim() || creatingTopic) && styles.addTopicBtnDisabled]}
                onPress={createTopic}
                disabled={!newTopicName.trim() || creatingTopic}
                activeOpacity={0.8}
              >
                {creatingTopic ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Plus size={18} color="#fff" strokeWidth={2.5} />
                )}
              </TouchableOpacity>
            </View>

            <Text style={[styles.adminSection, { marginTop: spacing.lg }]}>Members</Text>
            <ScrollView style={styles.membersList} showsVerticalScrollIndicator={false}>
              {(groupDetails?.members ?? []).map((m: any) => {
                const name = m.user_profiles?.username
                  || (m.user_id ? `${m.user_id.slice(0, 8)}...` : 'Member');
                const isMe = m.user_id === profile?.id;
                return (
                  <View key={m.id ?? m.user_id} style={styles.adminMemberRow}>
                    <View style={styles.memberAvatar}>
                      {m.user_profiles?.avatar_url ? (
                        <Image source={{ uri: m.user_profiles.avatar_url }} style={styles.memberAvatarImg} />
                      ) : (
                        <User size={14} color={colors.textMuted} />
                      )}
                    </View>
                    <Text style={styles.memberName}>{name}{isMe ? ' (you)' : ''}</Text>
                    {!isMe && (
                      <TouchableOpacity
                        onPress={async () => {
                          await SocialService.removeGroupMember(groupId!, m.user_id);
                          loadData();
                        }}
                        activeOpacity={0.7}
                        style={styles.removeMemberBtn}
                      >
                        <X size={14} color="#EF4444" strokeWidth={2} />
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0A0A0F' },
  container: { flex: 1, backgroundColor: '#0A0A0F' },
  flex: { flex: 1 },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: Platform.OS === 'android' ? 44 : 8,
    paddingBottom: spacing.md,
    backgroundColor: '#0A0A0F',
    gap: spacing.sm,
  },
  backBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  groupAvatarWrap: { marginRight: 4 },
  groupAvatar: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 2, borderColor: colors.primary,
    backgroundColor: 'rgba(139,92,246,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
  topUserInfo: { flex: 1, gap: 2 },
  topUsername: { fontSize: 17, fontWeight: '800', color: colors.textPrimary },
  memberText: { fontSize: 12, color: colors.textMuted, fontWeight: '500' },
  adminBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  divider: { height: 1, backgroundColor: 'rgba(139,92,246,0.12)' },

  // Topics bar
  topicsBarWrap: { maxHeight: 44, backgroundColor: '#0D0D14' },
  topicsBar: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
    gap: 8,
  },
  topicChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  topicChipActive: {
    backgroundColor: colors.primaryMuted,
    borderColor: 'rgba(139,92,246,0.4)',
  },
  topicChipText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  topicChipTextActive: { color: colors.primary },

  // Pinned banner
  pinnedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.lg,
    paddingVertical: 7,
    backgroundColor: 'rgba(139,92,246,0.08)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(139,92,246,0.12)',
  },
  pinnedLabel: { fontWeight: '700', color: colors.primary },
  pinnedText: { fontSize: 12, color: colors.textSecondary, flex: 1 },

  loadingCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10 },
  emptyText: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  emptySubText: { fontSize: 13, color: colors.textMuted },

  msgList: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.lg, gap: 4 },
  msgRow: { flexDirection: 'row', marginBottom: 4 },
  msgRowLeft: { justifyContent: 'flex-start', alignItems: 'flex-end' },
  msgRowRight: { justifyContent: 'flex-end' },
  avatarCol: { width: 36, marginRight: 8, alignItems: 'center', justifyContent: 'flex-end' },
  msgAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#1E1E2E', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  msgAvatarImg: { width: 32, height: 32, borderRadius: 16 },
  avatarPlaceholder: { width: 32, height: 32 },
  bubbleWrap: { maxWidth: '75%' },
  bubbleWrapLeft: {},
  bubbleWrapRight: {},
  senderName: { fontSize: 11, fontWeight: '700', color: colors.primary, marginBottom: 3, marginLeft: 14 },
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMine: { borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: '#1E1E2E', borderBottomLeftRadius: 4 },
  bubblePinned: { borderColor: 'rgba(255,255,255,0.25)', borderWidth: 1 },
  bubblePinnedOther: { borderColor: 'rgba(139,92,246,0.35)', borderWidth: 1 },
  bubbleTextMine: { fontSize: 15, color: colors.white, lineHeight: 21 },
  bubbleTextOther: { fontSize: 15, color: colors.textPrimary, lineHeight: 21 },
  bubbleTimeMine: { fontSize: 10, color: 'rgba(255,255,255,0.55)', textAlign: 'right', marginTop: 4 },
  bubbleTimeOther: { fontSize: 10, color: colors.textMuted, textAlign: 'right', marginTop: 4 },
  msgImage: { width: 220, height: 160, borderRadius: 12 },
  imgBubbleMine: { borderRadius: 14, overflow: 'hidden', borderBottomRightRadius: 4, borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)' },
  imgBubbleOther: { backgroundColor: '#1E1E2E', borderRadius: 14, overflow: 'hidden', borderBottomLeftRadius: 4 },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    paddingBottom: Platform.OS === 'ios' ? spacing.xl : spacing.md,
    gap: spacing.sm,
    backgroundColor: '#0A0A0F',
    borderTopWidth: 1,
    borderTopColor: 'rgba(139,92,246,0.08)',
  },
  imgBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  inputWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1A1A28', borderRadius: 24,
    paddingHorizontal: spacing.lg, paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    minHeight: 44, borderWidth: 1, borderColor: 'rgba(139,92,246,0.15)',
  },
  input: { flex: 1, fontSize: 15, color: colors.textPrimary, maxHeight: 100 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  sendBtnActive: { backgroundColor: colors.primary },
  sendBtnInactive: { backgroundColor: colors.primary, opacity: 0.5 },

  // Message actions modal
  actionOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  actionSheet: {
    backgroundColor: '#1A1A28',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: spacing.md, paddingBottom: 32,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  actionTitle: {
    fontSize: 12, fontWeight: '600', color: colors.textMuted,
    paddingHorizontal: spacing.xl, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
    marginBottom: 4,
  },
  actionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: spacing.xl, paddingVertical: 14,
  },
  actionRowCancel: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', marginTop: 4 },
  actionText: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },

  // Admin modal
  adminOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  adminSheet: {
    backgroundColor: '#12121A',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: spacing.xl, paddingBottom: 40,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    maxHeight: '80%',
  },
  adminHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: spacing.lg },
  adminHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xl },
  adminTitle: { flex: 1, fontSize: fontSize.lg, fontWeight: '800', color: colors.textPrimary },
  adminSection: { fontSize: 11, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: spacing.sm },
  topicsList: { maxHeight: 160, marginBottom: spacing.md },
  adminTopicRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  adminTopicName: { flex: 1, fontSize: fontSize.sm, fontWeight: '600', color: colors.textPrimary },
  defaultBadge: { backgroundColor: colors.primaryMuted, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)' },
  defaultBadgeText: { fontSize: 9, fontWeight: '700', color: colors.primary },
  deleteTopicBtn: { padding: 4 },
  newTopicRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  newTopicInput: {
    flex: 1, backgroundColor: '#0A0A0F', borderRadius: 12,
    paddingHorizontal: spacing.lg, paddingVertical: 10,
    fontSize: fontSize.sm, color: colors.textPrimary,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  addTopicBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  addTopicBtnDisabled: { opacity: 0.4 },
  membersList: { maxHeight: 200 },
  adminMemberRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  memberAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#1A1A28', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  memberAvatarImg: { width: 30, height: 30, borderRadius: 15 },
  memberName: { flex: 1, fontSize: fontSize.sm, fontWeight: '600', color: colors.textPrimary },
  removeMemberBtn: { padding: 6 },
});
