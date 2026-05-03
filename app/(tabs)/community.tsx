import { useState, useEffect, useCallback, useRef } from 'react';
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
  Alert,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Send, X, User, ImagePlus, MessageCircle, Check, CircleAlert, Wallet, Bell, Clock, Plus, Search, Heart, MessageSquare, UserPlus, AtSign, Repeat2, SlidersHorizontal, Trash2, Globe, Mail, Zap } from 'lucide-react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useWallet } from '@/contexts/WalletContext';
import { TransactionManager } from '@/lib/wallet/TransactionManager';
import { SocialService, Post, PostComment, PROMOTE_TIERS, Notification, Conversation, UserProfile } from '@/services/socialService';
import { SolanaPriceService } from '@/services/solana/priceService';
import { useProfile } from '@/contexts/ProfileContext';
import { colors, spacing, borderRadius, fontSize, elevation } from '@/constants/theme';
import PostCard, { timeAgo } from '@/components/PostCard';
import VerificationBadge from '@/components/VerificationBadge';

type TopTab = 'feed' | 'profile' | 'messages' | 'notifications';
type PromoteStep = 'select' | 'confirm' | 'processing' | 'done';

export default function CommunityScreen() {
  const router = useRouter();
  const { activeAddress } = useWallet();
  const { profile, refreshProfile, clearUnreadNotifCount } = useProfile();
  const [activeTab, setActiveTab] = useState<TopTab>('feed');
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPostContent, setNewPostContent] = useState('');
  const [newPostImageUrl, setNewPostImageUrl] = useState('');
  const [posting, setPosting] = useState(false);

  const [showPromoteModal, setShowPromoteModal] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [promoteStep, setPromoteStep] = useState<PromoteStep>('select');
  const [selectedTierKey, setSelectedTierKey] = useState<string | null>('1h');
  const [promotePayWith, setPromotePayWith] = useState<'SOL' | 'DTEST'>('SOL');
  // DTEST token mint address (placeholder — replace with real mint when deployed)
  const DTEST_MINT = 'So11111111111111111111111111111111111111112';

  const [showCommentsModal, setShowCommentsModal] = useState(false);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [newCommentContent, setNewCommentContent] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [replyingToComment, setReplyingToComment] = useState<PostComment | null>(null);
  const commentInputRef = useRef<any>(null);

  // Messages state
  const [msgSearch, setMsgSearch] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [convsLoading, setConvsLoading] = useState(false);

  // Compose new message
  const [showComposeModal, setShowComposeModal] = useState(false);
  const [composeSearch, setComposeSearch] = useState('');
  const [composeResults, setComposeResults] = useState<any[]>([]);
  const [composeSearching, setComposeSearching] = useState(false);

  // Profile tab posts
  const [profilePosts, setProfilePosts] = useState<Post[]>([]);
  const [profilePostsLoading, setProfilePostsLoading] = useState(false);
  const [profileFollowers, setProfileFollowers] = useState(0);
  const [profileFollowing, setProfileFollowing] = useState(0);

  // Notifications state
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifFilter, setNotifFilter] = useState<'all' | 'like' | 'comment' | 'mention' | 'follow' | 'repost'>('all');
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);

  // Delete confirmation
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // SOL/USD price for promotion tier conversion
  const [solUsdPrice, setSolUsdPrice] = useState<number>(0);
  useEffect(() => {
    const svc = new SolanaPriceService();
    svc.getSOLPrice().then(p => { if (p > 0) setSolUsdPrice(p); }).catch(() => {});
  }, []);
  const usdToSol = (usd: number) => solUsdPrice > 0 ? (usd / solUsdPrice) : 0;

  // Timestamp set when notifications are cleared — hides older notifications locally
  const [notifClearedAt, setNotifClearedAt] = useState<string | null>(null);

  // Animated globe for feed tab icon
  const feedGlobeRotate = useRef(new Animated.Value(0)).current;
  const feedGlobeGlow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.timing(feedGlobeRotate, { toValue: 1, duration: 6000, useNativeDriver: true })).start();
    Animated.loop(Animated.sequence([
      Animated.timing(feedGlobeGlow, { toValue: 1, duration: 1500, useNativeDriver: true }),
      Animated.timing(feedGlobeGlow, { toValue: 0, duration: 1500, useNativeDriver: true }),
    ])).start();
  }, []);

  // Followers / Following list modal
  const [followListType, setFollowListType] = useState<'followers' | 'following' | null>(null);
  const [followListUsers, setFollowListUsers] = useState<UserProfile[]>([]);
  const [followListLoading, setFollowListLoading] = useState(false);

  // @mention dropdown
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionResults, setMentionResults] = useState<any[]>([]);
  const [mentionLoading, setMentionLoading] = useState(false);

  // Merges fresh feed data while preserving any optimistic liked/reposted state
  // that may not yet be reflected in the DB (sub-second race window).
  const mergeFeedState = (fresh: Post[], existing: Post[]): Post[] => {
    const existingMap = new Map(existing.map(p => [p.id, p]));
    return fresh.map(p => {
      const prev = existingMap.get(p.id);
      if (!prev) return p;
      // Keep optimistic state only if the DB value is still 0/false and the user
      // has already toggled it in this session (prev has the toggled value).
      return {
        ...p,
        liked_by_user: p.liked_by_user || prev.liked_by_user,
        reposted_by_user: p.reposted_by_user || prev.reposted_by_user,
      };
    });
  };

  const loadFeed = useCallback(async () => {
    try {
      const feedData = await SocialService.getFeed(profile?.id);
      setPosts(prev => mergeFeedState(feedData, prev));
    } catch (e) {
      console.warn('[Community] loadFeed error:', e);
    }
  }, [profile?.id]);

  const loadNotifications = useCallback(async () => {
    if (!profile?.id) return;
    setNotifLoading(true);
    try {
      const data = await SocialService.getNotifications(profile.id);
      setNotifications(data);
      // Unread count respects the cleared timestamp
      const clearedAt = notifClearedAt;
      const visible = clearedAt
        ? data.filter(n => new Date(n.created_at) > new Date(clearedAt))
        : data;
      setUnreadNotifCount(visible.filter(n => !n.read).length);
    } catch (e) {
      console.warn('[Community] loadNotifications error:', e);
    } finally {
      setNotifLoading(false);
    }
  }, [profile?.id, notifClearedAt]);

  const loadConversations = useCallback(async () => {
    if (!profile?.id) return;
    setConvsLoading(true);
    try {
      const data = await SocialService.getConversations(profile.id);
      setConversations(data);
    } catch (e) {
      console.warn('[Community] loadConversations error:', e);
    } finally {
      setConvsLoading(false);
    }
  }, [profile?.id]);

  const profileIdRef = useRef<string | undefined>(undefined);

  const loadInitialFeed = useCallback(async () => {
    // Only show the spinner on truly first load (no posts yet)
    const isFirstLoad = profileIdRef.current === undefined;
    if (isFirstLoad) setLoading(true);
    profileIdRef.current = profile?.id;
    try {
      const feedData = await SocialService.getFeed(profile?.id);
      // On first load replace; on subsequent reloads (profile just became ready) merge to preserve optimistic state
      if (isFirstLoad) {
        setPosts(feedData);
      } else {
        setPosts(prev => mergeFeedState(feedData, prev));
      }
    } catch (e) {
      console.warn('[Community] loadInitialFeed error:', e);
    } finally {
      if (isFirstLoad) setLoading(false);
    }
  }, [profile?.id]);

  useEffect(() => { loadInitialFeed(); }, [loadInitialFeed]);

  // Reload feed + conversations when screen regains focus (e.g. after returning from chat/profile)
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  useFocusEffect(
    useCallback(() => {
      if (activeTabRef.current === 'messages' && profile?.id) {
        loadConversations();
      }
      // Silent feed reload to restore liked/reposted state after navigation
      if (profile?.id) {
        loadFeed();
      }
    }, [profile?.id, loadConversations, loadFeed])
  );

  useEffect(() => {
    if (activeTab === 'notifications') { loadNotifications(); clearUnreadNotifCount(); }
    if (activeTab === 'messages') loadConversations();
    if (activeTab === 'profile' && profile?.id) {
      setProfilePostsLoading(true);
      Promise.all([
        SocialService.getUserPosts(profile.id, profile.id),
        SocialService.getFollowerCount(profile.id),
        SocialService.getFollowingCount(profile.id),
      ]).then(([posts, followers, following]) => {
        setProfilePosts(posts);
        setProfileFollowers(followers);
        setProfileFollowing(following);
      }).finally(() => setProfilePostsLoading(false));
    }
  }, [activeTab, loadNotifications, loadConversations, profile?.id]);

  const handleComposeSearch = async (q: string) => {
    setComposeSearch(q);
    if (!q.trim()) { setComposeResults([]); return; }
    setComposeSearching(true);
    try {
      const results = await SocialService.searchUsers(q.trim());
      setComposeResults(results.filter((u: any) => u.id !== profile?.id));
    } finally {
      setComposeSearching(false);
    }
  };

  // Handle @mention in comment input
  const handleCommentTextChange = async (text: string) => {
    setNewCommentContent(text);
    const match = text.match(/@(\w*)$/);
    if (match) {
      const q = match[1];
      setMentionQuery(q);
      if (q.length >= 1) {
        setMentionLoading(true);
        try {
          const results = await SocialService.searchUsers(q);
          setMentionResults(results.slice(0, 6));
        } catch {
          setMentionResults([]);
        } finally {
          setMentionLoading(false);
        }
      } else {
        setMentionResults([]);
      }
    } else {
      setMentionQuery('');
      setMentionResults([]);
    }
  };

  const insertMention = (username: string) => {
    const text = newCommentContent.replace(/@(\w*)$/, `@${username} `);
    setNewCommentContent(text);
    setMentionResults([]);
    setMentionQuery('');
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadFeed();
    if (activeTab === 'notifications') await loadNotifications();
    if (activeTab === 'messages') await loadConversations();
    setRefreshing(false);
  };

  const handleCreatePost = async () => {
    if (!newPostContent.trim() || !profile) return;
    setPosting(true);
    try {
      const imageUrl = newPostImageUrl.trim() || undefined;
      await SocialService.createPost(profile.id, newPostContent.trim(), {
        mediaUrl: imageUrl,
      });
      setNewPostContent('');
      setNewPostImageUrl('');
      setShowCreateModal(false);
      await loadFeed();
    } catch (e) {
      console.warn('[Community] createPost error:', e);
    } finally {
      setPosting(false);
    }
  };

  const togglePostLikeState = (list: Post[], postId: string): Post[] =>
    list.map(p => p.id === postId ? {
      ...p,
      liked_by_user: !p.liked_by_user,
      likes_count: p.liked_by_user ? Math.max(0, (p.likes_count || 0) - 1) : (p.likes_count || 0) + 1,
    } : p);

  const togglePostRepostState = (list: Post[], postId: string): Post[] =>
    list.map(p => p.id === postId ? {
      ...p,
      reposted_by_user: !p.reposted_by_user,
      reposts_count: p.reposted_by_user ? Math.max(0, (p.reposts_count || 0) - 1) : (p.reposts_count || 0) + 1,
    } : p);

  const handleLike = async (postId: string) => {
    if (!profile) return;
    setPosts(prev => togglePostLikeState(prev, postId));
    setProfilePosts(prev => togglePostLikeState(prev, postId));
    await SocialService.toggleLike(postId, profile.id);
  };

  const handleRepost = async (postId: string) => {
    if (!profile) return;
    setPosts(prev => togglePostRepostState(prev, postId));
    setProfilePosts(prev => togglePostRepostState(prev, postId));
    await SocialService.toggleRepost(postId, profile.id);
  };

  const requestDeletePost = (postId: string) => {
    setDeleteConfirmId(postId);
  };

  const confirmDeletePost = async () => {
    if (!profile || !deleteConfirmId) return;
    setDeleting(true);
    try {
      await SocialService.deletePostFull(deleteConfirmId, profile.id);
      setPosts(prev => prev.filter(p => p.id !== deleteConfirmId));
      setProfilePosts(prev => prev.filter(p => p.id !== deleteConfirmId));
    } catch (e) {
      console.warn('[Community] deletePost error:', e);
    } finally {
      setDeleting(false);
      setDeleteConfirmId(null);
    }
  };

  const openPromoteModal = (postId: string) => {
    setSelectedPostId(postId);
    setPromoteStep('select');
    setSelectedTierKey('1h');
    setPromotePayWith('SOL');
    setShowPromoteModal(true);
  };

  const handleSelectTier = (tierKey: string) => {
    setSelectedTierKey(tierKey);
  };

  // DAWEN treasury — receives promotion SOL payments
  const DAWEN_TREASURY = 'DawEn7h3sMhW5RjNfUeDmPT5yVFiRgXwemRZy2f8DrUq';

  const handleConfirmPromotion = async () => {
    if (!selectedTierKey || !selectedPostId || !profile) return;
    const tier = PROMOTE_TIERS.find(t => t.key === selectedTierKey);
    if (!tier) return;

    const usdPrice = (tier as any).usdPrice as number;
    const solAmount = usdToSol(usdPrice);
    setPromoteStep('processing');
    try {
      const txManager = TransactionManager.getInstance();
      let result;
      if (promotePayWith === 'SOL') {
        result = await txManager.sendTransaction({
          blockchain: 'solana',
          to: DAWEN_TREASURY,
          amount: solAmount > 0 ? solAmount.toFixed(6) : '0.001',
          accountIndex: 0,
        });
      } else {
        // DTEST SPL token payment
        result = await txManager.sendTransaction({
          blockchain: 'solana',
          to: DAWEN_TREASURY,
          amount: usdPrice.toFixed(6),
          tokenMint: DTEST_MINT,
          accountIndex: 0,
        });
      }

      if (!result.success) {
        throw new Error(result.error || 'Transaction failed');
      }

      await SocialService.promotePost(selectedPostId, tier.key);
      setPosts(prev => prev.map(p =>
        p.id === selectedPostId ? { ...p, is_promoted: true, promoted_tier: tier.key } : p
      ));
      setPromoteStep('done');
    } catch (err: any) {
      setPromoteStep('select');
      Alert.alert('Payment Failed', err?.message || 'Could not complete payment. Make sure your wallet is unlocked and has sufficient balance.');
    }
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
    try {
      setComments(await SocialService.getComments(postId, profile?.id));
    } catch (e) {
      console.warn('[Community] getComments error:', e);
      setComments([]);
    } finally {
      setCommentsLoading(false);
    }
  };

  const handleAddComment = async () => {
    if (!newCommentContent.trim() || !profile || !selectedPostId || submittingComment) return;
    const commentText = newCommentContent.trim();
    // Capture parentId BEFORE clearing state
    const parentId = replyingToComment?.id ?? undefined;
    const savedReplyTarget = replyingToComment;

    setSubmittingComment(true);
    setNewCommentContent('');
    setReplyingToComment(null);
    try {
      const result = await SocialService.addComment(selectedPostId, profile.id, commentText, parentId);
      if (!result) throw new Error('Comment insert returned null');
      const updated = await SocialService.getComments(selectedPostId, profile.id);
      setComments(updated);
      // Only increment count for top-level comments (replies don't increment post comment count)
      if (!parentId) {
        const increment = (list: Post[]) => list.map(p =>
          p.id === selectedPostId ? { ...p, comments_count: (p.comments_count || 0) + 1 } : p
        );
        setPosts(increment);
        setProfilePosts(increment);
      }
    } catch (e) {
      console.warn('[Community] addComment error:', e);
      // Restore input state on failure so user doesn't lose their reply
      setNewCommentContent(commentText);
      setReplyingToComment(savedReplyTarget);
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleCommentLike = async (commentId: string) => {
    if (!profile) return;
    setComments(prev => prev.map(c => {
      if (c.id === commentId) {
        return {
          ...c,
          liked_by_user: !c.liked_by_user,
          likes_count: c.liked_by_user ? Math.max(0, (c.likes_count || 0) - 1) : (c.likes_count || 0) + 1,
        };
      }
      return {
        ...c,
        replies: (c.replies || []).map(r =>
          r.id === commentId
            ? { ...r, liked_by_user: !r.liked_by_user, likes_count: r.liked_by_user ? Math.max(0, (r.likes_count || 0) - 1) : (r.likes_count || 0) + 1 }
            : r
        ),
      };
    }));
    await SocialService.toggleCommentLike(commentId, profile.id);
  };

  const closeCommentsModal = () => {
    setShowCommentsModal(false);
    setSelectedPostId(null);
    setComments([]);
    setNewCommentContent('');
    setReplyingToComment(null);
  };

  const handleMarkNotifsRead = async () => {
    if (!profile?.id) return;
    await SocialService.markNotificationsRead(profile.id);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadNotifCount(0);
  };

  const openFollowList = async (type: 'followers' | 'following') => {
    if (!profile?.id) return;
    setFollowListType(type);
    setFollowListLoading(true);
    setFollowListUsers([]);
    try {
      const users = type === 'followers'
        ? await SocialService.getFollowers(profile.id)
        : await SocialService.getFollowing(profile.id);
      setFollowListUsers(users);
    } catch (e) {
      console.warn('[Community] followList error:', e);
    } finally {
      setFollowListLoading(false);
    }
  };

  const handleClearAllNotifs = async () => {
    if (!profile?.id) return;
    const clearedAt = new Date().toISOString();
    setNotifClearedAt(clearedAt);
    setNotifications([]);
    setUnreadNotifCount(0);
    await SocialService.clearAllNotifications(profile.id);
  };

  const handleNotifPress = (notif: Notification) => {
    if (!notif.read) {
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read: true } : n));
      setUnreadNotifCount(prev => Math.max(0, prev - 1));
    }
    if (notif.type === 'follow' && notif.actor?.id) {
      router.push(`/profile/${notif.actor.id}` as any);
    } else if (notif.post_id && (notif.type === 'like' || notif.type === 'comment' || notif.type === 'repost' || notif.type === 'mention')) {
      openCommentsModal(notif.post_id);
    } else if (notif.type === 'message' && notif.actor?.id) {
      router.push(`/chat/${notif.actor.id}` as any);
    }
  };

  const selectedPost = selectedPostId
    ? (posts.find(p => p.id === selectedPostId) || profilePosts.find(p => p.id === selectedPostId) || null)
    : null;
  const selectedTier = PROMOTE_TIERS.find(t => t.key === selectedTierKey);

  // Top tabs — icon-based
  const TOP_TABS: { key: TopTab }[] = [
    { key: 'feed' },
    { key: 'profile' },
    { key: 'messages' },
    { key: 'notifications' },
  ];

  const renderFeedTab = () => {
    if (loading) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      );
    }

    return (
      <FlatList
        data={posts}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <PostCard
            post={item}
            currentProfile={profile}
            onLike={handleLike}
            onComment={openCommentsModal}
            onRepost={handleRepost}
            onPromote={item.author_id === profile?.id ? openPromoteModal : undefined}
            onDelete={item.author_id === profile?.id ? requestDeletePost : undefined}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIconWrap}>
              <MessageCircle size={44} color={colors.primary} strokeWidth={1.5} />
            </View>
            <Text style={styles.emptyTitle}>No posts yet</Text>
            <Text style={styles.emptySubtitle}>Be the first to share your thoughts</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push('/create-post')}>
              <Text style={styles.emptyBtnText}>Create First Post</Text>
            </TouchableOpacity>
          </View>
        }
        contentContainerStyle={posts.length === 0 ? styles.emptyList : styles.feedList}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      />
    );
  };

  const renderProfileTab = () => {
    if (!profile) {
      return (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconWrap}>
            <User size={44} color={colors.primary} strokeWidth={1.5} />
          </View>
          <Text style={styles.emptyTitle}>No Profile</Text>
          <Text style={styles.emptySubtitle}>Connect a wallet to create your profile</Text>
          <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push('/onboarding' as any)}>
            <Text style={styles.emptyBtnText}>Connect Wallet</Text>
          </TouchableOpacity>
        </View>
      );
    }

    const displayName = profile.username
      || (activeAddress ? `${activeAddress.slice(0, 6)}...${activeAddress.slice(-4)}` : null)
      || (profile.wallet_address ? `${profile.wallet_address.slice(0, 6)}...${profile.wallet_address.slice(-4)}` : 'Wallet');

    return (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Profile card */}
        <View style={styles.profileCard}>
          <View style={styles.profileCardTop}>
            <View style={styles.profileAvatarLg}>
              {profile.avatar_url
                ? <Image source={{ uri: profile.avatar_url }} style={styles.profileAvatarLgImg} />
                : <View style={styles.profileAvatarLgFallback}><User size={36} color={colors.textMuted} /></View>
              }
            </View>
            <View style={styles.profileCardInfo}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                <Text style={styles.profileCardName} numberOfLines={1}>{displayName}</Text>
                {(profile.is_verified || (profile as any).verified_basic || (profile as any).premium_expiration) && (
                  <VerificationBadge profile={profile as any} size="sm" />
                )}
              </View>
              {profile.wallet_address ? (
                <Text style={styles.profileCardAddr} numberOfLines={1}>
                  {profile.wallet_address.slice(0, 6)}...{profile.wallet_address.slice(-4)}
                </Text>
              ) : null}
              {profile.bio ? (
                <Text style={styles.profileCardBio} numberOfLines={2}>{profile.bio}</Text>
              ) : null}
            </View>
          </View>

          <View style={styles.profileCardStats}>
            <View style={styles.profileCardStat}>
              <Text style={styles.profileCardStatValue}>{profilePosts.length}</Text>
              <Text style={styles.profileCardStatLabel}>Posts</Text>
            </View>
            <View style={styles.profileCardStatDivider} />
            <TouchableOpacity style={styles.profileCardStat} onPress={() => openFollowList('followers')} activeOpacity={0.7}>
              <Text style={styles.profileCardStatValue}>{profileFollowers}</Text>
              <Text style={[styles.profileCardStatLabel, styles.statLabelTappable]}>Followers</Text>
            </TouchableOpacity>
            <View style={styles.profileCardStatDivider} />
            <TouchableOpacity style={styles.profileCardStat} onPress={() => openFollowList('following')} activeOpacity={0.7}>
              <Text style={styles.profileCardStatValue}>{profileFollowing}</Text>
              <Text style={[styles.profileCardStatLabel, styles.statLabelTappable]}>Following</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.viewFullProfileBtn}
            onPress={() => router.push(`/profile/${profile.id}` as any)}
            activeOpacity={0.85}
          >
            <Text style={styles.viewFullProfileBtnText}>View Full Profile</Text>
          </TouchableOpacity>
        </View>

        {/* My posts section */}
        <View style={styles.profileSectionHeader}>
          <Text style={styles.profileSectionTitle}>My Posts</Text>
        </View>

        {profilePostsLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
        ) : profilePosts.length === 0 ? (
          <View style={{ alignItems: 'center', paddingTop: 32, gap: 12 }}>
            <Text style={{ color: colors.textMuted, fontSize: fontSize.md }}>No posts yet</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push('/create-post' as any)}>
              <Text style={styles.emptyBtnText}>Create Post</Text>
            </TouchableOpacity>
          </View>
        ) : (
          profilePosts.map(post => (
            <PostCard
              key={post.id}
              post={post}
              currentProfile={profile}
              onLike={handleLike}
              onComment={openCommentsModal}
              onRepost={handleRepost}
              onPromote={openPromoteModal}
              onDelete={requestDeletePost}
            />
          ))
        )}
      </ScrollView>
    );
  };

  const filteredConvos = conversations.filter(c => {
    const name = c.otherUser.username || c.otherUser.wallet_address || '';
    const msg = c.lastMessage.content || '';
    const q = msgSearch.toLowerCase();
    return name.toLowerCase().includes(q) || msg.toLowerCase().includes(q);
  });

  const renderMessagesTab = () => (
    <ScrollView style={styles.msgContainer} contentContainerStyle={styles.msgContent} showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      {/* Search */}
      <View style={styles.msgSearchWrap}>
        <Search size={17} color={colors.textMuted} strokeWidth={2} />
        <TextInput
          style={styles.msgSearchInput}
          placeholder="Search messages"
          placeholderTextColor={colors.textMuted}
          value={msgSearch}
          onChangeText={setMsgSearch}
        />
      </View>

      {convsLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : filteredConvos.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconWrap}>
            <MessageSquare size={44} color={colors.primary} strokeWidth={1.5} />
          </View>
          <Text style={styles.emptyTitle}>No messages yet</Text>
          <Text style={styles.emptySubtitle}>Start a conversation by visiting someone's profile</Text>
        </View>
      ) : (
        /* Conversation list */
        <View style={styles.msgList}>
          {filteredConvos.map((conv, idx) => {
            const otherUser = conv.otherUser;
            const displayName = otherUser.username || `${otherUser.wallet_address?.slice(0, 6)}...`;
            const msgTime = timeAgo(conv.lastMessage.created_at);
            return (
              <TouchableOpacity
                key={otherUser.id}
                style={[styles.convRow, idx < filteredConvos.length - 1 && styles.convRowBorder]}
                activeOpacity={0.75}
                onPress={() => router.push(`/chat/${otherUser.id}` as any)}
              >
                <View style={styles.convAvatarWrap}>
                  {otherUser.avatar_url
                    ? <Image source={{ uri: otherUser.avatar_url }} style={styles.convAvatar} />
                    : <View style={[styles.convAvatar, styles.convAvatarFallback]}><User size={22} color={colors.textMuted} /></View>
                  }
                </View>
                <View style={styles.convBody}>
                  <View style={styles.convNameRow}>
                    <Text style={styles.convUsername}>{displayName}</Text>
                    <VerificationBadge profile={otherUser} size="sm" />
                  </View>
                  {otherUser.username && otherUser.wallet_address ? (
                    <Text style={{ fontSize: 10, color: colors.textMuted, fontFamily: 'SpaceMono-Regular', marginBottom: 1 }}>
                      {otherUser.wallet_address.slice(0, 4)}...{otherUser.wallet_address.slice(-4)}
                    </Text>
                  ) : null}
                  <Text style={styles.convLastMsg} numberOfLines={1}>{conv.lastMessage.content}</Text>
                </View>
                <View style={styles.convMeta}>
                  <Text style={styles.convTime}>{msgTime}</Text>
                  {conv.unreadCount > 0 && <View style={styles.unreadDot} />}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </ScrollView>
  );

  const NOTIF_TABS = [
    { key: 'all', label: 'All' },
    { key: 'like', label: 'Likes' },
    { key: 'comment', label: 'Comments' },
    { key: 'follow', label: 'Follows' },
    { key: 'repost', label: 'Reposts' },
  ] as const;

  const filteredNotifs = notifications.filter(n => {
    if (notifClearedAt && new Date(n.created_at) <= new Date(notifClearedAt)) return false;
    if (notifFilter === 'all') return true;
    return n.type === notifFilter;
  });

  const NotifIcon = ({ type }: { type: string }) => {
    if (type === 'like') return <Heart size={18} color="#ef4444" fill="#ef4444" />;
    if (type === 'comment') return <MessageSquare size={18} color={colors.primary} strokeWidth={2} />;
    if (type === 'follow') return <UserPlus size={18} color={colors.primary} strokeWidth={2} />;
    if (type === 'mention') return <AtSign size={18} color={colors.primary} strokeWidth={2} />;
    if (type === 'repost') return <Repeat2 size={18} color={colors.primary} strokeWidth={2} />;
    if (type === 'message') return <MessageSquare size={18} color={colors.primary} strokeWidth={2} />;
    return <Bell size={18} color={colors.primary} />;
  };

  const renderNotificationsTab = () => (
    <ScrollView style={styles.notifContainer} contentContainerStyle={styles.notifContent} showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      {/* Filter tabs + actions */}
      <View style={styles.notifHeader}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.notifFilterScroll} contentContainerStyle={styles.notifFilterRow}>
          {NOTIF_TABS.map(tab => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.notifFilterTab, notifFilter === tab.key && styles.notifFilterTabActive]}
              onPress={() => setNotifFilter(tab.key)}
              activeOpacity={0.8}
            >
              <Text style={[styles.notifFilterText, notifFilter === tab.key && styles.notifFilterTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <View style={styles.notifActions}>
          {unreadNotifCount > 0 && (
            <TouchableOpacity onPress={handleMarkNotifsRead} style={styles.markReadBtn}>
              <Text style={styles.markReadText}>Read all</Text>
            </TouchableOpacity>
          )}
          {notifications.length > 0 && (
            <TouchableOpacity onPress={handleClearAllNotifs} style={styles.markReadBtn}>
              <Text style={[styles.markReadText, { color: '#ef4444' }]}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {notifLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : filteredNotifs.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconWrap}>
            <Bell size={44} color={colors.primary} strokeWidth={1.5} />
          </View>
          <Text style={styles.emptyTitle}>No notifications yet</Text>
          <Text style={styles.emptySubtitle}>Activity from others will appear here</Text>
        </View>
      ) : (
        /* Notification items */
        <View style={styles.notifList}>
          {filteredNotifs.map((notif, idx) => {
            const actorName = notif.actor?.username
              || (notif.actor?.wallet_address
                ? `${notif.actor.wallet_address.slice(0, 6)}...${notif.actor.wallet_address.slice(-4)}`
                : 'Someone');
            return (
          <TouchableOpacity key={notif.id} style={[styles.notifRow, idx < filteredNotifs.length - 1 && styles.notifRowBorder,
            !notif.read && styles.notifRowUnread]} activeOpacity={0.75} onPress={() => handleNotifPress(notif)}>
            <View style={styles.notifIconWrap}>
              <NotifIcon type={notif.type} />
            </View>
            {notif.actor?.avatar_url
              ? <Image source={{ uri: notif.actor.avatar_url }} style={styles.notifAvatar} />
              : <View style={[styles.notifAvatar, styles.notifAvatarFallback]}><User size={18} color={colors.textMuted} /></View>
            }
            <View style={styles.notifBody}>
              <Text style={styles.notifText} numberOfLines={2}>
                <Text style={styles.notifUsername}>{actorName} </Text>
                <Text style={styles.notifAction}>{notif.message}</Text>
              </Text>
              <Text style={styles.notifTime}>{timeAgo(notif.created_at)}</Text>
            </View>
            {!notif.read && <View style={styles.unreadDot} />}
          </TouchableOpacity>
            );
          })}
        </View>
      )}
    </ScrollView>
  );

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'feed': return renderFeedTab();
      case 'profile': return renderProfileTab();
      case 'messages': return renderMessagesTab();
      case 'notifications': return renderNotificationsTab();
    }
  };

  return (
    <View style={styles.container}>
      {/* Nebula background gradient */}
      <LinearGradient
        colors={['#0D0618', '#130A24', '#0A0A14', '#0D0618']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      {/* Glow blobs for depth */}
      <View style={styles.glowBlob1} pointerEvents="none" />
      <View style={styles.glowBlob2} pointerEvents="none" />
      <View style={styles.glowBlob3} pointerEvents="none" />

      {/* Header */}
      {activeTab === 'messages' ? (
        <View style={styles.msgHeader}>
          <Text style={styles.msgHeaderTitle}>Messages</Text>
          <TouchableOpacity
            style={styles.composeBtn}
            activeOpacity={0.85}
            onPress={() => { setComposeSearch(''); setComposeResults([]); setShowComposeModal(true); }}
          >
            <Send size={18} color={colors.white} strokeWidth={2.5} />
          </TouchableOpacity>
        </View>
      ) : activeTab === 'notifications' ? (
        <View style={styles.msgHeader}>
          <View style={styles.msgHeaderRow}>
            <Text style={styles.msgHeaderTitle}>Notifications</Text>
            {unreadNotifCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>{unreadNotifCount}</Text>
              </View>
            )}
          </View>
        </View>
      ) : (
        <View style={styles.header}>
          {/* Glass container behind header content */}
          <View style={styles.headerGlass}>
            <View style={styles.headerTitleWrap}>
              <View style={styles.headerGlow} />
              <Text style={styles.headerTitle}>Dawen Pulse</Text>
              <Text style={styles.headerSubtitle}>Connect with traders worldwide</Text>
            </View>
            {activeTab === 'feed' && (
              <TouchableOpacity style={styles.composeBtn} onPress={() => router.push('/create-post')} activeOpacity={0.85}>
                <Send size={18} color={colors.white} strokeWidth={2.5} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Top tabs — glass icon-based */}
      <View style={styles.topTabs}>
        {/* Feed — animated globe */}
        <TouchableOpacity
          style={[styles.topTab, activeTab === 'feed' && styles.topTabActive]}
          onPress={() => setActiveTab('feed')}
          activeOpacity={0.8}
        >
          {activeTab === 'feed' && <View style={styles.topTabActiveGlow} />}
          <View style={{ alignItems: 'center', justifyContent: 'center' }}>
            {activeTab === 'feed' && (
              <Animated.View style={{
                position: 'absolute',
                width: 28, height: 28, borderRadius: 14,
                backgroundColor: '#A855F7',
                opacity: feedGlobeGlow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.3] }),
              }} />
            )}
            <Animated.View style={{ transform: [{ rotate: activeTab === 'feed' ? feedGlobeRotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) : '0deg' }] }}>
              <Globe size={20} color={activeTab === 'feed' ? '#FFFFFF' : 'rgba(255,255,255,0.35)'} strokeWidth={2} />
            </Animated.View>
          </View>
        </TouchableOpacity>

        {/* Profile — avatar bubble */}
        <TouchableOpacity
          style={[styles.topTab, activeTab === 'profile' && styles.topTabActive]}
          onPress={() => {
            if (profile?.id && activeTab === 'profile') {
              router.push(`/profile/${profile.id}` as any);
            } else {
              setActiveTab('profile');
            }
          }}
          activeOpacity={0.8}
        >
          {activeTab === 'profile' && <View style={styles.topTabActiveGlow} />}
          <View style={styles.topTabAvatarWrap}>
            {profile?.avatar_url ? (
              <Image
                source={{ uri: profile.avatar_url }}
                style={[styles.topTabAvatar, activeTab === 'profile' && styles.topTabAvatarActive]}
              />
            ) : (
              <User size={20} color={activeTab === 'profile' ? colors.white : 'rgba(255,255,255,0.35)'} strokeWidth={2} />
            )}
          </View>
        </TouchableOpacity>

        {/* Messages */}
        <TouchableOpacity
          style={[styles.topTab, activeTab === 'messages' && styles.topTabActive]}
          onPress={() => setActiveTab('messages')}
          activeOpacity={0.8}
        >
          {activeTab === 'messages' && <View style={styles.topTabActiveGlow} />}
          <Mail size={20} color={activeTab === 'messages' ? colors.white : 'rgba(255,255,255,0.35)'} strokeWidth={2} />
        </TouchableOpacity>

        {/* Alerts / Notifications */}
        <TouchableOpacity
          style={[styles.topTab, activeTab === 'notifications' && styles.topTabActive]}
          onPress={() => setActiveTab('notifications')}
          activeOpacity={0.8}
        >
          {activeTab === 'notifications' && <View style={styles.topTabActiveGlow} />}
          <View style={styles.topTabInner}>
            <Bell size={20} color={activeTab === 'notifications' ? colors.white : 'rgba(255,255,255,0.35)'} strokeWidth={2} />
            {unreadNotifCount > 0 && (
              <View style={styles.topTabBadge}>
                <Text style={styles.topTabBadgeText}>{unreadNotifCount > 99 ? '99+' : unreadNotifCount}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </View>

      {/* Tab content */}
      <View style={styles.tabContent}>
        {renderActiveTab()}
      </View>

      {/* Delete Confirmation Modal */}
      <Modal visible={deleteConfirmId !== null} animationType="fade" transparent>
        <View style={styles.deleteOverlay}>
          <View style={styles.glassCard}>
            <View style={styles.deleteIconWrap}>
              <Trash2 size={28} color="#ef4444" strokeWidth={2} />
            </View>
            <Text style={styles.deleteTitle}>Delete Post</Text>
            <Text style={styles.deleteSubtitle}>This will permanently remove the post and all its likes, comments, and reposts.</Text>
            <TouchableOpacity
              style={[styles.deleteConfirmBtn, deleting && { opacity: 0.6 }]}
              onPress={confirmDeletePost}
              disabled={deleting}
              activeOpacity={0.85}
            >
              {deleting
                ? <ActivityIndicator size="small" color={colors.white} />
                : <Text style={styles.deleteConfirmBtnText}>Delete</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.deleteCancelBtn}
              onPress={() => setDeleteConfirmId(null)}
              disabled={deleting}
              activeOpacity={0.8}
            >
              <Text style={styles.deleteCancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Compose New Message Modal */}
      <Modal visible={showComposeModal} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.modalSheet, { maxHeight: '75%' }]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Message</Text>
              <TouchableOpacity onPress={() => setShowComposeModal(false)}>
                <X size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <View style={styles.msgSearchWrap}>
              <Search size={17} color={colors.textMuted} strokeWidth={2} />
              <TextInput
                style={styles.msgSearchInput}
                placeholder="Search by username..."
                placeholderTextColor={colors.textMuted}
                value={composeSearch}
                onChangeText={handleComposeSearch}
                autoFocus
                autoCapitalize="none"
              />
              {composeSearching && <ActivityIndicator size="small" color={colors.primary} />}
            </View>
            <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
              {composeSearch.trim() && composeResults.length === 0 && !composeSearching ? (
                <View style={{ alignItems: 'center', paddingTop: 32 }}>
                  <Text style={{ color: colors.textMuted, fontSize: fontSize.md }}>No users found</Text>
                </View>
              ) : (
                composeResults.map((user: any, idx: number) => {
                  const name = user.username || `${user.wallet_address?.slice(0, 6)}...`;
                  return (
                    <TouchableOpacity
                      key={user.id}
                      style={[styles.convRow, idx < composeResults.length - 1 && styles.convRowBorder]}
                      activeOpacity={0.75}
                      onPress={() => {
                        setShowComposeModal(false);
                        router.push(`/chat/${user.id}` as any);
                      }}
                    >
                      <View style={styles.convAvatarWrap}>
                        {user.avatar_url
                          ? <Image source={{ uri: user.avatar_url }} style={styles.convAvatar} />
                          : <View style={[styles.convAvatar, styles.convAvatarFallback]}><User size={22} color={colors.textMuted} /></View>
                        }
                      </View>
                      <View style={styles.convBody}>
                        <View style={styles.convNameRow}>
                          <Text style={styles.convUsername}>{name}</Text>
                          <VerificationBadge profile={user} size="sm" />
                        </View>
                        {user.bio ? <Text style={styles.convLastMsg} numberOfLines={1}>{user.bio}</Text> : null}
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Create Post Modal */}
      <Modal visible={showCreateModal} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Post</Text>
              <TouchableOpacity onPress={() => { setShowCreateModal(false); setNewPostContent(''); setNewPostImageUrl(''); }}>
                <X size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <View style={styles.createAuthorRow}>
              <View style={styles.createAvatar}>
                {profile?.avatar_url
                  ? <Image source={{ uri: profile.avatar_url }} style={styles.createAvatarImg} />
                  : <User size={18} color={colors.textMuted} />
                }
              </View>
              <Text style={styles.createAuthorName}>
                {profile?.username || (activeAddress
                  ? `${activeAddress.slice(0, 6)}...${activeAddress.slice(-4)}`
                  : profile?.wallet_address
                    ? `${profile.wallet_address.slice(0, 6)}...${profile.wallet_address.slice(-4)}`
                    : 'Wallet')}
              </Text>
            </View>

            <TextInput
              style={styles.postInput}
              placeholder="What's on your mind?"
              placeholderTextColor={colors.textMuted}
              value={newPostContent}
              onChangeText={setNewPostContent}
              multiline
              maxLength={500}
              autoFocus
            />

            <View style={styles.imageUrlRow}>
              <ImagePlus size={16} color={colors.textMuted} />
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
              <Image source={{ uri: newPostImageUrl.trim() }} style={styles.imagePreview} resizeMode="cover" />
            ) : null}

            <View style={styles.modalFooter}>
              <Text style={styles.charCount}>{newPostContent.length}/500</Text>
              <TouchableOpacity
                style={[styles.postBtn, !newPostContent.trim() && styles.postBtnDisabled]}
                onPress={handleCreatePost}
                disabled={!newPostContent.trim() || posting}
              >
                {posting
                  ? <ActivityIndicator color={colors.white} size="small" />
                  : <Text style={styles.postBtnText}>Post</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Comments Modal */}
      <Modal visible={showCommentsModal} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.modalSheet, { maxHeight: '90%' }]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Comments</Text>
              <TouchableOpacity onPress={closeCommentsModal}>
                <X size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
              {selectedPost && (
                <View style={styles.commentPostPreview}>
                  <View style={styles.commentPreviewHeader}>
                    <View style={styles.avatarXS}>
                      {selectedPost.author?.avatar_url
                        ? <Image source={{ uri: selectedPost.author.avatar_url }} style={styles.avatarXSImg} />
                        : <User size={12} color={colors.textMuted} />
                      }
                    </View>
                    <Text style={styles.commentPreviewAuthor}>
                      {selectedPost.author?.username || `${selectedPost.author?.wallet_address?.slice(0, 6)}...`}
                    </Text>
                    {selectedPost.author && (selectedPost.author.is_verified || (selectedPost.author as any).verified_basic || (selectedPost.author as any).premium_expiration) && (
                      <VerificationBadge profile={selectedPost.author as any} size="sm" />
                    )}
                    <Text style={styles.commentPreviewTime}>{timeAgo(selectedPost.created_at)}</Text>
                  </View>
                  <Text style={styles.commentPreviewText} numberOfLines={3}>{selectedPost.content}</Text>
                </View>
              )}

              {commentsLoading ? (
                <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
              ) : comments.length === 0 ? (
                <View style={styles.noComments}>
                  <Text style={styles.noCommentsText}>No comments yet. Be the first!</Text>
                </View>
              ) : (
                <View style={{ paddingBottom: spacing.lg }}>
                  {comments.map(item => (
                    <View key={item.id}>
                      {/* Top-level comment */}
                      <View style={styles.commentItem}>
                        <TouchableOpacity onPress={() => item.author?.id && router.push(`/profile/${item.author.id}` as any)} activeOpacity={0.8}>
                          <View style={styles.avatarXS}>
                            {item.author?.avatar_url
                              ? <Image source={{ uri: item.author.avatar_url }} style={styles.avatarXSImg} />
                              : <User size={12} color={colors.textMuted} />
                            }
                          </View>
                        </TouchableOpacity>
                        <View style={styles.commentBody}>
                          <View style={styles.commentMeta}>
                            <Text style={styles.commentAuthor}>
                              {item.author?.username || `${item.author?.wallet_address?.slice(0, 6)}...`}
                            </Text>
                            {item.author && (item.author.is_verified || (item.author as any).verified_basic || (item.author as any).premium_expiration) && (
                              <VerificationBadge profile={item.author as any} size="sm" />
                            )}
                            <Text style={styles.commentTime}>{timeAgo(item.created_at)}</Text>
                          </View>
                          <Text style={styles.commentText}>{item.content}</Text>
                          <View style={styles.commentActions}>
                            <TouchableOpacity style={styles.commentActionBtn} onPress={() => handleCommentLike(item.id)} activeOpacity={0.7}>
                              <Heart size={13} color={item.liked_by_user ? '#ef4444' : colors.textMuted} fill={item.liked_by_user ? '#ef4444' : 'none'} strokeWidth={2} />
                              {(item.likes_count || 0) > 0 && <Text style={[styles.commentActionText, item.liked_by_user && { color: '#ef4444' }]}>{item.likes_count}</Text>}
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.commentActionBtn} onPress={() => { setReplyingToComment(item); setTimeout(() => commentInputRef.current?.focus(), 100); }} activeOpacity={0.7}>
                              <MessageCircle size={13} color={colors.textMuted} strokeWidth={2} />
                              <Text style={styles.commentActionText}>Reply</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                      {/* Replies */}
                      {(item.replies || []).map(reply => (
                        <View key={reply.id} style={styles.replyItem}>
                          <TouchableOpacity onPress={() => reply.author?.id && router.push(`/profile/${reply.author.id}` as any)} activeOpacity={0.8}>
                            <View style={styles.avatarXXS}>
                              {reply.author?.avatar_url
                                ? <Image source={{ uri: reply.author.avatar_url }} style={styles.avatarXXSImg} />
                                : <User size={10} color={colors.textMuted} />
                              }
                            </View>
                          </TouchableOpacity>
                          <View style={styles.commentBody}>
                            <View style={styles.commentMeta}>
                              <Text style={styles.commentAuthor}>
                                {reply.author?.username || `${reply.author?.wallet_address?.slice(0, 6)}...`}
                              </Text>
                              {reply.author && (reply.author.is_verified || (reply.author as any).verified_basic || (reply.author as any).premium_expiration) && (
                                <VerificationBadge profile={reply.author as any} size="sm" />
                              )}
                              <Text style={styles.commentTime}>{timeAgo(reply.created_at)}</Text>
                            </View>
                            <Text style={styles.commentText}>{reply.content}</Text>
                            <View style={styles.commentActions}>
                              <TouchableOpacity style={styles.commentActionBtn} onPress={() => handleCommentLike(reply.id)} activeOpacity={0.7}>
                                <Heart size={13} color={reply.liked_by_user ? '#ef4444' : colors.textMuted} fill={reply.liked_by_user ? '#ef4444' : 'none'} strokeWidth={2} />
                                {(reply.likes_count || 0) > 0 && <Text style={[styles.commentActionText, reply.liked_by_user && { color: '#ef4444' }]}>{reply.likes_count}</Text>}
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
              <View style={styles.replyBanner}>
                <Text style={styles.replyBannerText}>
                  Replying to{' '}
                  <Text style={styles.replyBannerName}>
                    {replyingToComment.author?.username || 'user'}
                  </Text>
                </Text>
                <TouchableOpacity onPress={() => setReplyingToComment(null)}>
                  <X size={14} color={colors.textMuted} strokeWidth={2.5} />
                </TouchableOpacity>
              </View>
            )}

            {/* @mention dropdown */}
            {mentionResults.length > 0 && (
              <View style={styles.mentionDropdown}>
                {mentionLoading && <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 6 }} />}
                {mentionResults.map(u => (
                  <TouchableOpacity
                    key={u.id}
                    style={styles.mentionRow}
                    onPress={() => insertMention(u.username || u.wallet_address?.slice(0, 8))}
                    activeOpacity={0.75}
                  >
                    {u.avatar_url
                      ? <Image source={{ uri: u.avatar_url }} style={styles.mentionAvatar} />
                      : <View style={[styles.mentionAvatar, styles.mentionAvatarFallback]}><User size={13} color={colors.textMuted} /></View>
                    }
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={styles.mentionUsername}>{u.username || (u.wallet_address ? `${u.wallet_address.slice(0, 6)}...${u.wallet_address.slice(-4)}` : 'Wallet')}</Text>
                        <VerificationBadge profile={u} size="sm" />
                      </View>
                      <Text style={styles.mentionAddr}>{u.wallet_address?.slice(0, 6)}...{u.wallet_address?.slice(-4)}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={styles.commentInputRow}>
              <TextInput
                ref={commentInputRef}
                style={styles.commentInput}
                placeholder={replyingToComment ? `Reply to ${replyingToComment.author?.username || 'user'}...` : 'Add a comment... (@mention)'}
                placeholderTextColor={colors.textMuted}
                value={newCommentContent}
                onChangeText={handleCommentTextChange}
                maxLength={300}
              />
              <TouchableOpacity
                style={[styles.commentSendBtn, !newCommentContent.trim() && styles.commentSendBtnDisabled]}
                onPress={handleAddComment}
                disabled={!newCommentContent.trim() || submittingComment}
              >
                {submittingComment
                  ? <ActivityIndicator size="small" color={colors.white} />
                  : <Send size={15} color={colors.white} />
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Promote Modal */}
      <Modal visible={showPromoteModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { paddingBottom: 28 }]}>
            <View style={styles.modalHandle} />

            {(promoteStep === 'select') && (() => {
              const activeTier = PROMOTE_TIERS.find(t => t.key === selectedTierKey) ?? PROMOTE_TIERS[0];
              const usdPrice = (activeTier as any).usdPrice as number;
              const displayAmt = promotePayWith === 'SOL'
                ? (solUsdPrice > 0 ? `${usdToSol(usdPrice).toFixed(3)} SOL` : '... SOL')
                : `${usdPrice} DTEST`;
              return (
                <>
                  {/* Header */}
                  <View style={styles.pmHeader}>
                    <View style={styles.pmHeaderLeft}>
                      <View style={styles.pmRocketWrap}>
                        <Zap size={22} color="#fff" fill="#fff" />
                      </View>
                      <View>
                        <Text style={styles.pmTitle}>Promote Post</Text>
                        <Text style={styles.pmSubtitle}>Boost your post to reach more users.{'\n'}Payment in SOL or DTEST.</Text>
                      </View>
                    </View>
                    <TouchableOpacity style={styles.pmCloseBtn} onPress={closePromoteModal}>
                      <X size={18} color="rgba(255,255,255,0.7)" />
                    </TouchableOpacity>
                  </View>

                  {/* Pay with toggle */}
                  <Text style={styles.pmPayLabel}>PAY WITH</Text>
                  <View style={styles.pmToggleRow}>
                    <TouchableOpacity
                      style={[styles.pmToggleBtn, promotePayWith === 'SOL' && styles.pmToggleBtnActive]}
                      onPress={() => setPromotePayWith('SOL')}
                      activeOpacity={0.8}
                    >
                      <View style={styles.pmToggleIcon}>
                        <Text style={styles.pmToggleIconText}>◎</Text>
                      </View>
                      <Text style={[styles.pmToggleBtnText, promotePayWith === 'SOL' && styles.pmToggleBtnTextActive]}>SOL</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.pmToggleBtn, promotePayWith === 'DTEST' && styles.pmToggleBtnActive]}
                      onPress={() => setPromotePayWith('DTEST')}
                      activeOpacity={0.8}
                    >
                      <View style={[styles.pmToggleIcon, { backgroundColor: 'rgba(139,92,246,0.3)' }]}>
                        <Text style={styles.pmToggleIconText}>D</Text>
                      </View>
                      <Text style={[styles.pmToggleBtnText, promotePayWith === 'DTEST' && styles.pmToggleBtnTextActive]}>DTEST</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Tier cards */}
                  <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 340 }}>
                    {PROMOTE_TIERS.map(tier => {
                      const isSelected = selectedTierKey === tier.key;
                      const tUsd = (tier as any).usdPrice as number;
                      const tAmt = promotePayWith === 'SOL'
                        ? (solUsdPrice > 0 ? `≈ ${usdToSol(tUsd).toFixed(3)} SOL` : '... SOL')
                        : `≈ ${tUsd} DTEST`;
                      const isQuick = tier.key === '1h';
                      return (
                        <TouchableOpacity
                          key={tier.key}
                          style={[styles.pmTierCard, isSelected && styles.pmTierCardActive]}
                          onPress={() => handleSelectTier(tier.key)}
                          activeOpacity={0.8}
                        >
                          <View style={[styles.pmTierIconWrap, isSelected && styles.pmTierIconWrapActive]}>
                            <Clock size={18} color={isSelected ? '#fff' : colors.primary} />
                          </View>
                          <View style={styles.pmTierInfo}>
                            <Text style={styles.pmTierLabel}>{tier.label}</Text>
                            <Text style={styles.pmTierSub}>{tier.hours}h visibility boost</Text>
                            {isQuick && (
                              <View style={styles.pmQuickBadge}>
                                <Zap size={10} color={colors.primary} fill={colors.primary} />
                                <Text style={styles.pmQuickBadgeText}>Quick boost</Text>
                              </View>
                            )}
                          </View>
                          <View style={styles.pmTierRight}>
                            <Text style={styles.pmTierUsd}>${tUsd}</Text>
                            <Text style={styles.pmTierAmt}>{tAmt}</Text>
                          </View>
                          {isSelected && (
                            <View style={styles.pmCheckWrap}>
                              <Check size={14} color="#fff" strokeWidth={3} />
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  {/* Summary card */}
                  <View style={styles.pmSummaryCard}>
                    <View style={styles.pmSummaryIconWrap}>
                      <Clock size={18} color={colors.primary} />
                    </View>
                    <View style={styles.pmSummaryCol}>
                      <Text style={styles.pmSummaryPlanLabel}>SELECTED PLAN</Text>
                      <Text style={styles.pmSummaryPlanName}>{activeTier.label} Boost</Text>
                      <Text style={styles.pmSummaryPlanSub}>
                        {'\u23F0'} {activeTier.hours}h visibility boost
                      </Text>
                    </View>
                    <View style={styles.pmSummaryCol}>
                      <Text style={styles.pmSummaryPayLabel}>YOU WILL PAY</Text>
                      <Text style={styles.pmSummaryPayAmt}>${usdPrice}</Text>
                      <Text style={styles.pmSummaryPaySub}>{displayAmt}</Text>
                    </View>
                    <View style={styles.pmSummaryCol}>
                      <Text style={styles.pmSummaryNetLabel}>NETWORK</Text>
                      <View style={styles.pmSummaryNetRow}>
                        <Text style={{ fontSize: 14 }}>◎</Text>
                        <Text style={styles.pmSummaryNetName}>Solana</Text>
                      </View>
                    </View>
                  </View>

                  {/* Confirm button */}
                  <TouchableOpacity style={styles.pmConfirmBtn} onPress={handleConfirmPromotion} activeOpacity={0.88}>
                    <Zap size={18} color="#fff" fill="#fff" />
                    <Text style={styles.pmConfirmBtnText}>CONFIRM PROMOTION</Text>
                  </TouchableOpacity>
                </>
              );
            })()}

            {promoteStep === 'processing' && (
              <View style={styles.processingWrap}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.processingTitle}>Processing...</Text>
                <Text style={styles.processingSubtitle}>Activating promotion</Text>
              </View>
            )}

            {promoteStep === 'done' && (
              <View style={styles.processingWrap}>
                <View style={styles.doneIcon}>
                  <Check size={30} color={colors.success} />
                </View>
                <Text style={styles.processingTitle}>Promotion Active!</Text>
                <Text style={styles.processingSubtitle}>
                  Your post is now boosted for {PROMOTE_TIERS.find(t => t.key === selectedTierKey)?.label}
                </Text>
                <TouchableOpacity style={styles.doneBtn} onPress={closePromoteModal}>
                  <Text style={styles.doneBtnText}>Done</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Followers / Following List Modal */}
      <Modal visible={followListType !== null} animationType="slide" transparent>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.modalSheet, { maxHeight: '80%' }]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {followListType === 'followers' ? 'Followers' : 'Following'}
              </Text>
              <TouchableOpacity onPress={() => setFollowListType(null)}>
                <X size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            {followListLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 40, marginBottom: 40 }} />
            ) : followListUsers.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <Text style={{ color: colors.textMuted, fontSize: fontSize.md }}>
                  {followListType === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
                </Text>
              </View>
            ) : (
              <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                {followListUsers.map((user, idx) => {
                  const name = user.username || `${user.wallet_address?.slice(0, 6)}...${user.wallet_address?.slice(-4)}`;
                  const shortAddr = user.wallet_address
                    ? `${user.wallet_address.slice(0, 4)}...${user.wallet_address.slice(-4)}`
                    : '';
                  return (
                    <TouchableOpacity
                      key={user.id}
                      style={[styles.convRow, idx < followListUsers.length - 1 && styles.convRowBorder]}
                      activeOpacity={0.75}
                      onPress={() => {
                        setFollowListType(null);
                        router.push(`/profile/${user.id}` as any);
                      }}
                    >
                      {user.avatar_url
                        ? <Image source={{ uri: user.avatar_url }} style={styles.convAvatar} />
                        : <View style={[styles.convAvatar, styles.convAvatarFallback]}><User size={22} color={colors.textMuted} /></View>
                      }
                      <View style={styles.convBody}>
                        <View style={styles.convNameRow}>
                          <Text style={styles.convUsername}>{name}</Text>
                          <VerificationBadge profile={user} size="sm" />
                        </View>
                        {shortAddr ? <Text style={{ fontSize: 11, color: colors.textMuted, fontFamily: 'SpaceMono-Regular' }}>{shortAddr}</Text> : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const G = {
  glass: 'rgba(255,255,255,0.04)',
  glassBorder: 'rgba(255,255,255,0.08)',
  glassBorderActive: 'rgba(139,92,246,0.45)',
  glassActive: 'rgba(139,92,246,0.18)',
  glassInput: 'rgba(255,255,255,0.05)',
  purpleGlow: 'rgba(139,92,246,0.25)',
  purpleGlowStrong: 'rgba(139,92,246,0.45)',
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0618',
  },

  // ── Nebula background blobs ──
  glowBlob1: {
    position: 'absolute',
    top: -60,
    left: -80,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(139,92,246,0.12)',
    transform: [{ scaleX: 1.4 }],
  },
  glowBlob2: {
    position: 'absolute',
    top: 120,
    right: -100,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(167,139,250,0.07)',
  },
  glowBlob3: {
    position: 'absolute',
    bottom: 100,
    left: -60,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(109,40,217,0.08)',
  },

  // ── Header ──
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: 56,
    paddingBottom: spacing.md,
  },
  headerGlass: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: G.glass,
    borderWidth: 1,
    borderColor: G.glassBorder,
    borderRadius: 20,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    overflow: 'hidden',
  },
  headerTitleWrap: {
    position: 'relative',
  },
  headerGlow: {
    position: 'absolute',
    top: -20,
    left: -30,
    width: 120,
    height: 80,
    borderRadius: 60,
    backgroundColor: 'rgba(139,92,246,0.2)',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    marginBottom: 2,
    textShadowColor: 'rgba(167,139,250,0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  headerSubtitle: {
    fontSize: fontSize.xs,
    fontWeight: '500',
    color: 'rgba(196,196,212,0.6)',
    letterSpacing: 0.3,
  },
  composeBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: G.purpleGlowStrong,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 14,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.4)',
  },

  // ── Nav tabs ──
  topTabs: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    paddingTop: spacing.xs,
    gap: spacing.xs,
    minHeight: 56,
  },
  topTab: {
    flex: 1,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: G.glass,
    borderWidth: 1,
    borderColor: G.glassBorder,
    position: 'relative',
    overflow: 'hidden',
  },
  topTabActive: {
    backgroundColor: 'rgba(139,92,246,0.22)',
    borderColor: G.glassBorderActive,
  },
  topTabActiveGlow: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(139,92,246,0.12)',
    borderRadius: 14,
  },
  topTabText: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.35)',
  },
  topTabTextActive: {
    color: colors.white,
  },
  topTabAvatarWrap: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTabAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    opacity: 0.6,
  },
  topTabAvatarActive: {
    borderWidth: 2,
    borderColor: colors.primaryLight,
    opacity: 1,
  },
  tabContent: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  feedList: {
    paddingTop: spacing.sm,
    paddingBottom: 100,
  },
  emptyList: {
    flexGrow: 1,
    paddingBottom: 100,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: spacing.xxl,
    gap: spacing.md,
  },
  emptyIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(139,92,246,0.12)',
    borderWidth: 1,
    borderColor: G.glassBorder,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  emptyTitle: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  emptySubtitle: {
    fontSize: fontSize.md,
    color: 'rgba(196,196,212,0.55)',
    textAlign: 'center',
    maxWidth: 260,
    lineHeight: 22,
  },
  emptyBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxxl,
    borderRadius: borderRadius.full,
    marginTop: spacing.md,
    shadowColor: G.purpleGlowStrong,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.7,
    shadowRadius: 12,
  },
  emptyBtnText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.white,
  },

  // ── Glass card (shared) ──
  glassCard: {
    backgroundColor: 'rgba(20,10,40,0.75)',
    borderWidth: 1,
    borderColor: G.glassBorder,
    borderRadius: 20,
    padding: spacing.xxl,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    gap: spacing.md,
    shadowColor: G.purpleGlow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
  },

  // ── Modals ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(5,3,15,0.85)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: 'rgba(16,8,36,0.96)',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: G.glassBorder,
    padding: spacing.xxl,
    maxHeight: '85%',
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(139,92,246,0.3)',
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
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  createAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  createAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: G.glass,
    borderWidth: 1,
    borderColor: G.glassBorder,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  createAvatarImg: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  createAuthorName: {
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
    borderColor: G.glassBorder,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    backgroundColor: G.glassInput,
  },
  imageUrlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: G.glassInput,
    borderWidth: 1,
    borderColor: G.glassBorder,
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
    height: 150,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  charCount: {
    fontSize: fontSize.xs,
    color: 'rgba(196,196,212,0.45)',
  },
  postBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxl,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    minWidth: 90,
    shadowColor: G.purpleGlowStrong,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 10,
  },
  postBtnDisabled: {
    opacity: 0.45,
  },
  postBtnText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.white,
  },

  // ── Comments ──
  commentPostPreview: {
    backgroundColor: G.glass,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: G.glassBorder,
  },
  commentPreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  commentPreviewAuthor: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  commentPreviewTime: {
    fontSize: fontSize.xs,
    color: 'rgba(196,196,212,0.5)',
  },
  commentPreviewText: {
    fontSize: fontSize.sm,
    color: 'rgba(196,196,212,0.75)',
    lineHeight: 20,
  },
  noComments: {
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
  },
  noCommentsText: {
    fontSize: fontSize.sm,
    color: 'rgba(196,196,212,0.45)',
  },
  commentItem: {
    flexDirection: 'row',
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  avatarXS: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: G.glass,
    borderWidth: 1,
    borderColor: G.glassBorder,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarXSImg: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  commentBody: {
    flex: 1,
  },
  commentMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 3,
  },
  commentAuthor: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  commentTime: {
    fontSize: fontSize.xs,
    color: 'rgba(196,196,212,0.4)',
  },
  commentText: {
    fontSize: fontSize.sm,
    color: 'rgba(196,196,212,0.85)',
    lineHeight: 20,
  },
  replyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(139,92,246,0.1)',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(139,92,246,0.2)',
  },
  replyBannerText: {
    fontSize: 13,
    color: 'rgba(196,196,212,0.65)',
  },
  replyBannerName: {
    fontWeight: '700',
    color: colors.primaryLight,
  },
  commentActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginTop: 6,
  },
  commentActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  commentActionText: {
    fontSize: 12,
    color: 'rgba(196,196,212,0.45)',
    fontWeight: '600',
  },
  replyItem: {
    flexDirection: 'row',
    marginBottom: spacing.md,
    gap: spacing.md,
    paddingLeft: 36,
  },
  avatarXXS: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: G.glass,
    borderWidth: 1,
    borderColor: G.glassBorder,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarXXSImg: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(139,92,246,0.1)',
    paddingTop: spacing.md,
    marginTop: spacing.sm,
  },
  commentInput: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    backgroundColor: G.glassInput,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: G.glassBorder,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    maxHeight: 80,
  },
  commentSendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: G.purpleGlow,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
  },
  commentSendBtnDisabled: {
    opacity: 0.45,
  },

  // ── @mention dropdown ──
  mentionDropdown: {
    backgroundColor: 'rgba(16,8,36,0.96)',
    borderWidth: 1,
    borderColor: G.glassBorder,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  mentionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  mentionAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  mentionAvatarFallback: {
    backgroundColor: G.glass,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mentionUsername: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  mentionAddr: {
    fontSize: 10,
    color: 'rgba(196,196,212,0.4)',
    fontFamily: 'SpaceMono-Regular',
  },

  // ── Promote ──
  promoteDesc: {
    fontSize: fontSize.md,
    color: 'rgba(196,196,212,0.65)',
    marginBottom: spacing.xl,
    lineHeight: 22,
  },
  tierCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: G.glass,
    borderWidth: 1,
    borderColor: G.glassBorder,
    borderRadius: 14,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  tierInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  tierIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(139,92,246,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tierLabel: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  tierSub: {
    fontSize: fontSize.xs,
    color: 'rgba(196,196,212,0.45)',
    marginTop: 2,
  },
  tierPrice: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: '#F59E0B',
    textAlign: 'right',
  },
  tierCurrency: {
    fontSize: fontSize.xs,
    color: 'rgba(196,196,212,0.45)',
    textAlign: 'right',
  },
  confirmCard: {
    backgroundColor: G.glass,
    borderWidth: 1,
    borderColor: G.glassBorder,
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
    color: 'rgba(196,196,212,0.55)',
  },
  confirmValue: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  confirmDivider: {
    height: 1,
    backgroundColor: G.glassBorder,
  },
  paymentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(139,92,246,0.15)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.25)',
  },
  paymentBadgeText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.primaryLight,
  },
  mockNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: 'rgba(245,158,11,0.08)',
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.2)',
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  mockNoticeText: {
    flex: 1,
    fontSize: fontSize.xs,
    color: colors.warning,
    lineHeight: 16,
  },
  confirmBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    marginBottom: spacing.md,
    shadowColor: G.purpleGlowStrong,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.7,
    shadowRadius: 12,
  },
  confirmBtnText: {
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
    color: 'rgba(196,196,212,0.45)',
  },
  processingWrap: {
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
    gap: spacing.md,
  },
  processingTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  processingSubtitle: {
    fontSize: fontSize.md,
    color: 'rgba(196,196,212,0.6)',
    textAlign: 'center',
  },
  doneIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(16,185,129,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  doneBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxxl,
    borderRadius: borderRadius.full,
    marginTop: spacing.lg,
    shadowColor: G.purpleGlowStrong,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 10,
  },
  doneBtnText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.white,
  },

  // ── Messages ──
  msgHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xxl,
    paddingTop: 56,
    paddingBottom: spacing.lg,
  },
  msgHeaderTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  notifFilterBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: G.glass,
    borderWidth: 1,
    borderColor: G.glassBorder,
    justifyContent: 'center',
    alignItems: 'center',
  },
  msgContainer: {
    flex: 1,
  },
  msgContent: {
    paddingBottom: 40,
  },
  msgSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: G.glassInput,
    borderRadius: 14,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: G.glassBorder,
  },
  msgSearchInput: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.textPrimary,
  },
  msgList: {
    marginHorizontal: spacing.lg,
    backgroundColor: G.glass,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: G.glassBorder,
    overflow: 'hidden',
  },
  convRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  convRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(139,92,246,0.06)',
  },
  convAvatarWrap: {
    position: 'relative',
  },
  convAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: G.glass,
    borderWidth: 1,
    borderColor: G.glassBorder,
  },
  convBody: {
    flex: 1,
    gap: 3,
  },
  convNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  convUsername: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  verifiedBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  convLastMsg: {
    fontSize: fontSize.sm,
    color: 'rgba(196,196,212,0.55)',
  },
  convMeta: {
    alignItems: 'flex-end',
    gap: 6,
  },
  convTime: {
    fontSize: 12,
    color: 'rgba(196,196,212,0.4)',
    fontWeight: '500',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primaryLight,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },

  // ── Notifications ──
  notifContainer: {
    flex: 1,
  },
  notifContent: {
    paddingBottom: 40,
  },
  notifFilterScroll: {
    marginBottom: spacing.md,
  },
  notifFilterRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
    paddingBottom: 2,
  },
  notifFilterTab: {
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    borderRadius: 20,
    backgroundColor: G.glass,
    borderWidth: 1,
    borderColor: G.glassBorder,
  },
  notifFilterTabActive: {
    backgroundColor: 'rgba(139,92,246,0.25)',
    borderColor: G.glassBorderActive,
    shadowColor: G.purpleGlow,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
  },
  notifFilterText: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(196,196,212,0.45)',
  },
  notifFilterTextActive: {
    color: colors.white,
  },
  notifList: {
    marginHorizontal: spacing.lg,
    backgroundColor: G.glass,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: G.glassBorder,
    overflow: 'hidden',
  },
  notifRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  notifRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(139,92,246,0.06)',
  },
  notifIconWrap: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: G.glass,
    borderWidth: 1,
    borderColor: G.glassBorder,
  },
  notifBody: {
    flex: 1,
    gap: 2,
  },
  notifText: {
    fontSize: 14,
    lineHeight: 20,
  },
  notifUsername: {
    fontWeight: '800',
    color: colors.textPrimary,
  },
  notifAction: {
    fontWeight: '400',
    color: 'rgba(196,196,212,0.7)',
  },
  notifTime: {
    fontSize: 12,
    color: 'rgba(196,196,212,0.4)',
    fontWeight: '500',
    marginTop: 1,
  },
  notifPreview: {
    fontSize: 13,
    color: 'rgba(196,196,212,0.4)',
    marginTop: 3,
  },
  notifRowUnread: {
    backgroundColor: 'rgba(139,92,246,0.06)',
  },
  notifAvatarFallback: {
    backgroundColor: G.glass,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notifHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: spacing.lg,
    marginBottom: spacing.md,
  },
  markReadBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  markReadText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primaryLight,
  },
  notifActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  msgHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  unreadBadge: {
    backgroundColor: 'rgba(139,92,246,0.25)',
    borderWidth: 1,
    borderColor: G.glassBorderActive,
    borderRadius: borderRadius.full,
    minWidth: 22,
    height: 22,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  unreadBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primaryLight,
  },
  convAvatarFallback: {
    backgroundColor: G.glass,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Profile card (inline) ──
  profileCard: {
    margin: spacing.lg,
    backgroundColor: G.glass,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: G.glassBorder,
    padding: spacing.lg,
    gap: spacing.lg,
    shadowColor: G.purpleGlow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
  },
  profileCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  profileAvatarLg: {
    width: 68,
    height: 68,
    borderRadius: 34,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(139,92,246,0.4)',
    shadowColor: G.purpleGlow,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 12,
  },
  profileAvatarLgImg: {
    width: 68,
    height: 68,
    borderRadius: 34,
  },
  profileAvatarLgFallback: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: G.glass,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileCardInfo: {
    flex: 1,
    gap: 4,
  },
  profileCardName: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  profileCardAddr: {
    fontSize: 11,
    color: 'rgba(196,196,212,0.45)',
    fontFamily: 'SpaceMono-Regular',
  },
  profileCardBio: {
    fontSize: fontSize.sm,
    color: 'rgba(196,196,212,0.7)',
    lineHeight: 18,
  },
  profileCardStats: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: G.glassBorder,
    borderBottomWidth: 1,
    borderBottomColor: G.glassBorder,
  },
  profileCardStat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  profileCardStatValue: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  profileCardStatLabel: {
    fontSize: 10,
    color: 'rgba(196,196,212,0.45)',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statLabelTappable: {
    color: colors.primaryLight,
  },
  profileCardStatDivider: {
    width: 1,
    height: 32,
    backgroundColor: G.glassBorder,
  },
  viewFullProfileBtn: {
    backgroundColor: 'rgba(139,92,246,0.25)',
    borderWidth: 1,
    borderColor: G.glassBorderActive,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    shadowColor: G.purpleGlowStrong,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  viewFullProfileBtnText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  profileSectionHeader: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: G.glassBorder,
  },
  profileSectionTitle: {
    fontSize: fontSize.md,
    fontWeight: '800',
    color: colors.textPrimary,
  },

  // ── Top tab badge ──
  topTabInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    minWidth: 24,
    minHeight: 24,
  },
  topTabBadge: {
    backgroundColor: '#ef4444',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  topTabBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#fff',
  },

  // ── Delete confirmation ──
  deleteOverlay: {
    flex: 1,
    backgroundColor: 'rgba(5,3,15,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
  },
  deleteModal: {
    backgroundColor: G.glass,
    borderRadius: 20,
    padding: spacing.xxl,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.2)',
  },
  deleteIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  deleteTitle: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  deleteSubtitle: {
    fontSize: fontSize.sm,
    color: 'rgba(196,196,212,0.6)',
    textAlign: 'center',
    lineHeight: 20,
  },
  deleteConfirmBtn: {
    backgroundColor: 'rgba(239,68,68,0.85)',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    width: '100%',
    marginTop: spacing.sm,
    minHeight: 46,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.4)',
  },
  deleteConfirmBtnText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.white,
  },
  deleteCancelBtn: {
    paddingVertical: spacing.sm,
    alignItems: 'center',
    width: '100%',
  },
  deleteCancelBtnText: {
    fontSize: fontSize.md,
    color: 'rgba(196,196,212,0.5)',
    fontWeight: '600',
  },

  // ── Promote modal (pm*) ──
  pmHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  pmHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  pmRocketWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: 'rgba(139,92,246,0.6)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
  },
  pmTitle: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  pmSubtitle: {
    fontSize: fontSize.xs,
    color: 'rgba(196,196,212,0.55)',
    lineHeight: 16,
    marginTop: 2,
  },
  pmCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: G.glass,
    borderWidth: 1,
    borderColor: G.glassBorder,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pmPayLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(196,196,212,0.4)',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  pmToggleRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  pmToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: 12,
    backgroundColor: G.glass,
    borderWidth: 1.5,
    borderColor: G.glassBorder,
  },
  pmToggleBtnActive: {
    backgroundColor: 'rgba(139,92,246,0.18)',
    borderColor: 'rgba(139,92,246,0.55)',
    shadowColor: 'rgba(139,92,246,0.35)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 8,
  },
  pmToggleIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(245,158,11,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pmToggleIconText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F59E0B',
  },
  pmToggleBtnText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: 'rgba(196,196,212,0.45)',
  },
  pmToggleBtnTextActive: {
    color: colors.textPrimary,
  },
  pmTierCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: G.glass,
    borderWidth: 1.5,
    borderColor: G.glassBorder,
    borderRadius: 14,
    padding: spacing.md,
    marginBottom: spacing.sm,
    position: 'relative',
  },
  pmTierCardActive: {
    backgroundColor: 'rgba(139,92,246,0.14)',
    borderColor: 'rgba(139,92,246,0.55)',
    shadowColor: 'rgba(139,92,246,0.3)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 10,
  },
  pmTierIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(139,92,246,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pmTierIconWrapActive: {
    backgroundColor: colors.primary,
    borderColor: 'rgba(139,92,246,0.6)',
  },
  pmTierInfo: {
    flex: 1,
    gap: 2,
  },
  pmTierLabel: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  pmTierSub: {
    fontSize: fontSize.xs,
    color: 'rgba(196,196,212,0.45)',
  },
  pmQuickBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 3,
  },
  pmQuickBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 0.2,
  },
  pmTierRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  pmTierUsd: {
    fontSize: fontSize.md,
    fontWeight: '800',
    color: '#F59E0B',
  },
  pmTierAmt: {
    fontSize: 11,
    color: 'rgba(196,196,212,0.45)',
    fontWeight: '500',
  },
  pmCheckWrap: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(16,8,36,0.9)',
  },
  pmSummaryCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: 'rgba(139,92,246,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.22)',
    borderRadius: 14,
    padding: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  pmSummaryIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(139,92,246,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  pmSummaryCol: {
    flex: 1,
    gap: 2,
  },
  pmSummaryPlanLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: 'rgba(196,196,212,0.4)',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  pmSummaryPlanName: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  pmSummaryPlanSub: {
    fontSize: 10,
    color: 'rgba(196,196,212,0.45)',
  },
  pmSummaryPayLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: 'rgba(196,196,212,0.4)',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  pmSummaryPayAmt: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    color: '#F59E0B',
  },
  pmSummaryPaySub: {
    fontSize: 10,
    color: 'rgba(196,196,212,0.45)',
  },
  pmSummaryNetLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: 'rgba(196,196,212,0.4)',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  pmSummaryNetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
  },
  pmSummaryNetName: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  pmConfirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: '#7C3AED',
    borderRadius: borderRadius.full,
    paddingVertical: spacing.lg,
    shadowColor: 'rgba(124,58,237,0.55)',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 8,
  },
  pmConfirmBtnText: {
    fontSize: fontSize.md,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.5,
  },
});
