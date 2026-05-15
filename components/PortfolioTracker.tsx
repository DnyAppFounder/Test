import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Search, Wallet, TrendingUp, TrendingDown, Star, Trash2, ChartBar as BarChart2, Check, X, Plus, CreditCard as Edit2 } from 'lucide-react-native';
import { walletAssetLoader, WalletAsset } from '@/services/walletAssetLoader';
import { TrackedWalletsService, TrackedWallet } from '@/services/trackedWalletsService';
import { colors, spacing, borderRadius, fontSize, elevation } from '@/constants/theme';

const VALID_SOLANA_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function isValidSolana(addr: string) {
  return VALID_SOLANA_RE.test(addr.trim());
}

function formatUsd(n: number) {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

function formatPrice(p: number) {
  if (p === 0) return 'Price unavailable';
  if (p >= 1000) return `$${p.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  if (p >= 1) return `$${p.toFixed(4)}`;
  if (p >= 0.001) return `$${p.toFixed(6)}`;
  return `$${p.toExponential(3)}`;
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

interface PortfolioData {
  address: string;
  assets: WalletAsset[];
  totalValue: number;
  error?: string;
}

export interface PortfolioTrackerProps {
  currentUserAddress?: string;
  initialAddress?: string;
  savedWallets: TrackedWallet[];
  onSavedWalletsChange: (wallets: TrackedWallet[]) => void;
}

export function PortfolioTracker({
  currentUserAddress,
  initialAddress,
  savedWallets,
  onSavedWalletsChange,
}: PortfolioTrackerProps) {
  const [inputAddr, setInputAddr] = useState(initialAddress || '');
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [nicknameInput, setNicknameInput] = useState('');
  const [showNicknameInput, setShowNicknameInput] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const analyze = useCallback(async (addr: string) => {
    const clean = addr.trim();
    if (!isValidSolana(clean)) {
      setLoadError('Enter a valid Solana wallet address (32-44 characters).');
      return;
    }
    setLoading(true);
    setLoadError(null);
    setPortfolio(null);
    try {
      const result = await walletAssetLoader.loadWalletAssets('solana', clean);
      setPortfolio({ address: clean, assets: result.assets, totalValue: result.totalValue, error: result.error });
      if (result.error) setLoadError(result.error);
    } catch (e: any) {
      setLoadError(e?.message || 'Failed to load wallet data.');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleAnalyze = () => analyze(inputAddr);

  const handleSave = async () => {
    if (!currentUserAddress || !portfolio) return;
    setSaving(true);
    try {
      await TrackedWalletsService.save(currentUserAddress, portfolio.address, nicknameInput.trim() || undefined);
      const updated = await TrackedWalletsService.getSaved(currentUserAddress);
      onSavedWalletsChange(updated);
      setSavedSuccess(true);
      setShowNicknameInput(false);
      setNicknameInput('');
      setTimeout(() => setSavedSuccess(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (id: string) => {
    await TrackedWalletsService.remove(id);
    if (currentUserAddress) {
      const updated = await TrackedWalletsService.getSaved(currentUserAddress);
      onSavedWalletsChange(updated);
    }
  };

  const isSaved = portfolio
    ? savedWallets.some(w => w.tracked_address === portfolio.address)
    : false;

  const solAsset = portfolio?.assets.find(a => a.isNative);
  const tokenAssets = portfolio?.assets.filter(a => !a.isNative) || [];
  const topHoldings = [...(portfolio?.assets || [])].sort((a, b) => b.value - a.value).slice(0, 5);
  const best = [...tokenAssets].filter(a => a.priceChange24h !== 0).sort((a, b) => b.priceChange24h - a.priceChange24h)[0];
  const worst = [...tokenAssets].filter(a => a.priceChange24h !== 0).sort((a, b) => a.priceChange24h - b.priceChange24h)[0];

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      {/* Search bar */}
      <View style={s.searchCard}>
        <Text style={s.searchLabel}>Track any Solana wallet</Text>
        <View style={s.searchRow}>
          <View style={s.searchInputWrap}>
            <Wallet size={16} color={colors.textMuted} strokeWidth={2} />
            <TextInput
              style={s.searchInput}
              placeholder="Enter wallet address..."
              placeholderTextColor={colors.textMuted}
              value={inputAddr}
              onChangeText={setInputAddr}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={handleAnalyze}
            />
            {inputAddr.length > 0 && (
              <TouchableOpacity onPress={() => { setInputAddr(''); setPortfolio(null); setLoadError(null); }}>
                <X size={15} color={colors.textMuted} strokeWidth={2} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity style={s.analyzeBtn} onPress={handleAnalyze} activeOpacity={0.85}>
            {loading ? <ActivityIndicator size="small" color="#fff" /> : <Search size={18} color="#fff" strokeWidth={2.5} />}
          </TouchableOpacity>
        </View>
        {loadError ? <Text style={s.errorText}>{loadError}</Text> : null}
      </View>

      {/* Portfolio analytics */}
      {portfolio && !loading && (
        <>
          {/* Header card */}
          <LinearGradient
            colors={['rgba(139,92,246,0.18)', 'rgba(109,40,217,0.08)']}
            style={s.portfolioCard}
          >
            <View style={s.portfolioCardHeader}>
              <View>
                <Text style={s.portfolioAddrLabel}>{shortAddr(portfolio.address)}</Text>
                <Text style={s.portfolioValueLabel}>Estimated Portfolio</Text>
                <Text style={s.portfolioValue}>{formatUsd(portfolio.totalValue)}</Text>
              </View>
              <View style={s.portfolioActions}>
                {!isSaved ? (
                  savedSuccess ? (
                    <View style={[s.saveBtn, s.savedBtn]}>
                      <Check size={15} color={colors.success} strokeWidth={2.5} />
                      <Text style={[s.saveBtnText, { color: colors.success }]}>Saved</Text>
                    </View>
                  ) : showNicknameInput ? (
                    <View style={s.nicknameRow}>
                      <TextInput
                        style={s.nicknameInput}
                        placeholder="Nickname (optional)"
                        placeholderTextColor={colors.textMuted}
                        value={nicknameInput}
                        onChangeText={setNicknameInput}
                        autoCapitalize="none"
                        autoFocus
                      />
                      <TouchableOpacity onPress={handleSave} disabled={saving}>
                        {saving ? <ActivityIndicator size="small" color={colors.primary} /> : <Check size={18} color={colors.primary} strokeWidth={2.5} />}
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setShowNicknameInput(false)}>
                        <X size={18} color={colors.textMuted} strokeWidth={2} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={s.saveBtn}
                      onPress={() => currentUserAddress ? setShowNicknameInput(true) : undefined}
                      activeOpacity={0.8}
                    >
                      <Star size={15} color={colors.primary} strokeWidth={2} />
                      <Text style={s.saveBtnText}>Save Wallet</Text>
                    </TouchableOpacity>
                  )
                ) : (
                  <View style={[s.saveBtn, s.savedBtn]}>
                    <Star size={15} color={colors.warning} fill={colors.warning} strokeWidth={0} />
                    <Text style={[s.saveBtnText, { color: colors.warning }]}>Saved</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Stats row */}
            <View style={s.statsRow}>
              <View style={s.stat}>
                <Text style={s.statValue}>{solAsset ? `${solAsset.uiBalance.toFixed(3)} SOL` : '—'}</Text>
                <Text style={s.statLabel}>SOL Balance</Text>
              </View>
              <View style={s.statDivider} />
              <View style={s.stat}>
                <Text style={s.statValue}>{portfolio.assets.length}</Text>
                <Text style={s.statLabel}>Tokens Held</Text>
              </View>
              <View style={s.statDivider} />
              <View style={s.stat}>
                <Text style={s.statValue}>{solAsset?.price > 0 ? formatUsd(solAsset.value) : '—'}</Text>
                <Text style={s.statLabel}>SOL Value</Text>
              </View>
            </View>
          </LinearGradient>

          {/* Best / Worst */}
          {(best || worst) && (
            <View style={s.perfRow}>
              {best && (
                <View style={[s.perfCard, s.perfCardBest]}>
                  <TrendingUp size={14} color={colors.success} strokeWidth={2} />
                  <View style={s.perfInfo}>
                    <Text style={s.perfLabel}>Best Performer</Text>
                    <Text style={s.perfToken} numberOfLines={1}>{best.symbol}</Text>
                    <Text style={s.perfChange}>+{best.priceChange24h.toFixed(2)}%</Text>
                  </View>
                </View>
              )}
              {worst && (
                <View style={[s.perfCard, s.perfCardWorst]}>
                  <TrendingDown size={14} color={colors.error} strokeWidth={2} />
                  <View style={s.perfInfo}>
                    <Text style={s.perfLabel}>Worst Performer</Text>
                    <Text style={s.perfToken} numberOfLines={1}>{worst.symbol}</Text>
                    <Text style={s.perfChange}>{worst.priceChange24h.toFixed(2)}%</Text>
                  </View>
                </View>
              )}
            </View>
          )}

          {/* Top holdings */}
          {topHoldings.length > 0 && (
            <View style={s.holdingsCard}>
              <View style={s.holdingsHeader}>
                <BarChart2 size={16} color={colors.primary} strokeWidth={2} />
                <Text style={s.holdingsTitle}>Top Holdings</Text>
              </View>
              {topHoldings.map((asset, idx) => {
                const pct = portfolio.totalValue > 0 ? (asset.value / portfolio.totalValue) * 100 : 0;
                return (
                  <View key={asset.address} style={[s.holdingRow, idx < topHoldings.length - 1 && s.holdingBorder]}>
                    {asset.logoUrl ? (
                      <Image source={{ uri: asset.logoUrl }} style={s.holdingLogo} />
                    ) : (
                      <View style={s.holdingLogoFallback}>
                        <Text style={s.holdingLogoText}>{(asset.symbol ?? '??').slice(0, 2).toUpperCase()}</Text>
                      </View>
                    )}
                    <View style={s.holdingInfo}>
                      <Text style={s.holdingName} numberOfLines={1}>{asset.name}</Text>
                      <Text style={s.holdingSymbol}>{asset.symbol}</Text>
                    </View>
                    <View style={s.holdingRight}>
                      <Text style={s.holdingValue}>{asset.value > 0 ? formatUsd(asset.value) : 'N/A'}</Text>
                      <View style={s.holdingPctBar}>
                        <View style={[s.holdingPctFill, { width: `${Math.min(100, pct)}%` as any }]} />
                      </View>
                      <Text style={s.holdingPct}>{pct.toFixed(1)}%</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* Risk note */}
          {portfolio.error && (
            <View style={s.warningBox}>
              <Text style={s.warningText}>Some data may be incomplete: {portfolio.error}</Text>
            </View>
          )}
        </>
      )}

      {/* Saved wallets */}
      {savedWallets.length > 0 && (
        <View style={s.savedSection}>
          <Text style={s.savedTitle}>Saved Wallets</Text>
          {savedWallets.map(w => (
            <TouchableOpacity
              key={w.id}
              style={s.savedRow}
              onPress={() => { setInputAddr(w.tracked_address); analyze(w.tracked_address); }}
              activeOpacity={0.8}
            >
              <View style={s.savedIcon}>
                <Wallet size={18} color={colors.primary} strokeWidth={2} />
              </View>
              <View style={s.savedInfo}>
                <Text style={s.savedNickname}>{w.nickname || shortAddr(w.tracked_address)}</Text>
                {w.nickname && <Text style={s.savedAddr}>{shortAddr(w.tracked_address)}</Text>}
              </View>
              <TouchableOpacity
                style={s.removeBtn}
                onPress={() => handleRemove(w.id)}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Trash2 size={15} color={colors.textMuted} strokeWidth={2} />
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {savedWallets.length === 0 && !portfolio && !loading && (
        <View style={s.emptyState}>
          <Wallet size={40} color={colors.primary} strokeWidth={1.5} />
          <Text style={s.emptyTitle}>Track Any Wallet</Text>
          <Text style={s.emptySub}>Paste any Solana address above to analyze its portfolio, top holdings, and performance.</Text>
        </View>
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: spacing.xxl, paddingTop: spacing.lg, gap: spacing.lg },
  searchCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    gap: spacing.sm,
  },
  searchLabel: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textSecondary },
  searchRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  searchInputWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.background, borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: colors.surfaceBorderLight,
  },
  searchInput: { flex: 1, fontSize: fontSize.sm, color: colors.textPrimary, fontWeight: '500' },
  analyzeBtn: {
    width: 44, height: 44, borderRadius: borderRadius.md,
    backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center',
  },
  errorText: { fontSize: fontSize.xs, color: colors.error, fontWeight: '500' },

  portfolioCard: {
    borderRadius: borderRadius.xl, padding: spacing.lg,
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)', gap: spacing.md,
  },
  portfolioCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  portfolioAddrLabel: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '500', fontFamily: 'monospace' },
  portfolioValueLabel: { fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: '600', marginTop: 4, marginBottom: 2 },
  portfolioValue: { fontSize: 26, fontWeight: '900', color: colors.textPrimary },
  portfolioActions: { alignItems: 'flex-end', gap: spacing.sm },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1, borderColor: colors.primary,
    borderRadius: borderRadius.full, paddingVertical: 6, paddingHorizontal: 12,
  },
  savedBtn: { borderColor: colors.warning },
  saveBtnText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  nicknameRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface, borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
    borderWidth: 1, borderColor: colors.surfaceBorder,
    minWidth: 180,
  },
  nicknameInput: { flex: 1, fontSize: 13, color: colors.textPrimary },
  statsRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: borderRadius.lg, padding: spacing.md,
  },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: fontSize.md, fontWeight: '800', color: colors.textPrimary },
  statLabel: { fontSize: 10, color: colors.textMuted, fontWeight: '500', marginTop: 2 },
  statDivider: { width: 1, height: 28, backgroundColor: colors.surfaceBorder },

  perfRow: { flexDirection: 'row', gap: spacing.sm },
  perfCard: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    borderRadius: borderRadius.lg, padding: spacing.md,
    borderWidth: 1,
  },
  perfCardBest: { backgroundColor: 'rgba(16,185,129,0.08)', borderColor: 'rgba(16,185,129,0.25)' },
  perfCardWorst: { backgroundColor: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.25)' },
  perfInfo: { flex: 1 },
  perfLabel: { fontSize: 10, color: colors.textMuted, fontWeight: '600' },
  perfToken: { fontSize: fontSize.sm, fontWeight: '800', color: colors.textPrimary, marginVertical: 1 },
  perfChange: { fontSize: fontSize.xs, fontWeight: '700', color: colors.textSecondary },

  holdingsCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.xl,
    borderWidth: 1, borderColor: colors.surfaceBorder, overflow: 'hidden',
  },
  holdingsHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.surfaceBorderLight,
  },
  holdingsTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textPrimary },
  holdingRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.md },
  holdingBorder: { borderBottomWidth: 1, borderBottomColor: colors.surfaceBorderLight },
  holdingLogo: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceLight },
  holdingLogoFallback: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.primaryMuted, justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: colors.primary,
  },
  holdingLogoText: { fontSize: 11, fontWeight: '800', color: colors.primary },
  holdingInfo: { flex: 1 },
  holdingName: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textPrimary },
  holdingSymbol: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '500' },
  holdingRight: { alignItems: 'flex-end', minWidth: 72 },
  holdingValue: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textPrimary },
  holdingPctBar: {
    width: 60, height: 3, backgroundColor: colors.surfaceBorderLight,
    borderRadius: 2, marginVertical: 3, overflow: 'hidden',
  },
  holdingPctFill: { height: 3, backgroundColor: colors.primary, borderRadius: 2 },
  holdingPct: { fontSize: 10, color: colors.textMuted, fontWeight: '600' },

  warningBox: {
    backgroundColor: 'rgba(245,158,11,0.1)', borderRadius: borderRadius.md,
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)', padding: spacing.md,
  },
  warningText: { fontSize: fontSize.xs, color: colors.warning, fontWeight: '500' },

  savedSection: { gap: spacing.sm },
  savedTitle: { fontSize: fontSize.md, fontWeight: '800', color: colors.textPrimary },
  savedRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.md,
    borderWidth: 1, borderColor: colors.surfaceBorder,
  },
  savedIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.primaryMuted, justifyContent: 'center', alignItems: 'center',
  },
  savedInfo: { flex: 1 },
  savedNickname: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textPrimary },
  savedAddr: { fontSize: fontSize.xs, color: colors.textMuted, fontFamily: 'monospace' },
  removeBtn: { padding: spacing.xs },

  emptyState: { alignItems: 'center', paddingVertical: 48, gap: spacing.md },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: '800', color: colors.textPrimary },
  emptySub: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
});
