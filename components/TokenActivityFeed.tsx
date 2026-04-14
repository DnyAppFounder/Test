import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { ArrowUpRight, ArrowDownLeft } from 'lucide-react-native';
import { tokenActivityService, TokenTrade } from '@/services/tokenActivityService';
import { colors, spacing, fontSize, borderRadius } from '@/constants/theme';

interface TokenActivityFeedProps {
  tokenAddress: string;
}

export function TokenActivityFeed({ tokenAddress }: TokenActivityFeedProps) {
  const [trades, setTrades] = useState<TokenTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadActivity();

    const interval = setInterval(loadActivity, 15000);
    return () => clearInterval(interval);
  }, [tokenAddress]);

  const loadActivity = async () => {
    try {
      const data = await tokenActivityService.getTokenActivity(tokenAddress);
      setTrades(data);
    } catch (error) {
      console.error('Error loading token activity:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadActivity();
  };

  const renderTrade = ({ item }: { item: TokenTrade }) => {
    const isBuy = item.type === 'buy';

    return (
      <View style={[styles.tradeRow, isBuy ? styles.buyRow : styles.sellRow]}>
        <View style={[styles.typeIcon, isBuy ? styles.buyIcon : styles.sellIcon]}>
          {isBuy ? (
            <ArrowUpRight size={14} color={colors.success} strokeWidth={2.5} />
          ) : (
            <ArrowDownLeft size={14} color={colors.error} strokeWidth={2.5} />
          )}
        </View>

        <View style={styles.tradeInfo}>
          <View style={styles.tradeHeader}>
            <Text style={[styles.tradeType, isBuy ? styles.buyText : styles.sellText]}>
              {isBuy ? 'BUY' : 'SELL'}
            </Text>
            <Text style={styles.walletText}>
              {tokenActivityService.formatWalletAddress(item.walletAddress)}
            </Text>
          </View>

          <View style={styles.tradeDetails}>
            <Text style={styles.amountText}>
              {tokenActivityService.formatAmount(item.amount)}
            </Text>
            <Text style={styles.dotSeparator}>•</Text>
            <Text style={styles.tokenAmountText}>
              {item.tokenAmount.toFixed(2)} tokens
            </Text>
          </View>
        </View>

        <Text style={styles.timeText}>
          {tokenActivityService.formatTimeAgo(item.timestamp)}
        </Text>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={styles.loadingText}>Loading activity...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Live Activity</Text>
        <View style={styles.liveDot} />
      </View>

      <FlatList
        data={trades}
        keyExtractor={(item) => item.id}
        renderItem={renderTrade}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No recent activity</Text>
          </View>
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xxl,
  },
  loadingText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  tradeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    marginTop: spacing.sm,
  },
  buyRow: {
    backgroundColor: 'rgba(20, 241, 149, 0.08)',
  },
  sellRow: {
    backgroundColor: 'rgba(255, 77, 79, 0.08)',
  },
  typeIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buyIcon: {
    backgroundColor: colors.successMuted,
  },
  sellIcon: {
    backgroundColor: colors.errorMuted,
  },
  tradeInfo: {
    flex: 1,
  },
  tradeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 2,
  },
  tradeType: {
    fontSize: fontSize.xs,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  buyText: {
    color: colors.success,
  },
  sellText: {
    color: colors.error,
  },
  walletText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '500',
  },
  tradeDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  amountText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  dotSeparator: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  tokenAmountText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  timeText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '600',
  },
  emptyState: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
});
