import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AvatarConfig, DEFAULT_AVATAR } from '@/services/worldService';
import { colors, spacing, fontSize, borderRadius } from '@/constants/theme';
import { HAIR_SPRITES } from './WorldSprite';

interface Props {
  initial: AvatarConfig | null;
  username: string;
  onSave: (config: AvatarConfig) => void;
}

const BODY_COLORS  = ['#8B5CF6','#EC4899','#3B82F6','#10B981','#F59E0B','#EF4444','#06B6D4','#F97316'];
const OUTFIT_COLORS = ['#EC4899','#8B5CF6','#10B981','#3B82F6','#F59E0B','#EF4444','#A78BFA','#6EE7B7'];
const HAIR_LABELS  = ['None','Spiky','Streaks','Top Hat','Wide Hat','Halo'];
const AURA_COLORS  = [null,'#8B5CF6','#EC4899','#F59E0B','#3B82F6','#10B981','#EF4444'];

export function AvatarPreview({ config, username, isPremium, size = 60 }: {
  config: AvatarConfig; username: string; isPremium?: boolean; size?: number;
}) {
  const initials = (username || 'U').slice(0, 2).toUpperCase();
  const fontSize2 = size * 0.3;
  return (
    <View style={{ alignItems: 'center', gap: 4 }}>
      <View style={[
        av.circle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: config.bodyColor },
        config.auraColor && { shadowColor: config.auraColor, shadowRadius: 10, shadowOpacity: 0.8, elevation: 6 },
      ]}>
        <View style={[av.outfit, { backgroundColor: config.outfitColor, height: size * 0.4, borderBottomLeftRadius: size / 2, borderBottomRightRadius: size / 2 }]} />
        <Text style={[av.initials, { fontSize: fontSize2, color: '#fff' }]}>{initials}</Text>
        {isPremium && <View style={av.premiumRing} />}
      </View>
      {username ? <Text style={av.name} numberOfLines={1}>{username}</Text> : null}
    </View>
  );
}

const av = StyleSheet.create({
  circle: { overflow: 'hidden', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)' },
  outfit: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  initials: { fontWeight: '900', zIndex: 1 },
  name: { fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: '600', maxWidth: 64, textAlign: 'center' },
  premiumRing: { position: 'absolute', top: -3, left: -3, right: -3, bottom: -3, borderRadius: 999, borderWidth: 2, borderColor: '#F59E0B' },
});

export function DawenWorldAvatarEditor({ initial, username, onSave }: Props) {
  const [cfg, setCfg] = useState<AvatarConfig>(initial ?? DEFAULT_AVATAR);

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0D0D1A', '#1A0A2E']} style={StyleSheet.absoluteFill} />
      <Text style={styles.title}>Customize Avatar</Text>
      <Text style={styles.sub}>Choose how you appear in DAWEN World</Text>

      <View style={styles.previewWrap}>
        <AvatarPreview config={cfg} username={username} size={80} />
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <Section label="Body Color">
          <ColorRow colors={BODY_COLORS} selected={cfg.bodyColor} onSelect={c => setCfg(p => ({ ...p, bodyColor: c }))} />
        </Section>

        <Section label="Outfit Color">
          <ColorRow colors={OUTFIT_COLORS} selected={cfg.outfitColor} onSelect={c => setCfg(p => ({ ...p, outfitColor: c }))} />
        </Section>

        <Section label="Hair Style">
          <View style={styles.emojiRow}>
            {HAIR_LABELS.map((label, i) => {
              const HairSprite = HAIR_SPRITES[i];
              return (
                <TouchableOpacity
                  key={i}
                  style={[styles.emojiBtn, cfg.hairStyle === i && styles.emojiBtnActive]}
                  onPress={() => setCfg(p => ({ ...p, hairStyle: i }))}
                >
                  {HairSprite ? (
                    <HairSprite size={28} />
                  ) : (
                    <Text style={styles.hairNoneText}>–</Text>
                  )}
                  <Text style={[styles.hairLabel, cfg.hairStyle === i && styles.hairLabelActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Section>

        <Section label="Aura">
          <ColorRow
            colors={AURA_COLORS}
            selected={cfg.auraColor ?? 'none'}
            onSelect={c => setCfg(p => ({ ...p, auraColor: c === 'none' ? null : c }))}
            includeNone
          />
        </Section>
      </ScrollView>

      <TouchableOpacity style={styles.saveBtn} onPress={() => onSave(cfg)} activeOpacity={0.85}>
        <Text style={styles.saveBtnText}>Enter DAWEN World</Text>
      </TouchableOpacity>
    </View>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {children}
    </View>
  );
}

function ColorRow({ colors: cs, selected, onSelect, includeNone }: {
  colors: (string | null)[];
  selected: string;
  onSelect: (c: string) => void;
  includeNone?: boolean;
}) {
  return (
    <View style={styles.colorRow}>
      {includeNone && (
        <TouchableOpacity
          style={[styles.colorSwatch, { backgroundColor: '#1A1A2E', borderStyle: 'dashed' }, selected === 'none' && styles.colorSwatchActive]}
          onPress={() => onSelect('none')}
        >
          <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>✕</Text>
        </TouchableOpacity>
      )}
      {cs.map((c, i) => c && (
        <TouchableOpacity
          key={i}
          style={[styles.colorSwatch, { backgroundColor: c }, selected === c && styles.colorSwatchActive]}
          onPress={() => onSelect(c)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.xl, backgroundColor: '#0D0D1A' },
  title: { fontSize: fontSize.xxl, fontWeight: '900', color: '#fff', textAlign: 'center', marginBottom: 4 },
  sub: { fontSize: fontSize.sm, color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginBottom: spacing.xl },
  previewWrap: { alignItems: 'center', marginBottom: spacing.xl },
  scroll: { flex: 1 },
  section: { marginBottom: spacing.xl },
  sectionLabel: { fontSize: fontSize.sm, fontWeight: '700', color: 'rgba(255,255,255,0.6)', marginBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  colorSwatch: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: 'transparent' },
  colorSwatchActive: { borderColor: '#fff', transform: [{ scale: 1.15 }] },
  emojiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  emojiBtn: { width: 52, minHeight: 52, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.08)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'transparent', paddingVertical: 4, gap: 2 },
  emojiBtnActive: { borderColor: colors.primary, backgroundColor: colors.primaryMuted },
  hairNoneText: { fontSize: 20, color: 'rgba(255,255,255,0.3)', fontWeight: '300' },
  hairLabel: { fontSize: 8, color: 'rgba(255,255,255,0.4)', fontWeight: '600', textAlign: 'center' },
  hairLabelActive: { color: colors.primary },
  saveBtn: { backgroundColor: colors.primary, borderRadius: borderRadius.lg, paddingVertical: spacing.lg, alignItems: 'center', marginTop: spacing.lg },
  saveBtnText: { fontSize: fontSize.lg, fontWeight: '900', color: '#fff' },
});
