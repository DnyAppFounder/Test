import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Image,
} from 'react-native';
import { CircleAlert as AlertCircle, CircleCheck as CheckCircle, Wallet, TrendingUp, TrendingDown } from 'lucide-react-native';
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

const BUY_PRESETS = [
  { label: '0.05', value: 0.05 },
  { label: '0.1',  value: 0.1 },
  { label: '0.2',  value: 0.2 },
];

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
  const { selectedAccount, connectedWallet, activeAddress, tokens, refreshPortfolio } = useWallet();
  const [mode, setMode] = useState<TradeMode>('buy');
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState<JupiterQuote | null>(null);
  const [status, setStatus] = useState<TradeStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [slippage] = useState(0.5);
  const [switchHint, setSwitchHint] = useState<string | null>(null);

  const solToken = tokens.find(t => t.contract_address === SOL_MINT);
  const thisToken = tokens.find(t => t.contract_address === tokenMint);
  const realSolBalance = solToken ? parseFloat(solToken.balance || '0') : solBalance;
  const realTokenBalance = thisToken ? parseFloat(thisToken.balance || '0') : tokenBalance;

  const solUsd = realSolBalance * (solToken ? parseFloat((solToken as any).priceUSD || '0') : 0);
  const tokenUsd = realTokenBalance * currentPrice;

  const fromBalance = mode === 'buy' ? realSolBalance : realTokenBalance;
  const fromSymbol = mode === 'buy' ? 'SOL' : tokenSymbol;
  const toSymbol = mode === 'buy' ? tokenSymbol : 'SOL';

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

  const executeSwap = async (tradeMode: TradeMode) => {
    if (!activeAddress) {
      setError('Connect a wallet to trade');
      setStatus('error');
      return;
    }

    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) {
      setError('Enter an amount to trade');
      setStatus('error');
      return;
    }

    // If switching modes, show a hint and wait for user to tap again
    if (tradeMode !== mode) {
      setMode(tradeMode);
      setQuote(null);
      setStatus('idle');
      setError(null);
      const label = tradeMode === 'buy' ? `Buy ${tokenSymbol}` : `Sell ${tokenSymbol}`;
      setSwitchHint(`Switched to ${label} — tap again to confirm`);
      setTimeout(() => setSwitchHint(null), 3500);
      return;
    }

    // Pre-execution balance check
    if (tradeMode === 'buy' && parsed > realSolBalance - 0.001) {
      setError(`Insufficient SOL balance (need ${(parsed + 0.001).toFixed(4)} SOL)`);
      setStatus('error');
      return;
    }
    if (tradeMode === 'sell' && parsed > realTokenBalance) {
      setError(`Insufficient ${tokenSymbol} balance`);
      setStatus('error');
      return;
    }

    if (!quote) return;
    setError(null);
    setSwitchHint(null);
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
      if (refreshPortfolio) await refreshPortfolio();
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
      else if (msg.includes('insufficient') || msg.includes('balance')) msg = 'Insufficient balance for this trade';
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
    if (!quote) return '—';
    const decimals = mode === 'buy' ? tokenDecimals : 9;
    const out = parseInt(quote.outAmount) / Math.pow(10, decimals);
    return out < 0.001 ? out.toExponential(3) : out.toFixed(Math.min(decimals, 6));
  };

  const applyPreset = (val: number) => {
    setMode('buy');
    setAmount(val.toString());
    setError(null);
    setSwitchHint(null);
    if (status === 'error') setStatus('idle');
  };

  const applyMax = (tradeMode: TradeMode) => {
    setError(null);
    setSwitchHint(null);
    if (status === 'error') setStatus('idle');
    if (tradeMode === 'buy') {
      const max = Math.max(0, realSolBalance - 0.005);
      if (max > 0) { setMode('buy'); setAmount(max.toFixed(4)); }
    } else {
      if (realTokenBalance > 0) { setMode('sell'); setAmount(realTokenBalance.toString()); }
    }
  };

  const isProcessing = status === 'signing' || status === 'sending' || status === 'confirming';
  const canBuy = status === 'quote_ready' && mode === 'buy' && !!quote && !isProcessing;
  const canSell = status === 'quote_ready' && mode === 'sell' && !!quote && !isProcessing;

  const getBuyLabel = () => {
    if (!activeAddress) return 'Connect Wallet';
    if (!amount || parseFloat(amount) <= 0) return `Buy ${tokenSymbol}`;
    if (isProcessing && mode === 'buy') return 'Pending…';
    if (status === 'signing' && mode === 'buy') return 'Signing…';
    if (status === 'success' && mode === 'buy') return 'Bought!';
    if (mode !== 'buy') return `Buy ${tokenSymbol}`;
    if (status === 'fetching_quote') return 'Quoting…';
    return `Buy ${tokenSymbol}`;
  };

  const getSellLabel = () => {
    if (!activeAddress) return 'Connect Wallet';
    if (!amount || parseFloat(amount) <= 0) return `Sell ${tokenSymbol}`;
    if (isProcessing && mode === 'sell') return 'Pending…';
    if (status === 'signing' && mode === 'sell') return 'Signing…';
    if (status === 'success' && mode === 'sell') return 'Sold!';
    if (mode !== 'sell') return `Sell ${tokenSymbol}`;
    if (status === 'fetching_quote') return 'Quoting…';
    return `Sell ${tokenSymbol}`;
  };

  if (!activeAddress) {
    return (
      <View style={styles.noWallet}>
        <Wallet size={22} color="rgba(167,139,250,0.4)" strokeWidth={1.5} />
        <Text style={styles.noWalletText}>Connect or import a wallet to trade</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Glass balance card */}
      <View style={styles.balanceCard}>
        <View style={styles.balanceItem}>
          <Image source={{ uri: SOL_LOGO }} style={styles.balanceLogo} />
          <View>
            <Text style={styles.balanceAmount}>{realSolBalance.toFixed(4)} SOL</Text>
            {solUsd > 0 && <Text style={styles.balanceUsd}>${solUsd.toFixed(2)}</Text>}
          </View>
        </View>
        <View style={styles.balanceDivider} />
        <View style={styles.balanceItem}>
          {tokenLogoUrl ? (
            <Image source={{ uri: tokenLogoUrl }} style={styles.balanceLogo} />
          ) : (
            <View style={[styles.balanceLogo, styles.balanceLogoFallback]}>
              <Text style={styles.balanceLogoText}>{tokenSymbol.slice(0, 2)}</Text>
            </View>
          )}
          <View>
            <Text style={styles.balanceAmount}>
              {realTokenBalance < 0.0001 && realTokenBalance > 0
                ? realTokenBalance.toExponential(2)
                : realTokenBalance.toFixed(4)}{' '}
              {tokenSymbol}
            </Text>
            {tokenUsd > 0 && <Text style={styles.balanceUsd}>${tokenUsd.toFixed(2)}</Text>}
          </View>
        </View>
      </View>

      {/* Preset amount buttons */}
      <View style={styles.presetRow}>
        {BUY_PRESETS.map(p => (
          <TouchableOpacity
            key={p.label}
            style={[styles.presetBtn, mode === 'buy' && amount === p.value.toString() && styles.presetBtnActive]}
            onPress={() => applyPreset(p.value)}
            disabled={isProcessing}
            activeOpacity={0.75}
          >
            <Text style={[styles.presetBtnText, mode === 'buy' && amount === p.value.toString() && styles.presetBtnTextActive]}>
              {p.label} SOL
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={styles.presetBtnMagenta}
          onPress={() => applyMax(mode)}
          disabled={isProcessing}
          activeOpacity={0.75}
        >
          <Text style={styles.presetBtnMagentaText}>100%</Text>
        </TouchableOpacity>
      </View>

      {/* Amount input */}
      <View style={styles.inputWrap}>
        <View style={styles.inputTokenBadge}>
          {mode === 'buy' ? (
            <Image source={{ uri: SOL_LOGO }} style={styles.inputTokenLogo} />
          ) : tokenLogoUrl ? (
            <Image source={{ uri: tokenLogoUrl }} style={styles.inputTokenLogo} />
          ) : (
            <View style={[styles.inputTokenLogo, styles.inputTokenLogoFallback]}>
              <Text style={styles.inputTokenLogoText}>{fromSymbol.slice(0, 2)}</Text>
            </View>
          )}
          <Text style={styles.inputTokenSymbol}>{fromSymbol}</Text>
        </View>
        <TextInput
          style={styles.amountInput}
          value={amount}
          onChangeText={v => { setAmount(v); if (error) setError(null); if (switchHint) setSwitchHint(null); if (status === 'error') setStatus('idle'); }}
          placeholder="0.00"
          placeholderTextColor="rgba(255,255,255,0.2)"
          keyboardType="decimal-pad"
          editable={!isProcessing}
          textAlign="right"
        />
      </View>

      {/* Estimated output */}
      {(status === 'fetching_quote' || status === 'quote_ready') && (
        <View style={styles.outputRow}>
          <Text style={styles.outputLabel}>You receive ≈</Text>
          <Text style={styles.outputValue}>
            {status === 'fetching_quote' ? '...' : `${getEstimatedOutput()} ${toSymbol}`}
          </Text>
          {quote && status === 'quote_ready' && (
            <Text style={styles.slippageNote}>
              {slippage}% slip · {((quote.priceImpactPct || 0) * 100).toFixed(2)}% impact
            </Text>
          )}
        </View>
      )}

      {/* Mode switch hint */}
      {switchHint && !error && (
        <View style={styles.hintBox}>
          <Text style={styles.hintText}>{switchHint}</Text>
        </View>
      )}

      {/* Error / Success */}
      {status === 'error' && error && (
        <View style={styles.errorBox}>
          <AlertCircle size={13} color="#EC4899" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
      {status === 'success' && txSignature && (
        <View style={styles.successBox}>
          <CheckCircle size={13} color="#A78BFA" />
          <Text style={styles.successText} numberOfLines={1} ellipsizeMode="middle">
            {txSignature}
          </Text>
        </View>
      )}

      {/* Side-by-side Buy / Sell buttons */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.actionBtnBuy, (!canBuy && mode !== 'buy') && styles.actionBtnDim]}
          onPress={() => {
            if (mode !== 'buy') { setMode('buy'); setQuote(null); setStatus('idle'); }
            else executeSwap('buy');
          }}
          disabled={isProcessing}
          activeOpacity={0.85}
        >
          {isProcessing && mode === 'buy' ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <TrendingUp size={15} color="#fff" strokeWidth={2.5} />
          )}
          <Text style={styles.actionBtnText}>{getBuyLabel()}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtnSell, (!canSell && mode !== 'sell') && styles.actionBtnDim]}
          onPress={() => {
            if (mode !== 'sell') { setMode('sell'); setQuote(null); setStatus('idle'); }
            else executeSwap('sell');
          }}
          disabled={isProcessing}
          activeOpacity={0.85}
        >
          {isProcessing && mode === 'sell' ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <TrendingDown size={15} color="#fff" strokeWidth={2.5} />
          )}
          <Text style={styles.actionBtnText}>{getSellLabel()}</Text>
        </TouchableOpacity>
      </View>

      {/* Active mode indicator */}
      <Text style={styles.modeHint}>
        {mode === 'buy'
          ? `Enter SOL amount to buy ${tokenSymbol}`
          : `Enter ${tokenSymbol} amount to sell`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(13,11,25,0.95)',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.18)',
    gap: 10,
  },
  // Glass balance card
  balanceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(139,92,246,0.07)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.15)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 0,
  },
  balanceItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  balanceDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(139,92,246,0.18)',
    marginHorizontal: 12,
  },
  balanceLogo: {
    width: 26, height: 26, borderRadius: 13,
  },
  balanceLogoFallback: {
    backgroundColor: 'rgba(139,92,246,0.2)',
    justifyContent: 'center', alignItems: 'center',
  },
  balanceLogoText: { fontSize: 8, fontWeight: '800', color: '#A78BFA' },
  balanceAmount: { fontSize: 13, fontWeight: '700', color: '#fff' },
  balanceUsd: { fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: '500', marginTop: 1 },
  // Preset buttons
  presetRow: {
    flexDirection: 'row',
    gap: 6,
  },
  presetBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: 'rgba(139,92,246,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.2)',
  },
  presetBtnActive: {
    backgroundColor: 'rgba(139,92,246,0.3)',
    borderColor: 'rgba(167,139,250,0.5)',
  },
  presetBtnText: { fontSize: 11, fontWeight: '700', color: 'rgba(167,139,250,0.7)' },
  presetBtnTextActive: { color: '#A78BFA' },
  presetBtnMagenta: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: 'rgba(236,72,153,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(236,72,153,0.25)',
  },
  presetBtnMagentaText: { fontSize: 11, fontWeight: '700', color: '#EC4899' },
  // Amount input
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.18)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  inputTokenBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(139,92,246,0.12)',
    borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.2)',
  },
  inputTokenLogo: { width: 18, height: 18, borderRadius: 9 },
  inputTokenLogoFallback: {
    backgroundColor: 'rgba(139,92,246,0.25)',
    justifyContent: 'center', alignItems: 'center',
  },
  inputTokenLogoText: { fontSize: 7, fontWeight: '800', color: '#A78BFA' },
  inputTokenSymbol: { fontSize: 12, fontWeight: '700', color: '#A78BFA' },
  amountInput: {
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
  },
  // Output row
  outputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(139,92,246,0.06)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  outputLabel: { fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: '600' },
  outputValue: { flex: 1, fontSize: 12, color: '#A78BFA', fontWeight: '700', textAlign: 'right' },
  slippageNote: { fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: '500' },
  hintBox: {
    backgroundColor: 'rgba(139,92,246,0.08)',
    borderRadius: 8, padding: 10,
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.2)',
  },
  hintText: { fontSize: 11, color: '#A78BFA', fontWeight: '600', textAlign: 'center' },
  // Error / Success
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(236,72,153,0.08)',
    borderRadius: 8, padding: 10,
    borderWidth: 1, borderColor: 'rgba(236,72,153,0.2)',
  },
  errorText: { flex: 1, fontSize: 11, color: '#EC4899', fontWeight: '600' },
  successBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(139,92,246,0.1)',
    borderRadius: 8, padding: 10,
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.25)',
  },
  successText: {
    flex: 1, fontSize: 10, color: '#A78BFA', fontWeight: '600',
    fontFamily: 'SpaceMono-Regular',
  },
  // Side-by-side action buttons
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtnBuy: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#7C3AED',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.4)',
  },
  actionBtnSell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#BE185D',
    borderWidth: 1,
    borderColor: 'rgba(236,72,153,0.4)',
  },
  actionBtnDim: { opacity: 0.5 },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.2,
  },
  modeHint: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.25)',
    textAlign: 'center',
    fontWeight: '500',
  },
  noWallet: {
    backgroundColor: 'rgba(13,11,25,0.95)',
    borderRadius: borderRadius.lg,
    padding: spacing.xxl,
    marginBottom: spacing.lg,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.15)',
  },
  noWalletText: {
    fontSize: fontSize.sm,
    color: 'rgba(255,255,255,0.35)',
    fontWeight: '600',
    textAlign: 'center',
  },
});
