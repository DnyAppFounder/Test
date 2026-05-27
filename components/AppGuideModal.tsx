import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView,
  useWindowDimensions, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { X, ChevronRight, Wallet, Zap, TriangleAlert as AlertTriangle, Info, Rocket, Globe } from 'lucide-react-native';
import { colors, spacing, borderRadius, fontSize, elevation } from '@/constants/theme';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const APP_GUIDE_SEEN_KEY = 'dawen:hasSeenAppIntro';

// Per-wallet key so each new wallet/account sees the guide once.
function walletGuideKey(address: string): string {
  return `dawen:${address.toLowerCase().trim()}:hasSeenAppIntro`;
}

// Mark the guide as seen for a specific wallet address.
// Falls back to the legacy global key when no address is provided (Settings reopen).
export async function markAppGuideSeen(address?: string): Promise<void> {
  if (address) {
    await AsyncStorage.setItem(walletGuideKey(address), 'true').catch(() => {});
  }
  // Always set the legacy global key for backward compat
  await AsyncStorage.setItem(APP_GUIDE_SEEN_KEY, 'true').catch(() => {});
}

// Check whether the guide has been seen for this specific wallet.
// Returns true only if the per-wallet key is set.
export async function hasSeenAppGuide(address?: string): Promise<boolean> {
  if (address) {
    const perWallet = await AsyncStorage.getItem(walletGuideKey(address)).catch(() => null);
    return perWallet === 'true';
  }
  // Fallback: global legacy key
  const val = await AsyncStorage.getItem(APP_GUIDE_SEEN_KEY).catch(() => null);
  return val === 'true';
}

// Clear the per-wallet guide seen flag so the guide will show again (used by Settings).
export async function clearAppGuideSeen(address?: string): Promise<void> {
  if (address) {
    await AsyncStorage.removeItem(walletGuideKey(address)).catch(() => {});
  }
  await AsyncStorage.removeItem(APP_GUIDE_SEEN_KEY).catch(() => {});
}

// ─── Slide definitions ───────────────────────────────────────────────────────

interface Slide {
  id: string;
  icon: React.ReactNode;
  title: string;
  body: string;
  warning?: { type: 'warning' | 'info'; text: string };
  warning2?: { type: 'warning' | 'info'; text: string };
  buttonLabel: string;
  accentColor: string;
}

const SLIDES: Slide[] = [
  {
    id: 'welcome',
    icon: null,
    title: 'Welcome to DAWEN',
    body: 'DAWEN is a Solana-powered ecosystem combining wallet tools, token discovery, social features, rewards, gaming, and token creation inside one app.',
    buttonLabel: 'Next',
    accentColor: '#60A5FA',
  },
  {
    id: 'features',
    icon: null,
    title: 'What you can do',
    body: 'With DAWEN, you can track your wallet assets, discover Solana tokens, use Dawen Pulse, earn rewards, explore Dawen World, and access launchpad tools.',
    buttonLabel: 'Next',
    accentColor: '#34D399',
  },
  {
    id: 'token_notice',
    icon: null,
    title: 'Official DAWEN Token Notice',
    body: 'The official DAWEN token has not launched yet. Any token claiming to be the official DAWEN token before the official announcement should not be trusted.',
    warning: {
      type: 'warning',
      text: 'Do not buy fake DAWEN tokens. The official DAWEN token will only be announced through official DAWEN channels.',
    },
    buttonLabel: 'I understand',
    accentColor: '#F59E0B',
  },
  {
    id: 'daworld',
    icon: null,
    title: '$DAWORLD Utility Notice',
    body: '$DAWORLD is a utility and reward token for Dawen World and selected app features. It is not the official DAWEN launch token.',
    warning: {
      type: 'info',
      text: '$DAWORLD will be used mainly for Dawen World, in-app rewards, game-related features, future boutique/shop features, and selected app utilities.',
    },
    warning2: {
      type: 'warning',
      text: 'Do not confuse $DAWORLD with the official DAWEN token. There is no reason to try to buy or accumulate a large part of the supply. $DAWORLD is mainly for app utility, rewards, gaming, and future boutique features.',
    },
    buttonLabel: 'I understand',
    accentColor: '#A78BFA',
  },
  {
    id: 'launchpad',
    icon: null,
    title: 'Launchpad Beta Notice',
    body: 'The launchpad token creation flow is functional, but the graduation program and automated liquidity system are not connected yet. For now, users should not use the launchpad for a public launch unless they understand that their token may launch with 0 liquidity and no automatic graduation.',
    warning: {
      type: 'warning',
      text: 'Until the graduation and liquidity program is connected, creators must provide their own liquidity if they want their token to trade properly.',
    },
    buttonLabel: 'I understand',
    accentColor: '#F87171',
  },
  {
    id: 'deploy',
    icon: null,
    title: 'DAWEN is preparing for deployment',
    body: 'The web version is being prepared for deployment first so early users can create accounts, test features, and help improve the ecosystem before the full app release.',
    buttonLabel: 'Enter DAWEN',
    accentColor: '#60A5FA',
  },
];

const SLIDE_ICONS: React.ReactNode[] = [
  <Wallet size={32} color="#60A5FA" strokeWidth={1.5} />,
  <Zap size={32} color="#34D399" strokeWidth={1.5} />,
  <AlertTriangle size={32} color="#F59E0B" strokeWidth={1.5} />,
  <Info size={32} color="#A78BFA" strokeWidth={1.5} />,
  <Rocket size={32} color="#F87171" strokeWidth={1.5} />,
  <Globe size={32} color="#60A5FA" strokeWidth={1.5} />,
];

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  onClose: () => void;
  walletAddress?: string;
}

export function AppGuideModal({ visible, onClose, walletAddress }: Props) {
  const [slideIndex, setSlideIndex] = useState(0);
  const { width } = useWindowDimensions();

  const slide = SLIDES[slideIndex];
  const isLast = slideIndex === SLIDES.length - 1;
  const progress = (slideIndex + 1) / SLIDES.length;

  const handleNext = useCallback(async () => {
    if (isLast) {
      await markAppGuideSeen(walletAddress);
      onClose();
      setSlideIndex(0);
    } else {
      setSlideIndex(i => i + 1);
    }
  }, [isLast, onClose, walletAddress]);

  const handleSkip = useCallback(async () => {
    await markAppGuideSeen(walletAddress);
    onClose();
    setSlideIndex(0);
  }, [onClose, walletAddress]);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={[styles.sheet, { maxWidth: Math.min(width - 32, 480) }]}>
          <LinearGradient
            colors={['rgba(18,9,31,0.98)', 'rgba(9,6,15,0.99)']}
            style={StyleSheet.absoluteFill}
          />
          {/* Glow accent */}
          <View style={[styles.glowCircle, { backgroundColor: `${slide.accentColor}18` }]} />

          {/* Header row */}
          <View style={styles.headerRow}>
            <View style={styles.stepBadge}>
              <Text style={styles.stepText}>{slideIndex + 1} / {SLIDES.length}</Text>
            </View>
            {!isLast && (
              <TouchableOpacity onPress={handleSkip} style={styles.skipBtn} activeOpacity={0.7}>
                <X size={18} color="rgba(255,255,255,0.35)" />
              </TouchableOpacity>
            )}
          </View>

          {/* Progress bar */}
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: slide.accentColor }]} />
          </View>

          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Icon */}
            <View style={[styles.iconWrap, { borderColor: `${slide.accentColor}40`, backgroundColor: `${slide.accentColor}15` }]}>
              {SLIDE_ICONS[slideIndex]}
            </View>

            {/* Title */}
            <Text style={[styles.title, { color: slide.accentColor }]}>{slide.title}</Text>

            {/* Body */}
            <Text style={styles.body}>{slide.body}</Text>

            {/* Warning/info boxes */}
            {slide.warning && (
              <View style={[
                styles.alertBox,
                slide.warning.type === 'warning' ? styles.alertWarning : styles.alertInfo,
              ]}>
                <View style={styles.alertIconRow}>
                  {slide.warning.type === 'warning'
                    ? <AlertTriangle size={14} color="#F59E0B" strokeWidth={2} />
                    : <Info size={14} color="#60A5FA" strokeWidth={2} />
                  }
                  <Text style={[
                    styles.alertText,
                    slide.warning.type === 'warning' ? styles.alertTextWarning : styles.alertTextInfo,
                  ]}>
                    {slide.warning.text}
                  </Text>
                </View>
              </View>
            )}

            {slide.warning2 && (
              <View style={[
                styles.alertBox,
                slide.warning2.type === 'warning' ? styles.alertWarning : styles.alertInfo,
              ]}>
                <View style={styles.alertIconRow}>
                  {slide.warning2.type === 'warning'
                    ? <AlertTriangle size={14} color="#F59E0B" strokeWidth={2} />
                    : <Info size={14} color="#60A5FA" strokeWidth={2} />
                  }
                  <Text style={[
                    styles.alertText,
                    slide.warning2.type === 'warning' ? styles.alertTextWarning : styles.alertTextInfo,
                  ]}>
                    {slide.warning2.text}
                  </Text>
                </View>
              </View>
            )}
          </ScrollView>

          {/* CTA button */}
          <TouchableOpacity onPress={handleNext} activeOpacity={0.85} style={styles.btnWrap}>
            <LinearGradient
              colors={[slide.accentColor, `${slide.accentColor}cc`]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.btn}
            >
              <Text style={styles.btnText}>{slide.buttonLabel}</Text>
              {!isLast && <ChevronRight size={18} color="#fff" strokeWidth={2.5} />}
            </LinearGradient>
          </TouchableOpacity>

          {/* Dot indicators */}
          <View style={styles.dots}>
            {SLIDES.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i === slideIndex
                    ? { backgroundColor: slide.accentColor, width: 20 }
                    : { backgroundColor: 'rgba(255,255,255,0.15)', width: 8 },
                ]}
              />
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  sheet: {
    width: '100%',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.25)',
    overflow: 'hidden',
    maxHeight: '90%',
    ...elevation.md,
  },
  glowCircle: {
    position: 'absolute',
    top: -80,
    right: -60,
    width: 220,
    height: 220,
    borderRadius: 110,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
  },
  stepBadge: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  stepText: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.5,
  },
  skipBtn: {
    padding: 4,
  },
  progressTrack: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginHorizontal: spacing.xl,
    borderRadius: 2,
    marginBottom: spacing.md,
  },
  progressFill: {
    height: 3,
    borderRadius: 2,
  },
  scrollArea: {
    maxHeight: 420,
  },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
    gap: spacing.lg,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginTop: spacing.sm,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  body: {
    fontSize: fontSize.md,
    color: 'rgba(255,255,255,0.75)',
    lineHeight: 22,
    textAlign: 'center',
  },
  alertBox: {
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
  },
  alertWarning: {
    backgroundColor: 'rgba(245,158,11,0.10)',
    borderColor: 'rgba(245,158,11,0.35)',
  },
  alertInfo: {
    backgroundColor: 'rgba(96,165,250,0.10)',
    borderColor: 'rgba(96,165,250,0.30)',
  },
  alertIconRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  alertText: {
    flex: 1,
    fontSize: fontSize.sm,
    lineHeight: 20,
    fontWeight: '600',
  },
  alertTextWarning: {
    color: '#FCD34D',
  },
  alertTextInfo: {
    color: '#93C5FD',
  },
  btnWrap: {
    marginHorizontal: spacing.xl,
    marginTop: spacing.md,
    borderRadius: 14,
    overflow: 'hidden',
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 16,
    borderRadius: 14,
  },
  btnText: {
    fontSize: fontSize.md,
    fontWeight: '800',
    color: '#fff',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.lg,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
});
