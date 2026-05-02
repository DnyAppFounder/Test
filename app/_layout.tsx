import '@/lib/polyfills';
import { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { WalletProvider } from '@/contexts/WalletContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { ProfileProvider } from '@/contexts/ProfileContext';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  useFrameworkReady();

  const [fontsLoaded, fontError] = useFonts({
    'SpaceMono-Regular': require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <View style={styles.root}>
      <LanguageProvider>
        <WalletProvider>
          <ProfileProvider>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: styles.screenContent,
              }}
            >
              <Stack.Screen name="index" />
              <Stack.Screen name="onboarding/index" />
              <Stack.Screen name="onboarding/create" />
              <Stack.Screen name="onboarding/import" />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="chat/[id]" />
              <Stack.Screen name="create-post" />
              <Stack.Screen name="+not-found" />
            </Stack>
            <StatusBar style="light" />
          </ProfileProvider>
        </WalletProvider>
      </LanguageProvider>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#06060c',
  },
  screenContent: {
    backgroundColor: '#06060c',
  },
});
