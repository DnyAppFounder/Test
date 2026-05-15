import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, ActivityIndicator, TextInput, RefreshControl, ImageBackground,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  TrendingUp, TrendingDown, Search, Zap, ArrowUpRight, Globe, ChevronRight,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { colors, spacing, borderRadius, fontSize, elevation } from '@/constants/theme';
import { useLanguage } from '@/contexts/LanguageContext';
import { useWallet } from '@/contexts/WalletContext';
import { useProfile } from '@/contexts/ProfileContext';
import { liveMarketService, LiveToken } from '@/services/liveMarketService';
import { dexScreenerService } from '@/services/dexscreener/tokenDiscoveryService';
import { submitGameResult, DuelEntry, DuelMatch } from '@/services/game/duelEntryService';
import { GameModeSelector, GameMode } from '@/components/game/GameModeSelector';
import { SolDuelEntryPanel } from '@/components/game/SolDuelEntryPanel';
import { SolDuelWaitingQueue } from '@/components/game/SolDuelWaitingQueue';
import { DawenRushArena } from '@/components/game/DawenRushArena';
import { GameResultCard, GameResultData } from '@/components/game/GameResultCard';
import { TopRankLeaderboard } from '@/components/game/TopRankLeaderboard';
import { DawenWorldPage } from '@/components/world/DawenWorldPage';

const DAWEN_MINT = '43m6D8gCagyJ4K6NjETr3wjSUUSAAwaFznKbCUECpump';
const SELL_COLOR = '#D946EF';
const SELL_MUTED = 'rgba(217,70,239,0.12)';

type CityTab = 'token' | 'game' | 'rank';
type DiscoverTab = 'featured' | 'trending' | 'new';
type GameStage = 'menu' | 'entry' | 'waiting' | 'matched' | 'playing' | 'result' | 'world';

// ─── helpers ─────────────────────────────────────────────────────────────────

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

// ─── DawenCityTabs ────────────────────────────────────────────────────────────

const CITY_TABS: { key: CityTab; label: string }[] = [
  { key: 'token', label: 'Token' },
  { key: 'game',  label: 'Game' },
  { key: 'rank',  label: 'Top Rank' },
];

function DawenCityTabs({ active, onSelect }: { active: CityTab; onSelect: (t: CityTab) => void }) {
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
    flex: 1, paddingVertical: 11,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    overflow: 'hidden',
  },
  tabActive: { borderWidth: 1, borderColor: colors.primary },
  label: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.2 },
  labelActive: { color: colors.primary },
});

// ─── TokenCitySection ─────────────────────────────────────────────────────────

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
          id: best.baseToken.address, address: best.baseToken.address,
          name: best.baseToken.name, symbol: best.baseToken.symbol,
          image: best.info?.imageUrl, price: parseFloat(best.priceUsd || '0'),
          priceChange24h: best.priceChange?.h24 || 0, volume24h: best.volume?.h24 || 0,
          liquidity: best.liquidity?.usd || 0, marketCap: best.marketCap, fdv: best.fdv,
          pairAddress: best.pairAddress, dexId: best.dexId, chainId: 'solana',
          boostCount: best.boosts?.active || 0,
        });
      }
      const category = discoverTab === 'trending' ? 'trending' : discoverTab === 'new' ? 'new' : 'top_volume';
      const data = await liveMarketService.getTokensByCategory(category as any);
      setTokens(data.filter(t => t.address !== DAWEN_MINT));
    } catch (e) {
      console.error('[TokenCitySection]', e);
    } finally {
      setLoading(false);
    }
  }, [discoverTab]);

  useEffect(() => { loadTokens(); }, [loadTokens]);

  const handleRefresh = async () => { setRefreshing(true); await loadTokens(); setRefreshing(false); };

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const pairs = await dexScreenerService.searchTokens(searchQuery.trim());
        setSearchResults(pairs.slice(0, 20).map(p => ({
          id: p.baseToken.address, address: p.baseToken.address,
          name: p.baseToken.name, symbol: p.baseToken.symbol,
          image: p.info?.imageUrl, price: parseFloat(p.priceUsd || '0'),
          priceChange24h: p.priceChange?.h24 || 0, volume24h: p.volume?.h24 || 0,
          liquidity: p.liquidity?.usd || 0, marketCap: p.marketCap,
          pairAddress: p.pairAddress, chainId: 'solana' as const, boostCount: p.boosts?.active || 0,
        })));
      } catch { setSearchResults([]); }
      finally { setSearching(false); }
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const openToken = (token: LiveToken) => router.push(`/token-detail/${token.address}` as any);
  const displayTokens = searchQuery.trim() ? searchResults : tokens;

  return (
    <ScrollView style={tkStyles.scroll} contentContainerStyle={tkStyles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}>
      <View style={tkStyles.searchContainer}>
        <View style={tkStyles.searchBar}>
          <Search size={18} color={colors.textMuted} strokeWidth={2} />
          <TextInput style={tkStyles.searchInput} placeholder="Search tokens…"
            placeholderTextColor={colors.textMuted} value={searchQuery} onChangeText={setSearchQuery}
            autoCapitalize="none" autoCorrect={false} />
          {searching && <ActivityIndicator size="small" color={colors.primary} />}
        </View>
      </View>

      {!searchQuery && dawen && (
        <TouchableOpacity style={tkStyles.dawenCard} onPress={() => openToken(dawen)} activeOpacity={0.85}>
          <LinearGradient colors={['rgba(139,92,246,0.25)', 'rgba(109,40,217,0.1)']} style={tkStyles.dawenGradient}>
            <View style={tkStyles.dawenHeader}>
              <View style={tkStyles.featuredPill}>
                <Zap size={12} color={colors.warning} fill={colors.warning} />
                <Text style={tkStyles.featuredPillText}>FEATURED TOKEN</Text>
              </View>
              <ArrowUpRight size={20} color={colors.primary} />
            </View>
            <View style={tkStyles.dawenBody}>
              <View style={tkStyles.dawenLeft}>
                {dawen.image ? <Image source={{ uri: dawen.image }} style={tkStyles.dawenLogo} /> :
                  <View style={tkStyles.dawenLogoPlaceholder}><Text style={tkStyles.dawenLogoText}>DA</Text></View>}
                <View>
                  <Text style={tkStyles.dawenName}>{dawen.name || 'DAWEN'}</Text>
                  <Text style={tkStyles.dawenSymbol}>{dawen.symbol || 'DAWEN'}</Text>
                </View>
              </View>
              <View style={tkStyles.dawenRight}>
                <Text style={tkStyles.dawenPrice}>{formatPrice(dawen.price)}</Text>
                <View style={[tkStyles.changePill, dawen.priceChange24h >= 0 ? tkStyles.changePillUp : tkStyles.changePillDown]}>
                  {dawen.priceChange24h >= 0 ? <TrendingUp size={12} color={colors.primary} /> : <TrendingDown size={12} color={SELL_COLOR} />}
                  <Text style={[tkStyles.changeText, dawen.priceChange24h >= 0 ? tkStyles.changeUp : tkStyles.changeDown]}>
                    {Math.abs(dawen.priceChange24h).toFixed(2)}%
                  </Text>
                </View>
              </View>
            </View>
            <View style={tkStyles.dawenStats}>
              <View style={tkStyles.dawenStat}><Text style={tkStyles.dawenStatLabel}>24h Volume</Text><Text style={tkStyles.dawenStatValue}>{formatVolume(dawen.volume24h)}</Text></View>
              <View style={tkStyles.dawenStatDivider} />
              <View style={tkStyles.dawenStat}><Text style={tkStyles.dawenStatLabel}>Liquidity</Text><Text style={tkStyles.dawenStatValue}>{formatVolume(dawen.liquidity)}</Text></View>
              {dawen.marketCap && dawen.marketCap > 0 && (<><View style={tkStyles.dawenStatDivider} /><View style={tkStyles.dawenStat}><Text style={tkStyles.dawenStatLabel}>Market Cap</Text><Text style={tkStyles.dawenStatValue}>{formatVolume(dawen.marketCap)}</Text></View></>)}
            </View>
            <View style={tkStyles.dawenActions}>
              <TouchableOpacity style={tkStyles.tradeButton} onPress={() => router.push('/swap' as any)} activeOpacity={0.85}>
                <Text style={tkStyles.tradeButtonText}>Buy DAWEN</Text>
              </TouchableOpacity>
              <TouchableOpacity style={tkStyles.detailButton} onPress={() => openToken(dawen)} activeOpacity={0.85}>
                <Text style={tkStyles.detailButtonText}>View Chart</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </TouchableOpacity>
      )}

      {!searchQuery && (
        <View style={tkStyles.discoverTabs}>
          {(['featured', 'trending', 'new'] as DiscoverTab[]).map(tab => (
            <TouchableOpacity key={tab} style={[tkStyles.discoverTab, discoverTab === tab && tkStyles.discoverTabActive]} onPress={() => setDiscoverTab(tab)}>
              <Text style={[tkStyles.discoverTabText, discoverTab === tab && tkStyles.discoverTabTextActive]}>
                {tab === 'featured' ? 'Top Volume' : tab === 'trending' ? 'Trending' : 'New'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {loading && !searchQuery ? (
        <View style={tkStyles.loadingContainer}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : (
        <View style={tkStyles.tokenList}>
          {searchQuery.trim() && <Text style={tkStyles.resultsLabel}>{searching ? 'Searching…' : `${searchResults.length} results for "${searchQuery}"`}</Text>}
          {displayTokens.map((token, idx) => {
            const isUp = token.priceChange24h >= 0;
            return (
              <TouchableOpacity key={`${token.address}-${idx}`} style={tkStyles.tokenRow} onPress={() => openToken(token)} activeOpacity={0.75}>
                <View style={tkStyles.tokenRank}><Text style={tkStyles.tokenRankText}>{idx + 1}</Text></View>
                {token.image ? <Image source={{ uri: token.image }} style={tkStyles.tokenLogo} /> :
                  <View style={tkStyles.tokenLogoPlaceholder}><Text style={tkStyles.tokenLogoText}>{(token.symbol ?? '??').substring(0, 2).toUpperCase()}</Text></View>}
                <View style={tkStyles.tokenInfo}>
                  <View style={tkStyles.tokenNameRow}>
                    <Text style={tkStyles.tokenName} numberOfLines={1}>{token.name}</Text>
                    {(token.boostCount ?? 0) > 0 && <View style={tkStyles.boostBadge}><Zap size={10} color={colors.warning} fill={colors.warning} /><Text style={tkStyles.boostText}>{token.boostCount}</Text></View>}
                  </View>
                  <Text style={tkStyles.tokenVolume}>Vol {formatVolume(token.volume24h)}</Text>
                </View>
                <View style={tkStyles.tokenPriceCol}>
                  <Text style={tkStyles.tokenPrice}>{formatPrice(token.price)}</Text>
                  <View style={[tkStyles.smallChangePill, isUp ? tkStyles.smallPillUp : tkStyles.smallPillDown]}>
                    <Text style={[tkStyles.smallChangeText, isUp ? tkStyles.changeUp : tkStyles.changeDown]}>{isUp ? '+' : ''}{token.priceChange24h.toFixed(2)}%</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
          {displayTokens.length === 0 && !loading && !searching && (
            <View style={tkStyles.emptyContainer}><Text style={tkStyles.emptyText}>{searchQuery ? 'No tokens found' : 'No tokens available'}</Text></View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const tkStyles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 32 },
  searchContainer: { paddingHorizontal: spacing.xxl, paddingBottom: spacing.lg },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderRadius: borderRadius.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderWidth: 1, borderColor: colors.surfaceBorder },
  searchInput: { flex: 1, fontSize: fontSize.sm, color: colors.textPrimary, fontWeight: '500' },
  dawenCard: { marginHorizontal: spacing.xxl, borderRadius: borderRadius.xl, overflow: 'hidden', borderWidth: 1, borderColor: colors.primary, marginBottom: spacing.lg, ...elevation.md },
  dawenGradient: { padding: spacing.xl },
  dawenHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  featuredPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(245,158,11,0.15)', borderWidth: 1, borderColor: colors.warning, paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: borderRadius.sm },
  featuredPillText: { fontSize: 10, fontWeight: '800', color: colors.warning, letterSpacing: 0.5 },
  dawenBody: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  dawenLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  dawenLogo: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surface },
  dawenLogoPlaceholder: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primaryMuted, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: colors.primary },
  dawenLogoText: { fontSize: fontSize.md, fontWeight: '800', color: colors.primary },
  dawenName: { fontSize: fontSize.lg, fontWeight: '800', color: colors.textPrimary },
  dawenSymbol: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textMuted },
  dawenRight: { alignItems: 'flex-end' },
  dawenPrice: { fontSize: fontSize.xl, fontWeight: '800', color: colors.textPrimary, marginBottom: 4 },
  changePill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: borderRadius.sm },
  changePillUp: { backgroundColor: colors.primaryMuted },
  changePillDown: { backgroundColor: SELL_MUTED },
  changeText: { fontSize: fontSize.sm, fontWeight: '700' },
  changeUp: { color: colors.primary },
  changeDown: { color: SELL_COLOR },
  dawenStats: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.lg },
  dawenStat: { flex: 1, alignItems: 'center' },
  dawenStatLabel: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '500', marginBottom: 2 },
  dawenStatValue: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textPrimary },
  dawenStatDivider: { width: 1, height: 28, backgroundColor: colors.surfaceBorder },
  dawenActions: { flexDirection: 'row', gap: spacing.md },
  tradeButton: { flex: 1, backgroundColor: colors.primary, paddingVertical: spacing.md, borderRadius: borderRadius.md, alignItems: 'center' },
  tradeButtonText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.white },
  detailButton: { flex: 1, backgroundColor: colors.primaryMuted, paddingVertical: spacing.md, borderRadius: borderRadius.md, alignItems: 'center', borderWidth: 1, borderColor: colors.primary },
  detailButtonText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.primary },
  discoverTabs: { flexDirection: 'row', marginHorizontal: spacing.xxl, marginBottom: spacing.lg, backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: 4, borderWidth: 1, borderColor: colors.surfaceBorder },
  discoverTab: { flex: 1, paddingVertical: spacing.sm, borderRadius: borderRadius.md, alignItems: 'center' },
  discoverTabActive: { backgroundColor: colors.primaryMuted },
  discoverTabText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textMuted },
  discoverTabTextActive: { color: colors.primary },
  loadingContainer: { paddingVertical: 64, alignItems: 'center' },
  tokenList: { paddingHorizontal: spacing.xxl },
  resultsLabel: { fontSize: fontSize.sm, color: colors.textMuted, fontWeight: '500', marginBottom: spacing.md },
  tokenRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.surfaceBorder, gap: spacing.md },
  tokenRank: { width: 24, alignItems: 'center' },
  tokenRankText: { fontSize: fontSize.xs, fontWeight: '600', color: colors.textMuted },
  tokenLogo: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface },
  tokenLogoPlaceholder: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceLight, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.surfaceBorder },
  tokenLogoText: { fontSize: fontSize.xs, fontWeight: '800', color: colors.primary },
  tokenInfo: { flex: 1 },
  tokenNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  tokenName: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textPrimary, flex: 1 },
  boostBadge: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: colors.warningMuted, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4 },
  boostText: { fontSize: 9, fontWeight: '800', color: colors.warning },
  tokenVolume: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '500' },
  tokenPriceCol: { alignItems: 'flex-end' },
  tokenPrice: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 },
  smallChangePill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  smallPillUp: { backgroundColor: colors.primaryMuted },
  smallPillDown: { backgroundColor: SELL_MUTED },
  smallChangeText: { fontSize: 10, fontWeight: '700' },
  emptyContainer: { paddingVertical: 64, alignItems: 'center' },
  emptyText: { fontSize: fontSize.md, color: colors.textMuted, fontWeight: '600' },
});

// ─── GameCitySection ──────────────────────────────────────────────────────────

function MatchedScreen({ match }: { match: DuelMatch }) {
  return (
    <View style={matchedStyles.container}>
      <LinearGradient colors={['rgba(139,92,246,0.3)', 'rgba(0,0,0,0)']} style={StyleSheet.absoluteFill} />
      <Text style={matchedStyles.title}>Match Found!</Text>
      <Text style={matchedStyles.sub}>Preparing your arena…</Text>
      <ActivityIndicator color={colors.primary} size="large" />
      <Text style={matchedStyles.entryAmt}>{match.entry_amount_sol} SOL per player</Text>
    </View>
  );
}

const matchedStyles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xxxl,
    borderWidth: 1,
    borderColor: colors.primary,
    overflow: 'hidden',
    alignItems: 'center',
    gap: spacing.xl,
    ...elevation.glow,
  },
  title: { fontSize: fontSize.xxl, fontWeight: '900', color: colors.primary, textAlign: 'center' },
  sub: { fontSize: fontSize.md, color: colors.textSecondary, fontWeight: '600', textAlign: 'center' },
  entryAmt: { fontSize: fontSize.sm, color: colors.textMuted, fontWeight: '500' },
});

function GameCitySection({ onSetFullscreen }: { onSetFullscreen?: (v: boolean) => void }) {
  const { activeWallet } = useWallet();
  const { profile } = useProfile();
  const insets = useSafeAreaInsets();

  const [stage, setStage] = useState<GameStage>('menu');
  const [mode, setMode] = useState<GameMode | null>(null);
  const [gameSeed, setGameSeed] = useState('');
  const [entry, setEntry] = useState<DuelEntry | null>(null);
  const [match, setMatch] = useState<DuelMatch | null>(null);
  const [result, setResult] = useState<GameResultData | null>(null);

  const walletAddress = activeWallet?.address ?? '';

  const handleModeSelect = (m: GameMode) => {
    setMode(m);
    if (m === 'sol_duel') {
      setStage('entry');
    } else {
      setGameSeed(`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
      setStage('playing');
      onSetFullscreen?.(true);
    }
  };

  const handleEntryCreated = (e: DuelEntry) => {
    setEntry(e);
    setStage('waiting');
  };

  const handleMatched = (m: DuelMatch) => {
    setMatch(m);
    setGameSeed(m.match_seed);
    setStage('matched');
    onSetFullscreen?.(true);
    setTimeout(() => setStage('playing'), 3000);
  };

  const handleGameEnd = async (r: GameResultData) => {
    setResult(r);
    setStage('result');
    onSetFullscreen?.(false);
    if (!walletAddress) return;
    try {
      await submitGameResult({
        match_id: match?.id ?? null,
        entry_id: entry?.id ?? null,
        wallet_address: walletAddress,
        mode: mode!,
        score: r.score,
        survival_time_ms: r.survivalTimeMs,
        orbs_collected: r.orbsCollected,
        obstacles_hit: r.obstaclesHit,
        traps_hit: r.trapsHit,
        combo_max: r.comboMax,
        accuracy: r.accuracy,
        raw_actions: {},
        session_id: r.sessionId,
        map_seed: gameSeed,
      });
    } catch (e) {
      console.warn('[GameCitySection] result submit error:', e);
    }
  };

  const handlePlayAgain = () => {
    setStage('menu'); setMode(null); setEntry(null); setMatch(null); setResult(null); setGameSeed('');
    onSetFullscreen?.(false);
  };

  // ── DAWEN World: full screen ──
  if (stage === 'world') {
    return (
      <DawenWorldPage
        walletAddress={walletAddress}
        username={profile?.username ?? ''}
        isPremium={profile?.is_premium ?? false}
        onExit={() => { setStage('menu'); onSetFullscreen?.(false); }}
      />
    );
  }

  // ── Playing stage: no scroll, arena fills available space ──
  if (stage === 'playing' && gameSeed) {
    return (
      <View style={[gameStyles.arenaContainer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <DawenRushArena
          seed={gameSeed}
          mode={mode!}
          entryId={entry?.id}
          matchId={match?.id}
          entryAmountSol={entry?.entry_amount_sol}
          onGameEnd={handleGameEnd}
        />
      </View>
    );
  }

  return (
    <ScrollView
      style={gameStyles.scroll}
      contentContainerStyle={gameStyles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {stage === 'menu' && (
        <>
          <GameModeSelector onSelect={handleModeSelect} />
          <TouchableOpacity
            style={gameStyles.worldCard}
            onPress={() => { setStage('world'); onSetFullscreen?.(true); }}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={['rgba(16,185,129,0.2)', 'rgba(5,150,105,0.08)']}
              style={StyleSheet.absoluteFill}
            />
            <View style={gameStyles.worldIconWrap}>
              <Globe size={22} color="#10B981" strokeWidth={2} />
            </View>
            <View style={gameStyles.worldBody}>
              <View style={gameStyles.worldTitleRow}>
                <Text style={gameStyles.worldLabel}>DAWEN World</Text>
                <View style={gameStyles.worldBadge}>
                  <Text style={gameStyles.worldBadgeText}>ALPHA</Text>
                </View>
              </View>
              <Text style={gameStyles.worldDesc}>Virtual Solana social world</Text>
              <Text style={gameStyles.worldSub}>Rooms · Avatars · Chat · Shop</Text>
            </View>
            <ChevronRight size={16} color={colors.textMuted} strokeWidth={2} />
          </TouchableOpacity>
        </>
      )}

      {stage === 'entry' && (
        <SolDuelEntryPanel
          username={profile?.username ?? null}
          avatarUrl={profile?.avatar_url ?? null}
          badgeStatus={profile?.is_premium ? 'premium' : 'none'}
          onEntryCreated={handleEntryCreated}
          onBack={() => setStage('menu')}
        />
      )}

      {stage === 'waiting' && entry && (
        <SolDuelWaitingQueue
          entry={entry}
          walletAddress={walletAddress}
          onMatched={handleMatched}
          onCancelled={handlePlayAgain}
        />
      )}

      {stage === 'matched' && match && (
        <MatchedScreen match={match} />
      )}

      {stage === 'result' && result && (
        <GameResultCard
          result={result}
          mode={mode!}
          entryId={entry?.id}
          matchId={match?.id}
          walletAddress={walletAddress}
          entryAmountSol={entry ? Number(entry.entry_amount_sol) : undefined}
          onPlayAgain={handlePlayAgain}
        />
      )}
    </ScrollView>
  );
}

const gameStyles = StyleSheet.create({
  arenaContainer: {
    flex: 1,
    paddingHorizontal: 4,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.xxl,
    paddingBottom: 32,
    gap: spacing.lg,
  },
  worldCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.4)',
    overflow: 'hidden',
  },
  worldIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#10B981',
    backgroundColor: 'rgba(16,185,129,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  worldBody: { flex: 1 },
  worldTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 3,
  },
  worldLabel: {
    fontSize: fontSize.md,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  worldBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(16,185,129,0.15)',
  },
  worldBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: '#10B981',
  },
  worldDesc: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: '500',
    marginBottom: 2,
  },
  worldSub: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '500',
  },
});

// ─── TopRankCitySection ───────────────────────────────────────────────────────

function TopRankCitySection() {
  return (
    <View style={rankStyles.container}>
      <TopRankLeaderboard />
    </View>
  );
}

const rankStyles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing.xxl,
  },
});

// ─── DawenCityPage ────────────────────────────────────────────────────────────

export default function DawenCityPage() {
  const { t } = useLanguage();
  const [cityTab, setCityTab] = useState<CityTab>('token');
  const [gameFullscreen, setGameFullscreen] = useState(false);

  return (
    <View style={pageStyles.container}>
      {!gameFullscreen && (
        <ImageBackground
          source={require('../../tour.jpeg')}
          style={pageStyles.header}
          resizeMode="cover"
        >
          <LinearGradient
            colors={['rgba(6,1,20,0.22)', 'rgba(10,2,30,0.70)']}
            style={StyleSheet.absoluteFill}
          />
          <View style={pageStyles.headerInner}>
            <Text style={pageStyles.headerTitle}>Dawen City</Text>
            <Text style={pageStyles.headerSubtitle}>Tokens • Games • Rankings</Text>
          </View>
        </ImageBackground>
      )}

      {!gameFullscreen && (
        <View style={pageStyles.tabsWrapper}>
          <DawenCityTabs active={cityTab} onSelect={setCityTab} />
        </View>
      )}

      <View style={[pageStyles.section, cityTab !== 'token' && pageStyles.hidden]}>
        <TokenCitySection />
      </View>
      <View style={[pageStyles.section, cityTab !== 'game' && pageStyles.hidden]}>
        <GameCitySection onSetFullscreen={setGameFullscreen} />
      </View>
      <View style={[pageStyles.section, cityTab !== 'rank' && pageStyles.hidden]}>
        <TopRankCitySection />
      </View>
    </View>
  );
}

const pageStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    height: 170,
    overflow: 'hidden',
    position: 'relative',
  },
  headerInner: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.xxl,
    paddingTop: 56,
    justifyContent: 'flex-end',
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: '#FFFFFF',
    marginBottom: 4,
    letterSpacing: 0.2,
    textShadowColor: 'rgba(139,92,246,0.9)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 16,
  },
  headerSubtitle: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: '700',
    letterSpacing: 0.6,
    textShadowColor: 'rgba(139,92,246,0.7)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  tabsWrapper: { paddingTop: spacing.lg },
  section: { flex: 1 },
  hidden: { display: 'none' },
});
