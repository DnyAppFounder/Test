import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator, Linking } from 'react-native';
import { Globe } from 'lucide-react-native';
import { colors, spacing, borderRadius, fontSize } from '@/constants/theme';

interface LinkMeta {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  domain: string;
}

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';

const cache = new Map<string, LinkMeta | null>();

async function fetchLinkMeta(url: string): Promise<LinkMeta | null> {
  if (cache.has(url)) return cache.get(url) ?? null;
  try {
    const endpoint = `${SUPABASE_URL}/functions/v1/link-preview`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) { cache.set(url, null); return null; }
    const data: LinkMeta = await res.json();
    cache.set(url, data);
    return data;
  } catch {
    cache.set(url, null);
    return null;
  }
}

interface Props {
  url: string;
}

export default function LinkPreview({ url }: Props) {
  const [meta, setMeta] = useState<LinkMeta | null | 'loading'>('loading');

  useEffect(() => {
    let cancelled = false;
    fetchLinkMeta(url).then(data => {
      if (!cancelled) setMeta(data);
    });
    return () => { cancelled = true; };
  }, [url]);

  if (meta === 'loading') {
    return (
      <View style={styles.card}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  if (!meta) {
    // Still show a minimal clickable link card
    let domain = url;
    try { domain = new URL(url.startsWith('http') ? url : 'https://' + url).hostname.replace(/^www\./, ''); } catch {}
    return (
      <TouchableOpacity style={styles.card} onPress={() => Linking.openURL(url).catch(() => {})} activeOpacity={0.8}>
        <Globe size={14} color={colors.textMuted} strokeWidth={2} />
        <Text style={styles.domain} numberOfLines={1}>{domain}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => Linking.openURL(meta.url).catch(() => {})}
      activeOpacity={0.8}
    >
      {meta.image ? (
        <Image source={{ uri: meta.image }} style={styles.image} resizeMode="cover" />
      ) : null}
      <View style={styles.content}>
        <View style={styles.domainRow}>
          <Globe size={11} color={colors.textMuted} strokeWidth={2} />
          <Text style={styles.domain}>{meta.domain}</Text>
        </View>
        {meta.title ? (
          <Text style={styles.title} numberOfLines={2}>{meta.title}</Text>
        ) : null}
        {meta.description ? (
          <Text style={styles.desc} numberOfLines={2}>{meta.description}</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#0E0E18',
    overflow: 'hidden',
    marginTop: spacing.sm,
    flexDirection: 'column',
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  image: {
    width: '100%',
    height: 160,
    backgroundColor: '#1A1A28',
  },
  content: {
    padding: spacing.md,
    gap: 3,
  },
  domainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  domain: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '500',
  },
  title: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 18,
  },
  desc: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    lineHeight: 16,
  },
});
