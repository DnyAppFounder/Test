const DEX_SCREENER_BASE = 'https://api.dexscreener.com';
// Individual token/pair lookups are used for live trading — keep short
const CACHE_DURATION_TOKEN = 15_000;
// Search results are less latency-sensitive
const CACHE_DURATION_SEARCH = 60_000;
// Trending/new lists can stay fresh for 2 minutes
const CACHE_DURATION_LIST = 2 * 60 * 1000;

export interface DexPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: {
    address: string;
    name: string;
    symbol: string;
  };
  quoteToken: {
    address: string;
    name: string;
    symbol: string;
  };
  priceNative: string;
  priceUsd: string;
  liquidity?: {
    usd: number;
    base: number;
    quote: number;
  };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
  info?: {
    imageUrl?: string;
    websites?: { label: string; url: string }[];
    socials?: { type: string; url: string }[];
  };
  boosts?: {
    active: number;
  };
  volume?: {
    h24: number;
    h6: number;
    h1: number;
  };
  priceChange?: {
    h24: number;
    h6: number;
    h1: number;
    m5: number;
  };
  txns?: {
    h24: { buys: number; sells: number };
    h6: { buys: number; sells: number };
    h1: { buys: number; sells: number };
    m5: { buys: number; sells: number };
  };
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class DexScreenerService {
  private cache = new Map<string, CacheEntry<any>>();

  private isCached(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    return Date.now() - entry.timestamp < entry.ttl;
  }

  private getCache<T>(key: string): T | null {
    if (!this.isCached(key)) return null;
    return this.cache.get(key)?.data || null;
  }

  private setCache<T>(key: string, data: T, ttl: number) {
    this.cache.set(key, { data, timestamp: Date.now(), ttl });
  }

  async searchTokens(query: string): Promise<DexPair[]> {
    const cacheKey = `search:${query}`;
    const cached = this.getCache<DexPair[]>(cacheKey);
    if (cached) return cached;

    try {
      const response = await fetch(`${DEX_SCREENER_BASE}/latest/dex/search?q=${encodeURIComponent(query)}`);
      if (!response.ok) return [];

      const data = await response.json();
      const pairs: DexPair[] = (data.pairs || []).filter((p: DexPair) => p.chainId === 'solana');
      this.setCache(cacheKey, pairs, CACHE_DURATION_SEARCH);
      return pairs;
    } catch (error) {
      console.error('[DexScreener] Search error:', error);
      return [];
    }
  }

  async getTokenByAddress(tokenAddress: string): Promise<DexPair[]> {
    const cacheKey = `token:${tokenAddress}`;
    const cached = this.getCache<DexPair[]>(cacheKey);
    if (cached) return cached;

    try {
      const response = await fetch(`${DEX_SCREENER_BASE}/latest/dex/tokens/${tokenAddress}`);
      if (!response.ok) return [];

      const data = await response.json();
      const pairs: DexPair[] = (data.pairs || []).filter((p: DexPair) => p.chainId === 'solana');
      this.setCache(cacheKey, pairs, CACHE_DURATION_TOKEN);
      return pairs;
    } catch (error) {
      console.error('[DexScreener] Token lookup error:', error);
      return [];
    }
  }

  async getPairByAddress(pairAddress: string): Promise<DexPair | null> {
    const cacheKey = `pair:${pairAddress}`;
    const cached = this.getCache<DexPair>(cacheKey);
    if (cached) return cached;

    try {
      const response = await fetch(`${DEX_SCREENER_BASE}/latest/dex/pairs/solana/${pairAddress}`);
      if (!response.ok) return null;

      const data = await response.json();
      const pair = data.pair || data.pairs?.[0] || null;
      if (pair) this.setCache(cacheKey, pair, CACHE_DURATION_TOKEN);
      return pair;
    } catch (error) {
      console.error('[DexScreener] Pair lookup error:', error);
      return null;
    }
  }

  /**
   * Get the best Solana pair for a token mint (highest liquidity).
   * Used for embedding Dexscreener chart.
   */
  async getBestPairAddress(tokenMint: string): Promise<string | null> {
    const pairs = await this.getTokenByAddress(tokenMint);
    if (pairs.length === 0) return null;

    const sorted = pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
    return sorted[0].pairAddress;
  }

  async getTrendingSolanaTokens(): Promise<DexPair[]> {
    const cacheKey = 'trending:solana';
    const cached = this.getCache<DexPair[]>(cacheKey);
    if (cached) return cached;

    try {
      // token-boosts returns [{chainId, tokenAddress, amount, totalAmount, ...}]
      // We need to resolve these to actual pair data
      const response = await fetch(`${DEX_SCREENER_BASE}/token-boosts/top/v1`);
      if (!response.ok) return this.getTopSolanaTokensBySearch();

      const boosts: any[] = await response.json();
      const solanaBoosts = (boosts || [])
        .filter((item: any) => item.chainId === 'solana')
        .slice(0, 20);

      if (solanaBoosts.length === 0) return this.getTopSolanaTokensBySearch();

      // Fetch actual pair data for each boosted token
      const pairPromises = solanaBoosts.map((boost: any) =>
        this.getTokenByAddress(boost.tokenAddress).catch(() => [] as DexPair[])
      );
      const pairResults = await Promise.all(pairPromises);

      // Take the highest-liquidity pair for each token
      const pairs: DexPair[] = [];
      for (const tokenPairs of pairResults) {
        if (tokenPairs.length > 0) {
          const best = tokenPairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
          pairs.push(best);
        }
      }

      this.setCache(cacheKey, pairs, CACHE_DURATION_LIST);
      return pairs;
    } catch (error) {
      console.error('[DexScreener] Trending error:', error);
      return this.getTopSolanaTokensBySearch();
    }
  }

  async getBoostedSolanaTokens(): Promise<DexPair[]> {
    // Same logic as trending — both use token-boosts
    return this.getTrendingSolanaTokens();
  }

  async getNewSolanaTokens(): Promise<DexPair[]> {
    const cacheKey = 'new:solana';
    const cached = this.getCache<DexPair[]>(cacheKey);
    if (cached) return cached;

    try {
      const response = await fetch(`${DEX_SCREENER_BASE}/token-profiles/latest/v1`);
      if (!response.ok) return this.getTopSolanaTokensBySearch();

      const data: any[] = await response.json();
      const addresses = (data || [])
        .filter((item: any) => item.chainId === 'solana')
        .slice(0, 15)
        .map((item: any) => item.tokenAddress);

      if (addresses.length === 0) return this.getTopSolanaTokensBySearch();

      const pairPromises = addresses.map((addr: string) =>
        this.getTokenByAddress(addr).catch(() => [] as DexPair[])
      );
      const pairResults = await Promise.all(pairPromises);

      const pairs: DexPair[] = [];
      for (const tokenPairs of pairResults) {
        if (tokenPairs.length > 0) {
          const best = tokenPairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
          pairs.push(best);
        }
      }

      pairs.sort((a, b) => (b.pairCreatedAt || 0) - (a.pairCreatedAt || 0));

      this.setCache(cacheKey, pairs, CACHE_DURATION_LIST);
      return pairs;
    } catch (error) {
      console.error('[DexScreener] New tokens error:', error);
      return this.getTopSolanaTokensBySearch();
    }
  }

  private async getTopSolanaTokensBySearch(): Promise<DexPair[]> {
    const popularTokens = ['SOL', 'BONK', 'WIF', 'JUP', 'PYTH', 'JTO', 'ORCA'];
    const results: DexPair[] = [];

    for (const token of popularTokens.slice(0, 5)) {
      try {
        const pairs = await this.searchTokens(token);
        if (pairs.length > 0) {
          const topPair = pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
          if (topPair) results.push(topPair);
        }
      } catch (err) {
        console.error(`[DexScreener] Fallback fetch ${token}:`, err);
      }
    }

    return results;
  }

  clearCache() {
    this.cache.clear();
  }
}

export const dexScreenerService = new DexScreenerService();
