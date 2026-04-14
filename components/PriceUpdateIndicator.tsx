import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { TrendingUp, TrendingDown } from 'lucide-react-native';
import { colors, spacing, fontSize, borderRadius } from '@/constants/theme';

interface PriceUpdateIndicatorProps {
  price: number;
  change?: number;
  isUpdating?: boolean;
  compact?: boolean;
}

export function PriceUpdateIndicator({
  price,
  change = 0,
  isUpdating = false,
  compact = false,
}: PriceUpdateIndicatorProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (change !== 0) {
      Animated.sequence([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.delay(2000),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [change]);

  useEffect(() => {
    if (isUpdating) {
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 1.05,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isUpdating]);

  const isPositive = change > 0;
  const isNegative = change < 0;

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.priceContainer, { transform: [{ scale: scaleAnim }] }]}>
        <Text style={[styles.price, compact && styles.priceCompact]}>
          ${price.toFixed(price < 1 ? 6 : 2)}
        </Text>
      </Animated.View>

      {(isPositive || isNegative) && (
        <Animated.View
          style={[
            styles.changeIndicator,
            isPositive ? styles.changePositive : styles.changeNegative,
            { opacity: fadeAnim },
          ]}
        >
          {isPositive ? (
            <TrendingUp size={14} color={colors.success} strokeWidth={2.5} />
          ) : (
            <TrendingDown size={14} color={colors.error} strokeWidth={2.5} />
          )}
          <Text
            style={[
              styles.changeText,
              isPositive ? styles.changeTextPositive : styles.changeTextNegative,
            ]}
          >
            {isPositive ? '+' : ''}
            {change.toFixed(2)}%
          </Text>
        </Animated.View>
      )}

      {isUpdating && (
        <View style={styles.updatingDot} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  price: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  priceCompact: {
    fontSize: fontSize.lg,
  },
  changeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  changePositive: {
    backgroundColor: colors.successMuted,
  },
  changeNegative: {
    backgroundColor: colors.errorMuted,
  },
  changeText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  changeTextPositive: {
    color: colors.success,
  },
  changeTextNegative: {
    color: colors.error,
  },
  updatingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
});
