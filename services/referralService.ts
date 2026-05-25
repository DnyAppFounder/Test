import { supabase } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SocialService } from './socialService';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
// Always use the official production domain for referral links
const APP_BASE_URL = 'https://dawen.app';
const REWARD_TOKEN_MINT = 'BW1T8pZB2S18nPyMP4sUySV5FoC3VboX6vg3nmvQpump';

export interface ReferralCode {
  id: string;
  user_id: string;
  code: string;
  uses: number;
  created_at: string;
}

export interface Referral {
  id: string;
  referrer_id: string;
  referred_id: string;
  referral_code: string;
  reward_claimed: boolean;
  status: string;
  qualified_at: string | null;
  created_at: string;
  referrer?: { username: string | null; avatar_url: string | null };
  referred?: { username: string | null; avatar_url: string | null };
}

export interface UserReward {
  id: string;
  user_id: string;
  wallet_address: string;
  reward_token_mint: string;
  reward_amount: number;
  reason: string;
  status: 'ready' | 'claiming' | 'sent' | 'failed';
  transaction_signature: string | null;
  created_at: string;
  updated_at: string;
  claimed_at: string | null;
  sent_at: string | null;
}

// Keep legacy alias so rewards.tsx can import ReferralReward
export type ReferralReward = UserReward;

export type ApplyResult =
  | { success: true;  reason: 'success' }
  | { success: false; reason: 'already_applied' | 'invalid_code' | 'self_referral' | 'error' };

// AsyncStorage key used to persist a referral code captured from the URL
// before the user has finished onboarding.
const PENDING_REFERRAL_KEY = 'dawen:pending_referral_code';

export function buildReferralLink(code: string): string {
  return `${APP_BASE_URL}/?ref=${code}`;
}

/** Persist a referral code from the URL until after onboarding completes. */
export async function savePendingReferralCode(code: string): Promise<void> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return;
  await AsyncStorage.setItem(PENDING_REFERRAL_KEY, normalized).catch(() => {});
}

/** Read the pending referral code (returns null if none). */
export async function getPendingReferralCode(): Promise<string | null> {
  return AsyncStorage.getItem(PENDING_REFERRAL_KEY).catch(() => null);
}

/** Clear the pending referral code (call after it has been applied or rejected). */
export async function clearPendingReferralCode(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_REFERRAL_KEY).catch(() => {});
}

export function buildShareMessage(code: string): string {
  return `Join me on DAWEN and earn DawenWorld rewards.\nUse my referral code: ${code}\n${buildReferralLink(code)}`;
}

export function formatRewardReason(reason: string): string {
  switch (reason) {
    case 'early_user_first_100':     return 'Early Member Reward';
    case 'referral_referrer':        return 'Referral Reward';
    case 'referral_referred':        return 'Welcome Bonus';
    case 'top_rank':                 return 'Top Rank Reward';
    case 'game_reward':              return 'Game Reward';
    case 'community_reward':         return 'Community Reward';
    case 'decode_first_completion':  return 'Decode the 7 Fragments Reward';
    default: return reason.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }
}

export class ReferralService {
  static async getOrCreateReferralCode(walletAddress: string): Promise<ReferralCode | null> {
    try {
      const profile = await SocialService.getOrCreateProfile(walletAddress);
      if (!profile) return null;

      // Use the race-safe upsert RPC: generates a CSPRNG DAWEN-XXXXXXXX code,
      // inserts it, and returns the existing row if user already has one.
      // This prevents duplicate codes even under concurrent calls.
      const { data, error } = await supabase.rpc('upsert_referral_code', {
        p_user_id: profile.id,
      });

      if (error) {
        console.error('[ReferralService] upsert_referral_code error:', error);
        // Fallback: read existing code if rpc failed
        const { data: existing } = await supabase
          .from('referral_codes')
          .select('*')
          .eq('user_id', profile.id)
          .maybeSingle();
        return existing ?? null;
      }

      // RPC returns an array (RETURNS TABLE), take first row
      const row = Array.isArray(data) ? data[0] : data;
      return row ?? null;
    } catch (err) {
      console.error('[ReferralService] getOrCreateReferralCode:', err);
      return null;
    }
  }

  static async applyReferralCode(
    referredWalletAddress: string,
    referralCode: string,
  ): Promise<ApplyResult> {
    const normalized = referralCode.trim().toUpperCase();
    console.log('[ReferralService] applyReferralCode submitted:', normalized);

    try {
      const referredProfile = await SocialService.getOrCreateProfile(referredWalletAddress);
      if (!referredProfile) {
        console.error('[ReferralService] could not resolve referred profile');
        return { success: false, reason: 'error' };
      }

      // Check if this user already has a referrer
      const { data: existingReferral } = await supabase
        .from('referrals')
        .select('id')
        .eq('referred_id', referredProfile.id)
        .maybeSingle();

      if (existingReferral) {
        console.log('[ReferralService] referred user already has a referrer');
        return { success: false, reason: 'already_applied' };
      }

      // Look up the referral code
      const { data: codeData } = await supabase
        .from('referral_codes')
        .select('user_id')
        .eq('code', normalized)
        .maybeSingle();

      if (!codeData) {
        console.log('[ReferralService] referral code not found:', normalized);
        return { success: false, reason: 'invalid_code' };
      }

      // Prevent self-referral
      if (codeData.user_id === referredProfile.id) {
        console.log('[ReferralService] self-referral attempt blocked');
        return { success: false, reason: 'self_referral' };
      }

      console.log('[ReferralService] referrer found, creating referral record');

      // Get referrer wallet address for the reward record
      const { data: referrerProfile } = await supabase
        .from('user_profiles')
        .select('wallet_address')
        .eq('id', codeData.user_id)
        .maybeSingle();

      // Create referral record
      const now = new Date().toISOString();
      const { data: referralRow, error: referralErr } = await supabase
        .from('referrals')
        .insert({
          referrer_id: codeData.user_id,
          referred_id: referredProfile.id,
          referral_code: normalized,
          referred_wallet_address: referredWalletAddress,
          status: 'qualified',
          qualified_at: now,
        })
        .select()
        .single();

      if (referralErr) {
        console.error('[ReferralService] referral insert error:', referralErr);
        // If unique constraint fires, the user already has a referral
        if (referralErr.code === '23505') {
          return { success: false, reason: 'already_applied' };
        }
        throw referralErr;
      }

      console.log('[ReferralService] referral record created:', referralRow?.id);

      // Increment code usage (server-side, no race condition)
      await supabase
        .rpc('increment_referral_code_uses', { p_code: normalized })
        .maybeSingle()
        .catch(() => {});

      // Create reward records for both parties via SECURITY DEFINER DB function
      const { error: rewardErr } = await supabase.rpc('create_referral_rewards', {
        p_referrer_user_id: codeData.user_id,
        p_referrer_wallet: referrerProfile?.wallet_address || '',
        p_referred_user_id: referredProfile.id,
        p_referred_wallet: referredWalletAddress,
      });

      if (rewardErr) {
        console.error('[ReferralService] create_referral_rewards error:', rewardErr);
        // Referral row was saved — still a success for the user; rewards will be
        // back-filled or can be manually triggered. Don't fail the whole apply.
      } else {
        console.log('[ReferralService] referral rewards created (referrer 300 DWC + referred 150 DWC)');
      }

      return { success: true, reason: 'success' };
    } catch (err) {
      console.error('[ReferralService] applyReferralCode unexpected error:', err);
      return { success: false, reason: 'error' };
    }
  }

  static async getUserReferrals(walletAddress: string): Promise<Referral[]> {
    try {
      const profile = await SocialService.getOrCreateProfile(walletAddress);
      if (!profile) return [];

      const { data, error } = await supabase
        .from('referrals')
        .select('*, referred:user_profiles!referrals_referred_id_fkey(username, avatar_url)')
        .eq('referrer_id', profile.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as Referral[];
    } catch (err) {
      console.error('[ReferralService] getUserReferrals:', err);
      return [];
    }
  }

  static async getUserRewards(walletAddress: string): Promise<UserReward[]> {
    try {
      if (!walletAddress) return [];

      const { data, error } = await supabase
        .from('user_rewards')
        .select('*')
        .eq('wallet_address', walletAddress)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as UserReward[];
    } catch (err) {
      console.error('[ReferralService] getUserRewards:', err);
      return [];
    }
  }

  static async claimReward(
    rewardId: string,
    walletAddress: string,
  ): Promise<{ success: boolean; signature?: string; error?: string }> {
    try {
      if (!walletAddress) return { success: false, error: 'Connect your wallet to claim rewards' };

      const url = `${SUPABASE_URL}/functions/v1/reward-claim`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ANON_KEY}`,
          Apikey: ANON_KEY,
        },
        body: JSON.stringify({ reward_id: rewardId, wallet_address: walletAddress }),
      });

      const result = await resp.json();
      return result;
    } catch (err: any) {
      console.error('[ReferralService] claimReward:', err);
      return { success: false, error: err?.message || 'Claim failed' };
    }
  }

  // Resets rewards stuck in 'claiming' for >3 minutes with no tx signature.
  // Call on app/page startup to recover from crashed edge-function attempts.
  static async resetStaleClaimingRewards(): Promise<void> {
    try {
      await supabase.rpc('reset_stale_claiming_rewards').maybeSingle();
    } catch (err) {
      console.warn('[ReferralService] resetStaleClaimingRewards:', err);
    }
  }

  static async getReferralStats(walletAddress: string): Promise<{
    totalReferrals: number;
    totalEarned: number;
    unclaimedAmount: number;
    totalRewards: number;
    unclaimedRewards: number;
  }> {
    try {
      const profile = await SocialService.getOrCreateProfile(walletAddress);
      if (!profile) return { totalReferrals: 0, totalEarned: 0, unclaimedAmount: 0, totalRewards: 0, unclaimedRewards: 0 };

      const [{ data: referrals }, { data: rewards }] = await Promise.all([
        supabase.from('referrals').select('id').eq('referrer_id', profile.id),
        supabase.from('user_rewards').select('reward_amount, status').eq('wallet_address', walletAddress),
      ]);

      const totalReferrals   = referrals?.length || 0;
      const totalEarned      = rewards?.filter(r => r.status === 'sent').reduce((s, r) => s + r.reward_amount, 0) || 0;
      const unclaimedAmount  = rewards?.filter(r => r.status === 'ready').reduce((s, r) => s + r.reward_amount, 0) || 0;

      return { totalReferrals, totalEarned, unclaimedAmount, totalRewards: totalEarned, unclaimedRewards: unclaimedAmount };
    } catch (err) {
      console.error('[ReferralService] getReferralStats:', err);
      return { totalReferrals: 0, totalEarned: 0, unclaimedAmount: 0, totalRewards: 0, unclaimedRewards: 0 };
    }
  }

  static async isEarlyRewardPoolExhausted(): Promise<boolean> {
    try {
      // Count only confirmed (sent) early rewards toward the 100-slot limit
      const { count, error } = await supabase
        .from('user_rewards')
        .select('id', { count: 'exact', head: true })
        .eq('reason', 'early_user_first_100')
        .eq('status', 'sent');
      if (error) return false;
      return (count ?? 0) >= 100;
    } catch {
      return false;
    }
  }

  static async checkEarlyUserReward(walletAddress: string): Promise<void> {
    try {
      const profile = await SocialService.getOrCreateProfile(walletAddress);
      if (!profile) return;
      await supabase.rpc('check_and_grant_early_user_reward', {
        p_user_id: profile.id,
        p_wallet_address: walletAddress,
      });
    } catch (err) {
      console.error('[ReferralService] checkEarlyUserReward:', err);
    }
  }
}
