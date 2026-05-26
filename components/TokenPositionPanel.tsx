import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Image, Share, Pressable, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Wallet, Share2, X, TrendingUp } from 'lucide-react-native';
import { colors, spacing, fontSize, borderRadius } from '@/constants/theme';

interface TokenPositionPanelProps {
  rawTokenBalance: number;
  tokenDecimals?: number;
  tokenPrice: number;
  tokenSymbol: string;
  tokenName?: string;
  totalSupply?: number;
  activeAddress?: string | null;
}

function fmtUsd(val: number): string {
  if (val === 0) return '$0.00';
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(2)}K`;
  if (val >= 1) return `$${val.toFixed(2)}`;
  return `$${val.toFixed(4)}`;
}

function fmtTokenAmt(val: number): string {
  if (val >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(2)}B`;
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(2)}K`;
  if (val >= 1) return val.toFixed(4);
  return val.toPrecision(4);
}

function fmtPrice(p: number): string {
  if (p === 0) return '$0.00';
  if (p < 0.000001) return `$${p.toExponential(2)}`;
  if (p < 0.001) return `$${p.toFixed(7)}`;
  if (p < 1) return `$${p.toFixed(5)}`;
  return `$${p.toFixed(4)}`;
}

export function TokenPositionPanel({
  rawTokenBalance,
  tokenDecimals = 9,
  tokenPrice,
  tokenSymbol,
  tokenName,
  totalSupply,
  activeAddress,
}: TokenPositionPanelProps) {
  const [shareVisible, setShareVisible] = useState(false);

  const uiBalance = useMemo(
    () => rawTokenBalance / Math.pow(10, tokenDecimals),
    [rawTokenBalance, tokenDecimals],
  );

  const currentValueUsd = useMemo(
    () => uiBalance * tokenPrice,
    [uiBalance, tokenPrice],
  );

  const supplyPct = useMemo(() => {
    if (!totalSupply || totalSupply <= 0 || uiBalance <= 0) return null;
    return (uiBalance / totalSupply) * 100;
  }, [uiBalance, totalSupply]);

  const handleShare = async () => {
    setShareVisible(false);
    const lines = [
      `My ${tokenName ? tokenName + ' ' : ''}($${tokenSymbol}) position on DAWEN`,
      ``,
      `Balance: ${fmtTokenAmt(uiBalance)} ${tokenSymbol}`,
      `Value: ${fmtUsd(currentValueUsd)}  |  Price ${fmtPrice(tokenPrice)}`,
      supplyPct != null ? `% of Supply: ${supplyPct < 0.01 ? '<0.01' : supplyPct.toFixed(2)}%` : null,
      ``,
      `Trade on DAWEN — Solana's social trading app`,
    ].filter(Boolean).join('\n');
    try {
      await Share.share({ message: lines });
    } catch {}
  };

  if (!activeAddress) {
    return (
      <View style={styles.card}>
        <View style={styles.emptyRow}>
          <Wallet size={16} color={colors.textMuted} strokeWidth={2} />
          <Text style={styles.emptyText}>Connect wallet to view your position</Text>
        </View>
      </View>
    );
  }

  if (uiBalance <= 0) {
    return (
      <View style={styles.card}>
        <LinearGradient
          colors={['rgba(139,92,246,0.04)', 'transparent']}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        />
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Wallet size={14} color={colors.textMuted} strokeWidth={2} />
            <Text style={styles.headerTitle}>My Position</Text>
          </View>
        </View>
        <View style={styles.emptyRow}>
          <Text style={styles.emptyText}>No position yet</Text>
        </View>
      </View>
    );
  }

  return (
    <>
      <View style={styles.card}>
        <LinearGradient
          colors={['rgba(139,92,246,0.10)', 'rgba(139,92,246,0.03)', 'transparent']}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        />

        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.headerIconWrap}>
              <TrendingUp size={12} color={colors.primary} strokeWidth={2.5} />
            </View>
            <Text style={styles.headerTitle}>My Position</Text>
          </View>
          <View style={styles.headerRight}>
            {supplyPct != null && supplyPct > 0 && (
              <View style={styles.supplyBadge}>
                <Text style={styles.supplyBadgeText}>
                  {supplyPct < 0.01 ? '<0.01' : supplyPct.toFixed(2)}% supply
                </Text>
              </View>
            )}
            <TouchableOpacity
              style={styles.shareBtn}
              onPress={() => setShareVisible(true)}
              activeOpacity={0.75}
            >
              <Share2 size={13} color={colors.textMuted} strokeWidth={2} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.mainRow}>
          <View style={styles.statBlock}>
            <Text style={styles.statLabel}>Balance</Text>
            <Text style={styles.statValue} numberOfLines={1}>
              {fmtTokenAmt(uiBalance)}
            </Text>
            <Text style={styles.statSub}>{tokenSymbol}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.statBlock}>
            <Text style={styles.statLabel}>Value</Text>
            <Text style={[styles.statValue, { color: '#14F195' }]}>
              {fmtUsd(currentValueUsd)}
            </Text>
            <Text style={styles.statSub}>USD</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.statBlock}>
            <Text style={styles.statLabel}>Price</Text>
            <Text style={[styles.statValue, { fontSize: 11, color: colors.textPrimary }]} numberOfLines={1}>
              {fmtPrice(tokenPrice)}
            </Text>
            <Text style={styles.statSub}>current</Text>
          </View>

          {supplyPct != null && (
            <>
              <View style={styles.divider} />
              <View style={styles.statBlock}>
                <Text style={styles.statLabel}>% Supply</Text>
                <Text style={styles.statValue}>
                  {supplyPct < 0.01 ? '<0.01%' : `${supplyPct.toFixed(2)}%`}
                </Text>
                <Text style={styles.statSub}>held</Text>
              </View>
            </>
          )}
        </View>
      </View>

      <Modal visible={shareVisible} transparent animationType="fade" onRequestClose={() => setShareVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShareVisible(false)}>
          <Pressable style={styles.shareCard} onPress={() => {}}>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setShareVisible(false)}>
              <X size={16} color={colors.textMuted} strokeWidth={2} />
            </TouchableOpacity>

            <View style={styles.shareCardHeader}>
              <Image
                source={Platform.OS === 'web' ? { uri: '/Dawen1D.png' } : require('../dawenlogo.jpeg')}
                style={styles.shareLogo}
                resizeMode="contain"
              />
              <View>
                <Text style={styles.shareAppName}>DAWEN</Text>
                <Text style={styles.shareTagline}>Solana Social Trading</Text>
              </View>
            </View>

            <View style={styles.shareCardDivider} />

            <View style={styles.shareTokenRow}>
              <Text style={styles.shareTokenName}>{tokenName || tokenSymbol}</Text>
              <View style={styles.shareSymbolBadge}>
                <Text style={styles.shareSymbolText}>${tokenSymbol}</Text>
              </View>
            </View>

            <View style={styles.shareStatsGrid}>
              <View style={styles.shareStatItem}>
                <Text style={styles.shareStatLabel}>Balance</Text>
                <Text style={styles.shareStatValue}>{fmtTokenAmt(uiBalance)}</Text>
                <Text style={styles.shareStatSub}>{tokenSymbol}</Text>
              </View>
              <View style={styles.shareStatItem}>
                <Text style={styles.shareStatLabel}>Value</Text>
                <Text style={[styles.shareStatValue, { color: '#14F195' }]}>{fmtUsd(currentValueUsd)}</Text>
                <Text style={styles.shareStatSub}>USD</Text>
              </View>
              <View style={styles.shareStatItem}>
                <Text style={styles.shareStatLabel}>Price</Text>
                <Text style={styles.shareStatValue}>{fmtPrice(tokenPrice)}</Text>
                <Text style={styles.shareStatSub}>current</Text>
              </View>
              {supplyPct != null && (
                <View style={styles.shareStatItem}>
                  <Text style={styles.shareStatLabel}>% Supply</Text>
                  <Text style={styles.shareStatValue}>
                    {supplyPct < 0.01 ? '<0.01%' : `${supplyPct.toFixed(2)}%`}
                  </Text>
                  <Text style={styles.shareStatSub}>held</Text>
                </View>
              )}
            </View>

            <TouchableOpacity style={styles.shareActionBtn} onPress={handleShare} activeOpacity={0.8}>
              <Share2 size={15} color={colors.black || '#000'} strokeWidth={2.5} />
              <Text style={styles.shareActionText}>Share Position</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.25)',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    overflow: 'hidden',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerIconWrap: {
    width: 20,
    height: 20,
    borderRadius: 6,
    backgroundColor: 'rgba(139,92,246,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  supplyBadge: {
    backgroundColor: 'rgba(139,92,246,0.14)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.28)',
  },
  supplyBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 0.3,
  },
  shareBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statBlock: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  divider: {
    width: 1,
    height: 38,
    backgroundColor: 'rgba(139,92,246,0.12)',
    marginHorizontal: 2,
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  statSub: {
    fontSize: 9,
    color: colors.textMuted,
    fontWeight: '500',
  },
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  emptyText: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '500',
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  shareCard: {
    backgroundColor: '#0F0F1A',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.3)',
    padding: spacing.xl,
    width: '100%',
    maxWidth: 380,
  },
  closeBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  shareCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  shareLogo: {
    width: 38,
    height: 38,
    borderRadius: 10,
  },
  shareAppName: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.textPrimary,
    letterSpacing: 1.5,
  },
  shareTagline: {
    fontSize: 10,
    color: colors.textMuted,
    fontWeight: '500',
    marginTop: 1,
  },
  shareCardDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.07)',
    marginBottom: 16,
  },
  shareTokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  shareTokenName: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
    flex: 1,
  },
  shareSymbolBadge: {
    backgroundColor: 'rgba(139,92,246,0.18)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.35)',
  },
  shareSymbolText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
  },
  shareStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 20,
  },
  shareStatItem: {
    flex: 1,
    minWidth: 70,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    gap: 2,
  },
  shareStatLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  shareStatValue: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  shareStatSub: {
    fontSize: 9,
    color: colors.textMuted,
    fontWeight: '500',
  },
  shareActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 13,
  },
  shareActionText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#000',
    letterSpacing: 0.3,
  },
});
