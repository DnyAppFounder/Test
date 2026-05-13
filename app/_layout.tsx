import '@/lib/polyfills';
import { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { WalletProvider } from '@/contexts/WalletContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { ProfileProvider } from '@/contexts/ProfileContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { SecurityProvider } from '@/contexts/SecurityContext';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { tokenRegistryService } from '@/services/tokenRegistryService';
import { NotificationBanner } from '@/components/NotificationBanner';
import { useProfile } from '@/contexts/ProfileContext';

if (Platform.OS !== 'web') {
  SplashScreen.preventAutoHideAsync().catch(() => {});
}

function InAppNotifications() {
  const { profile } = useProfile();
  return <NotificationBanner userId={profile?.id ?? null} />;
}

export default function RootLayout() {
  useFrameworkReady();
  const [appIsReady, setAppIsReady] = useState(false);

  const [fontsLoaded, fontError] = useFonts({
    'SpaceMono-Regular': require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    async function prepare() {
      try {
        if (fontsLoaded || fontError) {
          setAppIsReady(true);
          // Background token discovery — fully isolated, never crashes the app
          setTimeout(() => {
            try {
              tokenRegistryService.runBackgroundDiscovery().catch((e) => {
                console.warn('[App] Background discovery error:', e?.message);
              });
            } catch (e) {
              console.warn('[App] Background discovery threw:', e);
            }
          }, 5000);
        }
      } catch (e) {
        console.warn('Error during app preparation:', e);
        setAppIsReady(true);
      }
    }

    prepare();
  }, [fontsLoaded, fontError]);

  const onLayoutRootView = useCallback(async () => {
    if (appIsReady && Platform.OS !== 'web') {
      await SplashScreen.hideAsync().catch(() => {});
    }
  }, [appIsReady]);

  if (!appIsReady) {
    return null;
  }

  return (
    <View style={styles.root} onLayout={onLayoutRootView}>
      {/* Providers live OUTSIDE the ErrorBoundary so wallet/security/profile state
          survives a screen-level crash. Only the navigation Stack resets on Retry,
          keeping the user connected instead of forcing a full app reload. */}
      <LanguageProvider>
        <WalletProvider>
        <SecurityProvider>
          <ProfileProvider>
            <ErrorBoundary fallbackLabel="App error — please refresh">
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: styles.screenContent,
                }}
              >
                <Stack.Screen name="index" />
                <Stack.Screen name="onboarding" />
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="chat/[id]" />
                <Stack.Screen name="create-post" />
                {/* Route aliases — keep these so direct URL access doesn't 404 */}
                <Stack.Screen name="discover" />
                <Stack.Screen name="wallet" />
                <Stack.Screen name="messages" />
                <Stack.Screen name="settings" />
                <Stack.Screen name="+not-found" />
              </Stack>
              <InAppNotifications />
              <StatusBar style="light" />
            </ErrorBoundary>
          </ProfileProvider>
        </SecurityProvider>
        </WalletProvider>
      </LanguageProvider>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0D0618',
  },
  screenContent: {
    backgroundColor: '#0D0618',
  },
});
