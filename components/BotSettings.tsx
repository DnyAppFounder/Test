import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  ScrollView,
  Switch,
  Clipboard,
} from 'react-native';
import { X, Bot, Link, Copy, RefreshCw, Trash2, Send, TriangleAlert as AlertTriangle, CircleCheck as CheckCircle } from 'lucide-react-native';
import { colors, spacing, fontSize, borderRadius } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

interface BotSettingsProps {
  visible: boolean;
  onClose: () => void;
  groupId: string;
  walletAddress: string;
  isAdmin: boolean;
}

type BotStatus = 'none' | 'connected' | 'disabled';

interface BotRecord {
  id: string;
  bot_id: number;
  bot_username: string;
  bot_name: string;
  status: BotStatus;
  webhook_set: boolean;
}

interface LinkCodeRecord {
  code: string;
  expires_at: string;
}

export default function BotSettings({ visible, onClose, groupId, walletAddress, isAdmin }: BotSettingsProps) {
  const [bot, setBot] = useState<BotRecord | null>(null);
  const [loading, setLoading] = useState(true);

  // Connect flow
  const [tokenInput, setTokenInput] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ bot_username: string; bot_name: string } | null>(null);
  const [connectError, setConnectError] = useState('');

  // Disconnect
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  // Toggle
  const [toggling, setToggling] = useState(false);

  // Link code
  const [linkCode, setLinkCode] = useState<LinkCodeRecord | null>(null);
  const [generatingCode, setGeneratingCode] = useState(false);

  // Broadcast
  const [broadcastText, setBroadcastText] = useState('');
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState('');

  // Success
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (visible) {
      loadBot();
      setConnectError('');
      setTestResult(null);
      setTokenInput('');
      setSuccessMsg('');
      setBroadcastResult('');
    }
  }, [visible, groupId]);

  const loadBot = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('group_telegram_bots')
        .select('id, bot_id, bot_username, bot_name, status, webhook_set')
        .eq('group_id', groupId)
        .maybeSingle();
      setBot(data ?? null);

      // Load existing link code if any
      if (data) {
        const now = new Date().toISOString();
        const { data: code } = await supabase
          .from('telegram_link_codes')
          .select('code, expires_at')
          .eq('group_id', groupId)
          .is('used_at', null)
          .gt('expires_at', now)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        setLinkCode(code ?? null);
      }
    } finally {
      setLoading(false);
    }
  };

  const callEdge = async (action: string, body: Record<string, unknown>) => {
    const url = `${SUPABASE_URL}/functions/v1/connect-telegram-bot?action=${action}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ANON_KEY}`,
        Apikey: ANON_KEY,
      },
      body: JSON.stringify(body),
    });
    return res.json();
  };

  const handleTest = async () => {
    if (!tokenInput.trim() || testing) return;
    setTesting(true);
    setConnectError('');
    setTestResult(null);
    try {
      const res = await callEdge('test', { token: tokenInput.trim(), group_id: groupId, wallet_address: walletAddress });
      if (res.success) {
        setTestResult({ bot_username: res.bot_username, bot_name: res.bot_name });
      } else {
        setConnectError(res.error || 'Invalid token');
      }
    } catch {
      setConnectError('Network error. Try again.');
    } finally {
      setTesting(false);
    }
  };

  const handleConnect = async () => {
    if (!tokenInput.trim() || connecting) return;
    setConnecting(true);
    setConnectError('');
    try {
      const res = await callEdge('connect', { token: tokenInput.trim(), group_id: groupId, wallet_address: walletAddress });
      if (res.success) {
        setSuccessMsg(`@${res.bot_username} connected!`);
        setTokenInput('');
        setTestResult(null);
        await loadBot();
      } else {
        setConnectError(res.error || 'Failed to connect bot');
      }
    } catch {
      setConnectError('Network error. Try again.');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (disconnecting) return;
    setDisconnecting(true);
    try {
      await callEdge('disconnect', { group_id: groupId, wallet_address: walletAddress });
      setBot(null);
      setLinkCode(null);
      setShowDisconnectConfirm(false);
    } catch {
      // silently ignore
    } finally {
      setDisconnecting(false);
    }
  };

  const handleToggle = async (enabled: boolean) => {
    if (toggling) return;
    setToggling(true);
    try {
      await callEdge('toggle', { group_id: groupId, wallet_address: walletAddress, enabled });
      setBot(prev => prev ? { ...prev, status: enabled ? 'connected' : 'disabled' } : prev);
    } finally {
      setToggling(false);
    }
  };

  const generateLinkCode = async () => {
    if (generatingCode) return;
    setGeneratingCode(true);
    try {
      // Get user_id from wallet
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('wallet_address', walletAddress)
        .maybeSingle();

      if (!profile) return;

      const code = `TG-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

      const { data: inserted } = await supabase
        .from('telegram_link_codes')
        .insert({
          user_id: profile.id,
          group_id: groupId,
          code,
          expires_at: expiresAt,
        })
        .select('code, expires_at')
        .single();

      if (inserted) setLinkCode(inserted);
    } finally {
      setGeneratingCode(false);
    }
  };

  const copyToClipboard = (text: string) => {
    Clipboard.setString(text);
  };

  const handleBroadcast = async () => {
    if (!broadcastText.trim() || broadcasting) return;
    setBroadcasting(true);
    setBroadcastResult('');
    try {
      const url = `${SUPABASE_URL}/functions/v1/send-telegram-bot-message`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ANON_KEY}`,
          Apikey: ANON_KEY,
        },
        body: JSON.stringify({ group_id: groupId, wallet_address: walletAddress, message: broadcastText.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setBroadcastResult(`Sent to ${data.sent} user${data.sent !== 1 ? 's' : ''}`);
        setBroadcastText('');
      } else {
        setBroadcastResult(data.error || 'Failed to send');
      }
    } catch {
      setBroadcastResult('Network error');
    } finally {
      setBroadcasting(false);
    }
  };

  const linkCodeExpiry = linkCode ? new Date(linkCode.expires_at) : null;
  const minutesLeft = linkCodeExpiry ? Math.max(0, Math.round((linkCodeExpiry.getTime() - Date.now()) / 60000)) : 0;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <Bot size={18} color={colors.primary} strokeWidth={2} />
            <Text style={styles.title}>Telegram Bot</Text>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
              <X size={20} color={colors.textPrimary} strokeWidth={2} />
            </TouchableOpacity>
          </View>

          {successMsg ? (
            <View style={styles.successBar}>
              <CheckCircle size={14} color="#10B981" strokeWidth={2} />
              <Text style={styles.successText}>{successMsg}</Text>
            </View>
          ) : null}

          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            {loading ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: 32 }} />
            ) : bot ? (
              <>
                {/* Connected bot info */}
                <View style={styles.botCard}>
                  <View style={styles.botCardLeft}>
                    <View style={styles.botIcon}>
                      <Bot size={22} color={colors.primary} strokeWidth={2} />
                    </View>
                    <View>
                      <Text style={styles.botName}>{bot.bot_name}</Text>
                      <Text style={styles.botUsername}>@{bot.bot_username}</Text>
                    </View>
                  </View>
                  <View style={styles.statusBadge}>
                    <View style={[styles.statusDot, bot.status === 'connected' ? styles.statusDotOn : styles.statusDotOff]} />
                    <Text style={[styles.statusText, bot.status === 'connected' ? styles.statusTextOn : styles.statusTextOff]}>
                      {bot.status === 'connected' ? 'Active' : 'Disabled'}
                    </Text>
                  </View>
                </View>

                {isAdmin && (
                  <>
                    {/* Enable / Disable toggle */}
                    <View style={styles.row}>
                      <Text style={styles.rowLabel}>Bot Active</Text>
                      {toggling ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <Switch
                          value={bot.status === 'connected'}
                          onValueChange={handleToggle}
                          trackColor={{ false: 'rgba(255,255,255,0.1)', true: 'rgba(59,130,246,0.5)' }}
                          thumbColor={bot.status === 'connected' ? colors.primary : '#555'}
                        />
                      )}
                    </View>

                    {/* Link Code */}
                    <Text style={styles.sectionLabel}>Link Your Telegram Account</Text>
                    <Text style={styles.sectionHint}>
                      Generate a one-time code and send it to your bot with /link CODE
                    </Text>

                    {linkCode ? (
                      <View style={styles.codeCard}>
                        <Text style={styles.codeValue}>{linkCode.code}</Text>
                        <Text style={styles.codeExpiry}>Expires in {minutesLeft} min</Text>
                        <TouchableOpacity
                          style={styles.copyBtn}
                          onPress={() => copyToClipboard(`/link ${linkCode.code}`)}
                          activeOpacity={0.8}
                        >
                          <Copy size={13} color={colors.primary} strokeWidth={2} />
                          <Text style={styles.copyBtnText}>Copy /link command</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}

                    <TouchableOpacity
                      style={[styles.actionBtn, generatingCode && styles.actionBtnDisabled]}
                      onPress={generateLinkCode}
                      activeOpacity={0.8}
                      disabled={generatingCode}
                    >
                      {generatingCode ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <RefreshCw size={14} color={colors.primary} strokeWidth={2} />
                      )}
                      <Text style={styles.actionBtnText}>
                        {linkCode ? 'Regenerate Code' : 'Generate Link Code'}
                      </Text>
                    </TouchableOpacity>

                    {/* Broadcast */}
                    <Text style={styles.sectionLabel}>Send Message to Linked Users</Text>
                    <TextInput
                      style={styles.broadcastInput}
                      placeholder="Type a message to broadcast..."
                      placeholderTextColor={colors.textMuted}
                      value={broadcastText}
                      onChangeText={setBroadcastText}
                      multiline
                      maxLength={1000}
                    />
                    {broadcastResult ? (
                      <Text style={[styles.broadcastResult, broadcastResult.startsWith('Sent') ? styles.broadcastResultOk : styles.broadcastResultErr]}>
                        {broadcastResult}
                      </Text>
                    ) : null}
                    <TouchableOpacity
                      style={[styles.sendBtn, (!broadcastText.trim() || broadcasting) && styles.actionBtnDisabled]}
                      onPress={handleBroadcast}
                      activeOpacity={0.8}
                      disabled={!broadcastText.trim() || broadcasting}
                    >
                      {broadcasting ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Send size={14} color="#fff" strokeWidth={2} />
                      )}
                      <Text style={styles.sendBtnText}>Broadcast</Text>
                    </TouchableOpacity>

                    {/* Disconnect */}
                    <TouchableOpacity
                      style={styles.disconnectBtn}
                      onPress={() => setShowDisconnectConfirm(true)}
                      activeOpacity={0.8}
                    >
                      <Trash2 size={14} color="#EF4444" strokeWidth={2} />
                      <Text style={styles.disconnectText}>Disconnect Bot</Text>
                    </TouchableOpacity>
                  </>
                )}
              </>
            ) : (
              <>
                {/* No bot — connect flow */}
                <Text style={styles.sectionLabel}>Connect a Telegram Bot</Text>
                <Text style={styles.sectionHint}>
                  1. Create a bot via @BotFather on Telegram{'\n'}
                  2. Copy the API token{'\n'}
                  3. Paste it below and connect
                </Text>

                <TextInput
                  style={styles.tokenInput}
                  placeholder="Bot token (e.g. 1234567890:ABC...)"
                  placeholderTextColor={colors.textMuted}
                  value={tokenInput}
                  onChangeText={(t) => { setTokenInput(t); setTestResult(null); setConnectError(''); }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                />

                {testResult ? (
                  <View style={styles.testResult}>
                    <CheckCircle size={14} color="#10B981" strokeWidth={2} />
                    <Text style={styles.testResultText}>
                      Found: {testResult.bot_name} (@{testResult.bot_username})
                    </Text>
                  </View>
                ) : null}

                {connectError ? (
                  <View style={styles.errorRow}>
                    <AlertTriangle size={13} color="#EF4444" strokeWidth={2} />
                    <Text style={styles.errorText}>{connectError}</Text>
                  </View>
                ) : null}

                <View style={styles.btnRow}>
                  <TouchableOpacity
                    style={[styles.testBtn, (!tokenInput.trim() || testing) && styles.actionBtnDisabled]}
                    onPress={handleTest}
                    activeOpacity={0.8}
                    disabled={!tokenInput.trim() || testing}
                  >
                    {testing ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Link size={14} color={colors.primary} strokeWidth={2} />
                    )}
                    <Text style={styles.testBtnText}>Test Token</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.connectBtn, (!tokenInput.trim() || connecting) && styles.actionBtnDisabled]}
                    onPress={handleConnect}
                    activeOpacity={0.8}
                    disabled={!tokenInput.trim() || connecting}
                  >
                    {connecting ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Bot size={14} color="#fff" strokeWidth={2} />
                    )}
                    <Text style={styles.connectBtnText}>Connect</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </View>

      {/* Disconnect confirm */}
      <Modal visible={showDisconnectConfirm} transparent animationType="fade" onRequestClose={() => setShowDisconnectConfirm(false)}>
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmSheet}>
            <AlertTriangle size={28} color="#EF4444" strokeWidth={2} />
            <Text style={styles.confirmTitle}>Disconnect Bot</Text>
            <Text style={styles.confirmText}>
              This will remove @{bot?.bot_username} from this group and delete its webhook.
            </Text>
            <View style={styles.confirmBtns}>
              <TouchableOpacity style={styles.confirmCancel} onPress={() => setShowDisconnectConfirm(false)} activeOpacity={0.8}>
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmDanger} onPress={handleDisconnect} activeOpacity={0.8} disabled={disconnecting}>
                {disconnecting ? (
                  <ActivityIndicator size="small" color="#EF4444" />
                ) : (
                  <Text style={styles.confirmDangerText}>Disconnect</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#12121A',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: spacing.xl, paddingBottom: 40,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    maxHeight: '85%',
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg },
  title: { flex: 1, fontSize: fontSize.lg, fontWeight: '800', color: colors.textPrimary },
  scroll: { flex: 1 },

  successBar: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(16,185,129,0.12)',
    borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.25)',
    marginBottom: spacing.md,
  },
  successText: { fontSize: fontSize.sm, color: '#10B981', fontWeight: '600' },

  botCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(59,130,246,0.08)',
    borderRadius: 14, padding: spacing.lg,
    borderWidth: 1, borderColor: 'rgba(59,130,246,0.2)',
    marginBottom: spacing.md,
  },
  botCardLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  botIcon: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(59,130,246,0.15)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(59,130,246,0.3)',
  },
  botName: { fontSize: fontSize.md, fontWeight: '700', color: colors.textPrimary },
  botUsername: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusDotOn: { backgroundColor: '#10B981' },
  statusDotOff: { backgroundColor: '#EF4444' },
  statusText: { fontSize: fontSize.xs, fontWeight: '700' },
  statusTextOn: { color: '#10B981' },
  statusTextOff: { color: '#EF4444' },

  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
    marginBottom: spacing.sm,
  },
  rowLabel: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textPrimary },

  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: colors.textMuted,
    letterSpacing: 0.8, textTransform: 'uppercase',
    marginTop: spacing.lg, marginBottom: 6,
  },
  sectionHint: { fontSize: 13, color: colors.textMuted, lineHeight: 19, marginBottom: spacing.md },

  codeCard: {
    backgroundColor: 'rgba(59,130,246,0.06)',
    borderRadius: 12, padding: spacing.lg,
    borderWidth: 1, borderColor: 'rgba(59,130,246,0.2)',
    alignItems: 'center', gap: 6,
    marginBottom: spacing.sm,
  },
  codeValue: { fontSize: 22, fontWeight: '900', color: colors.textPrimary, letterSpacing: 3 },
  codeExpiry: { fontSize: 12, color: colors.textMuted },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  copyBtnText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.primary },

  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 12, paddingHorizontal: spacing.lg,
    borderRadius: 12,
    backgroundColor: 'rgba(59,130,246,0.1)',
    borderWidth: 1, borderColor: 'rgba(59,130,246,0.3)',
    marginBottom: spacing.md,
  },
  actionBtnDisabled: { opacity: 0.4 },
  actionBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.primary },

  broadcastInput: {
    backgroundColor: '#0A0A0F', borderRadius: 12,
    paddingHorizontal: spacing.lg, paddingVertical: 12,
    fontSize: fontSize.sm, color: colors.textPrimary,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    minHeight: 80, textAlignVertical: 'top',
    marginBottom: spacing.sm,
  },
  broadcastResult: { fontSize: 12, marginBottom: 8 },
  broadcastResultOk: { color: '#10B981' },
  broadcastResultErr: { color: '#EF4444' },

  sendBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 12, paddingHorizontal: spacing.lg,
    borderRadius: 12, backgroundColor: colors.primary,
    justifyContent: 'center', marginBottom: spacing.md,
  },
  sendBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: '#fff' },

  disconnectBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginTop: spacing.md, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: 'rgba(239,68,68,0.15)',
  },
  disconnectText: { fontSize: fontSize.sm, fontWeight: '700', color: '#EF4444' },

  tokenInput: {
    backgroundColor: '#0A0A0F', borderRadius: 12,
    paddingHorizontal: spacing.lg, paddingVertical: 12,
    fontSize: fontSize.sm, color: colors.textPrimary,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: spacing.sm,
  },
  testResult: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(16,185,129,0.1)',
    borderRadius: 8, padding: 8, marginBottom: spacing.sm,
  },
  testResultText: { fontSize: fontSize.xs, color: '#10B981', fontWeight: '600' },
  errorRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderRadius: 8, padding: 8, marginBottom: spacing.sm,
  },
  errorText: { fontSize: fontSize.xs, color: '#EF4444' },
  btnRow: { flexDirection: 'row', gap: spacing.sm },
  testBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: 12,
    backgroundColor: 'rgba(59,130,246,0.1)',
    borderWidth: 1, borderColor: 'rgba(59,130,246,0.3)',
  },
  testBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.primary },
  connectBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: 12,
    backgroundColor: colors.primary,
  },
  connectBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: '#fff' },

  // Confirm sheet
  confirmOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  confirmSheet: {
    backgroundColor: '#12121A',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: spacing.xl, paddingBottom: 40,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', gap: spacing.md,
  },
  confirmTitle: { fontSize: fontSize.lg, fontWeight: '800', color: colors.textPrimary },
  confirmText: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
  confirmBtns: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm, width: '100%' },
  confirmCancel: {
    flex: 1, paddingVertical: 13, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
  },
  confirmCancelText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textPrimary },
  confirmDanger: {
    flex: 1, paddingVertical: 13, borderRadius: 12,
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
    alignItems: 'center',
  },
  confirmDangerText: { fontSize: fontSize.sm, fontWeight: '700', color: '#EF4444' },
});
