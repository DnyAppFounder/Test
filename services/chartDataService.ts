export interface CandleData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type TimeFrame = '1m' | '5m' | '15m' | '1H' | '1D' | '4H' | '1W' | '1M';

const GECKO_TERMINAL_API = 'https://api.geckoterminal.com/api/v2';
const DEX_SCREENER_API   = 'https://api.dexscreener.com';

// Maps our timeframe to GeckoTerminal API params.
// 1W and 1M fetch daily data then aggregate client-side because GeckoTerminal
// free tier does not expose /ohlcv/week or /ohlcv/month endpoints reliably.
const GECKO_TIMEFRAME_MAP: Record<
  TimeFrame,
  { aggregate: number; timeframe: string; limit: number; aggregateTo?: 'weekly' | 'monthly' }
> = {
  '1m':  { aggregate: 1,  timeframe: 'minute', limit: 120 },
  '5m':  { aggregate: 5,  timeframe: 'minute', limit: 144 },
  '15m': { aggregate: 15, timeframe: 'minute', limit: 96  },
  '1H':  { aggregate: 1,  timeframe: 'hour',   limit: 168 },
  '4H':  { aggregate: 4,  timeframe: 'hour',   limit: 90  },
  '1D':  { aggregate: 1,  timeframe: 'day',    limit: 90  },
  // Fetch 2 years of daily data; aggregate to ~104 weekly candles
  '1W':  { aggregate: 1,  timeframe: 'day',    limit: 730, aggregateTo: 'weekly'  },
  // Fetch 2 years of daily data; aggregate to ~24 monthly candles
  '1M':  { aggregate: 1,  timeframe: 'day',    limit: 730, aggregateTo: 'monthly' },
};

// ─── Candle validation ────────────────────────────────────────────────────────
function isValidCandle(c: CandleData): boolean {
  if (!c || typeof c.timestamp !== 'number') return false;
  if (!isFinite(c.timestamp) || c.timestamp <= 0) return false;
  if (!isFinite(c.open)  || c.open  <= 0) return false;
  if (!isFinite(c.close) || c.close <= 0) return false;
  if (!isFinite(c.high)  || c.high  <= 0) return false;
  if (!isFinite(c.low)   || c.low   <= 0) return false;
  // Structural sanity
  if (c.high < c.low)   return false;
  if (c.high < c.open)  return false;
  if (c.high < c.close) return false;
  if (c.low  > c.open)  return false;
  if (c.low  > c.close) return false;
  return true;
}

// ─── Aggregation helpers ──────────────────────────────────────────────────────

/**
 * Aggregate daily candles into ISO-week candles.
 * Each week starts on Monday 00:00 UTC.
 */
function aggregateToWeekly(dailyCandles: CandleData[]): CandleData[] {
  if (dailyCandles.length === 0) return [];

  // Group by Monday-start week bucket
  const buckets = new Map<number, CandleData[]>();
  for (const c of dailyCandles) {
    const d      = new Date(c.timestamp);
    const dow    = d.getUTCDay(); // 0=Sun … 6=Sat
    const toMon  = dow === 0 ? -6 : 1 - dow; // offset to Monday
    const mon    = new Date(c.timestamp);
    mon.setUTCDate(d.getUTCDate() + toMon);
    mon.setUTCHours(0, 0, 0, 0);
    const key = mon.getTime();
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(c);
  }

  const result: CandleData[] = [];
  const sorted = Array.from(buckets.entries()).sort((a, b) => a[0] - b[0]);
  for (const [weekTs, candles] of sorted) {
    const sorted2 = candles.sort((a, b) => a.timestamp - b.timestamp);
    result.push({
      timestamp: weekTs,
      open:   sorted2[0].open,
      high:   Math.max(...sorted2.map(c => c.high)),
      low:    Math.min(...sorted2.map(c => c.low)),
      close:  sorted2[sorted2.length - 1].close,
      volume: sorted2.reduce((s, c) => s + c.volume, 0),
    });
  }
  return result;
}

/**
 * Aggregate daily candles into calendar-month candles.
 * Each month starts on the 1st at 00:00 UTC.
 */
function aggregateToMonthly(dailyCandles: CandleData[]): CandleData[] {
  if (dailyCandles.length === 0) return [];

  const buckets = new Map<string, CandleData[]>();
  for (const c of dailyCandles) {
    const d   = new Date(c.timestamp);
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(c);
  }

  const result: CandleData[] = [];
  const sortedKeys = Array.from(buckets.keys()).sort();
  for (const key of sortedKeys) {
    const candles = buckets.get(key)!.sort((a, b) => a.timestamp - b.timestamp);
    const [year, month] = key.split('-').map(Number);
    result.push({
      timestamp: Date.UTC(year, month, 1),
      open:   candles[0].open,
      high:   Math.max(...candles.map(c => c.high)),
      low:    Math.min(...candles.map(c => c.low)),
      close:  candles[candles.length - 1].close,
      volume: candles.reduce((s, c) => s + c.volume, 0),
    });
  }
  return result;
}

// ─── Service ──────────────────────────────────────────────────────────────────
class ChartDataService {
  private cache     = new Map<string, { data: CandleData[]; timestamp: number }>();
  private pairCache = new Map<string, { pairAddress: string; timestamp: number }>();
  private readonly CACHE_DURATION      = 60_000;       // 1 min for short TFs
  private readonly CACHE_DURATION_LONG = 10 * 60_000;  // 10 min for 1W / 1M
  private readonly PAIR_CACHE_DURATION = 10 * 60_000;

  private async resolvePairAddress(tokenAddress: string): Promise<string | null> {
    const cached = this.pairCache.get(tokenAddress);
    if (cached && Date.now() - cached.timestamp < this.PAIR_CACHE_DURATION) {
      return cached.pairAddress;
    }
    try {
      const response = await fetch(`${DEX_SCREENER_API}/latest/dex/tokens/${tokenAddress}`);
      if (!response.ok) return null;
      const data  = await response.json();
      const pairs = (data.pairs || []).filter((p: any) => p.chainId === 'solana') as any[];
      if (pairs.length === 0) return null;
      pairs.sort((a: any, b: any) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
      const pairAddress = pairs[0].pairAddress;
      this.pairCache.set(tokenAddress, { pairAddress, timestamp: Date.now() });
      return pairAddress;
    } catch {
      return null;
    }
  }

  async getOHLCVData(
    tokenAddress: string,
    timeFrame: TimeFrame = '1H',
    limitOverride?: number,
  ): Promise<CandleData[]> {
    const cacheKey = `${tokenAddress}:${timeFrame}:${limitOverride ?? ''}`;
    const isLongTf  = timeFrame === '1W' || timeFrame === '1M';
    const cacheTtl  = isLongTf ? this.CACHE_DURATION_LONG : this.CACHE_DURATION;
    const cached    = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < cacheTtl) {
      return cached.data;
    }

    try {
      const pairAddress = await this.resolvePairAddress(tokenAddress);
      if (!pairAddress) return [];

      const { aggregate, timeframe, limit, aggregateTo } = GECKO_TIMEFRAME_MAP[timeFrame];
      const effectiveLimit = limitOverride ?? limit;
      const url = `${GECKO_TERMINAL_API}/networks/solana/pools/${pairAddress}/ohlcv/${timeframe}` +
                  `?aggregate=${aggregate}&limit=${effectiveLimit}&currency=usd&token=base`;

      const response = await fetch(url, {
        headers: { Accept: 'application/json;version=20230302' },
      });
      if (!response.ok) return [];

      const data      = await response.json();
      const ohlcvList = data?.data?.attributes?.ohlcv_list;
      if (!ohlcvList || ohlcvList.length === 0) return [];

      // Parse raw candles
      let candles: CandleData[] = ohlcvList.map((item: number[]) => ({
        timestamp: item[0] * 1000, // seconds → milliseconds
        open:   item[1],
        high:   item[2],
        low:    item[3],
        close:  item[4],
        volume: item[5] ?? 0,
      }));

      // Validate: remove candles with 0 / NaN / Infinity / negative prices
      candles = candles.filter(isValidCandle);

      // Sort ascending
      candles.sort((a, b) => a.timestamp - b.timestamp);

      // Deduplicate by timestamp (keep last in case of duplicates)
      const seen = new Map<number, CandleData>();
      for (const c of candles) seen.set(c.timestamp, c);
      candles = Array.from(seen.values()).sort((a, b) => a.timestamp - b.timestamp);

      // Aggregate if needed (1W → weekly, 1M → monthly)
      if (aggregateTo === 'weekly') {
        candles = aggregateToWeekly(candles);
      } else if (aggregateTo === 'monthly') {
        candles = aggregateToMonthly(candles);
      }

      // Final validation pass after aggregation
      candles = candles.filter(isValidCandle);

      this.cache.set(cacheKey, { data: candles, timestamp: Date.now() });
      return candles;
    } catch (err) {
      console.error('[ChartDataService] Error fetching OHLCV:', err);
      // Return stale cached data if available rather than an empty array
      return this.cache.get(cacheKey)?.data ?? [];
    }
  }

  async getSimplePriceHistory(
    tokenAddress: string,
    timeFrame: TimeFrame = '1H',
  ): Promise<{ timestamp: number; price: number }[]> {
    const candles = await this.getOHLCVData(tokenAddress, timeFrame);
    return candles.map((c) => ({ timestamp: c.timestamp, price: c.close }));
  }

  clearCache() {
    this.cache.clear();
  }
}

export const chartDataService = new ChartDataService();
