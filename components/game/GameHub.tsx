import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Gamepad2, Target, PersonStanding as Run, Brain, BookOpen, ChevronRight, Shield,
} from 'lucide-react-native';
import { colors, spacing, borderRadius, fontSize, elevation } from '@/constants/theme';
import { GameId, GAME_DEFINITIONS } from '@/services/game/gameTypes';

const GAME_ICONS: Record<GameId, React.ComponentType<any>> = {
  dawen_rush:        Gamepad2,
  dawen_aim_duel:    Target,
  dawen_runner:      Run,
  dawen_memory:      Brain,
  decode_7_fragments: BookOpen,
};

const GAME_GRAD: Record<GameId, [string, string]> = {
  dawen_rush:        ['rgba(139,92,246,0.22)', 'rgba(109,40,217,0.08)'],
  dawen_aim_duel:    ['rgba(245,158,11,0.22)', 'rgba(217,119,6,0.08)'],
  dawen_runner:      ['rgba(16,185,129,0.22)', 'rgba(5,150,105,0.08)'],
  dawen_memory:      ['rgba(59,130,246,0.22)', 'rgba(37,99,235,0.08)'],
  decode_7_fragments:['rgba(236,72,153,0.22)', 'rgba(190,24,93,0.08)'],
};

const GAME_BADGE: Record<GameId, string> = {
  dawen_rush:        'CLASSIC',
  dawen_aim_duel:    'PRECISION',
  dawen_runner:      'SURVIVAL',
  dawen_memory:      'STRATEGY',
  decode_7_fragments:'PUZZLE',
};

interface Props {
  onSelect: (gameId: GameId) => void;
}

export function GameHub({ onSelect }: Props) {
  return (
    <ScrollView
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <Gamepad2 size={20} color={colors.primary} strokeWidth={2} />
        <Text style={styles.headerTitle}>Choose Your Game</Text>
      </View>
      <Text style={styles.headerSub}>
        Free Practice, Ranked mode, or stake SOL in a 1v1 duel.
      </Text>

      <View style={styles.disclaimer}>
        <Shield size={13} color="#C084FC" strokeWidth={2} />
        <Text style={styles.disclaimerText}>
          All skill-based games. Winners decided by performance — not luck.
        </Text>
      </View>

      {GAME_DEFINITIONS.map(game => {
        const Icon = GAME_ICONS[game.id];
        const grad = GAME_GRAD[game.id];
        const badge = GAME_BADGE[game.id];
        return (
          <TouchableOpacity
            key={game.id}
            style={[styles.card, { borderColor: `${game.color}55` }]}
            onPress={() => onSelect(game.id)}
            activeOpacity={0.82}
          >
            <LinearGradient colors={grad} style={StyleSheet.absoluteFill} />
            <View style={[styles.iconWrap, { backgroundColor: `${game.color}22`, borderColor: `${game.color}66` }]}>
              <Icon size={24} color={game.accentColor} strokeWidth={2} />
            </View>
            <View style={styles.body}>
              <View style={styles.titleRow}>
                <Text style={styles.name}>{game.name}</Text>
                <View style={[styles.badge, { backgroundColor: `${game.color}22` }]}>
                  <Text style={[styles.badgeText, { color: game.accentColor }]}>{badge}</Text>
                </View>
              </View>
              <Text style={styles.tagline}>{game.tagline}</Text>
              <Text style={styles.desc}>{game.description}</Text>
              <View style={styles.modesRow}>
                {['Free', 'Ranked', 'SOL Duel'].map(m => (
                  <View key={m} style={styles.modePill}>
                    <Text style={styles.modePillText}>{m}</Text>
                  </View>
                ))}
              </View>
            </View>
            <ChevronRight size={18} color={colors.textMuted} strokeWidth={2} />
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 2,
  },
  headerTitle: {
    fontSize: fontSize.xl,
    fontWeight: '900',
    color: colors.textPrimary,
  },
  headerSub: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: '500',
    marginBottom: spacing.sm,
  },
  disclaimer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: 'rgba(192,132,252,0.07)',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(192,132,252,0.2)',
    marginBottom: spacing.sm,
  },
  disclaimerText: {
    flex: 1,
    fontSize: fontSize.xs,
    color: '#C084FC',
    fontWeight: '600',
    lineHeight: 16,
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
    ...elevation.sm,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  body: { flex: 1, gap: 3 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  name: {
    fontSize: fontSize.md,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.6 },
  tagline: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  desc: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '400',
    lineHeight: 16,
  },
  modesRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 4,
  },
  modePill: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  modePillText: {
    fontSize: 9,
    fontWeight: '600',
    color: colors.textMuted,
  },
});
