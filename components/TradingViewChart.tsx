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
import { colors, spacing, fontSize, borderRadius } from '@/constants/theme';
import { chartDataService, CandleData, TimeFrame } from '@/services/chartDataService';
import {
  ChevronDown,
  TrendingUp,
  TrendingDown,
} from 'lucide-react-native';

export type ChartMode = 'line' | 'area' | 'candlestick' | 'bonding';
type ValueMode = 'mcap' | 'price';

export interface TokenInfo {
  name: string;
  symbol: string;
  image?: string;
  price: number;
  priceChange24h: number;
  marketCap?: number;
  pairAddress?: string;
}

interface TradingViewChartProps {
  tokenInfo?: TokenInfo;
  /** legacy props still accepted for backward compat */
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

const CHART_MODES: { key: ChartMode; label: string }[] = [
  { key: 'area', label: 'Area' },
  { key: 'line', label: 'Line' },
  { key: 'candlestick', label: 'Candles' },
  { key: 'bonding', label: 'Bonding' },
];

const CHART_H = 220;
const VOL_H = 36;
const PAD = { top: 18, right: 56, bottom: 18, left: 4 };
const REFRESH_INTERVAL = 8000;

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

function calcChange(candles: CandleData[]): { pct: number } {
  if (candles.length < 2) return { pct: 0 };
  const first = candles[0].close;
  const last = candles[candles.length - 1].close;
  return { pct: first !== 0 ? ((last - first) / first) * 100 : 0 };
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

  // Merge legacy props into tokenInfo
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

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const prevTokenMint = useRef<string | undefined>(undefined);

  const loadData = useCallback(async (tf: TimeFrame, silent = false) => {
    if (!tokenMint) { setLoading(false); return; }
    if (!silent) {
      setLoading(true);
      chartDataService.clearCache();
    }
    try {
      const data = await chartDataService.getOHLCVData(tokenMint, tf);
      if (data && data.length > 0) {
        // Smooth update: replace candles without flash
        setCandles(prev => {
          if (!silent) return data;
          // On silent update, only update last candle if WS has live price
          if (prev.length === 0) return data;
          const merged = [...data];
          if (livePrice != null && merged.length > 0) {
            const last = { ...merged[merged.length - 1] };
            last.close = livePrice;
            last.high = Math.max(last.high, livePrice);
            last.low = Math.min(last.low, livePrice);
            merged[merged.length - 1] = last;
          }
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
  }, [tokenMint, livePrice]);

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
      ws.onopen = () => { setWsConnected(true); };
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data?.pair?.priceUsd) {
            const newPrice = parseFloat(data.pair.priceUsd);
            if (!isNaN(newPrice) && newPrice > 0) {
              setLivePrice(newPrice);
              // Smooth in-place update of last candle
              setCandles(prev => {
                if (prev.length === 0) return prev;
                const updated = [...prev];
                const last = { ...updated[updated.length - 1] };
                last.close = newPrice;
                last.high = Math.max(last.high, newPrice);
                last.low = Math.min(last.low, newPrice);
                updated[updated.length - 1] = last;
                return updated;
              });
            }
          }
        } catch {}
      };
      ws.onerror = () => { setWsConnected(false); };
      ws.onclose = () => {
        setWsConnected(false);
        wsRef.current = null;
        setTimeout(() => { if (tokenMint) connectWebSocket(); }, 5000);
      };
    } catch {
      setWsConnected(false);
    }
  }, [tokenMint]);

  useEffect(() => {
    setLivePrice(null);
    loadData(timeframe, false);
  }, [tokenMint, timeframe]);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => loadData(timeframe, true), REFRESH_INTERVAL);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [tokenMint, timeframe]);

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      setWsConnected(false);
    };
  }, [tokenMint]);

  const sym = resolvedInfo?.symbol ?? 'TOKEN';
  const pair = resolvedInfo?.pairAddress
    ? `${sym.toUpperCase()}/${resolvedInfo.pairAddress.slice(0, 4).toUpperCase()}`
    : `${sym.toUpperCase()}/SOL`;

  const displayPriceVal = livePrice ?? (currentPrice != null && currentPrice > 0 ? currentPrice : (candles.length > 0 ? candles[candles.length - 1].close : 0));
  const mcapVal = resolvedInfo?.marketCap ?? null;
  const change24h = resolvedInfo?.priceChange24h ?? 0;
  const isUp = change24h >= 0;
  const changeColor = isUp ? '#10b981' : '#ef4444';

  // The value shown in the header (MCAP or Price)
  const headerValue = valueMode === 'mcap' && mcapVal != null && mcapVal > 0
    ? fmtMcap(mcapVal)
    : `$${fmtPrice(displayPriceVal)}`;

  const currentModeName = CHART_MODES.find(m => m.key === mode)?.label ?? 'Area';

  if (loading) {
    return (
      <View style={styles.container}>
        {resolvedInfo && renderHeader(resolvedInfo, pair, headerValue, change24h, isUp, changeColor, valueMode, setValueMode, wsConnected, currentModeName, showModeDropdown, setShowModeDropdown, mode, setMode, timeframe, setTimeframe)}
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      </View>
    );
  }

  if (!hasData || candles.length < 2) {
    return (
      <View style={styles.container}>
        {resolvedInfo && renderHeader(resolvedInfo, pair, headerValue, change24h, isUp, changeColor, valueMode, setValueMode, wsConnected, currentModeName, showModeDropdown, setShowModeDropdown, mode, setMode, timeframe, setTimeframe)}
        <View style={styles.unavailableWrap}>
          <Text style={styles.unavailableText}>Chart data unavailable</Text>
          {displayPriceVal > 0 && (
            <Text style={styles.priceFallback}>${fmtPrice(displayPriceVal)}</Text>
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
  const barW = Math.max(1.5, (plotW / n) * 0.65);
  const candleW = Math.max(2, (plotW / n) * 0.7);

  function xOf(i: number) { return PAD.left + (i + 0.5) * (plotW / n); }
  function xBonding(i: number) { return bondingX(i, n, plotW, PAD.left); }
  function yOf(price: number) { return PAD.top + plotH - ((price - minP) / priceRange) * plotH; }
  function volBarH(vol: number) { return Math.max(1, (vol / maxVol) * VOL_H * 0.85); }

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

  const gridLevels = 4;
  const priceGridLines = Array.from({ length: gridLevels }, (_, i) => {
    const frac = i / (gridLevels - 1);
    const price = minP + priceRange * frac;
    return { price, y: yOf(price) };
  });

  const timeLabelIndices = [0, Math.floor(n * 0.25), Math.floor(n * 0.5), Math.floor(n * 0.75), n - 1];
  const clampedPrice = displayPriceVal > maxP ? maxP : displayPriceVal < minP ? minP : displayPriceVal;
  const currentY = Math.max(PAD.top + 10, Math.min(PAD.top + plotH - 10, yOf(clampedPrice)));
  const totalH = CHART_H + VOL_H;

  return (
    <View style={styles.container}>
      {resolvedInfo && renderHeader(resolvedInfo, pair, headerValue, change24h, isUp, changeColor, valueMode, setValueMode, wsConnected, currentModeName, showModeDropdown, setShowModeDropdown, mode, setMode, timeframe, setTimeframe)}

      {/* SVG chart */}
      <View style={styles.svgWrap}>
        <Svg width={chartWidth} height={totalH}>
          <Defs>
            <SvgLinearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.4" />
              <Stop offset="60%" stopColor="#8B5CF6" stopOpacity="0.1" />
              <Stop offset="100%" stopColor="#8B5CF6" stopOpacity="0" />
            </SvgLinearGradient>
            <SvgLinearGradient id="bondingGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor="#A78BFA" stopOpacity="0.45" />
              <Stop offset="50%" stopColor="#7C3AED" stopOpacity="0.2" />
              <Stop offset="100%" stopColor="#4C1D95" stopOpacity="0" />
            </SvgLinearGradient>
          </Defs>

          {/* Grid */}
          {priceGridLines.map(({ price, y }, i) => (
            <G key={`g${i}`}>
              <Line x1={PAD.left} y1={y} x2={chartWidth - PAD.right} y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
              <SvgText x={chartWidth - PAD.right + 4} y={y + 4} fontSize={9} fill="rgba(255,255,255,0.3)" textAnchor="start">
                {fmtPrice(price)}
              </SvgText>
            </G>
          ))}

          {/* Area */}
          {mode === 'area' && (
            <>
              <Path d={areaPath} fill="url(#areaGrad)" />
              <Path d={linePts} stroke="rgba(139,92,246,0.35)" strokeWidth={6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <Path d={linePts} stroke="#A78BFA" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </>
          )}

          {/* Line */}
          {mode === 'line' && (
            <>
              <Path d={linePts} stroke="rgba(139,92,246,0.25)" strokeWidth={5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <Path d={linePts} stroke="#A78BFA" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <Circle cx={xOf(n - 1)} cy={yOf(candles[n - 1].close)} r={4} fill="#A78BFA" opacity={0.9} />
              <Circle cx={xOf(n - 1)} cy={yOf(candles[n - 1].close)} r={8} fill="#8B5CF6" opacity={0.2} />
            </>
          )}

          {/* Bonding */}
          {mode === 'bonding' && (
            <>
              <Path d={bondingArea} fill="url(#bondingGrad)" />
              <Path d={bondingPath} stroke="rgba(167,139,250,0.2)" strokeWidth={8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <Path d={bondingPath} stroke="#A78BFA" strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              {[0, Math.floor(n * 0.25), Math.floor(n * 0.5), Math.floor(n * 0.75), n - 1].map(i => {
                if (i >= n) return null;
                return (
                  <Circle key={`dot${i}`} cx={xBonding(i)} cy={yOf(candles[i].close)} r={i === n - 1 ? 5 : 3}
                    fill={i === n - 1 ? '#A78BFA' : 'rgba(167,139,250,0.6)'}
                    stroke={i === n - 1 ? '#fff' : 'none'} strokeWidth={i === n - 1 ? 1 : 0} />
                );
              })}
            </>
          )}

          {/* Candlestick */}
          {mode === 'candlestick' && candles.map((c, i) => {
            const isUpCandle = c.close >= c.open;
            const col = isUpCandle ? '#10b981' : '#ef4444';
            const bodyTop = yOf(Math.max(c.open, c.close));
            const bodyBot = yOf(Math.min(c.open, c.close));
            const bodyH = Math.max(1.5, bodyBot - bodyTop);
            const cx = xOf(i);
            return (
              <G key={`c${i}`}>
                <Line x1={cx} y1={yOf(c.high)} x2={cx} y2={yOf(c.low)} stroke={col} strokeWidth={1} opacity={0.8} />
                <Rect x={cx - candleW / 2} y={bodyTop} width={candleW} height={bodyH} fill={col} opacity={0.85} rx={1} />
              </G>
            );
          })}

          {/* Current price line */}
          <Line x1={PAD.left} y1={currentY} x2={chartWidth - PAD.right} y2={currentY} stroke="#A78BFA" strokeWidth={1} strokeDasharray="4,3" opacity={0.5} />
          <Rect x={chartWidth - PAD.right + 1} y={currentY - 9} width={PAD.right - 2} height={18} fill="#7C3AED" rx={3} />
          <SvgText x={chartWidth - PAD.right + PAD.right / 2} y={currentY + 4} fontSize={8.5} fill="#fff" textAnchor="middle" fontWeight="700">
            {fmtPrice(displayPriceVal)}
          </SvgText>

          {/* Volume bars */}
          {candles.map((c, i) => {
            const h = volBarH(c.volume);
            const vx = xOf(i);
            return (
              <Rect key={`v${i}`} x={vx - barW / 2} y={CHART_H + VOL_H - h} width={barW} height={h}
                fill={c.close >= c.open ? '#10b981' : '#ef4444'} opacity={0.4} />
            );
          })}

          {/* X-axis time labels */}
          {timeLabelIndices.map(i => {
            if (i >= n) return null;
            return (
              <SvgText key={`t${i}`} x={xOf(i)} y={totalH - 2} fontSize={9} fill="rgba(255,255,255,0.3)" textAnchor="middle">
                {fmtTime(candles[i].timestamp, timeframe)}
              </SvgText>
            );
          })}
        </Svg>
      </View>

      {/* Mode dropdown modal */}
      <Modal visible={showModeDropdown} transparent animationType="fade" onRequestClose={() => setShowModeDropdown(false)}>
        <TouchableOpacity style={styles.dropdownOverlay} activeOpacity={1} onPress={() => setShowModeDropdown(false)}>
          <View style={styles.dropdownCard}>
            <Text style={styles.dropdownTitle}>Chart Type</Text>
            {CHART_MODES.map(m => (
              <TouchableOpacity
                key={m.key}
                style={[styles.dropdownOption, mode === m.key && styles.dropdownOptionActive]}
                onPress={() => { setMode(m.key); setShowModeDropdown(false); }}
                activeOpacity={0.8}
              >
                <Text style={[styles.dropdownOptionText, mode === m.key && styles.dropdownOptionTextActive]}>
                  {m.label}
                </Text>
                {mode === m.key && <View style={styles.dropdownCheck} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

function renderHeader(
  info: TokenInfo,
  pair: string,
  headerValue: string,
  change24h: number,
  isUp: boolean,
  changeColor: string,
  valueMode: ValueMode,
  setValueMode: (v: ValueMode) => void,
  wsConnected: boolean,
  currentModeName: string,
  showModeDropdown: boolean,
  setShowModeDropdown: (v: boolean) => void,
  mode: ChartMode,
  setMode: (m: ChartMode) => void,
  timeframe: TimeFrame,
  setTimeframe: (tf: TimeFrame) => void,
) {
  return (
    <View style={styles.chartHeader}>
      {/* Row 1: Token info + value toggle */}
      <View style={styles.headerRow1}>
        <View style={styles.tokenInfoGroup}>
          {info.image ? (
            <Image source={{ uri: info.image }} style={styles.headerLogo} />
          ) : (
            <View style={styles.headerLogoFallback}>
              <Text style={styles.headerLogoText}>{(info.symbol ?? '??').slice(0, 2).toUpperCase()}</Text>
            </View>
          )}
          <View style={styles.headerTextCol}>
            <View style={styles.headerNameRow}>
              <Text style={styles.headerName} numberOfLines={1}>{info.name}</Text>
              {wsConnected && <View style={styles.liveDot} />}
            </View>
            <Text style={styles.headerPair}>{pair}</Text>
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

      {/* Row 2: MCAP/PRICE toggle + Chart type dropdown */}
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

        <TouchableOpacity style={styles.chartTypeBtn} onPress={() => setShowModeDropdown(true)} activeOpacity={0.8}>
          <Text style={styles.chartTypeBtnText}>{currentModeName}</Text>
          <ChevronDown size={13} color={colors.primary} strokeWidth={2.5} />
        </TouchableOpacity>
      </View>

      {/* Row 3: Timeframes */}
      <View style={styles.tfRow}>
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

  // Header
  chartHeader: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(139,92,246,0.08)',
    gap: spacing.md,
  },
  headerRow1: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  tokenInfoGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  headerLogo: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1A1A28',
  },
  headerLogoFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1A1A28',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.2)',
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
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#10b981',
  },
  headerPair: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
    letterSpacing: 0.3,
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

  // Row 2: value toggle + chart type
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
  chartTypeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(139,92,246,0.1)',
    borderRadius: borderRadius.sm,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.25)',
  },
  chartTypeBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },

  // Timeframes
  tfRow: {
    flexDirection: 'row',
    gap: 3,
  },
  tfBtn: {
    flex: 1,
    paddingVertical: 6,
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

  // Chart
  svgWrap: {
    paddingBottom: 4,
    paddingTop: spacing.sm,
  },
  loadingWrap: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  unavailableWrap: {
    height: 140,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  unavailableText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: '600',
  },
  priceFallback: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.primary,
  },

  // Dropdown
  dropdownOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
  },
  dropdownCard: {
    backgroundColor: '#1A1A2E',
    borderRadius: 16,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.25)',
  },
  dropdownTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: spacing.md,
    letterSpacing: -0.2,
  },
  dropdownOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(139,92,246,0.07)',
  },
  dropdownOptionActive: {
    // no background — just text color change
  },
  dropdownOptionText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  dropdownOptionTextActive: {
    color: colors.primary,
    fontWeight: '800',
  },
  dropdownCheck: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
});
