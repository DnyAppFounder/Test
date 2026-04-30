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
  Linking,
  Animated,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, TrendingUp, TrendingDown, Copy, ExternalLink, Star, Zap, Droplet, ChartBar as BarChart3, DollarSign, RefreshCw } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { liveMarketService, LiveToken } from '@/services/liveMarketService';
import { colors, spacing, borderRadius, fontSize, elevation } from '@/constants/theme';
import { TradingViewChart } from '@/components/TradingViewChart';
import { TradingInterface } from '@/components/TradingInterface';
import { TransactionFeed } from '@/components/TransactionFeed';
import { TokenActivityFeed } from '@/components/TokenActivityFeed';
import { TokenDiscussionComponent } from '@/components/TokenDiscussion';
import { watchlistService } from '@/services/watchlistService';
import { useWallet } from '@/contexts/WalletContext';
import { usePriceUpdates } from '@/hooks/usePriceUpdates';

export default function TokenDetailScreen() {
  const { address } = useLocalSearchParams<{ address: string }>();
  const router = useRouter();
  const { selectedAccount, connectedWallet, activeAddress } = useWallet();

  const [token, setToken] = useState<LiveToken | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isWatchlisted, setIsWatchlisted] = useState(false);
  const [checkingWatchlist, setCheckingWatchlist] = useState(true);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);

  const pulseAnim = useRef(new Animated.Value(1)).current;

  const { price: livePrice, priceChange, isUpdating } = usePriceUpdates(
    async () => {
      if (!address) return null;
      try {
        const data = await liveMarketService.getTokenDetail(address);
        if (data) {
          setToken(data);
          return data.price;
        }
      } catch (error) {
        console.error('Error fetching live price:', error);
      }
      return null;
    },
    { interval: 15000, enabled: autoRefreshEnabled && !!address }
  );

  useEffect(() => {
    if (isUpdating) {
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.2,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
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
    } catch (error) {
      console.error('Error loading token detail:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    if (address) {
      await loadTokenDetail(address);
    }
    setRefreshing(false);
  };

  const copyAddress = async () => {
    if (token) {
      await Clipboard.setStringAsync(token.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const checkWatchlistStatus = async () => {
    if (!address) {
      setCheckingWatchlist(false);
      return;
    }

    try {
      const isInList = await watchlistService.isInWatchlist(address);
      setIsWatchlisted(isInList);
    } catch (error) {
      console.error('Error checking watchlist:', error);
    } finally {
      setCheckingWatchlist(false);
    }
  };

  const toggleWatchlist = async () => {
    if (!token) return;

    try {
      const success = await watchlistService.toggleWatchlist(
        token.address,
        token.symbol,
        token.name
      );

      if (success) {
        setIsWatchlisted(!isWatchlisted);
      }
    } catch (error) {
      console.error('Error toggling watchlist:', error);
    }
  };

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
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <ArrowLeft size={24} color={colors.textPrimary} strokeWidth={2} />
          </TouchableOpacity>
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Token not found</Text>
        </View>
      </LinearGradient>
    );
  }

  const changePositive = token.priceChange24h >= 0;

  return (
    <LinearGradient colors={colors.gradient.primary as any} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={24} color={colors.textPrimary} strokeWidth={2} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Token Details</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={() => setAutoRefreshEnabled(!autoRefreshEnabled)}
            activeOpacity={0.7}
          >
            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
              <RefreshCw
                size={20}
                color={autoRefreshEnabled ? colors.success : colors.textMuted}
                strokeWidth={2.5}
              />
            </Animated.View>
          </TouchableOpacity>
          {!checkingWatchlist && (
            <TouchableOpacity
              style={styles.watchlistButton}
              onPress={toggleWatchlist}
              activeOpacity={0.7}
            >
              <Star
                size={24}
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
        <View style={styles.content}>
          <View style={styles.tokenHeader}>
            {token.image ? (
              <Image source={{ uri: token.image }} style={styles.tokenLogo} />
            ) : (
              <View style={styles.tokenLogoPlaceholder}>
                <Text style={styles.tokenLogoText}>{(token.symbol ?? '??').substring(0, 2).toUpperCase()}</Text>
              </View>
            )}
            <View style={styles.tokenTitleSection}>
              <View style={styles.tokenNameRow}>
                <Text style={styles.tokenName}>{token.name}</Text>
                {token.boostCount && token.boostCount > 0 && (
                  <View style={styles.boostBadge}>
                    <Zap size={14} color={colors.warning} fill={colors.warning} />
                    <Text style={styles.boostText}>x{token.boostCount}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.tokenSymbol}>{(token.symbol ?? '').toUpperCase()}</Text>
            </View>
          </View>

          {/* Live Price */}
          <View style={styles.priceSection}>
            <Text style={styles.currentPrice}>
              {liveMarketService.formatPrice(livePrice || token.price)}
            </Text>
            <View style={[styles.priceChangeBadge, changePositive ? styles.changeBadgeUp : styles.changeBadgeDown]}>
              {changePositive
                ? <TrendingUp size={16} color={colors.success} strokeWidth={2.5} />
                : <TrendingDown size={16} color={colors.error} strokeWidth={2.5} />
              }
              <Text style={[styles.priceChangeText, changePositive ? styles.changeTextUp : styles.changeTextDown]}>
                {liveMarketService.formatChange(token.priceChange24h)}
              </Text>
            </View>
          </View>

          {/* Real Dexscreener Chart */}
          <TradingViewChart
            symbol={token.symbol}
            currentPrice={livePrice || token.price}
            pairAddress={token.pairAddress}
            tokenMint={token.address}
          />

          <TradingInterface
            tokenMint={token.address}
            tokenSymbol={token.symbol}
            tokenDecimals={9}
            currentPrice={token.price}
            onTradeComplete={onRefresh}
          />

          <View style={styles.activitySection}>
            <TokenActivityFeed tokenAddress={token.address} />
          </View>

          <View style={styles.discussionSection}>
            <TokenDiscussionComponent
              tokenAddress={token.address}
              userWallet={activeAddress || undefined}
            />
          </View>

          <TransactionFeed tokenMint={token.address} />

          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <View style={styles.statIcon}>
                <BarChart3 size={18} color={colors.primary} strokeWidth={2} />
              </View>
              <Text style={styles.statLabel}>24h Volume</Text>
              <Text style={styles.statValue}>{liveMarketService.formatVolume(token.volume24h)}</Text>
            </View>

            <View style={styles.statCard}>
              <View style={styles.statIcon}>
                <Droplet size={18} color={colors.primary} strokeWidth={2} />
              </View>
              <Text style={styles.statLabel}>Liquidity</Text>
              <Text style={styles.statValue}>{liveMarketService.formatMarketCap(token.liquidity)}</Text>
            </View>

            {token.marketCap && token.marketCap > 0 && (
              <View style={styles.statCard}>
                <View style={styles.statIcon}>
                  <DollarSign size={18} color={colors.primary} strokeWidth={2} />
                </View>
                <Text style={styles.statLabel}>Market Cap</Text>
                <Text style={styles.statValue}>{liveMarketService.formatMarketCap(token.marketCap)}</Text>
              </View>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Contract Address</Text>
            <TouchableOpacity style={styles.addressCard} onPress={copyAddress} activeOpacity={0.7}>
              <Text style={styles.addressText} numberOfLines={1} ellipsizeMode="middle">
                {token.address}
              </Text>
              <View style={styles.addressActions}>
                <Copy size={18} color={copied ? colors.success : colors.textMuted} strokeWidth={2} />
              </View>
            </TouchableOpacity>
          </View>

          {token.pairAddress && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>DEX Information</Text>
              <View style={styles.infoCard}>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>DEX</Text>
                  <Text style={styles.infoValue}>{token.dexId || 'Unknown'}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Pair Address</Text>
                  <Text style={styles.infoValue} numberOfLines={1}>
                    {token.pairAddress.slice(0, 8)}...{token.pairAddress.slice(-6)}
                  </Text>
                </View>
              </View>
            </View>
          )}

        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xxl,
    paddingTop: 60,
    paddingBottom: spacing.lg,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  refreshButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  watchlistButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
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
  content: {
    paddingHorizontal: spacing.xxl,
    paddingBottom: spacing.xxxl,
  },
  tokenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginBottom: spacing.xxl,
  },
  tokenLogo: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surface,
  },
  tokenLogoPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.surfaceBorder,
  },
  tokenLogoText: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.primary,
  },
  tokenTitleSection: {
    flex: 1,
  },
  tokenNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 4,
  },
  tokenName: {
    fontSize: fontSize.xxl,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  tokenSymbol: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textMuted,
  },
  boostBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    backgroundColor: colors.warningMuted,
    borderRadius: borderRadius.sm,
  },
  boostText: {
    fontSize: fontSize.xs,
    fontWeight: '800',
    color: colors.warning,
  },
  priceSection: {
    alignItems: 'center',
    marginBottom: spacing.xxxl,
  },
  currentPrice: {
    fontSize: 42,
    fontWeight: '900',
    color: colors.textPrimary,
    marginBottom: spacing.md,
    letterSpacing: -1,
  },
  priceChangeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  changeBadgeUp: {
    backgroundColor: colors.successMuted,
  },
  changeBadgeDown: {
    backgroundColor: colors.errorMuted,
  },
  priceChangeText: {
    fontSize: fontSize.lg,
    fontWeight: '800',
  },
  changeTextUp: {
    color: colors.success,
  },
  changeTextDown: {
    color: colors.error,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.xxxl,
  },
  statCard: {
    flex: 1,
    minWidth: '47%',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryMuted,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  statLabel: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  section: {
    marginBottom: spacing.xxl,
  },
  activitySection: {
    minHeight: 300,
    maxHeight: 400,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    overflow: 'hidden',
  },
  discussionSection: {
    minHeight: 400,
    maxHeight: 500,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    overflow: 'hidden',
  },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textMuted,
    marginBottom: spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  addressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  addressText: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
    fontFamily: 'SpaceMono-Regular',
    marginRight: spacing.md,
  },
  addressActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    gap: spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textMuted,
  },
  infoValue: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  actionSection: {
    marginTop: spacing.xl,
  },
  actionButtonPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.lg,
    ...elevation.md,
  },
  actionButtonTextPrimary: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.white,
  },
});
