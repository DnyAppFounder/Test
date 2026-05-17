import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator, Linking } from 'react-native';
import { Globe, ExternalLink } from 'lucide-react-native';
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

  const openLink = () => {
    const target = typeof meta === 'object' && meta !== null ? meta.url : url;
    Linking.openURL(target).catch(() => {});
  };

  if (meta === 'loading') {
    return (
      <View style={styles.card}>
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.loadingText}>Loading preview...</Text>
        </View>
      </View>
    );
  }

  if (!meta) {
    let domain = url;
    try { domain = new URL(url.startsWith('http') ? url : 'https://' + url).hostname.replace(/^www\./, ''); } catch {}
    return (
      <TouchableOpacity style={[styles.card, styles.cardMinimal]} onPress={openLink} activeOpacity={0.8}>
        <View style={styles.domainRow}>
          <View style={styles.globeIcon}>
            <Globe size={12} color={colors.primary} strokeWidth={2} />
          </View>
          <Text style={styles.domain} numberOfLines={1}>{domain}</Text>
          <ExternalLink size={11} color={colors.textMuted} strokeWidth={2} />
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity style={styles.card} onPress={openLink} activeOpacity={0.85}>
      {meta.image ? (
        <Image source={{ uri: meta.image }} style={styles.image} resizeMode="cover" />
      ) : (
        <View style={styles.imageFallback}>
          <Globe size={24} color="rgba(139,92,246,0.4)" strokeWidth={1.5} />
        </View>
      )}
      <View style={styles.content}>
        <View style={styles.domainRow}>
          <View style={styles.globeIcon}>
            <Globe size={10} color={colors.primary} strokeWidth={2} />
          </View>
          <Text style={styles.domain} numberOfLines={1}>{meta.domain}</Text>
          <ExternalLink size={10} color={colors.textMuted} strokeWidth={2} />
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
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.2)',
    backgroundColor: 'rgba(15,12,28,0.95)',
    overflow: 'hidden',
    marginTop: 6,
    maxWidth: '100%',
  },
  cardMinimal: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
  },
  loadingText: {
    fontSize: 11,
    color: colors.textMuted,
  },
  image: {
    width: '100%',
    height: 120,
    backgroundColor: 'rgba(139,92,246,0.08)',
  },
  imageFallback: {
    width: '100%',
    height: 52,
    backgroundColor: 'rgba(139,92,246,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(139,92,246,0.1)',
  },
  content: {
    padding: 10,
    gap: 3,
  },
  domainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 3,
  },
  globeIcon: {
    width: 16,
    height: 16,
    borderRadius: 4,
    backgroundColor: 'rgba(139,92,246,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  domain: {
    fontSize: 10,
    color: colors.primary,
    fontWeight: '600',
    flex: 1,
  },
  title: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 17,
  },
  desc: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 15,
  },
});
