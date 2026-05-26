import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ActivityIndicator, ScrollView, Platform, SafeAreaView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Crown, Pen, Check, ChevronDown, ChevronUp, ChevronRight, ArrowLeft,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  { label: 'Purple',          hex: '#9333EA' },
  { label: 'Neon Purple',     hex: '#C026D3' },
  { label: 'Deep Violet',     hex: '#5B21B6' },
  { label: 'Electric Violet', hex: '#A855F7' },
  { label: 'Lavender',        hex: '#C4B5FD' },
  { label: 'Magenta',         hex: '#E879F9' },
  { label: 'Neon Pink',       hex: '#F472B6' },
  { label: 'Rose',            hex: '#FB7185' },
  { label: 'Crimson',         hex: '#DC2626' },
  { label: 'Red',             hex: '#EF4444' },
  { label: 'Orange',          hex: '#F97316' },
  { label: 'Amber',           hex: '#F59E0B' },
  { label: 'Gold',            hex: '#EAB308' },
  { label: 'Yellow',          hex: '#FACC15' },
  { label: 'Lime',            hex: '#84CC16' },
  { label: 'Neon Green',      hex: '#4ADE80' },
  { label: 'Emerald',         hex: '#10B981' },
  { label: 'Cyan',            hex: '#22D3EE' },
  { label: 'Aqua',            hex: '#06B6D4' },
  { label: 'Sky Blue',        hex: '#38BDF8' },
  { label: 'Electric Blue',   hex: '#60A5FA' },
  { label: 'Royal Blue',      hex: '#3B82F6' },
  { label: 'Indigo',          hex: '#6366F1' },
  { label: 'White',           hex: '#FFFFFF' },
  { label: 'Silver',          hex: '#94A3B8' },
  { label: 'Black',           hex: '#1E1E2E' },
  { label: 'Graphite',        hex: '#475569' },
  { label: 'Rainbow',         hex: 'rainbow' },
  { label: 'Holographic',     hex: 'holographic' },
  { label: 'Chrome',          hex: 'chrome' },
];

const ANIMATION_OPTIONS: string[] = [
  'Static', 'Glow Pulse', 'Neon Flicker', 'Floating', 'Sparkle', 'Wave',
  'Glitch', 'Cyber Glitch', 'Fire Glow', 'Electric Shock', 'Lightning',
  'Pulse Beat', 'Soft Bounce', 'Rotate Shine', 'Typing Effect', 'Matrix Rain',
  'Hologram', 'Stardust', 'Comet Trail', 'Plasma Glow', 'Rainbow Flow',
  'Chrome Shine', 'Smoke Fade', 'Energy Aura', 'Crown Shine',
];

const SAFE_TEXT_RE = /^[A-Za-z0-9_\-]+$/;
const MAX_WALL = 35;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveColor(hex: string): string {
  if (hex === 'rainbow') return '#FF6B6B';
  if (hex === 'holographic') return '#A78BFA';
  if (hex === 'chrome') return '#CBD5E1';
  return hex;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch { return ''; }
}

function getAnimStyle(anim: string, colorHex: string): object {
  if (Platform.OS !== 'web') return {};
  const col = resolveColor(colorHex);
  switch (anim) {
    case 'Glow Pulse': case 'Plasma Glow': case 'Energy Aura':
      return { textShadow: `0 0 8px ${col}, 0 0 16px ${col}55`, animation: 'lym-pulse 2s ease-in-out infinite' };
    case 'Neon Flicker': case 'Lightning': case 'Electric Shock':
      return { textShadow: `0 0 6px ${col}`, animation: 'lym-flicker 1.5s step-end infinite' };
    case 'Floating': case 'Soft Bounce':
      return { animation: 'lym-float 3s ease-in-out infinite' };
    case 'Fire Glow':
      return { textShadow: '0 0 10px #FF6B00, 0 0 20px #FF4500', animation: 'lym-pulse 1.2s ease-in-out infinite' };
    case 'Crown Shine': case 'Chrome Shine': case 'Rotate Shine':
      return { animation: 'lym-shine 2s linear infinite', background: `linear-gradient(90deg,${col},#fff,${col})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' };
    default: return {};
  }
}

const WEB_CSS = `
@keyframes lym-pulse{0%,100%{opacity:1}50%{opacity:.7;filter:brightness(1.4)}}
@keyframes lym-flicker{0%,19%,21%,23%,25%,54%,56%,100%{opacity:1}20%,24%,55%{opacity:.2}}
@keyframes lym-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
@keyframes lym-shine{0%{background-position:-200% center}100%{background-position:200% center}}
`;

// ─── Sub-components ───────────────────────────────────────────────────────────

function SigText({ text, colorHex, anim, size = 20 }: {
  text: string; colorHex: string; anim: string; size?: number;
}) {
  const col = resolveColor(colorHex);
  const extra = Platform.OS === 'web' ? getAnimStyle(anim, colorHex) : {};
  return (
    <Text
      style={[sigS.text, { fontSize: size, color: col }, extra as any]}
      numberOfLines={1}
      adjustsFontSizeToFit
    >
      {text}
    </Text>
  );
}

function SignatureCard({ sig, owned }: { sig: GameSignature; owned?: boolean }) {
  const opt = COLOR_OPTIONS.find(c => c.label === sig.signature_color);
  const hex = opt?.hex ?? '#A78BFA';
  const col = resolveColor(hex);
  return (
    <View style={[sigS.card, { borderColor: owned ? `${col}55` : 'rgba(255,255,255,0.07)' }]}>
      <LinearGradient colors={[`${col}14`, `${col}04`]} style={StyleSheet.absoluteFill} />
      {owned && (
        <View style={sigS.ownedRow}>
          <Crown size={9} color={col} strokeWidth={2.5} />
          <Text style={[sigS.ownedText, { color: col }]}>YOUR SIGNATURE</Text>
        </View>
      )}
      <SigText text={sig.signature_text} colorHex={hex} anim={sig.animation_type} size={owned ? 26 : 18} />
      <View style={sigS.metaRow}>
        <View style={[sigS.dot, { backgroundColor: col }]} />
        <Text style={sigS.meta}>{sig.signature_color}</Text>
        <Text style={sigS.sep}>·</Text>
        <Text style={sigS.meta}>{sig.animation_type}</Text>
        <Text style={sigS.sep}>·</Text>
        <Text style={sigS.meta}>{formatDate(sig.created_at)}</Text>
      </View>
    </View>
  );
}

// ─── Entry Card (shown in the Game tab) ───────────────────────────────────────

interface CardProps {
  walletAddress: string | null;
  onOpen: () => void;
}

export function LeaveYourMarkCard({ walletAddress, onOpen }: CardProps) {
  return (
    <TouchableOpacity style={cardS.card} onPress={onOpen} activeOpacity={0.82}>
      <LinearGradient
        colors={['rgba(234,179,8,0.18)', 'rgba(161,122,5,0.06)']}
        style={StyleSheet.absoluteFill}
      />
      <View style={cardS.iconWrap}>
        <Crown size={22} color="#EAB308" strokeWidth={2} />
      </View>
      <View style={cardS.body}>
        <View style={cardS.titleRow}>
          <Text style={cardS.title}>Leave Your Mark</Text>
          <View style={cardS.badge}>
            <Text style={cardS.badgeText}>PERMANENT</Text>
          </View>
        </View>
        <Text style={cardS.desc}>Sign your place in the DAWEN Dynasty.</Text>
        <Text style={cardS.details}>Signature · Colors · Animations · Wall</Text>
      </View>
      <ChevronRight size={18} color={colors.textMuted} strokeWidth={2} />
    </TouchableOpacity>
  );
}

// ─── Full Screen ──────────────────────────────────────────────────────────────

interface ScreenProps {
  walletAddress: string | null;
  onBack: () => void;
}

export function LeaveYourMarkScreen({ walletAddress, onBack }: ScreenProps) {
  const insets = useSafeAreaInsets();

  // CSS animations (web only, injected once)
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const id = 'lym-css';
    if (document.getElementById(id)) return;
    const el = document.createElement('style');
    el.id = id;
    el.textContent = WEB_CSS;
    document.head.appendChild(el);
  }, []);

  const [mySignature, setMySignature] = useState<GameSignature | null | undefined>(undefined);
  const [wall, setWall] = useState<GameSignature[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [loadingMine, setLoadingMine] = useState(true);
  const [loadingWall, setLoadingWall] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [text, setText] = useState('');
  const [selectedColor, setSelectedColor] = useState('Purple');
  const [selectedAnim, setSelectedAnim] = useState('Glow Pulse');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showAnimPicker, setShowAnimPicker] = useState(false);

  const loadMine = useCallback(async () => {
    if (!walletAddress) { setLoadingMine(false); setMySignature(null); return; }
    try {
      const { data } = await supabase
        .from('game_signatures')
        .select('*')
        .eq('wallet_address', walletAddress)
        .maybeSingle();
      setMySignature(data ?? null);
    } catch { setMySignature(null); }
    finally { setLoadingMine(false); }
  }, [walletAddress]);

  const loadWall = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('game_signatures')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(MAX_WALL);
      setWall(data ?? []);
    } catch { setWall([]); }
    finally { setLoadingWall(false); }
  }, []);

  useEffect(() => { loadMine(); loadWall(); }, [loadMine, loadWall]);

  const handleTextChange = (val: string) => {
    // Strip spaces, limit to 15, allow only safe chars
    const clean = val.replace(/\s/g, '').slice(0, 15);
    setText(clean);
    if (error) setError(null);
  };

  const isTextValid = text.length > 0 && SAFE_TEXT_RE.test(text);

  const handleSave = async () => {
    if (!walletAddress) { setError('Connect your wallet first.'); return; }
    if (!text.trim()) { setError('Signature cannot be empty.'); return; }
    if (!SAFE_TEXT_RE.test(text)) { setError('Only letters, numbers, _ and - are allowed. No spaces.'); return; }

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
          setError('You already have a signature.');
          await loadMine();
          return;
        }
        if (insertErr.code === '23514') {
          setError('Invalid text. Max 15 chars, no spaces, letters/numbers/_ and - only.');
          return;
        }
        throw insertErr;
      }

      await loadMine();
      await loadWall();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const colorHex = COLOR_OPTIONS.find(c => c.label === selectedColor)?.hex ?? '#9333EA';
  const previewColor = resolveColor(colorHex);
  const visibleWall = showAll ? wall : wall.slice(0, 10);

  return (
    <View style={[scrS.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={scrS.header}>
        <TouchableOpacity style={scrS.backBtn} onPress={onBack} activeOpacity={0.75}>
          <ArrowLeft size={20} color="#A78BFA" strokeWidth={2} />
          <Text style={scrS.backText}>Back</Text>
        </TouchableOpacity>
        <View style={scrS.headerIconWrap}>
          <Crown size={18} color="#EAB308" strokeWidth={2} />
        </View>
      </View>

      <ScrollView
        style={scrS.scroll}
        contentContainerStyle={[scrS.scrollContent, { paddingBottom: insets.bottom + 48 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Title */}
        <View style={scrS.titleBlock}>
          <Text style={scrS.title}>Leave Your Mark</Text>
          <Text style={scrS.subtitle}>Create your permanent DAWEN signature.</Text>
        </View>

        {/* My signature or form */}
        {loadingMine ? (
          <View style={scrS.loadingWrap}>
            <ActivityIndicator size="small" color="#9333EA" />
          </View>
        ) : mySignature ? (
          <SignatureCard sig={mySignature} owned />
        ) : (
          <View style={scrS.formCard}>
            <LinearGradient
              colors={['rgba(147,51,234,0.10)', 'rgba(109,40,217,0.03)']}
              style={StyleSheet.absoluteFill}
            />
            {/* Form header */}
            <View style={scrS.formHeader}>
              <Pen size={14} color="#A78BFA" strokeWidth={2} />
              <Text style={scrS.formTitle}>Create your signature</Text>
              <View style={scrS.onceBadge}>
                <Text style={scrS.onceText}>ONCE · PERMANENT</Text>
              </View>
            </View>

            {/* ── Text input ── */}
            <View style={scrS.inputWrapper}>
              <TextInput
                style={scrS.textInput}
                placeholder="e.g. DAWENKING or D_CLAN7"
                placeholderTextColor="rgba(255,255,255,0.22)"
                value={text}
                onChangeText={handleTextChange}
                maxLength={15}
                autoCapitalize="characters"
                autoCorrect={false}
                spellCheck={false}
                returnKeyType="done"
                underlineColorAndroid="transparent"
                editable={true}
              />
              <Text style={[scrS.charCount, text.length >= 15 && scrS.charCountMax]}>
                {text.length}/15
              </Text>
            </View>
            <Text style={scrS.inputHint}>Letters, numbers, _ and - only. No spaces.</Text>

            {/* ── Color picker ── */}
            <TouchableOpacity
              style={scrS.pickerRow}
              onPress={() => { setShowColorPicker(v => !v); setShowAnimPicker(false); }}
              activeOpacity={0.8}
            >
              <View style={[scrS.colorSwatch, { backgroundColor: previewColor }]} />
              <Text style={scrS.pickerLabel}>{selectedColor}</Text>
              {showColorPicker
                ? <ChevronUp size={14} color="rgba(255,255,255,0.4)" />
                : <ChevronDown size={14} color="rgba(255,255,255,0.4)" />}
            </TouchableOpacity>

            {showColorPicker && (
              <View style={scrS.pickerGrid}>
                {COLOR_OPTIONS.map(c => {
                  const h = resolveColor(c.hex);
                  const sel = c.label === selectedColor;
                  return (
                    <TouchableOpacity
                      key={c.label}
                      style={[scrS.colorCell, sel && { borderColor: h, borderWidth: 2 }]}
                      onPress={() => { setSelectedColor(c.label); setShowColorPicker(false); }}
                      activeOpacity={0.8}
                    >
                      <View style={[scrS.colorDot, { backgroundColor: h }]} />
                      <Text style={[scrS.colorLabel, sel && { color: h }]} numberOfLines={1}>
                        {c.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* ── Animation picker ── */}
            <TouchableOpacity
              style={scrS.pickerRow}
              onPress={() => { setShowAnimPicker(v => !v); setShowColorPicker(false); }}
              activeOpacity={0.8}
            >
              <Text style={scrS.animIcon}>✦</Text>
              <Text style={scrS.pickerLabel}>{selectedAnim}</Text>
              {showAnimPicker
                ? <ChevronUp size={14} color="rgba(255,255,255,0.4)" />
                : <ChevronDown size={14} color="rgba(255,255,255,0.4)" />}
            </TouchableOpacity>

            {showAnimPicker && (
              <View style={scrS.pickerGrid}>
                {ANIMATION_OPTIONS.map(a => {
                  const sel = a === selectedAnim;
                  return (
                    <TouchableOpacity
                      key={a}
                      style={[scrS.animCell, sel && scrS.animCellSel]}
                      onPress={() => { setSelectedAnim(a); setShowAnimPicker(false); }}
                      activeOpacity={0.8}
                    >
                      <Text style={[scrS.animText, sel && scrS.animTextSel]}>{a}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* ── Live preview ── */}
            {text.length > 0 && (
              <View style={scrS.previewBox}>
                <Text style={scrS.previewLabel}>PREVIEW</Text>
                <SigText text={text} colorHex={colorHex} anim={selectedAnim} size={26} />
              </View>
            )}

            {error ? <Text style={scrS.errorText}>{error}</Text> : null}

            {/* ── Save button ── */}
            <TouchableOpacity
              style={[scrS.saveBtn, (!isTextValid || saving) && scrS.saveBtnDim]}
              onPress={handleSave}
              disabled={saving || !isTextValid}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={['#9333EA', '#6D28D9']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={scrS.saveBtnGrad}
              >
                {saving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <><Check size={16} color="#fff" strokeWidth={2.5} /><Text style={scrS.saveBtnText}>Sign Forever</Text></>}
              </LinearGradient>
            </TouchableOpacity>

            {!walletAddress && (
              <Text style={scrS.noWallet}>Connect your wallet to create a signature.</Text>
            )}
          </View>
        )}

        {/* ── Wall of Signatures ── */}
        <View style={scrS.wallHeader}>
          <Crown size={13} color="#EAB308" strokeWidth={2} />
          <Text style={scrS.wallTitle}>Wall of Signatures</Text>
          {loadingWall && <ActivityIndicator size="small" color="#9333EA" style={{ marginLeft: 8 }} />}
        </View>

        {!loadingWall && wall.length === 0 && (
          <Text style={scrS.wallEmpty}>No signatures yet. Be the first to sign.</Text>
        )}

        {visibleWall.map(sig => (
          <SignatureCard
            key={sig.id}
            sig={sig}
            owned={!!walletAddress && sig.wallet_address === walletAddress}
          />
        ))}

        {wall.length > 10 && !showAll && (
          <TouchableOpacity
            style={scrS.loadMore}
            onPress={() => setShowAll(true)}
            activeOpacity={0.75}
          >
            <Text style={scrS.loadMoreText}>Load more ({wall.length - 10} more)</Text>
            <ChevronDown size={14} color="#A78BFA" />
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Card styles ──────────────────────────────────────────────────────────────

const cardS = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(234,179,8,0.4)',
    overflow: 'hidden',
    ...elevation.sm,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(234,179,8,0.5)',
    backgroundColor: 'rgba(234,179,8,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  body: { flex: 1, gap: 3 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 2,
  },
  title: {
    fontSize: fontSize.md,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(234,179,8,0.15)',
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: '#EAB308',
  },
  desc: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  details: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '500',
  },
});

// ─── Screen styles ────────────────────────────────────────────────────────────

const scrS = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  backText: {
    fontSize: fontSize.md,
    color: '#A78BFA',
    fontWeight: '600',
  },
  headerIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(234,179,8,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(234,179,8,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
  titleBlock: { gap: 4, marginBottom: 4 },
  title: {
    fontSize: 26,
    fontWeight: '900',
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  loadingWrap: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
  },

  // Form card — NO overflow:hidden so TextInput is never clipped
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: 'rgba(147,51,234,0.25)',
    padding: spacing.lg,
    gap: spacing.md,
    ...elevation.sm,
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  formTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
    flex: 1,
  },
  onceBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(234,179,8,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(234,179,8,0.3)',
  },
  onceText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#EAB308',
    letterSpacing: 0.5,
  },

  // Input wrapper — separate from form card so it never clips
  inputWrapper: {
    gap: 4,
  },
  textInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1.5,
    borderColor: 'rgba(139,92,246,0.35)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 2,
    // Ensure no native clipping interferes
    minHeight: 52,
  },
  charCount: {
    alignSelf: 'flex-end',
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '500',
  },
  charCountMax: {
    color: colors.warning,
  },
  inputHint: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.28)',
    marginTop: -6,
  },

  // Pickers
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  colorSwatch: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  pickerLabel: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  animIcon: {
    fontSize: 14,
    color: '#A78BFA',
    width: 18,
    textAlign: 'center',
  },

  pickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
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
    borderColor: 'rgba(255,255,255,0.07)',
    minWidth: 92,
  },
  colorDot: { width: 10, height: 10, borderRadius: 5 },
  colorLabel: { fontSize: 11, color: colors.textMuted, fontWeight: '500', flex: 1 },
  animCell: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  animCellSel: {
    backgroundColor: 'rgba(147,51,234,0.15)',
    borderColor: 'rgba(147,51,234,0.45)',
  },
  animText: { fontSize: 11, color: colors.textMuted, fontWeight: '500' },
  animTextSel: { color: '#C084FC', fontWeight: '700' },

  // Preview
  previewBox: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 12,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    gap: 8,
  },
  previewLabel: {
    fontSize: 9,
    color: colors.textMuted,
    fontWeight: '700',
    letterSpacing: 1.5,
  },

  errorText: {
    fontSize: fontSize.sm,
    color: colors.error,
    textAlign: 'center',
    fontWeight: '600',
  },

  saveBtn: {
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 4,
  },
  saveBtnDim: { opacity: 0.5 },
  saveBtnGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    borderRadius: 12,
  },
  saveBtnText: { color: '#fff', fontSize: fontSize.md, fontWeight: '700' },

  noWallet: {
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
    marginTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  wallTitle: {
    fontSize: fontSize.md,
    fontWeight: '800',
    color: colors.textPrimary,
    flex: 1,
  },
  wallEmpty: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: fontSize.sm,
    paddingVertical: spacing.xxl,
    fontStyle: 'italic',
  },
  loadMore: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
  },
  loadMoreText: { color: '#A78BFA', fontSize: fontSize.sm, fontWeight: '600' },
});

// ─── Sig card styles ──────────────────────────────────────────────────────────

const sigS = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.sm,
    overflow: 'hidden',
    position: 'relative',
    ...elevation.sm,
  },
  ownedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  ownedText: { fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  text: { fontWeight: '900', letterSpacing: 2 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    marginTop: 2,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  meta: { fontSize: 11, color: colors.textMuted, fontWeight: '500' },
  sep: { fontSize: 11, color: 'rgba(255,255,255,0.15)' },
});
