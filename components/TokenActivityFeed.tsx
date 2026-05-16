import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Linking,
  Platform,
  ScrollView,
} from 'react-native';
import {
  ArrowUpRight,
  ArrowDownLeft,
  ArrowRightLeft,
  Droplets,
  Flame,
  Zap,
  ExternalLink,
  RefreshCw,
} from 'lucide-react-native';
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

const TYPE_CONFIG: Record<TokenTrade['type'], {
  label: string;
  color: string;
  bg: string;
  iconBg: string;
  Icon: any;
}> = {
  buy: {
    label: 'BUY',
    color: '#14F195',
    bg: 'rgba(20,241,149,0.06)',
    iconBg: 'rgba(20,241,149,0.12)',
    Icon: ArrowUpRight,
  },
  sell: {
    label: 'SELL',
    color: '#FF4D4F',
    bg: 'rgba(255,77,79,0.06)',
    iconBg: 'rgba(255,77,79,0.12)',
    Icon: ArrowDownLeft,
  },
  transfer: {
    label: 'TRANSFER',
    color: 'rgba(255,255,255,0.55)',
    bg: 'rgba(255,255,255,0.03)',
    iconBg: 'rgba(255,255,255,0.08)',
    Icon: ArrowRightLeft,
  },
  liquidity: {
    label: 'LIQUIDITY',
    color: '#38BDF8',
    bg: 'rgba(56,189,248,0.06)',
    iconBg: 'rgba(56,189,248,0.12)',
    Icon: Droplets,
  },
  mint: {
    label: 'MINT',
    color: '#A78BFA',
    bg: 'rgba(167,139,250,0.06)',
    iconBg: 'rgba(167,139,250,0.12)',
    Icon: Zap,
  },
  burn: {
    label: 'BURN',
    color: '#F97316',
    bg: 'rgba(249,115,22,0.06)',
    iconBg: 'rgba(249,115,22,0.12)',
    Icon: Flame,
  },
};

const PROTOCOL_COLORS: Record<string, string> = {
  'Pump.fun': '#22c55e',
  'PumpSwap': '#16a34a',
  'Raydium': '#7c3aed',
  'Meteora': '#0ea5e9',
  'Jupiter': '#f59e0b',
  'Orca': '#14b8a6',
};

function ProtocolBadge({ name }: { name: string }) {
  if (!name) return null;
  const color = PROTOCOL_COLORS[name] ?? 'rgba(255,255,255,0.4)';
  return (
    <View style={[protoBadgeStyles.badge, { borderColor: color + '50', backgroundColor: color + '18' }]}>
      <Text style={[protoBadgeStyles.text, { color }]}>{name}</Text>
    </View>
  );
}

const protoBadgeStyles = StyleSheet.create({
  badge: {
    borderRadius: 4,
    borderWidth: 1,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  text: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});

function ActivityRow({ item, tokenSymbol }: { item: TokenTrade; tokenSymbol: string }) {
  const cfg = TYPE_CONFIG[item.type] ?? TYPE_CONFIG.buy;
  const { Icon } = cfg;
  const hasSig = !!item.txSignature;
  const solStr = tokenActivityService.formatSol(item.solAmount);

  return (
    <View style={[rowStyles.row, { backgroundColor: cfg.bg }]}>
      {/* Type icon */}
      <View style={[rowStyles.typeIcon, { backgroundColor: cfg.iconBg }]}>
        <Icon size={13} color={cfg.color} strokeWidth={2.5} />
      </View>

      {/* Center info */}
      <View style={rowStyles.info}>
        <View style={rowStyles.rowTop}>
          <Text style={[rowStyles.typeLabel, { color: cfg.color }]}>{cfg.label}</Text>
          {item.isProtocol ? (
            <ProtocolBadge name={item.walletLabel.split(' ')[0]} />
          ) : (
            <Text style={rowStyles.wallet} numberOfLines={1}>{item.walletLabel}</Text>
          )}
          {item.protocolSource && !item.isProtocol && (
            <ProtocolBadge name={item.protocolSource} />
          )}
        </View>
        <View style={rowStyles.rowBottom}>
          {item.amount > 0 && (
            <Text style={rowStyles.usdAmount}>{tokenActivityService.formatUsd(item.amount)}</Text>
          )}
          {item.amount > 0 && (
            <Text style={rowStyles.dot}>·</Text>
          )}
          <Text style={rowStyles.tokenAmt}>
            {tokenActivityService.formatTokenAmount(item.tokenAmount)}
            {tokenSymbol ? ` ${tokenSymbol}` : ''}
          </Text>
          {!!solStr && (
            <>
              <Text style={rowStyles.dot}>·</Text>
              <Text style={rowStyles.solAmt}>{solStr}</Text>
            </>
          )}
        </View>
      </View>

      {/* Right: time + link */}
      <View style={rowStyles.right}>
        <Text style={rowStyles.time}>{tokenActivityService.formatTimeAgo(item.timestamp)}</Text>
        {hasSig && (
          <TouchableOpacity
            onPress={() => openSolscan(item.txSignature)}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <ExternalLink size={11} color={colors.textMuted} strokeWidth={2} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginTop: 6,
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
    gap: 3,
    minWidth: 0,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'nowrap',
  },
  typeLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    flexShrink: 0,
  },
  wallet: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.45)',
    fontWeight: '500',
    fontFamily: 'SpaceMono-Regular',
    flexShrink: 1,
  },
  rowBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
  },
  usdAmount: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  dot: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.25)',
  },
  tokenAmt: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.55)',
  },
  solAmt: {
    fontSize: 11,
    color: 'rgba(167,139,250,0.8)',
    fontWeight: '500',
  },
  right: {
    alignItems: 'flex-end',
    gap: 4,
    flexShrink: 0,
  },
  time: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    fontWeight: '600',
  },
});

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

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={styles.loadingText}>Loading {mode === 'trades' ? 'trades' : 'activity'}...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {mode === 'trades' ? 'Recent Trades' : 'Live Activity'}
        </Text>
        <View style={styles.headerRight}>
          <View style={styles.liveDot} />
          <TouchableOpacity
            onPress={onRefresh}
            activeOpacity={0.7}
            disabled={refreshing}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <RefreshCw
              size={13}
              color={refreshing ? colors.primary : colors.textMuted}
              strokeWidth={2}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Render as static list — parent ScrollView handles scrolling */}
      <View style={styles.list}>
        {filteredTrades.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              No recent {mode === 'trades' ? 'trades' : 'activity'}
            </Text>
          </View>
        ) : (
          filteredTrades.map(item => (
            <ActivityRow key={item.id} item={item} tokenSymbol={tokenSymbol} />
          ))
        )}
      </View>
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
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#14F195',
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
  empty: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
});
