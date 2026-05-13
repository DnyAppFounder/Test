import { useMemo } from 'react';
import { OnboardingStep, useSecurity } from '@/contexts/SecurityContext';
import { useProfile } from '@/contexts/ProfileContext';
import { useWallet } from '@/contexts/WalletContext';

/**
 * Returns the next incomplete onboarding step, or null when done.
 * Order: pin → username → wallet-type step → biometric (optional offer).
 * Never redirects, never disconnects.
 */
export function useOnboardingGuard(): { nextStep: OnboardingStep; isReady: boolean } {
  const {
    isLoaded,
    loadedForAddr,
    pinHash,
    walletType,
    seedBackupConfirmed,
    importBackupConfirmed,
    externalWarningAccepted,
    biometricOffered,
    onboardingComplete,
  } = useSecurity();
  const { profile, loading: profileLoading } = useProfile();
  const { activeWallet, isInitialized, activeAddress } = useWallet();

  const expectedAddr = (activeAddress ?? '').toLowerCase().trim();
  const isReady = isLoaded && isInitialized && !profileLoading && loadedForAddr === expectedAddr;

  const nextStep = useMemo<OnboardingStep>(() => {
    if (!isReady || !activeWallet) return null;
    if (onboardingComplete) return null;

    // 1. PIN required for all users
    if (!pinHash) return 'pin';

    // 2. Username required only if completely absent — never re-validate existing usernames
    const existingUsername = profile?.username?.trim();
    if (!existingUsername || existingUsername.length === 0) return 'username';

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
    loadedForAddr,
    expectedAddr,
  ]);

  return { nextStep, isReady };
}
