import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Gamepad2, Trophy, Swords, Shield, ChevronRight } from 'lucide-react-native';
import { colors, spacing, borderRadius, fontSize, elevation } from '@/constants/theme';

export type GameMode = 'free' | 'ranked' | 'sol_duel';

interface Props {
  onSelect: (mode: GameMode) => void;
}

const MODES = [
  {
    key: 'free' as GameMode,
    icon: Gamepad2,
    label: 'Free Practice',
    desc: 'Play DAWEN Rush without SOL.',
    sub: 'Score shown after run. No payout.',
    badge: 'INSTANT',
    badgeColor: colors.primary,
    badgeBg: colors.primaryMuted,
    border: colors.surfaceBorderLight,
    glow: false,
  },
  {
    key: 'ranked' as GameMode,
    icon: Trophy,
    label: 'Ranked Practice',
    desc: 'Play for real score on the leaderboard.',
    sub: 'No SOL required. Uses your profile.',
    badge: 'RANKED',
    badgeColor: '#C084FC',
    badgeBg: 'rgba(192,132,252,0.12)',
    border: 'rgba(192,132,252,0.3)',
    glow: false,
  },
  {
    key: 'sol_duel' as GameMode,
    icon: Swords,
    label: 'SOL Duel',
    desc: '1v1 skill-based SOL competition.',
    sub: 'Winner takes pot minus 5% fee.',
    badge: 'LIVE',
    badgeColor: colors.warning,
    badgeBg: colors.warningMuted,
    border: colors.primary,
    glow: true,
  },
] as const;

export function GameModeSelector({ onSelect }: Props) {
  return (
    <View style={styles.container}>
      {/* Skill disclaimer */}
      <View style={styles.disclaimer}>
        <Shield size={14} color='#C084FC' strokeWidth={2} />
        <Text style={styles.disclaimerText}>
          DAWEN Rush Duel is a skill-based competition. Winners are decided by performance,
          score, accuracy, and survival — not random chance.
        </Text>
      </View>

      {/* Mode cards */}
      {MODES.map(mode => {
        const Icon = mode.icon;
        return (
          <TouchableOpacity
            key={mode.key}
            onPress={() => onSelect(mode.key)}
            activeOpacity={0.8}
            style={[styles.card, { borderColor: mode.border }, mode.glow && elevation.glow]}
          >
            {mode.glow && (
              <LinearGradient
                colors={['rgba(139,92,246,0.18)', 'rgba(76,29,149,0.08)']}
                style={StyleSheet.absoluteFill}
              />
            )}
            <View style={[styles.iconWrap, { backgroundColor: mode.badgeBg, borderColor: mode.badgeColor }]}>
              <Icon size={22} color={mode.badgeColor} strokeWidth={2} />
            </View>
            <View style={styles.body}>
              <View style={styles.titleRow}>
                <Text style={styles.label}>{mode.label}</Text>
                <View style={[styles.badge, { backgroundColor: mode.badgeBg }]}>
                  <Text style={[styles.badgeText, { color: mode.badgeColor }]}>{mode.badge}</Text>
                </View>
              </View>
              <Text style={styles.desc}>{mode.desc}</Text>
              <Text style={styles.sub}>{mode.sub}</Text>
            </View>
            <ChevronRight size={16} color={colors.textMuted} strokeWidth={2} />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  disclaimer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: 'rgba(192,132,252,0.07)',
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(192,132,252,0.2)',
  },
  disclaimerText: {
    flex: 1,
    fontSize: fontSize.xs,
    color: '#C084FC',
    fontWeight: '600',
    lineHeight: 17,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  body: { flex: 1 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 3,
  },
  label: {
    fontSize: fontSize.md,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  desc: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: '500',
    marginBottom: 2,
  },
  sub: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '500',
  },
});
