import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Image,
} from 'react-native';
import { ArrowUpDown, ChevronDown, CircleAlert as AlertCircle, CircleCheck as CheckCircle } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, fontSize, borderRadius } from '@/constants/theme';
import { jupiterSwapService, JupiterQuote } from '@/services/jupiter/swapService';
import { useWallet } from '@/contexts/WalletContext';
import { PublicKey, VersionedTransaction } from '@solana/web3.js';
import { SecureWalletManager } from '@/lib/wallet/SecureWalletManager';
import { ExternalWalletAdapter } from '@/lib/wallet/ExternalWalletAdapter';

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const SOL_LOGO = 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png';

interface TradingInterfaceProps {
  tokenMint: string;
  tokenSymbol: string;
  tokenDecimals: number;
  currentPrice: number;
  tokenLogoUrl?: string;
  solBalance?: number;
  tokenBalance?: number;
  onTradeComplete?: () => void;
}

type TradeMode = 'buy' | 'sell';
type TradeStatus = 'idle' | 'fetching_quote' | 'quote_ready' | 'signing' | 'sending' | 'confirming' | 'success' | 'error';

export function TradingInterface({
  tokenMint,
  tokenSymbol,
  tokenDecimals,
  currentPrice,
  tokenLogoUrl,
  solBalance = 0,
  tokenBalance = 0,
  onTradeComplete,
}: TradingInterfaceProps) {
  const { selectedAccount, connectedWallet, activeAddress, activeWallet, tokens, refreshWallet } = useWallet();
  const [mode, setMode] = useState<TradeMode>('buy');
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState<JupiterQuote | null>(null);
  const [status, setStatus] = useState<TradeStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [slippage] = useState(0.5);

  // Get real balances from context tokens
  const solToken = tokens.find(t => t.contract_address === SOL_MINT);
  const thisToken = tokens.find(t => t.contract_address === tokenMint);
  const realSolBalance = solToken ? parseFloat(solToken.balance || '0') : solBalance;
  const realTokenBalance = thisToken ? parseFloat(thisToken.balance || '0') : tokenBalance;

  const fromBalance = mode === 'buy' ? realSolBalance : realTokenBalance;
  const fromSymbol = mode === 'buy' ? 'SOL' : tokenSymbol;
  const toSymbol = mode === 'buy' ? tokenSymbol : 'SOL';
  const fromLogoUrl = mode === 'buy' ? SOL_LOGO : tokenLogoUrl;
  const toLogoUrl = mode === 'buy' ? tokenLogoUrl : SOL_LOGO;

  // Debounce quote fetching
  useEffect(() => {
    const parsed = parseFloat(amount);
    if (!amount || isNaN(parsed) || parsed <= 0) {
      setQuote(null);
      if (status === 'quote_ready' || status === 'fetching_quote') setStatus('idle');
      return;
    }
    const timer = setTimeout(() => fetchQuote(parsed), 600);
    return () => clearTimeout(timer);
  }, [amount, mode, tokenMint]);

  const fetchQuote = async (inputAmount: number) => {
    setStatus('fetching_quote');
    setError(null);
    try {
      const inputMint = mode === 'buy' ? SOL_MINT : tokenMint;
      const outputMint = mode === 'buy' ? tokenMint : SOL_MINT;
      const decimals = mode === 'buy' ? 9 : tokenDecimals;
      const amountIn = Math.floor(inputAmount * Math.pow(10, decimals));

      const q = await jupiterSwapService.getQuote(inputMint, outputMint, amountIn, Math.round(slippage * 100));
      if (q) {
        setQuote(q);
        setStatus('quote_ready');
      } else {
        setError('No route found. This token may have low liquidity.');
        setStatus('error');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch quote');
      setStatus('error');
    }
  };

  const executeSwap = async () => {
    if (!quote || !activeAddress) return;
    setError(null);
    setStatus('signing');
    try {
      const swapResult = await jupiterSwapService.getSwapTransaction(quote, activeAddress, true);
      if (!swapResult?.swapTransaction) throw new Error('Failed to build swap transaction');

      let signedTx: VersionedTransaction;

      if (connectedWallet) {
        const txBuf = Buffer.from(swapResult.swapTransaction, 'base64');
        const transaction = VersionedTransaction.deserialize(txBuf);
        signedTx = await ExternalWalletAdapter.signVersionedTransaction(connectedWallet.id, transaction);
      } else if (selectedAccount) {
        signedTx = await signWithKeypair(swapResult.swapTransaction);
      } else {
        throw new Error('No wallet available to sign');
      }

      setStatus('sending');
      const signature = await jupiterSwapService.executeSwap(swapResult.swapTransaction, async () => signedTx);
      if (!signature) throw new Error('Transaction rejected by network');

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
      let msg = err?.message || 'Transaction failed';
      if (msg.includes('User rejected') || msg.includes('rejected')) msg = 'Transaction rejected in wallet';
      else if (msg.includes('insufficient') || msg.includes('balance')) msg = 'Insufficient balance';
      setError(msg);
      setStatus('error');
    }
  };

  const signWithKeypair = async (serializedTx: string): Promise<VersionedTransaction> => {
    const walletManager = SecureWalletManager.getInstance();
    if (!walletManager.isUnlocked()) await walletManager.unlockWallet();
    const mnemonic = walletManager.getMnemonic();
    if (!mnemonic || !selectedAccount) throw new Error('Wallet locked or unavailable');

    const { KeyDerivationManager } = await import('@/lib/crypto/keyDerivation');
    const keypair = KeyDerivationManager.deriveSolanaKeyPair(mnemonic, selectedAccount.accountIndex || 0);

    const txBuf = Buffer.from(serializedTx, 'base64');
    const transaction = VersionedTransaction.deserialize(txBuf);
    transaction.sign([{ publicKey: new PublicKey(selectedAccount.address), secretKey: keypair.secretKey }]);
    return transaction;
  };

  const getEstimatedOutput = (): string => {
    if (!quote) return '0.00';
    const decimals = mode === 'buy' ? tokenDecimals : 9;
    const out = parseInt(quote.outAmount) / Math.pow(10, decimals);
    return out < 0.001 ? out.toExponential(3) : out.toFixed(Math.min(decimals, 6));
  };

  const handleMax = () => {
    const bal = mode === 'buy' ? realSolBalance : realTokenBalance;
    if (bal > 0) {
      const max = mode === 'buy' ? Math.max(0, bal - 0.005) : bal;
      setAmount(max.toString());
    }
  };

  const switchMode = () => {
    setMode(m => m === 'buy' ? 'sell' : 'buy');
    setAmount('');
    setQuote(null);
    setStatus('idle');
    setError(null);
  };

  const isProcessing = status === 'signing' || status === 'sending' || status === 'confirming';
  const canExecute = status === 'quote_ready' && !!quote && !isProcessing;

  const getButtonLabel = () => {
    if (!activeAddress) return 'Connect Wallet';
    if (!amount || parseFloat(amount) <= 0) return 'Enter Amount';
    if (status === 'fetching_quote') return 'Getting Quote...';
    if (status === 'quote_ready') return mode === 'buy' ? `Buy ${tokenSymbol}` : `Sell ${tokenSymbol}`;
    if (status === 'signing') return 'Confirm in Wallet...';
    if (status === 'sending' || status === 'confirming') return 'Pending...';
    if (status === 'success') return 'Success!';
    if (status === 'error') return 'Try Again';
    return 'Enter Amount';
  };

  const getButtonStyle = () => {
    if (status === 'success') return styles.btnSuccess;
    if (status === 'error') return styles.btnError;
    if (canExecute) return mode === 'buy' ? styles.btnBuy : styles.btnSell;
    return styles.btnDisabled;
  };

  if (!activeAddress) {
    return (
      <View style={styles.noWallet}>
        <Text style={styles.noWalletText}>Connect or import a wallet to trade</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Buy / Sell tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, mode === 'buy' && styles.tabBuyActive]}
          onPress={() => { setMode('buy'); setAmount(''); setQuote(null); setStatus('idle'); setError(null); }}
          disabled={isProcessing}
        >
          <Text style={[styles.tabText, mode === 'buy' && styles.tabTextBuyActive]}>Buy</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, mode === 'sell' && styles.tabSellActive]}
          onPress={() => { setMode('sell'); setAmount(''); setQuote(null); setStatus('idle'); setError(null); }}
          disabled={isProcessing}
        >
          <Text style={[styles.tabText, mode === 'sell' && styles.tabTextSellActive]}>Sell</Text>
        </TouchableOpacity>
      </View>

      {/* You Pay row */}
      <View style={styles.inputRow}>
        <View style={styles.inputRowTop}>
          <Text style={styles.inputRowLabel}>You Pay</Text>
          <View style={styles.balanceRow}>
            <Text style={styles.balanceText}>Balance: {fromBalance.toFixed(4)} {fromSymbol}</Text>
            <TouchableOpacity style={styles.maxBtn} onPress={handleMax}>
              <Text style={styles.maxBtnText}>MAX</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.inputBox}>
          {/* Token selector on LEFT so logo is always visible */}
          <View style={styles.tokenSelector}>
            {fromLogoUrl ? (
              <Image source={{ uri: fromLogoUrl }} style={styles.tokenLogo} />
            ) : (
              <View style={[styles.tokenLogo, styles.tokenLogoFallback]}>
                <Text style={styles.tokenLogoText}>{fromSymbol.slice(0, 2)}</Text>
              </View>
            )}
            <Text style={styles.tokenSelectorText}>{fromSymbol}</Text>
          </View>
          <TextInput
            style={styles.amountInput}
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
            editable={!isProcessing}
            textAlign="right"
          />
        </View>
      </View>

      {/* Swap arrow */}
      <View style={styles.swapArrowWrapper}>
        <TouchableOpacity style={styles.swapArrowBtn} onPress={switchMode} disabled={isProcessing}>
          <ArrowUpDown size={16} color={colors.primary} strokeWidth={2.5} />
        </TouchableOpacity>
      </View>

      {/* You Receive row */}
      <View style={styles.inputRow}>
        <Text style={styles.inputRowLabel}>You Receive (Est.)</Text>
        <View style={styles.inputBox}>
          {/* Token selector on LEFT */}
          <View style={styles.tokenSelector}>
            {toLogoUrl ? (
              <Image source={{ uri: toLogoUrl }} style={styles.tokenLogo} />
            ) : (
              <View style={[styles.tokenLogo, styles.tokenLogoFallback]}>
                <Text style={styles.tokenLogoText}>{toSymbol.slice(0, 2)}</Text>
              </View>
            )}
            <Text style={styles.tokenSelectorText}>{toSymbol}</Text>
          </View>
          <Text style={[styles.amountInput, styles.receiveAmount]}>
            {status === 'fetching_quote' ? '...' : getEstimatedOutput()}
          </Text>
        </View>
      </View>

      {/* Error message */}
      {(status === 'error' && error) && (
        <View style={styles.errorBox}>
          <AlertCircle size={14} color={colors.error} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Success message */}
      {status === 'success' && txSignature && (
        <View style={styles.successBox}>
          <CheckCircle size={14} color={colors.success} />
          <Text style={styles.successText} numberOfLines={1} ellipsizeMode="middle">
            {txSignature}
          </Text>
        </View>
      )}

      {/* Action Button */}
      <TouchableOpacity
        style={[styles.actionBtn, getButtonStyle()]}
        onPress={executeSwap}
        disabled={!canExecute && status !== 'error'}
        activeOpacity={0.85}
      >
        {(status === 'fetching_quote' || isProcessing) ? (
          <ActivityIndicator size="small" color={colors.white} />
        ) : null}
        <Text style={styles.actionBtnText}>{getButtonLabel()}</Text>
      </TouchableOpacity>

      {/* Slippage info */}
      {quote && status === 'quote_ready' && (
        <Text style={styles.slippageNote}>Slippage: {slippage}% · Price impact: {((quote.priceImpactPct || 0) * 100).toFixed(2)}%</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#12121A',
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.12)',
  },
  tabs: {
    flexDirection: 'row',
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    marginBottom: spacing.lg,
    backgroundColor: '#1A1A28',
    padding: 3,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: borderRadius.sm,
  },
  tabBuyActive: {
    backgroundColor: '#10b981',
  },
  tabSellActive: {
    backgroundColor: '#ef4444',
  },
  tabText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textMuted,
  },
  tabTextBuyActive: {
    color: colors.white,
  },
  tabTextSellActive: {
    color: colors.white,
  },
  inputRow: {
    marginBottom: 4,
  },
  inputRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  inputRowLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textMuted,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  balanceText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '600',
  },
  maxBtn: {
    backgroundColor: colors.primaryMuted,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  maxBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.primary,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A28',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.1)',
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    gap: spacing.sm,
  },
  amountInput: {
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  receiveAmount: {
    color: colors.textSecondary,
  },
  tokenSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#252538',
    borderRadius: borderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tokenLogo: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  tokenLogoFallback: {
    backgroundColor: colors.primaryMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tokenLogoText: {
    fontSize: 8,
    fontWeight: '800',
    color: colors.primary,
  },
  tokenSelectorText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  swapArrowWrapper: {
    alignItems: 'center',
    marginVertical: 2,
    zIndex: 1,
  },
  swapArrowBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primaryMuted,
    borderWidth: 2,
    borderColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.errorMuted,
    borderRadius: borderRadius.sm,
    padding: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  errorText: {
    flex: 1,
    fontSize: fontSize.xs,
    color: colors.error,
    fontWeight: '600',
  },
  successBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.successMuted,
    borderRadius: borderRadius.sm,
    padding: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  successText: {
    flex: 1,
    fontSize: fontSize.xs,
    color: colors.success,
    fontWeight: '600',
    fontFamily: 'SpaceMono-Regular',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: borderRadius.lg,
    paddingVertical: 16,
    marginTop: spacing.lg,
  },
  btnBuy: {
    backgroundColor: '#8B5CF6',
  },
  btnSell: {
    backgroundColor: '#8B5CF6',
  },
  btnDisabled: {
    backgroundColor: '#252538',
  },
  btnSuccess: {
    backgroundColor: colors.success,
  },
  btnError: {
    backgroundColor: colors.error,
  },
  actionBtnText: {
    fontSize: fontSize.md,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: 0.3,
  },
  slippageNote: {
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
    fontWeight: '500',
  },
  noWallet: {
    backgroundColor: '#12121A',
    borderRadius: borderRadius.lg,
    padding: spacing.xxl,
    marginBottom: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.12)',
  },
  noWalletText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: '600',
    textAlign: 'center',
  },
});
