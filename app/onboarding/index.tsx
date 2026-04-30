import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withRepeat,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { Wallet } from 'lucide-react-native';
import { colors, spacing, borderRadius, fontSize } from '@/constants/theme';
import SkylineBackground from '@/components/SkylineBackground';
import { ConnectWalletModal } from '@/components/ConnectWalletModal';

export default function OnboardingWelcome() {
  const router = useRouter();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [showConnectModal, setShowConnectModal] = useState(false);

  const logoOpacity = useSharedValue(0);
  const logoScale = useSharedValue(0.8);
  const headlineOpacity = useSharedValue(0);
  const headlineTranslateY = useSharedValue(20);
  const subheadOpacity = useSharedValue(0);
  const buttonsOpacity = useSharedValue(0);
  const buttonsTranslateY = useSharedValue(30);
  const glowOpacity = useSharedValue(0.3);

  useEffect(() => {
    logoOpacity.value = withDelay(200, withTiming(1, { duration: 800, easing: Easing.out(Easing.cubic) }));
    logoScale.value = withDelay(200, withTiming(1, { duration: 800, easing: Easing.out(Easing.cubic) }));
    headlineOpacity.value = withDelay(600, withTiming(1, { duration: 700 }));
    headlineTranslateY.value = withDelay(600, withTiming(0, { duration: 700, easing: Easing.out(Easing.cubic) }));
    subheadOpacity.value = withDelay(900, withTiming(1, { duration: 600 }));
    buttonsOpacity.value = withDelay(1200, withTiming(1, { duration: 600 }));
    buttonsTranslateY.value = withDelay(1200, withTiming(0, { duration: 600, easing: Easing.out(Easing.cubic) }));
    glowOpacity.value = withRepeat(
      withSequence(
        withTiming(0.6, { duration: 2000 }),
        withTiming(0.3, { duration: 2000 })
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

  const subheadStyle = useAnimatedStyle(() => ({
    opacity: subheadOpacity.value,
  }));

  const buttonsStyle = useAnimatedStyle(() => ({
    opacity: buttonsOpacity.value,
    transform: [{ translateY: buttonsTranslateY.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  return (
    <View style={styles.container}>
      <View style={styles.skylineContainer}>
        <SkylineBackground width={screenWidth} height={screenHeight * 0.55} />
      </View>

      <Animated.View style={[styles.glowOrb, glowStyle]} />

      <View style={styles.content}>
        <View style={styles.topSection}>
          <Animated.View style={[styles.logoContainer, logoStyle]}>
            <LinearGradient
              colors={['#3b82f6', '#1d4ed8']}
              style={styles.logoBg}
            >
              <Text style={styles.logoText}>D</Text>
            </LinearGradient>
            <Text style={styles.appName}>DNY</Text>
          </Animated.View>

          <Animated.View style={headlineStyle}>
            <Text style={styles.headline}>Empire of Crypto</Text>
          </Animated.View>

          <Animated.View style={subheadStyle}>
            <Text style={styles.subheadline}>Trade. Post. Play. Earn.</Text>
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

        <Animated.View style={[styles.bottomSection, buttonsStyle]}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.push('/onboarding/create')}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={['#3b82f6', '#2563eb']}
              style={styles.primaryButtonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={styles.primaryButtonText}>Enter App</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => router.push('/onboarding/import')}
            activeOpacity={0.85}
          >
            <Text style={styles.secondaryButtonText}>Import Wallet</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.connectButton}
            onPress={() => setShowConnectModal(true)}
            activeOpacity={0.85}
          >
            <Wallet size={16} color={colors.textMuted} strokeWidth={2} />
            <Text style={styles.connectButtonText}>Connect Wallet</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>

      <ConnectWalletModal
        visible={showConnectModal}
        onClose={() => setShowConnectModal(false)}
        onConnected={() => router.replace('/(tabs)')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  skylineContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  glowOrb: {
    position: 'absolute',
    top: '15%',
    left: '50%',
    marginLeft: -100,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xxl,
  },
  topSection: {
    alignItems: 'center',
    paddingTop: 100,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: spacing.xxxl,
  },
  logoBg: {
    width: 80,
    height: 80,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  logoText: {
    fontSize: 40,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: -1,
  },
  appName: {
    fontSize: 36,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: 6,
  },
  headline: {
    fontSize: fontSize.hero,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
    letterSpacing: -0.5,
    marginBottom: spacing.md,
  },
  subheadline: {
    fontSize: fontSize.lg,
    color: colors.textSecondary,
    textAlign: 'center',
    letterSpacing: 2,
    fontWeight: '500',
  },
  pillRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xxl,
  },
  pill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    backgroundColor: 'rgba(15, 15, 26, 0.6)',
  },
  pillAccent: {
    borderColor: 'rgba(59, 130, 246, 0.3)',
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
  },
  pillText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  pillAccentText: {
    color: colors.primaryLight,
  },
  bottomSection: {
    paddingBottom: 48,
    gap: spacing.md,
  },
  primaryButton: {
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  primaryButtonGradient: {
    paddingVertical: 18,
    alignItems: 'center',
    borderRadius: borderRadius.md,
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: fontSize.lg,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    paddingVertical: 18,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  secondaryButtonText: {
    color: colors.textSecondary,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  connectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 14,
    borderRadius: borderRadius.md,
  },
  connectButtonText: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
});
