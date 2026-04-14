import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Dimensions } from 'react-native';
import Svg, { Line, Rect, Path, Text as SvgText } from 'react-native-svg';
import { RefreshCw } from 'lucide-react-native';
import { colors, spacing, fontSize, borderRadius } from '@/constants/theme';
import { chartDataService, CandleData, TimeFrame } from '@/services/chartDataService';

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
  const [chartType, setChartType] = useState<'candle' | 'line'>('candle');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const refreshIntervalRef = useRef<any>(null);

  const timeFrames: TimeFrame[] = ['1m', '5m', '15m', '1H', '4H', '1D'];

  useEffect(() => {
    loadChartData();

    if (autoRefresh) {
      refreshIntervalRef.current = setInterval(() => {
        loadChartData();
      }, 30000);
    }

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [tokenAddress, timeFrame, autoRefresh]);

  const loadChartData = async () => {
    setLoading(true);
    try {
      const data = await chartDataService.getOHLCVData(tokenAddress, timeFrame);
      setCandles(data);
    } catch (error) {
      console.error('Error loading chart data:', error);
    } finally {
      setLoading(false);
    }
  };

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
    const maxVolume = Math.max(...volumes);

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

          const openY = priceToY(candle.open);
          const closeY = priceToY(candle.close);
          const highY = priceToY(candle.high);
          const lowY = priceToY(candle.low);

          const bodyTop = Math.min(openY, closeY);
          const bodyHeight = Math.abs(closeY - openY) || 1;

          return (
            <>
              {/* Wick */}
              <Line
                key={`wick-${index}`}
                x1={x}
                y1={highY}
                x2={x}
                y2={lowY}
                stroke={color}
                strokeWidth="1.5"
              />
              {/* Body */}
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
          const volumeHeight = volumeToHeight(candle.volume);
          const volumeY = CHART_HEIGHT - CHART_PADDING;

          return (
            <Rect
              key={`volume-${index}`}
              x={x - bodyWidth / 2}
              y={volumeY - volumeHeight}
              width={bodyWidth}
              height={volumeHeight}
              fill={color}
            />
          );
        })}
      </Svg>
    );
  };

  const renderLineChart = () => {
    if (candles.length === 0) return null;

    const prices = candles.map((c) => c.close);
    const maxPrice = Math.max(...prices);
    const minPrice = Math.min(...prices);
    const priceRange = maxPrice - minPrice || 1;

    const usableWidth = chartWidth - CHART_PADDING * 2;
    const usableHeight = CHART_HEIGHT - CHART_PADDING * 2;

    const priceToY = (price: number) => {
      const normalized = (price - minPrice) / priceRange;
      return CHART_HEIGHT - CHART_PADDING - normalized * usableHeight;
    };

    const points = candles.map((candle, index) => {
      const x = CHART_PADDING + (index / (candles.length - 1)) * usableWidth;
      const y = priceToY(candle.close);
      return { x, y };
    });

    const pathData = points.reduce((acc, point, index) => {
      if (index === 0) {
        return `M ${point.x} ${point.y}`;
      }
      return `${acc} L ${point.x} ${point.y}`;
    }, '');

    const isUp = candles[candles.length - 1].close >= candles[0].close;
    const lineColor = isUp ? colors.success : colors.error;

    return (
      <Svg width={chartWidth} height={CHART_HEIGHT}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
          const y = CHART_PADDING + ratio * usableHeight;
          return (
            <Line
              key={i}
              x1={CHART_PADDING}
              y1={y}
              x2={chartWidth - CHART_PADDING}
              y2={y}
              stroke="rgba(255,255,255,0.05)"
              strokeWidth="1"
            />
          );
        })}

        {/* Line chart */}
        <Path d={pathData} stroke={lineColor} strokeWidth="2" fill="none" />
      </Svg>
    );
  };

  const latestCandle = candles[candles.length - 1];
  const firstCandle = candles[0];
  const priceChange = latestCandle && firstCandle ? ((latestCandle.close - firstCandle.open) / firstCandle.open) * 100 : 0;
  const isPositive = priceChange >= 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.priceSection}>
          {currentPrice !== undefined && (
            <Text style={styles.currentPrice}>${currentPrice.toFixed(currentPrice < 1 ? 6 : 2)}</Text>
          )}
          {latestCandle && (
            <Text style={[styles.priceChange, isPositive ? styles.priceChangePositive : styles.priceChangeNegative]}>
              {isPositive ? '+' : ''}{priceChange.toFixed(2)}%
            </Text>
          )}
        </View>

        <TouchableOpacity
          style={[styles.refreshButton, autoRefresh && styles.refreshButtonActive]}
          onPress={() => setAutoRefresh(!autoRefresh)}
          activeOpacity={0.7}
        >
          <RefreshCw size={16} color={autoRefresh ? colors.success : colors.textMuted} strokeWidth={2} />
        </TouchableOpacity>
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
  refreshButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  refreshButtonActive: {
    backgroundColor: colors.successMuted,
    borderColor: colors.success,
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
