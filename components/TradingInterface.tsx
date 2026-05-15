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
import { CircleAlert as AlertCircle, CircleCheck as CheckCircle, Info } from 'lucide-react-native';
import { colors, spacing, fontSize, borderRadius } from '@/constants/theme';
import { jupiterSwapService, JupiterQuote } from '@/services/jupiter/swapService';
import { useWallet } from '@/contexts/WalletContext';
import { PublicKey, VersionedTransaction } from '@solana/web3.js';
import { SecureWalletManager } from '@/lib/wallet/SecureWalletManager';
import { ExternalWalletAdapter } from '@/lib/wallet/ExternalWalletAdapter';

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const SOL_LOGO = 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png';

// Estimated Solana transaction costs (in SOL)
const NETWORK_FEE = 0.000005;   // 5000 lamports base fee
const PRIORITY_FEE = 0.0001;    // ~100k lamports priority fee (Jupiter swaps)

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

function fmtSol(n: number): string {
  if (n === 0) return '0';
  if (n < 0.0001) return n.toExponential(2);
  return n.toFixed(6).replace(/\.?0+$/, '');
}

function fmtToken(n: number, dec: number): string {
  if (n === 0) return '0';
  if (n < 0.001) return n.toExponential(3);
  const fixed = Math.min(dec, 6);
  return n.toLocaleString('en-US', { maximumFractionDigits: fixed });
}

function fmtAmt(n: number, decimals = 4): string {
  if (n === 0) return '0';
  if (n < 0.0001) return n.toExponential(2);
  return n.toFixed(decimals).replace(/\.?0+$/, '');
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

  const fromSymbol = mode === 'buy' ? 'SOL' : tokenSymbol.toUpperCase();
  const toSymbol = mode === 'buy' ? tokenSymbol.toUpperCase() : 'SOL';
  const sym = tokenSymbol.toUpperCase();

  // Debounced quote fetch
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

  // Reset on mode change
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
      ? Math.max(0, realSolBalance - NETWORK_FEE - PRIORITY_FEE - 0.001)
      : realTokenBalance;
    const val = maxBal * pct;
    setAmount(val > 0 ? fmtAmt(val, 6) : '');
  };

  const handleAmountChange = (v: string) => {
    setAmount(v);
    setActivePct(null);
    if (error) setError(null);
    if (status === 'error') setStatus('idle');
  };

  // ── Derived quote values ──────────────────────────────────────────────────

  const getOutAmount = (): number => {
    if (!quote) return 0;
    const decimals = mode === 'buy' ? tokenDecimals : 9;
    return parseInt(quote.outAmount) / Math.pow(10, decimals);
  };

  const getMinReceived = (): number => {
    const out = getOutAmount();
    return out * (1 - slippage / 100);
  };

  const getPriceImpact = (): number => {
    if (!quote) return 0;
    return parseFloat((quote as any).priceImpactPct ?? '0') || 0;
  };

  const getTotalRequired = (): number => {
    if (mode !== 'buy') return 0;
    const inputAmt = parseFloat(amount) || 0;
    return inputAmt + NETWORK_FEE + PRIORITY_FEE;
  };

  const getRemainingBalance = (): number => {
    if (mode !== 'buy') return 0;
    return Math.max(0, realSolBalance - getTotalRequired());
  };

  const hasInsufficientBalance = (): boolean => {
    const parsed = parseFloat(amount) || 0;
    if (mode === 'buy') {
      return getTotalRequired() > realSolBalance;
    }
    return parsed > realTokenBalance;
  };

  // ── Execute ───────────────────────────────────────────────────────────────

  const executeSwap = async () => {
    if (!activeAddress) { setError('Connect a wallet to trade'); setStatus('error'); return; }
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) { setError('Enter an amount'); setStatus('error'); return; }

    if (hasInsufficientBalance()) {
      if (mode === 'buy') {
        setError(`Need ${fmtSol(getTotalRequired())} SOL total (input + fees). Balance: ${fmtSol(realSolBalance)} SOL`);
      } else {
        setError(`Insufficient ${sym}. Balance: ${fmtToken(realTokenBalance, tokenDecimals)}`);
      }
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
      setTimeout(() => {
        setAmount(''); setQuote(null); setStatus('idle');
        setTxSignature(null); setActivePct(null);
      }, 5000);
    } catch (err: any) {
      let msg = err?.message || 'Transaction failed';
      if (msg.includes('User rejected') || msg.includes('rejected')) msg = 'Rejected in wallet';
      else if (msg.includes('insufficient') || msg.includes('balance')) msg = 'Insufficient balance for transaction';
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
  const canExecute = !isProcessing && !!amount && parseFloat(amount) > 0 && !hasInsufficientBalance();
  const priceImpact = getPriceImpact();
  const outAmt = getOutAmount();
  const minReceived = getMinReceived();
  const totalRequired = getTotalRequired();
  const remainingBalance = getRemainingBalance();
  const showBreakdown = status === 'quote_ready' && !!quote;

  if (!activeAddress) {
    return (
      <View style={s.container}>
        <Text style={s.noWalletText}>Connect a wallet to trade</Text>
      </View>
    );
  }

  return (
    <View style={s.container}>
      {/* ── BUY / SELL toggle ── */}
      <View style={s.modeToggle}>
        <TouchableOpacity
          style={[s.modeBtn, mode === 'buy' && s.modeBtnBuyActive]}
          onPress={() => setMode('buy')}
          disabled={isProcessing}
          activeOpacity={0.8}
        >
          <Text style={[s.modeBtnText, mode === 'buy' && s.modeBtnActive]}>BUY</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.modeBtn, mode === 'sell' && s.modeBtnSellActive]}
          onPress={() => setMode('sell')}
          disabled={isProcessing}
          activeOpacity={0.8}
        >
          <Text style={[s.modeBtnText, mode === 'sell' && s.modeBtnSellActive]}>SELL</Text>
        </TouchableOpacity>
      </View>

      {/* ── Balance row ── */}
      <View style={s.balanceRow}>
        <Text style={s.balanceLabel}>
          {mode === 'buy' ? 'SOL Balance' : `${sym} Balance`}
        </Text>
        <Text style={s.balanceValue}>
          {mode === 'buy'
            ? `${fmtSol(realSolBalance)} SOL`
            : `${fmtToken(realTokenBalance, tokenDecimals)} ${sym}`}
        </Text>
      </View>

      {/* ── Input row ── */}
      <View style={[s.inputRow, hasInsufficientBalance() && parseFloat(amount) > 0 && s.inputRowError]}>
        <View style={s.inputTokenBadge}>
          {mode === 'buy'
            ? <Image source={{ uri: SOL_LOGO }} style={s.inputLogo} />
            : tokenLogoUrl
              ? <Image source={{ uri: tokenLogoUrl }} style={s.inputLogo} />
              : <View style={[s.inputLogo, s.inputLogoFallback]}>
                  <Text style={s.inputLogoText}>{sym.slice(0, 2)}</Text>
                </View>
          }
          <Text style={s.inputTokenSym}>{fromSymbol}</Text>
        </View>
        <TextInput
          style={s.amountInput}
          value={amount}
          onChangeText={handleAmountChange}
          placeholder="0.00"
          placeholderTextColor="rgba(255,255,255,0.2)"
          keyboardType="decimal-pad"
          editable={!isProcessing}
          textAlign="right"
        />
      </View>

      {/* ── Percentage quick-set ── */}
      <View style={s.pctRow}>
        {PCT_PRESETS.map(({ label, pct }) => (
          <TouchableOpacity
            key={label}
            style={[s.pctBtn, activePct === pct && s.pctBtnActive]}
            onPress={() => applyPct(pct)}
            disabled={isProcessing}
            activeOpacity={0.75}
          >
            <Text style={[s.pctBtnText, activePct === pct && s.pctBtnTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Fetching quote indicator ── */}
      {status === 'fetching_quote' && (
        <View style={s.fetchingRow}>
          <ActivityIndicator size="small" color="#A78BFA" />
          <Text style={s.fetchingText}>Fetching best price…</Text>
        </View>
      )}

      {/* ── Quote breakdown panel ── */}
      {showBreakdown && (
        <View style={s.breakdownPanel}>
          <QuoteRow label="You pay" value={`${parseFloat(amount)} ${fromSymbol}`} bold />
          <View style={s.breakdownDivider} />
          <QuoteRow
            label="You receive"
            value={`≈ ${fmtToken(outAmt, mode === 'buy' ? tokenDecimals : 9)} ${toSymbol}`}
            highlight
          />
          <QuoteRow
            label={`Min. received (${slippage}% slip)`}
            value={`≈ ${fmtToken(minReceived, mode === 'buy' ? tokenDecimals : 9)} ${toSymbol}`}
            muted
          />
          {priceImpact > 0.01 && (
            <QuoteRow
              label="Price impact"
              value={`${priceImpact.toFixed(2)}%`}
              warn={priceImpact > 2}
              danger={priceImpact > 5}
            />
          )}
          <View style={s.breakdownDivider} />
          <QuoteRow label="Network fee" value={`≈ ${fmtSol(NETWORK_FEE)} SOL`} muted />
          <QuoteRow label="Priority fee" value={`≈ ${fmtSol(PRIORITY_FEE)} SOL`} muted />
          {mode === 'buy' && (
            <>
              <View style={s.breakdownDivider} />
              <QuoteRow
                label="Total required"
                value={`≈ ${fmtSol(totalRequired)} SOL`}
                bold
                danger={hasInsufficientBalance()}
              />
              <QuoteRow
                label="Remaining balance"
                value={`≈ ${fmtSol(remainingBalance)} SOL`}
                muted
              />
            </>
          )}
        </View>
      )}

      {/* ── Idle / empty state hint ── */}
      {!showBreakdown && status !== 'fetching_quote' && (
        <View style={s.hintRow}>
          <Info size={12} color="rgba(255,255,255,0.2)" strokeWidth={2} />
          <Text style={s.hintText}>
            {parseFloat(amount) > 0
              ? 'fetching quote…'
              : `Enter ${mode === 'buy' ? 'SOL' : sym} amount to see price`}
          </Text>
        </View>
      )}

      {/* ── Error ── */}
      {status === 'error' && error && (
        <View style={s.errorRow}>
          <AlertCircle size={13} color="#EC4899" />
          <Text style={s.errorText}>{error}</Text>
        </View>
      )}

      {/* ── Success ── */}
      {status === 'success' && txSignature && (
        <View style={s.successRow}>
          <CheckCircle size={13} color="#10B981" />
          <Text style={s.successLabel}>Transaction confirmed</Text>
          <Text style={s.successSig} numberOfLines={1} ellipsizeMode="middle">
            {txSignature.slice(0, 8)}…{txSignature.slice(-6)}
          </Text>
        </View>
      )}

      {/* ── Execute button ── */}
      <TouchableOpacity
        style={[s.execBtnWrap, !canExecute && s.execBtnWrapDisabled]}
        onPress={executeSwap}
        disabled={!canExecute}
        activeOpacity={0.88}
      >
        <LinearGradient
          colors={mode === 'buy'
            ? (hasInsufficientBalance() && parseFloat(amount) > 0
                ? ['#4B5563', '#374151'] as [string, string]
                : ['#7C3AED', '#5B21B6'] as [string, string])
            : ['#C026D3', '#9D174D'] as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.execBtnGrad}
        >
          {isProcessing
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={s.execBtnText}>
                {status === 'success'
                  ? `Swapped ${sym} successfully`
                  : hasInsufficientBalance() && parseFloat(amount) > 0
                    ? 'Insufficient Balance'
                    : mode === 'buy'
                      ? `Buy ${sym}`
                      : `Sell ${sym}`}
              </Text>}
        </LinearGradient>
      </TouchableOpacity>

      {isProcessing && (
        <Text style={s.processingNote}>
          {status === 'signing' ? 'Waiting for signature…'
            : status === 'sending' ? 'Broadcasting transaction…'
            : 'Confirming on-chain…'}
        </Text>
      )}
    </View>
  );
}

// ── Sub-component for each quote row ─────────────────────────────────────────
function QuoteRow({
  label,
  value,
  bold,
  highlight,
  muted,
  warn,
  danger,
}: {
  label: string;
  value: string;
  bold?: boolean;
  highlight?: boolean;
  muted?: boolean;
  warn?: boolean;
  danger?: boolean;
}) {
  const valueColor = danger ? '#EF4444' : warn ? '#F59E0B' : highlight ? '#A78BFA' : muted ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.75)';
  return (
    <View style={qr.row}>
      <Text style={[qr.label, muted && qr.labelMuted]}>{label}</Text>
      <Text style={[qr.value, bold && qr.valueBold, { color: valueColor }]}>{value}</Text>
    </View>
  );
}

const qr = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  label: { fontSize: 12, color: 'rgba(255,255,255,0.55)', fontWeight: '500', flex: 1 },
  labelMuted: { color: 'rgba(255,255,255,0.3)' },
  value: { fontSize: 12, fontWeight: '600', textAlign: 'right' },
  valueBold: { fontWeight: '800', fontSize: 13 },
});

const s = StyleSheet.create({
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
  modeBtnBuyActive: { backgroundColor: 'rgba(124,58,237,0.85)' },
  modeBtnSellActive: { backgroundColor: 'rgba(192,38,211,0.85)' },
  modeBtnText: {
    fontSize: 13, fontWeight: '800',
    color: 'rgba(255,255,255,0.4)', letterSpacing: 1,
  },
  modeBtnActive: { color: '#fff' },
  // Balance
  balanceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  balanceLabel: { fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: '600' },
  balanceValue: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.75)' },
  // Input
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12, borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.2)',
    paddingHorizontal: 12, paddingVertical: 10, gap: 10,
  },
  inputRowError: { borderColor: 'rgba(239,68,68,0.5)' },
  inputTokenBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(139,92,246,0.15)',
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
  },
  inputLogo: { width: 18, height: 18, borderRadius: 9 },
  inputLogoFallback: {
    backgroundColor: 'rgba(139,92,246,0.3)',
    justifyContent: 'center', alignItems: 'center',
  },
  inputLogoText: { fontSize: 7, fontWeight: '900', color: '#A78BFA' },
  inputTokenSym: { fontSize: 12, fontWeight: '700', color: '#A78BFA' },
  amountInput: {
    flex: 1, fontSize: 22, fontWeight: '700', color: '#fff', minHeight: 34,
  },
  // Percentage
  pctRow: { flexDirection: 'row', gap: 6 },
  pctBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 20, alignItems: 'center',
    backgroundColor: 'rgba(139,92,246,0.1)',
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.2)',
  },
  pctBtnActive: { backgroundColor: 'rgba(139,92,246,0.35)', borderColor: '#A78BFA' },
  pctBtnText: { fontSize: 12, fontWeight: '700', color: 'rgba(167,139,250,0.7)' },
  pctBtnTextActive: { color: '#fff' },
  // Fetching
  fetchingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 8, justifyContent: 'center',
  },
  fetchingText: { fontSize: 12, color: 'rgba(167,139,250,0.7)', fontWeight: '600' },
  // Quote breakdown panel
  breakdownPanel: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  breakdownDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginVertical: 4,
  },
  // Hint
  hintRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 4,
  },
  hintText: { fontSize: 11, color: 'rgba(255,255,255,0.2)', fontStyle: 'italic' },
  // Error / success
  errorRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 7,
    backgroundColor: 'rgba(236,72,153,0.08)',
    borderRadius: 8, padding: 10,
    borderWidth: 1, borderColor: 'rgba(236,72,153,0.18)',
  },
  errorText: { flex: 1, fontSize: 12, color: '#EC4899', fontWeight: '600', lineHeight: 18 },
  successRow: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: 'rgba(16,185,129,0.08)',
    borderRadius: 8, padding: 10,
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.2)',
  },
  successLabel: { fontSize: 12, color: '#10B981', fontWeight: '700', flex: 1 },
  successSig: { fontSize: 10, color: 'rgba(16,185,129,0.7)', fontFamily: 'monospace' },
  // Execute button
  execBtnWrap: { borderRadius: 14, overflow: 'hidden' },
  execBtnWrapDisabled: { opacity: 0.5 },
  execBtnGrad: { alignItems: 'center', justifyContent: 'center', paddingVertical: 15 },
  execBtnText: { fontSize: 16, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  processingNote: {
    textAlign: 'center', fontSize: 11,
    color: 'rgba(167,139,250,0.6)', fontWeight: '500',
  },
});
