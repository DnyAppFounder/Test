import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  TextInput,
  RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  TrendingUp,
  TrendingDown,
  Search,
  Zap,
  ArrowUpRight,
  Gamepad2,
  Swords,
  Trophy,
  Shield,
  Star,
  Clock,
  Users,
  ChevronRight,
  Lock,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { colors, spacing, borderRadius, fontSize, elevation } from '@/constants/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import { liveMarketService, LiveToken } from '@/services/liveMarketService';
import { dexScreenerService } from '@/services/dexscreener/tokenDiscoveryService';

const DAWEN_MINT = '43m6D8gCagyJ4K6NjETr3wjSUUSAAwaFznKbCUECpump';
const SELL_COLOR = '#D946EF';
const SELL_MUTED = 'rgba(217,70,239,0.12)';

type CityTab = 'token' | 'game' | 'rank';
type DiscoverTab = 'featured' | 'trending' | 'new';

// ─── helpers ───────────────────────────────────────────────────────────────

function formatPrice(price: number): string {
  if (price === 0) return '$0';
  if (price >= 1000) return `$${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  if (price >= 1) return `$${price.toFixed(4)}`;
  if (price >= 0.001) return `$${price.toFixed(6)}`;
  return `$${price.toExponential(3)}`;
}

function formatVolume(v: number): string {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

// ─── DawenCityTabs ─────────────────────────────────────────────────────────

interface DawenCityTabsProps {
  active: CityTab;
  onSelect: (tab: CityTab) => void;
}

const CITY_TABS: { key: CityTab; label: string }[] = [
  { key: 'token', label: 'Token' },
  { key: 'game', label: 'Game' },
  { key: 'rank', label: 'Top Rank' },
];

function DawenCityTabs({ active, onSelect }: DawenCityTabsProps) {
  return (
    <View style={tabStyles.container}>
      {CITY_TABS.map(({ key, label }) => {
        const isActive = active === key;
        return (
          <TouchableOpacity
            key={key}
            style={[tabStyles.tab, isActive && tabStyles.tabActive]}
            onPress={() => onSelect(key)}
            activeOpacity={0.75}
          >
            {isActive && (
              <LinearGradient
                colors={['rgba(139,92,246,0.35)', 'rgba(109,40,217,0.2)']}
                style={StyleSheet.absoluteFill}
              />
            )}
            <Text style={[tabStyles.label, isActive && tabStyles.labelActive]}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const tabStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginHorizontal: spacing.xxl,
    marginBottom: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.surfaceBorderLight,
    gap: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    overflow: 'hidden',
  },
  tabActive: {
    borderWidth: 1,
    borderColor: colors.primary,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.2,
  },
  labelActive: {
    color: colors.primary,
  },
});

// ─── TokenCitySection ───────────────────────────────────────────────────────

function TokenCitySection() {
  const router = useRouter();
  const [discoverTab, setDiscoverTab] = useState<DiscoverTab>('featured');
  const [tokens, setTokens] = useState<LiveToken[]>([]);
  const [dawen, setDawen] = useState<LiveToken | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<LiveToken[]>([]);
  const [searching, setSearching] = useState(false);

  const loadTokens = useCallback(async () => {
    setLoading(true);
    try {
      const dawenPairs = await dexScreenerService.getTokenByAddress(DAWEN_MINT);
      if (dawenPairs.length > 0) {
        const best = dawenPairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
        setDawen({
          id: best.baseToken.address,
          address: best.baseToken.address,
          name: best.baseToken.name,
          symbol: best.baseToken.symbol,
          image: best.info?.imageUrl,
          price: parseFloat(best.priceUsd || '0'),
          priceChange24h: best.priceChange?.h24 || 0,
          volume24h: best.volume?.h24 || 0,
          liquidity: best.liquidity?.usd || 0,
          marketCap: best.marketCap,
          fdv: best.fdv,
          pairAddress: best.pairAddress,
          dexId: best.dexId,
          chainId: 'solana',
          boostCount: best.boosts?.active || 0,
        });
      }
      const category =
        discoverTab === 'trending' ? 'trending' : discoverTab === 'new' ? 'new' : 'top_volume';
      const data = await liveMarketService.getTokensByCategory(category as any);
      setTokens(data.filter(t => t.address !== DAWEN_MINT));
    } catch (e) {
      console.error('[TokenCitySection] load error:', e);
    } finally {
      setLoading(false);
    }
  }, [discoverTab]);

  useEffect(() => {
    loadTokens();
  }, [loadTokens]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadTokens();
    setRefreshing(false);
  };

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const pairs = await dexScreenerService.searchTokens(searchQuery.trim());
        const results = pairs.slice(0, 20).map(p => ({
          id: p.baseToken.address,
          address: p.baseToken.address,
          name: p.baseToken.name,
          symbol: p.baseToken.symbol,
          image: p.info?.imageUrl,
          price: parseFloat(p.priceUsd || '0'),
          priceChange24h: p.priceChange?.h24 || 0,
          volume24h: p.volume?.h24 || 0,
          liquidity: p.liquidity?.usd || 0,
          marketCap: p.marketCap,
          pairAddress: p.pairAddress,
          chainId: 'solana' as const,
          boostCount: p.boosts?.active || 0,
        }));
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const openToken = (token: LiveToken) => {
    router.push(`/token-detail/${token.address}` as any);
  };

  const displayTokens = searchQuery.trim() ? searchResults : tokens;

  return (
    <ScrollView
      style={tokenStyles.scroll}
      contentContainerStyle={tokenStyles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
      }
    >
      {/* Search */}
      <View style={tokenStyles.searchContainer}>
        <View style={tokenStyles.searchBar}>
          <Search size={18} color={colors.textMuted} strokeWidth={2} />
          <TextInput
            style={tokenStyles.searchInput}
            placeholder="Search tokens by name, symbol, or address..."
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searching && <ActivityIndicator size="small" color={colors.primary} />}
        </View>
      </View>

      {/* DAWEN Featured Card */}
      {!searchQuery && dawen && (
        <TouchableOpacity
          style={tokenStyles.dawenCard}
          onPress={() => openToken(dawen)}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={['rgba(139,92,246,0.25)', 'rgba(109,40,217,0.1)']}
            style={tokenStyles.dawenGradient}
          >
            <View style={tokenStyles.dawenHeader}>
              <View style={tokenStyles.featuredPill}>
                <Zap size={12} color={colors.warning} fill={colors.warning} />
                <Text style={tokenStyles.featuredPillText}>FEATURED TOKEN</Text>
              </View>
              <ArrowUpRight size={20} color={colors.primary} />
            </View>

            <View style={tokenStyles.dawenBody}>
              <View style={tokenStyles.dawenLeft}>
                {dawen.image ? (
                  <Image source={{ uri: dawen.image }} style={tokenStyles.dawenLogo} />
                ) : (
                  <View style={tokenStyles.dawenLogoPlaceholder}>
                    <Text style={tokenStyles.dawenLogoText}>DA</Text>
                  </View>
                )}
                <View>
                  <Text style={tokenStyles.dawenName}>{dawen.name || 'DAWEN'}</Text>
                  <Text style={tokenStyles.dawenSymbol}>{dawen.symbol || 'DAWEN'}</Text>
                </View>
              </View>

              <View style={tokenStyles.dawenRight}>
                <Text style={tokenStyles.dawenPrice}>{formatPrice(dawen.price)}</Text>
                <View
                  style={[
                    tokenStyles.changePill,
                    dawen.priceChange24h >= 0 ? tokenStyles.changePillUp : tokenStyles.changePillDown,
                  ]}
                >
                  {dawen.priceChange24h >= 0 ? (
                    <TrendingUp size={12} color={colors.primary} />
                  ) : (
                    <TrendingDown size={12} color={SELL_COLOR} />
                  )}
                  <Text
                    style={[
                      tokenStyles.changeText,
                      dawen.priceChange24h >= 0 ? tokenStyles.changeUp : tokenStyles.changeDown,
                    ]}
                  >
                    {Math.abs(dawen.priceChange24h).toFixed(2)}%
                  </Text>
                </View>
              </View>
            </View>

            <View style={tokenStyles.dawenStats}>
              <View style={tokenStyles.dawenStat}>
                <Text style={tokenStyles.dawenStatLabel}>24h Volume</Text>
                <Text style={tokenStyles.dawenStatValue}>{formatVolume(dawen.volume24h)}</Text>
              </View>
              <View style={tokenStyles.dawenStatDivider} />
              <View style={tokenStyles.dawenStat}>
                <Text style={tokenStyles.dawenStatLabel}>Liquidity</Text>
                <Text style={tokenStyles.dawenStatValue}>{formatVolume(dawen.liquidity)}</Text>
              </View>
              {dawen.marketCap && dawen.marketCap > 0 && (
                <>
                  <View style={tokenStyles.dawenStatDivider} />
                  <View style={tokenStyles.dawenStat}>
                    <Text style={tokenStyles.dawenStatLabel}>Market Cap</Text>
                    <Text style={tokenStyles.dawenStatValue}>{formatVolume(dawen.marketCap)}</Text>
                  </View>
                </>
              )}
            </View>

            <View style={tokenStyles.dawenActions}>
              <TouchableOpacity
                style={tokenStyles.tradeButton}
                onPress={() => router.push('/swap' as any)}
                activeOpacity={0.85}
              >
                <Text style={tokenStyles.tradeButtonText}>Buy DAWEN</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={tokenStyles.detailButton}
                onPress={() => openToken(dawen)}
                activeOpacity={0.85}
              >
                <Text style={tokenStyles.detailButtonText}>View Chart</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </TouchableOpacity>
      )}

      {/* Discover sub-tabs */}
      {!searchQuery && (
        <View style={tokenStyles.discoverTabs}>
          {(['featured', 'trending', 'new'] as DiscoverTab[]).map(tab => (
            <TouchableOpacity
              key={tab}
              style={[tokenStyles.discoverTab, discoverTab === tab && tokenStyles.discoverTabActive]}
              onPress={() => setDiscoverTab(tab)}
            >
              <Text
                style={[
                  tokenStyles.discoverTabText,
                  discoverTab === tab && tokenStyles.discoverTabTextActive,
                ]}
              >
                {tab === 'featured' ? 'Top Volume' : tab === 'trending' ? 'Trending' : 'New'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Token list */}
      {loading && !searchQuery ? (
        <View style={tokenStyles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <View style={tokenStyles.tokenList}>
          {searchQuery.trim() && (
            <Text style={tokenStyles.resultsLabel}>
              {searching ? 'Searching...' : `${searchResults.length} results for "${searchQuery}"`}
            </Text>
          )}
          {displayTokens.map((token, idx) => {
            const isUp = token.priceChange24h >= 0;
            return (
              <TouchableOpacity
                key={`${token.address}-${idx}`}
                style={tokenStyles.tokenRow}
                onPress={() => openToken(token)}
                activeOpacity={0.75}
              >
                <View style={tokenStyles.tokenRank}>
                  <Text style={tokenStyles.tokenRankText}>{idx + 1}</Text>
                </View>

                {token.image ? (
                  <Image source={{ uri: token.image }} style={tokenStyles.tokenLogo} />
                ) : (
                  <View style={tokenStyles.tokenLogoPlaceholder}>
                    <Text style={tokenStyles.tokenLogoText}>
                      {(token.symbol ?? '??').substring(0, 2).toUpperCase()}
                    </Text>
                  </View>
                )}

                <View style={tokenStyles.tokenInfo}>
                  <View style={tokenStyles.tokenNameRow}>
                    <Text style={tokenStyles.tokenName} numberOfLines={1}>
                      {token.name}
                    </Text>
                    {(token.boostCount ?? 0) > 0 && (
                      <View style={tokenStyles.boostBadge}>
                        <Zap size={10} color={colors.warning} fill={colors.warning} />
                        <Text style={tokenStyles.boostText}>{token.boostCount}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={tokenStyles.tokenVolume}>Vol {formatVolume(token.volume24h)}</Text>
                </View>

                <View style={tokenStyles.tokenPriceCol}>
                  <Text style={tokenStyles.tokenPrice}>{formatPrice(token.price)}</Text>
                  <View
                    style={[
                      tokenStyles.smallChangePill,
                      isUp ? tokenStyles.smallPillUp : tokenStyles.smallPillDown,
                    ]}
                  >
                    <Text
                      style={[
                        tokenStyles.smallChangeText,
                        isUp ? tokenStyles.changeUp : tokenStyles.changeDown,
                      ]}
                    >
                      {isUp ? '+' : ''}
                      {token.priceChange24h.toFixed(2)}%
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
          {displayTokens.length === 0 && !loading && !searching && (
            <View style={tokenStyles.emptyContainer}>
              <Text style={tokenStyles.emptyText}>
                {searchQuery ? 'No tokens found' : 'No tokens available'}
              </Text>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const tokenStyles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 32 },
  searchContainer: {
    paddingHorizontal: spacing.xxl,
    paddingBottom: spacing.lg,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  dawenCard: {
    marginHorizontal: spacing.xxl,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.primary,
    marginBottom: spacing.lg,
    ...elevation.md,
  },
  dawenGradient: { padding: spacing.xl },
  dawenHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  featuredPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(245,158,11,0.15)',
    borderWidth: 1,
    borderColor: colors.warning,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.sm,
  },
  featuredPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.warning,
    letterSpacing: 0.5,
  },
  dawenBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  dawenLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  dawenLogo: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface,
  },
  dawenLogoPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primaryMuted,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.primary,
  },
  dawenLogoText: {
    fontSize: fontSize.md,
    fontWeight: '800',
    color: colors.primary,
  },
  dawenName: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  dawenSymbol: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textMuted,
  },
  dawenRight: { alignItems: 'flex-end' },
  dawenPrice: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  changePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.sm,
  },
  changePillUp: { backgroundColor: colors.primaryMuted },
  changePillDown: { backgroundColor: SELL_MUTED },
  changeText: { fontSize: fontSize.sm, fontWeight: '700' },
  changeUp: { color: colors.primary },
  changeDown: { color: SELL_COLOR },
  dawenStats: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  dawenStat: { flex: 1, alignItems: 'center' },
  dawenStatLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '500',
    marginBottom: 2,
  },
  dawenStatValue: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  dawenStatDivider: {
    width: 1,
    height: 28,
    backgroundColor: colors.surfaceBorder,
  },
  dawenActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  tradeButton: {
    flex: 1,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  tradeButtonText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.white,
  },
  detailButton: {
    flex: 1,
    backgroundColor: colors.primaryMuted,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  detailButtonText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.primary,
  },
  discoverTabs: {
    flexDirection: 'row',
    marginHorizontal: spacing.xxl,
    marginBottom: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  discoverTab: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  discoverTabActive: { backgroundColor: colors.primaryMuted },
  discoverTabText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textMuted,
  },
  discoverTabTextActive: { color: colors.primary },
  loadingContainer: {
    paddingVertical: 64,
    alignItems: 'center',
  },
  tokenList: { paddingHorizontal: spacing.xxl },
  resultsLabel: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: '500',
    marginBottom: spacing.md,
  },
  tokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    gap: spacing.md,
  },
  tokenRank: { width: 24, alignItems: 'center' },
  tokenRankText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.textMuted,
  },
  tokenLogo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
  },
  tokenLogoPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  tokenLogoText: {
    fontSize: fontSize.xs,
    fontWeight: '800',
    color: colors.primary,
  },
  tokenInfo: { flex: 1 },
  tokenNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  tokenName: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textPrimary,
    flex: 1,
  },
  boostBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.warningMuted,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  boostText: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.warning,
  },
  tokenVolume: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '500',
  },
  tokenPriceCol: { alignItems: 'flex-end' },
  tokenPrice: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  smallChangePill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  smallPillUp: { backgroundColor: colors.primaryMuted },
  smallPillDown: { backgroundColor: SELL_MUTED },
  smallChangeText: { fontSize: 10, fontWeight: '700' },
  changeUp: { color: colors.primary },
  changeDown: { color: SELL_COLOR },
  emptyContainer: {
    paddingVertical: 64,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    fontWeight: '600',
  },
});

// ─── GameCitySection ────────────────────────────────────────────────────────

interface GameMode {
  key: string;
  icon: React.ComponentType<{ size: number; color: string; strokeWidth: number }>;
  label: string;
  subtitle: string;
  badge?: string;
  locked?: boolean;
}

const GAME_MODES: GameMode[] = [
  {
    key: 'free',
    icon: Gamepad2,
    label: 'Free Mode',
    subtitle: 'Practice without SOL',
    badge: 'OPEN',
  },
  {
    key: 'ranked',
    icon: Trophy,
    label: 'Ranked Mode',
    subtitle: 'Play for score and leaderboard',
    badge: 'OPEN',
  },
  {
    key: 'battle',
    icon: Swords,
    label: 'SOL Battle',
    subtitle: 'Skill-based competition with SOL entry',
    badge: 'SOON',
    locked: true,
  },
];

function GameCitySection() {
  return (
    <ScrollView
      style={gameStyles.scroll}
      contentContainerStyle={gameStyles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero card */}
      <View style={gameStyles.heroCard}>
        <LinearGradient
          colors={['rgba(139,92,246,0.3)', 'rgba(109,40,217,0.15)', 'rgba(0,0,0,0)']}
          style={gameStyles.heroGradient}
        >
          <View style={gameStyles.heroIconRow}>
            <View style={gameStyles.heroIconBg}>
              <Gamepad2 size={32} color={colors.primary} strokeWidth={1.5} />
            </View>
          </View>
          <Text style={gameStyles.heroTitle}>DAWEN Games</Text>
          <Text style={gameStyles.heroSubtitle}>Skill-based Solana competitions</Text>
        </LinearGradient>
      </View>

      {/* Disclaimer */}
      <View style={gameStyles.disclaimerCard}>
        <Shield size={15} color={colors.accent} strokeWidth={2} />
        <Text style={gameStyles.disclaimerText}>
          DAWEN Games are skill-based competitions. No random outcome. No casino mechanics.
        </Text>
      </View>

      {/* Featured Game */}
      <View style={gameStyles.sectionHeader}>
        <Star size={14} color={colors.primary} strokeWidth={2} />
        <Text style={gameStyles.sectionTitle}>Featured Game</Text>
      </View>

      <View style={gameStyles.featuredGameCard}>
        <LinearGradient
          colors={['rgba(139,92,246,0.22)', 'rgba(76,29,149,0.12)']}
          style={gameStyles.featuredGradient}
        >
          <View style={gameStyles.featuredTop}>
            <View style={gameStyles.featuredIconWrap}>
              <Zap size={26} color={colors.primary} strokeWidth={1.5} />
            </View>
            <View style={gameStyles.featuredInfo}>
              <Text style={gameStyles.featuredName}>DAWEN Reflex Battle</Text>
              <Text style={gameStyles.featuredDesc}>Test your reaction speed on-chain</Text>
            </View>
          </View>
          <View style={gameStyles.featuredStats}>
            <View style={gameStyles.featuredStat}>
              <Users size={12} color={colors.textMuted} strokeWidth={2} />
              <Text style={gameStyles.featuredStatText}>Multi-player</Text>
            </View>
            <View style={gameStyles.featuredStatDivider} />
            <View style={gameStyles.featuredStat}>
              <Clock size={12} color={colors.textMuted} strokeWidth={2} />
              <Text style={gameStyles.featuredStatText}>~60s rounds</Text>
            </View>
            <View style={gameStyles.featuredStatDivider} />
            <View style={gameStyles.featuredStat}>
              <Shield size={12} color={colors.textMuted} strokeWidth={2} />
              <Text style={gameStyles.featuredStatText}>Skill only</Text>
            </View>
          </View>
        </LinearGradient>
      </View>

      {/* Game modes */}
      <View style={gameStyles.sectionHeader}>
        <Swords size={14} color={colors.primary} strokeWidth={2} />
        <Text style={gameStyles.sectionTitle}>Choose Mode</Text>
      </View>

      <View style={gameStyles.modeList}>
        {GAME_MODES.map(mode => {
          const Icon = mode.icon;
          return (
            <TouchableOpacity
              key={mode.key}
              style={[gameStyles.modeCard, mode.locked && gameStyles.modeCardLocked]}
              activeOpacity={mode.locked ? 0.5 : 0.8}
              disabled={mode.locked}
            >
              <View style={[gameStyles.modeIconBg, mode.locked && gameStyles.modeIconBgLocked]}>
                {mode.locked ? (
                  <Lock size={20} color={colors.textMuted} strokeWidth={2} />
                ) : (
                  <Icon size={20} color={colors.primary} strokeWidth={2} />
                )}
              </View>
              <View style={gameStyles.modeBody}>
                <Text style={[gameStyles.modeLabel, mode.locked && gameStyles.modeLabelLocked]}>
                  {mode.label}
                </Text>
                <Text style={gameStyles.modeSubtitle}>{mode.subtitle}</Text>
              </View>
              {mode.badge && (
                <View
                  style={[
                    gameStyles.modeBadge,
                    mode.badge === 'SOON' ? gameStyles.modeBadgeSoon : gameStyles.modeBadgeOpen,
                  ]}
                >
                  <Text
                    style={[
                      gameStyles.modeBadgeText,
                      mode.badge === 'SOON'
                        ? gameStyles.modeBadgeTextSoon
                        : gameStyles.modeBadgeTextOpen,
                    ]}
                  >
                    {mode.badge}
                  </Text>
                </View>
              )}
              {!mode.locked && (
                <ChevronRight size={16} color={colors.textMuted} strokeWidth={2} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Coming soon note */}
      <View style={gameStyles.comingSoonCard}>
        <Clock size={16} color={colors.accent} strokeWidth={2} />
        <View style={gameStyles.comingSoonBody}>
          <Text style={gameStyles.comingSoonTitle}>SOL Battle — Coming Soon</Text>
          <Text style={gameStyles.comingSoonText}>
            Skill-based SOL competitions are under development. Entry fees and rewards will be
            processed on-chain with full transparency.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const gameStyles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.xxl,
    paddingBottom: 32,
    gap: spacing.lg,
  },
  heroCard: {
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.surfaceBorderLight,
    ...elevation.md,
  },
  heroGradient: {
    padding: spacing.xxl,
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
  },
  heroIconRow: {
    marginBottom: spacing.lg,
  },
  heroIconBg: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primaryMuted,
    borderWidth: 2,
    borderColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...elevation.glow,
  },
  heroTitle: {
    fontSize: fontSize.xxl,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  heroSubtitle: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textAccent,
    textAlign: 'center',
  },
  disclaimerCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.accentMuted,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(192,132,252,0.25)',
  },
  disclaimerText: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.accent,
    fontWeight: '600',
    lineHeight: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: -spacing.sm,
  },
  sectionTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  featuredGameCard: {
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.surfaceBorderLight,
  },
  featuredGradient: {
    padding: spacing.xl,
    gap: spacing.lg,
  },
  featuredTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  featuredIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  featuredInfo: { flex: 1 },
  featuredName: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  featuredDesc: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  featuredStats: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  featuredStat: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  featuredStatText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '600',
  },
  featuredStatDivider: {
    width: 1,
    height: 20,
    backgroundColor: colors.surfaceBorder,
  },
  modeList: { gap: spacing.sm },
  modeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorderLight,
  },
  modeCardLocked: {
    opacity: 0.55,
    borderColor: colors.surfaceBorder,
  },
  modeIconBg: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modeIconBgLocked: {
    backgroundColor: colors.surfaceLight,
    borderColor: colors.surfaceBorder,
  },
  modeBody: { flex: 1 },
  modeLabel: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  modeLabelLocked: { color: colors.textMuted },
  modeSubtitle: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '500',
  },
  modeBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.sm,
  },
  modeBadgeOpen: {
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  modeBadgeSoon: {
    backgroundColor: 'rgba(192,132,252,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(192,132,252,0.3)',
  },
  modeBadgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  modeBadgeTextOpen: { color: colors.primary },
  modeBadgeTextSoon: { color: colors.accent },
  comingSoonCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: 'rgba(192,132,252,0.06)',
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(192,132,252,0.15)',
  },
  comingSoonBody: { flex: 1 },
  comingSoonTitle: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.accent,
    marginBottom: 4,
  },
  comingSoonText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '500',
    lineHeight: 18,
  },
});

// ─── TopRankCitySection ─────────────────────────────────────────────────────

function TopRankCitySection() {
  return (
    <ScrollView
      style={rankStyles.scroll}
      contentContainerStyle={rankStyles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Header row labels */}
      <View style={rankStyles.tableHeader}>
        <Text style={[rankStyles.colLabel, rankStyles.colRank]}>#</Text>
        <Text style={[rankStyles.colLabel, { flex: 1 }]}>Player</Text>
        <Text style={[rankStyles.colLabel, rankStyles.colScore]}>Score</Text>
        <Text style={[rankStyles.colLabel, rankStyles.colVolume]}>Vol</Text>
      </View>

      {/* Empty state */}
      <View style={rankStyles.emptyCard}>
        <LinearGradient
          colors={['rgba(139,92,246,0.1)', 'rgba(0,0,0,0)']}
          style={rankStyles.emptyGradient}
        >
          <View style={rankStyles.emptyIconWrap}>
            <Trophy size={36} color={colors.primary} strokeWidth={1.5} />
          </View>
          <Text style={rankStyles.emptyTitle}>No rankings yet</Text>
          <Text style={rankStyles.emptyText}>
            Rankings will appear when users start playing, trading, and interacting.
          </Text>
        </LinearGradient>
      </View>

      {/* Preview skeleton of what a rank row will look like */}
      <View style={rankStyles.previewSection}>
        <Text style={rankStyles.previewLabel}>Future rank columns</Text>
        <View style={rankStyles.previewRow}>
          {['Rank', 'Username', 'Badge', 'Score', 'Wins', 'Volume', 'SOL spent', 'Activity'].map(
            col => (
              <View key={col} style={rankStyles.previewChip}>
                <Text style={rankStyles.previewChipText}>{col}</Text>
              </View>
            )
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const rankStyles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.xxl,
    paddingBottom: 32,
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorderLight,
    marginBottom: spacing.md,
  },
  colLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  colRank: { width: 32 },
  colScore: { width: 64, textAlign: 'right' },
  colVolume: { width: 64, textAlign: 'right' },
  emptyCard: {
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.surfaceBorderLight,
    marginBottom: spacing.xxl,
  },
  emptyGradient: {
    alignItems: 'center',
    paddingVertical: spacing.xxxl * 2,
    paddingHorizontal: spacing.xxl,
    gap: spacing.lg,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primaryMuted,
    borderWidth: 2,
    borderColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
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
    lineHeight: 20,
    fontWeight: '500',
    maxWidth: 280,
  },
  previewSection: { gap: spacing.md },
  previewLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  previewRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  previewChip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorderLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  previewChipText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.textSecondary,
  },
});

// ─── DawenCityPage ──────────────────────────────────────────────────────────

export default function DawenCityPage() {
  const { t } = useLanguage();
  const [cityTab, setCityTab] = useState<CityTab>('token');

  return (
    <View style={pageStyles.container}>
      {/* Header */}
      <LinearGradient colors={colors.gradient.header} style={pageStyles.header}>
        <Text style={pageStyles.headerTitle}>Dawen City</Text>
        <Text style={pageStyles.headerSubtitle}>Tokens · Games · Rankings</Text>
      </LinearGradient>

      {/* City tabs */}
      <View style={pageStyles.tabsWrapper}>
        <DawenCityTabs active={cityTab} onSelect={setCityTab} />
      </View>

      {/* Section content — all mounted, only one visible at a time */}
      <View style={[pageStyles.section, cityTab !== 'token' && pageStyles.hidden]}>
        <TokenCitySection />
      </View>
      <View style={[pageStyles.section, cityTab !== 'game' && pageStyles.hidden]}>
        <GameCitySection />
      </View>
      <View style={[pageStyles.section, cityTab !== 'rank' && pageStyles.hidden]}>
        <TopRankCitySection />
      </View>
    </View>
  );
}

const pageStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingTop: 56,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.xxl,
  },
  headerTitle: {
    fontSize: fontSize.xxl,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 4,
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    fontSize: fontSize.sm,
    color: colors.textAccent,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  tabsWrapper: {
    paddingTop: spacing.lg,
  },
  section: {
    flex: 1,
  },
  hidden: {
    display: 'none',
  },
});
