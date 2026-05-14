/**
 * realtimeChartService
 *
 * Provides real-time chart candle data for a given token mint + timeframe.
 *
 * Flow:
 *  1. Load historical candles from Supabase DB (token_candles table).
 *     If none exist, seed from GeckoTerminal OHLCV API and store to DB.
 *  2. Subscribe to Supabase Realtime on token_candles for INSERT/UPDATE events.
 *     The helius-ws edge function writes live trade candles into this table.
 *  3. Poll DexScreener every POLL_INTERVAL_MS as a fallback to update the
 *     current candle's close price — covers tokens where Helius WS isn't active.
 *  4. On each realtime event or poll, merge the new/updated candle into the
 *     local array and call all registered update listeners.
 */

import { supabase } from '@/lib/supabase';
import { CandleData, TimeFrame } from '@/services/chartDataService';
import { chartDataService } from '@/services/chartDataService';

export type CandleUpdateListener = (candles: CandleData[]) => void;

interface ActiveSubscription {
  mint: string;
  timeframe: TimeFrame;
  candles: CandleData[];
  listeners: Set<CandleUpdateListener>;
  realtimeChannel: any;
  pollTimer: ReturnType<typeof setInterval> | null;
  lastTradeTs: number; // timestamp of last real trade received
}

// How many candles to load per timeframe
const LOAD_LIMIT: Record<TimeFrame, number> = {
  '1m':  120,
  '5m':  144,
  '15m': 96,
  '1H':  168,
  '4H':  90,
  '1D':  90,
  '1W':  90,
  '1M':  90,
};

// Timeframe duration in ms — used to compute current candle open time
const TF_MS: Record<TimeFrame, number> = {
  '1m':  60_000,
  '5m':  300_000,
  '15m': 900_000,
  '1H':  3_600_000,
  '4H':  14_400_000,
  '1D':  86_400_000,
  '1W':  604_800_000,
  '1M':  2_592_000_000,
};

// Poll DexScreener every 15 seconds for live price updates
const POLL_INTERVAL_MS = 15_000;

class RealtimeChartService {
  // key = `${mint}:${timeframe}`
  private subs = new Map<string, ActiveSubscription>();

  private subKey(mint: string, timeframe: TimeFrame) {
    return `${mint}:${timeframe}`;
  }

  /**
   * Subscribe to live candle updates for a token.
   * Returns the initial candle array immediately (may be empty until data loads).
   * Calls onUpdate whenever the array changes.
   */
  async subscribe(
    mint: string,
    timeframe: TimeFrame,
    onUpdate: CandleUpdateListener
  ): Promise<CandleData[]> {
    const key = this.subKey(mint, timeframe);

    if (this.subs.has(key)) {
      const existing = this.subs.get(key)!;
      existing.listeners.add(onUpdate);
      if (existing.candles.length > 0) onUpdate([...existing.candles]);
      return [...existing.candles];
    }

    const sub: ActiveSubscription = {
      mint,
      timeframe,
      candles: [],
      listeners: new Set([onUpdate]),
      realtimeChannel: null,
      pollTimer: null,
      lastTradeTs: 0,
    };
    this.subs.set(key, sub);

    console.log(`[RealtimeChart] subscribe mint=${mint.slice(0, 8)} tf=${timeframe}`);

    // 1. Load historical data
    const candles = await this.loadHistorical(mint, timeframe);
    sub.candles = candles;
    this.notify(sub);

    // 2. Attach Supabase Realtime subscription
    this.attachRealtime(sub);

    // 3. Trigger helius-ws edge function to start watching this token
    this.startHeliusWatch(mint).catch(() => {});

    // 4. Start price polling fallback (covers gaps when Helius isn't delivering)
    this.startPricePoll(sub);

    return [...sub.candles];
  }

  unsubscribe(mint: string, timeframe: TimeFrame, listener: CandleUpdateListener) {
    const key = this.subKey(mint, timeframe);
    const sub = this.subs.get(key);
    if (!sub) return;
    sub.listeners.delete(listener);
    if (sub.listeners.size === 0) {
      if (sub.realtimeChannel) {
        supabase.removeChannel(sub.realtimeChannel).catch(() => {});
      }
      if (sub.pollTimer) {
        clearInterval(sub.pollTimer);
        sub.pollTimer = null;
      }
      this.subs.delete(key);
      console.log(`[RealtimeChart] unsubscribed mint=${mint.slice(0, 8)} tf=${timeframe}`);
    }
  }

  private notify(sub: ActiveSubscription) {
    const snapshot = [...sub.candles];
    for (const listener of sub.listeners) {
      try { listener(snapshot); } catch {}
    }
  }

  private async loadHistorical(mint: string, timeframe: TimeFrame): Promise<CandleData[]> {
    const limit = LOAD_LIMIT[timeframe] ?? 100;

    // Try DB first
    try {
      const { data, error } = await supabase
        .from('token_candles')
        .select('open_time, open, high, low, close, volume')
        .eq('token_mint', mint)
        .eq('timeframe', timeframe)
        .order('open_time', { ascending: true })
        .limit(limit);

      if (!error && data && data.length >= 20) {
        console.log(`[RealtimeChart] Loaded ${data.length} candles from DB for ${mint.slice(0, 8)} ${timeframe}`);
        return data.map(row => ({
          timestamp: Number(row.open_time),
          open:   Number(row.open),
          high:   Number(row.high),
          low:    Number(row.low),
          close:  Number(row.close),
          volume: Number(row.volume),
        }));
      }
    } catch (e) {
      console.warn('[RealtimeChart] DB load failed, falling back to GeckoTerminal:', e);
    }

    // Fallback: fetch from GeckoTerminal and seed DB
    try {
      const candles = await chartDataService.getOHLCVData(mint, timeframe, limit);
      if (candles.length > 0) {
        console.log(`[RealtimeChart] Seeding ${candles.length} candles to DB for ${mint.slice(0, 8)} ${timeframe}`);
        await this.seedCandlesToDB(mint, timeframe, candles);
        return candles;
      }
    } catch (e) {
      console.error('[RealtimeChart] Historical load failed:', e);
    }

    return [];
  }

  private async seedCandlesToDB(mint: string, timeframe: TimeFrame, candles: CandleData[]) {
    const rows = candles.map(c => ({
      token_mint: mint,
      timeframe,
      open_time: c.timestamp,
      open:  c.open,
      high:  c.high,
      low:   c.low,
      close: c.close,
      volume: c.volume,
      is_live: false,
      updated_at: new Date().toISOString(),
    }));

    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100);
      const { error } = await supabase
        .from('token_candles')
        .upsert(batch, { onConflict: 'token_mint,timeframe,open_time' });
      if (error) console.warn('[RealtimeChart] Seed upsert error:', error.message);
    }
  }

  private attachRealtime(sub: ActiveSubscription) {
    const channelName = `candles:${sub.mint}:${sub.timeframe}`;

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'token_candles',
          filter: `token_mint=eq.${sub.mint}`,
        },
        (payload: any) => {
          try {
            const row = payload.new ?? payload.old;
            if (!row) return;
            if (row.timeframe !== sub.timeframe) return;

            const incoming: CandleData = {
              timestamp: Number(row.open_time),
              open:   Number(row.open),
              high:   Number(row.high),
              low:    Number(row.low),
              close:  Number(row.close),
              volume: Number(row.volume),
            };

            sub.lastTradeTs = Date.now();
            console.log(`[RealtimeChart] Realtime candle update mint=${sub.mint.slice(0, 8)} tf=${sub.timeframe} close=${incoming.close.toPrecision(6)}`);
            this.mergeCandle(sub, incoming);
            this.notify(sub);
          } catch (e) {
            console.warn('[RealtimeChart] Realtime payload error:', e);
          }
        }
      )
      .subscribe((status: string) => {
        console.log(`[RealtimeChart] Channel ${channelName}: ${status}`);
      });

    sub.realtimeChannel = channel;
  }

  /**
   * Poll DexScreener every POLL_INTERVAL_MS to get the latest price and update
   * the current candle. This ensures the chart moves even when Helius WS has
   * not delivered a trade recently.
   */
  private startPricePoll(sub: ActiveSubscription) {
    if (sub.pollTimer) return;

    const poll = async () => {
      // Don't poll if component was unsubscribed
      const key = this.subKey(sub.mint, sub.timeframe);
      if (!this.subs.has(key)) return;

      try {
        const pairs = await this.fetchCurrentPrice(sub.mint);
        if (!pairs) return;

        const { priceUsd, volumeUsd } = pairs;
        if (!priceUsd || priceUsd <= 0) return;

        const now = Date.now();
        const intervalMs = TF_MS[sub.timeframe] ?? TF_MS['1H'];
        const openTime = Math.floor(now / intervalMs) * intervalMs;

        // Find existing current candle
        const existing = sub.candles.find(c => c.timestamp === openTime);

        const updated: CandleData = existing
          ? {
              ...existing,
              high:  Math.max(existing.high, priceUsd),
              low:   Math.min(existing.low, priceUsd),
              close: priceUsd,
              volume: existing.volume + (volumeUsd || 0),
            }
          : {
              timestamp: openTime,
              open:  priceUsd,
              high:  priceUsd,
              low:   priceUsd,
              close: priceUsd,
              volume: volumeUsd || 0,
            };

        console.log(`[RealtimeChart] Poll update mint=${sub.mint.slice(0, 8)} tf=${sub.timeframe} close=${priceUsd.toPrecision(6)}`);
        this.mergeCandle(sub, updated);
        this.notify(sub);
      } catch (e) {
        // Non-fatal — polling is best-effort
      }
    };

    // Run first poll soon, then on interval
    const firstTimeout = setTimeout(poll, 3000);
    sub.pollTimer = setInterval(poll, POLL_INTERVAL_MS) as unknown as ReturnType<typeof setInterval>;

    // Clean up first timeout when unsubscribed
    // firstTimeout auto-clears; interval cleanup happens in unsubscribe
  }

  /** Fetch current price and 5m volume from DexScreener (bypass cache for freshness) */
  private async fetchCurrentPrice(mint: string): Promise<{ priceUsd: number; volumeUsd: number } | null> {
    try {
      const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return null;
      const data = await res.json();
      const pairs: any[] = (data.pairs || []).filter((p: any) => p.chainId === 'solana');
      if (pairs.length === 0) {
        console.log(`[RealtimeChart] No external trades detected for mint=${mint.slice(0, 8)}`);
        return null;
      }

      // Best pair = highest liquidity
      pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
      const best = pairs[0];
      const priceUsd = parseFloat(best.priceUsd || '0');
      // Use 5-minute volume as approximate per-candle volume
      const volumeUsd = (best.volume?.m5 || best.volume?.h1 || 0) / 12; // spread over 5min slices

      return priceUsd > 0 ? { priceUsd, volumeUsd } : null;
    } catch {
      return null;
    }
  }

  private mergeCandle(sub: ActiveSubscription, incoming: CandleData) {
    const idx = sub.candles.findIndex(c => c.timestamp === incoming.timestamp);
    if (idx >= 0) {
      sub.candles[idx] = incoming;
    } else {
      const limit = LOAD_LIMIT[sub.timeframe] ?? 100;
      sub.candles.push(incoming);
      sub.candles.sort((a, b) => a.timestamp - b.timestamp);
      if (sub.candles.length > limit + 10) {
        sub.candles = sub.candles.slice(-limit);
      }
    }
  }

  /**
   * Notify the helius-ws edge function to subscribe to this token's
   * transactions via Helius WebSocket.
   */
  private async startHeliusWatch(mint: string) {
    try {
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
      const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
      if (!supabaseUrl) return;

      console.log(`[RealtimeChart] Requesting Helius watch for mint=${mint.slice(0, 8)}`);
      const url = `${supabaseUrl}/functions/v1/helius-ws`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${anonKey}`,
          apikey: anonKey,
        },
        body: JSON.stringify({ action: 'watch', mint }),
      });
      if (res.ok) {
        console.log(`[RealtimeChart] Helius watch started for mint=${mint.slice(0, 8)}`);
      }
    } catch {
      // Non-critical — polling fallback covers this case
    }
  }

  /** Force refresh historical data and reseed (called on timeframe change) */
  async refresh(mint: string, timeframe: TimeFrame) {
    const key = this.subKey(mint, timeframe);
    const sub = this.subs.get(key);
    if (!sub) return;

    // Load new candles first; only evict stale DB rows if the fetch succeeded
    const candles = await this.loadHistorical(mint, timeframe);
    if (candles.length > 0) {
      await supabase
        .from('token_candles')
        .delete()
        .eq('token_mint', mint)
        .eq('timeframe', timeframe)
        .eq('is_live', false);
    }
    if (candles.length > 0 || sub.candles.length === 0) {
      sub.candles = candles;
    }
    this.notify(sub);
  }
}

export const realtimeChartService = new RealtimeChartService();
