import { View, StyleSheet } from 'react-native';
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

  if (!isBasic && !isPremium) return null;

  const s = SIZES[size];

  if (isPremium) {
    return (
      <View style={[styles.wrap, { width: s.badge + 8, height: s.badge + 8 }]}>
        {/* Gold glow */}
        <View style={[styles.glow, styles.glowGold, {
          width: s.badge + 8,
          height: s.badge + 8,
          borderRadius: (s.badge + 8) / 2,
        }]} />
        {/* Gold/amber gradient badge */}
        <LinearGradient
          colors={['#F59E0B', '#D97706', '#92400E']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.badge, { width: s.badge, height: s.badge, borderRadius: s.badge / 2 }]}
        >
          <Check size={s.check} color="#fff" strokeWidth={3} />
        </LinearGradient>
        {/* Gold star */}
        <View style={[styles.star, s.starOffset]}>
          <Star size={s.star} color="#FBBF24" fill="#FBBF24" strokeWidth={0} />
        </View>
      </View>
    );
  }

  // Basic badge — blue/violet gradient
  return (
    <View style={[styles.wrap, { width: s.badge + 4, height: s.badge + 4 }]}>
      {/* Violet glow */}
      <View style={[styles.glow, styles.glowViolet, {
        width: s.badge + 4,
        height: s.badge + 4,
        borderRadius: (s.badge + 4) / 2,
      }]} />
      <LinearGradient
        colors={['#6366F1', '#8B5CF6', '#3B82F6']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.badge, { width: s.badge, height: s.badge, borderRadius: s.badge / 2 }]}
      >
        <Check size={s.check} color="#fff" strokeWidth={3} />
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
    opacity: 0.35,
  },
  glowViolet: {
    backgroundColor: '#7C3AED',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 6,
  },
  glowGold: {
    backgroundColor: '#D97706',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
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
