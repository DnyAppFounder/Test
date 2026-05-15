import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Save, CircleAlert as AlertCircle } from 'lucide-react-native';
import { type RoomLayout } from '@/services/worldService';

// Only import WebView on native
let WebView: any = null;
if (Platform.OS !== 'web') {
  WebView = require('react-native-webview').WebView;
}

const LOAD_TIMEOUT_MS = 45000;

interface Props {
  roomName: string;
  roomId: string;
  onSave: (layout?: RoomLayout) => void;
  onCancel: () => void;
}

export function UnityRoomBuilder({ roomName, roomId, onSave, onCancel }: Props) {
  const webViewRef = useRef<any>(null);
  const iframeRef = useRef<any>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLoadTimer = useCallback(() => {
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
  }, []);

  const startLoadTimer = useCallback(() => {
    clearLoadTimer();
    timeoutRef.current = setTimeout(() => {
      setStatus(prev => {
        if (prev === 'loading') {
          setErrorMsg('Room Builder failed to load (timeout). The Unity WebGL files may not be served with the correct Content-Encoding headers for Brotli compression.');
          return 'error';
        }
        return prev;
      });
    }, LOAD_TIMEOUT_MS);
  }, [clearLoadTimer]);

  useEffect(() => { return () => clearLoadTimer(); }, [clearLoadTimer]);

  const handleBuilderMessage = useCallback((msg: { type: string; data?: any }) => {
    switch (msg.type) {
      case 'builder_ready':
      case 'builder_loaded':
        clearLoadTimer();
        setStatus('ready');
        break;
      case 'room_saved': {
        setSaving(false);
        onSave(buildLayoutFromUnity(msg.data));
        break;
      }
      case 'builder_error':
        clearLoadTimer();
        setStatus('error');
        setErrorMsg(msg.data ? String(msg.data) : 'Room Builder failed to load.');
        break;
    }
  }, [onSave, clearLoadTimer]);

  // Web: listen for postMessages from the iframe
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handler = (e: MessageEvent) => {
      try {
        const msg = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        if (!msg?.type) return;
        handleBuilderMessage(msg);
      } catch { /* ignore */ }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [handleBuilderMessage]);

  const onWebViewMessage = useCallback((event: any) => {
    try {
      const msg = typeof event.nativeEvent.data === 'string'
        ? JSON.parse(event.nativeEvent.data)
        : event.nativeEvent.data;
      if (!msg?.type) return;
      handleBuilderMessage(msg);
    } catch { /* ignore */ }
  }, [handleBuilderMessage]);

  // iframe/WebView page finished loading → start the timeout countdown
  const onLoadEnd = useCallback(() => { startLoadTimer(); }, [startLoadTimer]);

  const onWebViewError = useCallback((e: any) => {
    console.error('[UnityRoomBuilder] WebView load error:', e?.nativeEvent?.description);
    clearLoadTimer();
    setErrorMsg(`Failed to load Room Builder page: ${e?.nativeEvent?.description || 'Unknown error'}`);
    setStatus('error');
  }, [clearLoadTimer]);

  const handleSave = () => {
    if (saving) return;
    setSaving(true);
    if (Platform.OS === 'web') {
      try {
        (iframeRef.current as HTMLIFrameElement | null)?.contentWindow?.postMessage(
          JSON.stringify({ type: 'save_room' }), '*'
        );
      } catch {}
    } else if (webViewRef.current?.injectJavaScript) {
      webViewRef.current.injectJavaScript(`
        (function() {
          try {
            if (typeof unityInstance !== 'undefined' && unityInstance) {
              try { unityInstance.SendMessage('UIManager', 'OnSave', ''); } catch(e) {}
              try { unityInstance.SendMessage('GameManager', 'SaveRoom', ''); } catch(e) {}
              try { unityInstance.SendMessage('RoomBuilder', 'Save', ''); } catch(e) {}
            }
          } catch(e) {}
        })();
        true;
      `);
    }
    setTimeout(() => setSaving(false), 3000);
  };

  const handleForceSave = () => onSave(undefined);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onCancel}>
          <ArrowLeft size={20} color="#fff" strokeWidth={2.5} />
        </TouchableOpacity>
        <Text style={styles.roomName} numberOfLines={1}>{roomName}</Text>
        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Save size={14} color="#fff" strokeWidth={2.5} />
              <Text style={styles.saveBtnText}>Save Room</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.webContainer}>
        {status === 'loading' && (
          <View style={styles.overlay}>
            <LinearGradient colors={['#0D0A1A', '#1A0A2E']} style={StyleSheet.absoluteFill} />
            <ActivityIndicator size="large" color="#10B981" />
            <Text style={styles.loadingText}>Loading Room Builder...</Text>
            <Text style={styles.loadingNote}>First load may take up to 45 seconds (WebGL)</Text>
          </View>
        )}

        {status === 'error' && (
          <View style={styles.overlay}>
            <LinearGradient colors={['#0D0A1A', '#1A0A2E']} style={StyleSheet.absoluteFill} />
            <AlertCircle size={40} color="#EF4444" strokeWidth={2} />
            <Text style={styles.errorTitle}>Room Builder Unavailable</Text>
            <Text style={styles.errorMsg}>{errorMsg || 'WebGL 2.0 is required. Check browser console for details.'}</Text>
            <TouchableOpacity style={styles.forceSaveBtn} onPress={handleForceSave}>
              <Text style={styles.forceSaveBtnText}>Save Room Without Builder</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelBtnText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        )}

        {Platform.OS === 'web' ? (
          // @ts-ignore — plain HTML iframe on web
          <iframe
            ref={iframeRef}
            src="/room-builder/index.html"
            onLoad={onLoadEnd}
            title="Room Builder"
            style={{ width: '100%', height: '100%', border: 'none', position: 'absolute', top: 0, left: 0, backgroundColor: '#231F20' }}
          />
        ) : (
          <WebView
            ref={webViewRef}
            source={{ uri: '/room-builder/index.html' }}
            style={styles.webView}
            onMessage={onWebViewMessage}
            onLoadEnd={onLoadEnd}
            onError={onWebViewError}
            javaScriptEnabled
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            originWhitelist={['*']}
          />
        )}
      </View>

      {saving && (
        <View style={styles.savingBanner}>
          <Text style={styles.savingBannerText}>Waiting for builder to save...</Text>
          <TouchableOpacity onPress={handleForceSave}>
            <Text style={styles.forceSaveLink}>Save without layout</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function buildLayoutFromUnity(data: any): RoomLayout | undefined {
  if (!data) return undefined;
  try {
    if (data.version && data.width && data.height) {
      return { ...data, builder_used: 'unity' } as RoomLayout;
    }
    if (data.tiles || data.width) {
      const w = data.width || 10;
      const h = data.height || 8;
      const tiles: boolean[][] = Array.from({ length: w }, () => Array.from({ length: h }, () => true));
      return {
        version: '1.0', width: w, height: h,
        floor_style: data.floor_style || 'wood',
        wall_style: data.wall_style || 'grey',
        tiles, doors: data.doors || [],
        builder_used: 'unity',
      };
    }
  } catch { /* ignore */ }
  return undefined;
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
  roomName: { flex: 1, color: '#fff', fontSize: 16, fontWeight: '700' },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
    backgroundColor: '#10B981', minWidth: 90, justifyContent: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  webContainer: { flex: 1, position: 'relative' },
  webView: { flex: 1, backgroundColor: '#231F20' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    alignItems: 'center', justifyContent: 'center', gap: 12,
  },
  loadingText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  loadingNote: { color: 'rgba(255,255,255,0.4)', fontSize: 12, textAlign: 'center', paddingHorizontal: 32 },
  errorTitle: { color: '#EF4444', fontSize: 18, fontWeight: '700' },
  errorMsg: { color: 'rgba(255,255,255,0.5)', fontSize: 12, textAlign: 'center', maxWidth: 300, paddingHorizontal: 24 },
  forceSaveBtn: {
    marginTop: 8, paddingHorizontal: 20, paddingVertical: 10,
    backgroundColor: '#10B981', borderRadius: 10,
  },
  forceSaveBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  cancelBtn: {
    paddingHorizontal: 20, paddingVertical: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', borderRadius: 10,
  },
  cancelBtnText: { color: 'rgba(255,255,255,0.6)', fontSize: 14 },
  savingBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
    paddingVertical: 10, backgroundColor: 'rgba(0,0,0,0.6)',
  },
  savingBannerText: { color: 'rgba(255,255,255,0.6)', fontSize: 12 },
  forceSaveLink: { color: '#10B981', fontSize: 12, fontWeight: '700', textDecorationLine: 'underline' },
});
