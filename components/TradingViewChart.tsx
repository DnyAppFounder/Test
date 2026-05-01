import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Text,
  TouchableOpacity,
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

export type ChartMode = 'line' | 'area' | 'candlestick' | 'bonding';

interface TradingViewChartProps {
  symbol: string;
  currentPrice?: number;
  pairAddress?: string;
  tokenMint?: string;
}

const TIMEFRAMES: { key: TimeFrame; label: string }[] = [
  { key: '1m', label: '1m' },
  { key: '5m', label: '5m' },
  { key: '1H', label: '1h' },
  { key: '1D', label: '1d' },
  { key: '1W', label: '1w' },
  { key: '1M', label: '1M' },
];

const MODES: { key: ChartMode; label: string }[] = [
  { key: 'area', label: 'Area' },
  { key: 'line', label: 'Line' },
  { key: 'candlestick', label: 'Candles' },
  { key: 'bonding', label: 'Bonding' },
];

const CHART_H = 220;
const VOL_H = 40;
const PAD = { top: 20, right: 60, bottom: 20, left: 4 };
// Refresh every 8 seconds for live feel
const REFRESH_INTERVAL = 8000;
// WebSocket ping interval
const WS_PING_INTERVAL = 5000;

function fmtPrice(p: number): string {
  if (!p || p === 0) return '0';
  if (p >= 10000) return p.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (p >= 1) return p.toFixed(4);
  if (p >= 0.001) return p.toFixed(6);
  if (p >= 0.000001) return p.toFixed(8);
  return p.toExponential(3);
}

function fmtTime(ts: number, tf: TimeFrame): string {
  const d = new Date(ts);
  if (tf === '1D' || tf === '1W' || tf === '1M') {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
}

function calcChange(candles: CandleData[]): { abs: number; pct: number } {
  if (candles.length < 2) return { abs: 0, pct: 0 };
  const first = candles[0].close;
  const last = candles[candles.length - 1].close;
  return { abs: last - first, pct: first !== 0 ? ((last - first) / first) * 100 : 0 };
}

// Bonding curve interpolation: map index to bonding-curve-style x position (log-like)
function bondingX(i: number, n: number, plotW: number, padLeft: number): number {
  if (n <= 1) return padLeft + plotW / 2;
  // Use sqrt to simulate bonding curve shape
  const t = i / (n - 1);
  const curved = Math.sqrt(t);
  return padLeft + curved * plotW;
}

export function TradingViewChart({ symbol, currentPrice, tokenMint }: TradingViewChartProps) {
  const { width: screenWidth } = useWindowDimensions();
  const chartWidth = Math.min(screenWidth - 32, 600);

  const [candles, setCandles] = useState<CandleData[]>([]);
  const [liveCandles, setLiveCandles] = useState<CandleData[]>([]);
  const [timeframe, setTimeframe] = useState<TimeFrame>('1H');
  const [mode, setMode] = useState<ChartMode>('area');
  const [loading, setLoading] = useState(true);
  const [hasData, setHasData] = useState(false);
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const wsTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const displayCandles = liveCandles.length > 0 ? liveCandles : candles;

  const loadData = useCallback(async (tf: TimeFrame, silent = false) => {
    if (!tokenMint) { setLoading(false); return; }
    if (!silent) setLoading(true);
    try {
      if (!silent) chartDataService.clearCache();
      const data = await chartDataService.getOHLCVData(tokenMint, tf);
      if (data && data.length > 0) {
        setCandles(data);
        setHasData(true);
        // Update live candles with base data
        setLiveCandles(data);
      } else {
        setHasData(false);
      }
    } catch {
      setHasData(false);
    } finally {
      setLoading(false);
    }
  }, [tokenMint]);

  // Connect WebSocket for live price updates using Birdeye public stream
  const connectWebSocket = useCallback(() => {
    if (!tokenMint || typeof WebSocket === 'undefined') return;

    // Close any existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (wsTimerRef.current) {
      clearInterval(wsTimerRef.current);
      wsTimerRef.current = null;
    }

    try {
      // Use DexScreener WebSocket for live trades (no API key required)
      const ws = new WebSocket('wss://io.dexscreener.com/dex/screener/pair/solana/' + tokenMint);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        console.log('[Chart WS] Connected for', tokenMint);
        // Send subscription message
        try {
          ws.send(JSON.stringify({ type: 'subscribe', pair: tokenMint }));
        } catch {}
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          // DexScreener sends pair updates with priceUsd
          if (data?.pair?.priceUsd) {
            const newPrice = parseFloat(data.pair.priceUsd);
            if (!isNaN(newPrice) && newPrice > 0) {
              setLivePrice(newPrice);
              // Append to live candles — update last candle's close
              setLiveCandles(prev => {
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

      ws.onerror = () => {
        setWsConnected(false);
      };

      ws.onclose = () => {
        setWsConnected(false);
        wsRef.current = null;
        // Auto-reconnect after 5 seconds
        setTimeout(() => {
          if (tokenMint) connectWebSocket();
        }, 5000);
      };

    } catch (err) {
      console.warn('[Chart WS] Connection failed:', err);
      setWsConnected(false);
    }
  }, [tokenMint]);

  // Load on mount + timeframe change
  useEffect(() => {
    loadData(timeframe, false);
  }, [tokenMint, timeframe, loadData]);

  // Auto-refresh via HTTP polling (fallback when WS not available)
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => loadData(timeframe, true), REFRESH_INTERVAL);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [tokenMint, timeframe, loadData]);

  // WebSocket for live tick data
  useEffect(() => {
    connectWebSocket();
    return () => {
      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent auto-reconnect on unmount
        wsRef.current.close();
        wsRef.current = null;
      }
      if (wsTimerRef.current) clearInterval(wsTimerRef.current);
      setWsConnected(false);
    };
  }, [tokenMint, connectWebSocket]);

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      </View>
    );
  }

  if (!hasData || displayCandles.length < 2) {
    return (
      <View style={styles.container}>
        <View style={styles.unavailableWrap}>
          <Text style={styles.unavailableText}>Chart data unavailable</Text>
          {currentPrice != null && currentPrice > 0 && (
            <Text style={styles.priceFallback}>{fmtPrice(currentPrice)}</Text>
          )}
        </View>
      </View>
    );
  }

  // --- Chart geometry ---
  const plotW = chartWidth - PAD.left - PAD.right;
  const plotH = CHART_H - PAD.top - PAD.bottom;
  const n = displayCandles.length;

  const closes = displayCandles.map(c => c.close);
  const highs = displayCandles.map(c => c.high);
  const lows = displayCandles.map(c => c.low);
  const maxP = Math.max(...highs);
  const minP = Math.min(...lows);
  const priceRange = maxP - minP || maxP * 0.01 || 1;

  const maxVol = Math.max(...displayCandles.map(c => c.volume)) || 1;
  const barW = Math.max(1.5, (plotW / n) * 0.65);
  const candleW = Math.max(2, (plotW / n) * 0.7);

  function xOf(i: number) {
    return PAD.left + (i + 0.5) * (plotW / n);
  }
  function xBonding(i: number) {
    return bondingX(i, n, plotW, PAD.left);
  }
  function yOf(price: number) {
    return PAD.top + plotH - ((price - minP) / priceRange) * plotH;
  }
  function volBarH(vol: number) {
    return Math.max(1, (vol / maxVol) * VOL_H * 0.85);
  }

  const xFn = mode === 'bonding' ? xBonding : xOf;

  // Line/area path
  const linePts = displayCandles.map((c, i) => `${i === 0 ? 'M' : 'L'}${xFn(i).toFixed(1)},${yOf(c.close).toFixed(1)}`).join(' ');
  const bottomY = (PAD.top + plotH).toFixed(1);
  const areaPath = `${linePts} L${xFn(n - 1).toFixed(1)},${bottomY} L${xFn(0).toFixed(1)},${bottomY} Z`;

  // Bonding curve: use a smooth bezier through close prices with sqrt x-mapping
  const bondingPath = displayCandles.map((c, i) => {
    const x = xBonding(i).toFixed(1);
    const y = yOf(c.close).toFixed(1);
    if (i === 0) return `M${x},${y}`;
    const px = xBonding(i - 1);
    const py = yOf(displayCandles[i - 1].close);
    const cx = ((px + parseFloat(x)) / 2).toFixed(1);
    return `C${cx},${py.toFixed(1)} ${cx},${y} ${x},${y}`;
  }).join(' ');
  const bondingArea = `${bondingPath} L${xBonding(n - 1).toFixed(1)},${bottomY} L${xBonding(0).toFixed(1)},${bottomY} Z`;

  // Price grid
  const gridLevels = 4;
  const priceGridLines = Array.from({ length: gridLevels }, (_, i) => {
    const frac = i / (gridLevels - 1);
    const price = minP + priceRange * frac;
    return { price, y: yOf(price) };
  });

  // Time labels
  const timeLabelIndices = [0, Math.floor(n * 0.25), Math.floor(n * 0.5), Math.floor(n * 0.75), n - 1];

  // Current price
  const lastClose = displayCandles[n - 1].close;
  const displayPriceVal = livePrice ?? (currentPrice != null && currentPrice > 0 ? currentPrice : lastClose);
  const currentY = Math.max(PAD.top + 10, Math.min(PAD.top + plotH - 10, yOf(displayPriceVal > maxP ? maxP : displayPriceVal < minP ? minP : displayPriceVal)));

  const { abs: changeAbs, pct: changePct } = calcChange(displayCandles);
  const isUp = changePct >= 0;
  const changeColor = isUp ? '#10b981' : '#ef4444';

  const totalH = CHART_H + VOL_H;

  return (
    <View style={styles.container}>
      {/* Header row: pair label + price + live indicator */}
      <View style={styles.topRow}>
        <View style={styles.pairBlock}>
          <Text style={styles.pairLabel}>{(symbol || 'TOKEN').toUpperCase()}/SOL</Text>
          {wsConnected && <View style={styles.liveDot} />}
        </View>
        <View style={styles.priceChangeBlock}>
          <Text style={styles.livePrice}>{fmtPrice(displayPriceVal)}</Text>
          <Text style={[styles.changePct, { color: changeColor }]}>
            {isUp ? '+' : ''}{fmtPrice(Math.abs(changeAbs))} ({isUp ? '+' : ''}{changePct.toFixed(2)}%)
          </Text>
        </View>
      </View>

      {/* Controls row: timeframes + view modes */}
      <View style={styles.controlsRow}>
        <View style={styles.tfRow}>
          {TIMEFRAMES.map(tf => (
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

      {/* Mode row */}
      <View style={styles.modeRow}>
        {MODES.map(m => (
          <TouchableOpacity
            key={m.key}
            style={[styles.modeBtn, mode === m.key && styles.modeBtnActive]}
            onPress={() => setMode(m.key)}
            activeOpacity={0.7}
          >
            <Text style={[styles.modeText, mode === m.key && styles.modeTextActive]}>{m.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

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
            <SvgLinearGradient id="bondingLine" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0%" stopColor="#4C1D95" stopOpacity="0.6" />
              <Stop offset="50%" stopColor="#8B5CF6" stopOpacity="1" />
              <Stop offset="100%" stopColor="#A78BFA" stopOpacity="1" />
            </SvgLinearGradient>
          </Defs>

          {/* Grid lines */}
          {priceGridLines.map(({ price, y }, i) => (
            <G key={`g${i}`}>
              <Line
                x1={PAD.left}
                y1={y}
                x2={chartWidth - PAD.right}
                y2={y}
                stroke="rgba(255,255,255,0.04)"
                strokeWidth={1}
              />
              <SvgText
                x={chartWidth - PAD.right + 4}
                y={y + 4}
                fontSize={9}
                fill="rgba(255,255,255,0.3)"
                textAnchor="start"
              >
                {fmtPrice(price)}
              </SvgText>
            </G>
          ))}

          {/* ── AREA MODE ── */}
          {mode === 'area' && (
            <>
              <Path d={areaPath} fill="url(#areaGrad)" />
              <Path d={linePts} stroke="rgba(139,92,246,0.35)" strokeWidth={6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <Path d={linePts} stroke="#A78BFA" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </>
          )}

          {/* ── LINE MODE ── */}
          {mode === 'line' && (
            <>
              <Path d={linePts} stroke="rgba(139,92,246,0.25)" strokeWidth={5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <Path d={linePts} stroke="#A78BFA" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              {/* Highlight last point */}
              <Circle
                cx={xOf(n - 1)}
                cy={yOf(displayCandles[n - 1].close)}
                r={4}
                fill="#A78BFA"
                opacity={0.9}
              />
              <Circle
                cx={xOf(n - 1)}
                cy={yOf(displayCandles[n - 1].close)}
                r={8}
                fill="#8B5CF6"
                opacity={0.2}
              />
            </>
          )}

          {/* ── BONDING CURVE MODE ── */}
          {mode === 'bonding' && (
            <>
              <Path d={bondingArea} fill="url(#bondingGrad)" />
              {/* Outer glow */}
              <Path d={bondingPath} stroke="rgba(167,139,250,0.2)" strokeWidth={8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              {/* Main line */}
              <Path d={bondingPath} stroke="#A78BFA" strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              {/* Milestone dots along curve */}
              {[0, Math.floor(n * 0.25), Math.floor(n * 0.5), Math.floor(n * 0.75), n - 1].map(i => {
                if (i >= n) return null;
                return (
                  <Circle
                    key={`dot${i}`}
                    cx={xBonding(i)}
                    cy={yOf(displayCandles[i].close)}
                    r={i === n - 1 ? 5 : 3}
                    fill={i === n - 1 ? '#A78BFA' : 'rgba(167,139,250,0.6)'}
                    stroke={i === n - 1 ? '#fff' : 'none'}
                    strokeWidth={i === n - 1 ? 1 : 0}
                  />
                );
              })}
            </>
          )}

          {/* ── CANDLESTICK MODE ── */}
          {mode === 'candlestick' && displayCandles.map((c, i) => {
            const isUpCandle = c.close >= c.open;
            const col = isUpCandle ? '#10b981' : '#ef4444';
            const bodyTop = yOf(Math.max(c.open, c.close));
            const bodyBot = yOf(Math.min(c.open, c.close));
            const bodyH = Math.max(1.5, bodyBot - bodyTop);
            const cx = xOf(i);
            return (
              <G key={`c${i}`}>
                {/* Wick */}
                <Line
                  x1={cx}
                  y1={yOf(c.high)}
                  x2={cx}
                  y2={yOf(c.low)}
                  stroke={col}
                  strokeWidth={1}
                  opacity={0.8}
                />
                {/* Body */}
                <Rect
                  x={cx - candleW / 2}
                  y={bodyTop}
                  width={candleW}
                  height={bodyH}
                  fill={col}
                  opacity={0.85}
                  rx={1}
                />
              </G>
            );
          })}

          {/* Current price dashed line + label */}
          <Line
            x1={PAD.left}
            y1={currentY}
            x2={chartWidth - PAD.right}
            y2={currentY}
            stroke="#A78BFA"
            strokeWidth={1}
            strokeDasharray="4,3"
            opacity={0.5}
          />
          <Rect
            x={chartWidth - PAD.right + 1}
            y={currentY - 9}
            width={PAD.right - 2}
            height={18}
            fill="#7C3AED"
            rx={3}
          />
          <SvgText
            x={chartWidth - PAD.right + PAD.right / 2}
            y={currentY + 4}
            fontSize={8.5}
            fill="#fff"
            textAnchor="middle"
            fontWeight="700"
          >
            {fmtPrice(displayPriceVal)}
          </SvgText>

          {/* Volume bars */}
          {displayCandles.map((c, i) => {
            const isUpBar = c.close >= c.open;
            const h = volBarH(c.volume);
            const vx = xOf(i);
            const vy = CHART_H + VOL_H - h;
            return (
              <Rect
                key={`v${i}`}
                x={vx - barW / 2}
                y={vy}
                width={barW}
                height={h}
                fill={isUpBar ? '#10b981' : '#ef4444'}
                opacity={0.45}
              />
            );
          })}

          {/* X-axis time labels */}
          {timeLabelIndices.map(i => {
            if (i >= n) return null;
            return (
              <SvgText
                key={`t${i}`}
                x={xOf(i)}
                y={totalH - 2}
                fontSize={9}
                fill="rgba(255,255,255,0.3)"
                textAnchor="middle"
              >
                {fmtTime(displayCandles[i].timestamp, timeframe)}
              </SvgText>
            );
          })}
        </Svg>
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
    borderColor: 'rgba(139,92,246,0.12)',
  },
  loadingWrap: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  unavailableWrap: {
    height: 160,
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
    fontSize: fontSize.xxl,
    fontWeight: '800',
    color: colors.primary,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  pairBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pairLabel: {
    fontSize: fontSize.md,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: 0.3,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#10b981',
  },
  priceChangeBlock: {
    alignItems: 'flex-end',
  },
  livePrice: {
    fontSize: fontSize.md,
    fontWeight: '800',
    color: '#A78BFA',
    letterSpacing: -0.2,
  },
  changePct: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    marginTop: 1,
  },
  controlsRow: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
  },
  tfRow: {
    flexDirection: 'row',
    gap: 4,
  },
  tfBtn: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: borderRadius.sm,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  tfBtnActive: {
    backgroundColor: colors.primary,
  },
  tfText: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.35)',
  },
  tfTextActive: {
    color: '#fff',
  },
  modeRow: {
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  modeBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  modeBtnActive: {
    backgroundColor: 'rgba(139,92,246,0.25)',
    borderColor: 'rgba(139,92,246,0.5)',
  },
  modeText: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.3)',
  },
  modeTextActive: {
    color: '#C4B5FD',
  },
  svgWrap: {
    paddingBottom: 4,
  },
});
