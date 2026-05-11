import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Share, Modal, Pressable, Dimensions, Platform } from 'react-native';
import { Heart, MessageCircle, Repeat2, Share2, MoveHorizontal as MoreHorizontal, User, Trash2, X, Megaphone } from 'lucide-react-native';
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

  return (
    <View style={[styles.card, post.is_promoted && styles.cardPromoted]}>
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
            <Text style={styles.name}>{authorName}</Text>
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
        style={styles.content}
        onMentionPress={(username) => {
          SocialService.searchUsers(username).then(results => {
            if (results[0]?.id) router.push(`/profile/${results[0].id}` as any);
          }).catch(() => {});
        }}
      />

      {/* Link preview — first URL in post */}
      {(() => {
        const urls = extractUrls(post.content);
        if (urls.length === 0) return null;
        return <LinkPreview url={urls[0]} />;
      })()}

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

      {/* Token cards: dual comparison or single */}
      {hasDualToken ? (
        <View style={styles.dualTokenRow}>
          <View style={styles.dualTokenCard}>
            <PostTokenCard
              tokenAddress={post.token_address!}
              tokenSymbol={post.token_symbol!}
              tokenLogoUri={post.token_logo_uri}
              storedPrice={post.token_price}
              storedChange24h={post.token_change_24h}
            />
          </View>
          <View style={styles.dualTokenVs}>
            <Text style={styles.dualTokenVsText}>VS</Text>
          </View>
          <View style={styles.dualTokenCard}>
            <PostTokenCard
              tokenAddress={post.token_address_2!}
              tokenSymbol={post.token_symbol_2!}
              tokenLogoUri={post.token_logo_uri_2}
              storedPrice={post.token_price_2}
              storedChange24h={post.token_change_24h_2}
            />
          </View>
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
  dualTokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.md,
  },
  dualTokenCard: {
    flex: 1,
  },
  dualTokenVs: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(139,92,246,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  dualTokenVsText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#A78BFA',
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
