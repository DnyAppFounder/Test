import Constants from 'expo-constants';

export interface TokenPrice {
  mint: string;
  price: number;
  priceChange24h: number;
  volume24h: number;
  lastUpdated: number;
}

const SOL_MINT = 'So11111111111111111111111111111111111111112';
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

// Jupiter Price API v3 response shape:
// { "So111...": { "usdPrice": 147.47, "priceChange24h": 1.29, "decimals": 9, "blockId": ... } }
// Note: top-level keys are the mint addresses — no "data" wrapper.

export class SolanaPriceService {
  private priceCache: Map<string, TokenPrice> = new Map();
  private cacheExpiry = 30_000;

  private async fetchJupiterPrices(mints: string[]): Promise<Map<string, TokenPrice>> {
    const proxy = getProxyBase();
    if (!proxy) {
      console.warn('[PriceService] No proxy URL — EXPO_PUBLIC_SUPABASE_URL not set');
      return new Map();
    }

    // Pass ids without encodeURIComponent — the edge function forwards them as-is
    const ids = mints.join(',');
    const url = `${proxy}?action=price&ids=${ids}`;

    let res: Response;
    try {
      res = await fetch(url, { headers: proxyHeaders() });
    } catch (err: any) {
      console.error('[PriceService] Network error fetching prices:', err?.message);
      return new Map();
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[PriceService] Jupiter price API HTTP ${res.status}:`, body.slice(0, 400));
      return new Map();
    }

    let data: any;
    try {
      data = await res.json();
    } catch {
      const body = await res.text().catch(() => '');
      console.error('[PriceService] Non-JSON price response:', body.slice(0, 400));
      return new Map();
    }

    // Jupiter Price API v3: response is { mint: { usdPrice, priceChange24h, ... } }
    // Old v6 had: { data: { mint: { price, ... } } }
    // Detect which shape we got
    const isV3 = data && typeof data === 'object' && !data.data && mints.some(m => m in data);
    const isV6 = data?.data && typeof data.data === 'object';

    if (!isV3 && !isV6) {
      console.warn('[PriceService] Unexpected price response shape:', JSON.stringify(data).slice(0, 300));
      return new Map();
    }

    const result = new Map<string, TokenPrice>();
    const source = isV3 ? data : data.data;

    for (const mint of mints) {
      const entry = source[mint];
      // v3 uses usdPrice, v6 used price
      const rawPrice = entry?.usdPrice ?? entry?.price;
      const price = typeof rawPrice === 'number' ? rawPrice : parseFloat(rawPrice);
      const priceChange24h = typeof entry?.priceChange24h === 'number' ? entry.priceChange24h : 0;

      if (isFinite(price) && price > 0) {
        result.set(mint, {
          mint,
          price,
          priceChange24h,
          volume24h: 0,
          lastUpdated: Date.now(),
        });
      } else {
        console.log('[PriceService] No price for', mint.slice(0, 8), '— raw entry:', JSON.stringify(entry));
      }
    }

    console.log(`[PriceService] Fetched ${result.size}/${mints.length} prices (v${isV3 ? '3' : '6'})`);
    return result;
  }

  async getSOLPrice(): Promise<number> {
    const cached = this.priceCache.get(SOL_MINT);
    if (cached && Date.now() - cached.lastUpdated < this.cacheExpiry && cached.price > 0) {
      return cached.price;
    }

    const prices = await this.fetchJupiterPrices([SOL_MINT]);
    const entry = prices.get(SOL_MINT);

    if (entry && entry.price > 0) {
      console.log('[PriceService] SOL price:', entry.price);
      this.priceCache.set(SOL_MINT, entry);
      return entry.price;
    }

    // Return stale cache rather than 0
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
      return this.priceCache.get(SOL_MINT) ?? {
        mint: SOL_MINT,
        price,
        priceChange24h: 0,
        volume24h: 0,
        lastUpdated: Date.now(),
      };
    }

    const cached = this.priceCache.get(mintAddress);
    if (cached && Date.now() - cached.lastUpdated < this.cacheExpiry && cached.price > 0) {
      return cached;
    }

    const prices = await this.fetchJupiterPrices([mintAddress]);
    const entry = prices.get(mintAddress);

    if (entry) {
      this.priceCache.set(mintAddress, entry);
      return entry;
    }

    // Return null — caller shows "No price data"
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

    for (let i = 0; i < uncached.length; i += BATCH_SIZE) {
      const batch = uncached.slice(i, i + BATCH_SIZE);
      const prices = await this.fetchJupiterPrices(batch);
      for (const [mint, entry] of prices) {
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
