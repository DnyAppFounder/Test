import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, ActivityIndicator } from 'react-native';
import { AtSign } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, fontSize } from '@/constants/theme';
import { useProfile } from '@/contexts/ProfileContext';
import { useSecurity } from '@/contexts/SecurityContext';
import { supabase } from '@/lib/supabase';

const RESERVED = new Set(['admin','support','dawen','official','verification','verified','moderator','root','system']);

function validate(v: string): string | null {
  const t = v.trim();
  if (t.length < 3) return 'At least 3 characters required.';
  if (t.length > 20) return 'Maximum 20 characters.';
  if (!/^[a-z0-9_]+$/.test(t)) return 'Lowercase letters, numbers, and _ only.';
  if (RESERVED.has(t)) return 'That username is reserved.';
  return null;
}

interface Props { visible: boolean }

export function UsernameSetupModal({ visible }: Props) {
  const { profile, updateProfile, refreshProfile } = useProfile();
  const { logEvent } = useSecurity();
  const [val, setVal] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const save = async () => {
    const t = val.trim();
    const err = validate(t);
    if (err) { setError(err); return; }
    setLoading(true); setError('');
    try {
      const { data: existing } = await supabase
        .from('user_profiles').select('id').eq('username', t)
        .neq('id', profile?.id ?? '').maybeSingle();
      if (existing) { setError('Username already taken.'); setLoading(false); return; }
      await updateProfile({ username: t, username_last_changed_at: new Date().toISOString() });
      await refreshProfile();
      if (profile?.id) logEvent(profile.id, 'username_created');
    } catch (e: any) {
      setError(e?.message || 'Could not save username.');
    } finally {
      setLoading(false);
    }
  };

  const canSave = val.trim().length >= 3 && !loading;

  return (
    <Modal visible={visible} animationType="fade" transparent presentationStyle="overFullScreen">
      <View style={s.overlay}>
        <View style={s.card}>
          <View style={s.iconBox}>
            <LinearGradient colors={['#1e1b35','#0e0c1e']} style={s.iconBg}>
              <AtSign size={30} color={colors.primary} strokeWidth={2} />
            </LinearGradient>
          </View>
          <Text style={s.title}>Choose Your Username</Text>
          <Text style={s.sub}>Your public identity on DAWEN. Lowercase, numbers, underscore only.</Text>
          <View style={[s.inputRow, error ? s.inputErr : null]}>
            <Text style={s.prefix}>@</Text>
            <TextInput
              style={s.input}
              value={val}
              onChangeText={v => { setVal(v.toLowerCase()); setError(''); }}
              placeholder="yourname"
              placeholderTextColor="rgba(255,255,255,0.2)"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={20}
            />
          </View>
          {error ? <Text style={s.err}>{error}</Text> : null}
          <Text style={s.hint}>3–20 characters · No spaces · No reserved words</Text>
          <TouchableOpacity style={[s.btn, !canSave && s.btnOff]} onPress={save} disabled={!canSave} activeOpacity={0.85}>
            {loading
              ? <ActivityIndicator color={colors.white} size="small" />
              : (
                <LinearGradient colors={['#8B5CF6','#6D28D9']} start={{x:0,y:0}} end={{x:1,y:0}} style={s.btnGrad}>
                  <Text style={s.btnTxt}>Set Username</Text>
                </LinearGradient>
              )
            }
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
  sub: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', lineHeight: 20, marginBottom: spacing.xl },
  inputRow: { flexDirection: 'row', alignItems: 'center', width: '100%', borderWidth: 1.5, borderColor: 'rgba(139,92,246,0.3)', borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.04)', paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  inputErr: { borderColor: 'rgba(239,68,68,0.6)' },
  prefix: { fontSize: 18, color: colors.primary, fontWeight: '700', marginRight: 5 },
  input: { flex: 1, fontSize: 18, color: colors.white, paddingVertical: 16, fontWeight: '600' },
  err: { color: '#ef4444', fontSize: fontSize.xs, textAlign: 'center', marginBottom: spacing.sm },
  hint: { fontSize: 11, color: colors.textMuted, marginBottom: spacing.xl },
  btn: { width: '100%', borderRadius: 14, overflow: 'hidden' },
  btnOff: { opacity: 0.45 },
  btnGrad: { paddingVertical: 16, alignItems: 'center', borderRadius: 14 },
  btnTxt: { color: colors.white, fontSize: fontSize.md, fontWeight: '700' },
});
