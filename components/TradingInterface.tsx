import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { ArrowDownUp, CircleAlert as AlertCircle, CircleCheck as CheckCircle } from 'lucide-react-native';
import { colors, spacing, fontSize, borderRadius, elevation } from '@/constants/theme';
import { jupiterSwapService, JupiterQuote } from '@/services/jupiter/swapService';
import { useWallet } from '@/contexts/WalletContext';
import { PublicKey, VersionedTransaction } from '@solana/web3.js';
import { SecureWalletManager } from '@/lib/wallet/SecureWalletManager';
import * as nacl from 'tweetnacl';

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

interface TradingInterfaceProps {
  tokenMint: string;
  tokenSymbol: string;
  tokenDecimals: number;
  currentPrice: number;
  onTradeComplete?: () => void;
}

type TradeMode = 'buy' | 'sell' | 'swap';
type TradeStatus = 'idle' | 'fetching_quote' | 'quote_ready' | 'signing' | 'sending' | 'confirming' | 'success' | 'error';

export function TradingInterface({
  tokenMint,
  tokenSymbol,
  tokenDecimals,
  currentPrice,
  onTradeComplete,
}: TradingInterfaceProps) {
  const { selectedAccount, refreshWallet } = useWallet();
  const [mode, setMode] = useState<TradeMode>('buy');
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState<JupiterQuote | null>(null);
  const [status, setStatus] = useState<TradeStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [slippage, setSlippage] = useState(0.5); // 0.5%

  useEffect(() => {
    if (amount && parseFloat(amount) > 0) {
      fetchQuote();
    } else {
      setQuote(null);
    }
  }, [amount, mode]);

  const fetchQuote = async () => {
    if (!amount || parseFloat(amount) <= 0) return;

    setStatus('fetching_quote');
    setError(null);

    try {
      const inputAmount = parseFloat(amount);
      let inputMint: string;
      let outputMint: string;
      let amountInSmallestUnit: number;

      if (mode === 'buy') {
        // Buy token with SOL
        inputMint = SOL_MINT;
        outputMint = tokenMint;
        amountInSmallestUnit = Math.floor(inputAmount * 1e9); // SOL has 9 decimals
      } else if (mode === 'sell') {
        // Sell token for SOL
        inputMint = tokenMint;
        outputMint = SOL_MINT;
        amountInSmallestUnit = Math.floor(inputAmount * Math.pow(10, tokenDecimals));
      } else {
        // Swap mode - for now, default to SOL
        inputMint = SOL_MINT;
        outputMint = tokenMint;
        amountInSmallestUnit = Math.floor(inputAmount * 1e9);
      }

      const quoteResponse = await jupiterSwapService.getQuote(
        inputMint,
        outputMint,
        amountInSmallestUnit,
        slippage * 100 // Convert to basis points
      );

      if (quoteResponse) {
        setQuote(quoteResponse);
        setStatus('quote_ready');
      } else {
        setError('Failed to get quote. Please try again.');
        setStatus('error');
      }
    } catch (err) {
      console.error('Quote error:', err);
      setError('Failed to fetch quote');
      setStatus('error');
    }
  };

  const executeSwap = async () => {
    if (!quote || !selectedAccount) {
      Alert.alert('Error', 'No wallet connected or quote not available');
      return;
    }

    try {
      setStatus('signing');
      setError(null);

      // Get swap transaction from Jupiter
      const swapResult = await jupiterSwapService.getSwapTransaction(
        quote,
        selectedAccount.address,
        true
      );

      if (!swapResult) {
        throw new Error('Failed to get swap transaction');
      }

      // Sign the transaction
      setStatus('signing');

      const signedTx = await signTransaction(swapResult.swapTransaction);

      if (!signedTx) {
        throw new Error('Transaction signing failed');
      }

      // Execute the swap
      setStatus('sending');

      const signature = await jupiterSwapService.executeSwap(
        swapResult.swapTransaction,
        async (tx) => signedTx
      );

      if (!signature) {
        throw new Error('Transaction failed');
      }

      setTxSignature(signature);
      setStatus('success');

      // Refresh wallet balances
      if (refreshWallet) {
        await refreshWallet();
      }

      if (onTradeComplete) {
        onTradeComplete();
      }

      // Reset after 3 seconds
      setTimeout(() => {
        setAmount('');
        setQuote(null);
        setStatus('idle');
        setTxSignature(null);
      }, 3000);
    } catch (err: any) {
      console.error('Swap error:', err);
      setError(err.message || 'Transaction failed');
      setStatus('error');
    }
  };

  const signTransaction = async (serializedTx: string): Promise<VersionedTransaction | null> => {
    try {
      const walletManager = SecureWalletManager.getInstance();
      const mnemonic = walletManager.getMnemonic();

      if (!mnemonic || !selectedAccount) {
        throw new Error('Wallet not available');
      }

      // Get the keypair for signing
      const { KeyDerivationManager } = await import('@/lib/crypto/keyDerivation');

      const accountIndex = selectedAccount.accountIndex || 0;
      const keypair = KeyDerivationManager.deriveSolanaKeyPair(mnemonic, accountIndex);

      // Deserialize transaction
      const txBuf = Buffer.from(serializedTx, 'base64');
      const transaction = VersionedTransaction.deserialize(txBuf);

      // Sign transaction
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

  const getEstimatedOutput = (): string => {
    if (!quote) return '0';

    const decimals = mode === 'buy' ? tokenDecimals : 9; // SOL has 9 decimals
    const output = parseInt(quote.outAmount) / Math.pow(10, decimals);

    return output.toFixed(decimals > 6 ? 6 : decimals);
  };

  const getMinimumReceived = (): string => {
    if (!quote) return '0';

    const decimals = mode === 'buy' ? tokenDecimals : 9;
    const minimum = parseInt(quote.otherAmountThreshold) / Math.pow(10, decimals);

    return minimum.toFixed(decimals > 6 ? 6 : decimals);
  };

  const getPriceImpact = (): number => {
    if (!quote) return 0;
    return quote.priceImpactPct * 100;
  };

  const renderStatusMessage = () => {
    switch (status) {
      case 'fetching_quote':
        return (
          <View style={styles.statusMessage}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.statusText}>Fetching quote...</Text>
          </View>
        );
      case 'signing':
        return (
          <View style={styles.statusMessage}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.statusText}>Please sign transaction...</Text>
          </View>
        );
      case 'sending':
        return (
          <View style={styles.statusMessage}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.statusText}>Sending transaction...</Text>
          </View>
        );
      case 'confirming':
        return (
          <View style={styles.statusMessage}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.statusText}>Confirming on blockchain...</Text>
          </View>
        );
      case 'success':
        return (
          <View style={[styles.statusMessage, styles.successMessage]}>
            <CheckCircle size={20} color={colors.success} />
            <Text style={[styles.statusText, styles.successText]}>Trade successful!</Text>
          </View>
        );
      case 'error':
        return (
          <View style={[styles.statusMessage, styles.errorMessage]}>
            <AlertCircle size={20} color={colors.error} />
            <Text style={[styles.statusText, styles.errorText]}>{error || 'Trade failed'}</Text>
          </View>
        );
      default:
        return null;
    }
  };

  if (!selectedAccount) {
    return (
      <View style={styles.container}>
        <Text style={styles.connectWalletText}>Connect wallet to trade</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.modeSelector}>
        {(['buy', 'sell', 'swap'] as TradeMode[]).map((m) => (
          <TouchableOpacity
            key={m}
            style={[styles.modeButton, mode === m && styles.modeButtonActive]}
            onPress={() => setMode(m)}
          >
            <Text style={[styles.modeText, mode === m && styles.modeTextActive]}>
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.inputSection}>
        <Text style={styles.inputLabel}>
          {mode === 'buy' ? 'Pay with SOL' : mode === 'sell' ? `Sell ${tokenSymbol}` : 'Swap'}
        </Text>
        <TextInput
          style={styles.amountInput}
          value={amount}
          onChangeText={setAmount}
          placeholder="0.00"
          placeholderTextColor={colors.textMuted}
          keyboardType="decimal-pad"
        />
      </View>

      {quote && status === 'quote_ready' && (
        <View style={styles.quoteDetails}>
          <View style={styles.quoteRow}>
            <Text style={styles.quoteLabel}>You'll receive</Text>
            <Text style={styles.quoteValue}>
              {getEstimatedOutput()} {mode === 'buy' ? tokenSymbol : 'SOL'}
            </Text>
          </View>
          <View style={styles.quoteRow}>
            <Text style={styles.quoteLabel}>Minimum received</Text>
            <Text style={styles.quoteValue}>
              {getMinimumReceived()} {mode === 'buy' ? tokenSymbol : 'SOL'}
            </Text>
          </View>
          <View style={styles.quoteRow}>
            <Text style={styles.quoteLabel}>Price impact</Text>
            <Text style={[styles.quoteValue, getPriceImpact() > 5 && styles.warningText]}>
              {getPriceImpact().toFixed(2)}%
            </Text>
          </View>
          <View style={styles.quoteRow}>
            <Text style={styles.quoteLabel}>Slippage tolerance</Text>
            <Text style={styles.quoteValue}>{slippage}%</Text>
          </View>
        </View>
      )}

      {renderStatusMessage()}

      {txSignature && (
        <View style={styles.txSignature}>
          <Text style={styles.txLabel}>Transaction:</Text>
          <Text style={styles.txHash} numberOfLines={1} ellipsizeMode="middle">
            {txSignature}
          </Text>
        </View>
      )}

      <TouchableOpacity
        style={[
          styles.tradeButton,
          (!quote || status !== 'quote_ready') && styles.tradeButtonDisabled,
        ]}
        onPress={executeSwap}
        disabled={!quote || status !== 'quote_ready'}
      >
        <Text style={styles.tradeButtonText}>
          {status === 'quote_ready' ? `Confirm ${mode}` : 'Enter amount to get quote'}
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
  modeButtonActive: {
    backgroundColor: colors.primary,
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
    gap: spacing.md,
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
  },
  successText: {
    color: colors.success,
  },
  errorText: {
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
    fontFamily: 'monospace',
  },
  tradeButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    alignItems: 'center',
    ...elevation.md,
  },
  tradeButtonDisabled: {
    backgroundColor: colors.surfaceLight,
    opacity: 0.5,
  },
  tradeButtonText: {
    fontSize: fontSize.md,
    fontWeight: '800',
    color: colors.white,
  },
  connectWalletText: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    textAlign: 'center',
    fontWeight: '600',
  },
});
