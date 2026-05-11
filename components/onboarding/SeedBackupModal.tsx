import { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { Key, CircleCheck as CheckCircle, TriangleAlert as AlertTriangle, Copy, X } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
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

  // Shuffled word pool, stabilised when entering verify step
  const [shuffledWords, setShuffledWords] = useState<string[]>([]);
  // selected is an array of indices into words[] (not shuffledWords)
  const [selected, setSelected] = useState<number[]>([]);
  const [error, setError] = useState('');
  const [understood, setUnderstood] = useState(false);
  const [backedUp, setBackedUp] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);

  useEffect(() => {
    if (!visible) return;
    SecureWalletManager.getInstance().getMnemonicUnlocked()
      .then(m => { if (m) setWords(m.trim().split(/\s+/)); })
      .catch(() => {});
  }, [visible]);

  const handleCopyAll = async () => {
    if (words.length === 0) return;
    await Clipboard.setStringAsync(words.join(' '));
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 3000);
  };

  const goToVerify = () => {
    const shuffled = [...words].sort(() => Math.random() - 0.5);
    setShuffledWords(shuffled);
    setSelected([]);
    setError('');
    setStep('verify');
  };

  const confirm = async () => {
    if (selected.length !== 3) { setError('Select all 3 required words in order.'); return; }
    const ok = verifyIdx.every((idx, i) => selected[i] === idx);
    if (!ok) { setError('Incorrect. Review your seed phrase and try again.'); setSelected([]); return; }
    await confirmSeedBackup(profile?.id);
    if (profile?.id) logEvent(profile.id, 'seed_backup_confirmed');
  };

  const selectWord = (wordStr: string) => {
    setError('');
    const idx = words.indexOf(wordStr);
    if (idx === -1) return;
    if (selected.includes(idx)) return; // already selected
    if (selected.length >= 3) return;
    setSelected(s => [...s, idx]);
  };

  const removeSelected = (position: number) => {
    setSelected(s => s.filter((_, i) => i !== position));
    setError('');
  };

  const nextRequiredPos = verifyIdx[selected.length]; // 0-based index of next required word
  const nextRequiredNum = nextRequiredPos !== undefined ? nextRequiredPos + 1 : null;

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
                <Text style={s.sub}>Write all 12 words in order on paper before continuing.</Text>
                <View style={s.grid}>
                  {words.map((w, i) => (
                    <View key={i} style={s.chip}>
                      <Text style={s.chipNum}>{i + 1}</Text>
                      <Text style={s.chipTxt}>{w}</Text>
                    </View>
                  ))}
                </View>

                {/* Copy All button */}
                <TouchableOpacity style={s.copyRow} onPress={handleCopyAll} activeOpacity={0.8}>
                  <Copy size={14} color={copyFeedback ? '#10b981' : colors.primary} strokeWidth={2} />
                  <Text style={[s.copyTxt, copyFeedback && s.copyTxtDone]}>
                    {copyFeedback ? 'Copied! Store it safely.' : 'Copy All'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity style={s.btn} onPress={goToVerify} activeOpacity={0.85}>
                  <LinearGradient colors={['#8B5CF6','#6D28D9']} start={{x:0,y:0}} end={{x:1,y:0}} style={s.btnGrad}>
                    <Text style={s.btnTxt}>I've Written It Down</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}

            {step === 'verify' && (
              <>
                <Text style={s.title}>Verify Your Backup</Text>
                <Text style={s.sub}>
                  Select words{' '}
                  {verifyIdx.map(i => `#${i + 1}`).join(', ')}{' '}
                  from your phrase in order.
                </Text>

                {/* Progress slots */}
                <View style={s.slotRow}>
                  {verifyIdx.map((targetIdx, pos) => {
                    const filledWordIdx = selected[pos];
                    const isFilled = filledWordIdx !== undefined;
                    return (
                      <TouchableOpacity
                        key={pos}
                        style={[s.slot, isFilled && s.slotFilled]}
                        onPress={() => isFilled && removeSelected(pos)}
                        activeOpacity={isFilled ? 0.7 : 1}
                      >
                        <Text style={s.slotNum}>#{targetIdx + 1}</Text>
                        {isFilled ? (
                          <View style={s.slotWordRow}>
                            <Text style={s.slotWord}>{words[filledWordIdx]}</Text>
                            <X size={10} color="rgba(255,255,255,0.5)" />
                          </View>
                        ) : (
                          <Text style={s.slotEmpty}>
                            {pos === selected.length ? '↑ tap below' : '—'}
                          </Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {nextRequiredNum !== null && (
                  <Text style={s.hint}>Now select word <Text style={{ color: colors.primary }}>#{nextRequiredNum}</Text></Text>
                )}

                {/* Shuffled word pool */}
                <View style={s.pool}>
                  {shuffledWords.map((w, i) => {
                    const wordIdx = words.indexOf(w);
                    const isUsed = selected.includes(wordIdx);
                    return (
                      <TouchableOpacity
                        key={i}
                        style={[s.poolChip, isUsed && s.poolChipUsed]}
                        onPress={() => !isUsed && selectWord(w)}
                        disabled={isUsed}
                        activeOpacity={0.7}
                      >
                        <Text style={[s.poolChipTxt, isUsed && s.poolChipTxtUsed]}>{w}</Text>
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

                <TouchableOpacity onPress={() => { setStep('words'); setSelected([]); setError(''); }} activeOpacity={0.7} style={{ marginTop: 12 }}>
                  <Text style={s.backLink}>Review seed phrase again</Text>
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, justifyContent: 'center', marginBottom: spacing.md, width: '100%' },
  chip: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', minWidth: 84 },
  chipNum: { fontSize: 10, color: colors.textMuted, marginRight: 4, minWidth: 14 },
  chipTxt: { fontSize: 13, color: colors.white, fontWeight: '600' },
  // Copy All
  copyRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.lg, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 10, backgroundColor: 'rgba(139,92,246,0.08)', borderWidth: 1, borderColor: 'rgba(139,92,246,0.2)' },
  copyTxt: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '600' },
  copyTxtDone: { color: '#10b981' },
  // Verify slots
  slotRow: { flexDirection: 'row', gap: 8, marginBottom: 12, width: '100%' },
  slot: { flex: 1, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)', backgroundColor: 'rgba(139,92,246,0.05)', padding: 8, alignItems: 'center', minHeight: 56 },
  slotFilled: { borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.08)' },
  slotNum: { fontSize: 10, color: colors.textMuted, marginBottom: 4 },
  slotWordRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  slotWord: { fontSize: 12, color: '#10b981', fontWeight: '700' },
  slotEmpty: { fontSize: 11, color: 'rgba(255,255,255,0.2)', fontStyle: 'italic' },
  hint: { fontSize: fontSize.xs, color: colors.textMuted, marginBottom: spacing.md, textAlign: 'center' },
  // Word pool
  pool: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginBottom: spacing.lg, width: '100%' },
  poolChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  poolChipUsed: { opacity: 0.3, backgroundColor: 'transparent' },
  poolChipTxt: { fontSize: 13, color: colors.white, fontWeight: '600' },
  poolChipTxtUsed: { color: colors.textMuted },
  err: { color: '#ef4444', fontSize: fontSize.xs, textAlign: 'center', marginBottom: spacing.sm },
  backLink: { fontSize: fontSize.sm, color: colors.textMuted, textDecorationLine: 'underline' },
  btn: { width: '100%', borderRadius: 14, overflow: 'hidden', marginTop: spacing.sm },
  btnOff: { opacity: 0.45 },
  btnGrad: { paddingVertical: 16, alignItems: 'center', borderRadius: 14 },
  btnTxt: { color: colors.white, fontSize: fontSize.md, fontWeight: '700' },
});
