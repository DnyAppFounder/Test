import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, CircleCheck as CheckCircle, CircleAlert as AlertCircle, Smartphone } from 'lucide-react-native';
import { useWallet } from '@/contexts/WalletContext';
import { jupiterSwapService } from '@/services/jupiter/swapService';
import { ExternalWalletAdapter } from '@/lib/wallet/ExternalWalletAdapter';
import { SecureWalletManager } from '@/lib/wallet/SecureWalletManager';
import { KeyDerivationManager } from '@/lib/crypto/keyDerivation';
import { PublicKey, VersionedTransaction } from '@solana/web3.js';
import { colors, spacing, borderRadius, fontSize } from '@/constants/theme';

const SOL_MINT = 'So11111111111111111111111111111111111111112';

type BuyStatus = 'idle' | 'quoting' | 'quote_ready' | 'signing' | 'sending' | 'success' | 'error';

const STATUS_MSG: Record<BuyStatus, string> = {
  idle: '',
  quoting: 'Getting quote...',
  quote_ready: '',
  signing: 'Confirm in wallet...',
  sending: 'Sending transaction...',
  success: 'Purchase confirmed!',
  error: '',
};

export default function BuyScreen() {
  const router = useRouter();
  const { selectedAccount, connectedWallet, activeAddress, refreshWallet } = useWallet();

  const [tokenMint, setTokenMint] = useState(SOL_MINT);
  const [tokenSymbol, setTokenSymbol] = useState('SOL');
  const [solAmount, setSolAmount] = useState('');
  const [estimatedOutput, setEstimatedOutput] = useState('');
  const [status, setStatus] = useState<BuyStatus>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [quote, setQuote] = useState<any>(null);

  const isMobile = Platform.OS !== 'web';
  const hasWallet = !!activeAddress;
  const quickAmounts = ['0.1', '0.5', '1', '2', '5'];

  // Debounce quote fetch
  useEffect(() => {
    const amount = parseFloat(solAmount);
    if (!solAmount || isNaN(amount) || amount <= 0 || tokenMint === SOL_MINT) {
      setQuote(null);
      setEstimatedOutput('');
      return;
    }
    const timer = setTimeout(() => fetchQuote(amount), 600);
    return () => clearTimeout(timer);
  }, [solAmount, tokenMint]);

  const fetchQuote = async (solAmt: number) => {
    setStatus('quoting');
    setErrorMsg(null);
    try {
      const amountLamports = Math.floor(solAmt * 1e9);
      const q = await jupiterSwapService.getQuote(SOL_MINT, tokenMint, amountLamports, 50);
      if (q) {
        setQuote(q);
        // Estimate output (SOL has 9 decimals, token varies — default 6 for display)
        const outAmt = parseInt(q.outAmount) / 1e6;
        setEstimatedOutput(outAmt.toFixed(6));
        setStatus('quote_ready');
      } else {
        setQuote(null);
        setEstimatedOutput('');
        setErrorMsg('No route found for this token');
        setStatus('error');
      }
    } catch (e: any) {
      setQuote(null);
      setEstimatedOutput('');
      setErrorMsg('Failed to get quote');
      setStatus('error');
    }
  };

  const signWithExternalWallet = async (serializedTx: string): Promise<VersionedTransaction> => {
    if (!connectedWallet) throw new Error('No external wallet connected');
    const txBuf = Buffer.from(serializedTx, 'base64');
    const tx = VersionedTransaction.deserialize(txBuf);
    return ExternalWalletAdapter.signVersionedTransaction(connectedWallet.id, tx);
  };

  const signWithInternalWallet = async (serializedTx: string): Promise<VersionedTransaction> => {
    const walletManager = SecureWalletManager.getInstance();
    const mnemonic = walletManager.getMnemonic();
    if (!mnemonic || !selectedAccount) throw new Error('Wallet locked');
    const keypair = KeyDerivationManager.deriveSolanaKeyPair(mnemonic, selectedAccount.accountIndex ?? 0);
    const txBuf = Buffer.from(serializedTx, 'base64');
    const tx = VersionedTransaction.deserialize(txBuf);
    tx.sign([{
      publicKey: new PublicKey(selectedAccount.address),
      secretKey: keypair.secretKey,
    }]);
    return tx;
  };

  const handleBuy = async () => {
    if (!hasWallet) {
      setErrorMsg('Connect a wallet first');
      setStatus('error');
      return;
    }

    const amount = parseFloat(solAmount);
    if (isNaN(amount) || amount <= 0) {
      setErrorMsg('Enter a valid SOL amount');
      setStatus('error');
      return;
    }

    // If buying SOL itself, skip swap
    if (tokenMint === SOL_MINT) {
      setErrorMsg('Select a token to buy with SOL');
      setStatus('error');
      return;
    }

    if (!quote) {
      setErrorMsg('Waiting for quote...');
      return;
    }

    setErrorMsg(null);
    setTxSignature(null);

    try {
      setStatus('signing');

      const swapResult = await jupiterSwapService.getSwapTransaction(quote, activeAddress!, true);
      if (!swapResult?.swapTransaction) {
        throw new Error('Failed to build transaction');
      }

      let signedTx: VersionedTransaction;
      if (connectedWallet) {
        signedTx = await signWithExternalWallet(swapResult.swapTransaction);
      } else if (selectedAccount) {
        signedTx = await signWithInternalWallet(swapResult.swapTransaction);
      } else {
        throw new Error('No wallet available');
      }

      setStatus('sending');

      const signature = await jupiterSwapService.executeSwap(
        swapResult.swapTransaction,
        async () => signedTx
      );

      if (!signature) throw new Error('Transaction rejected by network');

      setTxSignature(signature);
      setStatus('success');

      if (refreshWallet) await refreshWallet();

      setTimeout(() => {
        setSolAmount('');
        setQuote(null);
        setEstimatedOutput('');
        setStatus('idle');
        setTxSignature(null);
      }, 5000);
    } catch (err: any) {
      console.error('[Buy] error:', err);
      let msg = err?.message || 'Transaction failed';
      if (msg.includes('User rejected') || msg.includes('rejected')) {
        msg = 'Transaction rejected in wallet';
      } else if (msg.includes('insufficient') || msg.includes('balance')) {
        msg = 'Insufficient SOL balance';
      }
      setErrorMsg(msg);
      setStatus('error');
    }
  };

  const isProcessing = status === 'signing' || status === 'sending' || status === 'quoting';
  const canBuy = hasWallet && !!quote && status === 'quote_ready' && !isProcessing;

  // Mobile without wallet
  if (isMobile && !hasWallet) {
    return (
      <LinearGradient colors={colors.gradient.primary as any} style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <ArrowLeft size={24} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Buy</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.mobileMessage}>
          <Smartphone size={48} color={colors.primary} />
          <Text style={styles.mobileMessageTitle}>Open in Wallet Browser</Text>
          <Text style={styles.mobileMessageText}>
            To buy tokens, open this app inside Phantom, Backpack, or Solflare's built-in browser. Transactions are signed securely inside the app.
          </Text>
        </View>
      </LinearGradient>
    );
  }

  if (status === 'success') {
    return (
      <LinearGradient colors={colors.gradient.primary as any} style={styles.container}>
        <View style={styles.doneContainer}>
          <View style={styles.doneIcon}>
            <CheckCircle size={48} color={colors.success} />
          </View>
          <Text style={styles.doneTitle}>Purchase Confirmed</Text>
          <Text style={styles.doneSubtitle}>
            Bought {tokenSymbol} for {solAmount} SOL
          </Text>
          {txSignature && (
            <View style={styles.txCard}>
              <Text style={styles.txLabel}>Transaction:</Text>
              <Text style={styles.txHash} numberOfLines={1} ellipsizeMode="middle">
                {txSignature}
              </Text>
            </View>
          )}
          <TouchableOpacity style={styles.doneButton} onPress={() => router.back()}>
            <Text style={styles.doneButtonText}>Return to Wallet</Text>
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
          <Text style={styles.headerTitle}>Buy Token</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
          {/* Wallet status */}
          {!hasWallet && (
            <View style={styles.noWalletCard}>
              <Text style={styles.noWalletText}>Connect a wallet to buy tokens</Text>
            </View>
          )}

          {/* Token Mint Input */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Token Contract Address</Text>
            <TextInput
              style={styles.mintInput}
              value={tokenMint === SOL_MINT ? '' : tokenMint}
              onChangeText={v => {
                const clean = v.trim();
                setTokenMint(clean || SOL_MINT);
                setTokenSymbol(clean ? 'TOKEN' : 'SOL');
                setQuote(null);
                setEstimatedOutput('');
                setStatus('idle');
                setErrorMsg(null);
              }}
              placeholder="Paste Solana token mint address..."
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isProcessing}
            />
            <Text style={styles.mintHint}>
              Enter the Solana mint address of the token you want to buy with SOL
            </Text>
          </View>

          {/* SOL Amount */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Amount (SOL)</Text>
            <View style={styles.amountInputRow}>
              <TextInput
                style={styles.amountInput}
                placeholder="0.00"
                placeholderTextColor={colors.textMuted}
                value={solAmount}
                onChangeText={v => {
                  setSolAmount(v);
                  setStatus('idle');
                  setErrorMsg(null);
                }}
                keyboardType="decimal-pad"
                editable={!isProcessing}
              />
              <Text style={styles.amountSuffix}>SOL</Text>
            </View>

            {estimatedOutput && tokenMint !== SOL_MINT && (
              <Text style={styles.estimatedOutput}>
                ≈ {estimatedOutput} {tokenSymbol}
              </Text>
            )}
          </View>

          {/* Quick amounts */}
          <View style={styles.quickAmounts}>
            {quickAmounts.map(amt => (
              <TouchableOpacity
                key={amt}
                style={[styles.quickChip, solAmount === amt && styles.quickChipActive]}
                onPress={() => {
                  setSolAmount(amt);
                  setStatus('idle');
                  setErrorMsg(null);
                }}
                disabled={isProcessing}
              >
                <Text style={[styles.quickChipText, solAmount === amt && styles.quickChipTextActive]}>
                  {amt} SOL
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Quote details */}
          {quote && status === 'quote_ready' && (
            <View style={styles.quoteCard}>
              <Text style={styles.quoteTitle}>Order Preview</Text>
              <View style={styles.quoteRow}>
                <Text style={styles.quoteLabel}>You pay</Text>
                <Text style={styles.quoteValue}>{solAmount} SOL</Text>
              </View>
              <View style={styles.quoteRow}>
                <Text style={styles.quoteLabel}>You receive</Text>
                <Text style={styles.quoteValue}>~{estimatedOutput} {tokenSymbol}</Text>
              </View>
              <View style={styles.quoteRow}>
                <Text style={styles.quoteLabel}>Slippage</Text>
                <Text style={styles.quoteValue}>0.5%</Text>
              </View>
              {(quote.priceImpactPct || 0) * 100 > 1 && (
                <View style={styles.quoteRow}>
                  <Text style={[styles.quoteLabel, { color: colors.warning }]}>Price Impact</Text>
                  <Text style={[styles.quoteValue, { color: colors.warning }]}>
                    {((quote.priceImpactPct || 0) * 100).toFixed(2)}%
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Status */}
          {(isProcessing || status === 'error') && (
            <View style={[
              styles.statusCard,
              status === 'error' && styles.statusError,
            ]}>
              {isProcessing && <ActivityIndicator size="small" color={colors.primary} />}
              {status === 'error' && <AlertCircle size={16} color={colors.error} />}
              <Text style={[
                styles.statusText,
                status === 'error' && styles.statusTextError,
              ]}>
                {status === 'error' ? (errorMsg || 'Transaction failed') : STATUS_MSG[status]}
              </Text>
            </View>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[
              styles.buyButton,
              !canBuy && styles.buyButtonDisabled,
            ]}
            onPress={handleBuy}
            disabled={!canBuy}
          >
            {isProcessing
              ? <ActivityIndicator size="small" color={colors.white} />
              : <Text style={styles.buyButtonText}>
                  {status === 'quoting'
                    ? 'Getting Quote...'
                    : !hasWallet
                      ? 'Connect Wallet'
                      : !quote
                        ? 'Enter Amount'
                        : 'CONFIRM BUY'}
                </Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
  // Mobile message
  mobileMessage: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
    gap: spacing.lg,
  },
  mobileMessageTitle: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  mobileMessageText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  noWalletCard: {
    backgroundColor: colors.primaryMuted,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    alignItems: 'center',
  },
  noWalletText: {
    fontSize: fontSize.sm,
    color: colors.primaryLight,
    fontWeight: '600',
  },
  section: { marginBottom: spacing.xl },
  sectionLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  mintInput: {
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    fontFamily: 'SpaceMono-Regular',
  },
  mintHint: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
    lineHeight: 16,
  },
  amountInputRow: {
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
    fontSize: 28,
    fontWeight: '600',
    color: colors.textPrimary,
    paddingVertical: spacing.lg,
  },
  amountSuffix: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textMuted,
  },
  estimatedOutput: {
    fontSize: fontSize.sm,
    color: colors.success,
    marginTop: spacing.sm,
    fontWeight: '600',
  },
  quickAmounts: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xl,
    flexWrap: 'wrap',
  },
  quickChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
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
  quickChipTextActive: { color: colors.primary },
  quoteCard: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  quoteTitle: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  quoteRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  quoteLabel: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: '600',
  },
  quoteValue: {
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    fontWeight: '700',
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
  statusError: { backgroundColor: colors.errorMuted },
  statusText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
    flex: 1,
  },
  statusTextError: { color: colors.error },
  footer: { padding: spacing.xxl },
  buyButton: {
    backgroundColor: colors.success,
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  buyButtonDisabled: {
    backgroundColor: colors.surfaceBorder,
    opacity: 0.6,
  },
  buyButtonText: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.white,
    letterSpacing: 0.5,
  },
  // Done state
  doneContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
    gap: spacing.lg,
  },
  doneIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.successMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  doneTitle: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  doneSubtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  txCard: {
    width: '100%',
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    padding: spacing.md,
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
