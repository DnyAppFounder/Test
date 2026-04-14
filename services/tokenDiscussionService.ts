import { supabase } from '@/lib/supabase';

export interface TokenDiscussion {
  id: string;
  token_address: string;
  user_wallet: string;
  message: string;
  created_at: string;
  updated_at: string;
  likes_count: number;
  replies_count: number;
  parent_id: string | null;
}

class TokenDiscussionService {
  async getDiscussions(tokenAddress: string, limit: number = 50): Promise<TokenDiscussion[]> {
    try {
      const { data, error } = await supabase
        .from('token_discussions')
        .select('*')
        .eq('token_address', tokenAddress)
        .is('parent_id', null)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Error fetching discussions:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error in getDiscussions:', error);
      return [];
    }
  }

  async postMessage(
    tokenAddress: string,
    walletAddress: string,
    message: string,
    parentId?: string
  ): Promise<TokenDiscussion | null> {
    try {
      const { data, error } = await supabase
        .from('token_discussions')
        .insert({
          token_address: tokenAddress,
          user_wallet: walletAddress,
          message,
          parent_id: parentId || null,
        })
        .select()
        .maybeSingle();

      if (error) {
        console.error('Error posting message:', error);
        return null;
      }

      if (parentId) {
        await supabase.rpc('increment_replies_count', { discussion_id: parentId });
      }

      return data;
    } catch (error) {
      console.error('Error in postMessage:', error);
      return null;
    }
  }

  async deleteMessage(messageId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('token_discussions')
        .delete()
        .eq('id', messageId);

      if (error) {
        console.error('Error deleting message:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error in deleteMessage:', error);
      return false;
    }
  }

  formatWalletAddress(address: string): string {
    if (address.length < 12) return address;
    return `${address.substring(0, 4)}...${address.substring(address.length - 4)}`;
  }

  formatTimeAgo(timestamp: string): string {
    const date = new Date(timestamp);
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return date.toLocaleDateString();
  }
}

export const tokenDiscussionService = new TokenDiscussionService();
