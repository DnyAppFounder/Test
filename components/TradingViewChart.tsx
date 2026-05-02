import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Text,
  TouchableOpacity,
  Image,
  Modal,
  useWindowDimensions,
  Animated,
  ScrollView,
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
  Polyline,
} from 'react-native-svg';
import * as Clipboard from 'expo-clipboard';
import { TrendingUp, TrendingDown, ChartBar as BarChart2, Activity, ChartLine as LineChart, ChartCandlestick as CandlestickChart, ChartArea as AreaChart, Copy, CircleCheck as CheckCircle2, ChevronDown } from 'lucide-react-native';
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

const ALL_TIMEFRAMES: { key: TimeFrame; label: string }[] = [
  { key: '1m', label: '1m' },
  { key: '5m', label: '5m' },
  { key: '15m', label: '15m' },
  { key: '1H', label: '1h' },
  { key: '4H', label: '4h' },
  { key: '1D', label: '1d' },
  { key: '1W', label: '1w' },
  { key: '1M', label: '1M' },
];

// Chart mode config with icons (lucide component refs) and labels
const CHART_MODES: { key: ChartMode; icon: any; label: string }[] = [
  { key: 'area',        icon: AreaChart,          label: 'Area' },
  { key: 'line',        icon: LineChart,           label: 'Line' },
  { key: 'candlestick', icon: CandlestickChart,    label: 'Candles' },
  { key: 'bar',         icon: BarChart2,           label: 'Bar' },
  { key: 'mountain',    icon: Activity,            label: 'Mountain' },
  { key: 'bonding',     icon: TrendingUp,          label: 'Bonding' },
];

const CHART_H = 230;
const VOL_H = 44;
const PAD = { top: 18, right: 60, bottom: 22, left: 4 };

function fmtPrice(p: number): string {
  if (!p || p === 0) return '0';
  if (p >= 10000) return p.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (p >= 1) return p.toFixed(4);
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

function fmtTime(ts: number, tf: TimeFrame): string {
  const d = new Date(ts);
  if (tf === '1D' || tf === '1W' || tf === '1M') {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
}

function bondingX(i: number, n: number, plotW: number, padLeft: number): number {
  if (n <= 1) return padLeft + plotW / 2;
  const t = i / (n - 1);
  return padLeft + Math.sqrt(t) * plotW;
}

export function TradingViewChart({
  tokenInfo,
  symbol,
  currentPrice,
  pairAddress,
  tokenMint,
}: TradingViewChartProps) {
  const { width: screenWidth } = useWindowDimensions();
  const chartWidth = Math.min(screenWidth - 32, 600);

  const resolvedInfo: TokenInfo | undefined = tokenInfo ?? (symbol != null ? {
    name: symbol,
    symbol: symbol,
    price: currentPrice ?? 0,
    priceChange24h: 0,
    pairAddress,
  } : undefined);

  const [candles, setCandles] = useState<CandleData[]>([]);
  const [timeframe, setTimeframe] = useState<TimeFrame>('1H');
  const [mode, setMode] = useState<ChartMode>('area');
  const [valueMode, setValueMode] = useState<ValueMode>('mcap');
  const [loading, setLoading] = useState(true);
  const [hasData, setHasData] = useState(false);
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [showModeDropdown, setShowModeDropdown] = useState(false);
  const [copiedAddr, setCopiedAddr] = useState(false);

  // Animated live dot pulse
  const dotPulse = useRef(new Animated.Value(1)).current;
  // Animated volume bar highlight for last bar
  const volHighlight = useRef(new Animated.Value(0)).current;

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const livePriceRef = useRef<number | null>(null);
  const wsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { livePriceRef.current = livePrice; }, [livePrice]);

  // Pulse animation for live dot
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(dotPulse, { toValue: 1.8, duration: 700, useNativeDriver: true }),
        Animated.timing(dotPulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  // Highlight last volume bar when price updates
  const triggerVolHighlight = useCallback(() => {
    Animated.sequence([
      Animated.timing(volHighlight, { toValue: 1, duration: 150, useNativeDriver: true }),
      Animated.timing(volHighlight, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
  }, []);

  const loadData = useCallback(async (tf: TimeFrame, silent = false) => {
    if (!tokenMint) { setLoading(false); return; }
    if (!silent) setLoading(true);
    try {
      const data = await chartDataService.getOHLCVData(tokenMint, tf);
      if (data && data.length > 0) {
        setCandles(prev => {
          if (!silent) return data;
          if (prev.length === 0) return data;
          const currentLivePrice = livePriceRef.current;
          if (currentLivePrice == null) return data;
          const merged = [...data];
          const last = { ...merged[merged.length - 1] };
          last.close = currentLivePrice;
          last.high = Math.max(last.high, currentLivePrice);
          last.low = Math.min(last.low, currentLivePrice);
          merged[merged.length - 1] = last;
          return merged;
        });
        setHasData(true);
      } else {
        if (!silent) {
          // Even with no chart data, show price line if we have price
          setHasData(false);
        }
      }
    } catch {
      if (!silent) setHasData(false);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [tokenMint]);

  const connectWebSocket = useCallback(() => {
    if (!tokenMint || typeof WebSocket === 'undefined') return;
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    try {
      const ws = new WebSocket('wss://io.dexscreener.com/dex/screener/pair/solana/' + tokenMint);
      wsRef.current = ws;
      ws.onopen = () => setWsConnected(true);
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data?.pair?.priceUsd) {
            const newPrice = parseFloat(data.pair.priceUsd);
            if (!isNaN(newPrice) && newPrice > 0) {
              livePriceRef.current = newPrice;
              if (wsDebounceRef.current) return;
              wsDebounceRef.current = setTimeout(() => {
                wsDebounceRef.current = null;
                const price = livePriceRef.current;
                if (price == null) return;
                setLivePrice(price);
                triggerVolHighlight();
                setCandles(prev => {
                  if (prev.length === 0) return prev;
                  const last = prev[prev.length - 1];
                  if (last.close === price) return prev;
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    ...last,
                    close: price,
                    high: Math.max(last.high, price),
                    low: Math.min(last.low, price),
                  };
                  return updated;
                });
              }, 800);
            }
          }
        } catch {}
      };
      ws.onerror = () => setWsConnected(false);
      ws.onclose = () => {
        setWsConnected(false);
        wsRef.current = null;
        setTimeout(() => { if (tokenMint) connectWebSocket(); }, 5000);
      };
    } catch {
      setWsConnected(false);
    }
  }, [tokenMint, triggerVolHighlight]);

  useEffect(() => {
    setLivePrice(null);
    loadData(timeframe, false);
  }, [tokenMint, timeframe]);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    // Silent refresh every 60s to keep chart data fresh
    timerRef.current = setInterval(() => loadData(timeframe, true), 60000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [tokenMint, timeframe]);

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (wsDebounceRef.current) { clearTimeout(wsDebounceRef.current); wsDebounceRef.current = null; }
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      setWsConnected(false);
    };
  }, [tokenMint]);

  const sym = resolvedInfo?.symbol ?? 'TOKEN';
  const contractAddr = resolvedInfo?.address ?? tokenMint ?? '';
  const shortContractAddr = contractAddr
    ? `${contractAddr.slice(0, 6)}...${contractAddr.slice(-4)}`
    : '';

  const handleCopyAddr = async () => {
    if (!contractAddr) return;
    await Clipboard.setStringAsync(contractAddr);
    setCopiedAddr(true);
    setTimeout(() => setCopiedAddr(false), 2000);
  };

  const displayPriceVal = livePrice ?? (currentPrice != null && currentPrice > 0 ? currentPrice : (candles.length > 0 ? candles[candles.length - 1].close : 0));
  const mcapVal = resolvedInfo?.marketCap ?? null;
  const change24h = resolvedInfo?.priceChange24h ?? 0;
  const isUp = change24h >= 0;
  const changeColor = isUp ? '#10b981' : '#ef4444';

  const headerValue = valueMode === 'mcap' && mcapVal != null && mcapVal > 0
    ? fmtMcap(mcapVal)
    : `$${fmtPrice(displayPriceVal)}`;

  const currentModeConfig = CHART_MODES.find(m => m.key === mode) ?? CHART_MODES[0];

  const header = (
    <View style={styles.chartHeader}>
      {/* Row 1: Token logo + name + contract addr + value */}
      <View style={styles.headerRow1}>
        <View style={styles.tokenInfoGroup}>
          {resolvedInfo?.image ? (
            <Image source={{ uri: resolvedInfo.image }} style={styles.headerLogo} />
          ) : (
            <View style={styles.headerLogoFallback}>
              <Text style={styles.headerLogoText}>{sym.slice(0, 2).toUpperCase()}</Text>
            </View>
          )}
          <View style={styles.headerTextCol}>
            <View style={styles.headerNameRow}>
              <Text style={styles.headerName} numberOfLines={1}>{resolvedInfo?.name ?? sym}</Text>
              {wsConnected && (
                <Animated.View style={[styles.liveDot, { transform: [{ scale: dotPulse }] }]} />
              )}
            </View>
            <Text style={styles.headerSymbol}>${sym.toUpperCase()}</Text>
            {shortContractAddr ? (
              <TouchableOpacity style={styles.addrRow} onPress={handleCopyAddr} activeOpacity={0.7}>
                <Text style={styles.addrText}>{shortContractAddr}</Text>
                {copiedAddr
                  ? <CheckCircle2 size={10} color={colors.success} strokeWidth={2} />
                  : <Copy size={10} color={colors.textMuted} strokeWidth={2} />
                }
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        <View style={styles.headerValueGroup}>
          <Text style={styles.headerBigValue}>{headerValue}</Text>
          <View style={styles.headerChangeRow}>
            {isUp
              ? <TrendingUp size={11} color={changeColor} strokeWidth={2.5} />
              : <TrendingDown size={11} color={changeColor} strokeWidth={2.5} />
            }
            <Text style={[styles.headerChangePct, { color: changeColor }]}>
              {isUp ? '+' : ''}{change24h.toFixed(2)}%
            </Text>
          </View>
        </View>
      </View>

      {/* Row 2: MCAP/PRICE toggle + Chart type icons */}
      <View style={styles.headerRow2}>
        <View style={styles.valueModeToggle}>
          <TouchableOpacity
            style={[styles.vmBtn, valueMode === 'mcap' && styles.vmBtnActive]}
            onPress={() => setValueMode('mcap')}
            activeOpacity={0.8}
          >
            <Text style={[styles.vmText, valueMode === 'mcap' && styles.vmTextActive]}>MCAP</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.vmBtn, valueMode === 'price' && styles.vmBtnActive]}
            onPress={() => setValueMode('price')}
            activeOpacity={0.8}
          >
            <Text style={[styles.vmText, valueMode === 'price' && styles.vmTextActive]}>PRICE</Text>
          </TouchableOpacity>
        </View>

        {/* Chart type icons row */}
        <View style={styles.chartModeIcons}>
          {CHART_MODES.map(m => {
            const IconComp = m.icon;
            const active = mode === m.key;
            return (
              <TouchableOpacity
                key={m.key}
                style={[styles.modeIconBtn, active && styles.modeIconBtnActive]}
                onPress={() => setMode(m.key)}
                activeOpacity={0.75}
              >
                <IconComp
                  size={15}
                  color={active ? '#fff' : 'rgba(255,255,255,0.3)'}
                  strokeWidth={active ? 2.5 : 2}
                />
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Row 3: Timeframes + ALL */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tfRowContent}>
        {ALL_TIMEFRAMES.map(tf => (
          <TouchableOpacity
            key={tf.key}
            style={[styles.tfBtn, timeframe === tf.key && styles.tfBtnActive]}
            onPress={() => setTimeframe(tf.key)}
            activeOpacity={0.7}
          >
            <Text style={[styles.tfText, timeframe === tf.key && styles.tfTextActive]}>{tf.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        {header}
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.loadingSubText}>Loading chart data...</Text>
        </View>
      </View>
    );
  }

  // If no candle data but we have a price, show a flat price line
  if (!hasData || candles.length < 2) {
    return (
      <View style={styles.container}>
        {header}
        <View style={styles.unavailableWrap}>
          {displayPriceVal > 0 ? (
            <>
              <Text style={styles.priceFallback}>${fmtPrice(displayPriceVal)}</Text>
              <Text style={styles.unavailableText}>Live price · Chart data loading...</Text>
            </>
          ) : (
            <Text style={styles.unavailableText}>Chart data unavailable</Text>
          )}
        </View>
      </View>
    );
  }

  // Chart geometry
  const plotW = chartWidth - PAD.left - PAD.right;
  const plotH = CHART_H - PAD.top - PAD.bottom;
  const n = candles.length;

  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const maxP = Math.max(...highs);
  const minP = Math.min(...lows);
  const priceRange = maxP - minP || maxP * 0.01 || 1;
  const maxVol = Math.max(...candles.map(c => c.volume)) || 1;
  const barW = Math.max(1.5, (plotW / n) * 0.6);
  const candleW = Math.max(2, (plotW / n) * 0.65);

  function xOf(i: number) { return PAD.left + (i + 0.5) * (plotW / n); }
  function xBonding(i: number) { return bondingX(i, n, plotW, PAD.left); }
  function yOf(price: number) { return PAD.top + plotH - ((price - minP) / priceRange) * plotH; }
  function volBarH(vol: number) { return Math.max(2, (vol / maxVol) * (VOL_H - 8)); }

  const xFn = mode === 'bonding' ? xBonding : xOf;
  const linePts = candles.map((c, i) => `${i === 0 ? 'M' : 'L'}${xFn(i).toFixed(1)},${yOf(c.close).toFixed(1)}`).join(' ');
  const bottomY = (PAD.top + plotH).toFixed(1);
  const areaPath = `${linePts} L${xFn(n - 1).toFixed(1)},${bottomY} L${xFn(0).toFixed(1)},${bottomY} Z`;

  const bondingPath = candles.map((c, i) => {
    const x = xBonding(i).toFixed(1);
    const y = yOf(c.close).toFixed(1);
    if (i === 0) return `M${x},${y}`;
    const px = xBonding(i - 1);
    const py = yOf(candles[i - 1].close);
    const cx = ((px + parseFloat(x)) / 2).toFixed(1);
    return `C${cx},${py.toFixed(1)} ${cx},${y} ${x},${y}`;
  }).join(' ');
  const bondingArea = `${bondingPath} L${xBonding(n - 1).toFixed(1)},${bottomY} L${xBonding(0).toFixed(1)},${bottomY} Z`;

  const gridLevels = 5;
  const priceGridLines = Array.from({ length: gridLevels }, (_, i) => {
    const frac = i / (gridLevels - 1);
    const price = minP + priceRange * frac;
    return { price, y: yOf(price) };
  });

  const timeLabelCount = Math.min(5, n);
  const timeLabelIndices = Array.from({ length: timeLabelCount }, (_, i) =>
    Math.round(i * (n - 1) / (timeLabelCount - 1))
  );

  const clampedPrice = displayPriceVal > maxP ? maxP : displayPriceVal < minP ? minP : displayPriceVal;
  const currentY = Math.max(PAD.top + 10, Math.min(PAD.top + plotH - 10, yOf(clampedPrice)));
  const totalH = CHART_H + VOL_H;

  // Mountain chart: stepped area
  const mountainPath = candles.map((c, i) => {
    const x = xOf(i).toFixed(1);
    const y = yOf(c.close).toFixed(1);
    if (i === 0) return `M${x},${y}`;
    const prevX = xOf(i - 1).toFixed(1);
    return `L${x},${prevX !== x ? yOf(candles[i - 1].close).toFixed(1) : y} L${x},${y}`;
  }).join(' ');
  const mountainArea = `${mountainPath} L${xOf(n - 1).toFixed(1)},${bottomY} L${xOf(0).toFixed(1)},${bottomY} Z`;

  const lastCandle = candles[n - 1];
  const lastX = xOf(n - 1);
  const lastY = yOf(lastCandle.close);

  return (
    <View style={styles.container}>
      {header}

      <View style={styles.svgWrap}>
        <Svg width={chartWidth} height={totalH}>
          <Defs>
            <SvgLinearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.45" />
              <Stop offset="55%" stopColor="#8B5CF6" stopOpacity="0.12" />
              <Stop offset="100%" stopColor="#8B5CF6" stopOpacity="0" />
            </SvgLinearGradient>
            <SvgLinearGradient id="mountainGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor="#10b981" stopOpacity="0.5" />
              <Stop offset="60%" stopColor="#10b981" stopOpacity="0.1" />
              <Stop offset="100%" stopColor="#10b981" stopOpacity="0" />
            </SvgLinearGradient>
            <SvgLinearGradient id="bondingGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor="#A78BFA" stopOpacity="0.45" />
              <Stop offset="50%" stopColor="#7C3AED" stopOpacity="0.2" />
              <Stop offset="100%" stopColor="#4C1D95" stopOpacity="0" />
            </SvgLinearGradient>
          </Defs>

          {/* Grid lines */}
          {priceGridLines.map(({ price, y }, i) => (
            <G key={`g${i}`}>
              <Line x1={PAD.left} y1={y} x2={chartWidth - PAD.right} y2={y}
                stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
              <SvgText x={chartWidth - PAD.right + 4} y={y + 4} fontSize={8.5}
                fill="rgba(255,255,255,0.28)" textAnchor="start">
                {fmtPrice(price)}
              </SvgText>
            </G>
          ))}

          {/* AREA */}
          {mode === 'area' && (
            <>
              <Path d={areaPath} fill="url(#areaGrad)" />
              <Path d={linePts} stroke="rgba(139,92,246,0.3)" strokeWidth={6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <Path d={linePts} stroke="#A78BFA" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </>
          )}

          {/* LINE */}
          {mode === 'line' && (
            <>
              <Path d={linePts} stroke="rgba(139,92,246,0.2)" strokeWidth={5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <Path d={linePts} stroke="#A78BFA" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <Circle cx={lastX} cy={lastY} r={8} fill="#8B5CF6" opacity={0.2} />
              <Circle cx={lastX} cy={lastY} r={4} fill="#A78BFA" opacity={0.95} />
            </>
          )}

          {/* MOUNTAIN */}
          {mode === 'mountain' && (
            <>
              <Path d={mountainArea} fill="url(#mountainGrad)" />
              <Path d={linePts} stroke="rgba(16,185,129,0.2)" strokeWidth={5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <Path d={linePts} stroke="#10b981" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <Circle cx={lastX} cy={lastY} r={4} fill="#10b981" opacity={0.9} />
            </>
          )}

          {/* BONDING */}
          {mode === 'bonding' && (
            <>
              <Path d={bondingArea} fill="url(#bondingGrad)" />
              <Path d={bondingPath} stroke="rgba(167,139,250,0.2)" strokeWidth={8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <Path d={bondingPath} stroke="#A78BFA" strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              {[0, Math.floor(n * 0.33), Math.floor(n * 0.66), n - 1].map((i) => {
                if (i >= n) return null;
                return (
                  <Circle key={`dot${i}`} cx={xBonding(i)} cy={yOf(candles[i].close)}
                    r={i === n - 1 ? 5 : 3}
                    fill={i === n - 1 ? '#A78BFA' : 'rgba(167,139,250,0.55)'}
                    stroke={i === n - 1 ? '#fff' : 'none'} strokeWidth={i === n - 1 ? 1 : 0} />
                );
              })}
            </>
          )}

          {/* BAR chart */}
          {mode === 'bar' && candles.map((c, i) => {
            const isUpBar = c.close >= c.open;
            const col = isUpBar ? '#10b981' : '#ef4444';
            const openY = yOf(c.open);
            const closeY = yOf(c.close);
            const cx = xOf(i);
            const bw = Math.max(2.5, (plotW / n) * 0.55);
            return (
              <G key={`bar${i}`}>
                <Line x1={cx} y1={yOf(c.high)} x2={cx} y2={yOf(c.low)} stroke={col} strokeWidth={1} opacity={0.7} />
                <Line x1={cx - bw / 2} y1={openY} x2={cx} y2={openY} stroke={col} strokeWidth={1.5} opacity={0.9} />
                <Line x1={cx} y1={closeY} x2={cx + bw / 2} y2={closeY} stroke={col} strokeWidth={1.5} opacity={0.9} />
              </G>
            );
          })}

          {/* CANDLESTICK */}
          {mode === 'candlestick' && candles.map((c, i) => {
            const isUpCandle = c.close >= c.open;
            const col = isUpCandle ? '#10b981' : '#ef4444';
            const bodyTop = yOf(Math.max(c.open, c.close));
            const bodyBot = yOf(Math.min(c.open, c.close));
            const bodyH = Math.max(1.5, bodyBot - bodyTop);
            const cx = xOf(i);
            const isLast = i === n - 1;
            return (
              <G key={`c${i}`}>
                <Line x1={cx} y1={yOf(c.high)} x2={cx} y2={yOf(c.low)} stroke={col} strokeWidth={1} opacity={isLast ? 1 : 0.8} />
                <Rect x={cx - candleW / 2} y={bodyTop} width={candleW} height={bodyH}
                  fill={col} opacity={isLast ? 1 : 0.85} rx={1} />
              </G>
            );
          })}

          {/* Live price dashed line */}
          <Line x1={PAD.left} y1={currentY} x2={chartWidth - PAD.right} y2={currentY}
            stroke={isUp ? '#10b981' : '#ef4444'} strokeWidth={1} strokeDasharray="5,3" opacity={0.55} />
          <Rect x={chartWidth - PAD.right + 1} y={currentY - 9} width={PAD.right - 2} height={18}
            fill={isUp ? '#059669' : '#dc2626'} rx={3} />
          <SvgText x={chartWidth - PAD.right + (PAD.right - 2) / 2 + 1} y={currentY + 4}
            fontSize={8} fill="#fff" textAnchor="middle" fontWeight="700">
            {fmtPrice(displayPriceVal)}
          </SvgText>

          {/* Live endpoint dot — animated via parent Animated.View overlay */}
          {(mode === 'area' || mode === 'line' || mode === 'mountain') && (
            <Circle cx={lastX} cy={lastY} r={3} fill={mode === 'mountain' ? '#10b981' : '#A78BFA'} opacity={1} />
          )}

          {/* Volume bars */}
          {candles.map((c, i) => {
            const h = volBarH(c.volume);
            const vx = xOf(i);
            const col = c.close >= c.open ? '#10b981' : '#ef4444';
            const isLast = i === n - 1;
            return (
              <Rect key={`v${i}`}
                x={vx - barW / 2}
                y={CHART_H + VOL_H - h - 2}
                width={barW}
                height={h}
                fill={col}
                opacity={isLast ? 0.7 : 0.35}
                rx={1}
              />
            );
          })}

          {/* X-axis time labels */}
          {timeLabelIndices.map(i => {
            if (i >= n) return null;
            return (
              <SvgText key={`t${i}`} x={xOf(i)} y={totalH - 1} fontSize={8.5}
                fill="rgba(255,255,255,0.3)" textAnchor="middle">
                {fmtTime(candles[i].timestamp, timeframe)}
              </SvgText>
            );
          })}
        </Svg>

        {/* Animated live pulse overlay at last candle point */}
        {wsConnected && (mode === 'area' || mode === 'line' || mode === 'mountain') && (
          <Animated.View
            style={[
              styles.livePulse,
              {
                left: lastX - 8,
                top: lastY - 8,
                transform: [{ scale: dotPulse }],
                backgroundColor: mode === 'mountain' ? 'rgba(16,185,129,0.25)' : 'rgba(167,139,250,0.25)',
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
    backgroundColor: '#0D0D17',
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.15)',
  },

  chartHeader: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(139,92,246,0.08)',
    gap: spacing.sm,
  },
  headerRow1: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  tokenInfoGroup: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    flex: 1,
  },
  headerLogo: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1A1A28',
    marginTop: 2,
  },
  headerLogoFallback: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1A1A28',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.2)',
    marginTop: 2,
  },
  headerLogoText: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.primary,
  },
  headerTextCol: {
    gap: 2,
    flex: 1,
  },
  headerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerName: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  headerSymbol: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.3,
  },
  addrRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 1,
  },
  addrText: {
    fontSize: 10,
    color: colors.textMuted,
    fontFamily: 'SpaceMono-Regular',
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#10b981',
  },
  headerValueGroup: {
    alignItems: 'flex-end',
    gap: 3,
  },
  headerBigValue: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  headerChangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  headerChangePct: {
    fontSize: 12,
    fontWeight: '700',
  },
  headerRow2: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  valueModeToggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: borderRadius.sm,
    padding: 2,
    gap: 2,
  },
  vmBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 6,
  },
  vmBtnActive: {
    backgroundColor: colors.primary,
  },
  vmText: {
    fontSize: 11,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 0.5,
  },
  vmTextActive: {
    color: '#fff',
  },
  chartModeIcons: {
    flexDirection: 'row',
    gap: 3,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 8,
    padding: 3,
  },
  modeIconBtn: {
    width: 30,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeIconBtnActive: {
    backgroundColor: colors.primary,
  },
  tfRowContent: {
    gap: 3,
    paddingVertical: 2,
  },
  tfBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: borderRadius.sm,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  tfBtnActive: {
    backgroundColor: colors.primary,
  },
  tfText: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.35)',
  },
  tfTextActive: {
    color: '#fff',
  },
  svgWrap: {
    paddingBottom: 2,
    paddingTop: spacing.sm,
    position: 'relative',
  },
  loadingWrap: {
    height: 220,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  loadingSubText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '500',
  },
  unavailableWrap: {
    height: 160,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  unavailableText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '500',
  },
  priceFallback: {
    fontSize: fontSize.xxl ?? 24,
    fontWeight: '900',
    color: colors.primary,
  },
  livePulse: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    pointerEvents: 'none',
  },
});
