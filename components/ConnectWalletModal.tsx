import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Platform,
  ScrollView,
} from 'react-native';
import { X, ExternalLink, Wifi, WifiOff, Shield, Check } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, borderRadius, fontSize, elevation } from '@/constants/theme';
import {
  ExternalWalletAdapter,
  ExternalWalletInfo,
  ExternalWalletId,
} from '@/lib/wallet/ExternalWalletAdapter';
import { useWallet } from '@/contexts/WalletContext';

interface ConnectWalletModalProps {
  visible: boolean;
  onClose: () => void;
  onConnected?: () => void;
}

const WALLET_COLORS: Record<ExternalWalletId, [string, string]> = {
  phantom: ['#AB9FF2', '#8A63F0'],
  backpack: ['#E33E3F', '#C42B2C'],
  solflare: ['#FC8F2A', '#F56B10'],
  jupiter: ['#2ED3B7', '#1AB89F'],
  solana: ['#9945FF', '#7B2FBE'],
};

const WALLET_DESCRIPTIONS: Record<ExternalWalletId, string> = {
  phantom: 'The most trusted Solana wallet',
  backpack: 'xNFT-powered Solana wallet',
  solflare: 'The original Solana wallet',
  jupiter: 'Trade and earn on Jupiter',
  solana: 'Standard Solana wallet',
};

export function ConnectWalletModal({ visible, onClose, onConnected }: ConnectWalletModalProps) {
  const { connectExternalWallet, connectedWallet, disconnectExternalWallet } = useWallet();
  const [installedWallets, setInstalledWallets] = useState<ExternalWalletInfo[]>([]);
  const [allWallets] = useState<ExternalWalletInfo[]>(ExternalWalletAdapter.getSupportedWallets());
  const [connecting, setConnecting] = useState<ExternalWalletId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (visible) {
      setInstalledWallets(ExternalWalletAdapter.getInstalledWallets());
      setError(null);
      setSuccess(false);
      setConnecting(null);
    }
  }, [visible]);

  const handleConnect = async (id: ExternalWalletId) => {
    setConnecting(id);
    setError(null);
    try {
      await connectExternalWallet(id);
      setSuccess(true);
      setTimeout(() => {
        onConnected?.();
        onClose();
      }, 1200);
    } catch (err: any) {
      if (err.message?.includes('not installed')) {
        // On mobile or missing extension — show download link
        setError(`${id.charAt(0).toUpperCase() + id.slice(1)} is not installed. Tap below to get it.`);
      } else if (err.message?.includes('rejected') || err.message?.includes('User rejected')) {
        setError('Connection rejected. Please try again.');
      } else {
        setError(err.message || 'Failed to connect wallet');
      }
    } finally {
      setConnecting(null);
    }
  };

  const handleMobileDeepLink = (id: ExternalWalletId) => {
    const url = ExternalWalletAdapter.getMobileDeepLink(id);
    Linking.openURL(url);
  };

  const handleDisconnect = async () => {
    await disconnectExternalWallet();
    onClose();
  };

  const isInstalled = (id: ExternalWalletId) =>
    installedWallets.some(w => w.id === id);

  const isMobile = Platform.OS !== 'web';

  if (success) {
    return (
      <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.successContainer}>
              <View style={styles.successIconWrap}>
                <Check size={36} color={colors.success} strokeWidth={3} />
              </View>
              <Text style={styles.successTitle}>Wallet Connected</Text>
              <Text style={styles.successAddress} numberOfLines={1}>
                {connectedWallet?.address?.slice(0, 4)}...{connectedWallet?.address?.slice(-4)}
              </Text>
              <Text style={styles.successBalance}>
                {connectedWallet?.balance?.toFixed(4)} SOL
              </Text>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  // Already connected — show info + disconnect
  if (connectedWallet) {
    return (
      <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View style={styles.sheet}>
              <View style={styles.handleBar} />
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>Connected Wallet</Text>
                <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                  <X size={20} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              <View style={styles.connectedCard}>
                <LinearGradient
                  colors={WALLET_COLORS[connectedWallet.id] ?? ['#8B5CF6', '#6D28D9']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.connectedGradient}
                >
                  <View style={styles.connectedDot} />
                </LinearGradient>

                <View style={styles.connectedInfo}>
                  <View style={styles.connectedNameRow}>
                    <View style={styles.activeDot} />
                    <Text style={styles.connectedName}>{connectedWallet.name}</Text>
                  </View>
                  <Text style={styles.connectedAddress} numberOfLines={1}>
                    {connectedWallet.address.slice(0, 6)}...{connectedWallet.address.slice(-6)}
                  </Text>
                  <Text style={styles.connectedBalance}>
                    {connectedWallet.balance.toFixed(4)} SOL
                  </Text>
                </View>
              </View>

              <View style={styles.securityNote}>
                <Shield size={14} color={colors.success} />
                <Text style={styles.securityText}>Non-custodial · Your keys stay in your wallet</Text>
              </View>

              <TouchableOpacity style={styles.disconnectButton} onPress={handleDisconnect}>
                <WifiOff size={16} color={colors.error} />
                <Text style={styles.disconnectText}>Disconnect Wallet</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} onPress={() => {}}>
          <View style={styles.sheet}>
            <View style={styles.handleBar} />

            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Connect Wallet</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <X size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={styles.sheetSubtitle}>
              Connect your Solana wallet to start trading
            </Text>

            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <ScrollView showsVerticalScrollIndicator={false} style={styles.walletList}>
              {/* Detected / installed wallets first */}
              {!isMobile && installedWallets.length > 0 && (
                <>
                  <Text style={styles.sectionLabel}>Detected</Text>
                  {installedWallets.map(wallet => (
                    <WalletRow
                      key={wallet.id}
                      wallet={wallet}
                      isInstalled={true}
                      isConnecting={connecting === wallet.id}
                      isMobile={isMobile}
                      onConnect={handleConnect}
                      onMobileOpen={handleMobileDeepLink}
                      colors={WALLET_COLORS[wallet.id]}
                      description={WALLET_DESCRIPTIONS[wallet.id]}
                    />
                  ))}
                  <View style={styles.divider} />
                  <Text style={styles.sectionLabel}>All Wallets</Text>
                </>
              )}

              {isMobile && (
                <View style={styles.mobileNote}>
                  <Wifi size={14} color={colors.primary} />
                  <Text style={styles.mobileNoteText}>
                    Open in wallet browser or install from the links below
                  </Text>
                </View>
              )}

              {allWallets.map(wallet => {
                const installed = isInstalled(wallet.id);
                return (
                  <WalletRow
                    key={wallet.id}
                    wallet={wallet}
                    isInstalled={installed}
                    isConnecting={connecting === wallet.id}
                    isMobile={isMobile}
                    onConnect={handleConnect}
                    onMobileOpen={handleMobileDeepLink}
                    colors={WALLET_COLORS[wallet.id]}
                    description={WALLET_DESCRIPTIONS[wallet.id]}
                  />
                );
              })}
            </ScrollView>

            <View style={styles.footer}>
              <Shield size={13} color={colors.textMuted} />
              <Text style={styles.footerText}>
                Non-custodial · We never access your private keys
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

interface WalletRowProps {
  wallet: ExternalWalletInfo;
  isInstalled: boolean;
  isConnecting: boolean;
  isMobile: boolean;
  onConnect: (id: ExternalWalletId) => void;
  onMobileOpen: (id: ExternalWalletId) => void;
  colors: [string, string];
  description: string;
}

function WalletRow({
  wallet,
  isInstalled,
  isConnecting,
  isMobile,
  onConnect,
  onMobileOpen,
  colors: gradColors,
  description,
}: WalletRowProps) {
  const handlePress = () => {
    if (isMobile) {
      // On mobile: try to connect via deep link or show download page
      onConnect(wallet.id);
    } else {
      onConnect(wallet.id);
    }
  };

  return (
    <TouchableOpacity
      style={styles.walletRow}
      onPress={handlePress}
      disabled={isConnecting}
      activeOpacity={0.7}
    >
      <LinearGradient
        colors={gradColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.walletIcon}
      >
        <Text style={styles.walletIconText}>{wallet.name[0]}</Text>
      </LinearGradient>

      <View style={styles.walletRowInfo}>
        <View style={styles.walletNameRow}>
          <Text style={styles.walletName}>{wallet.name}</Text>
          {isInstalled && !isMobile && (
            <View style={styles.detectedBadge}>
              <Text style={styles.detectedBadgeText}>Detected</Text>
            </View>
          )}
        </View>
        <Text style={styles.walletDescription}>{description}</Text>
      </View>

      {isConnecting ? (
        <ActivityIndicator size="small" color={gradColors[0]} />
      ) : isMobile ? (
        <TouchableOpacity onPress={() => onMobileOpen(wallet.id)} style={styles.externalLinkBtn}>
          <ExternalLink size={14} color={colors.textMuted} />
        </TouchableOpacity>
      ) : (
        <View style={styles.connectChevron}>
          <Text style={styles.connectArrow}>›</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: spacing.xxl,
    paddingBottom: 40,
    maxHeight: '85%',
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceLight,
    alignSelf: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  sheetTitle: {
    fontSize: fontSize.xxl,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheetSubtitle: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginBottom: spacing.xl,
  },
  errorBox: {
    backgroundColor: colors.errorMuted,
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: borderRadius.sm,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  errorText: {
    fontSize: fontSize.sm,
    color: colors.error,
  },
  walletList: {
    maxHeight: 400,
  },
  sectionLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  divider: {
    height: 1,
    backgroundColor: colors.surfaceLight,
    marginVertical: spacing.lg,
  },
  mobileNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primaryMuted,
    borderRadius: borderRadius.sm,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  mobileNoteText: {
    flex: 1,
    fontSize: fontSize.xs,
    color: colors.primaryLight,
    lineHeight: 16,
  },
  walletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceLight,
  },
  walletIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  walletIconText: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.white,
  },
  walletRowInfo: {
    flex: 1,
  },
  walletNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 2,
  },
  walletName: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  detectedBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: colors.successMuted,
  },
  detectedBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.success,
  },
  walletDescription: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  connectChevron: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  connectArrow: {
    fontSize: 18,
    color: colors.textMuted,
    marginTop: -2,
  },
  externalLinkBtn: {
    padding: spacing.sm,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl,
    justifyContent: 'center',
  },
  footerText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  // Success state
  successContainer: {
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
    gap: spacing.md,
  },
  successIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.successMuted,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  successTitle: {
    fontSize: fontSize.xxl,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  successAddress: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontFamily: 'SpaceMono-Regular',
  },
  successBalance: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.success,
  },
  // Connected state
  connectedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorderLight,
  },
  connectedGradient: {
    width: 52,
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  connectedDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  connectedInfo: {
    flex: 1,
  },
  connectedNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: 4,
  },
  activeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  connectedName: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  connectedAddress: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontFamily: 'SpaceMono-Regular',
    marginBottom: 2,
  },
  connectedBalance: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.success,
  },
  securityNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.successMuted,
    borderRadius: borderRadius.sm,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  securityText: {
    fontSize: fontSize.xs,
    color: colors.success,
    fontWeight: '600',
  },
  disconnectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.lg,
  },
  disconnectText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.error,
  },
});
