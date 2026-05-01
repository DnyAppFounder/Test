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
  ImagePlus,
  MessageCircle,
  Check,
  CircleAlert,
  Wallet,
  Bell,
  Mail,
  Clock,
  Plus,
  Search,
  Heart,
  MessageSquare,
  UserPlus,
  AtSign,
  Repeat2,
  SlidersHorizontal,
  BadgeCheck,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useWallet } from '@/contexts/WalletContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { SocialService, Post, PostComment, PROMOTE_TIERS, UserProfile } from '@/services/socialService';
import { colors, spacing, borderRadius, fontSize, elevation } from '@/constants/theme';
import PostCard, { timeAgo } from '@/components/PostCard';

type TopTab = 'feed' | 'profile' | 'messages' | 'notifications';
type PromoteStep = 'select' | 'confirm' | 'processing' | 'done';

export default function CommunityScreen() {
  const router = useRouter();
  const { activeAddress } = useWallet();
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<TopTab>('feed');
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

  const [msgSearch, setMsgSearch] = useState('');
  const [notifFilter, setNotifFilter] = useState<'all' | 'likes' | 'replies' | 'mentions' | 'follows'>('all');

  const walletAddress = activeAddress || 'anonymous';

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

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (profile?.id) SocialService.getFeed(profile.id).then(setPosts);
  }, [profile?.id]);

  const onRefresh = async () => {
    setRefreshing(true);
    if (profile?.id) {
      setPosts(await SocialService.getFeed(profile.id));
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
    setComments(await SocialService.getComments(postId));
    setCommentsLoading(false);
  };

  const handleAddComment = async () => {
    if (!newCommentContent.trim() || !profile || !selectedPostId) return;
    setSubmittingComment(true);
    await SocialService.addComment(selectedPostId, profile.id, newCommentContent.trim());
    setNewCommentContent('');
    setComments(await SocialService.getComments(selectedPostId));
    setSubmittingComment(false);
    await loadFeed();
  };

  const closeCommentsModal = () => {
    setShowCommentsModal(false);
    setSelectedPostId(null);
    setComments([]);
    setNewCommentContent('');
  };

  const selectedPost = posts.find(p => p.id === selectedPostId);
  const selectedTier = PROMOTE_TIERS.find(t => t.key === selectedTierKey);

  // Top tabs
  const TOP_TABS: { key: TopTab; label: string }[] = [
    { key: 'feed', label: 'Feed' },
    { key: 'profile', label: 'Profile' },
    { key: 'messages', label: 'Messages' },
    { key: 'notifications', label: 'Notifications' },
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
            onPromote={openPromoteModal}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIconWrap}>
              <MessageCircle size={44} color={colors.primary} strokeWidth={1.5} />
            </View>
            <Text style={styles.emptyTitle}>No posts yet</Text>
            <Text style={styles.emptySubtitle}>Be the first to share your thoughts</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => setShowCreateModal(true)}>
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
        </View>
      );
    }
    // Navigate to the profile page
    router.push(`/profile/${profile.id}`);
    return null;
  };

  const CONVERSATIONS = [
    { id: '1', username: 'CryptoKing', verified: true, lastMsg: "Let's catch the next pump 🔥", time: '2m', unread: true, avatar: 'https://images.pexels.com/photos/1681010/pexels-photo-1681010.jpeg?w=100' },
    { id: '2', username: 'MoonWalker', verified: false, lastMsg: 'We are early, so early...', time: '15m', unread: true, avatar: 'https://images.pexels.com/photos/1239291/pexels-photo-1239291.jpeg?w=100' },
    { id: '3', username: 'DawenArmy', verified: false, lastMsg: 'gm DAWEN family 💜', time: '1h', unread: true, avatar: 'https://images.pexels.com/photos/2379004/pexels-photo-2379004.jpeg?w=100' },
    { id: '4', username: 'LadyTrader', verified: false, lastMsg: 'Nice call on $DAWEN', time: '2h', unread: true, avatar: 'https://images.pexels.com/photos/415829/pexels-photo-415829.jpeg?w=100' },
    { id: '5', username: 'DeFiXplorer', verified: false, lastMsg: 'Alpha looks strong', time: '3h', unread: true, avatar: 'https://images.pexels.com/photos/1043471/pexels-photo-1043471.jpeg?w=100' },
    { id: '6', username: 'BullishBro', verified: false, lastMsg: "Let's go! Phase 4 soon 🚀", time: '4h', unread: true, avatar: 'https://images.pexels.com/photos/1222271/pexels-photo-1222271.jpeg?w=100' },
    { id: '7', username: 'TraderJoe', verified: false, lastMsg: 'Send you a chart', time: '6h', unread: true, avatar: 'https://images.pexels.com/photos/91227/pexels-photo-91227.jpeg?w=100' },
  ];

  const filteredConvos = CONVERSATIONS.filter(c =>
    c.username.toLowerCase().includes(msgSearch.toLowerCase()) ||
    c.lastMsg.toLowerCase().includes(msgSearch.toLowerCase())
  );

  const renderMessagesTab = () => (
    <ScrollView style={styles.msgContainer} contentContainerStyle={styles.msgContent} showsVerticalScrollIndicator={false}>
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

      {/* Conversation list */}
      <View style={styles.msgList}>
        {filteredConvos.map((conv, idx) => (
          <TouchableOpacity key={conv.id} style={[styles.convRow, idx < filteredConvos.length - 1 && styles.convRowBorder]} activeOpacity={0.75} onPress={() => router.push(`/chat/${conv.id}`)}>
            <View style={styles.convAvatarWrap}>
              <Image source={{ uri: conv.avatar }} style={styles.convAvatar} />
            </View>
            <View style={styles.convBody}>
              <View style={styles.convNameRow}>
                <Text style={styles.convUsername}>{conv.username}</Text>
                {conv.verified && (
                  <View style={styles.verifiedBadge}>
                    <Check size={9} color={colors.white} strokeWidth={3} />
                  </View>
                )}
              </View>
              <Text style={styles.convLastMsg} numberOfLines={1}>{conv.lastMsg}</Text>
            </View>
            <View style={styles.convMeta}>
              <Text style={styles.convTime}>{conv.time}</Text>
              {conv.unread && <View style={styles.unreadDot} />}
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );

  const NOTIF_TABS = [
    { key: 'all', label: 'All' },
    { key: 'likes', label: 'Likes' },
    { key: 'replies', label: 'Replies' },
    { key: 'mentions', label: 'Mentions' },
    { key: 'follows', label: 'Follows' },
  ] as const;

  const NOTIFICATIONS = [
    { id: '1', type: 'like', username: 'CryptoKing', action: 'liked your post', time: '2m', preview: 'Just aped into $DAWEN 🔥 The chart looks insane.', unread: true, avatar: 'https://images.pexels.com/photos/1681010/pexels-photo-1681010.jpeg?w=100' },
    { id: '2', type: 'reply', username: 'MoonWalker', action: 'replied to your post', time: '15m', preview: 'We are early, so early...', unread: true, avatar: 'https://images.pexels.com/photos/1239291/pexels-photo-1239291.jpeg?w=100' },
    { id: '3', type: 'follow', username: 'LadyTrader', action: 'followed you', time: '1h', preview: null, unread: true, avatar: 'https://images.pexels.com/photos/415829/pexels-photo-415829.jpeg?w=100' },
    { id: '4', type: 'mention', username: 'DeFiXplorer', action: 'mentioned you in a post', time: '2h', preview: 'Check this out @dawenmaster 🚀', unread: true, avatar: 'https://images.pexels.com/photos/1043471/pexels-photo-1043471.jpeg?w=100' },
    { id: '5', type: 'repost', username: 'BullishBro', action: 'reposted your post', time: '3h', preview: 'New partnerships incoming. Big things ahead...', unread: true, avatar: 'https://images.pexels.com/photos/1222271/pexels-photo-1222271.jpeg?w=100' },
    { id: '6', type: 'like', username: 'DawenArmy', action: 'liked your post', time: '4h', preview: 'gm DAWEN family 💜', unread: true, avatar: 'https://images.pexels.com/photos/2379004/pexels-photo-2379004.jpeg?w=100' },
    { id: '7', type: 'follow', username: 'TraderJoe', action: 'followed you', time: '6h', preview: null, unread: true, avatar: 'https://images.pexels.com/photos/91227/pexels-photo-91227.jpeg?w=100' },
    { id: '8', type: 'reply', username: 'MoonWalker', action: 'replied to your comment', time: '8h', preview: 'Absolutely! The future is bright ✨', unread: true, avatar: 'https://images.pexels.com/photos/1239291/pexels-photo-1239291.jpeg?w=100' },
  ];

  const filteredNotifs = NOTIFICATIONS.filter(n => {
    if (notifFilter === 'all') return true;
    if (notifFilter === 'likes') return n.type === 'like';
    if (notifFilter === 'replies') return n.type === 'reply';
    if (notifFilter === 'mentions') return n.type === 'mention';
    if (notifFilter === 'follows') return n.type === 'follow';
    return true;
  });

  const NotifIcon = ({ type }: { type: string }) => {
    if (type === 'like') return <Heart size={18} color="#ef4444" fill="#ef4444" />;
    if (type === 'reply') return <MessageSquare size={18} color={colors.primary} strokeWidth={2} />;
    if (type === 'follow') return <UserPlus size={18} color={colors.primary} strokeWidth={2} />;
    if (type === 'mention') return <AtSign size={18} color={colors.primary} strokeWidth={2} />;
    if (type === 'repost') return <Repeat2 size={18} color={colors.primary} strokeWidth={2} />;
    return <Bell size={18} color={colors.primary} />;
  };

  const renderNotificationsTab = () => (
    <ScrollView style={styles.notifContainer} contentContainerStyle={styles.notifContent} showsVerticalScrollIndicator={false}>
      {/* Filter tabs */}
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

      {/* Notification items */}
      <View style={styles.notifList}>
        {filteredNotifs.map((notif, idx) => (
          <TouchableOpacity key={notif.id} style={[styles.notifRow, idx < filteredNotifs.length - 1 && styles.notifRowBorder]} activeOpacity={0.75}>
            <View style={styles.notifIconWrap}>
              <NotifIcon type={notif.type} />
            </View>
            <Image source={{ uri: notif.avatar }} style={styles.notifAvatar} />
            <View style={styles.notifBody}>
              <Text style={styles.notifText} numberOfLines={2}>
                <Text style={styles.notifUsername}>{notif.username} </Text>
                <Text style={styles.notifAction}>{notif.action}</Text>
              </Text>
              <Text style={styles.notifTime}>{notif.time}</Text>
              {notif.preview && <Text style={styles.notifPreview} numberOfLines={1}>{notif.preview}</Text>}
            </View>
            {notif.unread && <View style={styles.unreadDot} />}
          </TouchableOpacity>
        ))}
      </View>
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
          <TouchableOpacity style={styles.composeBtn} activeOpacity={0.85}>
            <Plus size={22} color={colors.white} strokeWidth={2.5} />
          </TouchableOpacity>
        </View>
      ) : activeTab === 'notifications' ? (
        <View style={styles.msgHeader}>
          <Text style={styles.msgHeaderTitle}>Notifications</Text>
          <TouchableOpacity style={styles.notifFilterBtn} activeOpacity={0.85}>
            <SlidersHorizontal size={18} color={colors.primary} strokeWidth={2} />
          </TouchableOpacity>
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
            onPress={() => {
              if (tab.key === 'profile' && profile) {
                router.push(`/profile/${profile.id}`);
                return;
              }
              setActiveTab(tab.key);
            }}
            activeOpacity={0.8}
          >
            <Text style={[styles.topTabText, activeTab === tab.key && styles.topTabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab content */}
      <View style={styles.tabContent}>
        {renderActiveTab()}
      </View>

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
                {profile?.username || walletAddress.slice(0, 8) + '...'}
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
                  <Text style={styles.noCommentsText}>No comments yet</Text>
                </View>
              ) : (
                <View style={{ paddingBottom: spacing.lg }}>
                  {comments.map(item => (
                    <View key={item.id} style={styles.commentItem}>
                      <View style={styles.avatarXS}>
                        {item.author?.avatar_url
                          ? <Image source={{ uri: item.author.avatar_url }} style={styles.avatarXSImg} />
                          : <User size={12} color={colors.textMuted} />
                        }
                      </View>
                      <View style={styles.commentBody}>
                        <View style={styles.commentMeta}>
                          <Text style={styles.commentAuthor}>
                            {item.author?.username || `${item.author?.wallet_address?.slice(0, 6)}...`}
                          </Text>
                          <Text style={styles.commentTime}>{timeAgo(item.created_at)}</Text>
                        </View>
                        <Text style={styles.commentText}>{item.content}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>

            <View style={styles.commentInputRow}>
              <TextInput
                style={styles.commentInput}
                placeholder="Add a comment..."
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
});
