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
import { ArrowLeft, User, Settings, X, Check } from 'lucide-react-native';
import { useWallet } from '@/contexts/WalletContext';
import { SocialService, UserProfile, Post } from '@/services/socialService';
import { colors, spacing, borderRadius, fontSize } from '@/constants/theme';
import PostCard from '@/components/PostCard';

type ProfileTab = 'posts' | 'reposts';

export default function ProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { selectedAccount } = useWallet();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [reposts, setReposts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<ProfileTab>('posts');
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  const [showEditModal, setShowEditModal] = useState(false);
  const [editUsername, setEditUsername] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editAvatarUrl, setEditAvatarUrl] = useState('');
  const [saving, setSaving] = useState(false);

  const isOwnProfile = currentUserProfile?.id === id;

  const loadProfile = useCallback(async () => {
    if (!id) return;
    setLoading(true);

    const [profileData, postsData, repostsData, followers, following] = await Promise.all([
      SocialService.getProfile(id),
      SocialService.getUserPosts(id),
      SocialService.getUserReposts(id),
      SocialService.getFollowerCount(id),
      SocialService.getFollowingCount(id),
    ]);

    setProfile(profileData);
    setPosts(postsData);
    setReposts(repostsData);
    setFollowerCount(followers);
    setFollowingCount(following);

    if (selectedAccount?.address) {
      const me = await SocialService.getOrCreateProfile(selectedAccount.address);
      setCurrentUserProfile(me);
      if (me && me.id !== id) {
        const followState = await SocialService.isFollowing(me.id, id);
        setIsFollowing(followState);
      }
    }

    setLoading(false);
  }, [id, selectedAccount?.address]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

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

  const handleLike = async (postId: string) => {
    if (!currentUserProfile) return;
    await SocialService.toggleLike(postId, currentUserProfile.id);
    await loadProfile();
  };

  const handleRepost = async (postId: string) => {
    if (!currentUserProfile) return;
    await SocialService.toggleRepost(postId, currentUserProfile.id);
    await loadProfile();
  };

  const displayName = profile?.username || `${profile?.wallet_address?.slice(0, 6)}...${profile?.wallet_address?.slice(-4)}`;
  const activePosts = activeTab === 'posts' ? posts : reposts;

  if (loading) {
    return (
      <LinearGradient colors={colors.gradient.primary} style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={colors.gradient.primary} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <ArrowLeft size={24} color={colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        {isOwnProfile ? (
          <TouchableOpacity onPress={openEditModal}>
            <Settings size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 24 }} />
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <View style={styles.profileSection}>
          <View style={styles.avatarLarge}>
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatarLargeImage} />
            ) : (
              <User size={40} color={colors.textMuted} />
            )}
          </View>

          <Text style={styles.displayName}>{displayName}</Text>
          {profile?.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}

          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{posts.length}</Text>
              <Text style={styles.statLabel}>Posts</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>{followerCount}</Text>
              <Text style={styles.statLabel}>Followers</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>{followingCount}</Text>
              <Text style={styles.statLabel}>Following</Text>
            </View>
          </View>

          {!isOwnProfile && currentUserProfile && (
            <TouchableOpacity
              style={[styles.followButton, isFollowing && styles.followingButton]}
              onPress={handleFollow}
              disabled={followLoading}
            >
              {followLoading ? (
                <ActivityIndicator size="small" color={isFollowing ? colors.primary : colors.white} />
              ) : (
                <Text style={[styles.followButtonText, isFollowing && styles.followingButtonText]}>
                  {isFollowing ? 'Following' : 'Follow'}
                </Text>
              )}
            </TouchableOpacity>
          )}

          {profile?.wallet_address && (
            <View style={styles.walletBadge}>
              <Text style={styles.walletAddress} numberOfLines={1} ellipsizeMode="middle">
                {profile.wallet_address}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'posts' && styles.activeTab]}
            onPress={() => setActiveTab('posts')}
          >
            <Text style={[styles.tabText, activeTab === 'posts' && styles.activeTabText]}>Posts</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'reposts' && styles.activeTab]}
            onPress={() => setActiveTab('reposts')}
          >
            <Text style={[styles.tabText, activeTab === 'reposts' && styles.activeTabText]}>Reposts</Text>
          </TouchableOpacity>
        </View>

        {activePosts.length === 0 ? (
          <View style={styles.emptyPosts}>
            <Text style={styles.emptyPostsText}>
              {activeTab === 'posts' ? 'No posts yet' : 'No reposts yet'}
            </Text>
          </View>
        ) : (
          activePosts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              currentProfile={currentUserProfile}
              onLike={handleLike}
              onComment={() => {}}
              onRepost={handleRepost}
              onPromote={() => {}}
            />
          ))
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>

      <Modal visible={showEditModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.modalScroll}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Edit Profile</Text>
                <TouchableOpacity onPress={() => setShowEditModal(false)}>
                  <X size={24} color={colors.textPrimary} />
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

              <TouchableOpacity style={styles.saveButton} onPress={handleSaveProfile} disabled={saving}>
                {saving ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <>
                    <Check size={18} color={colors.white} />
                    <Text style={styles.saveButtonText}>Save Changes</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xxl,
    paddingTop: 56,
    paddingBottom: spacing.lg,
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  profileSection: {
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
    paddingBottom: spacing.xxl,
  },
  avatarLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    marginBottom: spacing.lg,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  avatarLargeImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  displayName: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  bio: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.xxl,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xxl,
    marginBottom: spacing.lg,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  statLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: colors.surfaceBorder,
  },
  followButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxxl,
    borderRadius: borderRadius.full,
    marginBottom: spacing.lg,
    minWidth: 140,
    alignItems: 'center',
  },
  followingButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  followButtonText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.white,
  },
  followingButtonText: {
    color: colors.primary,
  },
  walletBadge: {
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.full,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.lg,
    maxWidth: '80%',
  },
  walletAddress: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontFamily: 'SpaceMono-Regular',
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
    marginBottom: spacing.md,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
  },
  tabText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textMuted,
  },
  activeTabText: {
    color: colors.primary,
  },
  emptyPosts: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyPostsText: {
    fontSize: fontSize.md,
    color: colors.textMuted,
  },
  bottomSpacer: {
    height: 40,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  modalScroll: {
    maxHeight: '85%',
    marginTop: 'auto',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.xxl,
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
    backgroundColor: colors.surfaceLight,
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
  saveButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.xxl,
  },
  saveButtonText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.white,
  },
});
