import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Gift, Swords, X, Trophy, Users, Zap, TriangleAlert as AlertTriangle, Info, ChevronDown, ChevronUp } from 'lucide-react-native';
import { useWallet } from '@/contexts/WalletContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { GamingService, MysteryBox, TeamGame } from '@/services/gamingService';
import { SocialService, UserProfile } from '@/services/socialService';
import { colors, spacing, borderRadius, fontSize, elevation } from '@/constants/theme';

type GameTab = 'boxes' | 'battles';

const BOX_GRADIENTS: [string, string][] = [
  ['#cd7f32', '#8b5e3c'],
  ['#c0c0c0', '#808080'],
  ['#ffd700', '#daa520'],
];

export default function GamingScreen() {
  const { selectedAccount } = useWallet();
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<GameTab>('boxes');
  const [boxes, setBoxes] = useState<MysteryBox[]>([]);
  const [games, setGames] = useState<TeamGame[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [showBoxResult, setShowBoxResult] = useState(false);
  const [boxResult, setBoxResult] = useState<{ tier: string; value: number } | null>(null);
  const [openingBox, setOpeningBox] = useState(false);
  const [showCreateGame, setShowCreateGame] = useState(false);
  const [newGameName, setNewGameName] = useState('');
  const [newGameFee, setNewGameFee] = useState('10');
  const [showBoxRules, setShowBoxRules] = useState(false);
  const [showBattleRules, setShowBattleRules] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const walletAddr = selectedAccount?.address || 'anonymous';
    const [boxData, gameData, profileData] = await Promise.all([
      GamingService.getMysteryBoxes(),
      GamingService.getActiveGames(),
      SocialService.getOrCreateProfile(walletAddr),
    ]);
    setBoxes(boxData);
    setGames(gameData);
    setProfile(profileData);
    setLoading(false);
  }, [selectedAccount?.address]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenBox = async (box: MysteryBox) => {
    if (!profile || openingBox) return;
    setOpeningBox(true);
    const result = GamingService.rollBox(box.rewards);
    await GamingService.recordPurchase(profile.id, box.id, result.tier, result.value);
    setBoxResult(result);
    setOpeningBox(false);
    setShowBoxResult(true);
  };

  const handleCreateGame = async () => {
    if (!profile || !newGameName.trim()) return;
    const fee = parseFloat(newGameFee) || 10;
    await GamingService.createGame(newGameName.trim(), fee);
    setShowCreateGame(false);
    setNewGameName('');
    setNewGameFee('10');
    await loadData();
  };

  const handleJoinTeam = async (teamId: string) => {
    if (!profile) return;
    await GamingService.joinTeam(teamId, profile.id);
    await loadData();
  };

  const handleCreateTeam = async (gameId: string) => {
    if (!profile) return;
    await GamingService.createTeam(gameId, `Team ${Date.now() % 1000}`, profile.id);
    await loadData();
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={colors.gradient.header} style={styles.header}>
        <Text style={styles.headerTitle}>{t.tabs.gaming}</Text>
        <View style={styles.disclaimer}>
          <AlertTriangle size={14} color={colors.warning} />
          <Text style={styles.disclaimerText}>{t.gaming.disclaimer}</Text>
        </View>
      </LinearGradient>

      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'boxes' && styles.tabActive]}
          onPress={() => setActiveTab('boxes')}
        >
          <Gift size={18} color={activeTab === 'boxes' ? colors.primary : colors.textMuted} />
          <Text style={[styles.tabText, activeTab === 'boxes' && styles.tabTextActive]}>
            {t.gaming.mysteryBox}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'battles' && styles.tabActive]}
          onPress={() => setActiveTab('battles')}
        >
          <Swords size={18} color={activeTab === 'battles' ? colors.primary : colors.textMuted} />
          <Text style={[styles.tabText, activeTab === 'battles' && styles.tabTextActive]}>
            {t.gaming.teamBattle}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.contentContainer}
      >
        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 48 }} />
        ) : activeTab === 'boxes' ? (
          <View style={styles.boxesGrid}>
            <TouchableOpacity
              style={styles.rulesToggle}
              onPress={() => setShowBoxRules(!showBoxRules)}
            >
              <Info size={16} color={colors.primary} />
              <Text style={styles.rulesToggleText}>How Mystery Boxes Work</Text>
              {showBoxRules ? <ChevronUp size={16} color={colors.textMuted} /> : <ChevronDown size={16} color={colors.textMuted} />}
            </TouchableOpacity>

            {showBoxRules && (
              <View style={styles.rulesCard}>
                <View style={styles.ruleItem}>
                  <Text style={styles.ruleNum}>1</Text>
                  <Text style={styles.ruleText}>Each box contains rewards from different tiers: Common, Rare, Epic, and Legendary.</Text>
                </View>
                <View style={styles.ruleItem}>
                  <Text style={styles.ruleNum}>2</Text>
                  <Text style={styles.ruleText}>Each tier has a fixed probability shown on the box card (e.g., Common 60%, Rare 25%, Epic 12%, Legendary 3%).</Text>
                </View>
                <View style={styles.ruleItem}>
                  <Text style={styles.ruleNum}>3</Text>
                  <Text style={styles.ruleText}>Rewards are randomly selected within the tier's value range. Higher tier = higher reward value.</Text>
                </View>
                <View style={styles.ruleItem}>
                  <Text style={styles.ruleNum}>4</Text>
                  <Text style={styles.ruleText}>All results are recorded and verifiable. The randomization is provably fair using a weighted probability algorithm.</Text>
                </View>
                <View style={styles.mockBadge}>
                  <Text style={styles.mockBadgeText}>SIMULATED - No real money involved</Text>
                </View>
              </View>
            )}

            <Text style={styles.sectionTitle}>{t.gaming.selectBox}</Text>
            {boxes.map((box, idx) => (
              <TouchableOpacity
                key={box.id}
                style={styles.boxCard}
                onPress={() => handleOpenBox(box)}
                disabled={openingBox}
              >
                <LinearGradient
                  colors={BOX_GRADIENTS[idx % BOX_GRADIENTS.length]}
                  style={styles.boxGradient}
                >
                  <Gift size={48} color="rgba(255,255,255,0.9)" />
                  <Text style={styles.boxName}>{box.name}</Text>
                  <Text style={styles.boxPrice}>${box.price_usd}</Text>
                </LinearGradient>
                <View style={styles.boxRewards}>
                  <Text style={styles.boxRewardsTitle}>Reward Tiers & Probabilities</Text>
                  {box.rewards.map((r) => (
                    <View key={r.tier} style={styles.rewardRow}>
                      <View style={[styles.rewardDot, { backgroundColor: GamingService.getTierColor(r.tier) }]} />
                      <Text style={styles.rewardTier}>{r.tier}</Text>
                      <View style={styles.probBar}>
                        <View style={[styles.probFill, { width: `${r.probability * 100}%`, backgroundColor: GamingService.getTierColor(r.tier) }]} />
                      </View>
                      <Text style={styles.rewardProb}>{(r.probability * 100).toFixed(0)}%</Text>
                      <Text style={styles.rewardRange}>${r.min_value}-${r.max_value}</Text>
                    </View>
                  ))}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={styles.battleSection}>
            <TouchableOpacity
              style={styles.rulesToggle}
              onPress={() => setShowBattleRules(!showBattleRules)}
            >
              <Info size={16} color={colors.primary} />
              <Text style={styles.rulesToggleText}>How Team Battles Work</Text>
              {showBattleRules ? <ChevronUp size={16} color={colors.textMuted} /> : <ChevronDown size={16} color={colors.textMuted} />}
            </TouchableOpacity>

            {showBattleRules && (
              <View style={styles.rulesCard}>
                <View style={styles.ruleItem}>
                  <Text style={styles.ruleNum}>1</Text>
                  <Text style={styles.ruleText}>Create or join a tournament. Each tournament has an entry fee and a prize pool.</Text>
                </View>
                <View style={styles.ruleItem}>
                  <Text style={styles.ruleNum}>2</Text>
                  <Text style={styles.ruleText}>Form teams of 3 players. A tournament supports up to 4 teams (12 players total).</Text>
                </View>
                <View style={styles.ruleItem}>
                  <Text style={styles.ruleNum}>3</Text>
                  <Text style={styles.ruleText}>Prize pool = entry fees from all participants. The winning team splits the pool equally.</Text>
                </View>
                <View style={styles.ruleItem}>
                  <Text style={styles.ruleNum}>4</Text>
                  <Text style={styles.ruleText}>Winners are determined by combined team performance metrics (trading volume, community engagement, and portfolio growth during the tournament).</Text>
                </View>
                <View style={styles.mockBadge}>
                  <Text style={styles.mockBadgeText}>SIMULATED - Skill-based competition, no gambling</Text>
                </View>
              </View>
            )}

            <View style={styles.battleHeader}>
              <Text style={styles.sectionTitle}>{t.gaming.skillTournament}</Text>
              <TouchableOpacity style={styles.createGameButton} onPress={() => setShowCreateGame(true)}>
                <Text style={styles.createGameText}>{t.gaming.createTeam}</Text>
              </TouchableOpacity>
            </View>

            {games.length === 0 ? (
              <View style={styles.emptyState}>
                <Trophy size={48} color={colors.textMuted} />
                <Text style={styles.emptyTitle}>No active tournaments</Text>
                <Text style={styles.emptySubtitle}>Create one to get started</Text>
              </View>
            ) : (
              games.map((game) => (
                <View key={game.id} style={styles.gameCard}>
                  <View style={styles.gameHeader}>
                    <Text style={styles.gameName}>{game.name}</Text>
                    <View style={[styles.statusBadge, game.status === 'waiting' ? styles.statusWaiting : styles.statusActive]}>
                      <Text style={styles.statusText}>
                        {game.status === 'waiting' ? t.gaming.waitingForPlayers : t.gaming.matchInProgress}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.gameStats}>
                    <View style={styles.gameStat}>
                      <Text style={styles.gameStatLabel}>{t.gaming.entryFee}</Text>
                      <Text style={styles.gameStatValue}>${game.entry_fee}</Text>
                    </View>
                    <View style={styles.gameStat}>
                      <Text style={styles.gameStatLabel}>{t.gaming.prizePool}</Text>
                      <Text style={styles.gameStatValueHighlight}>${game.prize_pool}</Text>
                    </View>
                    <View style={styles.gameStat}>
                      <Text style={styles.gameStatLabel}>Teams</Text>
                      <Text style={styles.gameStatValue}>
                        {game.teams?.length || 0}/{game.max_teams}
                      </Text>
                    </View>
                  </View>

                  {game.teams && game.teams.map((team) => (
                    <View key={team.id} style={styles.teamRow}>
                      <Users size={16} color={colors.primary} />
                      <Text style={styles.teamName}>{team.name}</Text>
                      <Text style={styles.teamMemberCount}>
                        {team.members?.length || 0}/3
                      </Text>
                      {(team.members?.length || 0) < 3 && game.status === 'waiting' && (
                        <TouchableOpacity
                          style={styles.joinButton}
                          onPress={() => handleJoinTeam(team.id)}
                        >
                          <Text style={styles.joinButtonText}>{t.gaming.joinTeam}</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}

                  {game.status === 'waiting' && (game.teams?.length || 0) < game.max_teams && (
                    <TouchableOpacity
                      style={styles.createTeamButton}
                      onPress={() => handleCreateTeam(game.id)}
                    >
                      <Zap size={16} color={colors.primary} />
                      <Text style={styles.createTeamText}>{t.gaming.createTeam}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>

      <Modal visible={showBoxResult} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.resultModal}>
            <Text style={styles.resultTitle}>{t.gaming.reward}!</Text>
            {boxResult && (
              <>
                <View style={[styles.resultTierBadge, { backgroundColor: GamingService.getTierColor(boxResult.tier) + '30' }]}>
                  <Text style={[styles.resultTierText, { color: GamingService.getTierColor(boxResult.tier) }]}>
                    {boxResult.tier.toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.resultValue}>${boxResult.value.toFixed(2)}</Text>
                <Text style={styles.resultNote}>Simulated reward</Text>
              </>
            )}
            <TouchableOpacity style={styles.resultClose} onPress={() => setShowBoxResult(false)}>
              <Text style={styles.resultCloseText}>{t.common.done}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showCreateGame} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.createGameModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Tournament</Text>
              <TouchableOpacity onPress={() => setShowCreateGame(false)}>
                <X size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.gameInput}
              placeholder="Tournament name"
              placeholderTextColor={colors.textMuted}
              value={newGameName}
              onChangeText={setNewGameName}
            />
            <TextInput
              style={styles.gameInput}
              placeholder="Entry fee (USD)"
              placeholderTextColor={colors.textMuted}
              value={newGameFee}
              onChangeText={setNewGameFee}
              keyboardType="decimal-pad"
            />
            <View style={styles.prizePreview}>
              <Text style={styles.prizePreviewLabel}>Prize Pool (all teams x entry fee x 3 members):</Text>
              <Text style={styles.prizePreviewValue}>
                ${((parseFloat(newGameFee) || 0) * 12).toFixed(2)}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.submitButton, !newGameName.trim() && styles.submitButtonDisabled]}
              onPress={handleCreateGame}
              disabled={!newGameName.trim()}
            >
              <Text style={styles.submitButtonText}>Create</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingTop: 56,
    paddingBottom: 16,
    paddingHorizontal: spacing.xxl,
  },
  headerTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  disclaimer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.warningMuted,
    padding: spacing.md,
    borderRadius: borderRadius.sm,
  },
  disclaimerText: {
    flex: 1,
    fontSize: fontSize.xs,
    color: colors.warning,
    lineHeight: 16,
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  tabActive: {
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primary,
  },
  tabText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.primary,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: spacing.xxl,
  },
  rulesToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.primaryMuted,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.2)',
    marginBottom: spacing.lg,
  },
  rulesToggleText: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.primary,
  },
  rulesCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    gap: spacing.md,
  },
  ruleItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  ruleNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primaryMuted,
    textAlign: 'center',
    lineHeight: 24,
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.primary,
    overflow: 'hidden',
  },
  ruleText: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  mockBadge: {
    backgroundColor: colors.warningMuted,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
  },
  mockBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.warning,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  boxesGrid: {
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.md,
  },
  boxCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    marginBottom: spacing.lg,
    overflow: 'hidden',
    ...elevation.md,
  },
  boxGradient: {
    paddingVertical: spacing.xxxl,
    alignItems: 'center',
    gap: spacing.md,
  },
  boxName: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.white,
  },
  boxPrice: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.white,
  },
  boxRewards: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  boxRewardsTitle: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  rewardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rewardDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  rewardTier: {
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    fontWeight: '500',
    width: 70,
    textTransform: 'capitalize',
  },
  probBar: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceLight,
    overflow: 'hidden',
  },
  probFill: {
    height: 6,
    borderRadius: 3,
  },
  rewardProb: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    width: 32,
    textAlign: 'right',
  },
  rewardRange: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    width: 70,
    textAlign: 'right',
  },
  battleSection: {
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.md,
  },
  battleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  createGameButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.full,
  },
  createGameText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.white,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 48,
    gap: spacing.md,
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  emptySubtitle: {
    fontSize: fontSize.md,
    color: colors.textMuted,
  },
  gameCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...elevation.sm,
  },
  gameHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  gameName: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
    flex: 1,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
  },
  statusWaiting: {
    backgroundColor: colors.warningMuted,
  },
  statusActive: {
    backgroundColor: colors.successMuted,
  },
  statusText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  gameStats: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  gameStat: {
    flex: 1,
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.sm,
    padding: spacing.md,
    alignItems: 'center',
  },
  gameStatLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginBottom: 4,
  },
  gameStatValue: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  gameStatValueHighlight: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.success,
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
  },
  teamName: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
    flex: 1,
  },
  teamMemberCount: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  joinButton: {
    backgroundColor: colors.primaryMuted,
    paddingVertical: 4,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
  },
  joinButtonText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.primary,
  },
  createTeamButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
    marginTop: spacing.sm,
  },
  createTeamText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.primary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  resultModal: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xxxl,
    alignItems: 'center',
    width: '80%',
    gap: spacing.lg,
  },
  resultTitle: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  resultTierBadge: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xxl,
    borderRadius: borderRadius.full,
  },
  resultTierText: {
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  resultValue: {
    fontSize: 48,
    fontWeight: '700',
    color: colors.success,
  },
  resultNote: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  resultClose: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxxl,
    borderRadius: borderRadius.md,
    marginTop: spacing.md,
  },
  resultCloseText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.white,
  },
  createGameModal: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.xxl,
    width: '100%',
    position: 'absolute',
    bottom: 0,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  gameInput: {
    fontSize: fontSize.md,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  prizePreview: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    alignItems: 'center',
  },
  prizePreviewLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  prizePreviewValue: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.success,
  },
  submitButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.white,
  },
});
