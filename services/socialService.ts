import { supabase } from '@/lib/supabase';

export interface UserProfile {
  id: string;
  wallet_address: string;
  username: string | null;
  bio: string;
  avatar_url: string | null;
  banner_url?: string | null;
  token_balance: number;
  is_verified: boolean;
  verified_basic: boolean;
  is_premium: boolean;
  premium_expires_at: string | null;
  premium_expiration?: string | null;
  premium_tier: 'sol' | 'dawen' | null;
  created_at: string;
  twitter_url?: string | null;
  telegram_url?: string | null;
  discord_url?: string | null;
}

export interface Post {
  id: string;
  author_id: string;
  content: string;
  image_url: string | null;
  media_url: string | null;
  likes_count: number;
  comments_count: number;
  reposts_count: number;
  is_promoted: boolean;
  promoted_until: string | null;
  promoted_tier: string | null;
  created_at: string;
  // Token attachment
  token_address: string | null;
  token_symbol: string | null;
  token_price: number | null;
  token_change_24h: number | null;
  token_logo_uri: string | null;
  // Post settings
  visibility: 'public' | 'followers';
  who_can_reply: 'everyone' | 'followers' | 'mentioned';
  allow_quotes: boolean;
  language: string;
  quote_post_id: string | null;
  // Computed
  author?: UserProfile;
  liked_by_user?: boolean;
  reposted_by_user?: boolean;
  reposted_by?: UserProfile;
  is_repost?: boolean;
  quote_post?: Post | null;
}

export interface Notification {
  id: string;
  user_id: string;
  actor_id: string | null;
  type: 'like' | 'comment' | 'follow' | 'mention' | 'repost' | 'message';
  post_id: string | null;
  message: string;
  read: boolean;
  created_at: string;
  actor?: UserProfile;
}

export interface NotificationSettings {
  id: string;
  user_id: string;
  likes: boolean;
  comments: boolean;
  follows: boolean;
  messages: boolean;
  mentions: boolean;
  reposts: boolean;
}

export interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  read: boolean;
  created_at: string;
  sender?: UserProfile;
  receiver?: UserProfile;
}

export interface Conversation {
  otherUser: UserProfile;
  lastMessage: Message;
  unreadCount: number;
}

export interface PostComment {
  id: string;
  post_id: string;
  author_id: string;
  content: string;
  created_at: string;
  parent_comment_id: string | null;
  likes_count: number;
  replies_count: number;
  author?: UserProfile;
  liked_by_user?: boolean;
  replies?: PostComment[];
}

export const PROMOTE_TIERS = [
  { key: '1h', label: '1 Hour', hours: 1, solPrice: 0.05 },
  { key: '3h', label: '3 Hours', hours: 3, solPrice: 0.12 },
  { key: '24h', label: '24 Hours', hours: 24, solPrice: 0.5 },
  { key: '3d', label: '3 Days', hours: 72, solPrice: 1.0 },
  { key: '7d', label: '7 Days', hours: 168, solPrice: 2.0 },
];

export class SocialService {
  static async getOrCreateProfile(walletAddress: string): Promise<UserProfile | null> {
    const { data: existing } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('wallet_address', walletAddress)
      .maybeSingle();

    if (existing) return existing;

    const { data: created, error } = await supabase
      .from('user_profiles')
      .insert({ wallet_address: walletAddress })
      .select()
      .maybeSingle();

    if (error) return null;
    return created;
  }

  static async getProfile(profileId: string): Promise<UserProfile | null> {
    const { data } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', profileId)
      .maybeSingle();
    return data;
  }

  static async updateProfile(
    profileId: string,
    updates: {
      username?: string;
      bio?: string;
      avatar_url?: string;
      banner_url?: string;
      twitter_url?: string | null;
      telegram_url?: string | null;
      discord_url?: string | null;
      [key: string]: unknown;
    }
  ): Promise<UserProfile | null> {
    const { data } = await supabase
      .from('user_profiles')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', profileId)
      .select()
      .maybeSingle();
    return data;
  }

  /**
   * Upload a profile picture to Supabase Storage and update the profile.
   * Returns the public URL that persists permanently.
   */
  static async uploadAvatar(
    walletAddress: string,
    imageUri: string,
    profileId: string
  ): Promise<string | null> {
    try {
      const fileName = `${walletAddress}/avatar_${Date.now()}.jpg`;

      // Fetch the image data
      const response = await fetch(imageUri);
      const blob = await response.blob();

      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from('avatars')
        .upload(fileName, blob, {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (error) {
        console.error('[Avatar] Upload error:', error);
        return null;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(data.path);

      const publicUrl = urlData.publicUrl;

      // Update profile with the permanent URL
      await this.updateProfile(profileId, { avatar_url: publicUrl });

      return publicUrl;
    } catch (error) {
      console.error('[Avatar] Upload failed:', error);
      return null;
    }
  }

  static async getFeed(currentUserId?: string, limit = 20, offset = 0): Promise<Post[]> {
    const now = new Date();

    const { data: posts } = await supabase
      .from('posts')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit * 2);

    if (!posts || posts.length === 0) return [];

    const scoredPosts = posts.map((post) => {
      let score = 0;

      if (post.is_promoted && post.promoted_until) {
        const promotedUntil = new Date(post.promoted_until);
        if (promotedUntil > now) {
          score += 10000;

          if (post.promoted_tier === '1w') score += 1000;
          else if (post.promoted_tier === '24h') score += 500;
          else if (post.promoted_tier === '10h') score += 200;
          else if (post.promoted_tier === '1h') score += 100;
        }
      }

      const ageInHours = (now.getTime() - new Date(post.created_at).getTime()) / (1000 * 60 * 60);
      const recencyScore = Math.max(0, 100 - ageInHours);
      score += recencyScore;

      const engagementScore = (post.likes_count * 2) + (post.comments_count * 3) + (post.reposts_count * 4);
      score += engagementScore;

      return { ...post, _score: score };
    });

    const sortedPosts = scoredPosts.sort((a, b) => b._score - a._score).slice(0, limit);

    const authorIds = [...new Set(sortedPosts.map((p: any) => p.author_id))];
    const { data: authors } = await supabase
      .from('user_profiles')
      .select('*')
      .in('id', authorIds);

    const authorMap = new Map((authors || []).map((a: UserProfile) => [a.id, a]));

    let likedSet = new Set<string>();
    let repostedSet = new Set<string>();

    if (currentUserId) {
      const postIds = sortedPosts.map((p: any) => p.id);

      const [likesRes, repostsRes] = await Promise.all([
        supabase
          .from('post_likes')
          .select('post_id')
          .eq('user_id', currentUserId)
          .in('post_id', postIds),
        supabase
          .from('reposts')
          .select('post_id')
          .eq('user_id', currentUserId)
          .in('post_id', postIds),
      ]);

      likedSet = new Set((likesRes.data || []).map((l: { post_id: string }) => l.post_id));
      repostedSet = new Set((repostsRes.data || []).map((r: { post_id: string }) => r.post_id));
    }

    return sortedPosts.map((p: any) => ({
      ...p,
      is_promoted: p.is_promoted && p.promoted_until ? new Date(p.promoted_until) > now : false,
      author: authorMap.get(p.author_id),
      liked_by_user: likedSet.has(p.id),
      reposted_by_user: repostedSet.has(p.id),
    }));
  }

  static async getUserPosts(authorId: string): Promise<Post[]> {
    const { data } = await supabase
      .from('posts')
      .select('*')
      .eq('author_id', authorId)
      .order('created_at', { ascending: false });

    if (!data) return [];

    const authorIds = [...new Set(data.map((p: Post) => p.author_id))];
    const { data: authors } = await supabase
      .from('user_profiles')
      .select('*')
      .in('id', authorIds);
    const authorMap = new Map((authors || []).map((a: UserProfile) => [a.id, a]));

    return data.map((p: Post) => ({
      ...p,
      author: authorMap.get(p.author_id),
    }));
  }

  static async getUserReposts(userId: string): Promise<Post[]> {
    const { data: repostData } = await supabase
      .from('reposts')
      .select('post_id, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (!repostData || repostData.length === 0) return [];

    const postIds = repostData.map((r: { post_id: string }) => r.post_id);
    const { data: posts } = await supabase
      .from('posts')
      .select('*')
      .in('id', postIds);

    if (!posts) return [];

    const authorIds = [...new Set(posts.map((p: Post) => p.author_id))];
    const { data: authors } = await supabase
      .from('user_profiles')
      .select('*')
      .in('id', authorIds);
    const authorMap = new Map((authors || []).map((a: UserProfile) => [a.id, a]));

    return posts.map((p: Post) => ({
      ...p,
      author: authorMap.get(p.author_id),
      is_repost: true,
    }));
  }

  static async createPost(
    authorId: string,
    content: string,
    options?: {
      imageUri?: string;
      mediaUrl?: string;
      tokenAddress?: string;
      tokenSymbol?: string;
      tokenPrice?: number;
      tokenChange24h?: number;
      tokenLogoUri?: string;
      visibility?: 'public' | 'followers';
      whoCanReply?: 'everyone' | 'followers' | 'mentioned';
      allowQuotes?: boolean;
      language?: string;
      quotePostId?: string;
    }
  ): Promise<Post | null> {
    let mediaUrl = options?.mediaUrl || null;

    // Upload image if a local URI was provided
    if (options?.imageUri && !options.mediaUrl) {
      const uploaded = await this.uploadPostMedia(authorId, options.imageUri);
      if (uploaded) mediaUrl = uploaded;
    }

    const { data } = await supabase
      .from('posts')
      .insert({
        author_id: authorId,
        content,
        image_url: mediaUrl,
        media_url: mediaUrl,
        token_address: options?.tokenAddress || null,
        token_symbol: options?.tokenSymbol || null,
        token_price: options?.tokenPrice ?? null,
        token_change_24h: options?.tokenChange24h ?? null,
        token_logo_uri: options?.tokenLogoUri ?? null,
        visibility: options?.visibility ?? 'public',
        who_can_reply: options?.whoCanReply ?? 'everyone',
        allow_quotes: options?.allowQuotes ?? true,
        language: options?.language ?? 'en',
        quote_post_id: options?.quotePostId ?? null,
      })
      .select()
      .maybeSingle();

    if (data) {
      await this.notifyMentions(content, authorId, data.id);
    }

    return data;
  }

  static async uploadPostMedia(userId: string, imageUri: string): Promise<string | null> {
    try {
      const ext = imageUri.split('.').pop()?.split('?')[0] || 'jpg';
      const fileName = `${userId}/post_${Date.now()}.${ext}`;
      const response = await fetch(imageUri);
      const blob = await response.blob();
      const { data, error } = await supabase.storage
        .from('post-media')
        .upload(fileName, blob, { contentType: blob.type || 'image/jpeg', upsert: false });
      if (error) { console.error('[PostMedia] Upload error:', error); return null; }
      const { data: urlData } = supabase.storage.from('post-media').getPublicUrl(data.path);
      return urlData.publicUrl;
    } catch (e) {
      console.error('[PostMedia] Upload failed:', e);
      return null;
    }
  }

  static async toggleLike(postId: string, userId: string): Promise<boolean> {
    const { data: existing } = await supabase
      .from('post_likes')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      await supabase.from('post_likes').delete().eq('id', existing.id);
      const { data: post } = await supabase
        .from('posts')
        .select('likes_count')
        .eq('id', postId)
        .maybeSingle();
      if (post) {
        await supabase
          .from('posts')
          .update({ likes_count: Math.max(0, (post.likes_count || 0) - 1) })
          .eq('id', postId);
      }
      return false;
    }

    await supabase.from('post_likes').insert({ post_id: postId, user_id: userId });
    const { data: post } = await supabase
      .from('posts')
      .select('likes_count, author_id')
      .eq('id', postId)
      .maybeSingle();
    if (post) {
      await supabase
        .from('posts')
        .update({ likes_count: (post.likes_count || 0) + 1 })
        .eq('id', postId);
      // Notify post author
      await this.createNotification(post.author_id, userId, 'like', postId, 'liked your post');
    }
    return true;
  }

  static async toggleRepost(postId: string, userId: string): Promise<boolean> {
    const { data: existing } = await supabase
      .from('reposts')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      await supabase.from('reposts').delete().eq('id', existing.id);
      const { data: post } = await supabase
        .from('posts')
        .select('reposts_count')
        .eq('id', postId)
        .maybeSingle();
      if (post) {
        await supabase
          .from('posts')
          .update({ reposts_count: Math.max(0, (post.reposts_count || 0) - 1) })
          .eq('id', postId);
      }
      return false;
    }

    await supabase.from('reposts').insert({ post_id: postId, user_id: userId });
    const { data: post } = await supabase
      .from('posts')
      .select('reposts_count, author_id')
      .eq('id', postId)
      .maybeSingle();
    if (post) {
      await supabase
        .from('posts')
        .update({ reposts_count: (post.reposts_count || 0) + 1 })
        .eq('id', postId);
      await this.createNotification(post.author_id, userId, 'repost', postId, 'reposted your post');
    }
    return true;
  }

  static async getComments(postId: string, currentUserId?: string): Promise<PostComment[]> {
    const { data: comments } = await supabase
      .from('post_comments')
      .select('*')
      .eq('post_id', postId)
      .is('parent_comment_id', null)
      .order('created_at', { ascending: true });

    if (!comments || comments.length === 0) return [];

    const commentIds = comments.map((c: any) => c.id);

    // Load replies for all top-level comments
    const { data: replies } = await supabase
      .from('post_comments')
      .select('*')
      .in('parent_comment_id', commentIds)
      .order('created_at', { ascending: true });

    const allComments = [...comments, ...(replies || [])];
    const authorIds = [...new Set(allComments.map((c: any) => c.author_id))];
    const { data: authors } = await supabase
      .from('user_profiles')
      .select('*')
      .in('id', authorIds);

    const authorMap = new Map((authors || []).map((a: UserProfile) => [a.id, a]));

    // Load liked comment ids for current user
    let likedSet = new Set<string>();
    if (currentUserId && allComments.length > 0) {
      const allIds = allComments.map((c: any) => c.id);
      const { data: liked } = await supabase
        .from('comment_likes')
        .select('comment_id')
        .eq('user_id', currentUserId)
        .in('comment_id', allIds);
      likedSet = new Set((liked || []).map((l: any) => l.comment_id));
    }

    const replyMap = new Map<string, PostComment[]>();
    for (const reply of (replies || [])) {
      const parentId = reply.parent_comment_id;
      if (!replyMap.has(parentId)) replyMap.set(parentId, []);
      replyMap.get(parentId)!.push({
        ...reply,
        author: authorMap.get(reply.author_id),
        liked_by_user: likedSet.has(reply.id),
        replies: [],
      });
    }

    return comments.map((c: any) => ({
      ...c,
      author: authorMap.get(c.author_id),
      liked_by_user: likedSet.has(c.id),
      replies: replyMap.get(c.id) || [],
    }));
  }

  static async addComment(
    postId: string,
    authorId: string,
    content: string,
    parentCommentId?: string
  ): Promise<PostComment | null> {
    const { data } = await supabase
      .from('post_comments')
      .insert({
        post_id: postId,
        author_id: authorId,
        content,
        parent_comment_id: parentCommentId || null,
      })
      .select()
      .maybeSingle();

    if (data) {
      await this.notifyMentions(content, authorId, postId);

      if (parentCommentId) {
        const { data: parent } = await supabase
          .from('post_comments')
          .select('replies_count, author_id')
          .eq('id', parentCommentId)
          .maybeSingle();
        if (parent) {
          await supabase
            .from('post_comments')
            .update({ replies_count: (parent.replies_count || 0) + 1 })
            .eq('id', parentCommentId);
          await this.createNotification(parent.author_id, authorId, 'comment', postId, 'replied to your comment');
        }
      } else {
        const { data: post } = await supabase
          .from('posts')
          .select('comments_count, author_id')
          .eq('id', postId)
          .maybeSingle();
        if (post) {
          await supabase
            .from('posts')
            .update({ comments_count: (post.comments_count || 0) + 1 })
            .eq('id', postId);
          await this.createNotification(post.author_id, authorId, 'comment', postId, 'commented on your post');
        }
      }
    }

    return data;
  }

  static async toggleCommentLike(commentId: string, userId: string): Promise<boolean> {
    const { data: existing } = await supabase
      .from('comment_likes')
      .select('id')
      .eq('comment_id', commentId)
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      await supabase.from('comment_likes').delete().eq('id', existing.id);
      const { data: comment } = await supabase
        .from('post_comments')
        .select('likes_count')
        .eq('id', commentId)
        .maybeSingle();
      if (comment) {
        await supabase
          .from('post_comments')
          .update({ likes_count: Math.max(0, (comment.likes_count || 0) - 1) })
          .eq('id', commentId);
      }
      return false;
    }

    await supabase.from('comment_likes').insert({ comment_id: commentId, user_id: userId });
    const { data: comment } = await supabase
      .from('post_comments')
      .select('likes_count, author_id')
      .eq('id', commentId)
      .maybeSingle();
    if (comment) {
      await supabase
        .from('post_comments')
        .update({ likes_count: (comment.likes_count || 0) + 1 })
        .eq('id', commentId);
    }
    return true;
  }

  static async promotePost(postId: string, tierKey: string): Promise<boolean> {
    const tier = PROMOTE_TIERS.find((t) => t.key === tierKey);
    if (!tier) return false;

    const promotedUntil = new Date();
    promotedUntil.setHours(promotedUntil.getHours() + tier.hours);

    const { error } = await supabase
      .from('posts')
      .update({
        is_promoted: true,
        promoted_until: promotedUntil.toISOString(),
        promoted_tier: tierKey,
      })
      .eq('id', postId);

    return !error;
  }

  static async getFollowerCount(profileId: string): Promise<number> {
    const { count } = await supabase
      .from('follows')
      .select('*', { count: 'exact', head: true })
      .eq('following_id', profileId);
    return count || 0;
  }

  static async getFollowingCount(profileId: string): Promise<number> {
    const { count } = await supabase
      .from('follows')
      .select('*', { count: 'exact', head: true })
      .eq('follower_id', profileId);
    return count || 0;
  }

  static async isFollowing(followerId: string, followingId: string): Promise<boolean> {
    const { data } = await supabase
      .from('follows')
      .select('id')
      .eq('follower_id', followerId)
      .eq('following_id', followingId)
      .maybeSingle();
    return !!data;
  }

  static async toggleFollow(followerId: string, followingId: string): Promise<boolean> {
    const { data: existing } = await supabase
      .from('follows')
      .select('id')
      .eq('follower_id', followerId)
      .eq('following_id', followingId)
      .maybeSingle();

    if (existing) {
      await supabase.from('follows').delete().eq('id', existing.id);
      return false;
    }

    await supabase.from('follows').insert({ follower_id: followerId, following_id: followingId });

    // Create follow notification
    await this.createNotification(followingId, followerId, 'follow', null,
      `started following you`);

    return true;
  }

  static async deletePost(postId: string, authorId: string): Promise<boolean> {
    const { error } = await supabase
      .from('posts')
      .delete()
      .eq('id', postId)
      .eq('author_id', authorId);
    return !error;
  }

  // Full cascading delete: likes, comments, reposts, notifications, then post
  static async deletePostFull(postId: string, authorId: string): Promise<boolean> {
    // Verify ownership first
    const { data: post } = await supabase
      .from('posts')
      .select('id, author_id')
      .eq('id', postId)
      .eq('author_id', authorId)
      .maybeSingle();
    if (!post) return false;

    await Promise.all([
      supabase.from('post_likes').delete().eq('post_id', postId),
      supabase.from('reposts').delete().eq('post_id', postId),
      supabase.from('notifications').delete().eq('post_id', postId),
    ]);
    // Delete comments after their likes
    const { data: comments } = await supabase.from('post_comments').select('id').eq('post_id', postId);
    if (comments && comments.length > 0) {
      const commentIds = comments.map((c: any) => c.id);
      await supabase.from('comment_likes').delete().in('comment_id', commentIds);
      await supabase.from('post_comments').delete().eq('post_id', postId);
    }
    const { error } = await supabase.from('posts').delete().eq('id', postId).eq('author_id', authorId);
    return !error;
  }

  // Get list of followers for a profile
  static async getFollowers(profileId: string): Promise<UserProfile[]> {
    const { data } = await supabase
      .from('follows')
      .select('follower_id')
      .eq('following_id', profileId);
    if (!data || data.length === 0) return [];
    const ids = data.map((r: any) => r.follower_id);
    const { data: profiles } = await supabase.from('user_profiles').select('*').in('id', ids);
    return profiles || [];
  }

  // Get list of users this profile is following
  static async getFollowing(profileId: string): Promise<UserProfile[]> {
    const { data } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', profileId);
    if (!data || data.length === 0) return [];
    const ids = data.map((r: any) => r.following_id);
    const { data: profiles } = await supabase.from('user_profiles').select('*').in('id', ids);
    return profiles || [];
  }

  // Purchase premium certification
  static async purchasePremiumCertification(profileId: string, tier: 'sol' | 'dawen'): Promise<boolean> {
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1); // 1 year
    const { error } = await supabase
      .from('user_profiles')
      .update({ is_premium: true, premium_tier: tier, premium_expires_at: expiresAt.toISOString() })
      .eq('id', profileId);
    return !error;
  }

  // Check if premium is still active
  static isPremiumActive(profile: UserProfile): boolean {
    if (!profile.is_premium) return false;
    if (!profile.premium_expires_at) return true;
    return new Date(profile.premium_expires_at) > new Date();
  }

  // ─── Notifications ────────────────────────────────────────────────────────

  static async createNotification(
    userId: string,
    actorId: string,
    type: Notification['type'],
    postId: string | null,
    message: string
  ): Promise<void> {
    if (userId === actorId) return; // don't notify self
    // Check if this user has this notification type enabled
    const settings = await this.getNotificationSettings(userId);
    if (settings) {
      if (type === 'like' && !settings.likes) return;
      if (type === 'comment' && !settings.comments) return;
      if (type === 'follow' && !settings.follows) return;
      if (type === 'message' && !settings.messages) return;
      if (type === 'mention' && !settings.mentions) return;
      if (type === 'repost' && !settings.reposts) return;
    }

    await supabase.from('notifications').insert({
      user_id: userId,
      actor_id: actorId,
      type,
      post_id: postId,
      message,
    });
  }

  static async getNotifications(userId: string): Promise<Notification[]> {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (!data || data.length === 0) return [];

    const actorIds = [...new Set(data.filter((n: any) => n.actor_id).map((n: any) => n.actor_id))];
    let actorMap = new Map<string, UserProfile>();
    if (actorIds.length > 0) {
      const { data: actors } = await supabase
        .from('user_profiles')
        .select('*')
        .in('id', actorIds);
      actorMap = new Map((actors || []).map((a: UserProfile) => [a.id, a]));
    }

    return data.map((n: any) => ({
      ...n,
      actor: n.actor_id ? actorMap.get(n.actor_id) : undefined,
    }));
  }

  static async markNotificationsRead(userId: string): Promise<void> {
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('read', false);
  }

  static async clearAllNotifications(userId: string): Promise<void> {
    await supabase
      .from('notifications')
      .delete()
      .eq('user_id', userId);
  }

  static async notifyMentions(content: string, actorId: string, postId: string | null): Promise<void> {
    const matches = content.match(/@(\w+)/g);
    if (!matches) return;
    const usernames = [...new Set(matches.map(m => m.slice(1)))];
    for (const username of usernames) {
      const { data } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('username', username)
        .maybeSingle();
      if (data?.id && data.id !== actorId) {
        await this.createNotification(data.id, actorId, 'mention', postId, 'mentioned you');
      }
    }
  }

  static async getUnreadNotificationCount(userId: string): Promise<number> {
    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false);
    return count || 0;
  }

  static async getNotificationSettings(userId: string): Promise<NotificationSettings | null> {
    const { data } = await supabase
      .from('notification_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    return data;
  }

  static async getOrCreateNotificationSettings(userId: string): Promise<NotificationSettings> {
    const existing = await this.getNotificationSettings(userId);
    if (existing) return existing;

    const { data } = await supabase
      .from('notification_settings')
      .insert({ user_id: userId })
      .select()
      .maybeSingle();

    return data || { id: '', user_id: userId, likes: true, comments: true, follows: true, messages: true, mentions: true, reposts: true };
  }

  static async updateNotificationSettings(
    settingsId: string,
    updates: Partial<Omit<NotificationSettings, 'id' | 'user_id'>>
  ): Promise<NotificationSettings | null> {
    const { data } = await supabase
      .from('notification_settings')
      .update(updates)
      .eq('id', settingsId)
      .select()
      .maybeSingle();
    return data;
  }

  // ─── Messages ─────────────────────────────────────────────────────────────

  static async sendMessage(senderId: string, receiverId: string, content: string): Promise<Message | null> {
    const { data } = await supabase
      .from('messages')
      .insert({ sender_id: senderId, receiver_id: receiverId, content })
      .select()
      .maybeSingle();

    if (data) {
      await this.createNotification(receiverId, senderId, 'message', null, 'sent you a message');
    }

    return data;
  }

  static async getConversationMessages(userId1: string, userId2: string): Promise<Message[]> {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .or(`and(sender_id.eq.${userId1},receiver_id.eq.${userId2}),and(sender_id.eq.${userId2},receiver_id.eq.${userId1})`)
      .order('created_at', { ascending: true });

    if (!data) return [];

    const participantIds = [userId1, userId2];
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('*')
      .in('id', participantIds);
    const profileMap = new Map((profiles || []).map((p: UserProfile) => [p.id, p]));

    return data.map((m: any) => ({
      ...m,
      sender: profileMap.get(m.sender_id),
      receiver: profileMap.get(m.receiver_id),
    }));
  }

  static async getConversations(userId: string): Promise<Conversation[]> {
    // Get all messages involving this user
    const { data: msgs } = await supabase
      .from('messages')
      .select('*')
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .order('created_at', { ascending: false });

    if (!msgs || msgs.length === 0) return [];

    // Group by conversation partner
    const convMap = new Map<string, { lastMessage: Message; unreadCount: number }>();
    for (const msg of msgs) {
      const otherId = msg.sender_id === userId ? msg.receiver_id : msg.sender_id;
      if (!convMap.has(otherId)) {
        convMap.set(otherId, { lastMessage: msg, unreadCount: 0 });
      }
      if (!msg.read && msg.receiver_id === userId) {
        convMap.get(otherId)!.unreadCount++;
      }
    }

    if (convMap.size === 0) return [];

    const otherUserIds = [...convMap.keys()];
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('*')
      .in('id', otherUserIds);
    const profileMap = new Map((profiles || []).map((p: UserProfile) => [p.id, p]));

    const convos: Conversation[] = [];
    for (const [otherId, convData] of convMap.entries()) {
      const otherUser = profileMap.get(otherId);
      if (otherUser) {
        convos.push({ otherUser, lastMessage: convData.lastMessage, unreadCount: convData.unreadCount });
      }
    }

    return convos.sort((a, b) =>
      new Date(b.lastMessage.created_at).getTime() - new Date(a.lastMessage.created_at).getTime()
    );
  }

  static async markMessagesRead(senderId: string, receiverId: string): Promise<void> {
    await supabase
      .from('messages')
      .update({ read: true })
      .eq('sender_id', senderId)
      .eq('receiver_id', receiverId)
      .eq('read', false);
  }

  static async searchUsers(query: string, limit = 20): Promise<UserProfile[]> {
    if (!query.trim()) return [];
    const { data } = await supabase
      .from('user_profiles')
      .select('*')
      .ilike('username', `%${query.trim()}%`)
      .limit(limit);
    return data || [];
  }

  // Posts where this user left a comment (replies tab)
  static async getUserReplies(userId: string): Promise<Post[]> {
    const { data: comments } = await supabase
      .from('post_comments')
      .select('post_id, created_at')
      .eq('author_id', userId)
      .order('created_at', { ascending: false })
      .limit(40);

    if (!comments || comments.length === 0) return [];

    const postIds = [...new Set(comments.map((c: any) => c.post_id))];
    const { data: posts } = await supabase
      .from('posts')
      .select('*')
      .in('id', postIds);

    if (!posts || posts.length === 0) return [];

    const authorIds = [...new Set(posts.map((p: any) => p.author_id))];
    const { data: authors } = await supabase
      .from('user_profiles')
      .select('*')
      .in('id', authorIds);
    const authorMap = new Map((authors || []).map((a: UserProfile) => [a.id, a]));

    return posts.map((p: any) => ({ ...p, author: authorMap.get(p.author_id) }));
  }

  // Posts the user has liked
  static async getUserLikedPosts(userId: string): Promise<Post[]> {
    const { data: likes } = await supabase
      .from('post_likes')
      .select('post_id, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(40);

    if (!likes || likes.length === 0) return [];

    const postIds = likes.map((l: any) => l.post_id);
    const { data: posts } = await supabase
      .from('posts')
      .select('*')
      .in('id', postIds);

    if (!posts || posts.length === 0) return [];

    const authorIds = [...new Set(posts.map((p: any) => p.author_id))];
    const { data: authors } = await supabase
      .from('user_profiles')
      .select('*')
      .in('id', authorIds);
    const authorMap = new Map((authors || []).map((a: UserProfile) => [a.id, a]));

    return posts.map((p: any) => ({
      ...p,
      author: authorMap.get(p.author_id),
      liked_by_user: true,
    }));
  }

  // Posts by this user that have a media attachment
  static async getUserMediaPosts(userId: string): Promise<Post[]> {
    const { data } = await supabase
      .from('posts')
      .select('*')
      .eq('author_id', userId)
      .not('media_url', 'is', null)
      .order('created_at', { ascending: false });

    if (!data || data.length === 0) return [];

    const { data: author } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    return data.map((p: any) => ({ ...p, author: author || undefined }));
  }
}
