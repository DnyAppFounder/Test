import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useState } from 'react';
import Svg, { Polyline, Circle, Line, Defs, LinearGradient as SvgGradient, Stop, Path } from 'react-native-svg';
import { colors, spacing, borderRadius, fontSize } from '@/constants/theme';

interface PriceChartProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  showGradient?: boolean;
  timeframe?: '24h' | '7d' | '30d' | '1y';
  onTimeframeChange?: (timeframe: '24h' | '7d' | '30d' | '1y') => void;
}

export default function PriceChart({
  data,
  width = 360,
  height = 200,
  color = colors.primary,
  showGradient = true,
  timeframe = '24h',
  onTimeframeChange,
}: PriceChartProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  if (!data || data.length < 2) {
    return (
      <View style={[styles.container, { width, height }]}>
        <Text style={styles.noDataText}>No chart data available</Text>
      </View>
    );
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const padding = 20;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  const step = chartWidth / (data.length - 1);
  const points = data
    .map((val, i) => {
      const x = i * step + padding;
      const y = chartHeight - ((val - min) / range) * chartHeight + padding;
      return `${x},${y}`;
    })
    .join(' ');

  const pathData = data
    .map((val, i) => {
      const x = i * step + padding;
      const y = chartHeight - ((val - min) / range) * chartHeight + padding;
      return i === 0 ? `M ${x},${y}` : `L ${x},${y}`;
    })
    .join(' ');

  const gradientPath = `${pathData} L ${chartWidth + padding},${height - padding} L ${padding},${height - padding} Z`;

  const selectedPoint = selectedIndex !== null ? {
    x: selectedIndex * step + padding,
    y: chartHeight - ((data[selectedIndex] - min) / range) * chartHeight + padding,
    value: data[selectedIndex],
  } : null;

  const timeframes: Array<'24h' | '7d' | '30d' | '1y'> = ['24h', '7d', '30d', '1y'];

  return (
    <View style={styles.container}>
      {onTimeframeChange && (
        <View style={styles.timeframeSelector}>
          {timeframes.map((tf) => (
            <TouchableOpacity
              key={tf}
              style={[styles.timeframeButton, timeframe === tf && styles.timeframeButtonActive]}
              onPress={() => onTimeframeChange(tf)}
            >
              <Text style={[styles.timeframeText, timeframe === tf && styles.timeframeTextActive]}>
                {tf}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={[styles.chartContainer, { width, height }]}>
        <Svg width={width} height={height}>
          <Defs>
            <SvgGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity="0.3" />
              <Stop offset="1" stopColor={color} stopOpacity="0.05" />
            </SvgGradient>
          </Defs>

          {showGradient && (
            <Path
              d={gradientPath}
              fill="url(#priceGradient)"
            />
          )}

          <Polyline
            points={points}
            fill="none"
            stroke={color}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {selectedPoint && (
            <>
              <Line
                x1={selectedPoint.x}
                y1={padding}
                x2={selectedPoint.x}
                y2={height - padding}
                stroke={colors.surfaceBorder}
                strokeWidth={1}
                strokeDasharray="4 4"
              />
              <Circle
                cx={selectedPoint.x}
                cy={selectedPoint.y}
                r={6}
                fill={color}
                stroke={colors.surface}
                strokeWidth={3}
              />
            </>
          )}
        </Svg>

        {selectedPoint && (
          <View style={[styles.tooltip, { left: selectedPoint.x - 40, top: selectedPoint.y - 40 }]}>
            <Text style={styles.tooltipText}>${selectedPoint.value.toFixed(2)}</Text>
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
  },
  chartContainer: {
    overflow: 'hidden',
  },
  noDataText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
  },
  timeframeSelector: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  timeframeButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
  },
  timeframeButtonActive: {
    backgroundColor: colors.primaryMuted,
  },
  timeframeText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.textMuted,
  },
  timeframeTextActive: {
    color: colors.primary,
  },
  tooltip: {
    position: 'absolute',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  tooltipText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textPrimary,
  },
});
