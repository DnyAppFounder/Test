import { supabase } from '@/lib/supabase';
import type { UserReward } from './referralService';

export interface DecodeRewardStatus {
  id: string;
  wallet_address: string;
  user_id: string | null;
  free_practice_completed: boolean;
  completed_at: string | null;
  reward_unlocked: boolean;
  unlocked_at: string | null;
  first_message_shown: boolean;
  claimed: boolean;
  claimed_at: string | null;
  claim_tx_signature: string | null;
  created_at: string;
  updated_at: string;
}

export class DecodeRewardService {
  static async getStatus(walletAddress: string): Promise<DecodeRewardStatus | null> {
    try {
      const { data } = await supabase
        .from('decode_reward_status')
        .select('*')
        .eq('wallet_address', walletAddress)
        .maybeSingle();
      return data ?? null;
    } catch {
      return null;
    }
  }

  // Atomically inserts decode_reward_status + user_rewards via SECURITY DEFINER RPC.
  // Returns { success, alreadyUnlocked, suspicious } — safe to call multiple times.
  static async grantFirstReward(
    walletAddress: string,
    userId: string | null,
    completionTimeMs?: number,
  ): Promise<{ success: boolean; alreadyUnlocked: boolean; suspicious: boolean }> {
    try {
      const { data, error } = await supabase.rpc('grant_decode_first_reward', {
        p_wallet_address: walletAddress,
        p_user_id: userId ?? null,
        p_completion_time_ms: completionTimeMs ?? 0,
      });
      if (error) throw error;
      const result = data as { success: boolean; reason?: string };
      if (!result.success && result.reason === 'already_unlocked') {
        return { success: false, alreadyUnlocked: true, suspicious: false };
      }
      if (!result.success && result.reason === 'suspicious_completion') {
        return { success: false, alreadyUnlocked: false, suspicious: true };
      }
      return { success: !!result.success, alreadyUnlocked: false, suspicious: false };
    } catch (err) {
      console.error('[DecodeRewardService] grantFirstReward:', err);
      return { success: false, alreadyUnlocked: false, suspicious: false };
    }
  }

  // Mark lore message shown so it never appears again.
  static async markMessageShown(walletAddress: string): Promise<void> {
    try {
      await supabase.rpc('mark_decode_message_shown', {
        p_wallet_address: walletAddress,
      });
    } catch (err) {
      console.warn('[DecodeRewardService] markMessageShown:', err);
    }
  }

  // Returns the user_rewards record for the decode first-completion reward.
  static async getDecodeUserReward(walletAddress: string): Promise<UserReward | null> {
    try {
      const { data } = await supabase
        .from('user_rewards')
        .select('*')
        .eq('wallet_address', walletAddress)
        .eq('reason', 'decode_first_completion')
        .maybeSingle();
      return (data as UserReward) ?? null;
    } catch {
      return null;
    }
  }
}
