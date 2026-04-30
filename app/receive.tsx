import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Share,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Copy, Share2, Check } from 'lucide-react-native';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';
import { useWallet } from '@/contexts/WalletContext';
import { colors, spacing, borderRadius, fontSize } from '@/constants/theme';

export default function ReceiveScreen() {
  const router = useRouter();
  const { activeAddress, activeWallet } = useWallet();
  const [copied, setCopied] = useState(false);

  const address = activeAddress || '';
  const blockchainName = activeWallet?.type === 'connected'
    ? `${activeWallet.name} (Solana)`
    : 'Solana';

  const copyAddress = async () => {
    await Clipboard.setStringAsync(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareAddress = async () => {
    if (!address) return;
    try {
      await Share.share({
        message: `My ${blockchainName} address: ${address}`,
      });
    } catch {}
  };

  if (!address) {
    return (
      <LinearGradient colors={colors.gradient.primary} style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <ArrowLeft size={24} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Receive</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.noWalletContainer}>
          <Text style={styles.noWalletText}>No wallet connected</Text>
          <Text style={styles.noWalletSubtext}>Create or connect a wallet to receive tokens.</Text>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={colors.gradient.primary} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <ArrowLeft size={24} color={colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Receive</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.content}>
        <Text style={styles.title}>My {blockchainName} Address</Text>
        <Text style={styles.subtitle}>Scan QR code or share the address below</Text>

        <View style={styles.qrContainer}>
          <View style={styles.qrWrapper}>
            <QRCode value={address} size={220} backgroundColor="white" color={colors.background} />
          </View>
        </View>

        <View style={styles.addressContainer}>
          <Text style={styles.addressLabel}>Wallet Address</Text>
          <View style={styles.addressBox}>
            <Text style={styles.address} selectable>{address}</Text>
          </View>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionButton} onPress={copyAddress}>
            {copied ? <Check size={20} color={colors.success} /> : <Copy size={20} color={colors.primary} />}
            <Text style={styles.actionButtonText}>{copied ? 'Copied' : 'Copy'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={shareAddress}>
            <Share2 size={20} color={colors.primary} />
            <Text style={styles.actionButtonText}>Share</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.warningBox}>
          <Text style={styles.warningText}>
            Only send Solana tokens to this address. Sending other tokens may result in permanent loss.
          </Text>
        </View>
      </View>
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
    paddingTop: 56,
    paddingBottom: spacing.xl,
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.xxl,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.xxxl,
  },
  qrContainer: {
    alignItems: 'center',
    marginBottom: spacing.xxxl,
  },
  qrWrapper: {
    padding: spacing.xxl,
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
  },
  addressContainer: {
    marginBottom: spacing.xxl,
  },
  addressLabel: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  addressBox: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
  },
  address: {
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.xxl,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    paddingVertical: 14,
    borderRadius: borderRadius.md,
  },
  actionButtonText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  warningBox: {
    backgroundColor: colors.warningMuted,
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
  },
  warningText: {
    fontSize: fontSize.sm,
    color: colors.warning,
    lineHeight: 18,
  },
  noWalletContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
    gap: spacing.sm,
  },
  noWalletText: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  noWalletSubtext: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
