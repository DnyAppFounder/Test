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
const CACHE_TTL = 30_000;

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

// ---------------------------------------------------------------------------
// Global singleton price cache — shared across all SolanaPriceService instances
// ---------------------------------------------------------------------------
const globalPriceCache = new Map<string, TokenPrice>();

// In-flight deduplication: if a fetch for the same mints is already running,
// wait for it rather than firing a second identical request.
const inflight = new Map<string, Promise<Map<string, TokenPrice>>>();

async function fetchJupiterPrices(mints: string[]): Promise<Map<string, TokenPrice>> {
  const cacheKey = [...mints].sort().join(',');

  const existing = inflight.get(cacheKey);
  if (existing) return existing;

  const promise = _doFetchJupiterPrices(mints);
  inflight.set(cacheKey, promise);
  promise.finally(() => inflight.delete(cacheKey));
  return promise;
}

async function _doFetchJupiterPrices(mints: string[]): Promise<Map<string, TokenPrice>> {
  const proxy = getProxyBase();
  if (!proxy) {
    console.warn('[PriceService] No proxy URL — EXPO_PUBLIC_SUPABASE_URL not set');
    return new Map();
  }

  const ids = mints.join(',');
  const url = `${proxy}?action=price&ids=${ids}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: proxyHeaders(),
      signal: AbortSignal.timeout(8000),
    });
  } catch (err: any) {
    const isTimeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    console.error(`[PriceService] ${isTimeout ? 'Timeout' : 'Network error'} fetching prices @ ${Date.now()}:`, err?.message);
    // Return stale cache if available
    const staleResult = new Map<string, TokenPrice>();
    for (const mint of mints) {
      const stale = globalPriceCache.get(mint);
      if (stale) staleResult.set(mint, stale);
    }
    return staleResult;
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`[PriceService] Price proxy HTTP ${res.status}:`, body.slice(0, 400));
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

  // Jupiter Price API v3:  { mint: { usdPrice, priceChange24h, ... } }
  // Old v6 (fallback):     { data: { mint: { price, ... } } }
  const isV6 = data?.data && typeof data.data === 'object' && !Array.isArray(data.data);
  const source: Record<string, any> = isV6 ? data.data : data;

  const result = new Map<string, TokenPrice>();
  for (const mint of mints) {
    const entry = source?.[mint];
    if (!entry) continue;

    const rawPrice = entry.usdPrice ?? entry.price;
    const price = typeof rawPrice === 'number' ? rawPrice : parseFloat(rawPrice);
    const priceChange24h = typeof entry.priceChange24h === 'number' ? entry.priceChange24h : 0;

    if (isFinite(price) && price > 0) {
      result.set(mint, {
        mint,
        price,
        priceChange24h,
        volume24h: 0,
        lastUpdated: Date.now(),
      });
    } else {
      console.log('[PriceService] No price in response for', mint.slice(0, 8), '— entry:', JSON.stringify(entry).slice(0, 80));
    }
  }

  console.log(`[PriceService] fetchJupiterPrices: got ${result.size}/${mints.length} prices`);
  return result;
}

// ---------------------------------------------------------------------------
// SolanaPriceService — thin wrapper over the global cache / fetch logic
// ---------------------------------------------------------------------------
export class SolanaPriceService {
  async getSOLPrice(): Promise<number> {
    return getSolPrice();
  }

  async getTokenPrice(mintAddress: string): Promise<TokenPrice | null> {
    if (mintAddress === SOL_MINT) {
      const price = await getSolPrice();
      if (price === 0) return null;
      return globalPriceCache.get(SOL_MINT) ?? {
        mint: SOL_MINT, price, priceChange24h: 0, volume24h: 0, lastUpdated: Date.now(),
      };
    }

    const cached = globalPriceCache.get(mintAddress);
    if (cached && Date.now() - cached.lastUpdated < CACHE_TTL && cached.price > 0) {
      return cached;
    }

    const prices = await fetchJupiterPrices([mintAddress]);
    const entry = prices.get(mintAddress);
    if (entry) {
      globalPriceCache.set(mintAddress, entry);
      return entry;
    }
    return null;
  }

  async getBatchPrices(mintAddresses: string[]): Promise<Map<string, TokenPrice>> {
    const results = new Map<string, TokenPrice>();
    const uncached: string[] = [];

    for (const mint of mintAddresses) {
      const cached = globalPriceCache.get(mint);
      if (cached && Date.now() - cached.lastUpdated < CACHE_TTL && cached.price > 0) {
        results.set(mint, cached);
      } else {
        uncached.push(mint);
      }
    }

    for (let i = 0; i < uncached.length; i += BATCH_SIZE) {
      const batch = uncached.slice(i, i + BATCH_SIZE);
      const prices = await fetchJupiterPrices(batch);
      for (const [mint, entry] of prices) {
        globalPriceCache.set(mint, entry);
        results.set(mint, entry);
      }
    }

    return results;
  }

  clearCache() {
    globalPriceCache.clear();
  }
}

// ---------------------------------------------------------------------------
// Module-level singleton helpers used everywhere
// ---------------------------------------------------------------------------

let solPricePromise: Promise<number> | null = null;
let solPriceLastFetched = 0;

/** Get the current SOL/USD price. Deduplicates concurrent calls. */
export async function getSolPrice(): Promise<number> {
  const cached = globalPriceCache.get(SOL_MINT);
  if (cached && cached.price > 0 && Date.now() - cached.lastUpdated < CACHE_TTL) {
    return cached.price;
  }

  // Deduplicate concurrent callers
  if (!solPricePromise || Date.now() - solPriceLastFetched > CACHE_TTL) {
    solPriceLastFetched = Date.now();
    solPricePromise = _fetchSolPrice().then(price => {
      solPricePromise = null;
      return price;
    });
  }
  return solPricePromise;
}

async function _fetchSolPrice(): Promise<number> {
  const prices = await fetchJupiterPrices([SOL_MINT]);
  const entry = prices.get(SOL_MINT);

  if (entry && entry.price > 0) {
    console.log('[PriceService] SOL price:', entry.price);
    globalPriceCache.set(SOL_MINT, entry);
    return entry.price;
  }

  // Stale cache fallback
  const stale = globalPriceCache.get(SOL_MINT);
  if (stale && stale.price > 0) {
    console.warn('[PriceService] Using stale SOL price:', stale.price);
    return stale.price;
  }

  console.error('[PriceService] All SOL price sources failed');
  return 0;
}

/** Convert USD to SOL. Returns null if SOL price is not available yet. */
export async function usdToSolAmount(usd: number): Promise<number | null> {
  const price = await getSolPrice();
  if (price <= 0) return null;
  return usd / price;
}
