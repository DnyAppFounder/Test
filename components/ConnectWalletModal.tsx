import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  ScrollView,
  Linking,
} from 'react-native';
import { X, WifiOff, Shield, Check, Smartphone, ExternalLink } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, borderRadius, fontSize } from '@/constants/theme';
import {
  ExternalWalletAdapter,
  ExternalWalletInfo,
  ExternalWalletId,
  SUPPORTED_WALLETS,
} from '@/lib/wallet/ExternalWalletAdapter';
import { useWallet } from '@/contexts/WalletContext';

interface ConnectWalletModalProps {
  visible: boolean;
  onClose: () => void;
  onConnected?: () => void;
}

const WALLET_COLORS: Record<string, [string, string]> = {
  phantom: ['#AB9FF2', '#8A63F0'],
  backpack: ['#E33E3F', '#C42B2C'],
  solflare: ['#FC8F2A', '#F56B10'],
};

const WALLET_DESCRIPTIONS: Record<string, string> = {
  phantom: 'The most trusted Solana wallet',
  backpack: 'xNFT-powered Solana wallet',
  solflare: 'The original Solana wallet',
};

function getMobileDeepLinks(appUrl: string) {
  const encoded = encodeURIComponent(appUrl);
  return {
    phantom: `https://phantom.app/ul/browse/${encoded}?ref=${encoded}`,
    backpack: `https://backpack.app/ul/browse/${encoded}`,
    solflare: `https://solflare.com/ul/v1/browse/${encoded}?ref=${encoded}`,
  };
}

export function ConnectWalletModal({ visible, onClose, onConnected }: ConnectWalletModalProps) {
  const { connectExternalWallet, connectedWallet, disconnectExternalWallet } = useWallet();
  const [installedWallets, setInstalledWallets] = useState<ExternalWalletInfo[]>([]);
  const [connecting, setConnecting] = useState<ExternalWalletId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [appUrl, setAppUrl] = useState('');

  const isMobile = Platform.OS !== 'web';
  const hasProvider = Platform.OS === 'web' ? ExternalWalletAdapter.hasAnyProvider() : false;
  const isInsideWalletBrowser = !isMobile && hasProvider;

  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      setAppUrl(window.location.href);
    }
  }, []);

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
        setError(`${id.charAt(0).toUpperCase() + id.slice(1)} is not detected. Open this page inside the ${id.charAt(0).toUpperCase() + id.slice(1)} in-app browser.`);
      } else if (err.message?.includes('rejected') || err.message?.includes('User rejected')) {
        setError('Connection rejected. Please approve the request in your wallet.');
      } else {
        setError(err.message || 'Failed to connect wallet');
      }
    } finally {
      setConnecting(null);
    }
  };

  const handleDisconnect = async () => {
    await disconnectExternalWallet();
    onClose();
  };

  const isInstalled = (id: ExternalWalletId) =>
    installedWallets.some(w => w.id === id);

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
                  colors={WALLET_COLORS[connectedWallet.id] ?? ['#3B82F6', '#1D4ED8']}
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
              Connect your Solana wallet to trade
            </Text>

            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Mobile: deep link buttons to open app in wallet browser */}
            {isMobile && (
              <View style={styles.mobileMessage}>
                <Smartphone size={28} color={colors.primary} />
                <Text style={styles.mobileMessageTitle}>Open in Your Wallet</Text>
                <Text style={styles.mobileMessageText}>
                  Tap a wallet below to open this app inside its built-in browser and connect directly.
                </Text>
                <View style={styles.walletInstructionList}>
                  {SUPPORTED_WALLETS.map(wallet => {
                    const links = getMobileDeepLinks(appUrl || 'https://dawencity.app');
                    const deepLink = links[wallet.id as keyof typeof links];
                    return (
                      <TouchableOpacity
                        key={wallet.id}
                        style={styles.walletInstruction}
                        onPress={() => Linking.openURL(deepLink).catch(() => {})}
                        activeOpacity={0.7}
                      >
                        <LinearGradient
                          colors={WALLET_COLORS[wallet.id] ?? ['#3B82F6', '#1D4ED8']}
                          style={styles.walletInstructionIcon}
                        >
                          <Text style={styles.walletInstructionIconText}>{wallet.name[0]}</Text>
                        </LinearGradient>
                        <Text style={styles.walletInstructionName}>{wallet.name}</Text>
                        <View style={styles.openInBrowserBadge}>
                          <ExternalLink size={12} color={colors.primary} />
                          <Text style={styles.openInBrowserText}>Open</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Desktop: no wallet extension detected */}
            {!isMobile && !hasProvider && (
              <View style={styles.noProviderMessage}>
                <Text style={styles.noProviderText}>
                  No Solana wallet detected. Install Phantom, Backpack, or Solflare browser extension, then refresh.
                </Text>
              </View>
            )}

            {/* Desktop: wallet extension detected — show wallet list */}
            {!isMobile && hasProvider && (
              <ScrollView showsVerticalScrollIndicator={false} style={styles.walletList}>
                {installedWallets.length > 0 && (
                  <Text style={styles.sectionLabel}>Detected</Text>
                )}
                {SUPPORTED_WALLETS.map(wallet => {
                  const installed = isInstalled(wallet.id);
                  return (
                    <WalletRow
                      key={wallet.id}
                      wallet={wallet}
                      isInstalled={installed}
                      isConnecting={connecting === wallet.id}
                      onConnect={handleConnect}
                      gradColors={WALLET_COLORS[wallet.id] ?? ['#3B82F6', '#1D4ED8']}
                      description={WALLET_DESCRIPTIONS[wallet.id] ?? ''}
                    />
                  );
                })}
              </ScrollView>
            )}

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
  onConnect: (id: ExternalWalletId) => void;
  gradColors: [string, string];
  description: string;
}

function WalletRow({ wallet, isInstalled, isConnecting, onConnect, gradColors, description }: WalletRowProps) {
  return (
    <TouchableOpacity
      style={styles.walletRow}
      onPress={() => onConnect(wallet.id)}
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
          {isInstalled && (
            <View style={styles.detectedBadge}>
              <Text style={styles.detectedBadgeText}>Detected</Text>
            </View>
          )}
        </View>
        <Text style={styles.walletDescription}>{description}</Text>
      </View>

      {isConnecting ? (
        <ActivityIndicator size="small" color={gradColors[0]} />
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
    maxHeight: '90%',
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
    lineHeight: 18,
  },
  // Mobile message
  mobileMessage: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.md,
  },
  mobileMessageTitle: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  mobileMessageText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  walletInstructionList: {
    width: '100%',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  walletInstruction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  walletInstructionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  walletInstructionIconText: {
    fontSize: fontSize.md,
    fontWeight: '800',
    color: colors.white,
  },
  walletInstructionName: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
    flex: 1,
  },
  walletInstructionStep: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  openInBrowserBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  openInBrowserText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.primary,
  },
  // No provider
  noProviderMessage: {
    backgroundColor: colors.primaryMuted,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  noProviderText: {
    fontSize: fontSize.sm,
    color: colors.primaryLight,
    lineHeight: 20,
    textAlign: 'center',
  },
  // Wallet list
  walletList: {
    maxHeight: 300,
  },
  sectionLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
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
    borderColor: colors.surfaceBorder,
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
