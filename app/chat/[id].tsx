import { useState, useRef } from 'react';
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
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Phone, Video, MoveHorizontal as MoreHorizontal, Smile, Send, Plus, Check } from 'lucide-react-native';
import { colors, spacing, borderRadius, fontSize } from '@/constants/theme';

const AVATAR = 'https://images.pexels.com/photos/1681010/pexels-photo-1681010.jpeg?w=100';

type Message = {
  id: string;
  text: string;
  time: string;
  mine: boolean;
  read?: boolean;
};

const INITIAL_MESSAGES: Message[] = [
  { id: '1', text: 'Hey DawenMaster! 👋\nHow\'s it going?', time: '9:30 AM', mine: false },
  { id: '2', text: 'Hey CryptoKing! 👋\nAll good, just working on something big 💜', time: '9:31 AM', mine: true, read: true },
  { id: '3', text: 'Can\'t wait to see it! 🚀\n$DAWEN is about to explode 🔥', time: '9:32 AM', mine: false },
  { id: '4', text: 'I know! The community is growing fast every single day.', time: '9:32 AM', mine: true, read: true },
  { id: '5', text: 'Phase 4 is going to be insane.\nYou ready? 😎', time: '9:34 AM', mine: false },
  { id: '6', text: 'Always. Built different. DAWEN family 💜', time: '9:35 AM', mine: true, read: true },
  { id: '7', text: '🚀 Let\'s take this to the next level together.', time: '9:36 AM', mine: false },
  { id: '8', text: 'Let\'s go! 🔥', time: '9:37 AM', mine: true, read: false },
];

export default function ChatScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState('');
  const listRef = useRef<FlatList>(null);

  const send = () => {
    const text = input.trim();
    if (!text) return;
    const now = new Date();
    const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    setMessages(prev => [...prev, { id: Date.now().toString(), text, time, mine: true, read: false }]);
    setInput('');
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const renderDateSeparator = () => (
    <View style={styles.dateSep}>
      <Text style={styles.dateSepText}>May 20, 2024</Text>
    </View>
  );

  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const showDate = index === 0;
    const prevMsg = index > 0 ? messages[index - 1] : null;
    const showAvatar = !item.mine && (!prevMsg || prevMsg.mine);

    return (
      <>
        {showDate && renderDateSeparator()}
        <View style={[styles.msgRow, item.mine ? styles.msgRowRight : styles.msgRowLeft]}>
          {!item.mine && (
            <View style={styles.avatarCol}>
              {showAvatar ? (
                <Image source={{ uri: AVATAR }} style={styles.msgAvatar} />
              ) : (
                <View style={styles.avatarPlaceholder} />
              )}
            </View>
          )}
          <View style={[styles.bubbleWrap, item.mine ? styles.bubbleWrapRight : styles.bubbleWrapLeft]}>
            {item.mine ? (
              <LinearGradient
                colors={['#8B5CF6', '#6D28D9']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.bubble, styles.bubbleMine]}
              >
                <Text style={styles.bubbleTextMine}>{item.text}</Text>
                <View style={styles.bubbleMeta}>
                  <Text style={styles.bubbleTimeMine}>{item.time}</Text>
                  {item.read !== undefined && (
                    <View style={styles.readRow}>
                      <Check size={11} color={item.read ? '#C084FC' : 'rgba(255,255,255,0.5)'} strokeWidth={2.5} />
                      <Check size={11} color={item.read ? '#C084FC' : 'rgba(255,255,255,0.5)'} strokeWidth={2.5} style={{ marginLeft: -5 }} />
                    </View>
                  )}
                </View>
              </LinearGradient>
            ) : (
              <View style={[styles.bubble, styles.bubbleOther]}>
                <Text style={styles.bubbleTextOther}>{item.text}</Text>
                <Text style={styles.bubbleTimeOther}>{item.time}</Text>
              </View>
            )}
          </View>
        </View>
      </>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
            <ArrowLeft size={22} color={colors.textPrimary} strokeWidth={2.5} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.topBarUser} activeOpacity={0.8}>
            <Image source={{ uri: AVATAR }} style={styles.topAvatar} />
            <View style={styles.topUserInfo}>
              <View style={styles.topNameRow}>
                <Text style={styles.topUsername}>CryptoKing</Text>
                <View style={styles.verifiedBadge}>
                  <Check size={9} color={colors.white} strokeWidth={3} />
                </View>
              </View>
              <View style={styles.onlineRow}>
                <View style={styles.onlineDot} />
                <Text style={styles.onlineText}>Online</Text>
              </View>
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

        {/* Divider */}
        <View style={styles.divider} />

        {/* Messages */}
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={item => item.id}
            renderItem={renderMessage}
            contentContainerStyle={styles.msgList}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          />

          {/* Input bar */}
          <View style={styles.inputBar}>
            <TouchableOpacity style={styles.plusBtn} activeOpacity={0.8}>
              <Plus size={22} color={colors.white} strokeWidth={2.5} />
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
            >
              <Send size={18} color={colors.white} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
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

  // Top bar
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
  },
  topUserInfo: {
    gap: 2,
  },
  topNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  topUsername: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  verifiedBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  onlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10b981',
  },
  onlineText: {
    fontSize: 12,
    color: '#10b981',
    fontWeight: '600',
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
    backgroundColor: 'rgba(139,92,246,0.12)',
  },

  // Messages
  msgList: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    gap: 6,
  },
  dateSep: {
    alignItems: 'center',
    marginBottom: spacing.lg,
    marginTop: spacing.sm,
  },
  dateSepText: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '600',
    backgroundColor: '#1A1A28',
    paddingHorizontal: spacing.lg,
    paddingVertical: 5,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
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

  // Input
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
    alignItems: 'center',
    backgroundColor: '#1A1A28',
    borderRadius: 24,
    paddingHorizontal: spacing.lg,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    minHeight: 44,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.15)',
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: colors.textPrimary,
    maxHeight: 100,
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
});
