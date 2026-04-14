import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Modal,
  Image,
  Alert,
} from 'react-native';
import { useState, useEffect } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, ArrowDownUp, CircleAlert as AlertCircle, ChevronDown, Info } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { colors, spacing, borderRadius, fontSize, elevation } from '@/constants/theme';
import { jupiterSwapService, JupiterQuote } from '@/services/jupiter/swapService';
import { jupiterTokenListService, JupiterToken } from '@/services/jupiter/tokenListService';
import { useWallet } from '@/contexts/WalletContext';
import { PublicKey, VersionedTransaction } from '@solana/web3.js';
import { SecureWalletManager } from '@/lib/wallet/SecureWalletManager';
import { KeyDerivationManager } from '@/lib/crypto/keyDerivation';

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

export default function SwapScreen() {
  const router = useRouter();
  const { selectedAccount } = useWallet();

  const [loading, setLoading] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [swapping, setSwapping] = useState(false);

  const [fromToken, setFromToken] = useState<JupiterToken | null>(null);
  const [toToken, setToToken] = useState<JupiterToken | null>(null);
  const [fromAmount, setFromAmount] = useState('');
  const [quote, setQuote] = useState<JupiterQuote | null>(null);

  const [tokens, setTokens] = useState<JupiterToken[]>([]);
  const [selectingToken, setSelectingToken] = useState<'from' | 'to' | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadTokens();
  }, []);

  const loadTokens = async () => {
    setLoading(true);
    try {
      const allTokens = await jupiterTokenListService.getVerifiedTokens();
      setTokens(allTokens);

      const sol = allTokens.find((t) => t.address === SOL_MINT);
      const usdc = allTokens.find((t) => t.address === USDC_MINT);

      if (sol) setFromToken(sol);
      if (usdc) setToToken(usdc);
    } catch (error) {
      console.error('Error loading tokens:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (fromAmount && parseFloat(fromAmount) > 0 && fromToken && toToken) {
      fetchQuote();
    } else {
      setQuote(null);
    }
  }, [fromAmount, fromToken, toToken]);

  const fetchQuote = async () => {
    if (!fromToken || !toToken || !fromAmount) return;

    setQuoteLoading(true);
    try {
      const amount = parseFloat(fromAmount);
      if (isNaN(amount) || amount <= 0) {
        setQuote(null);
        return;
      }

      const amountInSmallestUnit = amount * Math.pow(10, fromToken.decimals);
      const newQuote = await jupiterSwapService.getQuote(
        fromToken.address,
        toToken.address,
        Math.floor(amountInSmallestUnit),
        50
      );

      if (!newQuote) {
        Alert.alert('Quote Error', 'Insufficient liquidity for this trading pair. Try a different amount or token pair.');
      }
      setQuote(newQuote);
    } catch (error) {
      console.error('Error fetching quote:', error);
      Alert.alert('Quote Error', 'Unable to fetch quote. Please check your internet connection and try again.');
      setQuote(null);
    } finally {
      setQuoteLoading(false);
    }
  };

  const handleSwap = () => {
    const temp = fromToken;
    setFromToken(toToken);
    setToToken(temp);
    setFromAmount('');
    setQuote(null);
  };

  const handleSelectToken = (token: JupiterToken) => {
    if (selectingToken === 'from') {
      setFromToken(token);
    } else if (selectingToken === 'to') {
      setToToken(token);
    }
    setSelectingToken(null);
    setSearchQuery('');
  };

  const signTransaction = async (serializedTx: string): Promise<VersionedTransaction | null> => {
    try {
      const walletManager = SecureWalletManager.getInstance();
      const mnemonic = walletManager.getMnemonic();

      if (!mnemonic || !selectedAccount) {
        throw new Error('Wallet not available');
      }

      const accountIndex = selectedAccount.accountIndex || 0;
      const keypair = KeyDerivationManager.deriveSolanaKeyPair(mnemonic, accountIndex);

      const txBuf = Buffer.from(serializedTx, 'base64');
      const transaction = VersionedTransaction.deserialize(txBuf);

      transaction.sign([{
        publicKey: new PublicKey(selectedAccount.address),
        secretKey: keypair.secretKey,
      }]);

      return transaction;
    } catch (err) {
      console.error('Signing error:', err);
      return null;
    }
  };

  const handleExecuteSwap = async () => {
    if (!quote || !selectedAccount) {
      Alert.alert('Wallet Not Ready', 'Please ensure your wallet is connected before swapping.');
      return;
    }

    if (!fromToken || !toToken) {
      Alert.alert('Invalid Pair', 'Please select both input and output tokens.');
      return;
    }

    const amount = parseFloat(fromAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount to swap.');
      return;
    }

    try {
      setSwapping(true);

      const swapResult = await jupiterSwapService.getSwapTransaction(
        quote,
        selectedAccount.address,
        true
      );

      if (!swapResult) {
        throw new Error('SWAP_TX_FAILED');
      }

      const signedTx = await signTransaction(swapResult.swapTransaction);

      if (!signedTx) {
        throw new Error('SIGNING_FAILED');
      }

      const signature = await jupiterSwapService.executeSwap(
        swapResult.swapTransaction,
        async (tx) => signedTx
      );

      if (!signature) {
        throw new Error('TX_EXECUTION_FAILED');
      }

      Alert.alert(
        'Swap Successful',
        `Transaction confirmed: ${signature.slice(0, 8)}...${signature.slice(-8)}`,
        [{ text: 'OK' }]
      );

      setFromAmount('');
      setQuote(null);
    } catch (err: any) {
      console.error('Swap error:', err);

      let errorMessage = 'An unexpected error occurred. Please try again.';

      if (err.message.includes('SWAP_TX_FAILED')) {
        errorMessage = 'Failed to prepare swap transaction. The pair may not have sufficient liquidity.';
      } else if (err.message.includes('SIGNING_FAILED')) {
        errorMessage = 'Failed to sign transaction. Please check your wallet.';
      } else if (err.message.includes('TX_EXECUTION_FAILED')) {
        errorMessage = 'Transaction failed to execute. You may have insufficient SOL for fees.';
      } else if (err.message.includes('insufficient')) {
        errorMessage = 'Insufficient balance. Please check your wallet balance.';
      } else if (err.message.includes('slippage')) {
        errorMessage = 'Price moved beyond slippage tolerance. Try adjusting slippage or amount.';
      } else if (err.message.includes('timeout') || err.message.includes('network')) {
        errorMessage = 'Network error. Please check your connection and try again.';
      }

      Alert.alert('Swap Failed', errorMessage);
    } finally {
      setSwapping(false);
    }
  };

  const filteredTokens = tokens.filter(
    (token) =>
      token.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      token.symbol.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const outputAmount = quote && toToken
    ? jupiterSwapService.formatAmount(parseInt(quote.outAmount), toToken.decimals)
    : '0';

  const priceImpact = quote ? jupiterSwapService.calculatePriceImpact(quote) : 0;

  return (
    <LinearGradient colors={colors.gradient.primary as any} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={24} color={colors.textPrimary} strokeWidth={2} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Swap</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={styles.content}>
        <View style={styles.swapCard}>
          <View style={styles.inputSection}>
            <Text style={styles.inputLabel}>From</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.amountInput}
                value={fromAmount}
                onChangeText={setFromAmount}
                placeholder="0.00"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
              />
              <TouchableOpacity
                style={styles.tokenSelector}
                onPress={() => setSelectingToken('from')}
                activeOpacity={0.7}
              >
                {fromToken?.logoURI ? (
                  <Image source={{ uri: fromToken.logoURI }} style={styles.tokenLogo} />
                ) : (
                  <View style={styles.tokenLogoPlaceholder} />
                )}
                <Text style={styles.tokenSymbol}>{fromToken?.symbol || 'Select'}</Text>
                <ChevronDown size={18} color={colors.textSecondary} strokeWidth={2} />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity style={styles.swapButton} onPress={handleSwap} activeOpacity={0.7}>
            <ArrowDownUp size={20} color={colors.primary} strokeWidth={2.5} />
          </TouchableOpacity>

          <View style={styles.inputSection}>
            <Text style={styles.inputLabel}>To (estimated)</Text>
            <View style={styles.inputRow}>
              <Text style={styles.outputAmount}>{quoteLoading ? '...' : outputAmount}</Text>
              <TouchableOpacity
                style={styles.tokenSelector}
                onPress={() => setSelectingToken('to')}
                activeOpacity={0.7}
              >
                {toToken?.logoURI ? (
                  <Image source={{ uri: toToken.logoURI }} style={styles.tokenLogo} />
                ) : (
                  <View style={styles.tokenLogoPlaceholder} />
                )}
                <Text style={styles.tokenSymbol}>{toToken?.symbol || 'Select'}</Text>
                <ChevronDown size={18} color={colors.textSecondary} strokeWidth={2} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {quote && (
          <View style={styles.detailsCard}>
            <Text style={styles.detailsTitle}>Swap Details</Text>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Price Impact</Text>
              <Text
                style={[
                  styles.detailValue,
                  priceImpact > 1 && styles.detailValueWarning,
                  priceImpact > 5 && styles.detailValueDanger,
                ]}
              >
                {priceImpact.toFixed(2)}%
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Slippage Tolerance</Text>
              <Text style={styles.detailValue}>0.5%</Text>
            </View>
            {priceImpact > 1 && (
              <View style={styles.warningBanner}>
                <AlertCircle size={16} color={colors.warning} strokeWidth={2} />
                <Text style={styles.warningText}>High price impact. Consider reducing amount.</Text>
              </View>
            )}
          </View>
        )}

        <TouchableOpacity
          style={[
            styles.executeButton,
            (!quote || !selectedAccount) && styles.executeButtonDisabled,
          ]}
          onPress={handleExecuteSwap}
          disabled={!quote || !selectedAccount || swapping}
          activeOpacity={0.8}
        >
          {swapping ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Text style={styles.executeButtonText}>
              {!selectedAccount ? 'Connect Wallet' : !quote ? 'Enter Amount' : 'Swap'}
            </Text>
          )}
        </TouchableOpacity>

        <View style={styles.infoCard}>
          <Info size={16} color={colors.textMuted} strokeWidth={2} />
          <Text style={styles.infoText}>
            Swaps are powered by Jupiter. Connect a Solana wallet to trade.
          </Text>
        </View>
      </ScrollView>

      <Modal visible={selectingToken !== null} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Token</Text>
              <TouchableOpacity onPress={() => setSelectingToken(null)}>
                <Text style={styles.modalClose}>Close</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.searchInput}
              placeholder="Search by name or symbol"
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
            />

            <ScrollView style={styles.tokenList} showsVerticalScrollIndicator={false}>
              {filteredTokens.map((token) => (
                <TouchableOpacity
                  key={token.address}
                  style={styles.tokenItem}
                  onPress={() => handleSelectToken(token)}
                  activeOpacity={0.7}
                >
                  {token.logoURI ? (
                    <Image source={{ uri: token.logoURI }} style={styles.tokenItemLogo} />
                  ) : (
                    <View style={styles.tokenItemLogoPlaceholder}>
                      <Text style={styles.tokenItemLogoText}>
                        {token.symbol.substring(0, 2).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={styles.tokenItemInfo}>
                    <Text style={styles.tokenItemName}>{token.name}</Text>
                    <Text style={styles.tokenItemSymbol}>{token.symbol}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
    paddingBottom: spacing.lg,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  headerRight: {
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.xxl,
  },
  swapCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    marginBottom: spacing.lg,
  },
  inputSection: {
    marginBottom: spacing.md,
  },
  inputLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  amountInput: {
    flex: 1,
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.textPrimary,
    padding: 0,
  },
  outputAmount: {
    flex: 1,
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  tokenSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceLight,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
  },
  tokenLogo: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  tokenLogoPlaceholder: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surfaceBorder,
  },
  tokenSymbol: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  swapButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryMuted,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginVertical: spacing.md,
  },
  detailsCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    marginBottom: spacing.lg,
  },
  detailsTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  detailLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textMuted,
  },
  detailValue: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  detailValueWarning: {
    color: colors.warning,
  },
  detailValueDanger: {
    color: colors.error,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.warningMuted,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginTop: spacing.sm,
  },
  warningText: {
    flex: 1,
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.warning,
  },
  executeButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    marginBottom: spacing.lg,
    ...elevation.md,
  },
  executeButtonDisabled: {
    backgroundColor: colors.surfaceLight,
    opacity: 0.5,
  },
  executeButtonText: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.white,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    marginBottom: spacing.xxxl,
  },
  infoText: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.textMuted,
    lineHeight: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xxl,
    borderTopRightRadius: borderRadius.xxl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxxl,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
    marginBottom: spacing.lg,
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  modalClose: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.primary,
  },
  searchInput: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: fontSize.md,
    fontWeight: '500',
    color: colors.textPrimary,
    marginHorizontal: spacing.xxl,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  tokenList: {
    paddingHorizontal: spacing.xxl,
  },
  tokenItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  tokenItemLogo: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  tokenItemLogoPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tokenItemLogoText: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    color: colors.primary,
  },
  tokenItemInfo: {
    flex: 1,
  },
  tokenItemName: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  tokenItemSymbol: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.textMuted,
  },
});
