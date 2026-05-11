import { useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, TriangleAlert as AlertTriangle, Copy, Check, CircleCheck as CheckCircle } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { colors, spacing, borderRadius, fontSize } from '@/constants/theme';
import { SecureWalletManager } from '@/lib/wallet/SecureWalletManager';
import { useWallet } from '@/contexts/WalletContext';

export default function CreateWallet() {
  const router = useRouter();
  const { forceReloadAccounts } = useWallet();
  const walletManager = SecureWalletManager.getInstance();
  const [step, setStep] = useState<'warning' | 'display' | 'verify' | 'creating' | 'success'>('warning');
  const [seedPhrase, setSeedPhrase] = useState<string[]>([]);
  const [selectedWords, setSelectedWords] = useState<number[]>([]);
  const [verificationWords] = useState<number[]>([3, 7, 11]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createdAddresses, setCreatedAddresses] = useState<{ blockchain: string; address: string }[]>([]);

  const handleContinueFromWarning = () => {
    try {
      const mnemonic = walletManager.generateMnemonic(12);
      const words = mnemonic.trim().split(/\s+/);
      setSeedPhrase(words);
      setError(null);
      setStep('display');
    } catch (e: any) {
      setError(e.message || 'Failed to generate recovery phrase');
    }
  };

  const copyToClipboard = async (word: string, index: number) => {
    await Clipboard.setStringAsync(word);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleWordSelect = (index: number) => {
    if (selectedWords.includes(index)) {
      setSelectedWords(selectedWords.filter(i => i !== index));
    } else {
      if (selectedWords.length < verificationWords.length) {
        setSelectedWords([...selectedWords, index]);
      }
    }
  };

  const handleVerify = async () => {
    const correctOrder = verificationWords.every(
      (wordIndex, i) => selectedWords[i] === wordIndex
    );

    if (!correctOrder) {
      setError('The selected words do not match. Please try again.');
      setSelectedWords([]);
      return;
    }

    setStep('creating');
    setError(null);

    try {
      const mnemonic = seedPhrase.join(' ');
      const accounts = await walletManager.createWallet(mnemonic);

      setCreatedAddresses(
        accounts.map(a => ({
          blockchain: a.blockchain,
          address: a.address,
        }))
      );
      setStep('success');
    } catch (e: any) {
      setError(e.message || 'Failed to create wallet');
      setStep('verify');
    }
  };

  if (step === 'creating') {
    return (
      <LinearGradient colors={colors.gradient.primary as any} style={styles.container}>
        <View style={styles.centeredContent}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.creatingText}>Creating Solana Wallet...</Text>
          <Text style={styles.creatingSubtext}>Deriving your Solana account from recovery phrase</Text>
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

          <Text style={styles.title}>Wallet Created Successfully</Text>
          <Text style={styles.subtitle}>
            Your Solana wallet is ready with {createdAddresses.length} network{createdAddresses.length > 1 ? 's' : ''}
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
              {createdAddresses.map((item, idx) => (
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
              await AsyncStorage.setItem('security:wallet_type', 'created');
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

  if (step === 'warning') {
    return (
      <LinearGradient colors={colors.gradient.primary as any} style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <ArrowLeft size={24} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.warningIcon}>
            <AlertTriangle size={64} color={colors.warning} />
          </View>

          <Text style={styles.title}>Recovery Phrase</Text>
          <Text style={styles.subtitle}>
            Your recovery phrase is the key to your wallet
          </Text>

          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <View style={styles.warningBox}>
            <View style={styles.warningItem}>
              <Text style={styles.warningNumber}>1</Text>
              <Text style={styles.warningText}>
                Write down your phrase on paper and keep it in a safe place
              </Text>
            </View>
            <View style={styles.warningItem}>
              <Text style={styles.warningNumber}>2</Text>
              <Text style={styles.warningText}>
                NEVER share your phrase with anyone
              </Text>
            </View>
            <View style={styles.warningItem}>
              <Text style={styles.warningNumber}>3</Text>
              <Text style={styles.warningText}>
                If you lose your phrase, you will lose access to your funds
              </Text>
            </View>
            <View style={styles.warningItem}>
              <Text style={styles.warningNumber}>4</Text>
              <Text style={styles.warningText}>
                Do not store it on your computer or in the cloud
              </Text>
            </View>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleContinueFromWarning}
          >
            <Text style={styles.primaryButtonText}>I understand</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    );
  }

  if (step === 'display') {
    return (
      <LinearGradient colors={colors.gradient.primary as any} style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setStep('warning')}>
            <ArrowLeft size={24} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>Your Recovery Phrase</Text>
          <Text style={styles.subtitle}>
            Write down these 12 words in the exact order
          </Text>

          <View style={styles.seedContainer}>
            {seedPhrase.map((word, index) => (
              <TouchableOpacity
                key={index}
                style={styles.seedWord}
                onPress={() => copyToClipboard(word, index)}
              >
                <Text style={styles.seedNumber}>{index + 1}</Text>
                <Text style={styles.seedText}>{word}</Text>
                {copiedIndex === index ? (
                  <Check size={16} color={colors.success} />
                ) : (
                  <Copy size={16} color={colors.textMuted} />
                )}
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.alertBox}>
            <AlertTriangle size={20} color={colors.warning} />
            <Text style={styles.alertText}>
              No one from DNY will ever ask you for this phrase
            </Text>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => {
              setSelectedWords([]);
              setError(null);
              setStep('verify');
            }}
          >
            <Text style={styles.primaryButtonText}>I've written down my phrase</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={colors.gradient.primary as any} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setStep('display')}>
          <ArrowLeft size={24} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Verification</Text>
        <Text style={styles.subtitle}>
          Select the words in the requested order
        </Text>

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <View style={styles.verificationInfo}>
          {verificationWords.map((wordIndex, i) => (
            <View key={i} style={styles.verificationSlot}>
              <Text style={styles.verificationLabel}>Word #{wordIndex + 1}</Text>
              {selectedWords[i] !== undefined && (
                <Text style={styles.verificationWord}>
                  {seedPhrase[selectedWords[i]]}
                </Text>
              )}
            </View>
          ))}
        </View>

        <View style={styles.wordGrid}>
          {seedPhrase.map((word, index) => {
            const isSelected = selectedWords.includes(index);
            const isRequired = verificationWords.includes(index);

            if (!isRequired) return null;

            return (
              <TouchableOpacity
                key={index}
                style={[
                  styles.selectableWord,
                  isSelected && styles.selectedWord,
                ]}
                onPress={() => handleWordSelect(index)}
                disabled={isSelected && selectedWords.indexOf(index) < selectedWords.length - 1}
              >
                <Text
                  style={[
                    styles.selectableWordText,
                    isSelected && styles.selectedWordText,
                  ]}
                >
                  {word}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.primaryButton,
            selectedWords.length !== verificationWords.length && styles.disabledButton,
          ]}
          onPress={handleVerify}
          disabled={selectedWords.length !== verificationWords.length}
        >
          <Text style={styles.primaryButtonText}>Verify & Create Wallet</Text>
        </TouchableOpacity>
      </View>
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
  creatingText: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: spacing.xxl,
  },
  creatingSubtext: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  warningIcon: {
    alignItems: 'center',
    marginVertical: spacing.xxxl,
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
  warningBox: {
    gap: spacing.xl,
    marginBottom: spacing.xxxl,
  },
  warningItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.lg,
  },
  warningNumber: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.primary,
    color: colors.white,
    fontSize: fontSize.lg,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 32,
  },
  warningText: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  seedContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.xxl,
  },
  seedWord: {
    width: '47%',
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.sm,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  seedNumber: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '600',
  },
  seedText: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  alertBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.warningMuted,
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: borderRadius.sm,
    padding: spacing.lg,
    marginBottom: spacing.xxxl,
  },
  alertText: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.warning,
    lineHeight: 18,
  },
  verificationInfo: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.xxxl,
  },
  verificationSlot: {
    flex: 1,
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.sm,
    padding: spacing.md,
    minHeight: 60,
  },
  verificationLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  verificationWord: {
    fontSize: fontSize.md,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  wordGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.xxxl,
  },
  selectableWord: {
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  selectedWord: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  selectableWordText: {
    fontSize: fontSize.md,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  selectedWordText: {
    color: colors.white,
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
