import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Animated,
  SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Rocket, Zap, Clock, Users, TrendingUp, CircleCheck as CheckCircle2, Circle as XCircle, ExternalLink, RefreshCw, DollarSign, Flame, TriangleAlert as AlertTriangle, Lock, CircleCheck as CheckIcon, ShieldCheck, ShieldAlert, Shield, TrendingDown, Droplets } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { useWallet } from '@/contexts/WalletContext';
import { useSecurity } from '@/contexts/SecurityContext';
import { PinUnlockModal } from '@/components/PinUnlockModal';
import { TxConfirmModal, TxDetail } from '@/components/TxConfirmModal';
import { launchpadService, LaunchpadToken } from '@/services/launchpadService';
import {
  presaleService,
  Presale,
  PresaleContribution,
  computePresaleStatus,
  getPresaleProgress,
  formatTimeRemaining,
  PresaleStatus,
} from '@/services/presaleService';
import { dawenCurveService, CurveState } from '@/services/dawenCurveService';
import { safetyService, SafetyScore } from '@/services/safetyService';
import { burnRouterService, BurnStats } from '@/services/burnRouterService';
import { launchpadSigningService } from '@/services/launchpadSigningService';
import { colors, spacing, borderRadius, fontSize, elevation } from '@/constants/theme';

// Status pill config
const STATUS_CONFIG: Record<PresaleStatus, { label: string; bg: string; fg: string }> = {
  upcoming:   { label: 'Upcoming',   bg: 'rgba(245,158,11,0.15)',  fg: '#F59E0B' },
  live:       { label: 'LIVE',       bg: 'rgba(16,185,129,0.15)', fg: '#10b981' },
  successful: { label: 'Successful', bg: 'rgba(16,185,129,0.15)', fg: '#10b981' },
  failed:     { label: 'Failed',     bg: 'rgba(239,68,68,0.15)',  fg: '#ef4444' },
  claim_live: { label: 'Claim Live', bg: 'rgba(139,92,246,0.2)',  fg: '#A78BFA' },
  finalized:  { label: 'Finalized',  bg: 'rgba(107,114,128,0.2)', fg: '#9CA3AF' },
};

function fmtSol(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : n.toFixed(n < 1 ? 4 : 2);
}

function shortAddr(a: string) {
  return `${a.slice(0, 5)}…${a.slice(-4)}`;
}

// ─── Buy Modal ────────────────────────────────────────────────────────────────
type BuyStatus = 'idle' | 'preparing' | 'signing' | 'sending' | 'confirmed' | 'failed';

function BuyModal({
  visible, presale, token, wallet, activeWallet, nativeBalance,
  onClose, onSuccess,
}: {
  visible: boolean;
  presale: Presale;
  token: LaunchpadToken;
  wallet: string;
  activeWallet: import('@/contexts/WalletContext').UnifiedWallet | null;
  nativeBalance: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { pinHash } = useSecurity();
  const [amount, setAmount] = useState('');
  const [buyStatus, setBuyStatus] = useState<BuyStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [txSig, setTxSig] = useState<string | null>(null);
  const [pinGateVisible, setPinGateVisible] = useState(false);
  const [txConfirmVisible, setTxConfirmVisible] = useState(false);

  const tokenEstimate = presale.launch_price > 0 && amount
    ? parseFloat(amount) / presale.launch_price
    : presale.hard_cap > 0 && amount
      ? (parseFloat(amount) / presale.hard_cap) * presale.tokens_for_sale
      : 0;

  const fmtTokens = (n: number) => {
    if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
    return n.toFixed(2);
  };

  const isBuying = buyStatus === 'preparing' || buyStatus === 'signing' || buyStatus === 'sending';

  const statusLabel =
    buyStatus === 'preparing' ? 'Preparing transaction...' :
    buyStatus === 'signing'   ? (activeWallet?.type === 'connected' ? 'Confirm in wallet...' : 'Signing...') :
    buyStatus === 'sending'   ? 'Sending...' :
    `Buy ${token.symbol}`;

  const solAmt = parseFloat(amount) || 0;
  const buyConfirmDetails: TxDetail[] = [
    { label: 'Action',       value: `Buy ${token.symbol}` },
    { label: 'Amount',       value: `${solAmt} SOL`, accent: true },
    { label: 'You Receive',  value: `~${fmtTokens(tokenEstimate)} ${token.symbol}` },
    { label: 'Network Fee',  value: '~0.000025 SOL' },
    { label: 'Total',        value: `${solAmt} SOL + fee`, total: true },
  ];

  const handleBuy = async () => {
    if (!activeWallet) { setError('No active wallet connected.'); return; }
    setError(null);
    setBuyStatus('preparing');

    let buySignAndSend: (tx: import('@solana/web3.js').Transaction, signers?: import('@solana/web3.js').Keypair[]) => Promise<string>;
    try {
      const signer = await launchpadSigningService.getSigner(activeWallet);
      buySignAndSend = launchpadSigningService.makeSignAndSend(signer);
    } catch (sigErr: any) {
      setError(sigErr?.message ?? 'Failed to initialize wallet signer');
      setBuyStatus('failed');
      return;
    }

    setBuyStatus('signing');
    const res = await presaleService.buyPresale(
      { presaleId: presale.id, tokenId: presale.token_id, wallet, solAmount: solAmt },
      buySignAndSend
    );

    if (res.success && res.txSignature) {
      setBuyStatus('confirmed');
      setTxSig(res.txSignature);
    } else {
      setError(res.error ?? 'Purchase failed');
      setBuyStatus('failed');
    }
  };

  const handleClose = () => { setAmount(''); setError(null); setTxSig(null); setBuyStatus('idle'); onClose(); };

  const requestBuy = () => {
    const sol = parseFloat(amount);
    if (isNaN(sol) || sol <= 0) { setError('Enter a valid amount'); return; }
    if (sol < presale.min_buy) { setError(`Minimum buy: ${presale.min_buy} SOL`); return; }
    if (sol > presale.max_buy) { setError(`Maximum buy: ${presale.max_buy} SOL`); return; }
    if (sol > nativeBalance - 0.001) { setError('Insufficient SOL balance'); return; }
    setError(null);
    setTxConfirmVisible(true);
  };

  const handleBuyConfirmed = () => {
    setTxConfirmVisible(false);
    const isInternal = activeWallet?.type !== 'connected';
    if (isInternal && pinHash) { setPinGateVisible(true); } else { handleBuy(); }
  };

  if (txSig) {
    return (
      <>
        <Modal visible={visible} animationType="fade" transparent>
          <View style={bs.overlay}>
            <View style={bs.sheet}>
              <View style={bs.successIcon}>
                <CheckIcon size={40} color={colors.success} />
              </View>
              <Text style={bs.successTitle}>Purchase Confirmed!</Text>
              <Text style={bs.successSub}>
                {fmtTokens(tokenEstimate)} {token.symbol} reserved
              </Text>
              {Platform.OS === 'web' && (
                <TouchableOpacity style={bs.explorerBtn} onPress={() => (window as any).open(`https://solscan.io/tx/${txSig}`, '_blank')}>
                  <ExternalLink size={14} color={colors.primary} />
                  <Text style={bs.explorerBtnText}>View on Solscan</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={bs.doneBtn} onPress={() => { onSuccess(); handleClose(); }}>
                <Text style={bs.doneBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
        <PinUnlockModal
          visible={pinGateVisible}
          title="Authorize Purchase"
          subtitle="Enter your PIN to confirm this transaction"
          onSuccess={() => { setPinGateVisible(false); handleBuy(); }}
          onCancel={() => setPinGateVisible(false)}
        />
        <TxConfirmModal
          visible={txConfirmVisible}
          title={`Buy ${token.symbol}`}
          details={buyConfirmDetails}
          onConfirm={handleBuyConfirmed}
          onCancel={() => setTxConfirmVisible(false)}
          confirmLabel={`Buy ${token.symbol}`}
        />
      </>
    );
  }

  return (
    <>
      <Modal visible={visible} animationType="slide" transparent>
        <View style={bs.overlay}>
          <View style={bs.sheet}>
            <View style={bs.sheetHeader}>
              <Text style={bs.sheetTitle}>Buy {token.symbol}</Text>
              <TouchableOpacity onPress={handleClose} disabled={isBuying}>
                <XCircle size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={bs.balRow}>
              <Text style={bs.balLabel}>Your balance</Text>
              <Text style={bs.balValue}>{nativeBalance.toFixed(4)} SOL</Text>
            </View>

            <Text style={bs.inputLabel}>Amount (SOL)</Text>
            <View style={bs.inputRow}>
              <TextInput
                style={bs.input}
                placeholder={`Min ${presale.min_buy} — Max ${presale.max_buy}`}
                placeholderTextColor={colors.textMuted}
                value={amount}
                onChangeText={t => { setAmount(t); setError(null); }}
                keyboardType="decimal-pad"
                editable={!isBuying}
              />
              <TouchableOpacity style={bs.maxBtn} onPress={() => setAmount(String(Math.min(presale.max_buy, nativeBalance - 0.001)))} disabled={isBuying}>
                <Text style={bs.maxBtnText}>MAX</Text>
              </TouchableOpacity>
            </View>

            {amount && !isNaN(parseFloat(amount)) && parseFloat(amount) > 0 && (
              <View style={bs.estimateCard}>
                <Text style={bs.estimateLabel}>You receive approximately</Text>
                <Text style={bs.estimateValue}>{fmtTokens(tokenEstimate)} {token.symbol}</Text>
              </View>
            )}

            {isBuying && (
              <View style={bs.statusRow}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={bs.statusText}>{statusLabel}</Text>
              </View>
            )}

            {error ? (
              <View style={bs.errorRow}>
                <AlertTriangle size={14} color="#ef4444" />
                <Text style={bs.errorText}>{error}</Text>
              </View>
            ) : null}

            <View style={bs.limitsRow}>
              <Text style={bs.limitItem}>Min: {presale.min_buy} SOL</Text>
              <Text style={bs.limitItem}>Max: {presale.max_buy} SOL</Text>
            </View>

            <TouchableOpacity style={[bs.buyBtn, isBuying && bs.buyBtnDisabled]} onPress={requestBuy} disabled={isBuying}>
              {isBuying
                ? <ActivityIndicator color="#fff" size="small" />
                : (
                  <>
                    <Zap size={16} color="#fff" />
                    <Text style={bs.buyBtnText}>Buy {token.symbol}</Text>
                  </>
                )
              }
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <PinUnlockModal
        visible={pinGateVisible}
        title="Authorize Purchase"
        subtitle="Enter your PIN to confirm this transaction"
        onSuccess={() => { setPinGateVisible(false); handleBuy(); }}
        onCancel={() => setPinGateVisible(false)}
      />
      <TxConfirmModal
        visible={txConfirmVisible}
        title={`Buy ${token.symbol}`}
        details={buyConfirmDetails}
        onConfirm={handleBuyConfirmed}
        onCancel={() => setTxConfirmVisible(false)}
        confirmLabel={`Buy ${token.symbol}`}
      />
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PresaleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { activeAddress, activeWallet, nativeBalance, refreshPortfolio } = useWallet();

  const [presale, setPresale] = useState<Presale | null>(null);
  const [token, setToken] = useState<LaunchpadToken | null>(null);
  const [contribution, setContribution] = useState<PresaleContribution | null>(null);
  const [contributions, setContributions] = useState<PresaleContribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBuy, setShowBuy] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [curveState, setCurveState] = useState<CurveState | null>(null);
  const [safetyScore, setSafetyScore] = useState<SafetyScore | null>(null);
  const [burnStats, setBurnStats] = useState<BurnStats | null>(null);
  const curveAnim = useRef(new Animated.Value(0)).current;

  // Countdown timer
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Progress bar animation
  const progressAnim = useRef(new Animated.Value(0)).current;

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const ps = await presaleService.getPresaleById(id);
      if (!ps) { setLoading(false); return; }

      const [tkn, contribs] = await Promise.all([
        launchpadService.getTokens('new', 100),
        presaleService.getContributions(ps.id),
      ]);

      const matchedToken = tkn.find(t => t.id === ps.token_id) ?? null;
      setPresale(ps);
      setToken(matchedToken);
      setContributions(contribs);

      if (activeAddress) {
        const myContrib = contribs.find(c => c.wallet === activeAddress) ?? null;
        setContribution(myContrib);
      }

      // Animate progress bar
      const prog = Math.min(1, ps.amount_raised / ps.hard_cap);
      Animated.timing(progressAnim, { toValue: prog, duration: 800, useNativeDriver: false }).start();

      // Load Phase 4 data in parallel
      if (matchedToken?.mint_address) {
        const [curve, safety, burns] = await Promise.all([
          dawenCurveService.getCurveStateByMint(matchedToken.mint_address),
          safetyService.getScore(matchedToken.mint_address),
          burnRouterService.getBurnStats(matchedToken.mint_address),
        ]);
        setCurveState(curve);
        setSafetyScore(safety);
        setBurnStats(burns);

        if (curve) {
          const curveProg = curve.graduated ? 1 : Math.min(curve.market_cap_usd / curve.graduation_threshold, 1);
          Animated.timing(curveAnim, { toValue: curveProg, duration: 800, useNativeDriver: false }).start();
        }
      }
    } catch (e) {
      console.warn('[PresaleDetail] load error:', e);
    } finally {
      setLoading(false);
    }
  }, [id, activeAddress]);

  useEffect(() => { load(); }, [load]);

  // Realtime subscriptions
  useEffect(() => {
    if (!presale?.id) return;
    const unsub1 = presaleService.subscribeToPresale(presale.id, (updated) => {
      setPresale(updated);
      const prog = Math.min(1, updated.amount_raised / updated.hard_cap);
      Animated.timing(progressAnim, { toValue: prog, duration: 400, useNativeDriver: false }).start();
    });
    const unsub2 = presaleService.subscribeToContributions(presale.id, (c) => {
      setContributions(prev => [c, ...prev.filter(x => x.id !== c.id)]);
      if (activeAddress && c.wallet === activeAddress) setContribution(c);
    });
    return () => { unsub1(); unsub2(); };
  }, [presale?.id, activeAddress]);

  useEffect(() => {
    if (!token?.id) return;
    const unsub = dawenCurveService.subscribeToCurve(token.id, (updated) => {
      setCurveState(updated);
      const curveProg = updated.graduated ? 1 : Math.min(updated.market_cap_usd / updated.graduation_threshold, 1);
      Animated.timing(curveAnim, { toValue: curveProg, duration: 400, useNativeDriver: false }).start();
    });
    return unsub;
  }, [token?.id]);

  const getPresaleSigner = async (): Promise<((tx: import('@solana/web3.js').Transaction, signers?: import('@solana/web3.js').Keypair[]) => Promise<string>) | null> => {
    if (!activeWallet) {
      setActionError('No active wallet connected.');
      return null;
    }
    try {
      const signer = await launchpadSigningService.getSigner(activeWallet);
      return launchpadSigningService.makeSignAndSend(signer);
    } catch (e: any) {
      setActionError(e?.message ?? 'Failed to initialize wallet signer');
      return null;
    }
  };

  const handleFinalize = async () => {
    if (!presale || !activeAddress) return;
    setActionLoading(true);
    setActionError(null);
    const signAndSend = await getPresaleSigner();
    if (!signAndSend) { setActionLoading(false); return; }
    const res = await presaleService.finalizePresale(presale.id, activeAddress, signAndSend);
    setActionLoading(false);
    if (!res.success) setActionError(res.error ?? 'Finalize failed');
    else { load(); refreshPortfolio().catch(() => {}); }
  };

  const handleClaim = async () => {
    if (!presale || !activeAddress) return;
    setActionLoading(true);
    setActionError(null);
    const signAndSend = await getPresaleSigner();
    if (!signAndSend) { setActionLoading(false); return; }
    const res = await presaleService.claimTokens(presale.id, activeAddress, signAndSend);
    setActionLoading(false);
    if (!res.success) setActionError(res.error ?? 'Claim failed');
    else { load(); refreshPortfolio().catch(() => {}); }
  };

  const handleRefund = async () => {
    if (!presale || !activeAddress) return;
    setActionLoading(true);
    setActionError(null);
    const signAndSend = await getPresaleSigner();
    if (!signAndSend) { setActionLoading(false); return; }
    const res = await presaleService.refundContribution(presale.id, activeAddress, signAndSend);
    setActionLoading(false);
    if (!res.success) setActionError(res.error ?? 'Refund failed');
    else { load(); refreshPortfolio().catch(() => {}); }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading presale...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!presale || !token) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <Rocket size={48} color={colors.textMuted} />
          <Text style={styles.loadingText}>Presale not found</Text>
          <TouchableOpacity style={styles.backBtn2} onPress={() => router.back()}>
            <Text style={styles.backBtn2Text}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const currentStatus = computePresaleStatus(presale);
  const progress = getPresaleProgress({ ...presale, status: currentStatus });
  const timeLeft = formatTimeRemaining(new Date(presale.end_at).getTime() - now);
  const statusCfg = STATUS_CONFIG[currentStatus];
  const isCreator = activeAddress === token.creator_wallet;
  const canBuy = currentStatus === 'live' && !!activeAddress;
  const canFinalize = isCreator && currentStatus === 'successful';
  const canClaim = !!contribution?.confirmed && !contribution.claimed && (currentStatus === 'claim_live' || currentStatus === 'finalized');
  const canRefund = !!contribution?.confirmed && !contribution.refunded && currentStatus === 'failed';

  const softBarWidth = progressAnim.interpolate({ inputRange: [0, presale.soft_cap / presale.hard_cap], outputRange: ['0%', '100%'], extrapolate: 'clamp' });
  const hardBarWidth = progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.navHeader}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ArrowLeft size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Presale</Text>
        <View style={[styles.statusPill, { backgroundColor: statusCfg.bg }]}>
          <Text style={[styles.statusPillText, { color: statusCfg.fg }]}>{statusCfg.label}</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Token Identity */}
        <View style={styles.identityCard}>
          {token.image_url
            ? <Image source={{ uri: token.image_url }} style={styles.tokenLogo} />
            : (
              <View style={styles.tokenLogoFallback}>
                <Text style={styles.tokenLogoFallbackText}>{token.symbol.slice(0, 2)}</Text>
              </View>
            )
          }
          <View style={styles.identityInfo}>
            <Text style={styles.tokenName}>{token.name}</Text>
            <Text style={styles.tokenSymbol}>{token.symbol}</Text>
            {token.description ? (
              <Text style={styles.tokenDesc} numberOfLines={2}>{token.description}</Text>
            ) : null}
          </View>
          <TouchableOpacity
            style={styles.viewChartBtn}
            onPress={() => token.mint_address && router.push(`/token-detail/${token.mint_address}`)}
          >
            <TrendingUp size={14} color={colors.primary} />
            <Text style={styles.viewChartText}>Chart</Text>
          </TouchableOpacity>
        </View>

        {/* Progress Section */}
        <View style={styles.progressCard}>
          <View style={styles.progressHeader}>
            <View>
              <Text style={styles.raisedLabel}>Amount Raised</Text>
              <Text style={styles.raisedValue}>{fmtSol(presale.amount_raised)} SOL</Text>
            </View>
            <View style={styles.countdownBox}>
              <Clock size={13} color={colors.textMuted} />
              <Text style={styles.countdownText}>{timeLeft}</Text>
            </View>
          </View>

          {/* Hard cap bar */}
          <View style={styles.barTrack}>
            <Animated.View style={[styles.barFill, { width: hardBarWidth }]} />
            {/* Soft cap marker */}
            <View style={[styles.softCapMarker, { left: `${(presale.soft_cap / presale.hard_cap) * 100}%` as any }]}>
              <View style={styles.softCapLine} />
            </View>
          </View>

          <View style={styles.capLabels}>
            <View style={styles.capLabelItem}>
              <View style={[styles.capDot, { backgroundColor: '#F59E0B' }]} />
              <Text style={styles.capLabel}>Soft {fmtSol(presale.soft_cap)} SOL ({progress.softCapPercent.toFixed(0)}%)</Text>
            </View>
            <View style={styles.capLabelItem}>
              <View style={[styles.capDot, { backgroundColor: colors.primary }]} />
              <Text style={styles.capLabel}>Hard {fmtSol(presale.hard_cap)} SOL</Text>
            </View>
          </View>

          {/* Stats grid */}
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Users size={14} color={colors.textMuted} />
              <Text style={styles.statVal}>{presale.buyer_count}</Text>
              <Text style={styles.statLbl}>Buyers</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <DollarSign size={14} color={colors.textMuted} />
              <Text style={styles.statVal}>{fmtSol(presale.min_buy)}</Text>
              <Text style={styles.statLbl}>Min Buy</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <DollarSign size={14} color={colors.textMuted} />
              <Text style={styles.statVal}>{fmtSol(presale.max_buy)}</Text>
              <Text style={styles.statLbl}>Max Buy</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Lock size={14} color={colors.textMuted} />
              <Text style={styles.statVal}>{presale.liquidity_percent}%</Text>
              <Text style={styles.statLbl}>Liquidity</Text>
            </View>
          </View>
        </View>

        {/* Presale Details */}
        <View style={styles.detailsCard}>
          <Text style={styles.sectionTitle}>Presale Info</Text>
          {[
            ['Launch Price', presale.launch_price > 0 ? `$${presale.launch_price.toExponential(3)}` : 'TBA'],
            ['Listing Price', presale.listing_price > 0 ? `$${presale.listing_price.toExponential(3)}` : 'TBA'],
            ['Tokens for Sale', presale.tokens_for_sale >= 1e9 ? `${(presale.tokens_for_sale / 1e9).toFixed(1)}B` : presale.tokens_for_sale >= 1e6 ? `${(presale.tokens_for_sale / 1e6).toFixed(1)}M` : String(presale.tokens_for_sale)],
            ['Unsold Tokens', presale.unsold_behavior === 'burn' ? 'Burned' : 'Returned to Creator'],
            ['Start', new Date(presale.start_at).toLocaleDateString()],
            ['End', new Date(presale.end_at).toLocaleDateString()],
          ].map(([label, value]) => (
            <View key={label} style={styles.detailRow}>
              <Text style={styles.detailLabel}>{label}</Text>
              <Text style={styles.detailValue}>{value}</Text>
            </View>
          ))}
        </View>

        {/* DAWEN Curve Progress */}
        {curveState && (
          <View style={styles.curveCard}>
            <View style={styles.curveHeader}>
              <TrendingUp size={14} color={colors.primary} />
              <Text style={styles.sectionTitle}>DAWEN Curve</Text>
              {curveState.graduated && (
                <View style={styles.graduatedBadge}>
                  <Text style={styles.graduatedText}>GRADUATED</Text>
                </View>
              )}
            </View>

            <View style={styles.curveMcapRow}>
              <View>
                <Text style={styles.curveMcapLabel}>Market Cap</Text>
                <Text style={styles.curveMcapValue}>{dawenCurveService.formatMarketCap(curveState.market_cap_usd)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.curveMcapLabel}>Graduation at</Text>
                <Text style={styles.curveMcapValue}>{dawenCurveService.formatMarketCap(curveState.graduation_threshold)}</Text>
              </View>
            </View>

            <View style={styles.curveBarTrack}>
              <Animated.View
                style={[
                  styles.curveBarFill,
                  {
                    width: curveAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
                    backgroundColor: curveState.graduated ? '#10B981' : colors.primary,
                  },
                ]}
              />
            </View>

            <View style={styles.curveFooter}>
              <Text style={styles.curveFooterText}>
                {curveState.graduated
                  ? 'Token graduated — liquidity pool created'
                  : `${((curveState.market_cap_usd / curveState.graduation_threshold) * 100).toFixed(1)}% to graduation`
                }
              </Text>
              {curveState.pool_address && (
                <View style={styles.lpLiveBadge}>
                  <Droplets size={11} color="#10B981" />
                  <Text style={styles.lpLiveText}>LP Live</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Safety Score */}
        {safetyScore && (
          <View style={[styles.safetyCard, { borderColor: `${safetyService.getRiskColor(safetyScore.risk_score)}30` }]}>
            <View style={styles.safetyHeader}>
              {safetyScore.risk_score <= 25
                ? <ShieldCheck size={16} color="#10B981" />
                : safetyScore.risk_score <= 60
                  ? <Shield size={16} color="#F59E0B" />
                  : <ShieldAlert size={16} color="#EF4444" />
              }
              <Text style={styles.sectionTitle}>Safety Analysis</Text>
              <View style={[styles.riskBadge, { backgroundColor: `${safetyService.getRiskColor(safetyScore.risk_score)}20` }]}>
                <Text style={[styles.riskBadgeText, { color: safetyService.getRiskColor(safetyScore.risk_score) }]}>
                  {safetyService.getRiskLabel(safetyScore.risk_score)}
                </Text>
              </View>
            </View>

            <View style={styles.safetyGrid}>
              <View style={[styles.safetyItem, safetyScore.mint_authority_revoked && styles.safetyItemGreen]}>
                {safetyScore.mint_authority_revoked
                  ? <CheckIcon size={12} color="#10B981" />
                  : <AlertTriangle size={12} color="#F59E0B" />
                }
                <Text style={[styles.safetyItemText, { color: safetyScore.mint_authority_revoked ? '#10B981' : '#F59E0B' }]}>
                  Mint {safetyScore.mint_authority_revoked ? 'Revoked' : 'Active'}
                </Text>
              </View>
              <View style={[styles.safetyItem, safetyScore.freeze_authority_revoked && styles.safetyItemGreen]}>
                {safetyScore.freeze_authority_revoked
                  ? <CheckIcon size={12} color="#10B981" />
                  : <AlertTriangle size={12} color="#F59E0B" />
                }
                <Text style={[styles.safetyItemText, { color: safetyScore.freeze_authority_revoked ? '#10B981' : '#F59E0B' }]}>
                  Freeze {safetyScore.freeze_authority_revoked ? 'Revoked' : 'Active'}
                </Text>
              </View>
              <View style={[styles.safetyItem, safetyScore.lp_locked && styles.safetyItemGreen]}>
                <Lock size={12} color={safetyScore.lp_locked ? '#10B981' : '#6B7280'} />
                <Text style={[styles.safetyItemText, { color: safetyScore.lp_locked ? '#10B981' : '#6B7280' }]}>
                  LP {safetyScore.lp_locked ? 'Locked' : 'Unlocked'}
                </Text>
              </View>
              {safetyScore.top10_holders_pct > 0 && (
                <View style={styles.safetyItem}>
                  <Users size={12} color={safetyScore.top10_holders_pct > 80 ? '#EF4444' : '#9CA3AF'} />
                  <Text style={[styles.safetyItemText, { color: safetyScore.top10_holders_pct > 80 ? '#EF4444' : '#9CA3AF' }]}>
                    Top10: {safetyScore.top10_holders_pct.toFixed(0)}%
                  </Text>
                </View>
              )}
            </View>

            {safetyScore.scam_signals.length > 0 && (
              <View style={styles.signalList}>
                {(safetyScore.scam_signals as string[]).map((s, i) => (
                  <View key={i} style={styles.signalRow}>
                    <AlertTriangle size={11} color="#F59E0B" />
                    <Text style={styles.signalText}>{s}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Burn Stats */}
        {burnStats && burnStats.burnCount > 0 && (
          <View style={styles.burnCard}>
            <View style={styles.burnHeader}>
              <Flame size={14} color="#EF4444" />
              <Text style={styles.sectionTitle}>Burn Activity</Text>
            </View>
            <View style={styles.burnRow}>
              <View style={styles.burnItem}>
                <Text style={styles.burnVal}>{burnRouterService.formatBurnAmount(burnStats.totalBurned)}</Text>
                <Text style={styles.burnLbl}>Total Burned</Text>
              </View>
              <View style={styles.burnDivider} />
              <View style={styles.burnItem}>
                <Text style={styles.burnVal}>{burnRouterService.formatBurnAmount(burnStats.last24h)}</Text>
                <Text style={styles.burnLbl}>24h Burned</Text>
              </View>
              <View style={styles.burnDivider} />
              <View style={styles.burnItem}>
                <Text style={styles.burnVal}>{burnStats.burnCount}</Text>
                <Text style={styles.burnLbl}>Burn Events</Text>
              </View>
            </View>
          </View>
        )}

        {/* My Contribution */}
        {contribution && contribution.confirmed && (
          <View style={styles.myContribCard}>
            <Text style={styles.sectionTitle}>My Contribution</Text>
            <View style={styles.myContribRow}>
              <View style={styles.myContribItem}>
                <Text style={styles.myContribLabel}>SOL Invested</Text>
                <Text style={styles.myContribValue}>{contribution.sol_amount.toFixed(4)} SOL</Text>
              </View>
              <View style={styles.myContribItem}>
                <Text style={styles.myContribLabel}>{token.symbol} Reserved</Text>
                <Text style={[styles.myContribValue, { color: colors.primary }]}>
                  {contribution.token_amount >= 1e6
                    ? `${(contribution.token_amount / 1e6).toFixed(2)}M`
                    : contribution.token_amount.toFixed(2)}
                </Text>
              </View>
            </View>
            {(contribution.claimed || contribution.refunded) && (
              <View style={styles.claimedBadge}>
                <CheckIcon size={13} color={colors.success} />
                <Text style={styles.claimedText}>
                  {contribution.claimed ? 'Tokens claimed' : 'SOL refunded'}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Action error */}
        {actionError && (
          <View style={styles.errorCard}>
            <AlertTriangle size={14} color={colors.error} />
            <Text style={styles.errorText}>{actionError}</Text>
          </View>
        )}

        {/* Actions */}
        <View style={styles.actionsSection}>
          {canBuy && (
            <TouchableOpacity style={styles.primaryBtn} onPress={() => setShowBuy(true)}>
              <LinearGradient colors={[colors.primary, colors.primaryDark]} style={styles.primaryBtnGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                <Zap size={16} color="#fff" />
                <Text style={styles.primaryBtnText}>Buy {token.symbol}</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}

          {canFinalize && (
            <TouchableOpacity style={styles.primaryBtn} onPress={handleFinalize} disabled={actionLoading}>
              {actionLoading
                ? <ActivityIndicator color="#fff" />
                : (
                  <LinearGradient colors={['#10b981', '#059669']} style={styles.primaryBtnGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                    <CheckCircle2 size={16} color="#fff" />
                    <Text style={styles.primaryBtnText}>Finalize Launch</Text>
                  </LinearGradient>
                )
              }
            </TouchableOpacity>
          )}

          {canClaim && (
            <TouchableOpacity style={styles.primaryBtn} onPress={handleClaim} disabled={actionLoading}>
              {actionLoading
                ? <ActivityIndicator color="#fff" />
                : (
                  <LinearGradient colors={[colors.primary, colors.primaryDark]} style={styles.primaryBtnGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                    <Rocket size={16} color="#fff" />
                    <Text style={styles.primaryBtnText}>Claim {token.symbol}</Text>
                  </LinearGradient>
                )
              }
            </TouchableOpacity>
          )}

          {canRefund && (
            <TouchableOpacity style={styles.refundBtn} onPress={handleRefund} disabled={actionLoading}>
              {actionLoading
                ? <ActivityIndicator color={colors.error} />
                : (
                  <>
                    <RefreshCw size={16} color={colors.error} />
                    <Text style={styles.refundBtnText}>Refund {contribution?.sol_amount.toFixed(4)} SOL</Text>
                  </>
                )
              }
            </TouchableOpacity>
          )}

          {!activeAddress && (
            <View style={styles.connectPrompt}>
              <Text style={styles.connectPromptText}>Connect wallet to participate</Text>
            </View>
          )}
        </View>

        {/* Live Participant Feed */}
        {contributions.length > 0 && (
          <View style={styles.feedCard}>
            <View style={styles.feedHeader}>
              <Flame size={14} color={colors.warning} />
              <Text style={styles.sectionTitle}>Live Participants</Text>
              <View style={styles.feedCount}>
                <Text style={styles.feedCountText}>{contributions.length}</Text>
              </View>
            </View>
            {contributions.slice(0, 10).map((c, i) => (
              <View key={c.id} style={styles.feedRow}>
                <View style={styles.feedAvatar}>
                  <Text style={styles.feedAvatarText}>{c.wallet.slice(0, 2).toUpperCase()}</Text>
                </View>
                <View style={styles.feedInfo}>
                  <Text style={styles.feedWallet}>{shortAddr(c.wallet)}</Text>
                  <Text style={styles.feedTime}>{new Date(c.created_at).toLocaleTimeString()}</Text>
                </View>
                <Text style={styles.feedAmount}>{c.sol_amount.toFixed(3)} SOL</Text>
                {c.claimed && <CheckIcon size={12} color={colors.success} />}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Buy Modal */}
      {presale && token && (
        <BuyModal
          visible={showBuy}
          presale={presale}
          token={token}
          wallet={activeAddress ?? ''}
          activeWallet={activeWallet}
          nativeBalance={nativeBalance}
          onClose={() => setShowBuy(false)}
          onSuccess={() => { load(); refreshPortfolio().catch(() => {}); }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#0A0A0F' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },

  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  loadingText: { fontSize: 15, color: colors.textSecondary },
  backBtn2: { backgroundColor: colors.primary, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 12, marginTop: 8 },
  backBtn2Text: { fontSize: 14, fontWeight: '700', color: '#fff' },

  navHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(139,92,246,0.12)',
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#12121A',
    alignItems: 'center', justifyContent: 'center',
  },
  navTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: '#fff', marginLeft: 10 },
  statusPill: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  statusPillText: { fontSize: 12, fontWeight: '700' },

  // Identity
  identityCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#12121A', borderRadius: 16,
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.12)',
    padding: 14, marginBottom: 12,
  },
  tokenLogo: { width: 52, height: 52, borderRadius: 12, backgroundColor: '#20202E' },
  tokenLogoFallback: {
    width: 52, height: 52, borderRadius: 12,
    backgroundColor: 'rgba(139,92,246,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  tokenLogoFallbackText: { fontSize: 16, fontWeight: '700', color: colors.primary },
  identityInfo: { flex: 1 },
  tokenName: { fontSize: 17, fontWeight: '700', color: '#fff' },
  tokenSymbol: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  tokenDesc: { fontSize: 12, color: '#9CA3AF', marginTop: 4, lineHeight: 17 },
  viewChartBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)',
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7,
  },
  viewChartText: { fontSize: 12, fontWeight: '600', color: colors.primary },

  // Progress
  progressCard: {
    backgroundColor: '#12121A', borderRadius: 16,
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.2)',
    padding: 16, marginBottom: 12,
  },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  raisedLabel: { fontSize: 12, color: '#6B7280', marginBottom: 3 },
  raisedValue: { fontSize: 22, fontWeight: '800', color: '#fff' },
  countdownBox: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#0A0A0F', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  countdownText: { fontSize: 13, fontWeight: '700', color: '#9CA3AF' },

  barTrack: {
    height: 10, borderRadius: 5, backgroundColor: '#20202E',
    overflow: 'visible', marginBottom: 10, position: 'relative',
  },
  barFill: { height: 10, borderRadius: 5, backgroundColor: colors.primary },
  softCapMarker: { position: 'absolute', top: -3, width: 2, height: 16 },
  softCapLine: { width: 2, height: 16, backgroundColor: '#F59E0B', borderRadius: 1 },

  capLabels: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 14 },
  capLabelItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  capDot: { width: 8, height: 8, borderRadius: 4 },
  capLabel: { fontSize: 12, color: '#9CA3AF' },

  statsGrid: {
    flexDirection: 'row', backgroundColor: '#0A0A0F',
    borderRadius: 12, padding: 12,
  },
  statItem: { flex: 1, alignItems: 'center', gap: 3 },
  statDivider: { width: 1, backgroundColor: 'rgba(139,92,246,0.1)' },
  statVal: { fontSize: 14, fontWeight: '700', color: '#fff' },
  statLbl: { fontSize: 10, color: '#6B7280' },

  // Details
  detailsCard: {
    backgroundColor: '#12121A', borderRadius: 16,
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.1)',
    padding: 16, marginBottom: 12,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#fff', marginBottom: 12 },
  detailRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(139,92,246,0.06)',
  },
  detailLabel: { fontSize: 13, color: '#6B7280' },
  detailValue: { fontSize: 13, fontWeight: '600', color: '#fff' },

  // My Contribution
  myContribCard: {
    backgroundColor: 'rgba(139,92,246,0.08)', borderRadius: 16,
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)',
    padding: 16, marginBottom: 12,
  },
  myContribRow: { flexDirection: 'row', gap: 12 },
  myContribItem: { flex: 1, backgroundColor: '#0A0A0F', borderRadius: 12, padding: 12, alignItems: 'center' },
  myContribLabel: { fontSize: 11, color: '#6B7280', marginBottom: 4 },
  myContribValue: { fontSize: 16, fontWeight: '800', color: '#fff' },
  claimedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(16,185,129,0.12)', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start', marginTop: 10,
  },
  claimedText: { fontSize: 12, fontWeight: '600', color: colors.success },

  // Error
  errorCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)',
    padding: 12, marginBottom: 12,
  },
  errorText: { flex: 1, fontSize: 13, color: colors.error },

  // Actions
  actionsSection: { gap: 10, marginBottom: 16 },
  primaryBtn: { borderRadius: 14, overflow: 'hidden' },
  primaryBtnGrad: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 15,
  },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  refundBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14,
    borderRadius: 14, borderWidth: 1, borderColor: colors.error,
    backgroundColor: 'rgba(239,68,68,0.08)',
  },
  refundBtnText: { fontSize: 15, fontWeight: '700', color: colors.error },

  connectPrompt: {
    backgroundColor: '#12121A', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.15)',
  },
  connectPromptText: { fontSize: 14, color: '#6B7280' },

  // DAWEN Curve
  curveCard: {
    backgroundColor: '#12121A', borderRadius: 16,
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.2)',
    padding: 16, marginBottom: 12,
  },
  curveHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  graduatedBadge: {
    backgroundColor: 'rgba(16,185,129,0.15)', borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  graduatedText: { fontSize: 10, fontWeight: '800', color: '#10B981' },
  curveMcapRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  curveMcapLabel: { fontSize: 11, color: '#6B7280', marginBottom: 2 },
  curveMcapValue: { fontSize: 16, fontWeight: '800', color: '#fff' },
  curveBarTrack: {
    height: 8, borderRadius: 4, backgroundColor: '#20202E',
    overflow: 'hidden', marginBottom: 8,
  },
  curveBarFill: { height: 8, borderRadius: 4 },
  curveFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  curveFooterText: { fontSize: 12, color: '#9CA3AF' },
  lpLiveBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(16,185,129,0.12)', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  lpLiveText: { fontSize: 11, fontWeight: '700', color: '#10B981' },

  // Safety
  safetyCard: {
    backgroundColor: '#12121A', borderRadius: 16,
    borderWidth: 1,
    padding: 16, marginBottom: 12,
  },
  safetyHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  riskBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  riskBadgeText: { fontSize: 11, fontWeight: '700' },
  safetyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  safetyItem: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#0A0A0F', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 5,
  },
  safetyItemGreen: { backgroundColor: 'rgba(16,185,129,0.08)' },
  safetyItemText: { fontSize: 11, fontWeight: '600' },
  signalList: { gap: 5, marginTop: 6 },
  signalRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  signalText: { flex: 1, fontSize: 11, color: '#F59E0B', lineHeight: 15 },

  // Burns
  burnCard: {
    backgroundColor: '#12121A', borderRadius: 16,
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.15)',
    padding: 16, marginBottom: 12,
  },
  burnHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  burnRow: { flexDirection: 'row', backgroundColor: '#0A0A0F', borderRadius: 12, padding: 12 },
  burnItem: { flex: 1, alignItems: 'center', gap: 3 },
  burnDivider: { width: 1, backgroundColor: 'rgba(239,68,68,0.15)' },
  burnVal: { fontSize: 14, fontWeight: '700', color: '#EF4444' },
  burnLbl: { fontSize: 10, color: '#6B7280' },

  // Feed
  feedCard: {
    backgroundColor: '#12121A', borderRadius: 16,
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.1)',
    padding: 16,
  },
  feedHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  feedCount: {
    backgroundColor: 'rgba(139,92,246,0.15)', borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  feedCountText: { fontSize: 11, fontWeight: '700', color: colors.primary },
  feedRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: 'rgba(139,92,246,0.06)',
  },
  feedAvatar: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: 'rgba(139,92,246,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  feedAvatarText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  feedInfo: { flex: 1 },
  feedWallet: { fontSize: 13, fontWeight: '600', color: '#fff' },
  feedTime: { fontSize: 11, color: '#6B7280', marginTop: 1 },
  feedAmount: { fontSize: 13, fontWeight: '700', color: colors.success },
});

// Buy Modal styles
const bs = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#12121A', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderTopWidth: 1, borderTopColor: 'rgba(139,92,246,0.2)',
    padding: 20, paddingBottom: Platform.OS === 'ios' ? 36 : 24, gap: 12,
  },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },

  balRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  balLabel: { fontSize: 13, color: '#6B7280' },
  balValue: { fontSize: 14, fontWeight: '700', color: '#fff' },

  inputLabel: { fontSize: 13, fontWeight: '600', color: '#9CA3AF' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1, backgroundColor: '#0A0A0F',
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.2)',
    borderRadius: 12, paddingVertical: 13, paddingHorizontal: 14,
    fontSize: 16, color: '#fff',
  },
  maxBtn: { backgroundColor: 'rgba(139,92,246,0.15)', borderRadius: 10, paddingVertical: 13, paddingHorizontal: 12 },
  maxBtnText: { fontSize: 12, fontWeight: '700', color: colors.primary },

  estimateCard: {
    backgroundColor: '#0A0A0F', borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.15)',
    padding: 12, alignItems: 'center',
  },
  estimateLabel: { fontSize: 12, color: '#6B7280', marginBottom: 4 },
  estimateValue: { fontSize: 18, fontWeight: '800', color: colors.primary },

  statusRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(139,92,246,0.08)', borderRadius: 10, padding: 12,
  },
  statusText: { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
  errorRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 10, padding: 10,
  },
  errorText: { fontSize: 13, color: '#ef4444', flex: 1 },
  limitsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  limitItem: { fontSize: 12, color: '#6B7280' },

  buyBtn: {
    backgroundColor: colors.primary, borderRadius: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 15,
  },
  buyBtnDisabled: { backgroundColor: 'rgba(139,92,246,0.4)' },
  buyBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  successIcon: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(16,185,129,0.12)',
    alignItems: 'center', justifyContent: 'center',
    alignSelf: 'center', marginBottom: 8,
  },
  successTitle: { fontSize: 22, fontWeight: '800', color: '#fff', textAlign: 'center' },
  successSub: { fontSize: 15, color: '#9CA3AF', textAlign: 'center' },

  explorerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 16,
    borderRadius: 12, borderWidth: 1, borderColor: 'rgba(139,92,246,0.2)',
    backgroundColor: 'rgba(139,92,246,0.08)',
  },
  explorerBtnText: { fontSize: 13, fontWeight: '600', color: colors.primary },

  doneBtn: {
    backgroundColor: colors.primary, borderRadius: 14,
    paddingVertical: 14, alignItems: 'center',
  },
  doneBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
