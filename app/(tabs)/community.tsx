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
  Alert,
} from 'react-native';
import {
  Send,
  X,
  User,
  ImagePlus,
  MessageCircle,
  Check,
  CircleAlert,
  Wallet,
  Bell,
  Clock,
  Plus,
  Search,
  Heart,
  MessageSquare,
  UserPlus,
  AtSign,
  Repeat2,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useWallet } from '@/contexts/WalletContext';
import { SocialService, Post, PostComment, PROMOTE_TIERS, Notification, Conversation } from '@/services/socialService';
import { useProfile } from '@/contexts/ProfileContext';
import { colors, spacing, borderRadius, fontSize, elevation } from '@/constants/theme';
import PostCard, { timeAgo } from '@/components/PostCard';

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
  const [selectedTierKey, setSelectedTierKey] = useState<string | null>(null);

  const [showCommentsModal, setShowCommentsModal] = useState(false);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [newCommentContent, setNewCommentContent] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [replyingToComment, setReplyingToComment] = useState<PostComment | null>(null);

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

  const loadFeed = useCallback(async () => {
    try {
      const feedData = await SocialService.getFeed(profile?.id);
      setPosts(feedData);
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
      setUnreadNotifCount(data.filter(n => !n.read).length);
    } catch (e) {
      console.warn('[Community] loadNotifications error:', e);
    } finally {
      setNotifLoading(false);
    }
  }, [profile?.id]);

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

  const loadInitialFeed = useCallback(async () => {
    setLoading(true);
    try {
      const feedData = await SocialService.getFeed(profile?.id);
      setPosts(feedData);
    } catch (e) {
      console.warn('[Community] loadInitialFeed error:', e);
    } finally {
      setLoading(false);
    }
  }, [profile?.id]);

  useEffect(() => { loadInitialFeed(); }, [loadInitialFeed]);

  useEffect(() => {
    if (activeTab === 'notifications') { loadNotifications(); clearUnreadNotifCount(); }
    if (activeTab === 'messages') loadConversations();
    if (activeTab === 'profile' && profile?.id) {
      setProfilePostsLoading(true);
      Promise.all([
        SocialService.getUserPosts(profile.id),
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
    setSelectedTierKey(null);
    setShowPromoteModal(true);
  };

  const handleSelectTier = (tierKey: string) => {
    setSelectedTierKey(tierKey);
    setPromoteStep('confirm');
  };

  const handleConfirmPromotion = async () => {
    // Promotion payment not configured — show unavailable message
    Alert.alert(
      'Promotion Not Configured',
      'Promotion is not configured yet. Payment processing will be available in a future update.',
      [{ text: 'OK' }]
    );
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
    if (!newCommentContent.trim() || !profile || !selectedPostId) return;
    setSubmittingComment(true);
    try {
      await SocialService.addComment(
        selectedPostId,
        profile.id,
        newCommentContent.trim(),
        replyingToComment?.id
      );
      setNewCommentContent('');
      setReplyingToComment(null);
      const updated = await SocialService.getComments(selectedPostId, profile.id);
      setComments(updated);
      await loadFeed();
    } catch (e) {
      console.warn('[Community] addComment error:', e);
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

  const selectedPost = posts.find(p => p.id === selectedPostId);
  const selectedTier = PROMOTE_TIERS.find(t => t.key === selectedTierKey);

  // Top tabs
  const TOP_TABS: { key: TopTab; label: string }[] = [
    { key: 'feed', label: 'Feed' },
    { key: 'profile', label: 'Profile' },
    { key: 'messages', label: 'Messages' },
    { key: 'notifications', label: 'Alerts' },
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

    const displayName = profile.username || (activeAddress ? `${activeAddress.slice(0, 6)}...${activeAddress.slice(-4)}` : 'Anonymous');

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
              <Text style={styles.profileCardName} numberOfLines={1}>{displayName}</Text>
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
            <View style={styles.profileCardStat}>
              <Text style={styles.profileCardStatValue}>{profileFollowers}</Text>
              <Text style={styles.profileCardStatLabel}>Followers</Text>
            </View>
            <View style={styles.profileCardStatDivider} />
            <View style={styles.profileCardStat}>
              <Text style={styles.profileCardStatValue}>{profileFollowing}</Text>
              <Text style={styles.profileCardStatLabel}>Following</Text>
            </View>
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
                    {otherUser.is_verified && (
                      <View style={styles.verifiedBadge}>
                        <Check size={9} color={colors.white} strokeWidth={3} />
                      </View>
                    )}
                  </View>
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
      {/* Filter tabs + mark all read */}
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
        {unreadNotifCount > 0 && (
          <TouchableOpacity onPress={handleMarkNotifsRead} style={styles.markReadBtn}>
            <Text style={styles.markReadText}>Mark all read</Text>
          </TouchableOpacity>
        )}
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
              || (notif.actor?.wallet_address ? `${notif.actor.wallet_address.slice(0, 6)}...` : 'Someone');
            return (
          <TouchableOpacity key={notif.id} style={[styles.notifRow, idx < filteredNotifs.length - 1 && styles.notifRowBorder,
            !notif.read && styles.notifRowUnread]} activeOpacity={0.75}>
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
      {/* Header */}
      {activeTab === 'messages' ? (
        <View style={styles.msgHeader}>
          <Text style={styles.msgHeaderTitle}>Messages</Text>
          <TouchableOpacity
            style={styles.composeBtn}
            activeOpacity={0.85}
            onPress={() => { setComposeSearch(''); setComposeResults([]); setShowComposeModal(true); }}
          >
            <Plus size={22} color={colors.white} strokeWidth={2.5} />
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
          <View>
            <Text style={styles.headerTitle}>Dawen Pulse</Text>
            <Text style={styles.headerSubtitle}>Connect with traders worldwide</Text>
          </View>
          {activeTab === 'feed' && (
            <TouchableOpacity style={styles.composeBtn} onPress={() => router.push('/create-post')} activeOpacity={0.85}>
              <Send size={20} color={colors.white} strokeWidth={2.5} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Top tabs */}
      <View style={styles.topTabs}>
        {TOP_TABS.map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.topTab, activeTab === tab.key && styles.topTabActive]}
            onPress={() => setActiveTab(tab.key)}
            activeOpacity={0.8}
          >
            <View style={styles.topTabInner}>
              <Text style={[styles.topTabText, activeTab === tab.key && styles.topTabTextActive]}>
                {tab.label}
              </Text>
              {tab.key === 'notifications' && unreadNotifCount > 0 && (
                <View style={styles.topTabBadge}>
                  <Text style={styles.topTabBadgeText}>{unreadNotifCount > 99 ? '99+' : unreadNotifCount}</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab content */}
      <View style={styles.tabContent}>
        {renderActiveTab()}
      </View>

      {/* Delete Confirmation Modal */}
      <Modal visible={deleteConfirmId !== null} animationType="fade" transparent>
        <View style={styles.deleteOverlay}>
          <View style={styles.deleteModal}>
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
                        <Text style={styles.convUsername}>{name}</Text>
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
                {profile?.username || (activeAddress ? activeAddress.slice(0, 8) + '...' : 'Anonymous')}
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
                            <Text style={styles.commentTime}>{timeAgo(item.created_at)}</Text>
                          </View>
                          <Text style={styles.commentText}>{item.content}</Text>
                          <View style={styles.commentActions}>
                            <TouchableOpacity style={styles.commentActionBtn} onPress={() => handleCommentLike(item.id)} activeOpacity={0.7}>
                              <Heart size={13} color={item.liked_by_user ? '#ef4444' : colors.textMuted} fill={item.liked_by_user ? '#ef4444' : 'none'} strokeWidth={2} />
                              {(item.likes_count || 0) > 0 && <Text style={[styles.commentActionText, item.liked_by_user && { color: '#ef4444' }]}>{item.likes_count}</Text>}
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.commentActionBtn} onPress={() => setReplyingToComment(item)} activeOpacity={0.7}>
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
            <View style={styles.commentInputRow}>
              <TextInput
                style={styles.commentInput}
                placeholder={replyingToComment ? `Reply to ${replyingToComment.author?.username || 'user'}...` : 'Add a comment...'}
                placeholderTextColor={colors.textMuted}
                value={newCommentContent}
                onChangeText={setNewCommentContent}
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
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />

            {promoteStep === 'select' && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Promote Post</Text>
                  <TouchableOpacity onPress={closePromoteModal}>
                    <X size={22} color={colors.textPrimary} />
                  </TouchableOpacity>
                </View>
                <Text style={styles.promoteDesc}>
                  Boost your post to reach more users. Promoted posts appear at the top of the feed.
                </Text>
                {PROMOTE_TIERS.map(tier => (
                  <TouchableOpacity key={tier.key} style={styles.tierCard} onPress={() => handleSelectTier(tier.key)}>
                    <View style={styles.tierInfo}>
                      <View style={styles.tierIcon}>
                        <Clock size={16} color={colors.primary} />
                      </View>
                      <View>
                        <Text style={styles.tierLabel}>{tier.label}</Text>
                        <Text style={styles.tierSub}>{tier.hours}h visibility boost</Text>
                      </View>
                    </View>
                    <View>
                      <Text style={styles.tierPrice}>${tier.price}</Text>
                      <Text style={styles.tierCurrency}>USD</Text>
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
                    <X size={22} color={colors.textPrimary} />
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
                    <View style={styles.paymentBadge}>
                      <Wallet size={13} color={colors.primary} />
                      <Text style={styles.paymentBadgeText}>Wallet</Text>
                    </View>
                  </View>
                </View>
                <View style={styles.mockNotice}>
                  <CircleAlert size={14} color={colors.warning} />
                  <Text style={styles.mockNoticeText}>
                    SIMULATED: Payment is mocked for demo. In production this charges your connected wallet.
                  </Text>
                </View>
                <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirmPromotion}>
                  <Text style={styles.confirmBtnText}>Pay ${selectedTier.price} & Promote</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.cancelLink} onPress={() => setPromoteStep('select')}>
                  <Text style={styles.cancelLinkText}>Go back</Text>
                </TouchableOpacity>
              </>
            )}

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
                <Text style={styles.processingTitle}>Promotion Active</Text>
                <Text style={styles.processingSubtitle}>
                  Your post appears at the top for {selectedTier?.label}
                </Text>
                <TouchableOpacity style={styles.doneBtn} onPress={closePromoteModal}>
                  <Text style={styles.doneBtnText}>Done</Text>
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
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xxl,
    paddingTop: 56,
    paddingBottom: spacing.lg,
    backgroundColor: '#0A0A0F',
  },
  headerTitle: {
    fontSize: 30,
    fontWeight: '900',
    color: colors.textPrimary,
    letterSpacing: -0.5,
    marginBottom: 3,
  },
  headerSubtitle: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  composeBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...elevation.lg,
  },
  topTabs: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.xs,
    backgroundColor: '#0A0A0F',
  },
  topTab: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: borderRadius.md,
    backgroundColor: '#12121A',
  },
  topTabActive: {
    backgroundColor: colors.primary,
  },
  topTabText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
  },
  topTabTextActive: {
    color: colors.white,
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
    paddingTop: spacing.xs,
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
    backgroundColor: colors.primaryMuted,
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
    color: colors.textMuted,
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
  },
  emptyBtnText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.white,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#12121A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.xxl,
    maxHeight: '85%',
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
    backgroundColor: '#1E1E2E',
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
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  imageUrlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#1A1A28',
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
    color: colors.textMuted,
  },
  postBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxl,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    minWidth: 90,
  },
  postBtnDisabled: {
    opacity: 0.5,
  },
  postBtnText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.white,
  },
  // Comments
  commentPostPreview: {
    backgroundColor: '#1A1A28',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
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
    color: colors.textMuted,
  },
  commentPreviewText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  noComments: {
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
  },
  noCommentsText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
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
    backgroundColor: '#1E1E2E',
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
    fontWeight: '600',
    color: colors.textPrimary,
  },
  commentTime: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  commentText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  replyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(139,92,246,0.08)',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(139,92,246,0.15)',
  },
  replyBannerText: {
    fontSize: 13,
    color: colors.textMuted,
  },
  replyBannerName: {
    fontWeight: '700',
    color: colors.primary,
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
    color: colors.textMuted,
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
    backgroundColor: '#1E1E2E',
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
    borderTopColor: colors.surfaceBorder,
    paddingTop: spacing.md,
    marginTop: spacing.sm,
  },
  commentInput: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    backgroundColor: '#1A1A28',
    borderRadius: borderRadius.full,
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
  },
  commentSendBtnDisabled: {
    opacity: 0.5,
  },
  // Promote
  promoteDesc: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
    lineHeight: 22,
  },
  tierCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1A1A28',
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.md,
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
    backgroundColor: colors.primaryMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tierLabel: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  tierSub: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  tierPrice: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.primary,
    textAlign: 'right',
  },
  tierCurrency: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textAlign: 'right',
  },
  confirmCard: {
    backgroundColor: '#1A1A28',
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
  },
  paymentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primaryMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  paymentBadgeText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.primary,
  },
  mockNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.warningMuted,
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
  confirmBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginBottom: spacing.md,
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
    color: colors.textMuted,
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
    color: colors.textSecondary,
    textAlign: 'center',
  },
  doneIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.successMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  doneBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxxl,
    borderRadius: borderRadius.md,
    marginTop: spacing.lg,
  },
  doneBtnText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.white,
  },

  // Messages
  msgHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xxl,
    paddingTop: 56,
    paddingBottom: spacing.lg,
    backgroundColor: '#0A0A0F',
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
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.surfaceBorderLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  msgContainer: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  msgContent: {
    paddingBottom: 40,
  },
  msgSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#12121A',
    borderRadius: 14,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  msgSearchInput: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.textPrimary,
  },
  msgList: {
    marginHorizontal: spacing.lg,
    backgroundColor: '#12121A',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
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
    borderBottomColor: 'rgba(139,92,246,0.07)',
  },
  convAvatarWrap: {
    position: 'relative',
  },
  convAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.surfaceElevated,
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
    color: colors.textSecondary,
  },
  convMeta: {
    alignItems: 'flex-end',
    gap: 6,
  },
  convTime: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '500',
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },

  // Notifications
  notifContainer: {
    flex: 1,
    backgroundColor: '#0A0A0F',
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
    paddingVertical: 9,
    paddingHorizontal: spacing.md,
    borderRadius: 20,
    backgroundColor: '#12121A',
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  notifFilterTabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  notifFilterText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
  },
  notifFilterTextActive: {
    color: colors.white,
  },
  notifList: {
    marginHorizontal: spacing.lg,
    backgroundColor: '#12121A',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
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
    borderBottomColor: 'rgba(139,92,246,0.07)',
  },
  notifIconWrap: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.surfaceElevated,
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
    color: colors.textSecondary,
  },
  notifTime: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '500',
    marginTop: 1,
  },
  notifPreview: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 3,
  },
  notifRowUnread: {
    backgroundColor: 'rgba(139,92,246,0.05)',
  },
  notifAvatarFallback: {
    backgroundColor: colors.surfaceElevated,
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
    color: colors.primary,
  },
  msgHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  unreadBadge: {
    backgroundColor: colors.primary,
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
    color: colors.white,
  },
  convAvatarFallback: {
    backgroundColor: colors.surfaceElevated,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Inline profile tab
  profileCard: {
    margin: spacing.lg,
    backgroundColor: '#12121A',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  profileCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  profileAvatarLg: {
    width: 64,
    height: 64,
    borderRadius: 32,
    overflow: 'hidden',
  },
  profileAvatarLgImg: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  profileAvatarLgFallback: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surfaceElevated,
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
  },
  profileCardAddr: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontFamily: 'monospace',
  },
  profileCardBio: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  profileCardStats: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
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
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  profileCardStatDivider: {
    width: 1,
    height: 32,
    backgroundColor: colors.surfaceBorder,
  },
  viewFullProfileBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  viewFullProfileBtnText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.white,
  },
  profileSectionHeader: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  profileSectionTitle: {
    fontSize: fontSize.md,
    fontWeight: '800',
    color: colors.textPrimary,
  },

  // Top tab badge
  topTabInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
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

  // Delete confirmation
  deleteOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
  },
  deleteModal: {
    backgroundColor: '#12121A',
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
    backgroundColor: 'rgba(239,68,68,0.12)',
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
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  deleteConfirmBtn: {
    backgroundColor: '#ef4444',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    width: '100%',
    marginTop: spacing.sm,
    minHeight: 46,
    justifyContent: 'center',
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
    color: colors.textMuted,
    fontWeight: '600',
  },
});
