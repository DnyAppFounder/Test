import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Share } from 'react-native';
import { Heart, MessageCircle, Repeat2, Share2, MoveHorizontal as MoreHorizontal, User, Trash2 } from 'lucide-react-native';
import VerificationBadge from './VerificationBadge';
import { useRouter } from 'expo-router';
import { Post, UserProfile, SocialService } from '@/services/socialService';
import { colors, spacing, borderRadius, fontSize, elevation } from '@/constants/theme';

interface PostCardProps {
  post: Post;
  currentProfile: UserProfile | null;
  onLike: (postId: string) => void;
  onComment: (postId: string) => void;
  onRepost: (postId: string) => void;
  /** Only passed when post belongs to currentProfile — triggers promote flow */
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

  const handleProfilePress = () => {
    if (post.author?.id) router.push(`/profile/${post.author.id}`);
  };

  const handleDelete = () => {
    onDelete?.(post.id);
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

  return (
    <View style={[styles.card, post.is_promoted && styles.cardPromoted]}>
      {/* Header: avatar + name/time + dots */}
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
          <Text style={styles.time}>{timeAgo(post.created_at)}</Text>
        </TouchableOpacity>

        {onDelete ? (
          <TouchableOpacity style={styles.moreBtn} onPress={handleDelete} activeOpacity={0.7}>
            <Trash2 size={17} color="#ef4444" strokeWidth={2} />
          </TouchableOpacity>
        ) : isOwnPost && onPromote ? (
          <TouchableOpacity style={styles.moreBtn} onPress={() => onPromote(post.id)} activeOpacity={0.7}>
            <MoreHorizontal size={18} color={colors.textMuted} strokeWidth={2} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Content with clickable @mentions */}
      <Text style={styles.content}>
        {post.content.split(/(@\w+)/g).map((part, i) => {
          if (/^@\w+$/.test(part)) {
            return (
              <Text
                key={i}
                style={styles.mentionText}
                onPress={() => {
                  SocialService.searchUsers(part.slice(1)).then(results => {
                    if (results[0]?.id) router.push(`/profile/${results[0].id}` as any);
                  }).catch(() => {});
                }}
              >
                {part}
              </Text>
            );
          }
          return <Text key={i}>{part}</Text>;
        })}
      </Text>

      {/* Image — prefer media_url, fallback to image_url */}
      {(post.media_url || post.image_url) && !imageError && (
        <Image
          source={{ uri: (post.media_url || post.image_url)! }}
          style={styles.image}
          resizeMode="cover"
          onError={() => setImageError(true)}
        />
      )}

      {/* Token card */}
      {post.token_symbol && (
        <View style={styles.tokenCard}>
          <View style={styles.tokenCardRow}>
            <View style={styles.tokenCardLeft}>
              {post.token_logo_uri ? (
                <Image source={{ uri: post.token_logo_uri }} style={styles.tokenCardLogo} />
              ) : (
                <View style={styles.tokenCardLogoFallback}>
                  <Text style={styles.tokenCardLogoText}>{post.token_symbol[0]}</Text>
                </View>
              )}
              <View style={styles.tokenCardInfo}>
                <Text style={styles.tokenCardSymbol}>${post.token_symbol}</Text>
                {post.token_address && (
                  <Text style={styles.tokenCardAddress}>
                    {post.token_address.slice(0, 4)}...{post.token_address.slice(-4)}
                  </Text>
                )}
              </View>
            </View>
            <View style={styles.tokenCardRight}>
              {post.token_price != null && (
                <Text style={styles.tokenCardPrice}>
                  {post.token_price < 0.01
                    ? `$${post.token_price.toFixed(6)}`
                    : post.token_price < 1
                    ? `$${post.token_price.toFixed(4)}`
                    : `$${post.token_price.toFixed(2)}`}
                </Text>
              )}
              {post.token_change_24h != null && (
                <Text style={[styles.tokenCardChange, { color: post.token_change_24h >= 0 ? '#10b981' : '#ef4444' }]}>
                  {post.token_change_24h >= 0 ? '+' : ''}{post.token_change_24h.toFixed(2)}%
                </Text>
              )}
            </View>
          </View>
        </View>
      )}

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
    backgroundColor: '#12121A',
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  cardPromoted: {
    borderColor: 'rgba(245,158,11,0.4)',
    borderWidth: 1.5,
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
    backgroundColor: '#1E1E2E',
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
  time: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
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
    backgroundColor: '#1A1A28',
  },
  tokenCard: {
    backgroundColor: '#0E0E1A',
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.2)',
  },
  tokenCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tokenCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  tokenCardLogo: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  tokenCardLogoFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1E1E2E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tokenCardLogoText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  tokenCardInfo: {
    gap: 2,
  },
  tokenCardSymbol: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.primary,
  },
  tokenCardAddress: {
    fontSize: 10,
    color: colors.textMuted,
    fontFamily: 'SpaceMono-Regular',
  },
  tokenCardRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  tokenCardPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  tokenCardChange: {
    fontSize: 12,
    fontWeight: '700',
  },
  mentionText: {
    color: '#8B5CF6',
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxl,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionCount: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: '600',
  },
  actionCountLiked: {
    color: '#ef4444',
  },
  actionCountRepost: {
    color: colors.success,
  },
});
