export interface CandleData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type TimeFrame = '1m' | '5m' | '15m' | '1H' | '4H' | '1D' | '1W' | '1M';

// ─── Candle validation ────────────────────────────────────────────────────────

function isValidCandle(c: CandleData): boolean {
  if (!c || typeof c.timestamp !== 'number') return false;
  if (!isFinite(c.timestamp) || c.timestamp <= 0) return false;
  if (!isFinite(c.open)  || c.open  <= 0) return false;
  if (!isFinite(c.close) || c.close <= 0) return false;
  if (!isFinite(c.high)  || c.high  <= 0) return false;
  if (!isFinite(c.low)   || c.low   <= 0) return false;
  if (c.high < c.low)    return false;
  if (c.high < c.open)   return false;
  if (c.high < c.close)  return false;
  if (c.low  > c.open)   return false;
  if (c.low  > c.close)  return false;
  return true;
}

function dedupeAndSort(candles: CandleData[]): CandleData[] {
  const seen = new Map<number, CandleData>();
  for (const c of candles) {
    if (!isValidCandle(c)) continue;
    const ex = seen.get(c.timestamp);
    if (!ex || c.volume > ex.volume) seen.set(c.timestamp, c);
  }
  return Array.from(seen.values()).sort((a, b) => a.timestamp - b.timestamp);
}

// ─── Service ──────────────────────────────────────────────────────────────────

const CACHE_DURATION      = 60_000;        // 1 min for short timeframes
const CACHE_DURATION_LONG = 10 * 60_000;   // 10 min for 1W / 1M

class ChartDataService {
  private cache          = new Map<string, { data: CandleData[]; ts: number; mint: string }>();
  private activeCtrl     = new Map<string, AbortController>();

  /** Build stable cache key that includes the mint address. */
  private cacheKey(mint: string, tf: TimeFrame): string {
    return `${mint}:${tf}`;
  }

  /**
   * Fetch OHLCV candles for `tokenAddress` / `timeFrame`.
   * Routes through the server-side `chart-data` edge function which uses
   * Birdeye → Bitquery → GeckoTerminal fallback chain and never exposes API keys.
   *
   * Race-condition safe: each call for the same (mint, timeframe) cancels the
   * prior in-flight request so stale responses can never overwrite newer ones.
   */
  async getOHLCVData(
    tokenAddress: string,
    timeFrame: TimeFrame = '1H',
    _limitOverride?: number, // kept for API compatibility; limit is now decided server-side
  ): Promise<CandleData[]> {
    const key      = this.cacheKey(tokenAddress, timeFrame);
    const isLongTf = timeFrame === '1W' || timeFrame === '1M';
    const ttl      = isLongTf ? CACHE_DURATION_LONG : CACHE_DURATION;
    const cached   = this.cache.get(key);

    if (cached && cached.mint === tokenAddress && Date.now() - cached.ts < ttl) {
      return cached.data;
    }

    // Cancel any stale in-flight request for this (mint, TF)
    const prev = this.activeCtrl.get(key);
    if (prev) prev.abort();
    const ctrl = new AbortController();
    this.activeCtrl.set(key, ctrl);

    try {
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
      const anonKey     = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
      if (!supabaseUrl) {
        console.warn('[ChartDataService] EXPO_PUBLIC_SUPABASE_URL not set');
        return [];
      }

      const res = await fetch(`${supabaseUrl}/functions/v1/chart-data`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${anonKey}`,
          'apikey':        anonKey,
        },
        body:   JSON.stringify({ mint: tokenAddress, timeframe: timeFrame }),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        console.warn(`[ChartDataService] chart-data returned ${res.status}`);
        return this.cache.get(key)?.data ?? [];
      }

      const result = await res.json() as {
        candles:    CandleData[];
        source:     string;
        marketType: string;
        reason?:    string;
      };

      const candles = dedupeAndSort(result.candles ?? []);

      if (candles.length > 0) {
        this.cache.set(key, { data: candles, ts: Date.now(), mint: tokenAddress });
      }
      return candles;
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        // This request was superseded — return stale cache if available
        return this.cache.get(key)?.data ?? [];
      }
      console.error('[ChartDataService] fetch error:', err?.message ?? err);
      return this.cache.get(key)?.data ?? [];
    } finally {
      // Clean up controller only if it's still the one we registered
      if (this.activeCtrl.get(key) === ctrl) {
        this.activeCtrl.delete(key);
      }
    }
  }

  async getSimplePriceHistory(
    tokenAddress: string,
    timeFrame: TimeFrame = '1H',
  ): Promise<{ timestamp: number; price: number }[]> {
    const candles = await this.getOHLCVData(tokenAddress, timeFrame);
    return candles.map(c => ({ timestamp: c.timestamp, price: c.close }));
  }

  /**
   * Clear cached data for a specific mint across all timeframes.
   * Call this when the user switches to a different token to prevent
   * stale cache entries from showing briefly before fresh data arrives.
   */
  clearMintCache(mint: string) {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${mint}:`)) this.cache.delete(key);
    }
    for (const [key, ctrl] of this.activeCtrl.entries()) {
      if (key.startsWith(`${mint}:`)) {
        ctrl.abort();
        this.activeCtrl.delete(key);
      }
    }
  }

  clearCache() {
    this.cache.clear();
    for (const ctrl of this.activeCtrl.values()) ctrl.abort();
    this.activeCtrl.clear();
  }
}

export const chartDataService = new ChartDataService();
