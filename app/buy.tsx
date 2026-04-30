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
const DAWEN_MINT = '43m6D8gCagyJ4K6NjETr3wjSUUSAAwaFznKbCUECpump';

type BuyStatus = 'idle' | 'quoting' | 'quote_ready' | 'signing' | 'sending' | 'success' | 'error';

export default function BuyScreen() {
  const router = useRouter();
  const { selectedAccount, connectedWallet, activeAddress, refreshWallet } = useWallet();

  const [tokenMint, setTokenMint] = useState(DAWEN_MINT);
  const [tokenSymbol, setTokenSymbol] = useState('DAWEN');
  const [solAmount, setSolAmount] = useState('');
  const [estimatedOutput, setEstimatedOutput] = useState('');
  const [status, setStatus] = useState<BuyStatus>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [quote, setQuote] = useState<any>(null);

  const isMobile = Platform.OS !== 'web';
  const hasWallet = !!activeAddress;
  const quickAmounts = ['0.1', '0.5', '1', '2', '5'];

  const parsedAmount = parseFloat(solAmount);
  const hasValidAmount = !isNaN(parsedAmount) && parsedAmount > 0;
  const hasValidToken = !!tokenMint && tokenMint !== SOL_MINT;

  // Auto-fetch quote when amount/token changes
  useEffect(() => {
    if (!hasValidAmount || !hasValidToken) {
      setQuote(null);
      setEstimatedOutput('');
      if (status === 'quoting' || status === 'quote_ready') {
        setStatus('idle');
      }
      return;
    }
    setStatus('quoting');
    setErrorMsg(null);
    const timer = setTimeout(() => fetchQuote(parsedAmount), 600);
    return () => clearTimeout(timer);
  }, [solAmount, tokenMint]);

  const fetchQuote = async (solAmt: number) => {
    try {
      const amountLamports = Math.floor(solAmt * 1e9);
      if (amountLamports < 1000) {
        setQuote(null);
        setEstimatedOutput('');
        setErrorMsg('Amount too small. Enter at least 0.000001 SOL.');
        setStatus('error');
        return;
      }

      const q = await jupiterSwapService.getQuote(SOL_MINT, tokenMint, amountLamports, 50);
      if (q) {
        setQuote(q);
        const outAmt = parseInt(q.outAmount) / 1e6;
        setEstimatedOutput(outAmt.toFixed(6));
        setStatus('quote_ready');
        setErrorMsg(null);
      } else {
        setQuote(null);
        setEstimatedOutput('');
        if (tokenMint === DAWEN_MINT) {
          setErrorMsg('No Jupiter route available for DAWEN/DTEST yet. Try another token or check liquidity.');
        } else {
          setErrorMsg('No route available. Insufficient liquidity for this pair.');
        }
        setStatus('error');
      }
    } catch (e: any) {
      setQuote(null);
      setEstimatedOutput('');
      const msg = e?.message || '';
      if (msg.includes('400')) {
        setErrorMsg('No route available. This token may lack liquidity on Jupiter.');
      } else if (msg.includes('network') || msg.includes('fetch')) {
        setErrorMsg('Network error. Check your connection and try again.');
      } else {
        setErrorMsg(`Jupiter API failed: ${msg || 'Unknown error'}`);
      }
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
    if (!selectedAccount) throw new Error('No account selected');
    const walletManager = SecureWalletManager.getInstance();
    const mnemonic = await walletManager.getMnemonicUnlocked();
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
    if (!hasWallet || !quote || !hasValidAmount || !hasValidToken) return;

    setErrorMsg(null);
    setTxSignature(null);

    try {
      setStatus('signing');

      const swapResult = await jupiterSwapService.getSwapTransaction(quote, activeAddress!, true);

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

      setTxSignature(signature);
      setStatus('success');

      if (refreshWallet) await refreshWallet();
    } catch (err: any) {
      console.error('[Buy] error:', err);
      let msg = err?.message || 'Transaction failed';
      if (msg.includes('User rejected') || msg.includes('rejected')) {
        msg = 'Transaction rejected in wallet';
      } else if (msg.includes('insufficient') || msg.includes('balance')) {
        msg = 'Insufficient SOL balance';
      } else if (msg.includes('slippage')) {
        msg = 'Price moved beyond slippage. Try again.';
      }
      setErrorMsg(msg);
      setStatus('error');
    }
  };

  const isProcessing = status === 'signing' || status === 'sending';

  const getButtonText = (): string => {
    if (!hasWallet) return 'Connect Wallet';
    if (!hasValidToken) return 'Select Token';
    if (!hasValidAmount) return 'Enter Amount';
    if (status === 'quoting') return 'Getting Quote...';
    if (status === 'quote_ready' && quote) return 'Confirm Buy';
    if (status === 'signing') return 'Confirm in Wallet';
    if (status === 'sending') return 'Transaction Pending...';
    if (status === 'success') return 'Buy Successful';
    if (status === 'error') return 'Transaction Failed';
    return 'Review Buy';
  };

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
            To buy tokens, open this app inside Phantom, Backpack, or Solflare's built-in browser.
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
          <Text style={styles.doneTitle}>Buy Successful</Text>
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
          {hasWallet && (
            <View style={styles.walletBadge}>
              <View style={styles.walletDot} />
              <Text style={styles.walletBadgeText}>
                {activeAddress!.slice(0, 4)}...{activeAddress!.slice(-4)}
              </Text>
            </View>
          )}
          {!hasWallet && (
            <View style={styles.noWalletCard}>
              <Text style={styles.noWalletText}>Connect a wallet to buy tokens</Text>
            </View>
          )}

          {/* Featured DAWEN token */}
          <TouchableOpacity
            style={[styles.featuredBanner, tokenMint === DAWEN_MINT && styles.featuredBannerActive]}
            onPress={() => {
              setTokenMint(DAWEN_MINT);
              setTokenSymbol('DAWEN');
              setQuote(null);
              setEstimatedOutput('');
              setStatus('idle');
              setErrorMsg(null);
            }}
            activeOpacity={0.8}
          >
            <View style={styles.featuredBadge}>
              <Text style={styles.featuredBadgeText}>FEATURED</Text>
            </View>
            <View style={styles.featuredInfo}>
              <Text style={styles.featuredName}>DAWEN</Text>
              <Text style={styles.featuredMint} numberOfLines={1} ellipsizeMode="middle">
                {DAWEN_MINT}
              </Text>
            </View>
            {tokenMint === DAWEN_MINT && (
              <View style={styles.featuredCheck}>
                <Text style={styles.featuredCheckText}>Selected</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Token Mint Input */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Token Contract Address</Text>
            <TextInput
              style={styles.mintInput}
              value={tokenMint === SOL_MINT ? '' : tokenMint}
              onChangeText={v => {
                const clean = v.trim();
                setTokenMint(clean || SOL_MINT);
                setTokenSymbol(clean ? (clean === DAWEN_MINT ? 'DAWEN' : 'TOKEN') : 'SOL');
                setQuote(null);
                setEstimatedOutput('');
                setStatus('idle');
                setErrorMsg(null);
              }}
              placeholder="Paste any Solana token mint address..."
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isProcessing}
            />
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
                  setErrorMsg(null);
                }}
                keyboardType="decimal-pad"
                editable={!isProcessing}
              />
              <Text style={styles.amountSuffix}>SOL</Text>
            </View>

            {estimatedOutput && status === 'quote_ready' && (
              <Text style={styles.estimatedOutput}>
                You receive: ~{estimatedOutput} {tokenSymbol}
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

          {/* Error message */}
          {errorMsg && (
            <View style={styles.errorCard}>
              <AlertCircle size={16} color={colors.error} />
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          )}

          {/* Processing status */}
          {isProcessing && (
            <View style={styles.statusCard}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.statusText}>
                {status === 'signing' ? 'Confirm in wallet...' : 'Sending transaction...'}
              </Text>
            </View>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[
              styles.buyButton,
              canBuy && styles.buyButtonReady,
              status === 'error' && styles.buyButtonError,
            ]}
            onPress={handleBuy}
            disabled={!canBuy}
          >
            {(status === 'quoting' || isProcessing) && (
              <ActivityIndicator size="small" color={colors.white} style={{ marginRight: 8 }} />
            )}
            <Text style={styles.buyButtonText}>{getButtonText()}</Text>
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
  walletBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(20, 241, 149, 0.1)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    alignSelf: 'flex-start',
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(20, 241, 149, 0.3)',
  },
  walletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  walletBadgeText: {
    fontSize: fontSize.xs,
    color: colors.success,
    fontWeight: '600',
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
  featuredBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  featuredBannerActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryMuted,
  },
  featuredBadge: {
    backgroundColor: colors.warning,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  featuredBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.black,
    letterSpacing: 0.5,
  },
  featuredInfo: {
    flex: 1,
  },
  featuredName: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  featuredMint: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  featuredCheck: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
  },
  featuredCheckText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.white,
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
  errorCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.errorMuted,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  errorText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.error,
    flex: 1,
    lineHeight: 18,
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
  statusText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
    flex: 1,
  },
  footer: { padding: spacing.xxl },
  buyButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surfaceBorder,
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.md,
  },
  buyButtonReady: {
    backgroundColor: colors.success,
  },
  buyButtonError: {
    backgroundColor: colors.error,
    opacity: 0.8,
  },
  buyButtonText: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.white,
    letterSpacing: 0.5,
  },
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
