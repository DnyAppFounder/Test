import { useEffect, useRef, useState } from 'react';
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
import { AppGuideModal, hasSeenAppGuide } from '@/components/AppGuideModal';
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
 *
 * After ALL security/onboarding steps are complete (nextStep === null +
 * onboardingComplete), shows the DAWEN app guide once per device.
 */
export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { nextStep, isReady } = useOnboardingGuard();
  const { completeOnboarding, logEvent, onboardingComplete } = useSecurity();
  const { profile } = useProfile();
  const { activeWallet, activeAddress } = useWallet();
  const referralAppliedRef = useRef(false);

  // App guide — only shown after all security steps are done
  const [showGuide, setShowGuide] = useState(false);
  const guideCheckedRef = useRef(false);

  // Only mark complete when all steps are done AND a real wallet is present.
  useEffect(() => {
    console.log('[OnboardingGate] isReady:', isReady, '| nextStep:', nextStep);
  }, [isReady, nextStep]);

  useEffect(() => {
    if (isReady && activeWallet && nextStep === null && !onboardingComplete) {
      completeOnboarding(profile?.id);
      if (profile?.id) logEvent(profile.id, 'onboarding_completed');
    }
  }, [isReady, activeWallet, nextStep, onboardingComplete, profile?.id]);

  // Show app guide exactly once, only AFTER all onboarding/security steps done.
  // Guard: isReady + onboardingComplete (or nextStep === null + activeWallet)
  // + not already shown this session + hasn't been seen before.
  useEffect(() => {
    if (guideCheckedRef.current) return;
    // Wait until fully ready and all steps complete
    if (!isReady || !activeWallet || nextStep !== null) return;
    // Either onboardingComplete flag or we just marked it (same tick)
    guideCheckedRef.current = true;
    (async () => {
      const seen = await hasSeenAppGuide();
      if (!seen) setShowGuide(true);
    })();
  }, [isReady, activeWallet, nextStep, onboardingComplete]);

  // Auto-apply pending referral code once the user is fully onboarded.
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
          await clearPendingReferralCode();
        }
        if (result.reason === 'invalid_code' || result.reason === 'self_referral') {
          await clearPendingReferralCode();
        }
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
      <AppGuideModal visible={showGuide} onClose={() => setShowGuide(false)} />
    </>
  );
}
