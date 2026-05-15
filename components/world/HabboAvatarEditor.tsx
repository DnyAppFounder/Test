import React, { useRef, useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Check, CircleAlert as AlertCircle } from 'lucide-react-native';
import { type AvatarConfig } from '@/services/worldService';

// Only import WebView on native
let WebView: any = null;
if (Platform.OS !== 'web') {
  WebView = require('react-native-webview').WebView;
}

const READY_TIMEOUT_MS  = 8000;
const ERROR_TIMEOUT_MS  = 20000;

interface Props {
  initial: AvatarConfig | null;
  username: string;
  onSave: (config: AvatarConfig) => void;
  onCancel: () => void;
}

export function HabboAvatarEditor({ initial, username, onSave, onCancel }: Props) {
  const webViewRef = useRef<any>(null);
  const iframeRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [pendingConfig, setPendingConfig] = useState<{ figureCode: string; gender: 'M' | 'F' } | null>(null);
  const readyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    readyTimerRef.current = setTimeout(() => {
      setReady(prev => {
        if (!prev) console.warn('[HabboAvatarEditor] onLoad did not fire within', READY_TIMEOUT_MS / 1000, 's — forcing ready');
        return true;
      });
    }, READY_TIMEOUT_MS);

    errorTimerRef.current = setTimeout(() => {
      setReady(true);
      setLoadError(true);
      console.error('[HabboAvatarEditor] Page failed to become interactive after', ERROR_TIMEOUT_MS / 1000, 's');
    }, ERROR_TIMEOUT_MS);

    return () => {
      clearTimeout(readyTimerRef.current!);
      clearTimeout(errorTimerRef.current!);
    };
  }, []);

  const markReady = useCallback(() => {
    clearTimeout(readyTimerRef.current!);
    clearTimeout(errorTimerRef.current!);
    setReady(true);
    setTimeout(() => sendInitialData(), 500);
  }, []); // eslint-disable-line

  const sendInitialData = useCallback(() => {
    if (!initial?.figureCode) return;
    const msg = JSON.stringify({
      type: 'load_avatar',
      figureCode: initial.figureCode,
      gender: initial.gender || 'M',
    });
    if (Platform.OS === 'web') {
      try { (iframeRef.current as HTMLIFrameElement | null)?.contentWindow?.postMessage(msg, '*'); } catch {}
    } else if (webViewRef.current?.injectJavaScript) {
      webViewRef.current.injectJavaScript(`
        try {
          window.dispatchEvent(new MessageEvent('message', { data: ${JSON.stringify(msg)} }));
        } catch(e) {}
        true;
      `);
    }
  }, [initial]);

  const onLoadEnd = useCallback(() => { markReady(); }, [markReady]);

  const onWebViewError = useCallback((e: any) => {
    console.error('[HabboAvatarEditor] WebView load error:', e?.nativeEvent?.description);
    setReady(true);
    setLoadError(true);
  }, []);

  // Web: listen for postMessages from the iframe
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handler = (e: MessageEvent) => {
      try {
        const msg = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        if (!msg?.type) return;
        handleMsg(msg);
      } catch { /* ignore */ }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []); // eslint-disable-line

  const handleMsg = useCallback((msg: { type: string; figureCode?: string; gender?: string }) => {
    if (msg.type === 'avatar_creator_ready') markReady();
    if (msg.type === 'avatar_saved' && msg.figureCode) {
      const g = (msg.gender === 'F' ? 'F' : 'M') as 'M' | 'F';
      setPendingConfig({ figureCode: msg.figureCode, gender: g });
    }
    if (msg.type === 'avatar_cancelled') onCancel();
  }, [onCancel, markReady]);

  const onWebViewMessage = useCallback((event: any) => {
    try {
      const msg = typeof event.nativeEvent.data === 'string'
        ? JSON.parse(event.nativeEvent.data)
        : event.nativeEvent.data;
      if (!msg?.type) return;
      handleMsg(msg);
    } catch { /* ignore */ }
  }, [handleMsg]);

  const handleConfirmSave = () => {
    if (!pendingConfig) return;
    const updated: AvatarConfig = {
      ...(initial ?? { bodyColor: '#10B981', outfitColor: '#3B82F6', hairStyle: 0, auraColor: null }),
      figureCode: pendingConfig.figureCode,
      gender: pendingConfig.gender,
    };
    onSave(updated);
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onCancel}>
          <ArrowLeft size={20} color="#fff" strokeWidth={2.5} />
        </TouchableOpacity>
        <Text style={styles.title}>Avatar Creator</Text>
        {pendingConfig && (
          <TouchableOpacity style={styles.saveBtn} onPress={handleConfirmSave}>
            <Check size={14} color="#fff" strokeWidth={2.5} />
            <Text style={styles.saveBtnText}>Apply</Text>
          </TouchableOpacity>
        )}
      </View>

      {pendingConfig && (
        <View style={styles.previewBanner}>
          <Text style={styles.previewBannerText}>Avatar ready — tap Apply to save</Text>
          <TouchableOpacity style={styles.applyBtn} onPress={handleConfirmSave}>
            <Text style={styles.applyBtnText}>Apply Avatar</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.webContainer}>
        {!ready && (
          <View style={styles.loadingOverlay}>
            <LinearGradient colors={['#0D0A1A', '#1A0A2E']} style={StyleSheet.absoluteFill} />
            <ActivityIndicator size="large" color="#10B981" />
            <Text style={styles.loadingText}>Loading Avatar Creator...</Text>
          </View>
        )}

        {ready && loadError && (
          <View style={styles.loadingOverlay}>
            <LinearGradient colors={['#0D0A1A', '#1A0A2E']} style={StyleSheet.absoluteFill} />
            <AlertCircle size={40} color="#EF4444" strokeWidth={2} />
            <Text style={styles.errorTitle}>Avatar Creator Failed to Load</Text>
            <Text style={styles.errorSub}>Check browser console for details. The page at /avatar-gen/index.html may not be accessible.</Text>
            <TouchableOpacity style={styles.cancelBtnLarge} onPress={onCancel}>
              <Text style={styles.cancelBtnLargeText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        )}

        {Platform.OS === 'web' ? (
          // @ts-ignore — plain HTML iframe on web
          <iframe
            ref={iframeRef}
            src="/avatar-gen/index.html"
            onLoad={onLoadEnd}
            title="Avatar Creator"
            style={{ width: '100%', height: '100%', border: 'none', position: 'absolute', top: 0, left: 0, backgroundColor: '#0D0A1A' }}
          />
        ) : (
          <WebView
            ref={webViewRef}
            source={{ uri: '/avatar-gen/index.html' }}
            style={styles.webView}
            onMessage={onWebViewMessage}
            onLoadEnd={onLoadEnd}
            onError={onWebViewError}
            javaScriptEnabled
            originWhitelist={['*']}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0D0A1A' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  title: { flex: 1, color: '#fff', fontSize: 16, fontWeight: '700' },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
    backgroundColor: '#10B981',
  },
  saveBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  previewBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: 'rgba(16,185,129,0.15)',
    borderBottomWidth: 1, borderBottomColor: 'rgba(16,185,129,0.3)',
  },
  previewBannerText: { color: '#6EE7B7', fontSize: 13 },
  applyBtn: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8,
    backgroundColor: '#10B981',
  },
  applyBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  webContainer: { flex: 1, position: 'relative' },
  webView: { flex: 1, backgroundColor: '#0D0A1A' },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    alignItems: 'center', justifyContent: 'center', gap: 14,
  },
  loadingText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  errorTitle: { color: '#EF4444', fontSize: 17, fontWeight: '700', textAlign: 'center' },
  errorSub: { color: 'rgba(255,255,255,0.5)', fontSize: 12, textAlign: 'center', maxWidth: 280, paddingHorizontal: 24 },
  cancelBtnLarge: {
    marginTop: 8, paddingHorizontal: 20, paddingVertical: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', borderRadius: 10,
  },
  cancelBtnLargeText: { color: 'rgba(255,255,255,0.6)', fontSize: 14 },
});
