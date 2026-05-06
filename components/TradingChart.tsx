import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Dimensions } from 'react-native';
import Svg, { Line, Rect, Path, Text as SvgText } from 'react-native-svg';
import { colors, spacing, fontSize, borderRadius } from '@/constants/theme';
import { CandleData, TimeFrame } from '@/services/chartDataService';
import { realtimeChartService, CandleUpdateListener } from '@/services/realtimeChartService';

const CHART_HEIGHT = 380;
const CHART_PADDING = 50;
const VOLUME_HEIGHT = 60;

interface TradingChartProps {
  tokenAddress: string;
  currentPrice?: number;
}

export function TradingChart({ tokenAddress, currentPrice }: TradingChartProps) {
  const [candles, setCandles] = useState<CandleData[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeFrame, setTimeFrame] = useState<TimeFrame>('15m');
  const [chartWidth, setChartWidth] = useState(Dimensions.get('window').width - 48);
  const [chartType] = useState<'candle' | 'line'>('candle');

  const timeFrames: TimeFrame[] = ['1m', '5m', '15m', '1H', '4H', '1D'];

  // Keep stable ref to the listener so we can unsubscribe cleanly
  const listenerRef = useRef<CandleUpdateListener | null>(null);
  const currentTokenRef = useRef<string>('');
  const currentTfRef = useRef<TimeFrame>('15m');

  const handleCandleUpdate = useCallback((updated: CandleData[]) => {
    setCandles(updated);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!tokenAddress) return;

    // Unsubscribe previous listener if token/timeframe changed
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

    realtimeChartService
      .subscribe(tokenAddress, timeFrame, handleCandleUpdate)
      .then((initial) => {
        if (initial.length > 0) {
          setCandles(initial);
          setLoading(false);
        }
        // If empty, loading stays true until first realtime/historical delivery
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

  // ─── Candlestick renderer (unchanged) ──────────────────────────────────────

  const renderCandlestickChart = () => {
    if (candles.length === 0) return null;

    const prices = candles.flatMap((c) => [c.high, c.low]);
    const maxPrice = Math.max(...prices);
    const minPrice = Math.min(...prices);
    const priceRange = maxPrice - minPrice || 1;

    const usableWidth = chartWidth - CHART_PADDING * 2;
    const priceChartHeight = CHART_HEIGHT - CHART_PADDING * 2 - VOLUME_HEIGHT - 10;
    const candleWidth = usableWidth / candles.length;
    const bodyWidth = Math.max(candleWidth * 0.6, 2);

    const priceToY = (price: number) => {
      const normalized = (price - minPrice) / priceRange;
      return CHART_PADDING + priceChartHeight - normalized * priceChartHeight;
    };

    const volumes = candles.map((c) => c.volume);
    const maxVolume = Math.max(...volumes) || 1;

    const volumeToHeight = (volume: number) => {
      return (volume / maxVolume) * VOLUME_HEIGHT;
    };

    return (
      <Svg width={chartWidth} height={CHART_HEIGHT}>
        {/* Grid lines and price labels */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
          const y = CHART_PADDING + ratio * priceChartHeight;
          const price = maxPrice - ratio * priceRange;
          const priceLabel = price < 1 ? price.toFixed(6) : price.toFixed(2);
          return (
            <>
              <Line
                key={`grid-${i}`}
                x1={CHART_PADDING}
                y1={y}
                x2={chartWidth - CHART_PADDING}
                y2={y}
                stroke="rgba(255,255,255,0.05)"
                strokeWidth="1"
              />
              <SvgText
                key={`label-${i}`}
                x={chartWidth - CHART_PADDING + 5}
                y={y + 4}
                fontSize="10"
                fill="rgba(255,255,255,0.4)"
                fontWeight="600"
              >
                {priceLabel}
              </SvgText>
            </>
          );
        })}

        {/* Candlesticks */}
        {candles.map((candle, index) => {
          const x = CHART_PADDING + index * candleWidth + candleWidth / 2;
          const isGreen = candle.close >= candle.open;
          const color = isGreen ? colors.success : colors.error;
          const openY  = priceToY(candle.open);
          const closeY = priceToY(candle.close);
          const highY  = priceToY(candle.high);
          const lowY   = priceToY(candle.low);
          const bodyTop    = Math.min(openY, closeY);
          const bodyHeight = Math.abs(closeY - openY) || 1;
          return (
            <>
              <Line
                key={`wick-${index}`}
                x1={x} y1={highY} x2={x} y2={lowY}
                stroke={color} strokeWidth="1.5"
              />
              <Rect
                key={`body-${index}`}
                x={x - bodyWidth / 2}
                y={bodyTop}
                width={bodyWidth}
                height={bodyHeight}
                fill={color}
                stroke={color}
                strokeWidth="0.5"
              />
            </>
          );
        })}

        {/* Volume bars */}
        {candles.map((candle, index) => {
          const x = CHART_PADDING + index * candleWidth + candleWidth / 2;
          const isGreen = candle.close >= candle.open;
          const color = isGreen ? 'rgba(20, 241, 149, 0.3)' : 'rgba(255, 77, 79, 0.3)';
          const volHeight = volumeToHeight(candle.volume);
          const volumeY = CHART_HEIGHT - CHART_PADDING;
          return (
            <Rect
              key={`volume-${index}`}
              x={x - bodyWidth / 2}
              y={volumeY - volHeight}
              width={bodyWidth}
              height={volHeight}
              fill={color}
            />
          );
        })}
      </Svg>
    );
  };

  // ─── Line chart renderer (unchanged) ───────────────────────────────────────

  const renderLineChart = () => {
    if (candles.length === 0) return null;

    const prices = candles.map((c) => c.close);
    const maxPrice = Math.max(...prices);
    const minPrice = Math.min(...prices);
    const priceRange = maxPrice - minPrice || 1;

    const usableWidth  = chartWidth - CHART_PADDING * 2;
    const usableHeight = CHART_HEIGHT - CHART_PADDING * 2;

    const priceToY = (price: number) => {
      const normalized = (price - minPrice) / priceRange;
      return CHART_HEIGHT - CHART_PADDING - normalized * usableHeight;
    };

    const points = candles.map((candle, index) => ({
      x: CHART_PADDING + (index / (candles.length - 1)) * usableWidth,
      y: priceToY(candle.close),
    }));

    const pathData = points.reduce((acc, point, index) =>
      index === 0 ? `M ${point.x} ${point.y}` : `${acc} L ${point.x} ${point.y}`,
      ''
    );

    const isUp = candles[candles.length - 1].close >= candles[0].close;
    const lineColor = isUp ? colors.success : colors.error;

    return (
      <Svg width={chartWidth} height={CHART_HEIGHT}>
        {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => (
          <Line
            key={i}
            x1={CHART_PADDING}
            y1={CHART_PADDING + ratio * usableHeight}
            x2={chartWidth - CHART_PADDING}
            y2={CHART_PADDING + ratio * usableHeight}
            stroke="rgba(255,255,255,0.05)"
            strokeWidth="1"
          />
        ))}
        <Path d={pathData} stroke={lineColor} strokeWidth="2" fill="none" />
      </Svg>
    );
  };

  // ─── Header stats ───────────────────────────────────────────────────────────

  const latestCandle = candles[candles.length - 1];
  const firstCandle  = candles[0];
  const priceChange  = latestCandle && firstCandle
    ? ((latestCandle.close - firstCandle.open) / firstCandle.open) * 100
    : 0;
  const isPositive = priceChange >= 0;

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <View
      style={styles.container}
      onLayout={(e) => setChartWidth(e.nativeEvent.layout.width - 0)}
    >
      <View style={styles.header}>
        <View style={styles.priceSection}>
          {currentPrice !== undefined && (
            <Text style={styles.currentPrice}>
              ${currentPrice.toFixed(currentPrice < 1 ? 6 : 2)}
            </Text>
          )}
          {latestCandle && (
            <Text style={[styles.priceChange, isPositive ? styles.priceChangePositive : styles.priceChangeNegative]}>
              {isPositive ? '+' : ''}{priceChange.toFixed(2)}%
            </Text>
          )}
        </View>

        {/* Live indicator instead of refresh button */}
        <View style={styles.liveIndicator}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
      </View>

      <View style={styles.timeFrameSelector}>
        {timeFrames.map((tf) => (
          <TouchableOpacity
            key={tf}
            style={[styles.timeFrameButton, timeFrame === tf && styles.timeFrameButtonActive]}
            onPress={() => setTimeFrame(tf)}
          >
            <Text style={[styles.timeFrameText, timeFrame === tf && styles.timeFrameTextActive]}>{tf}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.chartContainer}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading chart...</Text>
          </View>
        ) : candles.length === 0 ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>No chart data available</Text>
          </View>
        ) : chartType === 'candle' ? (
          renderCandlestickChart()
        ) : (
          renderLineChart()
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  priceSection: {
    flex: 1,
  },
  currentPrice: {
    fontSize: fontSize.xxl,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  priceChange: {
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  priceChangePositive: {
    color: colors.success,
  },
  priceChangeNegative: {
    color: colors.error,
  },
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
  timeFrameSelector: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  timeFrameButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceLight,
  },
  timeFrameButtonActive: {
    backgroundColor: colors.primary,
  },
  timeFrameText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textMuted,
  },
  timeFrameTextActive: {
    color: colors.white,
  },
  chartContainer: {
    height: CHART_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  loadingText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: '600',
  },
});
