import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { CircleAlert as AlertCircle, CircleCheck as CheckCircle } from 'lucide-react-native';
import { colors, spacing, fontSize, borderRadius, elevation } from '@/constants/theme';
import { jupiterSwapService, JupiterQuote } from '@/services/jupiter/swapService';
import { useWallet } from '@/contexts/WalletContext';
import { PublicKey, VersionedTransaction } from '@solana/web3.js';
import { SecureWalletManager } from '@/lib/wallet/SecureWalletManager';
import { ExternalWalletAdapter } from '@/lib/wallet/ExternalWalletAdapter';

const SOL_MINT = 'So11111111111111111111111111111111111111112';

interface TradingInterfaceProps {
  tokenMint: string;
  tokenSymbol: string;
  tokenDecimals: number;
  currentPrice: number;
  onTradeComplete?: () => void;
}

type TradeMode = 'buy' | 'sell';
type TradeStatus = 'idle' | 'fetching_quote' | 'quote_ready' | 'signing' | 'sending' | 'confirming' | 'success' | 'error';

const STATUS_LABELS: Record<TradeStatus, string> = {
  idle: '',
  fetching_quote: 'Preparing quote...',
  quote_ready: '',
  signing: 'Confirm in wallet...',
  sending: 'Transaction pending...',
  confirming: 'Transaction pending...',
  success: 'Transaction confirmed',
  error: 'Transaction failed',
};

export function TradingInterface({
  tokenMint,
  tokenSymbol,
  tokenDecimals,
  currentPrice,
  onTradeComplete,
}: TradingInterfaceProps) {
  const { selectedAccount, connectedWallet, activeAddress, refreshWallet } = useWallet();
  const [mode, setMode] = useState<TradeMode>('buy');
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState<JupiterQuote | null>(null);
  const [status, setStatus] = useState<TradeStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [slippage] = useState(0.5);

  // Debounce quote fetching
  useEffect(() => {
    const parsed = parseFloat(amount);
    if (!amount || isNaN(parsed) || parsed <= 0) {
      setQuote(null);
      if (status === 'quote_ready' || status === 'fetching_quote') {
        setStatus('idle');
      }
      return;
    }

    const timer = setTimeout(() => {
      fetchQuote(parsed);
    }, 500);

    return () => clearTimeout(timer);
  }, [amount, mode, tokenMint]);

  const fetchQuote = async (inputAmount: number) => {
    setStatus('fetching_quote');
    setError(null);

    try {
      let inputMint: string;
      let outputMint: string;
      let amountInSmallestUnit: number;

      if (mode === 'buy') {
        inputMint = SOL_MINT;
        outputMint = tokenMint;
        amountInSmallestUnit = Math.floor(inputAmount * 1e9);
      } else {
        inputMint = tokenMint;
        outputMint = SOL_MINT;
        amountInSmallestUnit = Math.floor(inputAmount * Math.pow(10, tokenDecimals));
      }

      const quoteResponse = await jupiterSwapService.getQuote(
        inputMint,
        outputMint,
        amountInSmallestUnit,
        Math.round(slippage * 100)
      );

      if (quoteResponse) {
        setQuote(quoteResponse);
        setStatus('quote_ready');
      } else {
        setError('No route found. Token may have low liquidity.');
        setStatus('error');
      }
    } catch (err: any) {
      console.error('[Trade] Quote error:', err);
      setError(err.message || 'Failed to fetch quote');
      setStatus('error');
    }
  };

  const executeSwap = async () => {
    if (!quote || !activeAddress) return;

    try {
      setError(null);
      setStatus('signing');

      // Get swap transaction from Jupiter
      const swapResult = await jupiterSwapService.getSwapTransaction(quote, activeAddress, true);
      if (!swapResult) {
        throw new Error('Failed to build swap transaction');
      }

      // Sign based on wallet type
      let signedTx: VersionedTransaction;

      if (connectedWallet) {
        // External wallet — delegate signing to the extension
        const txBuf = Buffer.from(swapResult.swapTransaction, 'base64');
        const transaction = VersionedTransaction.deserialize(txBuf);
        signedTx = await ExternalWalletAdapter.signTransaction(connectedWallet.id, transaction as any) as any;
      } else if (selectedAccount) {
        // Internal wallet — sign with derived keypair
        signedTx = await signWithInternalWallet(swapResult.swapTransaction);
      } else {
        throw new Error('No wallet available');
      }

      // Send transaction
      setStatus('sending');

      const signature = await jupiterSwapService.executeSwap(
        swapResult.swapTransaction,
        async () => signedTx
      );

      if (!signature) {
        throw new Error('Transaction was rejected by the network');
      }

      setTxSignature(signature);
      setStatus('success');

      if (refreshWallet) await refreshWallet();
      if (onTradeComplete) onTradeComplete();

      setTimeout(() => {
        setAmount('');
        setQuote(null);
        setStatus('idle');
        setTxSignature(null);
      }, 4000);
    } catch (err: any) {
      console.error('[Trade] Swap error:', err);
      setError(err.message || 'Transaction failed');
      setStatus('error');
    }
  };

  const signWithInternalWallet = async (serializedTx: string): Promise<VersionedTransaction> => {
    const walletManager = SecureWalletManager.getInstance();
    if (!walletManager.isUnlocked()) {
      await walletManager.unlockWallet();
    }
    const mnemonic = walletManager.getMnemonic();
    if (!mnemonic || !selectedAccount) throw new Error('Wallet locked');

    const { KeyDerivationManager } = await import('@/lib/crypto/keyDerivation');
    const keypair = KeyDerivationManager.deriveSolanaKeyPair(mnemonic, selectedAccount.accountIndex || 0);

    const txBuf = Buffer.from(serializedTx, 'base64');
    const transaction = VersionedTransaction.deserialize(txBuf);

    transaction.sign([{
      publicKey: new PublicKey(selectedAccount.address),
      secretKey: keypair.secretKey,
    }]);

    return transaction;
  };

  const getEstimatedOutput = (): string => {
    if (!quote) return '0';
    const decimals = mode === 'buy' ? tokenDecimals : 9;
    const output = parseInt(quote.outAmount) / Math.pow(10, decimals);
    return output.toFixed(Math.min(decimals, 6));
  };

  const getMinimumReceived = (): string => {
    if (!quote) return '0';
    const decimals = mode === 'buy' ? tokenDecimals : 9;
    const minimum = parseInt(quote.otherAmountThreshold) / Math.pow(10, decimals);
    return minimum.toFixed(Math.min(decimals, 6));
  };

  const getPriceImpact = (): number => {
    if (!quote) return 0;
    return (quote.priceImpactPct || 0) * 100;
  };

  if (!activeAddress) {
    return (
      <View style={styles.container}>
        <Text style={styles.connectWalletText}>Connect or import a wallet to trade</Text>
      </View>
    );
  }

  const isProcessing = status === 'signing' || status === 'sending' || status === 'confirming';
  const canExecute = status === 'quote_ready' && quote && !isProcessing;

  return (
    <View style={styles.container}>
      {/* Mode Selector */}
      <View style={styles.modeSelector}>
        {(['buy', 'sell'] as TradeMode[]).map((m) => (
          <TouchableOpacity
            key={m}
            style={[styles.modeButton, mode === m && (m === 'buy' ? styles.buyActive : styles.sellActive)]}
            onPress={() => { setMode(m); setQuote(null); setStatus('idle'); setError(null); }}
            disabled={isProcessing}
          >
            <Text style={[styles.modeText, mode === m && styles.modeTextActive]}>
              {m === 'buy' ? 'Buy' : 'Sell'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Input */}
      <View style={styles.inputSection}>
        <Text style={styles.inputLabel}>
          {mode === 'buy' ? 'Amount (SOL)' : `Amount (${tokenSymbol})`}
        </Text>
        <TextInput
          style={styles.amountInput}
          value={amount}
          onChangeText={setAmount}
          placeholder="0.00"
          placeholderTextColor={colors.textMuted}
          keyboardType="decimal-pad"
          editable={!isProcessing}
        />
      </View>

      {/* Quote Details */}
      {quote && (status === 'quote_ready' || isProcessing) && (
        <View style={styles.quoteDetails}>
          <View style={styles.quoteRow}>
            <Text style={styles.quoteLabel}>You will receive</Text>
            <Text style={styles.quoteValue}>
              ~{getEstimatedOutput()} {mode === 'buy' ? tokenSymbol : 'SOL'}
            </Text>
          </View>
          <View style={styles.quoteRow}>
            <Text style={styles.quoteLabel}>Minimum received</Text>
            <Text style={styles.quoteValue}>{getMinimumReceived()}</Text>
          </View>
          {getPriceImpact() > 0.01 && (
            <View style={styles.quoteRow}>
              <Text style={styles.quoteLabel}>Price impact</Text>
              <Text style={[styles.quoteValue, getPriceImpact() > 3 && styles.warningText]}>
                {getPriceImpact().toFixed(3)}%
              </Text>
            </View>
          )}
          <View style={styles.quoteRow}>
            <Text style={styles.quoteLabel}>Slippage</Text>
            <Text style={styles.quoteValue}>{slippage}%</Text>
          </View>
        </View>
      )}

      {/* Status Message */}
      {status !== 'idle' && status !== 'quote_ready' && (
        <View style={[
          styles.statusMessage,
          status === 'success' && styles.successMessage,
          status === 'error' && styles.errorMessage,
        ]}>
          {(status === 'fetching_quote' || status === 'signing' || status === 'sending' || status === 'confirming') && (
            <ActivityIndicator size="small" color={colors.primary} />
          )}
          {status === 'success' && <CheckCircle size={18} color={colors.success} />}
          {status === 'error' && <AlertCircle size={18} color={colors.error} />}
          <Text style={[
            styles.statusText,
            status === 'success' && styles.successText,
            status === 'error' && styles.errorTextColor,
          ]}>
            {status === 'error' ? (error || 'Transaction failed') : STATUS_LABELS[status]}
          </Text>
        </View>
      )}

      {/* Transaction hash */}
      {txSignature && (
        <View style={styles.txSignature}>
          <Text style={styles.txLabel}>Signature:</Text>
          <Text style={styles.txHash} numberOfLines={1} ellipsizeMode="middle">
            {txSignature}
          </Text>
        </View>
      )}

      {/* Action Button */}
      <TouchableOpacity
        style={[
          styles.tradeButton,
          mode === 'buy' ? styles.buyButton : styles.sellButton,
          !canExecute && styles.tradeButtonDisabled,
        ]}
        onPress={executeSwap}
        disabled={!canExecute}
      >
        <Text style={styles.tradeButtonText}>
          {isProcessing
            ? STATUS_LABELS[status]
            : canExecute
              ? (mode === 'buy' ? 'CONFIRM BUY' : 'CONFIRM SELL')
              : 'Enter amount'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  modeSelector: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    padding: 4,
  },
  modeButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
  },
  buyActive: {
    backgroundColor: colors.success,
  },
  sellActive: {
    backgroundColor: colors.error,
  },
  modeText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textMuted,
  },
  modeTextActive: {
    color: colors.white,
  },
  inputSection: {
    marginBottom: spacing.lg,
  },
  inputLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  amountInput: {
    fontSize: fontSize.xxl,
    fontWeight: '800',
    color: colors.textPrimary,
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  quoteDetails: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  quoteRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  quoteLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '600',
  },
  quoteValue: {
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  warningText: {
    color: colors.warning,
  },
  statusMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    marginBottom: spacing.lg,
  },
  successMessage: {
    backgroundColor: colors.successMuted,
  },
  errorMessage: {
    backgroundColor: colors.errorMuted,
  },
  statusText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: '600',
    flex: 1,
  },
  successText: {
    color: colors.success,
  },
  errorTextColor: {
    color: colors.error,
  },
  txSignature: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  txLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  txHash: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: '700',
    fontFamily: 'SpaceMono-Regular',
  },
  tradeButton: {
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    alignItems: 'center',
  },
  buyButton: {
    backgroundColor: colors.success,
  },
  sellButton: {
    backgroundColor: colors.error,
  },
  tradeButtonDisabled: {
    backgroundColor: colors.surfaceLight,
    opacity: 0.6,
  },
  tradeButtonText: {
    fontSize: fontSize.md,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: 0.5,
  },
  connectWalletText: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    textAlign: 'center',
    fontWeight: '600',
    paddingVertical: spacing.xxl,
  },
});
