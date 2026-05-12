import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { X, ExternalLink, Swords, CircleAlert as AlertCircle } from 'lucide-react-native';
import { colors, spacing, borderRadius, fontSize, elevation } from '@/constants/theme';
import { DuelEntry, DuelMatch, cancelDuelEntryAndRefund } from '@/services/game/duelEntryService';
import { useSolDuelMatchmaking } from '@/hooks/useSolDuelMatchmaking';

interface Props {
  entry: DuelEntry;
  walletAddress: string;
  onMatched: (match: DuelMatch) => void;
  onCancelled: () => void;
}

function openSolscan(sig: string) {
  const url = `https://solscan.io/tx/${sig}`;
  if (Platform.OS === 'web') {
    (window as any).open(url, '_blank', 'noopener,noreferrer');
  }
}

export function SolDuelWaitingQueue({ entry, walletAddress, onMatched, onCancelled }: Props) {
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [refundTx, setRefundTx] = useState<string | null>(null);

  const { state, match, pollCount } = useSolDuelMatchmaking(entry.id, walletAddress);

  useEffect(() => {
    if (state === 'matched' && match) {
      onMatched(match);
    }
  }, [state, match, onMatched]);

  const handleCancel = async () => {
    if (Platform.OS === 'web') {
      if (!window.confirm('Cancel this duel entry and refund your SOL?')) return;
    } else {
      await new Promise<void>((resolve, reject) => {
        Alert.alert(
          'Cancel Duel Entry',
          'Cancel this entry and refund your SOL?',
          [
            { text: 'Keep Waiting', style: 'cancel', onPress: () => reject() },
            { text: 'Cancel & Refund', style: 'destructive', onPress: () => resolve() },
          ]
        );
      }).catch(() => null);
    }

    setCancelling(true);
    setCancelError(null);
    try {
      const result = await cancelDuelEntryAndRefund({ entryId: entry.id, walletAddress });
      setRefundTx(result.refund_tx_signature);
      onCancelled();
    } catch (e: any) {
      setCancelError(e.message ?? 'Refund failed');
    } finally {
      setCancelling(false);
    }
  };

  if (refundTx) {
    return (
      <View style={styles.container}>
        <View style={styles.refundCard}>
          <LinearGradient colors={['rgba(139,92,246,0.12)', 'rgba(0,0,0,0)']} style={StyleSheet.absoluteFill} />
          <Text style={styles.refundTitle}>Refund Sent</Text>
          <Text style={styles.refundText}>
            Your {entry.entry_amount_sol} SOL has been refunded to your wallet.
          </Text>
          <TouchableOpacity onPress={() => openSolscan(refundTx)} style={styles.txLink} activeOpacity={0.7}>
            <ExternalLink size={12} color={colors.primary} strokeWidth={2} />
            <Text style={styles.txText}>{refundTx.slice(0, 12)}…{refundTx.slice(-8)}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Status card */}
      <View style={styles.card}>
        <LinearGradient
          colors={['rgba(139,92,246,0.18)', 'rgba(0,0,0,0)']}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.iconRow}>
          <View style={styles.iconBg}>
            <Swords size={28} color={colors.primary} strokeWidth={1.5} />
          </View>
          <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: spacing.sm }} />
        </View>
        <Text style={styles.title}>Waiting for Opponent</Text>
        <Text style={styles.sub}>
          Searching for a player ready to duel at {entry.entry_amount_sol} SOL
        </Text>

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Entry</Text>
            <Text style={styles.statValue}>{entry.entry_amount_sol} SOL</Text>
          </View>
          <View style={styles.statDiv} />
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Status</Text>
            <Text style={[styles.statValue, { color: colors.primary }]}>Waiting</Text>
          </View>
          <View style={styles.statDiv} />
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Polls</Text>
            <Text style={styles.statValue}>{pollCount}</Text>
          </View>
        </View>

        {/* Payment tx */}
        {entry.payment_tx_signature && (
          <TouchableOpacity
            onPress={() => openSolscan(entry.payment_tx_signature!)}
            style={styles.txLink}
            activeOpacity={0.7}
          >
            <ExternalLink size={11} color={colors.textMuted} strokeWidth={2} />
            <Text style={styles.txText}>
              Payment: {entry.payment_tx_signature.slice(0, 10)}…{entry.payment_tx_signature.slice(-6)}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Cancel error */}
      {cancelError && (
        <View style={styles.errorCard}>
          <AlertCircle size={13} color='#D946EF' strokeWidth={2} />
          <Text style={styles.errorText}>{cancelError}</Text>
        </View>
      )}

      {/* Cancel button */}
      <TouchableOpacity
        style={[styles.cancelBtn, cancelling && { opacity: 0.6 }]}
        onPress={handleCancel}
        activeOpacity={0.8}
        disabled={cancelling}
      >
        {cancelling ? (
          <ActivityIndicator size="small" color='#D946EF' />
        ) : (
          <>
            <X size={15} color='#D946EF' strokeWidth={2.5} />
            <Text style={styles.cancelText}>Cancel & Refund</Text>
          </>
        )}
      </TouchableOpacity>

      <Text style={styles.hint}>
        Cancellation refunds your full entry amount. No fee is charged for unmatched entries.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xxl,
    borderWidth: 1,
    borderColor: colors.surfaceBorderLight,
    overflow: 'hidden',
    alignItems: 'center',
    gap: spacing.md,
    ...elevation.md,
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  iconBg: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primaryMuted,
    borderWidth: 2,
    borderColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...elevation.glow,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  sub: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
    fontWeight: '500',
    lineHeight: 20,
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    width: '100%',
    marginTop: spacing.sm,
  },
  stat: { flex: 1, alignItems: 'center' },
  statLabel: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '500', marginBottom: 2 },
  statValue: { fontSize: fontSize.sm, fontWeight: '800', color: colors.textPrimary },
  statDiv: { width: 1, backgroundColor: colors.surfaceBorder },
  txLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.sm,
  },
  txText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '500',
    fontFamily: 'SpaceMono-Regular',
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: 'rgba(217,70,239,0.08)',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(217,70,239,0.2)',
  },
  errorText: { flex: 1, fontSize: fontSize.xs, color: '#D946EF', fontWeight: '500' },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(217,70,239,0.08)',
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(217,70,239,0.3)',
  },
  cancelText: { fontSize: fontSize.sm, fontWeight: '700', color: '#D946EF' },
  hint: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textAlign: 'center',
    fontWeight: '500',
    lineHeight: 17,
  },
  refundCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xxl,
    borderWidth: 1,
    borderColor: colors.surfaceBorderLight,
    overflow: 'hidden',
    alignItems: 'center',
    gap: spacing.md,
  },
  refundTitle: { fontSize: fontSize.xl, fontWeight: '800', color: colors.primary },
  refundText: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center', fontWeight: '500' },
});
