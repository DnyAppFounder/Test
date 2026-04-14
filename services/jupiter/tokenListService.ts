const JUPITER_TOKEN_LIST_URL = 'https://token.jup.ag/all';
const CACHE_DURATION = 5 * 60 * 1000;

export interface JupiterToken {
  address: string;
  chainId: number;
  decimals: number;
  name: string;
  symbol: string;
  logoURI?: string;
  tags?: string[];
  extensions?: {
    coingeckoId?: string;
  };
}

class JupiterTokenListService {
  private cache: JupiterToken[] = [];
  private cacheTime = 0;

  async getAllTokens(): Promise<JupiterToken[]> {
    const now = Date.now();
    if (this.cache.length > 0 && now - this.cacheTime < CACHE_DURATION) {
      return this.cache;
    }

    try {
      const response = await fetch(JUPITER_TOKEN_LIST_URL);
      if (!response.ok) return this.cache;

      const tokens = await response.json();
      this.cache = tokens;
      this.cacheTime = now;
      return tokens;
    } catch (error) {
      console.error('Error fetching Jupiter token list:', error);
      return this.cache;
    }
  }

  async searchTokens(query: string): Promise<JupiterToken[]> {
    const allTokens = await this.getAllTokens();
    const searchLower = query.toLowerCase();

    return allTokens.filter(
      (token) =>
        token.name.toLowerCase().includes(searchLower) ||
        token.symbol.toLowerCase().includes(searchLower) ||
        token.address.toLowerCase().includes(searchLower)
    ).slice(0, 50);
  }

  async getTokenByAddress(address: string): Promise<JupiterToken | null> {
    const allTokens = await this.getAllTokens();
    return allTokens.find((t) => t.address === address) || null;
  }

  async getVerifiedTokens(): Promise<JupiterToken[]> {
    const allTokens = await this.getAllTokens();
    return allTokens.filter((token) =>
      token.tags?.includes('verified') || token.tags?.includes('community')
    );
  }

  clearCache() {
    this.cache = [];
    this.cacheTime = 0;
  }
}

export const jupiterTokenListService = new JupiterTokenListService();
