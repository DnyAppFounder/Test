import Constants from 'expo-constants';

export interface TokenPrice {
  mint: string;
  price: number;
  priceChange24h: number;
  volume24h: number;
  lastUpdated: number;
}

const SOL_MINT = 'So11111111111111111111111111111111111111112';
// Batch size for Jupiter price API — URL length limit safety
const BATCH_SIZE = 50;

function getProxyBase(): string {
  const url =
    Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_URL ||
    process.env.EXPO_PUBLIC_SUPABASE_URL ||
    '';
  return url ? `${url}/functions/v1/solana-rpc` : '';
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

export class SolanaPriceService {
  private priceCache: Map<string, TokenPrice> = new Map();
  private cacheExpiry = 30_000;

  /** Fetch prices for a batch of mint addresses via Jupiter proxy */
  private async fetchJupiterPrices(mints: string[]): Promise<Map<string, number>> {
    const proxy = getProxyBase();
    if (!proxy) {
      console.warn('[PriceService] No proxy URL — EXPO_PUBLIC_SUPABASE_URL not set');
      return new Map();
    }

    const ids = mints.join(',');
    const url = `${proxy}?action=price&ids=${encodeURIComponent(ids)}`;

    let res: Response;
    try {
      res = await fetch(url, { headers: proxyHeaders() });
    } catch (err: any) {
      console.error('[PriceService] Network error fetching prices:', err?.message);
      return new Map();
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[PriceService] Jupiter price API error ${res.status}:`, body.slice(0, 300));
      return new Map();
    }

    let data: any;
    try {
      data = await res.json();
    } catch {
      const body = await res.text().catch(() => '');
      console.error('[PriceService] Non-JSON price response:', body.slice(0, 300));
      return new Map();
    }

    const result = new Map<string, number>();
    if (!data?.data) {
      console.warn('[PriceService] Unexpected price response shape:', JSON.stringify(data).slice(0, 200));
      return result;
    }

    for (const mint of mints) {
      const entry = data.data[mint];
      const price = entry?.price;
      if (typeof price === 'number' && price > 0) {
        result.set(mint, price);
      } else if (price !== undefined) {
        console.log('[PriceService] Zero or missing price for', mint.slice(0, 8), '— value:', price);
      }
    }

    return result;
  }

  async getSOLPrice(): Promise<number> {
    const cached = this.priceCache.get(SOL_MINT);
    if (cached && Date.now() - cached.lastUpdated < this.cacheExpiry && cached.price > 0) {
      return cached.price;
    }

    const prices = await this.fetchJupiterPrices([SOL_MINT]);
    const price = prices.get(SOL_MINT) ?? 0;

    if (price > 0) {
      console.log('[PriceService] SOL price:', price);
      this.priceCache.set(SOL_MINT, {
        mint: SOL_MINT,
        price,
        priceChange24h: 0,
        volume24h: 0,
        lastUpdated: Date.now(),
      });
      return price;
    }

    // Return cached value even if stale rather than 0
    const stale = this.priceCache.get(SOL_MINT);
    if (stale && stale.price > 0) {
      console.warn('[PriceService] Using stale SOL price:', stale.price);
      return stale.price;
    }

    console.error('[PriceService] SOL price fetch failed — returning 0');
    return 0;
  }

  async getTokenPrice(mintAddress: string): Promise<TokenPrice | null> {
    if (mintAddress === SOL_MINT) {
      const price = await this.getSOLPrice();
      if (price === 0) return null;
      return {
        mint: SOL_MINT,
        price,
        priceChange24h: 0,
        volume24h: 0,
        lastUpdated: Date.now(),
      };
    }

    const cached = this.priceCache.get(mintAddress);
    if (cached && Date.now() - cached.lastUpdated < this.cacheExpiry) {
      return cached.price > 0 ? cached : null;
    }

    const prices = await this.fetchJupiterPrices([mintAddress]);
    const price = prices.get(mintAddress) ?? 0;

    if (price > 0) {
      const entry: TokenPrice = {
        mint: mintAddress,
        price,
        priceChange24h: 0,
        volume24h: 0,
        lastUpdated: Date.now(),
      };
      this.priceCache.set(mintAddress, entry);
      return entry;
    }

    // Return null — caller decides what to display
    return null;
  }

  async getBatchPrices(mintAddresses: string[]): Promise<Map<string, TokenPrice>> {
    const results = new Map<string, TokenPrice>();
    const uncached: string[] = [];

    for (const mint of mintAddresses) {
      const cached = this.priceCache.get(mint);
      if (cached && Date.now() - cached.lastUpdated < this.cacheExpiry && cached.price > 0) {
        results.set(mint, cached);
      } else {
        uncached.push(mint);
      }
    }

    if (uncached.length === 0) return results;

    // Fetch in batches to avoid URL length issues
    for (let i = 0; i < uncached.length; i += BATCH_SIZE) {
      const batch = uncached.slice(i, i + BATCH_SIZE);
      const prices = await this.fetchJupiterPrices(batch);
      for (const [mint, price] of prices) {
        const entry: TokenPrice = {
          mint,
          price,
          priceChange24h: 0,
          volume24h: 0,
          lastUpdated: Date.now(),
        };
        this.priceCache.set(mint, entry);
        results.set(mint, entry);
      }
    }

    return results;
  }

  clearCache() {
    this.priceCache.clear();
  }
}
