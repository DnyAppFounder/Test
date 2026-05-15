import { supabase } from '@/lib/supabase';
import { SocialService } from './socialService';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
const APP_BASE_URL = 'https://dawenapp.bolt.host';
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

export function buildReferralLink(code: string): string {
  return `${APP_BASE_URL}/?ref=${code}`;
}

export function buildShareMessage(code: string): string {
  return `Join me on DAWEN and earn DawenWorld rewards.\nUse my referral code: ${code}\n${buildReferralLink(code)}`;
}

export function formatRewardReason(reason: string): string {
  switch (reason) {
    case 'early_user_first_100': return 'Early Member Reward';
    case 'referral_referrer':    return 'Referral Reward';
    case 'referral_referred':    return 'Welcome Bonus';
    case 'top_rank':             return 'Top Rank Reward';
    case 'game_reward':          return 'Game Reward';
    case 'community_reward':     return 'Community Reward';
    default: return reason.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }
}

export class ReferralService {
  static async getOrCreateReferralCode(walletAddress: string): Promise<ReferralCode | null> {
    try {
      const profile = await SocialService.getOrCreateProfile(walletAddress);
      if (!profile) return null;

      const { data: existing } = await supabase
        .from('referral_codes')
        .select('*')
        .eq('user_id', profile.id)
        .maybeSingle();

      if (existing) return existing;

      // Generate new DAWEN- prefixed code via updated RPC function
      const { data: codeStr } = await supabase.rpc('generate_referral_code', {
        p_user_id: profile.id,
      });

      if (!codeStr) return null;

      const { data: newCode, error } = await supabase
        .from('referral_codes')
        .insert({ user_id: profile.id, code: codeStr })
        .select()
        .single();

      if (error) throw error;
      return newCode;
    } catch (err) {
      console.error('[ReferralService] getOrCreateReferralCode:', err);
      return null;
    }
  }

  static async applyReferralCode(
    referredWalletAddress: string,
    referralCode: string,
  ): Promise<boolean> {
    try {
      const referredProfile = await SocialService.getOrCreateProfile(referredWalletAddress);
      if (!referredProfile) return false;

      // Check user hasn't already used a referral code
      const { data: existingReferral } = await supabase
        .from('referrals')
        .select('id')
        .eq('referred_id', referredProfile.id)
        .maybeSingle();

      if (existingReferral) return false;

      // Look up the referral code
      const normalizedCode = referralCode.trim().toUpperCase();
      const { data: codeData } = await supabase
        .from('referral_codes')
        .select('user_id')
        .eq('code', normalizedCode)
        .maybeSingle();

      if (!codeData) return false;

      // Prevent self-referral
      if (codeData.user_id === referredProfile.id) return false;

      // Get referrer's wallet address
      const { data: referrerProfile } = await supabase
        .from('user_profiles')
        .select('wallet_address')
        .eq('id', codeData.user_id)
        .maybeSingle();

      // Create referral record (qualified immediately since user has wallet)
      const now = new Date().toISOString();
      const { data: referralRow, error: referralErr } = await supabase
        .from('referrals')
        .insert({
          referrer_id: codeData.user_id,
          referred_id: referredProfile.id,
          referral_code: normalizedCode,
          referred_wallet_address: referredWalletAddress,
          status: 'qualified',
          qualified_at: now,
        })
        .select()
        .single();

      if (referralErr) throw referralErr;

      // Increment code usage
      await supabase.rpc('increment_referral_code_uses', { p_code: normalizedCode }).maybeSingle().catch(() => {
        // Fallback if RPC not available
        supabase.from('referral_codes')
          .select('uses')
          .eq('code', normalizedCode)
          .single()
          .then(({ data }) => {
            if (data) {
              supabase.from('referral_codes')
                .update({ uses: data.uses + 1 })
                .eq('code', normalizedCode);
            }
          });
      });

      // Create reward records via DB function
      await supabase.rpc('create_referral_rewards', {
        p_referrer_user_id: codeData.user_id,
        p_referrer_wallet: referrerProfile?.wallet_address || '',
        p_referred_user_id: referredProfile.id,
        p_referred_wallet: referredWalletAddress,
      });

      return true;
    } catch (err) {
      console.error('[ReferralService] applyReferralCode:', err);
      return false;
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

  static async getReferralStats(walletAddress: string): Promise<{
    totalReferrals: number;
    totalEarned: number;
    unclaimedAmount: number;
    // legacy fields for backward compat
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

      const totalReferrals = referrals?.length || 0;
      const totalEarned = rewards?.filter(r => r.status === 'sent').reduce((s, r) => s + r.reward_amount, 0) || 0;
      const unclaimedAmount = rewards?.filter(r => r.status === 'ready').reduce((s, r) => s + r.reward_amount, 0) || 0;

      return { totalReferrals, totalEarned, unclaimedAmount, totalRewards: totalEarned, unclaimedRewards: unclaimedAmount };
    } catch (err) {
      console.error('[ReferralService] getReferralStats:', err);
      return { totalReferrals: 0, totalEarned: 0, unclaimedAmount: 0, totalRewards: 0, unclaimedRewards: 0 };
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
