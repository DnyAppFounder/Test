import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Share,
  Platform,
  Linking,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ArrowLeft, Gift, Users, Coins, Copy, Check, Share2, Star, ExternalLink, Lock, Info } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { useWallet } from '@/contexts/WalletContext';
import {
  ReferralService,
  Referral,
  UserReward,
  buildReferralLink,
  buildShareMessage,
  formatRewardReason,
} from '@/services/referralService';
import { DecodeRewardService, DecodeRewardStatus } from '@/services/decodeRewardService';
import { SignatureWallRewardService } from '@/services/signatureWallRewardService';
import { supabase } from '@/lib/supabase';
import { colors, spacing, borderRadius, fontSize, elevation } from '@/constants/theme';
import { formatTokenAmount } from '@/lib/format';

export default function RewardsScreen() {
  const router = useRouter();
  const { activeAddress, refreshPortfolio } = useWallet();
  const [loading, setLoading]                     = useState(true);
  const [referralCode, setReferralCode]           = useState('');
  const [referrals, setReferrals]                 = useState<Referral[]>([]);
  const [rewards, setRewards]                     = useState<UserReward[]>([]);
  const [stats, setStats]                         = useState({ totalReferrals: 0, totalEarned: 0, unclaimedAmount: 0 });
  const [copied, setCopied]                       = useState(false);
  const [copiedLink, setCopiedLink]               = useState(false);
  const [earlyRewardExhausted, setEarlyRewardExhausted] = useState(false);
  const [inputCode, setInputCode]                 = useState('');
  const [applyingCode, setApplyingCode]           = useState(false);
  const [applySuccess, setApplySuccess]           = useState(false);
  const [applyError, setApplyError]               = useState('');
  const [claimingId, setClaimingId]               = useState<string | null>(null);
  const [claimMessage, setClaimMessage]           = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [claimSignature, setClaimSignature]       = useState<string | null>(null);
  const [decodeStatus, setDecodeStatus]           = useState<DecodeRewardStatus | null>(null);
  const [decodeReward, setDecodeReward]           = useState<UserReward | null>(null);
  const [sigWallSigned, setSigWallSigned]         = useState(false);
  const [sigWallReward, setSigWallReward]         = useState<UserReward | null>(null);
  const [dawenScoreReward, setDawenScoreReward]   = useState<UserReward | null>(null);
  const [dawenScore, setDawenScore]               = useState<number>(0);
  const [claimingDawenScore, setClaimingDawenScore] = useState(false);
  const [generatingCode, setGeneratingCode]       = useState(false);
  const [toast, setToast]                         = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [newRewardIds, setNewRewardIds]           = useState<Set<string>>(new Set());
  const prevRewardIdsRef = useRef<Set<string>>(new Set());

  const [loadError, setLoadError] = useState<string | null>(null);

  const scrollViewRef = useRef<ScrollView>(null);
  const rewardsSectionY = useRef<number>(0);
  const highlightAnim = useRef(new Animated.Value(0)).current;

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Reset stale 'claiming' DB records then load fresh data
  const loadData = useCallback(async () => {
    if (!activeAddress) return;
    setLoading(true);
    setLoadError(null);
    try {
      // Recover any rewards stuck in 'claiming' state by a prior crashed edge call
      await ReferralService.resetStaleClaimingRewards();

      const [exhausted] = await Promise.all([
        ReferralService.isEarlyRewardPoolExhausted(),
        ReferralService.checkEarlyUserReward(activeAddress),
      ]);
      setEarlyRewardExhausted(exhausted);

      const [code, refs, rwds, sts, dStatus, dReward, swSigned] = await Promise.all([
        ReferralService.getOrCreateReferralCode(activeAddress),
        ReferralService.getUserReferrals(activeAddress),
        ReferralService.getUserRewards(activeAddress),
        ReferralService.getReferralStats(activeAddress),
        DecodeRewardService.getStatus(activeAddress),
        DecodeRewardService.getDecodeUserReward(activeAddress),
        SignatureWallRewardService.hasSigned(activeAddress),
      ]);

      if (code) {
        setReferralCode(code.code);
      }
      setReferrals(refs);
      setSigWallSigned(swSigned);
      // Filter decode + signature_wall + dawen_score_15k rewards out of generic list — shown in dedicated cards
      setRewards(rwds.filter(r => r.reason !== 'decode_first_completion' && r.reason !== 'signature_wall' && r.reason !== 'dawen_score_15k'));
      setDecodeStatus(dStatus);
      setDecodeReward(dReward);

      // If signed, ensure reward exists and load it
      if (swSigned) {
        const swReward = await SignatureWallRewardService.ensureReward(activeAddress);
        setSigWallReward(swReward);
      } else {
        // Still try to get existing reward record (e.g., if already claimed)
        const swReward = await SignatureWallRewardService.getReward(activeAddress);
        setSigWallReward(swReward);
      }
      setStats({ totalReferrals: sts.totalReferrals, totalEarned: sts.totalEarned, unclaimedAmount: sts.unclaimedAmount });

      // Load DAWEN score and any existing 15K score reward row
      try {
        const { data: statsRow } = await supabase
          .from('user_stats').select('dawen_score')
          .eq('wallet_address', activeAddress).maybeSingle();
        const score = Number(statsRow?.dawen_score ?? 0);
        setDawenScore(score);
        const dsReward = rwds.find(r => r.reason === 'dawen_score_15k') ?? null;
        setDawenScoreReward(dsReward);
      } catch {}
    } catch (err: any) {
      console.error('[RewardsScreen] loadData error:', err);
      setLoadError(err?.message || 'Failed to load rewards data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [activeAddress]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // After rewards reload, detect newly added reward IDs and scroll to highlight them
  useEffect(() => {
    if (prevRewardIdsRef.current.size === 0) return;
    const freshIds = new Set(
      rewards.filter(r => !prevRewardIdsRef.current.has(r.id)).map(r => r.id)
    );
    if (freshIds.size === 0) return;
    prevRewardIdsRef.current = new Set();
    setNewRewardIds(freshIds);
    // Scroll to rewards section
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({ y: rewardsSectionY.current, animated: true });
    }, 150);
    // Pulse animation: fade highlight in then out
    Animated.sequence([
      Animated.timing(highlightAnim, { toValue: 1, duration: 350, useNativeDriver: false }),
      Animated.delay(1800),
      Animated.timing(highlightAnim, { toValue: 0, duration: 600, useNativeDriver: false }),
    ]).start(() => setNewRewardIds(new Set()));
  }, [rewards]);

  // Pre-fill referral code from URL ?ref= param on web
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        const ref = new URL(window.location.href).searchParams.get('ref');
        if (ref) setInputCode(ref.toUpperCase());
      } catch {}
    }
  }, []);

  const handleGenerateCode = async () => {
    if (generatingCode) return;
    if (!activeAddress) {
      showToast('Please connect or create a wallet first', 'error');
      return;
    }
    setGeneratingCode(true);
    try {
      const code = await ReferralService.getOrCreateReferralCode(activeAddress);
      if (code?.code) {
        setReferralCode(code.code);
        showToast(referralCode ? 'Referral code loaded' : 'Referral code generated', 'success');
      } else {
        showToast('Unable to generate referral code', 'error');
      }
    } catch (err: any) {
      console.error('[RewardsScreen] handleGenerateCode error:', err);
      showToast('Unable to generate referral code', 'error');
    } finally {
      setGeneratingCode(false);
    }
  };

  const handleCopyCode = async () => {
    if (!referralCode) return;
    await Clipboard.setStringAsync(referralCode);
    setCopied(true);
    showToast('Code copied', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyLink = async () => {
    if (!referralCode) return;
    await Clipboard.setStringAsync(buildReferralLink(referralCode));
    setCopiedLink(true);
    showToast('Referral link copied', 'success');
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleShareCode = async () => {
    try {
      await Share.share({ message: buildShareMessage(referralCode) });
    } catch {}
  };

  const handleApplyCode = async () => {
    const code = inputCode.trim().toUpperCase();
    if (!code || !activeAddress) return;

    // Always clear previous status before a new attempt
    setApplyError('');
    setApplySuccess(false);
    setApplyingCode(true);

    const result = await ReferralService.applyReferralCode(activeAddress, code);

    setApplyingCode(false);

    if (result.success) {
      setApplySuccess(true);
      setInputCode('');
      // Snapshot current IDs before reload so we can identify new ones after
      prevRewardIdsRef.current = new Set(rewards.map(r => r.id));
      await loadData();
      if (result.payoutPending) {
        setApplyError('Referral saved! Reward payout is pending — you can claim it from the rewards list once it processes.');
      } else {
        setTimeout(() => setApplySuccess(false), 4000);
      }
    } else {
      switch (result.reason) {
        case 'already_applied':
          setApplyError('Referral already applied to your account.');
          break;
        case 'self_referral':
          setApplyError('You cannot use your own referral code.');
          break;
        case 'invalid_code':
          setApplyError('Invalid referral code. Please check and try again.');
          break;
        default:
          setApplyError('Something went wrong. Please try again.');
      }
    }
  };

  const handleClaimReward = async (reward: UserReward) => {
    if (!activeAddress || claimingId) return;
    setClaimingId(reward.id);
    setClaimMessage(null);

    // Race the edge-function call against a 75-second UI timeout
    const timeout = new Promise<{ success: false; error: string }>((resolve) =>
      setTimeout(
        () => resolve({ success: false, error: 'Claim is taking longer than expected. Please check again.' }),
        75_000,
      )
    );

    const result = await Promise.race([
      ReferralService.claimReward(reward.id, activeAddress),
      timeout,
    ]);

    if (result.success) {
      const sig = (result as any).signature as string | undefined;
      setClaimSignature(sig ?? null);
      setClaimMessage({ type: 'success', text: `Claim successful — ${Number(reward.reward_amount).toLocaleString('en-US', { maximumFractionDigits: 0 })} $DWORLD sent to your wallet.` });
      // Refresh DWC balance after confirmed transfer
      refreshPortfolio().catch(() => {});
    } else {
      setClaimSignature(null);
      setClaimMessage({ type: 'error', text: result.error || 'Claim failed. Please try again.' });
    }

    setClaimingId(null);

    // Always reload from Supabase so the UI reflects the real claim status,
    // including resetting any stale 'claiming' left by a timed-out edge call.
    await loadData();

    setTimeout(() => { setClaimMessage(null); setClaimSignature(null); }, 10000);
  };

  // Signature Wall specific: ensure reward row exists first, then claim
  const handleSigWallClaim = async (existingReward?: UserReward) => {
    if (!activeAddress || claimingId) return;
    let reward = existingReward ?? sigWallReward;
    if (!reward) {
      // Try to create/fetch the reward row
      setClaimingId('sig-wall-pending');
      reward = await SignatureWallRewardService.ensureReward(activeAddress);
      setClaimingId(null);
      if (!reward) {
        setClaimMessage({ type: 'error', text: 'Could not create reward — check that your wallet has signed the Signature Wall, then try again. (See console for details.)' });
        setTimeout(() => setClaimMessage(null), 8000);
        return;
      }
      setSigWallReward(reward);
    }
    await handleClaimReward(reward);
  };

  // DAWEN Score 15K reward: create via RPC then claim
  const handleDawenScoreClaim = async () => {
    if (!activeAddress || claimingId || claimingDawenScore) return;
    setClaimingDawenScore(true);
    try {
      const { data, error } = await supabase.rpc('create_dawen_score_reward', { p_wallet: activeAddress });
      if (error || !data?.reward_id) {
        setClaimMessage({ type: 'error', text: data?.reason === 'score_too_low' ? 'Your DAWEN Score is below 15,000.' : 'Could not create reward. Please try again.' });
        setTimeout(() => setClaimMessage(null), 6000);
        setClaimingDawenScore(false);
        return;
      }
      // Fetch the reward row by ID
      const { data: rewardRow } = await supabase
        .from('user_rewards').select('*').eq('id', data.reward_id).maybeSingle();
      setClaimingDawenScore(false);
      if (!rewardRow) {
        setClaimMessage({ type: 'error', text: 'Could not load reward. Please refresh and try again.' });
        setTimeout(() => setClaimMessage(null), 6000);
        return;
      }
      setDawenScoreReward(rewardRow as UserReward);
      await handleClaimReward(rewardRow as UserReward);
    } catch {
      setClaimingDawenScore(false);
      setClaimMessage({ type: 'error', text: 'Something went wrong. Please try again.' });
      setTimeout(() => setClaimMessage(null), 6000);
    }
  };

  // ── No wallet ──────────────────────────────────────────────────────────────
  if (!activeAddress) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={colors.gradient.primary} style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Rewards</Text>
        </LinearGradient>
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Connect wallet to view rewards</Text>
        </View>
      </View>
    );
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={colors.gradient.primary} style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Rewards</Text>
        </LinearGradient>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  // ── Main content ───────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Toast notification */}
      {toast && (
        <View style={[
          styles.toastBanner,
          toast.type === 'success' ? styles.toastSuccess
            : toast.type === 'error' ? styles.toastError
            : styles.toastInfo,
        ]} pointerEvents="none">
          <Text style={styles.toastText}>{toast.text}</Text>
        </View>
      )}

      <LinearGradient colors={colors.gradient.primary} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Rewards & Referrals</Text>
      </LinearGradient>

      <ScrollView ref={scrollViewRef} style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Load error banner */}
        {!!loadError && (
          <View style={[styles.statusBanner, styles.bannerError]}>
            <Text style={styles.statusBannerText}>{loadError}</Text>
          </View>
        )}

        {/* Claim status banner */}
        {claimMessage && (
          <View style={[styles.statusBanner, claimMessage.type === 'success' ? styles.bannerSuccess : styles.bannerError]}>
            <Text style={styles.statusBannerText}>{claimMessage.text}</Text>
            {claimMessage.type === 'success' && claimSignature && (
              <TouchableOpacity
                onPress={() => {
                  const url = `https://solscan.io/tx/${claimSignature}`;
                  if (Platform.OS === 'web') {
                    (window as any).open(url, '_blank', 'noopener,noreferrer');
                  } else {
                    Linking.openURL(url).catch(() => {});
                  }
                }}
                style={styles.solscanLink}
                activeOpacity={0.7}
              >
                <ExternalLink size={13} color={colors.success} strokeWidth={2} />
                <Text style={styles.solscanLinkText}>View transaction on Solscan</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Stats grid */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Users size={24} color={colors.primary} />
            <Text style={styles.statValue}>{stats.totalReferrals}</Text>
            <Text style={styles.statLabel}>Referrals</Text>
          </View>
          <View style={styles.statCard}>
            <Coins size={24} color={colors.warning} />
            <Text style={styles.statValue}>{formatTokenAmount(stats.totalEarned)}</Text>
            <Text style={styles.statLabel}>Earned ($DWORLD)</Text>
          </View>
          <View style={styles.statCard}>
            <Gift size={24} color={colors.success} />
            <Text style={styles.statValue}>{formatTokenAmount(stats.unclaimedAmount)}</Text>
            <Text style={styles.statLabel}>Unclaimed</Text>
          </View>
        </View>

        {/* Your referral code */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Referral Code</Text>

          {earlyRewardExhausted && (
            <View style={styles.exhaustedBanner}>
              <Text style={styles.exhaustedText}>Early reward fully claimed (100/100 users). Referral rewards still active!</Text>
            </View>
          )}

          <View style={styles.codeCard}>
            <View style={styles.codeDisplay}>
              {referralCode ? (
                <Text style={styles.codeText}>{referralCode}</Text>
              ) : generatingCode ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <TouchableOpacity onPress={handleGenerateCode} activeOpacity={0.7} style={styles.generateBtn}>
                  <Gift size={16} color={colors.primary} />
                  <Text style={styles.generateBtnText}>Tap to generate your code</Text>
                </TouchableOpacity>
              )}
            </View>

            {!!referralCode && (
              <Text style={styles.referralLinkText} numberOfLines={1}>
                {buildReferralLink(referralCode)}
              </Text>
            )}

            <View style={styles.codeActions}>
              <TouchableOpacity style={styles.codeButton} onPress={handleCopyCode} disabled={!referralCode}>
                {copied ? (
                  <>
                    <Check size={16} color={colors.success} />
                    <Text style={[styles.codeButtonText, { color: colors.success }]}>Copied!</Text>
                  </>
                ) : (
                  <>
                    <Copy size={16} color={colors.primary} />
                    <Text style={styles.codeButtonText}>Copy Code</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.codeButton} onPress={handleCopyLink} disabled={!referralCode}>
                {copiedLink ? (
                  <>
                    <Check size={16} color={colors.success} />
                    <Text style={[styles.codeButtonText, { color: colors.success }]}>Copied!</Text>
                  </>
                ) : (
                  <>
                    <Copy size={16} color={colors.primary} />
                    <Text style={styles.codeButtonText}>Copy Link</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.codeButton} onPress={handleShareCode} disabled={!referralCode}>
                <Share2 size={16} color={colors.primary} />
                <Text style={styles.codeButtonText}>Share</Text>
              </TouchableOpacity>
            </View>
          </View>
          <Text style={styles.codeHint}>
            Share your code or link. Friends get 150 $DWORLD, you get 300 $DWORLD when they join!
          </Text>
        </View>

        {/* Apply a referral code */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Have a Referral Code?</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.codeInput}
              placeholder="e.g. DAWEN-X7K9P4Q2"
              placeholderTextColor={colors.textMuted}
              value={inputCode}
              onChangeText={t => {
                setInputCode(t);
                setApplyError('');
                setApplySuccess(false);
              }}
              autoCapitalize="characters"
              maxLength={20}
            />
            <TouchableOpacity
              style={[styles.applyButton, (!inputCode.trim() || applyingCode) && styles.applyButtonDisabled]}
              onPress={handleApplyCode}
              disabled={!inputCode.trim() || applyingCode}
            >
              {applyingCode ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : applySuccess ? (
                <>
                  <Check size={16} color={colors.white} />
                  <Text style={styles.applyButtonText}>Applied!</Text>
                </>
              ) : (
                <Text style={styles.applyButtonText}>Apply</Text>
              )}
            </TouchableOpacity>
          </View>
          {applySuccess && (
            <Text style={styles.applySuccessText}>Referral applied successfully! Your 5,000 $DWORLD reward is ready to claim.</Text>
          )}
          {!!applyError && (
            <Text style={styles.applyError}>{applyError}</Text>
          )}
        </View>

        {/* Decode the 7 Fragments Reward */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Decode the 7 Fragments Reward</Text>
          <DecodeRewardCard
            status={decodeStatus}
            reward={decodeReward}
            claimingId={claimingId}
            onClaim={handleClaimReward}
          />
        </View>

        {/* Signature Wall Reward */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Signature Wall Reward</Text>
          <SignatureWallRewardCard
            hasSigned={sigWallSigned}
            reward={sigWallReward}
            claimingId={claimingId}
            onClaim={handleSigWallClaim}
            onGoToWall={() => router.push('/signature-wall' as any)}
          />
        </View>

        {/* 15K DAWEN Score Reward */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>15K DAWEN Score Reward</Text>
          <DawenScoreRewardCard
            dawenScore={dawenScore}
            reward={dawenScoreReward}
            claimingId={claimingId}
            claiming={claimingDawenScore}
            onClaim={handleDawenScoreClaim}
          />
        </View>

        {/* Regular reward cards */}
        {rewards.length > 0 && (
          <View
            style={styles.section}
            onLayout={e => { rewardsSectionY.current = e.nativeEvent.layout.y; }}
          >
            <Text style={styles.sectionTitle}>Your Rewards</Text>
            {rewards.map((reward) => (
              <RewardCard
                key={reward.id}
                reward={reward}
                claimingId={claimingId}
                onClaim={handleClaimReward}
                isNew={newRewardIds.has(reward.id)}
                highlightAnim={highlightAnim}
              />
            ))}
          </View>
        )}

        {/* Referral list */}
        {referrals.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your Referrals ({referrals.length})</Text>
            {referrals.map((referral) => (
              <View key={referral.id} style={styles.referralCard}>
                <View style={styles.referralAvatar}>
                  <Users size={16} color={colors.primary} />
                </View>
                <View style={styles.referralInfo}>
                  <Text style={styles.referralName}>
                    {referral.referred?.username || 'Anonymous User'}
                  </Text>
                  <Text style={styles.referralDate}>
                    {new Date(referral.created_at).toLocaleDateString()}
                    {referral.status === 'qualified' ? ' · Qualified' : ' · Pending'}
                  </Text>
                </View>
                {referral.status === 'qualified' && (
                  <View style={styles.rewardClaimedIcon}>
                    <Check size={14} color={colors.success} />
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {/* $DAWORLD info box */}
        <View style={styles.daworldInfoBox}>
          <View style={styles.daworldInfoHeader}>
            <Info size={14} color="#60A5FA" strokeWidth={2} />
            <Text style={styles.daworldInfoTitle}>About $DAWORLD Rewards</Text>
          </View>
          <Text style={styles.daworldInfoText}>
            $DAWORLD rewards are for Dawen World, in-app utility, gaming features, and future boutique/shop features. $DAWORLD is not the official DAWEN token.
          </Text>
          <Text style={[styles.daworldInfoText, { marginTop: 6 }]}>
            There is no reason to try to buy or accumulate a large part of the $DAWORLD supply. Its main purpose is utility inside the DAWEN app ecosystem.
          </Text>
        </View>

        {/* How it works */}
        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>How It Works</Text>
          <View style={styles.infoStep}>
            <View style={styles.stepNumber}><Text style={styles.stepNumberText}>1</Text></View>
            <Text style={styles.stepText}>Share your DAWEN referral code with friends</Text>
          </View>
          <View style={styles.infoStep}>
            <View style={styles.stepNumber}><Text style={styles.stepNumberText}>2</Text></View>
            <Text style={styles.stepText}>They join DAWEN and connect their wallet</Text>
          </View>
          <View style={styles.infoStep}>
            <View style={styles.stepNumber}><Text style={styles.stepNumberText}>3</Text></View>
            <Text style={styles.stepText}>You earn 300 $DWORLD, they earn 150 $DWORLD — claimable as real DWORLD tokens!</Text>
          </View>
          <View style={styles.infoStep}>
            <View style={styles.stepNumber}><Text style={styles.stepNumberText}>4</Text></View>
            <Text style={styles.stepText}>First 100 members who join get an additional 10,000 $DWORLD Early Member Reward!</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

// ── Decode reward card ────────────────────────────────────────────────────────

interface DecodeRewardCardProps {
  status: DecodeRewardStatus | null;
  reward: UserReward | null;
  claimingId: string | null;
  onClaim: (reward: UserReward) => void;
}

function DecodeRewardCard({ status, reward, claimingId, onClaim }: DecodeRewardCardProps) {
  const isLocked    = !status?.reward_unlocked;
  const isClaimed   = reward?.status === 'sent';
  const isFailed    = reward?.status === 'failed';
  const isClaiming  = reward ? claimingId === reward.id : false;
  const isReady     = reward?.status === 'ready' || reward?.status === 'failed';

  const statusColor = isClaimed ? colors.success : isLocked ? colors.textMuted : '#EC4899';

  const action = (() => {
    if (isLocked) {
      return (
        <View style={styles.claimedBadge}>
          <Lock size={13} color={colors.textMuted} />
          <Text style={[styles.claimedText, { color: colors.textMuted }]}>Locked</Text>
        </View>
      );
    }
    if (isClaimed) {
      return (
        <View style={styles.claimedBadge}>
          <Check size={14} color={colors.success} />
          <Text style={styles.claimedText}>Claimed</Text>
        </View>
      );
    }
    if (isClaiming) {
      return (
        <View style={styles.claimedBadge}>
          <ActivityIndicator size="small" color="#EC4899" />
        </View>
      );
    }
    if (isReady && reward) {
      return (
        <TouchableOpacity
          style={[styles.claimButton, { backgroundColor: '#EC4899' }, !!claimingId && styles.claimButtonDisabled]}
          onPress={() => onClaim(reward)}
          disabled={!!claimingId}
        >
          <Text style={styles.claimButtonText}>{isFailed ? 'Retry' : 'Claim'}</Text>
        </TouchableOpacity>
      );
    }
    return null;
  })();

  return (
    <View style={[styles.rewardCard, { borderColor: isLocked ? colors.surfaceBorder : 'rgba(236,72,153,0.3)' }]}>
      <View style={[styles.rewardIcon, { backgroundColor: isLocked ? colors.surface : 'rgba(236,72,153,0.12)' }]}>
        <Gift size={20} color={statusColor} />
      </View>
      <View style={styles.rewardInfo}>
        <Text style={styles.rewardType}>Decode the 7 Fragments Reward</Text>
        <Text style={[styles.rewardAmount, { color: statusColor }]}>15,000 $DWORLD</Text>
        {isLocked && (
          <Text style={styles.failedText}>
            Complete Free Practice to unlock
          </Text>
        )}
        {!isLocked && !isClaimed && (
          <Text style={[styles.failedText, { color: '#F472B6' }]}>
            You unlocked 15,000 DWORLD. Claim now.
          </Text>
        )}
        {isClaimed && reward?.transaction_signature && (
          <TouchableOpacity
            onPress={() => {
              const url = `https://solscan.io/tx/${reward.transaction_signature}`;
              if (Platform.OS === 'web') {
                (window as any).open(url, '_blank', 'noopener,noreferrer');
              } else {
                Linking.openURL(url).catch(() => {});
              }
            }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 }}
            activeOpacity={0.7}
          >
            <ExternalLink size={11} color={colors.primary} strokeWidth={2} />
            <Text style={styles.txHash} numberOfLines={1}>
              {reward.transaction_signature.slice(0, 18)}…
            </Text>
          </TouchableOpacity>
        )}
      </View>
      {action}
    </View>
  );
}

// ── Signature Wall reward card ────────────────────────────────────────────────

interface SignatureWallRewardCardProps {
  hasSigned: boolean;
  reward: UserReward | null;
  claimingId: string | null;
  onClaim: (reward?: UserReward) => void;
  onGoToWall: () => void;
}

function SignatureWallRewardCard({ hasSigned, reward, claimingId, onClaim, onGoToWall }: SignatureWallRewardCardProps) {
  const isClaimed   = reward?.status === 'sent';
  const isClaiming  = claimingId === 'sig-wall-pending' || (reward ? claimingId === reward.id : false);
  const isReady     = reward?.status === 'ready' || reward?.status === 'failed';
  const accentColor = '#10B981';

  const action = (() => {
    if (isClaiming) {
      return (
        <View style={styles.claimedBadge}>
          <ActivityIndicator size="small" color={accentColor} />
        </View>
      );
    }
    if (isClaimed) {
      return (
        <View style={styles.claimedBadge}>
          <Check size={14} color={colors.success} />
          <Text style={styles.claimedText}>Claimed</Text>
        </View>
      );
    }
    if (hasSigned) {
      // Show Claim whether or not reward row is loaded yet — handleSigWallClaim creates it if missing
      return (
        <TouchableOpacity
          style={[styles.claimButton, { backgroundColor: accentColor }, !!claimingId && styles.claimButtonDisabled]}
          onPress={() => onClaim(reward ?? undefined)}
          disabled={!!claimingId}
          activeOpacity={0.8}
        >
          <Text style={styles.claimButtonText}>{reward?.status === 'failed' ? 'Retry' : 'Claim'}</Text>
        </TouchableOpacity>
      );
    }
    // Not signed yet
    return (
      <TouchableOpacity style={[styles.claimButton, { backgroundColor: '#374151' }]} onPress={onGoToWall} activeOpacity={0.8}>
        <Text style={styles.claimButtonText}>Go to Wall</Text>
      </TouchableOpacity>
    );
  })();

  return (
    <View style={[styles.rewardCard, { borderColor: hasSigned ? 'rgba(16,185,129,0.3)' : colors.surfaceBorder }]}>
      <View style={[styles.rewardIcon, { backgroundColor: hasSigned ? 'rgba(16,185,129,0.12)' : colors.surface }]}>
        <Gift size={20} color={hasSigned ? accentColor : colors.textMuted} />
      </View>
      <View style={styles.rewardInfo}>
        <Text style={styles.rewardType}>Signature Wall Reward</Text>
        <Text style={[styles.rewardAmount, { color: hasSigned ? accentColor : colors.textMuted }]}>10,000 $DWORLD</Text>
        {!hasSigned && (
          <Text style={styles.failedText}>Sign the Signature Wall to unlock this reward</Text>
        )}
        {hasSigned && !isClaimed && (
          <Text style={[styles.failedText, { color: '#34D399' }]}>You signed the wall — claim your reward!</Text>
        )}
        {isClaimed && reward?.transaction_signature && (
          <TouchableOpacity
            onPress={() => {
              const url = `https://solscan.io/tx/${reward.transaction_signature}`;
              if (Platform.OS === 'web') {
                (window as any).open(url, '_blank', 'noopener,noreferrer');
              } else {
                Linking.openURL(url).catch(() => {});
              }
            }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 }}
            activeOpacity={0.7}
          >
            <ExternalLink size={11} color={colors.primary} strokeWidth={2} />
            <Text style={styles.txHash} numberOfLines={1}>
              {reward.transaction_signature.slice(0, 18)}…
            </Text>
          </TouchableOpacity>
        )}
      </View>
      {action}
    </View>
  );
}

// ── DAWEN Score 15K reward card ───────────────────────────────────────────────

interface DawenScoreRewardCardProps {
  dawenScore: number;
  reward: UserReward | null;
  claimingId: string | null;
  claiming: boolean;
  onClaim: () => void;
}

function DawenScoreRewardCard({ dawenScore, reward, claimingId, claiming, onClaim }: DawenScoreRewardCardProps) {
  const THRESHOLD    = 15_000;
  const isEligible   = dawenScore >= THRESHOLD;
  const isClaimed    = reward?.status === 'sent';
  const isFailed     = reward?.status === 'failed';
  const isClaiming   = claiming || (reward ? claimingId === reward.id : false);
  const accentColor  = '#F59E0B';
  const pct          = Math.min(1, dawenScore / THRESHOLD);

  const action = (() => {
    if (isClaiming) {
      return (
        <View style={styles.claimedBadge}>
          <ActivityIndicator size="small" color={accentColor} />
        </View>
      );
    }
    if (isClaimed) {
      return (
        <View style={styles.claimedBadge}>
          <Check size={14} color={colors.success} />
          <Text style={styles.claimedText}>Claimed</Text>
        </View>
      );
    }
    if (isEligible) {
      return (
        <TouchableOpacity
          style={[styles.claimButton, { backgroundColor: accentColor }, !!claimingId && styles.claimButtonDisabled]}
          onPress={onClaim}
          disabled={!!claimingId}
          activeOpacity={0.8}
        >
          <Text style={styles.claimButtonText}>{isFailed ? 'Retry' : 'Claim'}</Text>
        </TouchableOpacity>
      );
    }
    return (
      <View style={styles.claimedBadge}>
        <Lock size={13} color={colors.textMuted} />
        <Text style={[styles.claimedText, { color: colors.textMuted }]}>Locked</Text>
      </View>
    );
  })();

  return (
    <View style={[styles.rewardCard, { borderColor: isEligible ? `rgba(245,158,11,0.35)` : colors.surfaceBorder }]}>
      <View style={[styles.rewardIcon, { backgroundColor: isEligible ? 'rgba(245,158,11,0.12)' : colors.surface }]}>
        <Star size={20} color={isEligible ? accentColor : colors.textMuted} fill={isEligible ? accentColor : 'none'} />
      </View>
      <View style={styles.rewardInfo}>
        <Text style={styles.rewardType}>15K DAWEN Score Reward</Text>
        <Text style={[styles.rewardAmount, { color: isEligible ? accentColor : colors.textMuted }]}>50,000 $DWORLD</Text>
        {!isClaimed && (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 }}>
              <View style={{ flex: 1, height: 4, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                <View style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: isEligible ? accentColor : '#4B5563', borderRadius: 2 }} />
              </View>
              <Text style={{ fontSize: 9, color: isEligible ? accentColor : colors.textMuted, fontWeight: '700' }}>
                {dawenScore.toLocaleString()}/{THRESHOLD.toLocaleString()}
              </Text>
            </View>
            {!isEligible && (
              <Text style={styles.failedText}>Score {(THRESHOLD - dawenScore).toLocaleString()} more points to unlock</Text>
            )}
            {isEligible && !isClaimed && (
              <Text style={[styles.failedText, { color: '#FCD34D' }]}>You reached 15K! Claim 50,000 $DWORLD.</Text>
            )}
          </>
        )}
        {isClaimed && reward?.transaction_signature && (
          <TouchableOpacity
            onPress={() => {
              const url = `https://solscan.io/tx/${reward.transaction_signature}`;
              if (Platform.OS === 'web') {
                (window as any).open(url, '_blank', 'noopener,noreferrer');
              } else {
                Linking.openURL(url).catch(() => {});
              }
            }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 }}
            activeOpacity={0.7}
          >
            <ExternalLink size={11} color={colors.primary} strokeWidth={2} />
            <Text style={styles.txHash} numberOfLines={1}>
              {reward.transaction_signature.slice(0, 18)}…
            </Text>
          </TouchableOpacity>
        )}
      </View>
      {action}
    </View>
  );
}

// ── Reward card subcomponent ──────────────────────────────────────────────────

interface RewardCardProps {
  reward: UserReward;
  claimingId: string | null;
  onClaim: (reward: UserReward) => void;
  isNew?: boolean;
  highlightAnim?: Animated.Value;
}

function RewardCard({ reward, claimingId, onClaim, isNew, highlightAnim }: RewardCardProps) {
  const isActivelyClaiming = claimingId === reward.id;

  const action = (() => {
    if (reward.status === 'sent') {
      return (
        <View style={styles.claimedBadge}>
          <Check size={14} color={colors.success} />
          <Text style={styles.claimedText}>Claimed</Text>
        </View>
      );
    }
    if (reward.status === 'failed') {
      return (
        <TouchableOpacity
          style={[styles.claimButton, styles.claimButtonRetry]}
          onPress={() => onClaim(reward)}
          disabled={!!claimingId}
        >
          <Text style={[styles.claimButtonText, { fontSize: 11 }]}>Retry</Text>
        </TouchableOpacity>
      );
    }
    // 'claiming' — spinner (stale state was already reset by loadData,
    // but show spinner if it just transitioned)
    if (reward.status === 'claiming') {
      return (
        <View style={styles.claimedBadge}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      );
    }
    // 'ready'
    return (
      <TouchableOpacity
        style={[styles.claimButton, (isActivelyClaiming || !!claimingId) && styles.claimButtonDisabled]}
        onPress={() => onClaim(reward)}
        disabled={isActivelyClaiming || !!claimingId}
      >
        {isActivelyClaiming ? (
          <ActivityIndicator size="small" color={colors.white} />
        ) : (
          <Text style={styles.claimButtonText}>Claim</Text>
        )}
      </TouchableOpacity>
    );
  })();

  const highlightBorder = isNew && highlightAnim
    ? highlightAnim.interpolate({ inputRange: [0, 1], outputRange: ['rgba(16,185,129,0)', 'rgba(16,185,129,0.6)'] })
    : undefined;
  const highlightBg = isNew && highlightAnim
    ? highlightAnim.interpolate({ inputRange: [0, 1], outputRange: [colors.surface, 'rgba(16,185,129,0.08)'] })
    : undefined;

  return (
    <Animated.View style={[
      styles.rewardCard,
      highlightBg ? { backgroundColor: highlightBg } : undefined,
      highlightBorder ? { borderColor: highlightBorder } : undefined,
    ]}>
      <View style={styles.rewardIcon}>
        <Star size={20} color={colors.warning} fill={colors.warning} />
      </View>
      <View style={styles.rewardInfo}>
        <Text style={styles.rewardType}>{formatRewardReason(reward.reason)}</Text>
        <Text style={styles.rewardAmount}>
          {Number(reward.reward_amount).toLocaleString('en-US', { maximumFractionDigits: 0 })} $DWORLD
        </Text>
        {reward.status === 'sent' && reward.transaction_signature && (
          <TouchableOpacity
            onPress={() => {
              const url = `https://solscan.io/tx/${reward.transaction_signature}`;
              if (Platform.OS === 'web') {
                (window as any).open(url, '_blank', 'noopener,noreferrer');
              } else {
                Linking.openURL(url).catch(() => {});
              }
            }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 }}
            activeOpacity={0.7}
          >
            <ExternalLink size={11} color={colors.primary} strokeWidth={2} />
            <Text style={styles.txHash} numberOfLines={1}>
              {reward.transaction_signature.slice(0, 18)}…
            </Text>
          </TouchableOpacity>
        )}
        {reward.status === 'failed' && (
          <Text style={styles.failedText}>Transfer failed — tap Retry</Text>
        )}
      </View>
      {action}
    </Animated.View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 56,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  backButton: {
    marginRight: spacing.md,
  },
  headerTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: fontSize.md,
    color: colors.textMuted,
  },
  statusBanner: {
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  bannerSuccess: {
    backgroundColor: colors.successMuted,
    borderWidth: 1,
    borderColor: colors.success,
  },
  bannerError: {
    backgroundColor: (colors as any).errorMuted ?? 'rgba(239,68,68,0.12)',
    borderWidth: 1,
    borderColor: (colors as any).error ?? '#EF4444',
  },
  statusBannerText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  solscanLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  solscanLinkText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.success,
    textDecorationLine: 'underline',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    ...elevation.sm,
  },
  statValue: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: spacing.sm,
  },
  statLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  section: {
    marginBottom: spacing.xxl,
  },
  sectionTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  codeCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    ...elevation.sm,
  },
  codeDisplay: {
    backgroundColor: colors.primaryMuted,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  codeText: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 2,
  },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  generateBtnText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.primary,
  },
  codeActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  codeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
  },
  codeButtonText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.primary,
  },
  exhaustedBanner: {
    backgroundColor: colors.warningMuted,
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  exhaustedText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.warning,
    textAlign: 'center',
  },
  referralLinkText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  codeHint: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: spacing.sm,
    lineHeight: 18,
  },
  inputRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  codeInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    fontSize: fontSize.md,
    color: colors.textPrimary,
  },
  applyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.md,
    minWidth: 100,
  },
  applyButtonDisabled: {
    opacity: 0.5,
  },
  applyButtonText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.white,
  },
  applySuccessText: {
    fontSize: fontSize.sm,
    color: colors.success,
    marginTop: spacing.sm,
    fontWeight: '600',
  },
  applyError: {
    fontSize: fontSize.xs,
    color: (colors as any).error ?? '#EF4444',
    marginTop: spacing.xs,
  },
  rewardCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    ...elevation.sm,
  },
  rewardIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.warningMuted,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  rewardInfo: {
    flex: 1,
  },
  rewardType: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  rewardAmount: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.warning,
    marginTop: 2,
  },
  txHash: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 2,
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
  },
  failedText: {
    fontSize: 10,
    color: (colors as any).error ?? '#EF4444',
    marginTop: 2,
  },
  claimButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    minWidth: 64,
    alignItems: 'center',
  },
  claimButtonRetry: {
    backgroundColor: (colors as any).error ?? '#EF4444',
  },
  claimButtonDisabled: {
    opacity: 0.6,
  },
  claimButtonText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.white,
  },
  claimedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.successMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  claimedText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.success,
  },
  referralCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    ...elevation.sm,
  },
  referralAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryMuted,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  referralInfo: {
    flex: 1,
  },
  referralName: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  referralDate: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  rewardClaimedIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.successMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoSection: {
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
  },
  infoTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  infoStep: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
    flexShrink: 0,
  },
  stepNumberText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.white,
  },
  stepText: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  daworldInfoBox: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    backgroundColor: 'rgba(96,165,250,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.25)',
    borderRadius: 12,
    padding: spacing.md,
  },
  daworldInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  daworldInfoTitle: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: '#93C5FD',
  },
  daworldInfoText: {
    fontSize: fontSize.sm,
    color: 'rgba(255,255,255,0.65)',
    lineHeight: 20,
  },
  toastBanner: {
    position: 'absolute',
    top: 100,
    left: 24,
    right: 24,
    zIndex: 999,
    borderRadius: 12,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    ...elevation.md,
  },
  toastSuccess: {
    backgroundColor: 'rgba(16,185,129,0.95)',
  },
  toastError: {
    backgroundColor: 'rgba(239,68,68,0.95)',
  },
  toastInfo: {
    backgroundColor: 'rgba(59,130,246,0.95)',
  },
  toastText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.white,
  },
});
