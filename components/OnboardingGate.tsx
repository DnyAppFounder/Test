import { useEffect } from 'react';
import { useSecurity } from '@/contexts/SecurityContext';
import { useProfile } from '@/contexts/ProfileContext';
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
  const { completeOnboarding, logEvent } = useSecurity();
  const { profile } = useProfile();

  // Mark complete and log event when all steps are done
  useEffect(() => {
    if (isReady && nextStep === null && profile?.id) {
      completeOnboarding(profile.id);
      logEvent(profile.id, 'onboarding_completed');
    }
  }, [isReady, nextStep, profile?.id]);

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
