import { supabase } from '@/lib/supabase';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
const REPOSTS_FN = `${SUPABASE_URL}/functions/v1/jupiter-proxy`;

async function repostsFetch(action: string, body: object): Promise<any> {
  const res = await fetch(`${REPOSTS_FN}?repost_action=${action}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

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
  name_color?: string | null;
}

export interface Post {
  id: string;
  author_id: string;
  content: string;
  image_url: string | null;
  media_url: string | null;
  media_urls: string[] | null;
  likes_count: number;
  comments_count: number;
  reposts_count: number;
  is_promoted: boolean;
  promoted_until: string | null;
  promoted_tier: string | null;
  created_at: string;
  // Token attachment (primary)
  token_address: string | null;
  token_symbol: string | null;
  token_price: number | null;
  token_change_24h: number | null;
  token_logo_uri: string | null;
  // Token attachment (secondary — for comparison posts)
  token_address_2: string | null;
  token_symbol_2: string | null;
  token_price_2: number | null;
  token_change_24h_2: number | null;
  token_logo_uri_2: string | null;
  // GIF attachment
  gif_url: string | null;
  // Poll
  poll_options: string[] | null;
  poll_expires_at: string | null;
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
  post_animated?: boolean;
  text_color?: string | null;
}

export interface Notification {
  id: string;
  user_id: string;
  actor_id: string | null;
  type: 'like' | 'comment' | 'follow' | 'mention' | 'repost' | 'message' | 'promote';
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
  media_url?: string;
  media_type?: 'image' | 'video';
  media_thumbnail_url?: string;
}

export interface GroupTopic {
  id: string;
  group_id: string;
  name: string;
  created_by: string;
  is_default: boolean;
  created_at: string;
}

export interface GroupPin {
  id: string;
  group_id: string;
  message_id: string;
  pinned_by: string;
  pinned_at: string;
  message?: any;
  pinned_by_profile?: UserProfile;
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
  { key: '1h', label: '1H', hours: 1, usdPrice: 5 },
  { key: '3h', label: '3H', hours: 3, usdPrice: 8 },
  { key: '24h', label: '24H', hours: 24, usdPrice: 12 },
  { key: '3d', label: '3D', hours: 72, usdPrice: 24 },
  { key: '7d', label: '1W', hours: 168, usdPrice: 44 },
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

  static async getProfileByWalletOrId(idOrWallet: string): Promise<UserProfile | null> {
    // Try UUID lookup first
    const { data: byId } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', idOrWallet)
      .maybeSingle();
    if (byId) return byId;
    // Fall back to wallet_address
    const { data: byWallet } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('wallet_address', idOrWallet)
      .maybeSingle();
    return byWallet ?? null;
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
    const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
    const ALLOWED_MIME = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];

    try {
      let blob: Blob;

      if (imageUri.startsWith('data:')) {
        const [header, base64] = imageUri.split(',');
        const mime = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
        if (!ALLOWED_MIME.includes(mime)) throw new Error(`Unsupported format: ${mime}`);
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        blob = new Blob([bytes], { type: mime });
      } else {
        // blob:, file://, or http(s):// — fetch works for all on web and native
        const response = await fetch(imageUri);
        if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
        blob = await response.blob();
      }

      // Validate mime type
      const mimeType = blob.type || 'image/jpeg';
      const isImage = ALLOWED_MIME.some(m => mimeType.startsWith(m.split('/')[0]) && mimeType.includes(mimeType.split('/')[1]));
      if (blob.type && !ALLOWED_MIME.includes(blob.type)) {
        throw new Error(`File type not allowed: ${blob.type}. Use PNG, JPG, JPEG, or WebP.`);
      }

      // Validate size
      if (blob.size > MAX_SIZE_BYTES) {
        throw new Error(`Image too large (${(blob.size / 1024 / 1024).toFixed(1)} MB). Maximum 5 MB.`);
      }

      // Derive extension from mime type
      const extMap: Record<string, string> = {
        'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
        'image/webp': 'webp', 'image/gif': 'gif',
      };
      const ext = extMap[mimeType] || 'jpg';
      // Use fixed filename per user so old avatars are overwritten (no storage bloat)
      const fileName = `${walletAddress}/avatar.${ext}`;

      const { data, error } = await supabase.storage
        .from('avatars')
        .upload(fileName, blob, {
          contentType: mimeType,
          upsert: true,
        });

      if (error) {
        console.error('[Avatar] Upload error:', error);
        throw new Error(error.message || 'Upload failed');
      }

      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(data.path);

      // Bust cache by appending timestamp so image refreshes everywhere
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      // Persist to DB
      await this.updateProfile(profileId, { avatar_url: publicUrl });

      return publicUrl;
    } catch (error) {
      console.error('[Avatar] Upload failed:', error);
      // Re-throw so callers can show error to user
      throw error;
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

      const [likesRes, repostsResult] = await Promise.all([
        supabase
          .from('post_likes')
          .select('post_id')
          .eq('user_id', currentUserId)
          .in('post_id', postIds),
        repostsFetch('check', { userId: currentUserId, postIds }),
      ]);

      likedSet = new Set((likesRes.data || []).map((l: { post_id: string }) => l.post_id));
      repostedSet = new Set<string>((repostsResult?.repostedIds || []) as string[]);
    }

    return sortedPosts.map((p: any) => ({
      ...p,
      is_promoted: p.is_promoted && p.promoted_until ? new Date(p.promoted_until) > now : false,
      author: authorMap.get(p.author_id),
      liked_by_user: likedSet.has(p.id),
      reposted_by_user: repostedSet.has(p.id),
    }));
  }

  static async getUserPosts(authorId: string, currentUserId?: string): Promise<Post[]> {
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

    let likedSet = new Set<string>();
    let repostedSet = new Set<string>();
    if (currentUserId && data.length > 0) {
      const postIds = data.map((p: Post) => p.id);
      const [likesRes, repostsResult] = await Promise.all([
        supabase.from('post_likes').select('post_id').eq('user_id', currentUserId).in('post_id', postIds),
        repostsFetch('check', { userId: currentUserId, postIds }),
      ]);
      likedSet = new Set((likesRes.data || []).map((l: any) => l.post_id));
      repostedSet = new Set<string>((repostsResult?.repostedIds || []) as string[]);
    }

    return data.map((p: Post) => ({
      ...p,
      author: authorMap.get(p.author_id),
      liked_by_user: likedSet.has(p.id),
      reposted_by_user: repostedSet.has(p.id),
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
      mediaUris?: string[];
      tokenAddress?: string;
      tokenSymbol?: string;
      tokenPrice?: number;
      tokenChange24h?: number;
      tokenLogoUri?: string;
      tokenAddress2?: string;
      tokenSymbol2?: string;
      tokenPrice2?: number;
      tokenChange24h2?: number;
      tokenLogoUri2?: string;
      visibility?: 'public' | 'followers';
      whoCanReply?: 'everyone' | 'followers' | 'mentioned';
      allowQuotes?: boolean;
      language?: string;
      quotePostId?: string;
      promoteTier?: string;
      gifUrl?: string;
      pollOptions?: string[];
      pollExpiresAt?: string;
      textColor?: string | null;
    }
  ): Promise<Post | null> {
    let mediaUrl: string | null = options?.mediaUrl || null;
    let mediaUrls: string[] | null = null;

    // Upload all media URIs in parallel
    if (options?.mediaUris && options.mediaUris.length > 0) {
      const uploaded = await Promise.all(
        options.mediaUris.map(uri => this.uploadPostMedia(authorId, uri))
      );
      const valid = uploaded.filter((u): u is string => !!u);
      if (valid.length > 0) {
        mediaUrl = valid[0];
        mediaUrls = valid;
      }
    } else if (options?.imageUri && !options.mediaUrl) {
      const uploaded = await this.uploadPostMedia(authorId, options.imageUri);
      if (uploaded) { mediaUrl = uploaded; mediaUrls = [uploaded]; }
    }

    // Compute promotion fields if a tier is requested
    const promoteTier = options?.promoteTier;
    const promoteTierConfig = promoteTier ? PROMOTE_TIERS.find(t => t.key === promoteTier) : null;
    let isPromoted = false;
    let promotedUntil: string | null = null;
    if (promoteTierConfig) {
      const until = new Date();
      until.setHours(until.getHours() + promoteTierConfig.hours);
      isPromoted = true;
      promotedUntil = until.toISOString();
    }

    const { data } = await supabase
      .from('posts')
      .insert({
        author_id: authorId,
        content,
        image_url: mediaUrl,
        media_url: mediaUrl,
        media_urls: mediaUrls,
        token_address: options?.tokenAddress || null,
        token_symbol: options?.tokenSymbol || null,
        token_price: options?.tokenPrice ?? null,
        token_change_24h: options?.tokenChange24h ?? null,
        token_logo_uri: options?.tokenLogoUri ?? null,
        token_address_2: options?.tokenAddress2 || null,
        token_symbol_2: options?.tokenSymbol2 || null,
        token_price_2: options?.tokenPrice2 ?? null,
        token_change_24h_2: options?.tokenChange24h2 ?? null,
        token_logo_uri_2: options?.tokenLogoUri2 ?? null,
        visibility: options?.visibility ?? 'public',
        who_can_reply: options?.whoCanReply ?? 'everyone',
        allow_quotes: options?.allowQuotes ?? true,
        language: options?.language ?? 'en',
        quote_post_id: options?.quotePostId ?? null,
        is_promoted: isPromoted,
        promoted_until: promotedUntil,
        promoted_tier: promoteTier ?? null,
        gif_url: options?.gifUrl ?? null,
        text_color: options?.textColor ?? null,
        poll_options: options?.pollOptions && options.pollOptions.length >= 2 ? options.pollOptions : null,
        poll_expires_at: options?.pollOptions && options.pollOptions.length >= 2
          ? (options.pollExpiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString())
          : null,
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
    const result = await repostsFetch('toggle', { postId, userId });
    if (result && typeof result.reposted === 'boolean') {
      if (result.reposted) {
        const { data: post } = await supabase
          .from('posts')
          .select('author_id')
          .eq('id', postId)
          .maybeSingle();
        if (post) {
          await this.createNotification(post.author_id, userId, 'repost', postId, 'reposted your post');
        }
      }
      return result.reposted;
    }
    return false;
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

    // Load replies for all top-level comments (guard against empty array)
    const repliesQuery = commentIds.length > 0
      ? await supabase
          .from('post_comments')
          .select('*')
          .in('parent_comment_id', commentIds)
          .order('created_at', { ascending: true })
      : { data: [] };
    const { data: replies } = repliesQuery;

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
      if (allIds.length > 0) {
        const { data: liked } = await supabase
          .from('comment_likes')
          .select('comment_id')
          .eq('user_id', currentUserId)
          .in('comment_id', allIds);
        likedSet = new Set((liked || []).map((l: any) => l.comment_id));
      }
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

    if (error) return false;

    // Notify followers of the post author (fire-and-forget)
    this.sendPromoteNotifications(postId, tierKey).catch(() => {});
    return true;
  }

  private static async sendPromoteNotifications(postId: string, tierKey: string): Promise<void> {
    try {
      // Get post details
      const { data: post } = await supabase
        .from('posts')
        .select('author_id, content')
        .eq('id', postId)
        .maybeSingle();
      if (!post?.author_id) return;

      // Get author's followers (up to 200)
      const { data: follows } = await supabase
        .from('follows')
        .select('follower_id')
        .eq('following_id', post.author_id)
        .limit(200);
      if (!follows || follows.length === 0) return;

      const preview = (post.content || '').slice(0, 60);
      const message = `Promoted post: "${preview}${preview.length === 60 ? '...' : ''}"`;

      // Bulk insert notifications
      const rows = follows
        .map((f: any) => f.follower_id as string)
        .filter((uid: string) => uid !== post.author_id)
        .map((uid: string) => ({
          user_id: uid,
          actor_id: post.author_id,
          type: 'promote' as const,
          post_id: postId,
          message,
        }));

      if (rows.length > 0) {
        await supabase.from('notifications').insert(rows);
      }
    } catch {
      // Best-effort, never crash
    }
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
      await this.createNotification(receiverId, senderId, 'message', null, content.slice(0, 100));
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

  // Shared helper: enrich a list of posts with like/repost state for currentUserId
  private static async enrichPostsWithUserState(posts: any[], currentUserId?: string): Promise<Post[]> {
    if (!posts.length) return [];
    const authorIds = [...new Set(posts.map((p: any) => p.author_id))];
    const { data: authors } = await supabase
      .from('user_profiles')
      .select('*')
      .in('id', authorIds);
    const authorMap = new Map((authors || []).map((a: UserProfile) => [a.id, a]));

    let likedSet = new Set<string>();
    let repostedSet = new Set<string>();
    if (currentUserId) {
      const postIds = posts.map((p: any) => p.id);
      const [likesRes, repostsResult] = await Promise.all([
        supabase.from('post_likes').select('post_id').eq('user_id', currentUserId).in('post_id', postIds),
        repostsFetch('check', { userId: currentUserId, postIds }),
      ]);
      likedSet = new Set((likesRes.data || []).map((l: any) => l.post_id));
      repostedSet = new Set<string>((repostsResult?.repostedIds || []) as string[]);
    }

    return posts.map((p: any) => ({
      ...p,
      author: authorMap.get(p.author_id),
      liked_by_user: likedSet.has(p.id),
      reposted_by_user: repostedSet.has(p.id),
    }));
  }

  // Posts where this user left a comment (replies tab)
  static async getUserReplies(userId: string, currentUserId?: string): Promise<Post[]> {
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
    return this.enrichPostsWithUserState(posts, currentUserId);
  }

  // Posts the user has liked
  static async getUserLikedPosts(userId: string, currentUserId?: string): Promise<Post[]> {
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

    const enriched = await this.enrichPostsWithUserState(posts, currentUserId);
    // For the likes tab: if currentUserId matches userId, we know they liked all these posts
    if (currentUserId === userId) {
      return enriched.map(p => ({ ...p, liked_by_user: true }));
    }
    return enriched;
  }

  // Posts by this user that have a media attachment
  static async getUserMediaPosts(userId: string, currentUserId?: string): Promise<Post[]> {
    const { data } = await supabase
      .from('posts')
      .select('*')
      .eq('author_id', userId)
      .not('media_url', 'is', null)
      .order('created_at', { ascending: false });

    if (!data || data.length === 0) return [];
    return this.enrichPostsWithUserState(data, currentUserId);
  }

  // ── Poll voting ──────────────────────────────────────────────────────────────

  static async votePoll(postId: string, voterWallet: string, optionIndex: number): Promise<void> {
    const { error } = await supabase
      .from('poll_votes')
      .insert({ post_id: postId, voter_wallet: voterWallet, option_index: optionIndex });
    if (error && error.code !== '23505') throw error; // 23505 = unique violation (already voted)
  }

  static async getPollVotes(postId: string): Promise<{ option_index: number; count: number }[]> {
    const { data } = await supabase
      .from('poll_votes')
      .select('option_index')
      .eq('post_id', postId);
    if (!data || data.length === 0) return [];
    const counts: Record<number, number> = {};
    for (const row of data) {
      counts[row.option_index] = (counts[row.option_index] ?? 0) + 1;
    }
    return Object.entries(counts).map(([k, v]) => ({ option_index: Number(k), count: v }));
  }

  static async getMyPollVote(postId: string, voterWallet: string): Promise<number | null> {
    const { data } = await supabase
      .from('poll_votes')
      .select('option_index')
      .eq('post_id', postId)
      .eq('voter_wallet', voterWallet)
      .maybeSingle();
    return data?.option_index ?? null;
  }

  // ─── Search ────────────────────────────────────────────────────────────────

  static async searchPosts(query: string, limit = 20): Promise<Post[]> {
    if (!query.trim()) return [];
    try {
      const { data, error } = await supabase
        .from('posts')
        .select(`*, author:user_profiles!author_id(*)`)
        .ilike('content', `%${query.trim()}%`)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) return [];
      return (data as any[]) || [];
    } catch {
      return [];
    }
  }

  // ─── User Blocking ─────────────────────────────────────────────────────────

  static async blockUser(blockerId: string, blockedId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('user_blocks')
        .upsert({ blocker_id: blockerId, blocked_id: blockedId }, { onConflict: 'blocker_id,blocked_id' });
      return !error;
    } catch {
      return false;
    }
  }

  static async unblockUser(blockerId: string, blockedId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('user_blocks')
        .delete()
        .eq('blocker_id', blockerId)
        .eq('blocked_id', blockedId);
      return !error;
    } catch {
      return false;
    }
  }

  static async isBlocked(viewerId: string, targetId: string): Promise<boolean> {
    try {
      const { data } = await supabase
        .from('user_blocks')
        .select('id')
        .eq('blocker_id', viewerId)
        .eq('blocked_id', targetId)
        .maybeSingle();
      return !!data;
    } catch {
      return false;
    }
  }

  static async getBlockedUsers(userId: string): Promise<string[]> {
    try {
      const { data } = await supabase
        .from('user_blocks')
        .select('blocked_id')
        .eq('blocker_id', userId);
      return (data || []).map((r: any) => r.blocked_id);
    } catch {
      return [];
    }
  }

  // ─── Conversation Preferences ──────────────────────────────────────────────

  static async setConversationPreference(
    userId: string,
    partnerId: string,
    updates: { is_archived?: boolean; is_hidden?: boolean; is_deleted?: boolean }
  ): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('conversation_preferences')
        .upsert(
          { user_id: userId, partner_id: partnerId, ...updates, updated_at: new Date().toISOString() },
          { onConflict: 'user_id,partner_id' }
        );
      return !error;
    } catch {
      return false;
    }
  }

  static async getConversationPreferences(userId: string): Promise<Map<string, { is_archived: boolean; is_hidden: boolean; is_deleted: boolean }>> {
    try {
      const { data } = await supabase
        .from('conversation_preferences')
        .select('partner_id, is_archived, is_hidden, is_deleted')
        .eq('user_id', userId);
      const map = new Map<string, { is_archived: boolean; is_hidden: boolean; is_deleted: boolean }>();
      for (const row of (data || [])) {
        map.set(row.partner_id, { is_archived: row.is_archived, is_hidden: row.is_hidden, is_deleted: row.is_deleted });
      }
      return map;
    } catch {
      return new Map();
    }
  }

  // ─── Group Conversations ───────────────────────────────────────────────────

  static async createGroupConversation(creatorId: string, name: string, memberIds: string[]): Promise<string | null> {
    try {
      const { data: group, error } = await supabase
        .from('group_conversations')
        .insert({ creator_id: creatorId, name })
        .select('id')
        .maybeSingle();
      if (error || !group) return null;
      const allMembers = Array.from(new Set([creatorId, ...memberIds]));
      await supabase.from('group_members').insert(
        allMembers.map(uid => ({
          group_id: group.id,
          user_id: uid,
          role: uid === creatorId ? 'creator' : 'member',
        }))
      );
      return group.id;
    } catch {
      return null;
    }
  }

  static async getGroupConversations(userId: string): Promise<any[]> {
    try {
      const { data } = await supabase
        .from('group_members')
        .select('group_id, group_conversations(id, name, avatar_url, created_at, deleted_at)')
        .eq('user_id', userId)
        .is('removed_at', null);
      return (data || [])
        .map((r: any) => r.group_conversations)
        .filter((g: any) => g && !g.deleted_at);
    } catch {
      return [];
    }
  }

  static async sendGroupMessage(groupId: string, senderId: string, content: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('group_messages')
        .insert({ group_id: groupId, sender_id: senderId, content });
      return !error;
    } catch {
      return false;
    }
  }

  static async getGroupMessages(groupId: string): Promise<any[]> {
    try {
      const { data } = await supabase
        .from('group_messages')
        .select('*')
        .eq('group_id', groupId)
        .order('created_at', { ascending: true });
      if (!data || data.length === 0) return [];
      const senderIds = [...new Set(data.map((m: any) => m.sender_id))];
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('*')
        .in('id', senderIds);
      const profileMap = new Map((profiles || []).map((p: UserProfile) => [p.id, p]));
      return data.map((m: any) => ({ ...m, sender: profileMap.get(m.sender_id) }));
    } catch {
      return [];
    }
  }

  static async getGroupDetails(groupId: string): Promise<{ id: string; name: string; avatar_url: string | null; creator_id: string; members: (UserProfile & { role: string })[] } | null> {
    try {
      const { data: group } = await supabase
        .from('group_conversations')
        .select('*')
        .eq('id', groupId)
        .is('deleted_at', null)
        .maybeSingle();
      if (!group) return null;
      const { data: memberRows } = await supabase
        .from('group_members')
        .select('user_id, role')
        .eq('group_id', groupId)
        .is('removed_at', null);
      const memberIds = (memberRows || []).map((r: any) => r.user_id);
      const roleMap = new Map((memberRows || []).map((r: any) => [r.user_id, r.role ?? 'member']));
      let members: (UserProfile & { role: string })[] = [];
      if (memberIds.length > 0) {
        const { data: profiles } = await supabase.from('user_profiles').select('*').in('id', memberIds);
        members = (profiles || []).map((p: any) => ({ ...p, role: roleMap.get(p.id) ?? 'member' }));
      }
      return { id: group.id, name: group.name, avatar_url: group.avatar_url, creator_id: group.creator_id, members };
    } catch {
      return null;
    }
  }

  static async getGroupConversationsWithLastMsg(userId: string): Promise<any[]> {
    try {
      const { data: memberRows } = await supabase
        .from('group_members')
        .select('group_id, group_conversations(id, name, avatar_url, created_at)')
        .eq('user_id', userId);
      if (!memberRows || memberRows.length === 0) return [];
      const groups = (memberRows as any[]).map((r: any) => r.group_conversations).filter(Boolean);
      const results = await Promise.all(
        groups.map(async (g: any) => {
          const { data: lastMsg } = await supabase
            .from('group_messages')
            .select('content, created_at, sender_id')
            .eq('group_id', g.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          return { ...g, lastMessage: lastMsg, type: 'group' as const };
        })
      );
      return results;
    } catch {
      return [];
    }
  }

  // ─── Media Messages (DM) ──────────────────────────────────────────────────

  static async sendMessageWithMedia(
    senderId: string,
    receiverId: string,
    content: string,
    mediaUrl?: string,
    mediaType?: 'image' | 'video',
  ): Promise<Message | null> {
    const payload: any = { sender_id: senderId, receiver_id: receiverId, content };
    if (mediaUrl) { payload.media_url = mediaUrl; payload.media_type = mediaType ?? 'image'; }
    const { data } = await supabase.from('messages').insert(payload).select().maybeSingle();
    return data as Message | null;
  }

  static async uploadChatMedia(
    file: { uri: string; type: string; name: string },
    bucket = 'post-media',
  ): Promise<string | null> {
    try {
      const ext = file.name.split('.').pop() ?? 'jpg';
      const path = `chat/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const resp = await fetch(file.uri);
      const blob = await resp.blob();
      const { error } = await supabase.storage.from(bucket).upload(path, blob, {
        contentType: file.type,
        upsert: false,
      });
      if (error) { console.warn('[SocialService] uploadChatMedia error:', error); return null; }
      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      return data.publicUrl;
    } catch (e) {
      console.warn('[SocialService] uploadChatMedia exception:', e);
      return null;
    }
  }

  // ─── Group Topics ─────────────────────────────────────────────────────────

  static async getGroupTopics(groupId: string): Promise<GroupTopic[]> {
    const { data } = await supabase
      .from('group_topics')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at', { ascending: true });
    return (data as GroupTopic[]) ?? [];
  }

  static async createGroupTopic(groupId: string, name: string, creatorId: string): Promise<GroupTopic | null> {
    const { data } = await supabase
      .from('group_topics')
      .insert({ group_id: groupId, name, created_by: creatorId, is_default: false })
      .select()
      .maybeSingle();
    return data as GroupTopic | null;
  }

  static async ensureDefaultTopic(groupId: string, creatorId: string): Promise<GroupTopic | null> {
    const { data: existing } = await supabase
      .from('group_topics')
      .select('*')
      .eq('group_id', groupId)
      .eq('is_default', true)
      .maybeSingle();
    if (existing) return existing as GroupTopic;
    const { data } = await supabase
      .from('group_topics')
      .insert({ group_id: groupId, name: 'General', created_by: creatorId, is_default: true })
      .select()
      .maybeSingle();
    return data as GroupTopic | null;
  }

  static async renameGroupTopic(topicId: string, name: string): Promise<boolean> {
    const { error } = await supabase.from('group_topics').update({ name, updated_at: new Date().toISOString() }).eq('id', topicId);
    return !error;
  }

  static async deleteGroupTopic(topicId: string): Promise<boolean> {
    const { error } = await supabase.from('group_topics').delete().eq('id', topicId).eq('is_default', false);
    return !error;
  }

  // ─── Group Pins ───────────────────────────────────────────────────────────

  static async getGroupPins(groupId: string): Promise<GroupPin[]> {
    const { data } = await supabase
      .from('group_pins')
      .select('*, message:group_messages(*)')
      .eq('group_id', groupId)
      .order('pinned_at', { ascending: false })
      .limit(5);
    return (data as GroupPin[]) ?? [];
  }

  static async pinMessage(groupId: string, messageId: string, pinnedBy: string): Promise<boolean> {
    const { error } = await supabase
      .from('group_pins')
      .insert({ group_id: groupId, message_id: messageId, pinned_by: pinnedBy });
    return !error;
  }

  static async unpinMessage(pinId: string): Promise<boolean> {
    const { error } = await supabase.from('group_pins').delete().eq('id', pinId);
    return !error;
  }

  // ─── Group Members (admin) ────────────────────────────────────────────────

  static async isGroupCreator(groupId: string, userId: string): Promise<boolean> {
    const { data } = await supabase
      .from('group_conversations')
      .select('creator_id')
      .eq('id', groupId)
      .maybeSingle();
    return (data as any)?.creator_id === userId;
  }

  static async addGroupMember(groupId: string, userId: string): Promise<{ success: boolean; alreadyMember: boolean }> {
    // Check existing row (active or removed)
    const { data: existing } = await supabase
      .from('group_members')
      .select('user_id, removed_at')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .maybeSingle();
    if (existing) {
      if (!existing.removed_at) return { success: true, alreadyMember: true };
      // Reinstate previously removed member
      const { error } = await supabase
        .from('group_members')
        .update({ removed_at: null, joined_at: new Date().toISOString(), role: 'member' })
        .eq('group_id', groupId)
        .eq('user_id', userId);
      return { success: !error, alreadyMember: false };
    }
    const { error } = await supabase
      .from('group_members')
      .insert({ group_id: groupId, user_id: userId, role: 'member' });
    return { success: !error, alreadyMember: false };
  }

  static async removeGroupMember(groupId: string, userId: string): Promise<boolean> {
    const { error } = await supabase
      .from('group_members')
      .update({ removed_at: new Date().toISOString() })
      .eq('group_id', groupId)
      .eq('user_id', userId);
    return !error;
  }

  static async deleteGroup(groupId: string, deletedBy: string): Promise<boolean> {
    const { error } = await supabase
      .from('group_conversations')
      .update({ deleted_at: new Date().toISOString(), deleted_by: deletedBy })
      .eq('id', groupId);
    return !error;
  }

  static async searchUsersNotInGroup(groupId: string, query: string): Promise<UserProfile[]> {
    if (!query.trim()) return [];
    // Get current active member IDs
    const { data: memberRows } = await supabase
      .from('group_members')
      .select('user_id')
      .eq('group_id', groupId)
      .is('removed_at', null);
    const memberIds = (memberRows || []).map((r: any) => r.user_id);

    const { data } = await supabase
      .from('user_profiles')
      .select('*')
      .or(`username.ilike.%${query}%,wallet_address.ilike.%${query}%`)
      .limit(20);
    return (data || []).filter((p: any) => !memberIds.includes(p.id));
  }

  // ─── Group Messages with media + topic ───────────────────────────────────

  static async sendGroupMessageFull(
    groupId: string,
    senderId: string,
    content: string,
    topicId?: string,
    mediaUrl?: string,
    mediaType?: 'image' | 'video',
  ): Promise<boolean> {
    try {
      const payload: any = { group_id: groupId, sender_id: senderId, content };
      if (topicId) payload.topic_id = topicId;
      if (mediaUrl) { payload.media_url = mediaUrl; payload.media_type = mediaType ?? 'image'; }
      const { error } = await supabase.from('group_messages').insert(payload);
      return !error;
    } catch { return false; }
  }

  static async updateGroupMemberRole(groupId: string, userId: string, role: 'admin' | 'member'): Promise<boolean> {
    const { error } = await supabase
      .from('group_members')
      .update({ role })
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .is('removed_at', null);
    return !error;
  }

  static async deleteGroupMessage(messageId: string, deletedById: string): Promise<boolean> {
    const { error } = await supabase
      .from('group_messages')
      .update({ is_deleted: true, content: '', deleted_by: deletedById })
      .eq('id', messageId);
    return !error;
  }

  static async markGroupMessagesRead(groupId: string, userId: string): Promise<void> {
    await supabase
      .from('group_members')
      .update({ last_read_at: new Date().toISOString() })
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .is('removed_at', null);
  }

  static async getGroupUnreadCount(groupId: string, userId: string): Promise<number> {
    try {
      const { data: memberRow } = await supabase
        .from('group_members')
        .select('last_read_at')
        .eq('group_id', groupId)
        .eq('user_id', userId)
        .is('removed_at', null)
        .maybeSingle();
      const lastRead = memberRow?.last_read_at ?? new Date(0).toISOString();
      const { count } = await supabase
        .from('group_messages')
        .select('id', { count: 'exact', head: true })
        .eq('group_id', groupId)
        .eq('is_deleted', false)
        .neq('sender_id', userId)
        .gt('created_at', lastRead);
      return count ?? 0;
    } catch { return 0; }
  }

  static async uploadGroupPhoto(groupId: string, imageUri: string): Promise<string | null> {
    try {
      const ext = imageUri.split('.').pop()?.toLowerCase() ?? 'jpg';
      const path = `group-${groupId}/photo.${ext}`;
      let blob: Blob;
      if (imageUri.startsWith('data:')) {
        const parts = imageUri.split(',');
        const mime = parts[0].match(/:(.*?);/)?.[1] ?? 'image/jpeg';
        const bytes = atob(parts[1]);
        const arr = new Uint8Array(bytes.length);
        for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
        blob = new Blob([arr], { type: mime });
      } else {
        const res = await fetch(imageUri);
        blob = await res.blob();
      }
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, blob, { upsert: true, contentType: blob.type });
      if (upErr) return null;
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      const publicUrl = urlData.publicUrl + `?t=${Date.now()}`;
      await supabase.from('group_conversations').update({ avatar_url: publicUrl }).eq('id', groupId);
      return publicUrl;
    } catch { return null; }
  }

  static async updateGroupConversation(groupId: string, updates: { name?: string; avatar_url?: string }): Promise<boolean> {
    const { error } = await supabase.from('group_conversations').update(updates).eq('id', groupId);
    return !error;
  }

  static async getUserGroupIds(userId: string): Promise<string[]> {
    const { data } = await supabase
      .from('group_members')
      .select('group_id')
      .eq('user_id', userId)
      .is('removed_at', null);
    return (data || []).map((r: any) => r.group_id);
  }
}
