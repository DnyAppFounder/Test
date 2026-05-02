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
const DEX_SCREENER_API = 'https://api.dexscreener.com';

// Maps our timeframe to GeckoTerminal aggregate (minutes) and limit
const GECKO_TIMEFRAME_MAP: Record<TimeFrame, { aggregate: number; timeframe: string; limit: number }> = {
  '1m':  { aggregate: 1,    timeframe: 'minute', limit: 120 },
  '5m':  { aggregate: 5,    timeframe: 'minute', limit: 144 },
  '15m': { aggregate: 15,   timeframe: 'minute', limit: 96  },
  '1H':  { aggregate: 1,    timeframe: 'hour',   limit: 168 },
  '4H':  { aggregate: 4,    timeframe: 'hour',   limit: 90  },
  '1D':  { aggregate: 1,    timeframe: 'day',    limit: 90  },
  '1W':  { aggregate: 1,    timeframe: 'day',    limit: 90  },
  '1M':  { aggregate: 1,    timeframe: 'day',    limit: 365 },
};

class ChartDataService {
  private cache = new Map<string, { data: CandleData[]; timestamp: number }>();
  // pair address cache: tokenMint -> pairAddress
  private pairCache = new Map<string, { pairAddress: string; timestamp: number }>();
  private readonly CACHE_DURATION = 60 * 1000;
  private readonly PAIR_CACHE_DURATION = 10 * 60 * 1000;

  private async resolvePairAddress(tokenAddress: string): Promise<string | null> {
    const cached = this.pairCache.get(tokenAddress);
    if (cached && Date.now() - cached.timestamp < this.PAIR_CACHE_DURATION) {
      return cached.pairAddress;
    }

    try {
      const response = await fetch(
        `${DEX_SCREENER_API}/latest/dex/tokens/${tokenAddress}`
      );
      if (!response.ok) return null;

      const data = await response.json();
      const pairs: any[] = (data.pairs || []).filter((p: any) => p.chainId === 'solana');
      if (pairs.length === 0) return null;

      // Pick highest liquidity pair
      pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
      const pairAddress = pairs[0].pairAddress;

      this.pairCache.set(tokenAddress, { pairAddress, timestamp: Date.now() });
      return pairAddress;
    } catch {
      return null;
    }
  }

  async getOHLCVData(
    tokenAddress: string,
    timeFrame: TimeFrame = '1H'
  ): Promise<CandleData[]> {
    const cacheKey = `${tokenAddress}:${timeFrame}`;
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.data;
    }

    try {
      const pairAddress = await this.resolvePairAddress(tokenAddress);
      if (!pairAddress) {
        return this.getEmptyData();
      }

      const { aggregate, timeframe, limit } = GECKO_TIMEFRAME_MAP[timeFrame];
      const url = `${GECKO_TERMINAL_API}/networks/solana/pools/${pairAddress}/ohlcv/${timeframe}?aggregate=${aggregate}&limit=${limit}&currency=usd&token=base`;

      const response = await fetch(url, {
        headers: { Accept: 'application/json;version=20230302' },
      });

      if (response.ok) {
        const data = await response.json();
        const ohlcvList = data?.data?.attributes?.ohlcv_list;

        if (ohlcvList && ohlcvList.length > 0) {
          const candles: CandleData[] = ohlcvList.map((item: number[]) => ({
            // GeckoTerminal format: [timestamp, open, high, low, close, volume]
            timestamp: item[0] * 1000,
            open: item[1],
            high: item[2],
            low: item[3],
            close: item[4],
            volume: item[5],
          }));

          // Sort ascending by timestamp
          candles.sort((a, b) => a.timestamp - b.timestamp);

          this.cache.set(cacheKey, { data: candles, timestamp: Date.now() });
          return candles;
        }
      }

      return this.getEmptyData();
    } catch (error) {
      console.error('[ChartDataService] Error fetching OHLCV:', error);
      return this.getEmptyData();
    }
  }

  private getEmptyData(): CandleData[] {
    return [];
  }

  async getSimplePriceHistory(
    tokenAddress: string,
    timeFrame: TimeFrame = '1H'
  ): Promise<{ timestamp: number; price: number }[]> {
    const candles = await this.getOHLCVData(tokenAddress, timeFrame);
    return candles.map((c) => ({
      timestamp: c.timestamp,
      price: c.close,
    }));
  }

  clearCache() {
    this.cache.clear();
    // deliberately keep pairCache — pair addresses don't change frequently
  }
}

export const chartDataService = new ChartDataService();
