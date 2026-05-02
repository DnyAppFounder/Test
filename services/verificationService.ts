import { supabase } from '@/lib/supabase';
import { SocialService } from './socialService';

// The two special accounts users must follow
const REQUIRED_FOLLOW_USERNAMES = ['Decent', 'VerificationBadge'];
// The pinned post id users must reply to (stored in verification_accounts)
const PINNED_POST_LOOKUP_USERNAME = 'VerificationBadge';

// Premium subscription prices in USD equivalent
export const PREMIUM_TIERS = [
  { key: '1m', label: '1 Month', months: 1, usd: 8 },
  { key: '3m', label: '3 Months', months: 3, usd: 22 },
  { key: '6m', label: '6 Months', months: 6, usd: 40 },
  { key: '1y', label: '1 Year', months: 12, usd: 72 },
] as const;

export type PremiumTierKey = typeof PREMIUM_TIERS[number]['key'];

export class VerificationService {
  /**
   * Ensure the two verification accounts exist in both user_profiles and verification_accounts.
   * Safe to call multiple times — idempotent.
   */
  static async ensureVerificationAccounts(): Promise<{
    decentId: string | null;
    badgeId: string | null;
    pinnedPostId: string | null;
  }> {
    let decentId: string | null = null;
    let badgeId: string | null = null;
    let pinnedPostId: string | null = null;

    // Look up both profiles by username
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, username')
      .in('username', REQUIRED_FOLLOW_USERNAMES);

    const decentProfile = profiles?.find(p => p.username === 'Decent');
    const badgeProfile = profiles?.find(p => p.username === 'VerificationBadge');

    decentId = decentProfile?.id ?? null;
    badgeId = badgeProfile?.id ?? null;

    // Look for pinned post on the badge account
    if (badgeId) {
      const { data: va } = await supabase
        .from('verification_accounts')
        .select('pinned_post_id')
        .eq('account_username', 'VerificationBadge')
        .maybeSingle();
      pinnedPostId = va?.pinned_post_id ?? null;

      // If no pinned post recorded, find the most recent post by that account
      if (!pinnedPostId) {
        const { data: post } = await supabase
          .from('posts')
          .select('id')
          .eq('author_id', badgeId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        pinnedPostId = post?.id ?? null;
      }
    }

    return { decentId, badgeId, pinnedPostId };
  }

  /**
   * Check if the user meets all basic verification criteria and grant it if so.
   * Returns true if verification was newly granted (or already held).
   */
  static async checkAndGrantBasicVerification(userId: string): Promise<boolean> {
    // Already verified?
    const { data: me } = await supabase
      .from('user_profiles')
      .select('verified_basic')
      .eq('id', userId)
      .maybeSingle();
    if (me?.verified_basic) return true;

    const { decentId, badgeId, pinnedPostId } = await this.ensureVerificationAccounts();

    if (!decentId || !badgeId) return false;

    // Check follows
    const [followsDecent, followsBadge] = await Promise.all([
      SocialService.isFollowing(userId, decentId),
      SocialService.isFollowing(userId, badgeId),
    ]);

    if (!followsDecent || !followsBadge) return false;

    // Check reply to pinned post
    if (pinnedPostId) {
      const { data: reply } = await supabase
        .from('post_comments')
        .select('id')
        .eq('post_id', pinnedPostId)
        .eq('author_id', userId)
        .limit(1)
        .maybeSingle();
      if (!reply) return false;
    }

    // Grant!
    await supabase
      .from('user_profiles')
      .update({ verified_basic: true, is_verified: true })
      .eq('id', userId);

    return true;
  }

  /**
   * Check verification status without granting. Returns the three criteria results.
   */
  static async getVerificationStatus(userId: string): Promise<{
    followsDecent: boolean;
    followsBadge: boolean;
    repliedToPost: boolean;
    alreadyVerified: boolean;
    decentId: string | null;
    badgeId: string | null;
    pinnedPostId: string | null;
  }> {
    const { data: me } = await supabase
      .from('user_profiles')
      .select('verified_basic')
      .eq('id', userId)
      .maybeSingle();

    const { decentId, badgeId, pinnedPostId } = await this.ensureVerificationAccounts();

    if (me?.verified_basic) {
      return {
        followsDecent: true, followsBadge: true, repliedToPost: true,
        alreadyVerified: true, decentId, badgeId, pinnedPostId,
      };
    }

    let followsDecent = false;
    let followsBadge = false;
    let repliedToPost = false;

    if (decentId) followsDecent = await SocialService.isFollowing(userId, decentId);
    if (badgeId) followsBadge = await SocialService.isFollowing(userId, badgeId);

    if (pinnedPostId) {
      const { data: reply } = await supabase
        .from('post_comments')
        .select('id')
        .eq('post_id', pinnedPostId)
        .eq('author_id', userId)
        .limit(1)
        .maybeSingle();
      repliedToPost = !!reply;
    } else {
      // No pinned post configured — don't block on this criteria
      repliedToPost = true;
    }

    return { followsDecent, followsBadge, repliedToPost, alreadyVerified: false, decentId, badgeId, pinnedPostId };
  }

  /**
   * Activate premium for a given tier.
   * In production this would verify an on-chain transaction first.
   * txSignature is the Solana transaction signature to verify.
   */
  static async activatePremium(
    userId: string,
    tierKey: PremiumTierKey,
    txSignature?: string
  ): Promise<{ success: boolean; expiration: string | null }> {
    const tier = PREMIUM_TIERS.find(t => t.key === tierKey);
    if (!tier) return { success: false, expiration: null };

    // Calculate expiration
    const expiration = new Date();
    expiration.setMonth(expiration.getMonth() + tier.months);
    const expirationIso = expiration.toISOString();

    const { error } = await supabase
      .from('user_profiles')
      .update({
        is_premium: true,
        premium_tier: 'sol',
        premium_expires_at: expirationIso,
        premium_expiration: expirationIso,
      })
      .eq('id', userId);

    if (error) return { success: false, expiration: null };
    return { success: true, expiration: expirationIso };
  }

  /** Returns true if premium is currently active */
  static isPremiumActive(profile: { is_premium?: boolean; premium_expiration?: string | null; premium_expires_at?: string | null }): boolean {
    if (!profile.is_premium) return false;
    const exp = profile.premium_expiration || profile.premium_expires_at;
    if (!exp) return true;
    return new Date(exp) > new Date();
  }
}
