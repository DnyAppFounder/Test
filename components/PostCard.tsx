import { View, Text, StyleSheet, TouchableOpacity, Image, Share } from 'react-native';
import { Heart, MessageCircle, Repeat2, Share2, Star, Megaphone, User } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { Post, UserProfile } from '@/services/socialService';
import { colors, spacing, borderRadius, fontSize, elevation } from '@/constants/theme';

interface PostCardProps {
  post: Post;
  currentProfile: UserProfile | null;
  onLike: (postId: string) => void;
  onComment: (postId: string) => void;
  onRepost: (postId: string) => void;
  onPromote: (postId: string) => void;
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

export default function PostCard({ post, currentProfile, onLike, onComment, onRepost, onPromote }: PostCardProps) {
  const router = useRouter();

  const handleProfilePress = () => {
    if (post.author?.id) {
      router.push(`/profile/${post.author.id}`);
    }
  };

  const handleShare = async () => {
    try {
      const authorName = post.author?.username || post.author?.wallet_address?.slice(0, 8) || 'Someone';
      await Share.share({
        message: `${authorName} on DNY: "${post.content.slice(0, 120)}${post.content.length > 120 ? '...' : ''}"`,
      });
    } catch {}
  };

  const isOwnPost = currentProfile && post.author_id === currentProfile.id;

  return (
    <View style={[styles.postCard, post.is_promoted && styles.postCardPromoted]}>
      {post.is_promoted && (
        <View style={styles.promotedBadge}>
          <Star size={12} color={colors.warning} />
          <Text style={styles.promotedText}>Promoted</Text>
        </View>
      )}

      {post.is_repost && (
        <View style={styles.repostBadge}>
          <Repeat2 size={12} color={colors.success} />
          <Text style={styles.repostBadgeText}>Reposted</Text>
        </View>
      )}

      <View style={styles.postHeader}>
        <TouchableOpacity style={styles.avatar} onPress={handleProfilePress} activeOpacity={0.7}>
          {post.author?.avatar_url ? (
            <Image source={{ uri: post.author.avatar_url }} style={styles.avatarImage} />
          ) : (
            <User size={20} color={colors.textMuted} />
          )}
        </TouchableOpacity>
        <TouchableOpacity style={styles.postAuthorInfo} onPress={handleProfilePress} activeOpacity={0.7}>
          <View style={styles.authorNameRow}>
            <Text style={styles.postAuthorName}>
              {post.author?.username || `${post.author?.wallet_address?.slice(0, 6)}...${post.author?.wallet_address?.slice(-4)}`}
            </Text>
            {post.author?.is_verified && (
              <View style={styles.verifiedDot} />
            )}
          </View>
          <Text style={styles.postTime}>{timeAgo(post.created_at)}</Text>
        </TouchableOpacity>
        {isOwnPost && (
          <TouchableOpacity style={styles.promoteChip} onPress={() => onPromote(post.id)}>
            <Megaphone size={14} color={colors.primary} />
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.postContent}>{post.content}</Text>

      {post.image_url && (
        <Image source={{ uri: post.image_url }} style={styles.postImage} resizeMode="cover" />
      )}

      <View style={styles.postActions}>
        <TouchableOpacity style={styles.postAction} onPress={() => onLike(post.id)}>
          <Heart
            size={18}
            color={post.liked_by_user ? colors.error : colors.textMuted}
            fill={post.liked_by_user ? colors.error : 'none'}
          />
          <Text style={[styles.postActionText, post.liked_by_user && { color: colors.error }]}>
            {post.likes_count || 0}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.postAction} onPress={() => onComment(post.id)}>
          <MessageCircle size={18} color={colors.textMuted} />
          <Text style={styles.postActionText}>{post.comments_count || 0}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.postAction} onPress={() => onRepost(post.id)}>
          <Repeat2
            size={18}
            color={post.reposted_by_user ? colors.success : colors.textMuted}
          />
          <Text style={[styles.postActionText, post.reposted_by_user && { color: colors.success }]}>
            {post.reposts_count || 0}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.postAction} onPress={handleShare}>
          <Share2 size={18} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  postCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    ...elevation.sm,
  },
  postCardPromoted: {
    borderWidth: 2,
    borderColor: colors.warning,
    backgroundColor: colors.surfaceLight,
    ...elevation.md,
  },
  promotedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: spacing.sm,
    backgroundColor: colors.warningMuted,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.sm,
  },
  promotedText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.warning,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  repostBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: spacing.sm,
  },
  repostBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.success,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  postAuthorInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  authorNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  postAuthorName: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  verifiedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  postTime: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  promoteChip: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primaryMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  postContent: {
    fontSize: fontSize.md,
    color: colors.textPrimary,
    lineHeight: 22,
    marginBottom: spacing.md,
  },
  postImage: {
    width: '100%',
    height: 220,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
  postActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
    paddingTop: spacing.md,
  },
  postAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  postActionText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
});
