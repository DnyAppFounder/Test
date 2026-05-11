import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Platform } from 'react-native';
import { Globe, Send, Twitter } from 'lucide-react-native';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';
import { LiveToken } from '@/services/liveMarketService';
import { colors, spacing, borderRadius, fontSize } from '@/constants/theme';

interface LaunchpadAbout {
  description?: string | null;
  website?: string | null;
  telegram?: string | null;
  twitter?: string | null;
}

interface DasAbout {
  description?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
}

interface Props {
  token: LiveToken;
  mintAddress: string;
}

function getProxyBase(): string {
  const url =
    Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_URL ||
    process.env.EXPO_PUBLIC_SUPABASE_URL ||
    '';
  return url ? `${url}/functions/v1/solana-rpc` : '';
}

function getAnonKey(): string {
  return (
    Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
    ''
  );
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

async function fetchDasAbout(mint: string): Promise<DasAbout | null> {
  const proxy = getProxyBase();
  if (!proxy) return null;
  try {
    const anonKey = getAnonKey();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (anonKey) {
      headers['Authorization'] = `Bearer ${anonKey}`;
      headers['apikey'] = anonKey;
    }
    const res = await fetch(`${proxy}?action=das`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: 'getAsset', method: 'getAsset', params: { id: mint } }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const asset = json?.result;
    if (!asset) return null;

    const description: string | undefined =
      asset.content?.metadata?.description?.trim() || undefined;

    const links = asset.content?.links ?? {};
    const website: string | undefined = links.website || links.external_url || undefined;
    const twitter: string | undefined = links.twitter || undefined;
    const telegram: string | undefined = links.telegram || undefined;

    // If json_uri available and we're still missing socials, fetch off-chain metadata
    if (asset.content?.json_uri && (!telegram || !twitter)) {
      try {
        const metaRes = await fetch(asset.content.json_uri);
        if (metaRes.ok) {
          const meta = await metaRes.json();
          const ext = meta?.extensions ?? {};
          return {
            description: description || meta?.description?.trim(),
            website: website || meta?.website || ext?.website,
            twitter: twitter || meta?.twitter || ext?.twitter,
            telegram: telegram || meta?.telegram || ext?.telegram || meta?.discord || ext?.discord,
          };
        }
      } catch {}
    }

    return { description, website, twitter, telegram };
  } catch {
    return null;
  }
}

export function TokenAboutCard({ token, mintAddress }: Props) {
  const [launchpad, setLaunchpad] = useState<LaunchpadAbout | null>(null);
  const [das, setDas] = useState<DasAbout | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!mintAddress) { setChecked(true); return; }
    let cancelled = false;

    const loadData = async () => {
      // Check launchpad DB first
      let lp: LaunchpadAbout | null = null;
      try {
        const { data } = await supabase
          .from('launchpad_tokens')
          .select('description, website, telegram, twitter')
          .eq('mint_address', mintAddress)
          .maybeSingle();
        lp = data ?? {};
      } catch {}

      const hasLaunchpadData =
        lp?.description || lp?.website || lp?.telegram || lp?.twitter;

      // Fetch DAS only if launchpad has no useful data
      let dasData: DasAbout | null = null;
      if (!hasLaunchpadData) {
        dasData = await fetchDasAbout(mintAddress).catch(() => null);
      }

      if (!cancelled) {
        setLaunchpad(lp);
        setDas(dasData);
        setChecked(true);
      }
    };

    loadData();
    return () => { cancelled = true; };
  }, [mintAddress]);

  // Priority: launchpad DB → DAS → off-chain (included in dasData) → DexScreener
  const description =
    launchpad?.description?.trim() ||
    das?.description ||
    token.description?.trim() ||
    undefined;

  const website =
    launchpad?.website?.trim() ||
    das?.website ||
    token.websites?.[0]?.url ||
    findSocial(token.socials, ['website']);

  const telegram =
    launchpad?.telegram?.trim() ||
    das?.telegram ||
    findSocial(token.socials, ['telegram', 'discord']);

  const twitter =
    launchpad?.twitter?.trim() ||
    das?.twitter ||
    findSocial(token.socials, ['twitter', 'x']);

  const links: { key: string; label: string; url: string; Icon: any }[] = [
    isValidUrl(website) && { key: 'web', label: 'Website', url: website, Icon: Globe },
    isValidUrl(telegram) && { key: 'tg', label: 'Telegram', url: telegram, Icon: Send },
    isValidUrl(twitter) && { key: 'tw', label: 'X / Twitter', url: twitter, Icon: Twitter },
  ].filter(Boolean) as any;

  if (!checked) return null;
  if (!description && links.length === 0) return null;

  return (
    <View style={styles.card}>
      <View style={styles.topGlow} />
      <View style={styles.orbTopRight} />

      <View style={styles.headerRow}>
        <View style={styles.titleAccent} />
        <Text style={styles.title}>About</Text>
      </View>

      {description ? (
        <Text style={styles.description}>{description}</Text>
      ) : null}

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
    backgroundColor: '#12121A',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
    padding: spacing.lg,
  },
  topGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  orbTopRight: {
    position: 'absolute',
    top: -24,
    right: -24,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.02)',
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
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  linkLabel: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.textSecondary,
  },
});
