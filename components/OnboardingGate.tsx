import { useEffect } from 'react';
import { useSecurity } from '@/contexts/SecurityContext';
import { useProfile } from '@/contexts/ProfileContext';
import { useWallet } from '@/contexts/WalletContext';
import { useOnboardingGuard } from '@/hooks/useOnboardingGuard';
import { PinSetupModal } from '@/components/onboarding/PinSetupModal';
import { UsernameSetupModal } from '@/components/onboarding/UsernameSetupModal';
import { SeedBackupModal } from '@/components/onboarding/SeedBackupModal';
import { ImportBackupModal } from '@/components/onboarding/ImportBackupModal';
import { ExternalWarningModal } from '@/components/onboarding/ExternalWarningModal';
import { BiometricModal } from '@/components/onboarding/BiometricModal';

/**
 * Additive overlay layer — wraps tab content.
 * Shows the next required onboarding step as a full-screen modal.
 * Never disconnects wallet. Never navigates. Never loops.
 */
export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { nextStep, isReady } = useOnboardingGuard();
  const { completeOnboarding, logEvent, onboardingComplete } = useSecurity();
  const { profile } = useProfile();
  const { activeWallet } = useWallet();

  // Only mark complete when all steps are done AND a real wallet is present.
  // Without the activeWallet guard this effect fires while activeWallet is null
  // (brief window after navigation) and writes the global 'security:onboarding_complete'
  // key, which then gets read by every future wallet address via the legacy-key
  // fallback in readKey(), silently skipping all onboarding steps.
  useEffect(() => {
    console.log('[OnboardingGate] isReady:', isReady, '| nextStep:', nextStep);
  }, [isReady, nextStep]);

  useEffect(() => {
    if (isReady && activeWallet && nextStep === null && !onboardingComplete) {
      completeOnboarding(profile?.id);
      if (profile?.id) logEvent(profile.id, 'onboarding_completed');
    }
  }, [isReady, activeWallet, nextStep, onboardingComplete, profile?.id]);

  return (
    <>
      {children}
      <PinSetupModal visible={isReady && nextStep === 'pin'} />
      <UsernameSetupModal visible={isReady && nextStep === 'username'} />
      <SeedBackupModal visible={isReady && nextStep === 'seed-backup'} />
      <ImportBackupModal visible={isReady && nextStep === 'import-backup'} />
      <ExternalWarningModal visible={isReady && nextStep === 'external-warning'} />
      <BiometricModal visible={isReady && nextStep === 'biometric'} />
    </>
  );
}
