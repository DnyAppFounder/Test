import { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Check, Star } from 'lucide-react-native';
import { UserProfile } from '@/services/socialService';
import { VerificationService } from '@/services/verificationService';

interface Props {
  profile: UserProfile & { verified_basic?: boolean; premium_expiration?: string | null };
  size?: 'sm' | 'md' | 'lg';
}

const SIZES = {
  sm: { badge: 16, check: 9, star: 7, starOffset: { bottom: -3, right: -3 } },
  md: { badge: 20, check: 11, star: 9, starOffset: { bottom: -4, right: -4 } },
  lg: { badge: 26, check: 14, star: 11, starOffset: { bottom: -4, right: -5 } },
};

export default function VerificationBadge({ profile, size = 'md' }: Props) {
  const isPremium = VerificationService.isPremiumActive(profile);
  const isBasic = profile.verified_basic || profile.is_verified;

  const glowAnim = useRef(new Animated.Value(0)).current;
  const checkScale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Animated checkmark pop-in on mount
    Animated.spring(checkScale, {
      toValue: 1,
      tension: 200,
      friction: 8,
      useNativeDriver: true,
    }).start();

    if (isPremium || isBasic) {
      // Pulsing glow
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
          Animated.timing(glowAnim, { toValue: 0.2, duration: 1200, useNativeDriver: true }),
        ])
      ).start();
    }
  }, [isPremium, isBasic]);

  if (!isBasic && !isPremium) return null;

  const s = SIZES[size];

  if (isPremium) {
    const glowOpacity = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.7] });

    return (
      <View style={[styles.wrap, { width: s.badge + 8, height: s.badge + 8 }]}>
        {/* Purple animated glow for premium */}
        <Animated.View style={[
          styles.glow,
          styles.glowPurple,
          {
            width: s.badge + 8,
            height: s.badge + 8,
            borderRadius: (s.badge + 8) / 2,
            opacity: glowOpacity,
          }
        ]} />
        {/* Purple gradient badge */}
        <LinearGradient
          colors={['#A855F7', '#7C3AED', '#5B21B6']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.badge, { width: s.badge, height: s.badge, borderRadius: s.badge / 2 }]}
        >
          <Animated.View style={{ transform: [{ scale: checkScale }] }}>
            <Check size={s.check} color="#fff" strokeWidth={3} />
          </Animated.View>
        </LinearGradient>
        {/* Purple star */}
        <View style={[styles.star, s.starOffset]}>
          <Star size={s.star} color="#C084FC" fill="#C084FC" strokeWidth={0} />
        </View>
      </View>
    );
  }

  // Basic badge — blue gradient with purple animated glow
  const glowOpacity = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.5] });

  return (
    <View style={[styles.wrap, { width: s.badge + 4, height: s.badge + 4 }]}>
      <Animated.View style={[
        styles.glow,
        styles.glowBlue,
        {
          width: s.badge + 4,
          height: s.badge + 4,
          borderRadius: (s.badge + 4) / 2,
          opacity: glowOpacity,
        }
      ]} />
      <LinearGradient
        colors={['#3B82F6', '#2563EB', '#1D4ED8']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.badge, { width: s.badge, height: s.badge, borderRadius: s.badge / 2 }]}
      >
        <Animated.View style={{ transform: [{ scale: checkScale }] }}>
          <Check size={s.check} color="#fff" strokeWidth={3} />
        </Animated.View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  glow: {
    position: 'absolute',
  },
  glowPurple: {
    backgroundColor: '#9333EA',
    shadowColor: '#A855F7',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 8,
  },
  glowBlue: {
    backgroundColor: '#3B82F6',
    shadowColor: '#60A5FA',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 6,
  },
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  star: {
    position: 'absolute',
  },
});
