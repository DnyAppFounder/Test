import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Send, MessageCircle, User } from 'lucide-react-native';
import { tokenDiscussionService, TokenDiscussion } from '@/services/tokenDiscussionService';
import { colors, spacing, fontSize, borderRadius } from '@/constants/theme';

interface TokenDiscussionProps {
  tokenAddress: string;
  userWallet?: string;
}

export function TokenDiscussionComponent({ tokenAddress, userWallet }: TokenDiscussionProps) {
  const [discussions, setDiscussions] = useState<TokenDiscussion[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    loadDiscussions();

    const interval = setInterval(loadDiscussions, 30000);
    return () => clearInterval(interval);
  }, [tokenAddress]);

  const loadDiscussions = async () => {
    const data = await tokenDiscussionService.getDiscussions(tokenAddress);
    setDiscussions(data);
    setLoading(false);
  };

  const handlePost = async () => {
    if (!message.trim()) return;
    if (!userWallet) {
      alert('Please connect your wallet to post messages');
      return;
    }

    setPosting(true);
    const result = await tokenDiscussionService.postMessage(
      tokenAddress,
      userWallet,
      message.trim()
    );

    if (result) {
      setMessage('');
      await loadDiscussions();
    }
    setPosting(false);
  };

  const renderMessage = ({ item }: { item: TokenDiscussion }) => (
    <View style={styles.messageCard}>
      <View style={styles.messageHeader}>
        <View style={styles.userIcon}>
          <User size={14} color={colors.primary} strokeWidth={2} />
        </View>
        <Text style={styles.userName}>
          {tokenDiscussionService.formatWalletAddress(item.user_wallet)}
        </Text>
        <Text style={styles.timestamp}>
          {tokenDiscussionService.formatTimeAgo(item.created_at)}
        </Text>
      </View>

      <Text style={styles.messageText}>{item.message}</Text>

      {item.replies_count > 0 && (
        <View style={styles.replyCount}>
          <MessageCircle size={12} color={colors.textMuted} strokeWidth={2} />
          <Text style={styles.replyCountText}>{item.replies_count} replies</Text>
        </View>
      )}
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={styles.loadingText}>Loading discussion...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={100}
    >
      <View style={styles.header}>
        <MessageCircle size={20} color={colors.primary} strokeWidth={2} />
        <Text style={styles.title}>Discussion</Text>
        <Text style={styles.count}>{discussions.length}</Text>
      </View>

      <FlatList
        data={discussions}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <MessageCircle size={32} color={colors.textMuted} strokeWidth={1.5} />
            <Text style={styles.emptyText}>No messages yet</Text>
            <Text style={styles.emptySubtext}>Be the first to start the discussion</Text>
          </View>
        }
      />

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder={userWallet ? 'Share your thoughts...' : 'Connect wallet to chat'}
          placeholderTextColor={colors.textMuted}
          value={message}
          onChangeText={setMessage}
          multiline
          maxLength={500}
          editable={!!userWallet && !posting}
        />
        <TouchableOpacity
          style={[styles.sendButton, (!message.trim() || !userWallet || posting) && styles.sendButtonDisabled]}
          onPress={handlePost}
          disabled={!message.trim() || !userWallet || posting}
        >
          {posting ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Send size={18} color={colors.white} strokeWidth={2} />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
    flex: 1,
  },
  count: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textMuted,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xxl,
  },
  loadingText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  messageCard: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  userIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primaryMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userName: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textPrimary,
    flex: 1,
  },
  timestamp: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  messageText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  replyCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  replyCountText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  emptyText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textMuted,
  },
  emptySubtext: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
    backgroundColor: colors.background,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.md,
    color: colors.textPrimary,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: colors.surfaceLight,
  },
});
