import { useState, useEffect } from 'react';
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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ArrowLeft, Gift, Users, Coins, Copy, Check, Share2, Star } from 'lucide-react-native';
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
import { colors, spacing, borderRadius, fontSize, elevation } from '@/constants/theme';

export default function RewardsScreen() {
  const router = useRouter();
  const { activeAddress } = useWallet();
  const [loading, setLoading] = useState(true);
  const [referralCode, setReferralCode] = useState('');
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [rewards, setRewards] = useState<UserReward[]>([]);
  const [stats, setStats] = useState({ totalReferrals: 0, totalEarned: 0, unclaimedAmount: 0 });
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [earlyRewardExhausted, setEarlyRewardExhausted] = useState(false);
  const [inputCode, setInputCode] = useState('');
  const [applyingCode, setApplyingCode] = useState(false);
  const [codeApplied, setCodeApplied] = useState(false);
  const [applyError, setApplyError] = useState('');
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimMessage, setClaimMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadData();
  }, [activeAddress]);

  // Pre-fill referral code from URL ?ref= param on web
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        const ref = new URL(window.location.href).searchParams.get('ref');
        if (ref) setInputCode(ref.toUpperCase());
      } catch {}
    }
  }, []);

  const loadData = async () => {
    if (!activeAddress) return;
    setLoading(true);

    const [exhausted] = await Promise.all([
      ReferralService.isEarlyRewardPoolExhausted(),
      ReferralService.checkEarlyUserReward(activeAddress),
    ]);
    setEarlyRewardExhausted(exhausted);

    const [code, refs, rwds, sts] = await Promise.all([
      ReferralService.getOrCreateReferralCode(activeAddress),
      ReferralService.getUserReferrals(activeAddress),
      ReferralService.getUserRewards(activeAddress),
      ReferralService.getReferralStats(activeAddress),
    ]);

    if (code) setReferralCode(code.code);
    setReferrals(refs);
    setRewards(rwds);
    setStats({ totalReferrals: sts.totalReferrals, totalEarned: sts.totalEarned, unclaimedAmount: sts.unclaimedAmount });
    setLoading(false);
  };

  const handleCopyCode = async () => {
    if (!referralCode) return;
    await Clipboard.setStringAsync(referralCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyLink = async () => {
    if (!referralCode) return;
    await Clipboard.setStringAsync(buildReferralLink(referralCode));
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleShareCode = async () => {
    try {
      await Share.share({ message: buildShareMessage(referralCode) });
    } catch {}
  };

  const handleApplyCode = async () => {
    if (!inputCode.trim() || !activeAddress) return;
    setApplyError('');
    setApplyingCode(true);

    const success = await ReferralService.applyReferralCode(
      activeAddress,
      inputCode.trim().toUpperCase(),
    );

    if (success) {
      setCodeApplied(true);
      setInputCode('');
      await loadData();
      setTimeout(() => setCodeApplied(false), 3000);
    } else {
      setApplyError('Invalid code or already applied.');
    }
    setApplyingCode(false);
  };

  const handleClaimReward = async (reward: UserReward) => {
    if (!activeAddress || claimingId) return;
    setClaimingId(reward.id);
    setClaimMessage(null);

    const timeout = new Promise<{ success: false; error: string }>((resolve) =>
      setTimeout(() => resolve({ success: false, error: 'Claim timed out. Please try again.' }), 70_000)
    );

    const result = await Promise.race([
      ReferralService.claimReward(reward.id, activeAddress),
      timeout,
    ]);

    if (result.success) {
      setClaimMessage({ type: 'success', text: 'Reward claimed! DWC sent to your wallet.' });
      await loadData();
    } else {
      setClaimMessage({ type: 'error', text: result.error || 'Claim failed. Please try again.' });
    }

    setClaimingId(null);
    setTimeout(() => setClaimMessage(null), 6000);
  };

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

  return (
    <View style={styles.container}>
      <LinearGradient colors={colors.gradient.primary} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Rewards & Referrals</Text>
      </LinearGradient>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Claim status banner */}
        {claimMessage && (
          <View style={[styles.claimBanner, claimMessage.type === 'success' ? styles.claimBannerSuccess : styles.claimBannerError]}>
            <Text style={styles.claimBannerText}>{claimMessage.text}</Text>
          </View>
        )}

        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Users size={24} color={colors.primary} />
            <Text style={styles.statValue}>{stats.totalReferrals}</Text>
            <Text style={styles.statLabel}>Referrals</Text>
          </View>
          <View style={styles.statCard}>
            <Coins size={24} color={colors.warning} />
            <Text style={styles.statValue}>{stats.totalEarned.toLocaleString()}</Text>
            <Text style={styles.statLabel}>Earned (DWC)</Text>
          </View>
          <View style={styles.statCard}>
            <Gift size={24} color={colors.success} />
            <Text style={styles.statValue}>{stats.unclaimedAmount.toLocaleString()}</Text>
            <Text style={styles.statLabel}>Unclaimed</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Referral Code</Text>

          {earlyRewardExhausted && (
            <View style={styles.exhaustedBanner}>
              <Text style={styles.exhaustedText}>Early reward fully claimed (100/100 users). Referral rewards still active!</Text>
            </View>
          )}

          <View style={styles.codeCard}>
            <View style={styles.codeDisplay}>
              <Text style={styles.codeText}>{referralCode || 'Loading...'}</Text>
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
            Share your code or link. Friends get 150 DWC, you get 300 DWC when they join!
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Have a Referral Code?</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.codeInput}
              placeholder="e.g. DAWEN-AB12CD"
              placeholderTextColor={colors.textMuted}
              value={inputCode}
              onChangeText={t => { setInputCode(t); setApplyError(''); }}
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
              ) : codeApplied ? (
                <>
                  <Check size={16} color={colors.white} />
                  <Text style={styles.applyButtonText}>Applied!</Text>
                </>
              ) : (
                <Text style={styles.applyButtonText}>Apply</Text>
              )}
            </TouchableOpacity>
          </View>
          {!!applyError && <Text style={styles.applyError}>{applyError}</Text>}
        </View>

        {rewards.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your Rewards</Text>
            {rewards.map((reward) => (
              <View key={reward.id} style={styles.rewardCard}>
                <View style={styles.rewardIcon}>
                  <Star size={20} color={colors.warning} fill={colors.warning} />
                </View>
                <View style={styles.rewardInfo}>
                  <Text style={styles.rewardType}>{formatRewardReason(reward.reason)}</Text>
                  <Text style={styles.rewardAmount}>
                    {reward.reward_amount.toLocaleString()} DWC
                  </Text>
                </View>
                {reward.status === 'ready' ? (
                  <TouchableOpacity
                    style={[styles.claimButton, claimingId === reward.id && styles.claimButtonDisabled]}
                    onPress={() => handleClaimReward(reward)}
                    disabled={claimingId === reward.id}
                  >
                    {claimingId === reward.id ? (
                      <ActivityIndicator size="small" color={colors.white} />
                    ) : (
                      <Text style={styles.claimButtonText}>Claim</Text>
                    )}
                  </TouchableOpacity>
                ) : reward.status === 'sent' ? (
                  <View style={styles.claimedBadge}>
                    <Check size={14} color={colors.success} />
                    <Text style={styles.claimedText}>Claimed</Text>
                  </View>
                ) : reward.status === 'claiming' ? (
                  <View style={styles.claimedBadge}>
                    <ActivityIndicator size="small" color={colors.primary} />
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        )}

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
            <Text style={styles.stepText}>You earn 300 DWC, they earn 150 DWC — claimable as real DawenWorld tokens!</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

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
  claimBanner: {
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  claimBannerSuccess: {
    backgroundColor: colors.successMuted,
    borderWidth: 1,
    borderColor: colors.success,
  },
  claimBannerError: {
    backgroundColor: colors.errorMuted ?? 'rgba(239,68,68,0.12)',
    borderWidth: 1,
    borderColor: colors.error ?? '#EF4444',
  },
  claimBannerText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
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
  applyError: {
    fontSize: fontSize.xs,
    color: colors.error ?? '#EF4444',
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
  claimButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    minWidth: 64,
    alignItems: 'center',
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
});
