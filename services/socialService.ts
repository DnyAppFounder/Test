import { supabase } from '@/lib/supabase';

export interface UserProfile {
  id: string;
  wallet_address: string;
  username: string | null;
  bio: string;
  avatar_url: string | null;
  token_balance: number;
  is_verified: boolean;
  created_at: string;
}

export interface Post {
  id: string;
  author_id: string;
  content: string;
  image_url: string | null;
  likes_count: number;
  comments_count: number;
  reposts_count: number;
  is_promoted: boolean;
  promoted_until: string | null;
  promoted_tier: string | null;
  created_at: string;
  author?: UserProfile;
  liked_by_user?: boolean;
  reposted_by_user?: boolean;
  reposted_by?: UserProfile;
  is_repost?: boolean;
}

export interface PostComment {
  id: string;
  post_id: string;
  author_id: string;
  content: string;
  created_at: string;
  author?: UserProfile;
}

export const PROMOTE_TIERS = [
  { key: '1h', label: '1 Hour', hours: 1, price: 5 },
  { key: '10h', label: '10 Hours', hours: 10, price: 25 },
  { key: '24h', label: '24 Hours', hours: 24, price: 50 },
  { key: '1w', label: '1 Week', hours: 168, price: 200 },
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
    updates: { username?: string; bio?: string; avatar_url?: string }
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

  static async createPost(authorId: string, content: string, imageUrl?: string): Promise<Post | null> {
    const { data } = await supabase
      .from('posts')
      .insert({
        author_id: authorId,
        content,
        image_url: imageUrl || null,
      })
      .select()
      .maybeSingle();
    return data;
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
      .select('likes_count')
      .eq('id', postId)
      .maybeSingle();
    if (post) {
      await supabase
        .from('posts')
        .update({ likes_count: (post.likes_count || 0) + 1 })
        .eq('id', postId);
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
      .select('reposts_count')
      .eq('id', postId)
      .maybeSingle();
    if (post) {
      await supabase
        .from('posts')
        .update({ reposts_count: (post.reposts_count || 0) + 1 })
        .eq('id', postId);
    }
    return true;
  }

  static async getComments(postId: string): Promise<PostComment[]> {
    const { data: comments } = await supabase
      .from('post_comments')
      .select('*')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });

    if (!comments || comments.length === 0) return [];

    const authorIds = [...new Set(comments.map((c: PostComment) => c.author_id))];
    const { data: authors } = await supabase
      .from('user_profiles')
      .select('*')
      .in('id', authorIds);

    const authorMap = new Map((authors || []).map((a: UserProfile) => [a.id, a]));

    return comments.map((c: PostComment) => ({
      ...c,
      author: authorMap.get(c.author_id),
    }));
  }

  static async addComment(postId: string, authorId: string, content: string): Promise<PostComment | null> {
    const { data } = await supabase
      .from('post_comments')
      .insert({ post_id: postId, author_id: authorId, content })
      .select()
      .maybeSingle();

    if (data) {
      const { data: post } = await supabase
        .from('posts')
        .select('comments_count')
        .eq('id', postId)
        .maybeSingle();
      if (post) {
        await supabase
          .from('posts')
          .update({ comments_count: (post.comments_count || 0) + 1 })
          .eq('id', postId);
      }
    }

    return data;
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
    return true;
  }
}
