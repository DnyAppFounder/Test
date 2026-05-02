import Constants from 'expo-constants';

export interface TokenPrice {
  mint: string;
  price: number;
  priceChange24h: number;
  volume24h: number;
  lastUpdated: number;
}

const DEXSCREENER_API = 'https://api.dexscreener.com/latest/dex/tokens';

export class SolanaPriceService {
  private priceCache: Map<string, TokenPrice>;
  private cacheExpiry: number = 30000;

  constructor() {
    this.priceCache = new Map();
  }

  async getTokenPrice(mintAddress: string): Promise<TokenPrice | null> {
    const cached = this.priceCache.get(mintAddress);
    if (cached && Date.now() - cached.lastUpdated < this.cacheExpiry) {
      return cached;
    }

    try {
      const response = await fetch(`${DEXSCREENER_API}/${mintAddress}`);
      if (!response.ok) {
        console.log('[PriceService] DexScreener error:', response.status);
        return this.getFallback(mintAddress);
      }

      const data = await response.json();
      const pairs = data?.pairs;

      if (pairs && pairs.length > 0) {
        const pair = pairs[0];
        const price: TokenPrice = {
          mint: mintAddress,
          price: parseFloat(pair.priceUsd) || 0,
          priceChange24h: pair.priceChange?.h24 || 0,
          volume24h: pair.volume?.h24 || 0,
          lastUpdated: Date.now(),
        };
        this.priceCache.set(mintAddress, price);
        return price;
      }

      return this.getFallback(mintAddress);
    } catch (error) {
      console.log('[PriceService] Fetch error for', mintAddress.slice(0, 8), error);
      return this.getFallback(mintAddress);
    }
  }

  async getBatchPrices(mintAddresses: string[]): Promise<Map<string, TokenPrice>> {
    const results = new Map<string, TokenPrice>();

    const uncached: string[] = [];
    for (const mint of mintAddresses) {
      const cached = this.priceCache.get(mint);
      if (cached && Date.now() - cached.lastUpdated < this.cacheExpiry) {
        results.set(mint, cached);
      } else {
        uncached.push(mint);
      }
    }

    if (uncached.length === 0) return results;

    // DexScreener doesn't support batch, fetch individually
    await Promise.allSettled(
      uncached.map(async (mint) => {
        const price = await this.getTokenPrice(mint);
        if (price && price.price > 0) {
          results.set(mint, price);
        }
      })
    );

    return results;
  }

  async getSOLPrice(): Promise<number> {
    // Jupiter price API is more reliable for native SOL
    try {
      const supabaseUrl = Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
      const anonKey = Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
      const solMint = 'So11111111111111111111111111111111111111112';

      if (supabaseUrl && anonKey) {
        const url = `${supabaseUrl}/functions/v1/solana-rpc?action=price&ids=${solMint}`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${anonKey}`, apikey: anonKey } });
        if (res.ok) {
          const data = await res.json();
          const price = data?.data?.[solMint]?.price;
          if (price && price > 0) return price;
        }
      }
    } catch {}

    // Fallback to DexScreener
    const solMint = 'So11111111111111111111111111111111111111112';
    const price = await this.getTokenPrice(solMint);
    return price?.price || 0;
  }

  private getFallback(mintAddress: string): TokenPrice {
    return {
      mint: mintAddress,
      price: 0,
      priceChange24h: 0,
      volume24h: 0,
      lastUpdated: Date.now(),
    };
  }

  clearCache() {
    this.priceCache.clear();
  }
}
