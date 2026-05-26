import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Trophy, Target, Clock, Zap, Star, ExternalLink, RotateCcw, Crosshair, Route, Brain, BookOpen } from 'lucide-react-native';
import { colors, spacing, borderRadius, fontSize, elevation } from '@/constants/theme';
import { DuelMatch, getMatchForEntry, finalizeMatchPayout } from '@/services/game/duelEntryService';
import type { UnifiedGameResult, GameId } from '@/services/game/gameTypes';

export type { UnifiedGameResult as GameResultData };

interface Props {
  result: UnifiedGameResult;
  gameId?: GameId;
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

export function GameResultCard({ result, gameId = 'dawen_rush', mode, entryId, matchId, walletAddress, entryAmountSol, onPlayAgain }: Props) {
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

  // Game-specific accent color
  const GAME_COLOR: Record<GameId, string> = {
    dawen_rush: '#A78BFA',
    dawen_aim_duel: '#FCD34D',
    dawen_runner: '#34D399',
    dawen_memory: '#60A5FA',
    decode_7_fragments: '#F472B6',
  };
  const accentColor = GAME_COLOR[gameId];

  const scoreColor =
    result.score >= 8000 ? accentColor
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
          colors={[`${accentColor}33`, 'rgba(0,0,0,0)']}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.gradeCircle, { borderColor: accentColor, backgroundColor: `${accentColor}22` }]}>
          <Image
            source={Platform.OS === 'web' ? { uri: '/dawenlogo.jpeg' } : require('../../dawenlogo.jpeg')}
            style={styles.gradeLogoImg}
            resizeMode="cover"
          />
          <View style={[styles.gradeBadge, { backgroundColor: accentColor }]}>
            <Text style={styles.gradeText}>{grade}</Text>
          </View>
        </View>
        <Text style={[styles.bigScore, { color: scoreColor }]}>{result.score.toLocaleString()}</Text>
        <Text style={styles.scoreLabel}>FINAL SCORE</Text>
      </View>

      {/* Stats grid — game-specific */}
      <View style={styles.statsGrid}>
        {gameId === 'dawen_aim_duel' ? (
          <>
            <StatBox icon={Crosshair} label="Hits" value={String(result.hits)} color={accentColor} />
            <StatBox icon={Target} label="Misses" value={String(result.misses)} color="#F87171" />
            <StatBox icon={Star} label="Max Combo" value={`×${result.comboMax}`} color={accentColor} />
            <StatBox icon={Clock} label="Accuracy" value={`${Math.round(result.accuracy * 100)}%`} color={accentColor} />
          </>
        ) : gameId === 'dawen_runner' ? (
          <>
            <StatBox icon={Route} label="Distance" value={`${result.distanceUnits}m`} color={accentColor} />
            <StatBox icon={Clock} label="Survived" value={fmtMs(result.survivalTimeMs)} color={accentColor} />
            <StatBox icon={Star} label="Max Combo" value={`×${result.comboMax}`} color={accentColor} />
            <StatBox icon={Zap} label="Coins" value={String(result.orbsCollected)} color={accentColor} />
          </>
        ) : gameId === 'dawen_memory' ? (
          <>
            <StatBox icon={Brain} label="Pairs" value={`${result.pairsFound}/8`} color={accentColor} />
            <StatBox icon={Target} label="Errors" value={String(result.mistakes)} color={result.mistakes > 5 ? '#F87171' : accentColor} />
            <StatBox icon={Clock} label="Time" value={fmtMs(result.survivalTimeMs)} color={accentColor} />
            <StatBox icon={Star} label="Accuracy" value={`${Math.round(result.accuracy * 100)}%`} color={accentColor} />
          </>
        ) : gameId === 'decode_7_fragments' ? (
          <>
            <StatBox icon={BookOpen} label="Fragments" value={`${result.fragmentsFound}/7`} color={accentColor} />
            <StatBox icon={Target} label="Errors" value={String(result.mistakes)} color={result.mistakes > 5 ? '#F87171' : accentColor} />
            <StatBox icon={Clock} label="Time" value={fmtMs(result.survivalTimeMs)} color={accentColor} />
            <StatBox icon={Star} label="Accuracy" value={`${Math.round(result.accuracy * 100)}%`} color={accentColor} />
          </>
        ) : (
          <>
            <StatBox icon={Clock} label="Survived" value={fmtMs(result.survivalTimeMs)} color={accentColor} />
            <StatBox icon={Zap} label="Orbs" value={String(result.orbsCollected)} color={accentColor} />
            <StatBox icon={Star} label="Max Combo" value={`×${result.comboMax}`} color={accentColor} />
            <StatBox icon={Target} label="Accuracy" value={`${Math.round(result.accuracy * 100)}%`} color={accentColor} />
          </>
        )}
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

function StatBox({ icon: Icon, label, value, color = colors.primary }: { icon: any; label: string; value: string; color?: string }) {
  return (
    <View style={statStyles.box}>
      <Icon size={14} color={color} strokeWidth={2} />
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
    width: 64, height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
    overflow: 'hidden',
    position: 'relative',
  },
  gradeLogoImg: {
    width: '100%',
    height: '100%',
    borderRadius: 32,
  },
  gradeBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gradeText: { fontSize: 11, fontWeight: '900', color: '#fff' },
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
