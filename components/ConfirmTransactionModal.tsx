import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { Shield, X, TriangleAlert as AlertTriangle, Lock, Delete, CircleCheck as CheckCircle, Circle as XCircle } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, fontSize } from '@/constants/theme';
import { useSecurity } from '@/contexts/SecurityContext';

export interface TxDetail {
  label: string;
  value: string;
  accent?: boolean;
  total?: boolean;
}

type Stage = 'preview' | 'pin' | 'executing' | 'success' | 'error';

const PIN_LEN = 6;
const MAX_TRIES = 5;
const PAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

interface Props {
  visible: boolean;
  title: string;
  details: TxDetail[];
  /** Async function that performs the actual signing + broadcasting. Returns tx signature. */
  executeTransaction: () => Promise<string | void>;
  /** Called immediately when the transaction is confirmed on-chain (before user dismisses). */
  onSuccess?: (signature?: string) => void;
  /** Called when the modal should close (Cancel, Done, or user dismisses). */
  onDismiss: () => void;
  isExternalWallet?: boolean;
  insufficientBalance?: boolean;
  insufficientBalanceMsg?: string;
  warning?: string;
  confirmLabel?: string;
}

function normalizeError(msg?: string): string {
  if (!msg) return 'Transaction failed';
  if (msg.includes('rejected') || msg.includes('User rejected')) return 'Transaction rejected by wallet.';
  if (msg.includes('insufficient') || msg.includes('balance') || msg.includes('0x1')) return 'Insufficient balance for this transaction.';
  if (msg.includes('slippage')) return 'Price moved too much. Try again or increase slippage.';
  if (msg.includes('No route') || msg.includes('no route')) return 'No swap route available for this pair.';
  if (msg.includes('Confirmation timeout') || msg.includes('was not confirmed')) return 'Confirmation timeout. Check Solana Explorer for status.';
  if (msg.includes('RPC') || msg.includes('Failed to fetch') || msg.includes('network')) return 'Network error. Check your connection.';
  if (msg.includes('Incorrect PIN') || msg.includes('PIN')) return msg;
  return msg.length > 100 ? msg.slice(0, 100) + '...' : msg;
}

export function ConfirmTransactionModal({
  visible,
  title,
  details,
  executeTransaction,
  onSuccess,
  onDismiss,
  isExternalWallet = false,
  insufficientBalance = false,
  insufficientBalanceMsg,
  warning,
  confirmLabel = 'Confirm Transaction',
}: Props) {
  const { pinHash, checkPin } = useSecurity();
  const needsPin = !isExternalWallet && !!pinHash;

  const [stage, setStage] = useState<Stage>('preview');
  const [signature, setSignature] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [pinTries, setPinTries] = useState(0);
  const [pinError, setPinError] = useState('');
  const shake = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setStage('preview');
      setSignature(null);
      setErrorMsg(null);
      setPin('');
      setPinTries(0);
      setPinError('');
    }
  }, [visible]);

  const doShake = () => {
    Animated.sequence([
      Animated.timing(shake, { toValue: 10, duration: 55, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -10, duration: 55, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 6, duration: 55, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 55, useNativeDriver: true }),
    ]).start();
  };

  const handleConfirm = () => {
    if (insufficientBalance) return;
    if (needsPin) {
      setStage('pin');
    } else {
      runTransaction();
    }
  };

  const pressPin = (d: string) => {
    if (d === '⌫') { setPin(p => p.slice(0, -1)); setPinError(''); return; }
    if (!d || pinTries >= MAX_TRIES) return;
    if (pin.length >= PIN_LEN) return;
    const next = pin + d;
    setPin(next);
    setPinError('');
    if (next.length === PIN_LEN) {
      if (checkPin(next)) {
        setPin('');
        setPinTries(0);
        setPinError('');
        runTransaction();
      } else {
        const t = pinTries + 1;
        setPinTries(t);
        doShake();
        setPin('');
        if (t >= MAX_TRIES) {
          setPinError('Too many failed attempts. Please try again later.');
        } else {
          setPinError(`Incorrect PIN. ${MAX_TRIES - t} attempt${MAX_TRIES - t !== 1 ? 's' : ''} remaining.`);
        }
      }
    }
  };

  const runTransaction = async () => {
    setStage('executing');
    try {
      const sig = await executeTransaction();
      const resolvedSig = typeof sig === 'string' ? sig : null;
      setSignature(resolvedSig);
      setStage('success');
      if (onSuccess) onSuccess(resolvedSig ?? undefined);
    } catch (err: any) {
      setErrorMsg(normalizeError(err?.message));
      setStage('error');
    }
  };

  const handleDismiss = () => {
    onDismiss();
  };

  const handleRetry = () => {
    setStage('preview');
    setErrorMsg(null);
    setPin('');
    setPinTries(0);
    setPinError('');
  };

  const locked = pinTries >= MAX_TRIES;

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <View style={s.overlay}>
        <View style={s.sheet}>
          <View style={s.handle} />

          {/* ── PREVIEW ───────────────────────────────────────────── */}
          {stage === 'preview' && (
            <>
              <View style={s.header}>
                <View style={s.headerLeft}>
                  <View style={s.iconWrap}>
                    <Shield size={16} color={colors.primary} strokeWidth={2.5} />
                  </View>
                  <Text style={s.title}>{title}</Text>
                </View>
                <TouchableOpacity onPress={handleDismiss} style={s.closeBtn} activeOpacity={0.7}>
                  <X size={18} color="rgba(255,255,255,0.4)" />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} style={s.scroll}>
                <View style={s.detailsBox}>
                  {details.map((d, i) => (
                    <View
                      key={i}
                      style={[
                        s.row,
                        i < details.length - 1 && s.rowBorder,
                        d.total && s.rowTotal,
                      ]}
                    >
                      <Text style={[s.rowLabel, d.total && s.rowLabelTotal]}>{d.label}</Text>
                      <Text style={[
                        s.rowValue,
                        d.accent && s.rowValueAccent,
                        d.total && s.rowValueTotal,
                      ]}>
                        {d.value}
                      </Text>
                    </View>
                  ))}
                </View>

                {insufficientBalance && (
                  <View style={s.errorBox}>
                    <AlertTriangle size={14} color={colors.error} strokeWidth={2} />
                    <View style={s.errorBoxText}>
                      <Text style={s.errorTxt}>{insufficientBalanceMsg ?? 'Insufficient balance'}</Text>
                    </View>
                  </View>
                )}

                {warning && !insufficientBalance && (
                  <View style={s.warnBox}>
                    <AlertTriangle size={14} color="#f59e0b" strokeWidth={2} />
                    <Text style={s.warnTxt}>{warning}</Text>
                  </View>
                )}
              </ScrollView>

              <View style={s.actions}>
                <TouchableOpacity style={s.cancelBtn} onPress={handleDismiss} activeOpacity={0.8}>
                  <Text style={s.cancelTxt}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.confirmBtnOuter, insufficientBalance && s.confirmBtnDisabled]}
                  onPress={handleConfirm}
                  disabled={insufficientBalance}
                  activeOpacity={0.85}
                >
                  <LinearGradient
                    colors={['#8B5CF6', '#6D28D9']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={s.confirmGrad}
                  >
                    <Shield size={14} color="#fff" strokeWidth={2.5} />
                    <Text style={s.confirmTxt}>{confirmLabel}</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* ── PIN ───────────────────────────────────────────────── */}
          {stage === 'pin' && (
            <View style={s.centeredContainer}>
              <View style={s.pinIconBox}>
                <Lock size={28} color={colors.primary} strokeWidth={2} />
              </View>
              <Text style={s.centeredTitle}>Enter PIN</Text>
              <Text style={s.centeredSubtext}>Confirm your PIN to authorize this transaction</Text>
              <Animated.View style={[s.pinDots, { transform: [{ translateX: shake }] }]}>
                {Array.from({ length: PIN_LEN }).map((_, i) => (
                  <View key={i} style={[s.pinDot, i < pin.length && s.pinDotOn]} />
                ))}
              </Animated.View>
              {pinError ? <Text style={s.pinErr}>{pinError}</Text> : <View style={s.pinErrSpacer} />}
              {!locked && (
                <View style={s.pinPad}>
                  {PAD.map((d, i) => (
                    <TouchableOpacity
                      key={i}
                      style={[s.pinKey, !d && s.pinKeyGhost]}
                      onPress={() => pressPin(d)}
                      disabled={!d && d !== '0'}
                      activeOpacity={0.65}
                    >
                      {d === '⌫'
                        ? <Delete size={22} color={colors.textSecondary} strokeWidth={1.8} />
                        : <Text style={s.pinKeyTxt}>{d}</Text>
                      }
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              <TouchableOpacity onPress={handleDismiss} style={s.pinCancelLink} activeOpacity={0.7}>
                <Text style={s.pinCancelTxt}>Cancel transaction</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── EXECUTING ─────────────────────────────────────────── */}
          {stage === 'executing' && (
            <View style={s.centeredContainer}>
              <View style={s.executingRing}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
              <Text style={s.centeredTitle}>Broadcasting...</Text>
              <Text style={s.centeredSubtext}>Signing and sending your transaction to Solana</Text>
            </View>
          )}

          {/* ── SUCCESS ───────────────────────────────────────────── */}
          {stage === 'success' && (
            <View style={s.centeredContainer}>
              <View style={s.successRing}>
                <CheckCircle size={52} color="#10b981" strokeWidth={1.5} />
              </View>
              <Text style={s.centeredTitle}>Transaction Confirmed!</Text>
              <Text style={s.centeredSubtext}>Your transaction was confirmed on Solana</Text>
              {signature && (
                <View style={s.sigBox}>
                  <Text style={s.sigText} numberOfLines={1} ellipsizeMode="middle">{signature}</Text>
                </View>
              )}
              <TouchableOpacity style={s.doneBtnOuter} onPress={handleDismiss} activeOpacity={0.85}>
                <LinearGradient
                  colors={['#10b981', '#059669']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={s.doneBtnGrad}
                >
                  <Text style={s.doneBtnTxt}>Done</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          {/* ── ERROR ─────────────────────────────────────────────── */}
          {stage === 'error' && (
            <View style={s.centeredContainer}>
              <View style={s.errorRing}>
                <XCircle size={52} color={colors.error} strokeWidth={1.5} />
              </View>
              <Text style={s.centeredTitle}>Transaction Failed</Text>
              <Text style={s.errorDescription}>{errorMsg}</Text>
              <View style={s.errorActionsRow}>
                <TouchableOpacity style={s.retryBtn} onPress={handleRetry} activeOpacity={0.85}>
                  <LinearGradient
                    colors={['#8B5CF6', '#6D28D9']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={s.retryGrad}
                  >
                    <Text style={s.retryTxt}>Try Again</Text>
                  </LinearGradient>
                </TouchableOpacity>
                <TouchableOpacity style={s.cancelGhostBtn} onPress={handleDismiss} activeOpacity={0.7}>
                  <Text style={s.cancelGhostTxt}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#0F0F1A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: 'rgba(139,92,246,0.2)',
    paddingBottom: 36,
    maxHeight: '90%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: 'rgba(139,92,246,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: { fontSize: fontSize.md, fontWeight: '800', color: colors.white },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Details ──
  scroll: { paddingHorizontal: spacing.xl },
  detailsBox: {
    marginTop: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: 13,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  rowTotal: {
    backgroundColor: 'rgba(139,92,246,0.07)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(139,92,246,0.15)',
  },
  rowLabel: { fontSize: 13, color: 'rgba(255,255,255,0.5)', fontWeight: '500' },
  rowLabelTotal: { color: 'rgba(255,255,255,0.85)', fontWeight: '700' },
  rowValue: {
    fontSize: 13,
    color: colors.white,
    fontWeight: '700',
    textAlign: 'right',
    maxWidth: '55%',
  },
  rowValueAccent: { color: colors.primary },
  rowValueTotal: { fontSize: 15, color: colors.white, fontWeight: '900' },

  // ── Badges ──
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
    padding: spacing.md,
    marginTop: spacing.md,
  },
  errorBoxText: { flex: 1 },
  errorTxt: { fontSize: 12, color: colors.error, lineHeight: 18 },
  warnBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(245,158,11,0.08)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.25)',
    padding: spacing.md,
    marginTop: spacing.md,
  },
  warnTxt: { flex: 1, fontSize: 12, color: '#fbbf24', lineHeight: 18 },

  // ── Actions ──
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 15,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
  },
  cancelTxt: { fontSize: fontSize.sm, fontWeight: '700', color: 'rgba(255,255,255,0.6)' },
  confirmBtnOuter: { flex: 2, borderRadius: 12, overflow: 'hidden' },
  confirmBtnDisabled: { opacity: 0.4 },
  confirmGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 15,
    borderRadius: 12,
  },
  confirmTxt: { fontSize: fontSize.sm, fontWeight: '800', color: '#fff' },

  // ── Centered (PIN / Executing / Success / Error) ──
  centeredContainer: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: 4,
    minHeight: 320,
    justifyContent: 'center',
  },
  centeredTitle: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.white,
    textAlign: 'center',
    marginBottom: 6,
  },
  centeredSubtext: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 20,
  },

  // ── PIN ──
  pinIconBox: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: 'rgba(139,92,246,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.22)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  pinDots: { flexDirection: 'row', gap: 14, marginBottom: spacing.sm },
  pinDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: 'rgba(139,92,246,0.4)',
    backgroundColor: 'transparent',
  },
  pinDotOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pinErr: {
    color: '#ef4444',
    fontSize: fontSize.xs,
    textAlign: 'center',
    marginBottom: spacing.md,
    lineHeight: 18,
    height: 20,
  },
  pinErrSpacer: { height: 36 },
  pinPad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 232,
    gap: 10,
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  pinKey: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pinKeyGhost: { backgroundColor: 'transparent', borderColor: 'transparent' },
  pinKeyTxt: { fontSize: 24, fontWeight: '600', color: colors.white },
  pinCancelLink: { paddingVertical: spacing.sm },
  pinCancelTxt: { fontSize: fontSize.sm, color: colors.textMuted, textDecorationLine: 'underline' },

  // ── Executing ──
  executingRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(139,92,246,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },

  // ── Success ──
  successRing: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: 'rgba(16,185,129,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  sigBox: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    width: '100%',
    marginBottom: spacing.xl,
  },
  sigText: { fontSize: 11, color: colors.primary, textAlign: 'center' },
  doneBtnOuter: { width: '100%', borderRadius: 14, overflow: 'hidden' },
  doneBtnGrad: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  doneBtnTxt: { fontSize: fontSize.md, fontWeight: '800', color: '#fff' },

  // ── Error ──
  errorRing: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  errorDescription: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.md,
  },
  errorActionsRow: { width: '100%', gap: spacing.md },
  retryBtn: { width: '100%', borderRadius: 14, overflow: 'hidden' },
  retryGrad: {
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  retryTxt: { fontSize: fontSize.sm, fontWeight: '800', color: '#fff' },
  cancelGhostBtn: { paddingVertical: 12, alignItems: 'center' },
  cancelGhostTxt: { fontSize: fontSize.sm, color: 'rgba(255,255,255,0.4)', fontWeight: '600' },
});
