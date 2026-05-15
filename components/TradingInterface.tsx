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
import { LinearGradient } from 'expo-linear-gradient';
import { CircleAlert as AlertCircle, CircleCheck as CheckCircle, ArrowUpDown } from 'lucide-react-native';
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

const PCT_PRESETS = [
  { label: '25%', pct: 0.25 },
  { label: '50%', pct: 0.50 },
  { label: '75%', pct: 0.75 },
  { label: 'MAX', pct: 1.00 },
];

function fmtAmt(n: number, decimals = 4): string {
  if (n === 0) return '0';
  if (n < 0.0001) return n.toExponential(2);
  return n.toFixed(decimals).replace(/\.?0+$/, '');
}

function fmtOutput(n: number, decimals: number): string {
  if (n === 0) return '0';
  if (n < 0.001) return n.toExponential(3);
  return n.toFixed(Math.min(decimals, 6)).replace(/\.?0+$/, '');
}

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
  const [activePct, setActivePct] = useState<number | null>(null);

  const solToken = tokens.find(t => t.contract_address === SOL_MINT);
  const thisToken = tokens.find(t => t.contract_address === tokenMint);
  const realSolBalance = solToken ? parseFloat(solToken.balance || '0') : solBalance;
  const realTokenBalance = thisToken ? parseFloat(thisToken.balance || '0') : tokenBalance;

  const availableBalance = mode === 'buy' ? realSolBalance : realTokenBalance;
  const fromSymbol = mode === 'buy' ? 'SOL' : tokenSymbol;
  const toSymbol = mode === 'buy' ? tokenSymbol : 'SOL';
  const sym = tokenSymbol.toUpperCase();

  // Debounced quote fetch on amount change
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

  // Reset quote when mode changes
  useEffect(() => {
    setQuote(null);
    setError(null);
    if (status !== 'idle') setStatus('idle');
    setAmount('');
    setActivePct(null);
  }, [mode]);

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
        setError('No route found — low liquidity');
        setStatus('error');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch quote');
      setStatus('error');
    }
  };

  const applyPct = (pct: number) => {
    setActivePct(pct);
    setError(null);
    if (status === 'error') setStatus('idle');
    const maxBal = mode === 'buy'
      ? Math.max(0, realSolBalance - 0.005)
      : realTokenBalance;
    const val = maxBal * pct;
    if (val > 0) {
      setAmount(fmtAmt(val, 6));
    } else {
      setAmount('');
    }
  };

  const handleAmountChange = (v: string) => {
    setAmount(v);
    setActivePct(null);
    if (error) setError(null);
    if (status === 'error') setStatus('idle');
  };

  const getEstimatedOutput = (): string => {
    if (!quote) return '';
    const decimals = mode === 'buy' ? tokenDecimals : 9;
    const out = parseInt(quote.outAmount) / Math.pow(10, decimals);
    return fmtOutput(out, decimals);
  };

  const getPriceImpact = (): string | null => {
    if (!quote) return null;
    const pi = parseFloat((quote as any).priceImpactPct ?? '0');
    if (isNaN(pi) || pi < 0.01) return null;
    return pi.toFixed(2);
  };

  const executeSwap = async () => {
    if (!activeAddress) { setError('Connect a wallet to trade'); setStatus('error'); return; }
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) { setError('Enter an amount'); setStatus('error'); return; }
    if (mode === 'buy' && parsed > realSolBalance - 0.001) {
      setError(`Need ${(parsed + 0.001).toFixed(4)} SOL (+ fees)`);
      setStatus('error');
      return;
    }
    if (mode === 'sell' && parsed > realTokenBalance) {
      setError(`Insufficient ${tokenSymbol} balance`);
      setStatus('error');
      return;
    }
    if (!quote) { setError('Waiting for quote…'); return; }

    setError(null);
    setStatus('signing');
    try {
      const swapResult = await jupiterSwapService.getSwapTransaction(quote, activeAddress, true);
      if (!swapResult?.swapTransaction) throw new Error('Failed to build transaction');

      let signedTx: VersionedTransaction;
      if (connectedWallet) {
        const txBuf = Buffer.from(swapResult.swapTransaction, 'base64');
        const transaction = VersionedTransaction.deserialize(txBuf);
        signedTx = await ExternalWalletAdapter.signVersionedTransaction(connectedWallet.id, transaction);
      } else if (selectedAccount) {
        signedTx = await signWithKeypair(swapResult.swapTransaction);
      } else {
        throw new Error('No wallet available');
      }

      setStatus('sending');
      const signature = await jupiterSwapService.executeSwap(swapResult.swapTransaction, async () => signedTx);
      if (!signature) throw new Error('Transaction rejected');

      setTxSignature(signature);
      setStatus('success');
      if (refreshPortfolio) await refreshPortfolio();
      if (onTradeComplete) onTradeComplete();
      setTimeout(() => { setAmount(''); setQuote(null); setStatus('idle'); setTxSignature(null); setActivePct(null); }, 4000);
    } catch (err: any) {
      let msg = err?.message || 'Transaction failed';
      if (msg.includes('User rejected') || msg.includes('rejected')) msg = 'Rejected in wallet';
      else if (msg.includes('insufficient') || msg.includes('balance')) msg = 'Insufficient balance';
      setError(msg);
      setStatus('error');
    }
  };

  const signWithKeypair = async (serializedTx: string): Promise<VersionedTransaction> => {
    const walletManager = SecureWalletManager.getInstance();
    if (!walletManager.isUnlocked()) await walletManager.unlockWallet();
    const mnemonic = walletManager.getMnemonic();
    if (!mnemonic || !selectedAccount) throw new Error('Wallet locked');
    const { KeyDerivationManager } = await import('@/lib/crypto/keyDerivation');
    const keypair = KeyDerivationManager.deriveSolanaKeyPair(mnemonic, selectedAccount.accountIndex || 0);
    const txBuf = Buffer.from(serializedTx, 'base64');
    const transaction = VersionedTransaction.deserialize(txBuf);
    transaction.sign([{ publicKey: new PublicKey(selectedAccount.address), secretKey: keypair.secretKey }]);
    return transaction;
  };

  const isProcessing = status === 'signing' || status === 'sending' || status === 'confirming';
  const canExecute = !isProcessing && !!amount && parseFloat(amount) > 0;
  const priceImpact = getPriceImpact();

  if (!activeAddress) {
    return (
      <View style={styles.container}>
        <Text style={styles.noWalletText}>Connect a wallet to trade</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* ── BUY / SELL toggle ── */}
      <View style={styles.modeToggle}>
        <TouchableOpacity
          style={[styles.modeBtn, mode === 'buy' && styles.modeBtnBuyActive]}
          onPress={() => setMode('buy')}
          disabled={isProcessing}
          activeOpacity={0.8}
        >
          <Text style={[styles.modeBtnText, mode === 'buy' && styles.modeBtnTextActive]}>BUY</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeBtn, mode === 'sell' && styles.modeBtnSellActive]}
          onPress={() => setMode('sell')}
          disabled={isProcessing}
          activeOpacity={0.8}
        >
          <Text style={[styles.modeBtnText, mode === 'sell' && styles.modeBtnSellTextActive]}>SELL</Text>
        </TouchableOpacity>
      </View>

      {/* ── Balance ── */}
      <View style={styles.balanceRow}>
        <Text style={styles.balanceLabel}>Balance:</Text>
        <Text style={styles.balanceValue}>
          {mode === 'buy'
            ? `${fmtAmt(realSolBalance)} SOL`
            : `${fmtAmt(realTokenBalance, 2)} ${sym}`}
        </Text>
      </View>

      {/* ── Amount input — always visible ── */}
      <View style={styles.inputRow}>
        <View style={styles.inputTokenBadge}>
          {mode === 'buy'
            ? <Image source={{ uri: SOL_LOGO }} style={styles.inputLogo} />
            : tokenLogoUrl
              ? <Image source={{ uri: tokenLogoUrl }} style={styles.inputLogo} />
              : <View style={[styles.inputLogo, styles.inputLogoFallback]}>
                  <Text style={styles.inputLogoText}>{sym.slice(0, 2)}</Text>
                </View>
          }
          <Text style={styles.inputTokenSym}>{fromSymbol}</Text>
        </View>
        <TextInput
          style={styles.amountInput}
          value={amount}
          onChangeText={handleAmountChange}
          placeholder="0.00"
          placeholderTextColor="rgba(255,255,255,0.2)"
          keyboardType="decimal-pad"
          editable={!isProcessing}
          textAlign="right"
        />
      </View>

      {/* ── Percentage quick-set buttons ── */}
      <View style={styles.pctRow}>
        {PCT_PRESETS.map(({ label, pct }) => (
          <TouchableOpacity
            key={label}
            style={[styles.pctBtn, activePct === pct && styles.pctBtnActive]}
            onPress={() => applyPct(pct)}
            disabled={isProcessing}
            activeOpacity={0.75}
          >
            <Text style={[styles.pctBtnText, activePct === pct && styles.pctBtnTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Output estimate ── */}
      <View style={styles.outputRow}>
        <ArrowUpDown size={13} color="rgba(255,255,255,0.3)" strokeWidth={2} />
        {status === 'fetching_quote' ? (
          <ActivityIndicator size="small" color="#A78BFA" style={{ marginLeft: 4 }} />
        ) : status === 'quote_ready' && quote ? (
          <>
            <Text style={styles.outputValue}>
              {getEstimatedOutput()} {toSymbol}
            </Text>
            {priceImpact && (
              <Text style={[styles.impactText, parseFloat(priceImpact) > 2 && styles.impactHigh]}>
                {priceImpact}% impact
              </Text>
            )}
            <Text style={styles.slippageNote}>{slippage}% slip</Text>
          </>
        ) : parseFloat(amount) > 0 && status !== 'error' ? (
          <Text style={styles.outputPlaceholder}>fetching price…</Text>
        ) : (
          <Text style={styles.outputPlaceholder}>enter amount to see price</Text>
        )}
      </View>

      {/* ── Error / Success ── */}
      {status === 'error' && error && (
        <View style={styles.errorRow}>
          <AlertCircle size={12} color="#EC4899" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
      {status === 'success' && txSignature && (
        <View style={styles.successRow}>
          <CheckCircle size={12} color="#A78BFA" />
          <Text style={styles.successText} numberOfLines={1} ellipsizeMode="middle">
            {txSignature}
          </Text>
        </View>
      )}

      {/* ── Execute button ── */}
      <TouchableOpacity
        style={[styles.execBtnWrap, !canExecute && styles.execBtnWrapDisabled]}
        onPress={executeSwap}
        disabled={!canExecute}
        activeOpacity={0.88}
      >
        <LinearGradient
          colors={mode === 'buy' ? ['#7C3AED', '#5B21B6'] : ['#C026D3', '#9D174D']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.execBtnGrad}
        >
          {isProcessing
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.execBtnText}>
                {status === 'success'
                  ? `✓ ${mode === 'buy' ? 'Bought' : 'Sold'} ${sym}`
                  : mode === 'buy'
                    ? `Buy ${sym}`
                    : `Sell ${sym}`}
              </Text>}
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(10,8,20,0.97)',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.18)',
    gap: 10,
  },
  noWalletText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
    paddingVertical: 16,
  },
  // Mode toggle
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    padding: 3,
    gap: 3,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  modeBtnBuyActive: {
    backgroundColor: 'rgba(124,58,237,0.85)',
  },
  modeBtnSellActive: {
    backgroundColor: 'rgba(192,38,211,0.85)',
  },
  modeBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 1,
  },
  modeBtnTextActive: { color: '#fff' },
  modeBtnSellTextActive: { color: '#fff' },
  // Balance
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  balanceLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    fontWeight: '600',
  },
  balanceValue: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.75)',
  },
  // Input
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  inputTokenBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(139,92,246,0.15)',
    borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  inputLogo: { width: 18, height: 18, borderRadius: 9 },
  inputLogoFallback: {
    backgroundColor: 'rgba(139,92,246,0.3)',
    justifyContent: 'center', alignItems: 'center',
  },
  inputLogoText: { fontSize: 7, fontWeight: '900', color: '#A78BFA' },
  inputTokenSym: { fontSize: 12, fontWeight: '700', color: '#A78BFA' },
  amountInput: {
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    minHeight: 34,
  },
  // Percentage buttons
  pctRow: {
    flexDirection: 'row',
    gap: 6,
  },
  pctBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 20,
    alignItems: 'center',
    backgroundColor: 'rgba(139,92,246,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.2)',
  },
  pctBtnActive: {
    backgroundColor: 'rgba(139,92,246,0.35)',
    borderColor: '#A78BFA',
  },
  pctBtnText: { fontSize: 12, fontWeight: '700', color: 'rgba(167,139,250,0.7)' },
  pctBtnTextActive: { color: '#fff' },
  // Output
  outputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 34,
  },
  outputValue: {
    flex: 1,
    fontSize: 14,
    color: '#A78BFA',
    fontWeight: '700',
  },
  outputPlaceholder: {
    flex: 1,
    fontSize: 12,
    color: 'rgba(255,255,255,0.25)',
    fontStyle: 'italic',
  },
  impactText: {
    fontSize: 10,
    color: '#F59E0B',
    fontWeight: '700',
  },
  impactHigh: { color: '#EF4444' },
  slippageNote: { fontSize: 10, color: 'rgba(255,255,255,0.2)' },
  // Error / success
  errorRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(236,72,153,0.08)',
    borderRadius: 8, padding: 8,
    borderWidth: 1, borderColor: 'rgba(236,72,153,0.18)',
  },
  errorText: { flex: 1, fontSize: 11, color: '#EC4899', fontWeight: '600' },
  successRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(139,92,246,0.08)',
    borderRadius: 8, padding: 8,
  },
  successText: {
    flex: 1, fontSize: 10, color: '#A78BFA', fontWeight: '600',
    fontFamily: 'SpaceMono-Regular',
  },
  // Execute button
  execBtnWrap: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  execBtnWrapDisabled: { opacity: 0.5 },
  execBtnGrad: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
  },
  execBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.5,
  },
});
