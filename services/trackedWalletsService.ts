import { supabase } from '@/lib/supabase';

export interface TrackedWallet {
  id: string;
  user_id: string;
  tracked_address: string;
  nickname: string | null;
  created_at: string;
}

export const TrackedWalletsService = {
  async getSaved(userWalletAddress: string): Promise<TrackedWallet[]> {
    const { data } = await supabase
      .from('tracked_wallets')
      .select('*')
      .eq('user_id', userWalletAddress.toLowerCase())
      .order('created_at', { ascending: false });
    return data || [];
  },

  async save(userWalletAddress: string, trackedAddress: string, nickname?: string): Promise<void> {
    await supabase.from('tracked_wallets').upsert(
      {
        user_id: userWalletAddress.toLowerCase(),
        tracked_address: trackedAddress,
        nickname: nickname || null,
      },
      { onConflict: 'user_id,tracked_address' }
    );
  },

  async remove(id: string): Promise<void> {
    await supabase.from('tracked_wallets').delete().eq('id', id);
  },

  async updateNickname(id: string, nickname: string): Promise<void> {
    await supabase.from('tracked_wallets').update({ nickname }).eq('id', id);
  },
};
