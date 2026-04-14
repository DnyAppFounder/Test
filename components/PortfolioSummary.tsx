import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { TrendingUp, TrendingDown, Eye, EyeOff } from 'lucide-react-native';
import { colors, spacing, borderRadius, fontSize, elevation } from '@/constants/theme';
import SparklineChart from './SparklineChart';

interface PortfolioSummaryProps {
  totalValue: number;
  change24h: number;
  changePercent24h: number;
  chartData: number[];
  hideBalance: boolean;
  onToggleHide: () => void;
}

export default function PortfolioSummary({
  totalValue,
  change24h,
  changePercent24h,
  chartData,
  hideBalance,
  onToggleHide,
}: PortfolioSummaryProps) {
  const isPositive = change24h >= 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.label}>Total Portfolio Value</Text>
          <View style={styles.valueRow}>
            {hideBalance ? (
              <Text style={styles.valueHidden}>••••••</Text>
            ) : (
              <Text style={styles.value}>${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
            )}
          </View>
        </View>
        <TouchableOpacity onPress={onToggleHide} style={styles.hideButton}>
          {hideBalance ? (
            <EyeOff size={20} color={colors.textMuted} />
          ) : (
            <Eye size={20} color={colors.textMuted} />
          )}
        </TouchableOpacity>
      </View>

      {!hideBalance && (
        <>
          <View style={styles.changeRow}>
            <View style={[styles.changeBadge, isPositive ? styles.changeBadgePositive : styles.changeBadgeNegative]}>
              {isPositive ? (
                <TrendingUp size={14} color={colors.success} />
              ) : (
                <TrendingDown size={14} color={colors.error} />
              )}
              <Text style={[styles.changeText, isPositive ? styles.changeTextPositive : styles.changeTextNegative]}>
                {isPositive ? '+' : ''}{change24h.toFixed(2)} ({isPositive ? '+' : ''}{changePercent24h.toFixed(2)}%)
              </Text>
            </View>
            <Text style={styles.periodText}>24h</Text>
          </View>

          {chartData.length > 0 && (
            <View style={styles.chartContainer}>
              <SparklineChart
                data={chartData}
                width={320}
                height={80}
                color={isPositive ? colors.success : colors.error}
              />
            </View>
          )}
        </>
      )}
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
    ...elevation.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  label: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  value: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  valueHidden: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 4,
  },
  hideButton: {
    padding: spacing.sm,
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  changeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
  },
  changeBadgePositive: {
    backgroundColor: colors.successMuted,
  },
  changeBadgeNegative: {
    backgroundColor: colors.errorMuted,
  },
  changeText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  changeTextPositive: {
    color: colors.success,
  },
  changeTextNegative: {
    color: colors.error,
  },
  periodText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  chartContainer: {
    marginTop: spacing.md,
    alignItems: 'center',
  },
});
