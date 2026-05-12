import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Linking,
  Platform,
} from 'react-native';
import { ArrowUpRight, ArrowDownLeft, ArrowRightLeft, Droplets, ExternalLink } from 'lucide-react-native';
import { tokenActivityService, TokenTrade } from '@/services/tokenActivityService';
import { colors, spacing, fontSize, borderRadius } from '@/constants/theme';

interface TokenActivityFeedProps {
  tokenAddress: string;
  pairAddress?: string;
  tokenPrice?: number;
  tokenDecimals?: number;
  tokenSymbol?: string;
  mode?: 'activity' | 'trades';
}

function openSolscan(signature: string) {
  const url = `https://solscan.io/tx/${signature}`;
  if (Platform.OS === 'web') {
    // @ts-ignore
    window.open(url, '_blank', 'noopener,noreferrer');
  } else {
    Linking.openURL(url).catch(() => {});
  }
}

const TYPE_CONFIG = {
  buy: { label: 'BUY', color: colors.success, bg: 'rgba(20,241,149,0.08)', icon: ArrowUpRight, iconBg: colors.successMuted },
  sell: { label: 'SELL', color: colors.error, bg: 'rgba(255,77,79,0.08)', icon: ArrowDownLeft, iconBg: colors.errorMuted },
  transfer: { label: 'TRANSFER', color: colors.textMuted, bg: 'rgba(255,255,255,0.04)', icon: ArrowRightLeft, iconBg: 'rgba(255,255,255,0.08)' },
  liquidity: { label: 'LIQUIDITY', color: '#38BDF8', bg: 'rgba(56,189,248,0.08)', icon: Droplets, iconBg: 'rgba(56,189,248,0.12)' },
};

export function TokenActivityFeed({
  tokenAddress,
  pairAddress,
  tokenPrice = 0,
  tokenDecimals = 9,
  tokenSymbol = '',
  mode = 'activity',
}: TokenActivityFeedProps) {
  const [trades, setTrades] = useState<TokenTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadActivity = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await tokenActivityService.getTokenTrades(
        tokenAddress,
        pairAddress,
        tokenPrice,
        tokenDecimals,
      );
      setTrades(data);
    } catch (e) {
      console.warn('[TokenActivityFeed] load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tokenAddress, pairAddress, tokenPrice, tokenDecimals]);

  useEffect(() => {
    loadActivity();
    const interval = setInterval(() => loadActivity(true), 15_000);
    return () => clearInterval(interval);
  }, [loadActivity]);

  const onRefresh = () => {
    setRefreshing(true);
    tokenActivityService.invalidate(tokenAddress, pairAddress);
    loadActivity();
  };

  const filteredTrades = mode === 'trades'
    ? trades.filter(t => t.type === 'buy' || t.type === 'sell')
    : trades;

  const renderItem = ({ item }: { item: TokenTrade }) => {
    const cfg = TYPE_CONFIG[item.type] ?? TYPE_CONFIG.buy;
    const Icon = cfg.icon;
    const hasSig = !!item.txSignature;

    return (
      <View style={[styles.row, { backgroundColor: cfg.bg }]}>
        <View style={[styles.typeIcon, { backgroundColor: cfg.iconBg }]}>
          <Icon size={13} color={cfg.color} strokeWidth={2.5} />
        </View>

        <View style={styles.info}>
          <View style={styles.rowTop}>
            <Text style={[styles.typeLabel, { color: cfg.color }]}>{cfg.label}</Text>
            <Text style={styles.wallet}>{tokenActivityService.formatWalletAddress(item.walletAddress)}</Text>
          </View>
          <View style={styles.rowBottom}>
            <Text style={styles.usdAmount}>{tokenActivityService.formatUsd(item.amount)}</Text>
            <Text style={styles.dot}>·</Text>
            <Text style={styles.tokenAmt}>
              {tokenActivityService.formatTokenAmount(item.tokenAmount)}
              {tokenSymbol ? ` ${tokenSymbol}` : ''}
            </Text>
          </View>
        </View>

        <View style={styles.right}>
          <Text style={styles.time}>{tokenActivityService.formatTimeAgo(item.timestamp)}</Text>
          {hasSig && (
            <TouchableOpacity
              onPress={() => openSolscan(item.txSignature)}
              activeOpacity={0.7}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <ExternalLink size={11} color={colors.textMuted} strokeWidth={2} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={styles.loadingText}>Loading {mode === 'trades' ? 'trades' : 'activity'}...</Text>
      </View>
    );
  }

  const title = mode === 'trades' ? 'Recent Trades' : 'Live Activity';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={styles.liveDot} />
      </View>
      <FlatList
        data={filteredTrades}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
        scrollEnabled={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No recent {mode === 'trades' ? 'trades' : 'activity'}</Text>
          </View>
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      />
    </View>
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
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  headerTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xxl,
  },
  loadingText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
    marginTop: spacing.sm,
  },
  typeIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  typeLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  wallet: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '500',
    fontFamily: 'SpaceMono-Regular',
  },
  rowBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  usdAmount: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  dot: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  tokenAmt: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  right: {
    alignItems: 'flex-end',
    gap: 4,
    flexShrink: 0,
  },
  time: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '600',
  },
  empty: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
});
