import Constants from 'expo-constants';

// jupiter strict list = verified tokens only (much smaller, faster)
// jupiter all list = every token including community/unverified
const JUPITER_STRICT_URL = 'https://token.jup.ag/strict';
const JUPITER_ALL_URL = 'https://token.jup.ag/all';
const CACHE_DURATION = 5 * 60 * 1000;

function getProxyBase(): string {
  const supabaseUrl =
    Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_URL ||
    process.env.EXPO_PUBLIC_SUPABASE_URL ||
    '';
  if (supabaseUrl) return `${supabaseUrl}/functions/v1/solana-rpc`;
  return '';
}

function getAnonKey(): string {
  return (
    Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
    ''
  );
}

function proxyHeaders(): Record<string, string> {
  const key = getAnonKey();
  return key ? { Authorization: `Bearer ${key}`, apikey: key } : {};
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

// Required tokens that must always be available even when API calls fail.
// These mints are canonical Solana tokens — not placeholders.
const REQUIRED_TOKENS: JupiterToken[] = [
  {
    address: 'So11111111111111111111111111111111111111112',
    chainId: 101, decimals: 9, name: 'Wrapped SOL', symbol: 'SOL',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
    tags: ['verified'],
  },
  {
    address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    chainId: 101, decimals: 6, name: 'USD Coin', symbol: 'USDC',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
    tags: ['verified', 'strict'],
  },
  {
    address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    chainId: 101, decimals: 6, name: 'USDT', symbol: 'USDT',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.png',
    tags: ['verified', 'strict'],
  },
  {
    address: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
    chainId: 101, decimals: 6, name: 'Jupiter', symbol: 'JUP',
    logoURI: 'https://static.jup.ag/jup/icon.png',
    tags: ['verified', 'strict'],
  },
  {
    address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
    chainId: 101, decimals: 5, name: 'Bonk', symbol: 'BONK',
    logoURI: 'https://arweave.net/hQiPZOsRZXGXBJd_82PhVdlM_hACsT_q6wqwf5cSY7I',
    tags: ['verified'],
  },
  {
    address: '4k3Dyjzvzp8eMrzpTGE6RkFGSNJoSz8e6oWz8S8HtFr',
    chainId: 101, decimals: 6, name: 'Raydium', symbol: 'RAY',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/4k3Dyjzvzp8eMrzpTGE6RkFGSNJoSz8e6oWz8S8HtFr/logo.png',
    tags: ['verified'],
  },
  {
    address: 'orcaEKTdK7LKz57vaAYr6AC93NStx7QLt3pPDzBEFP',
    chainId: 101, decimals: 6, name: 'Orca', symbol: 'ORCA',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/orcaEKTdK7LKz57vaAYr6AC93NStx7QLt3pPDzBEFP/logo.png',
    tags: ['verified'],
  },
];

// Index for O(1) override lookup
const REQUIRED_INDEX = new Map<string, JupiterToken>(
  REQUIRED_TOKENS.map(t => [t.address, t])
);

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
    const proxy = getProxyBase();
    const headers = proxyHeaders();

    // Try proxy first (avoids CORS in browser), then direct as fallback
    const attempts: Array<() => Promise<Response>> = [];

    if (proxy) {
      // Proxy strict list
      attempts.push(() => fetch(`${proxy}?action=tokens&list=strict`, { headers }));
      // Proxy all list
      attempts.push(() => fetch(`${proxy}?action=tokens`, { headers }));
    }
    // Direct fallback (works in native / server; blocked by CORS in browser)
    attempts.push(() => fetch(JUPITER_STRICT_URL));
    attempts.push(() => fetch(JUPITER_ALL_URL));

    for (const attempt of attempts) {
      try {
        const res = await attempt();
        if (!res.ok) continue;
        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0) continue;
        const merged = this.mergeWithRequired(data);
        this.cache = merged;
        this.cacheTime = Date.now();
        console.log('[TokenList] Loaded', merged.length, 'tokens');
        return merged;
      } catch (e: any) {
        console.log('[TokenList] Attempt failed:', e?.message?.slice(0, 80));
      }
    }

    // All attempts failed — return required tokens so the app is not completely empty
    console.warn('[TokenList] All fetch attempts failed, using required tokens only');
    const fallback = Array.from(REQUIRED_INDEX.values());
    this.cache = fallback;
    this.cacheTime = Date.now();
    return fallback;
  }

  /** Merge API list with required tokens, preferring API data but ensuring required ones are present */
  private mergeWithRequired(apiTokens: JupiterToken[]): JupiterToken[] {
    const map = new Map<string, JupiterToken>();
    for (const t of apiTokens) {
      map.set(t.address, t);
    }
    // Ensure required tokens are present; use API data if available (may have fresher logoURI etc)
    for (const req of REQUIRED_TOKENS) {
      if (!map.has(req.address)) {
        map.set(req.address, req);
      }
    }
    return Array.from(map.values());
  }

  async searchTokens(query: string): Promise<JupiterToken[]> {
    const allTokens = await this.getAllTokens();
    const q = query.toLowerCase().trim();
    if (!q) return [];

    // Exact mint match — return immediately
    const exactMint = allTokens.find(t => t.address.toLowerCase() === q);
    if (exactMint) return [exactMint];

    return allTokens.filter(
      t =>
        t.name.toLowerCase().includes(q) ||
        t.symbol.toLowerCase().includes(q) ||
        t.address.toLowerCase().includes(q)
    ).slice(0, 50);
  }

  async getTokenByAddress(address: string): Promise<JupiterToken | null> {
    // Check required index first (O(1), always available)
    if (REQUIRED_INDEX.has(address)) {
      // Still check cache in case API gave us fresher data
      const cached = this.cache.find(t => t.address === address);
      return cached ?? REQUIRED_INDEX.get(address)!;
    }
    const allTokens = await this.getAllTokens();
    return allTokens.find(t => t.address === address) ?? null;
  }

  async getVerifiedTokens(): Promise<JupiterToken[]> {
    const allTokens = await this.getAllTokens();
    return allTokens.filter(
      t => t.tags?.includes('verified') || t.tags?.includes('strict') || t.tags?.includes('community')
    );
  }

  clearCache() {
    this.cache = [];
    this.cacheTime = 0;
  }
}

export const jupiterTokenListService = new JupiterTokenListService();
