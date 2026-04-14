import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, CreditCard, Building2, ChevronDown, Info } from 'lucide-react-native';
import { useWallet } from '@/contexts/WalletContext';
import { AssetsService } from '@/services/assetsService';
import { colors, spacing, borderRadius, fontSize } from '@/constants/theme';

type PaymentMethod = 'card' | 'bank';

const TOKENS = [
  { id: 'd09e8c0c-fcbd-462a-8678-76b909099714', symbol: 'SOL', name: 'Solana', price: 142.50 },
  { id: 'bb871a99-c4c2-4cac-a5a7-f0af1b9d09d3', symbol: 'ETH', name: 'Ethereum', price: 3450.00 },
  { id: '32bab46d-24e3-4f41-b0d7-da07f070577c', symbol: 'MATIC', name: 'Polygon', price: 0.85 },
  { id: 'd6e4a47c-f050-4935-a17e-be50f8390ccb', symbol: 'USDC', name: 'USD Coin', price: 1.00 },
];

export default function BuyScreen() {
  const router = useRouter();
  const { selectedAccount, refreshWallet, refreshPortfolio } = useWallet();
  const [amount, setAmount] = useState('');
  const [selectedToken, setSelectedToken] = useState(TOKENS[0]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('card');
  const [showTokenPicker, setShowTokenPicker] = useState(false);
  const [step, setStep] = useState<'input' | 'confirm' | 'done'>('input');

  const amountNum = parseFloat(amount) || 0;
  const tokenAmount = amountNum > 0 ? (amountNum / selectedToken.price).toFixed(6) : '0';
  const fee = (amountNum * 0.015).toFixed(2);
  const total = (amountNum + parseFloat(fee)).toFixed(2);

  const quickAmounts = [25, 50, 100, 250, 500];

  const handleConfirmPurchase = async () => {
    if (!selectedAccount?.address) {
      console.error('No wallet address');
      return;
    }

    try {
      const tokenQty = parseFloat(tokenAmount);

      await AssetsService.recordTransaction(
        selectedAccount.address,
        selectedToken.id,
        'buy',
        tokenQty,
        selectedToken.price,
        {
          fee: parseFloat(fee),
          status: 'completed',
          notes: `Simulated purchase via ${paymentMethod}`,
        }
      );

      setStep('done');
      await refreshWallet();
      await refreshPortfolio();
    } catch (error) {
      console.error('Failed to record purchase:', error);
      alert('Failed to record purchase. Please try again.');
    }
  };

  if (step === 'done') {
    return (
      <LinearGradient colors={colors.gradient.primary as any} style={styles.container}>
        <View style={styles.doneContainer}>
          <View style={styles.doneIcon}>
            <Text style={styles.doneIconText}>OK</Text>
          </View>
          <Text style={styles.doneTitle}>Purchase Submitted</Text>
          <Text style={styles.doneSubtitle}>
            Your order for {tokenAmount} {selectedToken.symbol} has been submitted.
          </Text>
          <View style={styles.doneDetails}>
            <View style={styles.doneRow}>
              <Text style={styles.doneLabel}>Amount</Text>
              <Text style={styles.doneValue}>${amount}</Text>
            </View>
            <View style={styles.doneRow}>
              <Text style={styles.doneLabel}>Token</Text>
              <Text style={styles.doneValue}>{tokenAmount} {selectedToken.symbol}</Text>
            </View>
            <View style={styles.doneRow}>
              <Text style={styles.doneLabel}>Status</Text>
              <View style={styles.statusBadge}>
                <Text style={styles.statusText}>SIMULATED</Text>
              </View>
            </View>
          </View>
          <View style={styles.mockNotice}>
            <Info size={16} color={colors.warning} />
            <Text style={styles.mockNoticeText}>
              This is a simulated purchase. No real payment is processed. Fiat on-ramp integration coming soon.
            </Text>
          </View>
          <TouchableOpacity
            style={styles.doneButton}
            onPress={async () => {
              await refreshWallet();
              await refreshPortfolio();
              router.back();
            }}
          >
            <Text style={styles.doneButtonText}>Return to Wallet</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    );
  }

  if (step === 'confirm') {
    return (
      <LinearGradient colors={colors.gradient.primary as any} style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setStep('input')}>
            <ArrowLeft size={24} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Confirm Purchase</Text>
          <View style={{ width: 24 }} />
        </View>
        <ScrollView style={styles.confirmContent}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmLabel}>You pay</Text>
            <Text style={styles.confirmAmount}>${amount}</Text>
          </View>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmLabel}>You receive</Text>
            <Text style={styles.confirmAmount}>{tokenAmount} {selectedToken.symbol}</Text>
          </View>
          <View style={styles.breakdownCard}>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Token Price</Text>
              <Text style={styles.breakdownValue}>${selectedToken.price.toLocaleString()}</Text>
            </View>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Network Fee (1.5%)</Text>
              <Text style={styles.breakdownValue}>${fee}</Text>
            </View>
            <View style={[styles.breakdownRow, styles.breakdownRowTotal]}>
              <Text style={styles.breakdownTotalLabel}>Total</Text>
              <Text style={styles.breakdownTotalValue}>${total}</Text>
            </View>
          </View>
          <View style={styles.breakdownCard}>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Payment</Text>
              <Text style={styles.breakdownValue}>{paymentMethod === 'card' ? 'Credit/Debit Card' : 'Bank Transfer'}</Text>
            </View>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Destination</Text>
              <Text style={styles.breakdownValue} numberOfLines={1}>
                {selectedAccount?.address?.slice(0, 12)}...
              </Text>
            </View>
          </View>
          <View style={styles.mockNotice}>
            <Info size={16} color={colors.warning} />
            <Text style={styles.mockNoticeText}>
              This is a simulated purchase. No real transaction will occur.
            </Text>
          </View>
        </ScrollView>
        <View style={styles.footer}>
          <TouchableOpacity style={styles.buyButton} onPress={handleConfirmPurchase}>
            <LinearGradient
              colors={colors.gradient.accent}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.buyButtonGradient}
            >
              <Text style={styles.buyButtonText}>Confirm Purchase</Text>
            </LinearGradient>
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
          <Text style={styles.headerTitle}>Buy Crypto</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView style={styles.inputContent} keyboardShouldPersistTaps="handled">
          <TouchableOpacity
            style={styles.tokenSelector}
            onPress={() => setShowTokenPicker(!showTokenPicker)}
          >
            <View style={styles.tokenBadge}>
              <Text style={styles.tokenBadgeText}>{selectedToken.symbol.substring(0, 2)}</Text>
            </View>
            <View style={styles.tokenSelectorInfo}>
              <Text style={styles.tokenSelectorName}>{selectedToken.name}</Text>
              <Text style={styles.tokenSelectorPrice}>${selectedToken.price.toLocaleString()}</Text>
            </View>
            <ChevronDown size={20} color={colors.textMuted} />
          </TouchableOpacity>

          {showTokenPicker && (
            <ScrollView style={styles.tokenPickerList} nestedScrollEnabled>
              {TOKENS.map((tk) => (
                <TouchableOpacity
                  key={tk.symbol}
                  style={[styles.tokenPickerItem, tk.symbol === selectedToken.symbol && styles.tokenPickerItemActive]}
                  onPress={() => { setSelectedToken(tk); setShowTokenPicker(false); }}
                >
                  <Text style={styles.tokenPickerSymbol}>{tk.symbol}</Text>
                  <Text style={styles.tokenPickerName}>{tk.name}</Text>
                  <Text style={styles.tokenPickerPrice}>${tk.price.toLocaleString()}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          <View style={styles.amountSection}>
            <Text style={styles.sectionLabel}>Amount (USD)</Text>
            <View style={styles.amountInputContainer}>
              <Text style={styles.currencyPrefix}>$</Text>
              <TextInput
                style={styles.amountInput}
                placeholder="0.00"
                placeholderTextColor={colors.textMuted}
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
              />
            </View>
            {amountNum > 0 && (
              <Text style={styles.conversionText}>
                = {tokenAmount} {selectedToken.symbol}
              </Text>
            )}
          </View>

          <View style={styles.quickAmounts}>
            {quickAmounts.map((qa) => (
              <TouchableOpacity
                key={qa}
                style={[styles.quickChip, amount === String(qa) && styles.quickChipActive]}
                onPress={() => setAmount(String(qa))}
              >
                <Text style={[styles.quickChipText, amount === String(qa) && styles.quickChipTextActive]}>${qa}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.paymentSection}>
            <Text style={styles.sectionLabel}>Payment Method</Text>
            <TouchableOpacity
              style={[styles.paymentOption, paymentMethod === 'card' && styles.paymentOptionActive]}
              onPress={() => setPaymentMethod('card')}
            >
              <CreditCard size={20} color={paymentMethod === 'card' ? colors.primary : colors.textMuted} />
              <View style={styles.paymentOptionInfo}>
                <Text style={[styles.paymentOptionTitle, paymentMethod === 'card' && styles.paymentOptionTitleActive]}>
                  Credit / Debit Card
                </Text>
                <Text style={styles.paymentOptionDesc}>Instant, 1.5% fee</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.paymentOption, paymentMethod === 'bank' && styles.paymentOptionActive]}
              onPress={() => setPaymentMethod('bank')}
            >
              <Building2 size={20} color={paymentMethod === 'bank' ? colors.primary : colors.textMuted} />
              <View style={styles.paymentOptionInfo}>
                <Text style={[styles.paymentOptionTitle, paymentMethod === 'bank' && styles.paymentOptionTitleActive]}>
                  Bank Transfer
                </Text>
                <Text style={styles.paymentOptionDesc}>1-3 days, 0.5% fee</Text>
              </View>
            </TouchableOpacity>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.buyButton, amountNum <= 0 && styles.buyButtonDisabled]}
            onPress={() => setStep('confirm')}
            disabled={amountNum <= 0}
          >
            <LinearGradient
              colors={amountNum > 0 ? colors.gradient.accent : [colors.surfaceBorder, colors.surfaceBorder]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.buyButtonGradient}
            >
              <Text style={styles.buyButtonText}>
                {amountNum > 0 ? `Buy ${tokenAmount} ${selectedToken.symbol}` : 'Enter amount'}
              </Text>
            </LinearGradient>
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
  inputContent: {
    flex: 1,
    paddingHorizontal: spacing.xxl,
  },
  tokenSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  tokenBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tokenBadgeText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.primary,
  },
  tokenSelectorInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  tokenSelectorName: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  tokenSelectorPrice: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: 2,
  },
  tokenPickerList: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.md,
    marginBottom: spacing.lg,
    marginTop: -spacing.sm,
  },
  tokenPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  tokenPickerItemActive: {
    backgroundColor: colors.primaryMuted,
  },
  tokenPickerSymbol: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
    width: 60,
  },
  tokenPickerName: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    flex: 1,
  },
  tokenPickerPrice: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  amountSection: {
    marginBottom: spacing.lg,
  },
  sectionLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg,
  },
  currencyPrefix: {
    fontSize: 28,
    fontWeight: '600',
    color: colors.textSecondary,
    marginRight: spacing.sm,
  },
  amountInput: {
    flex: 1,
    fontSize: 28,
    fontWeight: '600',
    color: colors.textPrimary,
    paddingVertical: spacing.lg,
  },
  conversionText: {
    fontSize: fontSize.sm,
    color: colors.primary,
    marginTop: spacing.sm,
  },
  quickAmounts: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xxl,
  },
  quickChip: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    alignItems: 'center',
  },
  quickChipActive: {
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primary,
  },
  quickChipText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textMuted,
  },
  quickChipTextActive: {
    color: colors.primary,
  },
  paymentSection: {
    marginBottom: spacing.xxl,
  },
  paymentOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  paymentOptionActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryMuted,
  },
  paymentOptionInfo: {
    flex: 1,
  },
  paymentOptionTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  paymentOptionTitleActive: {
    color: colors.primary,
  },
  paymentOptionDesc: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  footer: {
    padding: spacing.xxl,
  },
  buyButton: {
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  buyButtonDisabled: {
    opacity: 0.5,
  },
  buyButtonGradient: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
    borderRadius: borderRadius.md,
  },
  buyButtonText: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.white,
  },
  confirmContent: {
    flex: 1,
    paddingHorizontal: spacing.xxl,
  },
  confirmCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.md,
    padding: spacing.xxl,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  confirmLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  confirmAmount: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  breakdownCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  breakdownRowTotal: {
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
    marginTop: spacing.sm,
    paddingTop: spacing.md,
  },
  breakdownLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  breakdownValue: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  breakdownTotalLabel: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  breakdownTotalValue: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  mockNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.warningMuted,
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  mockNoticeText: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.warning,
    lineHeight: 18,
  },
  doneContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
  },
  doneIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.successMuted,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  doneIconText: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.success,
  },
  doneTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  doneSubtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xxl,
  },
  doneDetails: {
    width: '100%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  doneRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  doneLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  doneValue: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  statusBadge: {
    backgroundColor: colors.warningMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  statusText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.warning,
  },
  doneButton: {
    width: '100%',
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  doneButtonText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.white,
  },
});
