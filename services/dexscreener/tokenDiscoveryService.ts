const DEX_SCREENER_BASE = 'https://api.dexscreener.com/latest/dex';
const CACHE_DURATION = 2 * 60 * 1000;

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
}

class DexScreenerService {
  private cache = new Map<string, CacheEntry<any>>();

  private isCached(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    return Date.now() - entry.timestamp < CACHE_DURATION;
  }

  private getCache<T>(key: string): T | null {
    if (!this.isCached(key)) return null;
    return this.cache.get(key)?.data || null;
  }

  private setCache<T>(key: string, data: T) {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  async searchTokens(query: string): Promise<DexPair[]> {
    const cacheKey = `search:${query}`;
    const cached = this.getCache<DexPair[]>(cacheKey);
    if (cached) return cached;

    try {
      const response = await fetch(`${DEX_SCREENER_BASE}/search?q=${encodeURIComponent(query)}`);
      if (!response.ok) return [];

      const data = await response.json();
      const pairs = data.pairs || [];
      this.setCache(cacheKey, pairs);
      return pairs;
    } catch (error) {
      console.error('DexScreener search error:', error);
      return [];
    }
  }

  async getTokenByAddress(tokenAddress: string): Promise<DexPair[]> {
    const cacheKey = `token:${tokenAddress}`;
    const cached = this.getCache<DexPair[]>(cacheKey);
    if (cached) return cached;

    try {
      const response = await fetch(`${DEX_SCREENER_BASE}/tokens/${tokenAddress}`);
      if (!response.ok) return [];

      const data = await response.json();
      const pairs = data.pairs || [];
      this.setCache(cacheKey, pairs);
      return pairs;
    } catch (error) {
      console.error('DexScreener token error:', error);
      return [];
    }
  }

  async getPairByAddress(pairAddress: string): Promise<DexPair | null> {
    const cacheKey = `pair:${pairAddress}`;
    const cached = this.getCache<DexPair>(cacheKey);
    if (cached) return cached;

    try {
      const response = await fetch(`${DEX_SCREENER_BASE}/pairs/solana/${pairAddress}`);
      if (!response.ok) return null;

      const data = await response.json();
      const pair = data.pair || null;
      if (pair) this.setCache(cacheKey, pair);
      return pair;
    } catch (error) {
      console.error('DexScreener pair error:', error);
      return null;
    }
  }

  async getTrendingSolanaTokens(): Promise<DexPair[]> {
    const cacheKey = 'trending:solana';
    const cached = this.getCache<DexPair[]>(cacheKey);
    if (cached) return cached;

    try {
      // DexScreener API format: /tokens/{chainId}
      // Get top tokens by filtering for Solana pairs with high volume
      const response = await fetch('https://api.dexscreener.com/token-boosts/top/v1');
      if (!response.ok) {
        // Fallback: get latest boosted tokens
        return this.getBoostedSolanaTokens();
      }

      const data = await response.json();

      // Filter for Solana tokens and map to our format
      const solanaPairs = (data || [])
        .filter((item: any) => item.chainId === 'solana')
        .slice(0, 50);

      this.setCache(cacheKey, solanaPairs);
      return solanaPairs;
    } catch (error) {
      console.error('DexScreener trending error:', error);
      // Fallback to search for popular Solana tokens
      return this.getTopSolanaTokensBySearch();
    }
  }

  async getBoostedSolanaTokens(): Promise<DexPair[]> {
    const cacheKey = 'boosted:solana';
    const cached = this.getCache<DexPair[]>(cacheKey);
    if (cached) return cached;

    try {
      const response = await fetch('https://api.dexscreener.com/token-boosts/top/v1');
      if (!response.ok) return this.getTopSolanaTokensBySearch();

      const data = await response.json();
      const solanaPairs = (data || [])
        .filter((item: any) => item.chainId === 'solana' && item.totalAmount > 0)
        .slice(0, 50);

      this.setCache(cacheKey, solanaPairs);
      return solanaPairs;
    } catch (error) {
      console.error('DexScreener boosted error:', error);
      return this.getTopSolanaTokensBySearch();
    }
  }

  async getNewSolanaTokens(): Promise<DexPair[]> {
    const cacheKey = 'new:solana';
    const cached = this.getCache<DexPair[]>(cacheKey);
    if (cached) return cached;

    try {
      // Get latest token profiles which includes new tokens
      const response = await fetch('https://api.dexscreener.com/token-profiles/latest/v1');
      if (!response.ok) return this.getTopSolanaTokensBySearch();

      const data = await response.json();
      const addresses = (data || [])
        .filter((item: any) => item.chainId === 'solana')
        .slice(0, 20)
        .map((item: any) => item.tokenAddress);

      // Fetch pair data for these addresses
      const pairPromises = addresses.map((addr: string) => this.getTokenByAddress(addr));
      const pairResults = await Promise.all(pairPromises);

      const pairs = pairResults
        .flat()
        .filter((p) => p && p.pairCreatedAt)
        .sort((a, b) => (b.pairCreatedAt || 0) - (a.pairCreatedAt || 0))
        .slice(0, 50);

      this.setCache(cacheKey, pairs);
      return pairs;
    } catch (error) {
      console.error('DexScreener new tokens error:', error);
      return this.getTopSolanaTokensBySearch();
    }
  }

  private async getTopSolanaTokensBySearch(): Promise<DexPair[]> {
    // Fallback: search for common/popular tokens
    const popularTokens = ['SOL', 'USDC', 'BONK', 'WIF', 'JUP', 'PYTH', 'JTO', 'ORCA'];
    const results: DexPair[] = [];

    for (const token of popularTokens.slice(0, 5)) {
      try {
        const pairs = await this.searchTokens(token);
        if (pairs.length > 0) {
          // Get the pair with highest liquidity for each token
          const topPair = pairs
            .filter((p) => p.chainId === 'solana')
            .sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
          if (topPair) results.push(topPair);
        }
      } catch (err) {
        console.error(`Error fetching ${token}:`, err);
      }
    }

    return results;
  }

  clearCache() {
    this.cache.clear();
  }
}

export const dexScreenerService = new DexScreenerService();
