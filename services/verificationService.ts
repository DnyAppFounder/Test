import { supabase } from '@/lib/supabase';
import { SocialService } from './socialService';

// The accounts users must follow for verification
const REQUIRED_FOLLOW_USERNAMES = ['Decent', 'VerificationBadge', 'DawenPulse'];
// The account users must DM "Blue" to for the final step
const BLUE_BADGE_DM_USERNAME = 'BlueBadge';

// Premium subscription prices in USD equivalent
export const PREMIUM_TIERS = [
  { key: '1m', label: '1 Month', months: 1, usd: 4.99 },
  { key: '3m', label: '3 Months', months: 3, usd: 12.99 },
  { key: '6m', label: '6 Months', months: 6, usd: 24.99 },
  { key: '1y', label: '1 Year', months: 12, usd: 39.99 },
] as const;

export type PremiumTierKey = typeof PREMIUM_TIERS[number]['key'];

export class VerificationService {
  /**
   * Ensure the verification accounts exist in user_profiles.
   * Safe to call multiple times — idempotent.
   */
  static async ensureVerificationAccounts(): Promise<{
    decentId: string | null;
    badgeId: string | null;
    dawenPulseId: string | null;
    blueBadgeId: string | null;
  }> {
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, username')
      .in('username', [...REQUIRED_FOLLOW_USERNAMES, BLUE_BADGE_DM_USERNAME]);

    const find = (name: string) => profiles?.find(p => p.username === name)?.id ?? null;

    return {
      decentId: find('Decent'),
      badgeId: find('VerificationBadge'),
      dawenPulseId: find('DawenPulse'),
      blueBadgeId: find('BlueBadge'),
    };
  }

  /**
   * Check if the user meets all verification criteria and grant it if so.
   * Returns true if verification was newly granted (or already held).
   */
  static async checkAndGrantBasicVerification(userId: string): Promise<boolean> {
    const { data: me } = await supabase
      .from('user_profiles')
      .select('verified_basic')
      .eq('id', userId)
      .maybeSingle();
    if (me?.verified_basic) return true;

    const { decentId, badgeId, dawenPulseId, blueBadgeId } = await this.ensureVerificationAccounts();

    if (!decentId || !badgeId || !dawenPulseId || !blueBadgeId) return false;

    const [followsDecent, followsBadge, followsDawenPulse] = await Promise.all([
      SocialService.isFollowing(userId, decentId),
      SocialService.isFollowing(userId, badgeId),
      SocialService.isFollowing(userId, dawenPulseId),
    ]);

    if (!followsDecent || !followsBadge || !followsDawenPulse) return false;

    // Check DM "Blue" sent to BlueBadge
    const { data: dm } = await supabase
      .from('messages')
      .select('id')
      .eq('sender_id', userId)
      .eq('receiver_id', blueBadgeId)
      .ilike('content', 'blue')
      .limit(1)
      .maybeSingle();

    if (!dm) return false;

    // Grant!
    await supabase
      .from('user_profiles')
      .update({ verified_basic: true, is_verified: true })
      .eq('id', userId);

    return true;
  }

  /**
   * Check verification status without granting. Returns the criteria results.
   */
  static async getVerificationStatus(userId: string): Promise<{
    followsDecent: boolean;
    followsBadge: boolean;
    followsDawenPulse: boolean;
    sentBlueDM: boolean;
    alreadyVerified: boolean;
    decentId: string | null;
    badgeId: string | null;
    dawenPulseId: string | null;
    blueBadgeId: string | null;
  }> {
    const { data: me } = await supabase
      .from('user_profiles')
      .select('verified_basic')
      .eq('id', userId)
      .maybeSingle();

    const { decentId, badgeId, dawenPulseId, blueBadgeId } = await this.ensureVerificationAccounts();

    if (me?.verified_basic) {
      return {
        followsDecent: true, followsBadge: true, followsDawenPulse: true, sentBlueDM: true,
        alreadyVerified: true, decentId, badgeId, dawenPulseId, blueBadgeId,
      };
    }

    let followsDecent = false;
    let followsBadge = false;
    let followsDawenPulse = false;
    let sentBlueDM = false;

    if (decentId) followsDecent = await SocialService.isFollowing(userId, decentId);
    if (badgeId) followsBadge = await SocialService.isFollowing(userId, badgeId);
    if (dawenPulseId) followsDawenPulse = await SocialService.isFollowing(userId, dawenPulseId);

    if (blueBadgeId) {
      const { data: dm } = await supabase
        .from('messages')
        .select('id')
        .eq('sender_id', userId)
        .eq('receiver_id', blueBadgeId)
        .ilike('content', 'blue')
        .limit(1)
        .maybeSingle();
      sentBlueDM = !!dm;
    }

    return {
      followsDecent, followsBadge, followsDawenPulse, sentBlueDM,
      alreadyVerified: false, decentId, badgeId, dawenPulseId, blueBadgeId,
    };
  }

  /**
   * Activate premium for a given tier.
   * txSignature is the Solana transaction signature to verify.
   */
  static async activatePremium(
    userId: string,
    tierKey: PremiumTierKey,
    txSignature?: string
  ): Promise<{ success: boolean; expiration: string | null }> {
    const tier = PREMIUM_TIERS.find(t => t.key === tierKey);
    if (!tier) return { success: false, expiration: null };

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
