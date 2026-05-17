import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  Image,
  ActivityIndicator,
  Modal,
  Pressable,
  Switch,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ArrowDownToLine, ArrowUpFromLine, Plus, Eye, EyeOff, TrendingUp, TrendingDown, Search, Flame, Star, ArrowUp, Sparkles, Zap, Coins, RefreshCw, Image as ImageIcon, SlidersHorizontal, Copy, ArrowRight, ChevronRight, Rocket, ChartBar as BarChart2, Activity, BadgeCheck, X } from 'lucide-react-native';
import { useWallet } from '@/contexts/WalletContext';
import { useProfile } from '@/contexts/ProfileContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { liveMarketService, LiveToken, MarketCategory } from '@/services/liveMarketService';
import { dexScreenerService } from '@/services/dexscreener/tokenDiscoveryService';
import { walletAssetLoader, WalletAsset } from '@/services/walletAssetLoader';
import { watchlistService, WatchlistToken } from '@/services/watchlistService';
import { PortfolioHistoryService } from '@/services/portfolioHistoryService';
import { PortfolioChart } from '@/components/PortfolioChart';
import { formatTokenAmount } from '@/lib/format';
import { NFTService, NFT } from '@/services/nftService';
import { TrackedWalletsService, TrackedWallet } from '@/services/trackedWalletsService';
import { PortfolioTracker } from '@/components/PortfolioTracker';
import { WalletActivity } from '@/components/WalletActivity';
import { colors, spacing, borderRadius, fontSize, elevation } from '@/constants/theme';
import SparklineChart from '@/components/SparklineChart';
import { useLiveToken } from '@/hooks/useLiveToken';
import { AnimatedBalance } from '@/components/AnimatedBalance';

type TabKey = 'market' | 'assets' | 'watchlist' | 'portfolio' | 'activity';
type CategoryKey = 'all' | 'trending' | 'new' | 'verified' | 'top_volume' | 'gainers';
type AssetSubTab = 'tokens' | 'nfts';

function DiscoverTokenRow({
  token,
  isLast,
  onPress,
}: {
  token: LiveToken;
  isLast: boolean;
  onPress: () => void;
}) {
  const live = useLiveToken(token.address);
  const price = (live?.price && live.price > 0) ? live.price : token.price;
  const change = live?.priceChange24h ?? token.priceChange24h;
  const changePositive = change >= 0;
  return (
    <TouchableOpacity
      style={[styles.assetRow, !isLast && styles.assetRowBorder]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {token.image ? (
        <Image source={{ uri: token.image }} style={styles.assetLogo} />
      ) : (
        <View style={styles.assetLogoPlaceholder}>
          <Text style={styles.assetLogoText}>{(token.symbol ?? '??').substring(0, 2).toUpperCase()}</Text>
        </View>
      )}
      <View style={styles.assetInfo}>
        <Text style={styles.assetName} numberOfLines={1}>{token.name}</Text>
        <Text style={styles.assetSymbol}>{token.symbol?.toUpperCase()}</Text>
      </View>
      <View style={styles.assetRight}>
        <Text style={styles.assetValueText}>{liveMarketService.formatPrice(price)}</Text>
        <Text style={[styles.assetChangeText, { color: changePositive ? colors.success : colors.error }]}>
          {liveMarketService.formatChange(change)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function WatchlistTokenRow({
  item,
  baseData,
  isLast,
  onPress,
  onRemove,
}: {
  item: WatchlistToken;
  baseData: LiveToken | undefined;
  isLast: boolean;
  onPress: () => void;
  onRemove: () => void;
}) {
  const live = useLiveToken(item.token_address);
  const price = (live?.price && live.price > 0) ? live.price : (baseData?.price ?? 0);
  const change = live?.priceChange24h ?? baseData?.priceChange24h ?? 0;
  const marketCap = live?.marketCap ?? baseData?.marketCap;
  const isUp = change >= 0;
  const image = baseData?.image;
  const sparkData = baseData?.sparkline && baseData.sparkline.length >= 2 ? baseData.sparkline :
    Array.from({ length: 10 }, (_, i) => 1 + Math.sin(i * 0.5 + (isUp ? 0 : Math.PI)) * 0.5 * Math.abs(change || 1));

  return (
    <TouchableOpacity
      style={[styles.watchlistRow, !isLast && styles.assetRowBorder]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {image ? (
        <Image source={{ uri: image }} style={styles.assetLogo} />
      ) : (
        <View style={styles.assetLogoPlaceholder}>
          <Text style={styles.assetLogoText}>{item.token_symbol?.substring(0, 2).toUpperCase()}</Text>
        </View>
      )}
      <View style={styles.assetInfo}>
        <Text style={styles.assetName} numberOfLines={1}>{item.token_name}</Text>
        <Text style={styles.assetSymbol}>{item.token_symbol?.toUpperCase()}</Text>
      </View>
      <View style={{ marginHorizontal: 8 }}>
        <SparklineChart data={sparkData} width={56} height={28} color={isUp ? '#10b981' : '#ef4444'} />
        <Text style={[styles.watchlistChange, { color: isUp ? '#10b981' : '#ef4444' }]}>
          {isUp ? '+' : ''}{change.toFixed(2)}%
        </Text>
      </View>
      <View style={styles.watchlistPriceCol}>
        <Text style={styles.watchlistPrice}>{liveMarketService.formatPrice(price)}</Text>
        {marketCap ? (
          <Text style={styles.watchlistMcap}>MC {liveMarketService.formatMarketCap(marketCap)}</Text>
        ) : null}
      </View>
      <TouchableOpacity style={[styles.starBtn, { marginLeft: 4 }]} onPress={onRemove}>
        <Star size={18} color={colors.warning} fill={colors.warning} strokeWidth={2} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const CATEGORIES: { key: CategoryKey; label: string; icon: typeof Flame }[] = [
  { key: 'all', label: 'All', icon: Coins },
  { key: 'trending', label: 'Trending', icon: Flame },
  { key: 'new', label: 'New', icon: Sparkles },
  { key: 'verified', label: 'Verified', icon: Star },
  { key: 'top_volume', label: 'Volume', icon: TrendingUp },
  { key: 'gainers', label: 'Gainers', icon: ArrowUp },
];

export default function WalletHome() {
  const router = useRouter();
  const { activeAddress, activeWallet, isInitialized } = useWallet();
  const { profile } = useProfile();
  const { t } = useLanguage();
  const [balanceHidden, setBalanceHidden] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('market');
  const [searchQuery, setSearchQuery] = useState('');
  const [liveTokens, setLiveTokens] = useState<LiveToken[]>([]);
  const [walletAssets, setWalletAssets] = useState<WalletAsset[]>([]);
  const [totalBalance, setTotalBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [category, setCategory] = useState<CategoryKey>('all');
  const [watchlist, setWatchlist] = useState<WatchlistToken[]>([]);
  const [watchlistEnriched, setWatchlistEnriched] = useState<Map<string, LiveToken>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [assetSubTab, setAssetSubTab] = useState<AssetSubTab>('tokens');
  const [assetsError, setAssetsError] = useState<string | null>(null);
  const [nfts, setNfts] = useState<NFT[]>([]);
  const [nftsLoading, setNftsLoading] = useState(false);
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [filterSort, setFilterSort] = useState<'default' | 'gainers' | 'losers' | 'volume' | 'mcap' | 'price_asc' | 'price_desc'>('default');
  const [savedTrackedWallets, setSavedTrackedWallets] = useState<TrackedWallet[]>([]);
  const [portfolioInitialAddr, setPortfolioInitialAddr] = useState('');
  const [allAssetsModalVisible, setAllAssetsModalVisible] = useState(false);
  const [manageAssetsModalVisible, setManageAssetsModalVisible] = useState(false);
  const [hiddenAssets, setHiddenAssets] = useState<Set<string>>(new Set());

  // Realtime new-token feed
  const [pendingNewTokens, setPendingNewTokens] = useState<LiveToken[]>([]);
  const scrollViewRef = useRef<any>(null);
  const scrollYRef = useRef(0);
  const liveTokensRef = useRef<LiveToken[]>([]);

  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab);
    setSearchQuery('');
    if (tab === 'market') {
      setCategory('all');
    }
  };

  const handleApplyPendingNewTokens = useCallback(() => {
    setLiveTokens(prev => {
      const existingMints = new Set(prev.map(t => t.address.toLowerCase()));
      const toInsert = pendingNewTokens.filter(t => !existingMints.has(t.address.toLowerCase()));
      if (toInsert.length === 0) return prev;
      return [...toInsert, ...prev];
    });
    setPendingNewTokens([]);
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
  }, [pendingNewTokens]);

  const loadMarketData = useCallback(async () => {
    // Only show spinner on first load (no tokens yet); subsequent fetches are silent
    setLiveTokens(prev => { if (prev.length === 0) setLoading(true); return prev; });
    setError(null);
    try {
      const tokens = await liveMarketService.getTokensByCategory(category as MarketCategory);
      if (tokens.length === 0) {
        setLiveTokens(prev => {
          if (prev.length === 0) setError('Market data temporarily unavailable. Pull down to refresh.');
          return prev;
        });
      } else {
        setLiveTokens(tokens);
      }
    } catch (err: any) {
      console.error('Error loading market data:', err);
      // Keep existing tokens visible on error — only set error if we have nothing to show
      setLiveTokens(prev => { if (prev.length === 0) setError('Unable to load — check connection and pull to refresh.'); return prev; });
    } finally {
      setLoading(false);
    }
  }, [category]);

  const loadWalletAssets = useCallback(async () => {
    if (!activeAddress) {
      setWalletAssets([]);
      setTotalBalance(0);
      setAssetsError(null);
      return;
    }

    // Only show spinner on first load; subsequent refreshes keep existing data visible
    setWalletAssets(prev => { if (prev.length === 0) setAssetsLoading(true); return prev; });
    setAssetsError(null);
    try {
      const result = await walletAssetLoader.loadWalletAssets('solana', activeAddress);
      if (result.error) setAssetsError(result.error);
      setWalletAssets(result.assets);
      setTotalBalance(result.totalValue);
      if (result.totalValue > 0) {
        await PortfolioHistoryService.recordSnapshot(activeAddress, result.totalValue);
      }
    } catch (err: any) {
      console.error('[MyAssets] Error loading wallet assets:', err);
      setAssetsError(err?.message || 'Failed to load wallet assets');
    } finally {
      setAssetsLoading(false);
    }
  }, [activeAddress]);

  const loadWatchlist = useCallback(async () => {
    if (!profile?.id) { setWatchlist([]); return; }
    try {
      const data = await watchlistService.getWatchlist(profile.id);
      setWatchlist(data);
      // Enrich with live market data
      const enriched = new Map<string, LiveToken>();
      await Promise.allSettled(
        data.map(async (item) => {
          try {
            const token = await liveMarketService.getTokenDetail(item.token_address);
            if (token) enriched.set(item.token_address, token);
          } catch {}
        })
      );
      setWatchlistEnriched(enriched);
    } catch (error) {
      console.error('Error loading watchlist:', error);
      // Keep existing watchlist data rather than clearing on error
    }
  }, [profile?.id]);

  const loadNFTs = useCallback(async () => {
    if (!activeAddress) {
      setNfts([]);
      return;
    }
    setNftsLoading(true);
    try {
      console.log('[NFT] Fetching NFTs for:', activeAddress);
      const result = await NFTService.getUserNFTs(activeAddress);
      console.log('[NFT] NFT result:', result.length, 'items');
      setNfts(result);
    } catch (err) {
      console.error('[NFT] Fetch error:', err);
      setNfts([]);
    } finally {
      setNftsLoading(false);
    }
  }, [activeAddress]);

  useEffect(() => {
    loadMarketData();
  }, [loadMarketData]);

  // Keep ref in sync so async poll callbacks can read latest state without stale closure
  useEffect(() => { liveTokensRef.current = liveTokens; }, [liveTokens]);

  // Realtime polling for the New filter — inserts new tokens at top without full reload
  useEffect(() => {
    if (activeTab !== 'market' || category !== 'new') {
      setPendingNewTokens([]);
      return;
    }

    const poll = async () => {
      try {
        dexScreenerService.invalidateNewTokensCache();
        const freshTokens = await liveMarketService.getTokensByCategory('new');
        if (freshTokens.length === 0) return;

        const current = liveTokensRef.current;
        const existingMints = new Set(current.map(t => t.address.toLowerCase()));
        const genuinelyNew = freshTokens.filter(t => !existingMints.has(t.address.toLowerCase()));

        if (genuinelyNew.length === 0) {
          // No new tokens — update prices in-place only
          setLiveTokens(prev => {
            const updatedMap = new Map(freshTokens.map(t => [t.address.toLowerCase(), t]));
            return prev.map(t => updatedMap.get(t.address.toLowerCase()) ?? t);
          });
          return;
        }

        if (scrollYRef.current <= 150) {
          // User is near top — insert directly
          setLiveTokens(prev => {
            const existingInPrev = new Set(prev.map(t => t.address.toLowerCase()));
            const toInsert = genuinelyNew.filter(t => !existingInPrev.has(t.address.toLowerCase()));
            if (toInsert.length === 0) return prev;
            return [...toInsert, ...prev];
          });
        } else {
          // User scrolled down — queue for pill
          setPendingNewTokens(prev => {
            const existingPending = new Set(prev.map(t => t.address.toLowerCase()));
            const toQueue = genuinelyNew.filter(t =>
              !existingPending.has(t.address.toLowerCase()) &&
              !existingMints.has(t.address.toLowerCase())
            );
            if (toQueue.length === 0) return prev;
            return [...toQueue, ...prev];
          });
        }
      } catch {
        // Silently ignore — never disturb the user on poll failure
      }
    };

    const id = setInterval(poll, 30_000);
    return () => clearInterval(id);
  }, [activeTab, category]);

  useEffect(() => {
    loadWalletAssets();
  }, [loadWalletAssets]);

  useEffect(() => {
    loadWatchlist();
  }, [loadWatchlist]);

  // Reload watchlist whenever the screen gains focus (e.g. after adding from token-detail)
  useFocusEffect(
    useCallback(() => {
      loadWatchlist();
    }, [loadWatchlist])
  );

  // Load NFTs when assets tab is active
  useEffect(() => {
    if (activeTab === 'assets' && activeAddress) {
      loadNFTs();
    }
  }, [activeTab, activeAddress, loadNFTs]);

  // Load saved tracked wallets when portfolio tab opens
  useEffect(() => {
    if (activeTab === 'portfolio' && activeAddress) {
      TrackedWalletsService.getSaved(activeAddress).then(setSavedTrackedWallets).catch(() => {});
    }
  }, [activeTab, activeAddress]);

  const onRefresh = async () => {
    setRefreshing(true);
    setPendingNewTokens([]);
    try {
      const jobs: Promise<any>[] = [loadMarketData(), loadWalletAssets(), loadWatchlist()];
      if (assetSubTab === 'nfts') jobs.push(loadNFTs());
      await Promise.allSettled(jobs);
    } catch (e) {
      console.warn('[Home] onRefresh error:', e);
    } finally {
      setRefreshing(false);
    }
  };

  const formatBalance = (balance: number) => {
    if (balanceHidden) return '****';
    return `$${balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const [searchResults, setSearchResults] = useState<LiveToken[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // API-backed search with debounce
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2 || activeTab !== 'market') {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const results = await liveMarketService.searchTokens(searchQuery);
        setSearchResults(results);
      } catch (err) {
        console.error('[Search] API error:', err);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [searchQuery, activeTab]);

  const baseTokens = searchQuery && searchQuery.length >= 2 ? searchResults : liveTokens;
  const filteredTokens = [...baseTokens].sort((a, b) => {
    switch (filterSort) {
      case 'gainers': return b.priceChange24h - a.priceChange24h;
      case 'losers': return a.priceChange24h - b.priceChange24h;
      case 'volume': return (b.volume24h || 0) - (a.volume24h || 0);
      case 'mcap': return (b.marketCap || 0) - (a.marketCap || 0);
      case 'price_asc': return a.price - b.price;
      case 'price_desc': return b.price - a.price;
      default: return 0;
    }
  });

  const [copiedAddr, setCopiedAddr] = useState(false);

  const handleCopyAddress = async () => {
    if (activeWallet?.address) {
      await Clipboard.setStringAsync(activeWallet.address);
      setCopiedAddr(true);
      setTimeout(() => setCopiedAddr(false), 2000);
    }
  };

  const filteredAssets = walletAssets.filter((asset) => {
    if (hiddenAssets.has(asset.address)) return false;
    if (!searchQuery) return true;
    return asset.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
           asset.symbol.toLowerCase().includes(searchQuery.toLowerCase());
  });

  // Only show static placeholder when no wallet connected AND not loading
  const hasWallet = !!activeAddress;
  // Only show "connect wallet" after wallet context has fully initialized to avoid the brief flash
  const showStaticFallback = !hasWallet && !assetsLoading && isInitialized;

  const shortAddr = activeWallet
    ? `${activeWallet.address.slice(0, 4)}...${activeWallet.address.slice(-4)}`
    : '---';
  const walletLabel = activeWallet?.type === 'connected' ? activeWallet.name : (activeWallet ? 'Wallet' : 'No Wallet');

  const FILTER_OPTIONS: { key: typeof filterSort; label: string }[] = [
    { key: 'default', label: 'Default' },
    { key: 'gainers', label: 'Top Gainers' },
    { key: 'losers', label: 'Top Losers' },
    { key: 'volume', label: 'Highest Volume' },
    { key: 'mcap', label: 'Highest Market Cap' },
    { key: 'price_desc', label: 'Price: High to Low' },
    { key: 'price_asc', label: 'Price: Low to High' },
  ];

  return (
    <>
    <Modal
      visible={filterModalVisible}
      transparent
      animationType="fade"
      onRequestClose={() => setFilterModalVisible(false)}
    >
      <Pressable style={styles.modalOverlay} onPress={() => setFilterModalVisible(false)}>
        <Pressable style={styles.filterModal} onPress={() => {}}>
          <Text style={styles.filterModalTitle}>Sort Tokens</Text>
          {FILTER_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.key}
              style={[styles.filterOption, filterSort === opt.key && styles.filterOptionActive]}
              onPress={() => { setFilterSort(opt.key); setFilterModalVisible(false); }}
              activeOpacity={0.7}
            >
              <Text style={[styles.filterOptionText, filterSort === opt.key && styles.filterOptionTextActive]}>
                {opt.label}
              </Text>
              {filterSort === opt.key && <View style={styles.filterOptionDot} />}
            </TouchableOpacity>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
    <ScrollView
      ref={scrollViewRef}
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      onScroll={(e) => { scrollYRef.current = e.nativeEvent.contentOffset.y; }}
      scrollEventThrottle={200}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      {/* ── 1. PORTFOLIO HEADER CARD ── */}
      <LinearGradient
        colors={['#1A0B2E', '#12121A', '#0A0A0F']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.portfolioCard}
      >
        {/* Glow blobs */}
        <View style={styles.glow1} />
        <View style={styles.glow2} />

        <View style={styles.portfolioTop}>
          <Text style={styles.portfolioLabel}>PORTFOLIO VALUE</Text>
          <TouchableOpacity onPress={() => setBalanceHidden(!balanceHidden)}>
            {balanceHidden ? <EyeOff size={20} color="rgba(255,255,255,0.5)" /> : <Eye size={20} color="rgba(255,255,255,0.5)" />}
          </TouchableOpacity>
        </View>

        <AnimatedBalance value={totalBalance} formatter={formatBalance} style={styles.portfolioBalance} />
        <Text style={styles.portfolioChange}>
          {balanceHidden ? '****' : `$${totalBalance.toFixed(2)} (0.00%) today`}
        </Text>

        <View style={styles.portfolioWalletRow}>
          <View style={styles.walletPill}>
            <View style={styles.walletPillDot} />
            <Text style={styles.walletPillText}>{walletLabel}: {shortAddr}</Text>
          </View>
          <TouchableOpacity style={styles.copyBtn} onPress={handleCopyAddress} activeOpacity={0.7}>
            <Copy size={14} color={copiedAddr ? '#10b981' : 'rgba(255,255,255,0.5)'} strokeWidth={2} />
          </TouchableOpacity>
        </View>

        {/* Mini chart decoration */}
        <View style={styles.miniChartDecor}>
          {[10, 18, 12, 22, 16, 28, 20, 35, 28, 42, 34, 50, 42, 58, 48, 65].map((h, i) => (
            <View key={i} style={[styles.miniChartBar, { height: h, left: i * 10, opacity: 0.15 + (h / 65) * 0.6 }]} />
          ))}
        </View>
      </LinearGradient>

      {/* ── 2. ACTION BUTTONS ── */}
      <View style={styles.actionsRow}>
        {[
          { label: 'Receive', icon: ArrowDownToLine, route: '/receive' },
          { label: 'Send', icon: ArrowUpFromLine, route: '/send' },
          { label: 'Buy', icon: Plus, route: '/buy' },
          { label: 'Swap', icon: RefreshCw, route: '/swap' },
        ].map(({ label, icon: Icon, route }) => (
          <TouchableOpacity
            key={label}
            style={styles.actionBtn}
            onPress={() => router.push(route as any)}
            activeOpacity={0.8}
          >
            <View style={styles.actionBtnIcon}>
              <Icon size={22} color={colors.primary} strokeWidth={2.5} />
            </View>
            <Text style={styles.actionBtnLabel}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── 3. QUICK ACCESS ── */}
      <View style={styles.quickAccessRow}>
        <TouchableOpacity
          style={styles.quickBtn}
          onPress={() => router.push('/launchpad/creator-dashboard' as any)}
          activeOpacity={0.85}
        >
          <LinearGradient colors={['rgba(139,92,246,0.2)', 'rgba(109,40,217,0.08)']} style={StyleSheet.absoluteFill} />
          <Rocket size={16} color={colors.primary} strokeWidth={2} />
          <View style={styles.quickBtnText}>
            <Text style={styles.quickBtnTitle}>Creator Dashboard</Text>
            <Text style={styles.quickBtnSub}>Manage your launches</Text>
          </View>
          <ChevronRight size={14} color={colors.textMuted} strokeWidth={2} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.quickBtn}
          onPress={() => handleTabChange('portfolio')}
          activeOpacity={0.85}
        >
          <LinearGradient colors={['rgba(139,92,246,0.2)', 'rgba(109,40,217,0.08)']} style={StyleSheet.absoluteFill} />
          <BarChart2 size={16} color={colors.primary} strokeWidth={2} />
          <View style={styles.quickBtnText}>
            <Text style={styles.quickBtnTitle}>Portfolio Tracker</Text>
            <Text style={styles.quickBtnSub}>Track any wallet</Text>
          </View>
          <ChevronRight size={14} color={colors.textMuted} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      {/* ── 4. TABS ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsWrap}
        contentContainerStyle={styles.tabsContent}
      >
        {([
          { key: 'assets', label: 'My Assets' },
          { key: 'market', label: 'Discover' },
          { key: 'watchlist', label: 'Watchlist' },
          { key: 'portfolio', label: 'Portfolio' },
          { key: 'activity', label: 'Activity' },
        ] as { key: TabKey; label: string }[]).map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            style={[styles.tabItem, activeTab === key && styles.tabItemActive]}
            onPress={() => handleTabChange(key)}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabItemText, activeTab === key && styles.tabItemTextActive]}>{label}</Text>
            {activeTab === key && <View style={styles.tabUnderline} />}
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── 5. SEARCH BAR (not shown for portfolio/activity) ── */}
      {activeTab !== 'portfolio' && activeTab !== 'activity' && <View style={styles.searchRow}>
        <View style={styles.searchBar}>
          <Search size={17} color={colors.textMuted} strokeWidth={2} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search tokens..."
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        <TouchableOpacity
          style={[styles.filterBtn, filterSort !== 'default' && styles.filterBtnActive]}
          onPress={() => setFilterModalVisible(true)}
          activeOpacity={0.7}
        >
          <SlidersHorizontal size={18} color={filterSort !== 'default' ? colors.primary : colors.textMuted} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      }

      {/* ── 6. PORTFOLIO TRACKER TAB ── */}
      {activeTab === 'portfolio' && (
        <PortfolioTracker
          currentUserAddress={activeAddress || undefined}
          initialAddress={portfolioInitialAddr}
          savedWallets={savedTrackedWallets}
          onSavedWalletsChange={setSavedTrackedWallets}
        />
      )}

      {/* ── 7. ACTIVITY TAB ── */}
      {activeTab === 'activity' && (
        <View style={{ paddingTop: spacing.lg }}>
          {activeAddress ? (
            <WalletActivity walletAddress={activeAddress} />
          ) : (
            <View style={styles.inlineEmpty}>
              <Text style={styles.inlineEmptyText}>Connect a wallet to see activity</Text>
            </View>
          )}
        </View>
      )}

      {/* ── 5. MY ASSETS / DISCOVER / WATCHLIST CONTENT ── */}
      {activeTab === 'assets' && (
        <>
          {/* My Assets card */}
          <View style={styles.assetsSectionCard}>
            <View style={styles.assetsSectionHeader}>
              <View>
                <Text style={styles.assetsSectionTitle}>My Assets</Text>
                <Text style={styles.assetsSectionSub}>
                  {filteredAssets.length} tokens • {formatBalance(totalBalance)}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.manageBtn}
                onPress={() => setManageAssetsModalVisible(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.manageBtnText}>Manage</Text>
              </TouchableOpacity>
            </View>

            {assetsLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />
            ) : assetsError && filteredAssets.length === 0 ? (
              <View style={styles.inlineEmpty}>
                <Text style={styles.inlineEmptyText}>Could not load assets</Text>
                <Text style={styles.inlineEmptySub}>{assetsError}</Text>
                <TouchableOpacity style={styles.retryBtn} onPress={loadWalletAssets} activeOpacity={0.8}>
                  <Text style={styles.retryBtnText}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : !hasWallet ? (
              <View style={styles.inlineEmpty}>
                <Text style={styles.inlineEmptyText}>Connect a wallet to see your assets</Text>
                <TouchableOpacity style={styles.retryBtn} onPress={() => router.push('/onboarding' as any)} activeOpacity={0.8}>
                  <Text style={styles.retryBtnText}>Connect Wallet</Text>
                </TouchableOpacity>
              </View>
            ) : filteredAssets.length === 0 ? (
              <View style={styles.inlineEmpty}>
                <Text style={styles.inlineEmptyText}>No assets found</Text>
                <Text style={styles.inlineEmptySub}>Buy tokens to get started</Text>
              </View>
            ) : (
              filteredAssets.slice(0, 5).map((asset, idx) => (
                <TouchableOpacity
                  key={asset.address}
                  style={[styles.assetRow, idx < Math.min(filteredAssets.length, 5) - 1 && styles.assetRowBorder]}
                  onPress={() => router.push(`/token-detail/${asset.address}` as any)}
                  activeOpacity={0.8}
                >
                  {asset.logoUrl ? (
                    <Image
                      source={{ uri: asset.logoUrl }}
                      style={styles.assetLogo}
                      defaultSource={require('../../assets/images/icon.png')}
                    />
                  ) : (
                    <View style={[styles.assetLogoPlaceholder, { backgroundColor: colors.primary + '33' }]}>
                      <Text style={styles.assetLogoText}>{(asset.symbol ?? '??').substring(0, 2).toUpperCase()}</Text>
                    </View>
                  )}
                  <View style={styles.assetInfo}>
                    <View style={styles.assetNameRow}>
                      <Text style={styles.assetName} numberOfLines={1}>{asset.name}</Text>
                      {asset.verified && <BadgeCheck size={13} color={colors.success} strokeWidth={2.5} />}
                    </View>
                    <Text style={styles.assetSymbol}>{asset.symbol?.toUpperCase()}</Text>
                  </View>
                  <View style={styles.assetMid}>
                    <Text style={styles.assetBalance2}>
                      {balanceHidden ? '****' : formatTokenAmount(asset.uiBalance)}
                    </Text>
                    <Text style={styles.assetBalanceUsd}>
                      {balanceHidden ? '****' : asset.price > 0 ? `$${asset.value.toFixed(2)}` : 'No price data'}
                    </Text>
                  </View>
                  <View style={styles.assetRight}>
                    <Text style={styles.assetValueText}>{asset.price > 0 ? `$${asset.price < 0.01 ? asset.price.toFixed(6) : asset.price.toFixed(2)}` : '—'}</Text>
                    <Text style={[styles.assetChangeText, { color: asset.priceChange24h >= 0 ? colors.success : colors.error }]}>
                      {asset.priceChange24h >= 0 ? '+' : ''}{asset.priceChange24h.toFixed(2)}%
                    </Text>
                  </View>
                </TouchableOpacity>
              ))
            )}

            {/* View all */}
            <TouchableOpacity
              style={styles.viewAllBtn}
              activeOpacity={0.8}
              onPress={() => setAllAssetsModalVisible(true)}
            >
              <Text style={styles.viewAllText}>
                View all assets{filteredAssets.length > 5 ? ` (${filteredAssets.length})` : ''}
              </Text>
              <ChevronRight size={16} color={colors.primary} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>

          {/* NFTs section */}
          <View style={styles.nftSectionCard}>
            <View style={styles.nftSectionHeader}>
              <Text style={styles.nftSectionTitle}>NFTs</Text>
              <TouchableOpacity onPress={() => router.push('/nft-gallery' as any)}>
                <Text style={styles.nftViewAll}>View all</Text>
              </TouchableOpacity>
            </View>

            {nftsLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
            ) : nfts.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: spacing.sm }}>
                {nfts.map(nft => (
                  <TouchableOpacity
                    key={nft.id}
                    style={styles.nftThumb}
                    onPress={() => router.push('/nft-gallery' as any)}
                  >
                    {nft.image_url ? (
                      <Image source={{ uri: nft.image_url }} style={styles.nftThumbImg} />
                    ) : (
                      <View style={[styles.nftThumbImg, { backgroundColor: colors.surfaceLight }]} />
                    )}
                    <Text style={styles.nftThumbName} numberOfLines={1}>{nft.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : !nftsLoading && activeAddress ? (
              <View style={styles.nftEmpty}>
                <View style={styles.nftEmptyIcon}>
                  <ImageIcon size={22} color={colors.primary} strokeWidth={1.5} />
                </View>
                <View>
                  <Text style={styles.nftEmptyTitle}>No NFTs found</Text>
                  <Text style={styles.nftEmptySubtitle}>Your NFTs will appear here</Text>
                </View>
              </View>
            ) : null}
          </View>
        </>
      )}

      {/* Discover tab */}
      {activeTab === 'market' && (
        <>
          {/* Category chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll} contentContainerStyle={styles.categoryContent}>
            {CATEGORIES.map(({ key, label, icon: Icon }) => (
              <TouchableOpacity
                key={key}
                style={[styles.categoryChip, category === key && styles.categoryChipActive]}
                onPress={() => setCategory(key)}
                activeOpacity={0.7}
              >
                <Icon size={14} color={category === key ? colors.white : colors.textMuted} strokeWidth={2.5} />
                <Text style={[styles.categoryText, category === key && styles.categoryTextActive]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Pending new tokens pill — shown when user is scrolled down */}
          {category === 'new' && pendingNewTokens.length > 0 && (
            <TouchableOpacity
              style={styles.newTokensPill}
              onPress={handleApplyPendingNewTokens}
              activeOpacity={0.85}
            >
              <Sparkles size={13} color="#000" strokeWidth={2.5} />
              <Text style={styles.newTokensPillText}>
                +{pendingNewTokens.length} new token{pendingNewTokens.length !== 1 ? 's' : ''}
              </Text>
            </TouchableOpacity>
          )}

          {loading ? (
            <View style={styles.loaderContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : (
            <View style={styles.assetsSectionCard}>
              {filteredTokens.map((token, idx) => (
                <DiscoverTokenRow
                  key={token.address}
                  token={token}
                  isLast={idx === filteredTokens.length - 1}
                  onPress={() => router.push(`/token-detail/${token.address}` as any)}
                />
              ))}
              {filteredTokens.length === 0 && (
                <View style={styles.inlineEmpty}>
                  <Text style={styles.inlineEmptyText}>{error || 'No tokens found'}</Text>
                </View>
              )}
            </View>
          )}
        </>
      )}

      {/* Watchlist tab */}
      {activeTab === 'watchlist' && (
        <View style={styles.assetsSectionCard}>
          {watchlist.length === 0 ? (
            <View style={styles.inlineEmpty}>
              <Star size={32} color={colors.textMuted} strokeWidth={1.5} />
              <Text style={styles.inlineEmptyText}>No tokens in watchlist</Text>
              <Text style={styles.inlineEmptySub}>Star tokens from token details to track them here</Text>
            </View>
          ) : (
            watchlist.map((item, idx) => (
              <WatchlistTokenRow
                key={item.id}
                item={item}
                baseData={watchlistEnriched.get(item.token_address)}
                isLast={idx === watchlist.length - 1}
                onPress={() => router.push(`/token-detail/${item.token_address}` as any)}
                onRemove={async () => {
                  if (profile?.id) await watchlistService.removeFromWatchlist(item.token_address, profile.id);
                  await loadWatchlist();
                }}
              />
            ))
          )}
        </View>
      )}

      <View style={{ height: 100 }} />
    </ScrollView>

    {/* All Assets Modal */}
    <Modal
      visible={allAssetsModalVisible}
      animationType="slide"
      transparent={false}
      onRequestClose={() => setAllAssetsModalVisible(false)}
    >
      <View style={styles.fullModalRoot}>
        <View style={styles.fullModalHeader}>
          <Text style={styles.fullModalTitle}>All Assets</Text>
          <TouchableOpacity style={styles.fullModalClose} onPress={() => setAllAssetsModalVisible(false)}>
            <X size={20} color={colors.textPrimary} strokeWidth={2.5} />
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.fullModalScroll} showsVerticalScrollIndicator={false}>
          {walletAssets.filter(a => !hiddenAssets.has(a.address)).map((asset, idx, arr) => (
            <TouchableOpacity
              key={asset.address}
              style={[styles.allAssetRow, idx < arr.length - 1 && styles.assetRowBorder]}
              onPress={() => { setAllAssetsModalVisible(false); router.push(`/token-detail/${asset.address}` as any); }}
              activeOpacity={0.8}
            >
              {asset.logoUrl ? (
                <Image source={{ uri: asset.logoUrl }} style={styles.assetLogo} />
              ) : (
                <View style={[styles.assetLogoPlaceholder, { backgroundColor: colors.primary + '33' }]}>
                  <Text style={styles.assetLogoText}>{(asset.symbol ?? '??').substring(0, 2).toUpperCase()}</Text>
                </View>
              )}
              <View style={styles.assetInfo}>
                <View style={styles.assetNameRow}>
                  <Text style={styles.assetName} numberOfLines={1}>{asset.name}</Text>
                  {asset.verified && <BadgeCheck size={13} color={colors.success} strokeWidth={2.5} />}
                </View>
                <Text style={styles.assetSymbol}>{asset.symbol?.toUpperCase()}</Text>
              </View>
              <View style={styles.assetMid}>
                <Text style={styles.assetBalance2}>
                  {balanceHidden ? '****' : asset.uiBalance.toLocaleString(undefined, { maximumFractionDigits: asset.isNative ? 4 : 2 })}
                </Text>
                <Text style={styles.assetBalanceUsd}>
                  {asset.price > 0 ? (balanceHidden ? '****' : `$${asset.value.toFixed(2)}`) : '—'}
                </Text>
              </View>
              <View style={styles.assetRight}>
                <Text style={styles.assetValueText}>{asset.price > 0 ? `$${asset.price < 0.01 ? asset.price.toFixed(6) : asset.price.toFixed(2)}` : '—'}</Text>
                <Text style={[styles.assetChangeText, { color: asset.priceChange24h >= 0 ? colors.success : colors.error }]}>
                  {asset.priceChange24h >= 0 ? '+' : ''}{asset.priceChange24h.toFixed(2)}%
                </Text>
              </View>
            </TouchableOpacity>
          ))}
          {walletAssets.length === 0 && (
            <View style={styles.inlineEmpty}>
              <Text style={styles.inlineEmptyText}>No assets found</Text>
            </View>
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </Modal>

    {/* Manage Assets Modal */}
    <Modal
      visible={manageAssetsModalVisible}
      animationType="slide"
      transparent={false}
      onRequestClose={() => setManageAssetsModalVisible(false)}
    >
      <View style={styles.fullModalRoot}>
        <View style={styles.fullModalHeader}>
          <View>
            <Text style={styles.fullModalTitle}>Manage Assets</Text>
            <Text style={styles.fullModalSub}>Toggle tokens to show or hide them</Text>
          </View>
          <TouchableOpacity style={styles.fullModalClose} onPress={() => setManageAssetsModalVisible(false)}>
            <X size={20} color={colors.textPrimary} strokeWidth={2.5} />
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.fullModalScroll} showsVerticalScrollIndicator={false}>
          {walletAssets.map((asset, idx) => {
            const isVisible = !hiddenAssets.has(asset.address);
            return (
              <View
                key={asset.address}
                style={[styles.manageRow, idx < walletAssets.length - 1 && styles.assetRowBorder]}
              >
                {asset.logoUrl ? (
                  <Image source={{ uri: asset.logoUrl }} style={styles.manageLogo} />
                ) : (
                  <View style={[styles.manageLogoPlaceholder, { backgroundColor: colors.primary + '33' }]}>
                    <Text style={styles.assetLogoText}>{(asset.symbol ?? '??').substring(0, 2).toUpperCase()}</Text>
                  </View>
                )}
                <View style={styles.assetInfo}>
                  <View style={styles.assetNameRow}>
                    <Text style={[styles.assetName, !isVisible && styles.assetNameHidden]} numberOfLines={1}>{asset.name}</Text>
                    {asset.verified && <BadgeCheck size={13} color={colors.success} strokeWidth={2.5} />}
                  </View>
                  <Text style={styles.assetSymbol}>{asset.symbol?.toUpperCase()}</Text>
                </View>
                <View style={styles.manageRight}>
                  <Text style={[styles.manageBal, !isVisible && { color: colors.textMuted }]}>
                    {asset.uiBalance.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                  </Text>
                  <Switch
                    value={isVisible}
                    onValueChange={(val) => {
                      setHiddenAssets(prev => {
                        const next = new Set(prev);
                        if (val) next.delete(asset.address);
                        else if (!asset.isNative) next.add(asset.address); // never hide native SOL
                        return next;
                      });
                    }}
                    trackColor={{ false: colors.surfaceBorder, true: colors.primaryMuted }}
                    thumbColor={isVisible ? colors.primary : colors.textMuted}
                    disabled={asset.isNative}
                  />
                </View>
              </View>
            );
          })}
          {walletAssets.length === 0 && (
            <View style={styles.inlineEmpty}>
              <Text style={styles.inlineEmptyText}>No assets to manage</Text>
            </View>
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingTop: 45,
    paddingBottom: spacing.sm,
    position: 'relative',
    backgroundColor: '#07070A',
    overflow: 'hidden',
  },
  neonBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#07070A',
  },
  purpleGlow: {
    position: 'absolute',
    top: -100,
    left: -50,
    width: 300,
    height: 300,
    backgroundColor: '#9945FF',
    opacity: 0.28,
    borderRadius: 150,
    ...elevation.glow,
  },
  cyanGlow: {
    position: 'absolute',
    top: -80,
    right: -60,
    width: 250,
    height: 250,
    backgroundColor: '#14F195',
    opacity: 0.18,
    borderRadius: 125,
    ...elevation.glow,
  },
  headerContent: {
    paddingHorizontal: spacing.xxl,
    position: 'relative',
    zIndex: 1,
  },
  balanceSection: {
    marginBottom: spacing.sm,
  },
  balanceTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  balanceLabel: {
    fontSize: fontSize.xs,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  eyeButton: {
    padding: spacing.xs,
  },
  balance: {
    fontSize: 36,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -1,
    marginBottom: 4,
    textShadowColor: 'rgba(153, 69, 255, 0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  accountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    alignSelf: 'flex-start',
  },
  accountDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  connectedDot: {
    backgroundColor: colors.primary,
  },
  accountText: {
    fontSize: fontSize.xs,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '600',
  },
  actionsGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionCard: {
    flex: 1,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  actionGradient: {
    padding: spacing.sm,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(153, 69, 255, 0.3)',
    borderRadius: borderRadius.lg,
    backgroundColor: 'rgba(153, 69, 255, 0.08)',
  },
  actionIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(153, 69, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionLabel: {
    fontSize: 10,
    color: colors.white,
    fontWeight: '700',
  },
  mainContent: {
    flex: 1,
    backgroundColor: colors.background,
  },
  stickyHeaderContainer: {
    backgroundColor: colors.background,
    zIndex: 100,
    elevation: 5,
  },
  contentArea: {
    flex: 1,
  },
  tabBarWrapper: {
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
    backgroundColor: colors.background,
    zIndex: 10,
  },
  tabBar: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    position: 'relative',
  },
  tabActive: {
    backgroundColor: colors.surfaceElevated,
  },
  tabText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.primary,
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 4,
    left: '25%',
    right: '25%',
    height: 3,
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  searchSection: {
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
    zIndex: 9,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.textPrimary,
    paddingVertical: spacing.xs,
    fontWeight: '500',
  },
  categoryScroll: {
    maxHeight: 42,
    backgroundColor: colors.background,
    paddingBottom: 4,
    marginBottom: 4,
  },
  categoryContent: {
    paddingHorizontal: spacing.xxl,
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.surfaceBorder,
  },
  categoryChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    ...elevation.sm,
  },
  categoryText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textMuted,
  },
  categoryTextActive: {
    color: colors.white,
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 64,
    gap: spacing.lg,
  },
  loadingText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.sm,
    paddingBottom: 100,
  },
  emptyListContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.xxl,
  },
  tokenCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  assetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  tokenLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: spacing.md,
    marginRight: spacing.md,
  },
  tokenLogo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceLight,
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
    fontSize: fontSize.md,
    fontWeight: '800',
    color: colors.primary,
  },
  tokenInfo: {
    flex: 1,
  },
  tokenNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: 2,
  },
  tokenName: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
    flex: 1,
  },
  tokenMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 2,
  },
  tokenSymbol: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '600',
  },
  metaDot: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  tokenLiquidity: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '500',
  },
  tokenMarketCap: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  tokenVolume: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '500',
  },
  newBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: 'rgba(153, 69, 255, 0.15)',
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: 'rgba(153, 69, 255, 0.3)',
  },
  newBadgeText: {
    fontSize: 9,
    color: colors.primary,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  verifiedBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.warningMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ageBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: 'rgba(20, 241, 149, 0.15)',
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: 'rgba(20, 241, 149, 0.3)',
  },
  ageText: {
    fontSize: 9,
    color: '#14F195',
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  nativeBadge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    backgroundColor: colors.primaryMuted,
    borderRadius: borderRadius.sm,
  },
  nativeBadgeText: {
    fontSize: 9,
    color: colors.primary,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  tokenRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  tokenPrice: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  priceChangeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
  },
  changeBadgePositive: {
    backgroundColor: colors.successMuted,
  },
  changeBadgeNegative: {
    backgroundColor: colors.errorMuted,
  },
  priceChangeText: {
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
  changeTextPositive: {
    color: colors.success,
  },
  changeTextNegative: {
    color: colors.error,
  },
  assetBalance: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '600',
    marginTop: 2,
  },
  assetValue: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  assetPrice: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
    gap: spacing.md,
  },
  emptyText: {
    fontSize: fontSize.lg,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  emptySubtext: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: '500',
    textAlign: 'center',
    paddingHorizontal: spacing.xxxl,
  },
  retryButton: {
    marginTop: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
  },
  retryButtonText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.white,
  },
  starButton: {
    padding: spacing.sm,
    marginLeft: spacing.sm,
  },
  chartWrapper: {
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  assetSubTabBar: {
    flexDirection: 'row',
    marginHorizontal: spacing.xxl,
    marginTop: spacing.sm,
    marginBottom: 4,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: 3,
    gap: 3,
  },
  assetSubTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  assetSubTabActive: {
    backgroundColor: colors.surfaceElevated,
  },
  assetSubTabText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textMuted,
  },
  assetSubTabTextActive: {
    color: colors.primary,
  },
  nftListContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: 100,
  },
  nftRow: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  nftCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    maxWidth: '50%',
  },
  nftImage: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: colors.surfaceLight,
  },
  nftInfo: {
    padding: spacing.sm,
  },
  nftName: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  nftRank: {
    fontSize: 10,
    color: colors.textMuted,
    fontWeight: '600',
    marginTop: 2,
  },

  // Portfolio card
  scrollContent: {
    paddingBottom: 100,
  },
  portfolioCard: {
    marginHorizontal: spacing.lg,
    marginTop: 52,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    overflow: 'hidden',
    position: 'relative',
    minHeight: 160,
  },
  glow1: {
    position: 'absolute',
    top: -40,
    left: -40,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: '#8B5CF6',
    opacity: 0.2,
  },
  glow2: {
    position: 'absolute',
    top: 20,
    right: -30,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#06b6d4',
    opacity: 0.12,
  },
  portfolioTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  portfolioLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  portfolioBalance: {
    fontSize: 38,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: -1,
    marginBottom: 2,
  },
  portfolioChange: {
    fontSize: fontSize.xs,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '500',
    marginBottom: spacing.md,
  },
  portfolioWalletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  walletPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: borderRadius.full,
  },
  walletPillDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#10b981',
  },
  walletPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
  },
  copyBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  miniChartDecor: {
    position: 'absolute',
    bottom: 10,
    right: 16,
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 65,
    gap: 2,
  },
  miniChartBar: {
    width: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },

  // Actions row
  actionsRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  actionBtn: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
  },
  actionBtnIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primaryMuted,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.25)',
  },
  actionBtnLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },

  // Tabs
  tabsWrap: {
    marginHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
    marginBottom: spacing.sm,
  },
  tabsContent: {
    flexDirection: 'row',
    gap: 0,
  },
  tabItem: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    position: 'relative',
  },
  tabItemActive: {},
  tabItemText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textMuted,
    whiteSpace: 'nowrap' as any,
  },
  tabItemTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  tabUnderline: {
    position: 'absolute',
    bottom: -1,
    left: '15%',
    right: '15%',
    height: 2,
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  quickAccessRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  quickBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.25)',
    overflow: 'hidden',
  },
  quickBtnText: { flex: 1 },
  quickBtnTitle: { fontSize: 12, fontWeight: '800', color: colors.textPrimary },
  quickBtnSub: { fontSize: 10, color: colors.textMuted, fontWeight: '500', marginTop: 1 },

  // Search row
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  filterBtn: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },

  // Assets section card
  assetsSectionCard: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    marginBottom: spacing.lg,
    overflow: 'hidden',
  },
  assetsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  assetsSectionTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  assetsSectionSub: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '500',
    marginTop: 2,
  },
  manageBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    backgroundColor: colors.primaryMuted,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.3)',
  },
  manageBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },

  // Asset rows
  assetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  assetRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  assetLogo: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  assetLogoPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  assetLogoText: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    color: colors.primary,
  },
  assetInfo: {
    flex: 1,
  },
  assetName: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  assetSymbol: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '500',
    marginTop: 1,
  },
  assetMid: {
    alignItems: 'flex-end',
  },
  assetBalance2: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  assetBalanceUsd: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '500',
    marginTop: 1,
  },
  assetRight: {
    alignItems: 'flex-end',
    minWidth: 70,
  },
  assetValueText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  assetChangeText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.textMuted,
    marginTop: 1,
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
  },
  viewAllText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.primary,
  },

  // NFT section
  nftSectionCard: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  nftSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  nftSectionTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  nftViewAll: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.primary,
  },
  nftEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  nftEmptyIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nftEmptyTitle: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  nftEmptySubtitle: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '500',
    marginTop: 2,
  },
  nftThumb: {
    width: 100,
    marginRight: spacing.sm,
  },
  nftThumbImg: {
    width: 100,
    height: 100,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceLight,
  },
  nftThumbName: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },

  // Inline empty states
  inlineEmpty: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  inlineEmptyText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
    textAlign: 'center',
  },
  inlineEmptySub: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
  starBtn: {
    padding: spacing.sm,
  },
  watchlistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
  },
  watchlistChange: {
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 2,
  },
  watchlistPriceCol: {
    alignItems: 'flex-end',
    minWidth: 72,
  },
  watchlistPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  watchlistMcap: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  retryBtn: {
    marginTop: spacing.xs,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primaryMuted,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.3)',
  },
  retryBtnText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.primary,
  },
  filterBtnActive: {
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primary,
    borderWidth: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  filterModal: {
    backgroundColor: '#12121A',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: spacing.lg,
    paddingBottom: 40,
    paddingHorizontal: spacing.lg,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  filterModalTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  filterOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  filterOptionActive: {
    borderBottomColor: 'rgba(139,92,246,0.15)',
  },
  filterOptionText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  filterOptionTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  filterOptionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },

  // Asset name row (with verified badge)
  assetNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  assetNameHidden: {
    color: colors.textMuted,
  },

  // Full-screen modals
  fullModalRoot: {
    flex: 1,
    backgroundColor: colors.background,
  },
  fullModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 52,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
    backgroundColor: colors.background,
  },
  fullModalTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  fullModalSub: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '500',
    marginTop: 2,
  },
  fullModalClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullModalScroll: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  allAssetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },

  // Manage modal
  manageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  manageLogo: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  manageLogoPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  manageRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  manageBal: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  newTokensPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    marginBottom: spacing.sm,
    shadowColor: colors.primary,
    shadowRadius: 8,
    shadowOpacity: 0.5,
    elevation: 4,
  },
  newTokensPillText: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    color: '#000',
  },
});
