import { useState, useEffect, useCallback } from 'react';
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
  Platform,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import {
  X, Bot, Link, Copy, RefreshCw, Trash2, Send,
  TriangleAlert as AlertTriangle, CircleCheck as CheckCircle,
  ChevronDown, ChevronUp, Settings, Unlink,
} from 'lucide-react-native';
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
  settings: BotSettingsConfig;
}

interface BotSettingsConfig {
  welcome_enabled?: boolean;
  welcome_message?: string;
  link_requirement?: boolean;
  anti_spam?: boolean;
  link_warning_cooldown_hours?: number;
  rules_message?: string;
  links_message?: string;
  rewards_message?: string;
}

interface LinkCodeRecord {
  code: string;
  expires_at: string;
}

interface LinkedTelegramAccount {
  telegram_username: string | null;
  telegram_first_name: string | null;
  status: string;
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
  const [codeError, setCodeError] = useState('');
  const [codeCopied, setCodeCopied] = useState(false);

  // Linked Telegram account (for this user)
  const [linkedAccount, setLinkedAccount] = useState<LinkedTelegramAccount | null>(null);
  const [unlinking, setUnlinking] = useState(false);

  // Admin config
  const [showConfig, setShowConfig] = useState(false);
  const [config, setConfig] = useState<BotSettingsConfig>({});
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);

  // Broadcast
  const [broadcastText, setBroadcastText] = useState('');
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState('');

  // Global messages
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (visible) {
      loadData();
      setConnectError('');
      setTestResult(null);
      setTokenInput('');
      setSuccessMsg('');
      setBroadcastResult('');
      setCodeError('');
      setCodeCopied(false);
    }
  }, [visible, groupId]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Load bot record
      const { data: botData } = await supabase
        .from('group_telegram_bots')
        .select('id, bot_id, bot_username, bot_name, status, webhook_set, settings')
        .eq('group_id', groupId)
        .maybeSingle();

      const botRecord = botData
        ? { ...botData, settings: botData.settings ?? {} } as BotRecord
        : null;
      setBot(botRecord);

      if (botRecord) {
        setConfig(botRecord.settings ?? {});

        // Load existing valid link code for this user
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('id')
          .eq('wallet_address', walletAddress)
          .maybeSingle();

        if (profile) {
          const now = new Date().toISOString();
          const { data: code } = await supabase
            .from('telegram_link_codes')
            .select('code, expires_at')
            .eq('user_id', profile.id)
            .is('used_at', null)
            .gt('expires_at', now)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          setLinkCode(code ?? null);

          // Load linked Telegram account for this user
          const { data: linked } = await supabase
            .from('telegram_linked_users')
            .select('telegram_username, telegram_first_name, status')
            .eq('dawen_user_id', profile.id)
            .eq('status', 'active')
            .maybeSingle();
          setLinkedAccount(linked ?? null);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [groupId, walletAddress]);

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
        await loadData();
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
      setLinkedAccount(null);
      setShowDisconnectConfirm(false);
    } catch {
      // ignore
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
    setCodeError('');
    try {
      const res = await callEdge('generate_code', { group_id: groupId, wallet_address: walletAddress });
      if (res.success && res.code) {
        setLinkCode({ code: res.code, expires_at: res.expires_at });
        setCodeCopied(false);
      } else {
        setCodeError(res.error || 'Could not generate Telegram link code. Please try again.');
      }
    } catch {
      setCodeError('Could not generate Telegram link code. Please try again.');
    } finally {
      setGeneratingCode(false);
    }
  };

  const copyCode = async () => {
    if (!linkCode) return;
    const command = `/link ${linkCode.code}`;
    if (Platform.OS === 'web') {
      await navigator.clipboard.writeText(command).catch(() => {});
    } else {
      await Clipboard.setStringAsync(command);
    }
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  const handleUnlinkTelegram = async () => {
    if (unlinking) return;
    setUnlinking(true);
    try {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('wallet_address', walletAddress)
        .maybeSingle();
      if (!profile) return;

      await supabase
        .from('telegram_linked_users')
        .update({ status: 'unlinked', updated_at: new Date().toISOString() })
        .eq('dawen_user_id', profile.id)
        .eq('status', 'active');

      setLinkedAccount(null);
      setSuccessMsg('Telegram account unlinked.');
      setTimeout(() => setSuccessMsg(''), 3000);
    } finally {
      setUnlinking(false);
    }
  };

  const handleSaveConfig = async () => {
    if (savingConfig) return;
    setSavingConfig(true);
    setConfigSaved(false);
    try {
      const res = await callEdge('update_settings', {
        group_id: groupId,
        wallet_address: walletAddress,
        settings: config,
      });
      if (res.success) {
        setConfigSaved(true);
        setBot(prev => prev ? { ...prev, settings: config } : prev);
        setTimeout(() => setConfigSaved(false), 3000);
      }
    } finally {
      setSavingConfig(false);
    }
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
        setBroadcastResult(`Sent to ${data.sent} linked user${data.sent !== 1 ? 's' : ''}`);
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
  const minutesLeft = linkCodeExpiry
    ? Math.max(0, Math.round((linkCodeExpiry.getTime() - Date.now()) / 60000))
    : 0;
  const codeExpired = minutesLeft === 0 && !!linkCode;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <Bot size={18} color={colors.primary} strokeWidth={2} />
            <Text style={styles.title}>Telegram Bot</Text>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={20} color={colors.textPrimary} strokeWidth={2} />
            </TouchableOpacity>
          </View>

          {successMsg ? (
            <View style={styles.successBar}>
              <CheckCircle size={14} color="#10B981" strokeWidth={2} />
              <Text style={styles.successText}>{successMsg}</Text>
            </View>
          ) : null}

          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
            {loading ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: 40 }} />
            ) : bot ? (
              <>
                {/* ── Connected bot card ──────────────────────────────── */}
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
                    <View style={[styles.statusDot, bot.status === 'connected' ? styles.dotOn : styles.dotOff]} />
                    <Text style={[styles.statusText, bot.status === 'connected' ? styles.textOn : styles.textOff]}>
                      {bot.status === 'connected' ? 'Active' : 'Disabled'}
                    </Text>
                  </View>
                </View>

                {isAdmin && (
                  <View style={styles.row}>
                    <Text style={styles.rowLabel}>Bot Active</Text>
                    {toggling ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Switch
                        value={bot.status === 'connected'}
                        onValueChange={handleToggle}
                        trackColor={{ false: 'rgba(255,255,255,0.1)', true: 'rgba(59,130,246,0.45)' }}
                        thumbColor={bot.status === 'connected' ? colors.primary : '#555'}
                      />
                    )}
                  </View>
                )}

                {/* ── Linked Telegram account ─────────────────────────── */}
                <Text style={styles.sectionLabel}>Your Telegram Account</Text>

                {linkedAccount ? (
                  <View style={styles.linkedCard}>
                    <View style={styles.linkedCardLeft}>
                      <CheckCircle size={16} color="#10B981" strokeWidth={2} />
                      <View>
                        <Text style={styles.linkedName}>
                          {linkedAccount.telegram_first_name || linkedAccount.telegram_username || 'Linked'}
                        </Text>
                        {linkedAccount.telegram_username ? (
                          <Text style={styles.linkedHandle}>@{linkedAccount.telegram_username}</Text>
                        ) : null}
                      </View>
                    </View>
                    <TouchableOpacity
                      style={styles.unlinkBtn}
                      onPress={handleUnlinkTelegram}
                      disabled={unlinking}
                      activeOpacity={0.8}
                    >
                      {unlinking ? (
                        <ActivityIndicator size="small" color="#EF4444" />
                      ) : (
                        <>
                          <Unlink size={12} color="#EF4444" strokeWidth={2} />
                          <Text style={styles.unlinkBtnText}>Unlink</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.notLinkedCard}>
                    <AlertTriangle size={15} color="#F59E0B" strokeWidth={2} />
                    <Text style={styles.notLinkedText}>
                      Your Telegram account is not linked yet.
                    </Text>
                  </View>
                )}

                {/* ── Link code section ───────────────────────────────── */}
                <Text style={styles.sectionLabel}>Link Your Telegram Account</Text>
                <Text style={styles.sectionHint}>
                  Generate a one-time code, then open Telegram and send it to{' '}
                  <Text style={styles.botNameInline}>@{bot.bot_username}</Text>:
                </Text>

                {/* Instruction steps */}
                <View style={styles.stepList}>
                  <StepRow n={1} text="Tap Generate Link Code below" />
                  <StepRow n={2} text={`Open Telegram and message @${bot.bot_username}`} />
                  <StepRow n={3} text="Copy and send the /link command" />
                  <StepRow n={4} text="Done — your accounts will be linked" />
                </View>

                {linkCode && !codeExpired ? (
                  <View style={styles.codeCard}>
                    <Text style={styles.codeLabel}>Your link command</Text>
                    <Text style={styles.codeValue}>/link {linkCode.code}</Text>
                    <Text style={styles.codeExpiry}>
                      Expires in {minutesLeft} min{minutesLeft !== 1 ? 's' : ''}
                    </Text>
                    <TouchableOpacity
                      style={[styles.copyBtn, codeCopied && styles.copyBtnDone]}
                      onPress={copyCode}
                      activeOpacity={0.8}
                    >
                      {codeCopied ? (
                        <CheckCircle size={13} color="#10B981" strokeWidth={2} />
                      ) : (
                        <Copy size={13} color={colors.primary} strokeWidth={2} />
                      )}
                      <Text style={[styles.copyBtnText, codeCopied && styles.copyBtnTextDone]}>
                        {codeCopied ? 'Copied!' : 'Copy command'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : codeExpired ? (
                  <View style={styles.expiredBadge}>
                    <AlertTriangle size={13} color="#F59E0B" strokeWidth={2} />
                    <Text style={styles.expiredText}>Code expired — generate a new one</Text>
                  </View>
                ) : null}

                {codeError ? (
                  <View style={styles.errorRow}>
                    <AlertTriangle size={13} color="#EF4444" strokeWidth={2} />
                    <Text style={styles.errorText}>{codeError}</Text>
                  </View>
                ) : null}

                <TouchableOpacity
                  style={[styles.actionBtn, generatingCode && styles.btnDisabled]}
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
                    {linkCode && !codeExpired ? 'Regenerate Code' : 'Generate Link Code'}
                  </Text>
                </TouchableOpacity>

                {/* ── Admin config section ────────────────────────────── */}
                {isAdmin && (
                  <>
                    <TouchableOpacity
                      style={styles.configToggleRow}
                      onPress={() => setShowConfig(v => !v)}
                      activeOpacity={0.8}
                    >
                      <Settings size={14} color={colors.textMuted} strokeWidth={2} />
                      <Text style={styles.configToggleText}>Bot Configuration</Text>
                      {showConfig
                        ? <ChevronUp size={14} color={colors.textMuted} strokeWidth={2} />
                        : <ChevronDown size={14} color={colors.textMuted} strokeWidth={2} />
                      }
                    </TouchableOpacity>

                    {showConfig && (
                      <View style={styles.configPanel}>
                        <ConfigToggle
                          label="Welcome message when bot joins group"
                          value={config.welcome_enabled !== false}
                          onChange={v => setConfig(c => ({ ...c, welcome_enabled: v }))}
                        />
                        <ConfigTextArea
                          label="Custom welcome message"
                          placeholder="Leave blank to use the default DAWEN welcome message"
                          value={config.welcome_message ?? ''}
                          onChange={v => setConfig(c => ({ ...c, welcome_message: v }))}
                        />
                        <ConfigToggle
                          label="Require Telegram link for protected commands"
                          value={config.link_requirement === true}
                          onChange={v => setConfig(c => ({ ...c, link_requirement: v }))}
                        />
                        <ConfigToggle
                          label="Anti-spam cooldown (24h between warnings)"
                          value={config.anti_spam !== false}
                          onChange={v => setConfig(c => ({ ...c, anti_spam: v }))}
                        />
                        <ConfigTextArea
                          label="Custom /rules message"
                          placeholder="Leave blank to use the default DAWEN community rules"
                          value={config.rules_message ?? ''}
                          onChange={v => setConfig(c => ({ ...c, rules_message: v }))}
                        />
                        <ConfigTextArea
                          label="Custom /links message"
                          placeholder="Leave blank to show official DAWEN links"
                          value={config.links_message ?? ''}
                          onChange={v => setConfig(c => ({ ...c, links_message: v }))}
                        />
                        <ConfigTextArea
                          label="Custom /rewards message"
                          placeholder="Leave blank to use the default $DAWORLD rewards info"
                          value={config.rewards_message ?? ''}
                          onChange={v => setConfig(c => ({ ...c, rewards_message: v }))}
                        />

                        {configSaved ? (
                          <View style={styles.savedRow}>
                            <CheckCircle size={13} color="#10B981" strokeWidth={2} />
                            <Text style={styles.savedText}>Settings saved</Text>
                          </View>
                        ) : null}

                        <TouchableOpacity
                          style={[styles.saveBtn, savingConfig && styles.btnDisabled]}
                          onPress={handleSaveConfig}
                          activeOpacity={0.8}
                          disabled={savingConfig}
                        >
                          {savingConfig ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : null}
                          <Text style={styles.saveBtnText}>Save Configuration</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {/* ── Broadcast ──────────────────────────────────── */}
                    <Text style={styles.sectionLabel}>Broadcast to Linked Users</Text>
                    <Text style={styles.sectionHint}>
                      Send a message to all Telegram users linked to this group.
                    </Text>
                    <TextInput
                      style={styles.broadcastInput}
                      placeholder="Type a message..."
                      placeholderTextColor={colors.textMuted}
                      value={broadcastText}
                      onChangeText={setBroadcastText}
                      multiline
                      maxLength={1000}
                    />
                    {broadcastResult ? (
                      <Text style={[
                        styles.broadcastResult,
                        broadcastResult.startsWith('Sent') ? styles.broadcastOk : styles.broadcastErr,
                      ]}>
                        {broadcastResult}
                      </Text>
                    ) : null}
                    <TouchableOpacity
                      style={[styles.sendBtn, (!broadcastText.trim() || broadcasting) && styles.btnDisabled]}
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

                    {/* ── Disconnect ─────────────────────────────────── */}
                    <TouchableOpacity
                      style={styles.disconnectRow}
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
                {/* ── No bot — connect flow ───────────────────────────── */}
                <Text style={styles.sectionLabel}>Connect a Telegram Bot</Text>
                <Text style={styles.sectionHint}>
                  {'1. Open Telegram and message @BotFather\n'}
                  {'2. Send /newbot and follow the steps\n'}
                  {'3. Copy the API token BotFather gives you\n'}
                  {'4. Paste it below and tap Connect'}
                </Text>

                <TextInput
                  style={styles.tokenInput}
                  placeholder="Bot token (e.g. 1234567890:ABC...)"
                  placeholderTextColor={colors.textMuted}
                  value={tokenInput}
                  onChangeText={t => { setTokenInput(t); setTestResult(null); setConnectError(''); }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                />

                {testResult ? (
                  <View style={styles.testResultRow}>
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
                    style={[styles.testBtn, (!tokenInput.trim() || testing) && styles.btnDisabled]}
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
                    style={[styles.connectBtn, (!tokenInput.trim() || connecting) && styles.btnDisabled]}
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

      {/* Disconnect confirm modal */}
      <Modal
        visible={showDisconnectConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDisconnectConfirm(false)}
      >
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmSheet}>
            <AlertTriangle size={28} color="#EF4444" strokeWidth={2} />
            <Text style={styles.confirmTitle}>Disconnect Bot</Text>
            <Text style={styles.confirmText}>
              This will remove @{bot?.bot_username} from this group and delete its webhook.
            </Text>
            <View style={styles.confirmBtns}>
              <TouchableOpacity
                style={styles.confirmCancel}
                onPress={() => setShowDisconnectConfirm(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmDanger}
                onPress={handleDisconnect}
                activeOpacity={0.8}
                disabled={disconnecting}
              >
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

// ── Small helper components ───────────────────────────────────────────────────

function StepRow({ n, text }: { n: number; text: string }) {
  return (
    <View style={styles.stepRow}>
      <View style={styles.stepNum}>
        <Text style={styles.stepNumText}>{n}</Text>
      </View>
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}

function ConfigToggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.configRow}>
      <Text style={styles.configRowLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: 'rgba(255,255,255,0.1)', true: 'rgba(59,130,246,0.45)' }}
        thumbColor={value ? colors.primary : '#555'}
      />
    </View>
  );
}

function ConfigTextArea({ label, placeholder, value, onChange }: {
  label: string; placeholder: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <View style={styles.configTextAreaWrap}>
      <Text style={styles.configTextAreaLabel}>{label}</Text>
      <TextInput
        style={styles.configTextArea}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        value={value}
        onChangeText={onChange}
        multiline
        maxLength={500}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#0F0F18',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: 0,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
    maxHeight: '90%',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)', alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg },
  title: { flex: 1, fontSize: fontSize.lg, fontWeight: '800', color: colors.textPrimary },
  scroll: { flex: 1 },

  successBar: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(16,185,129,0.1)',
    borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.22)',
    marginBottom: spacing.md,
  },
  successText: { fontSize: fontSize.sm, color: '#10B981', fontWeight: '600', flex: 1 },

  // Bot card
  botCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(59,130,246,0.07)',
    borderRadius: 14, padding: spacing.lg,
    borderWidth: 1, borderColor: 'rgba(59,130,246,0.18)',
    marginBottom: spacing.md,
  },
  botCardLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  botIcon: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(59,130,246,0.13)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(59,130,246,0.25)',
  },
  botName: { fontSize: fontSize.md, fontWeight: '700', color: colors.textPrimary },
  botUsername: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  dotOn: { backgroundColor: '#10B981' },
  dotOff: { backgroundColor: '#EF4444' },
  statusText: { fontSize: fontSize.xs, fontWeight: '700' },
  textOn: { color: '#10B981' },
  textOff: { color: '#EF4444' },

  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
    marginBottom: spacing.md,
  },
  rowLabel: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textPrimary },

  // Linked account
  linkedCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(16,185,129,0.07)',
    borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.2)',
    marginBottom: spacing.md,
  },
  linkedCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  linkedName: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textPrimary },
  linkedHandle: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 1 },
  unlinkBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)',
  },
  unlinkBtnText: { fontSize: 11, fontWeight: '700', color: '#EF4444' },
  notLinkedCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(245,158,11,0.07)',
    borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.2)',
    marginBottom: spacing.md,
  },
  notLinkedText: { fontSize: fontSize.sm, color: '#F59E0B', flex: 1 },

  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: colors.textMuted,
    letterSpacing: 0.8, textTransform: 'uppercase',
    marginTop: spacing.lg, marginBottom: 6,
  },
  sectionHint: { fontSize: 13, color: colors.textMuted, lineHeight: 20, marginBottom: spacing.md },
  botNameInline: { color: colors.primary, fontWeight: '700' },

  // Step list
  stepList: { gap: 8, marginBottom: spacing.md },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  stepNum: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(59,130,246,0.15)',
    borderWidth: 1, borderColor: 'rgba(59,130,246,0.3)',
    justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  stepNumText: { fontSize: 10, fontWeight: '800', color: colors.primary },
  stepText: { fontSize: 13, color: colors.textSecondary, lineHeight: 18, flex: 1 },

  // Code card
  codeCard: {
    backgroundColor: 'rgba(59,130,246,0.06)',
    borderRadius: 14, padding: spacing.lg,
    borderWidth: 1.5, borderColor: 'rgba(59,130,246,0.25)',
    alignItems: 'center', gap: 6,
    marginBottom: spacing.sm,
  },
  codeLabel: { fontSize: 11, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 },
  codeValue: { fontSize: 20, fontWeight: '900', color: colors.textPrimary, letterSpacing: 2 },
  codeExpiry: { fontSize: 12, color: colors.textMuted },
  copyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 4,
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: 'rgba(59,130,246,0.12)',
    borderWidth: 1, borderColor: 'rgba(59,130,246,0.3)',
  },
  copyBtnDone: { backgroundColor: 'rgba(16,185,129,0.1)', borderColor: 'rgba(16,185,129,0.3)' },
  copyBtnText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  copyBtnTextDone: { color: '#10B981' },

  expiredBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(245,158,11,0.08)',
    borderRadius: 8, padding: 8,
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.2)',
    marginBottom: spacing.sm,
  },
  expiredText: { fontSize: 12, color: '#F59E0B', fontWeight: '600' },

  errorRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    backgroundColor: 'rgba(239,68,68,0.07)',
    borderRadius: 8, padding: 8,
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.18)',
    marginBottom: spacing.sm,
  },
  errorText: { fontSize: 12, color: '#EF4444', flex: 1, lineHeight: 17 },

  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, paddingHorizontal: spacing.lg,
    borderRadius: 12,
    backgroundColor: 'rgba(59,130,246,0.1)',
    borderWidth: 1, borderColor: 'rgba(59,130,246,0.28)',
    marginBottom: spacing.lg,
  },
  btnDisabled: { opacity: 0.4 },
  actionBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.primary },

  // Config
  configToggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)',
    marginTop: spacing.sm,
  },
  configToggleText: { flex: 1, fontSize: fontSize.sm, fontWeight: '600', color: colors.textMuted },
  configPanel: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 14, padding: spacing.lg,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    gap: 4, marginBottom: spacing.md,
  },
  configRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  configRowLabel: { fontSize: 13, color: colors.textSecondary, flex: 1, paddingRight: 12 },
  configTextAreaWrap: { paddingVertical: 8 },
  configTextAreaLabel: { fontSize: 12, color: colors.textMuted, marginBottom: 6, fontWeight: '600' },
  configTextArea: {
    backgroundColor: '#0A0A13',
    borderRadius: 10, padding: 10,
    fontSize: 13, color: colors.textPrimary,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
    minHeight: 60, textAlignVertical: 'top',
  },
  savedRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingTop: 8,
  },
  savedText: { fontSize: 12, color: '#10B981', fontWeight: '600' },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: spacing.md, paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.primary,
  },
  saveBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: '#fff' },

  // Broadcast
  broadcastInput: {
    backgroundColor: '#0A0A13', borderRadius: 12,
    paddingHorizontal: spacing.lg, paddingVertical: 12,
    fontSize: fontSize.sm, color: colors.textPrimary,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
    minHeight: 76, textAlignVertical: 'top',
    marginBottom: spacing.sm,
  },
  broadcastResult: { fontSize: 12, marginBottom: 8 },
  broadcastOk: { color: '#10B981' },
  broadcastErr: { color: '#EF4444' },
  sendBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, paddingHorizontal: spacing.lg,
    borderRadius: 12, backgroundColor: colors.primary,
    marginBottom: spacing.md,
  },
  sendBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: '#fff' },

  disconnectRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 14,
    borderTopWidth: 1, borderTopColor: 'rgba(239,68,68,0.12)',
    marginTop: spacing.sm,
  },
  disconnectText: { fontSize: fontSize.sm, fontWeight: '700', color: '#EF4444' },

  // Connect flow
  tokenInput: {
    backgroundColor: '#0A0A13', borderRadius: 12,
    paddingHorizontal: spacing.lg, paddingVertical: 12,
    fontSize: fontSize.sm, color: colors.textPrimary,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
    marginBottom: spacing.sm,
  },
  testResultRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(16,185,129,0.08)',
    borderRadius: 8, padding: 8, marginBottom: spacing.sm,
  },
  testResultText: { fontSize: fontSize.xs, color: '#10B981', fontWeight: '600' },
  btnRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  testBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: 12,
    backgroundColor: 'rgba(59,130,246,0.1)',
    borderWidth: 1, borderColor: 'rgba(59,130,246,0.28)',
  },
  testBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.primary },
  connectBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: 12,
    backgroundColor: colors.primary,
  },
  connectBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: '#fff' },

  // Confirm modal
  confirmOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  confirmSheet: {
    backgroundColor: '#0F0F18',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: spacing.xl, paddingBottom: 44,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center', gap: spacing.md,
  },
  confirmTitle: { fontSize: fontSize.lg, fontWeight: '800', color: colors.textPrimary },
  confirmText: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
  confirmBtns: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm, width: '100%' },
  confirmCancel: {
    flex: 1, paddingVertical: 13, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
  },
  confirmCancelText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textPrimary },
  confirmDanger: {
    flex: 1, paddingVertical: 13, borderRadius: 12,
    backgroundColor: 'rgba(239,68,68,0.13)',
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.28)',
    alignItems: 'center',
  },
  confirmDangerText: { fontSize: fontSize.sm, fontWeight: '700', color: '#EF4444' },
});
