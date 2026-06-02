import React, { useEffect, useState } from 'react';
import { View, ScrollView, ActivityIndicator, StyleSheet, Text, Platform } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { getPageBySlug, trackEvent } from '@/services/pageStudioService';
import type { Page, PageBlock } from '@/services/pageStudioService';
import { BlockRenderer } from '@/components/studio/BlockRenderer';

type PageState = 'loading' | 'loaded' | 'error' | 'not_found';

export default function PublicPageScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const [page, setPage] = useState<Page | null>(null);
  const [blocks, setBlocks] = useState<PageBlock[]>([]);
  const [state, setState] = useState<PageState>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!slug) {
      setState('error');
      setErrorMessage('Invalid page slug');
      return;
    }

    const loadPage = async () => {
      try {
        setState('loading');
        const result = await getPageBySlug(slug);
        setPage(result.page);
        setBlocks(result.blocks || []);
        setState('loaded');

        trackEvent({ page_id: result.page.id, event_type: 'page_view', device_type: 'web' });

        if (Platform.OS === 'web' && result.page.title) {
          (document as any).title = result.page.title;
        }
      } catch (error: any) {
        const msg = error?.message || '';
        if (msg.includes('not found') || msg.includes('404')) {
          setState('not_found');
        } else {
          setState('error');
          setErrorMessage(msg || 'Failed to load page');
        }
      }
    };

    loadPage();
  }, [slug]);

  const bgColor = page?.global_settings?.backgroundColor || '#0D0618';
  const isDark = !page || page.global_settings?.theme !== 'light';
  const accentColor = page?.global_settings?.accentColor || '#4B8FFF';
  const textColor = isDark ? '#FFFFFF' : '#111111';

  if (state === 'loading') {
    return (
      <View style={[styles.center, { backgroundColor: bgColor }]}>
        <ActivityIndicator size="large" color={accentColor} />
      </View>
    );
  }

  if (state === 'not_found') {
    return (
      <View style={[styles.center, { backgroundColor: bgColor }]}>
        <Text style={[styles.errorTitle, { color: textColor }]}>Page Not Found</Text>
        <Text style={[styles.errorBody, { color: textColor + 'aa' }]}>
          This page does not exist or has been removed.
        </Text>
      </View>
    );
  }

  if (state === 'error') {
    return (
      <View style={[styles.center, { backgroundColor: bgColor }]}>
        <Text style={[styles.errorTitle, { color: textColor }]}>Error Loading Page</Text>
        <Text style={[styles.errorBody, { color: textColor + 'aa' }]}>{errorMessage}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: bgColor }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {blocks.map((block, i) => (
          <BlockRenderer
            key={block.id || i}
            block={block}
            pageId={page!.id}
            isEditing={false}
            theme={isDark ? 'dark' : 'light'}
            accentColor={accentColor}
          />
        ))}
        {blocks.length === 0 && (
          <View style={styles.center}>
            <Text style={{ color: textColor + '66' }}>This page has no content.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  errorTitle: { fontSize: 22, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  errorBody: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
});
