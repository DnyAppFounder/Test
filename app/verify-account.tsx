import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Linking,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ArrowLeft, ShieldCheck, ShieldAlert, ShieldX, Clock, CheckCircle, ExternalLink, Send } from 'lucide-react-native';
import { useWallet } from '@/contexts/WalletContext';
import { supabase } from '@/lib/supabase';
import { colors, spacing, borderRadius, fontSize, elevation } from '@/constants/theme';

type VerificationStatus = 'verified' | 'pending' | 'rejected' | 'flagged';

const STATUS_CONFIG: Record<VerificationStatus, {
  icon: (size: number, color: string) => any;
  color: string;
  label: string;
  description: string;
  canRequest: boolean;
}> = {
  verified: {
    icon: (s, c) => <ShieldCheck size={s} color={c} strokeWidth={2} />,
    color: '#10B981',
    label: 'Account Verified',
    description: 'Your account is verified. You can claim all available rewards.',
    canRequest: false,
  },
  pending: {
    icon: (s, c) => <Clock size={s} color={c} strokeWidth={2} />,
    color: '#F59E0B',
    label: 'Verification Pending',
    description: 'Your account is pending verification. The DAWEN team will review it shortly. Reward claims unlock once approved.',
    canRequest: false,
  },
  flagged: {
    icon: (s, c) => <ShieldAlert size={s} color={c} strokeWidth={2} />,
    color: '#F59E0B',
    label: 'Account Under Review',
    description: 'Your account has been flagged for review. Reward claims are temporarily paused. Contact support if you believe this is an error.',
    canRequest: true,
  },
  rejected: {
    icon: (s, c) => <ShieldX size={s} color={c} strokeWidth={2} />,
    color: '#EF4444',
    label: 'Account Not Eligible',
    description: 'Your account has been reviewed and is not eligible for rewards. This may be due to duplicate accounts, suspicious activity, or policy violations.',
    canRequest: true,
  },
};

export default function VerifyAccountScreen() {
  const router = useRouter();
  const { activeAddress } = useWallet();
  const [status, setStatus] = useState<VerificationStatus>('verified');
  const [loading, setLoading] = useState(true);
  const [appealText, setAppealText] = useState('');
  const [appealing, setAppealing] = useState(false);
  const [appealSent, setAppealSent] = useState(false);
  const [appealError, setAppealError] = useState('');

  useEffect(() => {
    if (!activeAddress) return;
    supabase
      .from('user_profiles')
      .select('verification_status')
      .eq('wallet_address', activeAddress)
      .maybeSingle()
      .then(({ data }) => {
        setStatus((data?.verification_status as VerificationStatus) ?? 'verified');
        setLoading(false);
      });
  }, [activeAddress]);

  const handleSubmitAppeal = async () => {
    if (!appealText.trim() || !activeAddress || appealing) return;
    setAppealing(true);
    setAppealError('');
    try {
      await supabase.from('notifications').insert({
        user_id: null,
        type: 'verification_appeal',
        message: `APPEAL | wallet:${activeAddress} | status:${status} | ${new Date().toISOString()} | ${appealText.trim()}`,
      });
      setAppealSent(true);
      setAppealText('');
    } catch {
      setAppealError('Failed to submit. Please try again or contact us on Telegram.');
    } finally {
      setAppealing(false);
    }
  };

  if (!activeAddress) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={colors.gradient.primary} style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Account Verification</Text>
        </LinearGradient>
        <View style={styles.centered}>
          <Text style={styles.emptyText}>Connect a wallet to view verification status.</Text>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={colors.gradient.primary} style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Account Verification</Text>
        </LinearGradient>
        <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>
      </View>
    );
  }

  const cfg = STATUS_CONFIG[status];

  return (
    <View style={styles.container}>
      <LinearGradient colors={colors.gradient.primary} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Account Verification</Text>
      </LinearGradient>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Status card */}
        <View style={[styles.statusCard, { borderColor: cfg.color + '55' }]}>
          <View style={[styles.statusIcon, { backgroundColor: cfg.color + '18' }]}>
            {cfg.icon(32, cfg.color)}
          </View>
          <Text style={[styles.statusLabel, { color: cfg.color }]}>{cfg.label}</Text>
          <Text style={styles.statusDescription}>{cfg.description}</Text>
          {status === 'verified' && (
            <View style={styles.verifiedBadge}>
              <CheckCircle size={14} color="#10B981" strokeWidth={2} />
              <Text style={styles.verifiedBadgeText}>Eligible to claim rewards</Text>
            </View>
          )}
        </View>

        {/* Wallet info */}
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Wallet</Text>
          <Text style={styles.infoValue} numberOfLines={1}>
            {activeAddress.slice(0, 8)}...{activeAddress.slice(-6)}
          </Text>
        </View>

        {/* Why verification section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Why is verification required?</Text>
          <View style={styles.reasonCard}>
            <Text style={styles.reasonText}>
              Reward verification protects the DAWEN community reward pool from bots, duplicate accounts, and automated abuse.
            </Text>
            <Text style={[styles.reasonText, { marginTop: 8 }]}>
              All new accounts are verified by default. The DAWEN team may review and adjust verification status if suspicious activity is detected.
            </Text>
            <Text style={[styles.reasonText, { marginTop: 8 }]}>
              Verification does not affect your ability to use DAWEN — trading, social features, and gaming remain fully accessible.
            </Text>
          </View>
        </View>

        {/* Appeal section for flagged/rejected */}
        {cfg.canRequest && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Request a Review</Text>
            {appealSent ? (
              <View style={styles.appealSentCard}>
                <CheckCircle size={20} color="#10B981" strokeWidth={2} />
                <Text style={styles.appealSentText}>
                  Your review request has been submitted. The DAWEN team will respond as soon as possible.
                </Text>
              </View>
            ) : (
              <>
                <Text style={styles.appealHint}>
                  Explain why you believe your account should be approved for rewards. Include your wallet address and any relevant context.
                </Text>
                <TextInput
                  style={styles.appealInput}
                  placeholder="Describe your situation..."
                  placeholderTextColor={colors.textMuted}
                  value={appealText}
                  onChangeText={setAppealText}
                  multiline
                  numberOfLines={4}
                  maxLength={500}
                />
                {!!appealError && (
                  <Text style={styles.appealError}>{appealError}</Text>
                )}
                <TouchableOpacity
                  style={[styles.appealBtn, (!appealText.trim() || appealing) && styles.appealBtnDisabled]}
                  onPress={handleSubmitAppeal}
                  disabled={!appealText.trim() || appealing}
                  activeOpacity={0.8}
                >
                  {appealing ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <>
                      <Send size={16} color={colors.white} strokeWidth={2} />
                      <Text style={styles.appealBtnText}>Submit Review Request</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {/* Contact support */}
        <TouchableOpacity
          style={styles.supportLink}
          onPress={() => {
            const url = 'https://t.me/DawenSupport';
            if (Platform.OS === 'web') {
              (window as any).open(url, '_blank', 'noopener,noreferrer');
            } else {
              Linking.openURL(url).catch(() => {});
            }
          }}
          activeOpacity={0.7}
        >
          <ExternalLink size={14} color={colors.primary} strokeWidth={2} />
          <Text style={styles.supportLinkText}>Contact DAWEN Support</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 56,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  backButton: { marginRight: spacing.md },
  headerTitle: { fontSize: fontSize.xl, fontWeight: '700', color: colors.textPrimary },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: fontSize.md, color: colors.textMuted },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.xl, paddingBottom: 48 },
  statusCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.lg,
    ...elevation.sm,
  },
  statusIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  statusLabel: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  statusDescription: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
    backgroundColor: 'rgba(16,185,129,0.12)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  verifiedBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: '#10B981',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  infoLabel: { fontSize: fontSize.sm, color: colors.textMuted, fontWeight: '600' },
  infoValue: { fontSize: fontSize.sm, color: colors.textPrimary, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined, flex: 1, textAlign: 'right', marginLeft: spacing.sm },
  section: { marginBottom: spacing.xl },
  sectionTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  reasonCard: {
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
  },
  reasonText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  appealHint: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  appealInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: spacing.md,
  },
  appealError: {
    fontSize: fontSize.xs,
    color: '#EF4444',
    marginBottom: spacing.sm,
  },
  appealBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    padding: spacing.md,
    borderRadius: borderRadius.md,
  },
  appealBtnDisabled: { opacity: 0.5 },
  appealBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.white },
  appealSentCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: 'rgba(16,185,129,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.35)',
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
  },
  appealSentText: {
    flex: 1,
    fontSize: fontSize.sm,
    color: '#34D399',
    lineHeight: 20,
  },
  supportLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
  },
  supportLinkText: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
