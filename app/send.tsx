import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, ChevronDown, Scan } from 'lucide-react-native';
import { useWallet } from '@/contexts/WalletContext';
import { colors, spacing, borderRadius, fontSize } from '@/constants/theme';

export default function SendScreen() {
  const router = useRouter();
  const { tokens, selectedAccount } = useWallet();
  const [selectedToken, setSelectedToken] = useState(tokens[0]);
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!recipient || !amount || !selectedToken) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    const amountNum = parseFloat(amount);
    const balance = parseFloat(selectedToken.balance || '0');

    if (isNaN(amountNum) || amountNum <= 0) {
      Alert.alert('Error', 'Invalid amount');
      return;
    }

    if (amountNum > balance) {
      Alert.alert('Error', 'Insufficient balance');
      return;
    }

    setSending(true);

    try {
      Alert.alert(
        'Transaction',
        'Transaction submission will be available once wallet integration is complete.',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (error) {
      Alert.alert('Error', 'An error occurred');
    } finally {
      setSending(false);
    }
  };

  const estimatedFee = '0.000025';
  const feeUSD = (parseFloat(estimatedFee) * 100).toFixed(2);

  return (
    <LinearGradient colors={colors.gradient.primary} style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <ArrowLeft size={24} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Send</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.section}>
            <Text style={styles.label}>Token</Text>
            <TouchableOpacity style={styles.tokenSelector}>
              <View style={styles.tokenIcon}>
                <Text style={styles.tokenSymbol}>
                  {selectedToken.symbol.substring(0, 2)}
                </Text>
              </View>
              <View style={styles.tokenInfo}>
                <Text style={styles.tokenName}>{selectedToken.symbol}</Text>
                <Text style={styles.tokenBalance}>
                  Balance: {selectedToken.balance}
                </Text>
              </View>
              <ChevronDown size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Recipient</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="Recipient address"
                placeholderTextColor={colors.textMuted}
                value={recipient}
                onChangeText={setRecipient}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity style={styles.scanButton}>
                <Scan size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Amount</Text>
              <TouchableOpacity
                onPress={() => setAmount(selectedToken.balance || '0')}
              >
                <Text style={styles.maxButton}>MAX</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.amountContainer}>
              <TextInput
                style={styles.amountInput}
                placeholder="0.00"
                placeholderTextColor={colors.textMuted}
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
              />
              <Text style={styles.amountSymbol}>{selectedToken.symbol}</Text>
            </View>
            {amount && (
              <Text style={styles.amountUSD}>
                ≈ ${(parseFloat(amount) * 50).toFixed(2)}
              </Text>
            )}
          </View>

          <View style={styles.feeBox}>
            <View style={styles.feeRow}>
              <Text style={styles.feeLabel}>Estimated network fee</Text>
              <View style={styles.feeValue}>
                <Text style={styles.feeAmount}>{estimatedFee} SOL</Text>
                <Text style={styles.feeUSD}>(${feeUSD})</Text>
              </View>
            </View>
            <Text style={styles.feeTime}>≈ 2-5 seconds</Text>
          </View>

          <View style={styles.totalBox}>
            <Text style={styles.totalLabel}>Total</Text>
            <View style={styles.totalValue}>
              <Text style={styles.totalAmount}>
                {amount ? (parseFloat(amount) + parseFloat(estimatedFee)).toFixed(6) : '0.00'}
              </Text>
              <Text style={styles.totalSymbol}>{selectedToken.symbol}</Text>
            </View>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[
              styles.sendButton,
              (!recipient || !amount || sending) && styles.sendButtonDisabled,
            ]}
            onPress={handleSend}
            disabled={!recipient || !amount || sending}
          >
            <Text style={styles.sendButtonText}>
              {sending ? 'Sending...' : 'Send'}
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xxl,
    paddingTop: 60,
    paddingBottom: spacing.xl,
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.xxl,
  },
  section: {
    marginBottom: spacing.xxl,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  maxButton: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  tokenSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  tokenIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.primaryMuted,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  tokenSymbol: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.primary,
  },
  tokenInfo: {
    flex: 1,
  },
  tokenName: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  tokenBalance: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg,
  },
  input: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: fontSize.md,
    paddingVertical: spacing.lg,
  },
  scanButton: {
    padding: spacing.sm,
  },
  amountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg,
  },
  amountInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: '600',
    paddingVertical: spacing.lg,
  },
  amountSymbol: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  amountUSD: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  feeBox: {
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  feeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  feeLabel: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  feeValue: {
    alignItems: 'flex-end',
  },
  feeAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  feeUSD: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  feeTime: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  totalBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
    marginBottom: spacing.xxl,
  },
  totalLabel: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  totalValue: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  totalAmount: {
    fontSize: spacing.xl,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  totalSymbol: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  footer: {
    padding: spacing.xxl,
  },
  sendButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: colors.surfaceBorder,
  },
  sendButtonText: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.white,
  },
});
