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
} from 'react-native-svg';
import { colors, spacing, fontSize, borderRadius } from '@/constants/theme';
import { chartDataService, CandleData, TimeFrame } from '@/services/chartDataService';

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

// Chart layout constants
const CHART_H = 220;
const VOL_H = 48;
const PAD = { top: 20, right: 60, bottom: 24, left: 4 };
// Auto-refresh every 15 seconds
const REFRESH_INTERVAL = 15000;

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

export function TradingViewChart({ symbol, currentPrice, tokenMint }: TradingViewChartProps) {
  const { width: screenWidth } = useWindowDimensions();
  // leave room for horizontal padding from parent
  const chartWidth = Math.min(screenWidth - 32, 600);

  const [candles, setCandles] = useState<CandleData[]>([]);
  const [timeframe, setTimeframe] = useState<TimeFrame>('1H');
  const [loading, setLoading] = useState(true);
  const [hasData, setHasData] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = useCallback(async (tf: TimeFrame, silent = false) => {
    if (!tokenMint) { setLoading(false); return; }
    if (!silent) setLoading(true);
    try {
      // clear cache so we always get fresh data on explicit timeframe change
      if (!silent) chartDataService.clearCache();
      const data = await chartDataService.getOHLCVData(tokenMint, tf);
      if (data && data.length > 0) {
        setCandles(data);
        setHasData(true);
      } else {
        setHasData(false);
      }
    } catch {
      setHasData(false);
    } finally {
      setLoading(false);
    }
  }, [tokenMint]);

  // Load on mount + timeframe change
  useEffect(() => {
    loadData(timeframe, false);
  }, [tokenMint, timeframe, loadData]);

  // Auto-refresh silently
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => loadData(timeframe, true), REFRESH_INTERVAL);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [tokenMint, timeframe, loadData]);

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      </View>
    );
  }

  if (!hasData || candles.length < 2) {
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

  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const maxP = Math.max(...highs);
  const minP = Math.min(...lows);
  const priceRange = maxP - minP || maxP * 0.01 || 1;

  const maxVol = Math.max(...candles.map(c => c.volume)) || 1;
  const n = candles.length;
  const barW = Math.max(1, (plotW / n) * 0.7);

  function xOf(i: number) {
    return PAD.left + (i + 0.5) * (plotW / n);
  }
  function yOf(price: number) {
    return PAD.top + plotH - ((price - minP) / priceRange) * plotH;
  }
  function volBarH(vol: number) {
    return Math.max(1, (vol / maxVol) * VOL_H * 0.9);
  }

  // Line path
  const linePts = candles.map((c, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOf(c.close).toFixed(1)}`).join(' ');
  // Area fill (gradient)
  const bottomY = (PAD.top + plotH).toFixed(1);
  const areaPath = `${linePts} L${xOf(n - 1).toFixed(1)},${bottomY} L${PAD.left.toFixed(1)},${bottomY} Z`;

  // Price grid (4 lines)
  const gridLevels = 4;
  const priceGridLines = Array.from({ length: gridLevels }, (_, i) => {
    const frac = i / (gridLevels - 1);
    const price = minP + priceRange * frac;
    return { price, y: yOf(price) };
  });

  // Time labels (5 evenly spaced)
  const timeLabelIndices = [0, Math.floor(n * 0.25), Math.floor(n * 0.5), Math.floor(n * 0.75), n - 1];

  // Current price
  const lastClose = candles[n - 1].close;
  const displayPrice = (currentPrice != null && currentPrice > 0) ? currentPrice : lastClose;
  const currentY = yOf(displayPrice > maxP ? maxP : displayPrice < minP ? minP : displayPrice);

  const { abs: changeAbs, pct: changePct } = calcChange(candles);
  const isUp = changePct >= 0;
  const changeColor = isUp ? '#10b981' : '#ef4444';

  const totalH = CHART_H + VOL_H;

  return (
    <View style={styles.container}>
      {/* Header row: pair label + price + change */}
      <View style={styles.topRow}>
        <Text style={styles.pairLabel}>{(symbol || 'TOKEN').toUpperCase()}/SOL</Text>
        <View style={styles.priceChangeBlock}>
          <Text style={styles.livePrice}>{fmtPrice(displayPrice)}</Text>
          <Text style={[styles.changePct, { color: changeColor }]}>
            {isUp ? '+' : ''}{fmtPrice(Math.abs(changeAbs))} ({isUp ? '+' : ''}{changePct.toFixed(2)}%)
          </Text>
        </View>
      </View>

      {/* Timeframe selector */}
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

      {/* SVG chart */}
      <View style={styles.svgWrap}>
        <Svg width={chartWidth} height={totalH}>
          <Defs>
            {/* Purple area gradient */}
            <SvgLinearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.35" />
              <Stop offset="70%" stopColor="#8B5CF6" stopOpacity="0.08" />
              <Stop offset="100%" stopColor="#8B5CF6" stopOpacity="0" />
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
                stroke="rgba(255,255,255,0.05)"
                strokeWidth={1}
              />
              <SvgText
                x={chartWidth - PAD.right + 4}
                y={y + 4}
                fontSize={9}
                fill="rgba(255,255,255,0.35)"
                textAnchor="start"
              >
                {fmtPrice(price)}
              </SvgText>
            </G>
          ))}

          {/* Area fill */}
          <Path d={areaPath} fill="url(#areaGrad)" />

          {/* Purple glow line — draw twice for glow effect */}
          <Path d={linePts} stroke="rgba(139,92,246,0.3)" strokeWidth={5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <Path d={linePts} stroke="#A78BFA" strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" />

          {/* Current price dashed line + label */}
          <Line
            x1={PAD.left}
            y1={currentY}
            x2={chartWidth - PAD.right}
            y2={currentY}
            stroke="#A78BFA"
            strokeWidth={1}
            strokeDasharray="4,3"
            opacity={0.6}
          />
          {/* Price label box on right */}
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
            {fmtPrice(displayPrice)}
          </SvgText>

          {/* Volume bars */}
          {candles.map((c, i) => {
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
                opacity={0.5}
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
                y={totalH - 4}
                fontSize={9}
                fill="rgba(255,255,255,0.35)"
                textAnchor="middle"
              >
                {fmtTime(candles[i].timestamp, timeframe)}
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
  pairLabel: {
    fontSize: fontSize.md,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: 0.3,
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
  tfRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  tfBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: borderRadius.sm,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  tfBtnActive: {
    backgroundColor: colors.primary,
  },
  tfText: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.4)',
  },
  tfTextActive: {
    color: '#fff',
  },
  svgWrap: {
    paddingHorizontal: 0,
    paddingBottom: 4,
  },
});
