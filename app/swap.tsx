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
  Platform,
} from 'react-native';
import { useState, useEffect } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, ArrowDownUp, CircleAlert as AlertCircle, ChevronDown, Smartphone } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { colors, spacing, borderRadius, fontSize, elevation } from '@/constants/theme';
import { jupiterSwapService, JupiterQuote } from '@/services/jupiter/swapService';
import { jupiterTokenListService, JupiterToken } from '@/services/jupiter/tokenListService';
import { useWallet } from '@/contexts/WalletContext';
import { PublicKey, VersionedTransaction } from '@solana/web3.js';
import { SecureWalletManager } from '@/lib/wallet/SecureWalletManager';
import { KeyDerivationManager } from '@/lib/crypto/keyDerivation';
import { ExternalWalletAdapter } from '@/lib/wallet/ExternalWalletAdapter';

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const DAWEN_MINT = '43m6D8gCagyJ4K6NjETr3wjSUUSAAwaFznKbCUECpump';

type SwapStatus = 'idle' | 'quoting' | 'signing' | 'sending' | 'success' | 'error';

const STATUS_MSG: Record<SwapStatus, string> = {
  idle: '',
  quoting: 'Getting quote...',
  signing: 'Confirm in wallet...',
  sending: 'Sending transaction...',
  success: 'Swap confirmed!',
  error: '',
};

export default function SwapScreen() {
  const router = useRouter();
  const { selectedAccount, connectedWallet, activeAddress, refreshWallet, tokens: walletTokens, totalBalance } = useWallet();

  const [loading, setLoading] = useState(false);
  const [fromToken, setFromToken] = useState<JupiterToken | null>(null);
  const [toToken, setToToken] = useState<JupiterToken | null>(null);
  const [fromAmount, setFromAmount] = useState('');
  const [quote, setQuote] = useState<JupiterQuote | null>(null);
  const [tokens, setTokens] = useState<JupiterToken[]>([]);
  const [selectingToken, setSelectingToken] = useState<'from' | 'to' | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [status, setStatus] = useState<SwapStatus>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [txSignature, setTxSignature] = useState<string | null>(null);

  const isMobile = Platform.OS !== 'web';
  const hasWallet = !!activeAddress;

  // Get wallet balance for the from-token
  const fromTokenBalance = fromToken
    ? walletTokens.find(t => t.contract_address === fromToken.address)?.balance ?? 0
    : 0;

  useEffect(() => {
    loadTokens();
  }, []);

  const loadTokens = async () => {
    setLoading(true);
    try {
      const allTokens = await jupiterTokenListService.getVerifiedTokens();
      setTokens(allTokens);

      const sol = allTokens.find(t => t.address === SOL_MINT) ?? {
        address: SOL_MINT, chainId: 101, decimals: 9,
        name: 'Solana', symbol: 'SOL',
        logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
      };
      setFromToken(sol);

      // DAWEN may be a pump.fun token not in the verified list — create fallback entry
      const dawen = allTokens.find(t => t.address === DAWEN_MINT) ?? {
        address: DAWEN_MINT, chainId: 101, decimals: 6,
        name: 'DAWEN', symbol: 'DAWEN', logoURI: undefined,
      };
      setToToken(dawen);
    } catch (e) {
      console.error('Token list load failed:', e);
    } finally {
      setLoading(false);
    }
  };

  // Debounce quote fetch
  useEffect(() => {
    const amount = parseFloat(fromAmount);
    if (!fromToken || !toToken || !fromAmount || isNaN(amount) || amount <= 0) {
      setQuote(null);
      return;
    }
    const timer = setTimeout(() => fetchQuote(amount), 500);
    return () => clearTimeout(timer);
  }, [fromAmount, fromToken, toToken]);

  const fetchQuote = async (amount: number) => {
    if (!fromToken || !toToken) return;
    setStatus('quoting');
    setErrorMsg(null);
    try {
      const amountInSmallest = Math.floor(amount * Math.pow(10, fromToken.decimals));
      const q = await jupiterSwapService.getQuote(
        fromToken.address,
        toToken.address,
        amountInSmallest,
        50
      );
      if (q) {
        setQuote(q);
        setStatus('idle');
      } else {
        setQuote(null);
        setErrorMsg('No route found. Insufficient liquidity for this pair.');
        setStatus('error');
      }
    } catch (e: any) {
      setQuote(null);
      setErrorMsg('Failed to fetch quote. Check your connection.');
      setStatus('error');
    }
  };

  const handleFlipTokens = () => {
    const temp = fromToken;
    setFromToken(toToken);
    setToToken(temp);
    setFromAmount('');
    setQuote(null);
    setStatus('idle');
    setErrorMsg(null);
  };

  const handleSelectToken = (token: JupiterToken) => {
    if (selectingToken === 'from') setFromToken(token);
    else if (selectingToken === 'to') setToToken(token);
    setSelectingToken(null);
    setSearchQuery('');
    setQuote(null);
    setStatus('idle');
  };

  /**
   * Sign with external wallet (Phantom/Backpack/Solflare).
   * The wallet popup appears INSIDE the app — no external redirect.
   */
  const signWithExternalWallet = async (serializedTx: string): Promise<VersionedTransaction> => {
    if (!connectedWallet) throw new Error('No external wallet connected');
    const txBuf = Buffer.from(serializedTx, 'base64');
    const transaction = VersionedTransaction.deserialize(txBuf);
    return ExternalWalletAdapter.signVersionedTransaction(connectedWallet.id, transaction);
  };

  /**
   * Sign with internal (imported/created) wallet keypair.
   * Auto-unlocks the wallet if locked.
   */
  const signWithInternalWallet = async (serializedTx: string): Promise<VersionedTransaction> => {
    if (!selectedAccount) throw new Error('No account selected');
    const walletManager = SecureWalletManager.getInstance();
    const mnemonic = await walletManager.getMnemonicUnlocked();

    const keypair = KeyDerivationManager.deriveSolanaKeyPair(mnemonic, selectedAccount.accountIndex ?? 0);
    const txBuf = Buffer.from(serializedTx, 'base64');
    const transaction = VersionedTransaction.deserialize(txBuf);

    transaction.sign([{
      publicKey: new PublicKey(selectedAccount.address),
      secretKey: keypair.secretKey,
    }]);

    return transaction;
  };

  const handleExecuteSwap = async () => {
    if (!quote || !activeAddress || !fromToken || !toToken) return;

    const amount = parseFloat(fromAmount);
    if (isNaN(amount) || amount <= 0) {
      setErrorMsg('Enter a valid amount');
      setStatus('error');
      return;
    }

    setErrorMsg(null);
    setTxSignature(null);

    try {
      setStatus('signing');

      // Build transaction via Jupiter (never opens Jupiter website)
      const swapResult = await jupiterSwapService.getSwapTransaction(quote, activeAddress, true);

      // Sign inside the app with the connected wallet provider
      let signedTx: VersionedTransaction;
      if (connectedWallet) {
        signedTx = await signWithExternalWallet(swapResult.swapTransaction);
      } else if (selectedAccount) {
        signedTx = await signWithInternalWallet(swapResult.swapTransaction);
      } else {
        throw new Error('No wallet available');
      }

      setStatus('sending');

      // Send and confirm on-chain
      const signature = await jupiterSwapService.executeSwap(
        swapResult.swapTransaction,
        async () => signedTx
      );

      setTxSignature(signature);
      setStatus('success');

      if (refreshWallet) await refreshWallet();

      setTimeout(() => {
        setFromAmount('');
        setQuote(null);
        setStatus('idle');
        setTxSignature(null);
      }, 4000);
    } catch (err: any) {
      console.error('[Swap] error:', err);
      let msg = err?.message || 'Transaction failed';
      if (msg.includes('User rejected') || msg.includes('rejected')) {
        msg = 'Transaction rejected in wallet';
      } else if (msg.includes('insufficient') || msg.includes('balance')) {
        msg = 'Insufficient balance for this swap';
      } else if (msg.includes('slippage')) {
        msg = 'Price moved beyond slippage. Try again or increase slippage.';
      }
      setErrorMsg(msg);
      setStatus('error');
    }
  };

  const filteredTokens = tokens.filter(t =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.symbol.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const outputAmount = quote && toToken
    ? jupiterSwapService.formatAmount(parseInt(quote.outAmount), toToken.decimals)
    : '0';

  const priceImpact = quote ? jupiterSwapService.calculatePriceImpact(quote) : 0;
  const isProcessing = status === 'signing' || status === 'sending';
  const canSwap = !!quote && hasWallet && !isProcessing && status !== 'quoting';

  // Mobile without wallet: show instruction
  if (isMobile && !hasWallet) {
    return (
      <LinearGradient colors={colors.gradient.primary as any} style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <ArrowLeft size={24} color={colors.textPrimary} strokeWidth={2} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Swap</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.mobileWalletMessage}>
          <Smartphone size={48} color={colors.primary} />
          <Text style={styles.mobileWalletTitle}>Open in Wallet Browser</Text>
          <Text style={styles.mobileWalletText}>
            To swap tokens, open this app inside Phantom, Backpack, or Solflare's built-in browser. Transactions are signed securely inside the app — no external redirects.
          </Text>
        </View>
      </LinearGradient>
    );
  }

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
            <View style={styles.inputLabelRow}>
              <Text style={styles.inputLabel}>From</Text>
              {hasWallet && fromToken && (
                <View style={styles.balanceRow}>
                  <Text style={styles.balanceText}>
                    Balance: {fromTokenBalance.toFixed(4)} {fromToken.symbol}
                  </Text>
                  <TouchableOpacity
                    style={styles.maxButton}
                    onPress={() => {
                      if (fromTokenBalance > 0) {
                        // Leave small buffer for SOL gas
                        const maxAmt = fromToken.address === SOL_MINT
                          ? Math.max(0, fromTokenBalance - 0.01)
                          : fromTokenBalance;
                        setFromAmount(maxAmt.toFixed(6));
                        setStatus('idle');
                        setErrorMsg(null);
                      }
                    }}
                    disabled={isProcessing}
                  >
                    <Text style={styles.maxButtonText}>MAX</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.amountInput}
                value={fromAmount}
                onChangeText={v => { setFromAmount(v); setStatus('idle'); setErrorMsg(null); }}
                placeholder="0.00"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
                editable={!isProcessing}
              />
              <TouchableOpacity
                style={styles.tokenSelector}
                onPress={() => setSelectingToken('from')}
                activeOpacity={0.7}
                disabled={isProcessing}
              >
                {fromToken?.logoURI
                  ? <Image source={{ uri: fromToken.logoURI }} style={styles.tokenLogo} />
                  : <View style={styles.tokenLogoPlaceholder} />}
                <Text style={styles.tokenSymbol}>{fromToken?.symbol || 'Select'}</Text>
                <ChevronDown size={18} color={colors.textSecondary} strokeWidth={2} />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity style={styles.swapButton} onPress={handleFlipTokens} activeOpacity={0.7} disabled={isProcessing}>
            <ArrowDownUp size={20} color={colors.primary} strokeWidth={2.5} />
          </TouchableOpacity>

          <View style={styles.inputSection}>
            <Text style={styles.inputLabel}>To (estimated)</Text>
            <View style={styles.inputRow}>
              {status === 'quoting'
                ? <ActivityIndicator size="small" color={colors.primary} style={styles.quoteLoader} />
                : <Text style={styles.outputAmount}>{outputAmount}</Text>}
              <TouchableOpacity
                style={styles.tokenSelector}
                onPress={() => setSelectingToken('to')}
                activeOpacity={0.7}
                disabled={isProcessing}
              >
                {toToken?.logoURI
                  ? <Image source={{ uri: toToken.logoURI }} style={styles.tokenLogo} />
                  : <View style={styles.tokenLogoPlaceholder} />}
                <Text style={styles.tokenSymbol}>{toToken?.symbol || 'Select'}</Text>
                <ChevronDown size={18} color={colors.textSecondary} strokeWidth={2} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Quote Details */}
        {quote && (
          <View style={styles.detailsCard}>
            <Text style={styles.detailsTitle}>Swap Details</Text>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Price Impact</Text>
              <Text style={[
                styles.detailValue,
                priceImpact > 1 && styles.detailValueWarning,
                priceImpact > 5 && styles.detailValueDanger,
              ]}>
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

        {/* Status */}
        {(isProcessing || status === 'success' || status === 'error') && (
          <View style={[
            styles.statusCard,
            status === 'success' && styles.statusSuccess,
            status === 'error' && styles.statusError,
          ]}>
            {isProcessing && <ActivityIndicator size="small" color={colors.primary} />}
            <Text style={[
              styles.statusText,
              status === 'success' && styles.statusTextSuccess,
              status === 'error' && styles.statusTextError,
            ]}>
              {status === 'error' ? (errorMsg || 'Transaction failed') : STATUS_MSG[status]}
            </Text>
          </View>
        )}

        {txSignature && (
          <View style={styles.txCard}>
            <Text style={styles.txLabel}>Transaction:</Text>
            <Text style={styles.txHash} numberOfLines={1} ellipsizeMode="middle">{txSignature}</Text>
          </View>
        )}

        {/* Connect wallet prompt */}
        {!hasWallet && (
          <View style={styles.noWalletCard}>
            <Text style={styles.noWalletText}>Connect a wallet to swap tokens</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.executeButton, !canSwap && styles.executeButtonDisabled]}
          onPress={handleExecuteSwap}
          disabled={!canSwap}
          activeOpacity={0.8}
        >
          {isProcessing
            ? <ActivityIndicator size="small" color={colors.white} />
            : <Text style={styles.executeButtonText}>
                {!hasWallet
                  ? 'Connect Wallet'
                  : !quote
                    ? 'Enter Amount'
                    : status === 'success'
                      ? 'Swapped!'
                      : 'Confirm Swap'}
              </Text>}
        </TouchableOpacity>
      </ScrollView>

      {/* Token Selection Modal */}
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
              {filteredTokens.map(token => (
                <TouchableOpacity
                  key={token.address}
                  style={styles.tokenItem}
                  onPress={() => handleSelectToken(token)}
                  activeOpacity={0.7}
                >
                  {token.logoURI
                    ? <Image source={{ uri: token.logoURI }} style={styles.tokenItemLogo} />
                    : <View style={styles.tokenItemLogoPlaceholder}>
                        <Text style={styles.tokenItemLogoText}>{(token.symbol ?? '??').substring(0, 2).toUpperCase()}</Text>
                      </View>}
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
  container: { flex: 1 },
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
  headerRight: { width: 40 },
  content: {
    flex: 1,
    paddingHorizontal: spacing.xxl,
  },
  // Mobile wallet message
  mobileWalletMessage: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
    gap: spacing.lg,
  },
  mobileWalletTitle: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  mobileWalletText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  swapCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    marginBottom: spacing.lg,
  },
  inputSection: { marginBottom: spacing.md },
  inputLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  inputLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  balanceText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '500',
  },
  maxButton: {
    backgroundColor: colors.primaryMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  maxButtonText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.primary,
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
  quoteLoader: { flex: 1 },
  tokenSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceLight,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
  },
  tokenLogo: { width: 28, height: 28, borderRadius: 14 },
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
  detailValueWarning: { color: colors.warning },
  detailValueDanger: { color: colors.error },
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
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  statusSuccess: { backgroundColor: colors.successMuted },
  statusError: { backgroundColor: colors.errorMuted },
  statusText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
    flex: 1,
  },
  statusTextSuccess: { color: colors.success },
  statusTextError: { color: colors.error },
  txCard: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  txLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '600',
    marginBottom: 4,
  },
  txHash: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: '700',
    fontFamily: 'SpaceMono-Regular',
  },
  noWalletCard: {
    backgroundColor: colors.primaryMuted,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  noWalletText: {
    fontSize: fontSize.sm,
    color: colors.primaryLight,
    fontWeight: '600',
  },
  executeButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    marginBottom: spacing.xxxl,
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
  tokenList: { paddingHorizontal: spacing.xxl },
  tokenItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  tokenItemLogo: { width: 40, height: 40, borderRadius: 20 },
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
  tokenItemInfo: { flex: 1 },
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
