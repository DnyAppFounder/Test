import { useEffect, useState, useCallback, useRef } from 'react';
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
  GestureResponderEvent,
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
  { key: 'bonding',     icon: TrendingUp,       label: 'Bonding' },
];

const TIME_H = 18;

// Milliseconds per candle bucket
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

// Fixed number of visible buckets per timeframe — defines the x-axis window width.
// Every slot in [now - VISIBLE_BUCKETS*bucketMs .. now] is always rendered,
// with carry-forward fill for missing buckets so the chart never compresses.
const VISIBLE_BUCKETS: Record<string, number> = {
  '1m':  60,   // last 60 minutes
  '5m':  72,   // last 6 hours
  '15m': 48,   // last 12 hours
  '1H':  48,   // last 2 days
  '4H':  42,   // last 7 days
  '1D':  30,   // last 30 days
  '1W':  26,   // last ~6 months
  '1M':  12,   // last 12 months
  'ALL': 60,   // last 60 days
};

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Remove candles that have zero, NaN, Infinity, or structurally invalid prices.
 *  Prevents 1W/1M edge-case spikes and scale corruption from bad API rows. */
function filterValidCandles(cs: CandleData[]): CandleData[] {
  return cs.filter(c => {
    if (!c || !isFinite(c.timestamp) || c.timestamp <= 0) return false;
    if (!isFinite(c.open)  || c.open  <= 0) return false;
    if (!isFinite(c.close) || c.close <= 0) return false;
    if (!isFinite(c.high)  || c.high  <= 0) return false;
    if (!isFinite(c.low)   || c.low   <= 0) return false;
    if (c.high < c.low || c.high < c.open || c.high < c.close) return false;
    return true;
  });
}

/**
 * Fill every bucket slot from startMs→endMs. Missing buckets become flat
 * carry-forward candles (open=high=low=close=lastClose, volume=0).
 * This guarantees the x-axis is evenly spaced and the line never jumps.
 */
function fillBuckets(
  candles: CandleData[],
  bucketMs: number,
  startMs: number,
  endMs: number,
): CandleData[] {
  if (candles.length === 0) return [];

  const alignedStart = Math.floor(startMs / bucketMs) * bucketMs;
  const alignedEnd   = Math.floor(endMs   / bucketMs) * bucketMs;

  // Build lookup: bucket-aligned timestamp → best candle (highest volume wins)
  const map = new Map<number, CandleData>();
  for (const c of candles) {
    if (!c || c.close <= 0 || !isFinite(c.timestamp)) continue;
    const key = Math.floor(c.timestamp / bucketMs) * bucketMs;
    const ex  = map.get(key);
    if (!ex || c.volume > ex.volume) {
      map.set(key, { ...c, timestamp: key });
    }
  }

  // Seed lastClose from candles that fall BEFORE the visible window
  let lastClose = candles[0]?.close ?? 0;
  for (const c of candles) {
    const key = Math.floor(c.timestamp / bucketMs) * bucketMs;
    if (key < alignedStart && c.close > 0) lastClose = c.close;
  }

  const result: CandleData[] = [];
  for (let ts = alignedStart; ts <= alignedEnd; ts += bucketMs) {
    const real = map.get(ts);
    if (real && real.close > 0) {
      lastClose = real.close;
      result.push(real);
    } else if (lastClose > 0) {
      // Carry-forward: flat candle, zero volume
      result.push({ timestamp: ts, open: lastClose, high: lastClose, low: lastClose, close: lastClose, volume: 0 });
    }
  }
  return result;
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
}: TradingViewChartProps) {
  const { width: screenWidth } = useWindowDimensions();
  const chartWidth = Math.min(screenWidth - 32, 600);

  // Responsive layout — mobile gets a tall readable chart; desktop keeps compact layout
  const isMobile = screenWidth < 768;
  const CHART_H  = chartHeight ?? (isMobile ? 380 : 240);
  const VOL_H    = isMobile ? 60  : 40;
  const PAD      = { top: 10, right: isMobile ? 72 : 60, bottom: 4, left: 4 };

  const resolvedInfo: TokenInfo | undefined = tokenInfo ?? (symbol != null ? {
    name: symbol, symbol, price: currentPrice ?? 0, priceChange24h: 0, pairAddress,
  } : undefined);

  const [candles, setCandles] = useState<CandleData[]>([]);
  const [timeframe, setTimeframe] = useState<TimeFrame | 'ALL'>('1H');
  const [mode, setMode] = useState<ChartMode>('area');
  const [valueMode, setValueMode] = useState<ValueMode>('mcap');
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
  // Resolved best pair address for this token (used for WS + price polling)
  const [resolvedPairAddr, setResolvedPairAddr] = useState<string | null>(pairAddress ?? null);

  // Crosshair state
  const [crosshair, setCrosshair] = useState<{
    x: number; y: number; idx: number; price: number; ts: number; pct: number;
  } | null>(null);

  // Animated values
  const dotPulse = useRef(new Animated.Value(1)).current;

  // Historical scroll state
  const [panOffsetCandles, setPanOffsetCandles] = useState(0);
  const panOffsetRef       = useRef(0);
  const plotWRef           = useRef(0);
  const panStartOffsetRef  = useRef(0);
  const isPanScrollRef     = useRef(false);

  // Stable price scale — recomputed only when visible candle set changes, NOT on every clock tick.
  // This prevents the Y axis from jumping during horizontal time animation.
  const priceScaleRef    = useRef({ maxP: 0, minP: 0, priceRange: 1, maxVol: 1 });
  const priceScaleKeyRef = useRef('');

  const pollTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const wsRef         = useRef<WebSocket | null>(null);
  const livePriceRef  = useRef<number | null>(null);
  const wsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const svgContainerRef = useRef<View>(null);
  const svgOffsetRef  = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const candlesRef        = useRef<CandleData[]>([]);
  const displayCandlesRef = useRef<CandleData[]>([]);
  const pairAddrRef   = useRef<string | null>(pairAddress ?? null);

  // Live time engine refs — updated every second to slide chart forward in real time
  const [clockTick, setClockTick] = useState(0);
  const rightTimeRef  = useRef<number>(Date.now());
  const leftTimeRef   = useRef<number>(Date.now() - 3_600_000 * 60);
  const visibleMsRef  = useRef<number>(3_600_000 * 60);
  const bucketMsRef   = useRef<number>(3_600_000);

  useEffect(() => { livePriceRef.current = livePrice; }, [livePrice]);
  useEffect(() => { candlesRef.current = candles; }, [candles]);
  useEffect(() => { pairAddrRef.current = resolvedPairAddr; }, [resolvedPairAddr]);

  // Resolve best pair address from DexScreener when token mint changes
  useEffect(() => {
    if (!tokenMint) return;
    // If we already have a pairAddress prop, use it directly
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
        console.log(`[TradingViewChart] Resolved pair ${addr} for mint=${tokenMint?.slice(0, 8)}`);
        if (!cancelled) {
          setResolvedPairAddr(addr);
          pairAddrRef.current = addr;
        }
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

  // Visual time engine — advances rightTime once per second; horizontal viewport slides smoothly
  useEffect(() => {
    rightTimeRef.current = Date.now();
    const id = setInterval(() => {
      rightTimeRef.current = Date.now();
      setClockTick(t => t + 1);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const loadData = useCallback(async (tf: TimeFrame | 'ALL', silent = false) => {
    if (!tokenMint) { setLoading(false); return; }
    if (!silent) setLoading(true);
    try {
      const effectiveTf: TimeFrame = tf === 'ALL' ? '1D' : tf;
      const limitOverride = tf === 'ALL' ? 365 : undefined;
      const data = await chartDataService.getOHLCVData(tokenMint, effectiveTf, limitOverride);
      if (data && data.length > 0) {
        setCandles(prev => {
          if (!silent) return data;
          if (prev.length === 0) return data;
          const lp = livePriceRef.current;
          if (lp == null) return data;
          const merged = [...data];
          const last = { ...merged[merged.length - 1] };
          last.close = lp;
          last.high  = Math.max(last.high, lp);
          last.low   = Math.min(last.low, lp);
          merged[merged.length - 1] = last;
          return merged;
        });
        setHasData(true);
      } else {
        if (!silent) setHasData(false);
      }
    } catch {
      if (!silent) setHasData(false);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [tokenMint]);

  // Apply a live price update to state — updates last candle in-place and pushes to shared store
  const applyLivePrice = useCallback((price: number) => {
    if (!price || price <= 0) return;
    const prev = livePriceRef.current;
    if (prev === price) return;
    livePriceRef.current = price;
    setLivePrice(price);
    if (tokenMint) liveTokenStore.pushPrice(tokenMint, price);
    setCandles(cs => {
      if (!cs.length) return cs;
      const last = cs[cs.length - 1];
      if (last.close === price) return cs;
      const updated = [...cs];
      updated[updated.length - 1] = {
        ...last,
        close: price,
        high:  Math.max(last.high, price),
        low:   Math.min(last.low, price),
      };
      return updated;
    });
  }, [tokenMint]);

  const connectWebSocket = useCallback((pairAddr: string) => {
    if (typeof WebSocket === 'undefined') return;
    if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); wsRef.current = null; }
    try {
      // DexScreener WS uses pair address, not token mint
      const wsUrl = `wss://io.dexscreener.com/dex/screener/pair/solana/${pairAddr}`;
      console.log(`[TradingViewChart] WS connecting to pair=${pairAddr.slice(0, 8)}`);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.onopen = () => {
        setWsConnected(true);
        console.log(`[TradingViewChart] WS connected pair=${pairAddr.slice(0, 8)}`);
      };
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          // DexScreener sends { pair: { priceUsd: "0.001234", ... } }
          const np = msg?.pair?.priceUsd ? parseFloat(msg.pair.priceUsd) : null;
          if (!np || isNaN(np) || np <= 0) return;
          if (wsDebounceRef.current) {
            livePriceRef.current = np;
            return;
          }
          wsDebounceRef.current = setTimeout(() => {
            wsDebounceRef.current = null;
            const price = livePriceRef.current ?? np;
            applyLivePrice(price);
          }, 400);
          livePriceRef.current = np;
        } catch {}
      };
      ws.onerror = () => { try { setWsConnected(false); } catch {} };
      ws.onclose = () => {
        try { setWsConnected(false); } catch {}
        wsRef.current = null;
        const reconnectTimer = setTimeout(() => {
          const currentPair = pairAddrRef.current;
          if (currentPair && wsRef.current === null) connectWebSocket(currentPair);
        }, 5000);
        if ((wsRef as any)._reconnectTimer) clearTimeout((wsRef as any)._reconnectTimer);
        (wsRef as any)._reconnectTimer = reconnectTimer;
      };
    } catch { setWsConnected(false); }
  }, [applyLivePrice]);

  useEffect(() => {
    console.log(`[TradingViewChart] Timeframe → ${timeframe}  mint=${tokenMint?.slice(0, 8) ?? 'none'}`);
    setLivePrice(null);
    setCrosshair(null);
    setPanOffsetCandles(0);
    panOffsetRef.current = 0;
    priceScaleKeyRef.current = ''; // force scale recalculation for new timeframe/token
    loadData(timeframe, false);
  }, [tokenMint, timeframe]);

  // Connect WebSocket once we have the resolved pair address
  useEffect(() => {
    if (!resolvedPairAddr) return;
    connectWebSocket(resolvedPairAddr);
    return () => {
      if (wsDebounceRef.current) clearTimeout(wsDebounceRef.current);
      if ((wsRef as any)._reconnectTimer) clearTimeout((wsRef as any)._reconnectTimer);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.onmessage = null;
        try { wsRef.current.close(); } catch {}
        wsRef.current = null;
      }
      setWsConnected(false);
    };
  }, [resolvedPairAddr]);

  // REST price polling fallback — runs every 10s regardless of WS state
  // Ensures the price line moves even if WS is blocked or pair is low-activity
  useEffect(() => {
    if (!tokenMint) return;
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);

    const fetchPrice = async () => {
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
        if (p > 0) applyLivePrice(p);
      } catch {}
    };

    // First poll after 1.5s, then every 5s for a livelier chart
    const firstPoll = setTimeout(fetchPrice, 1500);
    pollTimerRef.current = setInterval(fetchPrice, 5_000);

    return () => {
      clearTimeout(firstPoll);
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [tokenMint, applyLivePrice]);

  // ── chart geometry ────────────────────────────────────────────────────────
  // MCAP scale factor — converts USD price candles to market-cap values when
  // the user selects MCAP display mode. ratio = marketCap / currentPrice ≈ supply
  const _earlyPrice = livePrice ?? (currentPrice != null && currentPrice > 0 ? currentPrice
    : (candles.length > 0 ? candles[candles.length - 1].close : 0));
  const _earlyMcap  = resolvedInfo?.marketCap ?? null;
  const mcapScale   = valueMode === 'mcap' && _earlyMcap != null && _earlyMcap > 0 && _earlyPrice > 0
    ? _earlyMcap / _earlyPrice
    : 1;

  const plotW = chartWidth - PAD.left - PAD.right;
  plotWRef.current = plotW;
  const plotH = CHART_H - PAD.top - PAD.bottom;
  const plotHRef = useRef(plotH);
  plotHRef.current = plotH;

  // ── Live time engine geometry ─────────────────────────────────────────────
  // rightTime is always the current wall-clock time minus any historical scroll offset.
  // visibleMs is FIXED per timeframe so the x-axis window is consistent.
  const bucketMs       = BUCKET_MS[timeframe] ?? 3_600_000;
  const visibleBuckets = VISIBLE_BUCKETS[timeframe] ?? 48;
  const scrollOffsetMs = panOffsetCandles * bucketMs;
  const rightTime      = rightTimeRef.current - scrollOffsetMs;
  const visibleMs      = visibleBuckets * bucketMs;
  const leftTime       = rightTime - visibleMs;

  // Sync refs so stale closures (panResponder, crosshair) always see current values
  bucketMsRef.current  = bucketMs;
  visibleMsRef.current = visibleMs;
  leftTimeRef.current  = leftTime;

  // Build the complete time-bucketed candle array.
  // fillBuckets ensures EVERY slot from leftTime→rightTime exists:
  //   • real data where trades happened
  //   • flat carry-forward (volume=0) for empty buckets
  // This eliminates gaps in the line and removes 1W/1M spike artifacts.
  const validRaw       = filterValidCandles(candles);
  const filledRaw      = fillBuckets(validRaw, bucketMs, leftTime, rightTime);
  const displayCandles = mcapScale !== 1
    ? filledRaw.map(c => ({
        ...c,
        open:  c.open  * mcapScale,
        high:  c.high  * mcapScale,
        low:   c.low   * mcapScale,
        close: c.close * mcapScale,
      }))
    : filledRaw;

  // Sync ref so the crosshair handler always sees the current visible set
  displayCandlesRef.current = displayCandles;
  const n = displayCandles.length;

  // Convert a Unix-ms timestamp to a chart x-coordinate
  function tsToX(ts: number): number {
    return PAD.left + ((ts - leftTime) / visibleMs) * plotW;
  }

  // ── Stable price scale ───────────────────────────────────────────────────
  // Use only real candles (volume > 0) for scale bounds so carry-forward flat
  // buckets don't incorrectly widen the y-axis.
  {
    const key = `${timeframe}|${valueMode}|${validRaw.length}|${validRaw[0]?.timestamp ?? 0}|${validRaw[validRaw.length - 1]?.timestamp ?? 0}`;
    if (key !== priceScaleKeyRef.current && displayCandles.length > 0) {
      priceScaleKeyRef.current = key;
      const realCandles = displayCandles.filter(c => c.volume > 0);
      const scaleSource = realCandles.length > 0 ? realCandles : displayCandles;
      const rMax = Math.max(...scaleSource.map(c => c.high));
      const rMin = Math.min(...scaleSource.map(c => c.low));
      const safeMax = isFinite(rMax) && rMax > 0 ? rMax : 1;
      const safeMin = isFinite(rMin) && rMin >= 0 ? rMin : 0;
      const range = (safeMax - safeMin) || safeMax * 0.02 || 0.001;
      const pad   = range * 0.15;
      const realVols = displayCandles.filter(c => c.volume > 0).map(c => c.volume);
      priceScaleRef.current = {
        maxP:       safeMax + pad,
        minP:       Math.max(0, safeMin - pad),
        priceRange: (safeMax + pad) - Math.max(0, safeMin - pad) || 1,
        maxVol:     realVols.length > 0 ? Math.max(...realVols) : 1,
      };
    }
    // Expand scale in-place when the live candle exceeds current bounds
    const liveC = n > 0 ? displayCandles[n - 1] : null;
    if (liveC) {
      const { maxP: cMax, minP: cMin, maxVol } = priceScaleRef.current;
      const liveHigh = isFinite(liveC.high) && liveC.high > 0 ? liveC.high : 0;
      const liveLow  = isFinite(liveC.low)  && liveC.low  > 0 ? liveC.low  : cMin;
      if (liveHigh > cMax || liveLow < cMin) {
        const newMax = Math.max(cMax, liveHigh * 1.05);
        const newMin = Math.max(0, Math.min(cMin, liveLow * 0.95));
        priceScaleRef.current = {
          maxP: newMax, minP: newMin,
          priceRange: (newMax - newMin) || 1,
          maxVol,
        };
      }
    }
  }
  const { maxP, minP, priceRange, maxVol } = priceScaleRef.current;
  const pixelPerBucket = n > 0 ? (bucketMs / visibleMs) * plotW : plotW / visibleBuckets;
  const barW    = Math.max(isMobile ? 3   : 1.5, pixelPerBucket * 0.55);
  const candleW = Math.max(isMobile ? 6   : 2,   pixelPerBucket * (isMobile ? 0.72 : 0.6));

  // candle center x — uses real bucket timestamp for time-exact placement
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
  function bondingX(i: number) {
    if (n <= 1) return PAD.left + plotW / 2;
    return PAD.left + Math.sqrt(i / (n - 1)) * plotW;
  }
  const xFn = mode === 'bonding' ? bondingX : xOf;

  const totalH = CHART_H + VOL_H + TIME_H;

  // ── crosshair + historical-scroll pan responder ─────────────────────────
  const updateCrosshairAt = (localX: number, _localY: number) => {
    const cands = displayCandlesRef.current;
    if (!cands.length) return;
    const pw  = plotWRef.current;
    const lt  = leftTimeRef.current;
    const vm  = visibleMsRef.current;
    const bm  = bucketMsRef.current;
    // Convert pixel x → timestamp, then find the nearest candle
    const rawTs = lt + ((localX - PAD.left) / pw) * vm;
    let closestIdx = 0;
    let closestDist = Infinity;
    for (let i = 0; i < cands.length; i++) {
      const d = Math.abs(cands[i].timestamp + bm / 2 - rawTs);
      if (d < closestDist) { closestDist = d; closestIdx = i; }
    }
    const idx = closestIdx;
    const c   = cands[idx];
    const cx  = PAD.left + ((c.timestamp + bm / 2 - lt) / vm) * pw;
    const { minP: scaleMin, priceRange: scaleRange } = priceScaleRef.current;
    const ph  = plotHRef.current;
    const rawCy = PAD.top + ph - ((c.close - scaleMin) / scaleRange) * ph;
    const cy  = Math.max(PAD.top, Math.min(PAD.top + ph, rawCy));
    const firstClose = cands[0].close;
    const pct = firstClose > 0 ? ((c.close - firstClose) / firstClose) * 100 : 0;
    setCrosshair({ x: cx, y: cy, idx, price: c.close, ts: c.timestamp, pct });
  };

  const applyTouchToCrosshair = (pageX: number, pageY: number) => {
    svgContainerRef.current?.measure((_fx, _fy, _w, _h, px, py) => {
      svgOffsetRef.current = { x: px, y: py };
      updateCrosshairAt(pageX - px, pageY - py);
    });
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant: (e) => {
        panStartOffsetRef.current = panOffsetRef.current;
        isPanScrollRef.current = false;
        // Show crosshair immediately on touch
        applyTouchToCrosshair(e.nativeEvent.pageX, e.nativeEvent.pageY);
      },
      onPanResponderMove: (e, gestureState) => {
        const adx = Math.abs(gestureState.dx);
        const ady = Math.abs(gestureState.dy);

        if (!isPanScrollRef.current && adx > 10 && adx > ady * 1.5) {
          isPanScrollRef.current = true;
          setCrosshair(null);
        }

        if (isPanScrollRef.current) {
          const pw = plotWRef.current;
          const n  = displayCandlesRef.current.length || 1;
          const candlePx = pw / n;
          // drag right (dx > 0) = scroll back in time = increase offset
          // drag left  (dx < 0) = scroll forward in time = decrease offset
          const deltaCandles = Math.round(gestureState.dx / candlePx);
          const newOffset = Math.max(
            0,
            Math.min(
              Math.max(0, candlesRef.current.length - 1),
              panStartOffsetRef.current + deltaCandles
            )
          );
          panOffsetRef.current = newOffset;
          setPanOffsetCandles(newOffset);
        } else {
          applyTouchToCrosshair(e.nativeEvent.pageX, e.nativeEvent.pageY);
        }
      },
      onPanResponderRelease: () => {
        isPanScrollRef.current = false;
      },
    })
  ).current;

  // Web mouse event handlers for crosshair
  const webMouseHandlers = Platform.OS === 'web' ? {
    onMouseMove: (e: any) => {
      const rect = e.currentTarget?.getBoundingClientRect?.();
      if (!rect) return;
      const localX = e.clientX - rect.left;
      const localY = e.clientY - rect.top;
      updateCrosshairAt(localX, localY);
    },
    onMouseDown: (e: any) => {
      const rect = e.currentTarget?.getBoundingClientRect?.();
      if (!rect) return;
      const localX = e.clientX - rect.left;
      const localY = e.clientY - rect.top;
      updateCrosshairAt(localX, localY);
    },
    onMouseLeave: () => {},
    onContextMenu: (e: any) => e.preventDefault(),
  } : {};

  const dismissCrosshair = () => setCrosshair(null);

  // ── derived display values ────────────────────────────────────────────────
  const sym              = resolvedInfo?.symbol ?? 'TOKEN';
  const contractAddr     = resolvedInfo?.address ?? tokenMint ?? '';
  const shortContractAddr = contractAddr ? `${contractAddr.slice(0, 6)}...${contractAddr.slice(-4)}` : '';
  // Single source of truth: latest real close from candles (updated by applyLivePrice).
  // Never use livePrice state directly for display — applyLivePrice keeps candles in sync.
  const latestClose     = candles.length > 0 ? candles[candles.length - 1].close : 0;
  const displayPriceVal = latestClose > 0 ? latestClose
    : (currentPrice != null && currentPrice > 0 ? currentPrice : 0);
  const mcapVal    = resolvedInfo?.marketCap ?? null;
  const change24h  = resolvedInfo?.priceChange24h ?? 0;
  const isUp       = change24h >= 0;
  const changeColor = isUp ? '#A78BFA' : '#EC4899';
  const headerValue = valueMode === 'mcap' && mcapVal != null && mcapVal > 0
    ? fmtMcap(mcapVal)
    : `$${fmtPrice(displayPriceVal)}`;
  const currentModeConfig = CHART_MODES.find(m => m.key === mode) ?? CHART_MODES[0];
  const ModeIcon = currentModeConfig.icon;

  const handleCopyAddr = async () => {
    if (!contractAddr) return;
    await Clipboard.setStringAsync(contractAddr);
    setCopiedAddr(true);
    setTimeout(() => setCopiedAddr(false), 2000);
  };

  // ── chart header ──────────────────────────────────────────────────────────
  const header = (
    <View style={[styles.chartHeader, hideTokenHeader && styles.chartHeaderSlim]}>
      {/* Token info row: logo | name+addr | price+change — hidden when parent renders its own */}
      {!hideTokenHeader && <View style={styles.tokenInfoRow}>
        {/* Logo — large rounded square */}
        {resolvedInfo?.image ? (
          <Image source={{ uri: resolvedInfo.image }} style={styles.tokenLogoLg} />
        ) : (
          <View style={styles.tokenLogoLgFallback}>
            <Text style={styles.tokenLogoLgText}>{sym.slice(0, 2).toUpperCase()}</Text>
          </View>
        )}

        {/* Name + addr col */}
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
                ? <CheckCircle2 size={10} color="#A78BFA" strokeWidth={2} />
                : <Copy size={10} color="rgba(255,255,255,0.35)" strokeWidth={2} />}
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Price + change (right) */}
        <View style={styles.tokenPriceRight}>
          <TouchableOpacity onPress={() => setValueMode(v => v === 'mcap' ? 'price' : 'mcap')} activeOpacity={0.8}>
            <Text style={styles.tokenBigPrice}>{headerValue}</Text>
          </TouchableOpacity>
          <View style={styles.tokenChangeRow}>
            {isUp
              ? <TrendingUp size={11} color={changeColor} strokeWidth={2.5} />
              : <TrendingDown size={11} color={changeColor} strokeWidth={2.5} />}
            <Text style={[styles.tokenChangePct, { color: changeColor }]}>
              {isUp ? '+' : ''}{change24h.toFixed(2)}%
            </Text>
          </View>
        </View>
      </View>}

      {/* Timeframe row + chart controls */}
      <View style={styles.tfControlRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tfScroll}
          contentContainerStyle={styles.tfScrollContent}
        >
          {ALL_TIMEFRAMES.map(tf => (
            <TouchableOpacity
              key={tf.key}
              style={[styles.tfPill, timeframe === tf.key && styles.tfPillActive]}
              onPress={() => setTimeframe(tf.key)}
              activeOpacity={0.7}
            >
              <Text style={[styles.tfPillText, timeframe === tf.key && styles.tfPillTextActive]}>
                {tf.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Chart mode + settings buttons */}
        <View style={styles.chartCtrlBtns}>
          <TouchableOpacity
            style={[styles.chartCtrlBtn, showModePanel && styles.chartCtrlBtnActive]}
            onPress={() => { setShowModePanel(p => !p); setShowSettingsPanel(false); }}
            activeOpacity={0.8}
          >
            <ModeIcon size={15} color={showModePanel ? '#A78BFA' : 'rgba(255,255,255,0.6)'} strokeWidth={2} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chartCtrlBtn, showSettingsPanel && styles.chartCtrlBtnActive]}
            onPress={() => { setShowSettingsPanel(p => !p); setShowModePanel(false); }}
            activeOpacity={0.8}
          >
            <SlidersHorizontal size={15} color={showSettingsPanel ? '#A78BFA' : 'rgba(255,255,255,0.6)'} strokeWidth={2} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Chart mode panel (conditional) */}
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
                activeOpacity={0.75}
              >
                <IconComp size={14} color={active ? '#fff' : 'rgba(255,255,255,0.45)'} strokeWidth={active ? 2.5 : 2} />
                <Text style={[styles.modePanelLabel, active && styles.modePanelLabelActive]}>{m.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Chart settings panel (conditional) */}
      {showSettingsPanel && (
        <View style={styles.settingsPanel}>
          {/* Value mode row */}
          <View style={styles.settingsRow}>
            <Text style={styles.settingsLabel}>Display</Text>
            <View style={styles.settingsToggleGroup}>
              <TouchableOpacity
                style={[styles.settingsToggleBtn, valueMode === 'mcap' && styles.settingsToggleBtnActive]}
                onPress={() => setValueMode('mcap')}
                activeOpacity={0.75}
              >
                <Text style={[styles.settingsToggleText, valueMode === 'mcap' && styles.settingsToggleTextActive]}>MCAP</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.settingsToggleBtn, valueMode === 'price' && styles.settingsToggleBtnActive]}
                onPress={() => setValueMode('price')}
                activeOpacity={0.75}
              >
                <Text style={[styles.settingsToggleText, valueMode === 'price' && styles.settingsToggleTextActive]}>PRICE</Text>
              </TouchableOpacity>
            </View>
          </View>
          {/* Volume toggle */}
          <View style={styles.settingsRow}>
            <Text style={styles.settingsLabel}>Volume bars</Text>
            <TouchableOpacity
              style={[styles.settingsSwitch, showVolume && styles.settingsSwitchOn]}
              onPress={() => setShowVolume(v => !v)}
              activeOpacity={0.75}
            >
              <View style={[styles.settingsSwitchThumb, showVolume && styles.settingsSwitchThumbOn]} />
            </TouchableOpacity>
          </View>
          {/* Price line toggle */}
          <View style={styles.settingsRow}>
            <Text style={styles.settingsLabel}>Price guide</Text>
            <TouchableOpacity
              style={[styles.settingsSwitch, showPriceLine && styles.settingsSwitchOn]}
              onPress={() => setShowPriceLine(v => !v)}
              activeOpacity={0.75}
            >
              <View style={[styles.settingsSwitchThumb, showPriceLine && styles.settingsSwitchThumbOn]} />
            </TouchableOpacity>
          </View>
          {/* Grid toggle */}
          <View style={styles.settingsRow}>
            <Text style={styles.settingsLabel}>Grid lines</Text>
            <TouchableOpacity
              style={[styles.settingsSwitch, showGrid && styles.settingsSwitchOn]}
              onPress={() => setShowGrid(v => !v)}
              activeOpacity={0.75}
            >
              <View style={[styles.settingsSwitchThumb, showGrid && styles.settingsSwitchThumbOn]} />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );

  if (loading) {
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

  if (!hasData || candles.length < 2) {
    return (
      <View style={styles.container}>
        {header}
        <View style={[styles.unavailableWrap, { height: CHART_H }]}>
          {displayPriceVal > 0 ? (
            <>
              <Text style={styles.priceFallback}>{fmtValue(displayPriceVal * mcapScale, valueMode)}</Text>
              <Text style={styles.unavailableText}>Chart data loading…</Text>
            </>
          ) : (
            <Text style={styles.unavailableText}>Chart data unavailable</Text>
          )}
        </View>
      </View>
    );
  }

  // ── build paths ───────────────────────────────────────────────────────────
  const linePts = displayCandles
    .map((c, i) => `${i === 0 ? 'M' : 'L'}${xFn(i).toFixed(1)},${yOf(c.close).toFixed(1)}`)
    .join(' ');
  const bottomY = (PAD.top + plotH).toFixed(1);
  const areaPath = `${linePts} L${xFn(n-1).toFixed(1)},${bottomY} L${xFn(0).toFixed(1)},${bottomY} Z`;

  const bondingPath = displayCandles.map((c, i) => {
    const x  = bondingX(i).toFixed(1);
    const y  = yOf(c.close).toFixed(1);
    if (i === 0) return `M${x},${y}`;
    const px = bondingX(i - 1);
    const py = yOf(displayCandles[i - 1].close);
    const cx = ((px + parseFloat(x)) / 2).toFixed(1);
    return `C${cx},${py.toFixed(1)} ${cx},${y} ${x},${y}`;
  }).join(' ');
  const bondingArea = `${bondingPath} L${bondingX(n-1).toFixed(1)},${bottomY} L${bondingX(0).toFixed(1)},${bottomY} Z`;

  // Grid
  const gridLevels = 5;
  const priceGridLines = Array.from({ length: gridLevels }, (_, i) => {
    const frac  = i / (gridLevels - 1);
    const price = minP + priceRange * frac;
    return { price, y: yOf(price) };
  });

  // Time labels — generated from leftTime→rightTime at regular bucket intervals
  // Aim for ~5-6 labels; step = multiple of bucketMs so labels land on clean boundaries
  const timeLabelStepMs = bucketMs * Math.max(1, Math.ceil(visibleBuckets / 6));
  const firstLabelTs    = Math.ceil(leftTime / timeLabelStepMs) * timeLabelStepMs;
  const timeLabels: { ts: number; x: number }[] = [];
  for (let ts = firstLabelTs; ts <= rightTime; ts += timeLabelStepMs) {
    const x = tsToX(ts);
    if (x >= PAD.left + 16 && x <= chartWidth - PAD.right - 10) {
      timeLabels.push({ ts, x });
    }
  }

  // Live price line (scaled to current display mode)
  const scaledLivePrice = displayPriceVal * mcapScale;
  const clampedLive = scaledLivePrice > maxP ? maxP : scaledLivePrice < minP ? minP : scaledLivePrice;
  const currentY    = Math.max(PAD.top + 2, Math.min(PAD.top + plotH - 2, yOf(clampedLive)));

  // Last candle point for animated dot
  const lastCandle = displayCandles[n - 1];
  const lastX      = xOf(n - 1);
  const lastY      = yOf(lastCandle.close);

  // Visual continuation segment: flat line from last candle's close to current time
  // Drawn only when live (not scrolled back), visual only — no data stored
  const contRightX = PAD.left + plotW; // = tsToX(rightTime) by definition
  const contY      = lastY;
  const showContinuation = panOffsetCandles === 0 && n > 0 && contRightX > lastX + 2;

  // Crosshair display values
  const chPrice = crosshair ? crosshair.price : null;
  const chPct   = crosshair ? crosshair.pct   : null;

  // Vol bar positions — placed between chart and time labels
  const volBaseY = CHART_H + VOL_H - 2;

  return (
    <View style={styles.container}>
      {header}

      {/* Crosshair info bar */}
      {crosshair && (
        <View style={styles.crosshairBar}>
          <Text style={styles.crosshairDate}>{fmtDateTime(crosshair.ts)}</Text>
          <Text style={styles.crosshairPrice}>{fmtValue(crosshair.price, valueMode)}</Text>
          <Text style={[styles.crosshairPct, { color: (crosshair.pct ?? 0) >= 0 ? '#A78BFA' : '#EC4899' }]}>
            {(crosshair.pct ?? 0) >= 0 ? '+' : ''}{crosshair.pct?.toFixed(2)}%
          </Text>
          <TouchableOpacity onPress={dismissCrosshair} style={styles.crosshairClose}>
            <Text style={styles.crosshairCloseText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Return to Live button — shown when scrolled back in history */}
      {panOffsetCandles > 0 && (
        <TouchableOpacity
          style={styles.returnLiveBtn}
          onPress={() => {
            panOffsetRef.current = 0;
            setPanOffsetCandles(0);
            setCrosshair(null);
          }}
          activeOpacity={0.8}
        >
          <Text style={styles.returnLiveText}>▶ Return to Live</Text>
        </TouchableOpacity>
      )}

      <View
        ref={svgContainerRef}
        style={[
          styles.svgWrap,
          Platform.OS === 'web' && ({
            userSelect: 'none',
            WebkitUserSelect: 'none',
            MozUserSelect: 'none',
            touchAction: 'none',
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
          </Defs>

          {/* ── Chart area background ──────────────────────────────────────── */}
          <Rect x={PAD.left} y={PAD.top} width={plotW} height={plotH}
            fill="rgba(255,255,255,0.01)" />

          {/* ── Horizontal grid lines + price labels ──────────────────────── */}
          {priceGridLines.map(({ price, y }, i) => (
            <G key={`g${i}`}>
              {showGrid && (
                <Line
                  x1={PAD.left} y1={y} x2={chartWidth - PAD.right} y2={y}
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

          {/* ── Right-edge border ─────────────────────────────────────────── */}
          <Line x1={chartWidth - PAD.right} y1={PAD.top} x2={chartWidth - PAD.right} y2={PAD.top + plotH}
            stroke="rgba(255,255,255,0.06)" strokeWidth={1} />

          {/* ── Bottom border of chart area ───────────────────────────────── */}
          <Line x1={PAD.left} y1={PAD.top + plotH} x2={chartWidth - PAD.right} y2={PAD.top + plotH}
            stroke="rgba(255,255,255,0.06)" strokeWidth={1} />

          {/* ── AREA ──────────────────────────────────────────────────────── */}
          {mode === 'area' && (
            <>
              <Path d={areaPath} fill="url(#areaGrad)" />
              <Path d={linePts} stroke="rgba(139,92,246,0.25)" strokeWidth={5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <Path d={linePts} stroke="#A78BFA" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </>
          )}

          {/* ── LINE ──────────────────────────────────────────────────────── */}
          {mode === 'line' && (
            <>
              <Path d={linePts} stroke="rgba(139,92,246,0.18)" strokeWidth={5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <Path d={linePts} stroke="#A78BFA" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <Circle cx={lastX} cy={lastY} r={5} fill="#8B5CF6" opacity={0.18} />
              <Circle cx={lastX} cy={lastY} r={3} fill="#A78BFA" />
            </>
          )}

          {/* ── MOUNTAIN ──────────────────────────────────────────────────── */}
          {mode === 'mountain' && (
            <>
              {/* stepped fill */}
              <Path
                d={displayCandles.map((c, i) => {
                  const x  = xOf(i).toFixed(1);
                  const y  = yOf(c.close).toFixed(1);
                  if (i === 0) return `M${x},${y}`;
                  const prevX = xOf(i - 1).toFixed(1);
                  return `L${x},${yOf(displayCandles[i - 1].close).toFixed(1)} L${x},${y}`;
                }).join(' ') + ` L${xOf(n-1).toFixed(1)},${bottomY} L${xOf(0).toFixed(1)},${bottomY} Z`}
                fill="url(#mountainGrad)" />
              <Path d={linePts} stroke="#8B5CF6" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <Circle cx={lastX} cy={lastY} r={3} fill="#A78BFA" />
            </>
          )}

          {/* ── BONDING ───────────────────────────────────────────────────── */}
          {mode === 'bonding' && (
            <>
              <Path d={bondingArea} fill="url(#bondingGrad)" />
              <Path d={bondingPath} stroke="rgba(167,139,250,0.18)" strokeWidth={7} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <Path d={bondingPath} stroke="#A78BFA" strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              {[0, Math.floor(n * 0.33), Math.floor(n * 0.66), n - 1].map(i => {
                if (i >= n) return null;
                const isLast = i === n - 1;
                return (
                  <Circle key={`bd${i}`}
                    cx={bondingX(i)} cy={yOf(displayCandles[i].close)}
                    r={isLast ? 5 : 3}
                    fill={isLast ? '#A78BFA' : 'rgba(167,139,250,0.5)'}
                    stroke={isLast ? '#fff' : 'none'} strokeWidth={isLast ? 1 : 0} />
                );
              })}
            </>
          )}

          {/* ── BAR ───────────────────────────────────────────────────────── */}
          {mode === 'bar' && displayCandles.map((c, i) => {
            const up   = c.close >= c.open;
            const col  = up ? '#8B5CF6' : '#EC4899';
            const cx   = xOf(i);
            const bw   = Math.max(isMobile ? 4 : 2, (plotW / n) * 0.5);
            return (
              <G key={`bar${i}`}>
                <Line x1={cx} y1={yOf(c.high)} x2={cx} y2={yOf(c.low)} stroke={col} strokeWidth={isMobile ? 2 : 1} opacity={0.7} />
                <Line x1={cx - bw / 2} y1={yOf(c.open)}  x2={cx} y2={yOf(c.open)}  stroke={col} strokeWidth={1.5} />
                <Line x1={cx}          y1={yOf(c.close)} x2={cx + bw / 2} y2={yOf(c.close)} stroke={col} strokeWidth={1.5} />
              </G>
            );
          })}

          {/* ── CANDLESTICK ───────────────────────────────────────────────── */}
          {mode === 'candlestick' && displayCandles.map((c, i) => {
            const up       = c.close >= c.open;
            const col      = up ? '#8B5CF6' : '#EC4899';
            const bodyTop  = yOf(Math.max(c.open, c.close));
            const bodyBot  = yOf(Math.min(c.open, c.close));
            const bodyH    = Math.max(1.5, bodyBot - bodyTop);
            const cx       = xOf(i);
            return (
              <G key={`cs${i}`}>
                <Line x1={cx} y1={yOf(c.high)} x2={cx} y2={yOf(c.low)} stroke={col} strokeWidth={isMobile ? 2 : 1} opacity={0.8} />
                <Rect x={cx - candleW / 2} y={bodyTop} width={candleW} height={bodyH}
                  fill={col} opacity={0.9} rx={1} />
              </G>
            );
          })}

          {/* ── Visual time continuation (flat line from last close → now) ── */}
          {showContinuation && (mode === 'area' || mode === 'line' || mode === 'mountain' || mode === 'bonding') && (
            <Line
              x1={lastX} y1={contY}
              x2={Math.min(contRightX, chartWidth - PAD.right)} y2={contY}
              stroke="rgba(167,139,250,0.45)"
              strokeWidth={1.5}
              strokeDasharray="3,4"
            />
          )}

          {/* ── Live price dashed horizontal line ─────────────────────────── */}
          {showPriceLine && (
            <>
              <Line
                x1={PAD.left} y1={currentY} x2={chartWidth - PAD.right} y2={currentY}
                stroke="#8B5CF6"
                strokeWidth={1} strokeDasharray="4,3" opacity={0.7} />
              {/* Price pill on right edge */}
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

          {/* ── Animated endpoint dot (non-candlestick/bar) ───────────────── */}
          {(mode === 'area' || mode === 'line' || mode === 'mountain' || mode === 'bonding') && (
            <Circle cx={lastX} cy={lastY} r={3}
              fill="#A78BFA" opacity={1} />
          )}

          {/* ── Volume bars — sandwiched between chart and time labels ─────── */}
          {showVolume && displayCandles.map((c, i) => {
            const h     = volBarH(c.volume);
            const vx    = xOf(i);
            const isUp  = c.close >= c.open;
            const isLast = i === n - 1;
            return (
              <Rect key={`v${i}`}
                x={vx - barW / 2}
                y={CHART_H + (VOL_H - h - 2)}
                width={Math.max(barW, 1.5)}
                height={h}
                fill={isUp ? 'url(#volGradGreen)' : 'url(#volGradRed)'}
                opacity={isLast ? 0.9 : 0.45}
                rx={1} />
            );
          })}

          {/* ── Volume area separator line ────────────────────────────────── */}
          <Line
            x1={PAD.left} y1={CHART_H}
            x2={chartWidth - PAD.right} y2={CHART_H}
            stroke="rgba(255,255,255,0.04)" strokeWidth={1} />

          {/* ── Time labels — timestamp-based, slide as real time passes ──── */}
          {timeLabels.map(({ ts, x }) => (
            <SvgText
              key={`tl${ts}`}
              x={x}
              y={CHART_H + VOL_H + TIME_H - 3}
              fontSize={9}
              fill="rgba(255,255,255,0.35)"
              textAnchor="middle">
              {fmtTime(ts, timeframe)}
            </SvgText>
          ))}

          {/* ── Crosshair lines ───────────────────────────────────────────── */}
          {crosshair && (
            <G>
              {/* Vertical line */}
              <Line
                x1={crosshair.x} y1={PAD.top}
                x2={crosshair.x} y2={CHART_H + VOL_H}
                stroke="rgba(255,255,255,0.3)" strokeWidth={1} strokeDasharray="3,3" />
              {/* Horizontal line */}
              <Line
                x1={PAD.left} y1={crosshair.y}
                x2={chartWidth - PAD.right} y2={crosshair.y}
                stroke="rgba(255,255,255,0.25)" strokeWidth={1} strokeDasharray="3,3" />
              {/* Crosshair dot */}
              <Circle cx={crosshair.x} cy={crosshair.y} r={5}
                fill="#8B5CF6" stroke="#fff" strokeWidth={1.5} opacity={0.95} />
              {/* Price label on right axis */}
              <Rect
                x={chartWidth - PAD.right + 1} y={crosshair.y - 9}
                width={PAD.right - 2} height={18}
                fill="#8B5CF6" rx={3} />
              <SvgText
                x={chartWidth - PAD.right + (PAD.right - 2) / 2 + 1} y={crosshair.y + 4.5}
                fontSize={isMobile ? 10 : 7.5} fill="#fff" textAnchor="middle" fontWeight="700">
                {fmtValue(crosshair.price, valueMode)}
              </SvgText>
            </G>
          )}
        </Svg>

        {/* Animated live pulse ring overlay — always visible for live modes */}
        {!crosshair && (mode === 'area' || mode === 'line' || mode === 'mountain' || mode === 'bonding') && (
          <Animated.View
            style={[
              styles.livePulse,
              {
                left: lastX - 10,
                top:  lastY - 10,
                transform: [{ scale: dotPulse }],
                backgroundColor: 'rgba(167,139,250,0.22)',
              },
            ]}
            pointerEvents="none"
          />
        )}
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
  chartHeaderSlim: {
    paddingTop: 8,
    paddingBottom: 6,
    gap: 0,
  },
  // Token info row: [logo] [name+addr flex1] [price+change]
  tokenInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  tokenLogoLg: {
    width: 44, height: 44, borderRadius: 10,
    backgroundColor: '#1A1A2E',
  },
  tokenLogoLgFallback: {
    width: 44, height: 44, borderRadius: 10,
    backgroundColor: '#1A1A2E',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.25)',
  },
  tokenLogoLgText: { fontSize: 14, fontWeight: '900', color: '#A78BFA' },
  tokenInfoMid: { flex: 1, gap: 2 },
  tokenNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tokenNameText: { fontSize: 15, fontWeight: '800', color: '#fff', letterSpacing: -0.2, flexShrink: 1 },
  liveWsDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: '#A78BFA',
  },
  addrRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addrText: { fontSize: 10, color: 'rgba(255,255,255,0.35)', fontFamily: 'SpaceMono-Regular' },
  tokenPriceRight: { alignItems: 'flex-end', gap: 3 },
  tokenBigPrice: { fontSize: 20, fontWeight: '900', color: '#fff', letterSpacing: -0.5 },
  tokenChangeRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  tokenChangePct: { fontSize: 12, fontWeight: '700' },
  // Timeframe pill row + chart ctrl buttons
  tfControlRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  tfScroll: { flex: 1 },
  tfScrollContent: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: 4 },
  tfPill: {
    paddingHorizontal: 9, paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  tfPillActive: {
    backgroundColor: 'rgba(139,92,246,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.5)',
  },
  tfPillText: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.4)' },
  tfPillTextActive: { color: '#A78BFA' },
  chartCtrlBtns: { flexDirection: 'row', gap: 4 },
  chartCtrlBtn: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  chartCtrlBtnActive: {
    backgroundColor: 'rgba(139,92,246,0.2)',
    borderColor: 'rgba(139,92,246,0.4)',
  },
  // Mode panel
  modePanelRow: {
    flexDirection: 'row', gap: 4, flexWrap: 'wrap',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10, padding: 6,
  },
  modePanelItem: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 7,
    borderRadius: 7, flex: 1, justifyContent: 'center',
    minWidth: 70,
  },
  modePanelItemActive: { backgroundColor: colors.primary },
  modePanelLabel: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.4)' },
  modePanelLabelActive: { color: '#fff' },
  // Crosshair info bar
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
  // Chart SVG wrapper
  svgWrap: { paddingTop: 4, paddingBottom: 2, position: 'relative', overflow: 'hidden' },
  // Loading / unavailable
  loadingWrap:     { height: 220, justifyContent: 'center', alignItems: 'center', gap: spacing.sm },
  loadingSubText:  { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '500' },
  unavailableWrap: { height: 160, justifyContent: 'center', alignItems: 'center', gap: spacing.sm },
  unavailableText: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '500' },
  priceFallback:   { fontSize: 24, fontWeight: '900', color: colors.primary },
  // Live pulse
  livePulse: {
    position: 'absolute', width: 20, height: 20, borderRadius: 10,
    pointerEvents: 'none',
  },
  returnLiveBtn: {
    alignSelf: 'center',
    backgroundColor: 'rgba(139,92,246,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.4)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 6,
    marginVertical: 4,
  },
  returnLiveText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#A78BFA',
    letterSpacing: 0.3,
  },
  // Settings panel
  settingsPanel: {
    backgroundColor: 'rgba(13,11,25,0.97)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.25)',
    paddingVertical: 4,
    overflow: 'hidden',
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(139,92,246,0.08)',
  },
  settingsLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
  },
  settingsToggleGroup: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 6,
    padding: 2,
    gap: 2,
  },
  settingsToggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 5,
  },
  settingsToggleBtnActive: {
    backgroundColor: '#7C3AED',
  },
  settingsToggleText: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 0.4,
  },
  settingsToggleTextActive: { color: '#fff' },
  settingsSwitch: {
    width: 38,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  settingsSwitchOn: {
    backgroundColor: 'rgba(124,58,237,0.5)',
    borderColor: 'rgba(167,139,250,0.5)',
  },
  settingsSwitchThumb: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.35)',
    alignSelf: 'flex-start',
  },
  settingsSwitchThumbOn: {
    alignSelf: 'flex-end',
    backgroundColor: '#A78BFA',
  },
});
