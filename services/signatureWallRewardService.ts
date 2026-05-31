import { supabase } from '@/lib/supabase';
import { SocialService } from './socialService';
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
    const profile = await SocialService.getOrCreateProfile(walletAddress);
    if (!profile) return null;

    const { data } = await supabase.rpc('create_signature_wall_reward', {
      p_wallet_address: walletAddress,
      p_user_id: profile.id,
    });

    const rows = Array.isArray(data) ? data : data ? [data] : [];
    return (rows[0] ?? null) as UserReward | null;
  },
};
