import { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { TrendingUp, TrendingDown, Wallet, Info } from 'lucide-react-native';
import { colors, spacing, fontSize, borderRadius } from '@/constants/theme';

interface TokenPositionPanelProps {
  rawTokenBalance: number;
  tokenDecimals?: number;
  tokenPrice: number;
  tokenSymbol: string;
  totalSupply?: number;
  activeAddress?: string | null;
}

function fmtUsd(val: number): string {
  if (val === 0) return '$0.00';
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(2)}K`;
  if (val >= 1) return `$${val.toFixed(2)}`;
  return `$${val.toFixed(4)}`;
}

function fmtTokenAmt(val: number): string {
  if (val >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(3)}B`;
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(3)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(2)}K`;
  if (val >= 1) return val.toFixed(4);
  return val.toPrecision(4);
}

export function TokenPositionPanel({
  rawTokenBalance,
  tokenDecimals = 9,
  tokenPrice,
  tokenSymbol,
  totalSupply,
  activeAddress,
}: TokenPositionPanelProps) {
  const uiBalance = useMemo(
    () => rawTokenBalance / Math.pow(10, tokenDecimals),
    [rawTokenBalance, tokenDecimals],
  );

  const currentValueUsd = useMemo(
    () => uiBalance * tokenPrice,
    [uiBalance, tokenPrice],
  );

  const supplyPct = useMemo(() => {
    if (!totalSupply || totalSupply <= 0 || uiBalance <= 0) return null;
    return (uiBalance / totalSupply) * 100;
  }, [uiBalance, totalSupply]);

  if (!activeAddress) {
    return (
      <View style={styles.card}>
        <View style={styles.emptyRow}>
          <Wallet size={16} color={colors.textMuted} strokeWidth={2} />
          <Text style={styles.emptyText}>Connect wallet to view your position</Text>
        </View>
      </View>
    );
  }

  if (uiBalance <= 0) {
    return (
      <View style={styles.card}>
        <View style={styles.header}>
          <Wallet size={14} color={colors.textMuted} strokeWidth={2} />
          <Text style={styles.headerTitle}>My Position</Text>
        </View>
        <View style={styles.emptyRow}>
          <Text style={styles.emptyText}>No position yet</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Wallet size={14} color={colors.primary} strokeWidth={2} />
        <Text style={styles.headerTitle}>My Position</Text>
        {supplyPct != null && supplyPct > 0 && (
          <View style={styles.supplyBadge}>
            <Text style={styles.supplyBadgeText}>
              {supplyPct < 0.01 ? '<0.01' : supplyPct.toFixed(2)}% of supply
            </Text>
          </View>
        )}
      </View>

      <View style={styles.mainRow}>
        {/* Balance */}
        <View style={styles.statBlock}>
          <Text style={styles.statLabel}>Balance</Text>
          <Text style={styles.statValue} numberOfLines={1}>
            {fmtTokenAmt(uiBalance)}
          </Text>
          <Text style={styles.statSub}>{tokenSymbol}</Text>
        </View>

        <View style={styles.divider} />

        {/* Current Value */}
        <View style={styles.statBlock}>
          <Text style={styles.statLabel}>Value</Text>
          <Text style={[styles.statValue, { color: '#14F195' }]}>
            {fmtUsd(currentValueUsd)}
          </Text>
          <Text style={styles.statSub}>
            @ {tokenPrice < 0.000001
              ? tokenPrice.toExponential(2)
              : tokenPrice < 0.001
                ? tokenPrice.toFixed(7)
                : tokenPrice < 1
                  ? tokenPrice.toFixed(5)
                  : tokenPrice.toFixed(4)}
          </Text>
        </View>

        {supplyPct != null && (
          <>
            <View style={styles.divider} />
            <View style={styles.statBlock}>
              <Text style={styles.statLabel}>% Supply</Text>
              <Text style={styles.statValue}>
                {supplyPct < 0.01 ? '<0.01%' : `${supplyPct.toFixed(2)}%`}
              </Text>
              <Text style={styles.statSub}>held</Text>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(139,92,246,0.05)',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.15)',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  headerTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    flex: 1,
  },
  supplyBadge: {
    backgroundColor: 'rgba(139,92,246,0.12)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.25)',
  },
  supplyBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 0.3,
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
  },
  statBlock: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  divider: {
    width: 1,
    height: 36,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginHorizontal: 4,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  statSub: {
    fontSize: 10,
    color: colors.textMuted,
    fontWeight: '500',
  },
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  emptyText: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '500',
  },
});
