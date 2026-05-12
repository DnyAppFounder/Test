import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Image,
  RefreshControl,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowLeft,
  Copy,
  Star,
  Droplet,
  ChartBar as BarChart3,
  DollarSign,
  CircleCheck as CheckCircle2,
  MessageSquare,
  Activity,
  ArrowUpDown,
  Users,
  Crown,
  Share2,
  TrendingUp,
  TrendingDown,
} from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { liveMarketService, LiveToken } from '@/services/liveMarketService';
import { tokenRegistryService } from '@/services/tokenRegistryService';
import { SolanaConnectionService } from '@/services/solana/connectionService';
import { colors, spacing, borderRadius, fontSize } from '@/constants/theme';
import { TradingViewChart, TokenInfo } from '@/components/TradingViewChart';
import { TradingInterface } from '@/components/TradingInterface';
import { TokenActivityFeed } from '@/components/TokenActivityFeed';
import { TokenDiscussionComponent } from '@/components/TokenDiscussion';
import { watchlistService } from '@/services/watchlistService';
import { useWallet } from '@/contexts/WalletContext';
import { useProfile } from '@/contexts/ProfileContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { TokenAboutCard } from '@/components/TokenAboutCard';

type BottomTab = 'chat' | 'activity' | 'transactions' | 'holders';

const BOTTOM_TABS: { key: BottomTab; label: string; icon: any }[] = [
  { key: 'chat', label: 'Chat', icon: MessageSquare },
  { key: 'activity', label: 'Activity', icon: Activity },
  { key: 'transactions', label: 'Trades', icon: ArrowUpDown },
  { key: 'holders', label: 'Holders', icon: Users },
];

function fmtTokenPrice(p: number): string {
  if (!p) return '0';
  if (p >= 10000) return p.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (p >= 1) return p.toFixed(4);
  if (p >= 0.001) return p.toFixed(6);
  if (p >= 0.000001) return p.toFixed(8);
  return p.toExponential(3);
}

export default function TokenDetailScreen() {
  const { address } = useLocalSearchParams<{ address: string }>();
  const router = useRouter();
  const { activeAddress, tokens } = useWallet();
  const { profile } = useProfile();
  const { height: screenHeight, width: screenWidth } = useWindowDimensions();

  const [token, setToken] = useState<LiveToken | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copiedAddr, setCopiedAddr] = useState(false);
  const [copiedPair, setCopiedPair] = useState(false);
  const [sharedToken, setSharedToken] = useState(false);
  const [isWatchlisted, setIsWatchlisted] = useState(false);
  const [checkingWatchlist, setCheckingWatchlist] = useState(true);
  const [activeBottomTab, setActiveBottomTab] = useState<BottomTab>('chat');
  const [holders, setHolders] = useState<{ address: string; amount: number; uiAmount: number }[]>([]);
  const [holdersLoading, setHoldersLoading] = useState(false);
  const [totalSupply, setTotalSupply] = useState<number>(0);

  // Silently refresh only price/volume numbers every 30s — no full token replace,
  // no loading state, no visual disruption.
  const priceRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!address) return;
    const refresh = async () => {
      try {
        const data = await liveMarketService.getTokenDetail(address);
        if (!data) return;
        setToken(prev => {
          if (!prev) return prev;
          if (prev.price === data.price && prev.priceChange24h === data.priceChange24h) return prev;
          return { ...prev, price: data.price, priceChange24h: data.priceChange24h, volume24h: data.volume24h, liquidity: data.liquidity };
        });
      } catch {}
    };
    priceRefreshRef.current = setInterval(refresh, 30_000);
    return () => { if (priceRefreshRef.current) clearInterval(priceRefreshRef.current); };
  }, [address]);

  useEffect(() => {
    if (address) {
      loadTokenDetail(address);
    }
  }, [address]);

  useEffect(() => {
    if (address && profile?.id) {
      checkWatchlistStatus();
    }
  }, [address, profile?.id]);

  useEffect(() => {
    if (activeBottomTab === 'holders' && holders.length === 0) {
      loadHolders();
    }
  }, [activeBottomTab]);

  const loadTokenDetail = async (addr: string) => {
    setLoading(true);
    try {
      // Primary: DexScreener live data
      let data = await liveMarketService.getTokenDetail(addr);

      if (!data) {
        // Fallback: resolve from global token registry (covers wallet-owned tokens
        // that may not have a DexScreener listing yet)
        const reg = await tokenRegistryService.getByMint(addr);
        if (reg) {
          data = {
            id: reg.mint,
            address: reg.mint,
            name: reg.name,
            symbol: reg.symbol,
            image: reg.logoUri,
            price: reg.priceUsd ?? 0,
            priceChange24h: reg.priceChange24h ?? 0,
            volume24h: reg.volume24h ?? 0,
            liquidity: reg.liquidityUsd ?? 0,
            marketCap: reg.marketCap,
            pairAddress: reg.pairAddress,
            chainId: 'solana',
          };
        }
      }

      setToken(data);
    } catch (e) {
      console.warn('[TokenDetail] loadTokenDetail error:', e);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    if (address) await loadTokenDetail(address);
    setRefreshing(false);
  };

  const copyAddress = async () => {
    if (token) {
      await Clipboard.setStringAsync(token.address);
      setCopiedAddr(true);
      setTimeout(() => setCopiedAddr(false), 2000);
    }
  };

  const copyPair = async () => {
    if (token?.pairAddress) {
      await Clipboard.setStringAsync(token.pairAddress);
      setCopiedPair(true);
      setTimeout(() => setCopiedPair(false), 2000);
    }
  };

  const shareToken = async () => {
    if (!token) return;
    const url = `https://solscan.io/token/${token.address}`;
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && (navigator as any).share) {
        await (navigator as any).share({ title: token.name ?? token.symbol, url });
      } else if (Platform.OS === 'web') {
        (window as any).open(url, '_blank');
      } else {
        await Clipboard.setStringAsync(url);
      }
      setSharedToken(true);
      setTimeout(() => setSharedToken(false), 2000);
    } catch {}
  };

  const checkWatchlistStatus = async () => {
    if (!address || !profile?.id) { setCheckingWatchlist(false); return; }
    try {
      setIsWatchlisted(await watchlistService.isInWatchlist(address, profile.id));
    } catch {}
    finally { setCheckingWatchlist(false); }
  };

  const toggleWatchlist = async () => {
    if (!token || !profile?.id) return;
    const wasWatchlisted = isWatchlisted;
    const success = await watchlistService.toggleWatchlist(token.address, token.symbol, token.name, profile.id).catch(() => false);
    if (success) {
      setIsWatchlisted(!wasWatchlisted);
    }
  };

  const loadHolders = async () => {
    if (!address) return;
    setHoldersLoading(true);
    try {
      const rpc = SolanaConnectionService.getInstance();
      const result = await rpc.rpcCall('getTokenLargestAccounts', [address, { commitment: 'confirmed' }]);
      const accounts: any[] = result?.value ?? [];
      // Also fetch supply for percentage calculation
      const supplyResult = await rpc.rpcCall('getTokenSupply', [address, { commitment: 'confirmed' }]).catch(() => null);
      const supply = supplyResult?.value?.uiAmount ?? 0;
      setTotalSupply(supply);
      setHolders(accounts.map((a: any) => ({
        address: a.address,
        amount: Number(a.amount),
        uiAmount: a.uiAmount ?? 0,
      })));
    } catch (e) {
      console.warn('[Holders] Failed to load holders:', e);
      setHolders([]);
    } finally {
      setHoldersLoading(false);
    }
  };

  const SOL_MINT = 'So11111111111111111111111111111111111111112';
  const solToken = tokens.find(t => t.contract_address === SOL_MINT);
  const thisToken = tokens.find(t => t.contract_address === address);
  const solBalance = solToken ? parseFloat(solToken.balance || '0') : 0;
  const tokenBalance = thisToken ? parseFloat(thisToken.balance || '0') : 0;

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading token...</Text>
        </View>
      </View>
    );
  }

  if (!token) {
    return (
      <View style={styles.container}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <ArrowLeft size={20} color={colors.textPrimary} strokeWidth={2} />
          </TouchableOpacity>
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Token not found</Text>
        </View>
      </View>
    );
  }

  const displayPrice = token.price;
  const shortAddr = token.address
    ? `${token.address.slice(0, 6)}...${token.address.slice(-4)}`
    : '';
  const isUp = (token.priceChange24h ?? 0) >= 0;
  const changeColor = isUp ? '#A78BFA' : '#EC4899';

  // Calculate available chart height based on screen size
  const isMobile = screenWidth < 768;
  // Reserve: topBar(56) + tokenInfo(96) + tradePanelApprox(198) + bottomSafeArea(34) + extra padding(40)
  const reservedHeight = 56 + 96 + 198 + 34 + 40;
  const dynamicChartH = isMobile
    ? Math.min(280, Math.max(200, screenHeight - reservedHeight))
    : 220;

  const tokenInfoForChart: TokenInfo = {
    name: token.name,
    symbol: token.symbol ?? '',
    image: token.image,
    price: displayPrice,
    priceChange24h: token.priceChange24h,
    marketCap: token.marketCap,
    pairAddress: token.pairAddress,
    address: token.address,
  };

  return (
    <View style={styles.container}>
      {/* Compact top bar: < SYMBOL on left | icons on right */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <ArrowLeft size={18} color={colors.textPrimary} strokeWidth={2.5} />
          <Text style={styles.topBarSymbol}>{(token.symbol ?? '').toUpperCase()}</Text>
        </TouchableOpacity>
        <View style={styles.topBarRight}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => setActiveBottomTab('chat')}
            activeOpacity={0.7}
          >
            <MessageSquare size={16} color={activeBottomTab === 'chat' ? '#A78BFA' : colors.textMuted} strokeWidth={2} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.iconBtn, sharedToken && styles.iconBtnActive]}
            onPress={shareToken}
            activeOpacity={0.7}
          >
            {sharedToken
              ? <CheckCircle2 size={16} color="#A78BFA" strokeWidth={2} />
              : <Share2 size={16} color={colors.textMuted} strokeWidth={2} />}
          </TouchableOpacity>
          {!checkingWatchlist && (
            <TouchableOpacity style={styles.iconBtn} onPress={toggleWatchlist} activeOpacity={0.7}>
              <Star
                size={16}
                color={isWatchlisted ? '#F59E0B' : colors.textMuted}
                fill={isWatchlisted ? '#F59E0B' : 'transparent'}
                strokeWidth={2}
              />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Compact token info row — logo | name + mint | price + change */}
      <View style={styles.tokenInfoRow}>
        {token.image ? (
          <Image source={{ uri: token.image }} style={styles.tokenInfoLogo} />
        ) : (
          <View style={styles.tokenInfoLogoFallback}>
            <Text style={styles.tokenInfoLogoText}>{(token.symbol ?? '??').slice(0, 2).toUpperCase()}</Text>
          </View>
        )}
        <View style={styles.tokenInfoMid}>
          <Text style={styles.tokenInfoName} numberOfLines={1}>{token.name}</Text>
          <TouchableOpacity style={styles.tokenInfoAddrRow} onPress={copyAddress} activeOpacity={0.7}>
            <Text style={styles.tokenInfoAddr}>{shortAddr}</Text>
            {copiedAddr
              ? <CheckCircle2 size={11} color="#A78BFA" strokeWidth={2} />
              : <Copy size={11} color="rgba(255,255,255,0.35)" strokeWidth={2} />}
          </TouchableOpacity>
        </View>
        <View style={styles.tokenInfoPriceCol}>
          <Text style={styles.tokenInfoPrice}>{fmtTokenPrice(displayPrice)}</Text>
          <View style={styles.tokenInfoChangeRow}>
            {isUp
              ? <TrendingUp size={11} color={changeColor} strokeWidth={2.5} />
              : <TrendingDown size={11} color={changeColor} strokeWidth={2.5} />}
            <Text style={[styles.tokenInfoChangePct, { color: changeColor }]}>
              {isUp ? '+' : ''}{(token.priceChange24h ?? 0).toFixed(2)}%
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* Chart — timeframe row is inside the chart component (hideTokenHeader hides logo/price only) */}
        <View style={styles.chartWrap}>
          <ErrorBoundary fallbackLabel="Chart unavailable">
            <TradingViewChart
              tokenInfo={tokenInfoForChart}
              tokenMint={token.address}
              hideTokenHeader={true}
              chartHeight={dynamicChartH}
            />
          </ErrorBoundary>
        </View>

        {/* Trading panel */}
        <View style={styles.tradingWrap}>
          <ErrorBoundary fallbackLabel="Trading unavailable">
            <TradingInterface
              tokenMint={token.address}
              tokenSymbol={token.symbol ?? ''}
              tokenDecimals={9}
              currentPrice={token.price}
              tokenLogoUrl={token.image}
              solBalance={solBalance}
              tokenBalance={tokenBalance}
              onTradeComplete={onRefresh}
            />
          </ErrorBoundary>
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <BarChart3 size={13} color={colors.primary} strokeWidth={2} />
            <Text style={styles.statLabel}>24H VOL</Text>
            <Text style={styles.statValue}>{liveMarketService.formatVolume(token.volume24h)}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCard}>
            <Droplet size={13} color={colors.primary} strokeWidth={2} />
            <Text style={styles.statLabel}>LIQUIDITY</Text>
            <Text style={styles.statValue}>{liveMarketService.formatMarketCap(token.liquidity)}</Text>
          </View>
          {token.marketCap != null && token.marketCap > 0 && (
            <>
              <View style={styles.statDivider} />
              <View style={styles.statCard}>
                <DollarSign size={13} color={colors.primary} strokeWidth={2} />
                <Text style={styles.statLabel}>MKT CAP</Text>
                <Text style={styles.statValue}>{liveMarketService.formatMarketCap(token.marketCap)}</Text>
              </View>
            </>
          )}
        </View>

        {/* About */}
        <TokenAboutCard token={token} mintAddress={token.address} />

        {/* Contract / DEX info */}
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Contract</Text>
            <TouchableOpacity style={styles.infoValueRow} onPress={copyAddress} activeOpacity={0.7}>
              <Text style={styles.infoValueMono} numberOfLines={1} ellipsizeMode="middle">
                {token.address}
              </Text>
              {copiedAddr
                ? <CheckCircle2 size={13} color={colors.success} strokeWidth={2} />
                : <Copy size={13} color={colors.textMuted} strokeWidth={2} />
              }
            </TouchableOpacity>
          </View>

          {token.dexId && (
            <View style={[styles.infoRow, styles.infoRowBorder]}>
              <Text style={styles.infoLabel}>DEX</Text>
              <Text style={styles.infoValue}>{token.dexId}</Text>
            </View>
          )}

          {token.pairAddress && (
            <View style={[styles.infoRow, styles.infoRowBorder]}>
              <Text style={styles.infoLabel}>Pair</Text>
              <TouchableOpacity style={styles.infoValueRow} onPress={copyPair} activeOpacity={0.7}>
                <Text style={styles.infoValueMono} numberOfLines={1} ellipsizeMode="middle">
                  {token.pairAddress}
                </Text>
                {copiedPair
                  ? <CheckCircle2 size={13} color={colors.success} strokeWidth={2} />
                  : <Copy size={13} color={colors.textMuted} strokeWidth={2} />
                }
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Bottom tab bar */}
        <View style={styles.bottomTabBar}>
          {BOTTOM_TABS.map(tab => {
            const Icon = tab.icon;
            const active = activeBottomTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={styles.bottomTab}
                onPress={() => setActiveBottomTab(tab.key)}
                activeOpacity={0.7}
              >
                <Icon size={15} color={active ? colors.primary : colors.textMuted} strokeWidth={2} />
                <Text style={[styles.bottomTabText, active && styles.bottomTabTextActive]}>
                  {tab.label}
                </Text>
                {active && <View style={styles.bottomTabUnderline} />}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Tab content */}
        <View style={styles.tabContent}>
          {activeBottomTab === 'chat' && (
            <TokenDiscussionComponent
              tokenAddress={token.address}
              userWallet={activeAddress || undefined}
            />
          )}
          {activeBottomTab === 'activity' && (
            <TokenActivityFeed
              tokenAddress={token.address}
              pairAddress={token.pairAddress}
              tokenPrice={token.price}
              tokenDecimals={9}
              tokenSymbol={token.symbol ?? ''}
              mode="activity"
            />
          )}
          {activeBottomTab === 'transactions' && (
            <TokenActivityFeed
              tokenAddress={token.address}
              pairAddress={token.pairAddress}
              tokenPrice={token.price}
              tokenDecimals={9}
              tokenSymbol={token.symbol ?? ''}
              mode="trades"
            />
          )}
          {activeBottomTab === 'holders' && (
            <View style={styles.holdersWrap}>
              <View style={styles.holdersHeader}>
                <Crown size={16} color={colors.primary} strokeWidth={2} />
                <Text style={styles.holdersTitle}>Top Holders</Text>
                <TouchableOpacity onPress={loadHolders} style={styles.holdersRefreshBtn} activeOpacity={0.7}>
                  <Text style={styles.holdersRefreshText}>Refresh</Text>
                </TouchableOpacity>
              </View>
              {holdersLoading ? (
                <View style={styles.holdersLoading}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={styles.holdersLoadingText}>Loading holders...</Text>
                </View>
              ) : holders.length === 0 ? (
                <View style={styles.comingSoon}>
                  <Users size={28} color={colors.textMuted} strokeWidth={1.5} />
                  <Text style={styles.comingSoonText}>No holder data available</Text>
                </View>
              ) : (
                holders.map((h, idx) => {
                  const pct = totalSupply > 0 ? (h.uiAmount / totalSupply) * 100 : 0;
                  const shortH = `${h.address.slice(0, 6)}...${h.address.slice(-4)}`;
                  const isTop3 = idx < 3;
                  return (
                    <View key={h.address} style={[styles.holderRow, idx < holders.length - 1 && styles.holderRowBorder]}>
                      <View style={[styles.holderRank, isTop3 && styles.holderRankTop]}>
                        <Text style={[styles.holderRankText, isTop3 && styles.holderRankTextTop]}>#{idx + 1}</Text>
                      </View>
                      <View style={styles.holderInfo}>
                        <Text style={styles.holderAddr}>{shortH}</Text>
                        <View style={styles.holderBar}>
                          <View style={[styles.holderBarFill, { width: `${Math.min(100, pct)}%` as any, backgroundColor: isTop3 ? colors.primary : colors.textMuted }]} />
                        </View>
                      </View>
                      <View style={styles.holderRight}>
                        <Text style={styles.holderAmount}>
                          {h.uiAmount >= 1e9 ? `${(h.uiAmount / 1e9).toFixed(2)}B`
                            : h.uiAmount >= 1e6 ? `${(h.uiAmount / 1e6).toFixed(2)}M`
                            : h.uiAmount >= 1e3 ? `${(h.uiAmount / 1e3).toFixed(1)}K`
                            : h.uiAmount.toFixed(2)}
                        </Text>
                        <Text style={[styles.holderPct, { color: isTop3 ? colors.primary : colors.textMuted }]}>
                          {pct > 0 ? `${pct.toFixed(2)}%` : '—'}
                        </Text>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          )}
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 52,
    paddingBottom: 8,
    backgroundColor: '#0A0A0F',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  topBarSymbol: {
    fontSize: 17,
    fontWeight: '700',
    color: '#A78BFA',
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(139,92,246,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.15)',
  },
  iconBtnActive: {
    backgroundColor: 'rgba(139,92,246,0.2)',
    borderColor: 'rgba(139,92,246,0.4)',
  },
  // Compact token info row
  tokenInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 10,
    gap: 12,
    backgroundColor: '#0A0A0F',
  },
  tokenInfoLogo: {
    width: 60,
    height: 60,
    borderRadius: 12,
    backgroundColor: '#12121A',
  },
  tokenInfoLogoFallback: {
    width: 60,
    height: 60,
    borderRadius: 12,
    backgroundColor: '#12121A',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.2)',
  },
  tokenInfoLogoText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#A78BFA',
  },
  tokenInfoMid: {
    flex: 1,
    gap: 4,
  },
  tokenInfoName: {
    fontSize: 17,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.3,
  },
  tokenInfoAddrRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  tokenInfoAddr: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    fontFamily: 'SpaceMono-Regular',
  },
  tokenInfoPriceCol: {
    alignItems: 'flex-end',
    gap: 4,
  },
  tokenInfoPrice: {
    fontSize: 22,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -0.5,
  },
  tokenInfoChangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  tokenInfoChangePct: {
    fontSize: 14,
    fontWeight: '700',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: '#0A0A0F',
  },
  loadingText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: fontSize.lg,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  // Token header
  tokenHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  tokenHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    flex: 1,
  },
  tokenLogo: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#12121A',
  },
  tokenLogoFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#12121A',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  tokenLogoFallbackText: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    color: colors.primary,
  },
  tokenTitleCol: {
    flex: 1,
    gap: 3,
  },
  tokenNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  tokenName: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.textPrimary,
    flexShrink: 1,
  },
  boostBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 5,
    paddingVertical: 2,
    backgroundColor: colors.warningMuted,
    borderRadius: 4,
  },
  boostText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.warning,
  },
  addrRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addrText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontFamily: 'SpaceMono-Regular',
  },
  tokenHeaderRight: {
    alignItems: 'flex-end',
    gap: 5,
    paddingTop: 2,
  },
  priceText: {
    fontSize: fontSize.xl,
    fontWeight: '900',
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  changePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  changePillUp: { backgroundColor: colors.successMuted },
  changePillDown: { backgroundColor: colors.errorMuted },
  changeText: { fontSize: fontSize.xs, fontWeight: '700' },
  changeUp: { color: colors.success },
  changeDown: { color: colors.error },
  chartWrap: {
    paddingHorizontal: 8,
    paddingTop: 0,
  },
  tradingWrap: {
    paddingHorizontal: 8,
    marginTop: 2,
    marginBottom: 4,
  },
  // Stats
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 8,
    marginBottom: spacing.sm,
    backgroundColor: '#12121A',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  statDivider: {
    width: 1,
    height: 36,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  // Info card
  infoCard: {
    marginHorizontal: 8,
    marginBottom: spacing.sm,
    backgroundColor: '#12121A',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  infoRowBorder: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  infoLabel: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.textMuted,
    minWidth: 64,
  },
  infoValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flex: 1,
    justifyContent: 'flex-end',
  },
  infoValueMono: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.textPrimary,
    fontFamily: 'SpaceMono-Regular',
    flex: 1,
    textAlign: 'right',
  },
  infoValue: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  // Bottom tabs
  bottomTabBar: {
    flexDirection: 'row',
    marginHorizontal: 8,
    borderRadius: borderRadius.md,
    backgroundColor: '#12121A',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: spacing.xs,
    overflow: 'hidden',
  },
  bottomTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: 3,
    position: 'relative',
  },
  bottomTabText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
  },
  bottomTabTextActive: {
    color: colors.primary,
  },
  bottomTabUnderline: {
    position: 'absolute',
    bottom: 0,
    left: '15%',
    right: '15%',
    height: 2,
    backgroundColor: colors.primary,
    borderRadius: 1,
  },
  // Tab content
  tabContent: {
    marginHorizontal: 8,
    backgroundColor: '#12121A',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
    minHeight: 200,
  },
  holdersWrap: {
    paddingBottom: spacing.md,
  },
  holdersHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  holdersTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
    flex: 1,
  },
  holdersRefreshBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    backgroundColor: colors.primaryMuted,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.3)',
  },
  holdersRefreshText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
  },
  holdersLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xxl,
  },
  holdersLoadingText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  holderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  holderRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  holderRank: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  holderRankTop: {
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.4)',
  },
  holderRankText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textMuted,
  },
  holderRankTextTop: {
    color: colors.primary,
  },
  holderInfo: {
    flex: 1,
    gap: 5,
  },
  holderAddr: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
    fontFamily: 'SpaceMono-Regular',
  },
  holderBar: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  holderBarFill: {
    height: 3,
    borderRadius: 2,
    opacity: 0.7,
  },
  holderRight: {
    alignItems: 'flex-end',
    gap: 2,
    flexShrink: 0,
  },
  holderAmount: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  holderPct: {
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  comingSoon: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: spacing.md,
  },
  comingSoonText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: '500',
  },
});
