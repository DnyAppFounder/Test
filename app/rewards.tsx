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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ArrowLeft, Gift, Users, Coins, Copy, Check, Share2, Star } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { useWallet } from '@/contexts/WalletContext';
import { ReferralService, Referral, ReferralReward } from '@/services/referralService';
import { colors, spacing, borderRadius, fontSize, elevation } from '@/constants/theme';

export default function RewardsScreen() {
  const router = useRouter();
  const { selectedAccount } = useWallet();
  const [loading, setLoading] = useState(true);
  const [referralCode, setReferralCode] = useState('');
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [rewards, setRewards] = useState<ReferralReward[]>([]);
  const [stats, setStats] = useState({ totalReferrals: 0, totalRewards: 0, unclaimedRewards: 0 });
  const [copied, setCopied] = useState(false);
  const [inputCode, setInputCode] = useState('');
  const [applyingCode, setApplyingCode] = useState(false);
  const [codeApplied, setCodeApplied] = useState(false);

  useEffect(() => {
    loadData();
  }, [selectedAccount]);

  const loadData = async () => {
    if (!selectedAccount) return;

    setLoading(true);
    const [code, refs, rwds, sts] = await Promise.all([
      ReferralService.getOrCreateReferralCode(selectedAccount.address),
      ReferralService.getUserReferrals(selectedAccount.address),
      ReferralService.getUserRewards(selectedAccount.address),
      ReferralService.getReferralStats(selectedAccount.address),
    ]);

    if (code) setReferralCode(code.code);
    setReferrals(refs);
    setRewards(rwds);
    setStats(sts);
    setLoading(false);
  };

  const handleCopyCode = async () => {
    await Clipboard.setStringAsync(referralCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareCode = async () => {
    try {
      await Share.share({
        message: `Join me on DNY with my referral code: ${referralCode}\n\nGet crypto rewards when you sign up!`,
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const handleApplyCode = async () => {
    if (!inputCode.trim() || !selectedAccount) return;

    setApplyingCode(true);
    const success = await ReferralService.applyReferralCode(
      selectedAccount.address,
      inputCode.trim().toUpperCase()
    );

    if (success) {
      setCodeApplied(true);
      setInputCode('');
      await loadData();
      setTimeout(() => setCodeApplied(false), 3000);
    }
    setApplyingCode(false);
  };

  const handleClaimReward = async (rewardId: string) => {
    const success = await ReferralService.claimReward(rewardId);
    if (success) {
      await loadData();
    }
  };

  if (!selectedAccount) {
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
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Users size={24} color={colors.primary} />
            <Text style={styles.statValue}>{stats.totalReferrals}</Text>
            <Text style={styles.statLabel}>Referrals</Text>
          </View>
          <View style={styles.statCard}>
            <Coins size={24} color={colors.warning} />
            <Text style={styles.statValue}>${stats.totalRewards.toFixed(2)}</Text>
            <Text style={styles.statLabel}>Total Earned</Text>
          </View>
          <View style={styles.statCard}>
            <Gift size={24} color={colors.success} />
            <Text style={styles.statValue}>${stats.unclaimedRewards.toFixed(2)}</Text>
            <Text style={styles.statLabel}>Unclaimed</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Referral Code</Text>
          <View style={styles.codeCard}>
            <View style={styles.codeDisplay}>
              <Text style={styles.codeText}>{referralCode}</Text>
            </View>
            <View style={styles.codeActions}>
              <TouchableOpacity style={styles.codeButton} onPress={handleCopyCode}>
                {copied ? (
                  <>
                    <Check size={18} color={colors.success} />
                    <Text style={[styles.codeButtonText, { color: colors.success }]}>Copied!</Text>
                  </>
                ) : (
                  <>
                    <Copy size={18} color={colors.primary} />
                    <Text style={styles.codeButtonText}>Copy</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.codeButton} onPress={handleShareCode}>
                <Share2 size={18} color={colors.primary} />
                <Text style={styles.codeButtonText}>Share</Text>
              </TouchableOpacity>
            </View>
          </View>
          <Text style={styles.codeHint}>
            Share this code with friends. When they sign up, you both earn rewards!
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Have a Referral Code?</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.codeInput}
              placeholder="Enter code"
              placeholderTextColor={colors.textMuted}
              value={inputCode}
              onChangeText={setInputCode}
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
                  <Text style={styles.rewardType}>
                    {reward.reward_type.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                  </Text>
                  <Text style={styles.rewardAmount}>${parseFloat(reward.reward_amount.toString()).toFixed(2)}</Text>
                </View>
                {!reward.claimed ? (
                  <TouchableOpacity
                    style={styles.claimButton}
                    onPress={() => handleClaimReward(reward.id)}
                  >
                    <Text style={styles.claimButtonText}>Claim</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.claimedBadge}>
                    <Check size={14} color={colors.success} />
                    <Text style={styles.claimedText}>Claimed</Text>
                  </View>
                )}
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
                  </Text>
                </View>
                {referral.reward_claimed && (
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
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>1</Text>
            </View>
            <Text style={styles.stepText}>Share your referral code with friends</Text>
          </View>
          <View style={styles.infoStep}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>2</Text>
            </View>
            <Text style={styles.stepText}>They sign up using your code</Text>
          </View>
          <View style={styles.infoStep}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>3</Text>
            </View>
            <Text style={styles.stepText}>You both earn bonus tokens and rewards!</Text>
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
