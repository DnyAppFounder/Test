import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Text,
  TouchableOpacity,
  Image,
  useWindowDimensions,
  Animated,
  ScrollView,
  PanResponder,
  Platform,
} from 'react-native';
import Svg, {
  Path,
  Line,
  Rect,
  Text as SvgText,
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
  G,
  Circle,
  ClipPath,
} from 'react-native-svg';
import * as Clipboard from 'expo-clipboard';
import {
  TrendingUp,
  TrendingDown,
  ChartBar as BarChart2,
  Activity,
  ChartLine as LineChart,
  ChartCandlestick as CandlestickChart,
  ChartArea as AreaChart,
  Copy,
  CircleCheck as CheckCircle2,
  SlidersHorizontal,
} from 'lucide-react-native';
import { colors, spacing, fontSize, borderRadius } from '@/constants/theme';
import { chartDataService, CandleData, TimeFrame } from '@/services/chartDataService';
import { liveTokenStore } from '@/services/liveTokenStore';

export type ChartMode = 'line' | 'area' | 'candlestick' | 'bonding' | 'bar' | 'mountain';
type ValueMode = 'mcap' | 'price';

export interface TokenInfo {
  name: string;
  symbol: string;
  image?: string;
  price: number;
  priceChange24h: number;
  marketCap?: number;
  pairAddress?: string;
  address?: string;
}

interface TradingViewChartProps {
  tokenInfo?: TokenInfo;
  symbol?: string;
  currentPrice?: number;
  pairAddress?: string;
  tokenMint?: string;
  chartHeight?: number;
  hideTokenHeader?: boolean;
  valueMode?: ValueMode;
  onValueModeChange?: (v: ValueMode) => void;
}

const ALL_TIMEFRAMES: { key: TimeFrame | 'ALL'; label: string }[] = [
  { key: '1m',  label: '1m' },
  { key: '5m',  label: '5m' },
  { key: '15m', label: '15m' },
  { key: '1H',  label: '1H' },
  { key: '4H',  label: '4H' },
  { key: '1D',  label: '1D' },
  { key: '1W',  label: '1W' },
  { key: '1M',  label: '1M' },
  { key: 'ALL', label: 'ALL' },
];

const CHART_MODES: { key: ChartMode; icon: any; label: string }[] = [
  { key: 'area',        icon: AreaChart,       label: 'Area' },
  { key: 'line',        icon: LineChart,        label: 'Line' },
  { key: 'candlestick', icon: CandlestickChart, label: 'Candles' },
  { key: 'bar',         icon: BarChart2,        label: 'Bars' },
  { key: 'mountain',    icon: Activity,         label: 'Mountain' },
  { key: 'bonding',     icon: TrendingUp,       label: 'Live' },
];

const TIME_H = 18;

const BUCKET_MS: Record<string, number> = {
  '1m':  60_000,
  '5m':  300_000,
  '15m': 900_000,
  '1H':  3_600_000,
  '4H':  14_400_000,
  '1D':  86_400_000,
  '1W':  604_800_000,
  '1M':  2_592_000_000,
  'ALL': 86_400_000,
};

const VISIBLE_BUCKETS: Record<string, number> = {
  '1m':  60,
  '5m':  72,
  '15m': 48,
  '1H':  48,
  '4H':  42,
  '1D':  30,
  '1W':  26,
  '1M':  12,
  'ALL': 60,
};

// ─── helpers ──────────────────────────────────────────────────────────────────

function filterValidCandles(cs: CandleData[]): CandleData[] {
  return cs.filter(c => {
    if (!c || !isFinite(c.timestamp) || c.timestamp <= 0) return false;
    if (!isFinite(c.open)  || c.open  <= 0) return false;
    if (!isFinite(c.close) || c.close <= 0) return false;
    if (!isFinite(c.high)  || c.high  <= 0) return false;
    if (!isFinite(c.low)   || c.low   <= 0) return false;
    const eps = c.high * 1e-8;
    if (c.high < c.low - eps || c.high < c.open - eps || c.high < c.close - eps) return false;
    return true;
  });
}

// Keep the best real candle per bucket (highest volume wins; real beats synthetic vol=0).
function dedupByBucket(cs: CandleData[], bucketMs: number): CandleData[] {
  if (cs.length === 0) return cs;
  const map = new Map<number, CandleData>();
  for (const c of cs) {
    const bucket = Math.floor(c.timestamp / bucketMs) * bucketMs;
    const existing = map.get(bucket);
    if (!existing || c.volume > existing.volume) {
      map.set(bucket, { ...c, timestamp: bucket });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.timestamp - b.timestamp);
}

function fmtPrice(p: number): string {
  if (!p || p === 0) return '0';
  if (p >= 10000) return p.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (p >= 1)     return p.toFixed(4);
  if (p >= 0.001) return p.toFixed(6);
  if (p >= 0.000001) return p.toFixed(8);
  return p.toExponential(3);
}
function fmtMcap(v: number): string {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}
function fmtTime(ts: number, tf: TimeFrame | 'ALL'): string {
  const d = new Date(ts);
  if (tf === '1D' || tf === '1W' || tf === '1M' || tf === 'ALL') {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
}
function fmtDateTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' +
         d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
}
function fmtValue(v: number, mode: ValueMode): string {
  return mode === 'mcap' ? fmtMcap(v) : `$${fmtPrice(v)}`;
}

// ─── Main component ───────────────────────────────────────────────────────────
export function TradingViewChart({
  tokenInfo,
  symbol,
  currentPrice,
  pairAddress,
  tokenMint,
  chartHeight,
  hideTokenHeader = false,
  valueMode: externalValueMode,
  onValueModeChange,
}: TradingViewChartProps) {
  const { width: screenWidth } = useWindowDimensions();
  const chartWidth = Math.min(screenWidth - 32, 600);
  const isMobile = screenWidth < 768;
  const CHART_H  = chartHeight ?? (isMobile ? 460 : 240);
  const VOL_H    = isMobile ? 60  : 40;
  const PAD      = { top: 10, right: isMobile ? 72 : 60, bottom: 4, left: 4 };

  const resolvedInfo: TokenInfo | undefined = tokenInfo ?? (symbol != null ? {
    name: symbol, symbol, price: currentPrice ?? 0, priceChange24h: 0, pairAddress,
  } : undefined);

  // Historical OHLCV from API — never modified by live price updates.
  const [candles, setCandles] = useState<CandleData[]>([]);
  // Active live candle for the current bucket — tracked separately so real history stays immutable.
  const [activeLiveCandle, setActiveLiveCandle] = useState<CandleData | null>(null);
  const activeLiveCandleRef = useRef<CandleData | null>(null);

  const [timeframe, setTimeframe] = useState<TimeFrame | 'ALL'>('1H');
  const [mode, setMode] = useState<ChartMode>('area');
  const [internalValueMode, setInternalValueMode] = useState<ValueMode>('mcap');
  const valueMode: ValueMode = externalValueMode ?? internalValueMode;
  const setValueMode = (v: ValueMode) => {
    if (onValueModeChange) onValueModeChange(v);
    else setInternalValueMode(v);
  };
  const [loading, setLoading] = useState(true);
  const [hasData, setHasData] = useState(false);
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [showModePanel, setShowModePanel] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [showVolume, setShowVolume] = useState(true);
  const [showPriceLine, setShowPriceLine] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [copiedAddr, setCopiedAddr] = useState(false);
  const [resolvedPairAddr, setResolvedPairAddr] = useState<string | null>(pairAddress ?? null);
  const [crosshair, setCrosshair] = useState<{
    x: number; y: number; idx: number; price: number; ts: number; pct: number;
  } | null>(null);
  // When this is non-zero, the pan correction useEffect fires.
  const [pendingPanCorrection, setPendingPanCorrection] = useState<number | null>(null);

  const dotPulse = useRef(new Animated.Value(1)).current;

  const [panOffsetCandles, setPanOffsetCandles] = useState(0);
  const panOffsetRef        = useRef(0);
  const plotWRef            = useRef(0);
  const panStartOffsetRef   = useRef(0);
  // 'idle' → 'crosshair' or 'pan' — locked until touch release.
  const gestureModeRef      = useRef<'idle' | 'crosshair' | 'pan'>('idle');
  const touchStartXRef      = useRef(0);
  const touchStartYRef      = useRef(0);
  const touchStartTimeRef   = useRef(0);

  // Stable price scale — recomputed only when visible candle set changes, not on clock tick.
  const priceScaleRef    = useRef({ maxP: 0, minP: 0, priceRange: 1, maxVol: 1 });
  const priceScaleKeyRef = useRef('');

  const pollTimerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const wsRef          = useRef<WebSocket | null>(null);
  const livePriceRef   = useRef<number | null>(null);
  const wsDebounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const svgContainerRef = useRef<View>(null);
  const svgOffsetRef   = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const candlesRef     = useRef<CandleData[]>([]);
  const displayCandlesRef = useRef<CandleData[]>([]);
  const pairAddrRef    = useRef<string | null>(pairAddress ?? null);
  const reqIdRef       = useRef(0);
  const prevMintRef    = useRef<string | undefined>(undefined);
  const hasAutoScrolledRef = useRef(false);
  const timeframeRef   = useRef<TimeFrame | 'ALL'>('1H');
  const prevExternalPriceRef = useRef<number>(0);

  // Centralized price pipeline: track timestamp of latest accepted price to prevent
  // stale API responses from overwriting fresher live prices.
  const latestPriceTsRef = useRef<number>(0);

  const [clockTick, setClockTick] = useState(0);
  const rightTimeRef  = useRef<number>(Date.now());
  const leftTimeRef   = useRef<number>(Date.now() - 3_600_000 * 60);
  const visibleMsRef  = useRef<number>(3_600_000 * 60);
  const bucketMsRef   = useRef<number>(3_600_000);

  useEffect(() => { livePriceRef.current = livePrice; }, [livePrice]);
  useEffect(() => { candlesRef.current = candles; }, [candles]);
  useEffect(() => { pairAddrRef.current = resolvedPairAddr; }, [resolvedPairAddr]);
  useEffect(() => { timeframeRef.current = timeframe; }, [timeframe]);
  useEffect(() => { activeLiveCandleRef.current = activeLiveCandle; }, [activeLiveCandle]);

  // Resolve best pair address from DexScreener when token mint changes
  useEffect(() => {
    if (!tokenMint) return;
    if (pairAddress) {
      setResolvedPairAddr(pairAddress);
      pairAddrRef.current = pairAddress;
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`,
          { signal: AbortSignal.timeout(8000) }
        );
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const pairs: any[] = (data.pairs || []).filter((p: any) => p.chainId === 'solana');
        if (pairs.length === 0 || cancelled) return;
        pairs.sort((a: any, b: any) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
        const addr = pairs[0].pairAddress;
        if (!cancelled) { setResolvedPairAddr(addr); pairAddrRef.current = addr; }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [tokenMint, pairAddress]);

  // Pulse live dot
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(dotPulse, { toValue: 2.2, duration: 400, useNativeDriver: true }),
      Animated.timing(dotPulse, { toValue: 1,   duration: 400, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);

  // Live time engine — RAF slides the viewport forward in real time.
  // Throttled to 5fps (200ms) to avoid overheating.
  // Paused when the browser tab is hidden (Page Visibility API).
  useEffect(() => {
    let rafId = 0;
    let lastRender = 0;
    const RENDER_INTERVAL = 200; // 5fps — balance smooth movement vs CPU cost
    let tabHidden = false;

    const onVisChange = () => {
      tabHidden = typeof document !== 'undefined' ? document.hidden : false;
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisChange);
      tabHidden = document.hidden;
    }

    const tick = (now: number) => {
      // Do nothing (including no ref writes) when the tab is hidden — avoids
      // unnecessary work and prevents the right-edge clock from jumping forward
      // when the tab regains focus after a long pause.
      if (!tabHidden) {
        rightTimeRef.current = Date.now();
        if (now - lastRender >= RENDER_INTERVAL) {
          lastRender = now;
          setClockTick(t => t + 1);
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisChange);
      }
    };
  }, []);

  // ── Single price pipeline ────────────────────────────────────────────────────
  // All price sources funnel through applyLivePrice. Each call carries a timestamp
  // so that a late-arriving REST response never overwrites a fresher live price.
  // The active live candle (current bucket only) is updated separately from history.
  const applyLivePrice = useCallback((price: number, sourceTs?: number) => {
    if (!price || price <= 0) return;
    const ts = sourceTs ?? Date.now();
    // Reject if this update is more than 1s older than the last accepted price.
    if (ts < latestPriceTsRef.current - 1000) return;
    if (livePriceRef.current === price && ts <= latestPriceTsRef.current) return;
    latestPriceTsRef.current = Math.max(latestPriceTsRef.current, ts);
    livePriceRef.current = price;
    setLivePrice(price);
    if (tokenMint) liveTokenStore.pushPrice(tokenMint, price);

    const bMs = BUCKET_MS[timeframeRef.current] ?? 3_600_000;
    // Use the real event timestamp for bucket allocation so the live candle
    // lands at the same bucket as the source trade, not at Date.now() which
    // can be ahead of historical data and create a visual gap.
    const priceEventTs = sourceTs ?? Date.now();
    const activeBucket = Math.floor(priceEventTs / bMs) * bMs;
    const hist = candlesRef.current;
    const lastHistClose = hist.length > 0 ? hist[hist.length - 1].close : price;

    setActiveLiveCandle(prev => {
      const prevBucket = prev ? Math.floor(prev.timestamp / bMs) * bMs : -1;
      if (prevBucket !== activeBucket) {
        // New bucket — create a fresh synthetic candle; never mutate real history.
        return {
          timestamp: activeBucket,
          open:   lastHistClose,
          high:   Math.max(lastHistClose, price),
          low:    Math.min(lastHistClose, price),
          close:  price,
          volume: 0,
        };
      }
      // Same bucket — update in place.
      if (prev!.close === price && prev!.high >= price && prev!.low <= price) return prev;
      return { ...prev!, close: price, high: Math.max(prev!.high, price), low: Math.min(prev!.low, price) };
    });
  }, [tokenMint]);

  const connectWebSocket = useCallback((pairAddr: string) => {
    if (typeof WebSocket === 'undefined') return;
    if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); wsRef.current = null; }
    try {
      const wsUrl = `wss://io.dexscreener.com/dex/screener/pair/solana/${pairAddr}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.onopen  = () => { setWsConnected(true); };
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          const np = msg?.pair?.priceUsd ? parseFloat(msg.pair.priceUsd) : null;
          if (!np || isNaN(np) || np <= 0) return;
          // WS is live — use current time as high-priority source
          const now = Date.now();
          if (wsDebounceRef.current) {
            // Keep latest value during debounce window
            livePriceRef.current = np;
            latestPriceTsRef.current = Math.max(latestPriceTsRef.current, now);
            return;
          }
          wsDebounceRef.current = setTimeout(() => {
            wsDebounceRef.current = null;
            const price = livePriceRef.current ?? np;
            applyLivePrice(price, Date.now());
          }, 400);
          livePriceRef.current = np;
        } catch {}
      };
      ws.onerror = () => { try { setWsConnected(false); } catch {} };
      ws.onclose = () => {
        try { setWsConnected(false); } catch {}
        wsRef.current = null;
        const t = setTimeout(() => {
          if (pairAddrRef.current && wsRef.current === null) connectWebSocket(pairAddrRef.current);
        }, 5000);
        if ((wsRef as any)._reconnectTimer) clearTimeout((wsRef as any)._reconnectTimer);
        (wsRef as any)._reconnectTimer = t;
      };
    } catch { setWsConnected(false); }
  }, [applyLivePrice]);

  // On token mint change: clear all chart state so new token starts fresh.
  useEffect(() => {
    if (prevMintRef.current === tokenMint) return;
    prevMintRef.current = tokenMint;
    setCandles([]);
    setActiveLiveCandle(null);
    setHasData(false);
    setLivePrice(null);
    livePriceRef.current = null;
    latestPriceTsRef.current = 0;
    hasAutoScrolledRef.current = false;
  }, [tokenMint]);

  const loadData = useCallback(async (tf: TimeFrame | 'ALL', silent = false) => {
    if (!tokenMint) { if (!silent) setLoading(false); return; }
    const myId = ++reqIdRef.current;
    if (!silent) setLoading(true);
    try {
      const effectiveTf: TimeFrame = tf === 'ALL' ? '1D' : tf;
      const limitOverride = tf === 'ALL' ? 365 : undefined;
      const data = await chartDataService.getOHLCVData(tokenMint, effectiveTf, limitOverride);
      if (myId !== reqIdRef.current) return;
      if (data && data.length > 0) {
        // Store real historical candles only — never include the active live bucket here.
        // The activeLiveCandle is maintained separately and merged at render time.
        const bMs = BUCKET_MS[tf === 'ALL' ? '1D' : tf] ?? 3_600_000;
        const activeBucket = Math.floor(Date.now() / bMs) * bMs;
        // Exclude any candle that falls in the current active bucket — activeLiveCandle owns it.
        const historicalOnly = data.filter(c => Math.floor(c.timestamp / bMs) * bMs < activeBucket);
        setCandles(historicalOnly.length > 0 ? historicalOnly : data);
        setHasData(true);
      } else {
        if (!silent) { setHasData(false); setCandles([]); }
      }
    } catch {
      if (myId !== reqIdRef.current) return;
      if (!silent) setHasData(false);
    } finally {
      if (myId === reqIdRef.current && !silent) setLoading(false);
    }
  }, [tokenMint]);

  useEffect(() => {
    setCrosshair(null);
    setPanOffsetCandles(0);
    panOffsetRef.current = 0;
    priceScaleKeyRef.current = '';
    hasAutoScrolledRef.current = false;
    // Reset active live candle on timeframe change so it matches the new bucket size.
    setActiveLiveCandle(null);
    loadData(timeframe, false);
  }, [tokenMint, timeframe]);

  useEffect(() => { setCrosshair(null); }, [mode]);

  // Connect WebSocket once pair address is resolved
  useEffect(() => {
    if (!resolvedPairAddr) return;
    connectWebSocket(resolvedPairAddr);
    return () => {
      if (wsDebounceRef.current) clearTimeout(wsDebounceRef.current);
      if ((wsRef as any)._reconnectTimer) clearTimeout((wsRef as any)._reconnectTimer);
      if (wsRef.current) {
        wsRef.current.onclose = null; wsRef.current.onerror = null;
        wsRef.current.onmessage = null;
        try { wsRef.current.close(); } catch {}
        wsRef.current = null;
      }
      setWsConnected(false);
    };
  }, [resolvedPairAddr]);

  // REST price fallback — 10s interval. Only updates if newer than last accepted price.
  useEffect(() => {
    if (!tokenMint) return;
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);

    const fetchPrice = async () => {
      // Skip REST polling when a real-time source (WS, liveTokenStore, Helius)
      // already provided a fresh price in the last 7 seconds — avoids stale
      // REST responses overwriting live prices and reduces mobile CPU usage.
      if (Date.now() - latestPriceTsRef.current < 7000) return;
      const startTs = Date.now();
      // Primary: Jupiter Price API
      try {
        const jupRes = await fetch(
          `https://api.jup.ag/price/v2?ids=${tokenMint}`,
          { signal: AbortSignal.timeout(4000) }
        );
        if (jupRes.ok) {
          const jupData = await jupRes.json();
          const jupPrice = Number(jupData?.data?.[tokenMint!]?.price ?? 0);
          if (jupPrice > 0) { applyLivePrice(jupPrice, startTs); return; }
        }
      } catch {}
      // Fallback: DexScreener REST
      try {
        const pair = pairAddrRef.current;
        const url = pair
          ? `https://api.dexscreener.com/latest/dex/pairs/solana/${pair}`
          : `https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
        if (!res.ok) return;
        const data = await res.json();
        const pairData = data.pair ?? data.pairs?.[0];
        if (!pairData) return;
        const p = parseFloat(pairData.priceUsd || '0');
        if (p > 0) applyLivePrice(p, startTs);
      } catch {}
    };

    const firstPoll = setTimeout(fetchPrice, 1500);
    // Poll every 10s — less aggressive than before, reduces mobile CPU usage
    pollTimerRef.current = setInterval(fetchPrice, 10_000);
    return () => {
      clearTimeout(firstPoll);
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [tokenMint, applyLivePrice]);

  // External price from parent tokenInfo — lower priority than WS, higher than nothing
  useEffect(() => {
    const externalPrice = resolvedInfo?.price;
    if (!externalPrice || externalPrice <= 0) return;
    if (externalPrice === prevExternalPriceRef.current) return;
    prevExternalPriceRef.current = externalPrice;
    // External price carries its own (older) timestamp context — use a slightly older ts
    // so it doesn't overwrite a fresher live WS price
    applyLivePrice(externalPrice, Date.now() - 2000);
  }, [resolvedInfo?.price, applyLivePrice]);

  // liveTokenStore subscription — pushed by other parts of the app
  useEffect(() => {
    if (!tokenMint) return;
    const unsub = liveTokenStore.watch(tokenMint, (price) => {
      // liveTokenStore receives prices pushed from Helius/PumpSwap/on-chain sources —
      // treat with the same priority as WebSocket (full Date.now() timestamp).
      if (price > 0) applyLivePrice(price, Date.now());
    });
    return unsub;
  }, [tokenMint, applyLivePrice]);

  // Auto-scroll: when data loads but all candles are before the visible window,
  // pan back so the last real candle is visible near the right edge.
  useEffect(() => {
    if (!hasData || candles.length === 0) return;
    if (hasAutoScrolledRef.current) return;
    hasAutoScrolledRef.current = true;
    const bMs   = BUCKET_MS[timeframe] ?? 3_600_000;
    const visMs = (VISIBLE_BUCKETS[timeframe] ?? 48) * bMs;
    const now   = Date.now();
    const lastRealTs = candles[candles.length - 1].timestamp;
    if (lastRealTs > 0 && lastRealTs < now - visMs - bMs) {
      const targetRight = lastRealTs + visMs * 0.1;
      const msBack      = now - targetRight;
      const bucketsBack = Math.max(0, Math.round(msBack / bMs));
      panOffsetRef.current = bucketsBack;
      setPanOffsetCandles(bucketsBack);
    }
  }, [hasData, candles, timeframe]);

  // Pan correction useEffect — fires when displayCandles is empty but candles exist.
  // Moved out of render to avoid setState-during-render violations.
  useEffect(() => {
    if (pendingPanCorrection === null) return;
    if (pendingPanCorrection !== panOffsetCandles) {
      panOffsetRef.current = pendingPanCorrection;
      setPanOffsetCandles(pendingPanCorrection);
    }
    setPendingPanCorrection(null);
  }, [pendingPanCorrection]);

  // When candles exist but none fall in the visible window, auto-correct the pan offset.
  // This replaces the old setState-during-render pattern in the render body.
  // Only fires on data/timeframe change — not on user pan gestures.
  useEffect(() => {
    if (candles.length === 0) return;
    const bMs = BUCKET_MS[timeframe] ?? 3_600_000;
    const vB = VISIBLE_BUCKETS[timeframe] ?? 48;
    const rightT = Date.now() - panOffsetRef.current * bMs;
    const leftT = rightT - vB * bMs;
    const hasVisible = candles.some(
      c => c.timestamp >= leftT - bMs && c.timestamp <= rightT + bMs
    );
    if (hasVisible) return;
    const lastRealTs = candles[candles.length - 1].timestamp;
    const targetRight = lastRealTs + bMs * Math.floor(vB * 0.1);
    const corrected = Math.max(0, Math.round((Date.now() - targetRight) / bMs));
    if (corrected !== panOffsetRef.current) {
      panOffsetRef.current = corrected;
      setPanOffsetCandles(corrected);
    }
  }, [candles, timeframe]);

  // ── chart geometry ────────────────────────────────────────────────────────
  // MCAP scale: use a stable ratio from the same snapshot (marketCap / price).
  // This ensures header, axis, bubble, and crosshair all use the same scale.
  const _snapshotPrice = resolvedInfo?.price;
  const _snapshotMcap  = resolvedInfo?.marketCap ?? null;
  const mcapScale = valueMode === 'mcap' && _snapshotMcap != null && _snapshotMcap > 0 &&
                    _snapshotPrice != null && _snapshotPrice > 0
    ? _snapshotMcap / _snapshotPrice
    : 1;

  const plotW = chartWidth - PAD.left - PAD.right;
  plotWRef.current = plotW;
  const plotH = CHART_H - PAD.top - PAD.bottom;
  const plotHRef = useRef(plotH);
  plotHRef.current = plotH;

  // ── Live time geometry ────────────────────────────────────────────────────
  const bucketMs       = BUCKET_MS[timeframe] ?? 3_600_000;
  const visibleBuckets = VISIBLE_BUCKETS[timeframe] ?? 48;
  const scrollOffsetMs = panOffsetCandles * bucketMs;
  const rightTime      = rightTimeRef.current - scrollOffsetMs;
  const visibleMs      = visibleBuckets * bucketMs;
  const leftTime       = rightTime - visibleMs;
  bucketMsRef.current  = bucketMs;

  // Merge real historical candles + active live candle at render time.
  // Real candles are immutable; only the active live candle updates on price change.
  const mergedCandles = useMemo(() => {
    const valid = filterValidCandles(candles);
    const deduped = dedupByBucket(valid, bucketMs);
    if (!activeLiveCandle) return deduped;
    const liveB = Math.floor(activeLiveCandle.timestamp / bucketMs) * bucketMs;
    // Remove any historical candle in the same bucket (live price owns that bucket)
    const withoutSameBucket = deduped.filter(
      c => Math.floor(c.timestamp / bucketMs) * bucketMs !== liveB
    );
    return [...withoutSameBucket, activeLiveCandle].sort((a, b) => a.timestamp - b.timestamp);
  }, [candles, activeLiveCandle, bucketMs]);

  // For tokens with very few real candles (≤5), always show all of them
  // rather than relying on the clock-based window which may leave them off-screen.
  const isSparse = mergedCandles.length > 0 && mergedCandles.length <= 5;
  const filledRaw = isSparse
    ? mergedCandles
    : mergedCandles.filter(c =>
        c.timestamp >= leftTime - bucketMs && c.timestamp <= rightTime + bucketMs
      );

  // Apply MCAP scale for rendering
  const displayCandles = mcapScale !== 1
    ? filledRaw.map(c => ({
        ...c,
        open:  c.open  * mcapScale,
        high:  c.high  * mcapScale,
        low:   c.low   * mcapScale,
        close: c.close * mcapScale,
      }))
    : filledRaw;

  displayCandlesRef.current = displayCandles;
  const n = displayCandles.length;

  // ── Adaptive x-range ─────────────────────────────────────────────────────
  let xLeft      = leftTime;
  let xVisibleMs = visibleMs;
  if (displayCandles.length > 0 && panOffsetCandles === 0) {
    if (isSparse) {
      // Sparse data: fit the window snugly around the real candle timestamps.
      // Find the effective last timestamp: when the live synthetic candle is far
      // ahead of history, cap it at lastHistTs + 1 bucket to avoid empty gaps.
      const histCandles = displayCandles.filter(c => c.volume > 0);
      const firstTs     = displayCandles[0].timestamp;
      const lastHistTs  = histCandles.length > 0
        ? histCandles[histCandles.length - 1].timestamp
        : displayCandles[displayCandles.length - 1].timestamp;
      const liveC       = displayCandles[displayCandles.length - 1];
      const lastEffTs   =
        liveC.volume === 0 && liveC.timestamp - lastHistTs > bucketMs * 2
          ? lastHistTs + bucketMs           // cap live-gap at 1 bucket
          : displayCandles[displayCandles.length - 1].timestamp;
      const dataSpan    = Math.max(lastEffTs - firstTs, bucketMs);
      // More padding when fewer candles so a single candle doesn't dominate
      const padBuckets  = displayCandles.length === 1 ? 3
                        : displayCandles.length <= 3  ? 2
                        : 1.5;
      const padMs       = bucketMs * padBuckets;
      xLeft      = firstTs - padMs;
      xVisibleMs = dataSpan + padMs * 2 + bucketMs;
    } else {
      // Dense data: shift window left only when data starts unusually far right
      const firstDataTs = displayCandles[0].timestamp;
      if (firstDataTs > leftTime + visibleMs * 0.35) {
        xLeft      = firstDataTs - bucketMs * 2;
        xVisibleMs = rightTime - xLeft;
      }
    }
  }
  leftTimeRef.current  = xLeft;
  visibleMsRef.current = xVisibleMs;

  function tsToX(ts: number): number {
    return PAD.left + ((ts - xLeft) / xVisibleMs) * plotW;
  }

  // ── Stable price scale ────────────────────────────────────────────────────
  // Keyed on visible window boundaries and visible min/max so scale fits exactly
  // what's on screen when panning. Live spike expands scale in-place.
  {
    const dcLen   = displayCandles.length;
    const dcFirst = displayCandles[0];
    const dcLast  = displayCandles[dcLen - 1];
    // Restrict to visible window for scale computation
    const visibleOnly = displayCandles.filter(
      c => c.timestamp >= leftTime && c.timestamp <= rightTime
    );
    const scaleBase   = visibleOnly.length > 0 ? visibleOnly : displayCandles;
    // Real candles (volume > 0) take priority for scale; synthetic live (volume=0) expands it
    const realVisible = scaleBase.filter(c => c.volume > 0);
    const scaleSource = realVisible.length > 0 ? realVisible : scaleBase;
    const visMinLow  = scaleSource.length > 0 ? Math.min(...scaleSource.map(c => c.low))  : 0;
    const visMaxHigh = scaleSource.length > 0 ? Math.max(...scaleSource.map(c => c.high)) : 1;

    const key = [
      timeframe, valueMode, panOffsetCandles,
      dcLen,
      dcFirst?.timestamp ?? 0, dcLast?.timestamp ?? 0,
      Math.round(xLeft / 1000), Math.round(rightTime / 1000),
      visMinLow.toPrecision(4), visMaxHigh.toPrecision(4),
    ].join('|');

    if (key !== priceScaleKeyRef.current && displayCandles.length > 0) {
      priceScaleKeyRef.current = key;
      const safeMax  = isFinite(visMaxHigh) && visMaxHigh > 0 ? visMaxHigh : 1;
      const safeMin  = isFinite(visMinLow)  && visMinLow  >= 0 ? visMinLow : 0;
      const range    = (safeMax - safeMin) || safeMax * 0.02 || 0.001;
      const pad      = range * 0.15;
      // Volume scale from visible real candles only; synthetic vol=0 ignored
      const realVols   = scaleBase.filter(c => c.volume > 0).map(c => c.volume);
      const sortedVols = [...realVols].sort((a, b) => a - b);
      const p90idx     = Math.min(Math.floor(sortedVols.length * 0.9), sortedVols.length - 1);
      const cappedVol  = sortedVols.length > 0 ? Math.max(sortedVols[p90idx] * 1.5, 1) : 1;
      priceScaleRef.current = {
        maxP:       safeMax + pad,
        minP:       Math.max(0, safeMin - pad),
        priceRange: (safeMax + pad) - Math.max(0, safeMin - pad) || 1,
        maxVol:     cappedVol,
      };
    }

    // Expand scale in-place only when live candle exceeds bounds
    const liveC = n > 0 ? displayCandles[n - 1] : null;
    if (liveC) {
      const { maxP: cMax, minP: cMin, maxVol } = priceScaleRef.current;
      const liveHigh = isFinite(liveC.high) && liveC.high > 0 ? liveC.high : 0;
      const liveLow  = isFinite(liveC.low)  && liveC.low  > 0 ? liveC.low  : cMin;
      if (liveHigh > cMax || liveLow < cMin) {
        const newMax = Math.max(cMax, liveHigh * 1.05);
        const newMin = Math.max(0, Math.min(cMin, liveLow * 0.95));
        priceScaleRef.current = { maxP: newMax, minP: newMin, priceRange: (newMax - newMin) || 1, maxVol };
      }
    }
  }
  const { maxP, minP, priceRange, maxVol } = priceScaleRef.current;
  const pixelPerBucket = n > 0 ? (bucketMs / xVisibleMs) * plotW : plotW / visibleBuckets;
  // Hard caps prevent a single candle from becoming visually overwhelming on
  // sparse or short timeframes where pixelPerBucket would otherwise be huge.
  const MAX_CANDLE_W = isMobile ? 28 : 20;
  const MAX_BAR_W    = isMobile ? 14 : 10;
  const barW    = Math.min(MAX_BAR_W,    Math.max(isMobile ? 3   : 1.5, pixelPerBucket * 0.55));
  const candleW = Math.min(MAX_CANDLE_W, Math.max(isMobile ? 6   : 2,   pixelPerBucket * (isMobile ? 0.72 : 0.6)));

  function xOf(i: number): number {
    const c = displayCandles[i];
    if (!c) return PAD.left + (i + 0.5) * (plotW / Math.max(n, 1));
    return tsToX(c.timestamp + bucketMs / 2);
  }
  function yOf(price: number) {
    const raw = PAD.top + plotH - ((price - minP) / priceRange) * plotH;
    return Math.max(PAD.top, Math.min(PAD.top + plotH, raw));
  }
  function volBarH(vol: number) { return Math.max(isMobile ? 4 : 2, (vol / maxVol) * (VOL_H - 6)); }

  const totalH = CHART_H + VOL_H + TIME_H;

  // ── Crosshair + pan responder ─────────────────────────────────────────────
  const updateCrosshairAt = (localX: number, _localY: number) => {
    const cands = displayCandlesRef.current;
    if (!cands.length) return;
    const pw  = plotWRef.current;
    const lt  = leftTimeRef.current;
    const vm  = visibleMsRef.current;
    const bm  = bucketMsRef.current;
    const rawTs = lt + ((localX - PAD.left) / pw) * vm;
    let closestIdx = 0;
    let closestDist = Infinity;
    for (let i = 0; i < cands.length; i++) {
      const d = Math.abs(cands[i].timestamp + bm / 2 - rawTs);
      if (d < closestDist) { closestDist = d; closestIdx = i; }
    }
    const c  = cands[closestIdx];
    const cx = PAD.left + ((c.timestamp + bm / 2 - lt) / vm) * pw;
    const { minP: scaleMin, priceRange: scaleRange } = priceScaleRef.current;
    const ph     = plotHRef.current;
    const rawCy  = PAD.top + ph - ((c.close - scaleMin) / scaleRange) * ph;
    const cy     = Math.max(PAD.top, Math.min(PAD.top + ph, rawCy));
    const firstClose = cands[0].close;
    const pct    = firstClose > 0 ? ((c.close - firstClose) / firstClose) * 100 : 0;
    setCrosshair({ x: cx, y: cy, idx: closestIdx, price: c.close, ts: c.timestamp, pct });
  };

  const applyTouchToCrosshair = (pageX: number, pageY: number) => {
    if (Platform.OS === 'web') {
      const webEl = svgContainerRef.current as any;
      if (webEl?.getBoundingClientRect) {
        const rect = webEl.getBoundingClientRect();
        svgOffsetRef.current = { x: rect.left, y: rect.top };
      }
      updateCrosshairAt(pageX - svgOffsetRef.current.x, pageY - svgOffsetRef.current.y);
    } else {
      svgContainerRef.current?.measure((_fx, _fy, _w, _h, px, py) => {
        svgOffsetRef.current = { x: px, y: py };
        updateCrosshairAt(pageX - px, pageY - py);
      });
    }
  };

  const panResponder = useRef(
    PanResponder.create({
      // Only claim the responder once we detect clear horizontal intent.
      // Vertical drags pass through to the page scroll — never block them.
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_e, gs) => {
        const adx = Math.abs(gs.dx);
        const ady = Math.abs(gs.dy);
        // Capture only clear horizontal drags; let vertical drags scroll the page
        return adx > 10 && adx > ady * 2;
      },

      onPanResponderGrant: (e) => {
        panStartOffsetRef.current = panOffsetRef.current;
        gestureModeRef.current    = 'idle';
        touchStartXRef.current    = e.nativeEvent.pageX;
        touchStartYRef.current    = e.nativeEvent.pageY;
        touchStartTimeRef.current = Date.now();
      },

      onPanResponderMove: (e, gestureState) => {
        const adx     = Math.abs(gestureState.dx);
        const ady     = Math.abs(gestureState.dy);
        const elapsed = Date.now() - touchStartTimeRef.current;

        if (gestureModeRef.current === 'idle') {
          if (adx > 12 && adx > ady * 1.8) {
            gestureModeRef.current = 'pan';
            setCrosshair(null);
          } else if (elapsed > 200 && adx < 8 && ady < 8) {
            gestureModeRef.current = 'crosshair';
            applyTouchToCrosshair(e.nativeEvent.pageX, e.nativeEvent.pageY);
          }
          return;
        }

        if (gestureModeRef.current === 'crosshair') {
          applyTouchToCrosshair(e.nativeEvent.pageX, e.nativeEvent.pageY);
          return;
        }

        if (gestureModeRef.current === 'pan') {
          const pw   = plotWRef.current;
          const visibleBucketCount = Math.max(1, visibleMsRef.current / (bucketMsRef.current || 1));
          const candlePx = pw / visibleBucketCount;
          const deltaCandles = Math.round(gestureState.dx / candlePx);
          const oldestTs   = candlesRef.current.length > 0 ? candlesRef.current[0].timestamp : Date.now();
          const msToOldest = Math.max(0, Date.now() - oldestTs);
          const bMs        = bucketMsRef.current || 1;
          const visB       = Math.max(1, Math.round(visibleMsRef.current / bMs));
          const maxBack    = Math.max(0, Math.floor(msToOldest / bMs) - visB + 2);
          const newOffset  = Math.max(0, Math.min(maxBack, panStartOffsetRef.current + deltaCandles));
          panOffsetRef.current = newOffset;
          setPanOffsetCandles(newOffset);
        }
      },

      onPanResponderRelease: (e) => {
        const totalMovement = Math.hypot(
          e.nativeEvent.pageX - touchStartXRef.current,
          e.nativeEvent.pageY - touchStartYRef.current
        );
        const elapsed = Date.now() - touchStartTimeRef.current;
        if (gestureModeRef.current === 'idle' && totalMovement < 10 && elapsed < 600) {
          applyTouchToCrosshair(e.nativeEvent.pageX, e.nativeEvent.pageY);
        }
        gestureModeRef.current = 'idle';
      },
    })
  ).current;

  const webMouseHandlers = Platform.OS === 'web' ? {
    onMouseMove: (e: any) => {
      const rect = e.currentTarget?.getBoundingClientRect?.();
      if (!rect) return;
      updateCrosshairAt(e.clientX - rect.left, e.clientY - rect.top);
    },
    onMouseDown: (e: any) => {
      const rect = e.currentTarget?.getBoundingClientRect?.();
      if (!rect) return;
      updateCrosshairAt(e.clientX - rect.left, e.clientY - rect.top);
    },
    onMouseLeave: () => {},
    onContextMenu: (e: any) => e.preventDefault(),
  } : {};

  const dismissCrosshair = () => setCrosshair(null);

  // ── Derived display values ────────────────────────────────────────────────
  const sym               = resolvedInfo?.symbol ?? 'TOKEN';
  const contractAddr      = resolvedInfo?.address ?? tokenMint ?? '';
  const shortContractAddr = contractAddr ? `${contractAddr.slice(0, 6)}...${contractAddr.slice(-4)}` : '';

  // Latest price: prioritise livePrice (from all sources), then last candle, then prop.
  // livePrice is reset to null on token change so no cross-token bleed.
  const latestClose      = mergedCandles.length > 0 ? mergedCandles[mergedCandles.length - 1].close : 0;
  const displayPriceVal  = (livePrice != null && livePrice > 0) ? livePrice
    : latestClose > 0 ? latestClose
    : (currentPrice != null && currentPrice > 0 ? currentPrice : 0);

  // Header always shows actual marketCap from snapshot (no stale scale multiplication).
  // Axis labels use mcapScale for consistency.
  const mcapVal    = resolvedInfo?.marketCap ?? null;
  const change24h  = resolvedInfo?.priceChange24h ?? 0;
  const isUp       = change24h >= 0;
  const changeColor = isUp ? '#10B981' : '#EC4899';
  // Use the same live-scaled formula as the chart axis and live pill so all four displays agree.
  // When mcapScale=1 (no MCAP data), falls back to static mcapVal then price.
  const liveScaledValue = displayPriceVal * mcapScale;
  const headerValue = valueMode === 'mcap'
    ? fmtMcap(liveScaledValue > 0 ? liveScaledValue : (mcapVal ?? 0))
    : `$${fmtPrice(displayPriceVal)}`;

  const currentModeConfig = CHART_MODES.find(m => m.key === mode) ?? CHART_MODES[0];
  const ModeIcon = currentModeConfig.icon;

  const handleCopyAddr = async () => {
    if (!contractAddr) return;
    await Clipboard.setStringAsync(contractAddr);
    setCopiedAddr(true);
    setTimeout(() => setCopiedAddr(false), 2000);
  };

  // ── Chart header ──────────────────────────────────────────────────────────
  const header = (
    <View style={[styles.chartHeader, hideTokenHeader && styles.chartHeaderSlim]}>
      {!hideTokenHeader && <View style={styles.tokenInfoRow}>
        {resolvedInfo?.image ? (
          <Image source={{ uri: resolvedInfo.image }} style={styles.tokenLogoLg} />
        ) : (
          <View style={styles.tokenLogoLgFallback}>
            <Text style={styles.tokenLogoLgText}>{sym.slice(0, 2).toUpperCase()}</Text>
          </View>
        )}
        <View style={styles.tokenInfoMid}>
          <View style={styles.tokenNameRow}>
            <Text style={styles.tokenNameText} numberOfLines={1}>{resolvedInfo?.name ?? sym}</Text>
            {wsConnected && (
              <Animated.View style={[styles.liveWsDot, { transform: [{ scale: dotPulse }] }]} />
            )}
          </View>
          {shortContractAddr ? (
            <TouchableOpacity style={styles.addrRow} onPress={handleCopyAddr} activeOpacity={0.7}>
              <Text style={styles.addrText}>{shortContractAddr}</Text>
              {copiedAddr
                ? <CheckCircle2 size={10} color={colors.success} strokeWidth={2} />
                : <Copy size={10} color="rgba(255,255,255,0.35)" strokeWidth={2} />}
            </TouchableOpacity>
          ) : null}
        </View>
        <View style={styles.tokenPriceRight}>
          <TouchableOpacity onPress={() => setValueMode(valueMode === 'mcap' ? 'price' : 'mcap')} activeOpacity={0.8}>
            <Text style={styles.tokenBigPrice}>{headerValue}</Text>
          </TouchableOpacity>
          <View style={styles.tokenChangeRow}>
            {isUp
              ? <TrendingUp  size={11} color={changeColor} strokeWidth={2.5} />
              : <TrendingDown size={11} color={changeColor} strokeWidth={2.5} />}
            <Text style={[styles.tokenChangePct, { color: changeColor }]}>
              {isUp ? '+' : ''}{change24h.toFixed(2)}%
            </Text>
          </View>
        </View>
      </View>}

      <View style={styles.tfControlRow}>
        <ScrollView
          horizontal showsHorizontalScrollIndicator={false}
          style={styles.tfScroll} contentContainerStyle={styles.tfScrollContent}>
          {ALL_TIMEFRAMES.map(tf => (
            <TouchableOpacity
              key={tf.key}
              style={[styles.tfPill, timeframe === tf.key && styles.tfPillActive]}
              onPress={() => setTimeframe(tf.key)}
              activeOpacity={0.7}>
              <Text style={[styles.tfPillText, timeframe === tf.key && styles.tfPillTextActive]}>
                {tf.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <View style={styles.chartCtrlBtns}>
          <TouchableOpacity
            style={[styles.chartCtrlBtn, showModePanel && styles.chartCtrlBtnActive]}
            onPress={() => { setShowModePanel(p => !p); setShowSettingsPanel(false); }}
            activeOpacity={0.8}>
            <ModeIcon size={15} color={showModePanel ? '#A78BFA' : 'rgba(255,255,255,0.6)'} strokeWidth={2} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chartCtrlBtn, showSettingsPanel && styles.chartCtrlBtnActive]}
            onPress={() => { setShowSettingsPanel(p => !p); setShowModePanel(false); }}
            activeOpacity={0.8}>
            <SlidersHorizontal size={15} color={showSettingsPanel ? '#A78BFA' : 'rgba(255,255,255,0.6)'} strokeWidth={2} />
          </TouchableOpacity>
        </View>
      </View>

      {showModePanel && (
        <View style={styles.modePanelRow}>
          {CHART_MODES.map(m => {
            const IconComp = m.icon;
            const active   = mode === m.key;
            return (
              <TouchableOpacity
                key={m.key}
                style={[styles.modePanelItem, active && styles.modePanelItemActive]}
                onPress={() => { setMode(m.key); setShowModePanel(false); }}
                activeOpacity={0.75}>
                <IconComp size={14} color={active ? '#fff' : 'rgba(255,255,255,0.45)'} strokeWidth={active ? 2.5 : 2} />
                <Text style={[styles.modePanelLabel, active && styles.modePanelLabelActive]}>{m.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {showSettingsPanel && (
        <View style={styles.settingsPanel}>
          <View style={styles.settingsRow}>
            <Text style={styles.settingsLabel}>Display</Text>
            <View style={styles.settingsToggleGroup}>
              <TouchableOpacity
                style={[styles.settingsToggleBtn, valueMode === 'mcap' && styles.settingsToggleBtnActive]}
                onPress={() => setValueMode('mcap')} activeOpacity={0.75}>
                <Text style={[styles.settingsToggleText, valueMode === 'mcap' && styles.settingsToggleTextActive]}>MCAP</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.settingsToggleBtn, valueMode === 'price' && styles.settingsToggleBtnActive]}
                onPress={() => setValueMode('price')} activeOpacity={0.75}>
                <Text style={[styles.settingsToggleText, valueMode === 'price' && styles.settingsToggleTextActive]}>PRICE</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.settingsRow}>
            <Text style={styles.settingsLabel}>Volume bars</Text>
            <TouchableOpacity style={[styles.settingsSwitch, showVolume && styles.settingsSwitchOn]}
              onPress={() => setShowVolume(v => !v)} activeOpacity={0.75}>
              <View style={[styles.settingsSwitchThumb, showVolume && styles.settingsSwitchThumbOn]} />
            </TouchableOpacity>
          </View>
          <View style={styles.settingsRow}>
            <Text style={styles.settingsLabel}>Price guide</Text>
            <TouchableOpacity style={[styles.settingsSwitch, showPriceLine && styles.settingsSwitchOn]}
              onPress={() => setShowPriceLine(v => !v)} activeOpacity={0.75}>
              <View style={[styles.settingsSwitchThumb, showPriceLine && styles.settingsSwitchThumbOn]} />
            </TouchableOpacity>
          </View>
          <View style={styles.settingsRow}>
            <Text style={styles.settingsLabel}>Grid lines</Text>
            <TouchableOpacity style={[styles.settingsSwitch, showGrid && styles.settingsSwitchOn]}
              onPress={() => setShowGrid(v => !v)} activeOpacity={0.75}>
              <View style={[styles.settingsSwitchThumb, showGrid && styles.settingsSwitchThumbOn]} />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );

  const autoScrollPending = !hasAutoScrolledRef.current && candles.length > 0 && displayCandles.length === 0;
  const isFirstLoad = (loading && candles.length === 0) || autoScrollPending;

  if (isFirstLoad) {
    return (
      <View style={styles.container}>
        {header}
        <View style={[styles.loadingWrap, { height: CHART_H }]}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.loadingSubText}>Loading chart…</Text>
        </View>
      </View>
    );
  }

  if (!hasData && candles.length === 0) {
    return (
      <View style={styles.container}>
        {header}
        <View style={[styles.unavailableWrap, { height: CHART_H }]}>
          {displayPriceVal > 0 ? (
            <>
              <Text style={styles.priceFallback}>{fmtValue(displayPriceVal * mcapScale, valueMode)}</Text>
              <Text style={styles.unavailableText}>No historical data available</Text>
            </>
          ) : (
            <Text style={styles.unavailableText}>Chart data unavailable</Text>
          )}
        </View>
      </View>
    );
  }

  if (n === 0) {
    return (
      <View style={styles.container}>
        {header}
        <View style={[styles.unavailableWrap, { height: CHART_H }]}>
          <Text style={styles.unavailableText}>No chart data available for this timeframe</Text>
        </View>
      </View>
    );
  }

  // ── Build paths ───────────────────────────────────────────────────────────
  const linePts = displayCandles
    .map((c, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOf(c.close).toFixed(1)}`)
    .join(' ');
  const bottomY    = (PAD.top + plotH).toFixed(1);
  const plotRightX = PAD.left + plotW;
  const safeRightX = plotRightX - 4;
  const lastCandleX = xOf(n - 1);
  const lastCandleY = yOf(displayCandles[n - 1].close);
  const lastX = Math.min(lastCandleX, safeRightX);
  const lastY = lastCandleY;

  // Continuation: capped at 1.5 buckets to prevent a fake long flat extension.
  // Must be computed before areaPath so fill uses the same right-edge limit.
  const maxContExtension = bucketMs * 1.5;
  const lastCandleTs     = displayCandles[n - 1].timestamp;
  const contEndTs        = Math.min(rightTime, lastCandleTs + maxContExtension);
  const contRightX       = Math.min(tsToX(contEndTs), safeRightX);
  const contY            = lastY;
  const showContinuation = panOffsetCandles === 0 && n > 0 && contRightX > lastX + 2;

  // Area fill stops at the same point as the continuation line — never extends to safeRightX.
  const areaFillRightX = showContinuation ? contRightX : lastCandleX;
  const areaPath = `${linePts} L${areaFillRightX.toFixed(1)},${lastCandleY.toFixed(1)} L${areaFillRightX.toFixed(1)},${bottomY} L${xOf(0).toFixed(1)},${bottomY} Z`;

  // Grid
  const gridLevels = 5;
  const priceGridLines = Array.from({ length: gridLevels }, (_, i) => {
    const frac  = i / (gridLevels - 1);
    const price = minP + priceRange * frac;
    return { price, y: yOf(price) };
  });

  // Time labels
  const timeLabelStepMs = bucketMs * Math.max(1, Math.ceil(visibleBuckets / 6));
  const firstLabelTs    = Math.ceil(xLeft / timeLabelStepMs) * timeLabelStepMs;
  const timeLabels: { ts: number; x: number }[] = [];
  for (let ts = firstLabelTs; ts <= rightTime; ts += timeLabelStepMs) {
    const x = tsToX(ts);
    if (x >= PAD.left + 16 && x <= chartWidth - PAD.right - 10) {
      timeLabels.push({ ts, x });
    }
  }

  // Live price line — reuse liveScaledValue (same formula) so header and pill always agree
  const scaledLivePrice = liveScaledValue;
  const clampedLive = scaledLivePrice > maxP ? maxP : scaledLivePrice < minP ? minP : scaledLivePrice;
  const currentY    = Math.max(PAD.top + 2, Math.min(PAD.top + plotH - 2, yOf(clampedLive)));

  // History start indicator
  const historyOldestTs   = candles.length > 0 ? candles[0].timestamp : Date.now();
  const historyMsToOldest = Math.max(0, Date.now() - historyOldestTs);
  const historyMaxPanBack = candles.length > 0
    ? Math.max(0, Math.floor(historyMsToOldest / bucketMs) - visibleBuckets + 2) : 0;
  const atHistoryStart = historyMaxPanBack > 0 && panOffsetCandles >= historyMaxPanBack - 1;

  const chPrice = crosshair ? crosshair.price : null;

  const volBaseY = CHART_H + VOL_H - 2;

  return (
    <View style={styles.container}>
      {header}

      {crosshair && (
        <View style={styles.crosshairBar}>
          <Text style={styles.crosshairDate}>{fmtDateTime(crosshair.ts)}</Text>
          <Text style={styles.crosshairPrice}>{fmtValue(crosshair.price, valueMode)}</Text>
          <Text style={[styles.crosshairPct, { color: (crosshair.pct ?? 0) >= 0 ? '#10B981' : '#EC4899' }]}>
            {(crosshair.pct ?? 0) >= 0 ? '+' : ''}{crosshair.pct?.toFixed(2)}%
          </Text>
          <TouchableOpacity onPress={dismissCrosshair} style={styles.crosshairClose}>
            <Text style={styles.crosshairCloseText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {panOffsetCandles > 0 && (
        <TouchableOpacity
          style={styles.returnLiveBtn}
          onPress={() => { panOffsetRef.current = 0; setPanOffsetCandles(0); setCrosshair(null); }}
          activeOpacity={0.8}>
          <Text style={styles.returnLiveText}>▶ Return to Live</Text>
        </TouchableOpacity>
      )}

      <View style={styles.chartArea}>
        {loading && candles.length > 0 && (
          <View style={[styles.loadingOverlay, { height: CHART_H }]} pointerEvents="none">
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        )}

        <View
          ref={svgContainerRef}
          style={[
            styles.svgWrap,
            Platform.OS === 'web' && ({
              userSelect: 'none',
              WebkitUserSelect: 'none',
              MozUserSelect: 'none',
              // Use pan-y so vertical scrolling still works; horizontal pan is captured by PanResponder
              touchAction: 'pan-y',
            } as any),
          ]}
          {...panResponder.panHandlers}
          {...(webMouseHandlers as any)}
          onLayout={() => {
            svgContainerRef.current?.measure((_fx, _fy, _w, _h, px, py) => {
              svgOffsetRef.current = { x: px, y: py };
            });
          }}
        >
          <Svg width={chartWidth} height={totalH}>
            <Defs>
              <SvgLinearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%"   stopColor="#8B5CF6" stopOpacity="0.5" />
                <Stop offset="60%"  stopColor="#8B5CF6" stopOpacity="0.1" />
                <Stop offset="100%" stopColor="#8B5CF6" stopOpacity="0" />
              </SvgLinearGradient>
              <SvgLinearGradient id="mountainGrad" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%"   stopColor="#8B5CF6" stopOpacity="0.55" />
                <Stop offset="60%"  stopColor="#8B5CF6" stopOpacity="0.08" />
                <Stop offset="100%" stopColor="#8B5CF6" stopOpacity="0" />
              </SvgLinearGradient>
              <SvgLinearGradient id="bondingGrad" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%"   stopColor="#A78BFA" stopOpacity="0.45" />
                <Stop offset="50%"  stopColor="#7C3AED" stopOpacity="0.2" />
                <Stop offset="100%" stopColor="#4C1D95" stopOpacity="0" />
              </SvgLinearGradient>
              <SvgLinearGradient id="volGradGreen" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%"   stopColor="#8B5CF6" stopOpacity="0.8" />
                <Stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.25" />
              </SvgLinearGradient>
              <SvgLinearGradient id="volGradRed" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%"   stopColor="#EC4899" stopOpacity="0.8" />
                <Stop offset="100%" stopColor="#EC4899" stopOpacity="0.25" />
              </SvgLinearGradient>
              <ClipPath id="chartClip">
                <Rect x={PAD.left} y={PAD.top} width={plotW} height={plotH} />
              </ClipPath>
            </Defs>

            <Rect x={PAD.left} y={PAD.top} width={plotW} height={plotH} fill="rgba(255,255,255,0.01)" />

            {/* Horizontal grid + price labels */}
            {priceGridLines.map(({ price, y }, i) => (
              <G key={`g${i}`}>
                {showGrid && (
                  <Line x1={PAD.left} y1={y} x2={chartWidth - PAD.right} y2={y}
                    stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
                )}
                <SvgText
                  x={chartWidth - PAD.right + 4} y={y + 3.5}
                  fontSize={isMobile ? 11 : 8.5}
                  fill={isMobile ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.3)'}
                  fontWeight={isMobile ? '600' : '400'}
                  textAnchor="start">
                  {fmtValue(price, valueMode)}
                </SvgText>
              </G>
            ))}

            <Line x1={chartWidth - PAD.right} y1={PAD.top} x2={chartWidth - PAD.right} y2={PAD.top + plotH}
              stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
            <Line x1={PAD.left} y1={PAD.top + plotH} x2={chartWidth - PAD.right} y2={PAD.top + plotH}
              stroke="rgba(255,255,255,0.06)" strokeWidth={1} />

            {/* Chart data clipped to plot area */}
            <G clipPath="url(#chartClip)">

              {mode === 'area' && (
                <>
                  <Path d={areaPath} fill="url(#areaGrad)" />
                  <Path d={linePts} stroke="rgba(139,92,246,0.25)" strokeWidth={5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  <Path d={linePts} stroke="#A78BFA" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </>
              )}

              {mode === 'line' && (
                <>
                  <Path d={linePts} stroke="rgba(139,92,246,0.18)" strokeWidth={5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  <Path d={linePts} stroke="#A78BFA" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  <Circle cx={lastX} cy={lastY} r={5} fill="#8B5CF6" opacity={0.18} />
                  <Circle cx={lastX} cy={lastY} r={3} fill="#A78BFA" />
                </>
              )}

              {mode === 'mountain' && (
                <>
                  {/* Use same areaPath fill (already limited to contRightX) with mountain gradient */}
                  <Path d={areaPath} fill="url(#mountainGrad)" />
                  <Path d={linePts} stroke="rgba(139,92,246,0.2)" strokeWidth={5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  <Path d={linePts} stroke="#8B5CF6" strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  <Circle cx={lastX} cy={lastY} r={3} fill="#A78BFA" />
                </>
              )}

              {mode === 'bonding' && (
                <>
                  <Path d={areaPath} fill="url(#bondingGrad)" />
                  <Path d={linePts} stroke="rgba(167,139,250,0.18)" strokeWidth={7} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  <Path d={linePts} stroke="#A78BFA" strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  <Circle cx={lastX} cy={lastY} r={6} fill="#A78BFA" opacity={0.18} />
                  <Circle cx={lastX} cy={lastY} r={3.5} fill="#A78BFA" stroke="#fff" strokeWidth={1} />
                </>
              )}

              {mode === 'bar' && displayCandles.map((c, i) => {
                const up  = c.close >= c.open;
                const col = up ? '#8B5CF6' : '#EC4899';
                const bw  = Math.max(isMobile ? 5 : 3, pixelPerBucket * 0.5);
                const sw  = isMobile ? 1.5 : 1;
                // Clamp center so the close tick (cx + bw) never exceeds safeRightX
                const cx  = Math.min(xOf(i), safeRightX - bw);
                return (
                  <G key={`bar${c.timestamp}`}>
                    <Line x1={cx} y1={yOf(c.high)} x2={cx} y2={yOf(c.low)} stroke={col} strokeWidth={sw} />
                    <Line x1={cx - bw} y1={yOf(c.open)}  x2={cx} y2={yOf(c.open)}  stroke={col} strokeWidth={sw} />
                    <Line x1={cx} y1={yOf(c.close)} x2={cx + bw} y2={yOf(c.close)} stroke={col} strokeWidth={sw} />
                  </G>
                );
              })}

              {mode === 'candlestick' && displayCandles.map((c, i) => {
                const up      = c.close >= c.open;
                const col     = up ? '#8B5CF6' : '#EC4899';
                const wickW   = isMobile ? 1.5 : 1;
                // Clamp center so the body right edge (cx + candleW/2) never exceeds safeRightX
                const cx      = Math.min(xOf(i), safeRightX - candleW / 2);
                const bodyTop = yOf(Math.max(c.open, c.close));
                const bodyBot = yOf(Math.min(c.open, c.close));
                const rawH    = bodyBot - bodyTop;
                // Doji: open ≈ close — render as a clean horizontal tick spanning the body width
                const isDoji  = rawH < 1;
                return (
                  <G key={`cs${c.timestamp}`}>
                    {/* Wick centered on cx — always within clamped bounds */}
                    <Line x1={cx} y1={yOf(c.high)} x2={cx} y2={yOf(c.low)} stroke={col} strokeWidth={wickW} />
                    {isDoji ? (
                      <Line x1={cx - candleW / 2} y1={bodyTop} x2={cx + candleW / 2} y2={bodyTop}
                        stroke={col} strokeWidth={isMobile ? 2 : 1.5} />
                    ) : (
                      <Rect x={cx - candleW / 2} y={bodyTop} width={candleW} height={Math.max(1, rawH)} fill={col} />
                    )}
                  </G>
                );
              })}

            </G>{/* end chartClip */}

            {/* Continuation: short dashed segment from last close → current time (max 1.5 buckets) */}
            {showContinuation && (mode === 'area' || mode === 'line' || mode === 'mountain' || mode === 'bonding') && (
              <Line
                x1={lastX} y1={contY}
                x2={contRightX} y2={contY}
                stroke="rgba(167,139,250,0.45)"
                strokeWidth={1.5}
                strokeDasharray="3,4"
              />
            )}

            {/* Live price dashed guide line + pill — drawn outside chartClip so it's always visible */}
            {showPriceLine && (
              <>
                <Line
                  x1={PAD.left} y1={currentY} x2={chartWidth - PAD.right} y2={currentY}
                  stroke="#8B5CF6" strokeWidth={1} strokeDasharray="4,3" opacity={0.7} />
                <Rect
                  x={chartWidth - PAD.right + 1} y={currentY - 9}
                  width={PAD.right - 2} height={18}
                  fill="#6D28D9" rx={4} />
                <SvgText
                  x={chartWidth - PAD.right + (PAD.right - 2) / 2 + 1} y={currentY + 4.5}
                  fontSize={isMobile ? 10 : 7.5} fill="#fff" textAnchor="middle" fontWeight="700">
                  {fmtValue(scaledLivePrice, valueMode)}
                </SvgText>
              </>
            )}

            {/* Endpoint dot — area/line/mountain use this; bonding has its own styled dot inside chartClip */}
            {(mode === 'area' || mode === 'line' || mode === 'mountain') && (
              <Circle cx={lastX} cy={lastY} r={3} fill="#A78BFA" opacity={1} />
            )}

            {/* Volume bars — zero-volume candles (including live synthetic) produce no bar */}
            {showVolume && displayCandles.map((c, i) => {
              if (c.volume === 0) return null;
              const h    = volBarH(c.volume);
              const w    = Math.max(barW, 1.5);
              // Clamp so right edge (vx + w/2) never exceeds safeRightX
              const vx   = Math.min(xOf(i), safeRightX - w / 2);
              const isUp = c.close >= c.open;
              return (
                <Rect key={`v${c.timestamp}`}
                  x={vx - w / 2}
                  y={CHART_H + (VOL_H - h - 2)}
                  width={w}
                  height={h}
                  fill={isUp ? 'url(#volGradGreen)' : 'url(#volGradRed)'}
                  opacity={i === n - 1 ? 0.9 : 0.45}
                  rx={1} />
              );
            })}

            <Line x1={PAD.left} y1={CHART_H} x2={chartWidth - PAD.right} y2={CHART_H}
              stroke="rgba(255,255,255,0.04)" strokeWidth={1} />

            {timeLabels.map(({ ts, x }) => (
              <SvgText key={`tl${ts}`} x={x} y={CHART_H + VOL_H + TIME_H - 3}
                fontSize={9} fill="rgba(255,255,255,0.35)" textAnchor="middle">
                {fmtTime(ts, timeframe)}
              </SvgText>
            ))}

            {atHistoryStart && (
              <SvgText x={PAD.left + 6} y={CHART_H - 8} fontSize={9}
                fill="rgba(255,255,255,0.25)" textAnchor="start">
                {'← Start of available history'}
              </SvgText>
            )}

            {crosshair && (
              <G>
                <Line x1={crosshair.x} y1={PAD.top} x2={crosshair.x} y2={CHART_H + VOL_H}
                  stroke="rgba(255,255,255,0.3)" strokeWidth={1} strokeDasharray="3,3" />
                <Line x1={PAD.left} y1={crosshair.y} x2={chartWidth - PAD.right} y2={crosshair.y}
                  stroke="rgba(255,255,255,0.25)" strokeWidth={1} strokeDasharray="3,3" />
                <Circle cx={crosshair.x} cy={crosshair.y} r={5}
                  fill="#8B5CF6" stroke="#fff" strokeWidth={1.5} opacity={0.95} />
                <Rect x={chartWidth - PAD.right + 1} y={crosshair.y - 9}
                  width={PAD.right - 2} height={18} fill="#8B5CF6" rx={3} />
                <SvgText
                  x={chartWidth - PAD.right + (PAD.right - 2) / 2 + 1} y={crosshair.y + 4.5}
                  fontSize={isMobile ? 10 : 7.5} fill="#fff" textAnchor="middle" fontWeight="700">
                  {fmtValue(crosshair.price, valueMode)}
                </SvgText>
              </G>
            )}
          </Svg>

          {!crosshair && (mode === 'area' || mode === 'line' || mode === 'mountain' || mode === 'bonding') && (
            <Animated.View
              style={[
                styles.livePulse,
                { left: lastX - 10, top: lastY - 10, transform: [{ scale: dotPulse }], backgroundColor: 'rgba(167,139,250,0.22)' },
              ]}
              pointerEvents="none"
            />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#09090F',
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.18)',
  },
  chartHeader: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(139,92,246,0.08)',
    gap: 8,
  },
  chartHeaderSlim: { paddingTop: 8, paddingBottom: 6, gap: 0 },
  tokenInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tokenLogoLg: { width: 44, height: 44, borderRadius: 10, backgroundColor: '#1A1A2E' },
  tokenLogoLgFallback: {
    width: 44, height: 44, borderRadius: 10, backgroundColor: '#1A1A2E',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.25)',
  },
  tokenLogoLgText: { fontSize: 14, fontWeight: '900', color: '#A78BFA' },
  tokenInfoMid: { flex: 1, gap: 2 },
  tokenNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tokenNameText: { fontSize: 15, fontWeight: '800', color: '#fff', letterSpacing: -0.2, flexShrink: 1 },
  liveWsDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981' },
  addrRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addrText: { fontSize: 10, color: 'rgba(255,255,255,0.35)', fontFamily: 'SpaceMono-Regular' },
  tokenPriceRight: { alignItems: 'flex-end', gap: 3 },
  tokenBigPrice: { fontSize: 20, fontWeight: '900', color: '#fff', letterSpacing: -0.5 },
  tokenChangeRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  tokenChangePct: { fontSize: 12, fontWeight: '700' },
  tfControlRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tfScroll: { flex: 1 },
  tfScrollContent: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: 4 },
  tfPill: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.04)' },
  tfPillActive: { backgroundColor: 'rgba(139,92,246,0.25)', borderWidth: 1, borderColor: 'rgba(167,139,250,0.5)' },
  tfPillText: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.4)' },
  tfPillTextActive: { color: '#A78BFA' },
  chartCtrlBtns: { flexDirection: 'row', gap: 4 },
  chartCtrlBtn: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  chartCtrlBtnActive: { backgroundColor: 'rgba(139,92,246,0.2)', borderColor: 'rgba(139,92,246,0.4)' },
  modePanelRow: {
    flexDirection: 'row', gap: 4, flexWrap: 'wrap',
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 6,
  },
  modePanelItem: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 7,
    borderRadius: 7, flex: 1, justifyContent: 'center', minWidth: 70,
  },
  modePanelItemActive: { backgroundColor: colors.primary },
  modePanelLabel: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.4)' },
  modePanelLabelActive: { color: '#fff' },
  crosshairBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: 7,
    backgroundColor: 'rgba(139,92,246,0.1)',
    borderBottomWidth: 1, borderBottomColor: 'rgba(139,92,246,0.12)',
    gap: spacing.md,
  },
  crosshairDate:  { fontSize: 10, color: colors.textMuted, fontWeight: '600', flex: 1 },
  crosshairPrice: { fontSize: 11, color: colors.textPrimary, fontWeight: '800' },
  crosshairPct:   { fontSize: 11, fontWeight: '700', minWidth: 52, textAlign: 'right' },
  crosshairClose: { padding: 4 },
  crosshairCloseText: { fontSize: 11, color: colors.textMuted },
  chartArea: { position: 'relative' },
  svgWrap: { paddingTop: 4, paddingBottom: 2, position: 'relative', overflow: 'hidden' },
  loadingOverlay: { position: 'absolute', left: 0, right: 0, top: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.25)', zIndex: 10 },
  loadingWrap:    { height: 220, justifyContent: 'center', alignItems: 'center', gap: spacing.sm },
  loadingSubText: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '500' },
  unavailableWrap: { height: 160, justifyContent: 'center', alignItems: 'center', gap: spacing.sm },
  unavailableText: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '500' },
  priceFallback:   { fontSize: 24, fontWeight: '900', color: colors.primary },
  livePulse: { position: 'absolute', width: 20, height: 20, borderRadius: 10, pointerEvents: 'none' },
  returnLiveBtn: {
    alignSelf: 'center',
    backgroundColor: 'rgba(139,92,246,0.15)',
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.4)',
    borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6, marginVertical: 4,
  },
  returnLiveText: { fontSize: 11, fontWeight: '700', color: '#A78BFA', letterSpacing: 0.3 },
  settingsPanel: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 10, padding: spacing.md,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    gap: spacing.sm,
  },
  settingsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  settingsLabel: { fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: '600' },
  settingsToggleGroup: { flexDirection: 'row', gap: 4 },
  settingsToggleBtn: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  settingsToggleBtnActive: { backgroundColor: 'rgba(139,92,246,0.3)', borderColor: 'rgba(167,139,250,0.5)' },
  settingsToggleText: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.4)' },
  settingsToggleTextActive: { color: '#A78BFA' },
  settingsSwitch: {
    width: 36, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center', paddingHorizontal: 2,
  },
  settingsSwitchOn: { backgroundColor: 'rgba(139,92,246,0.6)' },
  settingsSwitchThumb: { width: 16, height: 16, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.5)' },
  settingsSwitchThumbOn: { backgroundColor: '#fff', transform: [{ translateX: 16 }] },
});
