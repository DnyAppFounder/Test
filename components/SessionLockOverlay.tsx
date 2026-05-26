/**
 * SessionLockOverlay
 *
 * Full-screen overlay shown when the inactivity lock triggers for an internal
 * DAWEN wallet. Never shown for external (Phantom/Backpack/Solflare) wallets.
 *
 * Correct PIN → unlock (no app reload, no re-onboarding).
 * 3 wrong PINs → session logout (clears decrypted memory, returns to onboarding).
 *   Does NOT delete encrypted wallet storage or user profile.
 */

import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Platform,
} from 'react-native';
import { Lock, Delete, Shield } from 'lucide-react-native';
import { colors, spacing, fontSize } from '@/constants/theme';
import { useSecurity } from '@/contexts/SecurityContext';
import { useInactivityLock } from '@/contexts/InactivityLockContext';
import { useWallet } from '@/contexts/WalletContext';
import { useProfile } from '@/contexts/ProfileContext';

const PIN_LEN = 6;
const MAX_ATTEMPTS = 3;
const PAD_KEYS = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

export function SessionLockOverlay() {
  const { isLocked, unlock } = useInactivityLock();
  const { checkPin, logEvent } = useSecurity();
  const { fullLogout } = useWallet();
  const { profile } = useProfile();

  const [pin, setPin]           = useState('');
  const [attempts, setAttempts] = useState(0);
  const [error, setError]       = useState('');
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const shake = useRef(new Animated.Value(0)).current;

  const doShake = useCallback(() => {
    Animated.sequence([
      Animated.timing(shake, { toValue: 10, duration: 55, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -10, duration: 55, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 6, duration: 55, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 55, useNativeDriver: true }),
    ]).start();
  }, [shake]);

  const handleSessionLogout = useCallback(async () => {
    setIsLoggingOut(true);
    try {
      if (profile?.id) logEvent(profile.id, 'inactivity_lock_max_attempts');
      // Clear decrypted session from memory only — encrypted storage is preserved
      await fullLogout();
    } catch {
      // ignore
    } finally {
      setIsLoggingOut(false);
      setPin('');
      setAttempts(0);
      setError('');
    }
  }, [fullLogout, logEvent, profile]);

  const pressKey = useCallback((key: string) => {
    if (key === '⌫') {
      setPin(p => p.slice(0, -1));
      setError('');
      return;
    }
    if (!key) return;
    if (attempts >= MAX_ATTEMPTS) return;
    if (pin.length >= PIN_LEN) return;

    const next = pin + key;
    setPin(next);
    setError('');

    if (next.length === PIN_LEN) {
      if (checkPin(next)) {
        if (profile?.id) logEvent(profile.id, 'inactivity_lock_unlocked');
        setPin('');
        setAttempts(0);
        setError('');
        unlock();
      } else {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        doShake();
        setPin('');
        if (profile?.id) logEvent(profile.id, 'inactivity_lock_wrong_pin');

        if (newAttempts >= MAX_ATTEMPTS) {
          setError('Maximum attempts reached. Logging out session...');
          setTimeout(handleSessionLogout, 800);
        } else {
          const remaining = MAX_ATTEMPTS - newAttempts;
          setError(`Incorrect PIN. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`);
        }
      }
    }
  }, [pin, attempts, checkPin, unlock, doShake, handleSessionLogout, logEvent, profile]);

  if (!isLocked) return null;

  const attemptsLeft = MAX_ATTEMPTS - attempts;
  const isMaxed = attempts >= MAX_ATTEMPTS;

  return (
    <View style={s.overlay}>
      <View style={s.glass}>
        {/* Icon */}
        <View style={s.iconRing}>
          <View style={s.iconInner}>
            <Shield size={28} color={colors.primary} strokeWidth={1.8} />
          </View>
        </View>

        {/* Header text */}
        <Text style={s.title}>Session Locked</Text>
        <Text style={s.subtitle}>Enter your PIN to continue</Text>

        {/* PIN dots */}
        <Animated.View style={[s.dotsRow, { transform: [{ translateX: shake }] }]}>
          {Array.from({ length: PIN_LEN }).map((_, i) => (
            <View key={i} style={[s.dot, i < pin.length && s.dotFilled]} />
          ))}
        </Animated.View>

        {/* Error / attempt count */}
        {error ? (
          <Text style={[s.errorText, isMaxed && s.errorCritical]}>{error}</Text>
        ) : attempts > 0 ? (
          <Text style={s.attemptsText}>
            {attemptsLeft} attempt{attemptsLeft !== 1 ? 's' : ''} remaining
          </Text>
        ) : (
          <View style={s.errorPlaceholder} />
        )}

        {/* Numpad */}
        {!isMaxed && !isLoggingOut && (
          <View style={s.pad}>
            {PAD_KEYS.map((key, i) => {
              const isBackspace = key === '⌫';
              const isEmpty     = !key && key !== '0';
              return (
                <TouchableOpacity
                  key={i}
                  style={[s.key, isEmpty && s.keyGhost]}
                  onPress={() => pressKey(key)}
                  disabled={isEmpty}
                  activeOpacity={0.6}
                >
                  {isBackspace ? (
                    <Delete size={22} color={colors.textSecondary} strokeWidth={1.8} />
                  ) : (
                    <Text style={s.keyText}>{key}</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {isLoggingOut && (
          <Text style={s.loggingOut}>Ending session...</Text>
        )}

        {/* Lock icon label */}
        <View style={s.footer}>
          <Lock size={12} color={colors.textMuted} strokeWidth={2} />
          <Text style={s.footerText}>DAWEN Wallet — Internal session</Text>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    backgroundColor: 'rgba(5,5,10,0.97)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    // Ensure it sits on top on web too
    ...(Platform.OS === 'web' ? { position: 'fixed' as any } : {}),
  },
  glass: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#0F0F1A',
    borderRadius: 28,
    paddingVertical: 36,
    paddingHorizontal: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.25)',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 32,
    elevation: 24,
  },

  iconRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(139,92,246,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  iconInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(139,92,246,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  title: {
    fontSize: fontSize.xxl ?? 22,
    fontWeight: '800',
    color: colors.white,
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginBottom: 28,
    textAlign: 'center',
  },

  dotsRow: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 16,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: 'rgba(139,92,246,0.35)',
    backgroundColor: 'transparent',
  },
  dotFilled: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },

  errorPlaceholder: { height: 18, marginBottom: 20 },
  errorText: {
    color: colors.error,
    fontSize: fontSize.xs,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 18,
  },
  errorCritical: {
    color: '#ff6b6b',
    fontWeight: '600',
  },
  attemptsText: {
    color: colors.warning,
    fontSize: fontSize.xs,
    textAlign: 'center',
    marginBottom: 20,
  },

  pad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 236,
    gap: 10,
    justifyContent: 'center',
    marginBottom: 24,
  },
  key: {
    width: 68,
    height: 68,
    borderRadius: 34,
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
    fontSize: 24,
    fontWeight: '600',
    color: colors.white,
  },

  loggingOut: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    marginBottom: 24,
    fontStyle: 'italic',
  },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  footerText: {
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: 0.2,
  },
});
