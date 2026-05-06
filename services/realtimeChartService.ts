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
 *  3. On each realtime event, merge the new/updated candle into the local array
 *     and call all registered update listeners.
 *
 * The TradingChart component only needs to:
 *  - Call subscribe(mint, timeframe, onUpdate)
 *  - Call unsubscribe() when unmounting
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
      // Immediately deliver current candles
      if (existing.candles.length > 0) onUpdate([...existing.candles]);
      return [...existing.candles];
    }

    const sub: ActiveSubscription = {
      mint,
      timeframe,
      candles: [],
      listeners: new Set([onUpdate]),
      realtimeChannel: null,
    };
    this.subs.set(key, sub);

    // 1. Load historical data
    const candles = await this.loadHistorical(mint, timeframe);
    sub.candles = candles;
    this.notify(sub);

    // 2. Attach Supabase Realtime subscription
    this.attachRealtime(sub);

    // 3. Trigger helius-ws edge function to start watching this token
    this.startHeliusWatch(mint).catch(() => {});

    return [...sub.candles];
  }

  unsubscribe(mint: string, timeframe: TimeFrame, listener: CandleUpdateListener) {
    const key = this.subKey(mint, timeframe);
    const sub = this.subs.get(key);
    if (!sub) return;
    sub.listeners.delete(listener);
    if (sub.listeners.size === 0) {
      // Remove realtime channel and clean up
      if (sub.realtimeChannel) {
        supabase.removeChannel(sub.realtimeChannel).catch(() => {});
      }
      this.subs.delete(key);
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
      }
      return candles;
    } catch (e) {
      console.error('[RealtimeChart] Historical load failed:', e);
      return [];
    }
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

    // Upsert in batches of 100 to avoid request size limits
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
            // Only handle candles for this timeframe
            if (row.timeframe !== sub.timeframe) return;

            const incoming: CandleData = {
              timestamp: Number(row.open_time),
              open:   Number(row.open),
              high:   Number(row.high),
              low:    Number(row.low),
              close:  Number(row.close),
              volume: Number(row.volume),
            };

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

  private mergeCandle(sub: ActiveSubscription, incoming: CandleData) {
    const idx = sub.candles.findIndex(c => c.timestamp === incoming.timestamp);
    if (idx >= 0) {
      // Update existing candle in place
      sub.candles[idx] = incoming;
    } else {
      // Append new candle and sort (keep last N candles)
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
   * program logs / swap transactions via Helius WebSocket.
   * The edge function handles idempotency — calling it multiple times is safe.
   */
  private async startHeliusWatch(mint: string) {
    try {
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
      const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
      if (!supabaseUrl) return;

      const url = `${supabaseUrl}/functions/v1/helius-ws`;
      await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${anonKey}`,
          apikey: anonKey,
        },
        body: JSON.stringify({ action: 'watch', mint }),
      });
    } catch {
      // Non-critical — realtime still delivers existing candle updates
    }
  }

  /** Force refresh historical data and reseed (called on timeframe change) */
  async refresh(mint: string, timeframe: TimeFrame) {
    const key = this.subKey(mint, timeframe);
    const sub = this.subs.get(key);
    if (!sub) return;

    // Clear DB cache for this combo then reload
    await supabase
      .from('token_candles')
      .delete()
      .eq('token_mint', mint)
      .eq('timeframe', timeframe)
      .eq('is_live', false);

    const candles = await this.loadHistorical(mint, timeframe);
    sub.candles = candles;
    this.notify(sub);
  }
}

export const realtimeChartService = new RealtimeChartService();
