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
import { supabase } from '@/lib/supabase';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// How long a live candle stays "active" before its pulse fades out.
// After this window with no new real trade the dot stops pulsing.
const LIVE_CANDLE_STALE_MS = 5 * 60_000; // 5 minutes

/**
 * Extends CandleData with origin metadata so rendering can verify
 * the candle came from a confirmed real on-chain trade rather than
 * a quote-only price source (DexScreener WS, Jupiter REST, etc.).
 *
 * sourceType === 'realTrade' is the canonical gate:
 *   - set only when Supabase realtime fires on token_candles with is_live=true
 *   - never set by DexScreener WS, Jupiter quote, REST poll, or liveTokenStore
 */
interface LiveCandleData extends CandleData {
  /** Always 'realTrade' — only real on-chain events create this object. */
  sourceType: 'realTrade';
  /** Where the trade signal came from, e.g. 'supabase-token-candles'. */
  source: string;
  /** Unix-ms timestamp of the triggering trade event (not the candle open time). */
  tradeTimestamp: number;
  /** On-chain tx signature if the source provides it. */
  signature?: string;
  /** Trade direction if available. */
  side?: 'buy' | 'sell';
  /** Raw trade volume in quote currency (0 when unavailable — never invented). */
  tradeVolume: number;
}

export type ChartMode = 'line' | 'area' | 'candlestick' | 'bonding' | 'bar' | 'mountain';
type ValueMode = 'mcap' | 'price';

export interface TokenInfo {
  name: string;
  symbol: string;
  image?: string;
  price: number;
  priceChange24h: number;
  marketCap?: number;
  /** Real circulating/total supply from on-chain or API metadata (tokens, not lamports). */
  totalSupply?: number;
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
  { key: 'bonding',     icon: TrendingUp,       label: 'Pulse' },
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

// Repair and validate raw API candles before storing.
// Fresh/new tokens may return partial OHLC where open/high/low are 0 but close is valid.
// Rules:
//  - Reject candles with invalid timestamp or close <= 0.
//  - Repair open/high/low by falling back to close — never invent movement.
//  - Enforce high >= open, high >= close; low <= open, low <= close.
//  - Reject if high < low after repair (truly impossible candle).
//  - Zero or negative volume is clamped to 0 (no volume bar will be rendered).
function sanitizeRawCandles(cs: CandleData[]): CandleData[] {
  const result: CandleData[] = [];
  for (const c of cs) {
    if (!c) continue;
    const ts = c.timestamp;
    if (!isFinite(ts) || ts <= 0) continue;
    const close = isFinite(c.close) && c.close > 0 ? c.close : 0;
    if (close <= 0) continue;
    // Repair missing OHLC fields — fall back to close, never invent movement
    const open  = isFinite(c.open)  && c.open  > 0 ? c.open  : close;
    const high  = isFinite(c.high)  && c.high  > 0 ? c.high  : close;
    const low   = isFinite(c.low)   && c.low   > 0 ? c.low   : close;
    // Enforce valid OHLC relationship
    const safeHigh = Math.max(high, open, close);
    const safeLow  = Math.min(low,  open, close);
    if (safeHigh < safeLow) continue; // should never happen after above, but guard anyway
    result.push({
      timestamp: ts,
      open,
      high: safeHigh,
      low:  safeLow,
      close,
      volume: isFinite(c.volume) && c.volume > 0 ? c.volume : 0,
    });
  }
  return result;
}

// Keep the best real candle per bucket (highest volume wins; real candles with volume take priority over zero-volume visual guides).
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



const TIMEFRAME_ORDER: TimeFrame[] = ['1m', '5m', '15m', '1H', '4H', '1D', '1W', '1M'];

function timeframeRank(tf: TimeFrame): number {
  const idx = TIMEFRAME_ORDER.indexOf(tf);
  return idx >= 0 ? idx : 0;
}

function getLowerOrEqualTimeframes(tf: TimeFrame): TimeFrame[] {
  const rank = timeframeRank(tf);
  // Start with the selected timeframe, then try finer real sources that can be
  // aggregated upward without inventing smaller candles.
  const frames = [tf, ...TIMEFRAME_ORDER.slice(0, rank).reverse()];
  return Array.from(new Set(frames));
}

function aggregateCandlesToTimeframe(cs: CandleData[], targetTf: TimeFrame): CandleData[] {
  const bucketMs = BUCKET_MS[targetTf] ?? 60_000;
  const input = sanitizeRawCandles(cs).sort((a, b) => a.timestamp - b.timestamp);
  const buckets = new Map<number, CandleData>();

  for (const c of input) {
    const bucket = Math.floor(c.timestamp / bucketMs) * bucketMs;
    const existing = buckets.get(bucket);
    if (!existing) {
      buckets.set(bucket, {
        timestamp: bucket,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume > 0 ? c.volume : 0,
      });
    } else {
      existing.high = Math.max(existing.high, c.high);
      existing.low = Math.min(existing.low, c.low);
      existing.close = c.close;
      existing.volume += c.volume > 0 ? c.volume : 0;
    }
  }

  return Array.from(buckets.values()).sort((a, b) => a.timestamp - b.timestamp);
}

function scoreCandleSet(cs: CandleData[], targetTf: TimeFrame): number {
  const cleaned = sanitizeRawCandles(cs);
  if (cleaned.length === 0) return 0;
  const bucketMs = BUCKET_MS[targetTf] ?? 60_000;
  const sorted = cleaned.sort((a, b) => a.timestamp - b.timestamp);
  const span = Math.max(sorted[sorted.length - 1].timestamp - sorted[0].timestamp, bucketMs);
  const countScore = Math.min(sorted.length, 120) * 10;
  const spanScore = Math.min(span / bucketMs, 120);
  const withVol = sorted.filter(c => c.volume > 0).length;
  const volumeScore = withVol * 2;
  let maxGap = 0;
  for (let i = 1; i < sorted.length; i++) maxGap = Math.max(maxGap, sorted[i].timestamp - sorted[i - 1].timestamp);
  const gapPenalty = sorted.length > 1 ? Math.min(maxGap / bucketMs, 80) : 30;
  const flatCount = sorted.filter(c => Math.abs(c.high - c.low) < Math.max(c.close, 1e-12) * 1e-6).length;
  const flatPenalty = (flatCount / sorted.length) * 40;
  return countScore + spanScore + volumeScore - gapPenalty - flatPenalty;
}

function chooseBestCandleSet(candidates: CandleData[][], targetTf: TimeFrame): CandleData[] {
  let best: CandleData[] = [];
  let bestScore = -Infinity;
  for (const candidate of candidates) {
    const cleaned = sanitizeRawCandles(candidate);
    const score = scoreCandleSet(cleaned, targetTf);
    if (score > bestScore) {
      bestScore = score;
      best = cleaned;
    }
  }
  return best;
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
function fmtTimeByStep(ts: number, stepMs: number): string {
  const d = new Date(ts);
  // Monthly or longer: show "Mon YYYY"
  if (stepMs >= 30 * 86_400_000) {
    return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  }
  // Weekly: show "Mon D"
  if (stepMs >= 7 * 86_400_000) {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  // Daily: show "Mon D"
  if (stepMs >= 86_400_000) {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  // Sub-daily: show date at midnight, otherwise time
  if (d.getHours() === 0 && d.getMinutes() === 0) {
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

// Module-level cache: resolved pair address per token mint.
// Avoids a redundant DexScreener fetch every time the component remounts for the same token.
const resolvedPairCache = new Map<string, string>();

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
  // Only set by confirmed real on-chain trade events (is_live=true from Supabase realtime).
  const [activeLiveCandle, setActiveLiveCandle] = useState<LiveCandleData | null>(null);
  const activeLiveCandleRef = useRef<LiveCandleData | null>(null);

  const [timeframe, setTimeframe] = useState<TimeFrame | 'ALL'>('1H');
  // Tracks which resolution was actually used when timeframe === 'ALL'.
  // Starts at 1D; auto-degrades to 1H or 5m for newer/sparser tokens.
  const [allEffectiveTf, setAllEffectiveTf] = useState<TimeFrame>('1D');
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
  const [live24hChange, setLive24hChange] = useState<number | null>(null);
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

  const headerPulseAnim = useRef(new Animated.Value(1)).current;
  const chartPulseAnim  = useRef(new Animated.Value(0)).current;

  const [panOffsetCandles, setPanOffsetCandles] = useState(0);
  const panOffsetRef        = useRef(0);
  const plotWRef            = useRef(0);
  const panStartOffsetRef   = useRef(0);
  // 'idle' → 'crosshair' or 'pan' — locked until touch release.
  const gestureModeRef      = useRef<'idle' | 'crosshair' | 'pan'>('idle');
  const touchStartXRef      = useRef(0);
  const touchStartYRef      = useRef(0);
  const touchStartTimeRef   = useRef(0);

  // All ranked DexScreener pair addresses for the current token.
  // Stored so we can fall back to the next pair if the primary WS fails repeatedly.
  const rankedPairsRef = useRef<string[]>([]);

  // Stable price scale — recomputed only when visible candle set changes, not on clock tick.
  const priceScaleRef    = useRef({ maxP: 0, minP: 0, priceRange: 1, maxVol: 1 });
  const priceScaleKeyRef = useRef('');

  const pollTimerRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const wsRef               = useRef<WebSocket | null>(null);
  const livePriceRef        = useRef<number | null>(null);
  const wsDebounceRef       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsReconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsRetryCountRef     = useRef(0);
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
  // True only when the user explicitly drags the chart; reset on token/timeframe change.
  // Prevents "Return to Live" from appearing after auto-scroll adjustments.
  const userPannedRef = useRef(false);

  // Centralized price pipeline: track timestamp of latest accepted price to prevent
  // stale API responses from overwriting fresher live prices.
  const latestPriceTsRef = useRef<number>(0);

  // true = chart SVG is intersecting the viewport; RAF skips setClockTick when false.
  const chartVisibleRef = useRef(true);
  // Set to true while applying a liveTokenStore-sourced update to prevent push-back.
  const fromStoreRef = useRef(false);
  // Set to true once the user manually picks a chart mode; suppresses auto-detection.
  const userSelectedModeRef = useRef(false);
  // Stable supply: computed once from snapshot, never drifts with livePrice.
  // Reset when tokenMint changes so a new token gets a fresh calculation.
  const stableSupplyRef = useRef<number | null>(null);

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

  // Resolve best pair address from DexScreener when token mint changes.
  // Prefers pairs with usable live price data (non-zero priceUsd + liquidity/volume).
  // Caches the resolved address per mint so the fetch only happens once per token.
  useEffect(() => {
    if (!tokenMint) return;
    if (pairAddress) {
      setResolvedPairAddr(pairAddress);
      pairAddrRef.current = pairAddress;
      return;
    }
    const cached = resolvedPairCache.get(tokenMint);
    if (cached) {
      setResolvedPairAddr(cached);
      pairAddrRef.current = cached;
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
        // Prefer pairs with usable live price data (non-zero priceUsd and some activity).
        // This avoids getting stuck on a dead AMM with no recent trades.
        const usable = pairs.filter((p: any) =>
          parseFloat(p.priceUsd || '0') > 0 &&
          ((p.liquidity?.usd || 0) > 0 || (p.volume?.h24 || 0) > 0)
        );
        const ranked = (usable.length > 0 ? usable : pairs)
          .sort((a: any, b: any) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
        const allAddrs = ranked.map((p: any) => p.pairAddress).filter(Boolean) as string[];
        const addr = allAddrs[0];
        if (!cancelled && addr) {
          // Store all ranked pairs for WS candidate rotation; do not cache until OHLCV validates.
          rankedPairsRef.current = allAddrs;
          setResolvedPairAddr(addr);
          pairAddrRef.current = addr;
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [tokenMint, pairAddress]);

  // Header WS dot pulse — always running
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(headerPulseAnim, { toValue: 2.2, duration: 400, useNativeDriver: true }),
      Animated.timing(headerPulseAnim, { toValue: 1,   duration: 400, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);

  // Chart endpoint pulse — only when a confirmed real-trade live candle is active and fresh.
  // Quote-only updates (DexScreener WS, Jupiter REST, liveTokenStore) never set activeLiveCandle,
  // so this guard is mainly a safety check against stale candles from earlier sessions.
  useEffect(() => {
    if (!activeLiveCandle || activeLiveCandle.sourceType !== 'realTrade') {
      chartPulseAnim.setValue(0);
      return;
    }
    const isStale = Date.now() - activeLiveCandle.tradeTimestamp > LIVE_CANDLE_STALE_MS;
    if (isStale) {
      chartPulseAnim.setValue(0);
      return;
    }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(chartPulseAnim, { toValue: 0.65, duration: 250, useNativeDriver: false }),
      Animated.timing(chartPulseAnim, { toValue: 0,    duration: 650, useNativeDriver: false }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [activeLiveCandle]);

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
      // Skip work when the tab is hidden OR chart is scrolled off-screen.
      // Prevents the right-edge clock from jumping forward after long pauses and
      // avoids unnecessary re-renders when the chart is not visible.
      if (!tabHidden && chartVisibleRef.current) {
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

  // Viewport visibility — pause setClockTick when chart is scrolled off-screen.
  // Uses IntersectionObserver on web; native always stays active.
  // Re-runs when hasData changes so the observer attaches after the SVG mounts.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof IntersectionObserver === 'undefined') return;
    if (!hasData) { chartVisibleRef.current = true; return; }
    const el = svgContainerRef.current as unknown as Element;
    if (!el) return;
    const obs = new IntersectionObserver(entries => {
      chartVisibleRef.current = entries[0]?.isIntersecting ?? true;
    }, { threshold: 0 });
    obs.observe(el);
    return () => {
      obs.disconnect();
      chartVisibleRef.current = true;
    };
  }, [hasData]);

  // ── Single price pipeline ────────────────────────────────────────────────────
  // All price sources funnel through applyLivePrice. Each call carries a timestamp
  // so that a late-arriving REST response never overwrites a fresher live price.
  // isRealTrade = true  → a timestamped on-chain trade; may create/update activeLiveCandle.
  // isRealTrade = false → REST/WS quote, DexScreener, Jupiter; updates display only.
  // The active live candle (current bucket only) is updated separately from history.
  const applyLivePrice = useCallback((
    price: number,
    sourceTs?: number,
    isRealTrade = false,
    tradeMeta?: {
      /** Canonical source identifier, e.g. 'supabase-token-candles'. */
      source: string;
      signature?: string;
      side?: 'buy' | 'sell';
      /** Raw trade volume in quote currency; 0 when unavailable, never invented. */
      tradeVolume?: number;
    },
  ) => {
    if (!price || price <= 0) return;
    const ts = sourceTs ?? Date.now();
    // Reject if this update is more than 1s older than the last accepted price.
    if (ts < latestPriceTsRef.current - 1000) return;
    if (livePriceRef.current === price && ts <= latestPriceTsRef.current) return;
    latestPriceTsRef.current = Math.max(latestPriceTsRef.current, ts);
    livePriceRef.current = price;
    setLivePrice(price);
    // Don't push back to store when the update itself came from the store — prevents loop.
    if (tokenMint && !fromStoreRef.current) liveTokenStore.pushPrice(tokenMint, price);

    // Quote-only sources (DexScreener WS, Jupiter REST, liveTokenStore, external snapshot)
    // must NOT create or mutate activeLiveCandle — they carry no confirmed trade event.
    if (!isRealTrade) return;

    const bMs = BUCKET_MS[timeframeRef.current] ?? 3_600_000;
    // Use the real event timestamp for bucket allocation so the live candle
    // lands at the same bucket as the source trade, not at Date.now() which
    // can be ahead of historical data and create a visual gap.
    const priceEventTs = sourceTs ?? Date.now();
    const activeBucket = Math.floor(priceEventTs / bMs) * bMs;
    const hist = candlesRef.current;
    const lastHist = hist.length > 0 ? hist[hist.length - 1] : null;
    const lastHistClose = lastHist ? lastHist.close : price;
    const lastHistBucket = lastHist ? Math.floor(lastHist.timestamp / bMs) * bMs : 0;
    // If the live price bucket is more than 4 buckets ahead of the last historical
    // candle, the token has no recent trades — suppress the live candle entirely to
    // avoid rendering an isolated dot or blank right-side void far from real data.
    if (lastHist && (activeBucket - lastHistBucket) > bMs * 4) return;
    // Only carry lastHistClose into the new live candle when the previous real candle
    // is in an adjacent bucket (within 2.5 bucket-widths). If the gap is larger, the
    // live candle opens at current price so no huge artificial wicks appear.
    const isHistAdjacent = lastHist != null && (activeBucket - lastHistBucket) <= bMs * 2.5;
    const openPrice = isHistAdjacent ? lastHistClose : price;

    // Metadata embedded in every real-trade candle so rendering can verify origin.
    const safeTradeVolume = tradeMeta?.tradeVolume != null &&
      isFinite(tradeMeta.tradeVolume) && tradeMeta.tradeVolume >= 0
        ? tradeMeta.tradeVolume
        : 0;

    setActiveLiveCandle((prev: LiveCandleData | null) => {
      const prevBucket = prev ? Math.floor(prev.timestamp / bMs) * bMs : -1;
      if (prevBucket !== activeBucket) {
        // New bucket — create a fresh live candle with full origin metadata.
        const fresh: LiveCandleData = {
          timestamp:      activeBucket,
          open:           openPrice,
          high:           Math.max(openPrice, price),
          low:            Math.min(openPrice, price),
          close:          price,
          volume:         safeTradeVolume,
          sourceType:     'realTrade',
          source:         tradeMeta?.source ?? 'supabase-token-candles',
          tradeTimestamp: priceEventTs,
          tradeVolume:    safeTradeVolume,
          ...(tradeMeta?.signature ? { signature: tradeMeta.signature } : {}),
          ...(tradeMeta?.side      ? { side:      tradeMeta.side }      : {}),
        };
        return fresh;
      }
      // Same bucket — update OHLC in place, refresh trade timestamp.
      if (prev!.close === price && prev!.high >= price && prev!.low <= price) return prev;
      return {
        ...prev!,
        close:          price,
        high:           Math.max(prev!.high, price),
        low:            Math.min(prev!.low,  price),
        tradeTimestamp: priceEventTs,
        ...(tradeMeta?.signature ? { signature: tradeMeta.signature } : {}),
        ...(tradeMeta?.side      ? { side:      tradeMeta.side }      : {}),
      };
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
            // DexScreener WS provides price quotes, not real timestamped trades.
            applyLivePrice(price, Date.now(), false);
          }, 400);
          livePriceRef.current = np;
        } catch {}
      };
      ws.onerror = () => { try { setWsConnected(false); } catch {} };
      ws.onclose = () => {
        try { setWsConnected(false); } catch {}
        wsRef.current = null;
        // Stop retrying after 5 attempts — pair is likely unavailable or bad.
        if (wsRetryCountRef.current >= 5) {
          // Try the next ranked pair if available (max 3 pairs total to avoid runaway loops).
          const currentIdx = rankedPairsRef.current.findIndex(a => a === pairAddrRef.current);
          const nextAddr = currentIdx >= 0 && currentIdx < 2
            ? rankedPairsRef.current[currentIdx + 1]
            : undefined;
          if (nextAddr) {
            pairAddrRef.current = nextAddr;
            setResolvedPairAddr(nextAddr);
            wsRetryCountRef.current = 0;
            if (wsReconnectTimerRef.current) clearTimeout(wsReconnectTimerRef.current);
            wsReconnectTimerRef.current = setTimeout(() => {
              wsReconnectTimerRef.current = null;
              if (wsRef.current === null) connectWebSocket(nextAddr);
            }, 5000);
          }
          return;
        }
        // Don't reconnect when the tab or chart is not visible.
        if (typeof document !== 'undefined' && document.hidden) return;
        if (!chartVisibleRef.current) return;
        // Exponential backoff: 5s → 10s → 20s → 40s → 60s (cap).
        const delay = Math.min(5000 * Math.pow(2, wsRetryCountRef.current), 60_000);
        wsRetryCountRef.current++;
        if (wsReconnectTimerRef.current) clearTimeout(wsReconnectTimerRef.current);
        wsReconnectTimerRef.current = setTimeout(() => {
          wsReconnectTimerRef.current = null;
          if (pairAddrRef.current && wsRef.current === null) connectWebSocket(pairAddrRef.current);
        }, delay);
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
    setLive24hChange(null);
    livePriceRef.current = null;
    latestPriceTsRef.current = 0;
    hasAutoScrolledRef.current = false;
    wsRetryCountRef.current = 0;
    if (wsReconnectTimerRef.current) { clearTimeout(wsReconnectTimerRef.current); wsReconnectTimerRef.current = null; }
    // Reset mode selection so auto-detection can run for the new token.
    userSelectedModeRef.current = false;
    // Reset supply so MCAP re-derives from the new token's snapshot.
    stableSupplyRef.current = null;
    // Reset ALL effective timeframe to default.
    setAllEffectiveTf('1D');
    // Reset pair candidate state for the new token.
    rankedPairsRef.current = [];
  }, [tokenMint]);

  // Auto-select chart mode based on token trading density.
  // Uses gap/volume analysis to detect sparse tokens — these look bad with area fill.
  // Skipped once the user manually picks a mode.
  useEffect(() => {
    if (!hasData || candles.length === 0 || userSelectedModeRef.current) return;
    const sevenDaysAgo = Date.now() - 7 * 86_400_000;
    const recent = candles.filter(c => c.timestamp >= sevenDaysAgo);
    const count = recent.length;
    if (count < 5) { setMode('candlestick'); return; }
    // Volume coverage: candles with actual trading activity
    const withVolume = recent.filter(c => c.volume > 0).length;
    const volumeRatio = withVolume / count;
    // Gap analysis: find max consecutive gap
    let maxGapMs = 0;
    for (let i = 1; i < recent.length; i++) {
      const g = recent[i].timestamp - recent[i - 1].timestamp;
      if (g > maxGapMs) maxGapMs = g;
    }
    const oneDayMs = 86_400_000;
    // Sparse: few candles, poor volume coverage, or a gap > 1 day in recent history
    const isSparse = count < 20 || volumeRatio < 0.3 || (count < 50 && maxGapMs > oneDayMs);
    setMode(isSparse ? 'candlestick' : 'area');
  }, [hasData, tokenMint]);

  const loadData = useCallback(async (tf: TimeFrame | 'ALL', silent = false) => {
    if (!tokenMint) { if (!silent) setLoading(false); return; }
    const myId = ++reqIdRef.current;
    if (!silent) setLoading(true);

    const loadFrame = async (frame: TimeFrame): Promise<CandleData[]> => {
      const raw = await chartDataService.getOHLCVData(tokenMint!, frame, undefined);
      if (myId !== reqIdRef.current) return [];
      return sanitizeRawCandles(raw ?? []);
    };

    try {
      if (tf === 'ALL') {
        // ALL must choose the cleanest real historical resolution, not just the first
        // response with a couple of candles. No fake candles are created here.
        const candidates: { tf: TimeFrame; candles: CandleData[] }[] = [];
        for (const candidateTf of ['1D', '4H', '1H', '15m', '5m', '1m'] as TimeFrame[]) {
          const cleaned = await loadFrame(candidateTf);
          if (myId !== reqIdRef.current) return;
          if (cleaned.length > 0) candidates.push({ tf: candidateTf, candles: cleaned });
        }

        let bestTf: TimeFrame = '1D';
        let bestCandles: CandleData[] = [];
        let bestScore = -Infinity;
        for (const candidate of candidates) {
          const score = scoreCandleSet(candidate.candles, candidate.tf);
          // Prefer readable spans and real density; avoid one-dot / two-point ALL charts.
          const countBonus = candidate.candles.length >= 20 ? 80 : candidate.candles.length >= 8 ? 35 : 0;
          const totalScore = score + countBonus;
          if (totalScore > bestScore) {
            bestScore = totalScore;
            bestTf = candidate.tf;
            bestCandles = candidate.candles;
          }
        }

        if (bestCandles.length > 0) {
          setCandles(bestCandles);
          setAllEffectiveTf(bestTf);
          setHasData(true);
        } else {
          // Keep the chart renderer alive when a quote/header price exists.
          setCandles([]);
          setHasData(false);
          if (tokenMint && resolvedPairCache.get(tokenMint) === pairAddrRef.current) {
            resolvedPairCache.delete(tokenMint);
          }
        }
        return;
      }

      // Selected timeframe: start with its own real OHLCV, then use finer real
      // candles aggregated upward when the selected timeframe is weak/empty.
      // This never aggregates downward and never fills no-trade buckets.
      const candidateSets: CandleData[][] = [];
      const framesToTry = getLowerOrEqualTimeframes(tf);
      for (const frame of framesToTry) {
        const cleaned = await loadFrame(frame);
        if (myId !== reqIdRef.current) return;
        if (cleaned.length === 0) continue;
        const normalized = frame === tf ? cleaned : aggregateCandlesToTimeframe(cleaned, tf);
        if (normalized.length > 0) candidateSets.push(normalized);
      }

      const best = chooseBestCandleSet(candidateSets, tf);
      if (best.length > 0) {
        setCandles(best);
        setHasData(true);
        const minCacheCandles = (tf === '1m' || tf === '5m' || tf === '15m') ? 5 : 3;
        const score = scoreCandleSet(best, tf);
        if (best.length >= minCacheCandles && score > 0 && pairAddrRef.current && tokenMint && !resolvedPairCache.has(tokenMint)) {
          resolvedPairCache.set(tokenMint, pairAddrRef.current);
        }
      } else {
        // No real candles found for this timeframe or finer source. Do not invent
        // history. The renderer will keep a clean last-price guide if price exists.
        setCandles([]);
        setHasData(false);
        if (tokenMint && resolvedPairCache.get(tokenMint) === pairAddrRef.current) {
          resolvedPairCache.delete(tokenMint);
        }
      }
    } catch {
      if (myId !== reqIdRef.current) return;
      if (tokenMint && resolvedPairCache.get(tokenMint) === pairAddrRef.current) {
        resolvedPairCache.delete(tokenMint);
      }
      setCandles([]);
      setHasData(false);
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
    userPannedRef.current = false;
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
      if (wsDebounceRef.current) { clearTimeout(wsDebounceRef.current); wsDebounceRef.current = null; }
      if (wsReconnectTimerRef.current) { clearTimeout(wsReconnectTimerRef.current); wsReconnectTimerRef.current = null; }
      wsRetryCountRef.current = 0;
      if (wsRef.current) {
        wsRef.current.onclose = null; wsRef.current.onerror = null;
        wsRef.current.onmessage = null;
        try { wsRef.current.close(); } catch {}
        wsRef.current = null;
      }
      setWsConnected(false);
    };
  }, [resolvedPairAddr]);

  // REST price backup — 10s interval. Only updates if newer than last accepted price.
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
          // Jupiter REST is a quote-only price — not a real trade event.
          if (jupPrice > 0) { applyLivePrice(jupPrice, startTs, false); return; }
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
        // DexScreener REST is a quote-only price — not a real trade event.
        if (p > 0) applyLivePrice(p, startTs, false);
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
    // External price from parent is a snapshot/API value — not a real trade event.
    applyLivePrice(externalPrice, Date.now() - 2000, false);
  }, [resolvedInfo?.price, applyLivePrice]);

  // liveTokenStore subscription — pushed by other parts of the app.
  // fromStoreRef prevents applyLivePrice from pushing right back into the store.
  useEffect(() => {
    if (!tokenMint) return;
    const unsub = liveTokenStore.watch(tokenMint, (state) => {
      if (state.price > 0) {
        fromStoreRef.current = true;
        applyLivePrice(state.price, state.lastUpdatedAt, false);
        fromStoreRef.current = false;
      }
      // Capture 24h change from store — refreshed every 30s by DexScreener polls.
      if (state.priceChange24h !== 0) {
        setLive24hChange(state.priceChange24h);
      }
    });
    return unsub;
  }, [tokenMint, applyLivePrice]);

  // Supabase realtime subscription for confirmed on-chain trade candles.
  //
  // Source integrity rules enforced here:
  //  1. Only token_candles rows with is_live=true are treated as real trades.
  //     Historical/seeded candles (is_live=false) are silently discarded so they
  //     never create an activeLiveCandle or trigger the pulse animation.
  //  2. Only 1-minute timeframe rows are accepted — finest granularity, written by
  //     Helius WS ingestion; other timeframes are aggregated and not real-time signals.
  //  3. close must be > 0; token_mint is already scoped by the channel filter.
  //  4. Timestamp must fall in a sane range (post-2020, not >24 h in the future).
  //  5. volume is forwarded as-is (may be 0 for dust trades); never invented.
  //  6. signature / side / is_buy are forwarded when the row carries them.
  useEffect(() => {
    if (!tokenMint) return;
    const channel = supabase
      .channel(`chart_trades_${tokenMint.slice(0, 8)}`)
      .on(
        'postgres_changes' as any,
        {
          event: '*',
          schema: 'public',
          table: 'token_candles',
          filter: `token_mint=eq.${tokenMint}`,
        },
        (payload: any) => {
          const row = payload.new;
          if (!row || !row.close || !row.open_time) return;

          // ── Source integrity gate ─────────────────────────────────────────
          // is_live=true is written exclusively by the Helius WS ingestion pipeline.
          // Seeded/historical candles always have is_live=false; reject them here so
          // an INSERT/UPDATE of old data never creates a fake activeLiveCandle.
          if (row.is_live !== true) return;

          // Only 1-minute rows carry trade-level precision.
          if (row.timeframe !== '1m') return;

          const price = parseFloat(row.close);
          if (!(price > 0)) return;

          // Normalize: Helius may write open_time as Unix seconds (10 digits) or ms (13 digits).
          const rawTs = Number(row.open_time);
          const normTs = rawTs < 10_000_000_000 ? rawTs * 1000 : rawTs;
          // Reject timestamps that are clearly wrong: too old (before 2020) or in the future.
          const now = Date.now();
          if (!isFinite(normTs) || normTs < 1_577_836_800_000 || normTs > now + 86_400_000) return;

          // Volume: accept real value or 0 — never invent a non-zero volume.
          const rawVol = row.volume != null ? parseFloat(row.volume) : 0;
          const tradeVolume = isFinite(rawVol) && rawVol >= 0 ? rawVol : 0;

          applyLivePrice(price, normTs, true, {
            source:      'supabase-token-candles',
            tradeVolume,
            // Forward signature / side when present in the row.
            ...(row.signature ? { signature: String(row.signature) } : {}),
            ...(row.is_buy != null ? { side: row.is_buy ? 'buy' : 'sell' } : {}),
          });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tokenMint, applyLivePrice]);

  // Auto-scroll: when data loads but all candles are before the visible window,
  // pan back so the last real candle is visible near the right edge.
  useEffect(() => {
    if (timeframe === 'ALL') return;
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
    if (timeframe === 'ALL') return;
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
  // MCAP scale: token supply frozen once per token so MCAP never drifts with quote prices.
  // Priority: 1) real totalSupply from caller  2) derived snapshot  3) live-price derivation.
  // All display surfaces (header, axis, live pill, crosshair) multiply by the same supply.
  {
    if (stableSupplyRef.current === null) {
      const ts = resolvedInfo?.totalSupply;
      const sp = resolvedInfo?.price;
      const sm = resolvedInfo?.marketCap;
      if (ts && ts > 0) {
        // Prefer real supply provided by caller — no division, no drift.
        stableSupplyRef.current = ts;
      } else if (sp && sp > 0 && sm && sm > 0) {
        // Derive supply from snapshot marketCap / snapshot price (consistent snapshot).
        stableSupplyRef.current = sm / sp;
      } else if (livePrice && livePrice > 0 && sm && sm > 0) {
        // Backup only: use live quote price — only when snapshot price unavailable.
        stableSupplyRef.current = sm / livePrice;
      }
    }
  }
  const mcapScale = valueMode === 'mcap' && stableSupplyRef.current != null
    ? stableSupplyRef.current
    : 1;

  const plotW = chartWidth - PAD.left - PAD.right;
  plotWRef.current = plotW;
  const plotH = CHART_H - PAD.top - PAD.bottom;
  const plotHRef = useRef(plotH);
  plotHRef.current = plotH;

  // ── Live time geometry ────────────────────────────────────────────────────
  // ALL mode: use the resolution that was actually fetched (allEffectiveTf),
  // not the hardcoded BUCKET_MS['ALL'] = 1D. Without this fix, 1H candles
  // all collapse to the same x-position (12h offset each), creating vertical walls.
  const bucketMs       = timeframe === 'ALL'
    ? (BUCKET_MS[allEffectiveTf] ?? 3_600_000)
    : (BUCKET_MS[timeframe] ?? 3_600_000);
  const visibleBuckets = VISIBLE_BUCKETS[timeframe] ?? 48;
  const scrollOffsetMs = panOffsetCandles * bucketMs;
  const rightTime      = rightTimeRef.current - scrollOffsetMs;
  const visibleMs      = visibleBuckets * bucketMs;
  const leftTime       = rightTime - visibleMs;
  bucketMsRef.current  = bucketMs;

  // Merge real historical candles + active live candle at render time.
  // Real candles are immutable; only the active live candle updates on price change.
  const mergedCandles = useMemo(() => {
    // `candles` state is always produced by sanitizeRawCandles inside loadData —
    // applying filterValidCandles a second time would create two competing validation
    // systems and could silently reject valid flat-doji candles (open=high=low=close).
    // Single validation pass: use candles directly.
    const deduped = dedupByBucket(candles, bucketMs);
    if (!activeLiveCandle) return deduped;
    const liveB = Math.floor(activeLiveCandle.timestamp / bucketMs) * bucketMs;
    // Remove any historical candle in the same bucket (live price owns that bucket)
    const withoutSameBucket = deduped.filter(
      c => Math.floor(c.timestamp / bucketMs) * bucketMs !== liveB
    );
    return [...withoutSameBucket, activeLiveCandle].sort((a, b) => a.timestamp - b.timestamp);
  }, [candles, activeLiveCandle, bucketMs]);

  // Filter to the visible time window — auto-scroll handles the case where all
  // candles are older than the window by panning back automatically.
  // For live mode (no pan): if the standard window yields too few real candles,
  // expand backward to include recent historical context so the chart stays readable.
  const MIN_LIVE_CANDLES = 6;
  let filledRaw: CandleData[];
  {
    if (timeframe === 'ALL') {
      // ALL mode: show every candle in history — the adaptive x-range below will
      // fit the full span without constraining to the standard visibleMs window.
      filledRaw = mergedCandles;
    } else {
      const standardRaw = mergedCandles.filter(c =>
        c.timestamp >= leftTime - bucketMs && c.timestamp <= rightTime + bucketMs
      );
      if (panOffsetCandles === 0 && standardRaw.length < MIN_LIVE_CANDLES && mergedCandles.length > 0) {
        // Few candles in the live window — include recent historical context.
        // When the last merged candle is old (> 3 buckets ago), cap the takeCount to
        // avoid pulling in too much history and creating a huge leftward expansion.
        const lastMergedTs = mergedCandles[mergedCandles.length - 1].timestamp;
        const isOldData = (rightTime - lastMergedTs) > bucketMs * 3;
        const maxTake = isOldData
          ? Math.min(Math.max(MIN_LIVE_CANDLES * 2, Math.floor(visibleBuckets * 0.4)), mergedCandles.length)
          : Math.min(visibleBuckets, mergedCandles.length);
        const takeCount = Math.min(maxTake, mergedCandles.length);
        filledRaw = mergedCandles.slice(-takeCount);
      } else {
        filledRaw = standardRaw;
      }
    }
  }

  // Apply MCAP scale for rendering.
  // When a token has a valid live/snapshot price but no OHLCV candles on the selected
  // timeframe, keep the chart usable by drawing a zero-volume visual price guide.
  // This is display-only spacing: it is not saved to state, not treated as a trade,
  // not counted as volume, and not used as historical activity.
  const renderGuidePrice = activeLiveCandle?.sourceType === 'realTrade'
    ? activeLiveCandle.close
    : mergedCandles.length > 0
      ? mergedCandles[mergedCandles.length - 1].close
      : livePrice && livePrice > 0
        ? livePrice
        : currentPrice && currentPrice > 0
          ? currentPrice
          : resolvedInfo?.price && resolvedInfo.price > 0
            ? resolvedInfo.price
            : 0;

  const hasRealRenderCandles = filledRaw.length > 0;
  const visualGuideRaw: CandleData[] = !hasRealRenderCandles && renderGuidePrice > 0
    ? [
        {
          timestamp: rightTime - Math.max(visibleMs * 0.82, bucketMs * 6),
          open: renderGuidePrice,
          high: renderGuidePrice,
          low: renderGuidePrice,
          close: renderGuidePrice,
          volume: 0,
        },
        {
          timestamp: rightTime - Math.max(visibleMs * 0.08, bucketMs * 1),
          open: renderGuidePrice,
          high: renderGuidePrice,
          low: renderGuidePrice,
          close: renderGuidePrice,
          volume: 0,
        },
      ]
    : [];

  const renderRaw = hasRealRenderCandles ? filledRaw : visualGuideRaw;

  const displayCandles = mcapScale !== 1
    ? renderRaw.map(c => ({
        ...c,
        open:  c.open  * mcapScale,
        high:  c.high  * mcapScale,
        low:   c.low   * mcapScale,
        close: c.close * mcapScale,
      }))
    : renderRaw;

  const isVisualGuideOnly = !hasRealRenderCandles && visualGuideRaw.length > 0;

  displayCandlesRef.current = displayCandles;
  const n = displayCandles.length;

  // ── Adaptive x-range ─────────────────────────────────────────────────────
  let xLeft      = leftTime;
  let xVisibleMs = visibleMs;
  if (displayCandles.length > 0) {
    const firstDataTs = displayCandles[0].timestamp;
    const lastDataTs  = displayCandles[displayCandles.length - 1].timestamp;

    if (isVisualGuideOnly) {
      // The guide already spans a readable part of the live window. Keep the normal
      // viewport so the line fills the container instead of becoming a tiny middle segment.
      xLeft = leftTime;
      xVisibleMs = visibleMs;
    } else if (timeframe === 'ALL') {
      // ALL mode: fit the x-axis to the actual data span.
      // Never extend to current time — that creates huge blank right space.
      const dataSpan = Math.max(lastDataTs - firstDataTs, bucketMs);
      const leftPad  = bucketMs * 1.5;
      const rightPad = Math.max(bucketMs * 1.5, dataSpan * 0.04);
      xLeft      = firstDataTs - leftPad;
      xVisibleMs = Math.max(dataSpan + leftPad + rightPad, bucketMs * 8);
    } else {
      // Non-ALL: standard window with smart capping of empty right-side dead space.
      // A "future context" of 1-2 buckets is shown to the right of the last real candle.
      const futureCtx = Math.min(6, Math.floor(visibleBuckets * 0.15)) * bucketMs;
      const gapToNow  = rightTime - lastDataTs;
      // Always adapt when data is sparse (<15 candles) to prevent a single candle
      // being stretched across the entire wide default window.
      const isSparse = displayCandles.length < 15;
      const isUltraSparseReal = !isVisualGuideOnly && displayCandles.length <= 2;
      const shouldAdapt = panOffsetCandles === 0 &&
        (isSparse ||
          firstDataTs > leftTime + visibleMs * 0.35 ||
          firstDataTs < leftTime ||
          gapToNow > futureCtx * 4);
      if (shouldAdapt) {
        if (isUltraSparseReal) {
          // 1-2 real candles: keep a stable readable full-width window around the candle(s).
          // No fake candles are added; this only controls display spacing.
          const centerTs = displayCandles.length === 1 ? firstDataTs : (firstDataTs + lastDataTs) / 2;
          xVisibleMs = Math.max(visibleMs, bucketMs * Math.max(visibleBuckets, 24));
          xLeft = centerTs - xVisibleMs * 0.55;
        } else {
          xLeft = firstDataTs - bucketMs * 2;
          // Cap right side: no more than a small padding past last real candle when no live trade.
          // For sparse tokens use a tight 2-bucket padding to avoid dead right space.
          // This eliminates the wide blank right side for 1M/1W/1D tokens with few candles.
          const cappedRight = (gapToNow > futureCtx && !activeLiveCandle)
            ? lastDataTs + (isSparse
                ? bucketMs * 2
                : Math.min(futureCtx, gapToNow * 0.25))
            : rightTime;
          xVisibleMs = Math.max(cappedRight - xLeft, bucketMs * 4);
        }
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
    // Restrict to visible window for scale computation — use xLeft (post-adjustment)
    // so the Y scale matches exactly what is rendered, not the wider raw time window.
    const visibleOnly = displayCandles.filter(
      c => c.timestamp >= xLeft && c.timestamp <= rightTime
    );
    const scaleBase   = visibleOnly.length > 0 ? visibleOnly : displayCandles;
    // Real candles (volume > 0) take priority for scale; zero-volume live/visual guide candles expands it
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
      // Very sparse tokens (<5 visible candles) need a minimum 4% padding so the
      // Y-axis never collapses to an unreadable ultra-tight band (e.g. $5.370K–$5.390K).
      // This places the candle(s) at the vertical center with meaningful axis labels.
      const minPadFraction = scaleSource.length < 5 ? 0.04 : 0;
      const pad = Math.max(range * 0.15, safeMax * minPadFraction);
      // Volume scale from visible real candles only; zero-volume entries ignored
      const realVols   = scaleBase.filter(c => c.volume > 0).map(c => c.volume);
      const sortedVols = [...realVols].sort((a, b) => a - b);
      const p90idx     = Math.min(Math.floor(sortedVols.length * 0.9), sortedVols.length - 1);
      const cappedVol  = sortedVols.length > 0 ? Math.max(sortedVols[p90idx] * 1.5, 1) : 1;
      // Use a tight scale: start just below the lowest visible candle.
      // Only force minP=0 when data goes near 0 (bottom < 10% of top),
      // preventing the "scaled from $0 to huge value" axis artifact.
      const tightMin     = safeMin - pad;
      const includeZero  = tightMin < 0 || safeMin < safeMax * 0.08;
      const safeMinP     = includeZero ? Math.max(0, tightMin) : tightMin;
      priceScaleRef.current = {
        maxP:       safeMax + pad,
        minP:       safeMinP,
        priceRange: (safeMax + pad) - safeMinP || 1,
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
  // slotW: pixel-width of one candle slot.
  // For ALL mode we base it on the actual candle count so candles don't collide.
  // For other modes we use the target density (visibleBuckets) to keep widths stable.
  const effectiveBuckets = (timeframe === 'ALL' && n > visibleBuckets) ? n : visibleBuckets;
  const slotW = plotW / effectiveBuckets;
  const MAX_CANDLE_W = isMobile ? 14 : 10;
  const MAX_BAR_W    = isMobile ?  6 :  5;
  // Body/tick widths derived from slotW so they never widen due to sparse data
  // Very sparse tokens (1-4 candles): use wider bodies so isolated candles are readable.
  const _vSparse = n > 0 && n < 5;
  const barW    = Math.min(MAX_BAR_W,    Math.max(isMobile ? 2 : 1.5, slotW * (_vSparse ? 0.55 : 0.38)));
  const candleW = Math.min(MAX_CANDLE_W, Math.max(isMobile ? (_vSparse ? 6 : 3) : (_vSparse ? 5 : 2), slotW * (isMobile ? (_vSparse ? 0.80 : 0.60) : (_vSparse ? 0.70 : 0.55))));

  function xOf(i: number): number {
    const c = displayCandles[i];
    if (!c) return PAD.left + (i + 0.5) * (plotW / Math.max(n, 1));
    return tsToX(c.timestamp + bucketMs / 2);
  }
  function yOf(price: number) {
    const raw = PAD.top + plotH - ((price - minP) / priceRange) * plotH;
    return Math.max(PAD.top, Math.min(PAD.top + plotH, raw));
  }
  function volBarH(vol: number): number {
    if (vol <= 0 || !isFinite(vol) || maxVol <= 0) return 0;
    const h = (vol / maxVol) * (VOL_H - 6);
    // No hard minimum — micro-volume proportionally tiny (< 0.3px) renders as nothing.
    // Only apply 1px floor once the bar is visually meaningful (≥0.3px proportional height).
    return h < 0.3 ? 0 : Math.max(1, h);
  }

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
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,

      onPanResponderGrant: (e) => {
        panStartOffsetRef.current = panOffsetRef.current;
        gestureModeRef.current    = 'idle';
        touchStartXRef.current    = e.nativeEvent.pageX;
        touchStartYRef.current    = e.nativeEvent.pageY;
        touchStartTimeRef.current = Date.now();
        // Show crosshair immediately on touch so the user can inspect any point on the chart.
        applyTouchToCrosshair(e.nativeEvent.pageX, e.nativeEvent.pageY);
      },

      onPanResponderMove: (e, gestureState) => {
        const adx     = Math.abs(gestureState.dx);
        const ady     = Math.abs(gestureState.dy);
        const elapsed = Date.now() - touchStartTimeRef.current;

        if (gestureModeRef.current === 'idle') {
          if (adx > 14 && adx > ady * 1.6) {
            gestureModeRef.current = 'pan';
            setCrosshair(null);
          } else {
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
          userPannedRef.current = true;
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
  const mcapVal = resolvedInfo?.marketCap ?? null;
  // 24h change: prefer live value from store (refreshed every 30s); fall back to snapshot.
  // Validate: reject values outside ±999% as they indicate stale/bad data from the source.
  // Show "—" when neither source has a real non-zero validated value.
  const raw24h  = resolvedInfo?.priceChange24h;
  const is24hValid = (v: number | null | undefined): v is number =>
    v !== null && v !== undefined && isFinite(v) && Math.abs(v) <= 999;
  const change24h = is24hValid(live24hChange) ? live24hChange
    : is24hValid(raw24h) ? raw24h : 0;
  const has24h = is24hValid(live24hChange) || (is24hValid(raw24h) && raw24h !== 0);
  const isUp       = change24h >= 0;
  const changeColor = isUp ? '#10B981' : '#EC4899';
  // Guide-anchored price: same source as the chart guide line.
  // In MCAP mode the header uses this so header and guide never contradict each other.
  // In price mode the header uses the live quote price (quote display is acceptable).
  const realAnchoredPrice = activeLiveCandle?.sourceType === 'realTrade'
    ? activeLiveCandle.close
    : latestClose > 0 ? latestClose : displayPriceVal;
  // MCAP mode: multiply real candle price by stable supply (same as guide + axis).
  // Price mode: show live quote price directly.
  const liveScaledValue = valueMode === 'mcap'
    ? realAnchoredPrice * mcapScale
    : displayPriceVal;
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
              <Animated.View style={[styles.liveWsDot, { transform: [{ scale: headerPulseAnim }] }]} />
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
            {has24h ? (
              <>
                {isUp
                  ? <TrendingUp  size={11} color={changeColor} strokeWidth={2.5} />
                  : <TrendingDown size={11} color={changeColor} strokeWidth={2.5} />}
                <Text style={[styles.tokenChangePct, { color: changeColor }]}>
                  {isUp ? '+' : ''}{change24h.toFixed(2)}%
                </Text>
              </>
            ) : (
              <Text style={[styles.tokenChangePct, { color: 'rgba(255,255,255,0.3)' }]}>—</Text>
            )}
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
                onPress={() => { userSelectedModeRef.current = true; setMode(m.key); setShowModePanel(false); }}
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
  const isFirstLoad = ((loading && candles.length === 0 && displayPriceVal <= 0) || autoScrollPending);

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

  if (!hasData && candles.length === 0 && displayPriceVal <= 0) {
    return (
      <View style={styles.container}>
        {header}
        <View style={[styles.unavailableWrap, { height: CHART_H }]}>
          {displayPriceVal > 0 ? (
            <>
              <Text style={styles.priceFallback}>{fmtValue(displayPriceVal * mcapScale, valueMode)}</Text>
              <Text style={styles.unavailableText}>Price unavailable</Text>
            </>
          ) : (
            <Text style={styles.unavailableText}>Chart temporarily unavailable</Text>
          )}
        </View>
      </View>
    );
  }

  if (n === 0 && displayPriceVal <= 0) {
    return (
      <View style={styles.container}>
        {header}
        <View style={[styles.unavailableWrap, { height: CHART_H }]}>
          {displayPriceVal > 0 ? (
            <>
              <Text style={styles.priceFallback}>{fmtValue(displayPriceVal * mcapScale, valueMode)}</Text>
              <Text style={styles.unavailableText}>Loading price…</Text>
            </>
          ) : (
            <ActivityIndicator size="small" color={colors.primary} />
          )}
        </View>
      </View>
    );
  }

  // ── Sparse detection (render-level) ──────────────────────────────────────
  // Computed before segment-building and continuation check so both can use it.
  const _renderSortedGaps = displayCandles
    .slice(1).map((c, i) => c.timestamp - displayCandles[i].timestamp)
    .sort((a, b) => a - b);
  const renderMedianGapMs = _renderSortedGaps.length > 0
    ? _renderSortedGaps[Math.floor(_renderSortedGaps.length / 2)]
    : bucketMs;
  // Flat-doji ratio: repaired candles often have open=high=low=close.
  // A high ratio means most data was repaired/flat — treat as sparse.
  const _flatCount = displayCandles.filter(c =>
    Math.abs(c.high - c.low) < Math.max(c.close, 1e-12) * 1e-6
  ).length;
  const _flatRatio = displayCandles.length > 0 ? _flatCount / displayCandles.length : 0;
  // Sparse when: few candles, wide gaps, OR >50% flat dojis (repaired data).
  const isSparseChart = displayCandles.length < 30 ||
    renderMedianGapMs > bucketMs * 2 ||
    _flatRatio > 0.5;
  // Extremely sparse: 1-4 visible candles — enables extra-visible rendering paths.
  const isVerySparse = n < 5;

  // ── Build paths ───────────────────────────────────────────────────────────
  const bottomY    = (PAD.top + plotH).toFixed(1);
  const plotRightX = PAD.left + plotW;
  const safeRightX = plotRightX - 4;
  const lastCandleX = xOf(n - 1);
  const lastCandleY = yOf(displayCandles[n - 1].close);
  const lastX = Math.min(lastCandleX, safeRightX);
  const lastY = lastCandleY;

  // Continuation: short dashed segment from last close → now, max 1.5 buckets.
  // Disabled for: ALL mode, cold/sparse tokens (last trade > 3 buckets old), panned view.
  // Never creates a fake flat bridge or a vertical wall at the right edge.
  const maxContExtension = bucketMs * 1.5;
  const lastCandleTs     = displayCandles[n - 1].timestamp;
  const lastCandleAgeMs  = rightTime - lastCandleTs;
  const isHotToken       = lastCandleAgeMs <= bucketMs * 3; // "cold" token = no recent trades
  const contEndTs        = Math.min(rightTime, lastCandleTs + maxContExtension);
  const contRightX       = Math.min(tsToX(contEndTs), safeRightX);
  const contY            = lastY;
  // Extra guards: last candle must have real volume;
  // sparse tokens show no continuation to avoid fake flat bridges.
  const lastCandleVolume = n > 0 ? displayCandles[n - 1].volume : 0;
  const showContinuation = timeframe !== 'ALL' && panOffsetCandles === 0 &&
    n > 0 && isHotToken && !isSparseChart &&
    lastCandleVolume > 0 && contRightX > lastX + 2;

  // Gap-aware segment builder.
  // Sparse tokens: break on any gap > 1.2 buckets to prevent fake flat bridges.
  // Dense tokens: allow gaps up to 2.5 buckets (covers weekends, missing data).
  // isSparseChart is computed above in the "Sparse detection" section.
  const GAP_THRESHOLD_MS = isSparseChart ? bucketMs * 1.2 : bucketMs * 2.5;
  const gapSegments: number[][] = [];
  {
    let seg: number[] = [];
    for (let i = 0; i < displayCandles.length; i++) {
      if (i > 0 && (displayCandles[i].timestamp - displayCandles[i - 1].timestamp) > GAP_THRESHOLD_MS) {
        if (seg.length > 0) gapSegments.push(seg);
        seg = [i];
      } else {
        seg.push(i);
      }
    }
    if (seg.length > 0) gapSegments.push(seg);
  }

  // Gap-aware stroke path (M at each segment start, L within segments)
  const linePts = gapSegments.map(seg =>
    seg.map((idx, j) => {
      const x = xOf(idx).toFixed(1);
      const y = yOf(displayCandles[idx].close).toFixed(1);
      return `${j === 0 ? 'M' : 'L'}${x},${y}`;
    }).join(' ')
  ).join(' ');

  const lineHasDrawableSegment = gapSegments.some(seg => seg.length >= 2);
  const lastPriceGuidePath = `M${PAD.left.toFixed(1)},${lastY.toFixed(1)} L${safeRightX.toFixed(1)},${lastY.toFixed(1)}`;
  // Line-style modes need a drawable path even when there is only one real candle.
  // Use a horizontal visual last-price guide; it is not a fake candle/trade/volume.
  const strokePath = lineHasDrawableSegment ? linePts : lastPriceGuidePath;

  // Per-segment area fill paths (each segment closes its own polygon to avoid fill bridging).
  // Single-point segments are skipped — they would produce a vertical wall at the baseline.
  // The fill always ends at the last real candle's x position; the dashed continuation
  // line is drawn separately and must NOT extend the fill (would create a fake "wall").
  const areaPaths: string[] = gapSegments.map((seg) => {
    if (seg.length < 2) return '';
    // Sparse tokens: never fill segments with fewer than 6 candles — they produce
    // tiny coloured blocks or stretched rectangles that look fake.
    if (isSparseChart && seg.length < 6) return '';
    // Dense tokens: also suppress wide segments with too few points (same old rule).
    const segW = xOf(seg[seg.length - 1]) - xOf(seg[0]);
    if (segW / plotW > 0.25 && seg.length < 6) return '';
    const firstX = xOf(seg[0]).toFixed(1);
    const linePart = seg.map((idx, j) => {
      const x = xOf(idx).toFixed(1);
      const y = yOf(displayCandles[idx].close).toFixed(1);
      return `${j === 0 ? 'M' : 'L'}${x},${y}`;
    }).join(' ');
    const lastIdx = seg[seg.length - 1];
    const lastYStr = yOf(displayCandles[lastIdx].close).toFixed(1);
    // Always close at the actual last candle — never extend to contRightX.
    // The dashed continuation line is rendered separately outside this fill polygon.
    const segRightX = xOf(lastIdx).toFixed(1);
    return `${linePart} L${segRightX},${lastYStr} L${segRightX},${bottomY} L${firstX},${bottomY} Z`;
  });

  // ── Smart grid: use "nice" steps to avoid duplicate rounded labels ─────────
  // Computes up to `gridCount` evenly-spaced price levels using a "round number" step
  // (nearest 1/2/5 × 10^n), then formats with enough decimal places so no two labels
  // show the same rounded string.
  function buildGridLines(lo: number, hi: number, gridCount: number) {
    const range = hi - lo;
    if (range <= 0 || !isFinite(range)) return [];
    const rawStep = range / (gridCount - 1);
    const exp     = Math.floor(Math.log10(rawStep));
    const m       = rawStep / Math.pow(10, exp);
    const niceM   = m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10;
    const step    = niceM * Math.pow(10, exp);
    const start   = Math.ceil(lo / step) * step;
    const levels: { price: number; y: number; label: string }[] = [];
    const seen    = new Set<string>();

    const fmt = (v: number): string => {
      if (valueMode !== 'mcap') return `$${fmtPrice(v)}`;
      // Relative range: small ratio → need more decimal places to distinguish labels
      const relRange = range / Math.max(Math.abs(hi), 1);
      if (v >= 1e9) return `$${(v / 1e9).toFixed(relRange < 0.02 ? 3 : relRange < 0.06 ? 2 : 1)}B`;
      if (v >= 1e6) return `$${(v / 1e6).toFixed(relRange < 0.02 ? 3 : relRange < 0.06 ? 2 : 1)}M`;
      if (v >= 1e3) return `$${(v / 1e3).toFixed(relRange < 0.02 ? 3 : relRange < 0.08 ? 2 : 1)}K`;
      return `$${v.toFixed(relRange < 0.05 ? 4 : 2)}`;
    };

    for (let p = start; p <= hi + step * 0.01 && levels.length < gridCount + 2; p += step) {
      if (p < lo - step * 0.01) continue;
      const label = fmt(p);
      if (seen.has(label)) continue;
      seen.add(label);
      levels.push({ price: p, y: yOf(p), label });
    }
    return levels;
  }
  const priceGridLines = buildGridLines(minP, maxP, 6);

  // Time labels — always spaced by a "nice" human-readable interval derived from
  // the actual visible time window (xVisibleMs), not from bucketMs × visibleBuckets.
  // This ensures the axis looks clean even when the adaptive x-range has expanded
  // or contracted the window for sparse tokens.
  function niceTimeStepMs(targetMs: number): number {
    const steps = [
      60_000, 2*60_000, 5*60_000, 10*60_000, 15*60_000, 30*60_000,
      3_600_000, 2*3_600_000, 4*3_600_000, 6*3_600_000, 12*3_600_000,
      86_400_000, 2*86_400_000, 7*86_400_000, 14*86_400_000,
      30*86_400_000, 90*86_400_000,
    ];
    for (const s of steps) {
      if (s >= targetMs * 0.75) return s;
    }
    return steps[steps.length - 1];
  }
  const timeLabelStepMs = niceTimeStepMs(xVisibleMs / 5);
  const firstLabelTs    = Math.ceil(xLeft / timeLabelStepMs) * timeLabelStepMs;
  const timeLabels: { ts: number; x: number; label: string }[] = [];
  const timeLabelRight  = xLeft + xVisibleMs + timeLabelStepMs * 0.01;
  const seenTimeLabels  = new Set<string>();
  for (let ts = firstLabelTs; ts <= timeLabelRight; ts += timeLabelStepMs) {
    const x = tsToX(ts);
    if (x >= PAD.left + 10 && x <= chartWidth - PAD.right - 8) {
      const label = fmtTimeByStep(ts, timeLabelStepMs);
      if (!seenTimeLabels.has(label)) {
        seenTimeLabels.add(label);
        timeLabels.push({ ts, x, label });
      }
    }
  }

  // Guide line: anchored to real candle data so it never contradicts candle closes.
  // Quote-only sources (DexScreener WS, Jupiter REST) update the header freely but must
  // not move the guide line — that would create a detached Y position with no matching candle.
  // Rule: guide uses activeLiveCandle only when it carries sourceType='realTrade' (confirmed trade).
  const realChartClose =
    activeLiveCandle?.sourceType === 'realTrade'
      ? activeLiveCandle.close
      : (mergedCandles.length > 0 ? mergedCandles[mergedCandles.length - 1].close : renderGuidePrice);
  const scaledGuidePrice = realChartClose > 0 ? realChartClose * mcapScale : 0;
  const scaledLivePrice  = liveScaledValue; // header/display only — can include quote prices
  const clampedGuide = scaledGuidePrice > maxP ? maxP : scaledGuidePrice < minP ? minP : scaledGuidePrice;
  const currentY     = Math.max(PAD.top + 2, Math.min(PAD.top + plotH - 2, yOf(clampedGuide)));

  // History start indicator
  const historyOldestTs   = candles.length > 0 ? candles[0].timestamp : Date.now();
  const historyMsToOldest = Math.max(0, Date.now() - historyOldestTs);
  const historyMaxPanBack = candles.length > 0
    ? Math.max(0, Math.floor(historyMsToOldest / bucketMs) - visibleBuckets + 2) : 0;
  const atHistoryStart = timeframe !== 'ALL' && historyMaxPanBack > 0 && panOffsetCandles >= historyMaxPanBack - 1;

  return (
    <View style={styles.container}>
      {header}

      {crosshair && (
        <View style={styles.crosshairBar}>
          <Text style={styles.crosshairDate}>{fmtDateTime(crosshair.ts)}</Text>
          <Text style={styles.crosshairPrice}>{fmtValue(crosshair.price, valueMode)}</Text>
          <Text style={[styles.crosshairPct, { color: (crosshair.pct ?? 0) >= 0 ? '#10B981' : '#EC4899' }]}>
            {(crosshair.pct ?? 0) >= 0 ? '+' : ''}{crosshair.pct?.toFixed(2)}%{' '}
            <Text style={styles.crosshairPctRange}>range</Text>
          </Text>
          <TouchableOpacity onPress={dismissCrosshair} style={styles.crosshairClose}>
            <Text style={styles.crosshairCloseText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {panOffsetCandles > 0 && userPannedRef.current && (
        <TouchableOpacity
          style={styles.returnLiveBtn}
          onPress={() => {
            rightTimeRef.current = Date.now();
            panOffsetRef.current = 0;
            setPanOffsetCandles(0);
            setCrosshair(null);
            userPannedRef.current = false;
            priceScaleKeyRef.current = '';
          }}
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
                <Stop offset="0%"   stopColor="#06B6D4" stopOpacity="0.45" />
                <Stop offset="60%"  stopColor="#06B6D4" stopOpacity="0.1" />
                <Stop offset="100%" stopColor="#06B6D4" stopOpacity="0" />
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
            {priceGridLines.map(({ y, label }, i) => (
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
                  {label}
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
                  {areaPaths.map((p, i) => p ? <Path key={`af${i}`} d={p} fill="url(#areaGrad)" /> : null)}
                  <Path d={strokePath} stroke="rgba(139,92,246,0.25)" strokeWidth={isSparseChart ? 7 : 5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  <Path d={strokePath} stroke="#A78BFA" strokeWidth={isSparseChart ? 2.5 : 2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </>
              )}

              {mode === 'line' && (
                <>
                  <Path d={strokePath} stroke="rgba(139,92,246,0.18)" strokeWidth={isSparseChart ? 7 : 5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  <Path d={strokePath} stroke="#A78BFA" strokeWidth={isSparseChart ? 2.5 : 2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </>
              )}

              {mode === 'mountain' && (
                <>
                  {areaPaths.map((p, i) => p ? <Path key={`mf${i}`} d={p} fill="url(#mountainGrad)" /> : null)}
                  <Path d={strokePath} stroke="rgba(139,92,246,0.2)" strokeWidth={isSparseChart ? 7 : 5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  <Path d={strokePath} stroke="#8B5CF6" strokeWidth={isSparseChart ? 3 : 2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </>
              )}

              {mode === 'bonding' && (
                <>
                  {areaPaths.map((p, i) => p ? <Path key={`bf${i}`} d={p} fill="url(#bondingGrad)" /> : null)}
                  <Path d={strokePath} stroke="rgba(6,182,212,0.18)" strokeWidth={7} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  <Path d={strokePath} stroke="#06B6D4" strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </>
              )}

              {/* Isolated single-candle dots for sparse gaps — otherwise area/line paths
                  produce invisible bare M x,y moves for 1-point segments */}
              {(mode === 'area' || mode === 'line' || mode === 'mountain' || mode === 'bonding') &&
                gapSegments
                  .filter(seg => seg.length === 1)
                  .map(seg => {
                    const idx = seg[0];
                    const c = displayCandles[idx];
                    const cx = xOf(idx);
                    const cy = yOf(c.close);
                    // Very sparse (1-4 candles): use a larger, more prominent marker
                    // so a single data point never looks like an invisible tiny dot.
                    const outerR = isVerySparse ? 12 : 5;
                    const innerR = isVerySparse ? 5  : 3;
                    const outerOpacity = isVerySparse ? 0.14 : 0.18;
                    return (
                      <G key={`isol${c.timestamp}`}>
                        {/* Outer glow ring */}
                        <Circle cx={cx} cy={cy} r={outerR} fill="#8B5CF6" opacity={outerOpacity} />
                        {/* Middle halo */}
                        {isVerySparse && <Circle cx={cx} cy={cy} r={8} fill="#8B5CF6" opacity={0.09} />}
                        {/* Solid inner dot */}
                        <Circle cx={cx} cy={cy} r={innerR} fill="#A78BFA" />
                      </G>
                    );
                  })
              }

              {mode === 'bar' && displayCandles.map((c, i) => {
                const up  = c.close >= c.open;
                const col = up ? '#10B981' : '#EC4899';
                // barW is already capped by MAX_BAR_W — use it directly for tick length
                const cx  = Math.min(xOf(i), safeRightX - barW);
                const yH  = yOf(c.high);
                const yL  = yOf(c.low);
                const yO  = yOf(c.open);
                const yC  = yOf(c.close);
                return (
                  <G key={`bar${c.timestamp}`}>
                    {/* Thin vertical high-low spine */}
                    <Line x1={cx} y1={yH} x2={cx} y2={yL} stroke={col} strokeWidth={1} />
                    {/* Open tick — left side, pointing left */}
                    <Line x1={cx - barW} y1={yO} x2={cx} y2={yO} stroke={col} strokeWidth={1} />
                    {/* Close tick — right side, pointing right */}
                    <Line x1={cx} y1={yC} x2={cx + barW} y2={yC} stroke={col} strokeWidth={1} />
                  </G>
                );
              })}

              {mode === 'candlestick' && displayCandles.map((c, i) => {
                const up      = c.close >= c.open;
                const col     = up ? '#10B981' : '#EC4899';
                const fillCol = up ? '#10B981' : '#EC4899';
                // Wick is always 1px — never thicker than the candle body
                const wickW   = 1;
                // Clamp center so body right edge never exceeds safeRightX
                const cx      = Math.min(xOf(i), safeRightX - candleW / 2);
                const bodyTop = yOf(Math.max(c.open, c.close));
                const bodyBot = yOf(Math.min(c.open, c.close));
                const rawH    = bodyBot - bodyTop;
                // Doji: render as a thin horizontal line, not a thick slab
                const isDoji  = rawH < 0.8;
                return (
                  <G key={`cs${c.timestamp}`}>
                    {/* Thin wick — always 1px, centered */}
                    <Line x1={cx} y1={yOf(c.high)} x2={cx} y2={yOf(c.low)} stroke={col} strokeWidth={wickW} />
                    {isDoji ? (
                      // Doji: single horizontal tick at close level
                      <Line x1={cx - candleW / 2} y1={bodyTop} x2={cx + candleW / 2} y2={bodyTop}
                        stroke={col} strokeWidth={1.5} />
                    ) : (
                      // Normal body: up = hollow outline, down = filled (TradingView convention)
                      up ? (
                        <Rect x={cx - candleW / 2} y={bodyTop} width={candleW} height={Math.max(1, rawH)}
                          fill="none" stroke={fillCol} strokeWidth={1} />
                      ) : (
                        <Rect x={cx - candleW / 2} y={bodyTop} width={candleW} height={Math.max(1, rawH)}
                          fill={fillCol} />
                      )
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

            {/* Price guide line + pill — anchored to last real candle close (never quote-only).
                Only rendered when we have a real chart price to anchor to. */}
            {showPriceLine && scaledGuidePrice > 0 && (
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
                  {fmtValue(scaledGuidePrice, valueMode)}
                </SvgText>
              </>
            )}

            {/* Endpoint marker — static dot always visible; animated ring only for confirmed real trades.
                Pulse conditions (ALL must be true):
                  1. activeLiveCandle.sourceType === 'realTrade'  — came from is_live=true DB row
                  2. tradeTimestamp < LIVE_CANDLE_STALE_MS ago    — trade was recent
                Quote-only updates (DexScreener WS, Jupiter REST, liveTokenStore) never set
                activeLiveCandle so the ring is naturally absent for those sources. */}
            {!crosshair && (mode === 'area' || mode === 'line' || mode === 'mountain' || mode === 'bonding') && (
              <G>
                {activeLiveCandle?.sourceType === 'realTrade' &&
                 (Date.now() - activeLiveCandle.tradeTimestamp) < LIVE_CANDLE_STALE_MS && (
                  <AnimatedCircle
                    cx={lastX} cy={lastY} r={isVerySparse ? 14 : 10}
                    fill="none"
                    stroke={mode === 'bonding' ? '#06B6D4' : '#A78BFA'}
                    strokeWidth={1.5}
                    opacity={chartPulseAnim}
                  />
                )}
                <Circle
                  cx={lastX} cy={lastY} r={isVerySparse ? 5 : 3.5}
                  fill={mode === 'bonding' ? '#06B6D4' : '#A78BFA'}
                />
              </G>
            )}

            {/* Volume bars — zero/null/negative volume produces no bar (includes zero-volume live/visual guide candles) */}
            {showVolume && displayCandles.map((c, i) => {
              const h    = volBarH(c.volume);
              if (h <= 0) return null;
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

            {timeLabels.map(({ ts, x, label }) => (
              <SvgText key={`tl${ts}`} x={x} y={CHART_H + VOL_H + TIME_H - 3}
                fontSize={9} fill="rgba(255,255,255,0.35)" textAnchor="middle">
                {label}
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
  crosshairPctRange: { fontSize: 9, fontWeight: '400', color: 'rgba(255,255,255,0.35)' },
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
