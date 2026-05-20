import { supabase } from '@/lib/supabase';

export interface LiveTokenState {
  mint: string;
  price: number;
  priceChange24h: number;
  priceChange1h: number;
  marketCap: number | null;
  liquidity: number;
  volume24h: number;
  lastUpdatedAt: number;
  source: 'dexscreener' | 'cache' | 'push';
  isLive: boolean;
}

type Listener = (state: LiveTokenState) => void;

interface WatchEntry {
  state: LiveTokenState;
  listeners: Set<Listener>;
  intervalId: ReturnType<typeof setInterval> | null;
  channel: ReturnType<typeof supabase.channel> | null;
  isFetching: boolean;
}

const POLL_INTERVAL = 30_000;
const DEX_BASE = 'https://api.dexscreener.com';

function makeDefault(mint: string): LiveTokenState {
  return {
    mint,
    price: 0,
    priceChange24h: 0,
    priceChange1h: 0,
    marketCap: null,
    liquidity: 0,
    volume24h: 0,
    lastUpdatedAt: 0,
    source: 'cache',
    isLive: false,
  };
}

class LiveTokenStoreService {
  private entries = new Map<string, WatchEntry>();
  private hidden = false;

  constructor() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        this.hidden = document.hidden;
        if (!this.hidden) {
          // Resume: immediately fetch all watched mints
          for (const [mint] of this.entries) {
            this.fetchAndBroadcast(mint).catch(() => {});
          }
        }
      });
      document.addEventListener('pagehide', () => { this.hidden = true; });
      document.addEventListener('pageshow', () => {
        this.hidden = false;
        for (const [mint] of this.entries) {
          this.fetchAndBroadcast(mint).catch(() => {});
        }
      });
    }
  }

  watch(mint: string, listener: Listener): () => void {
    if (!this.entries.has(mint)) {
      this.entries.set(mint, {
        state: makeDefault(mint),
        listeners: new Set(),
        intervalId: null,
        channel: null,
        isFetching: false,
      });
      this.startPolling(mint);
      this.subscribeRealtime(mint);
      // Immediate first fetch
      this.fetchAndBroadcast(mint).catch(() => {});
    }

    const entry = this.entries.get(mint)!;
    entry.listeners.add(listener);

    // Deliver current state immediately if we already have data
    if (entry.state.lastUpdatedAt > 0) {
      listener(entry.state);
    }

    return () => {
      entry.listeners.delete(listener);
      if (entry.listeners.size === 0) {
        this.teardown(mint);
      }
    };
  }

  getState(mint: string): LiveTokenState | null {
    const entry = this.entries.get(mint);
    if (!entry || entry.state.lastUpdatedAt === 0) return null;
    return entry.state;
  }

  pushPrice(mint: string, price: number, marketCap?: number): void {
    const entry = this.entries.get(mint);
    if (!entry) return;
    if (price <= 0) return;
    const prev = entry.state;
    if (prev.price === price && (marketCap == null || prev.marketCap === marketCap)) return;

    entry.state = {
      ...prev,
      price,
      marketCap: marketCap != null ? marketCap : prev.marketCap,
      lastUpdatedAt: Date.now(),
      source: 'push',
      isLive: true,
    };
    this.broadcast(mint);
  }

  private startPolling(mint: string): void {
    const entry = this.entries.get(mint);
    if (!entry) return;
    if (entry.intervalId) clearInterval(entry.intervalId);
    entry.intervalId = setInterval(() => {
      if (this.hidden) return;
      const e = this.entries.get(mint);
      if (!e || e.listeners.size === 0) return;
      this.fetchAndBroadcast(mint).catch(() => {});
    }, POLL_INTERVAL);
  }

  private subscribeRealtime(mint: string): void {
    const entry = this.entries.get(mint);
    if (!entry) return;

    const channelName = `live_candles_${mint.slice(0, 8)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes' as any,
        {
          event: '*',
          schema: 'public',
          table: 'token_candles',
          filter: `token_mint=eq.${mint}`,
        },
        () => {
          // A candle was inserted/updated — trigger a fresh DexScreener fetch
          const e = this.entries.get(mint);
          if (!e || e.isFetching) return;
          this.fetchAndBroadcast(mint).catch(() => {});
        }
      )
      .subscribe();

    entry.channel = channel;
  }

  private async fetchAndBroadcast(mint: string): Promise<void> {
    const entry = this.entries.get(mint);
    if (!entry || entry.isFetching) return;
    entry.isFetching = true;

    try {
      const res = await fetch(`${DEX_BASE}/latest/dex/tokens/${mint}`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return;

      const data = await res.json();
      const pairs: any[] = (data.pairs || []).filter((p: any) => p.chainId === 'solana');
      if (pairs.length === 0) return;

      // Pick highest-liquidity pair
      const best = pairs.reduce((a: any, b: any) =>
        (b.liquidity?.usd || 0) > (a.liquidity?.usd || 0) ? b : a
      );

      const rawPrice   = parseFloat(best.priceUsd) || 0;
      const rawMcap    = best.marketCap ?? best.fdv ?? null;
      const prevState  = entry.state;

      // Never overwrite a valid price with 0 — keep previous if new fetch is bad.
      const safePrice  = rawPrice  > 0 ? rawPrice  : prevState.price;
      const safeMcap   = rawMcap   != null ? rawMcap  : prevState.marketCap;

      entry.state = {
        mint,
        price:          safePrice,
        priceChange24h: best.priceChange?.h24 ?? prevState.priceChange24h,
        priceChange1h:  best.priceChange?.h1  ?? prevState.priceChange1h,
        marketCap:      safeMcap,
        liquidity:      (best.liquidity?.usd ?? 0) > 0 ? best.liquidity.usd : prevState.liquidity,
        volume24h:      (best.volume?.h24 ?? 0) > 0 ? best.volume.h24 : prevState.volume24h,
        lastUpdatedAt:  Date.now(),
        source: 'dexscreener',
        isLive: true,
      };

      this.broadcast(mint);
    } catch (err) {
      console.warn('[liveTokenStore] fetch error for', mint.slice(0, 8), err);
    } finally {
      const e = this.entries.get(mint);
      if (e) e.isFetching = false;
    }
  }

  private broadcast(mint: string): void {
    const entry = this.entries.get(mint);
    if (!entry) return;
    for (const listener of entry.listeners) {
      try { listener(entry.state); } catch {}
    }
  }

  private teardown(mint: string): void {
    const entry = this.entries.get(mint);
    if (!entry) return;
    if (entry.intervalId) clearInterval(entry.intervalId);
    if (entry.channel) supabase.removeChannel(entry.channel).catch(() => {});
    this.entries.delete(mint);
  }
}

export const liveTokenStore = new LiveTokenStoreService();
