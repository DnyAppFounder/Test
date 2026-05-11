import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { hashPin } from '@/lib/crypto/pinHash';
import { useWallet } from '@/contexts/WalletContext';

export type WalletSecurityType = 'created' | 'imported' | 'external' | null;

export type OnboardingStep =
  | 'pin'
  | 'username'
  | 'seed-backup'
  | 'import-backup'
  | 'external-warning'
  | 'biometric'
  | null;

// Per-wallet AsyncStorage key builder
const wKey = (addr: string, suffix: string) =>
  `security:${addr.toLowerCase().trim()}:${suffix}`;

// Legacy global keys (read for migration, write to for backward compat)
const G = {
  pinHash:                  'security:pin_hash',
  walletType:               'security:wallet_type',
  biometricEnabled:         'security:biometric_enabled',
  biometricOffered:         'security:biometric_offered',
  seedBackupConfirmed:      'security:seed_backup_confirmed',
  importBackupConfirmed:    'security:import_backup_confirmed',
  externalWarningAccepted:  'security:external_warning_accepted',
  onboardingComplete:       'security:onboarding_complete',
};

interface SecurityState {
  pinHash: string | null;
  walletType: WalletSecurityType;
  biometricEnabled: boolean;
  biometricOffered: boolean;
  seedBackupConfirmed: boolean;
  importBackupConfirmed: boolean;
  externalWarningAccepted: boolean;
  onboardingComplete: boolean;
  isLoaded: boolean;
}

interface SecurityContextValue extends SecurityState {
  savePin: (pin: string, profileId?: string) => Promise<void>;
  changePin: (currentPin: string, newPin: string) => Promise<{ success: boolean; error?: string }>;
  setWalletType: (type: WalletSecurityType) => Promise<void>;
  setBiometricEnabled: (enabled: boolean, profileId?: string) => Promise<void>;
  markBiometricOffered: () => Promise<void>;
  confirmSeedBackup: (profileId?: string) => Promise<void>;
  confirmImportBackup: (profileId?: string) => Promise<void>;
  acceptExternalWarning: (profileId?: string) => Promise<void>;
  completeOnboarding: (profileId?: string) => Promise<void>;
  logEvent: (profileId: string, eventType: string) => Promise<void>;
  checkPin: (pin: string) => boolean;
}

const SecurityContext = createContext<SecurityContextValue | undefined>(undefined);

// Read a value: wallet-specific key first, then migrate from global legacy key
async function readKey(addr: string, suffix: string, globalKey: string): Promise<string | null> {
  if (addr) {
    const val = await AsyncStorage.getItem(wKey(addr, suffix)).catch(() => null);
    if (val !== null) return val;
  }
  const legacy = await AsyncStorage.getItem(globalKey).catch(() => null);
  if (legacy !== null && addr) {
    // Migrate to wallet-specific key silently
    AsyncStorage.setItem(wKey(addr, suffix), legacy).catch(() => {});
  }
  return legacy;
}

// Write a value to both wallet-specific and global keys
async function writeKey(addr: string, suffix: string, globalKey: string, value: string) {
  const ops: Promise<void>[] = [AsyncStorage.setItem(globalKey, value)];
  if (addr) ops.push(AsyncStorage.setItem(wKey(addr, suffix), value));
  await Promise.all(ops).catch(() => {});
}

export function SecurityProvider({ children }: { children: ReactNode }) {
  const { activeAddress } = useWallet();
  const addr = (activeAddress ?? '').toLowerCase().trim();

  const [state, setState] = useState<SecurityState>({
    pinHash: null,
    walletType: null,
    biometricEnabled: false,
    biometricOffered: false,
    seedBackupConfirmed: false,
    importBackupConfirmed: false,
    externalWarningAccepted: false,
    onboardingComplete: false,
    isLoaded: false,
  });

  // Reload security state whenever the active wallet address changes
  useEffect(() => {
    let cancelled = false;
    setState(s => ({ ...s, isLoaded: false }));

    const load = async () => {
      try {
        const [
          pinHashVal,
          walletTypeVal,
          biometricEnabledVal,
          biometricOfferedVal,
          seedBackupVal,
          importBackupVal,
          externalWarningVal,
          onboardingCompleteVal,
        ] = await Promise.all([
          readKey(addr, 'pin_hash',                 G.pinHash),
          readKey(addr, 'wallet_type',              G.walletType),
          readKey(addr, 'biometric_enabled',        G.biometricEnabled),
          readKey(addr, 'biometric_offered',        G.biometricOffered),
          readKey(addr, 'seed_backup_confirmed',    G.seedBackupConfirmed),
          readKey(addr, 'import_backup_confirmed',  G.importBackupConfirmed),
          readKey(addr, 'external_warning_accepted',G.externalWarningAccepted),
          readKey(addr, 'onboarding_complete',      G.onboardingComplete),
        ]);

        // If pin not found locally, try Supabase backup (only when authenticated)
        let finalPinHash = pinHashVal;
        if (!finalPinHash && addr) {
          try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
              const { data } = await supabase
                .from('wallet_security')
                .select('pin_hash')
                .eq('wallet_address', addr)
                .eq('user_id', user.id)
                .maybeSingle();
              if (data?.pin_hash) {
                finalPinHash = data.pin_hash;
                // Restore to local storage so next load is instant
                writeKey(addr, 'pin_hash', G.pinHash, data.pin_hash).catch(() => {});
              }
            }
          } catch {}
        }

        if (!cancelled) {
          setState({
            pinHash:                  finalPinHash,
            walletType:               (walletTypeVal as WalletSecurityType) ?? null,
            biometricEnabled:         biometricEnabledVal === 'true',
            biometricOffered:         biometricOfferedVal === 'true',
            seedBackupConfirmed:      seedBackupVal === 'true',
            importBackupConfirmed:    importBackupVal === 'true',
            externalWarningAccepted:  externalWarningVal === 'true',
            onboardingComplete:       onboardingCompleteVal === 'true',
            isLoaded: true,
          });
        }
      } catch {
        if (!cancelled) setState(s => ({ ...s, isLoaded: true }));
      }
    };

    load();
    return () => { cancelled = true; };
  }, [addr]);

  // ── savePin ──────────────────────────────────────────────────────────────
  const savePin = useCallback(async (pin: string, profileId?: string) => {
    const hash = hashPin(pin);
    await writeKey(addr, 'pin_hash', G.pinHash, hash);
    setState(s => ({ ...s, pinHash: hash }));

    // Durable server backup keyed by wallet address
    if (addr) {
      const { data: { user } } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
      if (user) {
        supabase.from('wallet_security').upsert({
          wallet_address: addr,
          user_id: user.id,
          pin_hash: hash,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'wallet_address' }).then(() => {});
      }
    }
    // Also sync to user_profiles column if profile id available
    if (profileId) {
      supabase.from('user_profiles').update({ pin_hash: hash }).eq('id', profileId).then(() => {});
    }
  }, [addr]);

  // ── changePin ─────────────────────────────────────────────────────────────
  const changePin = useCallback(async (
    currentPin: string,
    newPin: string,
  ): Promise<{ success: boolean; error?: string }> => {
    if (!state.pinHash) return { success: false, error: 'No PIN is set for this wallet.' };
    if (hashPin(currentPin) !== state.pinHash) return { success: false, error: 'Current PIN is incorrect.' };
    if (!newPin || newPin.length < 4 || newPin.length > 6 || !/^\d+$/.test(newPin)) {
      return { success: false, error: 'New PIN must be 4–6 digits.' };
    }
    const hash = hashPin(newPin);
    await writeKey(addr, 'pin_hash', G.pinHash, hash);
    setState(s => ({ ...s, pinHash: hash }));

    if (addr) {
      const { data: { user } } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
      if (user) {
        supabase.from('wallet_security').upsert({
          wallet_address: addr,
          user_id: user.id,
          pin_hash: hash,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'wallet_address' }).then(() => {});
      }
    }
    return { success: true };
  }, [state.pinHash, addr]);

  // ── setWalletType ─────────────────────────────────────────────────────────
  const setWalletType = useCallback(async (type: WalletSecurityType) => {
    const val = type ?? '';
    await writeKey(addr, 'wallet_type', G.walletType, val);
    setState(s => ({ ...s, walletType: type }));
  }, [addr]);

  // ── setBiometricEnabled ───────────────────────────────────────────────────
  const setBiometricEnabled = useCallback(async (enabled: boolean, profileId?: string) => {
    const val = enabled ? 'true' : 'false';
    await writeKey(addr, 'biometric_enabled', G.biometricEnabled, val);
    await writeKey(addr, 'biometric_offered',  G.biometricOffered,  'true');
    setState(s => ({ ...s, biometricEnabled: enabled, biometricOffered: true }));
    if (profileId) {
      supabase.from('user_profiles').update({ biometric_enabled: enabled }).eq('id', profileId).then(() => {});
    }
  }, [addr]);

  // ── markBiometricOffered ──────────────────────────────────────────────────
  const markBiometricOffered = useCallback(async () => {
    await writeKey(addr, 'biometric_offered', G.biometricOffered, 'true');
    setState(s => ({ ...s, biometricOffered: true }));
  }, [addr]);

  // ── confirmSeedBackup ─────────────────────────────────────────────────────
  const confirmSeedBackup = useCallback(async (profileId?: string) => {
    await writeKey(addr, 'seed_backup_confirmed', G.seedBackupConfirmed, 'true');
    setState(s => ({ ...s, seedBackupConfirmed: true }));
    if (profileId) {
      supabase.from('user_profiles').update({ seed_backup_confirmed: true }).eq('id', profileId).then(() => {});
    }
  }, [addr]);

  // ── confirmImportBackup ───────────────────────────────────────────────────
  const confirmImportBackup = useCallback(async (profileId?: string) => {
    await writeKey(addr, 'import_backup_confirmed', G.importBackupConfirmed, 'true');
    setState(s => ({ ...s, importBackupConfirmed: true }));
    if (profileId) {
      supabase.from('user_profiles').update({ backup_confirmation_accepted: true }).eq('id', profileId).then(() => {});
    }
  }, [addr]);

  // ── acceptExternalWarning ─────────────────────────────────────────────────
  const acceptExternalWarning = useCallback(async (profileId?: string) => {
    await writeKey(addr, 'external_warning_accepted', G.externalWarningAccepted, 'true');
    setState(s => ({ ...s, externalWarningAccepted: true }));
    if (profileId) {
      supabase.from('user_profiles').update({ external_backup_warning_accepted: true }).eq('id', profileId).then(() => {});
    }
  }, [addr]);

  // ── completeOnboarding ────────────────────────────────────────────────────
  const completeOnboarding = useCallback(async (profileId?: string) => {
    await writeKey(addr, 'onboarding_complete', G.onboardingComplete, 'true');
    setState(s => ({ ...s, onboardingComplete: true }));
    if (profileId) {
      supabase.from('user_profiles').update({ onboarding_complete: true }).eq('id', profileId).then(() => {});
    }
  }, [addr]);

  // ── logEvent ──────────────────────────────────────────────────────────────
  const logEvent = useCallback(async (profileId: string, eventType: string) => {
    supabase.from('security_events').insert({ user_id: profileId, event_type: eventType }).then(() => {});
  }, []);

  // ── checkPin ──────────────────────────────────────────────────────────────
  const checkPin = useCallback((pin: string): boolean => {
    if (!state.pinHash) return false;
    return hashPin(pin) === state.pinHash;
  }, [state.pinHash]);

  return (
    <SecurityContext.Provider value={{
      ...state,
      savePin,
      changePin,
      setWalletType,
      setBiometricEnabled,
      markBiometricOffered,
      confirmSeedBackup,
      confirmImportBackup,
      acceptExternalWarning,
      completeOnboarding,
      logEvent,
      checkPin,
    }}>
      {children}
    </SecurityContext.Provider>
  );
}

export function useSecurity() {
  const ctx = useContext(SecurityContext);
  if (!ctx) throw new Error('useSecurity must be used within SecurityProvider');
  return ctx;
}
