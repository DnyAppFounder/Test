import { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, TouchableOpacity, useWindowDimensions, Platform } from 'react-native';
import Svg, { Path, Line, Rect, Text as SvgText, G } from 'react-native-svg';
import { colors, spacing, fontSize, borderRadius } from '@/constants/theme';
import { chartDataService, CandleData, TimeFrame } from '@/services/chartDataService';

interface TradingViewChartProps {
  symbol: string;
  currentPrice?: number;
  pairAddress?: string;
  tokenMint?: string;
}

const TIMEFRAMES: TimeFrame[] = ['15m', '1H', '4H', '1D', '1W'];
const CHART_HEIGHT = 280;
const VOLUME_HEIGHT = 60;
const PADDING = { top: 24, right: 56, bottom: 4, left: 8 };

function formatPrice(price: number): string {
  if (price === 0) return '0';
  if (price >= 1000) return `$${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  if (price >= 1) return `$${price.toFixed(4)}`;
  if (price >= 0.001) return `$${price.toFixed(6)}`;
  return `$${price.toExponential(3)}`;
}

function formatVolume(v: number): string {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

function formatTime(ts: number, tf: TimeFrame): string {
  const d = new Date(ts);
  if (tf === '1D' || tf === '1W' || tf === '1M') {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function TradingViewChart({ symbol, currentPrice, tokenMint }: TradingViewChartProps) {
  const { width: screenWidth } = useWindowDimensions();
  const chartWidth = Math.min(screenWidth - spacing.xxl * 2, 600);

  const [candles, setCandles] = useState<CandleData[]>([]);
  const [timeframe, setTimeframe] = useState<TimeFrame>('1H');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [chartType, setChartType] = useState<'candle' | 'line'>('candle');

  const loadData = useCallback(async () => {
    if (!tokenMint) {
      setError(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(false);
    try {
      const data = await chartDataService.getOHLCVData(tokenMint, timeframe);
      if (data.length > 0) {
        setCandles(data);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [tokenMint, timeframe]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading chart...</Text>
        </View>
      </View>
    );
  }

  if (error || candles.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.unavailableContainer}>
          <Text style={styles.unavailableTitle}>Chart not available</Text>
          {currentPrice !== undefined && currentPrice > 0 && (
            <Text style={styles.priceOnly}>{formatPrice(currentPrice)}</Text>
          )}
        </View>
      </View>
    );
  }

  // Build chart geometry
  const plotW = chartWidth - PADDING.left - PADDING.right;
  const plotH = CHART_HEIGHT - PADDING.top - PADDING.bottom;

  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const maxPrice = Math.max(...highs);
  const minPrice = Math.min(...lows);
  const priceRange = maxPrice - minPrice || 1;

  const maxVol = Math.max(...candles.map(c => c.volume)) || 1;

  const candleCount = candles.length;
  const candleW = Math.max(2, plotW / candleCount - 1);

  function xOf(i: number) {
    return PADDING.left + (i + 0.5) * (plotW / candleCount);
  }
  function yOf(price: number) {
    return PADDING.top + plotH - ((price - minPrice) / priceRange) * plotH;
  }
  function volH(vol: number) {
    return (vol / maxVol) * VOLUME_HEIGHT;
  }

  // Price levels (5 grid lines)
  const levels = 5;
  const priceGrid = Array.from({ length: levels }, (_, i) => {
    const price = minPrice + (priceRange * i) / (levels - 1);
    const y = yOf(price);
    return { price, y };
  });

  // Current price line
  const lastClose = candles[candles.length - 1].close;
  const currentY = yOf(lastClose);

  // Line chart path
  const linePath = candles.map((c, i) => {
    const x = xOf(i);
    const y = yOf(c.close);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  // Area fill path (under line)
  const areaPath = linePath + ` L${xOf(candleCount - 1).toFixed(1)},${(PADDING.top + plotH).toFixed(1)} L${PADDING.left.toFixed(1)},${(PADDING.top + plotH).toFixed(1)} Z`;

  const totalHeight = CHART_HEIGHT + VOLUME_HEIGHT + 24;

  return (
    <View style={styles.container}>
      {/* Header controls */}
      <View style={styles.chartHeader}>
        <View style={styles.priceRow}>
          <Text style={styles.chartPrice}>{formatPrice(lastClose)}</Text>
          <Text style={[styles.chartSymbol, { color: colors.textMuted }]}>{symbol}</Text>
        </View>
        <TouchableOpacity
          style={styles.chartTypeToggle}
          onPress={() => setChartType(t => t === 'candle' ? 'line' : 'candle')}
        >
          <Text style={styles.chartTypeText}>{chartType === 'candle' ? '┤' : '∿'}</Text>
        </TouchableOpacity>
      </View>

      {/* Timeframe selector */}
      <View style={styles.tfRow}>
        {TIMEFRAMES.map(tf => (
          <TouchableOpacity
            key={tf}
            style={[styles.tfButton, timeframe === tf && styles.tfButtonActive]}
            onPress={() => setTimeframe(tf)}
          >
            <Text style={[styles.tfText, timeframe === tf && styles.tfTextActive]}>{tf}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* SVG Chart */}
      <View style={styles.svgContainer}>
        <Svg width={chartWidth} height={totalHeight}>
          {/* Grid lines */}
          {priceGrid.map(({ price, y }, i) => (
            <G key={i}>
              <Line
                x1={PADDING.left}
                y1={y}
                x2={chartWidth - PADDING.right}
                y2={y}
                stroke={colors.surfaceBorder}
                strokeWidth={1}
                strokeDasharray="3,4"
              />
              <SvgText
                x={chartWidth - PADDING.right + 4}
                y={y + 4}
                fontSize={9}
                fill={colors.textMuted}
                textAnchor="start"
              >
                {price >= 1 ? price.toFixed(2) : price.toExponential(2)}
              </SvgText>
            </G>
          ))}

          {/* Current price line */}
          <Line
            x1={PADDING.left}
            y1={currentY}
            x2={chartWidth - PADDING.right}
            y2={currentY}
            stroke={lastClose >= candles[0].open ? colors.success : colors.error}
            strokeWidth={1}
            strokeDasharray="6,3"
            opacity={0.7}
          />

          {chartType === 'line' ? (
            <G>
              {/* Area */}
              <Path d={areaPath} fill={colors.primaryGlow} opacity={0.15} />
              {/* Line */}
              <Path d={linePath} stroke={colors.primary} strokeWidth={1.5} fill="none" />
            </G>
          ) : (
            <G>
              {candles.map((c, i) => {
                const x = xOf(i);
                const isUp = c.close >= c.open;
                const color = isUp ? colors.success : colors.error;
                const bodyTop = yOf(Math.max(c.open, c.close));
                const bodyBot = yOf(Math.min(c.open, c.close));
                const bodyH = Math.max(1, bodyBot - bodyTop);
                const wickX = x;
                return (
                  <G key={i}>
                    {/* Wick */}
                    <Line
                      x1={wickX}
                      y1={yOf(c.high)}
                      x2={wickX}
                      y2={yOf(c.low)}
                      stroke={color}
                      strokeWidth={1}
                    />
                    {/* Body */}
                    <Rect
                      x={x - candleW / 2}
                      y={bodyTop}
                      width={candleW}
                      height={bodyH}
                      fill={isUp ? colors.success : colors.error}
                      opacity={0.9}
                    />
                  </G>
                );
              })}
            </G>
          )}

          {/* Volume bars */}
          {candles.map((c, i) => {
            const x = xOf(i);
            const isUp = c.close >= c.open;
            const h = volH(c.volume);
            const y = CHART_HEIGHT + VOLUME_HEIGHT - h;
            return (
              <Rect
                key={`v${i}`}
                x={x - candleW / 2}
                y={y}
                width={candleW}
                height={h}
                fill={isUp ? colors.success : colors.error}
                opacity={0.35}
              />
            );
          })}

          {/* Volume axis label */}
          <SvgText
            x={PADDING.left}
            y={CHART_HEIGHT + 12}
            fontSize={9}
            fill={colors.textMuted}
          >
            VOL {formatVolume(candles[candles.length - 1].volume)}
          </SvgText>

          {/* X-axis time labels (show ~5 labels) */}
          {[0, Math.floor(candleCount * 0.25), Math.floor(candleCount * 0.5), Math.floor(candleCount * 0.75), candleCount - 1].map(i => (
            <SvgText
              key={`t${i}`}
              x={xOf(i)}
              y={totalHeight - 4}
              fontSize={9}
              fill={colors.textMuted}
              textAnchor="middle"
            >
              {formatTime(candles[i].timestamp, timeframe)}
            </SvgText>
          ))}
        </Svg>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  chartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  chartPrice: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  chartSymbol: {
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  chartTypeToggle: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  chartTypeText: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '700',
  },
  tfRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  tfButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceLight,
  },
  tfButtonActive: {
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  tfText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.textMuted,
  },
  tfTextActive: {
    color: colors.primary,
  },
  svgContainer: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
  },
  loadingContainer: {
    height: 320,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  loadingText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: '600',
  },
  unavailableContainer: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xxl,
  },
  unavailableTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  priceOnly: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.primary,
    marginTop: spacing.lg,
  },
});
