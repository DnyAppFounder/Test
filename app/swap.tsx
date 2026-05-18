import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Modal,
  Image,
  Platform,
  SafeAreaView,
} from 'react-native';
import { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, ArrowDownUp, CircleAlert as AlertCircle, ChevronDown, Smartphone, Shield, CircleCheck as CheckCircle } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { colors, spacing, borderRadius, fontSize, elevation } from '@/constants/theme';
import { jupiterSwapService, JupiterQuote } from '@/services/jupiter/swapService';
import { mergedTokenListService as jupiterTokenListService, JupiterToken } from '@/services/tokenListService';
import { getSolPrice, SolanaPriceService } from '@/services/solana/priceService';
import { useWallet } from '@/contexts/WalletContext';
import { ConfirmTransactionModal, TxDetail } from '@/components/ConfirmTransactionModal';
import { PublicKey, VersionedTransaction } from '@solana/web3.js';
import { SecureWalletManager } from '@/lib/wallet/SecureWalletManager';
import { KeyDerivationManager } from '@/lib/crypto/keyDerivation';
import { ExternalWalletAdapter } from '@/lib/wallet/ExternalWalletAdapter';

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const DAWEN_MINT = 'BW1T8pZB2S18nPyMP4sUySV5FoC3VboX6vg3nmvQpump';

// Fallback logos for well-known tokens in case Jupiter list is unavailable
const KNOWN_LOGOS: Record<string, string> = {
  'So11111111111111111111111111111111111111112': 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.png',
  'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN': 'https://static.jup.ag/jup/icon.png',
  'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': 'https://arweave.net/hQiPZOsRZXGXBJd_82PhVdlM_hACsT_q6wqwf5cSY7I',
  '4k3Dyjzvzp8eMrzpTGE6RkFGSNJoSz8e6oWz8S8HtFr': 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/4k3Dyjzvzp8eMrzpTGE6RkFGSNJoSz8e6oWz8S8HtFr/logo.png',
  'orcaEKTdK7LKz57vaAYr6AC93NStx7QLt3pPDzBEFP': 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/orcaEKTdK7LKz57vaAYr6AC93NStx7QLt3pPDzBEFP/logo.png',
};

const priceService = new SolanaPriceService();

type SwapStatus = 'idle' | 'quoting' | 'signing' | 'sending' | 'success' | 'error';

export default function SwapScreen() {
  const router = useRouter();
  const { selectedAccount, connectedWallet, activeAddress, activeWallet, refreshPortfolio, tokens: walletTokens, nativeBalance } = useWallet();
  const [confirmVisible, setConfirmVisible] = useState(false);

  const [loading, setLoading] = useState(false);
  const [fromToken, setFromToken] = useState<JupiterToken | null>(null);
  const [toToken, setToToken] = useState<JupiterToken | null>(null);
  const [fromAmount, setFromAmount] = useState('');
  const [quote, setQuote] = useState<JupiterQuote | null>(null);
  // Full Jupiter token list (loaded once)
  const [jupiterTokens, setJupiterTokens] = useState<JupiterToken[]>([]);
  const [selectingToken, setSelectingToken] = useState<'from' | 'to' | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [status, setStatus] = useState<SwapStatus>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [fromTokenPrice, setFromTokenPrice] = useState(0);

  const isMobile = Platform.OS !== 'web';
  const hasWallet = !!activeAddress;
  const SOL_FEE_BUFFER = 0.002;

  // O(1) lookup map: mint → JupiterToken (for logo/decimals enrichment)
  const jupiterIndex = useMemo(() => {
    const m = new Map<string, JupiterToken>();
    for (const t of jupiterTokens) m.set(t.address, t);
    return m;
  }, [jupiterTokens]);

  // Resolve best logo for a mint: Jupiter list → known fallback → undefined
  const resolveLogoURI = (mint: string, walletLogo?: string | null): string | undefined => {
    const jLogo = jupiterIndex.get(mint)?.logoURI;
    return jLogo || walletLogo || KNOWN_LOGOS[mint];
  };

  const fromTokenBalance = useMemo(() => {
    if (!fromToken) return 0;
    if (fromToken.address === SOL_MINT) return nativeBalance;
    const t = walletTokens.find(wt => wt.contract_address === fromToken.address);
    return t ? parseFloat(t.balance || '0') / Math.pow(10, fromToken.decimals) : 0;
  }, [fromToken, walletTokens, nativeBalance]);

  const maxSpendable = fromToken?.address === SOL_MINT
    ? Math.max(0, nativeBalance - SOL_FEE_BUFFER)
    : fromTokenBalance;

  const shortAddr = activeWallet
    ? `${activeWallet.address.slice(0, 4)}...${activeWallet.address.slice(-4)}`
    : null;
  const walletLabel = activeWallet?.type === 'connected' ? activeWallet.name : 'Internal';

  // Load full Jupiter token list once on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const all = await jupiterTokenListService.getAllTokens();
        if (cancelled) return;
        setJupiterTokens(all);

        // Set default tokens only if not already chosen
        setFromToken(prev => {
          if (prev) return prev;
          return all.find(t => t.address === SOL_MINT) ?? {
            address: SOL_MINT, chainId: 101, decimals: 9,
            name: 'Solana', symbol: 'SOL',
            logoURI: KNOWN_LOGOS[SOL_MINT],
            tags: ['verified'],
          };
        });
        setToToken(prev => {
          if (prev) return prev;
          return all.find(t => t.address === DAWEN_MINT) ?? {
            address: DAWEN_MINT, chainId: 101, decimals: 6,
            name: 'DAWORLD Coin', symbol: 'DWORLD',
            logoURI: undefined, tags: ['community'],
          };
        });
      } catch (e) {
        console.error('[Swap] Token list load failed:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!fromToken) { setFromTokenPrice(0); return; }
    if (fromToken.address === SOL_MINT) {
      getSolPrice().then(p => setFromTokenPrice(p)).catch(() => {});
    } else {
      priceService.getTokenPrice(fromToken.address).then(p => setFromTokenPrice(p?.price || 0)).catch(() => {});
    }
  }, [fromToken?.address]);

  useEffect(() => {
    const amount = parseFloat(fromAmount);
    if (!fromToken || !toToken || !fromAmount || isNaN(amount) || amount <= 0) {
      setQuote(null); setErrorMsg(null); setStatus('idle');
      return;
    }
    if (amount > fromTokenBalance) {
      setQuote(null);
      setErrorMsg(`Insufficient ${fromToken.symbol} balance`);
      setStatus('error');
      return;
    }
    const timer = setTimeout(() => fetchQuote(amount), 500);
    return () => clearTimeout(timer);
  }, [fromAmount, fromToken?.address, toToken?.address, fromTokenBalance]);

  const fetchQuote = async (amount: number) => {
    if (!fromToken || !toToken) return;
    setStatus('quoting');
    setErrorMsg(null);
    try {
      const amountInSmallest = Math.floor(amount * Math.pow(10, fromToken.decimals));
      if (amountInSmallest < 1) {
        setQuote(null);
        setErrorMsg('Amount too small — enter a larger value.');
        setStatus('error');
        return;
      }
      const q = await jupiterSwapService.getQuote(fromToken.address, toToken.address, amountInSmallest, 50);
      if (q) {
        setQuote(q); setStatus('idle'); setErrorMsg(null);
      } else {
        setQuote(null);
        setErrorMsg('No route available for this pair.');
        setStatus('error');
      }
    } catch (e: any) {
      setQuote(null);
      const msg: string = e?.message || '';
      if (msg.includes('Insufficient') || msg.includes('balance')) {
        setErrorMsg('Insufficient balance for this swap.');
      } else if (msg.includes('400') || msg.includes('No route') || msg.includes('route')) {
        setErrorMsg('No route available. This pair may lack liquidity on Jupiter.');
      } else if (msg.includes('502') || msg.includes('503') || msg.includes('Jupiter unavailable')) {
        setErrorMsg('Jupiter is currently unavailable. Please try again.');
      } else if (msg.includes('network') || msg.includes('fetch') || msg.includes('Failed to fetch')) {
        setErrorMsg('Network error. Check your connection and try again.');
      } else {
        setErrorMsg(`Quote failed: ${msg || 'Unknown error'}`);
      }
      setStatus('error');
    }
  };

  const handleFlipTokens = () => {
    const temp = fromToken;
    setFromToken(toToken);
    setToToken(temp);
    setFromAmount('');
    setQuote(null);
    setStatus('idle');
    setErrorMsg(null);
  };

  const handleSelectToken = (token: JupiterToken) => {
    // Enrich logo with Jupiter/known-logo data before storing
    const enriched: JupiterToken = {
      ...token,
      logoURI: resolveLogoURI(token.address, token.logoURI),
    };
    if (selectingToken === 'from') setFromToken(enriched);
    else if (selectingToken === 'to') setToToken(enriched);
    setSelectingToken(null);
    setSearchQuery('');
    setQuote(null);
    setStatus('idle');
  };

  const signWithExternalWallet = async (serializedTx: string): Promise<VersionedTransaction> => {
    if (!connectedWallet) throw new Error('No external wallet connected');
    const txBuf = Buffer.from(serializedTx, 'base64');
    const transaction = VersionedTransaction.deserialize(txBuf);
    return ExternalWalletAdapter.signVersionedTransaction(connectedWallet.id, transaction);
  };

  const signWithInternalWallet = async (serializedTx: string): Promise<VersionedTransaction> => {
    if (!selectedAccount) throw new Error('No account selected');
    const walletManager = SecureWalletManager.getInstance();
    const mnemonic = await walletManager.getMnemonicUnlocked();
    const keypair = KeyDerivationManager.deriveSolanaKeyPair(mnemonic, selectedAccount.accountIndex ?? 0);
    const txBuf = Buffer.from(serializedTx, 'base64');
    const transaction = VersionedTransaction.deserialize(txBuf);
    transaction.sign([{
      publicKey: new PublicKey(selectedAccount.address),
      secretKey: keypair.secretKey,
    }]);
    return transaction;
  };

  // Derived values — must be declared BEFORE swapConfirmDetails to avoid TDZ
  const outputAmount = quote && toToken
    ? jupiterSwapService.formatAmount(parseInt(quote.outAmount), toToken.decimals)
    : '';
  const priceImpact = quote ? jupiterSwapService.calculatePriceImpact(quote) : 0;
  const isProcessing = false;
  const parsedAmount = parseFloat(fromAmount);
  const isInsufficientBalance = !!(fromToken && fromAmount && !isNaN(parsedAmount) && parsedAmount > fromTokenBalance);
  const canSwap = !!quote && hasWallet && status !== 'quoting' && status !== 'error' && !isInsufficientBalance;

  const swapConfirmDetails: TxDetail[] = quote && fromToken && toToken ? [
    { label: 'Action', value: `Swap ${fromToken.symbol} → ${toToken.symbol}` },
    { label: 'You Pay', value: `${fromAmount} ${fromToken.symbol}`, accent: true },
    { label: 'You Receive', value: `${outputAmount || '?'} ${toToken.symbol}`, accent: true },
    { label: 'Price Impact', value: `${priceImpact.toFixed(2)}%` },
    { label: 'Network Fee', value: '~0.000005 SOL' },
    { label: 'Slippage', value: '0.5%' },
    { label: 'Total', value: `${fromAmount} ${fromToken.symbol} + fee`, total: true },
  ] : [];

  const executeSwapTx = async (): Promise<string> => {
    if (!quote || !activeAddress || !fromToken || !toToken) throw new Error('Missing swap parameters');
    const amount = parseFloat(fromAmount);
    if (isNaN(amount) || amount <= 0) throw new Error('Enter a valid amount');

    const swapResult = await jupiterSwapService.getSwapTransaction(quote, activeAddress, true);
    let signedTx: VersionedTransaction;
    if (connectedWallet) {
      signedTx = await signWithExternalWallet(swapResult.swapTransaction);
    } else if (selectedAccount) {
      signedTx = await signWithInternalWallet(swapResult.swapTransaction);
    } else {
      throw new Error('No wallet available');
    }
    return jupiterSwapService.executeSwap(swapResult.swapTransaction, async () => signedTx);
  };

  // "From" list: wallet-owned tokens only (you can only spend what you hold).
  // SOL is always first; all others are enriched with Jupiter logos.
  const fromTokenList = useMemo<JupiterToken[]>(() => {
    const list: JupiterToken[] = [];
    const seen = new Set<string>();

    // SOL always first
    const solEntry = jupiterIndex.get(SOL_MINT) ?? {
      address: SOL_MINT, chainId: 101, decimals: 9,
      name: 'Solana', symbol: 'SOL',
      logoURI: KNOWN_LOGOS[SOL_MINT], tags: ['verified'],
    };
    list.push(solEntry);
    seen.add(SOL_MINT);

    // SPL tokens held in wallet
    for (const wt of walletTokens) {
      const addr = wt.contract_address;
      if (!addr || seen.has(addr)) continue;
      seen.add(addr);
      const jt = jupiterIndex.get(addr);
      list.push({
        address: addr,
        chainId: 101,
        decimals: jt?.decimals ?? wt.decimals,
        name: jt?.name ?? wt.name ?? addr.slice(0, 8),
        symbol: jt?.symbol ?? wt.symbol ?? '???',
        logoURI: jt?.logoURI ?? KNOWN_LOGOS[addr] ?? wt.logo_url ?? undefined,
        tags: jt?.tags,
      });
    }
    return list;
  }, [jupiterIndex, walletTokens]);

  // "To" list: wallet tokens first, then full Jupiter list (any output token)
  const toTokenList = useMemo<JupiterToken[]>(() => {
    const seen = new Set<string>();
    const list: JupiterToken[] = [];
    for (const t of fromTokenList) {
      seen.add(t.address);
      list.push(t);
    }
    for (const t of jupiterTokens) {
      if (seen.has(t.address)) continue;
      seen.add(t.address);
      list.push({
        ...t,
        logoURI: t.logoURI ?? KNOWN_LOGOS[t.address],
      });
    }
    return list;
  }, [fromTokenList, jupiterTokens]);

  // Active list depends on which selector is open
  const activeList = selectingToken === 'from' ? fromTokenList : toTokenList;

  // Search by name, symbol, or full/partial mint address
  const filteredTokens = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return activeList;
    return activeList.filter(t =>
      (t.name ?? '').toLowerCase().includes(q) ||
      (t.symbol ?? '').toLowerCase().includes(q) ||
      t.address.toLowerCase().includes(q)
    );
  }, [activeList, searchQuery]);

  const fromAmountUsd = fromToken && fromAmount && fromTokenPrice > 0
    ? `≈ $${(parseFloat(fromAmount) * fromTokenPrice).toFixed(2)}`
    : '';

  const rateText = quote && fromToken && toToken
    ? `1 ${fromToken.symbol} ≈ ${(parseFloat(outputAmount) / parseFloat(fromAmount || '1')).toFixed(4)} ${toToken.symbol}`
    : '—';

  const getButtonLabel = () => {
    if (!hasWallet) return 'Connect Wallet';
    if (!fromToken || !toToken) return 'Select Token';
    if (!fromAmount || parseFloat(fromAmount) <= 0) return 'Enter Amount';
    if (isInsufficientBalance) return `Insufficient ${fromToken?.symbol ?? ''} Balance`;
    if (status === 'quoting') return 'Getting Quote...';
    if (status === 'signing') return 'Confirm in Wallet';
    if (status === 'sending') return 'Sending Transaction...';
    if (status === 'success') return 'Swap Successful!';
    if (status === 'error') return 'Retry';
    if (quote) return 'CONFIRM SWAP';
    return 'Enter Amount';
  };

  // No-wallet state on mobile
  if (isMobile && !hasWallet) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backCircle} onPress={() => router.back()} activeOpacity={0.8}>
            <ArrowLeft size={20} color={colors.textPrimary} strokeWidth={2.5} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Swap</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.noWalletContainer}>
          <Smartphone size={52} color={colors.primary} />
          <Text style={styles.noWalletTitle}>Open in Wallet Browser</Text>
          <Text style={styles.noWalletText}>
            To swap tokens, open this app inside Phantom, Backpack, or Solflare's built-in browser.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Success state
  if (status === 'success') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backCircle} onPress={() => router.back()} activeOpacity={0.8}>
            <ArrowLeft size={20} color={colors.textPrimary} strokeWidth={2.5} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Swap</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.successContainer}>
          <CheckCircle size={72} color={colors.success} strokeWidth={1.5} />
          <Text style={styles.successTitle}>Swap Confirmed!</Text>
          {txSignature && (
            <Text style={styles.txHash} numberOfLines={1} ellipsizeMode="middle">{txSignature}</Text>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backCircle} onPress={() => router.back()} activeOpacity={0.8}>
          <ArrowLeft size={20} color={colors.textPrimary} strokeWidth={2.5} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Swap</Text>
        {hasWallet && shortAddr ? (
          <View style={styles.walletPill}>
            <View style={styles.walletDot} />
            <Text style={styles.walletPillText}>{walletLabel}: {shortAddr}</Text>
          </View>
        ) : (
          <View style={styles.headerRight} />
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Main swap card */}
        <View style={styles.swapCard}>
          {/* You Pay */}
          <View style={styles.paySection}>
            <View style={styles.paySectionTop}>
              <Text style={styles.sectionLabel}>You Pay</Text>
              {hasWallet && fromToken && (
                <Text style={styles.balanceText}>Balance: {fromTokenBalance.toFixed(4)} {fromToken.symbol}</Text>
              )}
            </View>

            <View style={styles.tokenRow}>
              <TouchableOpacity
                style={styles.tokenSelector}
                onPress={() => !isProcessing && setSelectingToken('from')}
                activeOpacity={0.8}
              >
                {fromToken?.logoURI
                  ? <Image source={{ uri: fromToken.logoURI }} style={styles.tokenLogo} />
                  : <View style={styles.tokenLogoPlaceholder}><Text style={styles.tokenLogoText}>{(fromToken?.symbol ?? 'S').substring(0, 1)}</Text></View>}
                <Text style={styles.tokenSymbolText}>{fromToken?.symbol || 'Select'}</Text>
                <ChevronDown size={16} color={colors.textSecondary} strokeWidth={2.5} />
              </TouchableOpacity>

              <View style={styles.amountWrap}>
                {hasWallet && fromToken && maxSpendable > 0 && (
                  <TouchableOpacity
                    style={styles.maxBtn}
                    onPress={() => setFromAmount(maxSpendable.toFixed(6))}
                    disabled={isProcessing}
                  >
                    <Text style={styles.maxBtnText}>MAX</Text>
                  </TouchableOpacity>
                )}
                <TextInput
                  style={styles.amountInput}
                  value={fromAmount}
                  onChangeText={v => { setFromAmount(v); setStatus('idle'); setErrorMsg(null); }}
                  placeholder="0.00"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                  editable={!isProcessing}
                  textAlign="right"
                />
              </View>
            </View>

            {fromAmountUsd ? (
              <Text style={styles.usdText}>{fromAmountUsd}</Text>
            ) : null}
          </View>

          {/* Swap direction button */}
          <View style={styles.swapArrowRow}>
            <View style={styles.dividerLine} />
            <TouchableOpacity style={styles.swapArrowBtn} onPress={handleFlipTokens} activeOpacity={0.8} disabled={isProcessing}>
              <ArrowDownUp size={20} color={colors.primary} strokeWidth={2.5} />
            </TouchableOpacity>
            <View style={styles.dividerLine} />
          </View>

          {/* You Receive */}
          <View style={styles.receiveSection}>
            <View style={styles.paySectionTop}>
              <Text style={styles.sectionLabel}>You Receive <Text style={styles.estimatedLabel}>(Estimated)</Text></Text>
            </View>

            <View style={styles.tokenRow}>
              <TouchableOpacity
                style={styles.tokenSelector}
                onPress={() => !isProcessing && setSelectingToken('to')}
                activeOpacity={0.8}
              >
                {toToken?.logoURI
                  ? <Image source={{ uri: toToken.logoURI }} style={styles.tokenLogo} />
                  : <View style={styles.tokenLogoPlaceholder}><Text style={styles.tokenLogoText}>{(toToken?.symbol ?? 'D').substring(0, 1)}</Text></View>}
                <Text style={styles.tokenSymbolText}>{toToken?.symbol || 'Select'}</Text>
                <ChevronDown size={16} color={colors.textSecondary} strokeWidth={2.5} />
              </TouchableOpacity>

              <View style={styles.amountWrap}>
                {status === 'quoting' ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={[styles.outputText, outputAmount ? styles.outputTextActive : null]}>
                    {outputAmount || '0.00'}
                  </Text>
                )}
              </View>
            </View>

            {quote && (
              <Text style={[styles.usdText, styles.changeText]}>
                {priceImpact > 0 ? `-${priceImpact.toFixed(2)}%` : '0.00%'}
              </Text>
            )}
          </View>
        </View>

        {/* Info rows */}
        {quote && (
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Rate</Text>
              <Text style={styles.infoValue}>{rateText}</Text>
            </View>
            <View style={styles.infoDivider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Price Impact</Text>
              <Text style={[
                styles.infoValue,
                priceImpact > 1 && styles.infoValueWarn,
                priceImpact > 5 && styles.infoValueDanger,
              ]}>
                {priceImpact.toFixed(2)}%
              </Text>
            </View>
            <View style={styles.infoDivider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Network Fee</Text>
              <Text style={styles.infoValue}>~0.000005 SOL</Text>
            </View>
            {priceImpact > 1 && (
              <View style={styles.warnBanner}>
                <AlertCircle size={14} color={colors.warning} strokeWidth={2} />
                <Text style={styles.warnText}>High price impact. Consider a smaller amount.</Text>
              </View>
            )}
          </View>
        )}

        {/* Error */}
        {status === 'error' && errorMsg && (
          <View style={styles.errorCard}>
            <AlertCircle size={16} color={colors.error} strokeWidth={2} />
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        )}

        {/* Confirm button */}
        <TouchableOpacity
          style={[
            styles.confirmBtn,
            (!canSwap || !!isInsufficientBalance) && styles.confirmBtnDisabled,
          ]}
          onPress={() => setConfirmVisible(true)}
          disabled={!canSwap || !!isInsufficientBalance}
          activeOpacity={0.85}
        >
          <Text style={styles.confirmBtnText}>{getButtonLabel()}</Text>
        </TouchableOpacity>

        {/* Jupiter footer */}
        <View style={styles.jupiterRow}>
          <Shield size={14} color={colors.textMuted} strokeWidth={2} />
          <Text style={styles.jupiterText}>Powered by Jupiter</Text>
        </View>
      </ScrollView>

      {/* Token Selection Modal */}
      <Modal visible={selectingToken !== null} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Token</Text>
              <TouchableOpacity onPress={() => { setSelectingToken(null); setSearchQuery(''); }}>
                <Text style={styles.modalClose}>Close</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.modalSearch}
              placeholder="Search by name, symbol, or address"
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
            />
            <ScrollView style={styles.tokenList} showsVerticalScrollIndicator={false}>
              {filteredTokens.map(token => (
                <TouchableOpacity
                  key={token.address}
                  style={styles.tokenItem}
                  onPress={() => handleSelectToken(token)}
                  activeOpacity={0.7}
                >
                  {token.logoURI
                    ? <Image source={{ uri: token.logoURI }} style={styles.tokenItemLogo} />
                    : <View style={styles.tokenItemLogoPlaceholder}>
                        <Text style={styles.tokenItemLogoText}>{(token.symbol ?? '??').substring(0, 2).toUpperCase()}</Text>
                      </View>}
                  <View style={styles.tokenItemInfo}>
                    <Text style={styles.tokenItemName}>{token.name}</Text>
                    <Text style={styles.tokenItemSym}>{token.symbol}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <ConfirmTransactionModal
        visible={confirmVisible}
        title="Confirm Swap"
        details={swapConfirmDetails}
        executeTransaction={executeSwapTx}
        onSuccess={async () => {
          if (refreshPortfolio) await refreshPortfolio();
          setTimeout(() => { setFromAmount(''); setQuote(null); setStatus('idle'); }, 500);
        }}
        onDismiss={() => setConfirmVisible(false)}
        isExternalWallet={!!connectedWallet}
        insufficientBalance={!!isInsufficientBalance}
        insufficientBalanceMsg={`Insufficient ${fromToken?.symbol ?? ''} balance.`}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: Platform.OS === 'android' ? 44 : spacing.lg,
    paddingBottom: spacing.md,
  },
  backCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  headerRight: { width: 40 },
  walletPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  walletDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  walletPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 60,
  },

  // Main card
  swapCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  paySection: {
    padding: spacing.xl,
    paddingBottom: spacing.lg,
  },
  receiveSection: {
    padding: spacing.xl,
    paddingTop: spacing.lg,
  },
  paySectionTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sectionLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  estimatedLabel: {
    fontWeight: '500',
    color: colors.textMuted,
    textTransform: 'none',
    letterSpacing: 0,
  },
  balanceText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '500',
  },

  // Token row
  tokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  tokenSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  tokenLogo: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  tokenLogoPlaceholder: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primaryMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tokenLogoText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.primary,
  },
  tokenSymbolText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  amountWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  maxBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    backgroundColor: colors.primaryMuted,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.3)',
  },
  maxBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 0.5,
  },
  amountInput: {
    flex: 1,
    fontSize: 32,
    fontWeight: '700',
    color: colors.textPrimary,
    padding: 0,
    minWidth: 80,
    textAlign: 'right',
  },
  usdText: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '500',
    marginTop: spacing.xs,
    textAlign: 'right',
  },
  outputText: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.textMuted,
    textAlign: 'right',
  },
  outputTextActive: {
    color: colors.primary,
  },
  changeText: {
    color: colors.error,
  },

  // Swap arrow
  swapArrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.surfaceBorder,
  },
  swapArrowBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryMuted,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.3)',
  },

  // Info card
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  infoDivider: {
    height: 1,
    backgroundColor: colors.surfaceBorder,
  },
  infoLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textMuted,
  },
  infoValue: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  infoValueWarn: { color: colors.warning },
  infoValueDanger: { color: colors.error },
  warnBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.warningMuted,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginTop: spacing.sm,
  },
  warnText: {
    flex: 1,
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.warning,
  },

  // Error
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.errorMuted,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.2)',
  },
  errorText: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.error,
  },

  // Confirm button
  confirmBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 18,
    borderRadius: borderRadius.xl,
    marginBottom: spacing.lg,
    ...elevation.md,
  },
  confirmBtnDisabled: {
    backgroundColor: colors.surfaceLight,
    opacity: 0.5,
  },
  confirmBtnText: {
    fontSize: fontSize.md,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  // Jupiter footer
  jupiterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xl,
  },
  jupiterText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
  },

  // No wallet / success
  noWalletContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
    gap: spacing.lg,
  },
  noWalletTitle: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  noWalletText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.xxl,
  },
  successTitle: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  txHash: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontFamily: 'SpaceMono-Regular',
    textAlign: 'center',
    paddingHorizontal: spacing.xxl,
  },

  // Token selection modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xxl,
    borderTopRightRadius: borderRadius.xxl,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceLight,
    alignSelf: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  modalClose: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.primary,
  },
  modalSearch: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: fontSize.md,
    fontWeight: '500',
    color: colors.textPrimary,
    marginHorizontal: spacing.xxl,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  tokenList: { paddingHorizontal: spacing.xxl },
  tokenItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  tokenItemLogo: { width: 40, height: 40, borderRadius: 20 },
  tokenItemLogoPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tokenItemLogoText: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    color: colors.primary,
  },
  tokenItemInfo: { flex: 1 },
  tokenItemName: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  tokenItemSym: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.textMuted,
  },
});
