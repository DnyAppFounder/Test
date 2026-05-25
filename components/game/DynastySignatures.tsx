import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView,
  ActivityIndicator, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Crown, Pen, Check, ChevronDown, ChevronUp } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { SocialService } from '@/services/socialService';
import { colors, spacing, borderRadius, fontSize, elevation } from '@/constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

interface GameSignature {
  id: string;
  user_id: string;
  wallet_address: string;
  signature_text: string;
  signature_color: string;
  animation_type: string;
  created_at: string;
}

// ─── Color catalogue ──────────────────────────────────────────────────────────

const COLOR_OPTIONS: { label: string; hex: string }[] = [
  { label: 'Purple',        hex: '#9333EA' },
  { label: 'Neon Purple',   hex: '#C026D3' },
  { label: 'Deep Violet',   hex: '#5B21B6' },
  { label: 'Electric Violet', hex: '#A855F7' },
  { label: 'Lavender',      hex: '#C4B5FD' },
  { label: 'Magenta',       hex: '#E879F9' },
  { label: 'Neon Pink',     hex: '#F472B6' },
  { label: 'Rose',          hex: '#FB7185' },
  { label: 'Crimson',       hex: '#DC2626' },
  { label: 'Red',           hex: '#EF4444' },
  { label: 'Orange',        hex: '#F97316' },
  { label: 'Amber',         hex: '#F59E0B' },
  { label: 'Gold',          hex: '#EAB308' },
  { label: 'Yellow',        hex: '#FACC15' },
  { label: 'Lime',          hex: '#84CC16' },
  { label: 'Neon Green',    hex: '#4ADE80' },
  { label: 'Emerald',       hex: '#10B981' },
  { label: 'Cyan',          hex: '#22D3EE' },
  { label: 'Aqua',          hex: '#06B6D4' },
  { label: 'Sky Blue',      hex: '#38BDF8' },
  { label: 'Electric Blue', hex: '#60A5FA' },
  { label: 'Royal Blue',    hex: '#3B82F6' },
  { label: 'Indigo',        hex: '#6366F1' },
  { label: 'White',         hex: '#FFFFFF' },
  { label: 'Silver',        hex: '#94A3B8' },
  { label: 'Black',         hex: '#1E1E2E' },
  { label: 'Graphite',      hex: '#475569' },
  { label: 'Rainbow',       hex: 'rainbow' },
  { label: 'Holographic',   hex: 'holographic' },
  { label: 'Chrome',        hex: 'chrome' },
];

// ─── Animation catalogue ──────────────────────────────────────────────────────

const ANIMATION_OPTIONS: string[] = [
  'Static', 'Glow Pulse', 'Neon Flicker', 'Floating', 'Sparkle', 'Wave',
  'Glitch', 'Cyber Glitch', 'Fire Glow', 'Electric Shock', 'Lightning',
  'Pulse Beat', 'Soft Bounce', 'Rotate Shine', 'Typing Effect', 'Matrix Rain',
  'Hologram', 'Stardust', 'Comet Trail', 'Plasma Glow', 'Rainbow Flow',
  'Chrome Shine', 'Smoke Fade', 'Energy Aura', 'Crown Shine',
];

const SAFE_TEXT_RE = /^[A-Za-z0-9_\-]+$/;
const MAX_VISIBLE = 30;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveColor(colorHex: string): string {
  if (colorHex === 'rainbow') return '#FF6B6B';
  if (colorHex === 'holographic') return '#A78BFA';
  if (colorHex === 'chrome') return '#CBD5E1';
  return colorHex;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

function animStyle(anim: string, colorHex: string): object {
  // All animations are represented via border/glow effects on web.
  // On native these degrade gracefully to plain text.
  const col = resolveColor(colorHex);
  if (Platform.OS !== 'web') return {};
  switch (anim) {
    case 'Glow Pulse':
    case 'Plasma Glow':
    case 'Energy Aura':
      return {
        textShadow: `0 0 8px ${col}, 0 0 16px ${col}55`,
        animation: 'dawen-pulse 2s ease-in-out infinite',
      };
    case 'Neon Flicker':
    case 'Lightning':
    case 'Electric Shock':
      return {
        textShadow: `0 0 6px ${col}`,
        animation: 'dawen-flicker 1.5s step-end infinite',
      };
    case 'Floating':
    case 'Soft Bounce':
      return {
        animation: 'dawen-float 3s ease-in-out infinite',
      };
    case 'Fire Glow':
      return {
        textShadow: `0 0 10px #FF6B00, 0 0 20px #FF4500`,
        animation: 'dawen-pulse 1.2s ease-in-out infinite',
      };
    case 'Crown Shine':
    case 'Chrome Shine':
    case 'Rotate Shine':
      return {
        animation: 'dawen-shine 2s linear infinite',
        background: `linear-gradient(90deg, ${col}, #fff, ${col})`,
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
      };
    default:
      return {};
  }
}

// ─── Signature Text renderer ──────────────────────────────────────────────────

function SigText({ text, colorHex, anim, large }: { text: string; colorHex: string; anim: string; large?: boolean }) {
  const col = resolveColor(colorHex);
  const extra = Platform.OS === 'web' ? animStyle(anim, colorHex) : {};
  return (
    <Text
      style={[
        sigStyles.text,
        large && sigStyles.textLarge,
        { color: col },
        extra as any,
      ]}
      numberOfLines={1}
    >
      {text}
    </Text>
  );
}

// ─── Signature Card ───────────────────────────────────────────────────────────

function SignatureCard({ sig, owned }: { sig: GameSignature; owned?: boolean }) {
  const colorOption = COLOR_OPTIONS.find(c => c.label === sig.signature_color);
  const hex = colorOption?.hex ?? '#A78BFA';
  const col = resolveColor(hex);
  return (
    <View style={[sigStyles.card, owned && { borderColor: `${col}55` }]}>
      <LinearGradient
        colors={[`${col}12`, `${col}04`]}
        style={StyleSheet.absoluteFill}
      />
      {owned && (
        <View style={sigStyles.ownedBadge}>
          <Crown size={9} color={col} strokeWidth={2.5} />
          <Text style={[sigStyles.ownedBadgeText, { color: col }]}>YOUR SIGNATURE</Text>
        </View>
      )}
      <SigText text={sig.signature_text} colorHex={hex} anim={sig.animation_type} large={owned} />
      <View style={sigStyles.cardMeta}>
        <View style={[sigStyles.colorDot, { backgroundColor: col }]} />
        <Text style={sigStyles.cardMetaText}>{sig.signature_color}</Text>
        <Text style={sigStyles.cardMetaSep}>·</Text>
        <Text style={sigStyles.cardMetaText}>{sig.animation_type}</Text>
        <Text style={sigStyles.cardMetaSep}>·</Text>
        <Text style={sigStyles.cardMetaText}>{formatDate(sig.created_at)}</Text>
      </View>
    </View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  walletAddress: string | null;
}

export function DynastySignatures({ walletAddress }: Props) {
  const [mySignature, setMySignature] = useState<GameSignature | null | undefined>(undefined);
  const [wall, setWall] = useState<GameSignature[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [loadingMine, setLoadingMine] = useState(true);
  const [loadingWall, setLoadingWall] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [text, setText] = useState('');
  const [selectedColor, setSelectedColor] = useState<string>('Purple');
  const [selectedAnim, setSelectedAnim] = useState<string>('Glow Pulse');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showAnimPicker, setShowAnimPicker] = useState(false);

  const loadMySignature = useCallback(async () => {
    if (!walletAddress) { setLoadingMine(false); setMySignature(null); return; }
    try {
      const { data } = await supabase
        .from('game_signatures')
        .select('*')
        .eq('wallet_address', walletAddress)
        .maybeSingle();
      setMySignature(data ?? null);
    } catch {
      setMySignature(null);
    } finally {
      setLoadingMine(false);
    }
  }, [walletAddress]);

  const loadWall = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('game_signatures')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(MAX_VISIBLE + 5);
      setWall(data ?? []);
    } catch {
      setWall([]);
    } finally {
      setLoadingWall(false);
    }
  }, []);

  useEffect(() => {
    loadMySignature();
    loadWall();
  }, [loadMySignature, loadWall]);

  const validateText = (val: string): string | null => {
    if (!val.trim()) return 'Signature cannot be empty.';
    if (val.includes(' ')) return 'Spaces are not allowed.';
    if (val.length > 15) return 'Maximum 15 characters.';
    if (!SAFE_TEXT_RE.test(val)) return 'Only letters, numbers, _ and - are allowed.';
    return null;
  };

  const handleTextChange = (val: string) => {
    const clean = val.replace(/\s/g, '').slice(0, 15);
    setText(clean);
    if (error) setError(null);
  };

  const handleSave = async () => {
    if (!walletAddress) { setError('Connect your wallet first.'); return; }
    const textErr = validateText(text);
    if (textErr) { setError(textErr); return; }

    setSaving(true);
    setError(null);
    try {
      const profile = await SocialService.getOrCreateProfile(walletAddress);
      if (!profile) throw new Error('Could not resolve profile.');

      const { error: insertErr } = await supabase
        .from('game_signatures')
        .insert({
          user_id: profile.id,
          wallet_address: walletAddress,
          signature_text: text.trim(),
          signature_color: selectedColor,
          animation_type: selectedAnim,
        });

      if (insertErr) {
        if (insertErr.code === '23505') {
          setError('You already have a signature. Each user can only sign once.');
          await loadMySignature();
          return;
        }
        if (insertErr.code === '23514') {
          setError('Invalid signature text. Max 15 chars, no spaces, letters/numbers/_ and - only.');
          return;
        }
        throw insertErr;
      }

      await loadMySignature();
      await loadWall();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to save signature.');
    } finally {
      setSaving(false);
    }
  };

  const colorHexForSelected = COLOR_OPTIONS.find(c => c.label === selectedColor)?.hex ?? '#9333EA';
  const resolvedPreviewColor = resolveColor(colorHexForSelected);

  const visibleWall = showAll ? wall : wall.slice(0, 10);
  const hasMore = wall.length > 10;

  return (
    <View style={styles.root}>
      {/* ── Section Header ── */}
      <View style={styles.sectionHeader}>
        <View style={styles.sectionIconWrap}>
          <Crown size={18} color="#EAB308" strokeWidth={2} />
        </View>
        <View style={styles.sectionHeaderText}>
          <Text style={styles.sectionTitle}>Dynasty Signatures</Text>
          <Text style={styles.sectionSub}>Leave your mark on DAWEN forever.</Text>
        </View>
      </View>

      {/* ── My Signature or Creation Form ── */}
      {loadingMine ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color="#9333EA" />
        </View>
      ) : mySignature ? (
        // Already signed — show saved card
        <SignatureCard sig={mySignature} owned />
      ) : (
        // Not yet signed — show creation form
        <View style={styles.formCard}>
          <LinearGradient
            colors={['rgba(147,51,234,0.08)', 'rgba(109,40,217,0.03)']}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.formHeader}>
            <Pen size={14} color="#A78BFA" strokeWidth={2} />
            <Text style={styles.formTitle}>Create your signature</Text>
            <Text style={styles.formOnce}>Once — permanent</Text>
          </View>

          {/* Text input */}
          <TextInput
            style={styles.textInput}
            placeholder="Your signature (max 15 chars)"
            placeholderTextColor="rgba(255,255,255,0.25)"
            value={text}
            onChangeText={handleTextChange}
            maxLength={15}
            autoCapitalize="characters"
            autoCorrect={false}
            spellCheck={false}
          />
          <Text style={styles.charCount}>{text.length}/15</Text>

          {/* Color picker */}
          <TouchableOpacity
            style={styles.pickerRow}
            onPress={() => { setShowColorPicker(v => !v); setShowAnimPicker(false); }}
            activeOpacity={0.8}
          >
            <View style={[styles.colorSwatch, { backgroundColor: resolvedPreviewColor }]} />
            <Text style={styles.pickerLabel}>{selectedColor}</Text>
            {showColorPicker ? <ChevronUp size={14} color="rgba(255,255,255,0.4)" /> : <ChevronDown size={14} color="rgba(255,255,255,0.4)" />}
          </TouchableOpacity>
          {showColorPicker && (
            <View style={styles.colorGrid}>
              {COLOR_OPTIONS.map(c => {
                const isSelected = c.label === selectedColor;
                const hex = resolveColor(c.hex);
                return (
                  <TouchableOpacity
                    key={c.label}
                    style={[styles.colorCell, isSelected && { borderColor: hex, borderWidth: 2 }]}
                    onPress={() => { setSelectedColor(c.label); setShowColorPicker(false); }}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.colorCellDot, { backgroundColor: hex }]} />
                    <Text style={[styles.colorCellText, isSelected && { color: hex }]} numberOfLines={1}>{c.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Animation picker */}
          <TouchableOpacity
            style={styles.pickerRow}
            onPress={() => { setShowAnimPicker(v => !v); setShowColorPicker(false); }}
            activeOpacity={0.8}
          >
            <Text style={styles.pickerIconLabel}>✦</Text>
            <Text style={styles.pickerLabel}>{selectedAnim}</Text>
            {showAnimPicker ? <ChevronUp size={14} color="rgba(255,255,255,0.4)" /> : <ChevronDown size={14} color="rgba(255,255,255,0.4)" />}
          </TouchableOpacity>
          {showAnimPicker && (
            <View style={styles.animGrid}>
              {ANIMATION_OPTIONS.map(a => {
                const isSelected = a === selectedAnim;
                return (
                  <TouchableOpacity
                    key={a}
                    style={[styles.animCell, isSelected && styles.animCellSelected]}
                    onPress={() => { setSelectedAnim(a); setShowAnimPicker(false); }}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.animCellText, isSelected && styles.animCellTextSelected]}>{a}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Live preview */}
          {text.length > 0 && (
            <View style={styles.previewBox}>
              <Text style={styles.previewLabel}>Preview</Text>
              <SigText text={text || 'PREVIEW'} colorHex={colorHexForSelected} anim={selectedAnim} large />
            </View>
          )}

          {error && <Text style={styles.errorText}>{error}</Text>}

          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={['#9333EA', '#6D28D9']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.saveBtnGrad}
            >
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <><Check size={16} color="#fff" strokeWidth={2.5} /><Text style={styles.saveBtnText}>Sign Forever</Text></>
              }
            </LinearGradient>
          </TouchableOpacity>

          {!walletAddress && (
            <Text style={styles.noWalletNote}>Connect your wallet to create a signature.</Text>
          )}
        </View>
      )}

      {/* ── Wall of Signatures ── */}
      <View style={styles.wallHeader}>
        <Crown size={13} color="#EAB308" strokeWidth={2} />
        <Text style={styles.wallTitle}>Wall of Signatures</Text>
        {loadingWall && <ActivityIndicator size="small" color="#9333EA" style={{ marginLeft: 8 }} />}
      </View>

      {!loadingWall && wall.length === 0 && (
        <Text style={styles.wallEmpty}>No signatures yet. Be the first to sign.</Text>
      )}

      {visibleWall.map(sig => (
        <SignatureCard
          key={sig.id}
          sig={sig}
          owned={!!walletAddress && sig.wallet_address === walletAddress}
        />
      ))}

      {hasMore && !showAll && (
        <TouchableOpacity style={styles.loadMoreBtn} onPress={() => setShowAll(true)} activeOpacity={0.75}>
          <Text style={styles.loadMoreText}>Load more ({wall.length - 10} more)</Text>
          <ChevronDown size={14} color="#A78BFA" />
        </TouchableOpacity>
      )}

      {/* Inject CSS animations for web */}
      {Platform.OS === 'web' && (
        <style
          // @ts-ignore — web only
          dangerouslySetInnerHTML={{ __html: WEB_CSS }}
        />
      )}
    </View>
  );
}

// ─── Web CSS animations ───────────────────────────────────────────────────────

const WEB_CSS = `
@keyframes dawen-pulse {
  0%,100% { opacity: 1; text-shadow: inherit; }
  50% { opacity: 0.7; filter: brightness(1.4); }
}
@keyframes dawen-flicker {
  0%,19%,21%,23%,25%,54%,56%,100% { opacity: 1; }
  20%,24%,55% { opacity: 0.2; }
}
@keyframes dawen-float {
  0%,100% { transform: translateY(0); }
  50% { transform: translateY(-5px); }
}
@keyframes dawen-shine {
  0% { background-position: -200% center; }
  100% { background-position: 200% center; }
}
`;

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { gap: spacing.md },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  sectionIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(234,179,8,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(234,179,8,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  sectionHeaderText: { flex: 1 },
  sectionTitle: {
    fontSize: fontSize.xl,
    fontWeight: '900',
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  sectionSub: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 1,
  },
  loadingWrap: { alignItems: 'center', paddingVertical: spacing.xl },

  // Form card
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: 'rgba(147,51,234,0.25)',
    padding: spacing.lg,
    gap: spacing.md,
    overflow: 'hidden',
    ...elevation.sm,
  },
  formHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  formTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.textPrimary, flex: 1 },
  formOnce: {
    fontSize: 10,
    fontWeight: '700',
    color: '#EAB308',
    backgroundColor: 'rgba(234,179,8,0.1)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  textInput: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.textPrimary,
    fontSize: fontSize.md,
    fontWeight: '700',
    letterSpacing: 1,
  },
  charCount: {
    alignSelf: 'flex-end',
    fontSize: 11,
    color: colors.textMuted,
    marginTop: -8,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  colorSwatch: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  pickerLabel: { flex: 1, color: colors.textPrimary, fontSize: fontSize.sm, fontWeight: '600' },
  pickerIconLabel: { fontSize: 14, color: '#A78BFA', width: 18, textAlign: 'center' },

  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  colorCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    minWidth: 90,
  },
  colorCellDot: { width: 10, height: 10, borderRadius: 5 },
  colorCellText: { fontSize: 11, color: colors.textMuted, fontWeight: '500', flex: 1 },

  animGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  animCell: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  animCellSelected: {
    backgroundColor: 'rgba(147,51,234,0.15)',
    borderColor: 'rgba(147,51,234,0.5)',
  },
  animCellText: { fontSize: 11, color: colors.textMuted, fontWeight: '500' },
  animCellTextSelected: { color: '#C084FC', fontWeight: '700' },

  previewBox: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 12,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    gap: 8,
  },
  previewLabel: { fontSize: 10, color: colors.textMuted, fontWeight: '600', letterSpacing: 1 },

  errorText: {
    fontSize: fontSize.sm,
    color: colors.error,
    textAlign: 'center',
    fontWeight: '600',
  },
  saveBtn: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  saveBtnText: { color: '#fff', fontSize: fontSize.md, fontWeight: '700' },
  noWalletNote: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textAlign: 'center',
    fontStyle: 'italic',
  },

  // Wall
  wallHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  wallTitle: { fontSize: fontSize.md, fontWeight: '800', color: colors.textPrimary, flex: 1 },
  wallEmpty: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: fontSize.sm,
    paddingVertical: spacing.xl,
    fontStyle: 'italic',
  },
  loadMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
  },
  loadMoreText: { color: '#A78BFA', fontSize: fontSize.sm, fontWeight: '600' },
});

const sigStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    padding: spacing.lg,
    gap: spacing.sm,
    overflow: 'hidden',
    position: 'relative',
    ...elevation.sm,
  },
  ownedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  ownedBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  text: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 2,
  },
  textLarge: {
    fontSize: 28,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  colorDot: { width: 8, height: 8, borderRadius: 4 },
  cardMetaText: { fontSize: 11, color: colors.textMuted, fontWeight: '500' },
  cardMetaSep: { fontSize: 11, color: 'rgba(255,255,255,0.15)' },
});
