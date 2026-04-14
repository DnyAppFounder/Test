import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useState, useEffect } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, ArrowUpRight, ArrowDownLeft, RefreshCw, TrendingUp, Send, Download } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { colors, spacing, borderRadius, fontSize, elevation } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useWallet } from '@/contexts/WalletContext';
import { SocialService } from '@/services/socialService';

interface Transaction {
  id: string;
  transaction_type: 'buy' | 'sell' | 'send' | 'receive' | 'swap';
  quantity: number;
  price_per_token: number;
  total_value: number;
  fee: number;
  status: 'pending' | 'completed' | 'failed';
  created_at: string;
  token_symbol?: string;
  notes?: string;
}

export default function TransactionHistoryScreen() {
  const router = useRouter();
  const { selectedAccount } = useWallet();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filter, setFilter] = useState<'all' | 'buy' | 'sell' | 'swap'>('all');

  useEffect(() => {
    loadTransactions();
  }, [selectedAccount]);

  const loadTransactions = async () => {
    if (!selectedAccount) return;

    setLoading(true);
    const profile = await SocialService.getOrCreateProfile(selectedAccount.address);

    if (profile) {
      const { data } = await supabase
        .from('user_transactions')
        .select('*')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (data) {
        setTransactions(data as Transaction[]);
      }
    }
    setLoading(false);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadTransactions();
    setRefreshing(false);
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'buy':
        return <Download size={20} color={colors.success} />;
      case 'sell':
        return <ArrowUpRight size={20} color={colors.error} />;
      case 'send':
        return <Send size={20} color={colors.warning} />;
      case 'receive':
        return <ArrowDownLeft size={20} color={colors.success} />;
      case 'swap':
        return <RefreshCw size={20} color={colors.primary} />;
      default:
        return <TrendingUp size={20} color={colors.textMuted} />;
    }
  };

  const getTransactionColor = (type: string) => {
    switch (type) {
      case 'buy':
      case 'receive':
        return colors.success;
      case 'sell':
        return colors.error;
      case 'send':
        return colors.warning;
      case 'swap':
        return colors.primary;
      default:
        return colors.textMuted;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const filteredTransactions = filter === 'all'
    ? transactions
    : transactions.filter(tx => tx.transaction_type === filter);

  const renderTransaction = ({ item }: { item: Transaction }) => (
    <TouchableOpacity style={styles.transactionItem}>
      <View style={[styles.iconContainer, { backgroundColor: `${getTransactionColor(item.transaction_type)}20` }]}>
        {getTransactionIcon(item.transaction_type)}
      </View>

      <View style={styles.transactionInfo}>
        <View style={styles.transactionHeader}>
          <Text style={styles.transactionType}>
            {item.transaction_type.charAt(0).toUpperCase() + item.transaction_type.slice(1)}
          </Text>
          <Text style={[styles.transactionAmount, { color: getTransactionColor(item.transaction_type) }]}>
            {['buy', 'receive'].includes(item.transaction_type) ? '+' : '-'}
            {item.quantity.toFixed(4)}
          </Text>
        </View>

        <View style={styles.transactionDetails}>
          <Text style={styles.transactionDate}>{formatDate(item.created_at)}</Text>
          <Text style={styles.transactionValue}>
            ${item.total_value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>
        </View>

        {item.notes && (
          <Text style={styles.transactionNotes} numberOfLines={1}>{item.notes}</Text>
        )}

        <View style={styles.statusBadge}>
          <View style={[
            styles.statusDot,
            {
              backgroundColor:
                item.status === 'completed' ? colors.success :
                item.status === 'pending' ? colors.warning :
                colors.error
            }
          ]} />
          <Text style={styles.statusText}>
            {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <LinearGradient colors={colors.gradient.primary as any} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Transaction History</Text>
        <TouchableOpacity onPress={handleRefresh} style={styles.backButton}>
          <RefreshCw size={24} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <View style={styles.filterBar}>
        {['all', 'buy', 'sell', 'swap'].map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterButton, filter === f && styles.filterButtonActive]}
            onPress={() => setFilter(f as any)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : filteredTransactions.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No transactions yet</Text>
          <Text style={styles.emptySubtext}>Your transaction history will appear here</Text>
        </View>
      ) : (
        <FlatList
          data={filteredTransactions}
          renderItem={renderTransaction}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing}
          onRefresh={handleRefresh}
        />
      )}
    </LinearGradient>
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
    paddingTop: spacing.xl * 2,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    ...elevation.sm,
  },
  headerTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  filterBar: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  filterButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  filterButtonActive: {
    backgroundColor: colors.primaryMuted,
  },
  filterText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.textMuted,
  },
  filterTextActive: {
    color: colors.primary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyText: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  emptySubtext: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
  },
  listContent: {
    padding: spacing.lg,
    paddingTop: 0,
  },
  transactionItem: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.md,
    ...elevation.sm,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  transactionInfo: {
    flex: 1,
  },
  transactionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  transactionType: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  transactionAmount: {
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  transactionDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  transactionDate: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  transactionValue: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  transactionNotes: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
});
