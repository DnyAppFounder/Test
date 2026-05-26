import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Star, X } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { colors, spacing, fontSize, borderRadius, elevation } from '@/constants/theme';
import { useProfile } from '@/contexts/ProfileContext';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Short description of the locked feature, e.g. "GIF posting is a Premium feature." */
  featureNote?: string;
}

export function PremiumUpsellModal({ visible, onClose, featureNote }: Props) {
  const router = useRouter();
  const { profile } = useProfile();

  const handleViewPremium = () => {
    onClose();
    if (profile?.id) {
      router.push(`/profile/${profile.id}` as any);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <LinearGradient
            colors={['rgba(18,9,31,0.99)', 'rgba(9,6,15,0.99)']}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.glowCircle} />

          <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7}>
            <X size={18} color="rgba(255,255,255,0.4)" strokeWidth={2} />
          </TouchableOpacity>

          <View style={styles.iconRow}>
            <View style={styles.iconWrap}>
              <Star size={28} color="#FBBF24" fill="#FBBF24" strokeWidth={0} />
            </View>
          </View>

          <Text style={styles.title}>Unlock Dawen Premium</Text>

          {featureNote ? (
            <Text style={styles.featureNote}>{featureNote}</Text>
          ) : null}

          <Text style={styles.body}>
            Get the Gold Star badge, clickable cashtags, GIF posting, group creation, expanded watchlists, more price alerts, profile style upgrades, and early access to new features.
          </Text>

          <TouchableOpacity style={styles.primaryBtn} onPress={handleViewPremium} activeOpacity={0.85}>
            <LinearGradient
              colors={['#FBBF24', '#F59E0B']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.primaryBtnGrad}
            >
              <Star size={16} color="#1a0a00" fill="#1a0a00" strokeWidth={0} />
              <Text style={styles.primaryBtnText}>View Premium</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryBtn} onPress={onClose} activeOpacity={0.7}>
            <Text style={styles.secondaryBtnText}>Maybe Later</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.3)',
    overflow: 'hidden',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    ...elevation.md,
  },
  glowCircle: {
    position: 'absolute',
    top: -60,
    right: -40,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(251,191,36,0.08)',
  },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    padding: 4,
    zIndex: 10,
  },
  iconRow: {
    alignItems: 'center',
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: 'rgba(251,191,36,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FBBF24',
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  featureNote: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  body: {
    fontSize: fontSize.sm,
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  primaryBtn: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  primaryBtnGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  primaryBtnText: {
    fontSize: fontSize.md,
    fontWeight: '800',
    color: '#1a0a00',
  },
  secondaryBtn: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  secondaryBtnText: {
    fontSize: fontSize.sm,
    color: 'rgba(255,255,255,0.35)',
  },
});
