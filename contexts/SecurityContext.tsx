import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { hashPin } from '@/lib/crypto/pinHash';

export type WalletSecurityType = 'created' | 'imported' | 'external' | null;

export type OnboardingStep =
  | 'pin'
  | 'username'
  | 'seed-backup'
  | 'import-backup'
  | 'external-warning'
  | 'biometric'
  | null;

const KEYS = {
  pinHash: 'security:pin_hash',
  walletType: 'security:wallet_type',
  biometricEnabled: 'security:biometric_enabled',
  biometricOffered: 'security:biometric_offered',
  seedBackupConfirmed: 'security:seed_backup_confirmed',
  importBackupConfirmed: 'security:import_backup_confirmed',
  externalWarningAccepted: 'security:external_warning_accepted',
  onboardingComplete: 'security:onboarding_complete',
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

export function SecurityProvider({ children }: { children: ReactNode }) {
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

  useEffect(() => {
    const load = async () => {
      try {
        const pairs = await AsyncStorage.multiGet(Object.values(KEYS));
        const map: Record<string, string | null> = {};
        pairs.forEach(([k, v]) => { map[k] = v; });
        setState({
          pinHash: map[KEYS.pinHash] ?? null,
          walletType: (map[KEYS.walletType] as WalletSecurityType) ?? null,
          biometricEnabled: map[KEYS.biometricEnabled] === 'true',
          biometricOffered: map[KEYS.biometricOffered] === 'true',
          seedBackupConfirmed: map[KEYS.seedBackupConfirmed] === 'true',
          importBackupConfirmed: map[KEYS.importBackupConfirmed] === 'true',
          externalWarningAccepted: map[KEYS.externalWarningAccepted] === 'true',
          onboardingComplete: map[KEYS.onboardingComplete] === 'true',
          isLoaded: true,
        });
      } catch {
        setState(s => ({ ...s, isLoaded: true }));
      }
    };
    load();
  }, []);

  const savePin = useCallback(async (pin: string, profileId?: string) => {
    const hash = hashPin(pin);
    await AsyncStorage.setItem(KEYS.pinHash, hash);
    setState(s => ({ ...s, pinHash: hash }));
    if (profileId) {
      supabase.from('user_profiles').update({ pin_hash: hash }).eq('id', profileId).then(() => {});
    }
  }, []);

  const setWalletType = useCallback(async (type: WalletSecurityType) => {
    if (type) await AsyncStorage.setItem(KEYS.walletType, type);
    else await AsyncStorage.removeItem(KEYS.walletType);
    setState(s => ({ ...s, walletType: type }));
  }, []);

  const setBiometricEnabled = useCallback(async (enabled: boolean, profileId?: string) => {
    await AsyncStorage.setItem(KEYS.biometricEnabled, enabled ? 'true' : 'false');
    await AsyncStorage.setItem(KEYS.biometricOffered, 'true');
    setState(s => ({ ...s, biometricEnabled: enabled, biometricOffered: true }));
    if (profileId) {
      supabase.from('user_profiles').update({ biometric_enabled: enabled }).eq('id', profileId).then(() => {});
    }
  }, []);

  const markBiometricOffered = useCallback(async () => {
    await AsyncStorage.setItem(KEYS.biometricOffered, 'true');
    setState(s => ({ ...s, biometricOffered: true }));
  }, []);

  const confirmSeedBackup = useCallback(async (profileId?: string) => {
    await AsyncStorage.setItem(KEYS.seedBackupConfirmed, 'true');
    setState(s => ({ ...s, seedBackupConfirmed: true }));
    if (profileId) {
      supabase.from('user_profiles').update({ seed_backup_confirmed: true }).eq('id', profileId).then(() => {});
    }
  }, []);

  const confirmImportBackup = useCallback(async (profileId?: string) => {
    await AsyncStorage.setItem(KEYS.importBackupConfirmed, 'true');
    setState(s => ({ ...s, importBackupConfirmed: true }));
    if (profileId) {
      supabase.from('user_profiles').update({ backup_confirmation_accepted: true }).eq('id', profileId).then(() => {});
    }
  }, []);

  const acceptExternalWarning = useCallback(async (profileId?: string) => {
    await AsyncStorage.setItem(KEYS.externalWarningAccepted, 'true');
    setState(s => ({ ...s, externalWarningAccepted: true }));
    if (profileId) {
      supabase.from('user_profiles').update({ external_backup_warning_accepted: true }).eq('id', profileId).then(() => {});
    }
  }, []);

  const completeOnboarding = useCallback(async (profileId?: string) => {
    await AsyncStorage.setItem(KEYS.onboardingComplete, 'true');
    setState(s => ({ ...s, onboardingComplete: true }));
    if (profileId) {
      supabase.from('user_profiles').update({ onboarding_complete: true }).eq('id', profileId).then(() => {});
    }
  }, []);

  const logEvent = useCallback(async (profileId: string, eventType: string) => {
    supabase.from('security_events').insert({ user_id: profileId, event_type: eventType }).then(() => {});
  }, []);

  const checkPin = useCallback((pin: string): boolean => {
    if (!state.pinHash) return false;
    return hashPin(pin) === state.pinHash;
  }, [state.pinHash]);

  return (
    <SecurityContext.Provider value={{
      ...state,
      savePin,
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
