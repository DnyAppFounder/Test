import { useState, useEffect, useCallback } from 'react';
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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Plus,
  Eye,
  EyeOff,
  TrendingUp,
  TrendingDown,
  Search,
  Flame,
  Star,
  ArrowUp,
  Sparkles,
  Zap,
  Coins,
  RefreshCw,
  Image as ImageIcon,
} from 'lucide-react-native';
import { useWallet } from '@/contexts/WalletContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { liveMarketService, LiveToken, MarketCategory } from '@/services/liveMarketService';
import { walletAssetLoader, WalletAsset } from '@/services/walletAssetLoader';
import { watchlistService, WatchlistToken } from '@/services/watchlistService';
import { PortfolioHistoryService } from '@/services/portfolioHistoryService';
import { PortfolioChart } from '@/components/PortfolioChart';
import { NFTService, NFT } from '@/services/nftService';
import { colors, spacing, borderRadius, fontSize, elevation } from '@/constants/theme';

type TabKey = 'market' | 'assets' | 'watchlist';
type CategoryKey = 'all' | 'trending' | 'new' | 'verified' | 'top_volume' | 'gainers';
type AssetSubTab = 'tokens' | 'nfts';

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
  const { activeAddress, activeWallet } = useWallet();
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
  const [error, setError] = useState<string | null>(null);
  const [assetSubTab, setAssetSubTab] = useState<AssetSubTab>('tokens');
  const [assetsError, setAssetsError] = useState<string | null>(null);
  const [nfts, setNfts] = useState<NFT[]>([]);
  const [nftsLoading, setNftsLoading] = useState(false);

  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab);
    setSearchQuery('');
    if (tab === 'market') {
      setCategory('all');
    }
  };

  const loadMarketData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const tokens = await liveMarketService.getTokensByCategory(category as MarketCategory);
      if (tokens.length === 0) {
        setError('Unable to load tokens. Please check your internet connection.');
      } else {
        setLiveTokens(tokens);
      }
    } catch (err: any) {
      console.error('Error loading market data:', err);
      setError(err.message || 'Failed to load tokens');
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

    setAssetsLoading(true);
    setAssetsError(null);
    try {
      console.log('[MyAssets] Loading wallet assets for:', activeAddress);
      const result = await walletAssetLoader.loadWalletAssets('solana', activeAddress);
      console.log('[MyAssets] Assets loaded:', result.assets.length, '| Total value:', result.totalValue, '| Error:', result.error || 'none');

      if (result.error) {
        setAssetsError(result.error);
      }

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
    try {
      const data = await watchlistService.getWatchlist();
      setWatchlist(data);
    } catch (error) {
      console.error('Error loading watchlist:', error);
      setWatchlist([]);
    }
  }, []);

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

  useEffect(() => {
    loadWalletAssets();
  }, [loadWalletAssets]);

  useEffect(() => {
    loadWatchlist();
  }, [loadWatchlist]);

  useEffect(() => {
    if (activeTab === 'assets' && assetSubTab === 'nfts') {
      loadNFTs();
    }
  }, [activeTab, assetSubTab, loadNFTs]);

  const onRefresh = async () => {
    setRefreshing(true);
    const jobs: Promise<any>[] = [loadMarketData(), loadWalletAssets(), loadWatchlist()];
    if (assetSubTab === 'nfts') jobs.push(loadNFTs());
    await Promise.all(jobs);
    setRefreshing(false);
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

  const filteredTokens = searchQuery && searchQuery.length >= 2
    ? searchResults
    : liveTokens;

  const filteredAssets = walletAssets.filter((asset) => {
    if (asset.uiBalance <= 0) return false;
    if (!searchQuery) return true;
    return asset.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
           asset.symbol.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {/* Neon background layers */}
        <View style={styles.neonBackground}>
          <View style={styles.purpleGlow} />
          <View style={styles.cyanGlow} />
        </View>

        <View style={styles.headerContent}>
          <View style={styles.balanceSection}>
            <View style={styles.balanceTop}>
              <Text style={styles.balanceLabel}>Portfolio Value</Text>
              <TouchableOpacity
                onPress={() => setBalanceHidden(!balanceHidden)}
                style={styles.eyeButton}
              >
                {balanceHidden ? (
                  <EyeOff size={20} color="rgba(255,255,255,0.6)" />
                ) : (
                  <Eye size={20} color="rgba(255,255,255,0.6)" />
                )}
              </TouchableOpacity>
            </View>
            <Text style={styles.balance}>{formatBalance(totalBalance)}</Text>
            {activeWallet && (
              <View style={styles.accountBadge}>
                <View style={[styles.accountDot, activeWallet.type === 'connected' ? styles.connectedDot : undefined]} />
                <Text style={styles.accountText}>
                  {activeWallet.type === 'connected'
                    ? `${activeWallet.name}: ${activeWallet.address.slice(0, 4)}...${activeWallet.address.slice(-4)}`
                    : `${(activeWallet.blockchain ?? 'SOL').toUpperCase()}: ${activeWallet.address.slice(0, 4)}...${activeWallet.address.slice(-4)}`
                  }
                </Text>
              </View>
            )}
          </View>

          <View style={styles.actionsGrid}>
            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => router.push('/receive')}
              activeOpacity={0.7}
            >
              <LinearGradient
                colors={['rgba(139, 92, 246, 0.2)', 'rgba(139, 92, 246, 0.05)']}
                style={styles.actionGradient}
              >
                <View style={styles.actionIconWrapper}>
                  <ArrowDownToLine size={20} color={colors.primary} strokeWidth={2.5} />
                </View>
                <Text style={styles.actionLabel}>Receive</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => router.push('/send')}
              activeOpacity={0.7}
            >
              <LinearGradient
                colors={['rgba(139, 92, 246, 0.2)', 'rgba(139, 92, 246, 0.05)']}
                style={styles.actionGradient}
              >
                <View style={styles.actionIconWrapper}>
                  <ArrowUpFromLine size={20} color={colors.primary} strokeWidth={2.5} />
                </View>
                <Text style={styles.actionLabel}>Send</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => router.push('/buy' as any)}
              activeOpacity={0.7}
            >
              <LinearGradient
                colors={['rgba(139, 92, 246, 0.2)', 'rgba(139, 92, 246, 0.05)']}
                style={styles.actionGradient}
              >
                <View style={styles.actionIconWrapper}>
                  <Plus size={20} color={colors.primary} strokeWidth={2.5} />
                </View>
                <Text style={styles.actionLabel}>Buy</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => router.push('/swap')}
              activeOpacity={0.7}
            >
              <LinearGradient
                colors={['rgba(139, 92, 246, 0.2)', 'rgba(139, 92, 246, 0.05)']}
                style={styles.actionGradient}
              >
                <View style={styles.actionIconWrapper}>
                  <RefreshCw size={20} color={colors.primary} strokeWidth={2.5} />
                </View>
                <Text style={styles.actionLabel}>Swap</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.mainContent}>
        <View style={styles.stickyHeaderContainer}>
          <View style={styles.tabBarWrapper}>
            <View style={styles.tabBar}>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'assets' && styles.tabActive]}
                onPress={() => handleTabChange('assets')}
                activeOpacity={0.7}
              >
                <Text style={[styles.tabText, activeTab === 'assets' && styles.tabTextActive]}>
                  My Assets
                </Text>
                {activeTab === 'assets' && <View style={styles.tabIndicator} />}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'market' && styles.tabActive]}
                onPress={() => handleTabChange('market')}
                activeOpacity={0.7}
              >
                <Text style={[styles.tabText, activeTab === 'market' && styles.tabTextActive]}>
                  Discover
                </Text>
                {activeTab === 'market' && <View style={styles.tabIndicator} />}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'watchlist' && styles.tabActive]}
                onPress={() => handleTabChange('watchlist')}
                activeOpacity={0.7}
              >
                <Text style={[styles.tabText, activeTab === 'watchlist' && styles.tabTextActive]}>
                  Watchlist
                </Text>
                {activeTab === 'watchlist' && <View style={styles.tabIndicator} />}
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.searchSection}>
            <View style={styles.searchBar}>
              <Search size={18} color={colors.textMuted} strokeWidth={2} />
              <TextInput
                style={styles.searchInput}
                placeholder={activeTab === 'market' ? 'Search tokens...' : 'Search...'}
                placeholderTextColor={colors.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>

          {activeTab === 'market' && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.categoryScroll}
              contentContainerStyle={styles.categoryContent}
            >
              {CATEGORIES.map(({ key, label, icon: Icon }) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.categoryChip, category === key && styles.categoryChipActive]}
                  onPress={() => setCategory(key)}
                  activeOpacity={0.7}
                >
                  <Icon
                    size={16}
                    color={category === key ? colors.white : colors.textMuted}
                    strokeWidth={2.5}
                  />
                  <Text style={[styles.categoryText, category === key && styles.categoryTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {activeTab === 'assets' && activeAddress && totalBalance > 0 && assetSubTab === 'tokens' && (
            <View style={styles.chartWrapper}>
              <PortfolioChart walletAddress={activeAddress} currentValue={totalBalance} />
            </View>
          )}

          {activeTab === 'assets' && (
            <View style={styles.assetSubTabBar}>
              <TouchableOpacity
                style={[styles.assetSubTab, assetSubTab === 'tokens' && styles.assetSubTabActive]}
                onPress={() => setAssetSubTab('tokens')}
              >
                <Coins size={14} color={assetSubTab === 'tokens' ? colors.primary : colors.textMuted} />
                <Text style={[styles.assetSubTabText, assetSubTab === 'tokens' && styles.assetSubTabTextActive]}>
                  Tokens
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.assetSubTab, assetSubTab === 'nfts' && styles.assetSubTabActive]}
                onPress={() => { setAssetSubTab('nfts'); loadNFTs(); }}
              >
                <ImageIcon size={14} color={assetSubTab === 'nfts' ? colors.primary : colors.textMuted} />
                <Text style={[styles.assetSubTabText, assetSubTab === 'nfts' && styles.assetSubTabTextActive]}>
                  NFTs {nfts.length > 0 ? `(${nfts.length})` : ''}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.contentArea}>
          {activeTab === 'market' ? (
            loading ? (
              <View style={styles.loaderContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.loadingText}>Loading tokens...</Text>
              </View>
            ) : (
              <FlatList
                data={filteredTokens}
                keyExtractor={(item) => item.address}
              renderItem={({ item: token }) => {
                const changePositive = token.priceChange24h >= 0;
                const tokenAge = liveMarketService.formatTokenAge(token.pairCreatedAt);
                const showAsNew = tokenAge && (tokenAge.endsWith('s') || tokenAge.endsWith('m') || (tokenAge.endsWith('h') && parseInt(tokenAge) < 24));

                return (
                  <TouchableOpacity
                    style={styles.tokenCard}
                    onPress={() => router.push(`/token-detail/${token.address}` as any)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.tokenLeft}>
                      {token.image ? (
                        <Image source={{ uri: token.image }} style={styles.tokenLogo} />
                      ) : (
                        <View style={styles.tokenLogoPlaceholder}>
                          <Text style={styles.tokenLogoText}>{(token.symbol ?? '??').substring(0, 2).toUpperCase()}</Text>
                        </View>
                      )}
                      <View style={styles.tokenInfo}>
                        <View style={styles.tokenNameRow}>
                          <Text style={styles.tokenName} numberOfLines={1}>{token.name}</Text>
                          {showAsNew && (
                            <View style={styles.newBadge}>
                              <Sparkles size={9} color={colors.primary} fill={colors.primary} />
                              <Text style={styles.newBadgeText}>{tokenAge}</Text>
                            </View>
                          )}
                          {token.boostCount && token.boostCount > 0 && (
                            <View style={styles.verifiedBadge}>
                              <Zap size={10} color={colors.warning} fill={colors.warning} />
                            </View>
                          )}
                        </View>
                        <View style={styles.tokenMetaRow}>
                          <Text style={styles.tokenSymbol}>{(token.symbol ?? '').toUpperCase()}</Text>
                          {token.marketCap && token.marketCap > 0 ? (
                            <>
                              <Text style={styles.metaDot}>•</Text>
                              <Text style={styles.tokenMarketCap}>
                                {liveMarketService.formatMarketCap(token.marketCap)} MC
                              </Text>
                            </>
                          ) : token.liquidity > 0 && (
                            <>
                              <Text style={styles.metaDot}>•</Text>
                              <Text style={styles.tokenLiquidity}>
                                {liveMarketService.formatMarketCap(token.liquidity)} liq
                              </Text>
                            </>
                          )}
                          {token.volume24h > 0 && (
                            <>
                              <Text style={styles.metaDot}>•</Text>
                              <Text style={styles.tokenVolume}>
                                {liveMarketService.formatVolume(token.volume24h)} vol
                              </Text>
                            </>
                          )}
                        </View>
                      </View>
                    </View>

                    <View style={styles.tokenRight}>
                      <Text style={styles.tokenPrice}>{liveMarketService.formatPrice(token.price)}</Text>
                      {token.priceChange24h !== 0 && (
                        <View style={[styles.priceChangeBadge, changePositive ? styles.changeBadgePositive : styles.changeBadgeNegative]}>
                          {changePositive ? (
                            <TrendingUp size={11} color={colors.success} strokeWidth={2.5} />
                          ) : (
                            <TrendingDown size={11} color={colors.error} strokeWidth={2.5} />
                          )}
                          <Text style={[styles.priceChangeText, changePositive ? styles.changeTextPositive : styles.changeTextNegative]}>
                            {liveMarketService.formatChange(token.priceChange24h)}
                          </Text>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Coins size={48} color={colors.textMuted} strokeWidth={1.5} />
                  <Text style={styles.emptyText}>
                    {error || 'No tokens found'}
                  </Text>
                  <Text style={styles.emptySubtext}>
                    {error ? 'Pull down to retry' : 'Try adjusting your search or filters'}
                  </Text>
                  {error && (
                    <TouchableOpacity
                      style={styles.retryButton}
                      onPress={loadMarketData}
                      activeOpacity={0.7}
                    >
                      <RefreshCw size={16} color={colors.white} />
                      <Text style={styles.retryButtonText}>Retry</Text>
                    </TouchableOpacity>
                  )}
                </View>
              }
              contentContainerStyle={filteredTokens.length === 0 ? styles.emptyListContent : styles.listContent}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
              }
            />
            )
          ) : activeTab === 'assets' ? (
            assetSubTab === 'tokens' ? (
              assetsLoading ? (
                <View style={styles.loaderContainer}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={styles.loadingText}>Loading wallet assets...</Text>
                </View>
              ) : (
                <FlatList
                  data={filteredAssets}
                  keyExtractor={(item) => item.address}
                  renderItem={({ item: asset }) => (
                    <TouchableOpacity
                      style={styles.assetCard}
                      onPress={() => router.push(`/token-detail/${asset.address}` as any)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.tokenLeft}>
                        {asset.logoUrl ? (
                          <Image source={{ uri: asset.logoUrl }} style={styles.tokenLogo} />
                        ) : (
                          <View style={styles.tokenLogoPlaceholder}>
                            <Text style={styles.tokenLogoText}>{(asset.symbol ?? '??').substring(0, 2).toUpperCase()}</Text>
                          </View>
                        )}
                        <View style={styles.tokenInfo}>
                          <View style={styles.tokenNameRow}>
                            <Text style={styles.tokenName} numberOfLines={1}>{asset.name}</Text>
                            {asset.isNative && (
                              <View style={styles.nativeBadge}>
                                <Text style={styles.nativeBadgeText}>Native</Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.assetBalance}>
                            {balanceHidden ? '****' : `${asset.uiBalance.toFixed(asset.isNative ? 4 : 2)} ${asset.symbol}`}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.tokenRight}>
                        <Text style={styles.assetValue}>
                          {balanceHidden ? '****' : `$${asset.value.toFixed(2)}`}
                        </Text>
                        {asset.price > 0 && (
                          <Text style={styles.assetPrice}>
                            {liveMarketService.formatPrice(asset.price)}
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  )}
                  ListEmptyComponent={
                    <View style={styles.emptyState}>
                      <Coins size={48} color={colors.textMuted} strokeWidth={1.5} />
                      <Text style={styles.emptyText}>
                        {!activeAddress
                          ? 'No wallet connected'
                          : assetsError
                            ? 'Failed to load assets'
                            : 'No tokens found'}
                      </Text>
                      <Text style={styles.emptySubtext}>
                        {!activeAddress
                          ? 'Import or create a wallet to get started'
                          : assetsError
                            ? assetsError
                            : 'Tokens you own will appear here once detected on-chain'}
                      </Text>
                      {activeAddress && (
                        <TouchableOpacity style={styles.retryButton} onPress={loadWalletAssets} activeOpacity={0.7}>
                          <RefreshCw size={16} color={colors.white} />
                          <Text style={styles.retryButtonText}>Retry</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  }
                  contentContainerStyle={filteredAssets.length === 0 ? styles.emptyListContent : styles.listContent}
                  showsVerticalScrollIndicator={false}
                  refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
                />
              )
            ) : (
              /* NFT sub-tab */
              nftsLoading ? (
                <View style={styles.loaderContainer}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={styles.loadingText}>Loading NFTs...</Text>
                </View>
              ) : (
                <FlatList
                  data={nfts}
                  keyExtractor={(item) => item.id}
                  numColumns={2}
                  renderItem={({ item: nft }) => (
                    <TouchableOpacity
                      style={styles.nftCard}
                      onPress={() => router.push('/nft-gallery' as any)}
                      activeOpacity={0.85}
                    >
                      {nft.image_url ? (
                        <Image
                          source={{ uri: nft.image_url }}
                          style={styles.nftImage}
                        />
                      ) : (
                        <View style={[styles.nftImage, { backgroundColor: colors.surfaceLight, justifyContent: 'center', alignItems: 'center' }]}>
                          <Text style={{ color: colors.textMuted, fontSize: 12 }}>No Image</Text>
                        </View>
                      )}
                      <View style={styles.nftInfo}>
                        <Text style={styles.nftName} numberOfLines={1}>{nft.name || 'Unknown NFT'}</Text>
                        {nft.rarity_rank != null && (
                          <Text style={styles.nftRank}>#{nft.rarity_rank}</Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  )}
                  ListEmptyComponent={
                    <View style={styles.emptyState}>
                      <ImageIcon size={48} color={colors.textMuted} strokeWidth={1.5} />
                      <Text style={styles.emptyText}>
                        {activeAddress ? 'No NFTs found' : 'No wallet connected'}
                      </Text>
                      <Text style={styles.emptySubtext}>
                        {activeAddress
                          ? 'NFTs owned by this wallet will appear here'
                          : 'Import or create a wallet to get started'}
                      </Text>
                      {activeAddress && (
                        <TouchableOpacity style={styles.retryButton} onPress={loadNFTs} activeOpacity={0.7}>
                          <RefreshCw size={16} color={colors.white} />
                          <Text style={styles.retryButtonText}>Refresh</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  }
                  contentContainerStyle={nfts.length === 0 ? styles.emptyListContent : styles.nftListContent}
                  columnWrapperStyle={nfts.length > 0 ? styles.nftRow : undefined}
                  showsVerticalScrollIndicator={false}
                  refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
                />
              )
            )
          ) : (
            <FlatList
            data={watchlist}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              return (
                <TouchableOpacity
                  style={styles.tokenCard}
                  onPress={() => router.push(`/token-detail/${item.token_address}` as any)}
                  activeOpacity={0.8}
                >
                  <View style={styles.tokenLeft}>
                    <View style={styles.tokenLogoPlaceholder}>
                      <Text style={styles.tokenLogoText}>{item.token_symbol?.substring(0, 2).toUpperCase()}</Text>
                    </View>
                    <View style={styles.tokenInfo}>
                      <Text style={styles.tokenName} numberOfLines={1}>{item.token_name}</Text>
                      <Text style={styles.tokenSymbol}>{item.token_symbol?.toUpperCase()}</Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={styles.starButton}
                    onPress={async (e) => {
                      e.stopPropagation();
                      await watchlistService.removeFromWatchlist(item.token_address);
                      await loadWatchlist();
                    }}
                  >
                    <Star size={22} color={colors.warning} fill={colors.warning} strokeWidth={2} />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Star size={48} color={colors.textMuted} strokeWidth={1.5} />
                <Text style={styles.emptyText}>
                  No tokens in watchlist
                </Text>
                <Text style={styles.emptySubtext}>
                  Star tokens from token details to track them here
                </Text>
              </View>
            }
            contentContainerStyle={watchlist.length === 0 ? styles.emptyListContent : styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
            }
          />
          )}
        </View>
      </View>
    </View>
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
});
