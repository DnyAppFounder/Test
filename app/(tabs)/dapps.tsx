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
import { TrendingUp, TrendingDown, Search, Zap, Star, ArrowUpRight, RefreshCw } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { colors, spacing, borderRadius, fontSize, elevation } from '@/constants/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import { liveMarketService, LiveToken } from '@/services/liveMarketService';
import { dexScreenerService } from '@/services/dexscreener/tokenDiscoveryService';

const DAWEN_MINT = '43m6D8gCagyJ4K6NjETr3wjSUUSAAwaFznKbCUECpump';

type Tab = 'featured' | 'trending' | 'new';

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

export default function DawenCityScreen() {
  const { t } = useLanguage();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<Tab>('featured');
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
      // Load DAWEN token data
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

      // Load list based on active tab
      const category = activeTab === 'trending' ? 'trending' : activeTab === 'new' ? 'new' : 'top_volume';
      const data = await liveMarketService.getTokensByCategory(category as any);
      setTokens(data.filter(t => t.address !== DAWEN_MINT));
    } catch (e) {
      console.error('[DawenCity] load error:', e);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

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
    <View style={styles.container}>
      <LinearGradient colors={colors.gradient.header} style={styles.header}>
        <Text style={styles.headerTitle}>{t.tabs.dapps}</Text>
        <Text style={styles.headerSubtitle}>Solana token discovery</Text>
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
      >
        {/* Search */}
        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Search size={18} color={colors.textMuted} strokeWidth={2} />
            <TextInput
              style={styles.searchInput}
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
          <TouchableOpacity style={styles.dawenCard} onPress={() => openToken(dawen)} activeOpacity={0.85}>
            <LinearGradient
              colors={['rgba(139,92,246,0.25)', 'rgba(109,40,217,0.1)']}
              style={styles.dawenGradient}
            >
              <View style={styles.dawenHeader}>
                <View style={styles.featuredPill}>
                  <Zap size={12} color={colors.warning} fill={colors.warning} />
                  <Text style={styles.featuredPillText}>FEATURED TOKEN</Text>
                </View>
                <ArrowUpRight size={20} color={colors.primary} />
              </View>

              <View style={styles.dawenBody}>
                <View style={styles.dawenLeft}>
                  {dawen.image ? (
                    <Image source={{ uri: dawen.image }} style={styles.dawenLogo} />
                  ) : (
                    <View style={styles.dawenLogoPlaceholder}>
                      <Text style={styles.dawenLogoText}>DA</Text>
                    </View>
                  )}
                  <View>
                    <Text style={styles.dawenName}>{dawen.name || 'DAWEN'}</Text>
                    <Text style={styles.dawenSymbol}>{dawen.symbol || 'DAWEN'}</Text>
                  </View>
                </View>

                <View style={styles.dawenRight}>
                  <Text style={styles.dawenPrice}>{formatPrice(dawen.price)}</Text>
                  <View style={[
                    styles.changePill,
                    dawen.priceChange24h >= 0 ? styles.changePillUp : styles.changePillDown,
                  ]}>
                    {dawen.priceChange24h >= 0
                      ? <TrendingUp size={12} color={colors.success} />
                      : <TrendingDown size={12} color={colors.error} />}
                    <Text style={[
                      styles.changeText,
                      dawen.priceChange24h >= 0 ? styles.changeUp : styles.changeDown,
                    ]}>
                      {Math.abs(dawen.priceChange24h).toFixed(2)}%
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.dawenStats}>
                <View style={styles.dawenStat}>
                  <Text style={styles.dawenStatLabel}>24h Volume</Text>
                  <Text style={styles.dawenStatValue}>{formatVolume(dawen.volume24h)}</Text>
                </View>
                <View style={styles.dawenStatDivider} />
                <View style={styles.dawenStat}>
                  <Text style={styles.dawenStatLabel}>Liquidity</Text>
                  <Text style={styles.dawenStatValue}>{formatVolume(dawen.liquidity)}</Text>
                </View>
                {dawen.marketCap && dawen.marketCap > 0 && (
                  <>
                    <View style={styles.dawenStatDivider} />
                    <View style={styles.dawenStat}>
                      <Text style={styles.dawenStatLabel}>Market Cap</Text>
                      <Text style={styles.dawenStatValue}>{formatVolume(dawen.marketCap)}</Text>
                    </View>
                  </>
                )}
              </View>

              <View style={styles.dawenActions}>
                <TouchableOpacity
                  style={styles.tradeButton}
                  onPress={() => router.push('/swap' as any)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.tradeButtonText}>Buy DAWEN</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.detailButton}
                  onPress={() => openToken(dawen)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.detailButtonText}>View Chart</Text>
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </TouchableOpacity>
        )}

        {/* Tab bar */}
        {!searchQuery && (
          <View style={styles.tabBar}>
            {(['featured', 'trending', 'new'] as Tab[]).map(tab => (
              <TouchableOpacity
                key={tab}
                style={[styles.tabButton, activeTab === tab && styles.tabButtonActive]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                  {tab === 'featured' ? 'Top Volume' : tab === 'trending' ? 'Trending' : 'New'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Token list */}
        {loading && !searchQuery ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <View style={styles.tokenList}>
            {searchQuery.trim() && (
              <Text style={styles.resultsLabel}>
                {searching ? 'Searching...' : `${searchResults.length} results for "${searchQuery}"`}
              </Text>
            )}
            {displayTokens.map((token, idx) => {
              const isUp = token.priceChange24h >= 0;
              return (
                <TouchableOpacity
                  key={`${token.address}-${idx}`}
                  style={styles.tokenRow}
                  onPress={() => openToken(token)}
                  activeOpacity={0.75}
                >
                  <View style={styles.tokenRank}>
                    <Text style={styles.tokenRankText}>{idx + 1}</Text>
                  </View>

                  {token.image ? (
                    <Image source={{ uri: token.image }} style={styles.tokenLogo} />
                  ) : (
                    <View style={styles.tokenLogoPlaceholder}>
                      <Text style={styles.tokenLogoText}>
                        {(token.symbol ?? '??').substring(0, 2).toUpperCase()}
                      </Text>
                    </View>
                  )}

                  <View style={styles.tokenInfo}>
                    <View style={styles.tokenNameRow}>
                      <Text style={styles.tokenName} numberOfLines={1}>{token.name}</Text>
                      {(token.boostCount ?? 0) > 0 && (
                        <View style={styles.boostBadge}>
                          <Zap size={10} color={colors.warning} fill={colors.warning} />
                          <Text style={styles.boostText}>{token.boostCount}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.tokenVolume}>Vol {formatVolume(token.volume24h)}</Text>
                  </View>

                  <View style={styles.tokenPriceCol}>
                    <Text style={styles.tokenPrice}>{formatPrice(token.price)}</Text>
                    <View style={[styles.smallChangePill, isUp ? styles.changePillUp : styles.changePillDown]}>
                      <Text style={[styles.smallChangeText, isUp ? styles.changeUp : styles.changeDown]}>
                        {isUp ? '+' : ''}{token.priceChange24h.toFixed(2)}%
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
            {displayTokens.length === 0 && !loading && !searching && (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>
                  {searchQuery ? 'No tokens found' : 'No tokens available'}
                </Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingTop: 56,
    paddingBottom: 16,
    paddingHorizontal: spacing.xxl,
  },
  headerTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 100 },

  searchContainer: {
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.lg,
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

  // DAWEN featured card
  dawenCard: {
    marginHorizontal: spacing.xxl,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.primary,
    marginBottom: spacing.lg,
    ...elevation.md,
  },
  dawenGradient: {
    padding: spacing.xl,
  },
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
  dawenRight: {
    alignItems: 'flex-end',
  },
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
  changePillUp: { backgroundColor: colors.successMuted },
  changePillDown: { backgroundColor: colors.errorMuted },
  changeText: { fontSize: fontSize.sm, fontWeight: '700' },
  changeUp: { color: colors.success },
  changeDown: { color: colors.error },

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

  // Tab bar
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: spacing.xxl,
    marginBottom: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  tabButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  tabButtonActive: {
    backgroundColor: colors.primaryMuted,
  },
  tabText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.primary,
  },

  loadingContainer: {
    paddingVertical: spacing.xxxl * 2,
    alignItems: 'center',
  },

  // Token list
  tokenList: {
    paddingHorizontal: spacing.xxl,
  },
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
  tokenRank: {
    width: 24,
    alignItems: 'center',
  },
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
  tokenPriceCol: {
    alignItems: 'flex-end',
  },
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
  smallChangeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  emptyContainer: {
    paddingVertical: spacing.xxxl * 2,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    fontWeight: '600',
  },
});
