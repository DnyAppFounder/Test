import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors, spacing, borderRadius, fontSize } from '@/constants/theme';

interface AssetAllocationProps {
  assets: Array<{
    symbol: string;
    name: string;
    percentage: number;
    value: number;
    color: string;
  }>;
}

export default function AssetAllocation({ assets }: AssetAllocationProps) {
  if (assets.length === 0) {
    return null;
  }

  const size = 160;
  const strokeWidth = 24;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  let cumulativePercent = 0;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Asset Allocation</Text>

      <View style={styles.content}>
        <View style={styles.chartContainer}>
          <Svg width={size} height={size}>
            {assets.map((asset, index) => {
              const percent = asset.percentage;
              const strokeDashoffset = circumference - (cumulativePercent / 100) * circumference;
              const strokeDasharray = `${(percent / 100) * circumference} ${circumference}`;

              const element = (
                <Circle
                  key={index}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  stroke={asset.color}
                  strokeWidth={strokeWidth}
                  fill="transparent"
                  strokeDasharray={strokeDasharray}
                  strokeDashoffset={-strokeDashoffset}
                  rotation="-90"
                  origin={`${size / 2}, ${size / 2}`}
                  strokeLinecap="round"
                />
              );

              cumulativePercent += percent;
              return element;
            })}
          </Svg>

          <View style={styles.centerLabel}>
            <Text style={styles.centerLabelText}>{assets.length}</Text>
            <Text style={styles.centerLabelSubtext}>Assets</Text>
          </View>
        </View>

        <View style={styles.legend}>
          {assets.slice(0, 5).map((asset, index) => (
            <View key={index} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: asset.color }]} />
              <View style={styles.legendTextContainer}>
                <Text style={styles.legendSymbol}>{asset.symbol}</Text>
                <Text style={styles.legendPercent}>{asset.percentage.toFixed(1)}%</Text>
              </View>
              <Text style={styles.legendValue}>${asset.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
            </View>
          ))}
          {assets.length > 5 && (
            <Text style={styles.moreText}>+{assets.length - 5} more</Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  content: {
    flexDirection: 'row',
    gap: spacing.xl,
    alignItems: 'center',
  },
  chartContainer: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerLabel: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerLabelText: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  centerLabelSubtext: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  legend: {
    flex: 1,
    gap: spacing.sm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendTextContainer: {
    flex: 1,
  },
  legendSymbol: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  legendPercent: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  legendValue: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  moreText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
});
