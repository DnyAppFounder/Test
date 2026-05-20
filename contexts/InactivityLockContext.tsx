/**
 * InactivityLockContext
 *
 * Manages session lock state for INTERNAL DAWEN wallets only.
 * External wallets (Phantom, Backpack, Solflare) are never affected.
 *
 * Locks when:
 * - User has been inactive for INACTIVITY_TIMEOUT_MS (15 min)
 * - App goes to background for BACKGROUND_TIMEOUT_MS (10 min) and returns
 *
 * Activity sources that reset the timer (ONLY real user gestures):
 * - Touch / tap / press
 * - Scroll
 * - Keyboard input
 * - Navigation
 *
 * Sources that must NOT reset the timer:
 * - Chart animation ticks
 * - Price / WS updates
 * - Background polling
 * - Balance refresh
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  ReactNode,
} from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { useWallet } from '@/contexts/WalletContext';

const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
const BACKGROUND_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export interface InactivityLockContextValue {
  isLocked: boolean;
  /** Call from real user-interaction handlers only. */
  recordActivity: () => void;
  /** Unlock after correct PIN verified externally. */
  unlock: () => void;
  /** Force-lock (e.g. manual lock button). */
  lock: () => void;
}

const InactivityLockContext = createContext<InactivityLockContextValue | undefined>(undefined);

export function InactivityLockProvider({ children }: { children: ReactNode }) {
  const { activeWallet } = useWallet();

  // Only engage for internal wallets (created or imported).
  const isInternalWallet = activeWallet?.type === 'created' || activeWallet?.type === 'imported';

  const [isLocked, setIsLocked] = useState(false);

  const lastActivityRef   = useRef(Date.now());
  const backgroundAtRef   = useRef<number | null>(null);
  const timerRef          = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── helpers ──────────────────────────────────────────────────────────────

  const scheduleCheck = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const elapsed = Date.now() - lastActivityRef.current;
      if (elapsed >= INACTIVITY_TIMEOUT_MS) {
        setIsLocked(true);
      } else {
        // Reschedule for the remaining window
        timerRef.current = setTimeout(() => {
          setIsLocked(true);
        }, INACTIVITY_TIMEOUT_MS - elapsed);
      }
    }, INACTIVITY_TIMEOUT_MS);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // ── public API ────────────────────────────────────────────────────────────

  const recordActivity = useCallback(() => {
    if (!isInternalWallet) return;
    lastActivityRef.current = Date.now();
    // Reschedule the inactivity check from now
    scheduleCheck();
  }, [isInternalWallet, scheduleCheck]);

  const unlock = useCallback(() => {
    lastActivityRef.current = Date.now();
    setIsLocked(false);
    scheduleCheck();
  }, [scheduleCheck]);

  const lock = useCallback(() => {
    setIsLocked(true);
    stopTimer();
  }, [stopTimer]);

  // ── start/stop based on wallet type ──────────────────────────────────────

  useEffect(() => {
    if (!isInternalWallet) {
      stopTimer();
      setIsLocked(false);
      return;
    }
    lastActivityRef.current = Date.now();
    scheduleCheck();
    return stopTimer;
  }, [isInternalWallet, scheduleCheck, stopTimer]);

  // ── AppState — background detection ──────────────────────────────────────

  useEffect(() => {
    if (!isInternalWallet) return;

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        backgroundAtRef.current = Date.now();
      } else if (nextState === 'active') {
        const bg = backgroundAtRef.current;
        backgroundAtRef.current = null;
        if (bg !== null) {
          const bgElapsed = Date.now() - bg;
          if (bgElapsed >= BACKGROUND_TIMEOUT_MS) {
            setIsLocked(true);
            stopTimer();
            return;
          }
        }
        // App returned quickly — reset inactivity timer
        recordActivity();
      }
    };

    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, [isInternalWallet, recordActivity, stopTimer]);

  // ── Web visibility API ────────────────────────────────────────────────────

  useEffect(() => {
    if (!isInternalWallet || Platform.OS !== 'web' || typeof document === 'undefined') return;

    const handleVisibility = () => {
      if (document.hidden) {
        backgroundAtRef.current = Date.now();
      } else {
        const bg = backgroundAtRef.current;
        backgroundAtRef.current = null;
        if (bg !== null) {
          const bgElapsed = Date.now() - bg;
          if (bgElapsed >= BACKGROUND_TIMEOUT_MS) {
            setIsLocked(true);
            stopTimer();
            return;
          }
        }
        recordActivity();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [isInternalWallet, recordActivity, stopTimer]);

  // ── Clear lock when wallet changes (e.g. switch to external) ─────────────

  useEffect(() => {
    if (!isInternalWallet) {
      setIsLocked(false);
    }
  }, [isInternalWallet]);

  return (
    <InactivityLockContext.Provider value={{ isLocked, recordActivity, unlock, lock }}>
      {children}
    </InactivityLockContext.Provider>
  );
}

export function useInactivityLock(): InactivityLockContextValue {
  const ctx = useContext(InactivityLockContext);
  if (!ctx) throw new Error('useInactivityLock must be used within InactivityLockProvider');
  return ctx;
}
