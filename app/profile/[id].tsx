import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  TextInput,
  ActivityIndicator,
  Modal,
  RefreshControl,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  MoveHorizontal as MoreHorizontal,
  Share2,
  X,
  Check,
  Copy,
  BadgeCheck,
  User,
  Camera,
  Zap,
  Clock,
  MessageCircle,
  Star,
  Wallet,
  Shield,
  Send,
  Heart,
  Twitter,
  ExternalLink,
  MessageSquare,
} from 'lucide-react-native';
import LinkText from '@/components/LinkText';
import VerificationBadge from '@/components/VerificationBadge';
import { VerificationService, PREMIUM_TIERS, PremiumTierKey } from '@/services/verificationService';
import { payToTreasury, DTEST_MINT, PayStatus } from '@/services/treasuryService';
import { SolanaPriceService } from '@/services/solana/priceService';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { useWallet } from '@/contexts/WalletContext';
import { useProfile } from '@/contexts/ProfileContext';
import { SocialService, UserProfile, Post, PostComment, PROMOTE_TIERS } from '@/services/socialService';
import { colors, spacing, borderRadius, fontSize, elevation } from '@/constants/theme';
import PostCard from '@/components/PostCard';

type ProfileTab = 'posts' | 'replies' | 'media' | 'likes';

const DEFAULT_BANNER =
  'https://images.pexels.com/photos/956999/milky-way-starry-sky-night-sky-star-956999.jpeg?auto=compress&cs=tinysrgb&w=800';


// User row for followers/following list
function UserRow({
  user,
  currentUserId,
  onPress,
}: {
  user: UserProfile;
  currentUserId?: string;
  onPress: () => void;
}) {
  const [following, setFollowing] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const isSelf = currentUserId === user.id;
  const name = user.username || `${user.wallet_address?.slice(0, 6)}...${user.wallet_address?.slice(-4)}`;

  useEffect(() => {
    if (currentUserId && !isSelf) {
      SocialService.isFollowing(currentUserId, user.id).then(setFollowing);
    }
  }, [currentUserId, user.id, isSelf]);

  const toggle = async () => {
    if (!currentUserId || isSelf) return;
    setLoading(true);
    const now = await SocialService.toggleFollow(currentUserId, user.id);
    setFollowing(now);
    setLoading(false);
  };

  return (
    <TouchableOpacity style={urStyles.row} onPress={onPress} activeOpacity={0.8}>
      <View style={urStyles.avatar}>
        {user.avatar_url ? (
          <Image source={{ uri: user.avatar_url }} style={urStyles.avatarImg} />
        ) : (
          <View style={urStyles.avatarFallback}><User size={18} color={colors.textMuted} /></View>
        )}
      </View>
      <View style={urStyles.info}>
        <View style={urStyles.nameRow}>
          <Text style={urStyles.name} numberOfLines={1}>{name}</Text>
          <VerificationBadge profile={user} size="sm" />
        </View>
        <Text style={urStyles.handle} numberOfLines={1}>
          @{user.username?.toLowerCase() || name.toLowerCase().replace(/\s/g, '')}
        </Text>
      </View>
      {!isSelf && following !== null && (
        <TouchableOpacity
          style={[urStyles.followBtn, following && urStyles.followingBtn]}
          onPress={toggle}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading
            ? <ActivityIndicator size="small" color={following ? colors.primary : colors.white} />
            : <Text style={[urStyles.followBtnText, following && urStyles.followingBtnText]}>
                {following ? 'Following' : 'Follow'}
              </Text>
          }
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

const urStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  avatar: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden' },
  avatarImg: { width: 44, height: 44, borderRadius: 22 },
  avatarFallback: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#1A1A28', justifyContent: 'center', alignItems: 'center',
  },
  info: { flex: 1, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  name: { fontSize: fontSize.md, fontWeight: '700', color: colors.textPrimary },
  handle: { fontSize: fontSize.sm, color: colors.textMuted },
  followBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    paddingVertical: 7,
    paddingHorizontal: 18,
  },
  followingBtn: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.primary },
  followBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.white },
  followingBtnText: { color: colors.primary },
});

export default function ProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { selectedAccount, activeAddress, connectedWallet } = useWallet();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [replies, setReplies] = useState<Post[]>([]);
  const [mediaPosts, setMediaPosts] = useState<Post[]>([]);
  const [likedPosts, setLikedPosts] = useState<Post[]>([]);
  const [tabLoading, setTabLoading] = useState<ProfileTab | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<ProfileTab>('posts');
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [copiedAddr, setCopiedAddr] = useState(false);

  // Followers/Following modal
  const [showFollowModal, setShowFollowModal] = useState(false);
  const [followModalMode, setFollowModalMode] = useState<'followers' | 'following'>('followers');
  const [followModalList, setFollowModalList] = useState<UserProfile[]>([]);
  const [followModalLoading, setFollowModalLoading] = useState(false);

  // Delete confirmation
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Comment modal
  const [showCommentsModal, setShowCommentsModal] = useState(false);
  const [commentsPostId, setCommentsPostId] = useState<string | null>(null);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [newCommentContent, setNewCommentContent] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [replyingToComment, setReplyingToComment] = useState<PostComment | null>(null);

  // Edit modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editUsername, setEditUsername] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editAvatarUrl, setEditAvatarUrl] = useState('');
  const [editBannerUrl, setEditBannerUrl] = useState('');
  const [editTwitterUrl, setEditTwitterUrl] = useState('');
  const [editTelegramUrl, setEditTelegramUrl] = useState('');
  const [editDiscordUrl, setEditDiscordUrl] = useState('');
  const [saving, setSaving] = useState(false);

  // Promote modal
  const [showPromoteModal, setShowPromoteModal] = useState(false);
  const [promotePostId, setPromotePostId] = useState<string | null>(null);
  const [promoteStep, setPromoteStep] = useState<'select' | 'confirm' | 'processing' | 'done'>('select');
  const [selectedTierKey, setSelectedTierKey] = useState<string | null>(null);
  const [promotingPost, setPromotingPost] = useState(false);

  // Premium certification modal
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [premiumDone, setPremiumDone] = useState(false);
  const [premiumPayStatus, setPremiumPayStatus] = useState<PayStatus>('idle');
  const [premiumTxSig, setPremiumTxSig] = useState<string | null>(null);
  const [solUsdPrice, setSolUsdPrice] = useState(0);
  const [premiumPayWith, setPremiumPayWith] = useState<'SOL' | 'DTEST'>('SOL');

  // Basic verification modal
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [verifyStatus, setVerifyStatus] = useState<{
    followsDecent: boolean; followsBadge: boolean; repliedToPost: boolean;
    alreadyVerified: boolean; decentId: string | null; badgeId: string | null; pinnedPostId: string | null;
  } | null>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyChecking, setVerifyChecking] = useState(false);

  const { updateProfile: updateGlobalProfile, uploadAvatar: uploadGlobalAvatar, refreshProfile } = useProfile();
  const walletAddr = selectedAccount?.address || activeAddress || '';
  const isOwnProfile = currentUserProfile?.id === id;

  useEffect(() => {
    const svc = new SolanaPriceService();
    svc.getSOLPrice().then(p => { if (p > 0) setSolUsdPrice(p); }).catch(() => {});
  }, []);

  const loadProfile = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [profileData, postsData, followers, following] = await Promise.all([
      SocialService.getProfile(id),
      SocialService.getUserPosts(id),
      SocialService.getFollowerCount(id),
      SocialService.getFollowingCount(id),
    ]);
    setProfile(profileData);
    setPosts(postsData);
    setFollowerCount(followers);
    setFollowingCount(following);

    if (walletAddr) {
      const me = await SocialService.getOrCreateProfile(walletAddr);
      setCurrentUserProfile(me);
      if (me && me.id !== id) {
        setIsFollowing(await SocialService.isFollowing(me.id, id));
      }
    }
    setLoading(false);
  }, [id, walletAddr]);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadProfile();
    setRefreshing(false);
  };

  const openFollowModal = async (mode: 'followers' | 'following') => {
    if (!id) return;
    setFollowModalMode(mode);
    setShowFollowModal(true);
    setFollowModalLoading(true);
    try {
      const list = mode === 'followers'
        ? await SocialService.getFollowers(id)
        : await SocialService.getFollowing(id);
      setFollowModalList(list);
    } finally {
      setFollowModalLoading(false);
    }
  };

  const handleFollow = async () => {
    if (!currentUserProfile || !id || isOwnProfile) return;
    setFollowLoading(true);
    const nowFollowing = await SocialService.toggleFollow(currentUserProfile.id, id);
    setIsFollowing(nowFollowing);
    setFollowerCount(prev => nowFollowing ? prev + 1 : Math.max(0, prev - 1));
    setFollowLoading(false);
  };

  const handleMessage = () => {
    if (!profile?.id) return;
    router.push(`/chat/${profile.id}` as any);
  };

  const openEditModal = () => {
    if (!profile) return;
    setEditUsername(profile.username || '');
    setEditBio(profile.bio || '');
    setEditAvatarUrl(profile.avatar_url || '');
    setEditBannerUrl((profile as any).banner_url || '');
    setEditTwitterUrl(profile.twitter_url || '');
    setEditTelegramUrl(profile.telegram_url || '');
    setEditDiscordUrl(profile.discord_url || '');
    setShowEditModal(true);
  };

  const handlePickBanner = async () => {
    if (!isOwnProfile || !profile) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [3, 1],
      quality: 0.8,
      base64: false,
    });
    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri;
      setEditBannerUrl(uri);
      // Save immediately
      try {
        const uploaded = await SocialService.uploadAvatar(profile.wallet_address, uri, profile.id + '_banner');
        const bannerUrl = uploaded || uri;
        if (bannerUrl.startsWith('http')) {
          await SocialService.updateProfile(profile.id, { banner_url: bannerUrl } as any);
          await loadProfile();
        }
      } catch (e) {
        console.warn('[Profile] banner upload error:', e);
      }
    }
  };

  const handlePickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      base64: false,
    });
    if (!result.canceled && result.assets[0]) {
      setEditAvatarUrl(result.assets[0].uri);
    }
  };

  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSaveProfile = async () => {
    if (!profile) return;
    setSaving(true);
    setSaveError(null);
    try {
      let avatarUrl: string | undefined = editAvatarUrl.trim() || undefined;
      if (avatarUrl && !avatarUrl.startsWith('http')) {
        try {
          const uploaded = await uploadGlobalAvatar(avatarUrl);
          if (!uploaded) {
            setSaveError('Avatar upload failed. Please try again.');
            setSaving(false);
            return;
          }
          avatarUrl = uploaded;
        } catch (uploadErr: any) {
          setSaveError(uploadErr?.message || 'Avatar upload failed. Please try again.');
          setSaving(false);
          return;
        }
      }
      let bannerUrl: string | undefined = editBannerUrl.trim() || undefined;
      if (bannerUrl && !bannerUrl.startsWith('http')) {
        try {
          const uploaded = await SocialService.uploadAvatar(profile.wallet_address, bannerUrl, profile.id + '_banner');
          if (uploaded) bannerUrl = uploaded;
          else bannerUrl = (profile as any).banner_url ?? undefined;
        } catch {
          bannerUrl = (profile as any).banner_url ?? undefined;
        }
      }
      await updateGlobalProfile({
        username: editUsername.trim() || undefined,
        bio: editBio.trim(),
        avatar_url: avatarUrl && avatarUrl.startsWith('http') ? avatarUrl : profile.avatar_url ?? undefined,
        banner_url: bannerUrl && bannerUrl.startsWith('http') ? bannerUrl : (profile as any).banner_url ?? undefined,
        twitter_url: editTwitterUrl.trim() || null,
        telegram_url: editTelegramUrl.trim() || null,
        discord_url: editDiscordUrl.trim() || null,
      });
      await loadProfile();
      setShowEditModal(false);
    } catch (err: any) {
      setSaveError(err?.message || 'Save failed. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const openPromoteModal = (postId: string) => {
    setPromotePostId(postId);
    setPromoteStep('select');
    setSelectedTierKey(null);
    setShowPromoteModal(true);
  };

  const handleConfirmPromotion = async () => {
    if (!promotePostId || !selectedTierKey) return;
    setPromoteStep('processing');
    setPromotingPost(true);
    await new Promise(r => setTimeout(r, 1200));
    await SocialService.promotePost(promotePostId, selectedTierKey);
    setPromoteStep('done');
    setPromotingPost(false);
    await loadProfile();
  };

  const copyAddress = async () => {
    const addr = profile?.wallet_address || walletAddr;
    if (addr) {
      await Clipboard.setStringAsync(addr);
      setCopiedAddr(true);
      setTimeout(() => setCopiedAddr(false), 2000);
    }
  };

  const loadTab = useCallback(async (tab: ProfileTab) => {
    if (!id) return;
    if (tab === 'posts') return;
    setTabLoading(tab);
    const viewerId = currentUserProfile?.id;
    try {
      if (tab === 'replies') {
        setReplies(await SocialService.getUserReplies(id, viewerId));
      } else if (tab === 'media') {
        setMediaPosts(await SocialService.getUserMediaPosts(id, viewerId));
      } else if (tab === 'likes') {
        setLikedPosts(await SocialService.getUserLikedPosts(id, viewerId));
      }
    } finally {
      setTabLoading(null);
    }
  }, [id, currentUserProfile?.id]);

  const handleTabChange = (tab: ProfileTab) => {
    setActiveTab(tab);
    loadTab(tab);
  };

  const openCommentsModal = async (postId: string) => {
    setCommentsPostId(postId);
    setShowCommentsModal(true);
    setCommentsLoading(true);
    setComments([]);
    setNewCommentContent('');
    setReplyingToComment(null);
    try {
      setComments(await SocialService.getComments(postId, currentUserProfile?.id));
    } catch (e) {
      console.warn('[Profile] getComments error:', e);
    } finally {
      setCommentsLoading(false);
    }
  };

  const closeCommentsModal = () => {
    setShowCommentsModal(false);
    setCommentsPostId(null);
    setComments([]);
    setNewCommentContent('');
    setReplyingToComment(null);
  };

  const handleAddComment = async () => {
    if (!newCommentContent.trim() || !currentUserProfile || !commentsPostId || submittingComment) return;
    const parentId = replyingToComment?.id;
    setSubmittingComment(true);
    const text = newCommentContent.trim();
    setNewCommentContent('');
    setReplyingToComment(null);
    try {
      await SocialService.addComment(commentsPostId, currentUserProfile.id, text, parentId);
      const updated = await SocialService.getComments(commentsPostId, currentUserProfile.id);
      setComments(updated);
      const inc = (list: Post[]) => list.map(p =>
        p.id === commentsPostId ? { ...p, comments_count: (p.comments_count || 0) + 1 } : p
      );
      setPosts(inc);
      setReplies(inc);
      setMediaPosts(inc);
      setLikedPosts(inc);
    } catch (e) {
      console.warn('[Profile] addComment error:', e);
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleCommentLike = async (commentId: string) => {
    if (!currentUserProfile) return;
    setComments(prev => prev.map(c =>
      c.id === commentId
        ? { ...c, liked_by_user: !c.liked_by_user, likes_count: c.liked_by_user ? Math.max(0, (c.likes_count || 0) - 1) : (c.likes_count || 0) + 1 }
        : { ...c, replies: (c.replies || []).map(r => r.id === commentId ? { ...r, liked_by_user: !r.liked_by_user, likes_count: r.liked_by_user ? Math.max(0, (r.likes_count || 0) - 1) : (r.likes_count || 0) + 1 } : r) }
    ));
    await SocialService.toggleCommentLike(commentId, currentUserProfile.id);
  };

  const [likingIds, setLikingIds] = useState<Set<string>>(new Set());
  const [repostingIds, setRepostingIds] = useState<Set<string>>(new Set());

  const handleLike = async (postId: string) => {
    if (!currentUserProfile || likingIds.has(postId)) return;
    setLikingIds(prev => new Set(prev).add(postId));
    const optimistic = (list: Post[]) => list.map(p =>
      p.id === postId ? {
        ...p,
        liked_by_user: !p.liked_by_user,
        likes_count: p.liked_by_user ? Math.max(0, (p.likes_count || 0) - 1) : (p.likes_count || 0) + 1,
      } : p
    );
    setPosts(optimistic);
    setReplies(optimistic);
    setLikedPosts(optimistic);
    setMediaPosts(optimistic);
    try {
      await SocialService.toggleLike(postId, currentUserProfile.id);
    } catch {
      // revert on failure
      const revert = (list: Post[]) => list.map(p =>
        p.id === postId ? {
          ...p,
          liked_by_user: !p.liked_by_user,
          likes_count: p.liked_by_user ? Math.max(0, (p.likes_count || 0) - 1) : (p.likes_count || 0) + 1,
        } : p
      );
      setPosts(revert);
      setReplies(revert);
      setLikedPosts(revert);
      setMediaPosts(revert);
    } finally {
      setLikingIds(prev => { const s = new Set(prev); s.delete(postId); return s; });
    }
  };

  const handleRepost = async (postId: string) => {
    if (!currentUserProfile || repostingIds.has(postId)) return;
    setRepostingIds(prev => new Set(prev).add(postId));
    const optimistic = (list: Post[]) => list.map(p =>
      p.id === postId ? {
        ...p,
        reposted_by_user: !p.reposted_by_user,
        reposts_count: p.reposted_by_user ? Math.max(0, (p.reposts_count || 0) - 1) : (p.reposts_count || 0) + 1,
      } : p
    );
    setPosts(optimistic);
    setReplies(optimistic);
    setLikedPosts(optimistic);
    setMediaPosts(optimistic);
    try {
      await SocialService.toggleRepost(postId, currentUserProfile.id);
    } catch {
      const revert = (list: Post[]) => list.map(p =>
        p.id === postId ? {
          ...p,
          reposted_by_user: !p.reposted_by_user,
          reposts_count: p.reposted_by_user ? Math.max(0, (p.reposts_count || 0) - 1) : (p.reposts_count || 0) + 1,
        } : p
      );
      setPosts(revert);
      setReplies(revert);
      setLikedPosts(revert);
      setMediaPosts(revert);
    } finally {
      setRepostingIds(prev => { const s = new Set(prev); s.delete(postId); return s; });
    }
  };

  const requestDeletePost = (postId: string) => {
    setDeleteConfirmId(postId);
  };

  const confirmDeletePost = async () => {
    if (!deleteConfirmId || !profile) return;
    setDeleting(true);
    await SocialService.deletePostFull(deleteConfirmId, profile.id);
    setPosts(prev => prev.filter(p => p.id !== deleteConfirmId));
    setMediaPosts(prev => prev.filter(p => p.id !== deleteConfirmId));
    setDeleting(false);
    setDeleteConfirmId(null);
  };

  const [selectedPremiumTier, setSelectedPremiumTier] = useState<PremiumTierKey>('1m');

  const openVerifyModal = async () => {
    if (!currentUserProfile) return;
    setShowVerifyModal(true);
    setVerifyLoading(true);
    const status = await VerificationService.getVerificationStatus(currentUserProfile.id);
    setVerifyStatus(status);
    setVerifyLoading(false);
  };

  const handleCheckVerification = async () => {
    if (!currentUserProfile) return;
    setVerifyChecking(true);
    const granted = await VerificationService.checkAndGrantBasicVerification(currentUserProfile.id);
    if (granted) {
      const status = await VerificationService.getVerificationStatus(currentUserProfile.id);
      setVerifyStatus(status);
      await loadProfile();
    } else {
      const status = await VerificationService.getVerificationStatus(currentUserProfile.id);
      setVerifyStatus(status);
    }
    setVerifyChecking(false);
  };

  const usdToSol = (usd: number) => solUsdPrice > 0 ? usd / solUsdPrice : 0;

  const handlePurchasePremium = async () => {
    if (!currentUserProfile || !isOwnProfile) return;
    const tier = PREMIUM_TIERS.find(t => t.key === selectedPremiumTier)!;
    const solAmt = usdToSol(tier.usd);
    const fromAddr = activeAddress || selectedAccount?.address || '';
    if (!fromAddr) return;
    setPremiumPayStatus('preparing');

    const result = await payToTreasury({
      fromAddress: fromAddr,
      amountSol: premiumPayWith === 'SOL' ? (solAmt > 0 ? solAmt : 0.001) : undefined,
      amountToken: premiumPayWith === 'DTEST' ? tier.usd : undefined,
      tokenMint: premiumPayWith === 'DTEST' ? DTEST_MINT : undefined,
      connectedWalletId: connectedWallet?.id ?? null,
      internalAccountIndex: selectedAccount?.accountIndex ?? 0,
      onStatus: setPremiumPayStatus,
    });

    if (!result.success) {
      setPremiumPayStatus('idle');
      return;
    }

    setPremiumTxSig(result.signature ?? null);
    await VerificationService.activatePremium(currentUserProfile.id, selectedPremiumTier, result.signature ?? undefined);
    setPremiumDone(true);
    await loadProfile();
  };

  const displayName = profile?.username
    || (profile?.wallet_address ? `${profile.wallet_address.slice(0, 6)}...${profile.wallet_address.slice(-4)}` : 'Unknown');

  const shortAddr = profile?.wallet_address
    ? `${profile.wallet_address.slice(0, 4)}...${profile.wallet_address.slice(-4)}`
    : '';

  const bannerUrl = profile?.banner_url || DEFAULT_BANNER;
  const isPremiumActive = profile ? VerificationService.isPremiumActive(profile) : false;

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  const PROFILE_TABS: { key: ProfileTab; label: string }[] = [
    { key: 'posts', label: 'Posts' },
    { key: 'replies', label: 'Replies' },
    { key: 'media', label: 'Media' },
    { key: 'likes', label: 'Likes' },
  ];

  const formatCount = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);

  const renderPostList = (list: Post[], empty: string, canDelete = false) => (
    list.length === 0 ? (
      <View style={styles.emptyPosts}><Text style={styles.emptyPostsText}>{empty}</Text></View>
    ) : (
      <View style={{ paddingTop: spacing.sm }}>
        {list.map(post => (
          <PostCard
            key={post.id}
            post={post}
            currentProfile={currentUserProfile}
            onLike={handleLike}
            onComment={openCommentsModal}
            onRepost={handleRepost}
            onPromote={canDelete && isOwnProfile ? openPromoteModal : () => {}}
            onDelete={canDelete && isOwnProfile ? requestDeletePost : undefined}
          />
        ))}
      </View>
    )
  );

  return (
    <View style={styles.container}>
      {/* Fixed top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.topBarBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <ArrowLeft size={20} color={colors.textPrimary} strokeWidth={2} />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Profile</Text>
        <TouchableOpacity style={styles.topBarBtn} activeOpacity={0.8}>
          <MoreHorizontal size={20} color={colors.textPrimary} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* Banner — tap to change cover if own profile */}
        {isOwnProfile ? (
          <TouchableOpacity activeOpacity={0.85} onPress={handlePickBanner} style={styles.bannerWrap}>
            <Image source={{ uri: bannerUrl }} style={styles.banner} resizeMode="cover" />
            <LinearGradient colors={['transparent', 'rgba(10,10,15,0.4)']} style={StyleSheet.absoluteFill} />
            <View style={styles.bannerEditOverlay}>
              <Camera size={18} color={colors.white} strokeWidth={2} />
              <Text style={styles.bannerEditText}>Change Cover</Text>
            </View>
          </TouchableOpacity>
        ) : (
          <View style={styles.bannerWrap}>
            <Image source={{ uri: bannerUrl }} style={styles.banner} resizeMode="cover" />
            <LinearGradient colors={['transparent', 'rgba(10,10,15,0.4)']} style={StyleSheet.absoluteFill} />
          </View>
        )}

        {/* Avatar + name row */}
        <View style={styles.profileTopRow}>
          <View style={styles.avatarWrap}>
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}><User size={36} color={colors.textMuted} /></View>
            )}
            {(isPremiumActive) && (
              <View style={styles.premiumBadgeOnAvatar}>
                <Star size={10} color="#FBBF24" fill="#FBBF24" strokeWidth={0} />
              </View>
            )}
          </View>

          <View style={styles.profileTitleBlock}>
            <View style={styles.nameVerifiedRow}>
              <Text style={styles.displayName}>{displayName}</Text>
              {profile && <VerificationBadge profile={profile} size="md" />}
            </View>
            <Text style={styles.handle}>
              @{profile?.username?.toLowerCase() || displayName.toLowerCase().replace(/\s/g, '')}
            </Text>
          </View>

          <TouchableOpacity style={styles.shareBtn} activeOpacity={0.8}>
            <Share2 size={18} color={colors.textPrimary} strokeWidth={2} />
          </TouchableOpacity>
        </View>

        {/* Wallet address */}
        {shortAddr ? (
          <TouchableOpacity style={styles.addrChip} onPress={copyAddress} activeOpacity={0.8}>
            <Text style={styles.addrChipText}>{shortAddr}</Text>
            {copiedAddr
              ? <Check size={14} color={colors.success} strokeWidth={2.5} />
              : <Copy size={14} color={colors.textMuted} strokeWidth={2} />
            }
          </TouchableOpacity>
        ) : null}

        {/* Bio */}
        {profile?.bio ? (
          <LinkText text={profile.bio} style={styles.bio} />
        ) : (
          isOwnProfile && <Text style={styles.bioPlaceholder}>Building the future of trading.</Text>
        )}

        {/* Social links */}
        {(profile?.twitter_url || profile?.telegram_url || profile?.discord_url) && (
          <View style={styles.socialLinksRow}>
            {profile.twitter_url ? (
              <TouchableOpacity
                style={styles.socialLinkBtn}
                onPress={() => Linking.openURL(profile.twitter_url!.startsWith('http') ? profile.twitter_url! : 'https://' + profile.twitter_url!).catch(() => {})}
                activeOpacity={0.75}
              >
                <Twitter size={15} color="#1DA1F2" strokeWidth={2} />
                <Text style={[styles.socialLinkText, { color: '#1DA1F2' }]}>X</Text>
              </TouchableOpacity>
            ) : null}
            {profile.telegram_url ? (
              <TouchableOpacity
                style={styles.socialLinkBtn}
                onPress={() => Linking.openURL(profile.telegram_url!.startsWith('http') ? profile.telegram_url! : 'https://' + profile.telegram_url!).catch(() => {})}
                activeOpacity={0.75}
              >
                <ExternalLink size={15} color="#26A5E4" strokeWidth={2} />
                <Text style={[styles.socialLinkText, { color: '#26A5E4' }]}>Telegram</Text>
              </TouchableOpacity>
            ) : null}
            {profile.discord_url ? (
              <TouchableOpacity
                style={styles.socialLinkBtn}
                onPress={() => Linking.openURL(profile.discord_url!.startsWith('http') ? profile.discord_url! : 'https://' + profile.discord_url!).catch(() => {})}
                activeOpacity={0.75}
              >
                <MessageSquare size={15} color="#5865F2" strokeWidth={2} />
                <Text style={[styles.socialLinkText, { color: '#5865F2' }]}>Discord</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}

        {/* Stats — followers/following are clickable */}
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{formatCount(posts.length)}</Text>
            <Text style={styles.statLabel}>Posts</Text>
          </View>
          <View style={styles.statDivider} />
          <TouchableOpacity style={styles.stat} onPress={() => openFollowModal('followers')} activeOpacity={0.75}>
            <Text style={[styles.statValue, styles.statClickable]}>{formatCount(followerCount)}</Text>
            <Text style={styles.statLabel}>Followers</Text>
          </TouchableOpacity>
          <View style={styles.statDivider} />
          <TouchableOpacity style={styles.stat} onPress={() => openFollowModal('following')} activeOpacity={0.75}>
            <Text style={[styles.statValue, styles.statClickable]}>{formatCount(followingCount)}</Text>
            <Text style={styles.statLabel}>Following</Text>
          </TouchableOpacity>
        </View>

        {/* Action buttons */}
        {isOwnProfile ? (
          <View style={styles.actionRow}>
            <TouchableOpacity style={[styles.actionBtn, { flex: 2 }]} onPress={openEditModal} activeOpacity={0.85}>
              <Text style={styles.actionBtnText}>Edit Profile</Text>
            </TouchableOpacity>
            {!profile?.verified_basic && (
              <TouchableOpacity
                style={[styles.actionBtn, styles.verifyBtn]}
                onPress={openVerifyModal}
                activeOpacity={0.85}
              >
                <Shield size={14} color="#6366F1" strokeWidth={2} />
                <Text style={styles.verifyBtnText}>Verify</Text>
              </TouchableOpacity>
            )}
            {!isPremiumActive && (
              <TouchableOpacity
                style={[styles.actionBtn, styles.premiumBtn]}
                onPress={() => { setPremiumDone(false); setShowPremiumModal(true); }}
                activeOpacity={0.85}
              >
                <Star size={14} color="#FBBF24" fill="#FBBF24" strokeWidth={0} />
                <Text style={styles.premiumBtnText}>Premium</Text>
              </TouchableOpacity>
            )}
            {isPremiumActive && (
              <View style={[styles.actionBtn, styles.premiumActiveBtn]}>
                <Star size={14} color="#FBBF24" fill="#FBBF24" strokeWidth={0} />
                <Text style={styles.premiumActiveBtnText}>Premium</Text>
              </View>
            )}
          </View>
        ) : currentUserProfile ? (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.actionBtn, { flex: 2 }, isFollowing && styles.followingBtn]}
              onPress={handleFollow}
              disabled={followLoading}
              activeOpacity={0.85}
            >
              {followLoading
                ? <ActivityIndicator size="small" color={isFollowing ? colors.primary : colors.white} />
                : <Text style={[styles.actionBtnText, isFollowing && styles.followingBtnText]}>
                    {isFollowing ? 'Following' : 'Follow'}
                  </Text>
              }
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.messageBtn]}
              onPress={handleMessage}
              activeOpacity={0.85}
            >
              <MessageCircle size={16} color={colors.textPrimary} strokeWidth={2} />
              <Text style={styles.messageBtnText}>Message</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Profile tabs */}
        <View style={styles.tabBar}>
          {PROFILE_TABS.map(tab => (
            <TouchableOpacity
              key={tab.key}
              style={styles.tab}
              onPress={() => handleTabChange(tab.key)}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>{tab.label}</Text>
              {activeTab === tab.key && <View style={styles.tabUnderline} />}
            </TouchableOpacity>
          ))}
        </View>

        {tabLoading === activeTab && (
          <View style={styles.emptyPosts}><ActivityIndicator size="small" color={colors.primary} /></View>
        )}

        {activeTab === 'posts' && tabLoading !== 'posts' && renderPostList(posts, 'No posts yet', true)}
        {activeTab === 'replies' && tabLoading !== 'replies' && renderPostList(replies, 'No replies yet', false)}
        {activeTab === 'media' && tabLoading !== 'media' && renderPostList(mediaPosts, 'No media posts yet', true)}
        {activeTab === 'likes' && tabLoading !== 'likes' && renderPostList(likedPosts, 'No liked posts yet', false)}

        <View style={{ height: 80 }} />
      </ScrollView>

      {/* ── Followers / Following Modal ─────────────────────────────────── */}
      <Modal visible={showFollowModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { maxHeight: '80%' }]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {followModalMode === 'followers' ? 'Followers' : 'Following'}
              </Text>
              <TouchableOpacity onPress={() => setShowFollowModal(false)}>
                <X size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            {followModalLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: 40 }} />
            ) : followModalList.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <Text style={{ color: colors.textMuted, fontSize: fontSize.md }}>No users yet</Text>
              </View>
            ) : (
              <FlatList
                data={followModalList}
                keyExtractor={item => item.id}
                renderItem={({ item }) => (
                  <UserRow
                    user={item}
                    currentUserId={currentUserProfile?.id}
                    onPress={() => {
                      setShowFollowModal(false);
                      router.push(`/profile/${item.id}` as any);
                    }}
                  />
                )}
                showsVerticalScrollIndicator={false}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* ── Delete Confirmation Modal ────────────────────────────────────── */}
      <Modal visible={!!deleteConfirmId} animationType="fade" transparent>
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmBox}>
            <Text style={styles.confirmTitle}>Delete Post?</Text>
            <Text style={styles.confirmBody}>
              This will permanently delete the post and all related likes, comments, and reposts. This action cannot be undone.
            </Text>
            <View style={styles.confirmBtns}>
              <TouchableOpacity
                style={styles.confirmCancelBtn}
                onPress={() => setDeleteConfirmId(null)}
                activeOpacity={0.8}
              >
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmDeleteBtn}
                onPress={confirmDeletePost}
                disabled={deleting}
                activeOpacity={0.8}
              >
                {deleting
                  ? <ActivityIndicator size="small" color={colors.white} />
                  : <Text style={styles.confirmDeleteText}>Delete</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Premium Certification Modal ──────────────────────────────────── */}
      <Modal visible={showPremiumModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.modalScroll} bounces={false}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHandle} />
              {!premiumDone ? (
                <>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Premium Badge</Text>
                    <TouchableOpacity onPress={() => setShowPremiumModal(false)}>
                      <X size={22} color={colors.textPrimary} />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.premiumHeader}>
                    <View style={styles.premiumBadgePreview}>
                      <View style={styles.premiumBadgeGlow} />
                      <View style={styles.premiumBadgeCircle}>
                        <Check size={18} color="#fff" strokeWidth={3} />
                      </View>
                      <View style={styles.premiumStarWrap}>
                        <Star size={12} color="#FBBF24" fill="#FBBF24" strokeWidth={0} />
                      </View>
                    </View>
                    <Text style={styles.premiumTitle}>Dawen Premium</Text>
                    <Text style={styles.premiumDesc}>
                      Gold badge with star next to your name, everywhere on the platform. Subscription renews at the same price.
                    </Text>
                  </View>

                  <Text style={styles.editLabel}>Select duration</Text>
                  {PREMIUM_TIERS.map(tier => {
                    const isSelected = selectedPremiumTier === tier.key;
                    return (
                      <TouchableOpacity
                        key={tier.key}
                        style={[styles.premiumTierRow, isSelected && styles.premiumTierRowSelected]}
                        onPress={() => setSelectedPremiumTier(tier.key)}
                        activeOpacity={0.8}
                      >
                        <View style={styles.premiumTierLeft}>
                          <Text style={[styles.premiumTierLabel, isSelected && styles.premiumTierLabelActive]}>
                            {tier.label}
                          </Text>
                          <Text style={styles.premiumTierSub}>${(tier.usd / tier.months).toFixed(0)}/mo</Text>
                        </View>
                        <View style={styles.premiumTierRight}>
                          <Text style={[styles.premiumTierPrice, isSelected && styles.premiumTierPriceActive]}>
                            ${tier.usd}
                          </Text>
                          {isSelected && <Check size={16} color="#FBBF24" strokeWidth={3} />}
                        </View>
                      </TouchableOpacity>
                    );
                  })}

                  {/* Pay with */}
                  <Text style={styles.editLabel}>Pay with</Text>
                  <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
                    {(['SOL', 'DTEST'] as const).map(method => (
                      <TouchableOpacity
                        key={method}
                        style={{ flex: 1, backgroundColor: premiumPayWith === method ? 'rgba(59,130,246,0.12)' : colors.surface, borderRadius: 12, padding: 12, borderWidth: 1.5, borderColor: premiumPayWith === method ? colors.primary : colors.surfaceBorder, alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'center' }}
                        onPress={() => setPremiumPayWith(method)}
                        activeOpacity={0.8}
                      >
                        <Text style={{ fontSize: 16 }}>{method === 'SOL' ? '◎' : 'D'}</Text>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: premiumPayWith === method ? colors.primary : colors.textPrimary }}>{method}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {premiumPayStatus === 'preparing' || premiumPayStatus === 'signing' || premiumPayStatus === 'sending' ? (
                    <View style={{ alignItems: 'center', paddingVertical: 16, gap: 12 }}>
                      <ActivityIndicator size="small" color={colors.primary} />
                      <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm }}>
                        {premiumPayStatus === 'signing' ? 'Confirm in wallet...' :
                         premiumPayStatus === 'sending' ? 'Transaction pending...' :
                         'Preparing transaction...'}
                      </Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.premiumPayBtn}
                      onPress={handlePurchasePremium}
                      activeOpacity={0.85}
                    >
                      <Wallet size={15} color={colors.white} strokeWidth={2} />
                      <Text style={styles.premiumPayBtnText}>
                        Pay ${PREMIUM_TIERS.find(t => t.key === selectedPremiumTier)?.usd}
                      </Text>
                    </TouchableOpacity>
                  )}

                  <Text style={styles.premiumNote}>
                    Payment is processed via your Solana wallet. The transaction is verified on-chain before the badge is activated.
                  </Text>
                </>
              ) : (
                <View style={{ alignItems: 'center', paddingVertical: 48 }}>
                  <View style={styles.premiumDoneIcon}>
                    <View style={styles.premiumBadgeGlow} />
                    <View style={[styles.premiumBadgeCircle, { width: 56, height: 56, borderRadius: 28 }]}>
                      <Check size={28} color="#fff" strokeWidth={3} />
                    </View>
                    <View style={[styles.premiumStarWrap, { bottom: 2, right: 2 }]}>
                      <Star size={18} color="#FBBF24" fill="#FBBF24" strokeWidth={0} />
                    </View>
                  </View>
                  <Text style={[styles.modalTitle, { marginTop: spacing.lg }]}>Premium Active!</Text>
                  <Text style={{ color: colors.textMuted, fontSize: fontSize.md, marginTop: 8, textAlign: 'center' }}>
                    Your gold badge is now visible everywhere on the platform.
                  </Text>
                  <TouchableOpacity
                    style={[styles.saveBtn, { marginTop: spacing.xl }]}
                    onPress={() => setShowPremiumModal(false)}
                  >
                    <Text style={styles.saveBtnText}>Done</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ── Basic Verification Modal ─────────────────────────────────────── */}
      <Modal visible={showVerifyModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Get Verified</Text>
              <TouchableOpacity onPress={() => setShowVerifyModal(false)}>
                <X size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            {verifyLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: 40 }} />
            ) : verifyStatus?.alreadyVerified ? (
              <View style={{ alignItems: 'center', paddingVertical: 32, gap: spacing.md }}>
                <VerificationBadge profile={{ is_verified: true, verified_basic: true } as any} size="lg" />
                <Text style={[styles.modalTitle, { marginTop: spacing.md }]}>You are verified!</Text>
                <Text style={{ color: colors.textMuted, textAlign: 'center', fontSize: fontSize.md, lineHeight: 22 }}>
                  Your blue verification badge is active and visible across the platform.
                </Text>
                <TouchableOpacity style={styles.saveBtn} onPress={() => setShowVerifyModal(false)}>
                  <Text style={styles.saveBtnText}>Done</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {/* Badge preview */}
                <View style={styles.verifyBadgePreview}>
                  <View style={styles.verifyBadgeGlow} />
                  <View style={styles.verifyBadgeCircle}>
                    <Check size={20} color="#fff" strokeWidth={3} />
                  </View>
                </View>
                <Text style={styles.verifyTitle}>Free Verification Badge</Text>
                <Text style={styles.verifyDesc}>
                  Complete all 3 steps below to automatically receive your blue verification badge.
                </Text>

                <View style={styles.verifySteps}>
                  {/* Step 1 */}
                  <View style={styles.verifyStep}>
                    <View style={[styles.verifyStepIcon, verifyStatus?.followsDecent && styles.verifyStepDone]}>
                      {verifyStatus?.followsDecent
                        ? <Check size={14} color="#fff" strokeWidth={3} />
                        : <Text style={styles.verifyStepNum}>1</Text>
                      }
                    </View>
                    <View style={styles.verifyStepInfo}>
                      <Text style={styles.verifyStepTitle}>Follow @Decent</Text>
                      <Text style={styles.verifyStepSub}>Follow the official Decent account</Text>
                    </View>
                    {verifyStatus?.decentId && (
                      <TouchableOpacity
                        style={styles.verifyActionBtn}
                        onPress={() => {
                          setShowVerifyModal(false);
                          router.push(`/profile/${verifyStatus.decentId}` as any);
                        }}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.verifyActionBtnText}>
                          {verifyStatus?.followsDecent ? 'Done' : 'Follow'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Step 2 */}
                  <View style={styles.verifyStep}>
                    <View style={[styles.verifyStepIcon, verifyStatus?.followsBadge && styles.verifyStepDone]}>
                      {verifyStatus?.followsBadge
                        ? <Check size={14} color="#fff" strokeWidth={3} />
                        : <Text style={styles.verifyStepNum}>2</Text>
                      }
                    </View>
                    <View style={styles.verifyStepInfo}>
                      <Text style={styles.verifyStepTitle}>Follow @VerificationBadge</Text>
                      <Text style={styles.verifyStepSub}>Follow the verification account</Text>
                    </View>
                    {verifyStatus?.badgeId && (
                      <TouchableOpacity
                        style={styles.verifyActionBtn}
                        onPress={() => {
                          setShowVerifyModal(false);
                          router.push(`/profile/${verifyStatus.badgeId}` as any);
                        }}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.verifyActionBtnText}>
                          {verifyStatus?.followsBadge ? 'Done' : 'Follow'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Step 3 */}
                  <View style={styles.verifyStep}>
                    <View style={[styles.verifyStepIcon, verifyStatus?.repliedToPost && styles.verifyStepDone]}>
                      {verifyStatus?.repliedToPost
                        ? <Check size={14} color="#fff" strokeWidth={3} />
                        : <Text style={styles.verifyStepNum}>3</Text>
                      }
                    </View>
                    <View style={styles.verifyStepInfo}>
                      <Text style={styles.verifyStepTitle}>Reply to the pinned post</Text>
                      <Text style={styles.verifyStepSub}>Reply with exactly: "Get Verified ✔️"</Text>
                    </View>
                    {verifyStatus?.badgeId && (
                      <TouchableOpacity
                        style={styles.verifyActionBtn}
                        onPress={() => {
                          setShowVerifyModal(false);
                          router.push(`/profile/${verifyStatus!.badgeId}` as any);
                        }}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.verifyActionBtnText}>
                          {verifyStatus?.repliedToPost ? 'Done' : 'Go'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                <TouchableOpacity
                  style={[
                    styles.saveBtn,
                    verifyChecking && { opacity: 0.6 },
                    !(verifyStatus?.followsDecent && verifyStatus?.followsBadge && verifyStatus?.repliedToPost) && styles.saveBtnDisabled,
                  ]}
                  onPress={handleCheckVerification}
                  disabled={verifyChecking}
                  activeOpacity={0.85}
                >
                  {verifyChecking
                    ? <ActivityIndicator size="small" color={colors.white} />
                    : <><Shield size={16} color={colors.white} strokeWidth={2} /><Text style={styles.saveBtnText}>Check & Verify Me</Text></>
                  }
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Edit Profile Modal ───────────────────────────────────────────── */}
      <Modal visible={showEditModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.modalScroll} bounces={false}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHandle} />
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Edit Profile</Text>
                <TouchableOpacity onPress={() => setShowEditModal(false)}>
                  <X size={22} color={colors.textPrimary} />
                </TouchableOpacity>
              </View>

              <Text style={styles.editLabel}>Profile Photo</Text>
              <TouchableOpacity style={styles.avatarPickerWrap} onPress={handlePickAvatar} activeOpacity={0.85}>
                <View style={styles.avatarPickerRing}>
                  {editAvatarUrl ? (
                    <Image source={{ uri: editAvatarUrl }} style={styles.avatarPreview} />
                  ) : (
                    <View style={styles.avatarPickerEmpty}><User size={36} color={colors.textMuted} /></View>
                  )}
                </View>
                <View style={styles.avatarCameraBtn}><Camera size={15} color={colors.white} /></View>
              </TouchableOpacity>
              <Text style={styles.avatarPickerHint}>Tap to change photo</Text>

              <Text style={styles.editLabel}>Username</Text>
              <TextInput
                style={styles.editInput}
                placeholder="Choose a username"
                placeholderTextColor={colors.textMuted}
                value={editUsername}
                onChangeText={setEditUsername}
                autoCapitalize="none"
                maxLength={24}
              />

              <Text style={styles.editLabel}>Bio</Text>
              <TextInput
                style={[styles.editInput, styles.editBioInput]}
                placeholder="Tell us about yourself"
                placeholderTextColor={colors.textMuted}
                value={editBio}
                onChangeText={setEditBio}
                multiline
                maxLength={160}
                textAlignVertical="top"
              />
              <Text style={styles.editCharCount}>{editBio.length}/160</Text>

              <Text style={styles.editLabel}>X / Twitter</Text>
              <TextInput
                style={styles.editInput}
                placeholder="https://x.com/yourhandle"
                placeholderTextColor={colors.textMuted}
                value={editTwitterUrl}
                onChangeText={setEditTwitterUrl}
                autoCapitalize="none"
                keyboardType="url"
              />

              <Text style={styles.editLabel}>Telegram</Text>
              <TextInput
                style={styles.editInput}
                placeholder="https://t.me/yourhandle"
                placeholderTextColor={colors.textMuted}
                value={editTelegramUrl}
                onChangeText={setEditTelegramUrl}
                autoCapitalize="none"
                keyboardType="url"
              />

              <Text style={styles.editLabel}>Discord</Text>
              <TextInput
                style={styles.editInput}
                placeholder="https://discord.gg/yourserver"
                placeholderTextColor={colors.textMuted}
                value={editDiscordUrl}
                onChangeText={setEditDiscordUrl}
                autoCapitalize="none"
                keyboardType="url"
              />

              {saveError ? (
                <Text style={{ color: colors.error, fontSize: 13, marginBottom: 12, textAlign: 'center' }}>
                  {saveError}
                </Text>
              ) : null}

              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveProfile} disabled={saving}>
                {saving
                  ? <ActivityIndicator size="small" color={colors.white} />
                  : <><Check size={17} color={colors.white} /><Text style={styles.saveBtnText}>Save Changes</Text></>
                }
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ── Comments Modal ──────────────────────────────────────────────── */}
      <Modal visible={showCommentsModal} animationType="slide" transparent onRequestClose={closeCommentsModal}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.modalSheet, { maxHeight: '85%' }]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Comments</Text>
              <TouchableOpacity onPress={closeCommentsModal}>
                <X size={22} color={colors.textPrimary} strokeWidth={2} />
              </TouchableOpacity>
            </View>

            {replyingToComment && (
              <View style={profileCommentStyles.replyBanner}>
                <Text style={profileCommentStyles.replyBannerText} numberOfLines={1}>
                  Replying to {replyingToComment.author?.username || 'user'}
                </Text>
                <TouchableOpacity onPress={() => setReplyingToComment(null)}>
                  <X size={14} color={colors.textMuted} strokeWidth={2} />
                </TouchableOpacity>
              </View>
            )}

            {commentsLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: 32 }} />
            ) : (
              <FlatList
                data={comments}
                keyExtractor={c => c.id}
                style={{ flex: 1 }}
                contentContainerStyle={{ padding: spacing.lg, paddingBottom: 8 }}
                renderItem={({ item: c }) => (
                  <View key={c.id}>
                    <View style={profileCommentStyles.commentCard}>
                      <View style={profileCommentStyles.commentAvatar}>
                        {c.author?.avatar_url
                          ? <Image source={{ uri: c.author.avatar_url }} style={profileCommentStyles.commentAvatarImg} />
                          : <User size={14} color={colors.textMuted} />
                        }
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={profileCommentStyles.commentNameRow}>
                          <Text style={profileCommentStyles.commentAuthor}>
                            {c.author?.username || `${c.author?.wallet_address?.slice(0, 6)}...`}
                          </Text>
                          <VerificationBadge profile={c.author as any} size="sm" />
                        </View>
                        <Text style={profileCommentStyles.commentText}>{c.content}</Text>
                        <View style={profileCommentStyles.commentActions}>
                          <TouchableOpacity style={profileCommentStyles.commentAction} onPress={() => handleCommentLike(c.id)}>
                            <Heart size={13} color={c.liked_by_user ? '#ef4444' : colors.textMuted} fill={c.liked_by_user ? '#ef4444' : 'none'} strokeWidth={2} />
                            <Text style={profileCommentStyles.commentActionText}>{c.likes_count || 0}</Text>
                          </TouchableOpacity>
                          {currentUserProfile && (
                            <TouchableOpacity style={profileCommentStyles.commentAction} onPress={() => setReplyingToComment(c)}>
                              <MessageCircle size={13} color={colors.textMuted} strokeWidth={2} />
                              <Text style={profileCommentStyles.commentActionText}>Reply</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                        {(c.replies || []).map(r => (
                          <View key={r.id} style={profileCommentStyles.replyCard}>
                            <View style={profileCommentStyles.replyAvatar}>
                              {r.author?.avatar_url
                                ? <Image source={{ uri: r.author.avatar_url }} style={profileCommentStyles.replyAvatarImg} />
                                : <User size={11} color={colors.textMuted} />
                              }
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={profileCommentStyles.replyAuthor}>
                                {r.author?.username || `${r.author?.wallet_address?.slice(0, 6)}...`}
                              </Text>
                              <Text style={profileCommentStyles.replyText}>{r.content}</Text>
                              <TouchableOpacity style={profileCommentStyles.commentAction} onPress={() => handleCommentLike(r.id)}>
                                <Heart size={11} color={r.liked_by_user ? '#ef4444' : colors.textMuted} fill={r.liked_by_user ? '#ef4444' : 'none'} strokeWidth={2} />
                                <Text style={profileCommentStyles.commentActionText}>{r.likes_count || 0}</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        ))}
                      </View>
                    </View>
                  </View>
                )}
                ListEmptyComponent={
                  <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                    <MessageCircle size={32} color={colors.textMuted} strokeWidth={1.5} />
                    <Text style={{ color: colors.textMuted, marginTop: 8 }}>No comments yet</Text>
                  </View>
                }
              />
            )}

            {currentUserProfile && (
              <View style={profileCommentStyles.inputRow}>
                <TextInput
                  style={profileCommentStyles.input}
                  placeholder={replyingToComment ? 'Write a reply...' : 'Add a comment...'}
                  placeholderTextColor={colors.textMuted}
                  value={newCommentContent}
                  onChangeText={setNewCommentContent}
                  multiline
                  maxLength={500}
                  editable={!submittingComment}
                />
                <TouchableOpacity
                  style={[profileCommentStyles.sendBtn, (!newCommentContent.trim() || submittingComment) && profileCommentStyles.sendBtnDisabled]}
                  onPress={handleAddComment}
                  disabled={!newCommentContent.trim() || submittingComment}
                >
                  {submittingComment
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Send size={16} color="#fff" strokeWidth={2} />
                  }
                </TouchableOpacity>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Promote Post Modal ───────────────────────────────────────────── */}
      <Modal visible={showPromoteModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            {promoteStep === 'select' && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Promote Post</Text>
                  <TouchableOpacity onPress={() => setShowPromoteModal(false)}>
                    <X size={22} color={colors.textPrimary} />
                  </TouchableOpacity>
                </View>
                <Text style={[styles.editLabel, { marginBottom: spacing.md }]}>
                  Boost your post to the top of the feed.
                </Text>
                {PROMOTE_TIERS.map(tier => (
                  <TouchableOpacity key={tier.key} style={styles.tierCard} onPress={() => {
                    setSelectedTierKey(tier.key);
                    setPromoteStep('confirm');
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 }}>
                      <View style={styles.tierIcon}><Clock size={16} color={colors.primary} /></View>
                      <View>
                        <Text style={styles.tierLabel}>{tier.label}</Text>
                        <Text style={styles.tierSub}>{tier.hours}h visibility boost</Text>
                      </View>
                    </View>
                    <Text style={styles.tierPrice}>${tier.price}</Text>
                  </TouchableOpacity>
                ))}
              </>
            )}
            {promoteStep === 'confirm' && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Confirm</Text>
                  <TouchableOpacity onPress={() => setPromoteStep('select')}>
                    <X size={22} color={colors.textPrimary} />
                  </TouchableOpacity>
                </View>
                <View style={styles.confirmCard}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md }}>
                    <Text style={styles.editLabel}>Tier</Text>
                    <Text style={styles.editLabel}>{PROMOTE_TIERS.find(t => t.key === selectedTierKey)?.label}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={styles.editLabel}>Price</Text>
                    <Text style={styles.editLabel}>${PROMOTE_TIERS.find(t => t.key === selectedTierKey)?.price} USD</Text>
                  </View>
                </View>
                <TouchableOpacity style={styles.saveBtn} onPress={handleConfirmPromotion} disabled={promotingPost}>
                  <Zap size={16} color={colors.white} />
                  <Text style={styles.saveBtnText}>Promote Now</Text>
                </TouchableOpacity>
              </>
            )}
            {promoteStep === 'processing' && (
              <View style={{ alignItems: 'center', paddingVertical: 48 }}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[styles.editLabel, { marginTop: spacing.lg }]}>Activating promotion...</Text>
              </View>
            )}
            {promoteStep === 'done' && (
              <View style={{ alignItems: 'center', paddingVertical: 48 }}>
                <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.successMuted, justifyContent: 'center', alignItems: 'center', marginBottom: spacing.lg }}>
                  <Check size={32} color={colors.success} />
                </View>
                <Text style={styles.modalTitle}>Promotion Active!</Text>
                <TouchableOpacity style={[styles.saveBtn, { marginTop: spacing.xl }]} onPress={() => setShowPromoteModal(false)}>
                  <Text style={styles.saveBtnText}>Done</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0F' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0A0A0F' },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingTop: 54, paddingBottom: spacing.md,
    backgroundColor: '#0A0A0F', zIndex: 10,
  },
  topBarBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  topBarTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.textPrimary },
  bannerWrap: { width: '100%', height: 160, backgroundColor: '#1A0B2E', overflow: 'hidden' },
  bannerEditOverlay: {
    position: 'absolute',
    bottom: 8,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 14,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  bannerEditText: { color: colors.white, fontSize: 12, fontWeight: '600' },
  banner: { width: '100%', height: '100%' },
  profileTopRow: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: spacing.lg, marginTop: -36, marginBottom: spacing.md, gap: spacing.md,
  },
  avatarWrap: { borderRadius: 44, borderWidth: 3, borderColor: '#0A0A0F', overflow: 'visible' },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#1A1A28' },
  avatarFallback: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#1A1A28', justifyContent: 'center', alignItems: 'center' },
  premiumBadgeOnAvatar: {
    position: 'absolute', bottom: 0, right: -2,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: '#1A0B2E', borderWidth: 2, borderColor: '#0A0A0F',
    justifyContent: 'center', alignItems: 'center',
  },
  profileTitleBlock: { flex: 1, paddingBottom: 4 },
  nameVerifiedRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  displayName: { fontSize: fontSize.xl, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.3 },
  handle: { fontSize: fontSize.sm, fontWeight: '500', color: colors.textMuted, marginTop: 2 },
  shareBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#1A1A28',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginBottom: 4,
  },
  addrChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start', marginHorizontal: spacing.lg, marginBottom: spacing.md,
    backgroundColor: '#1A1A28', borderRadius: borderRadius.md,
    paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  addrChipText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textPrimary, fontFamily: 'SpaceMono-Regular' },
  bio: { fontSize: fontSize.md, color: colors.textSecondary, lineHeight: 22, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  bioPlaceholder: { fontSize: fontSize.md, color: colors.textMuted, lineHeight: 22, paddingHorizontal: spacing.lg, marginBottom: spacing.lg },
  socialLinksRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, marginBottom: spacing.lg, gap: spacing.md, flexWrap: 'wrap' },
  socialLinkBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: borderRadius.full, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  socialLinkText: { fontSize: fontSize.sm, fontWeight: '600' },
  statsRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, marginBottom: spacing.lg },
  stat: { flex: 1 },
  statValue: { fontSize: fontSize.xl, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.3 },
  statClickable: { color: colors.textPrimary, textDecorationLine: 'underline', textDecorationColor: 'rgba(139,92,246,0.4)' },
  statLabel: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2, fontWeight: '500' },
  statDivider: { width: 1, height: 36, backgroundColor: 'rgba(255,255,255,0.08)', marginHorizontal: spacing.lg },

  // Action buttons row
  actionRow: {
    flexDirection: 'row', gap: spacing.sm,
    marginHorizontal: spacing.lg, marginBottom: spacing.xl,
  },
  actionBtn: {
    flex: 1, backgroundColor: '#1A1A28', borderRadius: borderRadius.full,
    paddingVertical: 14, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    flexDirection: 'row', gap: spacing.xs,
  },
  actionBtnText: { fontSize: fontSize.md, fontWeight: '700', color: colors.textPrimary },
  followingBtn: { backgroundColor: 'transparent', borderColor: colors.primary },
  followingBtnText: { color: colors.primary },
  messageBtn: { flex: 1, backgroundColor: '#1A1A28', borderColor: 'rgba(255,255,255,0.1)' },
  messageBtnText: { fontSize: fontSize.md, fontWeight: '700', color: colors.textPrimary },
  premiumBtn: {
    flex: 1, backgroundColor: 'rgba(251,191,36,0.12)',
    borderColor: '#FBBF24', borderWidth: 1,
  },
  premiumBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: '#FBBF24' },
  premiumActiveBtn: {
    flex: 1, backgroundColor: 'rgba(251,191,36,0.08)',
    borderColor: 'rgba(251,191,36,0.3)',
  },
  premiumActiveBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: '#FBBF24', opacity: 0.7 },

  // Tabs
  tabBar: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)', marginBottom: spacing.xs },
  tab: { flex: 1, paddingVertical: spacing.lg, alignItems: 'center', position: 'relative' },
  tabText: { fontSize: fontSize.md, fontWeight: '600', color: colors.textMuted },
  tabTextActive: { color: colors.primary },
  tabUnderline: { position: 'absolute', bottom: 0, left: '20%', right: '20%', height: 2, backgroundColor: colors.primary, borderRadius: 1 },
  emptyPosts: { alignItems: 'center', paddingVertical: 60 },
  emptyPostsText: { fontSize: fontSize.md, color: colors.textMuted },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalScroll: { maxHeight: '90%' },
  modalSheet: { backgroundColor: '#12121A', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.xxl },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#2A2A3A', alignSelf: 'center', marginBottom: spacing.lg },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xl },
  modalTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.textPrimary },

  editLabel: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing.sm, marginTop: spacing.md },
  editInput: { backgroundColor: '#1A1A28', borderWidth: 1, borderColor: colors.surfaceBorder, borderRadius: borderRadius.md, padding: spacing.lg, fontSize: fontSize.md, color: colors.textPrimary },
  editBioInput: { minHeight: 80 },
  editCharCount: { fontSize: fontSize.xs, color: colors.textMuted, textAlign: 'right', marginTop: spacing.xs },
  avatarPickerWrap: { alignSelf: 'center', marginBottom: spacing.sm, position: 'relative' },
  avatarPickerRing: { width: 100, height: 100, borderRadius: 50, borderWidth: 2, borderColor: colors.primary, overflow: 'hidden' },
  avatarPreview: { width: 100, height: 100, borderRadius: 50 },
  avatarPickerEmpty: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#1A1A28', justifyContent: 'center', alignItems: 'center' },
  avatarCameraBtn: { position: 'absolute', bottom: 2, right: 0, width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', borderWidth: 2.5, borderColor: '#12121A' },
  avatarPickerHint: { textAlign: 'center', fontSize: 12, color: colors.textMuted, marginBottom: spacing.xl, alignSelf: 'center' },
  saveBtn: { backgroundColor: colors.primary, paddingVertical: spacing.lg, borderRadius: borderRadius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.xxl, marginBottom: spacing.xxl },
  saveBtnText: { fontSize: fontSize.md, fontWeight: '700', color: colors.white },
  bannerPickerWrap: { width: '100%', height: 100, borderRadius: borderRadius.md, overflow: 'hidden', borderWidth: 1, borderColor: colors.surfaceBorder },
  bannerPickerImg: { width: '100%', height: '100%' },
  bannerPickerEmpty: { flex: 1, backgroundColor: '#1A1A28', justifyContent: 'center', alignItems: 'center', gap: spacing.sm },
  bannerPickerText: { fontSize: fontSize.sm, color: colors.textMuted },
  tierCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A28', borderRadius: borderRadius.md, padding: spacing.lg, marginBottom: spacing.md, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  tierIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primaryMuted, justifyContent: 'center', alignItems: 'center' },
  tierLabel: { fontSize: fontSize.md, fontWeight: '700', color: colors.textPrimary },
  tierSub: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  tierPrice: { fontSize: fontSize.lg, fontWeight: '800', color: colors.primary },
  confirmCard: { backgroundColor: '#1A1A28', borderRadius: borderRadius.md, padding: spacing.lg, marginBottom: spacing.xl, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },

  // Delete confirm
  confirmOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: spacing.xxl },
  confirmBox: { backgroundColor: '#12121A', borderRadius: 20, padding: spacing.xxl, width: '100%', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  confirmTitle: { fontSize: fontSize.lg, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.md, textAlign: 'center' },
  confirmBody: { fontSize: fontSize.md, color: colors.textSecondary, lineHeight: 22, textAlign: 'center', marginBottom: spacing.xl },
  confirmBtns: { flexDirection: 'row', gap: spacing.md },
  confirmCancelBtn: { flex: 1, backgroundColor: '#1A1A28', borderRadius: borderRadius.full, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  confirmCancelText: { fontSize: fontSize.md, fontWeight: '700', color: colors.textPrimary },
  confirmDeleteBtn: { flex: 1, backgroundColor: '#ef4444', borderRadius: borderRadius.full, paddingVertical: 14, alignItems: 'center' },
  confirmDeleteText: { fontSize: fontSize.md, fontWeight: '700', color: colors.white },

  // Action buttons - verify
  verifyBtn: { flex: 1, backgroundColor: 'rgba(99,102,241,0.12)', borderColor: '#6366F1', borderWidth: 1 },
  verifyBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: '#6366F1' },

  // Premium modal
  premiumHeader: { alignItems: 'center', marginBottom: spacing.xl, gap: spacing.sm },
  premiumIconRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  premiumTitle: { fontSize: fontSize.xl, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' },
  premiumDesc: { fontSize: fontSize.md, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  premiumBadgePreview: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center', position: 'relative', marginBottom: spacing.sm },
  premiumBadgeGlow: { position: 'absolute', width: 56, height: 56, borderRadius: 28, backgroundColor: '#D97706', opacity: 0.25, shadowColor: '#F59E0B', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 16, elevation: 8 },
  premiumBadgeCircle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#D97706', overflow: 'hidden' },
  premiumStarWrap: { position: 'absolute', bottom: 4, right: 4 },
  premiumTierRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#1A1A28', borderRadius: borderRadius.md, padding: spacing.lg, marginBottom: spacing.sm, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  premiumTierRowSelected: { borderColor: '#FBBF24', backgroundColor: 'rgba(251,191,36,0.06)' },
  premiumTierLeft: { gap: 3 },
  premiumTierRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  premiumTierLabel: { fontSize: fontSize.md, fontWeight: '700', color: colors.textPrimary },
  premiumTierLabelActive: { color: '#FBBF24' },
  premiumTierSub: { fontSize: fontSize.xs, color: colors.textMuted },
  premiumTierPrice: { fontSize: fontSize.lg, fontWeight: '800', color: colors.textPrimary },
  premiumTierPriceActive: { color: '#FBBF24' },
  premiumPayBtn: { backgroundColor: '#D97706', borderRadius: borderRadius.full, paddingVertical: spacing.md, alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'center', marginTop: spacing.lg },
  premiumPayBtnText: { fontSize: fontSize.md, fontWeight: '700', color: colors.white },
  premiumNote: { fontSize: fontSize.xs, color: colors.textMuted, textAlign: 'center', marginTop: spacing.lg, lineHeight: 18 },
  premiumDoneIcon: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center', position: 'relative', marginBottom: spacing.sm },
  saveBtnDisabled: { opacity: 0.5 },

  // Basic verification modal
  verifyBadgePreview: { width: 72, height: 72, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', position: 'relative', marginBottom: spacing.sm },
  verifyBadgeGlow: { position: 'absolute', width: 60, height: 60, borderRadius: 30, backgroundColor: '#6366F1', opacity: 0.2, shadowColor: '#6366F1', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 16, elevation: 8 },
  verifyBadgeCircle: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#6366F1', overflow: 'hidden' },
  verifyTitle: { fontSize: fontSize.xl, fontWeight: '800', color: colors.textPrimary, textAlign: 'center', marginBottom: spacing.sm },
  verifyDesc: { fontSize: fontSize.md, color: colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: spacing.xl },
  verifySteps: { gap: spacing.md, marginBottom: spacing.xl },
  verifyStep: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: '#1A1A28', borderRadius: borderRadius.md, padding: spacing.md, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  verifyStepIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#2A2A3A', alignItems: 'center', justifyContent: 'center' },
  verifyStepDone: { backgroundColor: '#6366F1' },
  verifyStepNum: { fontSize: 13, fontWeight: '800', color: colors.textMuted },
  verifyStepInfo: { flex: 1, gap: 2 },
  verifyStepTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textPrimary },
  verifyStepSub: { fontSize: fontSize.xs, color: colors.textMuted },
  verifyActionBtn: { backgroundColor: 'rgba(99,102,241,0.12)', borderRadius: borderRadius.full, paddingVertical: 7, paddingHorizontal: 14, borderWidth: 1, borderColor: 'rgba(99,102,241,0.3)' },
  verifyActionBtnText: { fontSize: 12, fontWeight: '700', color: '#6366F1' },
});

const profileCommentStyles = StyleSheet.create({
  replyBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(139,92,246,0.12)', paddingHorizontal: spacing.lg, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: 'rgba(139,92,246,0.15)',
  },
  replyBannerText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '600', flex: 1 },
  commentCard: {
    flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md,
    backgroundColor: '#12121E', borderRadius: 12, padding: spacing.md,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
  },
  commentAvatar: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#1E1E2E', justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
  },
  commentAvatarImg: { width: 30, height: 30, borderRadius: 15 },
  commentNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  commentAuthor: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textPrimary },
  commentText: { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 19 },
  commentActions: { flexDirection: 'row', gap: spacing.lg, marginTop: 6 },
  commentAction: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  commentActionText: { fontSize: 11, color: colors.textMuted, fontWeight: '600' },
  replyCard: {
    flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm,
    paddingLeft: spacing.md, paddingTop: spacing.sm,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.04)',
  },
  replyAvatar: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#1E1E2E', justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
  },
  replyAvatarImg: { width: 24, height: 24, borderRadius: 12 },
  replyAuthor: { fontSize: 11, fontWeight: '700', color: colors.textPrimary, marginBottom: 2 },
  replyText: { fontSize: 12, color: colors.textSecondary, lineHeight: 17 },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)',
    backgroundColor: '#0A0A0F',
  },
  input: {
    flex: 1, backgroundColor: '#1A1A28', borderRadius: 20,
    paddingHorizontal: spacing.md, paddingVertical: 10,
    fontSize: fontSize.md, color: colors.textPrimary, maxHeight: 100,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#2A2A3A' },
});
