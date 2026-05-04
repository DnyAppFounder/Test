import { Tabs } from 'expo-router';
import { Wallet, Globe, Gamepad2, Compass, Settings } from 'lucide-react-native';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useEffect, useRef } from 'react';
import { colors } from '@/constants/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import { useProfile } from '@/contexts/ProfileContext';

function AnimatedTabIcon({
  icon: Icon,
  size,
  color,
}: {
  icon: React.ComponentType<{ size: number; color: string; strokeWidth: number }>;
  size: number;
  color: string;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const isActive = color === colors.primary;
  const prevActive = useRef(false);

  useEffect(() => {
    if (isActive && !prevActive.current) {
      Animated.sequence([
        Animated.spring(scaleAnim, { toValue: 1.25, useNativeDriver: true, speed: 30, bounciness: 12 }),
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 6 }),
      ]).start();
    }
    prevActive.current = isActive;
  }, [isActive]);

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <Icon size={size} color={color} strokeWidth={2} />
    </Animated.View>
  );
}

function AnimatedGlobeIcon({ size, color, count }: { size: number; color: string; count: number }) {
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const isActive = color === colors.primary;
  const prevActive = useRef(false);

  useEffect(() => {
    Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 6000,
        useNativeDriver: true,
      })
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0, duration: 1500, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  useEffect(() => {
    if (isActive && !prevActive.current) {
      Animated.sequence([
        Animated.spring(scaleAnim, { toValue: 1.25, useNativeDriver: true, speed: 30, bounciness: 12 }),
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 6 }),
      ]).start();
    }
    prevActive.current = isActive;
  }, [isActive]);

  const spin = rotateAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const glowOpacity = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.5] });
  const globeColor = isActive ? '#A855F7' : color;

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      {isActive && (
        <Animated.View style={[badgeStyles.globeGlow, { opacity: glowOpacity }]} />
      )}
      <Animated.View style={{ transform: [{ rotate: isActive ? spin : '0deg' }, { scale: scaleAnim }] }}>
        <Globe size={size} color={globeColor} strokeWidth={2} />
      </Animated.View>
      {count > 0 && (
        <View style={badgeStyles.badge}>
          <Text style={badgeStyles.badgeText}>{count > 99 ? '99+' : String(count)}</Text>
        </View>
      )}
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -4,
    right: -6,
    backgroundColor: '#ef4444',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#fff',
  },
  msgBadge: {
    position: 'absolute',
    top: -4,
    left: -6,
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  globeGlow: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#A855F7',
    shadowColor: '#A855F7',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 10,
  },
});

export default function TabLayout() {
  const { t } = useLanguage();
  const { unreadNotifCount, unreadMessageCount } = useProfile();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: 'rgba(13,6,24,0.92)',
          borderTopColor: 'rgba(139,92,246,0.2)',
          borderTopWidth: 1,
          height: 64,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t.tabs.wallet,
          tabBarIcon: ({ size, color }) => (
            <AnimatedTabIcon icon={Wallet} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="community"
        options={{
          title: t.tabs.community,
          tabBarIcon: ({ size, color }) => (
            <View style={{ position: 'relative' }}>
              <AnimatedGlobeIcon size={size} color={color} count={unreadNotifCount} />
              {unreadMessageCount > 0 && (
                <View style={badgeStyles.msgBadge}>
                  <Text style={badgeStyles.badgeText}>{unreadMessageCount > 99 ? '99+' : String(unreadMessageCount)}</Text>
                </View>
              )}
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="gaming"
        options={{
          title: t.tabs.gaming,
          tabBarIcon: ({ size, color }) => (
            <AnimatedTabIcon icon={Gamepad2} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="dapps"
        options={{
          title: t.tabs.dapps,
          tabBarIcon: ({ size, color }) => (
            <AnimatedTabIcon icon={Compass} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t.tabs.settings,
          tabBarIcon: ({ size, color }) => (
            <AnimatedTabIcon icon={Settings} size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
