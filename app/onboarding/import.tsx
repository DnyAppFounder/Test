import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, CircleCheck as CheckCircle } from 'lucide-react-native';
import { colors, spacing, borderRadius, fontSize } from '@/constants/theme';
import { SecureWalletManager } from '@/lib/wallet/SecureWalletManager';
import { useWallet } from '@/contexts/WalletContext';

export default function ImportWallet() {
  const router = useRouter();
  const { forceReloadAccounts } = useWallet();
  const walletManager = SecureWalletManager.getInstance();
  const [seedPhrase, setSeedPhrase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importedAddresses, setImportedAddresses] = useState<{ blockchain: string; address: string }[]>([]);
  const [step, setStep] = useState<'input' | 'importing' | 'success'>('input');

  const handleImport = async () => {
    // BIP39 spec: normalize whitespace only, then lowercase for validation.
    // Do NOT alter the original word content — lowercasing is correct because
    // all BIP39 English wordlist words are lowercase by spec.
    const trimmed = seedPhrase.trim().toLowerCase().replace(/\s+/g, ' ');
    const words = trimmed.split(' ');

    if (words.length !== 12 && words.length !== 24) {
      setError('Please enter a valid recovery phrase (12 or 24 words)');
      return;
    }

    if (!walletManager.validateMnemonic(trimmed)) {
      setError('Invalid recovery phrase. Please check your words and try again.');
      return;
    }

    setError(null);
    setStep('importing');
    setIsImporting(true);

    try {
      const debugAddrs = await walletManager.debugDeriveAddresses(trimmed);
      console.log('[DNY Import Debug] Seed phrase word count:', words.length);
      console.log('[DNY Import Debug] Solana address:', debugAddrs.solana);

      const accounts = await walletManager.createWallet(trimmed);

      console.log('[DNY Import Debug] Created accounts:');
      accounts.forEach(a => {
        console.log(`  ${a.blockchain}: ${a.address}`);
      });

      setImportedAddresses(
        accounts.map(a => ({
          blockchain: a.blockchain,
          address: a.address,
        }))
      );
      setStep('success');
    } catch (e: any) {
      setError(e.message || 'Unable to import wallet');
      setStep('input');
    } finally {
      setIsImporting(false);
    }
  };

  if (step === 'importing') {
    return (
      <LinearGradient colors={colors.gradient.primary as any} style={styles.container}>
        <View style={styles.centeredContent}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.importingText}>Importing Wallet...</Text>
          <Text style={styles.importingSubtext}>Deriving your Solana account from recovery phrase</Text>
        </View>
      </LinearGradient>
    );
  }

  if (step === 'success') {
    return (
      <LinearGradient colors={colors.gradient.primary as any} style={styles.container}>
        <View style={styles.header}>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.successIcon}>
            <CheckCircle size={64} color={colors.success} />
          </View>

          <Text style={styles.title}>Wallet Imported Successfully</Text>
          <Text style={styles.subtitle}>
            Your Solana wallet has been restored with {importedAddresses.length} network{importedAddresses.length > 1 ? 's' : ''}
          </Text>

          <View style={styles.walletInfoCard}>
            <Text style={styles.walletInfoTitle}>Solana Wallet</Text>
            <Text style={styles.walletInfoDesc}>
              Your recovery phrase is the only key to your Solana wallet. Keep it safe.
            </Text>
          </View>

          <View style={styles.chainSection}>
            <Text style={styles.chainSectionTitle}>Available Networks</Text>
            <View style={styles.chainList}>
              {importedAddresses.map((item, idx) => (
                <View key={idx} style={styles.chainCard}>
                  <View style={styles.chainHeader}>
                    <View style={styles.chainIconBadge}>
                      <Text style={styles.chainIconText}>
                        {item.blockchain.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.chainName}>
                      {item.blockchain.charAt(0).toUpperCase() + item.blockchain.slice(1)}
                    </Text>
                  </View>
                  <Text style={styles.chainAddress} numberOfLines={1} ellipsizeMode="middle">
                    {item.address}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={async () => {
              await forceReloadAccounts();
              router.replace('/(tabs)');
            }}
          >
            <Text style={styles.primaryButtonText}>Continue to App</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={colors.gradient.primary as any} style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <ArrowLeft size={24} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>Import Solana Wallet</Text>
          <Text style={styles.subtitle}>
            Enter your recovery phrase to restore access to all your accounts
          </Text>

          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Enter your recovery phrase..."
              placeholderTextColor={colors.textMuted}
              value={seedPhrase}
              onChangeText={(text) => {
                setSeedPhrase(text);
                setError(null);
              }}
              multiline
              numberOfLines={4}
              autoCapitalize="none"
              autoCorrect={false}
              textAlignVertical="top"
            />
            <Text style={styles.wordCount}>
              {seedPhrase.trim() ? seedPhrase.trim().split(/\s+/).length : 0} words
            </Text>
          </View>

          <View style={styles.infoBox}>
            <Text style={styles.infoText}>
              Your recovery phrase will never be stored on our servers.
              It remains encrypted only on your device.
            </Text>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[
              styles.primaryButton,
              (!seedPhrase.trim() || isImporting) && styles.disabledButton,
            ]}
            onPress={handleImport}
            disabled={!seedPhrase.trim() || isImporting}
          >
            <Text style={styles.primaryButtonText}>
              {isImporting ? 'Importing...' : 'Import'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: spacing.xxl,
    paddingTop: 60,
    paddingBottom: spacing.xl,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.xxl,
  },
  centeredContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
  },
  importingText: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: spacing.xxl,
  },
  importingSubtext: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  successIcon: {
    alignItems: 'center',
    marginVertical: spacing.xxxl,
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: fontSize.lg,
    color: colors.textSecondary,
    marginBottom: spacing.xxxl,
  },
  errorBox: {
    backgroundColor: colors.errorMuted,
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: borderRadius.sm,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  errorText: {
    color: colors.error,
    fontSize: fontSize.sm,
  },
  inputContainer: {
    marginBottom: spacing.xxl,
  },
  input: {
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    color: colors.textPrimary,
    fontSize: fontSize.md,
    minHeight: 120,
  },
  wordCount: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textAlign: 'right',
    marginTop: spacing.xs,
  },
  infoBox: {
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
    borderRadius: borderRadius.sm,
    padding: spacing.lg,
  },
  infoText: {
    fontSize: fontSize.sm,
    color: colors.primaryLight,
    lineHeight: 18,
  },
  walletInfoCard: {
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    marginBottom: spacing.xxl,
  },
  walletInfoTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  walletInfoDesc: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  chainSection: {
    marginBottom: spacing.xxxl,
  },
  chainSectionTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  chainList: {
    gap: spacing.sm,
  },
  chainCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
  },
  chainHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  chainIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primaryMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chainIconText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.primary,
  },
  chainName: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  chainAddress: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontFamily: 'SpaceMono-Regular',
  },
  addressList: {
    gap: spacing.md,
    marginBottom: spacing.xxxl,
  },
  addressCard: {
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.sm,
    padding: spacing.lg,
  },
  addressChain: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  addressText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontFamily: 'SpaceMono-Regular',
  },
  footer: {
    padding: spacing.xxl,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  disabledButton: {
    backgroundColor: colors.surfaceBorder,
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
});
