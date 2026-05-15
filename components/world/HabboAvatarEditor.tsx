import React, { useRef, useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Check, CircleAlert as AlertCircle } from 'lucide-react-native';
import { type AvatarConfig } from '@/services/worldService';

let WebView: any = null;
if (Platform.OS !== 'web') {
  WebView = require('react-native-webview').WebView;
}

// After ERROR_TIMEOUT_MS with no response, show error
const ERROR_TIMEOUT_MS = 20000;

interface Props {
  initial: AvatarConfig | null;
  username: string;
  onSave: (config: AvatarConfig) => void;
  onCancel: () => void;
}

export function HabboAvatarEditor({ initial, username, onSave, onCancel }: Props) {
  const webViewRef = useRef<any>(null);
  const webContainerRef = useRef<any>(null);
  const iframeRef = useRef<any>(null);

  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [pendingConfig, setPendingConfig] = useState<{ figureCode: string; gender: 'M' | 'F' } | null>(null);

  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialRef = useRef(initial);
  initialRef.current = initial;

  // Force-clear overlay after ERROR_TIMEOUT_MS
  useEffect(() => {
    errorTimerRef.current = setTimeout(() => {
      setReady(prev => { if (!prev) console.warn('[HabboAvatarEditor] Forced ready after timeout'); return true; });
      // Show error if still not interactive
      setLoadError(prev => {
        // Only show error if nothing meaningful has happened
        return prev;
      });
    }, ERROR_TIMEOUT_MS);
    return () => clearTimeout(errorTimerRef.current!);
  }, []);

  const markReady = useCallback(() => {
    clearTimeout(errorTimerRef.current!);
    setReady(true);
    setLoadError(false);
    // Send initial avatar data to the page
    setTimeout(() => {
      const init = initialRef.current;
      if (!init?.figureCode) return;
      const msg = JSON.stringify({ type: 'load_avatar', figureCode: init.figureCode, gender: init.gender || 'M' });
      if (Platform.OS === 'web') {
        try { iframeRef.current?.contentWindow?.postMessage(msg, '*'); } catch {}
      } else if (webViewRef.current?.injectJavaScript) {
        webViewRef.current.injectJavaScript(`
          try { window.dispatchEvent(new MessageEvent('message', { data: ${JSON.stringify(msg)} })); } catch(e) {}
          true;
        `);
      }
    }, 500);
  }, []);

  const handleMsg = useCallback((msg: any) => {
    if (!msg?.type) return;
    if (msg.type === 'avatar_creator_ready') {
      markReady();
    } else if (msg.type === 'avatar_saved' && msg.figureCode) {
      const g = (msg.gender === 'F' ? 'F' : 'M') as 'M' | 'F';
      setPendingConfig({ figureCode: msg.figureCode, gender: g });
    } else if (msg.type === 'avatar_cancelled') {
      onCancel();
    }
  }, [onCancel, markReady]);

  // Web: inject iframe directly into the DOM (more reliable than JSX iframe)
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const msgHandler = (e: MessageEvent) => {
      try {
        const msg = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        handleMsg(msg);
      } catch {}
    };
    window.addEventListener('message', msgHandler);

    // Wait for the container ref to be populated
    const attemptCreateIframe = () => {
      const container = webContainerRef.current;
      if (!container) { setTimeout(attemptCreateIframe, 100); return; }

      const iframe = document.createElement('iframe');
      iframe.src = '/avatar-gen/index.html';
      iframe.title = 'Avatar Creator';
      iframe.setAttribute('style', 'position:absolute;top:0;left:0;width:100%;height:100%;border:none;background:#0D0A1A;');
      iframe.addEventListener('load', () => {
        console.log('[HabboAvatarEditor] iframe onload fired — /avatar-gen/index.html loaded');
        // markReady is also called by avatar_creator_ready message; call here as backup
        setTimeout(markReady, 1000);
      });
      iframe.addEventListener('error', () => {
        console.error('[HabboAvatarEditor] iframe failed to load');
        setReady(true);
        setLoadError(true);
      });
      container.appendChild(iframe);
      iframeRef.current = iframe;
    };

    setTimeout(attemptCreateIframe, 0);

    return () => {
      window.removeEventListener('message', msgHandler);
      try {
        const container = webContainerRef.current;
        if (container && iframeRef.current) container.removeChild(iframeRef.current);
      } catch {}
      iframeRef.current = null;
    };
  }, []); // eslint-disable-line

  // Native: WebView message handler
  const onWebViewMessage = useCallback((event: any) => {
    try {
      const msg = typeof event.nativeEvent.data === 'string'
        ? JSON.parse(event.nativeEvent.data)
        : event.nativeEvent.data;
      handleMsg(msg);
    } catch {}
  }, [handleMsg]);

  const onWebViewLoadEnd = useCallback(() => {
    setTimeout(markReady, 500);
  }, [markReady]);

  const onWebViewError = useCallback(() => {
    setReady(true);
    setLoadError(true);
  }, []);

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
        {/* Loading overlay — clears after page sends avatar_creator_ready or onload fires */}
        {!ready && (
          <View style={styles.overlay}>
            <LinearGradient colors={['#0D0A1A', '#1A0A2E']} style={StyleSheet.absoluteFill} />
            <ActivityIndicator size="large" color="#10B981" />
            <Text style={styles.loadingText}>Loading Avatar Creator...</Text>
            <Text style={styles.loadingNote}>src: /avatar-gen/index.html</Text>
          </View>
        )}

        {ready && loadError && (
          <View style={styles.overlay}>
            <LinearGradient colors={['#0D0A1A', '#1A0A2E']} style={StyleSheet.absoluteFill} />
            <AlertCircle size={40} color="#EF4444" strokeWidth={2} />
            <Text style={styles.errorTitle}>Avatar Creator Failed to Load</Text>
            <Text style={styles.errorSub}>Check browser console for details. The page at /avatar-gen/index.html may not be accessible.</Text>
            <TouchableOpacity style={styles.cancelBtnLarge} onPress={onCancel}>
              <Text style={styles.cancelBtnLargeText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Web: container View for DOM-injected iframe */}
        {Platform.OS === 'web' ? (
          <View ref={webContainerRef} style={styles.iframeContainer} />
        ) : (
          <WebView
            ref={webViewRef}
            source={{ uri: '/avatar-gen/index.html' }}
            style={styles.webView}
            onMessage={onWebViewMessage}
            onLoadEnd={onWebViewLoadEnd}
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
  applyBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, backgroundColor: '#10B981' },
  applyBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  webContainer: { flex: 1, position: 'relative' },
  iframeContainer: { flex: 1, position: 'relative' },
  webView: { flex: 1, backgroundColor: '#0D0A1A' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    alignItems: 'center', justifyContent: 'center', gap: 14,
  },
  loadingText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  loadingNote: { color: 'rgba(255,255,255,0.3)', fontSize: 10 },
  errorTitle: { color: '#EF4444', fontSize: 17, fontWeight: '700', textAlign: 'center' },
  errorSub: { color: 'rgba(255,255,255,0.5)', fontSize: 12, textAlign: 'center', maxWidth: 280, paddingHorizontal: 24 },
  cancelBtnLarge: {
    marginTop: 8, paddingHorizontal: 20, paddingVertical: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', borderRadius: 10,
  },
  cancelBtnLargeText: { color: 'rgba(255,255,255,0.6)', fontSize: 14 },
});
