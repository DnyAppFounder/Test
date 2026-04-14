import { supabase } from '@/lib/supabase';
import { SocialService } from './socialService';

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
  created_at: string;
  referrer?: {
    username: string | null;
    avatar_url: string | null;
  };
  referred?: {
    username: string | null;
    avatar_url: string | null;
  };
}

export interface ReferralReward {
  id: string;
  user_id: string;
  referral_id: string | null;
  reward_type: string;
  reward_amount: number;
  claimed: boolean;
  created_at: string;
}

export class ReferralService {
  static supabase = supabase;

  static async getOrCreateReferralCode(walletAddress: string): Promise<ReferralCode | null> {
    try {
      const profile = await SocialService.getOrCreateProfile(walletAddress);
      if (!profile) return null;

      const { data: existing } = await this.supabase
        .from('referral_codes')
        .select('*')
        .eq('user_id', profile.id)
        .maybeSingle();

      if (existing) return existing;

      const { data: codeData } = await this.supabase.rpc('generate_referral_code', {
        p_user_id: profile.id,
      });

      if (!codeData) return null;

      const { data: newCode, error } = await this.supabase
        .from('referral_codes')
        .insert({
          user_id: profile.id,
          code: codeData,
        })
        .select()
        .single();

      if (error) throw error;
      return newCode;
    } catch (error) {
      console.error('Error getting/creating referral code:', error);
      return null;
    }
  }

  static async validateReferralCode(code: string): Promise<boolean> {
    try {
      const { data } = await this.supabase
        .from('referral_codes')
        .select('id')
        .eq('code', code.toUpperCase())
        .maybeSingle();

      return !!data;
    } catch (error) {
      console.error('Error validating referral code:', error);
      return false;
    }
  }

  static async applyReferralCode(
    referredWalletAddress: string,
    referralCode: string
  ): Promise<boolean> {
    try {
      const referredProfile = await SocialService.getOrCreateProfile(referredWalletAddress);
      if (!referredProfile) return false;

      const { data: existingReferral } = await this.supabase
        .from('referrals')
        .select('id')
        .eq('referred_id', referredProfile.id)
        .maybeSingle();

      if (existingReferral) {
        console.log('User already has a referral');
        return false;
      }

      const { data: codeData } = await this.supabase
        .from('referral_codes')
        .select('user_id')
        .eq('code', referralCode.toUpperCase())
        .maybeSingle();

      if (!codeData) return false;

      if (codeData.user_id === referredProfile.id) {
        console.log('Cannot use own referral code');
        return false;
      }

      const { error: referralError } = await this.supabase.from('referrals').insert({
        referrer_id: codeData.user_id,
        referred_id: referredProfile.id,
        referral_code: referralCode.toUpperCase(),
      });

      if (referralError) throw referralError;

      const { data: currentCode } = await this.supabase
        .from('referral_codes')
        .select('uses')
        .eq('code', referralCode.toUpperCase())
        .single();

      if (currentCode) {
        await this.supabase
          .from('referral_codes')
          .update({ uses: currentCode.uses + 1 })
          .eq('code', referralCode.toUpperCase());
      }

      await this.createReferralRewards(codeData.user_id, referredProfile.id);

      return true;
    } catch (error) {
      console.error('Error applying referral code:', error);
      return false;
    }
  }

  static async createReferralRewards(referrerId: string, referredId: string): Promise<void> {
    try {
      await this.supabase.from('referral_rewards').insert([
        {
          user_id: referrerId,
          reward_type: 'bonus_tokens',
          reward_amount: 10,
          claimed: false,
        },
        {
          user_id: referredId,
          reward_type: 'bonus_tokens',
          reward_amount: 5,
          claimed: false,
        },
      ]);
    } catch (error) {
      console.error('Error creating referral rewards:', error);
    }
  }

  static async getUserReferrals(walletAddress: string): Promise<Referral[]> {
    try {
      const profile = await SocialService.getOrCreateProfile(walletAddress);
      if (!profile) return [];

      const { data, error } = await this.supabase
        .from('referrals')
        .select(
          `
          *,
          referred:user_profiles!referrals_referred_id_fkey(username, avatar_url)
        `
        )
        .eq('referrer_id', profile.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error getting user referrals:', error);
      return [];
    }
  }

  static async getUserRewards(walletAddress: string): Promise<ReferralReward[]> {
    try {
      const profile = await SocialService.getOrCreateProfile(walletAddress);
      if (!profile) return [];

      const { data, error } = await this.supabase
        .from('referral_rewards')
        .select('*')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error getting user rewards:', error);
      return [];
    }
  }

  static async claimReward(rewardId: string): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from('referral_rewards')
        .update({ claimed: true })
        .eq('id', rewardId)
        .eq('claimed', false);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error claiming reward:', error);
      return false;
    }
  }

  static async getReferralStats(walletAddress: string): Promise<{
    totalReferrals: number;
    totalRewards: number;
    unclaimedRewards: number;
  }> {
    try {
      const profile = await SocialService.getOrCreateProfile(walletAddress);
      if (!profile)
        return { totalReferrals: 0, totalRewards: 0, unclaimedRewards: 0 };

      const { data: referrals } = await this.supabase
        .from('referrals')
        .select('id', { count: 'exact' })
        .eq('referrer_id', profile.id);

      const { data: rewards } = await this.supabase
        .from('referral_rewards')
        .select('reward_amount, claimed')
        .eq('user_id', profile.id);

      const totalReferrals = referrals?.length || 0;
      const totalRewards =
        rewards?.reduce((sum, r) => sum + parseFloat(r.reward_amount.toString()), 0) || 0;
      const unclaimedRewards =
        rewards
          ?.filter((r) => !r.claimed)
          .reduce((sum, r) => sum + parseFloat(r.reward_amount.toString()), 0) || 0;

      return { totalReferrals, totalRewards, unclaimedRewards };
    } catch (error) {
      console.error('Error getting referral stats:', error);
      return { totalReferrals: 0, totalRewards: 0, unclaimedRewards: 0 };
    }
  }
}
