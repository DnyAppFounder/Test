import { Tabs } from 'expo-router';
import { Wallet, Users, Gamepad2, Compass, Settings } from 'lucide-react-native';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '@/constants/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import { useProfile } from '@/contexts/ProfileContext';

function BadgeIcon({ size, color, count }: { size: number; color: string; count: number }) {
  return (
    <View>
      <Users size={size} color={color} />
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
});

export default function TabLayout() {
  const { t } = useLanguage();
  const { unreadNotifCount } = useProfile();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.surfaceBorder,
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
            <Wallet size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="community"
        options={{
          title: t.tabs.community,
          tabBarIcon: ({ size, color }) => (
            <BadgeIcon size={size} color={color} count={unreadNotifCount} />
          ),
        }}
      />
      <Tabs.Screen
        name="gaming"
        options={{
          title: t.tabs.gaming,
          tabBarIcon: ({ size, color }) => (
            <Gamepad2 size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="dapps"
        options={{
          title: t.tabs.dapps,
          tabBarIcon: ({ size, color }) => (
            <Compass size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t.tabs.settings,
          tabBarIcon: ({ size, color }) => (
            <Settings size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
