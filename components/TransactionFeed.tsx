import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity } from 'react-native';
import { ArrowUp, ArrowDown } from 'lucide-react-native';
import { colors, spacing, fontSize, borderRadius } from '@/constants/theme';
import { transactionFeedService, TokenTransaction } from '@/services/transactionFeedService';

interface TransactionFeedProps {
  tokenMint: string;
}

export function TransactionFeed({ tokenMint }: TransactionFeedProps) {
  const [transactions, setTransactions] = useState<TokenTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTransactions();
    const interval = setInterval(loadTransactions, 15000); // Refresh every 15s
    return () => clearInterval(interval);
  }, [tokenMint]);

  const loadTransactions = async () => {
    try {
      const data = await transactionFeedService.getRecentTransactions(tokenMint);
      setTransactions(data);
    } catch (error) {
      console.error('Error loading transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderTransaction = ({ item }: { item: TokenTransaction }) => {
    const isBuy = item.type === 'buy';

    return (
      <View style={styles.transactionRow}>
        <View style={[styles.typeIndicator, isBuy ? styles.buyIndicator : styles.sellIndicator]}>
          {isBuy ? (
            <ArrowUp size={12} color={colors.success} strokeWidth={3} />
          ) : (
            <ArrowDown size={12} color={colors.error} strokeWidth={3} />
          )}
        </View>

        <View style={styles.transactionInfo}>
          <View style={styles.transactionTop}>
            <Text style={[styles.transactionType, isBuy ? styles.buyText : styles.sellText]}>
              {isBuy ? 'BUY' : 'SELL'}
            </Text>
            <Text style={styles.wallet}>
              {item.wallet.slice(0, 4)}...{item.wallet.slice(-4)}
            </Text>
          </View>
          <View style={styles.transactionBottom}>
            <Text style={styles.tokenAmount}>
              {transactionFeedService.formatTokenAmount(item.tokenAmount)} tokens
            </Text>
            <Text style={styles.timeAgo}>{transactionFeedService.formatTimeAgo(item.timestamp)}</Text>
          </View>
        </View>

        <View style={styles.transactionAmount}>
          <Text style={styles.amountText}>{transactionFeedService.formatAmount(item.amount)}</Text>
          <Text style={styles.priceText}>${item.pricePerToken.toFixed(6)}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Recent Transactions</Text>
        <TouchableOpacity onPress={loadTransactions} style={styles.refreshButton}>
          <Text style={styles.refreshText}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={(item, index) => `${item.signature}-${index}`}
          renderItem={renderTransaction}
          scrollEnabled={false}
          showsVerticalScrollIndicator={false}
          style={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No recent transactions</Text>
            </View>
          }
        />
      )}
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
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  refreshButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.primaryMuted,
    borderRadius: borderRadius.sm,
  },
  refreshText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.primary,
  },
  loadingContainer: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  list: {
    maxHeight: 400,
  },
  transactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  typeIndicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  buyIndicator: {
    backgroundColor: colors.successMuted,
  },
  sellIndicator: {
    backgroundColor: colors.errorMuted,
  },
  transactionInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  transactionTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: 2,
  },
  transactionType: {
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
  buyText: {
    color: colors.success,
  },
  sellText: {
    color: colors.error,
  },
  wallet: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '600',
  },
  transactionBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  tokenAmount: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  timeAgo: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '500',
  },
  transactionAmount: {
    alignItems: 'flex-end',
  },
  amountText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  priceText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '600',
  },
  emptyState: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: '600',
  },
});
