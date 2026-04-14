import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput, ActivityIndicator } from 'react-native';
import { useState, useEffect } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Lock, TrendingUp, Clock, Coins, Percent } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { colors, spacing, borderRadius, fontSize, elevation } from '@/constants/theme';
import { StakingService, StakingPool, UserStake } from '@/services/stakingService';
import { useWallet } from '@/contexts/WalletContext';
import { SocialService } from '@/services/socialService';

export default function StakingScreen() {
  const router = useRouter();
  const { selectedAccount } = useWallet();
  const [loading, setLoading] = useState(true);
  const [pools, setPools] = useState<StakingPool[]>([]);
  const [userStakes, setUserStakes] = useState<UserStake[]>([]);
  const [showStakeModal, setShowStakeModal] = useState(false);
  const [selectedPool, setSelectedPool] = useState<StakingPool | null>(null);
  const [stakeAmount, setStakeAmount] = useState('');
  const [staking, setStaking] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);

  const [totalStaked, setTotalStaked] = useState(0);
  const [totalRewards, setTotalRewards] = useState(0);

  useEffect(() => {
    loadData();
  }, [selectedAccount]);

  const loadData = async () => {
    if (!selectedAccount) return;

    setLoading(true);
    const profile = await SocialService.getOrCreateProfile(selectedAccount.address);
    setUserProfile(profile);

    if (profile) {
      const [stakingPools, stakes] = await Promise.all([
        StakingService.getStakingPools(),
        StakingService.getUserStakes(profile.id),
      ]);

      setPools(stakingPools);
      setUserStakes(stakes);

      const activeStakes = stakes.filter(s => s.status === 'active');
      const staked = activeStakes.reduce((sum, stake) => sum + stake.amount, 0);
      const rewards = activeStakes.reduce((sum, stake) => {
        const pool = stakingPools.find(p => p.id === stake.pool_id);
        if (!pool) return sum;
        const daysStaked = Math.floor(
          (new Date().getTime() - new Date(stake.staked_at).getTime()) / (1000 * 60 * 60 * 24)
        );
        return sum + StakingService.calculateRewards(stake.amount, pool.apy, daysStaked);
      }, 0);

      setTotalStaked(staked);
      setTotalRewards(rewards);
    }

    setLoading(false);
  };

  const handleStakePress = (pool: StakingPool) => {
    setSelectedPool(pool);
    setShowStakeModal(true);
    setStakeAmount('');
  };

  const handleStake = async () => {
    if (!selectedPool || !stakeAmount || !userProfile) return;

    const amount = parseFloat(stakeAmount);
    if (amount < selectedPool.min_stake) {
      alert(`Minimum stake is ${selectedPool.min_stake}`);
      return;
    }

    setStaking(true);
    const result = await StakingService.createStake(userProfile.id, selectedPool.id, amount);

    if (result.success) {
      setShowStakeModal(false);
      setStakeAmount('');
      alert('Stake created successfully!');
      loadData();
    } else {
      alert(result.error || 'Failed to create stake');
    }
    setStaking(false);
  };

  const handleWithdraw = async (stakeId: string) => {
    if (!userProfile) return;

    const result = await StakingService.withdrawStake(stakeId, userProfile.id);
    if (result.success) {
      alert('Stake withdrawn successfully!');
      loadData();
    } else {
      alert(result.error || 'Failed to withdraw stake');
    }
  };

  const renderPool = (pool: StakingPool) => (
    <View key={pool.id} style={styles.poolCard}>
      <LinearGradient
        colors={['#667eea', '#764ba2']}
        style={styles.poolGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.poolHeader}>
          <Text style={styles.poolName}>{pool.name}</Text>
          <View style={styles.apyBadge}>
            <Percent size={14} color={colors.white} />
            <Text style={styles.apyText}>{pool.apy}% APY</Text>
          </View>
        </View>

        <View style={styles.poolStats}>
          <View style={styles.poolStat}>
            <Lock size={16} color={colors.white} />
            <Text style={styles.poolStatValue}>{pool.lock_period_days} days</Text>
            <Text style={styles.poolStatLabel}>Lock Period</Text>
          </View>
          <View style={styles.poolStat}>
            <Coins size={16} color={colors.white} />
            <Text style={styles.poolStatValue}>{pool.min_stake}</Text>
            <Text style={styles.poolStatLabel}>Min Stake</Text>
          </View>
          <View style={styles.poolStat}>
            <TrendingUp size={16} color={colors.white} />
            <Text style={styles.poolStatValue}>{pool.total_staked.toFixed(0)}</Text>
            <Text style={styles.poolStatLabel}>Total Staked</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.stakeButton} onPress={() => handleStakePress(pool)}>
          <Text style={styles.stakeButtonText}>Stake {pool.token_symbol}</Text>
        </TouchableOpacity>
      </LinearGradient>
    </View>
  );

  const renderUserStake = (stake: UserStake) => {
    const pool = pools.find(p => p.id === stake.pool_id);
    if (!pool) return null;

    const daysStaked = Math.floor(
      (new Date().getTime() - new Date(stake.staked_at).getTime()) / (1000 * 60 * 60 * 24)
    );
    const rewards = StakingService.calculateRewards(stake.amount, pool.apy, daysStaked);
    const isUnlocked = StakingService.isUnlocked(stake.unlock_at);
    const daysUntilUnlock = StakingService.getDaysUntilUnlock(stake.unlock_at);

    return (
      <View key={stake.id} style={styles.stakeCard}>
        <View style={styles.stakeHeader}>
          <Text style={styles.stakeToken}>{pool.token_symbol} Staking</Text>
          <View style={[styles.statusBadge, stake.status === 'active' ? styles.statusActive : styles.statusInactive]}>
            <Text style={styles.statusText}>{stake.status}</Text>
          </View>
        </View>

        <View style={styles.stakeRow}>
          <Text style={styles.stakeLabel}>Staked Amount</Text>
          <Text style={styles.stakeValue}>{stake.amount.toFixed(2)} {pool.token_symbol}</Text>
        </View>

        <View style={styles.stakeRow}>
          <Text style={styles.stakeLabel}>Earned Rewards</Text>
          <Text style={[styles.stakeValue, { color: colors.success }]}>+{rewards.toFixed(6)} {pool.token_symbol}</Text>
        </View>

        <View style={styles.stakeRow}>
          <Text style={styles.stakeLabel}>APY</Text>
          <Text style={styles.stakeValue}>{pool.apy}%</Text>
        </View>

        <View style={styles.stakeRow}>
          <Text style={styles.stakeLabel}>Status</Text>
          {isUnlocked ? (
            <Text style={[styles.stakeValue, { color: colors.success }]}>Unlocked</Text>
          ) : (
            <Text style={styles.stakeValue}>
              <Clock size={14} color={colors.warning} /> {daysUntilUnlock} days left
            </Text>
          )}
        </View>

        {stake.status === 'active' && isUnlocked && (
          <TouchableOpacity
            style={styles.withdrawButton}
            onPress={() => handleWithdraw(stake.id)}
          >
            <Text style={styles.withdrawButtonText}>Withdraw</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <LinearGradient colors={colors.gradient.primary as any} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Staking</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Your Staking Summary</Text>
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>${totalStaked.toFixed(2)}</Text>
                <Text style={styles.summaryLabel}>Total Staked</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryValue, { color: colors.success }]}>
                  ${totalRewards.toFixed(2)}
                </Text>
                <Text style={styles.summaryLabel}>Total Rewards</Text>
              </View>
            </View>
          </View>

          {userStakes.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Your Stakes</Text>
              {userStakes.map(renderUserStake)}
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Available Pools</Text>
            {pools.map(renderPool)}
          </View>
        </ScrollView>
      )}

      <Modal
        visible={showStakeModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowStakeModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Stake {selectedPool?.token_symbol}</Text>
              <TouchableOpacity onPress={() => setShowStakeModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {selectedPool && (
              <View style={styles.modalBody}>
                <View style={styles.poolInfoCard}>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>APY</Text>
                    <Text style={styles.infoValue}>{selectedPool.apy}%</Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Lock Period</Text>
                    <Text style={styles.infoValue}>{selectedPool.lock_period_days} days</Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Minimum</Text>
                    <Text style={styles.infoValue}>{selectedPool.min_stake} {selectedPool.token_symbol}</Text>
                  </View>
                </View>

                <Text style={styles.inputLabel}>Amount to Stake</Text>
                <TextInput
                  style={styles.amountInput}
                  placeholder={`Min: ${selectedPool.min_stake}`}
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                  value={stakeAmount}
                  onChangeText={setStakeAmount}
                />

                <TouchableOpacity
                  style={[styles.confirmButton, (!stakeAmount || staking) && styles.confirmButtonDisabled]}
                  onPress={handleStake}
                  disabled={!stakeAmount || staking}
                >
                  {staking ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <Text style={styles.confirmButtonText}>Confirm Stake</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.xl * 2,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    ...elevation.sm,
  },
  headerTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    padding: spacing.lg,
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    ...elevation.md,
  },
  summaryTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: spacing.xl,
  },
  summaryItem: {
    flex: 1,
  },
  summaryValue: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  summaryLabel: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  poolCard: {
    marginBottom: spacing.md,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    ...elevation.md,
  },
  poolGradient: {
    padding: spacing.xl,
  },
  poolHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  poolName: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.white,
  },
  apyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
  },
  apyText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.white,
  },
  poolStats: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  poolStat: {
    flex: 1,
    alignItems: 'center',
  },
  poolStatValue: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.white,
    marginTop: spacing.xs,
  },
  poolStatLabel: {
    fontSize: fontSize.xs,
    color: colors.white,
    opacity: 0.8,
    marginTop: 2,
  },
  stakeButton: {
    backgroundColor: colors.white,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  stakeButtonText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: '#667eea',
  },
  stakeCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...elevation.sm,
  },
  stakeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  stakeToken: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  statusBadge: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  statusActive: {
    backgroundColor: colors.successMuted,
  },
  statusInactive: {
    backgroundColor: colors.surfaceBorder,
  },
  statusText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.success,
  },
  stakeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  stakeLabel: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  stakeValue: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  withdrawButton: {
    backgroundColor: colors.primary,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  withdrawButtonText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.white,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  modalClose: {
    fontSize: fontSize.xl,
    color: colors.textMuted,
  },
  modalBody: {
    padding: spacing.xl,
  },
  poolInfoCard: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  infoLabel: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  infoValue: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  inputLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  amountInput: {
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  confirmButton: {
    backgroundColor: colors.primary,
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    ...elevation.md,
  },
  confirmButtonDisabled: {
    backgroundColor: colors.surfaceBorder,
  },
  confirmButtonText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.white,
  },
});
