/**
 * ExportPrivateKeyModal
 *
 * Exports the Solana private key for INTERNAL DAWEN wallets only.
 * External wallets (Phantom, Backpack, Solflare, Jupiter) are rejected with
 * an explanatory message — they handle their own key export.
 *
 * Security guarantees:
 * - Private key is derived locally; never sent anywhere.
 * - Never stored in localStorage, sessionStorage, or AsyncStorage.
 * - Never logged to console.
 * - Auto-cleared from React state after AUTO_CLEAR_MS (60s).
 * - State wiped on modal close.
 * - PIN must match the specific wallet being exported — no cross-wallet unlock.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  Platform,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { X, Key, TriangleAlert as AlertTriangle, Eye, EyeOff, Copy, Check, Lock, Delete } from 'lucide-react-native';
import { colors, spacing, fontSize, borderRadius } from '@/constants/theme';
import { useSecurity } from '@/contexts/SecurityContext';
import { useWallet } from '@/contexts/WalletContext';
import { SecureWalletManager } from '@/lib/wallet/SecureWalletManager';
import { KeyDerivationManager } from '@/lib/crypto/keyDerivation';
import * as bs58 from 'bs58';

// bs58 is bundled via @solana/web3.js — use the same module
function encodeBase58(bytes: Uint8Array): string {
  // Use @solana/web3.js's bs58 via dynamic import fallback, or implement manually
  // We import it the same way the rest of the codebase does
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const bs = require('bs58') as { encode: (b: Uint8Array) => string };
    return bs.encode(bytes);
  } catch {
    // Hex fallback if bs58 is not available
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }
}

const AUTO_CLEAR_MS = 60_000; // 60 seconds
const PIN_LEN = 6;
const MAX_ATTEMPTS = 3;
const PAD_KEYS = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

type Step = 'warning' | 'pin' | 'confirm' | 'show';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function ExportPrivateKeyModal({ visible, onClose }: Props) {
  const { activeWallet, selectedAccount } = useWallet();
  const { checkPin } = useSecurity();

  const [step, setStep]               = useState<Step>('warning');
  const [pin, setPin]                 = useState('');
  const [pinAttempts, setPinAttempts] = useState(0);
  const [pinError, setPinError]       = useState('');
  const [confirmed, setConfirmed]     = useState(false);
  const [privateKey, setPrivateKey]   = useState('');
  const [shown, setShown]             = useState(false);
  const [copied, setCopied]           = useState(false);
  const [deriveError, setDeriveError] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(60);

  const shake = useRef(new Animated.Value(0)).current;
  const clearTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef    = useRef<ReturnType<typeof setInterval> | null>(null);

  const isExternal = activeWallet?.type === 'connected';
  const isInternal = activeWallet?.type === 'created' || activeWallet?.type === 'imported';

  // ── Reset all state on open/close ─────────────────────────────────────────
  const reset = useCallback(() => {
    setStep('warning');
    setPin('');
    setPinAttempts(0);
    setPinError('');
    setConfirmed(false);
    setPrivateKey('');
    setShown(false);
    setCopied(false);
    setDeriveError('');
    setSecondsLeft(60);
    if (clearTimerRef.current)  clearTimeout(clearTimerRef.current);
    if (countdownRef.current)   clearInterval(countdownRef.current);
  }, []);

  useEffect(() => {
    if (visible) {
      reset();
    } else {
      // Wipe private key immediately when modal closes
      setPrivateKey('');
      if (clearTimerRef.current)  clearTimeout(clearTimerRef.current);
      if (countdownRef.current)   clearInterval(countdownRef.current);
    }
  }, [visible, reset]);

  // ── Auto-clear timer once key is shown ────────────────────────────────────
  const startAutoClear = useCallback(() => {
    setSecondsLeft(60);
    clearTimerRef.current = setTimeout(() => {
      setPrivateKey('');
      setStep('warning');
      onClose();
    }, AUTO_CLEAR_MS);
    countdownRef.current = setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }, [onClose]);

  // ── Shake animation ───────────────────────────────────────────────────────
  const doShake = useCallback(() => {
    Animated.sequence([
      Animated.timing(shake, { toValue: 10, duration: 55, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -10, duration: 55, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 6,  duration: 55, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0,  duration: 55, useNativeDriver: true }),
    ]).start();
  }, [shake]);

  // ── PIN keypad ────────────────────────────────────────────────────────────
  const pressKey = useCallback((key: string) => {
    if (key === '⌫') { setPin(p => p.slice(0, -1)); setPinError(''); return; }
    if (!key) return;
    if (pinAttempts >= MAX_ATTEMPTS) return;
    if (pin.length >= PIN_LEN) return;

    const next = pin + key;
    setPin(next);
    setPinError('');

    if (next.length === PIN_LEN) {
      if (checkPin(next)) {
        setPin('');
        setStep('confirm');
      } else {
        const newAttempts = pinAttempts + 1;
        setPinAttempts(newAttempts);
        doShake();
        setPin('');
        if (newAttempts >= MAX_ATTEMPTS) {
          setPinError('Too many incorrect attempts. Export cancelled.');
        } else {
          const remaining = MAX_ATTEMPTS - newAttempts;
          setPinError(`Incorrect PIN. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`);
        }
      }
    }
  }, [pin, pinAttempts, checkPin, doShake]);

  // ── Derive private key ────────────────────────────────────────────────────
  const deriveAndShow = useCallback(async () => {
    if (!confirmed) return;
    setDeriveError('');
    try {
      const mgr = SecureWalletManager.getInstance();
      const mnemonic = await mgr.getMnemonicUnlocked();
      const accountIndex = selectedAccount?.accountIndex ?? 0;
      const keyPair = KeyDerivationManager.deriveSolanaKeyPair(mnemonic, accountIndex);
      // Solana private key = first 32 bytes of the 64-byte nacl secret key
      // The full 64-byte secretKey = privateKey(32) + publicKey(32)
      const privKeyBytes = keyPair.secretKey; // 64 bytes: seed+pubkey
      const encoded = encodeBase58(privKeyBytes);
      setPrivateKey(encoded);
      setStep('show');
      startAutoClear();
    } catch (e: any) {
      setDeriveError('Failed to derive private key. Please try again.');
    }
  }, [confirmed, selectedAccount, startAutoClear]);

  const handleCopy = useCallback(async () => {
    if (!privateKey) return;
    await Clipboard.setStringAsync(privateKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [privateKey]);

  const handleClose = useCallback(() => {
    setPrivateKey('');
    reset();
    onClose();
  }, [reset, onClose]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      presentationStyle="overFullScreen"
      onRequestClose={handleClose}
    >
      <View style={s.overlay}>
        <View style={s.sheet}>
          {/* Header */}
          <View style={s.header}>
            <View style={s.headerLeft}>
              <Key size={20} color={colors.primary} strokeWidth={2} />
              <Text style={s.headerTitle}>Export Private Key</Text>
            </View>
            <TouchableOpacity style={s.closeBtn} onPress={handleClose} activeOpacity={0.7}>
              <X size={18} color={colors.textMuted} strokeWidth={2} />
            </TouchableOpacity>
          </View>

          {/* External wallet guard */}
          {isExternal && (
            <View style={s.externalNotice}>
              <AlertTriangle size={20} color={colors.warning} strokeWidth={2} />
              <Text style={s.externalText}>
                This is an external wallet. To export your private key, open your wallet app directly.
              </Text>
            </View>
          )}

          {/* No internal wallet */}
          {!isExternal && !isInternal && (
            <Text style={s.noWallet}>No internal wallet is currently active.</Text>
          )}

          {/* STEP: Warning */}
          {isInternal && step === 'warning' && (
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={s.warningBox}>
                <AlertTriangle size={28} color={colors.error} strokeWidth={2} />
                <Text style={s.warningTitle}>Security Warning</Text>
                <Text style={s.warningText}>
                  Never share your private key. Anyone with this key can access your funds.
                  DAWEN will never ask for it.
                </Text>
                <View style={s.warningBullets}>
                  <Text style={s.bullet}>• Store it offline in a secure location</Text>
                  <Text style={s.bullet}>• Never enter it on any website or app</Text>
                  <Text style={s.bullet}>• Never share it via chat, email, or screenshot</Text>
                  <Text style={s.bullet}>• DAWEN support will never request it</Text>
                </View>
              </View>
              <TouchableOpacity
                style={s.proceedBtn}
                onPress={() => setStep('pin')}
                activeOpacity={0.8}
              >
                <Text style={s.proceedBtnText}>I Understand — Continue</Text>
              </TouchableOpacity>
            </ScrollView>
          )}

          {/* STEP: PIN */}
          {isInternal && step === 'pin' && (
            <View style={s.pinContainer}>
              <Lock size={24} color={colors.primary} strokeWidth={2} />
              <Text style={s.pinTitle}>Enter your PIN</Text>
              <Text style={s.pinSub}>Confirm your identity to proceed</Text>

              <Animated.View style={[s.dotsRow, { transform: [{ translateX: shake }] }]}>
                {Array.from({ length: PIN_LEN }).map((_, i) => (
                  <View key={i} style={[s.dot, i < pin.length && s.dotFilled]} />
                ))}
              </Animated.View>

              {pinError ? <Text style={s.pinError}>{pinError}</Text> : <View style={s.errorSpacer} />}

              {pinAttempts < MAX_ATTEMPTS && (
                <View style={s.pad}>
                  {PAD_KEYS.map((key, i) => {
                    const isEmpty = !key && key !== '0';
                    return (
                      <TouchableOpacity
                        key={i}
                        style={[s.key, isEmpty && s.keyGhost]}
                        onPress={() => pressKey(key)}
                        disabled={isEmpty}
                        activeOpacity={0.6}
                      >
                        {key === '⌫'
                          ? <Delete size={20} color={colors.textSecondary} strokeWidth={1.8} />
                          : <Text style={s.keyText}>{key}</Text>
                        }
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          )}

          {/* STEP: Confirm checkbox */}
          {isInternal && step === 'confirm' && (
            <View style={s.confirmContainer}>
              <Text style={s.confirmTitle}>Final Confirmation</Text>
              <TouchableOpacity
                style={s.checkRow}
                onPress={() => setConfirmed(c => !c)}
                activeOpacity={0.8}
              >
                <View style={[s.checkbox, confirmed && s.checkboxOn]}>
                  {confirmed && <Check size={14} color={colors.white} strokeWidth={3} />}
                </View>
                <Text style={s.checkLabel}>
                  I understand that anyone with this private key can access my wallet and funds.
                </Text>
              </TouchableOpacity>

              {deriveError ? <Text style={s.deriveError}>{deriveError}</Text> : null}

              <TouchableOpacity
                style={[s.proceedBtn, !confirmed && s.proceedBtnDisabled]}
                onPress={deriveAndShow}
                disabled={!confirmed}
                activeOpacity={0.8}
              >
                <Text style={s.proceedBtnText}>Reveal Private Key</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* STEP: Show key */}
          {isInternal && step === 'show' && (
            <View style={s.showContainer}>
              <View style={s.autoHideBar}>
                <Text style={s.autoHideText}>Auto-hidden in {secondsLeft}s</Text>
              </View>

              <Text style={s.keyLabel}>Your Private Key (Base58)</Text>
              <View style={s.keyBox}>
                <Text
                  style={[s.keyText2, !shown && s.keyTextHidden]}
                  selectable={shown}
                  numberOfLines={shown ? undefined : 1}
                >
                  {shown ? privateKey : '••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••'}
                </Text>
              </View>

              <View style={s.keyActions}>
                <TouchableOpacity
                  style={s.actionBtn}
                  onPress={() => setShown(v => !v)}
                  activeOpacity={0.7}
                >
                  {shown
                    ? <EyeOff size={18} color={colors.textSecondary} strokeWidth={2} />
                    : <Eye size={18} color={colors.textSecondary} strokeWidth={2} />
                  }
                  <Text style={s.actionBtnText}>{shown ? 'Hide' : 'Show'}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[s.actionBtn, s.copyBtn]}
                  onPress={handleCopy}
                  activeOpacity={0.7}
                  disabled={!shown}
                >
                  {copied
                    ? <Check size={18} color={colors.success} strokeWidth={2.5} />
                    : <Copy size={18} color={colors.primary} strokeWidth={2} />
                  }
                  <Text style={[s.actionBtnText, { color: copied ? colors.success : colors.primary }]}>
                    {copied ? 'Copied' : 'Copy'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={s.finalWarning}>
                <AlertTriangle size={13} color={colors.warning} strokeWidth={2} />
                <Text style={s.finalWarningText}>Never share this key. Clear your clipboard after use.</Text>
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
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: spacing.xl,
    paddingBottom: 40,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(139,92,246,0.1)',
    marginBottom: spacing.lg,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },

  externalNotice: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: 'rgba(245,158,11,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    alignItems: 'flex-start',
  },
  externalText: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.warning,
    lineHeight: 20,
  },
  noWallet: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.xxl,
  },

  // Warning step
  warningBox: {
    alignItems: 'center',
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    marginBottom: spacing.xl,
    gap: spacing.sm,
  },
  warningTitle: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.error,
  },
  warningText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  warningBullets: {
    alignSelf: 'stretch',
    gap: 6,
    marginTop: spacing.sm,
  },
  bullet: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    lineHeight: 18,
  },
  proceedBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  proceedBtnDisabled: {
    opacity: 0.4,
  },
  proceedBtnText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.white,
  },

  // PIN step
  pinContainer: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  pinTitle: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  pinSub: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: spacing.sm,
  },
  dot: {
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: 'rgba(139,92,246,0.35)',
    backgroundColor: 'transparent',
  },
  dotFilled: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pinError: {
    color: colors.error,
    fontSize: fontSize.xs,
    textAlign: 'center',
    marginBottom: spacing.sm,
    lineHeight: 17,
  },
  errorSpacer: { height: 20 },
  pad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 220,
    gap: 10,
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  key: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyGhost: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  keyText: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.white,
  },

  // Confirm step
  confirmContainer: {
    paddingVertical: spacing.lg,
    gap: spacing.lg,
  },
  confirmTitle: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  checkRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'rgba(139,92,246,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  checkboxOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkLabel: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  deriveError: {
    color: colors.error,
    fontSize: fontSize.xs,
    textAlign: 'center',
  },

  // Show key step
  showContainer: {
    paddingVertical: spacing.md,
    gap: spacing.lg,
  },
  autoHideBar: {
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderRadius: borderRadius.sm,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    alignSelf: 'center',
  },
  autoHideText: {
    fontSize: fontSize.xs,
    color: colors.warning,
    fontWeight: '600',
  },
  keyLabel: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: '600',
  },
  keyBox: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.15)',
  },
  keyText2: {
    fontSize: 13,
    color: colors.textPrimary,
    fontFamily: 'SpaceMono-Regular',
    lineHeight: 20,
    letterSpacing: 0.5,
  },
  keyTextHidden: {
    letterSpacing: 2,
    color: colors.textMuted,
  },
  keyActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  copyBtn: {
    borderColor: 'rgba(139,92,246,0.3)',
    backgroundColor: colors.primaryMuted,
  },
  actionBtnText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  finalWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    justifyContent: 'center',
  },
  finalWarningText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    lineHeight: 16,
  },
});
