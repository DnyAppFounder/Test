import { supabase } from '@/lib/supabase';

export interface UserAsset {
  id: string;
  user_id: string;
  token_id: string;
  quantity: number;
  avg_buy_price: number;
  last_updated: string;
  created_at: string;
  token?: {
    id: string;
    symbol: string;
    name: string;
    coingecko_id: string;
    logo_url?: string;
  };
  current_price?: number;
  current_value?: number;
  profit_loss?: number;
  profit_loss_percentage?: number;
}

export interface UserTransaction {
  id: string;
  user_id: string;
  token_id: string;
  transaction_type: 'buy' | 'sell' | 'send' | 'receive' | 'swap';
  quantity: number;
  price_per_token: number;
  total_value: number;
  fee: number;
  from_address?: string;
  to_address?: string;
  tx_hash?: string;
  status: 'pending' | 'completed' | 'failed';
  notes?: string;
  created_at: string;
  token?: {
    symbol: string;
    name: string;
    logo_url?: string;
  };
}

export interface WatchlistItem {
  id: string;
  user_id: string;
  token_id: string;
  created_at: string;
  token?: {
    id: string;
    symbol: string;
    name: string;
    coingecko_id: string;
    logo_url?: string;
  };
}

export class AssetsService {
  static async getUserAssets(walletAddress: string): Promise<UserAsset[]> {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('wallet_address', walletAddress)
      .maybeSingle();

    if (!profile) return [];

    const { data, error } = await supabase
      .from('user_assets')
      .select(`
        *,
        token:tokens(id, symbol, name, coingecko_id, logo_url)
      `)
      .eq('user_id', profile.id)
      .order('quantity', { ascending: false });

    if (error) throw error;

    const assetsWithPrices = await Promise.all(
      (data || []).map(async (asset) => {
        const { data: priceData } = await supabase
          .from('token_prices')
          .select('price_usd')
          .eq('token_id', asset.token_id)
          .maybeSingle();

        const currentPrice = priceData?.price_usd || 0;
        const currentValue = asset.quantity * currentPrice;
        const costBasis = asset.quantity * asset.avg_buy_price;
        const profitLoss = currentValue - costBasis;
        const profitLossPercentage = costBasis > 0 ? (profitLoss / costBasis) * 100 : 0;

        return {
          ...asset,
          current_price: currentPrice,
          current_value: currentValue,
          profit_loss: profitLoss,
          profit_loss_percentage: profitLossPercentage,
        };
      })
    );

    return assetsWithPrices;
  }

  static async getUserTransactions(walletAddress: string, limit = 50): Promise<UserTransaction[]> {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('wallet_address', walletAddress)
      .maybeSingle();

    if (!profile) return [];

    const { data, error } = await supabase
      .from('user_transactions')
      .select(`
        *,
        token:tokens(symbol, name, logo_url)
      `)
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  }

  static async recordTransaction(
    walletAddress: string,
    tokenId: string,
    type: 'buy' | 'sell' | 'send' | 'receive' | 'swap',
    quantity: number,
    pricePerToken: number,
    options: {
      fee?: number;
      fromAddress?: string;
      toAddress?: string;
      txHash?: string;
      status?: 'pending' | 'completed' | 'failed';
      notes?: string;
    } = {}
  ): Promise<UserTransaction> {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('wallet_address', walletAddress)
      .maybeSingle();

    if (!profile) throw new Error('User profile not found');

    const totalValue = quantity * pricePerToken;

    const { data, error } = await supabase
      .from('user_transactions')
      .insert({
        user_id: profile.id,
        token_id: tokenId,
        transaction_type: type,
        quantity,
        price_per_token: pricePerToken,
        total_value: totalValue,
        fee: options.fee || 0,
        from_address: options.fromAddress,
        to_address: options.toAddress,
        tx_hash: options.txHash,
        status: options.status || 'completed',
        notes: options.notes,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async getWatchlist(walletAddress: string): Promise<WatchlistItem[]> {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('wallet_address', walletAddress)
      .maybeSingle();

    if (!profile) return [];

    const { data, error } = await supabase
      .from('user_watchlist')
      .select(`
        *,
        token:tokens(id, symbol, name, coingecko_id, logo_url)
      `)
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  static async addToWatchlist(
    walletAddress: string,
    tokenId: string,
    tokenName?: string,
    tokenSymbol?: string,
    logoUrl?: string,
    price?: number
  ): Promise<void> {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('wallet_address', walletAddress)
      .maybeSingle();

    if (!profile) {
      const { data: newProfile, error: profileError } = await supabase
        .from('user_profiles')
        .insert({
          wallet_address: walletAddress,
          username: `user_${walletAddress.slice(0, 8)}`,
        })
        .select()
        .single();

      if (profileError) throw profileError;

      const { data: tokenData } = await supabase
        .from('tokens')
        .select('id')
        .eq('coingecko_id', tokenId)
        .maybeSingle();

      let finalTokenId = tokenData?.id;

      if (!finalTokenId && tokenName && tokenSymbol) {
        const { data: newToken, error: tokenError } = await supabase
          .from('tokens')
          .insert({
            symbol: tokenSymbol,
            name: tokenName,
            coingecko_id: tokenId,
            logo_url: logoUrl,
          })
          .select()
          .single();

        if (tokenError) throw tokenError;
        finalTokenId = newToken.id;
      }

      const { error } = await supabase.from('user_watchlist').insert({
        user_id: newProfile.id,
        token_id: finalTokenId || tokenId,
      });

      if (error && !error.message.includes('duplicate')) {
        throw error;
      }
      return;
    }

    const { data: tokenData } = await supabase
      .from('tokens')
      .select('id')
      .eq('coingecko_id', tokenId)
      .maybeSingle();

    let finalTokenId = tokenData?.id;

    if (!finalTokenId && tokenName && tokenSymbol) {
      const { data: newToken, error: tokenError } = await supabase
        .from('tokens')
        .insert({
          symbol: tokenSymbol,
          name: tokenName,
          coingecko_id: tokenId,
          logo_url: logoUrl,
        })
        .select()
        .single();

      if (tokenError && !tokenError.message.includes('duplicate')) {
        throw tokenError;
      }
      finalTokenId = newToken?.id || tokenId;
    }

    const { error } = await supabase.from('user_watchlist').insert({
      user_id: profile.id,
      token_id: finalTokenId || tokenId,
    });

    if (error && !error.message.includes('duplicate')) {
      throw error;
    }
  }

  static async removeFromWatchlist(walletAddress: string, tokenId: string): Promise<void> {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('wallet_address', walletAddress)
      .maybeSingle();

    if (!profile) throw new Error('User profile not found');

    const { error } = await supabase
      .from('user_watchlist')
      .delete()
      .eq('user_id', profile.id)
      .eq('token_id', tokenId);

    if (error) throw error;
  }

  static async isInWatchlist(walletAddress: string, tokenId: string): Promise<boolean> {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('wallet_address', walletAddress)
      .maybeSingle();

    if (!profile) return false;

    const { data } = await supabase
      .from('user_watchlist')
      .select('id')
      .eq('user_id', profile.id)
      .eq('token_id', tokenId)
      .maybeSingle();

    return !!data;
  }

  static async getTotalBalance(walletAddress: string): Promise<number> {
    const assets = await this.getUserAssets(walletAddress);
    return assets.reduce((total, asset) => total + (asset.current_value || 0), 0);
  }
}
