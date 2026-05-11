import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { Key, CircleCheck as CheckCircle, TriangleAlert as AlertTriangle } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, fontSize } from '@/constants/theme';
import { SecureWalletManager } from '@/lib/wallet/SecureWalletManager';
import { useSecurity } from '@/contexts/SecurityContext';
import { useProfile } from '@/contexts/ProfileContext';

interface Props { visible: boolean }

export function SeedBackupModal({ visible }: Props) {
  const { confirmSeedBackup, logEvent } = useSecurity();
  const { profile } = useProfile();
  const [words, setWords] = useState<string[]>([]);
  const [step, setStep] = useState<'warning' | 'words' | 'verify'>('warning');
  const [verifyIdx] = useState<number[]>(() => {
    const picks: number[] = [];
    while (picks.length < 3) {
      const r = Math.floor(Math.random() * 12);
      if (!picks.includes(r)) picks.push(r);
    }
    return picks.sort((a, b) => a - b);
  });
  const [selected, setSelected] = useState<number[]>([]);
  const [error, setError] = useState('');
  const [understood, setUnderstood] = useState(false);
  const [backedUp, setBackedUp] = useState(false);

  useEffect(() => {
    if (!visible) return;
    SecureWalletManager.getInstance().getMnemonicUnlocked()
      .then(m => { if (m) setWords(m.trim().split(/\s+/)); })
      .catch(() => {});
  }, [visible]);

  const confirm = async () => {
    if (selected.length !== 3) { setError('Select the 3 highlighted words in order.'); return; }
    const ok = verifyIdx.every((idx, i) => selected[i] === idx);
    if (!ok) { setError('Incorrect order. Review your seed phrase.'); setSelected([]); return; }
    await confirmSeedBackup(profile?.id);
    if (profile?.id) logEvent(profile.id, 'seed_backup_confirmed');
  };

  const toggle = (idx: number) => {
    setError('');
    if (selected.includes(idx)) { setSelected(s => s.filter(i => i !== idx)); }
    else if (selected.length < 3) { setSelected(s => [...s, idx]); }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent presentationStyle="overFullScreen">
      <View style={s.overlay}>
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          <View style={s.card}>
            {step === 'warning' && (
              <>
                <View style={s.iconBox}>
                  <LinearGradient colors={['#1e1b35','#0e0c1e']} style={s.iconBg}>
                    <AlertTriangle size={30} color="#f59e0b" strokeWidth={2} />
                  </LinearGradient>
                </View>
                <Text style={s.title}>Back Up Your Seed Phrase</Text>
                <Text style={s.sub}>
                  Your 12-word seed phrase is the only way to recover your wallet.
                  DAWEN cannot recover your wallet if you lose it.
                </Text>
                <View style={s.warnBox}>
                  <Text style={s.warnTxt}>
                    · Write it on paper, not digitally{'\n'}
                    · Store it in a safe place{'\n'}
                    · Never share it with anyone{'\n'}
                    · Anyone with these words controls your funds
                  </Text>
                </View>
                <TouchableOpacity style={s.checkRow} onPress={() => setUnderstood(v => !v)} activeOpacity={0.8}>
                  <View style={[s.cb, understood && s.cbOn]}>
                    {understood && <CheckCircle size={14} color="#fff" strokeWidth={2.5} />}
                  </View>
                  <Text style={s.cbLabel}>I understand DAWEN cannot recover my wallet.</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.checkRow} onPress={() => setBackedUp(v => !v)} activeOpacity={0.8}>
                  <View style={[s.cb, backedUp && s.cbOn]}>
                    {backedUp && <CheckCircle size={14} color="#fff" strokeWidth={2.5} />}
                  </View>
                  <Text style={s.cbLabel}>I have safely backed up my recovery phrase.</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.btn, (!understood || !backedUp) && s.btnOff]}
                  onPress={() => setStep('words')}
                  disabled={!understood || !backedUp}
                  activeOpacity={0.85}
                >
                  <LinearGradient colors={['#8B5CF6','#6D28D9']} start={{x:0,y:0}} end={{x:1,y:0}} style={s.btnGrad}>
                    <Text style={s.btnTxt}>Show Seed Phrase</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}

            {step === 'words' && words.length > 0 && (
              <>
                <View style={s.iconBox}>
                  <LinearGradient colors={['#1e1b35','#0e0c1e']} style={s.iconBg}>
                    <Key size={30} color={colors.primary} strokeWidth={2} />
                  </LinearGradient>
                </View>
                <Text style={s.title}>Your Seed Phrase</Text>
                <Text style={s.sub}>Write all 12 words in order on paper. Highlighted words will be verified next.</Text>
                <View style={s.grid}>
                  {words.map((w, i) => (
                    <View key={i} style={[s.chip, verifyIdx.includes(i) && s.chipHl]}>
                      <Text style={s.chipNum}>{i + 1}</Text>
                      <Text style={s.chipTxt}>{w}</Text>
                    </View>
                  ))}
                </View>
                <TouchableOpacity style={s.btn} onPress={() => setStep('verify')} activeOpacity={0.85}>
                  <LinearGradient colors={['#8B5CF6','#6D28D9']} start={{x:0,y:0}} end={{x:1,y:0}} style={s.btnGrad}>
                    <Text style={s.btnTxt}>I've Written It Down</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}

            {step === 'verify' && (
              <>
                <Text style={s.title}>Verify Your Backup</Text>
                <Text style={s.sub}>Tap words {verifyIdx.map(i => `#${i+1}`).join(', ')} from your phrase, in order.</Text>
                <View style={s.grid}>
                  {words.map((w, i) => {
                    const isTarget = verifyIdx.includes(i);
                    const isSel = selected.includes(i);
                    return (
                      <TouchableOpacity
                        key={i}
                        style={[s.chip, isTarget && s.chipTarget, isSel && s.chipSel, !isTarget && s.chipBlur]}
                        onPress={() => isTarget && toggle(i)}
                        disabled={!isTarget}
                        activeOpacity={0.7}
                      >
                        <Text style={s.chipNum}>{i + 1}</Text>
                        <Text style={[s.chipTxt, !isTarget && s.chipTxtBlur]}>{isTarget ? w : '•••'}</Text>
                        {isSel && <CheckCircle size={11} color="#10b981" style={{ marginLeft: 2 }} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {error ? <Text style={s.err}>{error}</Text> : null}
                <TouchableOpacity
                  style={[s.btn, selected.length < 3 && s.btnOff]}
                  onPress={confirm}
                  disabled={selected.length < 3}
                  activeOpacity={0.85}
                >
                  <LinearGradient colors={['#8B5CF6','#6D28D9']} start={{x:0,y:0}} end={{x:1,y:0}} style={s.btnGrad}>
                    <Text style={s.btnTxt}>Confirm Backup</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(6,6,13,0.97)' },
  scroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 32, paddingHorizontal: spacing.lg },
  card: { width: '100%', maxWidth: 400, backgroundColor: '#0F0F1A', borderRadius: 24, padding: spacing.xl, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(139,92,246,0.2)' },
  iconBox: { marginBottom: spacing.lg },
  iconBg: { width: 60, height: 60, borderRadius: 18, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)' },
  title: { fontSize: 20, fontWeight: '800', color: colors.white, textAlign: 'center', marginBottom: 6 },
  sub: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', lineHeight: 20, marginBottom: spacing.lg },
  warnBox: { backgroundColor: 'rgba(245,158,11,0.08)', borderRadius: 12, padding: spacing.lg, borderWidth: 1, borderColor: 'rgba(245,158,11,0.2)', marginBottom: spacing.lg, width: '100%' },
  warnTxt: { fontSize: fontSize.sm, color: '#fbbf24', lineHeight: 22 },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: spacing.md, width: '100%' },
  cb: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: 'rgba(139,92,246,0.5)', justifyContent: 'center', alignItems: 'center', flexShrink: 0, marginTop: 1 },
  cbOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  cbLabel: { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20, flex: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, justifyContent: 'center', marginBottom: spacing.lg, width: '100%' },
  chip: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', minWidth: 84 },
  chipHl: { borderColor: 'rgba(139,92,246,0.55)', backgroundColor: 'rgba(139,92,246,0.09)' },
  chipTarget: { borderColor: 'rgba(139,92,246,0.5)', backgroundColor: 'rgba(139,92,246,0.08)' },
  chipSel: { borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)' },
  chipBlur: { opacity: 0.35 },
  chipNum: { fontSize: 10, color: colors.textMuted, marginRight: 4, minWidth: 14 },
  chipTxt: { fontSize: 13, color: colors.white, fontWeight: '600' },
  chipTxtBlur: { color: colors.textMuted },
  err: { color: '#ef4444', fontSize: fontSize.xs, textAlign: 'center', marginBottom: spacing.sm },
  btn: { width: '100%', borderRadius: 14, overflow: 'hidden', marginTop: spacing.sm },
  btnOff: { opacity: 0.45 },
  btnGrad: { paddingVertical: 16, alignItems: 'center', borderRadius: 14 },
  btnTxt: { color: colors.white, fontSize: fontSize.md, fontWeight: '700' },
});
