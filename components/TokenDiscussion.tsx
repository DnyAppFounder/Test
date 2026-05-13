import { useState, useEffect, useCallback, useRef } from 'react';
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
  Image,
} from 'react-native';
import { Send, MessageCircle, User } from 'lucide-react-native';
import { tokenDiscussionService, TokenDiscussion } from '@/services/tokenDiscussionService';
import { SocialService, UserProfile } from '@/services/socialService';
import { supabase } from '@/lib/supabase';
import VerificationBadge from '@/components/VerificationBadge';
import { colors, spacing, fontSize, borderRadius } from '@/constants/theme';

interface TokenDiscussionProps {
  tokenAddress: string;
  userWallet?: string;
}

type ProfileCache = Record<string, UserProfile | null>;

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function TokenDiscussionComponent({ tokenAddress, userWallet }: TokenDiscussionProps) {
  const [discussions, setDiscussions] = useState<TokenDiscussion[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [posting, setPosting] = useState(false);
  const profileCache = useRef<ProfileCache>({});
  const [profileMap, setProfileMap] = useState<ProfileCache>({});

  const loadDiscussions = useCallback(async () => {
    const data = await tokenDiscussionService.getDiscussions(tokenAddress);
    setDiscussions(data);
    setLoading(false);
    // Fetch profiles for any wallet addresses not yet cached
    const missing = data.filter(d => !(d.user_wallet in profileCache.current));
    if (missing.length === 0) return;
    const fetched = await Promise.all(
      missing.map(async (d) => {
        try {
          const p = await SocialService.getOrCreateProfile(d.user_wallet);
          return { wallet: d.user_wallet, profile: p };
        } catch {
          return { wallet: d.user_wallet, profile: null };
        }
      })
    );
    const updates: ProfileCache = {};
    for (const { wallet, profile } of fetched) {
      profileCache.current[wallet] = profile;
      updates[wallet] = profile;
    }
    setProfileMap(prev => ({ ...prev, ...updates }));
  }, [tokenAddress]);

  // Initial load + realtime subscription for live chat messages
  useEffect(() => {
    loadDiscussions();
    const channel = supabase
      .channel(`token_discussion_${tokenAddress}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'token_discussions', filter: `token_address=eq.${tokenAddress}` },
        () => { loadDiscussions(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tokenAddress, loadDiscussions]);

  const handlePost = async () => {
    if (!message.trim()) return;
    if (!userWallet) {
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

  const renderMessage = ({ item }: { item: TokenDiscussion }) => {
    const p = profileCache.current[item.user_wallet] ?? null;
    const displayName = p?.username || shortAddr(item.user_wallet);
    const showAddr = !!p?.username;

    return (
      <View style={styles.messageCard}>
        <View style={styles.messageHeader}>
          <View style={styles.avatarWrap}>
            {p?.avatar_url ? (
              <Image source={{ uri: p.avatar_url }} style={styles.avatarImg} />
            ) : (
              <User size={14} color={colors.primary} strokeWidth={2} />
            )}
          </View>
          <View style={styles.authorInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.userName}>{displayName}</Text>
              {p && (p.is_verified || (p as any).verified_basic || (p as any).premium_expiration) && (
                <VerificationBadge profile={p as any} size="sm" />
              )}
            </View>
            {showAddr && (
              <Text style={styles.walletAddr}>{shortAddr(item.user_wallet)}</Text>
            )}
          </View>
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
  };

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
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  avatarWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primaryMuted,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  avatarImg: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  authorInfo: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  userName: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  walletAddr: {
    fontSize: 10,
    color: colors.textMuted,
    fontFamily: 'SpaceMono-Regular',
  },
  timestamp: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    flexShrink: 0,
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
