import { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Animated } from 'react-native';
import { Delete, Lock, X } from 'lucide-react-native';
import { colors, spacing, fontSize } from '@/constants/theme';
import { useSecurity } from '@/contexts/SecurityContext';
import { useProfile } from '@/contexts/ProfileContext';

const LEN = 6;
const PAD = ['1','2','3','4','5','6','7','8','9','','0','⌫'];
const MAX_TRIES = 5;

interface Props {
  visible: boolean;
  title?: string;
  subtitle?: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export function PinUnlockModal({
  visible,
  title = 'Enter PIN',
  subtitle = 'Confirm your identity to continue',
  onSuccess,
  onCancel,
}: Props) {
  const { pinHash, checkPin, logEvent } = useSecurity();
  const { profile } = useProfile();
  const [pin, setPin] = useState('');
  const [tries, setTries] = useState(0);
  const [error, setError] = useState('');
  const shake = useRef(new Animated.Value(0)).current;

  if (!pinHash && visible) {
    // No PIN set — pass through (shouldn't happen after onboarding completes)
    setTimeout(onSuccess, 0);
    return null;
  }

  const doShake = () => {
    Animated.sequence([
      Animated.timing(shake, { toValue: 10, duration: 55, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -10, duration: 55, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 6, duration: 55, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 55, useNativeDriver: true }),
    ]).start();
  };

  const press = (d: string) => {
    if (d === '⌫') { setPin(p => p.slice(0, -1)); setError(''); return; }
    if (!d || tries >= MAX_TRIES) return;
    if (pin.length >= LEN) return;
    const next = pin + d;
    setPin(next);
    setError('');
    if (next.length === LEN) {
      if (checkPin(next)) {
        setPin(''); setTries(0); setError('');
        onSuccess();
      } else {
        const t = tries + 1;
        setTries(t);
        doShake(); setPin('');
        if (profile?.id) logEvent(profile.id, 'failed_pin_attempt');
        if (t >= MAX_TRIES) {
          setError('Too many failed attempts. Please try again later.');
        } else {
          setError(`Incorrect PIN. ${MAX_TRIES - t} attempt${MAX_TRIES - t !== 1 ? 's' : ''} remaining.`);
        }
      }
    }
  };

  const cancel = () => { setPin(''); setError(''); onCancel(); };
  const locked = tries >= MAX_TRIES;

  return (
    <Modal visible={visible} animationType="fade" transparent presentationStyle="overFullScreen">
      <View style={s.overlay}>
        <View style={s.card}>
          <TouchableOpacity style={s.closeBtn} onPress={cancel} activeOpacity={0.7}>
            <X size={18} color={colors.textMuted} strokeWidth={2} />
          </TouchableOpacity>
          <View style={s.iconBox}>
            <Lock size={26} color={colors.primary} strokeWidth={2} />
          </View>
          <Text style={s.title}>{title}</Text>
          <Text style={s.sub}>{subtitle}</Text>
          <Animated.View style={[s.dots, { transform: [{ translateX: shake }] }]}>
            {Array.from({ length: LEN }).map((_, i) => (
              <View key={i} style={[s.dot, i < pin.length && s.dotOn]} />
            ))}
          </Animated.View>
          {error ? <Text style={s.err}>{error}</Text> : null}
          {!locked && (
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
          )}
          <TouchableOpacity onPress={cancel} style={s.cancelLink} activeOpacity={0.7}>
            <Text style={s.cancelTxt}>Cancel transaction</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(6,6,13,0.96)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xl },
  card: { width: '100%', maxWidth: 360, backgroundColor: '#0F0F1A', borderRadius: 24, padding: spacing.xxl, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(139,92,246,0.2)', position: 'relative' },
  closeBtn: { position: 'absolute', top: 14, right: 14, width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.06)', justifyContent: 'center', alignItems: 'center' },
  iconBox: { width: 52, height: 52, borderRadius: 16, backgroundColor: 'rgba(139,92,246,0.1)', borderWidth: 1, borderColor: 'rgba(139,92,246,0.22)', justifyContent: 'center', alignItems: 'center', marginBottom: spacing.lg },
  title: { fontSize: fontSize.xl, fontWeight: '800', color: colors.white, textAlign: 'center', marginBottom: 4 },
  sub: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.xl },
  dots: { flexDirection: 'row', gap: 14, marginBottom: spacing.lg },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: 'rgba(139,92,246,0.4)', backgroundColor: 'transparent' },
  dotOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  err: { color: '#ef4444', fontSize: fontSize.xs, textAlign: 'center', marginBottom: spacing.md, lineHeight: 18 },
  pad: { flexDirection: 'row', flexWrap: 'wrap', width: 232, gap: 10, justifyContent: 'center', marginBottom: spacing.xl },
  key: { width: 66, height: 66, borderRadius: 33, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', justifyContent: 'center', alignItems: 'center' },
  keyGhost: { backgroundColor: 'transparent', borderColor: 'transparent' },
  keyTxt: { fontSize: 24, fontWeight: '600', color: colors.white },
  cancelLink: { paddingVertical: spacing.sm },
  cancelTxt: { fontSize: fontSize.sm, color: colors.textMuted, textDecorationLine: 'underline' },
});
