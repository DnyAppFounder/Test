import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ActivityIndicator, Modal, ScrollView, Switch, Platform, Image,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import {
  X, Bot, Link, Copy, RefreshCw, Trash2, Send, Plus, Radio,
  TriangleAlert as AlertTriangle, CircleCheck as CheckCircle,
  ChevronDown, ChevronUp, Settings, Unlink, Zap, MessageSquare, Camera,
} from 'lucide-react-native';
import { colors, spacing, fontSize, borderRadius } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

// ── Types ─────────────────────────────────────────────────────────────────────

interface BotSettingsProps {
  visible: boolean;
  onClose: () => void;
  groupId: string;
  walletAddress: string;
  isAdmin: boolean;
}

interface InternalBot {
  id: string;
  bot_name: string;
  bot_avatar_url: string | null;
  is_enabled: boolean;
  settings: Record<string, unknown>;
}

interface BotCommand {
  id: string;
  command: string;
  response_text: string;
  is_enabled: boolean;
}

interface TelegramBot {
  id: string;
  bot_id: number;
  bot_username: string;
  bot_name: string;
  status: 'connected' | 'disabled';
  webhook_set: boolean;
  settings: TelegramBotSettings;
}

interface TelegramBotSettings {
  welcome_enabled?: boolean;
  welcome_message?: string;
  link_requirement?: boolean;
  rules_message?: string;
  links_message?: string;
  rewards_message?: string;
}

interface TelegramTarget {
  id: string;
  chat_id: number;
  chat_name: string;
  chat_type: string;
  is_enabled: boolean;
}

interface LinkCodeRecord {
  code: string;
  expires_at: string;
}

interface LinkedTelegramAccount {
  telegram_username: string | null;
  telegram_first_name: string | null;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function BotSettings({ visible, onClose, groupId, walletAddress, isAdmin }: BotSettingsProps) {
  const [activeTab, setActiveTab] = useState<'internal' | 'telegram'>('internal');
  const [loading, setLoading] = useState(true);
  const [successMsg, setSuccessMsg] = useState('');

  // Internal bot state
  const [internalBot, setInternalBot] = useState<InternalBot | null>(null);
  const [commands, setCommands] = useState<BotCommand[]>([]);
  const [savingInternal, setSavingInternal] = useState(false);
  const [internalBotName, setInternalBotName] = useState('');
  const [internalEnabled, setInternalEnabled] = useState(true);
  const [internalBotAvatar, setInternalBotAvatar] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [editingCommand, setEditingCommand] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [savingCommand, setSavingCommand] = useState(false);
  const [broadcastText, setBroadcastText] = useState('');
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState('');

  // Telegram bot state
  const [telegramBot, setTelegramBot] = useState<TelegramBot | null>(null);
  const [targets, setTargets] = useState<TelegramTarget[]>([]);
  const [tokenInput, setTokenInput] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ bot_username: string; bot_name: string } | null>(null);
  const [connectError, setConnectError] = useState('');
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [linkCode, setLinkCode] = useState<LinkCodeRecord | null>(null);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [codeError, setCodeError] = useState('');
  const [codeCopied, setCodeCopied] = useState(false);
  const [linkedAccount, setLinkedAccount] = useState<LinkedTelegramAccount | null>(null);
  const [unlinking, setUnlinking] = useState(false);
  const [showTgConfig, setShowTgConfig] = useState(false);
  const [tgConfig, setTgConfig] = useState<TelegramBotSettings>({});
  const [savingTgConfig, setSavingTgConfig] = useState(false);
  const [tgConfigSaved, setTgConfigSaved] = useState(false);
  const [addTargetInput, setAddTargetInput] = useState('');
  const [addingTarget, setAddingTarget] = useState(false);
  const [targetError, setTargetError] = useState('');
  const [testBotRunning, setTestBotRunning] = useState(false);
  const [testBotResult, setTestBotResult] = useState<string | null>(null);
  const [tgBroadcastText, setTgBroadcastText] = useState('');
  const [tgBroadcasting, setTgBroadcasting] = useState(false);
  const [tgBroadcastResult, setTgBroadcastResult] = useState('');
  const [tgTargetBroadcastText, setTgTargetBroadcastText] = useState('');
  const [tgTargetBroadcasting, setTgTargetBroadcasting] = useState(false);
  const [tgTargetBroadcastResult, setTgTargetBroadcastResult] = useState('');

  useEffect(() => {
    if (visible) {
      loadData();
      setConnectError('');
      setTestResult(null);
      setTokenInput('');
      setSuccessMsg('');
      setBroadcastResult('');
      setTgBroadcastResult('');
      setCodeError('');
      setCodeCopied(false);
      setTestBotResult(null);
      setTargetError('');
    }
  }, [visible, groupId]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Load internal bot
      const iRes = await callInternalBot('get', { group_id: groupId });
      if (iRes.bot) {
        setInternalBot(iRes.bot);
        setCommands(iRes.commands ?? []);
        setInternalBotName(iRes.bot.bot_name);
        setInternalEnabled(iRes.bot.is_enabled);
        setInternalBotAvatar(iRes.bot.bot_avatar_url ?? null);
      } else {
        setInternalBot(null);
        setCommands([]);
        setInternalBotAvatar(null);
      }

      // Load Telegram bot
      const { data: botData } = await supabase
        .from('group_telegram_bots')
        .select('id, bot_id, bot_username, bot_name, status, webhook_set, settings')
        .eq('group_id', groupId)
        .maybeSingle();

      const botRecord = botData ? { ...botData, settings: botData.settings ?? {} } as TelegramBot : null;
      setTelegramBot(botRecord);

      if (botRecord) {
        setTgConfig(botRecord.settings ?? {});

        // Load targets
        const { data: targetData } = await supabase
          .from('telegram_bot_targets')
          .select('id, chat_id, chat_name, chat_type, is_enabled')
          .eq('bot_record_id', botRecord.id)
          .order('created_at');
        setTargets(targetData ?? []);

        // Load profile for link code + linked account
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

          const { data: linked } = await supabase
            .from('telegram_linked_users')
            .select('telegram_username, telegram_first_name')
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

  // ── API helpers ─────────────────────────────────────────────────────────────

  const callInternalBot = async (action: string, body: Record<string, unknown>) => {
    const url = `${SUPABASE_URL}/functions/v1/internal-bot?action=${action}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}`, Apikey: ANON_KEY },
      body: JSON.stringify(body),
    });
    return res.json();
  };

  const callTelegramBot = async (action: string, body: Record<string, unknown>) => {
    const url = `${SUPABASE_URL}/functions/v1/connect-telegram-bot?action=${action}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}`, Apikey: ANON_KEY },
      body: JSON.stringify(body),
    });
    return res.json();
  };

  const flash = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const handlePickBotAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setUploadingAvatar(true);
    try {
      const ext = asset.uri.split('.').pop() ?? 'jpg';
      const path = `bot-avatars/${groupId}/${Date.now()}.${ext}`;
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const { error: uploadErr } = await supabase.storage
        .from('avatars')
        .upload(path, blob, { contentType: asset.mimeType ?? 'image/jpeg', upsert: true });
      if (uploadErr) return;
      const { data: publicData } = supabase.storage.from('avatars').getPublicUrl(path);
      if (publicData?.publicUrl) {
        setInternalBotAvatar(publicData.publicUrl);
        if (internalBot) {
          await callInternalBot('upsert', {
            group_id: groupId,
            wallet_address: walletAddress,
            bot_name: internalBotName || internalBot.bot_name,
            is_enabled: internalEnabled,
            bot_avatar_url: publicData.publicUrl,
          });
          setInternalBot(prev => prev ? { ...prev, bot_avatar_url: publicData.publicUrl } : prev);
          flash('Bot avatar updated.');
        }
      }
    } finally {
      setUploadingAvatar(false);
    }
  };

  // ── Internal bot handlers ───────────────────────────────────────────────────

  const handleSaveInternalBot = async () => {
    if (savingInternal) return;
    setSavingInternal(true);
    try {
      const res = await callInternalBot('upsert', {
        group_id: groupId,
        wallet_address: walletAddress,
        bot_name: internalBotName.trim() || 'DAWEN Bot',
        is_enabled: internalEnabled,
        bot_avatar_url: internalBotAvatar ?? null,
      });
      if (res.success) {
        setInternalBot(res.bot);
        setCommands(res.commands ?? []);
        flash('Bot settings saved.');
      }
    } finally {
      setSavingInternal(false);
    }
  };

  const handleToggleInternalBot = async (val: boolean) => {
    setInternalEnabled(val);
    await callInternalBot('upsert', {
      group_id: groupId,
      wallet_address: walletAddress,
      bot_name: internalBotName || internalBot?.bot_name || 'DAWEN Bot',
      is_enabled: val,
      bot_avatar_url: internalBotAvatar ?? null,
    });
  };

  const handleEditCommand = (cmd: BotCommand) => {
    setEditingCommand(cmd.id);
    setEditText(cmd.response_text);
  };

  const handleSaveCommand = async (cmdId: string) => {
    if (savingCommand) return;
    setSavingCommand(true);
    try {
      const res = await callInternalBot('update_command', {
        group_id: groupId,
        wallet_address: walletAddress,
        command_id: cmdId,
        response_text: editText,
      });
      if (res.success) {
        setCommands(prev => prev.map(c => c.id === cmdId ? { ...c, response_text: editText } : c));
        setEditingCommand(null);
      }
    } finally {
      setSavingCommand(false);
    }
  };

  const handleToggleCommand = async (cmdId: string, val: boolean) => {
    await callInternalBot('update_command', {
      group_id: groupId,
      wallet_address: walletAddress,
      command_id: cmdId,
      is_enabled: val,
    });
    setCommands(prev => prev.map(c => c.id === cmdId ? { ...c, is_enabled: val } : c));
  };

  const handleInternalBroadcast = async () => {
    if (!broadcastText.trim() || broadcasting) return;
    setBroadcasting(true);
    setBroadcastResult('');
    try {
      const res = await callInternalBot('send_message', {
        group_id: groupId,
        wallet_address: walletAddress,
        content: broadcastText.trim(),
      });
      if (res.success) {
        setBroadcastResult('Message sent to the group.');
        setBroadcastText('');
      } else {
        setBroadcastResult(res.error || 'Failed to send');
      }
    } catch {
      setBroadcastResult('Network error');
    } finally {
      setBroadcasting(false);
    }
  };

  // ── Telegram bot handlers ───────────────────────────────────────────────────

  const handleTestToken = async () => {
    if (!tokenInput.trim() || testing) return;
    setTesting(true);
    setConnectError('');
    setTestResult(null);
    try {
      const res = await callTelegramBot('test', { token: tokenInput.trim(), group_id: groupId, wallet_address: walletAddress });
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
      const res = await callTelegramBot('connect', { token: tokenInput.trim(), group_id: groupId, wallet_address: walletAddress });
      if (res.success) {
        flash(`@${res.bot_username} connected!`);
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
      await callTelegramBot('disconnect', { group_id: groupId, wallet_address: walletAddress });
      setTelegramBot(null);
      setTargets([]);
      setLinkCode(null);
      setLinkedAccount(null);
      setShowDisconnectConfirm(false);
    } catch {
      // ignore
    } finally {
      setDisconnecting(false);
    }
  };

  const handleTelegramToggle = async (enabled: boolean) => {
    if (toggling) return;
    setToggling(true);
    try {
      await callTelegramBot('toggle', { group_id: groupId, wallet_address: walletAddress, enabled });
      setTelegramBot(prev => prev ? { ...prev, status: enabled ? 'connected' : 'disabled' } : prev);
    } finally {
      setToggling(false);
    }
  };

  const generateLinkCode = async () => {
    if (generatingCode) return;
    setGeneratingCode(true);
    setCodeError('');
    try {
      const res = await callTelegramBot('generate_code', { group_id: groupId, wallet_address: walletAddress });
      if (res.success && res.code) {
        setLinkCode({ code: res.code, expires_at: res.expires_at });
        setCodeCopied(false);
      } else {
        setCodeError(res.error || 'Could not generate link code. Please try again.');
      }
    } catch {
      setCodeError('Could not generate link code. Please try again.');
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
      flash('Telegram account unlinked.');
    } finally {
      setUnlinking(false);
    }
  };

  const handleSaveTgConfig = async () => {
    if (savingTgConfig) return;
    setSavingTgConfig(true);
    setTgConfigSaved(false);
    try {
      const res = await callTelegramBot('update_settings', {
        group_id: groupId,
        wallet_address: walletAddress,
        settings: tgConfig,
      });
      if (res.success) {
        setTgConfigSaved(true);
        setTelegramBot(prev => prev ? { ...prev, settings: tgConfig } : prev);
        setTimeout(() => setTgConfigSaved(false), 3000);
      }
    } finally {
      setSavingTgConfig(false);
    }
  };

  const handleAddTarget = async () => {
    const val = addTargetInput.trim();
    if (!val || addingTarget) return;
    setAddingTarget(true);
    setTargetError('');
    try {
      const res = await callTelegramBot('add_target', {
        group_id: groupId,
        wallet_address: walletAddress,
        chat_id: parseInt(val) || val,
      });
      if (res.success) {
        setAddTargetInput('');
        await loadData();
        flash('Target added.');
      } else {
        setTargetError(res.error || 'Failed to add target');
      }
    } catch {
      setTargetError('Network error');
    } finally {
      setAddingTarget(false);
    }
  };

  const handleRemoveTarget = async (targetId: string) => {
    await callTelegramBot('remove_target', {
      group_id: groupId,
      wallet_address: walletAddress,
      target_id: targetId,
    });
    setTargets(prev => prev.filter(t => t.id !== targetId));
  };

  const handleTestBot = async () => {
    if (testBotRunning) return;
    setTestBotRunning(true);
    setTestBotResult(null);
    try {
      const res = await callTelegramBot('test_bot', { group_id: groupId, wallet_address: walletAddress });
      if (res.success) {
        const parts: string[] = [];
        if (res.results?.bot_username) parts.push(`Bot: @${res.results.bot_username}`);
        if (res.results?.webhook_correct === true) parts.push('Webhook: OK');
        else if (res.results?.webhook_fixed) parts.push('Webhook: Fixed automatically');
        else if (res.results?.webhook_correct === false) parts.push('Webhook: Issue detected');
        setTestBotResult(parts.join(' · ') || 'Bot connection verified.');
      } else {
        setTestBotResult(res.error || 'Test failed');
      }
    } catch {
      setTestBotResult('Network error');
    } finally {
      setTestBotRunning(false);
    }
  };

  const handleTgBroadcast = async () => {
    if (!tgBroadcastText.trim() || tgBroadcasting) return;
    setTgBroadcasting(true);
    setTgBroadcastResult('');
    try {
      const url = `${SUPABASE_URL}/functions/v1/send-telegram-bot-message`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}`, Apikey: ANON_KEY },
        body: JSON.stringify({ group_id: groupId, wallet_address: walletAddress, message: tgBroadcastText.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setTgBroadcastResult(`Sent to ${data.sent} linked user${data.sent !== 1 ? 's' : ''}`);
        setTgBroadcastText('');
      } else {
        setTgBroadcastResult(data.error || 'Failed to send');
      }
    } catch {
      setTgBroadcastResult('Network error');
    } finally {
      setTgBroadcasting(false);
    }
  };

  const handleTgTargetBroadcast = async () => {
    if (!tgTargetBroadcastText.trim() || tgTargetBroadcasting) return;
    setTgTargetBroadcasting(true);
    setTgTargetBroadcastResult('');
    try {
      const res = await callTelegramBot('broadcast_to_targets', {
        group_id: groupId,
        wallet_address: walletAddress,
        message: tgTargetBroadcastText.trim(),
      });
      if (res.success) {
        const detail = res.failed > 0 ? ` (${res.failed} failed)` : '';
        setTgTargetBroadcastResult(`Sent to ${res.sent} target${res.sent !== 1 ? 's' : ''}${detail}.`);
        setTgTargetBroadcastText('');
      } else {
        setTgTargetBroadcastResult(res.error || 'Failed to send');
      }
    } catch {
      setTgTargetBroadcastResult('Network error');
    } finally {
      setTgTargetBroadcasting(false);
    }
  };

  // ── Derived values ──────────────────────────────────────────────────────────

  const linkCodeExpiry = linkCode ? new Date(linkCode.expires_at) : null;
  const minutesLeft = linkCodeExpiry
    ? Math.max(0, Math.round((linkCodeExpiry.getTime() - Date.now()) / 60000))
    : 0;
  const codeExpired = minutesLeft === 0 && !!linkCode;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <Bot size={18} color={colors.primary} strokeWidth={2} />
            <Text style={styles.title}>Bot Settings</Text>
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

          {/* Tabs */}
          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'internal' && styles.tabActive]}
              onPress={() => setActiveTab('internal')}
              activeOpacity={0.8}
            >
              <MessageSquare size={13} color={activeTab === 'internal' ? colors.primary : colors.textMuted} strokeWidth={2} />
              <Text style={[styles.tabText, activeTab === 'internal' && styles.tabTextActive]}>DAWEN Bot</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'telegram' && styles.tabActive]}
              onPress={() => setActiveTab('telegram')}
              activeOpacity={0.8}
            >
              <Radio size={13} color={activeTab === 'telegram' ? colors.primary : colors.textMuted} strokeWidth={2} />
              <Text style={[styles.tabText, activeTab === 'telegram' && styles.tabTextActive]}>Telegram Connector</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
            {loading ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: 40 }} />
            ) : activeTab === 'internal' ? (
              <InternalBotTab
                isAdmin={isAdmin}
                bot={internalBot}
                commands={commands}
                botName={internalBotName}
                setBotName={setInternalBotName}
                enabled={internalEnabled}
                onToggle={handleToggleInternalBot}
                onSave={handleSaveInternalBot}
                saving={savingInternal}
                botAvatarUrl={internalBotAvatar}
                uploadingAvatar={uploadingAvatar}
                onPickAvatar={handlePickBotAvatar}
                editingCommand={editingCommand}
                editText={editText}
                setEditText={setEditText}
                onEditCommand={handleEditCommand}
                onSaveCommand={handleSaveCommand}
                savingCommand={savingCommand}
                onCancelEdit={() => setEditingCommand(null)}
                onToggleCommand={handleToggleCommand}
                broadcastText={broadcastText}
                setBroadcastText={setBroadcastText}
                onBroadcast={handleInternalBroadcast}
                broadcasting={broadcasting}
                broadcastResult={broadcastResult}
                groupId={groupId}
                walletAddress={walletAddress}
                callInternalBot={callInternalBot}
              />
            ) : (
              <TelegramTab
                isAdmin={isAdmin}
                bot={telegramBot}
                targets={targets}
                tokenInput={tokenInput}
                setTokenInput={(t: string) => { setTokenInput(t); setTestResult(null); setConnectError(''); }}
                connecting={connecting}
                testing={testing}
                testResult={testResult}
                connectError={connectError}
                onTest={handleTestToken}
                onConnect={handleConnect}
                onDisconnect={() => setShowDisconnectConfirm(true)}
                toggling={toggling}
                onToggle={handleTelegramToggle}
                linkCode={codeExpired ? null : linkCode}
                minutesLeft={minutesLeft}
                codeExpired={codeExpired}
                generatingCode={generatingCode}
                onGenerateCode={generateLinkCode}
                codeError={codeError}
                codeCopied={codeCopied}
                onCopyCode={copyCode}
                linkedAccount={linkedAccount}
                unlinking={unlinking}
                onUnlink={handleUnlinkTelegram}
                showConfig={showTgConfig}
                onToggleConfig={() => setShowTgConfig(v => !v)}
                config={tgConfig}
                setConfig={setTgConfig}
                savingConfig={savingTgConfig}
                configSaved={tgConfigSaved}
                onSaveConfig={handleSaveTgConfig}
                addTargetInput={addTargetInput}
                setAddTargetInput={setAddTargetInput}
                addingTarget={addingTarget}
                targetError={targetError}
                onAddTarget={handleAddTarget}
                onRemoveTarget={handleRemoveTarget}
                testBotRunning={testBotRunning}
                testBotResult={testBotResult}
                onTestBot={handleTestBot}
                broadcastText={tgBroadcastText}
                setBroadcastText={setTgBroadcastText}
                broadcasting={tgBroadcasting}
                broadcastResult={tgBroadcastResult}
                onBroadcast={handleTgBroadcast}
                targetBroadcastText={tgTargetBroadcastText}
                setTargetBroadcastText={setTgTargetBroadcastText}
                targetBroadcasting={tgTargetBroadcasting}
                targetBroadcastResult={tgTargetBroadcastResult}
                onTargetBroadcast={handleTgTargetBroadcast}
              />
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
              This will remove @{telegramBot?.bot_username} from this group and delete its webhook.
            </Text>
            <View style={styles.confirmBtns}>
              <TouchableOpacity style={styles.confirmCancel} onPress={() => setShowDisconnectConfirm(false)} activeOpacity={0.8}>
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmDanger} onPress={handleDisconnect} activeOpacity={0.8} disabled={disconnecting}>
                {disconnecting
                  ? <ActivityIndicator size="small" color="#EF4444" />
                  : <Text style={styles.confirmDangerText}>Disconnect</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

// ── Internal Bot Tab ──────────────────────────────────────────────────────────

function InternalBotTab({
  isAdmin, bot, commands, botName, setBotName, enabled, onToggle, onSave, saving,
  botAvatarUrl, uploadingAvatar, onPickAvatar,
  editingCommand, editText, setEditText, onEditCommand, onSaveCommand, savingCommand, onCancelEdit, onToggleCommand,
  broadcastText, setBroadcastText, onBroadcast, broadcasting, broadcastResult,
  groupId, walletAddress, callInternalBot,
}: any) {
  return (
    <View>
      <View style={styles.sectionCard}>
        <View style={styles.sectionCardHeader}>
          <View style={styles.sectionIconWrap}>
            <MessageSquare size={16} color={colors.primary} strokeWidth={2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionCardTitle}>Internal DAWEN Bot</Text>
            <Text style={styles.sectionCardSub}>A bot user inside your DAWEN group that responds to commands and can send announcements.</Text>
          </View>
        </View>
      </View>

      {isAdmin && (
        <>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Bot Enabled</Text>
            <Switch
              value={enabled}
              onValueChange={onToggle}
              trackColor={{ false: 'rgba(255,255,255,0.1)', true: 'rgba(59,130,246,0.45)' }}
              thumbColor={enabled ? colors.primary : '#555'}
            />
          </View>

          {/* Bot Avatar */}
          <Text style={styles.fieldLabel}>Bot Avatar</Text>
          <View style={styles.avatarRow}>
            <TouchableOpacity onPress={onPickAvatar} activeOpacity={0.8} disabled={uploadingAvatar} style={styles.avatarWrap}>
              {botAvatarUrl ? (
                <Image source={{ uri: botAvatarUrl }} style={styles.avatarImg} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Bot size={22} color={colors.textMuted} strokeWidth={2} />
                </View>
              )}
              <View style={styles.avatarCamOverlay}>
                {uploadingAvatar
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Camera size={12} color="#fff" strokeWidth={2} />
                }
              </View>
            </TouchableOpacity>
            <Text style={styles.avatarHint}>Tap to change the bot's avatar image.</Text>
          </View>

          <Text style={styles.fieldLabel}>Bot Name</Text>
          <TextInput
            style={styles.fieldInput}
            placeholder="DAWEN Bot"
            placeholderTextColor={colors.textMuted}
            value={botName}
            onChangeText={setBotName}
            maxLength={32}
          />

          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.btnDisabled]}
            onPress={onSave}
            activeOpacity={0.8}
            disabled={saving}
          >
            {saving ? <ActivityIndicator size="small" color="#fff" /> : null}
            <Text style={styles.saveBtnText}>{bot ? 'Save Changes' : 'Enable DAWEN Bot'}</Text>
          </TouchableOpacity>
        </>
      )}

      {bot && commands.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>Bot Commands</Text>
          <Text style={styles.sectionHint}>These commands are available inside the DAWEN group chat.</Text>
          {commands.map((cmd: BotCommand) => (
            <View key={cmd.id} style={styles.commandCard}>
              <View style={styles.commandHeader}>
                <Text style={styles.commandName}>/{cmd.command}</Text>
                <View style={styles.commandActions}>
                  {isAdmin && (
                    <>
                      <Switch
                        value={cmd.is_enabled}
                        onValueChange={(v) => onToggleCommand(cmd.id, v)}
                        trackColor={{ false: 'rgba(255,255,255,0.08)', true: 'rgba(59,130,246,0.4)' }}
                        thumbColor={cmd.is_enabled ? colors.primary : '#555'}
                      />
                      {editingCommand !== cmd.id && (
                        <TouchableOpacity
                          style={styles.editBtn}
                          onPress={() => onEditCommand(cmd)}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.editBtnText}>Edit</Text>
                        </TouchableOpacity>
                      )}
                    </>
                  )}
                </View>
              </View>

              {editingCommand === cmd.id ? (
                <View style={{ marginTop: 8, gap: 8 }}>
                  <TextInput
                    style={styles.commandEditInput}
                    value={editText}
                    onChangeText={setEditText}
                    placeholder="Response text..."
                    placeholderTextColor={colors.textMuted}
                    multiline
                    maxLength={500}
                    autoFocus
                  />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                      style={[styles.commandSaveBtn, savingCommand && styles.btnDisabled]}
                      onPress={() => onSaveCommand(cmd.id)}
                      disabled={savingCommand}
                      activeOpacity={0.8}
                    >
                      {savingCommand ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.commandSaveBtnText}>Save</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.commandCancelBtn} onPress={onCancelEdit} activeOpacity={0.8}>
                      <Text style={styles.commandCancelBtnText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                cmd.response_text ? (
                  <Text style={styles.commandResponse}>{cmd.response_text}</Text>
                ) : (
                  <Text style={[styles.commandResponse, { color: colors.textMuted, fontStyle: 'italic' }]}>Auto-generated response</Text>
                )
              )}
            </View>
          ))}
        </>
      )}

      {bot && isAdmin && (
        <>
          <Text style={styles.sectionLabel}>Send Announcement</Text>
          <Text style={styles.sectionHint}>Send a message to the group as the DAWEN Bot.</Text>
          <TextInput
            style={styles.broadcastInput}
            placeholder="Type an announcement..."
            placeholderTextColor={colors.textMuted}
            value={broadcastText}
            onChangeText={setBroadcastText}
            multiline
            maxLength={1000}
          />
          {broadcastResult ? (
            <Text style={[styles.broadcastResult, broadcastResult.startsWith('Message') ? styles.broadcastOk : styles.broadcastErr]}>
              {broadcastResult}
            </Text>
          ) : null}
          <TouchableOpacity
            style={[styles.primaryBtn, (!broadcastText.trim() || broadcasting) && styles.btnDisabled]}
            onPress={onBroadcast}
            activeOpacity={0.8}
            disabled={!broadcastText.trim() || broadcasting}
          >
            {broadcasting ? <ActivityIndicator size="small" color="#fff" /> : <Send size={14} color="#fff" strokeWidth={2} />}
            <Text style={styles.primaryBtnText}>Send to Group</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

// ── Telegram Connector Tab ────────────────────────────────────────────────────

function TelegramTab({
  isAdmin, bot, targets,
  tokenInput, setTokenInput, connecting, testing, testResult, connectError, onTest, onConnect,
  onDisconnect, toggling, onToggle,
  linkCode, minutesLeft, codeExpired, generatingCode, onGenerateCode, codeError, codeCopied, onCopyCode,
  linkedAccount, unlinking, onUnlink,
  showConfig, onToggleConfig, config, setConfig, savingConfig, configSaved, onSaveConfig,
  addTargetInput, setAddTargetInput, addingTarget, targetError, onAddTarget, onRemoveTarget,
  testBotRunning, testBotResult, onTestBot,
  broadcastText, setBroadcastText, broadcasting, broadcastResult, onBroadcast,
  targetBroadcastText, setTargetBroadcastText, targetBroadcasting, targetBroadcastResult, onTargetBroadcast,
}: any) {
  return (
    <View>
      <View style={styles.sectionCard}>
        <View style={styles.sectionCardHeader}>
          <View style={styles.sectionIconWrap}>
            <Radio size={16} color={colors.primary} strokeWidth={2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionCardTitle}>Telegram Bot Connector</Text>
            <Text style={styles.sectionCardSub}>Connect a Telegram bot to this group. Send announcements from DAWEN to Telegram and respond to commands.</Text>
          </View>
        </View>
      </View>

      {!bot ? (
        /* ── Connect flow ──────────────────────────── */
        isAdmin ? (
          <>
            <Text style={styles.sectionLabel}>Connect a Telegram Bot</Text>
            <View style={styles.stepList}>
              <StepRow n={1} text="Open Telegram and message @BotFather" />
              <StepRow n={2} text="Send /newbot and follow the steps" />
              <StepRow n={3} text="Copy the token BotFather gives you" />
              <StepRow n={4} text="Paste it below and tap Connect" />
            </View>

            <TextInput
              style={styles.fieldInput}
              placeholder="Bot token (e.g. 1234567890:ABC...)"
              placeholderTextColor={colors.textMuted}
              value={tokenInput}
              onChangeText={setTokenInput}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
            />

            {testResult ? (
              <View style={styles.okRow}>
                <CheckCircle size={14} color="#10B981" strokeWidth={2} />
                <Text style={styles.okText}>Found: {testResult.bot_name} (@{testResult.bot_username})</Text>
              </View>
            ) : null}

            {connectError ? <ErrorRow text={connectError} /> : null}

            <View style={styles.btnRow}>
              <TouchableOpacity
                style={[styles.outlineBtn, (!tokenInput.trim() || testing) && styles.btnDisabled]}
                onPress={onTest}
                activeOpacity={0.8}
                disabled={!tokenInput.trim() || testing}
              >
                {testing ? <ActivityIndicator size="small" color={colors.primary} /> : <Link size={13} color={colors.primary} strokeWidth={2} />}
                <Text style={styles.outlineBtnText}>Test Token</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, { flex: 1 }, (!tokenInput.trim() || connecting) && styles.btnDisabled]}
                onPress={onConnect}
                activeOpacity={0.8}
                disabled={!tokenInput.trim() || connecting}
              >
                {connecting ? <ActivityIndicator size="small" color="#fff" /> : <Bot size={13} color="#fff" strokeWidth={2} />}
                <Text style={styles.primaryBtnText}>Connect</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No Telegram bot connected to this group yet.</Text>
          </View>
        )
      ) : (
        /* ── Connected state ───────────────────────── */
        <>
          {/* Bot card */}
          <View style={styles.botCard}>
            <View style={styles.botCardLeft}>
              <View style={styles.botIcon}>
                <Bot size={20} color={colors.primary} strokeWidth={2} />
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
              {toggling
                ? <ActivityIndicator size="small" color={colors.primary} />
                : <Switch
                    value={bot.status === 'connected'}
                    onValueChange={onToggle}
                    trackColor={{ false: 'rgba(255,255,255,0.1)', true: 'rgba(59,130,246,0.45)' }}
                    thumbColor={bot.status === 'connected' ? colors.primary : '#555'}
                  />
              }
            </View>
          )}

          {/* Test bot button */}
          {isAdmin && (
            <TouchableOpacity
              style={[styles.outlineBtn, { marginBottom: 8 }, testBotRunning && styles.btnDisabled]}
              onPress={onTestBot}
              activeOpacity={0.8}
              disabled={testBotRunning}
            >
              {testBotRunning ? <ActivityIndicator size="small" color={colors.primary} /> : <Zap size={13} color={colors.primary} strokeWidth={2} />}
              <Text style={styles.outlineBtnText}>Test Connection</Text>
            </TouchableOpacity>
          )}
          {testBotResult ? (
            <Text style={[styles.testBotResult, testBotResult.includes('error') || testBotResult.includes('fail') ? styles.broadcastErr : styles.broadcastOk]}>
              {testBotResult}
            </Text>
          ) : null}

          {/* Telegram targets */}
          {isAdmin && (
            <>
              <Text style={styles.sectionLabel}>Telegram Targets</Text>
              <Text style={styles.sectionHint}>Add Telegram channels or groups to send messages to from DAWEN.</Text>

              {targets.length === 0 ? (
                <View style={styles.emptyTargets}>
                  <Text style={styles.emptyTargetsText}>No targets added yet.</Text>
                </View>
              ) : (
                targets.map((t: TelegramTarget) => (
                  <View key={t.id} style={styles.targetCard}>
                    <View>
                      <Text style={styles.targetName}>{t.chat_name || `Chat ${t.chat_id}`}</Text>
                      <Text style={styles.targetMeta}>{t.chat_type} · {t.chat_id}</Text>
                    </View>
                    <TouchableOpacity onPress={() => onRemoveTarget(t.id)} activeOpacity={0.8} style={styles.removeBtn}>
                      <Trash2 size={13} color="#EF4444" strokeWidth={2} />
                    </TouchableOpacity>
                  </View>
                ))
              )}

              <View style={styles.addTargetRow}>
                <TextInput
                  style={[styles.fieldInput, { flex: 1, marginBottom: 0 }]}
                  placeholder="Chat ID or @username"
                  placeholderTextColor={colors.textMuted}
                  value={addTargetInput}
                  onChangeText={setAddTargetInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  style={[styles.addTargetBtn, (!addTargetInput.trim() || addingTarget) && styles.btnDisabled]}
                  onPress={onAddTarget}
                  activeOpacity={0.8}
                  disabled={!addTargetInput.trim() || addingTarget}
                >
                  {addingTarget ? <ActivityIndicator size="small" color="#fff" /> : <Plus size={14} color="#fff" strokeWidth={2} />}
                </TouchableOpacity>
              </View>
              {targetError ? <ErrorRow text={targetError} /> : null}
            </>
          )}

          {/* Link code section */}
          <Text style={styles.sectionLabel}>Your Telegram Account</Text>

          {linkedAccount ? (
            <View style={styles.linkedCard}>
              <View style={styles.linkedCardLeft}>
                <CheckCircle size={15} color="#10B981" strokeWidth={2} />
                <View>
                  <Text style={styles.linkedName}>
                    {linkedAccount.telegram_first_name || linkedAccount.telegram_username || 'Linked'}
                  </Text>
                  {linkedAccount.telegram_username ? (
                    <Text style={styles.linkedHandle}>@{linkedAccount.telegram_username}</Text>
                  ) : null}
                </View>
              </View>
              <TouchableOpacity style={styles.unlinkBtn} onPress={onUnlink} disabled={unlinking} activeOpacity={0.8}>
                {unlinking
                  ? <ActivityIndicator size="small" color="#EF4444" />
                  : <><Unlink size={11} color="#EF4444" strokeWidth={2} /><Text style={styles.unlinkBtnText}>Unlink</Text></>
                }
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.notLinkedCard}>
              <AlertTriangle size={14} color="#F59E0B" strokeWidth={2} />
              <Text style={styles.notLinkedText}>Your Telegram account is not linked yet.</Text>
            </View>
          )}

          <Text style={styles.sectionLabel}>Link Your Telegram Account</Text>
          <View style={styles.stepList}>
            <StepRow n={1} text="Tap Generate Link Code below" />
            <StepRow n={2} text={`Open Telegram and message @${bot.bot_username}`} />
            <StepRow n={3} text="Copy and send the /link command" />
          </View>

          {linkCode ? (
            <View style={styles.codeCard}>
              <Text style={styles.codeLabel}>Your link command</Text>
              <Text style={styles.codeValue}>/link {linkCode.code}</Text>
              <Text style={styles.codeExpiry}>Expires in {minutesLeft} min{minutesLeft !== 1 ? 's' : ''}</Text>
              <TouchableOpacity
                style={[styles.copyBtn, codeCopied && styles.copyBtnDone]}
                onPress={onCopyCode}
                activeOpacity={0.8}
              >
                {codeCopied
                  ? <CheckCircle size={12} color="#10B981" strokeWidth={2} />
                  : <Copy size={12} color={colors.primary} strokeWidth={2} />
                }
                <Text style={[styles.copyBtnText, codeCopied && styles.copyBtnTextDone]}>
                  {codeCopied ? 'Copied!' : 'Copy command'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : codeExpired ? (
            <View style={styles.expiredBadge}>
              <AlertTriangle size={12} color="#F59E0B" strokeWidth={2} />
              <Text style={styles.expiredText}>Code expired — generate a new one</Text>
            </View>
          ) : null}

          {codeError ? <ErrorRow text={codeError} /> : null}

          <TouchableOpacity
            style={[styles.outlineBtn, { marginBottom: spacing.lg }, generatingCode && styles.btnDisabled]}
            onPress={onGenerateCode}
            activeOpacity={0.8}
            disabled={generatingCode}
          >
            {generatingCode ? <ActivityIndicator size="small" color={colors.primary} /> : <RefreshCw size={13} color={colors.primary} strokeWidth={2} />}
            <Text style={styles.outlineBtnText}>
              {linkCode ? 'Regenerate Code' : 'Generate Link Code'}
            </Text>
          </TouchableOpacity>

          {/* Telegram bot config */}
          {isAdmin && (
            <>
              <TouchableOpacity style={styles.configToggleRow} onPress={onToggleConfig} activeOpacity={0.8}>
                <Settings size={13} color={colors.textMuted} strokeWidth={2} />
                <Text style={styles.configToggleText}>Bot Configuration</Text>
                {showConfig
                  ? <ChevronUp size={13} color={colors.textMuted} strokeWidth={2} />
                  : <ChevronDown size={13} color={colors.textMuted} strokeWidth={2} />
                }
              </TouchableOpacity>

              {showConfig && (
                <View style={styles.configPanel}>
                  <ConfigToggle
                    label="Show welcome message when bot joins"
                    value={config.welcome_enabled !== false}
                    onChange={(v: boolean) => setConfig((c: TelegramBotSettings) => ({ ...c, welcome_enabled: v }))}
                  />
                  <ConfigTextArea
                    label="Custom welcome message"
                    placeholder="Leave blank to use DAWEN default"
                    value={config.welcome_message ?? ''}
                    onChange={(v: string) => setConfig((c: TelegramBotSettings) => ({ ...c, welcome_message: v }))}
                  />
                  <ConfigToggle
                    label="Require Telegram link for protected commands"
                    value={config.link_requirement === true}
                    onChange={(v: boolean) => setConfig((c: TelegramBotSettings) => ({ ...c, link_requirement: v }))}
                  />
                  <ConfigTextArea
                    label="Custom /rules message"
                    placeholder="Leave blank to use DAWEN default"
                    value={config.rules_message ?? ''}
                    onChange={(v: string) => setConfig((c: TelegramBotSettings) => ({ ...c, rules_message: v }))}
                  />
                  <ConfigTextArea
                    label="Custom /links message"
                    placeholder="Leave blank to show official DAWEN links"
                    value={config.links_message ?? ''}
                    onChange={(v: string) => setConfig((c: TelegramBotSettings) => ({ ...c, links_message: v }))}
                  />
                  <ConfigTextArea
                    label="Custom /rewards message"
                    placeholder="Leave blank to use default $DAWORLD info"
                    value={config.rewards_message ?? ''}
                    onChange={(v: string) => setConfig((c: TelegramBotSettings) => ({ ...c, rewards_message: v }))}
                  />
                  {configSaved ? (
                    <View style={styles.savedRow}>
                      <CheckCircle size={12} color="#10B981" strokeWidth={2} />
                      <Text style={styles.savedText}>Settings saved</Text>
                    </View>
                  ) : null}
                  <TouchableOpacity
                    style={[styles.saveBtn, { marginTop: spacing.md }, savingConfig && styles.btnDisabled]}
                    onPress={onSaveConfig}
                    activeOpacity={0.8}
                    disabled={savingConfig}
                  >
                    {savingConfig ? <ActivityIndicator size="small" color="#fff" /> : null}
                    <Text style={styles.saveBtnText}>Save Configuration</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Telegram broadcast to linked users */}
              <Text style={styles.sectionLabel}>Broadcast to Linked Users</Text>
              <Text style={styles.sectionHint}>Send a DM to all Telegram users linked to this group.</Text>
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
                <Text style={[styles.broadcastResult, broadcastResult.startsWith('Sent') ? styles.broadcastOk : styles.broadcastErr]}>
                  {broadcastResult}
                </Text>
              ) : null}
              <TouchableOpacity
                style={[styles.primaryBtn, (!broadcastText.trim() || broadcasting) && styles.btnDisabled]}
                onPress={onBroadcast}
                activeOpacity={0.8}
                disabled={!broadcastText.trim() || broadcasting}
              >
                {broadcasting ? <ActivityIndicator size="small" color="#fff" /> : <Send size={13} color="#fff" strokeWidth={2} />}
                <Text style={styles.primaryBtnText}>Broadcast</Text>
              </TouchableOpacity>

              {/* Broadcast to Telegram Targets */}
              <Text style={styles.sectionLabel}>Broadcast to Telegram Targets</Text>
              <Text style={styles.sectionHint}>Send a message directly to all configured Telegram channels and groups.</Text>
              <TextInput
                style={styles.broadcastInput}
                placeholder="Type a message..."
                placeholderTextColor={colors.textMuted}
                value={targetBroadcastText}
                onChangeText={setTargetBroadcastText}
                multiline
                maxLength={1000}
              />
              {targetBroadcastResult ? (
                <Text style={[styles.broadcastResult, targetBroadcastResult.startsWith('Sent') ? styles.broadcastOk : styles.broadcastErr]}>
                  {targetBroadcastResult}
                </Text>
              ) : null}
              <TouchableOpacity
                style={[styles.primaryBtn, (!targetBroadcastText.trim() || targetBroadcasting || targets.length === 0) && styles.btnDisabled]}
                onPress={onTargetBroadcast}
                activeOpacity={0.8}
                disabled={!targetBroadcastText.trim() || targetBroadcasting || targets.length === 0}
              >
                {targetBroadcasting ? <ActivityIndicator size="small" color="#fff" /> : <Radio size={13} color="#fff" strokeWidth={2} />}
                <Text style={styles.primaryBtnText}>Send to Targets</Text>
              </TouchableOpacity>

              {/* Disconnect */}
              <TouchableOpacity style={styles.disconnectRow} onPress={onDisconnect} activeOpacity={0.8}>
                <Trash2 size={13} color="#EF4444" strokeWidth={2} />
                <Text style={styles.disconnectText}>Disconnect Bot</Text>
              </TouchableOpacity>
            </>
          )}
        </>
      )}
    </View>
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

function ErrorRow({ text }: { text: string }) {
  return (
    <View style={styles.errorRow}>
      <AlertTriangle size={12} color="#EF4444" strokeWidth={2} />
      <Text style={styles.errorText}>{text}</Text>
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

const S = StyleSheet.create;

const styles = S({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#0F0F18',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: spacing.xl, paddingTop: spacing.lg,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
    maxHeight: '92%',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)', alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
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

  // Tabs
  tabRow: {
    flexDirection: 'row', gap: 8,
    marginBottom: spacing.lg,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12, padding: 4,
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 9, borderRadius: 10,
  },
  tabActive: { backgroundColor: 'rgba(59,130,246,0.15)', borderWidth: 1, borderColor: 'rgba(59,130,246,0.28)' },
  tabText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  tabTextActive: { color: colors.primary },

  // Section card
  sectionCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 14, padding: spacing.lg,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
    marginBottom: spacing.lg,
  },
  sectionCardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  sectionIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: 'rgba(59,130,246,0.12)',
    borderWidth: 1, borderColor: 'rgba(59,130,246,0.22)',
    justifyContent: 'center', alignItems: 'center',
    flexShrink: 0, marginTop: 2,
  },
  sectionCardTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 },
  sectionCardSub: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },

  // Avatar
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: spacing.md },
  avatarWrap: { position: 'relative', width: 56, height: 56 },
  avatarImg: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.05)' },
  avatarPlaceholder: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center', alignItems: 'center',
  },
  avatarCamOverlay: {
    position: 'absolute', bottom: 0, right: 0,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: colors.primary,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#0F0F18',
  },
  avatarHint: { fontSize: 12, color: colors.textMuted, flex: 1, lineHeight: 17 },

  // Fields
  fieldLabel: { fontSize: 12, fontWeight: '600', color: colors.textMuted, marginBottom: 6, marginTop: spacing.sm },
  fieldInput: {
    backgroundColor: '#0A0A13', borderRadius: 12,
    paddingHorizontal: spacing.lg, paddingVertical: 12,
    fontSize: fontSize.sm, color: colors.textPrimary,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: spacing.sm,
  },

  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
    marginBottom: spacing.md,
  },
  rowLabel: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textPrimary },

  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: colors.textMuted,
    letterSpacing: 0.8, textTransform: 'uppercase',
    marginTop: spacing.lg, marginBottom: 6,
  },
  sectionHint: { fontSize: 12, color: colors.textMuted, lineHeight: 18, marginBottom: spacing.sm },

  // Step list
  stepList: { gap: 8, marginBottom: spacing.md },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  stepNum: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(59,130,246,0.14)',
    borderWidth: 1, borderColor: 'rgba(59,130,246,0.28)',
    justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  stepNumText: { fontSize: 10, fontWeight: '800', color: colors.primary },
  stepText: { fontSize: 12, color: colors.textSecondary, lineHeight: 18, flex: 1 },

  // Commands
  commandCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: 8,
  },
  commandHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  commandName: { fontSize: 14, fontWeight: '700', color: colors.primary },
  commandActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  commandResponse: { fontSize: 12, color: colors.textMuted, marginTop: 6, lineHeight: 17 },
  editBtn: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6,
    backgroundColor: 'rgba(59,130,246,0.1)',
    borderWidth: 1, borderColor: 'rgba(59,130,246,0.25)',
  },
  editBtnText: { fontSize: 11, fontWeight: '700', color: colors.primary },
  commandEditInput: {
    backgroundColor: '#0A0A13', borderRadius: 10, padding: 10,
    fontSize: 13, color: colors.textPrimary,
    borderWidth: 1, borderColor: 'rgba(59,130,246,0.3)',
    minHeight: 60, textAlignVertical: 'top',
  },
  commandSaveBtn: {
    flex: 1, paddingVertical: 9, borderRadius: 9,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  commandSaveBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  commandCancelBtn: {
    flex: 1, paddingVertical: 9, borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  commandCancelBtnText: { fontSize: 12, fontWeight: '700', color: colors.textMuted },

  // Bot card
  botCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(59,130,246,0.06)',
    borderRadius: 14, padding: spacing.lg,
    borderWidth: 1, borderColor: 'rgba(59,130,246,0.18)',
    marginBottom: spacing.md,
  },
  botCardLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  botIcon: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(59,130,246,0.12)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(59,130,246,0.25)',
  },
  botName: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textPrimary },
  botUsername: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  dotOn: { backgroundColor: '#10B981' },
  dotOff: { backgroundColor: '#EF4444' },
  statusText: { fontSize: 11, fontWeight: '700' },
  textOn: { color: '#10B981' },
  textOff: { color: '#EF4444' },

  // Targets
  targetCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: 6,
  },
  targetName: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  targetMeta: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  removeBtn: {
    padding: 8, borderRadius: 8,
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)',
  },
  emptyTargets: { paddingVertical: 12, alignItems: 'center' },
  emptyTargetsText: { fontSize: 12, color: colors.textMuted },
  addTargetRow: { flexDirection: 'row', gap: 8, marginBottom: spacing.sm },
  addTargetBtn: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: colors.primary,
    justifyContent: 'center', alignItems: 'center',
  },

  // Test bot result
  testBotResult: { fontSize: 12, marginBottom: 12, lineHeight: 17 },

  // Link code
  linkedCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(16,185,129,0.07)',
    borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.2)',
    marginBottom: spacing.sm,
  },
  linkedCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  linkedName: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textPrimary },
  linkedHandle: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  unlinkBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 8, backgroundColor: 'rgba(239,68,68,0.1)',
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)',
  },
  unlinkBtnText: { fontSize: 11, fontWeight: '700', color: '#EF4444' },
  notLinkedCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(245,158,11,0.07)',
    borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.2)',
    marginBottom: spacing.sm,
  },
  notLinkedText: { fontSize: 12, color: '#F59E0B', flex: 1 },

  codeCard: {
    backgroundColor: 'rgba(59,130,246,0.06)',
    borderRadius: 14, padding: spacing.lg,
    borderWidth: 1.5, borderColor: 'rgba(59,130,246,0.25)',
    alignItems: 'center', gap: 6, marginBottom: spacing.sm,
  },
  codeLabel: { fontSize: 10, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 },
  codeValue: { fontSize: 19, fontWeight: '900', color: colors.textPrimary, letterSpacing: 2 },
  codeExpiry: { fontSize: 11, color: colors.textMuted },
  copyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
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
  configRowLabel: { fontSize: 12, color: colors.textSecondary, flex: 1, paddingRight: 12 },
  configTextAreaWrap: { paddingVertical: 8 },
  configTextAreaLabel: { fontSize: 11, color: colors.textMuted, marginBottom: 5, fontWeight: '600' },
  configTextArea: {
    backgroundColor: '#0A0A13', borderRadius: 10, padding: 10,
    fontSize: 12, color: colors.textPrimary,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
    minHeight: 56, textAlignVertical: 'top',
  },
  savedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 6 },
  savedText: { fontSize: 12, color: '#10B981', fontWeight: '600' },

  // Broadcast
  broadcastInput: {
    backgroundColor: '#0A0A13', borderRadius: 12,
    paddingHorizontal: spacing.lg, paddingVertical: 12,
    fontSize: fontSize.sm, color: colors.textPrimary,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
    minHeight: 72, textAlignVertical: 'top',
    marginBottom: spacing.sm,
  },
  broadcastResult: { fontSize: 12, marginBottom: 8 },
  broadcastOk: { color: '#10B981' },
  broadcastErr: { color: '#EF4444' },

  // Buttons
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    paddingVertical: 13, paddingHorizontal: spacing.lg,
    borderRadius: 12, backgroundColor: colors.primary,
    marginBottom: spacing.sm,
  },
  primaryBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: '#fff' },
  outlineBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    paddingVertical: 12, paddingHorizontal: spacing.lg,
    borderRadius: 12,
    backgroundColor: 'rgba(59,130,246,0.08)',
    borderWidth: 1, borderColor: 'rgba(59,130,246,0.28)',
  },
  outlineBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.primary },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    paddingVertical: 12, borderRadius: 12,
    backgroundColor: colors.primary,
  },
  saveBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: '#fff' },
  btnRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  btnDisabled: { opacity: 0.4 },

  okRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(16,185,129,0.08)',
    borderRadius: 8, padding: 8, marginBottom: spacing.sm,
  },
  okText: { fontSize: 12, color: '#10B981', fontWeight: '600' },
  errorRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    backgroundColor: 'rgba(239,68,68,0.07)',
    borderRadius: 8, padding: 8,
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.18)',
    marginBottom: spacing.sm,
  },
  errorText: { fontSize: 12, color: '#EF4444', flex: 1, lineHeight: 17 },

  disconnectRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 14,
    borderTopWidth: 1, borderTopColor: 'rgba(239,68,68,0.12)',
    marginTop: spacing.sm,
  },
  disconnectText: { fontSize: fontSize.sm, fontWeight: '700', color: '#EF4444' },

  emptyState: { paddingVertical: 32, alignItems: 'center' },
  emptyStateText: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },

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
