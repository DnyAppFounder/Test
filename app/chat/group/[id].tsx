import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Send, User, Users } from 'lucide-react-native';
import { colors, spacing, borderRadius, fontSize } from '@/constants/theme';
import { useProfile } from '@/contexts/ProfileContext';
import { SocialService } from '@/services/socialService';
import { supabase } from '@/lib/supabase';

export default function GroupChatScreen() {
  const router = useRouter();
  const { id: groupId } = useLocalSearchParams<{ id: string }>();
  const { profile } = useProfile();
  const [messages, setMessages] = useState<any[]>([]);
  const [groupDetails, setGroupDetails] = useState<{ id: string; name: string; avatar_url: string | null; members: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);

  const loadData = useCallback(async () => {
    if (!groupId) return;
    setLoading(true);
    try {
      const [msgs, details] = await Promise.all([
        SocialService.getGroupMessages(groupId),
        SocialService.getGroupDetails(groupId),
      ]);
      setMessages(msgs);
      setGroupDetails(details);
    } catch (e) {
      console.error('[GroupChat] loadData error:', e);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => { loadData(); }, [loadData]);

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

  const send = async () => {
    const text = input.trim();
    if (!text || !profile || !groupId || sending) return;
    setSending(true);
    const optimistic = {
      id: `opt-${Date.now()}`,
      group_id: groupId,
      sender_id: profile.id,
      content: text,
      created_at: new Date().toISOString(),
      sender: profile,
    };
    setMessages(prev => [...prev, optimistic]);
    setInput('');
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    try {
      await SocialService.sendGroupMessage(groupId, profile.id, text);
    } catch {
      setMessages(prev => prev.filter((m: any) => m.id !== optimistic.id));
    } finally {
      setSending(false);
    }
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const renderMessage = ({ item, index }: { item: any; index: number }) => {
    const mine = item.sender_id === profile?.id;
    const prevItem = index > 0 ? messages[index - 1] : null;
    const showSenderInfo = !mine && (!prevItem || prevItem.sender_id !== item.sender_id);
    const senderName = item.sender?.username
      || (item.sender?.wallet_address ? `${item.sender.wallet_address.slice(0, 6)}...` : 'User');

    return (
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
          {mine ? (
            <LinearGradient
              colors={['#8B5CF6', '#6D28D9']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.bubble, styles.bubbleMine]}
            >
              <Text style={styles.bubbleTextMine}>{item.content}</Text>
              <Text style={styles.bubbleTimeMine}>{formatTime(item.created_at)}</Text>
            </LinearGradient>
          ) : (
            <View style={[styles.bubble, styles.bubbleOther]}>
              <Text style={styles.bubbleTextOther}>{item.content}</Text>
              <Text style={styles.bubbleTimeOther}>{formatTime(item.created_at)}</Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  const memberCount = groupDetails?.members?.length ?? 0;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
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
        </View>

        <View style={styles.divider} />

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          {loading ? (
            <View style={styles.loadingCenter}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : messages.length === 0 ? (
            <View style={styles.emptyCenter}>
              <Users size={40} color={colors.primary} strokeWidth={1.5} />
              <Text style={styles.emptyText}>No messages yet.</Text>
              <Text style={styles.emptySubText}>Say hello to the group!</Text>
            </View>
          ) : (
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={(item: any) => item.id}
              renderItem={renderMessage}
              contentContainerStyle={styles.msgList}
              showsVerticalScrollIndicator={false}
              onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            />
          )}

          <View style={styles.inputBar}>
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.input}
                placeholder="Message group..."
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
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: 'rgba(139,92,246,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  topUserInfo: { flex: 1, gap: 2 },
  topUsername: { fontSize: 17, fontWeight: '800', color: colors.textPrimary },
  memberText: { fontSize: 12, color: colors.textMuted, fontWeight: '500' },
  divider: { height: 1, backgroundColor: 'rgba(139,92,246,0.12)' },
  loadingCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10 },
  emptyText: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  emptySubText: { fontSize: 14, color: colors.textMuted },
  msgList: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    gap: 4,
  },
  msgRow: { flexDirection: 'row', marginBottom: 4 },
  msgRowLeft: { justifyContent: 'flex-start', alignItems: 'flex-end' },
  msgRowRight: { justifyContent: 'flex-end' },
  avatarCol: { width: 36, marginRight: 8, alignItems: 'center', justifyContent: 'flex-end' },
  msgAvatar: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#1E1E2E',
    justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
  },
  msgAvatarImg: { width: 32, height: 32, borderRadius: 16 },
  avatarPlaceholder: { width: 32, height: 32 },
  bubbleWrap: { maxWidth: '75%' },
  bubbleWrapLeft: {},
  bubbleWrapRight: {},
  senderName: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: 3,
    marginLeft: 14,
  },
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMine: { borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: '#1E1E2E', borderBottomLeftRadius: 4 },
  bubbleTextMine: { fontSize: 15, color: colors.white, lineHeight: 21 },
  bubbleTextOther: { fontSize: 15, color: colors.textPrimary, lineHeight: 21 },
  bubbleTimeMine: { fontSize: 10, color: 'rgba(255,255,255,0.55)', textAlign: 'right', marginTop: 4 },
  bubbleTimeOther: { fontSize: 10, color: colors.textMuted, textAlign: 'right', marginTop: 4 },
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
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A28',
    borderRadius: 24,
    paddingHorizontal: spacing.lg,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    minHeight: 44,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.15)',
  },
  input: { flex: 1, fontSize: 15, color: colors.textPrimary, maxHeight: 100 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  sendBtnActive: { backgroundColor: colors.primary },
  sendBtnInactive: { backgroundColor: colors.primary, opacity: 0.5 },
});
