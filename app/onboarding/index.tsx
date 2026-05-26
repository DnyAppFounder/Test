import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Image,
  ScrollView,
  Linking,
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
import { Wallet, ChevronRight, Plus, Download, Shield, Lock, Key } from 'lucide-react-native';
import { colors, spacing, borderRadius, fontSize } from '@/constants/theme';
import { ConnectWalletModal } from '@/components/ConnectWalletModal';
import { SecureWalletManager } from '@/lib/wallet/SecureWalletManager';

const ONBOARDING_KEY = 'onboarding_completed';

// ─── Animated particle dot ───────────────────────────────────────────────────

function Particle({ x, y, delay, size }: { x: number; y: number; delay: number; size: number }) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(0);

  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(0.6, { duration: 2000, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: 1500, easing: Easing.inOut(Easing.quad) })
        ),
        -1,
        false
      )
    );
    translateY.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(-12, { duration: 2500, easing: Easing.inOut(Easing.quad) }),
          withTiming(4, { duration: 2000, easing: Easing.inOut(Easing.quad) })
        ),
        -1,
        true
      )
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View
      style={[style, {
        position: 'absolute',
        left: x,
        top: y,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: '#8B5CF6',
      }]}
    />
  );
}

const PARTICLES = [
  { x: 40, y: 120, delay: 0, size: 3 },
  { x: 80, y: 200, delay: 300, size: 2 },
  { x: 20, y: 350, delay: 800, size: 4 },
  { x: 330, y: 150, delay: 200, size: 3 },
  { x: 350, y: 280, delay: 600, size: 2 },
  { x: 310, y: 420, delay: 1100, size: 3 },
  { x: 60, y: 500, delay: 500, size: 2 },
  { x: 300, y: 560, delay: 900, size: 4 },
  { x: 150, y: 600, delay: 1400, size: 2 },
  { x: 240, y: 80, delay: 700, size: 3 },
];

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function OnboardingWelcome() {
  const router = useRouter();
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [showEnterModal, setShowEnterModal] = useState(false);
  const [hasWallet, setHasWallet] = useState<boolean | null>(null);
  const [discordTooltip, setDiscordTooltip] = useState(false);

  const logoOpacity = useSharedValue(0);
  const logoScale = useSharedValue(0.85);
  const headlineOpacity = useSharedValue(0);
  const headlineTranslateY = useSharedValue(24);
  const subheadOpacity = useSharedValue(0);
  const buttonsOpacity = useSharedValue(0);
  const buttonsTranslateY = useSharedValue(30);
  const glow1Opacity = useSharedValue(0.3);
  const glow2Opacity = useSharedValue(0.15);

  useEffect(() => {
    logoOpacity.value = withDelay(150, withTiming(1, { duration: 800, easing: Easing.out(Easing.cubic) }));
    logoScale.value = withDelay(150, withTiming(1, { duration: 800, easing: Easing.out(Easing.cubic) }));
    headlineOpacity.value = withDelay(550, withTiming(1, { duration: 700 }));
    headlineTranslateY.value = withDelay(550, withTiming(0, { duration: 700, easing: Easing.out(Easing.cubic) }));
    subheadOpacity.value = withDelay(850, withTiming(1, { duration: 600 }));
    buttonsOpacity.value = withDelay(1100, withTiming(1, { duration: 600 }));
    buttonsTranslateY.value = withDelay(1100, withTiming(0, { duration: 600, easing: Easing.out(Easing.cubic) }));
    glow1Opacity.value = withRepeat(
      withSequence(withTiming(0.65, { duration: 2400 }), withTiming(0.25, { duration: 2400 })),
      -1, true
    );
    glow2Opacity.value = withDelay(1200, withRepeat(
      withSequence(withTiming(0.35, { duration: 3000 }), withTiming(0.1, { duration: 3000 })),
      -1, true
    ));
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
  const glow1Style = useAnimatedStyle(() => ({ opacity: glow1Opacity.value }));
  const glow2Style = useAnimatedStyle(() => ({ opacity: glow2Opacity.value }));

  const markOnboardingComplete = useCallback(async () => {
    try {
      await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    } catch {}
  }, []);

  const handleEnterApp = useCallback(async () => {
    const walletManager = SecureWalletManager.getInstance();
    const accts = await walletManager.getAccounts().catch(() => []);
    setHasWallet(accts.length > 0);
    setShowEnterModal(true);
  }, []);

  const openLink = (url: string) => {
    Linking.openURL(url).catch(() => {});
  };

  return (
    <View style={styles.container}>
      {/* Background gradient */}
      <LinearGradient
        colors={['#06060D', '#0D0620', '#06060D']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Glow orbs */}
      <Animated.View style={[styles.glowOrb1, glow1Style]} />
      <Animated.View style={[styles.glowOrb2, glow2Style]} />

      {/* Particles */}
      {PARTICLES.map((p, i) => <Particle key={i} {...p} />)}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* ── Hero ── */}
        <View style={styles.hero}>
          <Animated.View style={[styles.logoWrap, logoStyle]}>
            <View style={styles.logoGlowRing} />
            <View style={styles.logoContainer}>
              <Image
                source={require('../../dawenlogo.jpeg')}
                style={styles.logoImage}
                resizeMode="contain"
              />
            </View>
          </Animated.View>

          <Animated.View style={headlineStyle}>
            <Text style={styles.appName}>DAWEN</Text>
            <Text style={styles.headline}>Empire of Crypto</Text>
          </Animated.View>

          <Animated.View style={subheadStyle}>
            <Text style={styles.subheadline}>
              Trade. Post. <Text style={styles.subheadAccent}>Play. Earn.</Text>
            </Text>
            <Text style={styles.description}>
              One app for Solana trading, social rewards, and Dawen World.
            </Text>
          </Animated.View>

          <Animated.View style={[subheadStyle, styles.badgeRow]}>
            <View style={styles.badge}>
              <Shield size={10} color="#A78BFA" strokeWidth={2.5} />
              <Text style={styles.badgeText}>Non-Custodial</Text>
            </View>
            <View style={[styles.badge, styles.badgeAccent]}>
              <Text style={styles.badgeTextAccent}>Solana Only</Text>
            </View>
            <View style={[styles.badge, styles.badgeBeta]}>
              <Text style={styles.badgeTextBeta}>Web Beta</Text>
            </View>
          </Animated.View>
        </View>

        {/* ── CTA Buttons ── */}
        <Animated.View style={[styles.ctaSection, buttonsStyle]}>
          <TouchableOpacity style={styles.enterAppBtn} onPress={handleEnterApp} activeOpacity={0.88}>
            <LinearGradient
              colors={['#9333EA', '#6D28D9']}
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

          <TouchableOpacity
            style={styles.connectBtn}
            onPress={() => setShowConnectModal(true)}
            activeOpacity={0.85}
          >
            <Wallet size={20} color="#A78BFA" strokeWidth={2} style={{ marginRight: 10 }} />
            <Text style={styles.connectBtnText}>Connect Wallet</Text>
            <View style={styles.connectArrow}>
              <ChevronRight size={18} color="#A78BFA" strokeWidth={2} />
            </View>
          </TouchableOpacity>

          {/* Security card */}
          <View style={styles.securityCard}>
            <LinearGradient
              colors={['rgba(139,92,246,0.10)', 'rgba(109,40,217,0.04)']}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.securityHeader}>
              <View style={styles.securityIconWrap}>
                <Shield size={18} color="#8B5CF6" strokeWidth={2} />
              </View>
              <View style={styles.securityHeaderText}>
                <Text style={styles.securityTitle}>Your keys. Your crypto.</Text>
                <Text style={styles.securitySub}>100% non-custodial. You're always in control.</Text>
              </View>
            </View>
            <View style={styles.trustRow}>
              <TrustPoint icon={<Lock size={11} color="#A78BFA" strokeWidth={2.5} />} label="No seed stored" />
              <TrustPoint icon={<Key size={11} color="#A78BFA" strokeWidth={2.5} />} label="PIN protected" />
              <TrustPoint icon={<Shield size={11} color="#A78BFA" strokeWidth={2.5} />} label="You stay in control" />
            </View>
          </View>

          {/* Legal */}
          <Text style={styles.legalText}>
            By continuing, you agree to DAWEN's{' '}
            <Text style={styles.legalLink} onPress={() => openLink('/terms')}>Terms of Service</Text>
            {' '}and{' '}
            <Text style={styles.legalLink} onPress={() => openLink('/privacy')}>Privacy Policy</Text>.
          </Text>
        </Animated.View>

        {/* ── Footer ── */}
        <Animated.View style={[styles.footer, subheadStyle]}>
          <View style={styles.footerDivider} />

          {/* Social icons */}
          <View style={styles.socialRow}>
            <TouchableOpacity
              style={styles.socialBtn}
              onPress={() => openLink('https://t.me/WillOfDCrew')}
              activeOpacity={0.75}
            >
              <TelegramIcon />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.socialBtn}
              onPress={() => openLink('https://x.com/willoffd_?s=21')}
              activeOpacity={0.75}
            >
              <XIcon />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.socialBtn, styles.socialBtnDisabled]}
              onPress={() => setDiscordTooltip(v => !v)}
              activeOpacity={0.7}
            >
              <DiscordIcon muted />
              {discordTooltip && (
                <View style={styles.tooltip}>
                  <Text style={styles.tooltipText}>Discord coming soon</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* Footer links */}
          <View style={styles.footerLinks}>
            <TouchableOpacity onPress={() => openLink('/privacy')} activeOpacity={0.7}>
              <Text style={styles.footerLink}>Privacy Policy</Text>
            </TouchableOpacity>
            <View style={styles.footerDot} />
            <TouchableOpacity onPress={() => openLink('/terms')} activeOpacity={0.7}>
              <Text style={styles.footerLink}>Terms of Service</Text>
            </TouchableOpacity>
            <View style={styles.footerDot} />
            <TouchableOpacity onPress={() => openLink('mailto:support@dawen.app')} activeOpacity={0.7}>
              <Text style={styles.footerLink}>Support</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.footerBrand}>dawen.app</Text>
        </Animated.View>
      </ScrollView>

      {/* ── Enter App Modal ── */}
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
                    router.replace('/(tabs)');
                  }}
                  activeOpacity={0.88}
                >
                  <LinearGradient
                    colors={['#9333EA', '#6D28D9']}
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
                    onPress={() => {
                      setShowEnterModal(false);
                      router.push('/onboarding/create');
                    }}
                    activeOpacity={0.88}
                  >
                    <LinearGradient
                      colors={['#9333EA', '#6D28D9']}
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
                    onPress={() => {
                      setShowEnterModal(false);
                      router.push('/onboarding/import');
                    }}
                    activeOpacity={0.85}
                  >
                    <Download size={18} color="#A78BFA" strokeWidth={2} />
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

      {/* ── Connect external wallet modal ── */}
      <ConnectWalletModal
        visible={showConnectModal}
        onClose={() => setShowConnectModal(false)}
        onConnected={async () => {
          setShowConnectModal(false);
          await AsyncStorage.setItem('security:wallet_type', 'external');
          await markOnboardingComplete();
          router.replace('/(tabs)');
        }}
      />
    </View>
  );
}

// ─── Small helper components ──────────────────────────────────────────────────

function TrustPoint({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <View style={styles.trustPoint}>
      {icon}
      <Text style={styles.trustPointText}>{label}</Text>
    </View>
  );
}

function TelegramIcon() {
  return (
    <View style={[styles.socialIconWrap, { borderColor: 'rgba(42,174,241,0.4)', backgroundColor: 'rgba(42,174,241,0.08)' }]}>
      <Text style={[styles.socialIconText, { color: '#2AAEF1' }]}>TG</Text>
    </View>
  );
}

function XIcon() {
  return (
    <View style={[styles.socialIconWrap, { borderColor: 'rgba(255,255,255,0.25)', backgroundColor: 'rgba(255,255,255,0.06)' }]}>
      <Text style={[styles.socialIconText, { color: '#fff', fontWeight: '900' }]}>𝕏</Text>
    </View>
  );
}

function DiscordIcon({ muted }: { muted?: boolean }) {
  return (
    <View style={[styles.socialIconWrap, { borderColor: muted ? 'rgba(255,255,255,0.1)' : 'rgba(88,101,242,0.4)', backgroundColor: muted ? 'rgba(255,255,255,0.03)' : 'rgba(88,101,242,0.08)' }]}>
      <Text style={[styles.socialIconText, { color: muted ? 'rgba(255,255,255,0.25)' : '#5865F2' }]}>DC</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#06060D',
  },
  scroll: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },

  // Glow orbs
  glowOrb1: {
    position: 'absolute',
    top: '8%',
    alignSelf: 'center',
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: 'rgba(109,40,217,0.15)',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 80,
  },
  glowOrb2: {
    position: 'absolute',
    top: '55%',
    right: -60,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(168,85,247,0.10)',
  },

  // Hero
  hero: {
    alignItems: 'center',
    paddingTop: Platform.OS === 'android' ? 64 : 80,
    paddingBottom: 32,
    gap: 16,
  },
  logoWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    position: 'relative',
  },
  logoGlowRing: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.3)',
    backgroundColor: 'rgba(139,92,246,0.08)',
  },
  logoContainer: {
    width: 140,
    height: 140,
    borderRadius: 32,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(139,92,246,0.4)',
    backgroundColor: '#0D0620',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  appName: {
    fontSize: 46,
    fontWeight: '900',
    color: '#9333EA',
    textAlign: 'center',
    letterSpacing: 10,
    marginBottom: 2,
    textShadowColor: 'rgba(147,51,234,0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  headline: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.white,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  subheadline: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    letterSpacing: 0.8,
    fontWeight: '500',
  },
  subheadAccent: {
    color: '#C084FC',
    fontWeight: '700',
  },
  description: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 8,
    paddingHorizontal: 16,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    marginTop: 4,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.3)',
    backgroundColor: 'rgba(167,139,250,0.07)',
  },
  badgeAccent: {
    borderColor: 'rgba(147,51,234,0.5)',
    backgroundColor: 'rgba(147,51,234,0.12)',
  },
  badgeBeta: {
    borderColor: 'rgba(6,182,212,0.4)',
    backgroundColor: 'rgba(6,182,212,0.07)',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#A78BFA',
    letterSpacing: 0.3,
  },
  badgeTextAccent: {
    fontSize: 11,
    fontWeight: '700',
    color: '#C084FC',
    letterSpacing: 0.3,
  },
  badgeTextBeta: {
    fontSize: 11,
    fontWeight: '600',
    color: '#22D3EE',
    letterSpacing: 0.3,
  },

  // CTA section
  ctaSection: {
    gap: 12,
    paddingBottom: 24,
  },
  enterAppBtn: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  enterAppGradient: {
    paddingVertical: 18,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
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
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  connectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    paddingHorizontal: 24,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(139,92,246,0.45)',
    backgroundColor: 'rgba(139,92,246,0.07)',
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
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Security card
  securityCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.2)',
    overflow: 'hidden',
    padding: 16,
    gap: 12,
    marginTop: 4,
  },
  securityHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  securityIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(139,92,246,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  securityHeaderText: { flex: 1 },
  securityTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.white,
    marginBottom: 2,
  },
  securitySub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    lineHeight: 17,
  },
  trustRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
    paddingLeft: 48,
  },
  trustPoint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(167,139,250,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.18)',
  },
  trustPointText: {
    fontSize: 11,
    color: '#A78BFA',
    fontWeight: '600',
  },

  // Legal
  legalText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
    textAlign: 'center',
    lineHeight: 17,
    paddingHorizontal: 8,
  },
  legalLink: {
    color: 'rgba(167,139,250,0.7)',
    textDecorationLine: 'underline',
  },

  // Footer
  footer: {
    paddingTop: 8,
    paddingBottom: 48,
    alignItems: 'center',
    gap: 16,
  },
  footerDivider: {
    height: 1,
    width: '60%',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 1,
  },
  socialRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  socialBtn: {
    position: 'relative',
  },
  socialBtnDisabled: {
    opacity: 0.6,
  },
  socialIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  socialIconText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  tooltip: {
    position: 'absolute',
    bottom: 50,
    left: '50%',
    transform: [{ translateX: -56 }],
    width: 112,
    backgroundColor: '#1A1A2E',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.3)',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  tooltipText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '600',
    textAlign: 'center',
  },
  footerLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  footerLink: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    fontWeight: '500',
  },
  footerDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  footerBrand: {
    fontSize: 10,
    color: 'rgba(139,92,246,0.4)',
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#0F0A1E',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 28,
    paddingBottom: 52,
    borderTopWidth: 1,
    borderTopColor: 'rgba(139,92,246,0.25)',
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.white,
    textAlign: 'center',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 20,
  },
  modalPrimaryBtn: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 12,
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
    backgroundColor: 'rgba(139,92,246,0.07)',
    gap: 10,
    marginBottom: 12,
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
    color: 'rgba(255,255,255,0.4)',
    fontSize: 15,
    fontWeight: '600',
  },
});
