import { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Animated } from 'react-native';
import { Delete, Shield } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, fontSize } from '@/constants/theme';
import { useSecurity } from '@/contexts/SecurityContext';
import { useProfile } from '@/contexts/ProfileContext';

const LEN = 6;
const PAD = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

interface Props { visible: boolean }

export function PinSetupModal({ visible }: Props) {
  const { savePin, logEvent } = useSecurity();
  const { profile } = useProfile();
  const [step, setStep] = useState<'enter' | 'confirm'>('enter');
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const shake = useRef(new Animated.Value(0)).current;

  const doShake = () => {
    Animated.sequence([
      Animated.timing(shake, { toValue: 10, duration: 55, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -10, duration: 55, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 6, duration: 55, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 55, useNativeDriver: true }),
    ]).start();
  };

  const current = step === 'enter' ? pin : confirm;
  const setCurrent = step === 'enter' ? setPin : setConfirm;

  const press = (d: string) => {
    if (d === '⌫') { setCurrent(p => p.slice(0, -1)); setError(''); return; }
    if (!d) return;
    if (current.length >= LEN) return;
    const next = current + d;
    setCurrent(next);
    setError('');
    if (next.length === LEN) {
      if (step === 'enter') {
        setTimeout(() => setStep('confirm'), 280);
      } else {
        if (next !== pin) {
          doShake(); setError('PINs do not match. Try again.');
          setConfirm(''); setStep('enter'); setPin('');
        } else {
          savePin(pin, profile?.id).then(() => {
            if (profile?.id) logEvent(profile.id, 'pin_created');
          });
        }
      }
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent presentationStyle="overFullScreen">
      <View style={s.overlay}>
        <View style={s.card}>
          <View style={s.iconBox}>
            <LinearGradient colors={['#1e1b35','#0e0c1e']} style={s.iconBg}>
              <Shield size={30} color={colors.primary} strokeWidth={2} />
            </LinearGradient>
          </View>
          <Text style={s.title}>{step === 'enter' ? 'Create Your PIN' : 'Confirm Your PIN'}</Text>
          <Text style={s.sub}>
            {step === 'enter' ? 'Choose a 6-digit PIN to protect your wallet' : 'Enter the same PIN again to confirm'}
          </Text>
          <Animated.View style={[s.dots, { transform: [{ translateX: shake }] }]}>
            {Array.from({ length: LEN }).map((_, i) => (
              <View key={i} style={[s.dot, i < current.length && s.dotOn]} />
            ))}
          </Animated.View>
          {error ? <Text style={s.err}>{error}</Text> : null}
          <View style={s.pad}>
            {PAD.map((d, i) => (
              <TouchableOpacity
                key={i}
                style={[s.key, !d && s.keyGhost]}
                onPress={() => press(d)}
                disabled={!d && d !== '0'}
                activeOpacity={0.65}
              >
                {d === '⌫'
                  ? <Delete size={22} color={colors.textSecondary} strokeWidth={1.8} />
                  : <Text style={s.keyTxt}>{d}</Text>
                }
              </TouchableOpacity>
            ))}
          </View>
          <Text style={s.note}>Your PIN is stored securely on this device only.</Text>
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
  dots: { flexDirection: 'row', gap: 14, marginBottom: spacing.lg },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: 'rgba(139,92,246,0.4)', backgroundColor: 'transparent' },
  dotOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  err: { color: '#ef4444', fontSize: fontSize.xs, textAlign: 'center', marginBottom: spacing.md },
  pad: { flexDirection: 'row', flexWrap: 'wrap', width: 232, gap: 10, justifyContent: 'center', marginBottom: spacing.xl },
  key: { width: 66, height: 66, borderRadius: 33, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', justifyContent: 'center', alignItems: 'center' },
  keyGhost: { backgroundColor: 'transparent', borderColor: 'transparent' },
  keyTxt: { fontSize: 24, fontWeight: '600', color: colors.white },
  note: { fontSize: 11, color: colors.textMuted, textAlign: 'center', opacity: 0.6 },
});
