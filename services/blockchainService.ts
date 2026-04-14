import { supabase } from '@/lib/supabase';
import { Blockchain, Token, TokenPrice, DApp } from '@/types/crypto';

export class BlockchainService {
  static async getBlockchains(): Promise<Blockchain[]> {
    try {
      const { data, error } = await supabase
        .from('blockchains')
        .select('*')
        .eq('is_active', true)
        .order('order_index');

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching blockchains:', error);
      return [];
    }
  }

  static async getTokens(blockchainId?: string): Promise<Token[]> {
    try {
      let query = supabase
        .from('tokens')
        .select('*')
        .eq('is_verified', true);

      if (blockchainId) {
        query = query.eq('blockchain_id', blockchainId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching tokens:', error);
      return [];
    }
  }

  static async getTokenPrices(tokenIds: string[]): Promise<Record<string, TokenPrice>> {
    try {
      const { data, error } = await supabase
        .from('token_prices')
        .select('*')
        .in('token_id', tokenIds);

      if (error) throw error;

      const pricesMap: Record<string, TokenPrice> = {};
      data?.forEach(price => {
        pricesMap[price.token_id] = price;
      });

      return pricesMap;
    } catch (error) {
      console.error('Error fetching token prices:', error);
      return {};
    }
  }

  static async getDApps(category?: string): Promise<DApp[]> {
    try {
      let query = supabase
        .from('dapps')
        .select('*')
        .order('order_index');

      if (category) {
        query = query.eq('category', category);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching dApps:', error);
      return [];
    }
  }

  static async getFeaturedDApps(): Promise<DApp[]> {
    try {
      const { data, error } = await supabase
        .from('dapps')
        .select('*')
        .eq('is_featured', true)
        .order('order_index')
        .limit(6);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching featured dApps:', error);
      return [];
    }
  }

  static async logAnalyticsEvent(
    eventType: string,
    blockchainId?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      await supabase.from('analytics_events').insert({
        event_type: eventType,
        blockchain_id: blockchainId,
        metadata: metadata || {},
      });
    } catch (error) {
      console.error('Error logging analytics:', error);
    }
  }
}
