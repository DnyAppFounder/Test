import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Linking,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowDownLeft, ArrowUpRight, RefreshCw, ExternalLink, CircleAlert as AlertCircle, Clock, ChevronDown } from 'lucide-react-native';
import { SolanaConnectionService } from '@/services/solana/connectionService';
import { colors, spacing, borderRadius, fontSize } from '@/constants/theme';

interface TxRow {
  signature: string;
  blockTime: number | null;
  err: any;
  memo: string | null;
}

function timeAgo(ts: number | null): string {
  if (!ts) return '—';
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function shortSig(sig: string) {
  return `${sig.slice(0, 6)}...${sig.slice(-4)}`;
}

function openSolscan(sig: string) {
  const url = `https://solscan.io/tx/${sig}`;
  if (Platform.OS === 'web') {
    window.open(url, '_blank');
  } else {
    Linking.openURL(url).catch(() => {});
  }
}

interface Props {
  walletAddress: string;
  limit?: number;
}

export function WalletActivity({ walletAddress, limit = 50 }: Props) {
  const [txns, setTxns] = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCount, setShowCount] = useState(20);

  const load = useCallback(async () => {
    if (!walletAddress) return;
    setLoading(true);
    setError(null);
    try {
      const svc = SolanaConnectionService.getInstance();
      const result = await svc.rpcCall('getSignaturesForAddress', [
        walletAddress,
        { limit, commitment: 'confirmed' },
      ]);
      const sigs: any[] = Array.isArray(result) ? result : [];
      setTxns(sigs.map((s: any) => ({
        signature: s.signature,
        blockTime: s.blockTime ?? null,
        err: s.err ?? null,
        memo: s.memo ?? null,
      })));
    } catch (e: any) {
      const msg = e?.message || String(e) || 'Unknown error';
      console.error('[WalletActivity] Failed to load activity:', msg);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [walletAddress, limit]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={s.loadingText}>Loading activity...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={s.errorState}>
        <AlertCircle size={32} color={colors.error} strokeWidth={1.5} />
        <Text style={s.errorTitle}>Could not load activity</Text>
        <Text style={s.errorSub}>{error}</Text>
        <TouchableOpacity style={s.retryBtn} onPress={load} activeOpacity={0.8}>
          <RefreshCw size={14} color={colors.primary} strokeWidth={2} />
          <Text style={s.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (txns.length === 0) {
    return (
      <View style={s.emptyState}>
        <Clock size={36} color={colors.textMuted} strokeWidth={1.5} />
        <Text style={s.emptyTitle}>No activity yet</Text>
        <Text style={s.emptySub}>Your recent transactions will appear here.</Text>
      </View>
    );
  }

  const visible = txns.slice(0, showCount);

  return (
    <View style={s.root}>
      <View style={s.header}>
        <Text style={s.headerTitle}>Transaction Activity</Text>
        <Text style={s.headerCount}>{txns.length} recent</Text>
        <TouchableOpacity onPress={load} style={s.refreshBtn} activeOpacity={0.7}>
          <RefreshCw size={15} color={colors.textMuted} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      {visible.map((tx, idx) => {
        const failed = !!tx.err;
        return (
          <TouchableOpacity
            key={tx.signature}
            style={[s.txRow, idx < visible.length - 1 && s.txBorder]}
            onPress={() => openSolscan(tx.signature)}
            activeOpacity={0.8}
          >
            <View style={[s.txIcon, failed ? s.txIconFail : s.txIconOk]}>
              {failed
                ? <AlertCircle size={16} color="#EF4444" strokeWidth={2} />
                : <ArrowDownLeft size={16} color={colors.primary} strokeWidth={2} />
              }
            </View>
            <View style={s.txInfo}>
              <Text style={s.txSig}>{shortSig(tx.signature)}</Text>
              {tx.memo && <Text style={s.txMemo} numberOfLines={1}>{tx.memo}</Text>}
              <Text style={s.txTime}>{timeAgo(tx.blockTime)}</Text>
            </View>
            <View style={s.txRight}>
              <View style={[s.statusPill, failed ? s.statusFail : s.statusOk]}>
                <Text style={[s.statusText, failed ? s.statusFailText : s.statusOkText]}>
                  {failed ? 'Failed' : 'Confirmed'}
                </Text>
              </View>
              <ExternalLink size={13} color={colors.textMuted} strokeWidth={2} style={{ marginTop: 4 }} />
            </View>
          </TouchableOpacity>
        );
      })}

      {showCount < txns.length && (
        <TouchableOpacity
          style={s.loadMoreBtn}
          onPress={() => setShowCount(prev => Math.min(prev + 20, txns.length))}
          activeOpacity={0.8}
        >
          <ChevronDown size={16} color={colors.primary} strokeWidth={2} />
          <Text style={s.loadMoreText}>Load more ({txns.length - showCount} remaining)</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { paddingHorizontal: spacing.xxl, paddingBottom: spacing.xl },
  center: { alignItems: 'center', paddingVertical: 48, gap: spacing.md },
  loadingText: { fontSize: fontSize.sm, color: colors.textMuted },
  errorState: { alignItems: 'center', paddingVertical: 40, gap: spacing.md },
  errorTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.textPrimary },
  errorSub: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center' },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.lg,
    backgroundColor: colors.primaryMuted, borderRadius: borderRadius.full,
    borderWidth: 1, borderColor: colors.primary,
  },
  retryText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.primary },
  emptyState: { alignItems: 'center', paddingVertical: 40, gap: spacing.sm },
  emptyTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.textPrimary },
  emptySub: { fontSize: fontSize.sm, color: colors.textMuted },

  header: {
    flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md,
    paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.surfaceBorderLight,
  },
  headerTitle: { fontSize: fontSize.md, fontWeight: '800', color: colors.textPrimary, flex: 1 },
  headerCount: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '500', marginRight: spacing.sm },
  refreshBtn: { padding: 4 },

  txRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: spacing.md,
  },
  txBorder: { borderBottomWidth: 1, borderBottomColor: colors.surfaceBorderLight },
  txIcon: {
    width: 36, height: 36, borderRadius: 18,
    justifyContent: 'center', alignItems: 'center',
  },
  txIconOk: { backgroundColor: colors.primaryMuted },
  txIconFail: { backgroundColor: 'rgba(239,68,68,0.12)' },
  txInfo: { flex: 1, gap: 2 },
  txSig: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textPrimary, fontFamily: 'monospace' },
  txMemo: { fontSize: fontSize.xs, color: colors.textMuted },
  txTime: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '500' },
  txRight: { alignItems: 'flex-end' },
  statusPill: {
    paddingVertical: 3, paddingHorizontal: 8, borderRadius: borderRadius.sm,
  },
  statusOk: { backgroundColor: colors.primaryMuted },
  statusFail: { backgroundColor: 'rgba(239,68,68,0.12)' },
  statusText: { fontSize: 11, fontWeight: '700' },
  statusOkText: { color: colors.primary },
  statusFailText: { color: '#EF4444' },

  loadMoreBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, paddingVertical: spacing.lg,
    borderTopWidth: 1, borderTopColor: colors.surfaceBorderLight,
  },
  loadMoreText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.primary },
});
