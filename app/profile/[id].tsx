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
  Share,
  KeyboardAvoidingView,
  Platform,
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
  Heart,
  Send,
} from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { useWallet } from '@/contexts/WalletContext';
import { useProfile } from '@/contexts/ProfileContext';
import { SocialService, UserProfile, Post, PostComment, PROMOTE_TIERS } from '@/services/socialService';
import { timeAgo } from '@/components/PostCard';
import { colors, spacing, borderRadius, fontSize, elevation } from '@/constants/theme';
import PostCard from '@/components/PostCard';

type ProfileTab = 'posts' | 'replies' | 'media' | 'likes';

const DEFAULT_BANNER =
  'https://images.pexels.com/photos/956999/milky-way-starry-sky-night-sky-star-956999.jpeg?auto=compress&cs=tinysrgb&w=800';

// Certification badge component
function CertBadge({ profile }: { profile: UserProfile }) {
  const isPremiumActive = SocialService.isPremiumActive(profile);
  if (!profile.is_verified && !isPremiumActive) return null;
  return (
    <View style={certStyles.row}>
      {profile.is_verified && (
        <BadgeCheck size={18} color={colors.primary} fill={colors.primary} strokeWidth={0} />
      )}
      {isPremiumActive && (
        <View style={certStyles.premiumWrap}>
          <BadgeCheck size={18} color={colors.primary} fill={colors.primary} strokeWidth={0} />
          <Star size={10} color="#FBBF24" fill="#FBBF24" strokeWidth={0} style={certStyles.star} />
        </View>
      )}
    </View>
  );
}

const certStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  premiumWrap: { position: 'relative', width: 20, height: 20 },
  star: { position: 'absolute', bottom: -1, right: -2 },
});

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
          <CertBadge profile={user} />
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
  const { selectedAccount, activeAddress } = useWallet();

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

  // Edit modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editUsername, setEditUsername] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editAvatarUrl, setEditAvatarUrl] = useState('');
  const [editBannerUrl, setEditBannerUrl] = useState('');
  const [saving, setSaving] = useState(false);

  // Promote modal
  const [showPromoteModal, setShowPromoteModal] = useState(false);
  const [promotePostId, setPromotePostId] = useState<string | null>(null);
  const [promoteStep, setPromoteStep] = useState<'select' | 'confirm' | 'processing' | 'done'>('select');
  const [selectedTierKey, setSelectedTierKey] = useState<string | null>(null);
  const [promotingPost, setPromotingPost] = useState(false);

  // Premium certification modal
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [purchasingPremium, setPurchasingPremium] = useState(false);
  const [premiumDone, setPremiumDone] = useState(false);

  // Comments modal
  const [showCommentsModal, setShowCommentsModal] = useState(false);
  const [commentsPostId, setCommentsPostId] = useState<string | null>(null);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [newCommentContent, setNewCommentContent] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [replyingToComment, setReplyingToComment] = useState<PostComment | null>(null);

  const { updateProfile: updateGlobalProfile, uploadAvatar: uploadGlobalAvatar } = useProfile();
  const walletAddr = selectedAccount?.address || activeAddress || '';
  const isOwnProfile = currentUserProfile?.id === id;

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
    setEditBannerUrl(profile.banner_url || '');
    setShowEditModal(true);
  };

  const handlePickBanner = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [3, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) setEditBannerUrl(result.assets[0].uri);
  };

  const handlePickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) setEditAvatarUrl(result.assets[0].uri);
  };

  const handleSaveProfile = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      let avatarUrl: string | undefined = editAvatarUrl.trim() || undefined;
      if (avatarUrl && (avatarUrl.startsWith('file://') || avatarUrl.startsWith('blob:') || avatarUrl.startsWith('data:'))) {
        const uploaded = await uploadGlobalAvatar(avatarUrl);
        if (uploaded) avatarUrl = uploaded;
      }
      let bannerUrl: string | undefined = editBannerUrl.trim() || undefined;
      if (bannerUrl && (bannerUrl.startsWith('file://') || bannerUrl.startsWith('blob:') || bannerUrl.startsWith('data:'))) {
        const uploaded = await SocialService.uploadAvatar(profile.wallet_address, bannerUrl, profile.id + '_banner');
        if (uploaded) bannerUrl = uploaded;
      }
      await updateGlobalProfile({
        username: editUsername.trim() || undefined,
        bio: editBio.trim(),
        avatar_url: avatarUrl,
      });
      if (bannerUrl) {
        await SocialService.updateProfile(profile.id, { banner_url: bannerUrl });
      }
      await loadProfile();
    } finally {
      setSaving(false);
      setShowEditModal(false);
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
    try {
      if (tab === 'replies') {
        setReplies(await SocialService.getUserReplies(id));
      } else if (tab === 'media') {
        setMediaPosts(await SocialService.getUserMediaPosts(id));
      } else if (tab === 'likes') {
        setLikedPosts(await SocialService.getUserLikedPosts(id));
      }
    } finally {
      setTabLoading(null);
    }
  }, [id]);

  const handleTabChange = (tab: ProfileTab) => {
    setActiveTab(tab);
    loadTab(tab);
  };

  const handleLike = async (postId: string) => {
    if (!currentUserProfile) return;
    const update = (list: Post[]) => list.map(p =>
      p.id === postId ? {
        ...p,
        liked_by_user: !p.liked_by_user,
        likes_count: p.liked_by_user ? Math.max(0, (p.likes_count || 0) - 1) : (p.likes_count || 0) + 1,
      } : p
    );
    setPosts(update);
    setReplies(update);
    setLikedPosts(update);
    setMediaPosts(update);
    await SocialService.toggleLike(postId, currentUserProfile.id);
  };

  const handleRepost = async (postId: string) => {
    if (!currentUserProfile) return;
    await SocialService.toggleRepost(postId, currentUserProfile.id);
    await loadProfile();
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

  const handlePurchasePremium = async (tier: 'sol' | 'dawen') => {
    if (!currentUserProfile || !isOwnProfile) return;
    setPurchasingPremium(true);
    const ok = await SocialService.purchasePremiumCertification(currentUserProfile.id, tier);
    setPurchasingPremium(false);
    if (ok) {
      setPremiumDone(true);
      await loadProfile();
    }
  };

  const openCommentsModal = async (postId: string) => {
    setCommentsPostId(postId);
    setShowCommentsModal(true);
    setCommentsLoading(true);
    try {
      setComments(await SocialService.getComments(postId, currentUserProfile?.id));
    } catch {
      setComments([]);
    } finally {
      setCommentsLoading(false);
    }
  };

  const handleAddComment = async () => {
    if (!newCommentContent.trim() || !currentUserProfile || !commentsPostId) return;
    setSubmittingComment(true);
    try {
      await SocialService.addComment(commentsPostId, currentUserProfile.id, newCommentContent.trim(), replyingToComment?.id);
      setNewCommentContent('');
      setReplyingToComment(null);
      setComments(await SocialService.getComments(commentsPostId, currentUserProfile.id));
      setPosts(prev => prev.map(p => p.id === commentsPostId ? { ...p, comments_count: (p.comments_count || 0) + 1 } : p));
    } catch {} finally {
      setSubmittingComment(false);
    }
  };

  const handleCommentLike = async (commentId: string) => {
    if (!currentUserProfile) return;
    setComments(prev => prev.map(c => {
      if (c.id === commentId) return { ...c, liked_by_user: !c.liked_by_user, likes_count: c.liked_by_user ? Math.max(0, (c.likes_count || 0) - 1) : (c.likes_count || 0) + 1 };
      return { ...c, replies: (c.replies || []).map(r => r.id === commentId ? { ...r, liked_by_user: !r.liked_by_user, likes_count: r.liked_by_user ? Math.max(0, (r.likes_count || 0) - 1) : (r.likes_count || 0) + 1 } : r) };
    }));
    await SocialService.toggleCommentLike(commentId, currentUserProfile.id);
  };

  const handleShareProfile = async () => {
    try {
      const name = profile?.username || displayName;
      await Share.share({ message: `Check out ${name}'s profile on Dawen Pulse!` });
    } catch {}
  };

  const displayName = profile?.username
    || (profile?.wallet_address ? `${profile.wallet_address.slice(0, 6)}...${profile.wallet_address.slice(-4)}` : 'Unknown');

  const shortAddr = profile?.wallet_address
    ? `${profile.wallet_address.slice(0, 4)}...${profile.wallet_address.slice(-4)}`
    : '';

  const bannerUrl = profile?.banner_url || DEFAULT_BANNER;
  const isPremiumActive = profile ? SocialService.isPremiumActive(profile) : false;

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
            onPromote={canDelete && isOwnProfile ? openPromoteModal : undefined}
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
        {/* Banner */}
        <View style={styles.bannerWrap}>
          <Image source={{ uri: bannerUrl }} style={styles.banner} resizeMode="cover" />
          <LinearGradient colors={['transparent', 'rgba(10,10,15,0.4)']} style={StyleSheet.absoluteFill} />
        </View>

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
              {profile && <CertBadge profile={profile} />}
            </View>
            <Text style={styles.handle}>
              @{profile?.username?.toLowerCase() || displayName.toLowerCase().replace(/\s/g, '')}
            </Text>
          </View>

          <TouchableOpacity style={styles.shareBtn} onPress={handleShareProfile} activeOpacity={0.8}>
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
          <Text style={styles.bio}>{profile.bio}</Text>
        ) : (
          isOwnProfile && <Text style={styles.bioPlaceholder}>Building the future of trading.</Text>
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
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            {!premiumDone ? (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Premium Certification</Text>
                  <TouchableOpacity onPress={() => setShowPremiumModal(false)}>
                    <X size={22} color={colors.textPrimary} />
                  </TouchableOpacity>
                </View>

                <View style={styles.premiumHeader}>
                  <View style={styles.premiumIconRow}>
                    <BadgeCheck size={28} color={colors.primary} fill={colors.primary} strokeWidth={0} />
                    <Star size={16} color="#FBBF24" fill="#FBBF24" strokeWidth={0} />
                  </View>
                  <Text style={styles.premiumTitle}>Dawen Premium</Text>
                  <Text style={styles.premiumDesc}>
                    Get a purple badge + gold star next to your name. Valid for 1 year. Paid from your connected wallet.
                  </Text>
                </View>

                <View style={styles.premiumTierCard}>
                  <Text style={styles.premiumTierLabel}>Pay with SOL</Text>
                  <Text style={styles.premiumTierPrice}>0.5 SOL / year</Text>
                  <TouchableOpacity
                    style={[styles.premiumPayBtn, purchasingPremium && { opacity: 0.6 }]}
                    onPress={() => handlePurchasePremium('sol')}
                    disabled={purchasingPremium}
                    activeOpacity={0.85}
                  >
                    {purchasingPremium
                      ? <ActivityIndicator size="small" color={colors.white} />
                      : <>
                          <Wallet size={15} color={colors.white} strokeWidth={2} />
                          <Text style={styles.premiumPayBtnText}>Pay with SOL</Text>
                        </>
                    }
                  </TouchableOpacity>
                </View>

                <View style={[styles.premiumTierCard, { marginTop: spacing.md }]}>
                  <Text style={styles.premiumTierLabel}>Pay with DAWEN</Text>
                  <Text style={styles.premiumTierPrice}>1000 DAWEN / year</Text>
                  <TouchableOpacity
                    style={[styles.premiumPayBtn, purchasingPremium && { opacity: 0.6 }]}
                    onPress={() => handlePurchasePremium('dawen')}
                    disabled={purchasingPremium}
                    activeOpacity={0.85}
                  >
                    {purchasingPremium
                      ? <ActivityIndicator size="small" color={colors.white} />
                      : <>
                          <Wallet size={15} color={colors.white} strokeWidth={2} />
                          <Text style={styles.premiumPayBtnText}>Pay with DAWEN</Text>
                        </>
                    }
                  </TouchableOpacity>
                </View>

                <Text style={styles.premiumNote}>
                  * Payment processing via connected wallet will be fully activated in the next release. Certification is granted immediately upon purchase.
                </Text>
              </>
            ) : (
              <View style={{ alignItems: 'center', paddingVertical: 48 }}>
                <View style={styles.premiumDoneIcon}>
                  <BadgeCheck size={36} color={colors.primary} fill={colors.primary} strokeWidth={0} />
                  <Star size={18} color="#FBBF24" fill="#FBBF24" strokeWidth={0} style={{ position: 'absolute', bottom: 0, right: 0 }} />
                </View>
                <Text style={styles.modalTitle}>Premium Active!</Text>
                <Text style={{ color: colors.textMuted, fontSize: fontSize.md, marginTop: 8, textAlign: 'center' }}>
                  Your premium badge is now visible on your profile.
                </Text>
                <TouchableOpacity
                  style={[styles.actionBtn, { marginTop: spacing.xl, paddingHorizontal: spacing.xxxl }]}
                  onPress={() => setShowPremiumModal(false)}
                >
                  <Text style={styles.actionBtnText}>Done</Text>
                </TouchableOpacity>
              </View>
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

              <Text style={styles.editLabel}>Cover Photo</Text>
              <TouchableOpacity style={styles.bannerPickerWrap} onPress={handlePickBanner} activeOpacity={0.85}>
                {editBannerUrl ? (
                  <Image source={{ uri: editBannerUrl }} style={styles.bannerPickerImg} resizeMode="cover" />
                ) : (
                  <View style={styles.bannerPickerEmpty}>
                    <Camera size={22} color={colors.textMuted} />
                    <Text style={styles.bannerPickerText}>Tap to set cover photo</Text>
                  </View>
                )}
              </TouchableOpacity>

              <Text style={[styles.editLabel, { marginTop: spacing.lg }]}>Profile Photo</Text>
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

      {/* ── Comments Modal ───────────────────────────────────────────────── */}
      <Modal visible={showCommentsModal} animationType="slide" transparent>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.modalSheet, { maxHeight: '90%' }]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Comments</Text>
              <TouchableOpacity onPress={() => { setShowCommentsModal(false); setComments([]); setNewCommentContent(''); setReplyingToComment(null); }}>
                <X size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
              {commentsLoading ? (
                <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
              ) : comments.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                  <Text style={{ color: colors.textMuted, fontSize: fontSize.md }}>No comments yet. Be the first!</Text>
                </View>
              ) : (
                <View style={{ paddingBottom: spacing.lg }}>
                  {comments.map(item => (
                    <View key={item.id}>
                      <View style={commentStyles.item}>
                        <TouchableOpacity onPress={() => item.author?.id && router.push(`/profile/${item.author.id}` as any)} activeOpacity={0.8}>
                          <View style={commentStyles.avatarXS}>
                            {item.author?.avatar_url ? <Image source={{ uri: item.author.avatar_url }} style={commentStyles.avatarXSImg} /> : <User size={12} color={colors.textMuted} />}
                          </View>
                        </TouchableOpacity>
                        <View style={commentStyles.body}>
                          <View style={commentStyles.meta}>
                            <Text style={commentStyles.author}>{item.author?.username || `${item.author?.wallet_address?.slice(0, 6)}...`}</Text>
                            <Text style={commentStyles.time}>{timeAgo(item.created_at)}</Text>
                          </View>
                          <Text style={commentStyles.text}>{item.content}</Text>
                          <View style={commentStyles.actions}>
                            <TouchableOpacity style={commentStyles.actionBtn} onPress={() => handleCommentLike(item.id)} activeOpacity={0.7}>
                              <Heart size={13} color={item.liked_by_user ? '#ef4444' : colors.textMuted} fill={item.liked_by_user ? '#ef4444' : 'none'} strokeWidth={2} />
                              {(item.likes_count || 0) > 0 && <Text style={[commentStyles.actionText, item.liked_by_user && { color: '#ef4444' }]}>{item.likes_count}</Text>}
                            </TouchableOpacity>
                            <TouchableOpacity style={commentStyles.actionBtn} onPress={() => setReplyingToComment(item)} activeOpacity={0.7}>
                              <MessageCircle size={13} color={colors.textMuted} strokeWidth={2} />
                              <Text style={commentStyles.actionText}>Reply</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                      {(item.replies || []).map(reply => (
                        <View key={reply.id} style={commentStyles.reply}>
                          <View style={commentStyles.avatarXXS}>
                            {reply.author?.avatar_url ? <Image source={{ uri: reply.author.avatar_url }} style={commentStyles.avatarXXSImg} /> : <User size={10} color={colors.textMuted} />}
                          </View>
                          <View style={commentStyles.body}>
                            <View style={commentStyles.meta}>
                              <Text style={commentStyles.author}>{reply.author?.username || `${reply.author?.wallet_address?.slice(0, 6)}...`}</Text>
                              <Text style={commentStyles.time}>{timeAgo(reply.created_at)}</Text>
                            </View>
                            <Text style={commentStyles.text}>{reply.content}</Text>
                            <View style={commentStyles.actions}>
                              <TouchableOpacity style={commentStyles.actionBtn} onPress={() => handleCommentLike(reply.id)} activeOpacity={0.7}>
                                <Heart size={13} color={reply.liked_by_user ? '#ef4444' : colors.textMuted} fill={reply.liked_by_user ? '#ef4444' : 'none'} strokeWidth={2} />
                                {(reply.likes_count || 0) > 0 && <Text style={[commentStyles.actionText, reply.liked_by_user && { color: '#ef4444' }]}>{reply.likes_count}</Text>}
                              </TouchableOpacity>
                            </View>
                          </View>
                        </View>
                      ))}
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
            {replyingToComment && (
              <View style={commentStyles.replyBanner}>
                <Text style={commentStyles.replyBannerText}>Replying to <Text style={commentStyles.replyBannerName}>{replyingToComment.author?.username || 'user'}</Text></Text>
                <TouchableOpacity onPress={() => setReplyingToComment(null)}><X size={14} color={colors.textMuted} /></TouchableOpacity>
              </View>
            )}
            <View style={commentStyles.inputRow}>
              <TextInput
                style={commentStyles.input}
                placeholder={replyingToComment ? `Reply to ${replyingToComment.author?.username || 'user'}...` : 'Add a comment...'}
                placeholderTextColor={colors.textMuted}
                value={newCommentContent}
                onChangeText={setNewCommentContent}
                maxLength={300}
              />
              <TouchableOpacity
                style={[commentStyles.sendBtn, !newCommentContent.trim() && { opacity: 0.5 }]}
                onPress={handleAddComment}
                disabled={!newCommentContent.trim() || submittingComment}
              >
                {submittingComment ? <ActivityIndicator size="small" color={colors.white} /> : <Send size={15} color={colors.white} />}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const commentStyles = StyleSheet.create({
  item: { flexDirection: 'row', marginBottom: spacing.lg, gap: spacing.md },
  avatarXS: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#1E1E2E', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  avatarXSImg: { width: 28, height: 28, borderRadius: 14 },
  avatarXXS: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#1E1E2E', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  avatarXXSImg: { width: 22, height: 22, borderRadius: 11 },
  body: { flex: 1 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 3 },
  author: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textPrimary },
  time: { fontSize: fontSize.xs, color: colors.textMuted },
  text: { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginTop: 6 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionText: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  reply: { flexDirection: 'row', marginBottom: spacing.md, gap: spacing.md, paddingLeft: 36 },
  replyBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(139,92,246,0.08)', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: 'rgba(139,92,246,0.15)' },
  replyBannerText: { fontSize: 13, color: colors.textMuted },
  replyBannerName: { fontWeight: '700', color: colors.primary },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.surfaceBorder, paddingTop: spacing.md, marginTop: spacing.sm },
  input: { flex: 1, fontSize: fontSize.sm, color: colors.textPrimary, backgroundColor: '#1A1A28', borderRadius: borderRadius.full, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, maxHeight: 80 },
  sendBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
});

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
  bio: { fontSize: fontSize.md, color: colors.textSecondary, lineHeight: 22, paddingHorizontal: spacing.lg, marginBottom: spacing.lg },
  bioPlaceholder: { fontSize: fontSize.md, color: colors.textMuted, lineHeight: 22, paddingHorizontal: spacing.lg, marginBottom: spacing.lg },
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

  // Premium modal
  premiumHeader: { alignItems: 'center', marginBottom: spacing.xl, gap: spacing.sm },
  premiumIconRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  premiumTitle: { fontSize: fontSize.xl, fontWeight: '800', color: colors.textPrimary },
  premiumDesc: { fontSize: fontSize.md, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  premiumTierCard: { backgroundColor: '#1A1A28', borderRadius: borderRadius.md, padding: spacing.lg, borderWidth: 1, borderColor: 'rgba(139,92,246,0.2)', gap: spacing.sm },
  premiumTierLabel: { fontSize: fontSize.md, fontWeight: '700', color: colors.textPrimary },
  premiumTierPrice: { fontSize: fontSize.xl, fontWeight: '800', color: colors.primary },
  premiumPayBtn: { backgroundColor: colors.primary, borderRadius: borderRadius.full, paddingVertical: spacing.md, alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'center', marginTop: spacing.sm },
  premiumPayBtnText: { fontSize: fontSize.md, fontWeight: '700', color: colors.white },
  premiumNote: { fontSize: fontSize.xs, color: colors.textMuted, textAlign: 'center', marginTop: spacing.xl, lineHeight: 18 },
  premiumDoneIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primaryMuted, justifyContent: 'center', alignItems: 'center', marginBottom: spacing.lg, position: 'relative' },
});
