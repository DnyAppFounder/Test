import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Share, Linking } from 'react-native';
import { Heart, MessageCircle, Repeat2, Share2, MoveHorizontal as MoreHorizontal, User, Trash2 } from 'lucide-react-native';
import VerificationBadge from './VerificationBadge';
import PostTokenCard from './PostTokenCard';
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
          <TouchableOpacity style={styles.moreBtn} onPress={handleDelete} activeOpacity={0.7}>
            <Trash2 size={17} color="#ef4444" strokeWidth={2} />
          </TouchableOpacity>
        ) : isOwnPost && onPromote ? (
          <TouchableOpacity style={styles.moreBtn} onPress={() => onPromote(post.id)} activeOpacity={0.7}>
            <MoreHorizontal size={18} color={colors.textMuted} strokeWidth={2} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Content with clickable @mentions and links */}
      <Text style={styles.content}>
        {post.content.split(/(@\w+|https?:\/\/[^\s]+)/g).map((part, i) => {
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
          if (/^https?:\/\//.test(part)) {
            return (
              <Text
                key={i}
                style={styles.linkText}
                onPress={() => Linking.openURL(part).catch(() => {})}
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

      {/* Live token card */}
      {post.token_symbol && post.token_address && (
        <PostTokenCard
          tokenAddress={post.token_address}
          tokenSymbol={post.token_symbol}
          tokenLogoUri={post.token_logo_uri}
          storedPrice={post.token_price}
          storedChange24h={post.token_change_24h}
        />
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
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  walletAddr: {
    fontSize: 10,
    color: colors.textMuted,
    fontFamily: 'SpaceMono-Regular',
  },
  time: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
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
  mentionText: {
    color: '#8B5CF6',
    fontWeight: '700',
  },
  linkText: {
    color: '#3B82F6',
    fontWeight: '500',
    textDecorationLine: 'underline',
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
