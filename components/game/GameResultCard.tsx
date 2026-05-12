import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Trophy, Target, Clock, Zap, Star, ExternalLink, RotateCcw } from 'lucide-react-native';
import { colors, spacing, borderRadius, fontSize, elevation } from '@/constants/theme';
import { DuelMatch, getMatchForEntry, finalizeMatchPayout } from '@/services/game/duelEntryService';

export interface GameResultData {
  score: number;
  survivalTimeMs: number;
  orbsCollected: number;
  trapsHit: number;
  obstaclesHit: number;
  comboMax: number;
  accuracy: number;
  sessionId: string;
}

interface Props {
  result: GameResultData;
  mode: 'free' | 'ranked' | 'sol_duel';
  entryId?: string | null;
  matchId?: string | null;
  walletAddress?: string;
  entryAmountSol?: number;
  onPlayAgain: () => void;
}

function fmtMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return m > 0 ? `${m}m ${rem}s` : `${s}s`;
}

function openSolscan(sig: string) {
  const url = `https://solscan.io/tx/${sig}`;
  if (Platform.OS === 'web') (window as any).open(url, '_blank', 'noopener,noreferrer');
}

export function GameResultCard({ result, mode, entryId, matchId, walletAddress, entryAmountSol, onPlayAgain }: Props) {
  const [match, setMatch] = useState<DuelMatch | null>(null);
  const [finalized, setFinalized] = useState(false);
  const [payoutTx, setPayoutTx] = useState<string | null>(null);
  const [payoutSol, setPayoutSol] = useState<number | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [finalError, setFinalError] = useState<string | null>(null);
  const [waitingForOpponent, setWaitingForOpponent] = useState(true);

  const isWinner = match?.winner_wallet === walletAddress;
  const bothDone = !!(match?.player1_result_id && match?.player2_result_id);

  // Poll match state until both results are in
  useEffect(() => {
    if (mode !== 'sol_duel' || !entryId) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const m = await getMatchForEntry(entryId);
        if (!m || cancelled) return;
        setMatch(m);

        if (m.player1_result_id && m.player2_result_id) {
          setWaitingForOpponent(false);
          if (m.payout_status === 'paid') {
            setFinalized(true);
            setPayoutTx(m.payout_tx_signature ?? null);
            setPayoutSol(m.winner_payout_sol ?? null);
          }
        }
      } catch (e) {
        console.warn('[GameResultCard] poll error:', e);
      }
    };

    poll();
    const iv = setInterval(poll, 4000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [mode, entryId]);

  // Auto-finalize once both results are in
  useEffect(() => {
    if (!bothDone || finalized || finalizing || !matchId) return;
    runFinalize();
  }, [bothDone, finalized, finalizing, matchId]);

  async function runFinalize() {
    if (!matchId) return;
    setFinalizing(true);
    setFinalError(null);
    try {
      const r = await finalizeMatchPayout(matchId);
      if ((r as any).already_completed) {
        setFinalized(true);
        setPayoutTx((r as any).payout_tx);
        setPayoutSol((r as any).payout_sol);
        return;
      }
      setFinalized(true);
      setPayoutTx(r.payout_tx);
      setPayoutSol(r.payout_sol);
    } catch (e: any) {
      setFinalError(e.message);
    } finally {
      setFinalizing(false);
    }
  }

  const scoreColor =
    result.score >= 8000 ? '#A78BFA'
    : result.score >= 5000 ? colors.primary
    : result.score >= 2000 ? '#C084FC'
    : colors.textSecondary;

  const grade =
    result.score >= 9000 ? 'S'
    : result.score >= 7000 ? 'A'
    : result.score >= 5000 ? 'B'
    : result.score >= 2500 ? 'C'
    : 'D';

  return (
    <View style={styles.container}>
      {/* Score hero */}
      <View style={styles.heroCard}>
        <LinearGradient
          colors={['rgba(139,92,246,0.25)', 'rgba(0,0,0,0)']}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.gradeCircle}>
          <Text style={[styles.gradeText, { color: scoreColor }]}>{grade}</Text>
        </View>
        <Text style={[styles.bigScore, { color: scoreColor }]}>{result.score.toLocaleString()}</Text>
        <Text style={styles.scoreLabel}>FINAL SCORE</Text>
      </View>

      {/* Stats grid */}
      <View style={styles.statsGrid}>
        <StatBox icon={Clock} label="Survived" value={fmtMs(result.survivalTimeMs)} />
        <StatBox icon={Zap} label="Orbs" value={String(result.orbsCollected)} />
        <StatBox icon={Star} label="Max Combo" value={`×${result.comboMax}`} />
        <StatBox icon={Target} label="Accuracy" value={`${Math.round(result.accuracy * 100)}%`} />
      </View>

      {/* Duel result */}
      {mode === 'sol_duel' && (
        <View style={styles.duelCard}>
          {waitingForOpponent && !bothDone ? (
            <View style={styles.waitingRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.waitingText}>Waiting for opponent to finish…</Text>
            </View>
          ) : finalizing ? (
            <View style={styles.waitingRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.waitingText}>Processing payout…</Text>
            </View>
          ) : finalized ? (
            <View style={styles.payoutResult}>
              {isWinner ? (
                <>
                  <Trophy size={28} color={colors.primary} strokeWidth={1.5} />
                  <Text style={styles.winText}>You Won!</Text>
                  {payoutSol != null && (
                    <Text style={styles.payoutAmt}>{payoutSol.toFixed(4)} SOL</Text>
                  )}
                  {payoutTx && (
                    <TouchableOpacity onPress={() => openSolscan(payoutTx!)} style={styles.txRow} activeOpacity={0.7}>
                      <ExternalLink size={11} color={colors.primary} strokeWidth={2} />
                      <Text style={styles.txText}>{payoutTx.slice(0,10)}…{payoutTx.slice(-6)}</Text>
                    </TouchableOpacity>
                  )}
                </>
              ) : (
                <>
                  <Text style={styles.loseText}>Better luck next time</Text>
                  {match?.winner_wallet && (
                    <Text style={styles.winnerWallet}>
                      Winner: {match.winner_wallet.slice(0,4)}…{match.winner_wallet.slice(-4)}
                    </Text>
                  )}
                </>
              )}
            </View>
          ) : finalError ? (
            <View style={styles.errorRow}>
              <Text style={styles.errorText}>Payout error: {finalError}</Text>
            </View>
          ) : null}
        </View>
      )}

      {/* Play again */}
      <TouchableOpacity style={styles.playAgainBtn} onPress={onPlayAgain} activeOpacity={0.85}>
        <RotateCcw size={16} color={colors.white} strokeWidth={2.5} />
        <Text style={styles.playAgainText}>
          {mode === 'sol_duel' ? 'Enter Another Duel' : 'Play Again'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function StatBox({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View style={statStyles.box}>
      <Icon size={14} color={colors.primary} strokeWidth={2} />
      <Text style={statStyles.value}>{value}</Text>
      <Text style={statStyles.label}>{label}</Text>
    </View>
  );
}

const statStyles = StyleSheet.create({
  box: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    minWidth: 72,
  },
  value: { fontSize: fontSize.md, fontWeight: '800', color: colors.textPrimary },
  label: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '500' },
});

const styles = StyleSheet.create({
  container: { gap: spacing.lg },
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xxl,
    borderWidth: 1,
    borderColor: colors.surfaceBorderLight,
    overflow: 'hidden',
    alignItems: 'center',
    gap: spacing.sm,
    ...elevation.md,
  },
  gradeCircle: {
    width: 56, height: 56,
    borderRadius: 28,
    backgroundColor: colors.primaryMuted,
    borderWidth: 2,
    borderColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  gradeText: { fontSize: fontSize.xxl, fontWeight: '900' },
  bigScore: { fontSize: 42, fontWeight: '900', letterSpacing: 1 },
  scoreLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  duelCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.surfaceBorderLight,
    minHeight: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  waitingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  waitingText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: '600',
  },
  payoutResult: { alignItems: 'center', gap: spacing.sm },
  winText: { fontSize: fontSize.xxl, fontWeight: '900', color: colors.primary },
  loseText: { fontSize: fontSize.lg, fontWeight: '700', color: colors.textSecondary },
  payoutAmt: { fontSize: fontSize.xl, fontWeight: '800', color: colors.primary },
  winnerWallet: { fontSize: fontSize.xs, color: colors.textMuted, fontFamily: 'SpaceMono-Regular' },
  txRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  txText: { fontSize: fontSize.xs, color: colors.primary, fontFamily: 'SpaceMono-Regular' },
  errorRow: { padding: spacing.md },
  errorText: { fontSize: fontSize.sm, color: '#D946EF', fontWeight: '600', textAlign: 'center' },
  playAgainBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.lg,
    ...elevation.glow,
  },
  playAgainText: { fontSize: fontSize.md, fontWeight: '800', color: colors.white },
});
