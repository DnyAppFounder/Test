import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, ActivityIndicator, RefreshControl, TextInput,
  Modal, Dimensions, Platform,
} from 'react-native';
import {
  Trophy, Crown, Zap, Users, MessageSquare, TrendingUp,
  Rocket, Search, X, ChevronRight, BadgeCheck, Gamepad2,
  Award, Star,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useWallet } from '@/contexts/WalletContext';
import {
  fetchLeaderboard, getPrimaryScore, formatScore,
  LeaderboardCategory, LeaderboardTimeframe, LeaderboardEntry,
  OverallEntry, GamesEntry, PulseEntry, DworldEntry, CommunityEntry, LaunchpadEntry,
} from '@/services/leaderboardService';
import { supabase } from '@/lib/supabase';

const { height: SCREEN_H } = Dimensions.get('window');

// ─── Design tokens ────────────────────────────────────────────────────────────
const PURPLE        = '#8B5CF6';
const PURPLE_LIGHT  = '#A78BFA';
const PURPLE_MUTED  = 'rgba(139,92,246,0.10)';
const PURPLE_BORDER = 'rgba(139,92,246,0.25)';
const GOLD          = '#F59E0B';
const GOLD_MUTED    = 'rgba(245,158,11,0.12)';
const SILVER        = '#9CA3AF';
const SILVER_MUTED  = 'rgba(156,163,175,0.12)';
const BRONZE        = '#B45309';
const BRONZE_MUTED  = 'rgba(180,83,9,0.12)';
const SURFACE       = '#111118';
const BORDER        = '#1E1E2A';
const SURFACE2      = '#18181F';
const TEXT          = '#F0F0FF';
const TEXT2         = '#A0A0B8';
const TEXT3         = '#60607A';

// ─── Config ──────────────────────────────────────────────────────────────────
const TIMEFRAMES: { key: LeaderboardTimeframe; label: string }[] = [
  { key: 'ALL', label: 'All Time' },
  { key: '24H', label: '24H' },
  { key: '7D',  label: '7D' },
  { key: '30D', label: '30D' },
];

interface CategoryDef {
  key: LeaderboardCategory;
  label: string;
  Icon: any;
  available: boolean;
}
const CATEGORIES: CategoryDef[] = [
  { key: 'overall',   label: 'Overall',   Icon: Crown,         available: true },
  { key: 'games',     label: 'Games',     Icon: Gamepad2,      available: true },
  { key: 'pulse',     label: 'Pulse',     Icon: MessageSquare, available: true },
  { key: 'trading',   label: 'Trading',   Icon: TrendingUp,    available: false },
  { key: 'community', label: 'Community', Icon: Users,         available: true },
  { key: 'dworld',    label: 'DWORLD',    Icon: Zap,           available: true },
  { key: 'launchpad', label: 'Launchpad', Icon: Rocket,        available: true },
];

const GAME_LABELS: Record<string, string> = {
  dawen_rush:          'Dawen Rush',
  dawen_runner:        'Dawen Runner',
  dawen_aim_duel:      'Aim Duel',
  decode_7_fragments:  'Decode 7 Fragments',
  dawen_memory:        'Memory Duel',
};

function shortAddr(addr: string): string {
  if (!addr) return '???';
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

function fmtMs(ms: number): string {
  if (!ms) return '—';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function fmtNum(n: number | null | undefined): string {
  if (n == null || n === 0) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function UserAvatar({ uri, name, size = 40, rank }: { uri?: string | null; name: string; size?: number; rank?: number }) {
  const borderColor = rank === 1 ? GOLD : rank === 2 ? SILVER : rank === 3 ? BRONZE : PURPLE_BORDER;
  const bgColor     = rank === 1 ? GOLD_MUTED : rank === 2 ? SILVER_MUTED : rank === 3 ? BRONZE_MUTED : PURPLE_MUTED;
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      borderWidth: rank && rank <= 3 ? 2 : 1,
      borderColor,
      backgroundColor: bgColor,
      justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
    }}>
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />
      ) : (
        <Text style={{ fontSize: size * 0.38, fontWeight: '800', color: rank === 1 ? GOLD : rank === 2 ? SILVER : rank === 3 ? BRONZE : PURPLE_LIGHT }}>
          {(name || '?').charAt(0).toUpperCase()}
        </Text>
      )}
    </View>
  );
}

function BadgeRow({ entry }: { entry: LeaderboardEntry }) {
  if (!entry.is_verified && !entry.is_premium) return null;
  return (
    <View style={{ flexDirection: 'row', gap: 4, marginTop: 2 }}>
      {entry.is_verified && (
        <View style={s.badge}>
          <BadgeCheck size={10} color={PURPLE} strokeWidth={2.5} />
          <Text style={s.badgeText}>Verified</Text>
        </View>
      )}
      {entry.is_premium && (
        <View style={[s.badge, { borderColor: GOLD, backgroundColor: GOLD_MUTED }]}>
          <Star size={10} color={GOLD} strokeWidth={2.5} />
          <Text style={[s.badgeText, { color: GOLD }]}>PRO</Text>
        </View>
      )}
    </View>
  );
}

function SubMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 3, alignItems: 'center' }}>
      <Text style={{ fontSize: 10, color: TEXT3, fontWeight: '600' }}>{label}</Text>
      <Text style={{ fontSize: 10, color: TEXT2, fontWeight: '700' }}>{value}</Text>
    </View>
  );
}

function CategorySubMetrics({ entry, category }: { entry: LeaderboardEntry; category: LeaderboardCategory }) {
  switch (category) {
    case 'overall': {
      const e = entry as OverallEntry;
      return (
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <SubMetric label="Games" value={String(e.game_score_pts ?? 0)} />
          <SubMetric label="Pulse" value={String(e.pulse_score_pts ?? 0)} />
        </View>
      );
    }
    case 'games': {
      const e = entry as GamesEntry;
      return (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <SubMetric label="Games" value={String(e.total_games ?? 0)} />
          <SubMetric label="Wins"  value={String(e.duel_wins ?? 0)} />
        </View>
      );
    }
    case 'pulse': {
      const e = entry as PulseEntry;
      return (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <SubMetric label="Posts" value={String(e.post_count ?? 0)} />
          <SubMetric label="Likes" value={String(e.total_likes_received ?? 0)} />
        </View>
      );
    }
    case 'dworld': {
      const e = entry as DworldEntry;
      return (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <SubMetric label="Pending" value={String(e.total_pending ?? 0)} />
          <SubMetric label="Claimed" value={String(e.total_claimed ?? 0)} />
        </View>
      );
    }
    case 'community': {
      const e = entry as CommunityEntry;
      return (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <SubMetric label="Followers" value={String(e.follower_count ?? 0)} />
          <SubMetric label="Refs"      value={String(e.referral_count ?? 0)} />
        </View>
      );
    }
    case 'launchpad': {
      const e = entry as LaunchpadEntry;
      return (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <SubMetric label="Launched"    value={String(e.total_launches ?? 0)} />
          <SubMetric label="Successful"  value={String(e.successful_launches ?? 0)} />
        </View>
      );
    }
    default: return null;
  }
}

function RankRow({ entry, rank, category, onPress }: {
  entry: LeaderboardEntry; rank: number; category: LeaderboardCategory; onPress: () => void;
}) {
  const isTop3     = rank <= 3;
  const rankColor  = rank === 1 ? GOLD : rank === 2 ? SILVER : rank === 3 ? BRONZE : TEXT3;
  const bgColor    = rank === 1 ? GOLD_MUTED : rank === 2 ? SILVER_MUTED : rank === 3 ? BRONZE_MUTED : 'transparent';
  const bdrColor   = rank === 1 ? 'rgba(245,158,11,0.3)' : rank === 2 ? 'rgba(156,163,175,0.3)' : rank === 3 ? 'rgba(180,83,9,0.3)' : BORDER;
  const displayName = entry.username || shortAddr(entry.wallet_address);
  const score = getPrimaryScore(entry, category);

  return (
    <TouchableOpacity style={[s.row, { backgroundColor: bgColor, borderColor: bdrColor }]} onPress={onPress} activeOpacity={0.75}>
      <View style={s.rankCell}>
        {rank === 1 ? <Crown size={16} color={GOLD}   strokeWidth={2} />
        : rank === 2 ? <Award size={16} color={SILVER} strokeWidth={2} />
        : rank === 3 ? <Award size={16} color={BRONZE} strokeWidth={2} />
        : <Text style={[s.rankNum, { color: rankColor }]}>{rank}</Text>}
      </View>
      <UserAvatar uri={entry.avatar_url} name={displayName} size={isTop3 ? 44 : 36} rank={rank} />
      <View style={s.infoCell}>
        <Text style={[s.nameText, isTop3 && { fontSize: 14 }]} numberOfLines={1}>{displayName}</Text>
        <BadgeRow entry={entry} />
        {isTop3 && <CategorySubMetrics entry={entry} category={category} />}
      </View>
      <View style={s.scoreCell}>
        <Text style={[s.scoreMain, { color: isTop3 ? rankColor : TEXT }]}>{formatScore(score, category)}</Text>
        <ChevronRight size={12} color={TEXT3} strokeWidth={2} />
      </View>
    </TouchableOpacity>
  );
}

function MyRankCard({ entry, rank, category }: { entry: LeaderboardEntry; rank: number; category: LeaderboardCategory }) {
  const displayName = entry.username || shortAddr(entry.wallet_address);
  const score = getPrimaryScore(entry, category);
  return (
    <View style={s.myRankCard}>
      <View style={s.myRankLeft}>
        <Text style={s.myRankLabel}>Your Rank</Text>
        <Text style={s.myRankNum}>#{rank}</Text>
      </View>
      <UserAvatar uri={entry.avatar_url} name={displayName} size={40} />
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text style={s.myRankName} numberOfLines={1}>{displayName}</Text>
        <BadgeRow entry={entry} />
      </View>
      <View style={s.myRankScore}>
        <Text style={s.myRankScoreVal}>{formatScore(score, category)}</Text>
        <Text style={s.myRankScoreLabel}>pts</Text>
      </View>
    </View>
  );
}

// ─── Games detail content ─────────────────────────────────────────────────────

interface GameDetailRow {
  game_id:          string;
  total_score:      number;
  best_score:       number;
  games_played:     number;
  best_combo:       number;
  total_survive_ms: number;
}

function GamesModalContent({ entry }: { entry: GamesEntry }) {
  const [detail, setDetail]   = useState<GameDetailRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.rpc('get_game_detail_for_wallet', {
          p_wallet: entry.wallet_address,
        });
        if (!cancelled) setDetail((data as GameDetailRow[]) || []);
      } catch {}
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [entry.wallet_address]);

  function StatRow({ label, value }: { label: string; value: string }) {
    return (
      <View style={s.modalStatRow}>
        <Text style={s.modalStatLabel}>{label}</Text>
        <Text style={s.modalStatValue}>{value}</Text>
      </View>
    );
  }

  const totalGamesAll = detail.reduce((a, r) => a + (r.games_played || 0), 0) || Number(entry.total_games) || 0;
  const totalScoreAll = detail.reduce((a, r) => a + (r.total_score || 0), 0);
  const highestBest   = detail.reduce((a, r) => Math.max(a, r.best_score || 0), Number(entry.best_score) || 0);

  return (
    <>
      {/* Overall summary */}
      <View style={s.gameSection}>
        <Text style={s.gameSectionTitle}>Overall Summary</Text>
        <StatRow label="Best Score"    value={highestBest ? highestBest.toLocaleString() : '—'} />
        <StatRow label="Total Score"   value={totalScoreAll ? totalScoreAll.toLocaleString() : '—'} />
        <StatRow label="Best Combo"    value={entry.best_combo ? `×${entry.best_combo}` : '—'} />
        <StatRow label="Games Played"  value={totalGamesAll ? String(totalGamesAll) : '—'} />
        {Number(entry.duel_total) > 0 && (
          <>
            <StatRow label="Duel Wins"  value={`${entry.duel_wins ?? 0}W / ${entry.duel_total ?? 0}`} />
            <StatRow label="Win Rate"   value={entry.win_rate ? `${Math.round(Number(entry.win_rate) * 100)}%` : '—'} />
          </>
        )}
        {Number(entry.total_sol_won) > 0 && (
          <StatRow label="SOL Won" value={`${Number(entry.total_sol_won).toFixed(3)} SOL`} />
        )}
      </View>

      {/* Per-game breakdown */}
      {loading ? (
        <ActivityIndicator color={PURPLE} style={{ marginVertical: 16 }} />
      ) : detail.length > 0 ? (
        <View style={s.gameSection}>
          <Text style={s.gameSectionTitle}>Game Breakdown</Text>
          {detail.map(row => (
            <View key={row.game_id} style={s.gameCard}>
              <Text style={s.gameCardTitle}>{GAME_LABELS[row.game_id] || row.game_id}</Text>
              <View style={s.gameCardStats}>
                <View style={s.gameStatCol}>
                  <Text style={s.gameStatVal}>{fmtNum(row.total_score)}</Text>
                  <Text style={s.gameStatLabel}>Total Score</Text>
                </View>
                <View style={s.gameStatDivider} />
                <View style={s.gameStatCol}>
                  <Text style={s.gameStatVal}>{fmtNum(row.best_score)}</Text>
                  <Text style={s.gameStatLabel}>Best Score</Text>
                </View>
                <View style={s.gameStatDivider} />
                <View style={s.gameStatCol}>
                  <Text style={s.gameStatVal}>{String(row.games_played || 0)}</Text>
                  <Text style={s.gameStatLabel}>Played</Text>
                </View>
              </View>
              {(row.best_combo > 0 || row.total_survive_ms > 0) && (
                <View style={s.gameCardMeta}>
                  {row.best_combo > 0 && (
                    <Text style={s.gameCardMetaText}>×{row.best_combo} best combo</Text>
                  )}
                  {row.total_survive_ms > 0 && (
                    <Text style={s.gameCardMetaText}>{fmtMs(row.total_survive_ms)} played</Text>
                  )}
                </View>
              )}
            </View>
          ))}
        </View>
      ) : null}
    </>
  );
}

// ─── Generic modal stats for non-games categories ────────────────────────────

function ModalCategoryStats({ entry, category }: { entry: LeaderboardEntry; category: LeaderboardCategory }) {
  function StatRow({ label, value }: { label: string; value: string }) {
    return (
      <View style={s.modalStatRow}>
        <Text style={s.modalStatLabel}>{label}</Text>
        <Text style={s.modalStatValue}>{value}</Text>
      </View>
    );
  }

  switch (category) {
    case 'overall': {
      const e = entry as OverallEntry;
      return (
        <>
          <StatRow label="DAWEN Score"       value={String(Math.round(e.dawen_score ?? 0))} />
          <StatRow label="Game Points"       value={String(Math.round(e.game_score_pts ?? 0))} />
          <StatRow label="Pulse Points"      value={String(Math.round(e.pulse_score_pts ?? 0))} />
          <StatRow label="Community Points"  value={String(Math.round(e.community_score_pts ?? 0))} />
          <StatRow label="DWORLD Points"     value={String(Math.round(e.dworld_score_pts ?? 0))} />
          <StatRow label="Launchpad Points"  value={String(Math.round(e.launchpad_score_pts ?? 0))} />
        </>
      );
    }
    case 'pulse': {
      const e = entry as PulseEntry;
      return (
        <>
          <StatRow label="Posts"              value={String(e.post_count ?? 0)} />
          <StatRow label="Likes Received"     value={String(e.total_likes_received ?? 0)} />
          <StatRow label="Comments Received"  value={String(e.total_comments_received ?? 0)} />
          <StatRow label="Reposts Received"   value={String(e.total_reposts_received ?? 0)} />
          <StatRow label="Followers"          value={String(e.follower_count ?? 0)} />
          <StatRow label="Pulse Score"        value={String(Math.round(e.pulse_score_pts ?? 0))} />
        </>
      );
    }
    case 'dworld': {
      const e = entry as DworldEntry;
      return (
        <>
          <StatRow label="Total Earned"  value={`${Number(e.total_earned ?? 0).toLocaleString()} DWORLD`} />
          <StatRow label="Total Claimed" value={`${Number(e.total_claimed ?? 0).toLocaleString()} DWORLD`} />
          <StatRow label="Pending"       value={`${Number(e.total_pending ?? 0).toLocaleString()} DWORLD`} />
        </>
      );
    }
    case 'community': {
      const e = entry as CommunityEntry;
      return (
        <>
          <StatRow label="Referrals"        value={String(e.referral_count ?? 0)} />
          <StatRow label="Followers"        value={String(e.follower_count ?? 0)} />
          <StatRow label="Community Score"  value={String(Math.round(e.community_score_pts ?? 0))} />
        </>
      );
    }
    case 'launchpad': {
      const e = entry as LaunchpadEntry;
      return (
        <>
          <StatRow label="Total Launches"   value={String(e.total_launches ?? 0)} />
          <StatRow label="Successful"       value={String(e.successful_launches ?? 0)} />
          <StatRow label="Launchpad Score"  value={String(Math.round(e.launchpad_score_pts ?? 0))} />
        </>
      );
    }
    default: return null;
  }
}

// ─── User detail modal ────────────────────────────────────────────────────────

function UserDetailModal({ entry, rank, category, onClose, onViewProfile }: {
  entry: LeaderboardEntry; rank: number; category: LeaderboardCategory;
  onClose: () => void; onViewProfile: () => void;
}) {
  const displayName = entry.username || shortAddr(entry.wallet_address);
  const rankColor = rank === 1 ? GOLD : rank === 2 ? SILVER : rank === 3 ? BRONZE : PURPLE_LIGHT;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={s.modalSheet} activeOpacity={1} onPress={() => {}}>
          <View style={s.modalHandle} />
          <View style={s.modalHeader}>
            <UserAvatar uri={entry.avatar_url} name={displayName} size={56} rank={rank} />
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={s.modalName} numberOfLines={1}>{displayName}</Text>
              <BadgeRow entry={entry} />
              <Text style={[s.modalRankLabel, { color: rankColor }]}>Rank #{rank}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={s.modalClose}>
              <X size={18} color={TEXT2} strokeWidth={2} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: SCREEN_H * 0.5 }} showsVerticalScrollIndicator={false}>
            {category === 'games'
              ? <GamesModalContent entry={entry as GamesEntry} />
              : <ModalCategoryStats entry={entry} category={category} />
            }
          </ScrollView>

          <TouchableOpacity style={s.modalProfileBtn} onPress={onViewProfile} activeOpacity={0.8}>
            <Text style={s.modalProfileBtnText}>View Profile</Text>
            <ChevronRight size={16} color={TEXT} strokeWidth={2.5} />
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TopRankLeaderboard() {
  const router = useRouter();
  const { activeWallet } = useWallet();
  const activeAddress = activeWallet?.publicKey?.toString();

  const [timeframe, setTimeframe]         = useState<LeaderboardTimeframe>('ALL');
  const [category, setCategory]           = useState<LeaderboardCategory>('overall');
  const [searchQuery, setSearchQuery]     = useState('');
  const [data, setData]                   = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading]             = useState(true);
  const [refreshing, setRefreshing]       = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<LeaderboardEntry | null>(null);
  const [selectedRank, setSelectedRank]   = useState(0);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const rows = await fetchLeaderboard(category, timeframe, 50);
      setData(rows);
    } catch (e) {
      console.warn('[TopRankLeaderboard]', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [category, timeframe]);

  useEffect(() => { load(); }, [load]);

  // Realtime: re-fetch when game_results or user_stats change
  useEffect(() => {
    const channel = supabase
      .channel('leaderboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_results' }, () => {
        load(true);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_stats' }, () => {
        load(true);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  const onRefresh = () => { setRefreshing(true); load(true); };

  const filteredData = searchQuery.trim()
    ? data.filter(e => {
        const q = searchQuery.toLowerCase();
        return e.username?.toLowerCase().includes(q) || e.wallet_address.toLowerCase().includes(q);
      })
    : data;

  const currentUserEntry = activeAddress
    ? filteredData.find(e => e.wallet_address === activeAddress) ?? null
    : null;
  const currentUserRank = currentUserEntry ? filteredData.indexOf(currentUserEntry) + 1 : null;

  const catDef = CATEGORIES.find(c => c.key === category)!;

  const handleViewProfile = async (entry: LeaderboardEntry) => {
    try {
      const { data: prof } = await supabase
        .from('user_profiles').select('id')
        .eq('wallet_address', entry.wallet_address).maybeSingle();
      router.push(`/profile/${prof?.id || entry.wallet_address}` as any);
    } catch {
      router.push(`/profile/${entry.wallet_address}` as any);
    }
    setSelectedEntry(null);
  };

  return (
    <View style={s.container}>

      {/* Timeframe selector */}
      <View style={s.timeframeBar}>
        {TIMEFRAMES.map(tf => (
          <TouchableOpacity
            key={tf.key}
            style={[s.tfBtn, timeframe === tf.key && s.tfBtnActive]}
            onPress={() => setTimeframe(tf.key)}
            activeOpacity={0.75}
          >
            <Text style={[s.tfText, timeframe === tf.key && s.tfTextActive]}>{tf.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Category tabs — horizontal scroll with fixed height to prevent clipping */}
      <View style={s.catScrollWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.catScrollContent}
          nestedScrollEnabled
        >
          {CATEGORIES.map(cat => {
            const active = category === cat.key;
            const Icon = cat.Icon;
            return (
              <TouchableOpacity
                key={cat.key}
                style={[s.catTab, active && s.catTabActive, !cat.available && s.catTabDisabled]}
                onPress={() => cat.available && setCategory(cat.key)}
                activeOpacity={cat.available ? 0.75 : 1}
              >
                <Icon size={13} color={active ? PURPLE : cat.available ? TEXT2 : TEXT3} strokeWidth={2} />
                <Text style={[s.catText, active && s.catTextActive, !cat.available && { color: TEXT3 }]}>
                  {cat.label}
                </Text>
                {!cat.available && (
                  <View style={s.soonBadge}><Text style={s.soonText}>Soon</Text></View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Search */}
      <View style={s.searchRow}>
        <Search size={14} color={TEXT3} strokeWidth={2} />
        <TextInput
          style={s.searchInput}
          placeholder="Search username or wallet…"
          placeholderTextColor={TEXT3}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <X size={14} color={TEXT3} strokeWidth={2} />
          </TouchableOpacity>
        )}
      </View>

      {/* Coming soon block */}
      {!catDef.available ? (
        <View style={s.comingSoon}>
          <TrendingUp size={32} color={TEXT3} strokeWidth={1.5} />
          <Text style={s.comingSoonTitle}>Trading Leaderboard</Text>
          <Text style={s.comingSoonText}>
            On-chain trading performance rankings are coming soon. Connect your wallet and start trading to be ready.
          </Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PURPLE} />}
          contentContainerStyle={{ paddingBottom: 24 }}
        >
          {/* Current user rank card */}
          {currentUserEntry && currentUserRank && (
            <MyRankCard entry={currentUserEntry} rank={currentUserRank} category={category} />
          )}

          {loading ? (
            <View style={s.center}>
              <ActivityIndicator color={PURPLE} size="large" />
            </View>
          ) : filteredData.length === 0 ? (
            <View style={s.empty}>
              <View style={s.emptyIconWrap}>
                <Trophy size={32} color={PURPLE} strokeWidth={1.5} />
              </View>
              <Text style={s.emptyTitle}>No rankings yet</Text>
              <Text style={s.emptyText}>
                {searchQuery ? 'No results match your search.' : 'Be the first to rank in this category.'}
              </Text>
            </View>
          ) : (
            <>
              <View style={s.colHeader}>
                <Text style={[s.colLabel, { width: 36 }]}>#</Text>
                <Text style={[s.colLabel, { flex: 1, marginLeft: 8 }]}>Player</Text>
                <Text style={[s.colLabel, { textAlign: 'right' }]}>Score</Text>
              </View>
              {filteredData.map((entry, i) => (
                <RankRow
                  key={entry.wallet_address}
                  entry={entry}
                  rank={i + 1}
                  category={category}
                  onPress={() => { setSelectedEntry(entry); setSelectedRank(i + 1); }}
                />
              ))}
            </>
          )}
        </ScrollView>
      )}

      {selectedEntry && (
        <UserDetailModal
          entry={selectedEntry}
          rank={selectedRank}
          category={category}
          onClose={() => setSelectedEntry(null)}
          onViewProfile={() => handleViewProfile(selectedEntry)}
        />
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1 },

  // Timeframe
  timeframeBar: {
    flexDirection: 'row',
    backgroundColor: SURFACE,
    borderRadius: 10,
    padding: 3,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 10,
    gap: 3,
    flexShrink: 0,
  },
  tfBtn: { flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: 'center' },
  tfBtnActive: { backgroundColor: PURPLE_MUTED, borderWidth: 1, borderColor: PURPLE_BORDER },
  tfText: { fontSize: 11, fontWeight: '700', color: TEXT3 },
  tfTextActive: { color: PURPLE_LIGHT },

  // Category scroll — fixed height wrapper prevents clipping on mobile
  catScrollWrap: {
    height: 44,
    flexShrink: 0,
    marginBottom: 10,
  },
  catScrollContent: { gap: 6, alignItems: 'center', paddingRight: 4 },
  catTab: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: 20, borderWidth: 1,
    borderColor: BORDER, backgroundColor: SURFACE,
    height: 36,
  },
  catTabActive: { borderColor: PURPLE_BORDER, backgroundColor: PURPLE_MUTED },
  catTabDisabled: { opacity: 0.5 },
  catText: { fontSize: 12, fontWeight: '700', color: TEXT2 },
  catTextActive: { color: PURPLE_LIGHT },
  soonBadge: {
    backgroundColor: 'rgba(99,102,241,0.15)',
    paddingHorizontal: 4, paddingVertical: 1,
    borderRadius: 4, marginLeft: 2,
  },
  soonText: { fontSize: 8, fontWeight: '800', color: '#818CF8' },

  // Search
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: SURFACE, borderRadius: 10,
    borderWidth: 1, borderColor: BORDER,
    paddingHorizontal: 12, paddingVertical: 9,
    marginBottom: 12, flexShrink: 0,
  },
  searchInput: {
    flex: 1, fontSize: 13, color: TEXT, fontWeight: '500',
    ...(Platform.OS === 'web' ? { outline: 'none' } as any : {}),
  },

  // Column header
  colHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 6, marginBottom: 4,
  },
  colLabel: { fontSize: 10, fontWeight: '700', color: TEXT3, textTransform: 'uppercase', letterSpacing: 0.5 },

  // Rank rows
  row: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 12, padding: 10, marginBottom: 6,
    borderWidth: 1, borderColor: BORDER, gap: 10,
  },
  rankCell: { width: 28, alignItems: 'center' },
  rankNum:  { fontSize: 13, fontWeight: '800', color: TEXT3 },
  infoCell: { flex: 1, minWidth: 0 },
  nameText: { fontSize: 13, fontWeight: '700', color: TEXT, flexShrink: 1 },
  scoreCell: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  scoreMain: { fontSize: 13, fontWeight: '800', color: TEXT, textAlign: 'right' },

  // Badges
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 5, paddingVertical: 2,
    borderRadius: 4, borderWidth: 1,
    borderColor: PURPLE_BORDER, backgroundColor: PURPLE_MUTED,
  },
  badgeText: { fontSize: 9, fontWeight: '700', color: PURPLE_LIGHT },

  // My rank card
  myRankCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: PURPLE_MUTED, borderRadius: 12,
    borderWidth: 1, borderColor: PURPLE_BORDER,
    padding: 12, marginBottom: 14, gap: 10,
  },
  myRankLeft: { alignItems: 'center', marginRight: 4 },
  myRankLabel: { fontSize: 9, fontWeight: '700', color: PURPLE_LIGHT, textTransform: 'uppercase', letterSpacing: 0.5 },
  myRankNum:   { fontSize: 18, fontWeight: '900', color: PURPLE_LIGHT },
  myRankName:  { fontSize: 14, fontWeight: '700', color: TEXT, flex: 1 },
  myRankScore: { alignItems: 'flex-end' },
  myRankScoreVal:   { fontSize: 16, fontWeight: '900', color: PURPLE_LIGHT },
  myRankScoreLabel: { fontSize: 9, fontWeight: '600', color: TEXT3 },

  // Empty / loading
  center: { paddingVertical: 56, alignItems: 'center' },
  empty:  { paddingVertical: 48, alignItems: 'center', gap: 12, paddingHorizontal: 32 },
  emptyIconWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: PURPLE_MUTED, borderWidth: 1,
    borderColor: PURPLE_BORDER, justifyContent: 'center', alignItems: 'center',
  },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: TEXT, textAlign: 'center' },
  emptyText:  { fontSize: 13, color: TEXT2, textAlign: 'center', lineHeight: 19 },

  // Coming soon
  comingSoon: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 40, paddingVertical: 60, gap: 14,
  },
  comingSoonTitle: { fontSize: 17, fontWeight: '800', color: TEXT, textAlign: 'center' },
  comingSoonText:  { fontSize: 13, color: TEXT2, textAlign: 'center', lineHeight: 20 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#13131C',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderTopWidth: 1, borderColor: PURPLE_BORDER,
    padding: 20, paddingBottom: Platform.OS === 'ios' ? 36 : 24,
  },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: BORDER, alignSelf: 'center', marginBottom: 16 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  modalName:   { fontSize: 16, fontWeight: '800', color: TEXT },
  modalRankLabel: { fontSize: 12, fontWeight: '700', marginTop: 2 },
  modalClose: { width: 32, height: 32, borderRadius: 16, backgroundColor: SURFACE2, justifyContent: 'center', alignItems: 'center' },
  modalStatRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: BORDER },
  modalStatLabel: { fontSize: 13, color: TEXT2, fontWeight: '600' },
  modalStatValue: { fontSize: 13, color: TEXT, fontWeight: '700' },
  modalProfileBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: PURPLE, borderRadius: 12,
    paddingVertical: 13, marginTop: 16,
  },
  modalProfileBtnText: { fontSize: 14, fontWeight: '800', color: TEXT },

  // Games modal sections
  gameSection: { marginBottom: 16 },
  gameSectionTitle: { fontSize: 11, fontWeight: '800', color: TEXT3, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  gameCard: {
    backgroundColor: SURFACE2, borderRadius: 10,
    borderWidth: 1, borderColor: BORDER,
    padding: 12, marginBottom: 8,
  },
  gameCardTitle: { fontSize: 13, fontWeight: '800', color: TEXT, marginBottom: 10 },
  gameCardStats: { flexDirection: 'row', alignItems: 'center' },
  gameStatCol:   { flex: 1, alignItems: 'center' },
  gameStatVal:   { fontSize: 15, fontWeight: '900', color: PURPLE_LIGHT },
  gameStatLabel: { fontSize: 10, color: TEXT3, fontWeight: '600', marginTop: 2 },
  gameStatDivider: { width: 1, height: 28, backgroundColor: BORDER, marginHorizontal: 8 },
  gameCardMeta:  { flexDirection: 'row', gap: 12, marginTop: 8, flexWrap: 'wrap' },
  gameCardMetaText: { fontSize: 11, color: TEXT3, fontWeight: '600' },
});
