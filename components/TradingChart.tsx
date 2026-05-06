import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Dimensions, ScrollView } from 'react-native';
import Svg, { Line, Rect, Path, Text as SvgText, Defs, LinearGradient, Stop } from 'react-native-svg';
import { colors, spacing, fontSize, borderRadius } from '@/constants/theme';
import { CandleData, TimeFrame } from '@/services/chartDataService';
import { realtimeChartService, CandleUpdateListener } from '@/services/realtimeChartService';

type ChartMode = 'candles' | 'line' | 'area' | 'bars' | 'mountain' | 'bonding';

const CHART_HEIGHT = 340;
const PRICE_AXIS_WIDTH = 64;
const VOLUME_HEIGHT = 52;
const VOLUME_GAP = 8;
const PADDING_TOP = 12;
const PADDING_BOTTOM = 4;
const MIN_CANDLE_WIDTH = 4;
const MAX_CANDLE_WIDTH = 20;
const CANDLE_GAP_RATIO = 0.25; // gap = candleWidth * ratio

const CHART_MODES: { id: ChartMode; label: string }[] = [
  { id: 'candles', label: 'Candles' },
  { id: 'area',    label: 'Area' },
  { id: 'line',    label: 'Line' },
  { id: 'mountain', label: 'Mountain' },
  { id: 'bars',    label: 'Bars' },
  { id: 'bonding', label: 'Bonding' },
];

interface TradingChartProps {
  tokenAddress: string;
  currentPrice?: number;
}

function deduplicateCandles(candles: CandleData[]): CandleData[] {
  const seen = new Map<number, CandleData>();
  for (const c of candles) {
    const existing = seen.get(c.timestamp);
    if (!existing || c.volume > existing.volume) {
      seen.set(c.timestamp, c);
    }
  }
  return Array.from(seen.values()).sort((a, b) => a.timestamp - b.timestamp);
}

function formatPrice(price: number): string {
  if (price === 0) return '0';
  if (price >= 1000) return price.toFixed(0);
  if (price >= 1) return price.toFixed(2);
  if (price >= 0.01) return price.toFixed(4);
  if (price >= 0.0001) return price.toFixed(6);
  return price.toExponential(2);
}

function formatVolume(vol: number): string {
  if (vol >= 1_000_000) return `${(vol / 1_000_000).toFixed(1)}M`;
  if (vol >= 1_000) return `${(vol / 1_000).toFixed(1)}K`;
  return vol.toFixed(0);
}

export function TradingChart({ tokenAddress, currentPrice }: TradingChartProps) {
  const [rawCandles, setRawCandles] = useState<CandleData[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeFrame, setTimeFrame] = useState<TimeFrame>('15m');
  const [chartMode, setChartMode] = useState<ChartMode>('candles');
  const [containerWidth, setContainerWidth] = useState(
    Dimensions.get('window').width - 32
  );

  const timeFrames: TimeFrame[] = ['1m', '5m', '15m', '1H', '4H', '1D'];

  const listenerRef = useRef<CandleUpdateListener | null>(null);
  const currentTokenRef = useRef<string>('');
  const currentTfRef = useRef<TimeFrame>('15m');

  const handleCandleUpdate = useCallback((updated: CandleData[]) => {
    const deduped = deduplicateCandles(updated);
    if (process.env.NODE_ENV !== 'production') {
      const dups = updated.length - deduped.length;
      console.log(
        `[Chart] mode=${chartMode} tf=${timeFrame} candles=${deduped.length}` +
        (dups > 0 ? ` (${dups} dupes removed)` : '') +
        (deduped.length > 0 ? ` latest=${new Date(deduped[deduped.length - 1].timestamp).toISOString()}` : '')
      );
    }
    setRawCandles(deduped);
    setLoading(false);
  }, [chartMode, timeFrame]);

  useEffect(() => {
    if (!tokenAddress) return;

    if (listenerRef.current) {
      realtimeChartService.unsubscribe(
        currentTokenRef.current,
        currentTfRef.current,
        listenerRef.current
      );
    }

    currentTokenRef.current = tokenAddress;
    currentTfRef.current = timeFrame;
    listenerRef.current = handleCandleUpdate;
    setLoading(true);
    setRawCandles([]);

    realtimeChartService
      .subscribe(tokenAddress, timeFrame, handleCandleUpdate)
      .then((initial) => {
        if (initial.length > 0) {
          handleCandleUpdate(initial);
        }
      })
      .catch((err) => {
        console.error('[TradingChart] Subscribe error:', err);
        setLoading(false);
      });

    return () => {
      if (listenerRef.current) {
        realtimeChartService.unsubscribe(tokenAddress, timeFrame, listenerRef.current);
        listenerRef.current = null;
      }
    };
  }, [tokenAddress, timeFrame]);

  // ─── Layout calculations ────────────────────────────────────────────────────

  const chartAreaWidth = containerWidth - PRICE_AXIS_WIDTH;
  const priceChartHeight = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM - VOLUME_HEIGHT - VOLUME_GAP;

  const candles = rawCandles;

  // Compute candle width based on count
  const rawCandleWidth = candles.length > 0
    ? Math.max(MIN_CANDLE_WIDTH, Math.min(MAX_CANDLE_WIDTH, (chartAreaWidth / candles.length)))
    : 8;
  const bodyWidth = Math.max(2, rawCandleWidth * (1 - CANDLE_GAP_RATIO));

  // Price scale
  const prices = candles.length > 0
    ? candles.flatMap(c => [c.high, c.low])
    : [1, 0];
  const rawMax = Math.max(...prices);
  const rawMin = Math.min(...prices);
  const rawRange = rawMax - rawMin || rawMax * 0.1 || 1;
  const priceMax = rawMax + rawRange * 0.05;
  const priceMin = Math.max(0, rawMin - rawRange * 0.05);
  const priceRange = priceMax - priceMin || 1;

  const priceToY = (price: number): number => {
    const ratio = (price - priceMin) / priceRange;
    return PADDING_TOP + priceChartHeight - ratio * priceChartHeight;
  };

  // Volume scale
  const volumes = candles.map(c => c.volume);
  const maxVol = Math.max(...volumes, 1);
  const volBaseY = PADDING_TOP + priceChartHeight + VOLUME_GAP + VOLUME_HEIGHT;
  const volToHeight = (v: number) => (v / maxVol) * VOLUME_HEIGHT;

  // X coordinate for candle index (right-aligned: latest at right edge)
  const xOf = (index: number): number => {
    if (candles.length === 1) return chartAreaWidth / 2;
    const totalUsed = candles.length * rawCandleWidth;
    const startX = Math.max(0, chartAreaWidth - totalUsed);
    return startX + index * rawCandleWidth + rawCandleWidth / 2;
  };

  // ─── Price axis labels (right side, no overlap) ─────────────────────────────

  const renderPriceAxis = () => {
    const steps = 5;
    const labels: { y: number; label: string }[] = [];
    for (let i = 0; i <= steps; i++) {
      const ratio = i / steps;
      const price = priceMin + ratio * priceRange;
      const y = PADDING_TOP + priceChartHeight - ratio * priceChartHeight;
      labels.push({ y, label: formatPrice(price) });
    }

    // Current price label
    const cpY = currentPrice !== undefined ? priceToY(currentPrice) : null;

    return (
      <View style={[styles.priceAxis, { width: PRICE_AXIS_WIDTH }]}>
        <Svg width={PRICE_AXIS_WIDTH} height={CHART_HEIGHT}>
          {labels.map((l, i) => (
            <SvgText
              key={i}
              x={4}
              y={l.y + 4}
              fontSize="9"
              fill="rgba(255,255,255,0.35)"
              fontWeight="500"
            >
              {l.label}
            </SvgText>
          ))}
          {cpY !== null && cpY > PADDING_TOP && cpY < PADDING_TOP + priceChartHeight && (
            <>
              <Rect
                x={0}
                y={cpY - 9}
                width={PRICE_AXIS_WIDTH - 2}
                height={14}
                rx={3}
                fill={colors.primary}
              />
              <SvgText
                x={3}
                y={cpY + 2}
                fontSize="9"
                fill="#fff"
                fontWeight="700"
              >
                {currentPrice !== undefined ? formatPrice(currentPrice) : ''}
              </SvgText>
            </>
          )}
        </Svg>
      </View>
    );
  };

  // ─── Grid lines ─────────────────────────────────────────────────────────────

  const renderGrid = () => {
    const steps = 5;
    return Array.from({ length: steps + 1 }, (_, i) => {
      const ratio = i / steps;
      const y = PADDING_TOP + priceChartHeight - ratio * priceChartHeight;
      return (
        <Line
          key={i}
          x1={0} y1={y}
          x2={chartAreaWidth} y2={y}
          stroke="rgba(255,255,255,0.05)"
          strokeWidth="1"
        />
      );
    });
  };

  // ─── Candlestick mode ────────────────────────────────────────────────────────

  const renderCandles = () =>
    candles.map((c, i) => {
      const x = xOf(i);
      const isGreen = c.close >= c.open;
      const col = isGreen ? colors.success : colors.error;
      const openY  = priceToY(c.open);
      const closeY = priceToY(c.close);
      const highY  = priceToY(c.high);
      const lowY   = priceToY(c.low);
      const bodyTop = Math.min(openY, closeY);
      const bodyH   = Math.max(1, Math.abs(closeY - openY));
      return (
        <>
          <Line key={`wick-${i}`} x1={x} y1={highY} x2={x} y2={lowY} stroke={col} strokeWidth="1" />
          <Rect
            key={`body-${i}`}
            x={x - bodyWidth / 2}
            y={bodyTop}
            width={bodyWidth}
            height={bodyH}
            fill={col}
          />
        </>
      );
    });

  // ─── Line/Area/Mountain shared path ─────────────────────────────────────────

  const buildLinePath = (): string => {
    if (candles.length === 0) return '';
    return candles.map((c, i) => {
      const x = xOf(i);
      const y = priceToY(c.close);
      return i === 0 ? `M${x},${y}` : `L${x},${y}`;
    }).join(' ');
  };

  const buildAreaPath = (): string => {
    if (candles.length === 0) return '';
    const baseY = PADDING_TOP + priceChartHeight;
    const first = `M${xOf(0)},${baseY}`;
    const line = candles.map((c, i) => `L${xOf(i)},${priceToY(c.close)}`).join(' ');
    const last = `L${xOf(candles.length - 1)},${baseY} Z`;
    return `${first} ${line} ${last}`;
  };

  const isPositiveTrend = candles.length >= 2
    ? candles[candles.length - 1].close >= candles[0].close
    : true;
  const trendColor = isPositiveTrend ? colors.success : colors.error;

  const renderLine = () => {
    const path = buildLinePath();
    if (!path) return null;
    return <Path d={path} stroke={trendColor} strokeWidth="1.5" fill="none" strokeLinejoin="round" />;
  };

  const renderArea = () => {
    const areaPath = buildAreaPath();
    const linePath = buildLinePath();
    if (!areaPath) return null;
    return (
      <>
        <Defs>
          <LinearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={trendColor} stopOpacity="0.35" />
            <Stop offset="100%" stopColor={trendColor} stopOpacity="0.02" />
          </LinearGradient>
        </Defs>
        <Path d={areaPath} fill="url(#areaGrad)" stroke="none" />
        <Path d={linePath} stroke={trendColor} strokeWidth="1.5" fill="none" strokeLinejoin="round" />
      </>
    );
  };

  const renderMountain = () => {
    // Mountain = area but with a stronger fill gradient, filled to zero price
    const areaPath = buildAreaPath();
    const linePath = buildLinePath();
    if (!areaPath) return null;
    return (
      <>
        <Defs>
          <LinearGradient id="mountainGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={trendColor} stopOpacity="0.55" />
            <Stop offset="100%" stopColor={trendColor} stopOpacity="0.05" />
          </LinearGradient>
        </Defs>
        <Path d={areaPath} fill="url(#mountainGrad)" stroke="none" />
        <Path d={linePath} stroke={trendColor} strokeWidth="2" fill="none" strokeLinejoin="round" />
      </>
    );
  };

  // ─── Bars mode (volume only, full height) ────────────────────────────────────

  const renderBarsMode = () => {
    // In Bars mode: show volume bars full-height, no price chart
    const barsH = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM;
    return candles.map((c, i) => {
      const x = xOf(i);
      const isGreen = c.close >= c.open;
      const col = isGreen ? colors.success : colors.error;
      const barH = (c.volume / maxVol) * (barsH * 0.85);
      return (
        <Rect
          key={`bar-${i}`}
          x={x - bodyWidth / 2}
          y={PADDING_TOP + barsH - barH}
          width={bodyWidth}
          height={Math.max(1, barH)}
          fill={col}
          opacity={0.75}
        />
      );
    });
  };

  // ─── Bonding curve mode ──────────────────────────────────────────────────────

  const renderBonding = () => {
    // Bonding = smooth monotonic line showing price discovery (close prices)
    if (candles.length < 2) return null;
    const path = buildLinePath();
    const areaPath = buildAreaPath();
    return (
      <>
        <Defs>
          <LinearGradient id="bondGrad" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0%" stopColor="#f59e0b" stopOpacity="0.6" />
            <Stop offset="100%" stopColor={colors.success} stopOpacity="0.6" />
          </LinearGradient>
          <LinearGradient id="bondFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor="#f59e0b" stopOpacity="0.2" />
            <Stop offset="100%" stopColor="#f59e0b" stopOpacity="0.02" />
          </LinearGradient>
        </Defs>
        <Path d={areaPath} fill="url(#bondFill)" stroke="none" />
        <Path d={path} stroke="url(#bondGrad)" strokeWidth="2" fill="none" strokeLinejoin="round" />
        {/* Mark latest point */}
        {candles.length > 0 && (() => {
          const last = candles[candles.length - 1];
          const lx = xOf(candles.length - 1);
          const ly = priceToY(last.close);
          return (
            <>
              <Line x1={lx} y1={PADDING_TOP} x2={lx} y2={PADDING_TOP + priceChartHeight} stroke="rgba(245,158,11,0.3)" strokeWidth="1" strokeDasharray="3,3" />
              <Rect x={lx - 3} y={ly - 3} width={6} height={6} rx={3} fill="#f59e0b" />
            </>
          );
        })()}
      </>
    );
  };

  // ─── Volume bars (bottom section, shared by all price-based modes) ───────────

  const renderVolumeBars = () =>
    candles.map((c, i) => {
      const x = xOf(i);
      const isGreen = c.close >= c.open;
      const col = isGreen ? 'rgba(20,241,149,0.35)' : 'rgba(255,77,79,0.35)';
      const h = Math.max(1, volToHeight(c.volume));
      return (
        <Rect
          key={`vol-${i}`}
          x={x - bodyWidth / 2}
          y={volBaseY - h}
          width={bodyWidth}
          height={h}
          fill={col}
        />
      );
    });

  // ─── Current price line ──────────────────────────────────────────────────────

  const renderCurrentPriceLine = () => {
    if (currentPrice === undefined) return null;
    const y = priceToY(currentPrice);
    if (y < PADDING_TOP || y > PADDING_TOP + priceChartHeight) return null;
    return (
      <Line
        x1={0} y1={y}
        x2={chartAreaWidth} y2={y}
        stroke={colors.primary}
        strokeWidth="0.8"
        strokeDasharray="4,4"
        opacity={0.7}
      />
    );
  };

  // ─── Main SVG chart ──────────────────────────────────────────────────────────

  const renderChart = () => {
    const svgH = CHART_HEIGHT;
    const isBarsMode = chartMode === 'bars';

    return (
      <Svg width={chartAreaWidth} height={svgH}>
        {!isBarsMode && renderGrid()}
        {!isBarsMode && renderCurrentPriceLine()}

        {chartMode === 'candles'  && renderCandles()}
        {chartMode === 'line'     && renderLine()}
        {chartMode === 'area'     && renderArea()}
        {chartMode === 'mountain' && renderMountain()}
        {chartMode === 'bars'     && renderBarsMode()}
        {chartMode === 'bonding'  && renderBonding()}

        {!isBarsMode && renderVolumeBars()}
      </Svg>
    );
  };

  // ─── Stats ───────────────────────────────────────────────────────────────────

  const latestCandle = candles[candles.length - 1];
  const firstCandle  = candles[0];
  const priceChange  = latestCandle && firstCandle
    ? ((latestCandle.close - firstCandle.open) / (firstCandle.open || 1)) * 100
    : 0;
  const isPositive = priceChange >= 0;

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <View
      style={styles.container}
      onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.priceSection}>
          {currentPrice !== undefined && (
            <Text style={styles.currentPrice}>
              ${formatPrice(currentPrice)}
            </Text>
          )}
          {latestCandle && (
            <Text style={[styles.priceChange, isPositive ? styles.up : styles.down]}>
              {isPositive ? '+' : ''}{priceChange.toFixed(2)}%
            </Text>
          )}
        </View>
        <View style={styles.liveIndicator}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
      </View>

      {/* Timeframe selector */}
      <View style={styles.row}>
        {timeFrames.map((tf) => (
          <TouchableOpacity
            key={tf}
            style={[styles.tfBtn, timeFrame === tf && styles.tfBtnActive]}
            onPress={() => setTimeFrame(tf)}
          >
            <Text style={[styles.tfText, timeFrame === tf && styles.tfTextActive]}>{tf}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Chart mode selector */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.modeRow} contentContainerStyle={styles.modeRowContent}>
        {CHART_MODES.map((m) => (
          <TouchableOpacity
            key={m.id}
            style={[styles.modeBtn, chartMode === m.id && styles.modeBtnActive]}
            onPress={() => setChartMode(m.id)}
          >
            <Text style={[styles.modeText, chartMode === m.id && styles.modeTextActive]}>{m.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Chart area */}
      <View style={styles.chartWrap}>
        {loading ? (
          <View style={styles.loader}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loaderText}>Loading chart...</Text>
          </View>
        ) : candles.length === 0 ? (
          <View style={styles.loader}>
            <Text style={styles.loaderText}>No chart data available</Text>
          </View>
        ) : (
          <View style={styles.chartInner}>
            {renderChart()}
            {chartMode !== 'bars' && renderPriceAxis()}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  priceSection: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  currentPrice: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  priceChange: {
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  up: { color: colors.success },
  down: { color: colors.error },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(16,185,129,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  liveText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.success,
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  tfBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceLight,
  },
  tfBtnActive: {
    backgroundColor: colors.primary,
  },
  tfText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
  },
  tfTextActive: {
    color: '#fff',
  },
  modeRow: {
    marginBottom: spacing.sm,
  },
  modeRowContent: {
    gap: spacing.xs,
    paddingRight: spacing.xs,
  },
  modeBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  modeBtnActive: {
    borderColor: colors.primary,
    backgroundColor: `${colors.primary}20`,
  },
  modeText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textMuted,
  },
  modeTextActive: {
    color: colors.primary,
  },
  chartWrap: {
    height: CHART_HEIGHT,
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  loaderText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: '600',
  },
  chartInner: {
    flexDirection: 'row',
    height: CHART_HEIGHT,
  },
});
