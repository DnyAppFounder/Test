import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  Image,
  Modal,
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Send,
  X,
  User,
  Clock,
  ImagePlus,
  Megaphone,
  MessageCircle,
  Check,
  CircleAlert,
  Wallet,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useWallet } from '@/contexts/WalletContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { SocialService, Post, PostComment, PROMOTE_TIERS, UserProfile } from '@/services/socialService';
import { colors, spacing, borderRadius, fontSize, elevation } from '@/constants/theme';
import PostCard, { timeAgo } from '@/components/PostCard';

type PromoteStep = 'select' | 'confirm' | 'processing' | 'done';

export default function CommunityScreen() {
  const router = useRouter();
  const { selectedAccount } = useWallet();
  const { t } = useLanguage();
  const [posts, setPosts] = useState<Post[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPostContent, setNewPostContent] = useState('');
  const [newPostImageUrl, setNewPostImageUrl] = useState('');
  const [posting, setPosting] = useState(false);

  const [showPromoteModal, setShowPromoteModal] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [promoteStep, setPromoteStep] = useState<PromoteStep>('select');
  const [selectedTierKey, setSelectedTierKey] = useState<string | null>(null);

  const [showCommentsModal, setShowCommentsModal] = useState(false);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [newCommentContent, setNewCommentContent] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  const walletAddress = selectedAccount?.address || 'anonymous';

  const loadData = useCallback(async () => {
    setLoading(true);
    const [feedData, profileData] = await Promise.all([
      SocialService.getFeed(undefined),
      SocialService.getOrCreateProfile(walletAddress),
    ]);
    setPosts(feedData);
    setProfile(profileData);
    setLoading(false);
  }, [walletAddress]);

  const loadFeed = useCallback(async () => {
    const feedData = await SocialService.getFeed(profile?.id);
    setPosts(feedData);
  }, [profile?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (profile?.id) {
      SocialService.getFeed(profile.id).then(setPosts);
    }
  }, [profile?.id]);

  const onRefresh = async () => {
    setRefreshing(true);
    if (profile?.id) {
      const feedData = await SocialService.getFeed(profile.id);
      setPosts(feedData);
    } else {
      await loadData();
    }
    setRefreshing(false);
  };

  const handleCreatePost = async () => {
    if (!newPostContent.trim() || !profile) return;
    setPosting(true);
    const imageUrl = newPostImageUrl.trim() || undefined;
    await SocialService.createPost(profile.id, newPostContent.trim(), imageUrl);
    setNewPostContent('');
    setNewPostImageUrl('');
    setShowCreateModal(false);
    setPosting(false);
    await loadFeed();
  };

  const handleLike = async (postId: string) => {
    if (!profile) return;
    setPosts(prev => prev.map(p =>
      p.id === postId ? {
        ...p,
        liked_by_user: !p.liked_by_user,
        likes_count: p.liked_by_user ? Math.max(0, (p.likes_count || 0) - 1) : (p.likes_count || 0) + 1,
      } : p
    ));
    await SocialService.toggleLike(postId, profile.id);
  };

  const handleRepost = async (postId: string) => {
    if (!profile) return;
    setPosts(prev => prev.map(p =>
      p.id === postId ? {
        ...p,
        reposted_by_user: !p.reposted_by_user,
        reposts_count: p.reposted_by_user ? Math.max(0, (p.reposts_count || 0) - 1) : (p.reposts_count || 0) + 1,
      } : p
    ));
    await SocialService.toggleRepost(postId, profile.id);
  };

  const openPromoteModal = (postId: string) => {
    setSelectedPostId(postId);
    setPromoteStep('select');
    setSelectedTierKey(null);
    setShowPromoteModal(true);
  };

  const handleSelectTier = (tierKey: string) => {
    setSelectedTierKey(tierKey);
    setPromoteStep('confirm');
  };

  const handleConfirmPromotion = async () => {
    if (!selectedPostId || !selectedTierKey) return;
    setPromoteStep('processing');
    await new Promise(r => setTimeout(r, 1500));
    await SocialService.promotePost(selectedPostId, selectedTierKey);
    setPromoteStep('done');
    await loadFeed();
  };

  const closePromoteModal = () => {
    setShowPromoteModal(false);
    setSelectedPostId(null);
    setSelectedTierKey(null);
    setPromoteStep('select');
  };

  const openCommentsModal = async (postId: string) => {
    setSelectedPostId(postId);
    setShowCommentsModal(true);
    setCommentsLoading(true);
    const data = await SocialService.getComments(postId);
    setComments(data);
    setCommentsLoading(false);
  };

  const handleAddComment = async () => {
    if (!newCommentContent.trim() || !profile || !selectedPostId) return;
    setSubmittingComment(true);
    await SocialService.addComment(selectedPostId, profile.id, newCommentContent.trim());
    setNewCommentContent('');
    const data = await SocialService.getComments(selectedPostId);
    setComments(data);
    setSubmittingComment(false);
    await loadFeed();
  };

  const closeCommentsModal = () => {
    setShowCommentsModal(false);
    setSelectedPostId(null);
    setComments([]);
    setNewCommentContent('');
  };

  const selectedPost = posts.find((p) => p.id === selectedPostId);
  const selectedTier = PROMOTE_TIERS.find(t => t.key === selectedTierKey);

  return (
    <LinearGradient colors={colors.gradient.primary as any} style={styles.container}>
      <View style={styles.header}>
        <View style={styles.neonBackground}>
          <View style={styles.purpleGlow} />
          <View style={styles.blueGlow} />
          <View style={styles.pinkGlow} />
        </View>

        <View style={styles.headerContent}>
          <View>
            <Text style={styles.headerTitle}>{t.community.feed}</Text>
            <Text style={styles.headerSubtitle}>Connect with traders worldwide</Text>
          </View>
          <TouchableOpacity style={styles.createButton} onPress={() => setShowCreateModal(true)}>
            <Send size={18} color={colors.white} strokeWidth={2.5} />
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          renderItem={({ item: post }) => (
            <PostCard
              post={post}
              currentProfile={profile}
              onLike={handleLike}
              onComment={openCommentsModal}
              onRepost={handleRepost}
              onPromote={openPromoteModal}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIconWrapper}>
                <MessageCircle size={48} color={colors.primary} strokeWidth={1.5} />
              </View>
              <Text style={styles.emptyTitle}>No posts yet</Text>
              <Text style={styles.emptySubtitle}>Be the first to share your thoughts</Text>
              <TouchableOpacity style={styles.emptyButton} onPress={() => setShowCreateModal(true)}>
                <Text style={styles.emptyButtonText}>Create First Post</Text>
              </TouchableOpacity>
            </View>
          }
          contentContainerStyle={posts.length === 0 ? styles.emptyListContainer : styles.feedContainer}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        />
      )}

      <Modal visible={showCreateModal} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t.community.createPost}</Text>
              <TouchableOpacity onPress={() => { setShowCreateModal(false); setNewPostContent(''); setNewPostImageUrl(''); }}>
                <X size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <View style={styles.createPostAuthor}>
              <View style={styles.createPostAvatar}>
                {profile?.avatar_url ? (
                  <Image source={{ uri: profile.avatar_url }} style={styles.createPostAvatarImage} />
                ) : (
                  <User size={18} color={colors.textMuted} />
                )}
              </View>
              <Text style={styles.createPostName}>
                {profile?.username || walletAddress.slice(0, 8) + '...'}
              </Text>
            </View>

            <TextInput
              style={styles.postInput}
              placeholder={t.community.whatsOnYourMind}
              placeholderTextColor={colors.textMuted}
              value={newPostContent}
              onChangeText={setNewPostContent}
              multiline
              maxLength={500}
              autoFocus
            />

            <View style={styles.imageUrlRow}>
              <ImagePlus size={18} color={colors.textMuted} />
              <TextInput
                style={styles.imageUrlInput}
                placeholder="Paste image URL (optional)"
                placeholderTextColor={colors.textMuted}
                value={newPostImageUrl}
                onChangeText={setNewPostImageUrl}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {newPostImageUrl.trim() ? (
              <Image
                source={{ uri: newPostImageUrl.trim() }}
                style={styles.imagePreview}
                resizeMode="cover"
              />
            ) : null}

            <View style={styles.createPostFooter}>
              <Text style={styles.charCount}>{newPostContent.length}/500</Text>
              <TouchableOpacity
                style={[styles.submitButton, !newPostContent.trim() && styles.submitButtonDisabled]}
                onPress={handleCreatePost}
                disabled={!newPostContent.trim() || posting}
              >
                {posting ? (
                  <ActivityIndicator color={colors.white} size="small" />
                ) : (
                  <Text style={styles.submitButtonText}>{t.community.post}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showCommentsModal} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.commentsModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t.community.comments}</Text>
              <TouchableOpacity onPress={closeCommentsModal}>
                <X size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.commentsScrollContainer} showsVerticalScrollIndicator={false}>
              {selectedPost && (
                <TouchableOpacity
                  style={styles.commentPostPreview}
                  onPress={() => {
                    closeCommentsModal();
                    if (selectedPost.author?.id) router.push(`/profile/${selectedPost.author.id}`);
                  }}
                  activeOpacity={0.8}
                >
                  <View style={styles.commentPostPreviewHeader}>
                    <View style={styles.avatarSmall}>
                      {selectedPost.author?.avatar_url ? (
                        <Image source={{ uri: selectedPost.author.avatar_url }} style={styles.avatarSmallImage} />
                      ) : (
                        <User size={14} color={colors.textMuted} />
                      )}
                    </View>
                    <Text style={styles.commentPostPreviewAuthor}>
                      {selectedPost.author?.username || `${selectedPost.author?.wallet_address?.slice(0, 6)}...`}
                    </Text>
                    <Text style={styles.commentPostPreviewTime}>{timeAgo(selectedPost.created_at)}</Text>
                  </View>
                  <Text style={styles.commentPostPreviewContent} numberOfLines={3}>
                    {selectedPost.content}
                  </Text>
                </TouchableOpacity>
              )}

              {commentsLoading ? (
                <ActivityIndicator size="small" color={colors.primary} style={styles.commentsLoading} />
              ) : comments.length === 0 ? (
                <View style={styles.noComments}>
                  <Text style={styles.noCommentsText}>No comments yet</Text>
                </View>
              ) : (
                <View style={styles.commentsList}>
                  {comments.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.commentItem}
                      onPress={() => {
                        closeCommentsModal();
                        if (item.author?.id) router.push(`/profile/${item.author.id}`);
                      }}
                      activeOpacity={0.8}
                    >
                      <View style={styles.avatarSmall}>
                        {item.author?.avatar_url ? (
                          <Image source={{ uri: item.author.avatar_url }} style={styles.avatarSmallImage} />
                        ) : (
                          <User size={14} color={colors.textMuted} />
                        )}
                      </View>
                      <View style={styles.commentBody}>
                        <View style={styles.commentMeta}>
                          <Text style={styles.commentAuthor}>
                            {item.author?.username || `${item.author?.wallet_address?.slice(0, 6)}...`}
                          </Text>
                          <Text style={styles.commentTime}>{timeAgo(item.created_at)}</Text>
                        </View>
                        <Text style={styles.commentContent}>{item.content}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </ScrollView>

            <View style={styles.commentInputRow}>
              <TextInput
                style={styles.commentInput}
                placeholder={t.community.addComment}
                placeholderTextColor={colors.textMuted}
                value={newCommentContent}
                onChangeText={setNewCommentContent}
                maxLength={300}
              />
              <TouchableOpacity
                style={[styles.commentSendButton, !newCommentContent.trim() && styles.commentSendButtonDisabled]}
                onPress={handleAddComment}
                disabled={!newCommentContent.trim() || submittingComment}
              >
                {submittingComment ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Send size={16} color={colors.white} />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showPromoteModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {promoteStep === 'select' && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>{t.community.promotePost}</Text>
                  <TouchableOpacity onPress={closePromoteModal}>
                    <X size={24} color={colors.textPrimary} />
                  </TouchableOpacity>
                </View>
                <Text style={styles.promoteDescription}>
                  Boost your post to reach more users. Promoted posts appear at the top of the feed.
                </Text>
                {PROMOTE_TIERS.map((tier) => (
                  <TouchableOpacity
                    key={tier.key}
                    style={styles.promoteTierCard}
                    onPress={() => handleSelectTier(tier.key)}
                  >
                    <View style={styles.promoteTierInfo}>
                      <View style={styles.promoteTierIconWrap}>
                        <Clock size={18} color={colors.primary} />
                      </View>
                      <View>
                        <Text style={styles.promoteTierLabel}>{tier.label}</Text>
                        <Text style={styles.promoteTierSub}>{tier.hours}h visibility boost</Text>
                      </View>
                    </View>
                    <View style={styles.promoteTierPriceWrap}>
                      <Text style={styles.promoteTierPrice}>${tier.price}</Text>
                      <Text style={styles.promoteTierCurrency}>USD</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </>
            )}

            {promoteStep === 'confirm' && selectedTier && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Confirm Promotion</Text>
                  <TouchableOpacity onPress={() => setPromoteStep('select')}>
                    <X size={24} color={colors.textPrimary} />
                  </TouchableOpacity>
                </View>

                <View style={styles.confirmCard}>
                  <View style={styles.confirmRow}>
                    <Text style={styles.confirmLabel}>Duration</Text>
                    <Text style={styles.confirmValue}>{selectedTier.label}</Text>
                  </View>
                  <View style={styles.confirmDivider} />
                  <View style={styles.confirmRow}>
                    <Text style={styles.confirmLabel}>Price</Text>
                    <Text style={styles.confirmValue}>${selectedTier.price} USD</Text>
                  </View>
                  <View style={styles.confirmDivider} />
                  <View style={styles.confirmRow}>
                    <Text style={styles.confirmLabel}>Payment</Text>
                    <View style={styles.confirmPaymentBadge}>
                      <Wallet size={14} color={colors.primary} />
                      <Text style={styles.confirmPaymentText}>Wallet</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.mockNotice}>
                  <CircleAlert size={16} color={colors.warning} />
                  <Text style={styles.mockNoticeText}>
                    SIMULATED: Payment deduction is mocked. In production, this would charge your connected wallet.
                  </Text>
                </View>

                <TouchableOpacity style={styles.confirmButton} onPress={handleConfirmPromotion}>
                  <Text style={styles.confirmButtonText}>Pay ${selectedTier.price} & Promote</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.cancelLink} onPress={() => setPromoteStep('select')}>
                  <Text style={styles.cancelLinkText}>Go back</Text>
                </TouchableOpacity>
              </>
            )}

            {promoteStep === 'processing' && (
              <View style={styles.processingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.processingText}>Processing payment...</Text>
                <Text style={styles.processingSubtext}>Activating promotion</Text>
              </View>
            )}

            {promoteStep === 'done' && (
              <View style={styles.processingContainer}>
                <View style={styles.doneIcon}>
                  <Check size={32} color={colors.success} />
                </View>
                <Text style={styles.processingText}>Promotion Active</Text>
                <Text style={styles.processingSubtext}>
                  Your post will appear at the top of the feed for {selectedTier?.label}
                </Text>
                <TouchableOpacity style={styles.doneButton} onPress={closePromoteModal}>
                  <Text style={styles.doneButtonText}>Done</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 56,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.xxl,
    position: 'relative',
    overflow: 'hidden',
  },
  neonBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  purpleGlow: {
    position: 'absolute',
    top: -100,
    left: -50,
    width: 300,
    height: 300,
    backgroundColor: 'rgba(147, 51, 234, 0.15)',
    borderRadius: 150,
    transform: [{ scale: 1.5 }],
  },
  blueGlow: {
    position: 'absolute',
    top: -80,
    right: -80,
    width: 250,
    height: 250,
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    borderRadius: 125,
    transform: [{ scale: 1.3 }],
  },
  pinkGlow: {
    position: 'absolute',
    top: 20,
    left: '50%',
    width: 200,
    height: 200,
    backgroundColor: 'rgba(236, 72, 153, 0.08)',
    borderRadius: 100,
    transform: [{ translateX: -100 }],
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 1,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: colors.textPrimary,
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  createButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...elevation.lg,
  },
  content: {
    flex: 1,
    paddingTop: spacing.md,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingIndicator: {
    marginTop: 48,
  },
  feedContainer: {
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  emptyListContainer: {
    flexGrow: 1,
    paddingBottom: spacing.xxxl,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 120,
    paddingHorizontal: spacing.xxl,
    gap: spacing.lg,
  },
  emptyIconWrapper: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.primaryMuted,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontSize: fontSize.xxl,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 22,
  },
  emptyButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xxxl,
    borderRadius: borderRadius.full,
    marginTop: spacing.md,
    ...elevation.md,
  },
  emptyButtonText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.white,
  },
  bottomSpacer: {
    height: 32,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.xxl,
    maxHeight: '85%',
  },
  commentsModalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.xxl,
    maxHeight: '90%',
  },
  commentsScrollContainer: {
    flex: 1,
    marginBottom: spacing.md,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  createPostAuthor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  createPostAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  createPostAvatarImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  createPostName: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  postInput: {
    fontSize: fontSize.md,
    color: colors.textPrimary,
    minHeight: 100,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  imageUrlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  imageUrlInput: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    paddingVertical: 4,
  },
  imagePreview: {
    width: '100%',
    height: 160,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
  createPostFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  charCount: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  submitButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxl,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    minWidth: 100,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.white,
  },
  commentPostPreview: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  commentPostPreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  commentPostPreviewAuthor: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
    marginLeft: spacing.sm,
  },
  commentPostPreviewTime: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginLeft: spacing.sm,
  },
  commentPostPreviewContent: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  commentsLoading: {
    marginTop: spacing.xxl,
  },
  noComments: {
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
  },
  noCommentsText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  commentsList: {
    flex: 1,
    marginBottom: spacing.md,
  },
  commentItem: {
    flexDirection: 'row',
    marginBottom: spacing.lg,
  },
  avatarSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarSmallImage: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  commentBody: {
    flex: 1,
    marginLeft: spacing.md,
  },
  commentMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  commentAuthor: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  commentTime: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginLeft: spacing.sm,
  },
  commentContent: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
    paddingTop: spacing.md,
  },
  commentInput: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.full,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    maxHeight: 80,
  },
  commentSendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  commentSendButtonDisabled: {
    opacity: 0.5,
  },
  promoteDescription: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
    lineHeight: 22,
  },
  promoteTierCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  promoteTierInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  promoteTierIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  promoteTierLabel: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  promoteTierSub: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  promoteTierPriceWrap: {
    alignItems: 'flex-end',
  },
  promoteTierPrice: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.primary,
  },
  promoteTierCurrency: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  confirmCard: {
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  confirmRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  confirmLabel: {
    fontSize: fontSize.md,
    color: colors.textMuted,
  },
  confirmValue: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  confirmDivider: {
    height: 1,
    backgroundColor: colors.surfaceBorder,
    marginVertical: spacing.xs,
  },
  confirmPaymentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primaryMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  confirmPaymentText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.primary,
  },
  mockNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.warningMuted,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    borderRadius: borderRadius.sm,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  mockNoticeText: {
    flex: 1,
    fontSize: fontSize.xs,
    color: colors.warning,
    lineHeight: 16,
  },
  confirmButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  confirmButtonText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.white,
  },
  cancelLink: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  cancelLinkText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  processingContainer: {
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
    gap: spacing.md,
  },
  processingText: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  processingSubtext: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  doneIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.successMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  doneButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxxl,
    borderRadius: borderRadius.md,
    marginTop: spacing.lg,
  },
  doneButtonText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.white,
  },
});
