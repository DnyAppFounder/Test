import { useRef, useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Save, CircleAlert as AlertCircle } from 'lucide-react-native';
import { type RoomLayout } from '@/services/worldService';

interface Props {
  roomName: string;
  roomId: string;
  onSave: (layout?: RoomLayout) => void;
  onCancel: () => void;
}

export function UnityRoomBuilder({ roomName, roomId, onSave, onCancel }: Props) {
  const webViewRef = useRef<any>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Listen for postMessages from iframe on web
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
  }, []);

  const handleBuilderMessage = useCallback((msg: { type: string; data?: any }) => {
    switch (msg.type) {
      case 'builder_ready':
      case 'builder_loaded':
        setStatus('ready');
        break;
      case 'room_saved': {
        setSaving(false);
        const layout = buildLayoutFromUnity(msg.data);
        onSave(layout);
        break;
      }
      case 'builder_error':
        setStatus('error');
        setErrorMsg(msg.data ? String(msg.data) : 'Failed to load Room Builder.');
        break;
    }
  }, [onSave]);

  const onWebViewMessage = useCallback((event: any) => {
    try {
      const msg = typeof event.nativeEvent.data === 'string'
        ? JSON.parse(event.nativeEvent.data)
        : event.nativeEvent.data;
      if (!msg?.type) return;
      handleBuilderMessage(msg);
    } catch { /* ignore */ }
  }, [handleBuilderMessage]);

  const handleSave = () => {
    if (saving) return;
    setSaving(true);

    // Attempt to tell Unity to save via JS injection
    const saveScript = `
      (function() {
        try {
          if (typeof unityInstance !== 'undefined' && unityInstance) {
            // Try common Unity GameObjects/methods
            try { unityInstance.SendMessage('UIManager', 'OnSave', ''); } catch(e) {}
            try { unityInstance.SendMessage('GameManager', 'SaveRoom', ''); } catch(e) {}
            try { unityInstance.SendMessage('RoomBuilder', 'Save', ''); } catch(e) {}
          }
          if (window.onRoomSaved) {
            // Check if Unity already has a pending save
          }
        } catch(e) {}
      })();
      true;
    `;

    if (webViewRef.current?.injectJavaScript) {
      webViewRef.current.injectJavaScript(saveScript);
    }

    // Timeout: if no save message received in 3s, allow manual exit
    setTimeout(() => {
      setSaving(false);
    }, 3000);
  };

  const handleForceSave = () => {
    // Save without layout data — room exists in DB, builder didn't return layout
    onSave(undefined);
  };

  return (
    <View style={styles.root}>
      {/* Header */}
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

      {/* Builder */}
      <View style={styles.webContainer}>
        {status === 'loading' && (
          <View style={styles.overlay}>
            <LinearGradient colors={['#0D0A1A', '#1A0A2E']} style={StyleSheet.absoluteFill} />
            <ActivityIndicator size="large" color="#8B5CF6" />
            <Text style={styles.loadingText}>Loading Room Builder...</Text>
            <Text style={styles.loadingNote}>This may take a moment (WebGL)</Text>
          </View>
        )}

        {status === 'error' && (
          <View style={styles.overlay}>
            <LinearGradient colors={['#0D0A1A', '#1A0A2E']} style={StyleSheet.absoluteFill} />
            <AlertCircle size={40} color="#EF4444" strokeWidth={2} />
            <Text style={styles.errorTitle}>Room Builder Unavailable</Text>
            <Text style={styles.errorMsg}>{errorMsg || 'WebGL is required to use the Room Builder.'}</Text>
            <TouchableOpacity style={styles.forceSaveBtn} onPress={handleForceSave}>
              <Text style={styles.forceSaveBtnText}>Save Room Without Builder</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelBtnText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        )}

        <WebView
          ref={webViewRef}
          source={{ uri: '/room-builder/index.html' }}
          style={styles.webView}
          onMessage={onWebViewMessage}
          javaScriptEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          originWhitelist={['*']}
        />
      </View>

      {/* Manual save hint when saving takes too long */}
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
    // If Unity returned a proper layout object
    if (data.version && data.width && data.height) {
      return { ...data, builder_used: 'unity' } as RoomLayout;
    }
    // If Unity returned raw room data, build a minimal layout
    if (data.tiles || data.width) {
      const w = data.width || 10;
      const h = data.height || 8;
      const tiles: boolean[][] = Array.from({ length: w }, () =>
        Array.from({ length: h }, () => true)
      );
      return {
        version: '1.0',
        width: w,
        height: h,
        floor_style: data.floor_style || 'wood',
        wall_style: data.wall_style || 'grey',
        tiles,
        doors: data.doors || [],
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
  loadingNote: { color: 'rgba(255,255,255,0.4)', fontSize: 12 },
  errorTitle: { color: '#EF4444', fontSize: 18, fontWeight: '700' },
  errorMsg: { color: 'rgba(255,255,255,0.5)', fontSize: 13, textAlign: 'center', maxWidth: 280, paddingHorizontal: 24 },
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
