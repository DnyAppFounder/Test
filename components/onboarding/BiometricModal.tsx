import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Platform } from 'react-native';
import { Fingerprint } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, fontSize } from '@/constants/theme';
import { useSecurity } from '@/contexts/SecurityContext';
import { useProfile } from '@/contexts/ProfileContext';

interface Props { visible: boolean }

export function BiometricModal({ visible }: Props) {
  const { setBiometricEnabled, markBiometricOffered, logEvent } = useSecurity();
  const { profile } = useProfile();
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    if (!visible || Platform.OS === 'web') return;
    // Dynamically check biometric support on native only
    import('expo-local-authentication').then(({ hasHardwareAsync, isEnrolledAsync }) => {
      Promise.all([hasHardwareAsync(), isEnrolledAsync()]).then(([hw, enrolled]) => {
        setSupported(hw && enrolled);
      }).catch(() => {});
    }).catch(() => {});
  }, [visible]);

  const enable = async () => {
    if (!supported || Platform.OS === 'web') {
      await skipWithEvent('biometric_skipped');
      return;
    }
    try {
      const { authenticateAsync } = await import('expo-local-authentication');
      const result = await authenticateAsync({ promptMessage: 'Confirm to enable biometric unlock' });
      if (result.success) {
        await setBiometricEnabled(true, profile?.id);
        if (profile?.id) logEvent(profile.id, 'biometric_enabled');
      } else {
        await skipWithEvent('biometric_skipped');
      }
    } catch {
      await skipWithEvent('biometric_skipped');
    }
  };

  const skipWithEvent = async (evt: string) => {
    await markBiometricOffered();
    if (profile?.id) logEvent(profile.id, evt);
  };

  const isWeb = Platform.OS === 'web';

  return (
    <Modal visible={visible} animationType="fade" transparent presentationStyle="overFullScreen">
      <View style={s.overlay}>
        <View style={s.card}>
          <View style={s.iconBox}>
            <LinearGradient colors={['#1e1b35','#0e0c1e']} style={s.iconBg}>
              <Fingerprint size={30} color={colors.primary} strokeWidth={2} />
            </LinearGradient>
          </View>
          <Text style={s.title}>Enable Biometric Unlock</Text>
          <Text style={s.sub}>
            {isWeb || !supported
              ? 'Biometric unlock is not available on this device. You can skip this step.'
              : 'Use Face ID or Touch ID to quickly unlock the app instead of entering your PIN every time.'}
          </Text>
          {(!isWeb && supported) && (
            <TouchableOpacity style={s.btn} onPress={enable} activeOpacity={0.85}>
              <LinearGradient colors={['#8B5CF6','#6D28D9']} start={{x:0,y:0}} end={{x:1,y:0}} style={s.btnGrad}>
                <Text style={s.btnTxt}>Enable Biometric</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[s.skipBtn, (isWeb || !supported) && { marginTop: 0 }]}
            onPress={() => skipWithEvent('biometric_skipped')}
            activeOpacity={0.75}
          >
            <Text style={s.skipTxt}>{isWeb || !supported ? 'Continue' : 'Skip for now'}</Text>
          </TouchableOpacity>
          <Text style={s.note}>You can enable this later in Settings.</Text>
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
  sub: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', lineHeight: 20, marginBottom: spacing.xl },
  btn: { width: '100%', borderRadius: 14, overflow: 'hidden', marginBottom: spacing.md },
  btnGrad: { paddingVertical: 16, alignItems: 'center', borderRadius: 14 },
  btnTxt: { color: colors.white, fontSize: fontSize.md, fontWeight: '700' },
  skipBtn: { marginTop: spacing.sm, paddingVertical: spacing.md },
  skipTxt: { color: colors.textMuted, fontSize: fontSize.sm, fontWeight: '600', textDecorationLine: 'underline' },
  note: { fontSize: 11, color: colors.textMuted, marginTop: spacing.sm, opacity: 0.6 },
});
