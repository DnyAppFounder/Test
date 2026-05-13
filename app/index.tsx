import { useState, useEffect } from 'react';
import { Redirect } from 'expo-router';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SecureWalletManager } from '@/lib/wallet/SecureWalletManager';

export default function Index() {
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    async function resolve() {
      try {
        // Primary: route to tabs if any managed wallet exists
        const accounts = await SecureWalletManager.getInstance().getAccounts();
        if (accounts.length > 0) {
          console.log('[App] accounts found:', accounts.length, '→ /(tabs)');
          setTarget('/(tabs)');
          return;
        }
        // Fallback: external/connected wallets may not appear in SecureWalletManager;
        // honour the legacy key so those users aren't dropped back to onboarding.
        const completed = await AsyncStorage.getItem('onboarding_completed');
        if (completed === 'true') {
          console.log('[App] onboarding_completed = true (external wallet) → /(tabs)');
          setTarget('/(tabs)');
          return;
        }
        console.log('[App] No wallet found → /onboarding');
        setTarget('/onboarding');
      } catch (err) {
        console.warn('[App] routing check failed:', err);
        setTarget('/onboarding');
      }
    }
    resolve();
  }, []);

  if (target) {
    return <Redirect href={target as any} />;
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#3b82f6" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#06060c',
  },
});
