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
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, MoveHorizontal as MoreHorizontal, Share2, X, Check, Copy, BadgeCheck, User } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { useWallet } from '@/contexts/WalletContext';
import { SocialService, UserProfile, Post } from '@/services/socialService';
import { colors, spacing, borderRadius, fontSize, elevation } from '@/constants/theme';
import PostCard from '@/components/PostCard';

type ProfileTab = 'posts' | 'replies' | 'media' | 'likes';

// Default banner — a purple Pexels space image
const DEFAULT_BANNER = 'https://images.pexels.com/photos/956999/milky-way-starry-sky-night-sky-star-956999.jpeg?auto=compress&cs=tinysrgb&w=800';

export default function ProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { selectedAccount, activeAddress } = useWallet();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<ProfileTab>('posts');
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [copiedAddr, setCopiedAddr] = useState(false);

  const [showEditModal, setShowEditModal] = useState(false);
  const [editUsername, setEditUsername] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editAvatarUrl, setEditAvatarUrl] = useState('');
  const [editBannerUrl, setEditBannerUrl] = useState('');
  const [saving, setSaving] = useState(false);

  const walletAddr = (selectedAccount?.address || activeAddress || '');
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

  const handleFollow = async () => {
    if (!currentUserProfile || !id || isOwnProfile) return;
    setFollowLoading(true);
    const nowFollowing = await SocialService.toggleFollow(currentUserProfile.id, id);
    setIsFollowing(nowFollowing);
    setFollowerCount(prev => nowFollowing ? prev + 1 : Math.max(0, prev - 1));
    setFollowLoading(false);
  };

  const openEditModal = () => {
    if (!profile) return;
    setEditUsername(profile.username || '');
    setEditBio(profile.bio || '');
    setEditAvatarUrl(profile.avatar_url || '');
    setEditBannerUrl((profile as any).banner_url || '');
    setShowEditModal(true);
  };

  const handleSaveProfile = async () => {
    if (!profile) return;
    setSaving(true);
    const updated = await SocialService.updateProfile(profile.id, {
      username: editUsername.trim() || undefined,
      bio: editBio.trim(),
      avatar_url: editAvatarUrl.trim() || undefined,
    });
    if (updated) setProfile(updated);
    setSaving(false);
    setShowEditModal(false);
  };

  const copyAddress = async () => {
    const addr = profile?.wallet_address || walletAddr;
    if (addr) {
      await Clipboard.setStringAsync(addr);
      setCopiedAddr(true);
      setTimeout(() => setCopiedAddr(false), 2000);
    }
  };

  const handleLike = async (postId: string) => {
    if (!currentUserProfile) return;
    setPosts(prev => prev.map(p =>
      p.id === postId ? {
        ...p,
        liked_by_user: !p.liked_by_user,
        likes_count: p.liked_by_user ? Math.max(0, (p.likes_count || 0) - 1) : (p.likes_count || 0) + 1,
      } : p
    ));
    await SocialService.toggleLike(postId, currentUserProfile.id);
  };

  const handleRepost = async (postId: string) => {
    if (!currentUserProfile) return;
    await SocialService.toggleRepost(postId, currentUserProfile.id);
    await loadProfile();
  };

  const displayName = profile?.username
    || (profile?.wallet_address ? `${profile.wallet_address.slice(0, 6)}...${profile.wallet_address.slice(-4)}` : 'Unknown');

  const shortAddr = profile?.wallet_address
    ? `${profile.wallet_address.slice(0, 4)}...${profile.wallet_address.slice(-4)}`
    : '';

  const bannerUrl = (profile as any)?.banner_url || DEFAULT_BANNER;

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
          {/* Dark overlay for readability */}
          <LinearGradient
            colors={['transparent', 'rgba(10,10,15,0.4)']}
            style={StyleSheet.absoluteFill}
          />
        </View>

        {/* Avatar overlapping banner + username row */}
        <View style={styles.profileTopRow}>
          <View style={styles.avatarWrap}>
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <User size={36} color={colors.textMuted} />
              </View>
            )}
          </View>

          <View style={styles.profileTitleBlock}>
            <View style={styles.nameVerifiedRow}>
              <Text style={styles.displayName}>{displayName}</Text>
              {profile?.is_verified && (
                <BadgeCheck size={18} color={colors.primary} fill={colors.primary} strokeWidth={0} />
              )}
            </View>
            <Text style={styles.handle}>@{profile?.username?.toLowerCase() || displayName.toLowerCase().replace(/\s/g, '')}</Text>
          </View>

          <TouchableOpacity style={styles.shareBtn} activeOpacity={0.8}>
            <Share2 size={18} color={colors.textPrimary} strokeWidth={2} />
          </TouchableOpacity>
        </View>

        {/* Wallet address chip */}
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

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{formatCount(posts.length)}</Text>
            <Text style={styles.statLabel}>Posts</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>{formatCount(followerCount)}</Text>
            <Text style={styles.statLabel}>Followers</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>{formatCount(followingCount)}</Text>
            <Text style={styles.statLabel}>Following</Text>
          </View>
        </View>

        {/* CTA button */}
        {isOwnProfile ? (
          <TouchableOpacity style={styles.editProfileBtn} onPress={openEditModal} activeOpacity={0.85}>
            <Text style={styles.editProfileBtnText}>Edit Profile</Text>
          </TouchableOpacity>
        ) : currentUserProfile ? (
          <TouchableOpacity
            style={[styles.editProfileBtn, isFollowing && styles.followingBtn]}
            onPress={handleFollow}
            disabled={followLoading}
            activeOpacity={0.85}
          >
            {followLoading
              ? <ActivityIndicator size="small" color={isFollowing ? colors.primary : colors.white} />
              : <Text style={[styles.editProfileBtnText, isFollowing && styles.followingBtnText]}>
                  {isFollowing ? 'Following' : 'Follow'}
                </Text>
            }
          </TouchableOpacity>
        ) : null}

        {/* Profile tabs */}
        <View style={styles.tabBar}>
          {PROFILE_TABS.map(tab => (
            <TouchableOpacity
              key={tab.key}
              style={styles.tab}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                {tab.label}
              </Text>
              {activeTab === tab.key && <View style={styles.tabUnderline} />}
            </TouchableOpacity>
          ))}
        </View>

        {/* Posts */}
        {activeTab === 'posts' && (
          posts.length === 0 ? (
            <View style={styles.emptyPosts}>
              <Text style={styles.emptyPostsText}>No posts yet</Text>
            </View>
          ) : (
            <View style={{ paddingTop: spacing.sm }}>
              {posts.map(post => (
                <PostCard
                  key={post.id}
                  post={post}
                  currentProfile={currentUserProfile}
                  onLike={handleLike}
                  onComment={() => {}}
                  onRepost={handleRepost}
                  onPromote={() => {}}
                />
              ))}
            </View>
          )
        )}

        {activeTab !== 'posts' && (
          <View style={styles.emptyPosts}>
            <Text style={styles.emptyPostsText}>No content yet</Text>
          </View>
        )}

        <View style={{ height: 80 }} />
      </ScrollView>

      {/* Edit Profile Modal */}
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

              <Text style={styles.editLabel}>Avatar URL</Text>
              <TextInput
                style={styles.editInput}
                placeholder="https://example.com/avatar.jpg"
                placeholderTextColor={colors.textMuted}
                value={editAvatarUrl}
                onChangeText={setEditAvatarUrl}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {editAvatarUrl.trim() ? (
                <View style={styles.avatarPreviewWrap}>
                  <Image source={{ uri: editAvatarUrl.trim() }} style={styles.avatarPreview} />
                </View>
              ) : null}

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
                  : <>
                      <Check size={17} color={colors.white} />
                      <Text style={styles.saveBtnText}>Save Changes</Text>
                    </>
                }
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0A0A0F',
  },
  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: 54,
    paddingBottom: spacing.md,
    backgroundColor: '#0A0A0F',
    zIndex: 10,
  },
  topBarBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBarTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  // Banner
  bannerWrap: {
    width: '100%',
    height: 160,
    backgroundColor: '#1A0B2E',
    overflow: 'hidden',
  },
  banner: {
    width: '100%',
    height: '100%',
  },
  // Profile top row: avatar + name + share
  profileTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.lg,
    marginTop: -36,
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  avatarWrap: {
    borderRadius: 44,
    borderWidth: 3,
    borderColor: '#0A0A0F',
    overflow: 'hidden',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#1A1A28',
  },
  avatarFallback: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#1A1A28',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileTitleBlock: {
    flex: 1,
    paddingBottom: 4,
  },
  nameVerifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  displayName: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  handle: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.textMuted,
    marginTop: 2,
  },
  shareBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1A1A28',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 4,
  },
  // Address chip
  addrChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    backgroundColor: '#1A1A28',
    borderRadius: borderRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  addrChipText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
    fontFamily: 'SpaceMono-Regular',
  },
  // Bio
  bio: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    lineHeight: 22,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  bioPlaceholder: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    lineHeight: 22,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  // Stats
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    gap: 0,
  },
  stat: {
    flex: 1,
  },
  statValue: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  statLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
    fontWeight: '500',
  },
  statDivider: {
    width: 1,
    height: 36,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginHorizontal: spacing.lg,
  },
  // Edit / Follow button
  editProfileBtn: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.xl,
    backgroundColor: '#1A1A28',
    borderRadius: borderRadius.full,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  editProfileBtnText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  followingBtn: {
    backgroundColor: 'transparent',
    borderColor: colors.primary,
  },
  followingBtnText: {
    color: colors.primary,
  },
  // Tabs
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    marginBottom: spacing.xs,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    position: 'relative',
  },
  tabText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.primary,
  },
  tabUnderline: {
    position: 'absolute',
    bottom: 0,
    left: '20%',
    right: '20%',
    height: 2,
    backgroundColor: colors.primary,
    borderRadius: 1,
  },
  // Posts
  emptyPosts: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyPostsText: {
    fontSize: fontSize.md,
    color: colors.textMuted,
  },
  // Edit modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  modalScroll: {
    maxHeight: '90%',
  },
  modalSheet: {
    backgroundColor: '#12121A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.xxl,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#2A2A3A',
    alignSelf: 'center',
    marginBottom: spacing.lg,
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
  editLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  editInput: {
    backgroundColor: '#1A1A28',
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    fontSize: fontSize.md,
    color: colors.textPrimary,
  },
  editBioInput: {
    minHeight: 80,
  },
  editCharCount: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textAlign: 'right',
    marginTop: spacing.xs,
  },
  avatarPreviewWrap: {
    alignItems: 'center',
    marginTop: spacing.md,
  },
  avatarPreview: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  saveBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.xxl,
    marginBottom: spacing.xxl,
  },
  saveBtnText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.white,
  },
});
