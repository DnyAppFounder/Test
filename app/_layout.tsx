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
import { InactivityLockProvider, useInactivityLock } from '@/contexts/InactivityLockContext';
import { SessionLockOverlay } from '@/components/SessionLockOverlay';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { tokenRegistryService } from '@/services/tokenRegistryService';
import { NotificationBanner } from '@/components/NotificationBanner';
import { useProfile } from '@/contexts/ProfileContext';
import { useWallet } from '@/contexts/WalletContext';
import { savePendingReferralCode } from '@/services/referralService';

if (Platform.OS !== 'web') {
  SplashScreen.preventAutoHideAsync().catch(() => {});
}

function InAppNotifications() {
  const { profile } = useProfile();
  const { activeAddress } = useWallet();
  return <NotificationBanner userId={profile?.id ?? null} walletAddress={activeAddress} />;
}

/**
 * Wraps the entire app content in a touch-capture layer that records real user
 * activity for the inactivity lock. Uses onStartShouldSetResponder so it never
 * steals events from child components — it only observes.
 */
function ActivityCapture({ children }: { children: React.ReactNode }) {
  const { recordActivity } = useInactivityLock();
  return (
    <View
      style={StyleSheet.absoluteFill}
      // Observe start of any touch/press without consuming it
      onStartShouldSetResponder={() => { recordActivity(); return false; }}
      onMoveShouldSetResponder={() => { recordActivity(); return false; }}
    >
      {children}
    </View>
  );
}

export default function RootLayout() {
  useFrameworkReady();
  const [appIsReady, setAppIsReady] = useState(false);

  const [fontsLoaded, fontError] = useFonts({
    'SpaceMono-Regular': require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  // Capture ?ref=CODE from the URL as early as possible and persist it
  // temporarily so it survives the onboarding flow and can be auto-applied
  // once the user's wallet/profile is ready.
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        const ref = new URL(window.location.href).searchParams.get('ref');
        if (ref) {
          savePendingReferralCode(ref).catch(() => {});
        }
      } catch {}
    }
  }, []);

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
          <InactivityLockProvider>
          <ProfileProvider>
            <ErrorBoundary fallbackLabel="App error — please refresh">
              <ActivityCapture>
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
                {/* Inactivity lock overlay — only shown for internal wallets */}
                <SessionLockOverlay />
              </ActivityCapture>
            </ErrorBoundary>
          </ProfileProvider>
          </InactivityLockProvider>
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
