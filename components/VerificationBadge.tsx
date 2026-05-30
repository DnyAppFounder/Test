import { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { Check } from 'lucide-react-native';
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

  const checkScale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(checkScale, {
      toValue: 1,
      tension: 200,
      friction: 8,
      useNativeDriver: true,
    }).start();
  }, []);

  if (!isBasic && !isPremium) return null;

  const s = SIZES[size];

  if (isPremium) {
    return (
      <View style={[
        styles.badge,
        styles.premiumBadge,
        { width: s.badge, height: s.badge, borderRadius: s.badge / 2 },
      ]}>
        <Animated.View style={{ transform: [{ scale: checkScale }] }}>
          <Check size={s.check} color="#fff" strokeWidth={3} />
        </Animated.View>
      </View>
    );
  }

  return (
    <View style={[
      styles.badge,
      styles.basicBadge,
      { width: s.badge, height: s.badge, borderRadius: s.badge / 2 },
    ]}>
      <Animated.View style={{ transform: [{ scale: checkScale }] }}>
        <Check size={s.check} color="#fff" strokeWidth={3} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
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
