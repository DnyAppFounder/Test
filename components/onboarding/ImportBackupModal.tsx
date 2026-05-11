import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { Download, CircleCheck as CheckCircle } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, fontSize } from '@/constants/theme';
import { useSecurity } from '@/contexts/SecurityContext';
import { useProfile } from '@/contexts/ProfileContext';

interface Props { visible: boolean }

export function ImportBackupModal({ visible }: Props) {
  const { confirmImportBackup, logEvent } = useSecurity();
  const { profile } = useProfile();
  const [checked, setChecked] = useState(false);

  const confirm = async () => {
    await confirmImportBackup(profile?.id);
    if (profile?.id) logEvent(profile.id, 'imported_backup_confirmed');
  };

  return (
    <Modal visible={visible} animationType="fade" transparent presentationStyle="overFullScreen">
      <View style={s.overlay}>
        <View style={s.card}>
          <View style={s.iconBox}>
            <LinearGradient colors={['#1e1b35','#0e0c1e']} style={s.iconBg}>
              <Download size={30} color={colors.primary} strokeWidth={2} />
            </LinearGradient>
          </View>
          <Text style={s.title}>Backup Confirmation</Text>
          <Text style={s.sub}>
            You imported an existing wallet. Confirm you already have a secure backup of your seed phrase.
          </Text>
          <View style={s.infoBox}>
            <Text style={s.infoTxt}>
              If you lose your seed phrase, your funds cannot be recovered — not by DAWEN, not by anyone. Make sure your backup is stored safely offline.
            </Text>
          </View>
          <TouchableOpacity style={s.row} onPress={() => setChecked(v => !v)} activeOpacity={0.8}>
            <View style={[s.cb, checked && s.cbOn]}>
              {checked && <CheckCircle size={14} color="#fff" strokeWidth={2.5} />}
            </View>
            <Text style={s.rowLabel}>I confirm I already have a secure backup of my seed phrase before importing.</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.btn, !checked && s.btnOff]} onPress={confirm} disabled={!checked} activeOpacity={0.85}>
            <LinearGradient colors={['#8B5CF6','#6D28D9']} start={{x:0,y:0}} end={{x:1,y:0}} style={s.btnGrad}>
              <Text style={s.btnTxt}>I Understand</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(6,6,13,0.97)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xl },
  card: { width: '100%', maxWidth: 360, backgroundColor: '#0F0F1A', borderRadius: 24, padding: spacing.xxl, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(139,92,246,0.2)' },
  iconBox: { marginBottom: spacing.lg },
  iconBg: { width: 60, height: 60, borderRadius: 18, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)' },
  title: { fontSize: fontSize.xl, fontWeight: '800', color: colors.white, textAlign: 'center', marginBottom: 6 },
  sub: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', lineHeight: 20, marginBottom: spacing.lg },
  infoBox: { backgroundColor: 'rgba(59,130,246,0.07)', borderRadius: 12, padding: spacing.lg, borderWidth: 1, borderColor: 'rgba(59,130,246,0.18)', marginBottom: spacing.xl, width: '100%' },
  infoTxt: { fontSize: fontSize.sm, color: '#93c5fd', lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: spacing.xl, width: '100%' },
  cb: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: 'rgba(139,92,246,0.5)', justifyContent: 'center', alignItems: 'center', flexShrink: 0, marginTop: 1 },
  cbOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  rowLabel: { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20, flex: 1 },
  btn: { width: '100%', borderRadius: 14, overflow: 'hidden' },
  btnOff: { opacity: 0.45 },
  btnGrad: { paddingVertical: 16, alignItems: 'center', borderRadius: 14 },
  btnTxt: { color: colors.white, fontSize: fontSize.md, fontWeight: '700' },
});
