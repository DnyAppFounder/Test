import { dexScreenerService } from './dexscreener/tokenDiscoveryService';

export interface TrendingTokenNotification {
  mint: string;
  name: string;
  symbol: string;
  imageUrl?: string;
  priceUsd?: number;
  priceChange24h?: number;
  volume24h?: number;
  liquidity?: number;
}

const COOLDOWN_MS     = 45 * 60 * 1000; // 45 min cooldown per token
const FETCH_INTERVAL  = 5  * 60 * 1000; // 5 min between API refreshes
const MIN_PRICE_CHANGE = 5;             // 5% minimum absolute 24h change
const MIN_VOLUME       = 50_000;        // $50k minimum 24h volume
const MIN_LIQUIDITY    = 10_000;        // $10k minimum liquidity

class TrendingNotificationService {
  private seenAt  = new Map<string, number>(); // mint → timestamp last shown
  private queue: TrendingTokenNotification[] = [];
  private lastFetch = 0;

  /**
   * Returns the next qualifying trending token that hasn't been shown
   * recently, or null if none is available.
   */
  async getNextTrendingToken(): Promise<TrendingTokenNotification | null> {
    await this.refreshIfStale();

    const now = Date.now();
    for (const token of this.queue) {
      const lastSeen = this.seenAt.get(token.mint) ?? 0;
      if (now - lastSeen >= COOLDOWN_MS) {
        return token;
      }
    }
    return null;
  }

  /**
   * Mark a token as seen (called on banner press or dismiss).
   * Starts the cooldown so the same token doesn't re-appear too soon.
   */
  markSeen(mint: string): void {
    this.seenAt.set(mint, Date.now());
  }

  private async refreshIfStale(): Promise<void> {
    if (Date.now() - this.lastFetch < FETCH_INTERVAL) return;
    this.lastFetch = Date.now(); // set early to prevent concurrent fetches

    try {
      const pairs = await dexScreenerService.getTrendingSolanaTokens();

      const candidates = pairs
        .filter(p => {
          const absChange = Math.abs(p.priceChange?.h24 ?? 0);
          const vol       = p.volume?.h24 ?? 0;
          const liq       = p.liquidity?.usd ?? 0;
          return (
            absChange >= MIN_PRICE_CHANGE &&
            vol       >= MIN_VOLUME &&
            liq       >= MIN_LIQUIDITY
          );
        })
        // Most interesting (largest absolute price move) first
        .sort(
          (a, b) =>
            Math.abs(b.priceChange?.h24 ?? 0) - Math.abs(a.priceChange?.h24 ?? 0)
        );

      this.queue = candidates.map(p => ({
        mint:          p.baseToken.address,
        name:          p.baseToken.name,
        symbol:        p.baseToken.symbol,
        imageUrl:      p.info?.imageUrl,
        priceUsd:      parseFloat(p.priceUsd || '0') || undefined,
        priceChange24h: p.priceChange?.h24,
        volume24h:     p.volume?.h24,
        liquidity:     p.liquidity?.usd,
      }));

      console.log('[TrendingNotif] refreshed queue:', this.queue.length, 'tokens');
    } catch {
      // keep stale queue on error
    }
  }
}

export const trendingNotificationService = new TrendingNotificationService();
