import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { X, Check } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { colors, spacing, borderRadius, fontSize } from '@/constants/theme';
import { VerificationService } from '@/services/verificationService';
import { useProfile } from '@/contexts/ProfileContext';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function GetVerifiedModal({ visible, onClose }: Props) {
  const router = useRouter();
  const { profile, refreshProfile } = useProfile();

  const [verifyStatus, setVerifyStatus] = useState<{
    followsDecent: boolean; followsBadge: boolean; followsDawenPulse: boolean; sentBlueDM: boolean;
    alreadyVerified: boolean; decentId: string | null; badgeId: string | null;
    dawenPulseId: string | null; blueBadgeId: string | null;
  } | null>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyChecking, setVerifyChecking] = useState(false);

  const loadVerifyStatus = async () => {
    if (!profile?.id) return;
    setVerifyLoading(true);
    try {
      const status = await VerificationService.getVerificationStatus(profile.id);
      setVerifyStatus(status);
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleCheckVerification = async () => {
    if (!profile?.id) return;
    setVerifyChecking(true);
    try {
      const granted = await VerificationService.checkAndGrantBasicVerification(profile.id);
      if (granted) {
        await refreshProfile();
        const status = await VerificationService.getVerificationStatus(profile.id);
        setVerifyStatus(status);
      } else {
        const status = await VerificationService.getVerificationStatus(profile.id);
        setVerifyStatus(status);
        Alert.alert('Not Yet Verified', 'Please complete all 4 steps first.');
      }
    } finally {
      setVerifyChecking(false);
    }
  };

  const handleOpen = () => {
    loadVerifyStatus();
  };

  const handleClose = () => {
    onClose();
    // Delay clearing state so the slide-out animation doesn't flicker
    setTimeout(() => setVerifyStatus(null), 350);
  };

  const navigateAndClose = (path: string) => {
    onClose();
    setTimeout(() => {
      setVerifyStatus(null);
      router.push(path as any);
    }, 50);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onShow={handleOpen}
    >
      <View style={styles.overlay}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>Get Verified</Text>
            <TouchableOpacity onPress={handleClose}>
              <X size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {verifyLoading ? (
            <ActivityIndicator size="large" color={colors.primary} style={{ marginVertical: 40 }} />
          ) : verifyStatus?.alreadyVerified ? (
            <View style={styles.alreadyVerified}>
              <View style={styles.checkCircle}>
                <Check size={36} color="#3b82f6" />
              </View>
              <Text style={styles.alreadyVerifiedTitle}>Already Verified!</Text>
              <Text style={styles.alreadyVerifiedSub}>
                Your blue badge is active on your profile and posts.
              </Text>
              <TouchableOpacity style={styles.doneBtn} onPress={handleClose}>
                <Text style={styles.doneBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
            >
              <Text style={styles.intro}>
                Complete all 4 steps below to receive your free blue verification badge.
              </Text>

              {[
                {
                  label: 'Follow @Decent',
                  sub: 'Follow the official Decent account',
                  done: verifyStatus?.followsDecent,
                  id: verifyStatus?.decentId,
                  onNav: () => navigateAndClose(`/profile/${verifyStatus!.decentId}`),
                  btnLabel: verifyStatus?.followsDecent ? 'Done' : 'Follow',
                },
                {
                  label: 'Follow @VerificationBadge',
                  sub: 'Follow the verification account',
                  done: verifyStatus?.followsBadge,
                  id: verifyStatus?.badgeId,
                  onNav: () => navigateAndClose(`/profile/${verifyStatus!.badgeId}`),
                  btnLabel: verifyStatus?.followsBadge ? 'Done' : 'Follow',
                },
                {
                  label: 'Follow @DawenPulse',
                  sub: 'Follow the official DawenPulse account',
                  done: verifyStatus?.followsDawenPulse,
                  id: verifyStatus?.dawenPulseId,
                  onNav: () => navigateAndClose(`/profile/${verifyStatus!.dawenPulseId}`),
                  btnLabel: verifyStatus?.followsDawenPulse ? 'Done' : 'Follow',
                },
                {
                  label: 'DM "Blue" to @BlueBadge',
                  sub: 'Send the message "Blue" to @BlueBadge',
                  done: verifyStatus?.sentBlueDM,
                  id: verifyStatus?.blueBadgeId,
                  onNav: () => navigateAndClose(`/chat/${verifyStatus!.blueBadgeId}`),
                  btnLabel: verifyStatus?.sentBlueDM ? 'Done' : 'DM',
                },
              ].map((step, idx) => (
                <View
                  key={idx}
                  style={[
                    styles.step,
                    step.done && styles.stepDone,
                  ]}
                >
                  <View style={[styles.stepNum, step.done && styles.stepNumDone]}>
                    {step.done
                      ? <Check size={16} color="#fff" strokeWidth={3} />
                      : <Text style={styles.stepNumText}>{idx + 1}</Text>}
                  </View>
                  <View style={styles.stepInfo}>
                    <Text style={styles.stepLabel}>{step.label}</Text>
                    <Text style={styles.stepSub}>{step.sub}</Text>
                  </View>
                  {step.id && (
                    <TouchableOpacity style={styles.stepBtn} onPress={step.onNav} activeOpacity={0.8}>
                      <Text style={styles.stepBtnText}>{step.btnLabel}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}

              <TouchableOpacity
                style={styles.checkBtn}
                onPress={handleCheckVerification}
                disabled={verifyChecking}
                activeOpacity={0.88}
              >
                {verifyChecking
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Check size={18} color="#fff" />}
                <Text style={styles.checkBtnText}>
                  {verifyChecking ? 'Checking...' : 'CHECK & VERIFY'}
                </Text>
              </TouchableOpacity>
              <Text style={styles.checkHint}>
                Verification is free. Make sure all 4 steps are completed before checking.
              </Text>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  content: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  scrollContent: {
    paddingBottom: 48,
  },
  intro: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
    lineHeight: 18,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    marginBottom: 12,
    backgroundColor: colors.surfaceLight,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: colors.surfaceBorder,
  },
  stepDone: {
    backgroundColor: 'rgba(59,130,246,0.08)',
    borderColor: '#3b82f6',
  },
  stepNum: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(59,130,246,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  stepNumDone: {
    backgroundColor: '#3b82f6',
  },
  stepNumText: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    color: '#3b82f6',
  },
  stepInfo: { flex: 1 },
  stepLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  stepSub: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  stepBtn: {
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignSelf: 'center',
  },
  stepBtnText: {
    color: '#fff',
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  checkBtn: {
    backgroundColor: '#3b82f6',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  checkBtnText: {
    fontSize: fontSize.md,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 0.5,
  },
  checkHint: {
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 10,
    paddingBottom: spacing.md,
  },
  alreadyVerified: {
    alignItems: 'center',
    gap: 16,
    paddingVertical: 24,
    paddingBottom: 40,
  },
  checkCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(59,130,246,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  alreadyVerifiedTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  alreadyVerifiedSub: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  doneBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 50,
    marginTop: 8,
  },
  doneBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: fontSize.md,
  },
});
