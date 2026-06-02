import React, { useEffect, useState } from 'react';
import { View, ScrollView, ActivityIndicator, StyleSheet, Text, Platform } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { getPageByPreviewToken, trackEvent } from '@/services/pageStudioService';
import type { Page, PageBlock } from '@/services/pageStudioService';
import { BlockRenderer } from '@/components/studio/BlockRenderer';

type PageState = 'loading' | 'loaded' | 'error' | 'not_found';

export default function PreviewPageScreen() {
  const { previewToken } = useLocalSearchParams<{ previewToken: string }>();
  const [page, setPage] = useState<Page | null>(null);
  const [blocks, setBlocks] = useState<PageBlock[]>([]);
  const [state, setState] = useState<PageState>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!previewToken) {
      setState('error');
      setErrorMessage('Invalid preview token');
      return;
    }

    const loadPage = async () => {
      try {
        setState('loading');
        const result = await getPageByPreviewToken(previewToken);
        setPage(result.page);
        setBlocks(result.blocks || []);
        setState('loaded');

        trackEvent({ page_id: result.page.id, event_type: 'page_view', device_type: 'web' });

        if (Platform.OS === 'web' && result.page.title) {
          (document as any).title = `Preview: ${result.page.title}`;
        }
      } catch (error: any) {
        const msg = error?.message || '';
        if (msg.includes('not found') || msg.includes('404') || msg.includes('Invalid')) {
          setState('not_found');
        } else {
          setState('error');
          setErrorMessage(msg || 'Failed to load preview');
        }
      }
    };

    loadPage();
  }, [previewToken]);

  const bgColor = page?.global_settings?.backgroundColor || '#0D0618';
  const isDark = !page || page.global_settings?.theme !== 'light';
  const accentColor = page?.global_settings?.accentColor || '#4B8FFF';
  const textColor = isDark ? '#FFFFFF' : '#111111';

  const PreviewBanner = () => (
    <View style={styles.banner}>
      <Text style={styles.bannerText}>Preview Mode — This page is not published</Text>
    </View>
  );

  if (state === 'loading') {
    return (
      <View style={[styles.root, { backgroundColor: bgColor }]}>
        <PreviewBanner />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={accentColor} />
        </View>
      </View>
    );
  }

  if (state === 'not_found') {
    return (
      <View style={[styles.root, { backgroundColor: bgColor }]}>
        <PreviewBanner />
        <View style={styles.center}>
          <Text style={[styles.errorTitle, { color: textColor }]}>Preview Not Found</Text>
          <Text style={[styles.errorBody, { color: textColor + 'aa' }]}>
            This preview link is invalid or has expired.
          </Text>
        </View>
      </View>
    );
  }

  if (state === 'error') {
    return (
      <View style={[styles.root, { backgroundColor: bgColor }]}>
        <PreviewBanner />
        <View style={styles.center}>
          <Text style={[styles.errorTitle, { color: textColor }]}>Error Loading Preview</Text>
          <Text style={[styles.errorBody, { color: textColor + 'aa' }]}>{errorMessage}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: bgColor }]}>
      <PreviewBanner />
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
            <Text style={{ color: textColor + '66' }}>This preview has no content.</Text>
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
  banner: {
    backgroundColor: '#f59e0b',
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  bannerText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1f2937',
    textAlign: 'center',
  },
});
