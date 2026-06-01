import { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { Check, Crown } from 'lucide-react-native';
import { UserProfile } from '@/services/socialService';
import { VerificationService } from '@/services/verificationService';

interface Props {
  profile: UserProfile & { verified_basic?: boolean; premium_expiration?: string | null };
  size?: 'sm' | 'md' | 'lg';
}

const SIZES = {
  sm: { badge: 16, check: 9 },
  md: { badge: 20, check: 11 },
  lg: { badge: 26, check: 14 },
};

export default function VerificationBadge({ profile, size = 'md' }: Props) {
  const isPremium = VerificationService.isPremiumActive(profile);
  const isBasic = profile.verified_basic || profile.is_verified;
  const isFounder = !!(profile as any).is_founder;

  const checkScale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(checkScale, {
      toValue: 1,
      tension: 200,
      friction: 8,
      useNativeDriver: true,
    }).start();
  }, []);

  if (!isBasic && !isPremium && !isFounder) return null;

  const s = SIZES[size];

  const crownBadge = isFounder ? (
    <View style={[styles.badge, styles.founderBadge, { width: s.badge, height: s.badge, borderRadius: s.badge / 2 }]}>
      <Animated.View style={{ transform: [{ scale: checkScale }] }}>
        <Crown size={s.check} color="#fff" strokeWidth={3} />
      </Animated.View>
    </View>
  ) : null;

  const checkBadge = (isPremium || isBasic) ? (
    <View style={[
      styles.badge,
      isPremium ? styles.premiumBadge : styles.basicBadge,
      { width: s.badge, height: s.badge, borderRadius: s.badge / 2 },
    ]}>
      <Animated.View style={{ transform: [{ scale: checkScale }] }}>
        <Check size={s.check} color="#fff" strokeWidth={3} />
      </Animated.View>
    </View>
  ) : null;

  if (isFounder && (isPremium || isBasic)) {
    return (
      <View style={[styles.row, { gap: 4 }]}>
        {crownBadge}
        {checkBadge}
      </View>
    );
  }

  return crownBadge ?? checkBadge;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  founderBadge: {
    backgroundColor: '#D97706',
    borderWidth: 1.5,
    borderColor: '#F59E0B',
  },
  premiumBadge: {
    backgroundColor: '#7C3AED',
    borderWidth: 1.5,
    borderColor: '#A855F7',
  },
  basicBadge: {
    backgroundColor: '#2563EB',
    borderWidth: 1.5,
    borderColor: '#3B82F6',
  },
});
