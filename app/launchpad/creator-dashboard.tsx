import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Image, Platform, SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Rocket, TrendingUp, Users, DollarSign, Clock, CircleCheck as CheckCircle, ShieldCheck, Shield, ShieldAlert, Star, Zap, ChevronRight, Flame, Lock, ChartBar as BarChart3, TriangleAlert as AlertTriangle } from 'lucide-react-native';
import { useWallet } from '@/contexts/WalletContext';
import { launchpadService, LaunchpadToken } from '@/services/launchpadService';
import { presaleService, Presale, computePresaleStatus, getPresaleProgress } from '@/services/presaleService';
import { creatorReputationService, CreatorReputation } from '@/services/creatorReputationService';
import { safetyService, SafetyScore } from '@/services/safetyService';
import { trendingService, TrendingScore } from '@/services/trendingService';
import { vestingService, VestingSchedule, VestingStatus } from '@/services/vestingService';
import { colors } from '@/constants/theme';

function fmtSol(n: number) { return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : n.toFixed(3); }
function fmtUsd(n: number) {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}
function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Reputation Badge ─────────────────────────────────────────────────────────
function ReputationCard({ rep }: { rep: CreatorReputation }) {
  const cfg = creatorReputationService.badgeConfig(rep.badge);
  const successRate = rep.launches_total > 0
    ? ((rep.launches_successful / rep.launches_total) * 100).toFixed(0)
    : '—';

  return (
    <View style={styles.repCard}>
      <LinearGradient
        colors={['rgba(139,92,246,0.15)', 'rgba(139,92,246,0.05)']}
        style={styles.repGrad}
      >
        <View style={styles.repTop}>
          <View style={styles.repScoreWrap}>
            <Text style={styles.repScore}>{rep.reputation_score}</Text>
            <Text style={styles.repScoreLabel}>/ 100</Text>
          </View>
          <View style={{ flex: 1, paddingLeft: 14 }}>
            <View style={[styles.repBadge, { backgroundColor: cfg.bg }]}>
              <Text style={[styles.repBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
            </View>
            <Text style={styles.repWallet}>{rep.wallet.slice(0, 8)}…{rep.wallet.slice(-4)}</Text>
          </View>
          <View style={styles.repStar}>
            <Star size={18} color={cfg.color} fill={cfg.color} />
          </View>
        </View>

        <View style={styles.repBarTrack}>
          <View style={[styles.repBarFill, { width: `${rep.reputation_score}%`, backgroundColor: cfg.color }]} />
        </View>

        <View style={styles.repGrid}>
          {[
            ['Launches', String(rep.launches_total)],
            ['Success Rate', `${successRate}%`],
            ['Total Raised', `${fmtSol(rep.total_raised_sol)} SOL`],
            ['Avg LP Lock', `${rep.avg_lp_lock_days.toFixed(0)}d`],
          ].map(([label, val]) => (
            <View key={label} style={styles.repGridItem}>
              <Text style={styles.repGridVal}>{val}</Text>
              <Text style={styles.repGridLabel}>{label}</Text>
            </View>
          ))}
        </View>

        {rep.community_reports > 0 && (
          <View style={styles.repWarning}>
            <AlertTriangle size={12} color="#F59E0B" />
            <Text style={styles.repWarningText}>{rep.community_reports} community report{rep.community_reports > 1 ? 's' : ''}</Text>
          </View>
        )}
      </LinearGradient>
    </View>
  );
}

// ── Token Card ───────────────────────────────────────────────────────────────
function CreatorTokenCard({
  token, presale, safeScore, trendScore, onPress, onPresale,
}: {
  token: LaunchpadToken;
  presale?: Presale | null;
  safeScore?: SafetyScore | null;
  trendScore?: TrendingScore | null;
  onPress: () => void;
  onPresale?: () => void;
}) {
  const router = useRouter();
  const ps = presale ? computePresaleStatus(presale) : null;
  const prog = presale ? getPresaleProgress(presale) : null;

  const PS_COLORS: Record<string, string> = {
    live: '#10B981', upcoming: '#F59E0B', successful: '#10B981',
    failed: '#EF4444', claim_live: colors.primary, finalized: '#6B7280',
  };

  return (
    <TouchableOpacity style={styles.tokenCard} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.tokenCardTop}>
        {token.image_url
          ? <Image source={{ uri: token.image_url }} style={styles.tokenLogo} />
          : (
            <View style={styles.tokenLogoFallback}>
              <Text style={styles.tokenLogoText}>{token.symbol.slice(0, 2)}</Text>
            </View>
          )
        }
        <View style={styles.tokenInfo}>
          <View style={styles.tokenNameRow}>
            <Text style={styles.tokenName}>{token.name}</Text>
            <Text style={styles.tokenSymbol}>{token.symbol}</Text>
          </View>
          <Text style={styles.tokenTime}>{timeAgo(token.created_at)}</Text>
        </View>
        <View style={styles.tokenStatus}>
          <View style={[styles.tokenStatusPill, {
            backgroundColor: token.status === 'deployed' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)'
          }]}>
            <Text style={[styles.tokenStatusText, { color: token.status === 'deployed' ? '#10B981' : '#EF4444' }]}>
              {token.status.toUpperCase()}
            </Text>
          </View>
        </View>
      </View>

      {/* Safety + safety signals */}
      {safeScore && (
        <View style={styles.safetyRow}>
          {safeScore.mint_authority_revoked
            ? <View style={styles.safeChip}><CheckCircle size={11} color="#10B981" /><Text style={[styles.safeChipText, { color: '#10B981' }]}>Mint Revoked</Text></View>
            : <View style={[styles.safeChip, styles.safeChipWarn]}><AlertTriangle size={11} color="#F59E0B" /><Text style={[styles.safeChipText, { color: '#F59E0B' }]}>Mint Active</Text></View>
          }
          {safeScore.freeze_authority_revoked
            ? <View style={styles.safeChip}><CheckCircle size={11} color="#10B981" /><Text style={[styles.safeChipText, { color: '#10B981' }]}>Freeze Revoked</Text></View>
            : <View style={[styles.safeChip, styles.safeChipWarn]}><AlertTriangle size={11} color="#F59E0B" /><Text style={[styles.safeChipText, { color: '#F59E0B' }]}>Freeze Active</Text></View>
          }
          <View style={[styles.safeChip, { backgroundColor: `${safetyService.getRiskColor(safeScore.risk_score)}15` }]}>
            {safeScore.risk_score <= 25
              ? <ShieldCheck size={11} color="#10B981" />
              : safeScore.risk_score <= 60
                ? <Shield size={11} color="#F59E0B" />
                : <ShieldAlert size={11} color="#EF4444" />
            }
            <Text style={[styles.safeChipText, { color: safetyService.getRiskColor(safeScore.risk_score) }]}>
              {safetyService.getRiskLabel(safeScore.risk_score)}
            </Text>
          </View>
        </View>
      )}

      {/* Presale progress */}
      {presale && prog && (
        <TouchableOpacity style={styles.presaleBar} onPress={onPresale} activeOpacity={0.8}>
          <View style={styles.presaleBarHeader}>
            <View style={styles.presaleBarLeft}>
              <Zap size={11} color={PS_COLORS[ps ?? 'upcoming']} />
              <Text style={[styles.presaleBarStatus, { color: PS_COLORS[ps ?? 'upcoming'] }]}>
                {ps?.toUpperCase()} · {presale.buyer_count} buyers
              </Text>
            </View>
            <Text style={styles.presaleBarAmount}>
              {fmtSol(presale.amount_raised)}/{fmtSol(presale.hard_cap)} SOL
            </Text>
          </View>
          <View style={styles.presaleBarTrack}>
            <View style={[styles.presaleBarFill, {
              width: `${prog.hardCapPercent}%`,
              backgroundColor: PS_COLORS[ps ?? 'upcoming'],
            }]} />
          </View>
        </TouchableOpacity>
      )}

      {/* Actions */}
      <View style={styles.tokenActions}>
        {token.mint_address && (
          <TouchableOpacity style={styles.actionBtn} onPress={() => router.push(`/token-detail/${token.mint_address}`)}>
            <TrendingUp size={13} color={colors.primary} />
            <Text style={styles.actionBtnText}>Chart</Text>
          </TouchableOpacity>
        )}
        {presale && (
          <TouchableOpacity style={[styles.actionBtn, styles.actionBtnPrimary]} onPress={onPresale}>
            <Rocket size={13} color="#fff" />
            <Text style={[styles.actionBtnText, { color: '#fff' }]}>Presale</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.actionBtnIcon} onPress={onPress}>
          <ChevronRight size={16} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

// ── Vesting Section ──────────────────────────────────────────────────────────
function VestingSection({ wallet }: { wallet: string }) {
  const [schedules, setSchedules] = useState<VestingSchedule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    vestingService.getSchedulesForWallet(wallet)
      .then(setSchedules)
      .finally(() => setLoading(false));
  }, [wallet]);

  if (loading) return <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />;
  if (schedules.length === 0) return null;

  return (
    <View style={styles.vestingSection}>
      <View style={styles.sectionTitleRow}>
        <Clock size={15} color="#F59E0B" />
        <Text style={styles.sectionTitleText}>Vesting Schedules</Text>
        <Text style={styles.sectionCount}>{schedules.length}</Text>
      </View>
      {schedules.map(s => {
        const status = vestingService.computeStatus(s);
        return (
          <View key={s.id} style={styles.vestingCard}>
            <View style={styles.vestingCardTop}>
              <View style={styles.vestingType}>
                <Text style={styles.vestingTypeText}>{s.allocation_type.toUpperCase()}</Text>
              </View>
              <Text style={styles.vestingAmount}>{vestingService.formatAmount(s.total_amount)}</Text>
              <Text style={styles.vestingStyle}>{s.unlock_style}</Text>
            </View>

            <View style={styles.vestingBarTrack}>
              <View style={[styles.vestingBarFill, { width: `${status.progressPct}%` }]} />
            </View>

            <View style={styles.vestingDetails}>
              <View style={styles.vestingDetailItem}>
                <Text style={styles.vestingDetailLabel}>Vested</Text>
                <Text style={styles.vestingDetailVal}>{vestingService.formatAmount(status.vestedAmount)}</Text>
              </View>
              <View style={styles.vestingDetailItem}>
                <Text style={styles.vestingDetailLabel}>Claimable</Text>
                <Text style={[styles.vestingDetailVal, { color: status.claimableAmount > 0 ? '#10B981' : '#6B7280' }]}>
                  {vestingService.formatAmount(status.claimableAmount)}
                </Text>
              </View>
              <View style={styles.vestingDetailItem}>
                <Text style={styles.vestingDetailLabel}>Locked</Text>
                <Text style={styles.vestingDetailVal}>{vestingService.formatAmount(status.lockedAmount)}</Text>
              </View>
            </View>

            {!status.cliffReached && status.nextUnlockAt && (
              <View style={styles.vestingNextUnlock}>
                <Lock size={11} color="#F59E0B" />
                <Text style={styles.vestingNextUnlockText}>
                  Cliff ends {status.nextUnlockAt.toLocaleDateString()}
                </Text>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

// ── Main Screen ──────────────────────────────────────────────────────────────
export default function CreatorDashboardScreen() {
  const router = useRouter();
  const { activeAddress } = useWallet();

  const [tokens, setTokens] = useState<LaunchpadToken[]>([]);
  const [presaleMap, setPresaleMap] = useState<Map<string, Presale>>(new Map());
  const [safeMap, setSafeMap] = useState<Map<string, SafetyScore>>(new Map());
  const [trendMap, setTrendMap] = useState<Map<string, TrendingScore>>(new Map());
  const [reputation, setReputation] = useState<CreatorReputation | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!activeAddress) { setLoading(false); return; }
    try {
      const [tokenData, presaleData, repData] = await Promise.all([
        launchpadService.getCreatorTokens(activeAddress),
        presaleService.getActivePresales(100),
        creatorReputationService.getOrCreate(activeAddress),
      ]);

      setTokens(tokenData);
      setReputation(repData);

      const pm = new Map<string, Presale>();
      presaleData.forEach(ps => pm.set(ps.token_id, ps));
      setPresaleMap(pm);

      // Load safety + trending for mints
      const mints = tokenData.filter(t => t.mint_address);
      const [safeData, trendData] = await Promise.all([
        Promise.all(mints.map(t => safetyService.getScore(t.mint_address!))),
        trendingService.getTopTokens(100),
      ]);

      const sm = new Map<string, SafetyScore>();
      safeData.forEach((s, i) => { if (s && mints[i]) sm.set(mints[i].mint_address!, s); });
      setSafeMap(sm);

      const tm = new Map<string, TrendingScore>();
      trendData.forEach(ts => tm.set(ts.token_mint, ts));
      setTrendMap(tm);
    } catch (e) {
      console.warn('[CreatorDashboard] load error:', e);
    } finally {
      setLoading(false);
    }
  }, [activeAddress]);

  useEffect(() => { load(); }, [load]);

  if (!activeAddress) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.navBar}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <ArrowLeft size={20} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.navTitle}>Creator Dashboard</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.emptyCenter}>
          <Rocket size={48} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>Connect Wallet</Text>
          <Text style={styles.emptySub}>Connect your wallet to view your creator dashboard.</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Aggregate stats
  const deployedCount = tokens.filter(t => t.status === 'deployed').length;
  const totalPresaleRaised = Array.from(presaleMap.values())
    .filter(ps => tokens.some(t => t.id === ps.token_id))
    .reduce((s, ps) => s + ps.amount_raised, 0);
  const activeLive = Array.from(presaleMap.values())
    .filter(ps => tokens.some(t => t.id === ps.token_id) && computePresaleStatus(ps) === 'live').length;

  return (
    <SafeAreaView style={styles.container}>
      {/* Nav */}
      <View style={styles.navBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ArrowLeft size={20} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Creator Dashboard</Text>
        <TouchableOpacity style={styles.refreshBtn} onPress={load}>
          <BarChart3 size={18} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading dashboard...</Text>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

          {/* Summary stats */}
          <View style={styles.summaryGrid}>
            <View style={styles.summaryCard}>
              <Rocket size={18} color={colors.primary} />
              <Text style={styles.summaryVal}>{deployedCount}</Text>
              <Text style={styles.summaryLabel}>Tokens Launched</Text>
            </View>
            <View style={styles.summaryCard}>
              <DollarSign size={18} color="#10B981" />
              <Text style={[styles.summaryVal, { color: '#10B981' }]}>{fmtSol(totalPresaleRaised)}</Text>
              <Text style={styles.summaryLabel}>SOL Raised</Text>
            </View>
            <View style={styles.summaryCard}>
              <Zap size={18} color="#F59E0B" />
              <Text style={[styles.summaryVal, { color: '#F59E0B' }]}>{activeLive}</Text>
              <Text style={styles.summaryLabel}>Live Presales</Text>
            </View>
          </View>

          {/* Reputation */}
          {reputation && <ReputationCard rep={reputation} />}

          {/* Vesting */}
          <VestingSection wallet={activeAddress} />

          {/* Tokens */}
          <View style={styles.sectionTitleRow}>
            <Rocket size={15} color={colors.primary} />
            <Text style={styles.sectionTitleText}>Your Tokens</Text>
            <Text style={styles.sectionCount}>{tokens.length}</Text>
          </View>

          {tokens.length === 0 ? (
            <View style={styles.emptyTokens}>
              <Rocket size={36} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No tokens yet</Text>
              <Text style={styles.emptySub}>Create your first token from the Launchpad tab.</Text>
              <TouchableOpacity style={styles.launchCta} onPress={() => router.back()}>
                <Text style={styles.launchCtaText}>Go to Launchpad</Text>
              </TouchableOpacity>
            </View>
          ) : (
            tokens.map(token => {
              const ps = presaleMap.get(token.id) ?? null;
              const ss = token.mint_address ? safeMap.get(token.mint_address) ?? null : null;
              const ts = token.mint_address ? trendMap.get(token.mint_address) ?? null : null;
              return (
                <CreatorTokenCard
                  key={token.id}
                  token={token}
                  presale={ps}
                  safeScore={ss}
                  trendScore={ts}
                  onPress={() => token.mint_address && router.push(`/token-detail/${token.mint_address}`)}
                  onPresale={ps ? () => router.push(`/launchpad/${ps.id}`) : undefined}
                />
              );
            })
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0F' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 48 },

  navBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(139,92,246,0.12)',
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#12121A', alignItems: 'center', justifyContent: 'center',
  },
  navTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: '#fff', marginLeft: 10 },
  refreshBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: 'rgba(139,92,246,0.1)', alignItems: 'center', justifyContent: 'center',
  },

  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 14, color: colors.textMuted },

  emptyCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  emptyTokens: { alignItems: 'center', paddingVertical: 32, gap: 10 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },
  emptySub: { fontSize: 13, color: '#6B7280', textAlign: 'center', lineHeight: 19 },
  launchCta: {
    backgroundColor: colors.primary, borderRadius: 12,
    paddingVertical: 11, paddingHorizontal: 24, marginTop: 8,
  },
  launchCtaText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // Summary
  summaryGrid: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  summaryCard: {
    flex: 1, backgroundColor: '#12121A',
    borderRadius: 14, borderWidth: 1, borderColor: 'rgba(139,92,246,0.12)',
    padding: 14, alignItems: 'center', gap: 5,
  },
  summaryVal: { fontSize: 20, fontWeight: '800', color: '#fff' },
  summaryLabel: { fontSize: 10, color: '#6B7280', textAlign: 'center' },

  // Reputation
  repCard: {
    borderRadius: 16, borderWidth: 1, borderColor: 'rgba(139,92,246,0.25)',
    overflow: 'hidden', marginBottom: 16,
  },
  repGrad: { padding: 16 },
  repTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  repScoreWrap: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  repScore: { fontSize: 40, fontWeight: '900', color: '#fff' },
  repScoreLabel: { fontSize: 16, color: '#6B7280' },
  repBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start', marginBottom: 4 },
  repBadgeText: { fontSize: 12, fontWeight: '700' },
  repWallet: { fontSize: 12, color: '#6B7280' },
  repStar: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  repBarTrack: { height: 5, borderRadius: 3, backgroundColor: '#20202E', overflow: 'hidden', marginBottom: 14 },
  repBarFill: { height: 5, borderRadius: 3 },
  repGrid: { flexDirection: 'row' },
  repGridItem: { flex: 1, alignItems: 'center', gap: 2 },
  repGridVal: { fontSize: 13, fontWeight: '700', color: '#fff' },
  repGridLabel: { fontSize: 10, color: '#6B7280' },
  repWarning: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(245,158,11,0.1)', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5, marginTop: 12, alignSelf: 'flex-start',
  },
  repWarningText: { fontSize: 12, color: '#F59E0B' },

  // Section header
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitleText: { flex: 1, fontSize: 14, fontWeight: '700', color: '#fff' },
  sectionCount: {
    backgroundColor: 'rgba(139,92,246,0.15)', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 2,
    fontSize: 11, fontWeight: '700', color: colors.primary,
  },

  // Token card
  tokenCard: {
    backgroundColor: '#12121A', borderRadius: 16,
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.1)',
    padding: 14, marginBottom: 10,
  },
  tokenCardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  tokenLogo: { width: 44, height: 44, borderRadius: 10, backgroundColor: '#20202E' },
  tokenLogoFallback: {
    width: 44, height: 44, borderRadius: 10,
    backgroundColor: 'rgba(139,92,246,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  tokenLogoText: { fontSize: 14, fontWeight: '700', color: colors.primary },
  tokenInfo: { flex: 1, marginLeft: 10 },
  tokenNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tokenName: { fontSize: 15, fontWeight: '700', color: '#fff' },
  tokenSymbol: { fontSize: 12, color: '#6B7280' },
  tokenTime: { fontSize: 11, color: '#4B5563', marginTop: 2 },
  tokenStatus: {},
  tokenStatusPill: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  tokenStatusText: { fontSize: 10, fontWeight: '800' },

  // Safety chips
  safetyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  safeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(16,185,129,0.1)', borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 3,
  },
  safeChipWarn: { backgroundColor: 'rgba(245,158,11,0.1)' },
  safeChipText: { fontSize: 10, fontWeight: '600' },

  // Presale bar
  presaleBar: {
    backgroundColor: '#0A0A0F', borderRadius: 10, padding: 10, marginBottom: 10,
  },
  presaleBarHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  presaleBarLeft: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  presaleBarStatus: { fontSize: 11, fontWeight: '700' },
  presaleBarAmount: { fontSize: 11, color: '#9CA3AF' },
  presaleBarTrack: { height: 4, borderRadius: 2, backgroundColor: '#20202E', overflow: 'hidden' },
  presaleBarFill: { height: 4, borderRadius: 2 },

  // Token actions
  tokenActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.2)',
    borderRadius: 9, paddingHorizontal: 12, paddingVertical: 7,
  },
  actionBtnPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  actionBtnText: { fontSize: 12, fontWeight: '600', color: colors.primary },
  actionBtnIcon: { marginLeft: 'auto' as any },

  // Vesting
  vestingSection: { marginBottom: 16 },
  vestingCard: {
    backgroundColor: '#12121A', borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.15)',
    padding: 14, marginBottom: 8,
  },
  vestingCardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  vestingType: {
    backgroundColor: 'rgba(245,158,11,0.12)', borderRadius: 7,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  vestingTypeText: { fontSize: 10, fontWeight: '800', color: '#F59E0B' },
  vestingAmount: { flex: 1, fontSize: 15, fontWeight: '700', color: '#fff' },
  vestingStyle: { fontSize: 11, color: '#6B7280' },
  vestingBarTrack: { height: 5, borderRadius: 3, backgroundColor: '#20202E', overflow: 'hidden', marginBottom: 10 },
  vestingBarFill: { height: 5, borderRadius: 3, backgroundColor: '#F59E0B' },
  vestingDetails: { flexDirection: 'row' },
  vestingDetailItem: { flex: 1, alignItems: 'center', gap: 2 },
  vestingDetailLabel: { fontSize: 10, color: '#6B7280' },
  vestingDetailVal: { fontSize: 13, fontWeight: '700', color: '#fff' },
  vestingNextUnlock: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(245,158,11,0.06)', borderRadius: 7,
    paddingHorizontal: 8, paddingVertical: 4, marginTop: 8, alignSelf: 'flex-start',
  },
  vestingNextUnlockText: { fontSize: 11, color: '#F59E0B' },
});
