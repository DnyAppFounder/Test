import { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, TouchableOpacity, Dimensions } from 'react-native';
import { colors, spacing, fontSize, borderRadius } from '@/constants/theme';
import Svg, { Line, Circle, Path, G, Text as SvgText } from 'react-native-svg';

interface TradingViewChartProps {
  symbol: string;
  currentPrice?: number;
}

interface CandleData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

const timeframes = [
  { label: '1H', value: '1H' },
  { label: '4H', value: '4H' },
  { label: '1D', value: '1D' },
  { label: '1W', value: '1W' },
];

export function TradingViewChart({ symbol, currentPrice }: TradingViewChartProps) {
  const [selectedTimeframe, setSelectedTimeframe] = useState('1D');
  const [isLoading, setIsLoading] = useState(true);
  const [candleData, setCandleData] = useState<CandleData[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadChartData();
  }, [symbol, selectedTimeframe]);

  const loadChartData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const candles = generateRealisticCandles(currentPrice || 100, 50);
      setCandleData(candles);
    } catch (err) {
      setError('Failed to load chart data');
      console.error('Chart loading error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const generateRealisticCandles = (basePrice: number, count: number): CandleData[] => {
    const candles: CandleData[] = [];
    let price = basePrice;
    const now = Date.now();

    for (let i = count - 1; i >= 0; i--) {
      const volatility = 0.02;
      const change = (Math.random() - 0.5) * volatility;

      const open = price;
      const close = price * (1 + change);
      const high = Math.max(open, close) * (1 + Math.random() * 0.01);
      const low = Math.min(open, close) * (1 - Math.random() * 0.01);

      candles.unshift({
        timestamp: now - i * 3600000,
        open,
        high,
        low,
        close,
      });

      price = close;
    }

    return candles;
  };

  const renderChart = () => {
    if (candleData.length === 0) return null;

    const width = Dimensions.get('window').width - 80;
    const height = 300;
    const padding = 40;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    const prices = candleData.flatMap(d => [d.high, d.low]);
    const maxPrice = Math.max(...prices);
    const minPrice = Math.min(...prices);
    const priceRange = maxPrice - minPrice || 1;

    const candleWidth = Math.max(2, chartWidth / candleData.length - 2);

    return (
      <Svg width={width} height={height}>
        <G>
          {[0, 1, 2, 3, 4].map((i) => {
            const y = padding + (chartHeight / 4) * i;
            const price = maxPrice - (priceRange / 4) * i;
            return (
              <G key={i}>
                <Line
                  x1={padding}
                  y1={y}
                  x2={width - padding}
                  y2={y}
                  stroke="rgba(255, 255, 255, 0.05)"
                  strokeWidth="1"
                />
                <SvgText
                  x={width - padding + 5}
                  y={y + 4}
                  fill={colors.textMuted}
                  fontSize="10"
                >
                  ${price.toFixed(price < 1 ? 4 : 2)}
                </SvgText>
              </G>
            );
          })}

          {candleData.map((candle, index) => {
            const x = padding + (index * chartWidth) / candleData.length;
            const isGreen = candle.close >= candle.open;
            const color = isGreen ? colors.success : colors.error;

            const openY = padding + ((maxPrice - candle.open) / priceRange) * chartHeight;
            const closeY = padding + ((maxPrice - candle.close) / priceRange) * chartHeight;
            const highY = padding + ((maxPrice - candle.high) / priceRange) * chartHeight;
            const lowY = padding + ((maxPrice - candle.low) / priceRange) * chartHeight;

            const bodyTop = Math.min(openY, closeY);
            const bodyBottom = Math.max(openY, closeY);
            const bodyHeight = Math.max(bodyBottom - bodyTop, 1);

            return (
              <G key={index}>
                <Line
                  x1={x + candleWidth / 2}
                  y1={highY}
                  x2={x + candleWidth / 2}
                  y2={lowY}
                  stroke={color}
                  strokeWidth="1"
                />
                <Path
                  d={`M ${x} ${bodyTop}
                      L ${x + candleWidth} ${bodyTop}
                      L ${x + candleWidth} ${bodyBottom}
                      L ${x} ${bodyBottom} Z`}
                  fill={color}
                  opacity={isGreen ? 0.8 : 1}
                />
              </G>
            );
          })}
        </G>
      </Svg>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.priceSection}>
          {currentPrice !== undefined && (
            <Text style={styles.currentPrice}>
              ${currentPrice.toFixed(currentPrice < 1 ? 6 : 2)}
            </Text>
          )}
        </View>
      </View>

      <View style={styles.timeframeSelector}>
        {timeframes.map((tf) => (
          <TouchableOpacity
            key={tf.value}
            style={[
              styles.timeframeButton,
              selectedTimeframe === tf.value && styles.timeframeButtonActive,
            ]}
            onPress={() => setSelectedTimeframe(tf.value)}
          >
            <Text
              style={[
                styles.timeframeText,
                selectedTimeframe === tf.value && styles.timeframeTextActive,
              ]}
            >
              {tf.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.chartContainer}>
        {isLoading ? (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading chart...</Text>
          </View>
        ) : error ? (
          <View style={styles.errorOverlay}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : (
          renderChart()
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
    overflow: 'hidden',
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
  },
  timeframeSelector: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  timeframeButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceLight,
  },
  timeframeButtonActive: {
    backgroundColor: colors.primary,
  },
  timeframeText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textMuted,
  },
  timeframeTextActive: {
    color: colors.white,
  },
  chartContainer: {
    height: 300,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingOverlay: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  loadingText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: '600',
  },
  errorOverlay: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: fontSize.sm,
    color: colors.error,
    fontWeight: '600',
  },
});
