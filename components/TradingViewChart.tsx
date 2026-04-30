import { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, Platform, useWindowDimensions } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors, spacing, fontSize, borderRadius } from '@/constants/theme';
import { dexScreenerService } from '@/services/dexscreener/tokenDiscoveryService';

interface TradingViewChartProps {
  symbol: string;
  currentPrice?: number;
  pairAddress?: string;
  tokenMint?: string;
}

export function TradingViewChart({ symbol, currentPrice, pairAddress, tokenMint }: TradingViewChartProps) {
  const [chartPairAddress, setChartPairAddress] = useState<string | null>(pairAddress || null);
  const [loading, setLoading] = useState(!pairAddress);
  const [unavailable, setUnavailable] = useState(false);
  const { width: screenWidth } = useWindowDimensions();

  useEffect(() => {
    if (pairAddress) {
      setChartPairAddress(pairAddress);
      setLoading(false);
      return;
    }
    if (tokenMint) {
      resolvePairAddress(tokenMint);
    }
  }, [pairAddress, tokenMint]);

  const resolvePairAddress = async (mint: string) => {
    setLoading(true);
    try {
      const addr = await dexScreenerService.getBestPairAddress(mint);
      if (addr) {
        setChartPairAddress(addr);
      } else {
        setUnavailable(true);
      }
    } catch (error) {
      console.error('[Chart] Pair resolution error:', error);
      setUnavailable(true);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading chart...</Text>
        </View>
      </View>
    );
  }

  if (unavailable || !chartPairAddress) {
    return (
      <View style={styles.container}>
        <View style={styles.unavailableContainer}>
          <Text style={styles.unavailableTitle}>Chart not available</Text>
          <Text style={styles.unavailableText}>No trading pair found for this token yet.</Text>
          {currentPrice !== undefined && currentPrice > 0 && (
            <Text style={styles.priceOnly}>
              Current price: ${currentPrice < 0.01 ? currentPrice.toFixed(8) : currentPrice.toFixed(4)}
            </Text>
          )}
        </View>
      </View>
    );
  }

  const chartUrl = `https://dexscreener.com/solana/${chartPairAddress}?embed=1&theme=dark&trades=0&info=0`;
  const chartHeight = Platform.OS === 'web' ? 450 : 360;

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.container, { height: chartHeight }]}>
        <iframe
          src={chartUrl}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            borderRadius: 12,
          }}
          title={`${symbol} chart`}
          allow="clipboard-write"
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { height: chartHeight }]}>
      <WebView
        source={{ uri: chartUrl }}
        style={styles.webview}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState
        renderLoading={() => (
          <View style={styles.webviewLoading}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        )}
        scrollEnabled={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    minHeight: 360,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 360,
  },
  loadingText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: '600',
  },
  unavailableContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xxl,
    minHeight: 200,
  },
  unavailableTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  unavailableText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
  },
  priceOnly: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.primary,
    marginTop: spacing.lg,
  },
  webview: {
    flex: 1,
    backgroundColor: colors.background,
  },
  webviewLoading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
});
