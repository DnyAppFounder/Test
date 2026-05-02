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
  async isInWatchlist(tokenAddress: string, profileId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('watchlist')
        .select('id')
        .eq('user_id', profileId)
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
    tokenName: string,
    profileId: string
  ): Promise<boolean> {
    try {
      const { error } = await supabase.from('watchlist').insert({
        user_id: profileId,
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

  async removeFromWatchlist(tokenAddress: string, profileId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('watchlist')
        .delete()
        .eq('user_id', profileId)
        .eq('token_address', tokenAddress);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error removing from watchlist:', error);
      return false;
    }
  }

  async getWatchlist(profileId: string): Promise<WatchlistToken[]> {
    try {
      const { data, error } = await supabase
        .from('watchlist')
        .select('*')
        .eq('user_id', profileId)
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
    tokenName: string,
    profileId: string
  ): Promise<boolean> {
    const inList = await this.isInWatchlist(tokenAddress, profileId);
    if (inList) {
      return this.removeFromWatchlist(tokenAddress, profileId);
    } else {
      return this.addToWatchlist(tokenAddress, tokenSymbol, tokenName, profileId);
    }
  }
}

export const watchlistService = new WatchlistService();
