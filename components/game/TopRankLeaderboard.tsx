import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, ActivityIndicator, RefreshControl,
} from 'react-native';
import { Trophy, Star, Swords, TrendingUp, UserPlus, UserCheck } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { colors, spacing, borderRadius, fontSize } from '@/constants/theme';
import { getLeaderboard } from '@/services/game/duelEntryService';
import { SocialService } from '@/services/socialService';
import { useProfile } from '@/contexts/ProfileContext';

type RankSort = 'score' | 'wins' | 'sol';

const SORT_TABS: { key: RankSort; label: string; icon: any }[] = [
  { key: 'score', label: 'Games', icon: Star },
  { key: 'wins', label: 'SOL Duels', icon: Swords },
  { key: 'sol', label: 'SOL Won', icon: TrendingUp },
];

function shortAddr(addr: string): string {
  if (!addr) return '???';
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

function fmtSol(n: number): string {
  if (n === 0) return '—';
  return `${Number(n).toFixed(3)} SOL`;
}

export function TopRankLeaderboard() {
  const router = useRouter();
  const { profile } = useProfile();
  const [sort, setSort] = useState<RankSort>('score');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());
  const [followingId, setFollowingId] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await getLeaderboard({ sort, limit: 50 });
      setRows(data);
    } catch (e) {
      console.warn('[TopRankLeaderboard]', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [sort]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(true); };

  const toggleFollow = useCallback(async (profileId: string) => {
    if (!profile?.id || followingId) return;
    setFollowingId(profileId);
    try {
      const nowFollowing = await SocialService.toggleFollow(profile.id, profileId);
      setFollowedIds(prev => {
        const s = new Set(prev);
        if (nowFollowing) s.add(profileId); else s.delete(profileId);
        return s;
      });
    } catch {}
    setFollowingId(null);
  }, [profile?.id, followingId]);

  const rankMedal = (i: number) => {
    if (i === 0) return { char: '🥇', color: '#F59E0B' };
    if (i === 1) return { char: '🥈', color: '#9CA3AF' };
    if (i === 2) return { char: '🥉', color: '#B45309' };
    return null;
  };

  return (
    <View style={styles.container}>
      {/* Sort tabs */}
      <View style={styles.tabBar}>
        {SORT_TABS.map(tab => {
          const Icon = tab.icon;
          const active = sort === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => setSort(tab.key)}
              activeOpacity={0.75}
            >
              <Icon size={13} color={active ? colors.primary : colors.textMuted} strokeWidth={2} />
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Column headers */}
      <View style={styles.colHeader}>
        <Text style={[styles.col, styles.colRank]}>#</Text>
        <Text style={[styles.col, { flex: 1 }]}>Player</Text>
        {sort === 'score' && <Text style={[styles.col, styles.colRight]}>Best Score</Text>}
        {sort === 'wins'  && <Text style={[styles.col, styles.colRight]}>Wins / Total</Text>}
        {sort === 'sol'   && <Text style={[styles.col, styles.colRight]}>SOL Won</Text>}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : rows.length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.emptyContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          <View style={styles.emptyIconWrap}>
            <Trophy size={36} color={colors.primary} strokeWidth={1.5} />
          </View>
          <Text style={styles.emptyTitle}>No rankings yet</Text>
          <Text style={styles.emptyText}>
            Rankings will appear when users start playing, trading, and interacting.
          </Text>
        </ScrollView>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          {rows.map((row, i) => {
            const medal = rankMedal(i);
            const displayName = row.username || shortAddr(row.wallet_address);
            const profileId = row.profile_id || row.wallet_address;
            const isFollowed = profileId ? followedIds.has(profileId) : false;
            const isMe = profile?.id === profileId;
            return (
              <TouchableOpacity
                key={row.wallet_address || i}
                style={[styles.row, i === 0 && styles.rowTop]}
                activeOpacity={0.75}
                onPress={() => profileId && router.push(`/profile/${profileId}` as any)}
              >
                {/* Rank */}
                <View style={styles.rankCell}>
                  {medal ? (
                    <Text style={styles.medal}>{medal.char}</Text>
                  ) : (
                    <Text style={styles.rankNum}>{i + 1}</Text>
                  )}
                </View>

                {/* Avatar + name */}
                <View style={styles.playerCell}>
                  {row.avatar_url ? (
                    <Image source={{ uri: row.avatar_url }} style={styles.avatar} />
                  ) : (
                    <View style={styles.avatarPlaceholder}>
                      <Text style={styles.avatarText}>{displayName.charAt(0).toUpperCase()}</Text>
                    </View>
                  )}
                  <View style={styles.playerInfo}>
                    <View style={styles.nameRow}>
                      <Text style={styles.playerName} numberOfLines={1}>{displayName}</Text>
                      {row.badge_status === 'premium' && (
                        <View style={styles.premBadge}>
                          <Text style={styles.premText}>PRO</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.playerSub}>
                      {row.total_games} game{row.total_games !== 1 ? 's' : ''}
                    </Text>
                  </View>
                </View>

                {/* Value */}
                <View style={styles.valueCell}>
                  {sort === 'score' && (
                    <>
                      <Text style={styles.valueMain}>{Number(row.best_score).toLocaleString()}</Text>
                      <Text style={styles.valueSub}>×{row.best_combo} combo</Text>
                    </>
                  )}
                  {sort === 'wins' && (
                    <>
                      <Text style={styles.valueMain}>{row.duel_wins}W</Text>
                      <Text style={styles.valueSub}>{row.duel_total} duels</Text>
                    </>
                  )}
                  {sort === 'sol' && (
                    <>
                      <Text style={styles.valueMain}>{fmtSol(Number(row.total_sol_won))}</Text>
                      <Text style={styles.valueSub}>
                        {row.duel_total > 0 ? `${Math.round(Number(row.win_rate) * 100)}% win` : 'No duels'}
                      </Text>
                    </>
                  )}
                </View>

                {/* Follow button */}
                {!isMe && profileId && (
                  <TouchableOpacity
                    style={[styles.followBtn, isFollowed && styles.followBtnActive]}
                    onPress={(e) => { e.stopPropagation(); toggleFollow(profileId); }}
                    activeOpacity={0.75}
                    disabled={followingId === profileId}
                  >
                    {isFollowed
                      ? <UserCheck size={14} color={colors.primary} strokeWidth={2} />
                      : <UserPlus size={14} color={colors.textMuted} strokeWidth={2} />
                    }
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            );
          })}
          <View style={{ height: 32 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    marginBottom: spacing.md,
    gap: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  tabActive: { backgroundColor: colors.primaryMuted },
  tabText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.textMuted },
  tabTextActive: { color: colors.primary },
  colHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
    marginBottom: spacing.sm,
  },
  col: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  colRank: { width: 36 },
  colRight: { textAlign: 'right', minWidth: 80 },
  center: { paddingVertical: 48, alignItems: 'center' },
  emptyContent: {
    paddingVertical: 48,
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.xxl,
  },
  emptyIconWrap: {
    width: 72, height: 72,
    borderRadius: 36,
    backgroundColor: colors.primaryMuted,
    borderWidth: 2,
    borderColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
    fontWeight: '500',
    lineHeight: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  rowTop: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryMuted,
  },
  rankCell: { width: 36, alignItems: 'center' },
  medal: { fontSize: 18 },
  rankNum: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textMuted },
  playerCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  avatar: {
    width: 36, height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceLight,
  },
  avatarPlaceholder: {
    width: 36, height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    color: colors.primary,
  },
  playerInfo: { flex: 1 },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  playerName: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textPrimary,
    flex: 1,
  },
  premBadge: {
    backgroundColor: colors.primaryMuted,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  premText: { fontSize: 8, fontWeight: '800', color: colors.primary },
  playerSub: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '500' },
  valueCell: { alignItems: 'flex-end', minWidth: 80 },
  valueMain: { fontSize: fontSize.sm, fontWeight: '800', color: colors.textPrimary },
  valueSub: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '500' },
  followBtn: {
    marginLeft: spacing.sm,
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  followBtnActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryMuted,
  },
});
