import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Image,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withRepeat,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { Wallet, ChevronRight, Plus, Download, Shield } from 'lucide-react-native';
import { colors, spacing, borderRadius, fontSize } from '@/constants/theme';
import { ConnectWalletModal } from '@/components/ConnectWalletModal';
import { SecureWalletManager } from '@/lib/wallet/SecureWalletManager';

const ONBOARDING_KEY = 'onboarding_completed';

export default function OnboardingWelcome() {
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [showEnterModal, setShowEnterModal] = useState(false);
  const [hasWallet, setHasWallet] = useState<boolean | null>(null);

  const logoOpacity = useSharedValue(0);
  const logoScale = useSharedValue(0.85);
  const headlineOpacity = useSharedValue(0);
  const headlineTranslateY = useSharedValue(24);
  const subheadOpacity = useSharedValue(0);
  const buttonsOpacity = useSharedValue(0);
  const buttonsTranslateY = useSharedValue(30);
  const glowOpacity = useSharedValue(0.4);

  useEffect(() => {
    console.log('[Onboarding] Welcome screen mounted');
    logoOpacity.value = withDelay(150, withTiming(1, { duration: 800, easing: Easing.out(Easing.cubic) }));
    logoScale.value = withDelay(150, withTiming(1, { duration: 800, easing: Easing.out(Easing.cubic) }));
    headlineOpacity.value = withDelay(550, withTiming(1, { duration: 700 }));
    headlineTranslateY.value = withDelay(550, withTiming(0, { duration: 700, easing: Easing.out(Easing.cubic) }));
    subheadOpacity.value = withDelay(850, withTiming(1, { duration: 600 }));
    buttonsOpacity.value = withDelay(1100, withTiming(1, { duration: 600 }));
    buttonsTranslateY.value = withDelay(1100, withTiming(0, { duration: 600, easing: Easing.out(Easing.cubic) }));
    glowOpacity.value = withRepeat(
      withSequence(
        withTiming(0.7, { duration: 2200 }),
        withTiming(0.3, { duration: 2200 })
      ),
      -1,
      true
    );
  }, []);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));
  const headlineStyle = useAnimatedStyle(() => ({
    opacity: headlineOpacity.value,
    transform: [{ translateY: headlineTranslateY.value }],
  }));
  const subheadStyle = useAnimatedStyle(() => ({ opacity: subheadOpacity.value }));
  const buttonsStyle = useAnimatedStyle(() => ({
    opacity: buttonsOpacity.value,
    transform: [{ translateY: buttonsTranslateY.value }],
  }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glowOpacity.value }));

  const markOnboardingComplete = useCallback(async () => {
    try {
      await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
      console.log('[Onboarding] Marked onboarding_completed = true');
    } catch (e) {
      console.warn('[Onboarding] Failed to persist onboarding_completed:', e);
    }
  }, []);

  const handleEnterApp = useCallback(async () => {
    const walletManager = SecureWalletManager.getInstance();
    const accts = await walletManager.getAccounts().catch(() => []);
    console.log('[Onboarding] handleEnterApp — hasWallet:', accts.length > 0);
    setHasWallet(accts.length > 0);
    setShowEnterModal(true);
  }, []);

  return (
    <View style={styles.container}>
      {/* Background grid dots */}
      <View style={styles.bgDots} />

      {/* Purple glow orb behind logo */}
      <Animated.View style={[styles.glowOrb, glowStyle]} />

      <View style={styles.content}>
        {/* Top hero section */}
        <View style={styles.topSection}>
          <Animated.View style={[styles.logoWrap, logoStyle]}>
            <View style={styles.logoGlow} />
            <Image
              source={require('../../dawenlogo.jpeg')}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </Animated.View>

          <Animated.View style={headlineStyle}>
            <Text style={styles.appName}>DNY</Text>
            <Text style={styles.headline}>Empire of Crypto</Text>
          </Animated.View>

          <Animated.View style={subheadStyle}>
            <Text style={styles.subheadline}>
              Trade. Post. <Text style={styles.subheadAccent}>Play. Earn.</Text>
            </Text>
          </Animated.View>

          <Animated.View style={[subheadStyle, styles.pillRow]}>
            <View style={styles.pill}>
              <Text style={styles.pillText}>Non-Custodial</Text>
            </View>
            <View style={[styles.pill, styles.pillAccent]}>
              <Text style={[styles.pillText, styles.pillAccentText]}>Solana Only</Text>
            </View>
          </Animated.View>
        </View>

        {/* Bottom buttons */}
        <Animated.View style={[styles.bottomSection, buttonsStyle]}>
          {/* Enter App — primary */}
          <TouchableOpacity style={styles.enterAppBtn} onPress={handleEnterApp} activeOpacity={0.88}>
            <LinearGradient
              colors={['#8B5CF6', '#6D28D9']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.enterAppGradient}
            >
              <Text style={styles.enterAppText}>Enter App</Text>
              <View style={styles.enterAppArrow}>
                <ChevronRight size={20} color={colors.white} strokeWidth={2.5} />
              </View>
            </LinearGradient>
          </TouchableOpacity>

          {/* Connect Wallet — outlined */}
          <TouchableOpacity
            style={styles.connectBtn}
            onPress={() => setShowConnectModal(true)}
            activeOpacity={0.85}
          >
            <Wallet size={20} color={colors.primary} strokeWidth={2} style={{ marginRight: 10 }} />
            <Text style={styles.connectBtnText}>Connect Wallet</Text>
            <View style={styles.connectArrow}>
              <ChevronRight size={18} color={colors.primary} strokeWidth={2} />
            </View>
          </TouchableOpacity>

          {/* Security badge */}
          <View style={styles.securityRow}>
            <Shield size={15} color={colors.textMuted} strokeWidth={2} />
            <View>
              <Text style={styles.securityTitle}>Your keys. Your crypto.</Text>
              <Text style={styles.securitySub}>100% non-custodial. You're always in control.</Text>
            </View>
          </View>
        </Animated.View>
      </View>

      {/* Enter App modal — Create or Import */}
      <Modal visible={showEnterModal} animationType="slide" transparent presentationStyle="overFullScreen">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowEnterModal(false)}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>
                {hasWallet ? 'Welcome Back' : 'Get Started'}
              </Text>
              <Text style={styles.modalSubtitle}>
                {hasWallet
                  ? 'Your wallet is ready. Continue to the app.'
                  : 'Create a new wallet or import an existing one.'}
              </Text>

              {hasWallet ? (
                <TouchableOpacity
                  style={styles.modalPrimaryBtn}
                  onPress={async () => {
                    setShowEnterModal(false);
                    await markOnboardingComplete();
                    console.log('[Onboarding] Navigating to /(tabs) — returning user');
                    router.replace('/(tabs)');
                  }}
                  activeOpacity={0.88}
                >
                  <LinearGradient
                    colors={['#8B5CF6', '#6D28D9']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.modalPrimaryGradient}
                  >
                    <Text style={styles.modalPrimaryText}>Continue to App</Text>
                    <ChevronRight size={20} color={colors.white} strokeWidth={2.5} />
                  </LinearGradient>
                </TouchableOpacity>
              ) : (
                <>
                  <TouchableOpacity
                    style={styles.modalPrimaryBtn}
                    onPress={async () => {
                      setShowEnterModal(false);
                      await markOnboardingComplete();
                      console.log('[Onboarding] Navigating to create wallet');
                      router.push('/onboarding/create');
                    }}
                    activeOpacity={0.88}
                  >
                    <LinearGradient
                      colors={['#8B5CF6', '#6D28D9']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.modalPrimaryGradient}
                    >
                      <Plus size={20} color={colors.white} strokeWidth={2.5} />
                      <Text style={styles.modalPrimaryText}>Create Wallet</Text>
                    </LinearGradient>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.modalSecondaryBtn}
                    onPress={async () => {
                      setShowEnterModal(false);
                      await markOnboardingComplete();
                      console.log('[Onboarding] Navigating to import wallet');
                      router.push('/onboarding/import');
                    }}
                    activeOpacity={0.85}
                  >
                    <Download size={18} color={colors.primary} strokeWidth={2} />
                    <Text style={styles.modalSecondaryText}>Import Wallet</Text>
                  </TouchableOpacity>
                </>
              )}

              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowEnterModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Connect external wallet modal */}
      <ConnectWalletModal
        visible={showConnectModal}
        onClose={() => setShowConnectModal(false)}
        onConnected={async () => {
          setShowConnectModal(false);
          await markOnboardingComplete();
          console.log('[Onboarding] External wallet connected — navigating to /(tabs)');
          router.replace('/(tabs)');
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#06060D',
  },
  bgDots: {
    position: 'absolute',
    inset: 0,
    backgroundColor: '#06060D',
  },
  glowOrb: {
    position: 'absolute',
    top: '12%',
    alignSelf: 'center',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(109, 40, 217, 0.18)',
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xxl,
  },
  topSection: {
    alignItems: 'center',
    paddingTop: Platform.OS === 'android' ? 60 : 80,
  },
  logoWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xxl,
    position: 'relative',
  },
  logoGlow: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(139, 92, 246, 0.25)',
  },
  logoImage: {
    width: 180,
    height: 180,
    borderRadius: 30,
  },
  appName: {
    fontSize: 42,
    fontWeight: '900',
    color: '#8B5CF6',
    textAlign: 'center',
    letterSpacing: 8,
    marginBottom: 4,
  },
  headline: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.white,
    textAlign: 'center',
    letterSpacing: -0.5,
    marginBottom: spacing.sm,
  },
  subheadline: {
    fontSize: fontSize.lg,
    color: colors.textSecondary,
    textAlign: 'center',
    letterSpacing: 1,
    fontWeight: '500',
  },
  subheadAccent: {
    color: '#8B5CF6',
    fontWeight: '700',
  },
  pillRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  pill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  pillAccent: {
    borderColor: 'rgba(139,92,246,0.5)',
    backgroundColor: 'rgba(139,92,246,0.1)',
  },
  pillText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  pillAccentText: {
    color: '#A78BFA',
  },
  bottomSection: {
    paddingBottom: 52,
    gap: spacing.md,
  },
  enterAppBtn: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  enterAppGradient: {
    paddingVertical: 18,
    paddingHorizontal: spacing.xxl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  enterAppText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.3,
    flex: 1,
    textAlign: 'center',
  },
  enterAppArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  connectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    paddingHorizontal: spacing.xxl,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(139,92,246,0.5)',
    backgroundColor: 'rgba(139,92,246,0.06)',
  },
  connectBtnText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  connectArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  securityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  securityTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  securitySub: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 1,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#0F0F1A',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: spacing.xxl,
    paddingBottom: 48,
    borderTopWidth: 1,
    borderTopColor: 'rgba(139,92,246,0.2)',
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'center',
    marginBottom: spacing.xl,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.white,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  modalSubtitle: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.xxl,
    lineHeight: 20,
  },
  modalPrimaryBtn: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  modalPrimaryGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 10,
    borderRadius: 14,
  },
  modalPrimaryText: {
    color: colors.white,
    fontSize: 17,
    fontWeight: '700',
  },
  modalSecondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(139,92,246,0.4)',
    backgroundColor: 'rgba(139,92,246,0.06)',
    gap: 10,
    marginBottom: spacing.md,
  },
  modalSecondaryText: {
    color: colors.white,
    fontSize: 17,
    fontWeight: '600',
  },
  modalCancelBtn: {
    alignItems: 'center',
    paddingVertical: 14,
  },
  modalCancelText: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: '600',
  },
});
