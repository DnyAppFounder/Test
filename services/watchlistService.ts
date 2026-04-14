import { supabase } from '@/lib/supabase';

export interface WatchlistToken {
  id: string;
  user_id: string;
  token_address: string;
  token_symbol: string;
  token_name: string;
  added_at: string;
}

class WatchlistService {
  async isInWatchlist(tokenAddress: string): Promise<boolean> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      const { data, error } = await supabase
        .from('watchlist')
        .select('id')
        .eq('user_id', user.id)
        .eq('token_address', tokenAddress)
        .maybeSingle();

      if (error) throw error;
      return data !== null;
    } catch (error) {
      console.error('Error checking watchlist:', error);
      return false;
    }
  }

  async addToWatchlist(
    tokenAddress: string,
    tokenSymbol: string,
    tokenName: string
  ): Promise<boolean> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { error } = await supabase.from('watchlist').insert({
        user_id: user.id,
        token_address: tokenAddress,
        token_symbol: tokenSymbol,
        token_name: tokenName,
      });

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error adding to watchlist:', error);
      return false;
    }
  }

  async removeFromWatchlist(tokenAddress: string): Promise<boolean> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { error } = await supabase
        .from('watchlist')
        .delete()
        .eq('user_id', user.id)
        .eq('token_address', tokenAddress);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error removing from watchlist:', error);
      return false;
    }
  }

  async getWatchlist(): Promise<WatchlistToken[]> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from('watchlist')
        .select('*')
        .eq('user_id', user.id)
        .order('added_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching watchlist:', error);
      return [];
    }
  }

  async toggleWatchlist(
    tokenAddress: string,
    tokenSymbol: string,
    tokenName: string
  ): Promise<boolean> {
    const isInWatchlist = await this.isInWatchlist(tokenAddress);

    if (isInWatchlist) {
      return await this.removeFromWatchlist(tokenAddress);
    } else {
      return await this.addToWatchlist(tokenAddress, tokenSymbol, tokenName);
    }
  }
}

export const watchlistService = new WatchlistService();
