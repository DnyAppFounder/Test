import { useState, useEffect, useCallback } from 'react';
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
  SafeAreaView,
  Modal,
  Image,
  FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  ChevronDown,
  RefreshCw,
  Info,
  ArrowRight,
  Shield,
  ChevronRight,
  CircleCheck as CheckCircle,
  Search,
  X,
} from 'lucide-react-native';
import { useWallet } from '@/contexts/WalletContext';
import { jupiterSwapService } from '@/services/jupiter/swapService';
import { getSolPrice, SolanaPriceService } from '@/services/solana/priceService';
import { ExternalWalletAdapter } from '@/lib/wallet/ExternalWalletAdapter';
import { SecureWalletManager } from '@/lib/wallet/SecureWalletManager';
import { KeyDerivationManager } from '@/lib/crypto/keyDerivation';
import { PublicKey, VersionedTransaction } from '@solana/web3.js';
import { colors, spacing, borderRadius, fontSize } from '@/constants/theme';
import { Token } from '@/types/crypto';

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const DAWEN_MINT = '43m6D8gCagyJ4K6NjETr3wjSUUSAAwaFznKbCUECpump';

// Synthetic SOL token entry for use as input selector item
const SOL_TOKEN: Token = {
  id: 'solana-native',
  blockchain_id: 'solana',
  contract_address: SOL_MINT,
  symbol: 'SOL',
  name: 'Solana',
  decimals: 9,
  logo_url: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
  is_verified: true,
  coingecko_id: null,
};

type BuyStatus = 'idle' | 'quoting' | 'quote_ready' | 'signing' | 'sending' | 'success' | 'error';

const priceService = new SolanaPriceService();
const PRESETS = ['0.1', '0.5', '1', '2', '5'];

// ─── Token Logo ──────────────────────────────────────────────────────────────

function TokenLogo({ token, size = 32 }: { token: Token; size?: number }) {
  const [imgError, setImgError] = useState(false);
  const radius = size / 2;

  if (token.logo_url && !imgError) {
    return (
      <Image
        source={{ uri: token.logo_url }}
        style={{ width: size, height: size, borderRadius: radius }}
        onError={() => setImgError(true)}
      />
    );
  }

  const letter = (token.symbol || token.name || '?')[0].toUpperCase();
  return (
    <View style={[{
      width: size, height: size, borderRadius: radius,
      backgroundColor: '#1E1E2E', justifyContent: 'center', alignItems: 'center',
    }]}>
      <Text style={{ fontSize: size * 0.4, fontWeight: '900', color: colors.textPrimary }}>
        {letter}
      </Text>
    </View>
  );
}

// ─── Token Selector Modal ─────────────────────────────────────────────────────

interface TokenSelectorProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (token: Token) => void;
  tokens: Token[];
  title: string;
  /** If true, show wallet balances */
  showBalance?: boolean;
}

function TokenSelectorModal({ visible, onClose, onSelect, tokens, title, showBalance }: TokenSelectorProps) {
  const [query, setQuery] = useState('');

  const filtered = query.trim()
    ? tokens.filter(t =>
        t.symbol.toLowerCase().includes(query.toLowerCase()) ||
        t.name.toLowerCase().includes(query.toLowerCase()) ||
        (t.contract_address ?? '').toLowerCase().includes(query.toLowerCase())
      )
    : tokens;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={ms.overlay}>
        <View style={ms.sheet}>
          <View style={ms.handle} />
          <View style={ms.header}>
            <Text style={ms.title}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={ms.closeBtn}>
              <X size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <View style={ms.searchRow}>
            <Search size={16} color={colors.textMuted} />
            <TextInput
              style={ms.searchInput}
              placeholder="Search by name, symbol or mint"
              placeholderTextColor={colors.textMuted}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
            />
          </View>
          <FlatList
            data={filtered}
            keyExtractor={item => item.id}
            contentContainerStyle={{ paddingBottom: 20 }}
            renderItem={({ item }) => {
              const uiBalance = item.balance
                ? (parseFloat(item.balance) / Math.pow(10, item.decimals)).toFixed(4)
                : null;
              return (
                <TouchableOpacity style={ms.tokenRow} onPress={() => { onSelect(item); onClose(); }} activeOpacity={0.75}>
                  <TokenLogo token={item} size={38} />
                  <View style={ms.tokenInfo}>
                    <Text style={ms.tokenSymbol}>{item.symbol}</Text>
                    <Text style={ms.tokenName} numberOfLines={1}>{item.name}</Text>
                    {item.contract_address && item.contract_address !== SOL_MINT && (
                      <Text style={ms.tokenMint} numberOfLines={1}>
                        {item.contract_address.slice(0, 8)}...{item.contract_address.slice(-4)}
                      </Text>
                    )}
                  </View>
                  {showBalance && uiBalance !== null && (
                    <Text style={ms.tokenBalance}>{uiBalance}</Text>
                  )}
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <Text style={ms.empty}>No tokens found</Text>
            }
          />
        </View>
      </View>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function BuyScreen() {
  const router = useRouter();
  const { selectedAccount, connectedWallet, activeAddress, refreshWallet, nativeBalance, tokens } = useWallet();

  // Input token (what the user pays with)
  const [inputToken, setInputToken] = useState<Token>(SOL_TOKEN);
  // Output token (what the user receives)
  const [outputToken, setOutputToken] = useState<Token | null>(null);

  const [inputAmount, setInputAmount] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [status, setStatus] = useState<BuyStatus>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [quote, setQuote] = useState<any>(null);
  const [quoteOutAmount, setQuoteOutAmount] = useState<string | null>(null);

  const [solPrice, setSolPrice] = useState(0);
  const [outputTokenPrice, setOutputTokenPrice] = useState(0);

  const [showInputSelector, setShowInputSelector] = useState(false);
  const [showOutputSelector, setShowOutputSelector] = useState(false);

  const hasWallet = !!activeAddress;
  const parsedAmount = parseFloat(inputAmount);
  const hasValidAmount = !isNaN(parsedAmount) && parsedAmount > 0;
  const hasTokens = !!inputToken && !!outputToken;

  // Build the list of all tokens the user can pay with (SOL + owned SPL tokens)
  const inputTokenList: Token[] = [
    { ...SOL_TOKEN, balance: String(Math.floor(nativeBalance * 1e9)) },
    ...tokens.filter(t => t.contract_address !== SOL_MINT && parseFloat(t.balance || '0') > 0),
  ];

  // Build the list of output tokens: all wallet tokens + popular tokens for buying
  const POPULAR_OUTPUT: Token[] = [
    {
      id: 'dawen', blockchain_id: 'solana', contract_address: DAWEN_MINT,
      symbol: 'DTEST', name: 'DTEST (DAWEN)', decimals: 6,
      logo_url: null, is_verified: true, coingecko_id: null,
    },
    {
      id: 'usdc', blockchain_id: 'solana',
      contract_address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      symbol: 'USDC', name: 'USD Coin', decimals: 6,
      logo_url: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
      is_verified: true, coingecko_id: 'usd-coin',
    },
    {
      id: 'bonk', blockchain_id: 'solana',
      contract_address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
      symbol: 'BONK', name: 'Bonk', decimals: 5,
      logo_url: 'https://arweave.net/hQiPZOsRZXGXBJd_82PhVdlM_hACsT_q6wqwf5cSY7I',
      is_verified: true, coingecko_id: null,
    },
    {
      id: 'jup', blockchain_id: 'solana',
      contract_address: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
      symbol: 'JUP', name: 'Jupiter', decimals: 6,
      logo_url: 'https://static.jup.ag/jup/icon.png',
      is_verified: true, coingecko_id: null,
    },
  ];

  // Merge popular + wallet tokens (deduplicated by mint)
  const seenMints = new Set<string>();
  const outputTokenList: Token[] = [];
  for (const t of [...POPULAR_OUTPUT, ...tokens]) {
    const mint = t.contract_address ?? '';
    if (mint && mint !== SOL_MINT && !seenMints.has(mint)) {
      seenMints.add(mint);
      outputTokenList.push(t);
    }
  }

  // Set default output token to DAWEN on mount
  useEffect(() => {
    if (!outputToken) {
      setOutputToken(POPULAR_OUTPUT[0]);
    }
  }, []);

  // Load SOL price
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      for (let i = 0; i < 6; i++) {
        try {
          const p = await getSolPrice();
          if (p > 0 && !cancelled) { setSolPrice(p); return; }
        } catch {}
        if (cancelled) return;
        await new Promise(r => setTimeout(r, 5000));
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  // Load output token price when output token changes
  useEffect(() => {
    if (!outputToken?.contract_address) { setOutputTokenPrice(0); return; }
    const mint = outputToken.contract_address;
    if (mint === SOL_MINT) { setOutputTokenPrice(solPrice); return; }
    priceService.getTokenPrice(mint)
      .then(p => { if (p && p.price > 0) setOutputTokenPrice(p.price); else setOutputTokenPrice(0); })
      .catch(() => setOutputTokenPrice(0));
  }, [outputToken?.contract_address, solPrice]);

  // Input token balance
  const inputBalance = inputToken.contract_address === SOL_MINT
    ? nativeBalance
    : (() => {
        const t = tokens.find(t => t.contract_address === inputToken.contract_address);
        return t ? parseFloat(t.balance || '0') / Math.pow(10, inputToken.decimals) : 0;
      })();

  // USD value of what the user pays
  const inputUsdPrice = inputToken.contract_address === SOL_MINT
    ? solPrice
    : (() => {
        const t = tokens.find(t => t.contract_address === inputToken.contract_address);
        return t?.balanceUSD && parseFloat(t.balance || '1') > 0
          ? (t.balanceUSD / (parseFloat(t.balance || '1') / Math.pow(10, inputToken.decimals)))
          : 0;
      })();

  const payUsd = hasValidAmount && inputUsdPrice > 0
    ? `$${(parsedAmount * inputUsdPrice).toFixed(2)} USD`
    : '';

  const receiveUsd = quoteOutAmount && outputTokenPrice > 0
    ? `≈ $${(parseFloat(quoteOutAmount) * outputTokenPrice).toFixed(2)} USD`
    : '';

  // Debounced quote fetch
  useEffect(() => {
    if (!hasValidAmount || !outputToken?.contract_address || !inputToken?.contract_address) {
      setQuote(null);
      setQuoteOutAmount(null);
      setStatus('idle');
      return;
    }
    if (inputToken.contract_address === outputToken.contract_address) {
      setErrorMsg('Input and output token must be different');
      setStatus('error');
      return;
    }

    setStatus('quoting');
    setErrorMsg(null);
    setQuoteOutAmount(null);

    const timer = setTimeout(async () => {
      try {
        const rawAmount = Math.floor(parsedAmount * Math.pow(10, inputToken.decimals));
        const inputMint = inputToken.contract_address!;
        const outputMint = outputToken.contract_address!;
        const q = await jupiterSwapService.getQuote(inputMint, outputMint, rawAmount, 50);

        if (q) {
          setQuote(q);
          const outFormatted = jupiterSwapService.formatAmount(parseInt(q.outAmount), outputToken.decimals);
          setQuoteOutAmount(outFormatted);
          setStatus('quote_ready');
        } else {
          setQuote(null);
          setQuoteOutAmount(null);
          setErrorMsg(`No route available for ${outputToken.symbol}. Try a different amount or token.`);
          setStatus('error');
        }
      } catch (e: any) {
        setQuote(null);
        setQuoteOutAmount(null);
        setErrorMsg(e?.message || 'Failed to get quote');
        setStatus('error');
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [inputAmount, inputToken.contract_address, outputToken?.contract_address]);

  const handlePreset = (amt: string) => {
    setInputAmount(amt);
    setSelectedPreset(amt);
    setErrorMsg(null);
  };

  const handleAmountChange = (v: string) => {
    setInputAmount(v);
    setSelectedPreset(null);
    setErrorMsg(null);
  };

  const handleSelectInputToken = useCallback((token: Token) => {
    setInputToken(token);
    setInputAmount('');
    setSelectedPreset(null);
    setQuote(null);
    setQuoteOutAmount(null);
    setErrorMsg(null);
    setStatus('idle');
  }, []);

  const handleSelectOutputToken = useCallback((token: Token) => {
    setOutputToken(token);
    setQuote(null);
    setQuoteOutAmount(null);
    setErrorMsg(null);
    setStatus('idle');
  }, []);

  const signWithInternalWallet = async (serializedTx: string): Promise<VersionedTransaction> => {
    if (!selectedAccount) throw new Error('No account selected');
    const walletManager = SecureWalletManager.getInstance();
    const mnemonic = await walletManager.getMnemonicUnlocked();
    const keypair = KeyDerivationManager.deriveSolanaKeyPair(mnemonic, selectedAccount.accountIndex ?? 0);
    const txBuf = Buffer.from(serializedTx, 'base64');
    const tx = VersionedTransaction.deserialize(txBuf);
    tx.sign([{ publicKey: new PublicKey(selectedAccount.address), secretKey: keypair.secretKey }]);
    return tx;
  };

  const handleBuy = async () => {
    if (!hasWallet || !hasValidAmount || !quote || !outputToken || isProcessing) return;

    if (parsedAmount > inputBalance) {
      setErrorMsg(`Insufficient ${inputToken.symbol} balance`);
      setStatus('error');
      return;
    }

    setErrorMsg(null);
    setTxSignature(null);

    try {
      setStatus('signing');
      const swapResult = await jupiterSwapService.getSwapTransaction(quote, activeAddress!, true);

      let signedTx: VersionedTransaction;
      if (connectedWallet) {
        const txBuf = Buffer.from(swapResult.swapTransaction, 'base64');
        const tx = VersionedTransaction.deserialize(txBuf);
        signedTx = await ExternalWalletAdapter.signVersionedTransaction(connectedWallet.id, tx);
      } else {
        signedTx = await signWithInternalWallet(swapResult.swapTransaction);
      }

      setStatus('sending');
      const signature = await jupiterSwapService.executeSwap(swapResult.swapTransaction, async () => signedTx);
      setTxSignature(signature);
      setStatus('success');
      if (refreshWallet) await refreshWallet();
    } catch (err: any) {
      let msg = err?.message || 'Transaction failed';
      if (msg.includes('rejected') || msg.includes('User rejected')) msg = 'Transaction rejected in wallet';
      else if (msg.includes('insufficient') || msg.includes('balance') || msg.includes('0x1')) msg = `Insufficient ${inputToken.symbol} balance`;
      else if (msg.includes('slippage')) msg = 'Price moved too much. Try again or increase slippage.';
      else if (msg.includes('no route') || msg.includes('No route')) msg = `No route available for ${outputToken?.symbol}`;
      setErrorMsg(msg);
      setStatus('error');
    }
  };

  const isProcessing = status === 'signing' || status === 'sending';
  const canBuy = hasWallet && hasValidAmount && hasTokens && status === 'quote_ready' && !isProcessing;

  const rateText = quote && quoteOutAmount && parsedAmount > 0
    ? `1 ${inputToken.symbol} ≈ ${(parseFloat(quoteOutAmount) / parsedAmount).toLocaleString('en-US', { maximumFractionDigits: 4 })} ${outputToken?.symbol}`
    : '—';

  const priceImpact = quote ? jupiterSwapService.calculatePriceImpact(quote) : 0;

  const shortAddr = activeAddress
    ? `${activeAddress.slice(0, 4)}...${activeAddress.slice(-4)}`
    : '';

  const outputName = outputToken?.symbol ?? 'Token';

  // ─── Success screen ───
  if (status === 'success') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.doneContainer}>
          <View style={styles.doneIcon}>
            <CheckCircle size={48} color={colors.success} />
          </View>
          <Text style={styles.doneTitle}>Buy Successful!</Text>
          <Text style={styles.doneSubtitle}>
            Received {quoteOutAmount ? parseFloat(quoteOutAmount).toLocaleString('en-US', { maximumFractionDigits: 4 }) : '?'} {outputName}{'\n'}
            Paid {inputAmount} {inputToken.symbol}
          </Text>
          {txSignature && (
            <Text style={styles.txHash} numberOfLines={1} ellipsizeMode="middle">{txSignature}</Text>
          )}
          <TouchableOpacity style={styles.doneBtn} onPress={() => router.back()}>
            <Text style={styles.doneBtnText}>Return to Wallet</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
            <View style={styles.backCircle}>
              <ArrowLeft size={20} color={colors.textPrimary} strokeWidth={2.5} />
            </View>
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Buy </Text>
            <Text style={styles.headerTitleAccent}>{outputName}</Text>
          </View>

          <View style={styles.walletPill}>
            <View style={styles.walletDot} />
            <Text style={styles.walletPillText}>{shortAddr || 'No Wallet'}</Text>
          </View>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

          {/* Step 1: You pay */}
          <Text style={styles.stepLabel}>1. You pay</Text>
          <View style={styles.payCard}>
            <View style={styles.payCardTop}>
              {/* Input token selector */}
              <TouchableOpacity
                style={styles.tokenSelector}
                onPress={() => setShowInputSelector(true)}
                activeOpacity={0.8}
              >
                <TokenLogo token={inputToken} size={24} />
                <Text style={styles.tokenSelectorText}>{inputToken.symbol}</Text>
                <ChevronDown size={14} color={colors.textMuted} strokeWidth={2} />
              </TouchableOpacity>

              <View style={styles.balanceRow}>
                <Text style={styles.balanceText}>
                  Balance: {inputBalance.toFixed(inputToken.decimals > 6 ? 4 : 2)} {inputToken.symbol}
                </Text>
                <TouchableOpacity
                  style={styles.maxBtn}
                  onPress={() => {
                    const max = inputToken.contract_address === SOL_MINT
                      ? Math.max(0, inputBalance - 0.01)
                      : inputBalance;
                    handlePreset(max.toFixed(Math.min(inputToken.decimals, 6)));
                  }}
                >
                  <Text style={styles.maxBtnText}>MAX</Text>
                </TouchableOpacity>
              </View>
            </View>

            <TextInput
              style={styles.amountInput}
              placeholder="0"
              placeholderTextColor="rgba(255,255,255,0.2)"
              value={inputAmount}
              onChangeText={handleAmountChange}
              keyboardType="decimal-pad"
              editable={!isProcessing}
            />
            <Text style={styles.amountUsd}>
              {payUsd || (inputUsdPrice === 0 ? 'Loading price...' : '')}
            </Text>

            {/* Presets only for SOL input */}
            {inputToken.contract_address === SOL_MINT && (
              <View style={styles.presetsRow}>
                {PRESETS.map(p => (
                  <TouchableOpacity
                    key={p}
                    style={[styles.presetBtn, selectedPreset === p && styles.presetBtnActive]}
                    onPress={() => handlePreset(p)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.presetText, selectedPreset === p && styles.presetTextActive]}>
                      {p} SOL
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Step 2: You receive */}
          <Text style={styles.stepLabel}>2. You receive (estimated)</Text>
          <View style={styles.receiveCard}>
            <View style={styles.receiveTop}>
              {/* Output token selector */}
              <TouchableOpacity
                style={styles.dawenSelector}
                onPress={() => setShowOutputSelector(true)}
                activeOpacity={0.8}
              >
                {outputToken ? <TokenLogo token={outputToken} size={28} /> : (
                  <View style={[styles.dawenSelectorLogo, { backgroundColor: '#1E1E2E', borderRadius: 14 }]} />
                )}
                <Text style={styles.dawenSelectorText}>{outputToken?.symbol ?? 'Select token'}</Text>
                <ChevronDown size={14} color={colors.textMuted} strokeWidth={2} />
              </TouchableOpacity>

              <View style={styles.receiveAmountCol}>
                {status === 'quoting' ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={styles.receiveAmount}>
                    {quoteOutAmount
                      ? parseFloat(quoteOutAmount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
                      : '—'}
                  </Text>
                )}
                <Text style={styles.receiveUsd}>{receiveUsd}</Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.infoRow}>
              <View style={styles.infoRowLeft}>
                <RefreshCw size={14} color={colors.textMuted} strokeWidth={2} />
                <Text style={styles.infoLabel}>Rate</Text>
                <Info size={12} color={colors.textMuted} strokeWidth={2} />
              </View>
              <View style={styles.infoRowRight}>
                {status === 'quoting' ? (
                  <ActivityIndicator size="small" color={colors.textMuted} />
                ) : (
                  <Text style={styles.infoValue}>{rateText}</Text>
                )}
              </View>
            </View>

            <View style={styles.infoRow}>
              <View style={styles.infoRowLeft}>
                <View style={styles.infoCircle} />
                <Text style={styles.infoLabel}>Price Impact</Text>
                <Info size={12} color={colors.textMuted} strokeWidth={2} />
              </View>
              <Text style={[styles.infoValueAccent, priceImpact > 5 && { color: colors.error }]}>
                {quote ? `${priceImpact.toFixed(2)}%` : '—'}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <View style={styles.infoRowLeft}>
                <View style={[styles.infoCircle, { backgroundColor: colors.primary }]} />
                <Text style={styles.infoLabel}>Slippage</Text>
                <Info size={12} color={colors.textMuted} strokeWidth={2} />
              </View>
              <Text style={styles.infoValueAccent}>0.5%</Text>
            </View>

            <View style={styles.infoRow}>
              <View style={styles.infoRowLeft}>
                <View style={[styles.infoCircle, { backgroundColor: colors.textMuted }]} />
                <Text style={styles.infoLabel}>Network Fee</Text>
                <Info size={12} color={colors.textMuted} strokeWidth={2} />
              </View>
              <Text style={styles.infoValueAccent}>~0.0004 SOL</Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.jupiterRow}>
              <Shield size={14} color={colors.textMuted} strokeWidth={2} />
              <Text style={styles.jupiterText}>Your transaction is secured and powered by Jupiter Aggregator.</Text>
              <ChevronRight size={12} color={colors.primary} strokeWidth={2.5} />
            </View>
          </View>

          {/* Error */}
          {errorMsg && (
            <View style={styles.errorCard}>
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          )}

          {/* No wallet warning */}
          {!hasWallet && (
            <View style={styles.errorCard}>
              <Text style={styles.errorText}>Connect a wallet to buy tokens.</Text>
            </View>
          )}

          {/* Confirm button */}
          <TouchableOpacity
            style={[styles.confirmBtn, !canBuy && styles.confirmBtnDisabled]}
            onPress={handleBuy}
            disabled={!canBuy}
            activeOpacity={0.9}
          >
            {isProcessing ? (
              <>
                <ActivityIndicator color={colors.white} size="small" />
                <Text style={[styles.confirmBtnText, { marginLeft: 8 }]}>
                  {status === 'signing' ? 'WAITING FOR SIGNATURE...' : 'SENDING...'}
                </Text>
              </>
            ) : status === 'quoting' ? (
              <>
                <ActivityIndicator color={colors.white} size="small" />
                <Text style={[styles.confirmBtnText, { marginLeft: 8 }]}>GETTING QUOTE...</Text>
              </>
            ) : (
              <>
                <Text style={styles.confirmBtnText}>
                  {!outputToken ? 'SELECT A TOKEN' : !hasValidAmount ? 'ENTER AMOUNT' : 'CONFIRM BUY'}
                </Text>
                {canBuy && (
                  <View style={styles.confirmBtnArrow}>
                    <ArrowRight size={18} color={colors.white} strokeWidth={2.5} />
                  </View>
                )}
              </>
            )}
          </TouchableOpacity>

          <View style={styles.confirmNote}>
            <Shield size={12} color={colors.textMuted} strokeWidth={2} />
            <Text style={styles.confirmNoteText}>You will be asked to confirm this transaction in your wallet.</Text>
          </View>

          <View style={{ height: 20 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Input token selector modal */}
      <TokenSelectorModal
        visible={showInputSelector}
        onClose={() => setShowInputSelector(false)}
        onSelect={handleSelectInputToken}
        tokens={inputTokenList}
        title="Select input token"
        showBalance
      />

      {/* Output token selector modal */}
      <TokenSelectorModal
        visible={showOutputSelector}
        onClose={() => setShowOutputSelector(false)}
        onSelect={handleSelectOutputToken}
        tokens={outputTokenList}
        title="Select token to buy"
        showBalance={false}
      />
    </SafeAreaView>
  );
}

// ─── Modal styles ─────────────────────────────────────────────────────────────
const ms = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#12121E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    paddingBottom: 8,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'center',
    marginVertical: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  title: {
    fontSize: 16, fontWeight: '800', color: colors.textPrimary,
  },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.07)',
    justifyContent: 'center', alignItems: 'center',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#1E1E2E',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  tokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  tokenInfo: { flex: 1 },
  tokenSymbol: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  tokenName: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  tokenMint: { fontSize: 10, color: colors.textMuted, marginTop: 1, fontFamily: 'monospace' },
  tokenBalance: { fontSize: 14, fontWeight: '700', color: colors.textSecondary },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 32, fontSize: 14 },
});

// ─── Screen styles ─────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0A0A0F' },
  flex: { flex: 1 },

  doneContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.xxl,
    backgroundColor: '#0A0A0F',
  },
  doneIcon: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: colors.successMuted,
    justifyContent: 'center', alignItems: 'center',
  },
  doneTitle: { fontSize: fontSize.xl, fontWeight: '800', color: colors.textPrimary },
  doneSubtitle: { fontSize: fontSize.md, color: colors.textSecondary, textAlign: 'center' },
  txHash: { fontSize: fontSize.xs, color: colors.primary, fontWeight: '600', textAlign: 'center' },
  doneBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xxxl,
    borderRadius: borderRadius.md,
    marginTop: spacing.md,
  },
  doneBtnText: { fontSize: fontSize.md, fontWeight: '700', color: colors.white },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: Platform.OS === 'android' ? 16 : 8,
    paddingBottom: spacing.md,
  },
  backBtn: {},
  backCircle: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#1A1A28',
    justifyContent: 'center', alignItems: 'center',
  },
  headerCenter: { flexDirection: 'row', alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '800', color: colors.textPrimary },
  headerTitleAccent: { fontSize: 20, fontWeight: '800', color: colors.primary },
  walletPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1A1A28',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.2)',
  },
  walletDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#10b981' },
  walletPillText: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },

  stepLabel: {
    fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.md,
  },

  payCard: {
    backgroundColor: '#12121E',
    borderRadius: 16,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.15)',
  },
  payCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  tokenSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: '#1E1E2E',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.2)',
  },
  tokenSelectorText: { fontSize: 14, fontWeight: '800', color: colors.textPrimary },
  balanceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  balanceText: { fontSize: 12, color: colors.textMuted, fontWeight: '500' },
  maxBtn: {
    backgroundColor: colors.primaryMuted,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.3)',
  },
  maxBtnText: { fontSize: 11, fontWeight: '800', color: colors.primary },
  amountInput: {
    fontSize: 48, fontWeight: '900', color: colors.textPrimary, paddingVertical: spacing.sm,
  },
  amountUsd: {
    fontSize: 14, color: colors.textMuted, fontWeight: '500', marginBottom: spacing.lg,
  },
  presetsRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  presetBtn: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: borderRadius.full,
    backgroundColor: '#1E1E2E',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.2)',
  },
  presetBtnActive: {
    backgroundColor: 'rgba(139,92,246,0.15)',
    borderColor: colors.primary,
  },
  presetText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  presetTextActive: { color: colors.primary },

  receiveCard: {
    backgroundColor: '#12121E',
    borderRadius: 16,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.15)',
    gap: spacing.sm,
  },
  receiveTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  dawenSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1E1E2E',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.2)',
  },
  dawenSelectorLogo: { width: 28, height: 28 },
  dawenSelectorText: { fontSize: 14, fontWeight: '800', color: colors.textPrimary },
  receiveAmountCol: { alignItems: 'flex-end' },
  receiveAmount: {
    fontSize: 32, fontWeight: '900', color: colors.primary, letterSpacing: -0.5,
  },
  receiveUsd: { fontSize: 13, color: colors.textMuted, fontWeight: '500' },
  divider: {
    height: 1, backgroundColor: 'rgba(139,92,246,0.1)', marginVertical: spacing.sm,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
  },
  infoRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  infoRowRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoCircle: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.textMuted },
  infoLabel: { fontSize: 13, color: colors.textSecondary, fontWeight: '500' },
  infoValue: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
  infoValueAccent: { fontSize: 13, color: colors.primary, fontWeight: '700' },
  jupiterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    paddingTop: spacing.xs,
  },
  jupiterText: { fontSize: 12, color: colors.textMuted, flex: 1, lineHeight: 17 },

  errorCard: {
    backgroundColor: colors.errorMuted,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
  },
  errorText: { fontSize: fontSize.sm, color: colors.error, fontWeight: '600' },

  confirmBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 18,
    marginBottom: spacing.md,
    position: 'relative',
  },
  confirmBtnDisabled: { opacity: 0.5 },
  confirmBtnText: {
    fontSize: 16, fontWeight: '900', color: colors.white, letterSpacing: 1.5,
  },
  confirmBtnArrow: {
    position: 'absolute',
    right: 20,
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center',
  },
  confirmNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  confirmNoteText: { fontSize: 12, color: colors.textMuted, textAlign: 'center' },
});
