import { useMemo } from 'react';
import { OnboardingStep, useSecurity } from '@/contexts/SecurityContext';
import { useProfile } from '@/contexts/ProfileContext';
import { useWallet } from '@/contexts/WalletContext';

const RESERVED_USERNAMES = new Set([
  'admin', 'support', 'dawen', 'official', 'verification',
  'verified', 'moderator', 'root', 'system',
]);

function isValidUsername(name: string | null | undefined): boolean {
  if (!name) return false;
  const t = name.trim();
  if (t.length < 3 || t.length > 20) return false;
  if (!/^[a-z0-9_]+$/.test(t)) return false;
  if (RESERVED_USERNAMES.has(t)) return false;
  return true;
}

/**
 * Returns the next incomplete onboarding step, or null when done.
 * Order: pin → username → wallet-type step → biometric (optional offer).
 * Never redirects, never disconnects.
 */
export function useOnboardingGuard(): { nextStep: OnboardingStep; isReady: boolean } {
  const {
    isLoaded,
    pinHash,
    walletType,
    seedBackupConfirmed,
    importBackupConfirmed,
    externalWarningAccepted,
    biometricOffered,
    onboardingComplete,
  } = useSecurity();
  const { profile, loading: profileLoading } = useProfile();
  const { activeWallet, isInitialized } = useWallet();

  const isReady = isLoaded && isInitialized && !profileLoading;

  const nextStep = useMemo<OnboardingStep>(() => {
    if (!isReady || !activeWallet) return null;
    if (onboardingComplete) return null;

    // 1. PIN required for all users
    if (!pinHash) return 'pin';

    // 2. Username required if missing or invalid (never force rename for existing valid usernames)
    if (!isValidUsername(profile?.username)) return 'username';

    // 3. Wallet-type-specific backup step
    const type = walletType ?? activeWallet.type;
    if (type === 'created' && !seedBackupConfirmed) return 'seed-backup';
    if (type === 'imported' && !importBackupConfirmed) return 'import-backup';
    if ((type === 'external' || activeWallet.type === 'connected') && !externalWarningAccepted) {
      return 'external-warning';
    }

    // 4. Biometric — offer once, skippable (won't block if already offered)
    if (!biometricOffered) return 'biometric';

    return null;
  }, [
    isReady,
    activeWallet,
    pinHash,
    onboardingComplete,
    profile?.username,
    walletType,
    seedBackupConfirmed,
    importBackupConfirmed,
    externalWarningAccepted,
    biometricOffered,
  ]);

  return { nextStep, isReady };
}
