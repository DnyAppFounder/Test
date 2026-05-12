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
const BG_TILE_W = 56; // width of one repeating background tile (px)

// ─── helpers ──────────────────────────────────────────────────────────────────
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

// ─── Main component ───────────────────────────────────────────────────────────
export function TradingViewChart({
  tokenInfo,
  symbol,
  currentPrice,
  pairAddress,
  tokenMint,
}: TradingViewChartProps) {
  const { width: screenWidth } = useWindowDimensions();
  const chartWidth = Math.min(screenWidth - 32, 600);

  // Responsive layout — mobile gets a tall readable chart; desktop keeps compact layout
  const isMobile = screenWidth < 768;
  const CHART_H  = isMobile ? 380 : 240;
  const VOL_H    = isMobile ? 64  : 40;
  const PAD      = { top: 12, right: isMobile ? 76 : 60, bottom: 4, left: 4 };

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
  const [copiedAddr, setCopiedAddr] = useState(false);
  // Resolved best pair address for this token (used for WS + price polling)
  const [resolvedPairAddr, setResolvedPairAddr] = useState<string | null>(pairAddress ?? null);

  // Crosshair state
  const [crosshair, setCrosshair] = useState<{
    x: number; y: number; idx: number; price: number; ts: number; pct: number;
  } | null>(null);

  // Animated values
  const dotPulse = useRef(new Animated.Value(1)).current;
  const bgAnim = useRef(new Animated.Value(0)).current;

  // Historical scroll state
  const [panOffsetCandles, setPanOffsetCandles] = useState(0);
  const panOffsetRef       = useRef(0);
  const plotWRef           = useRef(0);
  const panStartOffsetRef  = useRef(0);
  const isPanScrollRef     = useRef(false);

  const pollTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const wsRef         = useRef<WebSocket | null>(null);
  const livePriceRef  = useRef<number | null>(null);
  const wsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const svgContainerRef = useRef<View>(null);
  const svgOffsetRef  = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const candlesRef        = useRef<CandleData[]>([]);
  const displayCandlesRef = useRef<CandleData[]>([]);
  const pairAddrRef   = useRef<string | null>(pairAddress ?? null);

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

  // Moving background grid animation
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(bgAnim, {
        toValue: -BG_TILE_W,
        duration: 4000,
        useNativeDriver: true,
        isInteraction: false,
      })
    );
    loop.start();
    return () => loop.stop();
  }, []);

  // Pulse live dot
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(dotPulse, { toValue: 2.2, duration: 600, useNativeDriver: true }),
      Animated.timing(dotPulse, { toValue: 1,   duration: 600, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
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

  // Apply a live price update to state — updates last candle in-place
  const applyLivePrice = useCallback((price: number) => {
    if (!price || price <= 0) return;
    const prev = livePriceRef.current;
    if (prev === price) return;
    livePriceRef.current = price;
    setLivePrice(price);
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
  }, []);

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
    setLivePrice(null);
    setCrosshair(null);
    setPanOffsetCandles(0);
    panOffsetRef.current = 0;
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
  const maxVisible = isMobile ? 40 : 80;
  const totalCount = candles.length;
  // panOffsetCandles=0 → show last maxVisible; increasing offset scrolls back in time
  const clampedOffset   = Math.max(0, Math.min(panOffsetCandles, Math.max(0, totalCount - maxVisible)));
  const endIdx          = Math.max(0, totalCount - clampedOffset);
  const startIdx        = Math.max(0, endIdx - maxVisible);
  const displayCandles  = candles.slice(startIdx, endIdx || totalCount);
  // Sync ref so the crosshair handler always sees the current visible set
  displayCandlesRef.current = displayCandles;

  const plotW = chartWidth - PAD.left - PAD.right;
  plotWRef.current = plotW;
  const plotH = CHART_H - PAD.top - PAD.bottom;
  const n     = displayCandles.length;

  const highs  = n > 0 ? displayCandles.map(c => c.high)   : [0];
  const lows   = n > 0 ? displayCandles.map(c => c.low)    : [0];
  const maxP   = Math.max(...highs);
  const minP   = Math.min(...lows);
  const priceRange = (maxP - minP) || maxP * 0.01 || 1;
  const maxVol = n > 0 ? Math.max(...displayCandles.map(c => c.volume)) || 1 : 1;
  const barW    = Math.max(isMobile ? 3   : 1.5, (plotW / Math.max(n, 1)) * 0.55);
  const candleW = Math.max(isMobile ? 6   : 2,   (plotW / Math.max(n, 1)) * (isMobile ? 0.72 : 0.6));

  function xOf(i: number) { return PAD.left + (i + 0.5) * (plotW / Math.max(n, 1)); }
  function yOf(price: number) { return PAD.top + plotH - ((price - minP) / priceRange) * plotH; }
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
    const nn = cands.length;
    const pw = plotWRef.current;
    const step = pw / nn;
    const rawIdx = Math.round((localX - PAD.left) / step - 0.5);
    const idx = Math.max(0, Math.min(nn - 1, rawIdx));
    const c = cands[idx];
    const cx = PAD.left + (idx + 0.5) * step;
    const cy = PAD.top + (CHART_H - PAD.top - PAD.bottom) - ((c.close - Math.min(...cands.map(x => x.low))) / (((Math.max(...cands.map(x => x.high)) - Math.min(...cands.map(x => x.low))) || 1))) * (CHART_H - PAD.top - PAD.bottom);
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
  const displayPriceVal  = livePrice ?? (currentPrice != null && currentPrice > 0 ? currentPrice
    : (candles.length > 0 ? candles[candles.length - 1].close : 0));
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
    <View style={styles.chartHeader}>
      {/* Token info row: logo | name+addr | price+change */}
      <View style={styles.tokenInfoRow}>
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
      </View>

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
            onPress={() => setShowModePanel(p => !p)}
            activeOpacity={0.8}
          >
            <ModeIcon size={15} color={showModePanel ? '#A78BFA' : 'rgba(255,255,255,0.6)'} strokeWidth={2} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.chartCtrlBtn} activeOpacity={0.8}>
            <SlidersHorizontal size={15} color="rgba(255,255,255,0.6)" strokeWidth={2} />
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
              <Text style={styles.priceFallback}>${fmtPrice(displayPriceVal)}</Text>
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

  // Time labels — evenly distributed, avoid edges crowding
  const timeLabelCount = Math.min(6, n);
  const timeLabelIndices = timeLabelCount <= 1
    ? [0]
    : Array.from({ length: timeLabelCount }, (_, i) =>
        Math.round(i * (n - 1) / (timeLabelCount - 1))
      );

  // Live price line
  const clampedLive = displayPriceVal > maxP ? maxP : displayPriceVal < minP ? minP : displayPriceVal;
  const currentY    = Math.max(PAD.top + 2, Math.min(PAD.top + plotH - 2, yOf(clampedLive)));

  // Last candle point for animated dot
  const lastCandle = displayCandles[n - 1];
  const lastX      = xOf(n - 1);
  const lastY      = yOf(lastCandle.close);

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
          <Text style={styles.crosshairPrice}>${fmtPrice(crosshair.price)}</Text>
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
        {/* ── Animated moving background grid ──────────────────────────── */}
        <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]} pointerEvents="none">
          <Animated.View
            style={{ transform: [{ translateX: bgAnim }], width: chartWidth + BG_TILE_W * 2 }}
            pointerEvents="none"
          >
            <Svg width={chartWidth + BG_TILE_W * 2} height={totalH}>
              {/* Moving vertical grid lines */}
              {Array.from({ length: Math.ceil((chartWidth + BG_TILE_W * 2) / BG_TILE_W) + 1 }, (_, i) => (
                <Line key={`bv${i}`}
                  x1={i * BG_TILE_W} y1={0} x2={i * BG_TILE_W} y2={totalH}
                  stroke="rgba(139,92,246,0.06)" strokeWidth={1} />
              ))}
              {/* Subtle accent lines every 3rd */}
              {Array.from({ length: Math.ceil((chartWidth + BG_TILE_W * 2) / (BG_TILE_W * 3)) + 1 }, (_, i) => (
                <Line key={`ba${i}`}
                  x1={i * BG_TILE_W * 3} y1={0} x2={i * BG_TILE_W * 3} y2={totalH}
                  stroke="rgba(139,92,246,0.12)" strokeWidth={1} />
              ))}
              {/* Horizontal scanlines */}
              {Array.from({ length: Math.ceil(totalH / 14) }, (_, i) => (
                <Line key={`bh${i}`}
                  x1={0} y1={i * 14} x2={chartWidth + BG_TILE_W * 2} y2={i * 14}
                  stroke="rgba(139,92,246,0.025)" strokeWidth={1} />
              ))}
            </Svg>
          </Animated.View>
        </View>

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
              <Line
                x1={PAD.left} y1={y} x2={chartWidth - PAD.right} y2={y}
                stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
              <SvgText
                x={chartWidth - PAD.right + 4} y={y + 3.5}
                fontSize={isMobile ? 11 : 8.5}
                fill={isMobile ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.3)'}
                fontWeight={isMobile ? '600' : '400'}
                textAnchor="start">
                {fmtPrice(price)}
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

          {/* ── Live price dashed horizontal line ─────────────────────────── */}
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
            {fmtPrice(displayPriceVal)}
          </SvgText>

          {/* ── Animated endpoint dot (non-candlestick/bar) ───────────────── */}
          {(mode === 'area' || mode === 'line' || mode === 'mountain' || mode === 'bonding') && (
            <Circle cx={lastX} cy={lastY} r={3}
              fill="#A78BFA" opacity={1} />
          )}

          {/* ── Volume bars — sandwiched between chart and time labels ─────── */}
          {displayCandles.map((c, i) => {
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

          {/* ── Time labels — below volume bars ───────────────────────────── */}
          {timeLabelIndices.map(i => {
            if (i >= n) return null;
            const labelX = xOf(i);
            // clamp to avoid clipping at edges
            const clampedX = Math.max(PAD.left + 18, Math.min(chartWidth - PAD.right - 18, labelX));
            return (
              <SvgText
                key={`tl${i}`}
                x={clampedX}
                y={CHART_H + VOL_H + TIME_H - 3}
                fontSize={9}
                fill="rgba(255,255,255,0.35)"
                textAnchor="middle">
                {fmtTime(displayCandles[i].timestamp, timeframe)}
              </SvgText>
            );
          })}

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
                {fmtPrice(crosshair.price)}
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
    marginBottom: spacing.md,
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
  svgWrap: { paddingTop: spacing.sm, paddingBottom: 2, position: 'relative', overflow: 'hidden' },
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
});
