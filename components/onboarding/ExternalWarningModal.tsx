import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { ShieldCheck } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, fontSize } from '@/constants/theme';
import { useSecurity } from '@/contexts/SecurityContext';
import { useProfile } from '@/contexts/ProfileContext';

const POINTS = [
  'Your keys remain inside your wallet app (Phantom, Solflare, or Backpack).',
  'DAWEN never has access to your private key or seed phrase.',
  'Transactions are signed by your external wallet.',
  'DAWEN cannot recover your funds if you lose access to your wallet.',
  'Keep your wallet app updated and seed phrase backed up.',
];

interface Props { visible: boolean }

export function ExternalWarningModal({ visible }: Props) {
  const { acceptExternalWarning, logEvent } = useSecurity();
  const { profile } = useProfile();

  const accept = async () => {
    await acceptExternalWarning(profile?.id);
    if (profile?.id) logEvent(profile.id, 'external_backup_warning_accepted');
  };

  return (
    <Modal visible={visible} animationType="fade" transparent presentationStyle="overFullScreen">
      <View style={s.overlay}>
        <View style={s.card}>
          <View style={s.iconBox}>
            <LinearGradient colors={['#1e1b35','#0e0c1e']} style={s.iconBg}>
              <ShieldCheck size={30} color="#f59e0b" strokeWidth={2} />
            </LinearGradient>
          </View>
          <Text style={s.title}>External Wallet Notice</Text>
          <Text style={s.sub}>
            Your recovery phrase is managed by your external wallet.
            Make sure it is backed up inside Phantom, Solflare, or Backpack.
          </Text>
          <View style={s.list}>
            {POINTS.map((p, i) => (
              <View key={i} style={s.point}>
                <View style={s.bullet} />
                <Text style={s.ptxt}>{p}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity style={s.btn} onPress={accept} activeOpacity={0.85}>
            <LinearGradient colors={['#8B5CF6','#6D28D9']} start={{x:0,y:0}} end={{x:1,y:0}} style={s.btnGrad}>
              <Text style={s.btnTxt}>Got It, Continue</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(6,6,13,0.97)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xl },
  card: { width: '100%', maxWidth: 360, backgroundColor: '#0F0F1A', borderRadius: 24, padding: spacing.xxl, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(245,158,11,0.2)' },
  iconBox: { marginBottom: spacing.lg },
  iconBg: { width: 60, height: 60, borderRadius: 18, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)' },
  title: { fontSize: fontSize.xl, fontWeight: '800', color: colors.white, textAlign: 'center', marginBottom: 6 },
  sub: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', lineHeight: 20, marginBottom: spacing.xl },
  list: { width: '100%', gap: 10, marginBottom: spacing.xl },
  point: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  bullet: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#f59e0b', marginTop: 7, flexShrink: 0 },
  ptxt: { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20, flex: 1 },
  btn: { width: '100%', borderRadius: 14, overflow: 'hidden' },
  btnGrad: { paddingVertical: 16, alignItems: 'center', borderRadius: 14 },
  btnTxt: { color: colors.white, fontSize: fontSize.md, fontWeight: '700' },
});
