import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import { TrendingUp, TrendingDown, ExternalLink } from 'lucide-react-native';
import { colors, spacing, borderRadius, fontSize } from '@/constants/theme';
import { dexScreenerService, DexPair } from '@/services/dexscreener/tokenDiscoveryService';

interface PostTokenCardProps {
  tokenAddress: string;
  tokenSymbol: string;
  tokenName?: string | null;
  tokenLogoUri?: string | null;
  /** Stored price snapshot — shown while live data loads */
  storedPrice?: number | null;
  storedChange24h?: number | null;
}

function formatNum(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function formatPrice(p: number): string {
  if (p === 0) return '$0';
  if (p < 0.000001) return `$${p.toExponential(2)}`;
  if (p < 0.0001) return `$${p.toFixed(8)}`;
  if (p < 0.01) return `$${p.toFixed(6)}`;
  if (p < 1) return `$${p.toFixed(4)}`;
  if (p < 1000) return `$${p.toFixed(2)}`;
  return formatNum(p);
}

// Mini sparkline using animated SVG-like approach with View bars
function MiniSparkline({ change }: { change: number }) {
  const isPositive = change >= 0;
  const color = isPositive ? colors.success : colors.error;
  // Generate pseudo bars based on the change value for visual effect
  const bars = Array.from({ length: 12 }, (_, i) => {
    const base = 50 + Math.sin(i * 0.8) * 20;
    const trend = isPositive ? (i / 11) * 30 : -(i / 11) * 30;
    const noise = Math.sin(i * 2.1 + change) * 10;
    return Math.max(10, Math.min(90, base + trend + noise));
  });

  return (
    <View style={spark.container}>
      {bars.map((h, i) => (
        <View
          key={i}
          style={[spark.bar, { height: `${h}%` as any, backgroundColor: color, opacity: i === bars.length - 1 ? 1 : 0.5 + (i / bars.length) * 0.5 }]}
        />
      ))}
    </View>
  );
}

const spark = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    height: 32,
    width: 72,
  },
  bar: {
    flex: 1,
    borderRadius: 1,
    minHeight: 3,
  },
});

export default function PostTokenCard({
  tokenAddress,
  tokenSymbol,
  tokenName,
  tokenLogoUri,
  storedPrice,
  storedChange24h,
}: PostTokenCardProps) {
  const router = useRouter();
  const [pair, setPair] = useState<DexPair | null>(null);
  const [loading, setLoading] = useState(true);
  const [logoError, setLogoError] = useState(false);
  const glowAnim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!tokenAddress) { setLoading(false); return; }
      try {
        const pairs = await dexScreenerService.getTokenByAddress(tokenAddress);
        if (!cancelled && pairs.length > 0) {
          const best = pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
          setPair(best);
        }
      } catch {}
      if (!cancelled) setLoading(false);
    };
    load();
    // Refresh every 30s
    const interval = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [tokenAddress]);

  // Pulse glow animation
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 0.8, duration: 2000, useNativeDriver: false }),
        Animated.timing(glowAnim, { toValue: 0.4, duration: 2000, useNativeDriver: false }),
      ])
    ).start();
  }, [glowAnim]);

  const price = pair?.priceUsd ? parseFloat(pair.priceUsd) : storedPrice ?? null;
  const change24h = pair?.priceChange?.h24 ?? storedChange24h ?? null;
  const mcap = pair?.marketCap ?? pair?.fdv ?? null;
  const liquidity = pair?.liquidity?.usd ?? null;
  const volume24h = pair?.volume?.h24 ?? null;
  const isPositive = (change24h ?? 0) >= 0;
  const changeColor = isPositive ? colors.success : colors.error;

  const logoUri = tokenLogoUri || pair?.info?.imageUrl || null;
  const name = tokenName || pair?.baseToken?.name || tokenSymbol;
  const symbol = tokenSymbol || pair?.baseToken?.symbol || '???';

  const handlePress = () => {
    router.push(`/token-detail/${tokenAddress}` as any);
  };

  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.85}>
      <View style={styles.wrapper}>
        {/* Glow border */}
        <Animated.View style={[styles.glowBorder, { opacity: glowOpacity }]} />

        <View style={styles.card}>
          {/* Top row: logo + name + sparkline */}
          <View style={styles.topRow}>
            <View style={styles.tokenLeft}>
              {logoUri && !logoError ? (
                <Image source={{ uri: logoUri }} style={styles.logo} onError={() => setLogoError(true)} />
              ) : (
                <View style={styles.logoFallback}>
                  <Text style={styles.logoFallbackText}>{symbol[0] || '?'}</Text>
                </View>
              )}
              <View style={styles.tokenInfo}>
                <View style={styles.nameRow}>
                  <Text style={styles.symbol}>${symbol}</Text>
                  {change24h !== null && (
                    <View style={[styles.changePill, { backgroundColor: isPositive ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)' }]}>
                      {isPositive
                        ? <TrendingUp size={10} color={changeColor} strokeWidth={2.5} />
                        : <TrendingDown size={10} color={changeColor} strokeWidth={2.5} />
                      }
                      <Text style={[styles.changeText, { color: changeColor }]}>
                        {isPositive ? '+' : ''}{change24h.toFixed(2)}%
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={styles.tokenName} numberOfLines={1}>{name}</Text>
                <Text style={styles.contractAddr}>
                  {tokenAddress.slice(0, 4)}...{tokenAddress.slice(-4)}
                </Text>
              </View>
            </View>

            <View style={styles.tokenRight}>
              {price !== null && (
                <Text style={styles.price}>{formatPrice(price)}</Text>
              )}
              {change24h !== null && (
                <MiniSparkline change={change24h} />
              )}
            </View>
          </View>

          {/* Stats row */}
          {(mcap !== null || liquidity !== null || volume24h !== null) && (
            <View style={styles.statsRow}>
              {mcap !== null && (
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>MCAP</Text>
                  <Text style={styles.statValue}>{formatNum(mcap)}</Text>
                </View>
              )}
              {liquidity !== null && (
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>LIQ</Text>
                  <Text style={styles.statValue}>{formatNum(liquidity)}</Text>
                </View>
              )}
              {volume24h !== null && (
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>VOL 24H</Text>
                  <Text style={styles.statValue}>{formatNum(volume24h)}</Text>
                </View>
              )}
              <View style={styles.tradeBtn}>
                <ExternalLink size={11} color={colors.primary} strokeWidth={2.5} />
                <Text style={styles.tradeBtnText}>Trade</Text>
              </View>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    marginBottom: spacing.md,
  },
  glowBorder: {
    position: 'absolute',
    inset: -1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 8,
  },
  card: {
    backgroundColor: '#0E0E1A',
    borderRadius: 13,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.25)',
    overflow: 'hidden',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  tokenLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    flex: 1,
  },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1E1E2E',
  },
  logoFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1E1E2E',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.3)',
  },
  logoFallbackText: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.primary,
  },
  tokenInfo: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  symbol: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  changePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  changeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  tokenName: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  contractAddr: {
    fontSize: 10,
    color: colors.textMuted,
    fontFamily: 'SpaceMono-Regular',
  },
  tokenRight: {
    alignItems: 'flex-end',
    gap: 4,
    marginLeft: spacing.sm,
  },
  price: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(139,92,246,0.12)',
    paddingTop: spacing.sm,
    gap: 0,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  statValue: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  tradeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(139,92,246,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.3)',
    marginLeft: spacing.sm,
  },
  tradeBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
  },
});
