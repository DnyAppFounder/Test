import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Platform } from 'react-native';
import { Globe, Send, Twitter } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { LiveToken } from '@/services/liveMarketService';
import { colors, spacing, borderRadius, fontSize } from '@/constants/theme';

interface LaunchpadAbout {
  description?: string | null;
  website?: string | null;
  telegram?: string | null;
  twitter?: string | null;
}

interface Props {
  token: LiveToken;
  mintAddress: string;
}

function isValidUrl(url: string | null | undefined): url is string {
  if (!url || typeof url !== 'string') return false;
  const t = url.trim();
  return t.startsWith('http://') || t.startsWith('https://');
}

function findSocial(
  socials: { type: string; url: string }[] | undefined,
  types: string[],
): string | undefined {
  return socials?.find(s => types.includes(s.type.toLowerCase()))?.url;
}

function openLink(url: string) {
  if (Platform.OS === 'web') {
    // @ts-ignore
    window.open(url, '_blank', 'noopener,noreferrer');
  } else {
    Linking.openURL(url).catch(() => {});
  }
}

export function TokenAboutCard({ token, mintAddress }: Props) {
  const [launchpad, setLaunchpad] = useState<LaunchpadAbout | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!mintAddress) { setChecked(true); return; }
    supabase
      .from('launchpad_tokens')
      .select('description, website, telegram, twitter')
      .eq('mint_address', mintAddress)
      .maybeSingle()
      .then(({ data }) => {
        setLaunchpad(data ?? {});
        setChecked(true);
      })
      .catch(() => { setChecked(true); });
  }, [mintAddress]);

  // Prefer launchpad DB → DexScreener socials
  const description =
    launchpad?.description?.trim() ||
    token.description?.trim() ||
    undefined;

  const website =
    launchpad?.website?.trim() ||
    token.websites?.[0]?.url ||
    findSocial(token.socials, ['website']);

  const telegram =
    launchpad?.telegram?.trim() ||
    findSocial(token.socials, ['telegram']);

  const twitter =
    launchpad?.twitter?.trim() ||
    findSocial(token.socials, ['twitter', 'x']);

  const links: { key: string; label: string; url: string; Icon: any }[] = [
    isValidUrl(website) && { key: 'web', label: 'Website', url: website, Icon: Globe },
    isValidUrl(telegram) && { key: 'tg', label: 'Telegram', url: telegram, Icon: Send },
    isValidUrl(twitter) && { key: 'tw', label: 'X / Twitter', url: twitter, Icon: Twitter },
  ].filter(Boolean) as any;

  // Don't render until launchpad check is done and we have something to show
  if (!checked) return null;

  return (
    <View style={styles.card}>
      {/* Top inner glow line */}
      <View style={styles.topGlow} />

      {/* Corner orb */}
      <View style={styles.orbTopRight} />

      <View style={styles.headerRow}>
        <View style={styles.titleAccent} />
        <Text style={styles.title}>About</Text>
      </View>

      <Text style={[styles.description, !description && styles.descriptionMuted]}>
        {description ?? 'No description available.'}
      </Text>

      {links.length > 0 && (
        <View style={styles.linksRow}>
          {links.map(({ key, label, url, Icon }) => (
            <TouchableOpacity
              key={key}
              style={styles.linkBtn}
              onPress={() => openLink(url)}
              activeOpacity={0.7}
            >
              <Icon size={12} color={colors.accent} strokeWidth={2} />
              <Text style={styles.linkLabel}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    backgroundColor: 'rgba(88, 28, 135, 0.10)',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.22)',
    overflow: 'hidden',
    padding: spacing.lg,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 6,
  },
  topGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(192, 132, 252, 0.45)',
  },
  orbTopRight: {
    position: 'absolute',
    top: -24,
    right: -24,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(139, 92, 246, 0.10)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  titleAccent: {
    width: 3,
    height: 16,
    borderRadius: 2,
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },
  title: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 0.3,
  },
  description: {
    fontSize: fontSize.sm,
    fontWeight: '400',
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  descriptionMuted: {
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  linksRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.28)',
  },
  linkLabel: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.accent,
  },
});
