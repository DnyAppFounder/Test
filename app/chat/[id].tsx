import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  TextInput,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Phone, Video, MoveHorizontal as MoreHorizontal, Smile, Send, Image as ImageIcon, Check, User, ZoomIn, X } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { colors, spacing, borderRadius, fontSize } from '@/constants/theme';
import { useProfile } from '@/contexts/ProfileContext';
import { SocialService, Message, UserProfile } from '@/services/socialService';
import { supabase } from '@/lib/supabase';
import LinkText, { extractUrls } from '@/components/LinkText';
import LinkPreview from '@/components/LinkPreview';

const EMOJI_SET = ['👍', '😂', '🔥', '👀', '😮', '❤️'];

type Reaction = { emoji: string; count: number; userIds: string[] };
type ReactionsMap = Record<string, Reaction[]>;

export default function ChatScreen() {
  const router = useRouter();
  const { id: otherId } = useLocalSearchParams<{ id: string }>();
  const { profile } = useProfile();
  const [messages, setMessages] = useState<Message[]>([]);
  const [otherUser, setOtherUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);

  // Reactions
  const [reactions, setReactions] = useState<ReactionsMap>({});
  const [reactionTarget, setReactionTarget] = useState<Message | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const loadData = useCallback(async () => {
    if (!profile || !otherId) return;
    setLoading(true);
    try {
      const [msgs, other] = await Promise.all([
        SocialService.getConversationMessages(profile.id, otherId),
        SocialService.getProfile(otherId),
      ]);
      setMessages(msgs);
      setOtherUser(other);
      await SocialService.markMessagesRead(otherId, profile.id);

      // Load reactions for all messages
      const realIds = msgs.filter(m => !m.id.startsWith('opt')).map(m => m.id);
      if (realIds.length > 0) {
        const rxMap = await SocialService.batchGetMessageReactions(realIds);
        setReactions(rxMap);
      }
    } catch (e) {
      console.error('[Chat] loadData error:', e);
    } finally {
      setLoading(false);
    }
  }, [profile, otherId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Realtime: subscribe to new messages between these two users
  useEffect(() => {
    if (!profile?.id || !otherId) return;

    const channel = supabase
      .channel(`chat:${[profile.id, otherId].sort().join(':')}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `receiver_id=eq.${profile.id}`,
        },
        (payload) => {
          const newMsg = payload.new as Message;
          if (newMsg.sender_id !== otherId) return;
          setMessages(prev => {
            if (prev.some(m => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
          setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
          SocialService.markMessagesRead(otherId, profile.id).catch(() => {});
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'message_reactions' },
        async (payload) => {
          const r = payload.new as any;
          setReactions(prev => {
            const msgRx = [...(prev[r.message_id] ?? [])];
            const idx = msgRx.findIndex(x => x.emoji === r.emoji);
            if (idx >= 0) {
              if (!msgRx[idx].userIds.includes(r.user_id)) {
                msgRx[idx] = { ...msgRx[idx], count: msgRx[idx].count + 1, userIds: [...msgRx[idx].userIds, r.user_id] };
              }
            } else {
              msgRx.push({ emoji: r.emoji, count: 1, userIds: [r.user_id] });
            }
            return { ...prev, [r.message_id]: msgRx };
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'message_reactions' },
        async (payload) => {
          const r = payload.old as any;
          setReactions(prev => {
            const msgRx = [...(prev[r.message_id] ?? [])];
            const idx = msgRx.findIndex(x => x.emoji === r.emoji);
            if (idx >= 0) {
              const newUserIds = msgRx[idx].userIds.filter(id => id !== r.user_id);
              if (newUserIds.length === 0) {
                msgRx.splice(idx, 1);
              } else {
                msgRx[idx] = { ...msgRx[idx], count: newUserIds.length, userIds: newUserIds };
              }
            }
            return { ...prev, [r.message_id]: msgRx };
          });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile?.id, otherId]);

  const [uploading, setUploading] = useState(false);
  const [viewingImage, setViewingImage] = useState<string | null>(null);

  const send = async () => {
    const text = input.trim();
    if (!text || !profile || !otherId || sending) return;
    setSending(true);
    const optimistic: Message = {
      id: `opt-${Date.now()}`,
      sender_id: profile.id,
      receiver_id: otherId,
      content: text,
      read: false,
      created_at: new Date().toISOString(),
      sender: profile,
    };
    setMessages(prev => [...prev, optimistic]);
    setInput('');
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    try {
      const sent = await SocialService.sendMessage(profile.id, otherId, text);
      if (sent) {
        setMessages(prev => prev.map(m => m.id === optimistic.id ? { ...sent, sender: profile } : m));
      }
    } catch (e) {
      console.error('[Chat] send error:', e);
      setMessages(prev => prev.filter(m => m.id !== optimistic.id));
    } finally {
      setSending(false);
    }
  };

  const pickAndSendImage = async () => {
    if (!profile || !otherId || uploading) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setUploading(true);
    const optimistic: Message = {
      id: `opt-img-${Date.now()}`,
      sender_id: profile.id,
      receiver_id: otherId,
      content: '',
      media_url: asset.uri,
      media_type: 'image',
      read: false,
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
        name: `photo.${ext}`,
      });
      if (!publicUrl) { setMessages(prev => prev.filter(m => m.id !== optimistic.id)); return; }
      const sent = await SocialService.sendMessageWithMedia(profile.id, otherId, '', publicUrl, 'image');
      if (sent) {
        setMessages(prev => prev.map(m => m.id === optimistic.id ? { ...sent, sender: profile } : m));
      }
    } catch (e) {
      console.error('[Chat] pickAndSendImage error:', e);
      setMessages(prev => prev.filter(m => m.id !== optimistic.id));
    } finally {
      setUploading(false);
    }
  };

  const handleLongPress = (item: Message) => {
    setReactionTarget(item);
    setShowEmojiPicker(true);
  };

  const handleReact = async (emoji: string) => {
    if (!profile || !reactionTarget || reactionTarget.id.startsWith('opt')) return;
    setShowEmojiPicker(false);
    const msgId = reactionTarget.id;
    // Optimistic update
    setReactions(prev => {
      const msgRx = [...(prev[msgId] ?? [])];
      const idx = msgRx.findIndex(x => x.emoji === emoji);
      const alreadyReacted = idx >= 0 && msgRx[idx].userIds.includes(profile.id);
      if (alreadyReacted) {
        const newUserIds = msgRx[idx].userIds.filter(id => id !== profile.id);
        if (newUserIds.length === 0) msgRx.splice(idx, 1);
        else msgRx[idx] = { ...msgRx[idx], count: newUserIds.length, userIds: newUserIds };
      } else if (idx >= 0) {
        msgRx[idx] = { ...msgRx[idx], count: msgRx[idx].count + 1, userIds: [...msgRx[idx].userIds, profile.id] };
      } else {
        msgRx.push({ emoji, count: 1, userIds: [profile.id] });
      }
      return { ...prev, [msgId]: msgRx };
    });
    await SocialService.toggleMessageReaction(msgId, profile.id, emoji);
    setReactionTarget(null);
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const renderReactions = (msgId: string, mine: boolean) => {
    const rx = reactions[msgId];
    if (!rx || rx.length === 0) return null;
    return (
      <View style={[styles.reactionsRow, mine ? styles.reactionsRowRight : styles.reactionsRowLeft]}>
        {rx.map(r => {
          const isMine = profile && r.userIds.includes(profile.id);
          return (
            <TouchableOpacity
              key={r.emoji}
              style={[styles.reactionChip, isMine && styles.reactionChipMine]}
              onPress={() => {
                if (!profile || msgId.startsWith('opt')) return;
                setReactionTarget({ id: msgId } as any);
                handleReact(r.emoji);
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.reactionEmoji}>{r.emoji}</Text>
              {r.count > 1 && <Text style={styles.reactionCount}>{r.count}</Text>}
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const mine = item.sender_id === profile?.id;
    const prevItem = index > 0 ? messages[index - 1] : null;
    const showAvatar = !mine && (!prevItem || prevItem.sender_id !== item.sender_id);
    const msgReactions = reactions[item.id];

    return (
      <TouchableOpacity
        onLongPress={() => handleLongPress(item)}
        activeOpacity={0.95}
        delayLongPress={400}
      >
        <View style={[styles.msgRow, mine ? styles.msgRowRight : styles.msgRowLeft]}>
          {!mine && (
            <View style={styles.avatarCol}>
              {showAvatar ? (
                <View style={styles.msgAvatar}>
                  {otherUser?.avatar_url ? (
                    <Image source={{ uri: otherUser.avatar_url }} style={styles.msgAvatarImg} />
                  ) : (
                    <User size={16} color={colors.textMuted} />
                  )}
                </View>
              ) : (
                <View style={styles.avatarPlaceholder} />
              )}
            </View>
          )}
          <View style={[styles.bubbleWrap, mine ? styles.bubbleWrapRight : styles.bubbleWrapLeft]}>
            {item.media_url ? (
              mine ? (
                <View style={styles.imgBubbleMine}>
                  <TouchableOpacity activeOpacity={0.85} onPress={() => setViewingImage(item.media_url!)}>
                    <Image source={{ uri: item.media_url }} style={styles.msgImage} resizeMode="cover" />
                    <View style={styles.zoomHint}><ZoomIn size={16} color="rgba(255,255,255,0.8)" strokeWidth={2} /></View>
                  </TouchableOpacity>
                  <View style={[styles.bubbleMeta, { paddingHorizontal: 8, paddingBottom: 6 }]}>
                    <Text style={styles.bubbleTimeMine}>{formatTime(item.created_at)}</Text>
                    <View style={styles.readRow}>
                      <Check size={11} color={item.read ? '#60A5FA' : 'rgba(255,255,255,0.5)'} strokeWidth={2.5} />
                      <Check size={11} color={item.read ? '#60A5FA' : 'rgba(255,255,255,0.5)'} strokeWidth={2.5} style={{ marginLeft: -5 }} />
                    </View>
                  </View>
                </View>
              ) : (
                <View style={styles.imgBubbleOther}>
                  <TouchableOpacity activeOpacity={0.85} onPress={() => setViewingImage(item.media_url!)}>
                    <Image source={{ uri: item.media_url }} style={styles.msgImage} resizeMode="cover" />
                    <View style={styles.zoomHint}><ZoomIn size={16} color="rgba(255,255,255,0.8)" strokeWidth={2} /></View>
                  </TouchableOpacity>
                  <Text style={[styles.bubbleTimeOther, { paddingHorizontal: 8, paddingBottom: 6 }]}>{formatTime(item.created_at)}</Text>
                </View>
              )
            ) : mine ? (
              <>
                <LinearGradient
                  colors={['#3B82F6', '#1D4ED8']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.bubble, styles.bubbleMine]}
                >
                  <LinkText text={item.content} style={styles.bubbleTextMine} />
                  <View style={styles.bubbleMeta}>
                    <Text style={styles.bubbleTimeMine}>{formatTime(item.created_at)}</Text>
                    <View style={styles.readRow}>
                      <Check size={11} color={item.read ? '#93C5FD' : 'rgba(255,255,255,0.5)'} strokeWidth={2.5} />
                      <Check size={11} color={item.read ? '#93C5FD' : 'rgba(255,255,255,0.5)'} strokeWidth={2.5} style={{ marginLeft: -5 }} />
                    </View>
                  </View>
                </LinearGradient>
                {item.content && extractUrls(item.content).length > 0 && (
                  <LinkPreview url={extractUrls(item.content)[0]} />
                )}
              </>
            ) : (
              <>
                <View style={[styles.bubble, styles.bubbleOther]}>
                  <LinkText text={item.content} style={styles.bubbleTextOther} />
                  <Text style={styles.bubbleTimeOther}>{formatTime(item.created_at)}</Text>
                </View>
                {item.content && extractUrls(item.content).length > 0 && (
                  <LinkPreview url={extractUrls(item.content)[0]} />
                )}
              </>
            )}
            {msgReactions && msgReactions.length > 0 && renderReactions(item.id, mine)}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const otherName = otherUser?.username
    || (otherUser?.wallet_address
      ? `${otherUser.wallet_address.slice(0, 6)}...${otherUser.wallet_address.slice(-4)}`
      : 'User');
  const otherAddr = otherUser?.wallet_address
    ? `${otherUser.wallet_address.slice(0, 6)}...${otherUser.wallet_address.slice(-4)}`
    : null;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
            <ArrowLeft size={22} color={colors.textPrimary} strokeWidth={2.5} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.topBarUser} activeOpacity={0.8} onPress={() => otherId && router.push(`/profile/${otherId}` as any)}>
            <View style={styles.topAvatar}>
              {otherUser?.avatar_url ? (
                <Image source={{ uri: otherUser.avatar_url }} style={styles.topAvatarImg} />
              ) : (
                <User size={20} color={colors.textMuted} />
              )}
            </View>
            <View style={styles.topUserInfo}>
              <Text style={styles.topUsername}>{otherName}</Text>
              {otherAddr && otherUser?.username ? (
                <Text style={styles.onlineText}>{otherAddr}</Text>
              ) : (
                <Text style={styles.onlineText}>View profile</Text>
              )}
            </View>
          </TouchableOpacity>

          <View style={styles.topActions}>
            <TouchableOpacity style={styles.topActionBtn} activeOpacity={0.7}>
              <Phone size={20} color={colors.textSecondary} strokeWidth={2} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.topActionBtn} activeOpacity={0.7}>
              <Video size={20} color={colors.textSecondary} strokeWidth={2} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.topActionBtn} activeOpacity={0.7}>
              <MoreHorizontal size={20} color={colors.textSecondary} strokeWidth={2} />
            </TouchableOpacity>
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
              <Text style={styles.emptyText}>No messages yet.</Text>
              <Text style={styles.emptySubText}>Send the first message!</Text>
            </View>
          ) : (
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={item => item.id}
              renderItem={renderMessage}
              contentContainerStyle={styles.msgList}
              showsVerticalScrollIndicator={false}
              onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            />
          )}

          {/* Input bar */}
          <View style={styles.inputBar}>
            <TouchableOpacity style={styles.plusBtn} activeOpacity={0.8} onPress={pickAndSendImage} disabled={uploading}>
              {uploading ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <ImageIcon size={20} color={colors.white} strokeWidth={2.5} />
              )}
            </TouchableOpacity>

            <View style={styles.inputWrap}>
              <TextInput
                style={styles.input}
                placeholder="Type a message..."
                placeholderTextColor={colors.textMuted}
                value={input}
                onChangeText={setInput}
                multiline
                returnKeyType="send"
                onSubmitEditing={send}
              />
              <TouchableOpacity style={styles.emojiBtn} activeOpacity={0.7}>
                <Smile size={20} color={colors.textMuted} strokeWidth={2} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.sendBtn, input.trim() ? styles.sendBtnActive : styles.sendBtnInactive]}
              onPress={send}
              activeOpacity={0.8}
              disabled={sending}
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

      {/* Emoji reaction picker */}
      <Modal
        visible={showEmojiPicker}
        transparent
        animationType="fade"
        onRequestClose={() => { setShowEmojiPicker(false); setReactionTarget(null); }}
      >
        <TouchableWithoutFeedback onPress={() => { setShowEmojiPicker(false); setReactionTarget(null); }}>
          <View style={styles.emojiOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.emojiSheet}>
                <Text style={styles.emojiSheetTitle}>React</Text>
                <View style={styles.emojiGrid}>
                  {EMOJI_SET.map(emoji => (
                    <TouchableOpacity
                      key={emoji}
                      style={styles.emojiBtn2}
                      onPress={() => handleReact(emoji)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.emojiChar}>{emoji}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Full-screen image viewer */}
      <Modal
        visible={!!viewingImage}
        transparent
        animationType="fade"
        onRequestClose={() => setViewingImage(null)}
      >
        <View style={styles.imageViewerOverlay}>
          <TouchableOpacity
            style={styles.imageViewerClose}
            onPress={() => setViewingImage(null)}
            activeOpacity={0.8}
          >
            <X size={22} color="#fff" strokeWidth={2} />
          </TouchableOpacity>
          {viewingImage && (
            <Image
              source={{ uri: viewingImage }}
              style={styles.imageViewerImg}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
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
  backBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBarUser: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  topAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: '#1E1E2E',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  topAvatarImg: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  topUserInfo: {
    gap: 2,
  },
  topUsername: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  onlineText: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '500',
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  topActionBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(59,130,246,0.12)',
  },

  loadingCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  emptySubText: {
    fontSize: 14,
    color: colors.textMuted,
  },

  msgList: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    gap: 6,
  },
  msgRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  msgRowLeft: {
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
  },
  msgRowRight: {
    justifyContent: 'flex-end',
  },
  avatarCol: {
    width: 40,
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  msgAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1E1E2E',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  msgAvatarImg: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  avatarPlaceholder: {
    width: 36,
    height: 36,
  },
  bubbleWrap: {
    maxWidth: '75%',
  },
  bubbleWrapLeft: {},
  bubbleWrapRight: {},
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleMine: {
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: '#1E1E2E',
    borderBottomLeftRadius: 4,
  },
  bubbleTextMine: {
    fontSize: 15,
    color: colors.white,
    lineHeight: 21,
  },
  bubbleTextOther: {
    fontSize: 15,
    color: colors.textPrimary,
    lineHeight: 21,
  },
  bubbleMeta: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  bubbleTimeMine: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
  },
  bubbleTimeOther: {
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'right',
    marginTop: 4,
  },
  readRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  msgImage: {
    width: 220,
    height: 160,
    borderRadius: 12,
  },
  imgBubbleMine: {
    backgroundColor: 'transparent',
    borderRadius: 14,
    overflow: 'hidden',
    borderBottomRightRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.3)',
  },
  imgBubbleOther: {
    backgroundColor: '#1E1E2E',
    borderRadius: 14,
    overflow: 'hidden',
    borderBottomLeftRadius: 4,
  },

  // Reactions
  reactionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
  },
  reactionsRowLeft: { justifyContent: 'flex-start' },
  reactionsRowRight: { justifyContent: 'flex-end' },
  reactionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  reactionChipMine: {
    backgroundColor: 'rgba(59,130,246,0.18)',
    borderColor: 'rgba(59,130,246,0.4)',
  },
  reactionEmoji: { fontSize: 14 },
  reactionCount: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
  },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    paddingBottom: Platform.OS === 'ios' ? spacing.xl : spacing.md,
    gap: spacing.sm,
    backgroundColor: '#0A0A0F',
    borderTopWidth: 1,
    borderTopColor: 'rgba(59,130,246,0.08)',
  },
  plusBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#1A1A28',
    borderRadius: 22,
    paddingHorizontal: spacing.lg,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    minHeight: 44,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.15)',
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: colors.textPrimary,
    minHeight: 24,
    maxHeight: 120,
    paddingTop: 0,
    paddingBottom: 0,
    textAlignVertical: 'top',
  },
  emojiBtn: {
    marginLeft: spacing.sm,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnActive: {
    backgroundColor: colors.primary,
  },
  sendBtnInactive: {
    backgroundColor: colors.primary,
    opacity: 0.7,
  },
  zoomHint: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 10,
    padding: 3,
  },

  // Emoji picker modal
  emojiOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emojiSheet: {
    backgroundColor: '#1A1A28',
    borderRadius: 20,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    gap: spacing.md,
  },
  emojiSheetTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  emojiGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  emojiBtn2: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emojiChar: {
    fontSize: 24,
  },

  imageViewerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageViewerClose: {
    position: 'absolute',
    top: 48,
    right: 20,
    zIndex: 10,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20,
    padding: 8,
  },
  imageViewerImg: {
    width: '100%',
    height: '80%',
  },
});
