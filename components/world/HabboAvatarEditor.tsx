import { useRef, useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Check } from 'lucide-react-native';
import { type AvatarConfig } from '@/services/worldService';

interface Props {
  initial: AvatarConfig | null;
  username: string;
  onSave: (config: AvatarConfig) => void;
  onCancel: () => void;
}

export function HabboAvatarEditor({ initial, username, onSave, onCancel }: Props) {
  const webViewRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [pendingConfig, setPendingConfig] = useState<{ figureCode: string; gender: 'M' | 'F' } | null>(null);

  // Send initial avatar data to the page once ready
  const sendInitialData = useCallback(() => {
    if (!initial?.figureCode) return;
    const msg = JSON.stringify({
      type: 'load_avatar',
      figureCode: initial.figureCode,
      gender: initial.gender || 'M',
    });
    if (Platform.OS === 'web') {
      // On web: inject into iframe via postMessage — we can't directly, so inject JS
      if (webViewRef.current?.injectJavaScript) {
        webViewRef.current.injectJavaScript(`
          window.dispatchEvent(new MessageEvent('message', { data: ${JSON.stringify(msg)} }));
          true;
        `);
      }
    } else {
      webViewRef.current?.injectJavaScript?.(`
        window.dispatchEvent(new MessageEvent('message', { data: ${JSON.stringify(msg)} }));
        true;
      `);
    }
  }, [initial]);

  // Web: listen for postMessages from iframe
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
  }, []);

  const handleMsg = useCallback((msg: { type: string; figureCode?: string; gender?: string }) => {
    if (msg.type === 'avatar_saved' && msg.figureCode) {
      const g = (msg.gender === 'F' ? 'F' : 'M') as 'M' | 'F';
      setPendingConfig({ figureCode: msg.figureCode, gender: g });
    }
    if (msg.type === 'avatar_cancelled') {
      onCancel();
    }
  }, [onCancel]);

  const onWebViewMessage = useCallback((event: any) => {
    try {
      const msg = typeof event.nativeEvent.data === 'string'
        ? JSON.parse(event.nativeEvent.data)
        : event.nativeEvent.data;
      if (!msg?.type) return;
      handleMsg(msg);
    } catch { /* ignore */ }
  }, [handleMsg]);

  const onLoad = useCallback(() => {
    setReady(true);
    setTimeout(sendInitialData, 500);
  }, [sendInitialData]);

  const handleConfirmSave = () => {
    if (!pendingConfig) return;
    const updated: AvatarConfig = {
      ...(initial ?? {
        bodyColor: '#8B5CF6',
        outfitColor: '#EC4899',
        hairStyle: 0,
        auraColor: null,
      }),
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

      {!ready && (
        <View style={styles.loadingOverlay}>
          <LinearGradient colors={['#0D0A1A', '#1A0A2E']} style={StyleSheet.absoluteFill} />
          <ActivityIndicator size="large" color="#8B5CF6" />
          <Text style={styles.loadingText}>Loading Avatar Creator...</Text>
        </View>
      )}

      {pendingConfig && (
        <View style={styles.previewBanner}>
          <Text style={styles.previewBannerText}>Avatar ready — tap Apply to save</Text>
          <TouchableOpacity style={styles.applyBtn} onPress={handleConfirmSave}>
            <Text style={styles.applyBtnText}>Apply Avatar</Text>
          </TouchableOpacity>
        </View>
      )}

      <WebView
        ref={webViewRef}
        source={{ uri: '/avatar-gen/index.html' }}
        style={styles.webView}
        onMessage={onWebViewMessage}
        onLoad={onLoad}
        javaScriptEnabled
        originWhitelist={['*']}
      />
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
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10, alignItems: 'center', justifyContent: 'center', gap: 12,
  },
  loadingText: { color: '#fff', fontSize: 15, fontWeight: '600' },
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
  webView: { flex: 1 },
});
