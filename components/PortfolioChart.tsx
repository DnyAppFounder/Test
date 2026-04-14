import { View, Text, StyleSheet, Dimensions, TouchableOpacity } from 'react-native';
import { useState, useEffect } from 'react';
import Svg, { Path, Circle, Line, Text as SvgText } from 'react-native-svg';
import { TrendingUp, TrendingDown } from 'lucide-react-native';
import { colors, spacing, fontSize, borderRadius } from '@/constants/theme';
import { PortfolioHistoryService, PortfolioChartData } from '@/services/portfolioHistoryService';

const { width } = Dimensions.get('window');
const CHART_WIDTH = width - spacing.xxl * 2;
const CHART_HEIGHT = 140;
const PADDING = 20;

interface PortfolioChartProps {
  walletAddress: string;
  currentValue: number;
}

type TimeRange = '7D' | '30D' | '90D';

export function PortfolioChart({ walletAddress, currentValue }: PortfolioChartProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>('7D');
  const [chartData, setChartData] = useState<PortfolioChartData[]>([]);
  const [loading, setLoading] = useState(true);
  const [changePercent, setChangePercent] = useState(0);
  const [changeAmount, setChangeAmount] = useState(0);

  useEffect(() => {
    loadChartData();
  }, [walletAddress, timeRange]);

  const loadChartData = async () => {
    setLoading(true);
    try {
      const days = timeRange === '7D' ? 7 : timeRange === '30D' ? 30 : 90;
      const data = await PortfolioHistoryService.getPortfolioHistory(walletAddress, days);

      if (data.length >= 2) {
        const firstValue = data[0].value;
        const lastValue = data[data.length - 1].value;
        const change = lastValue - firstValue;
        const percent = firstValue > 0 ? (change / firstValue) * 100 : 0;

        setChangeAmount(change);
        setChangePercent(percent);
        setChartData(data);
      } else {
        setChartData([]);
        setChangeAmount(0);
        setChangePercent(0);
      }
    } catch (error) {
      console.error('Error loading chart data:', error);
      setChartData([]);
    } finally {
      setLoading(false);
    }
  };

  const generatePath = (): string => {
    if (chartData.length < 2) return '';

    const values = chartData.map((d) => d.value);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const range = maxValue - minValue || 1;

    const xStep = (CHART_WIDTH - PADDING * 2) / (chartData.length - 1);

    const points = chartData.map((data, index) => {
      const x = PADDING + index * xStep;
      const normalizedValue = (data.value - minValue) / range;
      const y = CHART_HEIGHT - PADDING - normalizedValue * (CHART_HEIGHT - PADDING * 2);
      return { x, y };
    });

    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      path += ` L ${points[i].x} ${points[i].y}`;
    }

    return path;
  };

  const isPositive = changePercent >= 0;

  if (loading || chartData.length < 2) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.label}>Portfolio Performance</Text>
            <Text style={styles.noDataText}>
              {loading ? 'Loading...' : 'Not enough data to show chart'}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.label}>Portfolio Performance</Text>
          <View style={styles.changeRow}>
            {isPositive ? (
              <TrendingUp size={18} color={colors.success} strokeWidth={2.5} />
            ) : (
              <TrendingDown size={18} color={colors.error} strokeWidth={2.5} />
            )}
            <Text style={[styles.changeText, isPositive ? styles.positive : styles.negative]}>
              {isPositive ? '+' : ''}
              {changePercent.toFixed(2)}%
            </Text>
            <Text style={styles.changeAmount}>
              ({isPositive ? '+' : ''}${changeAmount.toFixed(2)})
            </Text>
          </View>
        </View>
        <View style={styles.timeRangeButtons}>
          {(['7D', '30D', '90D'] as TimeRange[]).map((range) => (
            <TouchableOpacity
              key={range}
              style={[styles.timeButton, timeRange === range && styles.timeButtonActive]}
              onPress={() => setTimeRange(range)}
              activeOpacity={0.7}
            >
              <Text
                style={[styles.timeButtonText, timeRange === range && styles.timeButtonTextActive]}
              >
                {range}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.chartContainer}>
        <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
          <Line
            x1={PADDING}
            y1={CHART_HEIGHT - PADDING}
            x2={CHART_WIDTH - PADDING}
            y2={CHART_HEIGHT - PADDING}
            stroke={colors.surfaceBorder}
            strokeWidth="1"
          />
          <Path
            d={generatePath()}
            fill="none"
            stroke={isPositive ? colors.success : colors.error}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
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
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  changeText: {
    fontSize: fontSize.lg,
    fontWeight: '800',
  },
  positive: {
    color: colors.success,
  },
  negative: {
    color: colors.error,
  },
  changeAmount: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: '600',
  },
  timeRangeButtons: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  timeButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceLight,
  },
  timeButtonActive: {
    backgroundColor: colors.primary,
  },
  timeButtonText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textMuted,
  },
  timeButtonTextActive: {
    color: colors.white,
  },
  chartContainer: {
    alignItems: 'center',
  },
  noDataText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: '500',
  },
});
