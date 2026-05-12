import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Swords, ChevronLeft, AlertCircle, Info } from 'lucide-react-native';
import { colors, spacing, borderRadius, fontSize, elevation } from '@/constants/theme';
import { ENTRY_AMOUNTS_SOL, computeWinnerPayout, GAME_TREASURY_WALLET } from '@/services/game/gameConfig';
import { payToTreasury, PayStatus } from '@/services/treasuryService';
import { createDuelEntryAfterPayment, DuelEntry } from '@/services/game/duelEntryService';
import { useWallet } from '@/contexts/WalletContext';

interface Props {
  username: string | null;
  avatarUrl: string | null;
  badgeStatus: string;
  onEntryCreated: (entry: DuelEntry) => void;
  onBack: () => void;
}

const STATUS_LABELS: Record<PayStatus, string> = {
  idle: '',
  preparing: 'Preparing transaction…',
  signing: 'Waiting for signature…',
  sending: 'Sending transaction…',
  confirmed: 'Confirmed! Creating entry…',
  failed: 'Transaction failed',
};

function fmt3(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

export function SolDuelEntryPanel({ username, avatarUrl, badgeStatus, onEntryCreated, onBack }: Props) {
  const { activeWallet } = useWallet();
  const [selected, setSelected] = useState<number | null>(null);
  const [custom, setCustom] = useState('');
  const [status, setStatus] = useState<PayStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const entryAmount = selected !== null
    ? selected
    : custom.trim() ? parseFloat(custom) : null;

  const { totalPot, platformFee, winnerPayout } = entryAmount
    ? computeWinnerPayout(entryAmount, entryAmount)
    : { totalPot: 0, platformFee: 0, winnerPayout: 0 };

  const shortTreasury = `${GAME_TREASURY_WALLET.slice(0, 6)}…${GAME_TREASURY_WALLET.slice(-4)}`;

  const canEnter = entryAmount != null && entryAmount >= 0.001 && !loading;

  async function handleEnter() {
    if (!canEnter || !activeWallet) return;
    setError(null);
    setLoading(true);
    setStatus('idle');

    const isExternal = activeWallet.type === 'connected';

    const payResult = await payToTreasury({
      fromAddress: activeWallet.address,
      amountSol: entryAmount!,
      connectedWalletId: isExternal ? (activeWallet.providerId ?? null) : null,
      internalAccountIndex: activeWallet.accountIndex ?? 0,
      onStatus: setStatus,
    });

    if (!payResult.success || !payResult.signature) {
      setError(payResult.error ?? 'Payment failed');
      setLoading(false);
      setStatus('failed');
      return;
    }

    // Create DB entry after on-chain confirmation
    try {
      const entry = await createDuelEntryAfterPayment({
        walletAddress: activeWallet.address,
        username,
        avatarUrl,
        badgeStatus,
        entryAmountSol: entryAmount!,
        paymentTxSignature: payResult.signature,
      });
      onEntryCreated(entry);
    } catch (e: any) {
      setError(`Entry creation failed: ${e.message}. Your payment was confirmed — contact support with tx: ${payResult.signature}`);
    } finally {
      setLoading(false);
      setStatus('idle');
    }
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7}>
          <ChevronLeft size={18} color={colors.textMuted} strokeWidth={2} />
        </TouchableOpacity>
        <View style={styles.headerIcon}>
          <Swords size={20} color={colors.primary} strokeWidth={2} />
        </View>
        <Text style={styles.headerTitle}>SOL Duel Entry</Text>
      </View>

      {/* Amount selector */}
      <Text style={styles.sectionLabel}>Select Entry Amount</Text>
      <View style={styles.presets}>
        {ENTRY_AMOUNTS_SOL.map(amt => (
          <TouchableOpacity
            key={amt}
            style={[styles.presetBtn, selected === amt && styles.presetBtnActive]}
            onPress={() => { setSelected(amt); setCustom(''); }}
            activeOpacity={0.8}
          >
            <Text style={[styles.presetText, selected === amt && styles.presetTextActive]}>
              {fmt3(amt)} SOL
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.customRow}>
        <TextInput
          style={styles.customInput}
          placeholder="Custom amount (SOL)"
          placeholderTextColor={colors.textMuted}
          value={custom}
          onChangeText={t => { setCustom(t); setSelected(null); }}
          keyboardType="decimal-pad"
        />
      </View>

      {/* Summary */}
      {entryAmount && entryAmount > 0 && (
        <View style={styles.summaryCard}>
          <LinearGradient
            colors={['rgba(139,92,246,0.12)', 'rgba(0,0,0,0)']}
            style={StyleSheet.absoluteFill}
          />
          <Row label="Your entry" value={`${fmt3(entryAmount)} SOL`} />
          <Row label="Opponent entry" value={`${fmt3(entryAmount)} SOL`} sub="(same amount)" />
          <View style={styles.divider} />
          <Row label="Total pot" value={`${fmt3(totalPot)} SOL`} bold />
          <Row label="Platform fee (5%)" value={`${fmt3(platformFee)} SOL`} muted />
          <View style={styles.divider} />
          <Row label="Winner receives" value={`${fmt3(winnerPayout)} SOL`} highlight />
          <View style={styles.divider} />
          <View style={styles.treasuryRow}>
            <Info size={11} color={colors.textMuted} strokeWidth={2} />
            <Text style={styles.treasuryText}>Treasury: {shortTreasury}</Text>
          </View>
        </View>
      )}

      {/* Status */}
      {loading && status !== 'idle' && (
        <View style={styles.statusRow}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.statusText}>{STATUS_LABELS[status]}</Text>
        </View>
      )}

      {error && (
        <View style={styles.errorCard}>
          <AlertCircle size={14} color='#D946EF' strokeWidth={2} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Enter button */}
      <TouchableOpacity
        style={[styles.enterBtn, !canEnter && styles.enterBtnDisabled]}
        onPress={handleEnter}
        activeOpacity={0.85}
        disabled={!canEnter}
      >
        {loading ? (
          <ActivityIndicator size="small" color={colors.white} />
        ) : (
          <Text style={styles.enterBtnText}>
            {entryAmount ? `Enter Duel — ${fmt3(entryAmount)} SOL` : 'Select entry amount'}
          </Text>
        )}
      </TouchableOpacity>

      <Text style={styles.legalNote}>
        Entry fees go directly to the game treasury on-chain. Payout is sent to the winner
        wallet after both players complete the run. No luck or random outcomes involved.
      </Text>
    </View>
  );
}

function Row({ label, value, sub, bold, muted, highlight }: {
  label: string; value: string; sub?: string;
  bold?: boolean; muted?: boolean; highlight?: boolean;
}) {
  return (
    <View style={rowStyles.row}>
      <Text style={[rowStyles.label, muted && rowStyles.muted]}>{label}{sub ? <Text style={rowStyles.sub}> {sub}</Text> : null}</Text>
      <Text style={[rowStyles.value, bold && rowStyles.bold, muted && rowStyles.muted, highlight && rowStyles.highlight]}>
        {value}
      </Text>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  label: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: '500' },
  value: { fontSize: fontSize.sm, color: colors.textPrimary, fontWeight: '600' },
  sub: { fontSize: fontSize.xs, color: colors.textMuted },
  bold: { fontWeight: '800' },
  muted: { color: colors.textMuted },
  highlight: { color: colors.primary, fontWeight: '800', fontSize: fontSize.md },
});

const styles = StyleSheet.create({
  container: { gap: spacing.lg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  backBtn: {
    width: 32, height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  headerIcon: {
    width: 36, height: 36,
    borderRadius: 10,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  sectionLabel: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  presets: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  presetBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorderLight,
  },
  presetBtnActive: {
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primary,
  },
  presetText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textMuted,
  },
  presetTextActive: { color: colors.primary },
  customRow: { },
  customInput: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.surfaceBorderLight,
    overflow: 'hidden',
    gap: 2,
  },
  divider: {
    height: 1,
    backgroundColor: colors.surfaceBorder,
    marginVertical: spacing.sm,
  },
  treasuryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.xs,
  },
  treasuryText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '500',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primaryMuted,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorderLight,
  },
  statusText: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: '600',
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: 'rgba(217,70,239,0.08)',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(217,70,239,0.25)',
  },
  errorText: {
    flex: 1,
    fontSize: fontSize.xs,
    color: '#D946EF',
    fontWeight: '500',
    lineHeight: 17,
  },
  enterBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    ...elevation.glow,
  },
  enterBtnDisabled: { opacity: 0.45 },
  enterBtnText: {
    fontSize: fontSize.md,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: 0.3,
  },
  legalNote: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 17,
    fontWeight: '500',
  },
});
