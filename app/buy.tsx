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
  SafeAreaView,
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
} from 'lucide-react-native';
import { useWallet } from '@/contexts/WalletContext';
import { jupiterSwapService } from '@/services/jupiter/swapService';
import { ExternalWalletAdapter } from '@/lib/wallet/ExternalWalletAdapter';
import { SecureWalletManager } from '@/lib/wallet/SecureWalletManager';
import { KeyDerivationManager } from '@/lib/crypto/keyDerivation';
import { PublicKey, VersionedTransaction } from '@solana/web3.js';
import { colors, spacing, borderRadius, fontSize } from '@/constants/theme';

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const DAWEN_MINT = '43m6D8gCagyJ4K6NjETr3wjSUUSAAwaFznKbCUECpump';

type PayMethod = 'sol' | 'apple' | 'card';
type BuyStatus = 'idle' | 'quoting' | 'quote_ready' | 'signing' | 'sending' | 'success' | 'error';

const SOL_PRICE_USD = 167.3;
const DAWEN_PER_SOL = 2269.37;

export default function BuyScreen() {
  const router = useRouter();
  const { selectedAccount, connectedWallet, activeAddress, refreshWallet } = useWallet();

  const [payMethod, setPayMethod] = useState<PayMethod>('sol');
  const [solAmount, setSolAmount] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [status, setStatus] = useState<BuyStatus>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [quote, setQuote] = useState<any>(null);

  const hasWallet = !!activeAddress;
  const parsedAmount = parseFloat(solAmount);
  const hasValidAmount = !isNaN(parsedAmount) && parsedAmount > 0;

  const estimatedDawen = hasValidAmount ? (parsedAmount * DAWEN_PER_SOL).toFixed(2) : '—';
  const payUsd = hasValidAmount ? (parsedAmount * SOL_PRICE_USD).toFixed(2) : '0.00';
  const receiveUsd = hasValidAmount ? (parsedAmount * SOL_PRICE_USD * 0.984).toFixed(2) : '0.00';

  const PRESETS = ['0.1', '0.5', '1', '2', '5'];
  const SOL_BALANCE = 2.5491;

  useEffect(() => {
    if (!hasValidAmount) {
      setQuote(null);
      return;
    }
    setStatus('quoting');
    setErrorMsg(null);
    const timer = setTimeout(() => {
      // Simulate quote fetch — show as ready
      setStatus('quote_ready');
    }, 500);
    return () => clearTimeout(timer);
  }, [solAmount]);

  const handlePreset = (amt: string) => {
    setSolAmount(amt);
    setSelectedPreset(amt);
    setErrorMsg(null);
  };

  const handleAmountChange = (v: string) => {
    setSolAmount(v);
    setSelectedPreset(null);
    setErrorMsg(null);
  };

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
    if (!hasWallet || !hasValidAmount || status !== 'quote_ready') return;
    setErrorMsg(null);
    setTxSignature(null);
    try {
      setStatus('signing');
      const amountLamports = Math.floor(parsedAmount * 1e9);
      const q = await jupiterSwapService.getQuote(SOL_MINT, DAWEN_MINT, amountLamports, 50);
      if (!q) throw new Error('No route available');
      const swapResult = await jupiterSwapService.getSwapTransaction(q, activeAddress!, true);
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
      if (msg.includes('rejected')) msg = 'Transaction rejected in wallet';
      else if (msg.includes('insufficient') || msg.includes('balance')) msg = 'Insufficient SOL balance';
      else if (msg.includes('slippage')) msg = 'Price moved. Try again.';
      setErrorMsg(msg);
      setStatus('error');
    }
  };

  const isProcessing = status === 'signing' || status === 'sending';
  const canBuy = hasWallet && hasValidAmount && (status === 'quote_ready' || status === 'idle') && !isProcessing;

  const shortAddr = activeAddress
    ? `${activeAddress.slice(0, 4)}...${activeAddress.slice(-4)}`
    : '7bor...Zs3C';

  if (status === 'success') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.doneContainer}>
          <View style={styles.doneIcon}>
            <CheckCircle size={48} color={colors.success} />
          </View>
          <Text style={styles.doneTitle}>Buy Successful!</Text>
          <Text style={styles.doneSubtitle}>Bought DAWEN for {solAmount} SOL</Text>
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
            <Text style={styles.headerTitleAccent}>DAWEN</Text>
          </View>

          <View style={styles.walletPill}>
            <View style={styles.walletDot} />
            <Text style={styles.walletPillText}>{shortAddr}</Text>
          </View>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

          {/* Featured DAWEN card */}
          <View style={styles.featuredCard}>
            <View style={styles.featuredLeft}>
              <View style={styles.tokenLogoWrap}>
                <LinearGradient colors={['#8B5CF6', '#6D28D9']} style={styles.tokenLogo}>
                  <Text style={styles.tokenLogoText}>D</Text>
                </LinearGradient>
              </View>
              <View style={styles.featuredInfo}>
                <View style={styles.featuredBadge}>
                  <Text style={styles.featuredBadgeText}>FEATURED</Text>
                </View>
                <Text style={styles.featuredName}>DAWEN</Text>
                <Text style={styles.featuredDesc}>The utility token powering the DAWEN ecosystem.</Text>
                <TouchableOpacity style={styles.learnMore}>
                  <Text style={styles.learnMoreText}>Learn more</Text>
                  <ChevronRight size={12} color={colors.primary} strokeWidth={2.5} />
                </TouchableOpacity>
              </View>
            </View>
            {/* Mini chart decoration */}
            <View style={styles.featuredChartDecor}>
              {[20, 35, 25, 45, 38, 55, 48, 65, 55, 72, 62, 80, 70, 88].map((v, i) => (
                <View
                  key={i}
                  style={[styles.featuredChartBar, {
                    height: v * 0.7,
                    left: i * 9,
                    opacity: 0.3 + (v / 88) * 0.7,
                  }]}
                />
              ))}
            </View>
          </View>

          {/* Step 1: Payment method */}
          <Text style={styles.stepLabel}>1. Choose how you want to pay</Text>
          <View style={styles.payMethodRow}>
            <TouchableOpacity
              style={[styles.payMethodCard, payMethod === 'sol' && styles.payMethodCardActive]}
              onPress={() => setPayMethod('sol')}
              activeOpacity={0.8}
            >
              <View style={styles.solIcon}>
                <LinearGradient colors={['#9945FF', '#14F195']} style={styles.solIconGrad}>
                  <Text style={styles.solIconText}>S</Text>
                </LinearGradient>
              </View>
              <View>
                <Text style={styles.payMethodName}>SOL</Text>
                <Text style={styles.payMethodSub}>Pay with Solana</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.payMethodCard, payMethod === 'apple' && styles.payMethodCardActive]}
              onPress={() => setPayMethod('apple')}
              activeOpacity={0.8}
            >
              <Text style={styles.appleIcon}></Text>
              <View>
                <Text style={styles.payMethodName}>Apple Pay</Text>
                <Text style={styles.payMethodSub}>Pay with Apple Pay</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.payMethodCard, payMethod === 'card' && styles.payMethodCardActive]}
              onPress={() => setPayMethod('card')}
              activeOpacity={0.8}
            >
              <View style={styles.cardIcon}>
                <View style={styles.cardIconStripe} />
              </View>
              <View>
                <Text style={styles.payMethodName}>Card</Text>
                <Text style={styles.payMethodSub}>Credit / Debit Card</Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Step 2: You pay */}
          <Text style={styles.stepLabel}>2. You pay</Text>
          <View style={styles.payCard}>
            {/* Token selector + balance */}
            <View style={styles.payCardTop}>
              <TouchableOpacity style={styles.tokenSelector} activeOpacity={0.8}>
                <View style={styles.solIconSmall}>
                  <LinearGradient colors={['#9945FF', '#14F195']} style={styles.solIconGradSmall}>
                    <Text style={styles.solIconTextSmall}>S</Text>
                  </LinearGradient>
                </View>
                <Text style={styles.tokenSelectorText}>SOL</Text>
                <ChevronDown size={14} color={colors.textMuted} strokeWidth={2} />
              </TouchableOpacity>

              <View style={styles.balanceRow}>
                <Text style={styles.balanceText}>Balance: {SOL_BALANCE} SOL</Text>
                <TouchableOpacity
                  style={styles.maxBtn}
                  onPress={() => handlePreset(SOL_BALANCE.toString())}
                >
                  <Text style={styles.maxBtnText}>MAX</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Amount input */}
            <TextInput
              style={styles.amountInput}
              placeholder="0"
              placeholderTextColor={'rgba(255,255,255,0.2)'}
              value={solAmount}
              onChangeText={handleAmountChange}
              keyboardType="decimal-pad"
              editable={!isProcessing}
            />
            <Text style={styles.amountUsd}>${payUsd} USD</Text>

            {/* Preset buttons */}
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
          </View>

          {/* Step 3: You receive */}
          <Text style={styles.stepLabel}>3. You receive (estimated)</Text>
          <View style={styles.receiveCard}>
            {/* Token selector */}
            <View style={styles.receiveTop}>
              <TouchableOpacity style={styles.dawenSelector} activeOpacity={0.8}>
                <View style={styles.dawenSelectorLogo}>
                  <LinearGradient colors={['#8B5CF6', '#6D28D9']} style={styles.dawenLogoGrad}>
                    <Text style={styles.dawenLogoText}>D</Text>
                  </LinearGradient>
                </View>
                <Text style={styles.dawenSelectorText}>DAWEN</Text>
                <ChevronDown size={14} color={colors.textMuted} strokeWidth={2} />
              </TouchableOpacity>

              <View style={styles.receiveAmountCol}>
                <Text style={styles.receiveAmount}>
                  {hasValidAmount ? (parsedAmount * DAWEN_PER_SOL * 1.25).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                </Text>
                <Text style={styles.receiveUsd}>${receiveUsd} USD</Text>
              </View>
            </View>

            <View style={styles.divider} />

            {/* Rate row */}
            <View style={styles.infoRow}>
              <View style={styles.infoRowLeft}>
                <RefreshCw size={14} color={colors.textMuted} strokeWidth={2} />
                <Text style={styles.infoLabel}>Rate</Text>
                <Info size={12} color={colors.textMuted} strokeWidth={2} />
              </View>
              <View style={styles.infoRowRight}>
                <Text style={styles.infoValue}>1 SOL ≈ {DAWEN_PER_SOL.toLocaleString()} DAWEN</Text>
                <TouchableOpacity>
                  <RefreshCw size={13} color={colors.textMuted} strokeWidth={2} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Price impact */}
            <View style={styles.infoRow}>
              <View style={styles.infoRowLeft}>
                <View style={styles.infoCircle} />
                <Text style={styles.infoLabel}>Price Impact</Text>
                <Info size={12} color={colors.textMuted} strokeWidth={2} />
              </View>
              <Text style={styles.infoValueAccent}>1.65%</Text>
            </View>

            {/* Network fee */}
            <View style={styles.infoRow}>
              <View style={styles.infoRowLeft}>
                <View style={[styles.infoCircle, { backgroundColor: colors.primary }]} />
                <Text style={styles.infoLabel}>Network Fee</Text>
                <Info size={12} color={colors.textMuted} strokeWidth={2} />
              </View>
              <Text style={styles.infoValueAccent}>~0.0004 SOL</Text>
            </View>

            <View style={styles.divider} />

            {/* Jupiter note */}
            <View style={styles.jupiterRow}>
              <Shield size={14} color={colors.textMuted} strokeWidth={2} />
              <Text style={styles.jupiterText}>Your transaction is secured and powered by Jupiter Aggregator.</Text>
              <TouchableOpacity>
                <Text style={styles.jupiterLearnMore}>Learn more</Text>
              </TouchableOpacity>
              <ChevronRight size={12} color={colors.primary} strokeWidth={2.5} />
            </View>
          </View>

          {/* Error */}
          {errorMsg && (
            <View style={styles.errorCard}>
              <Text style={styles.errorText}>{errorMsg}</Text>
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
              <ActivityIndicator color={colors.white} size="small" />
            ) : (
              <>
                <Text style={styles.confirmBtnText}>CONFIRM BUY</Text>
                <View style={styles.confirmBtnArrow}>
                  <ArrowRight size={18} color={colors.white} strokeWidth={2.5} />
                </View>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0A0A0F' },
  flex: { flex: 1 },

  // Done state
  doneContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.xxl,
    backgroundColor: '#0A0A0F',
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
  txHash: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: '600',
    textAlign: 'center',
  },
  doneBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xxxl,
    borderRadius: borderRadius.md,
    marginTop: spacing.md,
  },
  doneBtnText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.white,
  },

  // Header
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
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1A1A28',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  headerTitleAccent: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.primary,
  },
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
  walletDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#10b981',
  },
  walletPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
  },

  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },

  // Featured card
  featuredCard: {
    flexDirection: 'row',
    backgroundColor: '#12121E',
    borderRadius: 16,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.15)',
    overflow: 'hidden',
    minHeight: 110,
  },
  featuredLeft: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.md,
  },
  tokenLogoWrap: {},
  tokenLogo: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(139,92,246,0.3)',
  },
  tokenLogoText: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.white,
  },
  featuredInfo: {
    gap: 3,
    flex: 1,
  },
  featuredBadge: {
    backgroundColor: '#f59e0b',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginBottom: 2,
  },
  featuredBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#000',
    letterSpacing: 0.5,
  },
  featuredName: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.textPrimary,
  },
  featuredDesc: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 17,
  },
  learnMore: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 2,
  },
  learnMoreText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  featuredChartDecor: {
    width: 120,
    position: 'absolute',
    right: 0,
    bottom: 0,
    top: 0,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  featuredChartBar: {
    position: 'absolute',
    width: 3,
    bottom: 8,
    backgroundColor: colors.primary,
    borderRadius: 2,
  },

  // Step labels
  stepLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },

  // Pay method
  payMethodRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  payMethodCard: {
    flex: 1,
    backgroundColor: '#12121E',
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.15)',
    alignItems: 'center',
    gap: 6,
  },
  payMethodCardActive: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(139,92,246,0.08)',
  },
  solIcon: {},
  solIconGrad: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  solIconText: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.white,
  },
  appleIcon: {
    fontSize: 26,
    color: colors.textPrimary,
  },
  cardIcon: {
    width: 32,
    height: 24,
    borderRadius: 4,
    backgroundColor: '#1E3A8A',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  cardIconStripe: {
    height: 6,
    width: '100%',
    backgroundColor: '#60A5FA',
    borderRadius: 1,
  },
  payMethodName: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  payMethodSub: {
    fontSize: 10,
    color: colors.textMuted,
    textAlign: 'center',
  },

  // Pay card
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
  solIconSmall: {},
  solIconGradSmall: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  solIconTextSmall: {
    fontSize: 10,
    fontWeight: '900',
    color: colors.white,
  },
  tokenSelectorText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  balanceText: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '500',
  },
  maxBtn: {
    backgroundColor: colors.primaryMuted,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.3)',
  },
  maxBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
  },
  amountInput: {
    fontSize: 48,
    fontWeight: '900',
    color: colors.textPrimary,
    paddingVertical: spacing.sm,
  },
  amountUsd: {
    fontSize: 14,
    color: colors.textMuted,
    fontWeight: '500',
    marginBottom: spacing.lg,
  },
  presetsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  presetBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: borderRadius.full,
    backgroundColor: '#1E1E2E',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.2)',
  },
  presetBtnActive: {
    backgroundColor: 'rgba(139,92,246,0.15)',
    borderColor: colors.primary,
  },
  presetText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  presetTextActive: {
    color: colors.primary,
  },

  // Receive card
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
  dawenSelectorLogo: {},
  dawenLogoGrad: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dawenLogoText: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.white,
  },
  dawenSelectorText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  receiveAmountCol: {
    alignItems: 'flex-end',
  },
  receiveAmount: {
    fontSize: 32,
    fontWeight: '900',
    color: colors.primary,
    letterSpacing: -0.5,
  },
  receiveUsd: {
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(139,92,246,0.1)',
    marginVertical: spacing.sm,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
  },
  infoRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  infoRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  infoCircle: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.textMuted,
  },
  infoLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  infoValueAccent: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '700',
  },
  jupiterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    paddingTop: spacing.xs,
  },
  jupiterText: {
    fontSize: 12,
    color: colors.textMuted,
    flex: 1,
    lineHeight: 17,
  },
  jupiterLearnMore: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
  },

  // Error
  errorCard: {
    backgroundColor: colors.errorMuted,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
  },
  errorText: {
    fontSize: fontSize.sm,
    color: colors.error,
    fontWeight: '600',
  },

  // Confirm button
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
  confirmBtnDisabled: {
    opacity: 0.5,
  },
  confirmBtnText: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.white,
    letterSpacing: 1.5,
  },
  confirmBtnArrow: {
    position: 'absolute',
    right: 20,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  confirmNoteText: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
