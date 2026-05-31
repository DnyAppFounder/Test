import { supabase } from '@/lib/supabase';
import { UserReward } from './referralService';

export const SignatureWallRewardService = {
  async hasSigned(walletAddress: string): Promise<boolean> {
    const { data } = await supabase
      .from('game_signatures')
      .select('id')
      .eq('wallet_address', walletAddress)
      .limit(1)
      .maybeSingle();
    return !!data;
  },

  async getReward(walletAddress: string): Promise<UserReward | null> {
    const { data } = await supabase
      .from('user_rewards')
      .select('*')
      .eq('wallet_address', walletAddress)
      .eq('reason', 'signature_wall')
      .maybeSingle();
    return data as UserReward | null;
  },

  async ensureReward(walletAddress: string): Promise<UserReward | null> {
    // Call RPC without p_user_id — the function resolves it internally.
    // This avoids depending on getOrCreateProfile which can fail silently.
    const { data, error } = await supabase.rpc('create_signature_wall_reward', {
      p_wallet_address: walletAddress,
    });

    if (error) {
      console.error('[SignatureWallRewardService] RPC error:', error.message, error.details, error.hint);
      return null;
    }

    if (!data) {
      console.warn('[SignatureWallRewardService] RPC returned no data for wallet:', walletAddress);
      return null;
    }

    const rows = Array.isArray(data) ? data : [data];
    if (rows.length === 0) {
      console.warn('[SignatureWallRewardService] RPC returned empty array — wallet may not be in game_signatures:', walletAddress);
      return null;
    }

    return rows[0] as UserReward;
  },
};

