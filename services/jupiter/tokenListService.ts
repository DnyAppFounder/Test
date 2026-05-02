import Constants from 'expo-constants';

const JUPITER_TOKEN_LIST_URL = 'https://token.jup.ag/all';
const CACHE_DURATION = 5 * 60 * 1000;

function getProxyTokenListUrl(): string {
  const supabaseUrl = Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
  if (supabaseUrl) {
    return `${supabaseUrl}/functions/v1/solana-rpc?action=tokens`;
  }
  return '';
}

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
  private fetchInProgress: Promise<JupiterToken[]> | null = null;

  async getAllTokens(): Promise<JupiterToken[]> {
    const now = Date.now();
    if (this.cache.length > 0 && now - this.cacheTime < CACHE_DURATION) {
      return this.cache;
    }

    if (this.fetchInProgress) return this.fetchInProgress;

    this.fetchInProgress = this.doFetch();
    try {
      return await this.fetchInProgress;
    } finally {
      this.fetchInProgress = null;
    }
  }

  private async doFetch(): Promise<JupiterToken[]> {
    // Try direct first
    try {
      const response = await fetch(JUPITER_TOKEN_LIST_URL);
      if (response.ok) {
        const tokens = await response.json();
        this.cache = tokens;
        this.cacheTime = Date.now();
        return tokens;
      }
    } catch {}

    // Try via proxy
    const proxyUrl = getProxyTokenListUrl();
    if (proxyUrl) {
      try {
        const response = await fetch(proxyUrl);
        if (response.ok) {
          const tokens = await response.json();
          this.cache = tokens;
          this.cacheTime = Date.now();
          return tokens;
        }
      } catch {}
    }

    console.log('[TokenList] Both direct and proxy failed, returning cache');
    return this.cache;
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
