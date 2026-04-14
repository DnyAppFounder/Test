import { tokenActivityService } from './tokenActivityService';

export interface TokenTransaction {
  signature: string;
  type: 'buy' | 'sell';
  wallet: string;
  amount: number;
  tokenAmount: number;
  timestamp: number;
  pricePerToken: number;
}

class TransactionFeedService {
  async getRecentTransactions(tokenMint: string): Promise<TokenTransaction[]> {
    try {
      const activities = await tokenActivityService.getTokenActivity(tokenMint);

      return activities.map(activity => ({
        signature: activity.txSignature || activity.id,
        type: activity.type,
        wallet: activity.walletAddress,
        amount: activity.amount,
        tokenAmount: activity.tokenAmount,
        timestamp: activity.timestamp,
        pricePerToken: activity.priceUsd,
      }));
    } catch (error) {
      console.error('Error fetching transactions:', error);
      return [];
    }
  }


  formatTimeAgo(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (seconds < 60) return `${seconds}s ago`;
    if (minutes < 60) return `${minutes}m ago`;
    return `${hours}h ago`;
  }

  formatAmount(amount: number): string {
    if (amount >= 1000) {
      return `$${(amount / 1000).toFixed(2)}K`;
    }
    return `$${amount.toFixed(2)}`;
  }

  formatTokenAmount(amount: number): string {
    if (amount >= 1000000) {
      return `${(amount / 1000000).toFixed(2)}M`;
    }
    if (amount >= 1000) {
      return `${(amount / 1000).toFixed(2)}K`;
    }
    return amount.toFixed(2);
  }

}

export const transactionFeedService = new TransactionFeedService();
