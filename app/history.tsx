import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, ArrowUpRight, ArrowDownLeft, RefreshCw, TrendingUp, Send, Download, ExternalLink } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { colors, spacing, borderRadius, fontSize, elevation } from '@/constants/theme';
import { useWallet } from '@/contexts/WalletContext';
import { SolanaConnectionService } from '@/services/solana/connectionService';
import { PublicKey } from '@solana/web3.js';
import * as Linking from 'expo-linking';

interface ChainTx {
  signature: string;
  blockTime: number | null;
  err: any;
  memo: string | null;
}

type FilterType = 'all' | 'sent' | 'received';

export default function TransactionHistoryScreen() {
  const router = useRouter();
  const { activeAddress } = useWallet();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [transactions, setTransactions] = useState<ChainTx[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [error, setError] = useState<string | null>(null);

  const loadTransactions = useCallback(async () => {
    if (!activeAddress) {
      setTransactions([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const connection = SolanaConnectionService.getInstance().getConnection();
      const pubkey = new PublicKey(activeAddress);
      const sigs = await connection.getSignaturesForAddress(pubkey, { limit: 50 });
      const txs: ChainTx[] = sigs.map((s) => ({
        signature: s.signature,
        blockTime: s.blockTime ?? null,
        err: s.err,
        memo: s.memo ?? null,
      }));
      setTransactions(txs);
    } catch (e: any) {
      console.error('[History] Error:', e);
      setError('Failed to load transaction history. Check your connection.');
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, [activeAddress]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadTransactions();
    setRefreshing(false);
  };

  const formatDate = (blockTime: number | null) => {
    if (!blockTime) return 'Pending';
    const date = new Date(blockTime * 1000);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const openExplorer = (signature: string) => {
    Linking.openURL(`https://solscan.io/tx/${signature}`).catch(() => {});
  };

  const filteredTxs = transactions.filter((tx) => {
    if (filter === 'all') return true;
    // Without parsing full tx details, we classify by error presence only
    return true;
  });

  const renderTx = ({ item }: { item: ChainTx }) => {
    const isError = !!item.err;
    return (
      <TouchableOpacity style={styles.txItem} onPress={() => openExplorer(item.signature)} activeOpacity={0.75}>
        <View style={[styles.iconContainer, { backgroundColor: isError ? colors.errorMuted : colors.primaryMuted }]}>
          {isError ? (
            <ArrowUpRight size={18} color={colors.error} />
          ) : (
            <TrendingUp size={18} color={colors.primary} />
          )}
        </View>

        <View style={styles.txInfo}>
          <View style={styles.txHeader}>
            <Text style={styles.txType}>{isError ? 'Failed Tx' : 'Transaction'}</Text>
            <View style={[styles.statusBadge, { backgroundColor: isError ? colors.errorMuted : colors.successMuted }]}>
              <View style={[styles.statusDot, { backgroundColor: isError ? colors.error : colors.success }]} />
              <Text style={[styles.statusText, { color: isError ? colors.error : colors.success }]}>
                {isError ? 'Failed' : 'Confirmed'}
              </Text>
            </View>
          </View>
          <Text style={styles.txSig} numberOfLines={1} ellipsizeMode="middle">
            {item.signature}
          </Text>
          <View style={styles.txFooter}>
            <Text style={styles.txDate}>{formatDate(item.blockTime)}</Text>
            <View style={styles.explorerLink}>
              <ExternalLink size={12} color={colors.primary} />
              <Text style={styles.explorerText}>View on Solscan</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <LinearGradient colors={colors.gradient.primary as any} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Transaction History</Text>
        <TouchableOpacity onPress={handleRefresh} style={styles.backButton}>
          <RefreshCw size={22} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {!activeAddress ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No wallet connected</Text>
          <Text style={styles.emptySubtext}>Connect or import a wallet to see transaction history</Text>
        </View>
      ) : loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading from Solana...</Text>
        </View>
      ) : error ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Could not load</Text>
          <Text style={styles.emptySubtext}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadTransactions}>
            <RefreshCw size={16} color={colors.white} />
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : filteredTxs.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No transactions yet</Text>
          <Text style={styles.emptySubtext}>Your on-chain activity will appear here</Text>
        </View>
      ) : (
        <FlatList
          data={filteredTxs}
          renderItem={renderTx}
          keyExtractor={(item) => item.signature}
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
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingHorizontal: spacing.xl,
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
  headerTitle: { fontSize: fontSize.xl, fontWeight: '700', color: colors.textPrimary },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.md },
  loadingText: { fontSize: fontSize.md, color: colors.textSecondary, fontWeight: '600' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xxl, gap: spacing.md },
  emptyText: { fontSize: fontSize.lg, fontWeight: '700', color: colors.textPrimary },
  emptySubtext: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.md,
    marginTop: spacing.lg,
  },
  retryText: { fontSize: fontSize.md, fontWeight: '700', color: colors.white },
  listContent: { padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: 100 },
  txItem: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    ...elevation.sm,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  txInfo: { flex: 1 },
  txHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  txType: { fontSize: fontSize.md, fontWeight: '700', color: colors.textPrimary },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  statusText: { fontSize: 10, fontWeight: '700' },
  txSig: { fontSize: fontSize.xs, color: colors.textMuted, fontFamily: 'SpaceMono-Regular', marginBottom: 4 },
  txFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  txDate: { fontSize: fontSize.xs, color: colors.textMuted },
  explorerLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  explorerText: { fontSize: fontSize.xs, color: colors.primary, fontWeight: '600' },
});
