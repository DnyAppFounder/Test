import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Platform,
  Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ArrowLeft, Shield, Check, X, Flag, TriangleAlert as AlertTriangle, ExternalLink, Search, RefreshCw } from 'lucide-react-native';
import { useWallet } from '@/contexts/WalletContext';
import { supabase } from '@/lib/supabase';
import { colors, spacing, borderRadius, fontSize, elevation } from '@/constants/theme';

// Admin wallet addresses — configured via environment variable
// EXPO_PUBLIC_ADMIN_WALLETS is a comma-separated list of wallet addresses
const ADMIN_WALLETS = (process.env.EXPO_PUBLIC_ADMIN_WALLETS ?? '')
  .split(',')
  .map(w => w.trim().toLowerCase())
  .filter(Boolean);

interface ClaimLog {
  id: string;
  user_id: string | null;
  wallet_address: string;
  reward_type: string;
  amount: number;
  token: string;
  claim_ip_hash: string | null;
  device_fingerprint_hash: string | null;
  transaction_signature: string | null;
  status: 'claimed' | 'failed' | 'blocked';
  claimed_at: string;
  error_message: string | null;
}

interface ProfileRow {
  wallet_address: string;
  username: string | null;
  verification_status: string;
}

const STATUS_COLORS: Record<string, string> = {
  verified: '#10B981',
  pending:  '#F59E0B',
  flagged:  '#F97316',
  rejected: '#EF4444',
};

const STATUS_LABELS: Record<string, string> = {
  verified: 'Verified',
  pending:  'Pending',
  flagged:  'Flagged',
  rejected: 'Rejected',
};

export default function AdminRewardsScreen() {
  const router = useRouter();
  const { activeAddress } = useWallet();

  const [logs, setLogs]                       = useState<ClaimLog[]>([]);
  const [loading, setLoading]                 = useState(true);
  const [actionLoading, setActionLoading]     = useState<string | null>(null);
  const [search, setSearch]                   = useState('');
  const [filterStatus, setFilterStatus]       = useState<string>('all');
  const [profileCache, setProfileCache]       = useState<Record<string, ProfileRow>>({});
  const [actionMessage, setActionMessage]     = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [stats, setStats]                     = useState({ total: 0, claimed: 0, failed: 0, blocked: 0 });

  const isAdmin = ADMIN_WALLETS.length > 0 && ADMIN_WALLETS.includes((activeAddress ?? '').toLowerCase());

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('reward_claim_logs')
        .select('*')
        .order('claimed_at', { ascending: false })
        .limit(200);

      if (filterStatus !== 'all') {
        query = query.eq('status', filterStatus);
      }

      const { data, error } = await query;
      if (error) throw error;

      const rows = (data ?? []) as ClaimLog[];
      setLogs(rows);
      setStats({
        total:   rows.length,
        claimed: rows.filter(r => r.status === 'claimed').length,
        failed:  rows.filter(r => r.status === 'failed').length,
        blocked: rows.filter(r => r.status === 'blocked').length,
      });

      // Prefetch profiles for unique wallets
      const wallets = [...new Set(rows.map(r => r.wallet_address))];
      if (wallets.length > 0) {
        const { data: profiles } = await supabase
          .from('user_profiles')
          .select('wallet_address, username, verification_status')
          .in('wallet_address', wallets.slice(0, 50));
        if (profiles) {
          const map: Record<string, ProfileRow> = {};
          for (const p of profiles as ProfileRow[]) map[p.wallet_address] = p;
          setProfileCache(map);
        }
      }
    } catch (err: any) {
      console.error('[AdminRewards] loadLogs:', err);
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => { if (isAdmin) loadLogs(); }, [isAdmin, loadLogs]);

  const setVerificationStatus = async (walletAddress: string, status: string) => {
    setActionLoading(walletAddress + status);
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ verification_status: status })
        .eq('wallet_address', walletAddress);

      if (error) throw error;

      setProfileCache(prev => ({
        ...prev,
        [walletAddress]: { ...prev[walletAddress], wallet_address: walletAddress, verification_status: status },
      }));
      setActionMessage({ type: 'success', text: `${walletAddress.slice(0, 8)}... set to ${status}` });
      setTimeout(() => setActionMessage(null), 3000);
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err?.message || 'Action failed' });
      setTimeout(() => setActionMessage(null), 5000);
    } finally {
      setActionLoading(null);
    }
  };

  const filtered = logs.filter(log => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      log.wallet_address.toLowerCase().includes(q) ||
      log.reward_type.toLowerCase().includes(q) ||
      log.transaction_signature?.toLowerCase().includes(q) ||
      profileCache[log.wallet_address]?.username?.toLowerCase().includes(q)
    );
  });

  // ── Access denied ──────────────────────────────────────────────────────────
  if (!activeAddress) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={colors.gradient.primary} style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ArrowLeft size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Admin: Rewards</Text>
        </LinearGradient>
        <View style={styles.center}>
          <Text style={styles.mutedText}>Connect wallet to access admin panel</Text>
        </View>
      </View>
    );
  }

  if (!isAdmin) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={colors.gradient.primary} style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ArrowLeft size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Admin: Rewards</Text>
        </LinearGradient>
        <View style={styles.center}>
          <Shield size={48} color={colors.textMuted} />
          <Text style={[styles.mutedText, { marginTop: 12 }]}>Access denied</Text>
          <Text style={[styles.mutedText, { fontSize: 12, marginTop: 4 }]}>This page is restricted to admin wallets</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={colors.gradient.primary} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Admin: Reward Claims</Text>
        <TouchableOpacity onPress={loadLogs} style={styles.refreshBtn} activeOpacity={0.7}>
          <RefreshCw size={18} color={colors.textPrimary} />
        </TouchableOpacity>
      </LinearGradient>

      {/* Action message */}
      {actionMessage && (
        <View style={[
          styles.actionBanner,
          actionMessage.type === 'success' ? styles.bannerSuccess : styles.bannerError,
        ]} pointerEvents="none">
          <Text style={styles.actionBannerText}>{actionMessage.text}</Text>
        </View>
      )}

      <ScrollView style={styles.content} contentContainerStyle={styles.contentPad}>
        {/* Stats row */}
        <View style={styles.statsRow}>
          {[
            { label: 'Total', value: stats.total,   color: colors.textPrimary },
            { label: 'Claimed', value: stats.claimed, color: '#10B981' },
            { label: 'Failed',  value: stats.failed,  color: '#F97316' },
            { label: 'Blocked', value: stats.blocked, color: '#EF4444' },
          ].map(s => (
            <View key={s.label} style={styles.statCell}>
              <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Filter bar */}
        <View style={styles.filterRow}>
          {['all', 'claimed', 'failed', 'blocked'].map(f => (
            <TouchableOpacity
              key={f}
              style={[styles.filterChip, filterStatus === f && styles.filterChipActive]}
              onPress={() => setFilterStatus(f)}
              activeOpacity={0.7}
            >
              <Text style={[styles.filterChipText, filterStatus === f && styles.filterChipTextActive]}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Search */}
        <View style={styles.searchRow}>
          <Search size={16} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search wallet, reward type, tx..."
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        {/* Log list */}
        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
        ) : filtered.length === 0 ? (
          <Text style={[styles.mutedText, { textAlign: 'center', marginTop: 40 }]}>No logs found</Text>
        ) : (
          filtered.map(log => {
            const profile = profileCache[log.wallet_address];
            const verStatus = profile?.verification_status ?? 'pending';
            const isActing = actionLoading?.startsWith(log.wallet_address);
            return (
              <View key={log.id} style={styles.logCard}>
                {/* Header row */}
                <View style={styles.logHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.logWallet} numberOfLines={1}>
                      {profile?.username ? `@${profile.username}  ` : ''}
                      {log.wallet_address.slice(0, 8)}...{log.wallet_address.slice(-6)}
                    </Text>
                    <Text style={styles.logMeta}>
                      {log.reward_type} · {Number(log.amount).toLocaleString()} {log.token}
                    </Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: `${STATUS_COLORS[log.status] ?? '#6B7280'}22`, borderColor: STATUS_COLORS[log.status] ?? '#6B7280' }]}>
                    <Text style={[styles.statusBadgeText, { color: STATUS_COLORS[log.status] ?? '#6B7280' }]}>
                      {log.status}
                    </Text>
                  </View>
                </View>

                {/* Details */}
                <View style={styles.logDetails}>
                  <Text style={styles.logDetailText}>
                    {new Date(log.claimed_at).toLocaleString()}
                  </Text>
                  {log.claim_ip_hash && (
                    <Text style={styles.logDetailText}>
                      IP: {log.claim_ip_hash.slice(0, 12)}...
                    </Text>
                  )}
                  {log.device_fingerprint_hash && (
                    <Text style={styles.logDetailText}>
                      FP: {log.device_fingerprint_hash.slice(0, 12)}...
                    </Text>
                  )}
                </View>

                {log.transaction_signature && (
                  <TouchableOpacity
                    onPress={() => {
                      const url = `https://solscan.io/tx/${log.transaction_signature}`;
                      if (Platform.OS === 'web') (window as any).open(url, '_blank');
                      else Linking.openURL(url).catch(() => {});
                    }}
                    style={styles.txRow}
                    activeOpacity={0.7}
                  >
                    <ExternalLink size={11} color={colors.primary} />
                    <Text style={styles.txText} numberOfLines={1}>
                      {log.transaction_signature.slice(0, 28)}...
                    </Text>
                  </TouchableOpacity>
                )}

                {log.error_message && (
                  <Text style={styles.errorMsg} numberOfLines={2}>{log.error_message}</Text>
                )}

                {/* Account verification actions */}
                <View style={styles.actionRow}>
                  <Text style={styles.actionLabel}>
                    Account: <Text style={{ color: STATUS_COLORS[verStatus] ?? '#6B7280' }}>{STATUS_LABELS[verStatus] ?? verStatus}</Text>
                  </Text>
                  {isActing ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <View style={styles.actionBtns}>
                      {verStatus !== 'verified' && (
                        <TouchableOpacity
                          style={[styles.actionBtn, { backgroundColor: 'rgba(16,185,129,0.15)', borderColor: '#10B981' }]}
                          onPress={() => setVerificationStatus(log.wallet_address, 'verified')}
                          activeOpacity={0.7}
                        >
                          <Check size={12} color="#10B981" />
                          <Text style={[styles.actionBtnText, { color: '#10B981' }]}>Verify</Text>
                        </TouchableOpacity>
                      )}
                      {verStatus !== 'flagged' && (
                        <TouchableOpacity
                          style={[styles.actionBtn, { backgroundColor: 'rgba(249,115,22,0.15)', borderColor: '#F97316' }]}
                          onPress={() => setVerificationStatus(log.wallet_address, 'flagged')}
                          activeOpacity={0.7}
                        >
                          <Flag size={12} color="#F97316" />
                          <Text style={[styles.actionBtnText, { color: '#F97316' }]}>Flag</Text>
                        </TouchableOpacity>
                      )}
                      {verStatus !== 'rejected' && (
                        <TouchableOpacity
                          style={[styles.actionBtn, { backgroundColor: 'rgba(239,68,68,0.15)', borderColor: '#EF4444' }]}
                          onPress={() => setVerificationStatus(log.wallet_address, 'rejected')}
                          activeOpacity={0.7}
                        >
                          <X size={12} color="#EF4444" />
                          <Text style={[styles.actionBtnText, { color: '#EF4444' }]}>Reject</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 56,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  backBtn: { marginRight: spacing.md },
  headerTitle: { flex: 1, fontSize: fontSize.lg, fontWeight: '700', color: colors.textPrimary },
  refreshBtn: { padding: spacing.sm },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  mutedText: { fontSize: fontSize.md, color: colors.textMuted },
  content: { flex: 1 },
  contentPad: { padding: spacing.xl, paddingBottom: 60 },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  statCell: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: fontSize.xl, fontWeight: '700' },
  statLabel: { fontSize: 10, color: colors.textMuted, marginTop: 2 },
  filterRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  filterChipActive: { backgroundColor: colors.primaryMuted, borderColor: colors.primary },
  filterChipText: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  filterChipTextActive: { color: colors.primary },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.lg,
  },
  searchInput: { flex: 1, fontSize: 13, color: colors.textPrimary },
  logCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...elevation.sm,
  },
  logHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.sm },
  logWallet: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  logMeta: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  statusBadge: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    marginLeft: spacing.sm,
  },
  statusBadgeText: { fontSize: 10, fontWeight: '700' },
  logDetails: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  logDetailText: { fontSize: 10, color: colors.textMuted },
  txRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: spacing.sm },
  txText: { fontSize: 11, color: colors.primary, flex: 1 },
  errorMsg: { fontSize: 10, color: '#EF4444', marginBottom: spacing.sm },
  actionRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xs, flexWrap: 'wrap', gap: spacing.sm },
  actionLabel: { fontSize: 11, color: colors.textMuted },
  actionBtns: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  actionBtnText: { fontSize: 11, fontWeight: '600' },
  actionBanner: {
    position: 'absolute',
    top: 110,
    left: spacing.xl,
    right: spacing.xl,
    zIndex: 100,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  bannerSuccess: { backgroundColor: 'rgba(16,185,129,0.9)' },
  bannerError:   { backgroundColor: 'rgba(239,68,68,0.9)' },
  actionBannerText: { fontSize: 13, fontWeight: '700', color: '#fff' },
});
