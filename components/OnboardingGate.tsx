import { useEffect, useRef } from 'react';
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
import {
  ReferralService,
  getPendingReferralCode,
  clearPendingReferralCode,
} from '@/services/referralService';

/**
 * Additive overlay layer — wraps tab content.
 * Shows the next required onboarding step as a full-screen modal.
 * Never disconnects wallet. Never navigates. Never loops.
 *
 * Also auto-applies any pending referral code that was captured from the
 * ?ref= URL param before the user finished setting up their wallet.
 */
export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { nextStep, isReady } = useOnboardingGuard();
  const { completeOnboarding, logEvent, onboardingComplete } = useSecurity();
  const { profile } = useProfile();
  const { activeWallet, activeAddress } = useWallet();
  const referralAppliedRef = useRef(false);

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

  // Auto-apply pending referral code once the user is fully onboarded.
  // Fires at most once per wallet session (ref guard prevents repeat runs).
  useEffect(() => {
    if (
      !isReady ||
      !activeAddress ||
      nextStep !== null ||
      referralAppliedRef.current
    ) return;

    referralAppliedRef.current = true;

    (async () => {
      try {
        const pendingCode = await getPendingReferralCode();
        if (!pendingCode) return;

        const result = await ReferralService.applyReferralCode(activeAddress, pendingCode);
        if (result.success || result.reason === 'already_applied') {
          // Both outcomes mean we should not retry — clear the pending code.
          await clearPendingReferralCode();
        }
        // For 'invalid_code' or 'self_referral', also clear so we don't retry forever.
        if (result.reason === 'invalid_code' || result.reason === 'self_referral') {
          await clearPendingReferralCode();
        }
        // For 'error', keep the code in storage so the next session can retry.
        if (result.reason === 'error') {
          referralAppliedRef.current = false;
        }
      } catch {
        referralAppliedRef.current = false;
      }
    })();
  }, [isReady, activeAddress, nextStep]);

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
