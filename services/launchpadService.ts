import { supabase } from '@/lib/supabase';

export interface LaunchpadToken {
  id: string;
  mint_address: string | null;
  creator_wallet: string;
  token_program: string;
  name: string;
  symbol: string;
  description: string | null;
  image_url: string | null;
  metadata_uri: string | null;
  decimals: number;
  total_supply: number;
  creator_allocation: number;
  liquidity_allocation: number;
  status: 'pending' | 'deployed' | 'failed';
  website: string | null;
  telegram: string | null;
  twitter: string | null;
  discord: string | null;
  creation_tx: string | null;
  created_at: string;
  updated_at: string;
}

export interface LaunchpadStats {
  totalLaunched: number;
  totalVolume: number;
  last24h: number;
  successRate: number;
}

export interface CreateTokenInput {
  name: string;
  symbol: string;
  description: string;
  decimals: number;
  totalSupply: number;
  creatorAllocation: number;
  liquidityAllocation: number;
  website?: string;
  telegram?: string;
  twitter?: string;
  discord?: string;
  imageUrl?: string;
  tokenProgram?: 'spl-token' | 'token-2022';
  creatorWallet: string;
}

class LaunchpadService {
  async getStats(): Promise<LaunchpadStats> {
    try {
      const { count: total } = await supabase
        .from('launchpad_tokens')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'deployed');

      const yesterday = new Date(Date.now() - 86_400_000).toISOString();
      const { count: last24h } = await supabase
        .from('launchpad_tokens')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'deployed')
        .gte('created_at', yesterday);

      const { count: allCount } = await supabase
        .from('launchpad_tokens')
        .select('*', { count: 'exact', head: true });

      const deployedCount = total ?? 0;
      const allTotal = allCount ?? 0;

      return {
        totalLaunched: deployedCount,
        totalVolume: deployedCount * 1200,
        last24h: last24h ?? 0,
        successRate: allTotal > 0 ? Math.round((deployedCount / allTotal) * 100) : 100,
      };
    } catch {
      return { totalLaunched: 0, totalVolume: 0, last24h: 0, successRate: 100 };
    }
  }

  async getTokens(filter: 'trending' | 'new' | 'near_launch' | 'completed' = 'new', limit = 20): Promise<LaunchpadToken[]> {
    try {
      let query = supabase
        .from('launchpad_tokens')
        .select('*')
        .eq('status', 'deployed')
        .limit(limit);

      if (filter === 'new' || filter === 'trending') {
        query = query.order('created_at', { ascending: false });
      } else if (filter === 'near_launch') {
        query = query.order('created_at', { ascending: true });
      } else {
        query = query.order('total_supply', { ascending: false });
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data as LaunchpadToken[]) ?? [];
    } catch {
      return [];
    }
  }

  async getFeatured(): Promise<LaunchpadToken | null> {
    try {
      const { data } = await supabase
        .from('launchpad_tokens')
        .select('*')
        .eq('status', 'deployed')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as LaunchpadToken | null;
    } catch {
      return null;
    }
  }

  async getCreatorTokens(walletAddress: string): Promise<LaunchpadToken[]> {
    try {
      const { data, error } = await supabase
        .from('launchpad_tokens')
        .select('*')
        .eq('creator_wallet', walletAddress)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as LaunchpadToken[]) ?? [];
    } catch {
      return [];
    }
  }

  async createRecord(input: CreateTokenInput): Promise<LaunchpadToken | null> {
    try {
      const { data, error } = await supabase
        .from('launchpad_tokens')
        .insert({
          creator_wallet: input.creatorWallet,
          token_program: input.tokenProgram ?? 'spl-token',
          name: input.name,
          symbol: input.symbol.toUpperCase(),
          description: input.description,
          decimals: input.decimals,
          total_supply: input.totalSupply,
          creator_allocation: input.creatorAllocation,
          liquidity_allocation: input.liquidityAllocation,
          status: 'pending',
          website: input.website || null,
          telegram: input.telegram || null,
          twitter: input.twitter || null,
          discord: input.discord || null,
          image_url: input.imageUrl || null,
          updated_at: new Date().toISOString(),
        })
        .select()
        .maybeSingle();

      if (error) throw error;
      return data as LaunchpadToken | null;
    } catch (e) {
      console.error('[LaunchpadService] createRecord error:', e);
      return null;
    }
  }

  async updateRecord(id: string, updates: Partial<LaunchpadToken>): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('launchpad_tokens')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id);
      return !error;
    } catch {
      return false;
    }
  }

  async uploadImage(walletAddress: string, imageUri: string): Promise<string | null> {
    try {
      const response = await fetch(imageUri);
      const blob = await response.blob();
      const ext = imageUri.split('.').pop()?.toLowerCase() || 'png';
      const filename = `launchpad/${walletAddress}/${Date.now()}.${ext}`;

      const { error } = await supabase.storage
        .from('post-media')
        .upload(filename, blob, { contentType: `image/${ext}`, upsert: true });

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from('post-media')
        .getPublicUrl(filename);

      return urlData.publicUrl;
    } catch (e) {
      console.error('[LaunchpadService] uploadImage error:', e);
      return null;
    }
  }

  async uploadMetadata(metadata: object, tokenId: string): Promise<string | null> {
    try {
      const jsonStr = JSON.stringify(metadata);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const filename = `launchpad/metadata/${tokenId}.json`;

      const { error } = await supabase.storage
        .from('post-media')
        .upload(filename, blob, { contentType: 'application/json', upsert: true });

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from('post-media')
        .getPublicUrl(filename);

      return urlData.publicUrl;
    } catch (e) {
      console.error('[LaunchpadService] uploadMetadata error:', e);
      return null;
    }
  }
}

export const launchpadService = new LaunchpadService();
