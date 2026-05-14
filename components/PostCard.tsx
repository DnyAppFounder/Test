import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Share, Modal, Pressable, Dimensions, Platform, ActivityIndicator, Animated } from 'react-native';
import { Heart, MessageCircle, Repeat2, Share2, MoveHorizontal as MoreHorizontal, User, Trash2, X, Megaphone, ChartBar as BarChart2 } from 'lucide-react-native';
import VerificationBadge from './VerificationBadge';
import PostTokenCard from './PostTokenCard';
import LinkText, { extractUrls } from './LinkText';
import LinkPreview from './LinkPreview';
import { useRouter } from 'expo-router';
import { Post, UserProfile, SocialService } from '@/services/socialService';
import { colors, spacing, borderRadius, fontSize } from '@/constants/theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface PostCardProps {
  post: Post;
  currentProfile: UserProfile | null;
  onLike: (postId: string) => void;
  onComment: (postId: string) => void;
  onRepost: (postId: string) => void;
  onPromote?: (postId: string) => void;
  onDelete?: (postId: string) => void;
}

export function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

export default function PostCard({ post, currentProfile, onLike, onComment, onRepost, onPromote = undefined, onDelete }: PostCardProps) {
  const isOwnPost = currentProfile != null && post.author_id === currentProfile.id;
  const router = useRouter();
  const [avatarError, setAvatarError] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  const isPremiumAuthor = !!(post.author?.is_premium && (post.author?.premium_expires_at == null || new Date(post.author.premium_expires_at) > new Date()));

  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!post.post_animated || !isPremiumAuthor) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(glowAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
      Animated.timing(glowAnim, { toValue: 0, duration: 1500, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [post.post_animated]);

  // Poll state
  const hasPoll = !!(post.poll_options && post.poll_options.length >= 2);
  const [pollVotes, setPollVotes] = useState<{ option_index: number; count: number }[]>([]);
  const [myVote, setMyVote] = useState<number | null>(null);
  const [loadingPoll, setLoadingPoll] = useState(false);
  const [votingPoll, setVotingPoll] = useState(false);

  useEffect(() => {
    if (!hasPoll) return;
    let active = true;
    (async () => {
      setLoadingPoll(true);
      try {
        const [votes, mine] = await Promise.all([
          SocialService.getPollVotes(post.id),
          currentProfile?.wallet_address
            ? SocialService.getMyPollVote(post.id, currentProfile.wallet_address)
            : Promise.resolve(null),
        ]);
        if (!active) return;
        setPollVotes(votes);
        setMyVote(mine);
      } catch {}
      finally { if (active) setLoadingPoll(false); }
    })();
    return () => { active = false; };
  }, [post.id, hasPoll, currentProfile?.wallet_address]);

  const handleVote = async (optionIndex: number) => {
    if (!currentProfile?.wallet_address || myVote !== null || votingPoll) return;
    setVotingPoll(true);
    try {
      await SocialService.votePoll(post.id, currentProfile.wallet_address, optionIndex);
      const [votes] = await Promise.all([SocialService.getPollVotes(post.id)]);
      setPollVotes(votes);
      setMyVote(optionIndex);
    } catch {}
    finally { setVotingPoll(false); }
  };

  const totalVotes = pollVotes.reduce((sum, v) => sum + v.count, 0);
  const getVoteCount = (idx: number) => pollVotes.find(v => v.option_index === idx)?.count ?? 0;

  const handleProfilePress = () => {
    if (post.author?.id) router.push(`/profile/${post.author.id}`);
  };

  const handleShare = async () => {
    try {
      const authorName = post.author?.username || post.author?.wallet_address?.slice(0, 8) || 'Someone';
      await Share.share({
        message: `${authorName} on Dawen Pulse: "${post.content.slice(0, 120)}${post.content.length > 120 ? '...' : ''}"`,
      });
    } catch {}
  };

  const authorName = post.author?.username
    || `${post.author?.wallet_address?.slice(0, 6)}...${post.author?.wallet_address?.slice(-4)}`;

  const mediaUrls: string[] = (() => {
    if (post.media_urls && post.media_urls.length > 0) return post.media_urls;
    if ((post.media_url || post.image_url) && !imageError) return [(post.media_url || post.image_url)!];
    return [];
  })();

  const hasDualToken = !!(post.token_symbol && post.token_address && post.token_symbol_2 && post.token_address_2);

  const cardStyle = [styles.card, post.is_promoted && styles.cardPromoted];
  const animatedOpacity = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] });

  const cardInner = (
    <>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleProfilePress} activeOpacity={0.8}>
          <View style={styles.avatar}>
            {post.author?.avatar_url && !avatarError ? (
              <Image
                source={{ uri: post.author.avatar_url }}
                style={styles.avatarImg}
                onError={() => setAvatarError(true)}
              />
            ) : (
              <User size={20} color={colors.textMuted} />
            )}
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.authorInfo} onPress={handleProfilePress} activeOpacity={0.8}>
          <View style={styles.nameRow}>
            <Text style={[styles.name, isPremiumAuthor && post.author?.name_color ? { color: post.author.name_color } : undefined]}>{authorName}</Text>
            {post.author && <VerificationBadge profile={post.author} size="sm" />}
          </View>
          <View style={styles.subRow}>
            {post.author?.username && post.author?.wallet_address ? (
              <Text style={styles.walletAddr}>
                {post.author.wallet_address.slice(0, 4)}...{post.author.wallet_address.slice(-4)}
              </Text>
            ) : null}
            <Text style={styles.time}>{timeAgo(post.created_at)}</Text>
          </View>
        </TouchableOpacity>

        {onDelete ? (
          <TouchableOpacity style={styles.moreBtn} onPress={() => onDelete?.(post.id)} activeOpacity={0.7}>
            <Trash2 size={17} color="#ef4444" strokeWidth={2} />
          </TouchableOpacity>
        ) : isOwnPost && onPromote ? (
          <TouchableOpacity style={styles.moreBtn} onPress={() => onPromote(post.id)} activeOpacity={0.7}>
            <MoreHorizontal size={18} color={colors.textMuted} strokeWidth={2} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Promoted badge */}
      {post.is_promoted && (
        <View style={styles.promotedBadge}>
          <Megaphone size={11} color="#f59e0b" strokeWidth={2.5} />
          <Text style={styles.promotedBadgeText}>Sponsored</Text>
          {post.promoted_until && (
            <Text style={styles.promotedUntilText}>
              · until {new Date(post.promoted_until).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })}
            </Text>
          )}
        </View>
      )}

      {/* Content */}
      <LinkText
        text={post.content}
        style={isPremiumAuthor && post.text_color ? [styles.content, { color: post.text_color }] : styles.content}
        onMentionPress={(username) => {
          SocialService.searchUsers(username).then(results => {
            if (results[0]?.id) router.push(`/profile/${results[0].id}` as any);
          }).catch(() => {});
        }}
        isPremiumAuthor={isPremiumAuthor}
        onCashtagPress={(sym) => {
          router.push(('/discover?q=$' + sym) as any);
        }}
      />

      {/* Link preview — first URL in post */}
      {(() => {
        const urls = extractUrls(post.content);
        if (urls.length === 0) return null;
        return <LinkPreview url={urls[0]} />;
      })()}

      {/* GIF */}
      {post.gif_url && (
        <TouchableOpacity activeOpacity={0.9} onPress={() => setPreviewUri(post.gif_url!)}>
          <Image
            source={{ uri: post.gif_url }}
            style={styles.gifDisplay}
            resizeMode="cover"
          />
        </TouchableOpacity>
      )}

      {/* Poll */}
      {hasPoll && post.poll_options && (
        <View style={styles.poll}>
          <View style={styles.pollTitle}>
            <BarChart2 size={12} color={colors.textMuted} strokeWidth={2} />
            <Text style={styles.pollTitleText}>Poll · {totalVotes} vote{totalVotes !== 1 ? 's' : ''}</Text>
          </View>
          {loadingPoll ? (
            <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 8 }} />
          ) : (
            post.poll_options.map((opt, idx) => {
              const voted = myVote !== null;
              const count = getVoteCount(idx);
              const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
              const isMyChoice = myVote === idx;
              return voted ? (
                <View key={idx} style={[styles.pollResult, isMyChoice && styles.pollResultMine]}>
                  <View style={[styles.pollBar, { width: `${pct}%` as any }]} />
                  <View style={styles.pollResultInner}>
                    <Text style={[styles.pollOptText, isMyChoice && styles.pollOptTextMine]} numberOfLines={1}>{opt}</Text>
                    <Text style={styles.pollPct}>{pct}%</Text>
                  </View>
                </View>
              ) : (
                <TouchableOpacity
                  key={idx}
                  style={[styles.pollOption, votingPoll && { opacity: 0.6 }]}
                  onPress={() => handleVote(idx)}
                  activeOpacity={0.75}
                  disabled={votingPoll || !currentProfile?.wallet_address}
                >
                  <Text style={styles.pollOptText} numberOfLines={1}>{opt}</Text>
                  {votingPoll && idx === 0 && <ActivityIndicator size="small" color={colors.primary} />}
                </TouchableOpacity>
              );
            })
          )}
          {!currentProfile?.wallet_address && myVote === null && (
            <Text style={styles.pollNoWallet}>Connect wallet to vote</Text>
          )}
        </View>
      )}

      {/* Media grid */}
      {mediaUrls.length > 0 && (() => {
        if (mediaUrls.length === 1) {
          return (
            <TouchableOpacity activeOpacity={0.9} onPress={() => setPreviewUri(mediaUrls[0])}>
              <Image
                source={{ uri: mediaUrls[0] }}
                style={styles.image}
                resizeMode="cover"
                onError={() => setImageError(true)}
              />
            </TouchableOpacity>
          );
        }
        return (
          <View style={styles.mediaGrid}>
            {mediaUrls.slice(0, 4).map((uri, idx) => (
              <TouchableOpacity
                key={uri + idx}
                style={[
                  styles.mediaGridItem,
                  mediaUrls.length === 2 && styles.mediaGridItem2,
                  mediaUrls.length >= 3 && styles.mediaGridItem3,
                ]}
                activeOpacity={0.9}
                onPress={() => setPreviewUri(uri)}
              >
                <Image source={{ uri }} style={styles.mediaGridImg} resizeMode="cover" />
                {idx === 3 && mediaUrls.length > 4 && (
                  <View style={styles.mediaGridMore}>
                    <Text style={styles.mediaGridMoreText}>+{mediaUrls.length - 4}</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        );
      })()}

      {/* Full-screen image preview modal */}
      <Modal visible={!!previewUri} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setPreviewUri(null)}>
        <Pressable style={previewStyles.overlay} onPress={() => setPreviewUri(null)}>
          <TouchableOpacity style={previewStyles.closeBtn} onPress={() => setPreviewUri(null)} activeOpacity={0.8}>
            <X size={22} color="#fff" strokeWidth={2.5} />
          </TouchableOpacity>
          {previewUri && (
            <Image
              source={{ uri: previewUri }}
              style={previewStyles.fullImage}
              resizeMode="contain"
            />
          )}
        </Pressable>
      </Modal>

      {/* Token cards: dual stacked or single */}
      {hasDualToken ? (
        <View style={styles.dualTokenStack}>
          <PostTokenCard
            tokenAddress={post.token_address!}
            tokenSymbol={post.token_symbol!}
            tokenLogoUri={post.token_logo_uri}
            storedPrice={post.token_price}
            storedChange24h={post.token_change_24h}
          />
          <PostTokenCard
            tokenAddress={post.token_address_2!}
            tokenSymbol={post.token_symbol_2!}
            tokenLogoUri={post.token_logo_uri_2}
            storedPrice={post.token_price_2}
            storedChange24h={post.token_change_24h_2}
          />
        </View>
      ) : post.token_symbol && post.token_address ? (
        <PostTokenCard
          tokenAddress={post.token_address}
          tokenSymbol={post.token_symbol}
          tokenLogoUri={post.token_logo_uri}
          storedPrice={post.token_price}
          storedChange24h={post.token_change_24h}
        />
      ) : null}

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.action} onPress={() => onLike(post.id)} activeOpacity={0.7}>
          <Heart
            size={18}
            color={post.liked_by_user ? '#ef4444' : colors.textMuted}
            fill={post.liked_by_user ? '#ef4444' : 'none'}
            strokeWidth={2}
          />
          <Text style={[styles.actionCount, post.liked_by_user && styles.actionCountLiked]}>
            {post.likes_count || 0}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.action} onPress={() => onComment(post.id)} activeOpacity={0.7}>
          <MessageCircle size={18} color={colors.textMuted} strokeWidth={2} />
          <Text style={styles.actionCount}>{post.comments_count || 0}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.action} onPress={() => onRepost(post.id)} activeOpacity={0.7}>
          <Repeat2
            size={18}
            color={post.reposted_by_user ? colors.success : colors.textMuted}
            strokeWidth={2}
          />
          <Text style={[styles.actionCount, post.reposted_by_user && styles.actionCountRepost]}>
            {post.reposts_count || 0}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.action} onPress={handleShare} activeOpacity={0.7}>
          <Share2 size={18} color={colors.textMuted} strokeWidth={2} />
        </TouchableOpacity>
      </View>
    </>
  );

  if (post.post_animated && isPremiumAuthor) {
    return (
      <Animated.View style={[cardStyle, { opacity: animatedOpacity }]}>
        {cardInner}
      </Animated.View>
    );
  }

  return (
    <View style={cardStyle}>
      {cardInner}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  cardPromoted: {
    borderColor: 'rgba(245,158,11,0.45)',
    borderWidth: 1.5,
    backgroundColor: 'rgba(245,158,11,0.03)',
  },
  promotedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(245,158,11,0.1)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.25)',
  },
  promotedBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#f59e0b',
    letterSpacing: 0.3,
  },
  promotedUntilText: {
    fontSize: 10,
    color: 'rgba(245,158,11,0.65)',
    fontWeight: '500',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(139,92,246,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarImg: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  authorInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  name: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  walletAddr: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.35)',
    fontFamily: 'SpaceMono-Regular',
  },
  time: {
    fontSize: fontSize.xs,
    color: 'rgba(255,255,255,0.35)',
    fontWeight: '500',
  },
  moreBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    fontSize: fontSize.md,
    color: colors.textPrimary,
    lineHeight: 23,
    marginBottom: spacing.md,
    fontWeight: '400',
  },
  image: {
    width: '100%',
    height: 210,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxl,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionCount: {
    fontSize: fontSize.sm,
    color: 'rgba(255,255,255,0.4)',
    fontWeight: '600',
  },
  actionCountLiked: {
    color: '#ef4444',
  },
  actionCountRepost: {
    color: colors.success,
  },
  mediaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 3,
    marginBottom: spacing.md,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  mediaGridItem: {
    width: '49%',
    height: 140,
    position: 'relative',
  },
  mediaGridItem2: {
    width: '49%',
    height: 160,
  },
  mediaGridItem3: {
    width: '32%',
    height: 120,
  },
  mediaGridImg: {
    width: '100%',
    height: '100%',
    borderRadius: 4,
  },
  mediaGridMore: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 4,
  },
  mediaGridMoreText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
  },
  dualTokenStack: {
    gap: 0,
    marginBottom: spacing.md,
  },

  // GIF
  gifDisplay: {
    width: '100%',
    height: 200,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },

  // Poll
  poll: {
    backgroundColor: 'rgba(139,92,246,0.05)',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.15)',
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  pollTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 2,
  },
  pollTitleText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '600',
  },
  pollOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.3)',
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    backgroundColor: 'rgba(139,92,246,0.06)',
  },
  pollOptText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
    flex: 1,
  },
  pollOptTextMine: { color: colors.primary },
  pollResult: {
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    position: 'relative',
    height: 38,
    backgroundColor: 'rgba(255,255,255,0.04)',
    marginBottom: 2,
  },
  pollResultMine: {
    borderWidth: 1,
    borderColor: colors.primary,
  },
  pollBar: {
    position: 'absolute',
    top: 0, left: 0, bottom: 0,
    backgroundColor: 'rgba(139,92,246,0.2)',
    borderRadius: borderRadius.md,
  },
  pollResultInner: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
  },
  pollPct: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textMuted,
  },
  pollNoWallet: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textAlign: 'center',
    fontWeight: '500',
    paddingTop: 2,
  },
});

const previewStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.8,
  },
  closeBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 24,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
});
