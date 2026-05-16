import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Platform,
} from 'react-native';
import { ArrowDownLeft, ArrowUpRight, RefreshCw, ExternalLink, CircleAlert as AlertCircle, Clock, ChevronDown, ArrowLeftRight, Zap } from 'lucide-react-native';
import { SolanaConnectionService } from '@/services/solana/connectionService';
import { colors, spacing, borderRadius, fontSize } from '@/constants/theme';

type TxKind = 'receive_sol' | 'send_sol' | 'receive_token' | 'send_token' | 'swap' | 'failed' | 'unknown';

interface ParsedTxRow {
  signature: string;
  blockTime: number | null;
  kind: TxKind;
  label: string;
  amount: string;
  counterparty: string | null;
  failed: boolean;
}

function timeAgo(ts: number | null): string {
  if (!ts) return '—';
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function shortAddr(addr: string | null): string {
  if (!addr) return '—';
  if (addr.length < 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function shortSig(sig: string): string {
  return `${sig.slice(0, 6)}...${sig.slice(-4)}`;
}

function openSolscan(sig: string) {
  const url = `https://solscan.io/tx/${sig}`;
  if (Platform.OS === 'web') {
    try { window.open(url, '_blank', 'noopener,noreferrer'); } catch {}
  } else {
    Linking.openURL(url).catch(() => {});
  }
}

function parseTxRow(walletAddr: string, sig: string, blockTime: number | null, txData: any): ParsedTxRow {
  const base: ParsedTxRow = { signature: sig, blockTime, kind: 'unknown', label: 'Transaction', amount: '', counterparty: null, failed: false };

  if (!txData?.meta || !txData?.transaction) return base;

  const meta = txData.meta;
  const failed = !!meta.err;

  if (failed) {
    return { ...base, kind: 'failed', label: 'Failed', failed: true };
  }

  const message = txData.transaction.message;
  const rawKeys: any[] = message.accountKeys ?? [];
  // accountKeys entries may be objects {pubkey, signer, writable} or bare strings
  const keys: string[] = rawKeys.map((k: any) => (typeof k === 'string' ? k : k.pubkey));

  const walletIdx = keys.findIndex(k => k === walletAddr);
  const fee = meta.fee ?? 0;

  // SOL balance change for this wallet (excluding fee)
  const solPre = walletIdx >= 0 ? (meta.preBalances?.[walletIdx] ?? 0) : 0;
  const solPost = walletIdx >= 0 ? (meta.postBalances?.[walletIdx] ?? 0) : 0;
  // Net SOL change excluding fee paid by wallet (walletIdx === 0 typically pays fee)
  const isFeePayer = walletIdx === 0;
  const solNetLamports = solPost - solPre + (isFeePayer ? fee : 0);
  const solNet = solNetLamports / 1e9;

  // Token balance changes for this wallet
  interface TokenChange { mint: string; symbol: string; change: number }
  const tokenChanges: TokenChange[] = [];
  const preTokenMap = new Map<string, { amount: number; symbol: string }>();
  const postTokenMap = new Map<string, { amount: number; symbol: string }>();

  for (const t of (meta.preTokenBalances ?? [])) {
    const owner = t.owner ?? keys[t.accountIndex ?? -1];
    if (owner === walletAddr) {
      preTokenMap.set(t.mint, { amount: parseFloat(t.uiTokenAmount?.uiAmountString ?? '0'), symbol: t.uiTokenAmount?.symbol ?? '' });
    }
  }
  for (const t of (meta.postTokenBalances ?? [])) {
    const owner = t.owner ?? keys[t.accountIndex ?? -1];
    if (owner === walletAddr) {
      postTokenMap.set(t.mint, { amount: parseFloat(t.uiTokenAmount?.uiAmountString ?? '0'), symbol: t.uiTokenAmount?.symbol ?? '' });
    }
  }

  const allMints = new Set([...preTokenMap.keys(), ...postTokenMap.keys()]);
  for (const mint of allMints) {
    const pre = preTokenMap.get(mint)?.amount ?? 0;
    const post = postTokenMap.get(mint)?.amount ?? 0;
    const sym = postTokenMap.get(mint)?.symbol ?? preTokenMap.get(mint)?.symbol ?? '';
    const change = post - pre;
    if (Math.abs(change) > 1e-9) {
      tokenChanges.push({ mint, symbol: sym, change });
    }
  }

  // Look for counterparty from parsed instructions
  let counterparty: string | null = null;
  for (const ix of (message.instructions ?? [])) {
    const parsed = ix.parsed;
    if (!parsed) continue;
    const prog = ix.program ?? '';
    const type = parsed.type ?? '';
    const info = parsed.info ?? {};

    if (prog === 'system' && type === 'transfer') {
      // Native SOL transfer instruction
      if (info.destination && info.destination !== walletAddr) counterparty = info.destination;
      else if (info.source && info.source !== walletAddr) counterparty = info.source;
    } else if ((prog === 'spl-token' || prog === 'spl-token-2022') && (type === 'transfer' || type === 'transferChecked')) {
      if (info.destination && info.destination !== walletAddr) counterparty = info.destination;
      else if (info.source && info.source !== walletAddr) counterparty = info.source;
      // May also have authority
      if (info.authority && info.authority !== walletAddr) counterparty = counterparty ?? info.authority;
    }
  }

  // If no counterparty from instructions, try to infer from keys
  if (!counterparty && keys.length > 1) {
    counterparty = keys.find(k => k !== walletAddr) ?? null;
  }

  // Classify
  const hasTokenChanges = tokenChanges.length > 0;
  const hasTokenIn = tokenChanges.some(t => t.change > 0);
  const hasTokenOut = tokenChanges.some(t => t.change < 0);
  const isSwap = hasTokenIn && hasTokenOut;

  if (isSwap) {
    // Token-to-token trade — show as "Bought Y" since user acquired Y
    const inToken = tokenChanges.find(t => t.change > 0);
    const outToken = tokenChanges.find(t => t.change < 0);
    const inLabel = inToken?.symbol || shortAddr(inToken?.mint ?? null);
    const inAmt = inToken ? inToken.change.toFixed(4) : '';
    const outAmt = outToken ? Math.abs(outToken.change).toFixed(4) : '';
    const outLabel = outToken?.symbol || shortAddr(outToken?.mint ?? null);
    return {
      signature: sig, blockTime, kind: 'swap', failed: false,
      label: `Bought ${inLabel}`,
      amount: outAmt && inAmt ? `-${outAmt} ${outLabel} / +${inAmt} ${inLabel}` : inAmt ? `+${inAmt} ${inLabel}` : '',
      counterparty: null,
    };
  }

  if (hasTokenIn && !hasTokenOut) {
    const token = tokenChanges.find(t => t.change > 0)!;
    const sym = token.symbol || shortAddr(token.mint);
    const amt = token.change.toFixed(4);
    // Negative SOL net = user paid SOL to receive token → Buy
    const isBuy = solNet < -0.000001;
    return {
      signature: sig, blockTime, kind: isBuy ? 'swap' : 'receive_token', failed: false,
      label: isBuy ? `Bought ${sym}` : `Received ${sym}`,
      amount: `+${amt} ${token.symbol || ''}`.trim(),
      counterparty: isBuy ? null : counterparty,
    };
  }

  if (hasTokenOut && !hasTokenIn) {
    const token = tokenChanges.find(t => t.change < 0)!;
    const sym = token.symbol || shortAddr(token.mint);
    const amt = Math.abs(token.change).toFixed(4);
    // Positive SOL net = user received SOL for sending token → Sell
    const isSell = solNet > 0.000001;
    return {
      signature: sig, blockTime, kind: isSell ? 'swap' : 'send_token', failed: false,
      label: isSell ? `Sold ${sym}` : `Sent ${sym}`,
      amount: `-${amt} ${token.symbol || ''}`.trim(),
      counterparty: isSell ? null : counterparty,
    };
  }

  if (Math.abs(solNet) > 0.000001) {
    if (solNet > 0) {
      return {
        signature: sig, blockTime, kind: 'receive_sol', failed: false,
        label: 'Received SOL',
        amount: `+${solNet.toFixed(6)} SOL`,
        counterparty,
      };
    } else {
      return {
        signature: sig, blockTime, kind: 'send_sol', failed: false,
        label: 'Sent SOL',
        amount: `${solNet.toFixed(6)} SOL`,
        counterparty,
      };
    }
  }

  return { ...base, counterparty, failed: false, label: 'Transaction' };
}

interface Props {
  walletAddress: string;
  limit?: number;
}

export function WalletActivity({ walletAddress, limit = 50 }: Props) {
  const [rows, setRows] = useState<ParsedTxRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCount, setShowCount] = useState(20);

  const load = useCallback(async () => {
    if (!walletAddress) return;
    setLoading(true);
    setError(null);
    try {
      const svc = SolanaConnectionService.getInstance();

      // Step 1: get signatures
      const sigResult = await svc.rpcCall('getSignaturesForAddress', [
        walletAddress,
        { limit, commitment: 'confirmed' },
      ]);
      const sigs: any[] = Array.isArray(sigResult) ? sigResult : [];
      if (sigs.length === 0) { setRows([]); return; }

      // Step 2: fetch parsed tx data for first 20 (avoid too many parallel calls)
      const batch = sigs.slice(0, 20);
      const parsed = await Promise.all(
        batch.map(async (s: any) => {
          try {
            const txData = await svc.rpcCall('getTransaction', [
              s.signature,
              { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'confirmed' },
            ]);
            return parseTxRow(walletAddress, s.signature, s.blockTime ?? null, txData);
          } catch {
            return {
              signature: s.signature,
              blockTime: s.blockTime ?? null,
              kind: 'unknown' as TxKind,
              label: 'Transaction',
              amount: '',
              counterparty: null,
              failed: !!s.err,
            };
          }
        })
      );

      // Remaining sigs (not yet parsed) — shown as stubs if user scrolls
      const remaining: ParsedTxRow[] = sigs.slice(20).map((s: any) => ({
        signature: s.signature,
        blockTime: s.blockTime ?? null,
        kind: 'unknown' as TxKind,
        label: 'Transaction',
        amount: '',
        counterparty: null,
        failed: !!s.err,
      }));

      setRows([...parsed, ...remaining]);
    } catch (e: any) {
      const msg = e?.message || String(e) || 'Unknown error';
      console.error('[WalletActivity] Failed to load activity:', msg);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [walletAddress, limit]);

  useEffect(() => { load(); }, [load]);

  const kindIcon = (kind: TxKind, failed: boolean) => {
    if (failed) return <AlertCircle size={16} color="#EF4444" strokeWidth={2} />;
    switch (kind) {
      case 'receive_sol': case 'receive_token': return <ArrowDownLeft size={16} color={colors.success} strokeWidth={2} />;
      case 'send_sol': case 'send_token': return <ArrowUpRight size={16} color={colors.error} strokeWidth={2} />;
      case 'swap': return <ArrowLeftRight size={16} color={colors.primary} strokeWidth={2} />;
      default: return <Zap size={16} color={colors.textMuted} strokeWidth={2} />;
    }
  };

  const kindBg = (kind: TxKind, failed: boolean): object => {
    if (failed) return { backgroundColor: 'rgba(239,68,68,0.12)' };
    switch (kind) {
      case 'receive_sol': case 'receive_token': return { backgroundColor: 'rgba(16,185,129,0.12)' };
      case 'send_sol': case 'send_token': return { backgroundColor: 'rgba(239,68,68,0.10)' };
      case 'swap': return { backgroundColor: colors.primaryMuted };
      default: return { backgroundColor: colors.surfaceLight };
    }
  };

  const amountColor = (kind: TxKind): string => {
    switch (kind) {
      case 'receive_sol': case 'receive_token': return '#10B981';
      case 'send_sol': case 'send_token': return '#EF4444';
      default: return colors.textPrimary;
    }
  };

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

  if (rows.length === 0) {
    return (
      <View style={s.emptyState}>
        <Clock size={36} color={colors.textMuted} strokeWidth={1.5} />
        <Text style={s.emptyTitle}>No activity yet</Text>
        <Text style={s.emptySub}>Your recent transactions will appear here.</Text>
      </View>
    );
  }

  const visible = rows.slice(0, showCount);

  return (
    <View style={s.root}>
      <View style={s.header}>
        <Text style={s.headerTitle}>Transaction Activity</Text>
        <Text style={s.headerCount}>{rows.length} recent</Text>
        <TouchableOpacity onPress={load} style={s.refreshBtn} activeOpacity={0.7}>
          <RefreshCw size={15} color={colors.textMuted} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      {visible.map((tx, idx) => (
        <TouchableOpacity
          key={tx.signature}
          style={[s.txRow, idx < visible.length - 1 && s.txBorder]}
          onPress={() => openSolscan(tx.signature)}
          activeOpacity={0.8}
        >
          <View style={[s.txIcon, kindBg(tx.kind, tx.failed)]}>
            {kindIcon(tx.kind, tx.failed)}
          </View>
          <View style={s.txInfo}>
            <Text style={s.txLabel}>{tx.label}</Text>
            {tx.counterparty && (
              <Text style={s.txCounterparty} numberOfLines={1}>
                {tx.kind === 'receive_sol' || tx.kind === 'receive_token' ? 'From: ' : 'To: '}
                {shortAddr(tx.counterparty)}
              </Text>
            )}
            <Text style={s.txTime}>{timeAgo(tx.blockTime)}</Text>
          </View>
          <View style={s.txRight}>
            {tx.amount ? (
              <Text style={[s.txAmount, { color: amountColor(tx.kind) }]}>{tx.amount}</Text>
            ) : null}
            <ExternalLink size={12} color={colors.textMuted} strokeWidth={2} style={{ marginTop: 4 }} />
          </View>
        </TouchableOpacity>
      ))}

      {showCount < rows.length && (
        <TouchableOpacity
          style={s.loadMoreBtn}
          onPress={() => setShowCount(prev => Math.min(prev + 20, rows.length))}
          activeOpacity={0.8}
        >
          <ChevronDown size={16} color={colors.primary} strokeWidth={2} />
          <Text style={s.loadMoreText}>Load more ({rows.length - showCount} remaining)</Text>
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
    flexShrink: 0,
  },
  txInfo: { flex: 1, gap: 2 },
  txLabel: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textPrimary },
  txCounterparty: { fontSize: fontSize.xs, color: colors.textMuted, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined },
  txTime: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '500' },
  txRight: { alignItems: 'flex-end', gap: 2 },
  txAmount: { fontSize: fontSize.sm, fontWeight: '700' },
  loadMoreBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, paddingVertical: spacing.lg,
    borderTopWidth: 1, borderTopColor: colors.surfaceBorderLight,
  },
  loadMoreText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.primary },
});
