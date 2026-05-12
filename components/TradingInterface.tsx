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
import { CircleAlert as AlertCircle, CircleCheck as CheckCircle, ChevronRight, Pencil } from 'lucide-react-native';
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
  { label: '0,05', value: 0.05 },
  { label: '0,1',  value: 0.1 },
  { label: '0,2',  value: 0.2 },
];

function fmtSolAmount(n: number): string {
  if (n === 0) return '0';
  if (n < 0.0001) return n.toExponential(2);
  return n.toFixed(4).replace(/\.?0+$/, '');
}

function fmtUsd(n: number): string {
  if (n === 0) return '0';
  if (n < 0.01) return `< $0.01`;
  return `$${n.toFixed(2)}`;
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
  const [switchHint, setSwitchHint] = useState<string | null>(null);

  const solToken = tokens.find(t => t.contract_address === SOL_MINT);
  const thisToken = tokens.find(t => t.contract_address === tokenMint);
  const realSolBalance = solToken ? parseFloat(solToken.balance || '0') : solBalance;
  const realTokenBalance = thisToken ? parseFloat(thisToken.balance || '0') : tokenBalance;

  const solPriceUsd = solToken ? parseFloat((solToken as any).priceUSD || (solToken as any).price_usd || '0') : 0;
  const solUsd = realSolBalance * solPriceUsd;
  const tokenUsd = realTokenBalance * currentPrice;

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
        setError('No route found. Low liquidity.');
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
      setError('Enter an amount');
      setStatus('error');
      return;
    }
    if (tradeMode !== mode) {
      setMode(tradeMode);
      setQuote(null);
      setStatus('idle');
      setError(null);
      const label = tradeMode === 'buy' ? `Buy ${tokenSymbol}` : `Sell ${tokenSymbol}`;
      setSwitchHint(`Switched to ${label} — tap again`);
      setTimeout(() => setSwitchHint(null), 3000);
      return;
    }
    if (tradeMode === 'buy' && parsed > realSolBalance - 0.001) {
      setError(`Need ${(parsed + 0.001).toFixed(4)} SOL (+ fees)`);
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
      setTimeout(() => { setAmount(''); setQuote(null); setStatus('idle'); setTxSignature(null); }, 4000);
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

  const applyMax = () => {
    setError(null);
    setSwitchHint(null);
    if (status === 'error') setStatus('idle');
    if (mode === 'buy') {
      const max = Math.max(0, realSolBalance - 0.005);
      if (max > 0) setAmount(max.toFixed(4));
    } else {
      if (realTokenBalance > 0) setAmount(realTokenBalance.toString());
    }
  };

  const isProcessing = status === 'signing' || status === 'sending' || status === 'confirming';
  const sym = tokenSymbol.toUpperCase();

  // Balance display values
  const displaySolUsd = solUsd > 0 ? `${solUsd.toFixed(2)} $` : null;
  const displaySolAmt = `${fmtSolAmount(realSolBalance)} SOL`;

  if (!activeAddress) {
    return (
      <View style={styles.container}>
        <View style={styles.balanceRow}>
          <View style={styles.balanceDot} />
          <Text style={styles.balanceLabel}>Solde</Text>
          <Text style={styles.balanceValue}>No wallet connected</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* ── Balance row ── */}
      <View style={styles.balanceRow}>
        <View style={styles.balanceDot} />
        <Text style={styles.balanceLabel}>Solde</Text>
        {displaySolUsd && <Text style={styles.balanceSolUsd}>{displaySolUsd}</Text>}
        <View style={styles.balanceSep} />
        <Text style={styles.balanceSolAmt}>{displaySolAmt}</Text>
        <ChevronRight size={13} color="rgba(255,255,255,0.35)" strokeWidth={2.5} />
        <View style={{ flex: 1 }} />
        <TouchableOpacity style={styles.balanceEditBtn} activeOpacity={0.7}>
          <Pencil size={13} color="rgba(255,255,255,0.4)" strokeWidth={2} />
        </TouchableOpacity>
      </View>

      {/* ── Amount input (visible when user taps a preset or types) ── */}
      {amount !== '' && (
        <View style={styles.inputRow}>
          <View style={styles.inputTokenBadge}>
            {mode === 'buy'
              ? <Image source={{ uri: SOL_LOGO }} style={styles.inputLogo} />
              : tokenLogoUrl
                ? <Image source={{ uri: tokenLogoUrl }} style={styles.inputLogo} />
                : <View style={[styles.inputLogo, styles.inputLogoFallback]}><Text style={styles.inputLogoText}>{sym.slice(0,2)}</Text></View>
            }
            <Text style={styles.inputTokenSym}>{fromSymbol}</Text>
          </View>
          <TextInput
            style={styles.amountInput}
            value={amount}
            onChangeText={v => {
              setAmount(v);
              if (error) setError(null);
              if (switchHint) setSwitchHint(null);
              if (status === 'error') setStatus('idle');
            }}
            placeholder="0.00"
            placeholderTextColor="rgba(255,255,255,0.2)"
            keyboardType="decimal-pad"
            editable={!isProcessing}
            textAlign="right"
          />
        </View>
      )}

      {/* ── Estimated output ── */}
      {(status === 'fetching_quote' || status === 'quote_ready') && (
        <View style={styles.outputRow}>
          <Text style={styles.outputLabel}>≈</Text>
          <Text style={styles.outputValue}>
            {status === 'fetching_quote' ? '...' : `${getEstimatedOutput()} ${toSymbol}`}
          </Text>
          {quote && status === 'quote_ready' && (
            <Text style={styles.slippageNote}>{slippage}% slip</Text>
          )}
        </View>
      )}

      {/* ── Hint / Error / Success ── */}
      {switchHint && !error && (
        <Text style={styles.hintText}>{switchHint}</Text>
      )}
      {status === 'error' && error && (
        <View style={styles.errorRow}>
          <AlertCircle size={12} color="#EC4899" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
      {status === 'success' && txSignature && (
        <View style={styles.successRow}>
          <CheckCircle size={12} color="#A78BFA" />
          <Text style={styles.successText} numberOfLines={1} ellipsizeMode="middle">{txSignature}</Text>
        </View>
      )}

      {/* ── Preset amount buttons ── */}
      <View style={styles.presetRow}>
        {BUY_PRESETS.map(p => {
          const active = mode === 'buy' && amount === p.value.toString();
          return (
            <TouchableOpacity
              key={p.label}
              style={[styles.presetBtn, active && styles.presetBtnActive]}
              onPress={() => applyPreset(p.value)}
              disabled={isProcessing}
              activeOpacity={0.75}
            >
              <Text style={[styles.presetBtnText, active && styles.presetBtnTextActive]}>{p.label}</Text>
              <Image source={{ uri: SOL_LOGO }} style={styles.presetSolLogo} />
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity
          style={styles.presetBtnMax}
          onPress={applyMax}
          disabled={isProcessing}
          activeOpacity={0.75}
        >
          <Text style={styles.presetBtnMaxText}>100 %</Text>
        </TouchableOpacity>
      </View>

      {/* ── Buy / Sell action buttons ── */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={styles.actionBtnWrap}
          onPress={() => executeSwap('buy')}
          disabled={isProcessing}
          activeOpacity={0.88}
        >
          <LinearGradient
            colors={['#7C3AED', '#5B21B6']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.actionBtnGrad}
          >
            {isProcessing && mode === 'buy'
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.actionBtnText}>
                  {status === 'success' && mode === 'buy' ? `✓ ${sym}` : `+ ${sym}`}
                </Text>}
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionBtnWrap}
          onPress={() => executeSwap('sell')}
          disabled={isProcessing}
          activeOpacity={0.88}
        >
          <LinearGradient
            colors={['#C026D3', '#9D174D']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.actionBtnGrad}
          >
            {isProcessing && mode === 'sell'
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.actionBtnText}>
                  {status === 'success' && mode === 'sell' ? `✓ ${sym}` : `— ${sym}`}
                </Text>}
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(10,8,20,0.97)',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.15)',
    gap: 8,
  },
  // Balance row
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  balanceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#A78BFA',
  },
  balanceLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.55)',
  },
  balanceSolUsd: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
  },
  balanceSep: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  balanceSolAmt: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
  },
  balanceEditBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: 'rgba(139,92,246,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.2)',
  },
  // Amount input (shows only when amount is entered)
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  inputTokenBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(139,92,246,0.12)',
    borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  inputLogo: { width: 16, height: 16, borderRadius: 8 },
  inputLogoFallback: {
    backgroundColor: 'rgba(139,92,246,0.25)',
    justifyContent: 'center', alignItems: 'center',
  },
  inputLogoText: { fontSize: 6, fontWeight: '800', color: '#A78BFA' },
  inputTokenSym: { fontSize: 11, fontWeight: '700', color: '#A78BFA' },
  amountInput: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  // Output
  outputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 2,
  },
  outputLabel: { fontSize: 11, color: 'rgba(255,255,255,0.3)', fontWeight: '600' },
  outputValue: { flex: 1, fontSize: 12, color: '#A78BFA', fontWeight: '700' },
  slippageNote: { fontSize: 10, color: 'rgba(255,255,255,0.25)' },
  // Hint / error / success
  hintText: {
    fontSize: 11, color: '#A78BFA', fontWeight: '600',
    textAlign: 'center', paddingVertical: 2,
  },
  errorRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(236,72,153,0.08)',
    borderRadius: 8, padding: 8,
    borderWidth: 1, borderColor: 'rgba(236,72,153,0.18)',
  },
  errorText: { flex: 1, fontSize: 11, color: '#EC4899', fontWeight: '600' },
  successRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(139,92,246,0.08)',
    borderRadius: 8, padding: 8,
  },
  successText: { flex: 1, fontSize: 10, color: '#A78BFA', fontWeight: '600', fontFamily: 'SpaceMono-Regular' },
  // Preset buttons
  presetRow: {
    flexDirection: 'row',
    gap: 6,
  },
  presetBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    borderRadius: 24,
    backgroundColor: 'rgba(139,92,246,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.22)',
  },
  presetBtnActive: {
    backgroundColor: 'rgba(139,92,246,0.3)',
    borderColor: '#A78BFA',
  },
  presetBtnText: { fontSize: 13, fontWeight: '700', color: 'rgba(167,139,250,0.8)' },
  presetBtnTextActive: { color: '#fff' },
  presetSolLogo: { width: 14, height: 14, borderRadius: 7 },
  presetBtnMax: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 24,
    backgroundColor: 'rgba(139,92,246,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.35)',
  },
  presetBtnMaxText: { fontSize: 13, fontWeight: '800', color: '#A78BFA' },
  // Action buttons
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtnWrap: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  actionBtnGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 4,
  },
  actionBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.3,
  },
});
