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
  Animated,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, TrendingUp, TrendingDown, Copy, Star, Zap, Droplet, ChartBar as BarChart3, DollarSign, RefreshCw, CircleCheck as CheckCircle2 } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { liveMarketService, LiveToken } from '@/services/liveMarketService';
import { colors, spacing, borderRadius, fontSize, elevation } from '@/constants/theme';
import { TradingViewChart } from '@/components/TradingViewChart';
import { TradingInterface } from '@/components/TradingInterface';
import { TokenActivityFeed } from '@/components/TokenActivityFeed';
import { TokenDiscussionComponent } from '@/components/TokenDiscussion';
import { watchlistService } from '@/services/watchlistService';
import { useWallet } from '@/contexts/WalletContext';
import { usePriceUpdates } from '@/hooks/usePriceUpdates';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export default function TokenDetailScreen() {
  const { address } = useLocalSearchParams<{ address: string }>();
  const router = useRouter();
  const { activeAddress, tokens } = useWallet();

  const [token, setToken] = useState<LiveToken | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copiedAddr, setCopiedAddr] = useState(false);
  const [copiedPair, setCopiedPair] = useState(false);
  const [isWatchlisted, setIsWatchlisted] = useState(false);
  const [checkingWatchlist, setCheckingWatchlist] = useState(true);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);

  const pulseAnim = useRef(new Animated.Value(1)).current;

  const { price: livePrice, isUpdating } = usePriceUpdates(
    async () => {
      if (!address) return null;
      try {
        const data = await liveMarketService.getTokenDetail(address);
        if (data) {
          setToken(data);
          return data.price;
        }
      } catch {}
      return null;
    },
    { interval: 15000, enabled: autoRefreshEnabled && !!address }
  );

  useEffect(() => {
    if (isUpdating) {
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.2, duration: 200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [isUpdating]);

  useEffect(() => {
    if (address) {
      loadTokenDetail(address);
      checkWatchlistStatus();
    }
  }, [address]);

  const loadTokenDetail = async (addr: string) => {
    setLoading(true);
    try {
      const data = await liveMarketService.getTokenDetail(addr);
      setToken(data);
    } catch {}
    finally { setLoading(false); }
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

  const checkWatchlistStatus = async () => {
    if (!address) { setCheckingWatchlist(false); return; }
    try {
      setIsWatchlisted(await watchlistService.isInWatchlist(address));
    } catch {}
    finally { setCheckingWatchlist(false); }
  };

  const toggleWatchlist = async () => {
    if (!token) return;
    const success = await watchlistService.toggleWatchlist(token.address, token.symbol, token.name).catch(() => false);
    if (success) setIsWatchlisted(w => !w);
  };

  // Balances from wallet context
  const SOL_MINT = 'So11111111111111111111111111111111111111112';
  const solToken = tokens.find(t => t.contract_address === SOL_MINT);
  const thisToken = tokens.find(t => t.contract_address === address);
  const solBalance = solToken ? parseFloat(solToken.balance || '0') : 0;
  const tokenBalance = thisToken ? parseFloat(thisToken.balance || '0') : 0;

  if (loading) {
    return (
      <LinearGradient colors={colors.gradient.primary as any} style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading token...</Text>
        </View>
      </LinearGradient>
    );
  }

  if (!token) {
    return (
      <LinearGradient colors={colors.gradient.primary as any} style={styles.container}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <ArrowLeft size={20} color={colors.textPrimary} strokeWidth={2} />
          </TouchableOpacity>
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Token not found</Text>
        </View>
      </LinearGradient>
    );
  }

  const displayPrice = livePrice || token.price;
  const changePositive = token.priceChange24h >= 0;
  const shortAddr = token.address
    ? `${token.address.slice(0, 4)}...${token.address.slice(-4)}`
    : '';

  return (
    <LinearGradient colors={colors.gradient.primary as any} style={styles.container}>
      {/* Top bar: back + refresh + watchlist */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ArrowLeft size={20} color={colors.textPrimary} strokeWidth={2} />
        </TouchableOpacity>
        <View style={styles.topBarRight}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => setAutoRefreshEnabled(e => !e)}
            activeOpacity={0.7}
          >
            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
              <RefreshCw size={18} color={autoRefreshEnabled ? colors.success : colors.textMuted} strokeWidth={2.5} />
            </Animated.View>
          </TouchableOpacity>
          {!checkingWatchlist && (
            <TouchableOpacity style={styles.iconBtn} onPress={toggleWatchlist} activeOpacity={0.7}>
              <Star
                size={20}
                color={isWatchlisted ? colors.warning : colors.textMuted}
                fill={isWatchlisted ? colors.warning : 'transparent'}
                strokeWidth={2}
              />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* Token header card: logo + name/symbol | price + change */}
        <View style={styles.tokenHeaderCard}>
          <View style={styles.tokenHeaderLeft}>
            {token.image ? (
              <Image source={{ uri: token.image }} style={styles.tokenLogo} />
            ) : (
              <View style={styles.tokenLogoFallback}>
                <Text style={styles.tokenLogoFallbackText}>{(token.symbol ?? '??').substring(0, 2).toUpperCase()}</Text>
              </View>
            )}
            <View style={styles.tokenTitleCol}>
              <View style={styles.tokenNameRow}>
                <Text style={styles.tokenName} numberOfLines={1}>{token.name}</Text>
                {token.boostCount != null && token.boostCount > 0 && (
                  <View style={styles.boostBadge}>
                    <Zap size={11} color={colors.warning} fill={colors.warning} />
                    <Text style={styles.boostText}>x{token.boostCount}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.tokenSymbol}>{(token.symbol ?? '').toUpperCase()}</Text>
              <TouchableOpacity style={styles.addrRow} onPress={copyAddress} activeOpacity={0.7}>
                <Text style={styles.addrText}>{shortAddr}</Text>
                {copiedAddr
                  ? <CheckCircle2 size={12} color={colors.success} strokeWidth={2} />
                  : <Copy size={12} color={colors.textMuted} strokeWidth={2} />
                }
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.tokenHeaderRight}>
            <Text style={styles.priceText}>{liveMarketService.formatPrice(displayPrice)}</Text>
            <View style={[styles.changePill, changePositive ? styles.changePillUp : styles.changePillDown]}>
              {changePositive
                ? <TrendingUp size={12} color={colors.success} strokeWidth={2.5} />
                : <TrendingDown size={12} color={colors.error} strokeWidth={2.5} />
              }
              <Text style={[styles.changeText, changePositive ? styles.changeUp : styles.changeDown]}>
                {liveMarketService.formatChange(token.priceChange24h)}
              </Text>
            </View>
          </View>
        </View>

        {/* Chart */}
        <View style={styles.chartSection}>
          <ErrorBoundary fallbackLabel="Chart unavailable">
            <TradingViewChart
              symbol={token.symbol ?? ''}
              currentPrice={displayPrice}
              pairAddress={token.pairAddress}
              tokenMint={token.address}
            />
          </ErrorBoundary>
        </View>

        {/* Trading panel */}
        <View style={styles.tradingSection}>
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
            <View style={styles.statIconWrap}>
              <BarChart3 size={14} color={colors.primary} strokeWidth={2} />
            </View>
            <Text style={styles.statLabel}>24H VOLUME</Text>
            <Text style={styles.statValue}>{liveMarketService.formatVolume(token.volume24h)}</Text>
          </View>
          <View style={styles.statCard}>
            <View style={styles.statIconWrap}>
              <Droplet size={14} color={colors.primary} strokeWidth={2} />
            </View>
            <Text style={styles.statLabel}>LIQUIDITY</Text>
            <Text style={styles.statValue}>{liveMarketService.formatMarketCap(token.liquidity)}</Text>
          </View>
          {token.marketCap != null && token.marketCap > 0 && (
            <View style={styles.statCard}>
              <View style={styles.statIconWrap}>
                <DollarSign size={14} color={colors.primary} strokeWidth={2} />
              </View>
              <Text style={styles.statLabel}>MARKET CAP</Text>
              <Text style={styles.statValue}>{liveMarketService.formatMarketCap(token.marketCap)}</Text>
            </View>
          )}
        </View>

        {/* Contract / DEX info */}
        <View style={styles.infoSection}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Contract Address</Text>
            <TouchableOpacity style={styles.infoValueRow} onPress={copyAddress} activeOpacity={0.7}>
              <Text style={styles.infoValueMono} numberOfLines={1} ellipsizeMode="middle">
                {token.address}
              </Text>
              {copiedAddr
                ? <CheckCircle2 size={14} color={colors.success} strokeWidth={2} />
                : <Copy size={14} color={colors.textMuted} strokeWidth={2} />
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
              <Text style={styles.infoLabel}>Pair Address</Text>
              <TouchableOpacity style={styles.infoValueRow} onPress={copyPair} activeOpacity={0.7}>
                <Text style={styles.infoValueMono} numberOfLines={1} ellipsizeMode="middle">
                  {token.pairAddress}
                </Text>
                {copiedPair
                  ? <CheckCircle2 size={14} color={colors.success} strokeWidth={2} />
                  : <Copy size={14} color={colors.textMuted} strokeWidth={2} />
                }
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Activity & Discussion */}
        <View style={styles.feedSection}>
          <TokenActivityFeed tokenAddress={token.address} />
        </View>

        <View style={styles.feedSection}>
          <TokenDiscussionComponent
            tokenAddress={token.address}
            userWallet={activeAddress || undefined}
          />
        </View>

        <View style={styles.bottomPad} />
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: 56,
    paddingBottom: spacing.md,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.lg,
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
  // Token header card
  tokenHeaderCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  tokenHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    flex: 1,
  },
  tokenLogo: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface,
  },
  tokenLogoFallback: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  tokenLogoFallbackText: {
    fontSize: fontSize.md,
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
  tokenSymbol: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textMuted,
  },
  addrRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  addrText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontFamily: 'SpaceMono-Regular',
    fontWeight: '600',
  },
  boostBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: colors.warningMuted,
    borderRadius: 4,
  },
  boostText: {
    fontSize: fontSize.xs,
    fontWeight: '800',
    color: colors.warning,
  },
  tokenHeaderRight: {
    alignItems: 'flex-end',
    gap: 6,
    paddingTop: 4,
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
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  changePillUp: {
    backgroundColor: colors.successMuted,
  },
  changePillDown: {
    backgroundColor: colors.errorMuted,
  },
  changeText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  changeUp: {
    color: colors.success,
  },
  changeDown: {
    color: colors.error,
  },
  // Chart
  chartSection: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  // Trading
  tradingSection: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  // Stats row
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    gap: 4,
  },
  statIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primaryMuted,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
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
  // Contract info
  infoSection: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    overflow: 'hidden',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
  },
  infoRowBorder: {
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
  },
  infoLabel: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.textMuted,
    flexShrink: 0,
    minWidth: 80,
  },
  infoValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
  // Feeds
  feedSection: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    overflow: 'hidden',
    minHeight: 200,
    maxHeight: 400,
  },
  bottomPad: {
    height: spacing.xxxl,
  },
});
