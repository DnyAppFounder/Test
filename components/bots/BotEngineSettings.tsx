import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  ActivityIndicator,
  Switch,
} from 'react-native';
import {
  Bot, Plus, Trash2, ChevronRight, X, Check, Shield, Bell, Star, Globe,
  Sword, Trophy, Heart, Settings, FileText, TriangleAlert as AlertTriangle,
  CircleCheck as CheckCircle, Info,
} from 'lucide-react-native';
import { colors, spacing, borderRadius, fontSize } from '@/constants/theme';
import {
  getBots, getBotLogs, createBot, deleteBot, updateBot, saveModule,
  createRaid, getRaids,
} from '@/services/botEngineService';

// ── Types ─────────────────────────────────────────────────────────────────────

type BotType = 'core' | 'guard' | 'sentinel' | 'welcome' | 'pulse' | 'oracle' | 'raid' | 'reward';

interface BotModule {
  module_name: string;
  is_enabled: boolean;
  config: Record<string, unknown>;
}
interface BotCommand {
  id: string;
  command: string;
  description: string;
  response_text: string;
  is_builtin: boolean;
  is_enabled: boolean;
  cooldown_seconds: number;
  allowed_roles: string[];
  module_name?: string;
}
interface DawenBot {
  id: string;
  bot_type: BotType;
  bot_name: string;
  bot_avatar_url: string | null;
  command_prefix: string;
  is_enabled: boolean;
  modules: BotModule[];
  commands: BotCommand[];
}
interface BotLog {
  id: string;
  action_type: string;
  command: string | null;
  details: any;
  created_at: string;
  actor: { username: string; avatar_url: string | null } | null;
}
interface RaidTask {
  id: string;
  title: string;
  target_url: string;
  required_actions: string[];
  participant_count: number;
  status: string;
  reward_points: number;
  ends_at: string | null;
}

interface Props {
  groupId: string;
  walletAddress: string;
  isAdmin: boolean;
  visible: boolean;
  onClose: () => void;
}

// ── Bot metadata ──────────────────────────────────────────────────────────────

const BOT_META: Record<BotType, { label: string; desc: string; color: string; icon: any }> = {
  core:     { label: 'DAWEN Core Bot',     desc: 'All modules in one — help, oracle, rewards, raids, moderation', color: '#06b6d4', icon: Bot },
  guard:    { label: 'DAWEN Guard Bot',    desc: 'Anti-spam, anti-flood, link filter, captcha',                    color: '#f59e0b', icon: Shield },
  sentinel: { label: 'DAWEN Sentinel Bot', desc: 'Warn, mute, kick, ban moderation tools',                         color: '#ef4444', icon: AlertTriangle },
  welcome:  { label: 'DAWEN Welcome Bot',  desc: 'Welcome messages, rules, links for new members',                 color: '#10b981', icon: Heart },
  pulse:    { label: 'DAWEN Pulse Bot',    desc: 'Announcements, post publishing, group broadcasts',               color: '#3b82f6', icon: Bell },
  oracle:   { label: 'DAWEN Oracle Bot',   desc: 'Live token price, market cap, volume data',                      color: '#8b5cf6', icon: Globe },
  raid:     { label: 'DAWEN Raid Bot',     desc: 'X/Twitter raids, engagement coordination',                       color: '#f97316', icon: Sword },
  reward:   { label: 'DAWEN Reward Bot',   desc: '$DAWORLD points, leaderboard, referral codes',                   color: '#eab308', icon: Trophy },
};

const MOD_META: Record<string, { label: string; color: string }> = {
  guard:    { label: 'Guard Module',    color: '#f59e0b' },
  sentinel: { label: 'Sentinel Module', color: '#ef4444' },
  welcome:  { label: 'Welcome Module',  color: '#10b981' },
  pulse:    { label: 'Pulse Module',    color: '#3b82f6' },
  oracle:   { label: 'Oracle Module',   color: '#8b5cf6' },
  raid:     { label: 'Raid Module',     color: '#f97316' },
  reward:   { label: 'Reward Module',   color: '#eab308' },
};

type ScreenView = 'list' | 'add' | 'detail' | 'module' | 'logs' | 'raids' | 'create_raid';

// ── Component ─────────────────────────────────────────────────────────────────

export default function BotEngineSettings({ groupId, walletAddress, isAdmin, visible, onClose }: Props) {
  const [view, setView] = useState<ScreenView>('list');
  const [bots, setBots] = useState<DawenBot[]>([]);
  const [selectedBot, setSelectedBot] = useState<DawenBot | null>(null);
  const [selectedModule, setSelectedModule] = useState<BotModule | null>(null);
  const [logs, setLogs] = useState<BotLog[]>([]);
  const [raids, setRaids] = useState<RaidTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Add bot
  const [addBotType, setAddBotType] = useState<BotType>('core');

  // Edit bot
  const [editName, setEditName] = useState('');
  const [editPrefix, setEditPrefix] = useState('/');

  // Module config
  const [moduleConfig, setModuleConfig] = useState<Record<string, unknown>>({});
  const [moduleEnabled, setModuleEnabled] = useState(true);

  // Create raid
  const [raidTitle, setRaidTitle] = useState('');
  const [raidUrl, setRaidUrl] = useState('');
  const [raidDesc, setRaidDesc] = useState('');
  const [raidActions, setRaidActions] = useState<string[]>(['like', 'repost']);
  const [raidPoints, setRaidPoints] = useState('0');

  const flash = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const loadBots = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getBots(groupId);
      if (res.success) setBots(res.bots ?? []);
      else setError(res.error ?? 'Failed to load bots');
    } catch {
      setError('Failed to load bots');
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    if (visible) {
      loadBots();
      setView('list');
      setError(null);
      setSuccessMsg(null);
    }
  }, [visible, loadBots]);

  const handleOpenDetail = (bot: DawenBot) => {
    setSelectedBot(bot);
    setEditName(bot.bot_name);
    setEditPrefix(bot.command_prefix);
    setView('detail');
  };

  const handleAddBot = async () => {
    if (!isAdmin) return;
    setSaving(true);
    setError(null);
    try {
      const res = await createBot(groupId, walletAddress, addBotType);
      if (res.success) {
        loadBots();
        const newBot = { ...res.bot, modules: res.modules ?? [], commands: res.commands ?? [] } as DawenBot;
        handleOpenDetail(newBot);
        flash(`${BOT_META[addBotType].label} added!`);
      } else {
        setError(res.error ?? 'Failed to add bot');
      }
    } catch {
      setError('Failed to add bot');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBot = async (bot: DawenBot) => {
    if (!isAdmin) return;
    setSaving(true);
    try {
      await deleteBot(groupId, walletAddress, bot.id);
      await loadBots();
      setView('list');
      flash('Bot removed.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleBot = async (bot: DawenBot, value: boolean) => {
    if (!isAdmin) return;
    await updateBot(groupId, walletAddress, bot.id, { is_enabled: value });
    setBots(prev => prev.map(b => b.id === bot.id ? { ...b, is_enabled: value } : b));
    if (selectedBot?.id === bot.id) setSelectedBot(prev => prev ? { ...prev, is_enabled: value } : prev);
  };

  const handleSaveBotName = async () => {
    if (!selectedBot || !isAdmin) return;
    setSaving(true);
    try {
      const res = await updateBot(groupId, walletAddress, selectedBot.id, {
        bot_name: editName.trim() || selectedBot.bot_name,
        command_prefix: editPrefix.trim() || selectedBot.command_prefix,
      });
      if (res.success) {
        const updated = { ...selectedBot, bot_name: editName.trim() || selectedBot.bot_name, command_prefix: editPrefix.trim() || selectedBot.command_prefix };
        setSelectedBot(updated);
        setBots(prev => prev.map(b => b.id === updated.id ? { ...b, ...updated } : b));
        flash('Bot settings saved.');
      } else {
        setError(res.error ?? 'Save failed');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleOpenModule = (mod: BotModule) => {
    setSelectedModule(mod);
    setModuleConfig({ ...mod.config });
    setModuleEnabled(mod.is_enabled);
    setView('module');
  };

  const handleSaveModule = async () => {
    if (!selectedBot || !selectedModule || !isAdmin) return;
    setSaving(true);
    try {
      const res = await saveModule(groupId, walletAddress, selectedBot.id, selectedModule.module_name, moduleEnabled, moduleConfig);
      if (res.success) {
        const updatedMod: BotModule = { ...selectedModule, is_enabled: moduleEnabled, config: moduleConfig };
        const updatedBot: DawenBot = {
          ...selectedBot,
          modules: selectedBot.modules.map(m => m.module_name === selectedModule.module_name ? updatedMod : m),
        };
        setSelectedBot(updatedBot);
        setBots(prev => prev.map(b => b.id === updatedBot.id ? updatedBot : b));
        setView('detail');
        flash('Module saved.');
      } else {
        setError(res.error ?? 'Failed to save module');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleOpenLogs = async (bot?: DawenBot) => {
    setLoading(true);
    try {
      const res = await getBotLogs(groupId, bot?.id);
      if (res.success) setLogs(res.logs ?? []);
    } finally {
      setLoading(false);
    }
    setView('logs');
  };

  const handleOpenRaids = async () => {
    setLoading(true);
    try {
      const res = await getRaids(groupId);
      if (res.success) setRaids(res.raids ?? []);
    } finally {
      setLoading(false);
    }
    setView('raids');
  };

  const handleCreateRaid = async () => {
    if (!isAdmin || !raidTitle.trim() || !raidUrl.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await createRaid(groupId, walletAddress, {
        title: raidTitle,
        description: raidDesc,
        target_url: raidUrl,
        required_actions: raidActions,
        reward_points: parseInt(raidPoints, 10) || 0,
      });
      if (res.success) {
        setRaidTitle(''); setRaidUrl(''); setRaidDesc(''); setRaidPoints('0');
        await handleOpenRaids();
        flash('Raid created!');
      } else {
        setError(res.error ?? 'Failed to create raid');
      }
    } finally {
      setSaving(false);
    }
  };

  // ── Render helpers ─────────────────────────────────────────────────────────

  function renderList() {
    const activeBots = bots.filter(b => b.is_enabled).length;
    return (
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statNum}>{bots.length}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statNum, { color: '#10b981' }]}>{activeBots}</Text>
            <Text style={styles.statLabel}>Active</Text>
          </View>
          <TouchableOpacity style={styles.statCard} onPress={() => handleOpenLogs()}>
            <FileText size={18} color={colors.textSecondary} />
            <Text style={styles.statLabel}>Logs</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.statCard} onPress={handleOpenRaids}>
            <Sword size={18} color={colors.textSecondary} />
            <Text style={styles.statLabel}>Raids</Text>
          </TouchableOpacity>
        </View>

        {/* Info hint */}
        {bots.length === 0 && !loading && (
          <View style={styles.infoCard}>
            <Info size={14} color={colors.primary} />
            <Text style={styles.infoText}>
              Add a bot to enable commands in this group. Members can type commands like <Text style={{ color: colors.primary }}>/help</Text> or <Text style={{ color: colors.primary }}>/price SOL</Text> to interact.
            </Text>
          </View>
        )}

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
        ) : bots.length === 0 ? (
          <View style={styles.emptyState}>
            <Bot size={40} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>No bots added yet</Text>
            <Text style={styles.emptyDesc}>Add a bot to automate moderation, rewards, token info, and more.</Text>
          </View>
        ) : (
          bots.map(bot => {
            const meta = BOT_META[bot.bot_type];
            const IconComp = meta.icon;
            return (
              <TouchableOpacity key={bot.id} style={styles.botCard} onPress={() => handleOpenDetail(bot)}>
                <View style={[styles.botIconBox, { backgroundColor: `${meta.color}20` }]}>
                  <IconComp size={20} color={meta.color} />
                </View>
                <View style={styles.botInfo}>
                  <View style={styles.botNameRow}>
                    <Text style={styles.botName} numberOfLines={1}>{bot.bot_name}</Text>
                    <View style={styles.botBadge}><Text style={styles.botBadgeText}>BOT</Text></View>
                    {bot.is_enabled && <View style={styles.activeDot} />}
                  </View>
                  <Text style={styles.botDesc} numberOfLines={1}>{meta.desc}</Text>
                  <Text style={styles.botPrefix}>Prefix: <Text style={{ color: meta.color }}>{bot.command_prefix}</Text>  Commands: {bot.commands.length}</Text>
                </View>
                {isAdmin && (
                  <Switch
                    value={bot.is_enabled}
                    onValueChange={v => handleToggleBot(bot, v)}
                    trackColor={{ false: colors.surfaceLight, true: `${meta.color}60` }}
                    thumbColor={bot.is_enabled ? meta.color : colors.textMuted}
                  />
                )}
                <ChevronRight size={16} color={colors.textMuted} style={{ marginLeft: 4 }} />
              </TouchableOpacity>
            );
          })
        )}

        {isAdmin && (
          <TouchableOpacity style={styles.addBotBtn} onPress={() => setView('add')}>
            <Plus size={16} color={colors.primary} />
            <Text style={styles.addBotText}>Add Bot</Text>
          </TouchableOpacity>
        )}

        {error && <Text style={styles.errorText}>{error}</Text>}
        <View style={{ height: 40 }} />
      </ScrollView>
    );
  }

  function renderAdd() {
    const alreadyAddedTypes = new Set(bots.map(b => b.bot_type));
    const allAdded = Object.keys(BOT_META).every(t => alreadyAddedTypes.has(t as BotType));

    return (
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionHint}>Select a bot type to add. Each type can only be added once per group.</Text>

        {(Object.keys(BOT_META) as BotType[]).map(type => {
          const meta = BOT_META[type];
          const IconComp = meta.icon;
          const isAdded = alreadyAddedTypes.has(type);
          const isSelected = addBotType === type && !isAdded;
          return (
            <TouchableOpacity
              key={type}
              style={[styles.botTypeCard, isSelected && { borderColor: meta.color }, isAdded && styles.botTypeCardAdded]}
              onPress={() => !isAdded && setAddBotType(type)}
              disabled={isAdded}
              activeOpacity={isAdded ? 1 : 0.8}
            >
              <View style={[styles.botIconBox, { backgroundColor: `${meta.color}${isAdded ? '10' : '20'}` }]}>
                <IconComp size={20} color={isAdded ? colors.textMuted : meta.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.botName, isAdded && { color: colors.textMuted }]}>{meta.label}</Text>
                <Text style={styles.botDesc}>{meta.desc}</Text>
              </View>
              {isAdded
                ? <View style={styles.addedBadge}><CheckCircle size={14} color={colors.textMuted} /><Text style={styles.addedBadgeText}>Added</Text></View>
                : isSelected && <Check size={18} color={meta.color} />
              }
            </TouchableOpacity>
          );
        })}

        {!allAdded && (
          <TouchableOpacity
            style={[styles.primaryBtn, saving && { opacity: 0.6 }]}
            onPress={handleAddBot}
            disabled={saving || alreadyAddedTypes.has(addBotType)}
          >
            {saving
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.primaryBtnText}>Add {BOT_META[addBotType]?.label ?? 'Bot'}</Text>
            }
          </TouchableOpacity>
        )}

        {allAdded && (
          <View style={styles.infoCard}>
            <CheckCircle size={14} color="#10b981" />
            <Text style={[styles.infoText, { color: '#10b981' }]}>All bot types have been added to this group.</Text>
          </View>
        )}

        {error && <Text style={styles.errorText}>{error}</Text>}
        <View style={{ height: 40 }} />
      </ScrollView>
    );
  }

  function renderDetail() {
    if (!selectedBot) return null;
    const meta = BOT_META[selectedBot.bot_type];
    const IconComp = meta.icon;
    const enabledModules = selectedBot.modules.filter(m => m.is_enabled);
    const hasModules = selectedBot.modules.length > 0;

    return (
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Bot header */}
        <View style={[styles.detailHeader, { borderColor: `${meta.color}30` }]}>
          <View style={[styles.detailIconLarge, { backgroundColor: `${meta.color}20` }]}>
            <IconComp size={28} color={meta.color} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.botNameRow}>
              <Text style={styles.detailBotName} numberOfLines={1}>{selectedBot.bot_name}</Text>
              <View style={styles.botBadge}><Text style={styles.botBadgeText}>BOT</Text></View>
            </View>
            <Text style={[styles.botDesc, { marginTop: 2 }]}>{meta.desc}</Text>
            <Text style={[styles.botPrefix, { marginTop: 2 }]}>
              Prefix: <Text style={{ color: meta.color }}>{selectedBot.command_prefix}</Text>
              {hasModules && !selectedBot.is_enabled
                ? <Text style={{ color: colors.error }}> · Disabled</Text>
                : hasModules && enabledModules.length === 0
                ? <Text style={{ color: '#f59e0b' }}> · No modules enabled</Text>
                : null}
            </Text>
          </View>
          <Switch
            value={selectedBot.is_enabled}
            onValueChange={v => handleToggleBot(selectedBot, v)}
            trackColor={{ false: colors.surfaceLight, true: `${meta.color}60` }}
            thumbColor={selectedBot.is_enabled ? meta.color : colors.textMuted}
          />
        </View>

        {/* Settings (admin only) */}
        {isAdmin && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Settings</Text>
            <Text style={styles.fieldLabel}>Bot Display Name</Text>
            <TextInput
              style={styles.input}
              value={editName}
              onChangeText={setEditName}
              placeholder="Bot display name"
              placeholderTextColor={colors.textMuted}
            />
            <Text style={styles.fieldLabel}>Command Prefix</Text>
            <TextInput
              style={[styles.input, { width: 80 }]}
              value={editPrefix}
              onChangeText={setEditPrefix}
              placeholder="/"
              placeholderTextColor={colors.textMuted}
              maxLength={3}
            />
            <TouchableOpacity
              style={[styles.secondaryBtn, saving && { opacity: 0.6 }]}
              onPress={handleSaveBotName}
              disabled={saving}
            >
              <Text style={styles.secondaryBtnText}>{saving ? 'Saving...' : 'Save Settings'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Modules */}
        {hasModules && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Modules</Text>
            {isAdmin && enabledModules.length === 0 && (
              <View style={styles.warnCard}>
                <AlertTriangle size={13} color="#f59e0b" />
                <Text style={styles.warnText}>No modules are enabled. Tap a module to enable it and unlock its commands.</Text>
              </View>
            )}
            {selectedBot.modules.map(mod => {
              const modMeta = MOD_META[mod.module_name] ?? { label: mod.module_name, color: colors.textSecondary };
              return (
                <TouchableOpacity
                  key={mod.module_name}
                  style={styles.moduleCard}
                  onPress={() => isAdmin && handleOpenModule(mod)}
                  activeOpacity={isAdmin ? 0.8 : 1}
                >
                  <View style={[styles.moduleColorDot, { backgroundColor: mod.is_enabled ? modMeta.color : colors.textMuted }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.moduleName}>{modMeta.label}</Text>
                    <Text style={[styles.moduleStatus, mod.is_enabled && { color: modMeta.color }]}>
                      {mod.is_enabled ? 'Enabled' : 'Disabled'}
                    </Text>
                  </View>
                  {isAdmin && <ChevronRight size={14} color={colors.textMuted} />}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Commands */}
        {selectedBot.commands.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Commands ({selectedBot.commands.length})</Text>
            <View style={styles.infoCard}>
              <Info size={12} color={colors.primary} />
              <Text style={styles.infoText}>
                In group chat, type <Text style={{ color: meta.color }}>{selectedBot.command_prefix}help</Text> to list all available commands.
              </Text>
            </View>
            {selectedBot.commands.map(cmd => (
              <View key={cmd.id} style={styles.cmdRow}>
                <Text style={styles.cmdName}>{selectedBot.command_prefix}{cmd.command}</Text>
                {cmd.is_builtin && <View style={styles.builtinBadge}><Text style={styles.builtinText}>built-in</Text></View>}
                {cmd.module_name && (
                  <View style={[styles.moduleBadge, { backgroundColor: `${MOD_META[cmd.module_name]?.color ?? '#888'}20` }]}>
                    <Text style={[styles.moduleBadgeText, { color: MOD_META[cmd.module_name]?.color ?? colors.textMuted }]}>
                      {cmd.module_name}
                    </Text>
                  </View>
                )}
                <Text style={styles.cmdDesc} numberOfLines={1}>{cmd.description}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Actions */}
        <View style={styles.section}>
          <TouchableOpacity style={styles.actionRow} onPress={() => handleOpenLogs(selectedBot)}>
            <FileText size={16} color={colors.textSecondary} />
            <Text style={styles.actionText}>View Bot Logs</Text>
          </TouchableOpacity>
          {isAdmin && (
            <TouchableOpacity style={[styles.actionRow, { marginTop: 4 }]} onPress={() => handleDeleteBot(selectedBot)}>
              <Trash2 size={16} color={colors.error} />
              <Text style={[styles.actionText, { color: colors.error }]}>Remove Bot</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    );
  }

  function renderModule() {
    if (!selectedModule || !selectedBot) return null;
    const modMeta = MOD_META[selectedModule.module_name] ?? { label: selectedModule.module_name, color: colors.textSecondary };

    return (
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={[styles.detailHeader, { borderColor: `${modMeta.color}30` }]}>
          <View style={[styles.moduleColorDot, { width: 40, height: 40, borderRadius: 20, backgroundColor: `${modMeta.color}20` }]} />
          <View style={{ flex: 1, marginLeft: spacing.sm }}>
            <Text style={styles.detailBotName}>{modMeta.label}</Text>
            <Text style={styles.botDesc}>Configure this module</Text>
          </View>
          <Switch
            value={moduleEnabled}
            onValueChange={setModuleEnabled}
            trackColor={{ false: colors.surfaceLight, true: `${modMeta.color}60` }}
            thumbColor={moduleEnabled ? modMeta.color : colors.textMuted}
          />
        </View>

        {Object.keys(moduleConfig).map(key => {
          const val = moduleConfig[key];
          const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

          if (typeof val === 'boolean') {
            return (
              <View key={key} style={styles.configRow}>
                <Text style={styles.configLabel}>{label}</Text>
                <Switch
                  value={val}
                  onValueChange={v => setModuleConfig(prev => ({ ...prev, [key]: v }))}
                  trackColor={{ false: colors.surfaceLight, true: `${modMeta.color}60` }}
                  thumbColor={val ? modMeta.color : colors.textMuted}
                />
              </View>
            );
          }
          if (typeof val === 'number') {
            return (
              <View key={key} style={styles.configFieldWrap}>
                <Text style={styles.fieldLabel}>{label}</Text>
                <TextInput
                  style={[styles.input, { width: 110 }]}
                  value={String(val)}
                  onChangeText={v => setModuleConfig(prev => ({ ...prev, [key]: parseInt(v, 10) || 0 }))}
                  keyboardType="numeric"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
            );
          }
          if (Array.isArray(val)) {
            return (
              <View key={key} style={styles.configFieldWrap}>
                <Text style={styles.fieldLabel}>{label} (comma-separated)</Text>
                <TextInput
                  style={styles.input}
                  value={(val as string[]).join(', ')}
                  onChangeText={v => setModuleConfig(prev => ({ ...prev, [key]: v.split(',').map(s => s.trim()).filter(Boolean) }))}
                  placeholder="value1, value2, ..."
                  placeholderTextColor={colors.textMuted}
                />
              </View>
            );
          }
          if (typeof val === 'string') {
            return (
              <View key={key} style={styles.configFieldWrap}>
                <Text style={styles.fieldLabel}>{label}</Text>
                <TextInput
                  style={key.includes('text') || key.includes('message') || key.includes('rules') || key.includes('links')
                    ? [styles.input, { minHeight: 80, textAlignVertical: 'top' }]
                    : styles.input
                  }
                  value={val}
                  onChangeText={v => setModuleConfig(prev => ({ ...prev, [key]: v }))}
                  placeholder={label}
                  placeholderTextColor={colors.textMuted}
                  multiline={key.includes('text') || key.includes('message') || key.includes('rules') || key.includes('links')}
                />
              </View>
            );
          }
          return null;
        })}

        <TouchableOpacity
          style={[styles.primaryBtn, saving && { opacity: 0.6 }]}
          onPress={handleSaveModule}
          disabled={saving}
        >
          {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.primaryBtnText}>Save Module</Text>}
        </TouchableOpacity>

        {error && <Text style={styles.errorText}>{error}</Text>}
        <View style={{ height: 40 }} />
      </ScrollView>
    );
  }

  function renderLogs() {
    return (
      <ScrollView showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
        ) : logs.length === 0 ? (
          <View style={styles.emptyState}>
            <FileText size={36} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>No logs yet</Text>
            <Text style={styles.emptyDesc}>Bot actions and commands will be logged here.</Text>
          </View>
        ) : (
          logs.map(log => (
            <View key={log.id} style={styles.logRow}>
              <View style={[styles.logTypeBadge, { backgroundColor: logTypeColor(log.action_type) + '20' }]}>
                <Text style={[styles.logTypeText, { color: logTypeColor(log.action_type) }]}>{log.action_type}</Text>
              </View>
              <View style={{ flex: 1, marginLeft: spacing.sm }}>
                {log.command && <Text style={styles.logCmd}>{log.command}</Text>}
                {log.actor && <Text style={styles.logActor}>by @{log.actor.username}</Text>}
                <Text style={styles.logTime}>{new Date(log.created_at).toLocaleString()}</Text>
              </View>
            </View>
          ))
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    );
  }

  function renderRaids() {
    return (
      <ScrollView showsVerticalScrollIndicator={false}>
        {isAdmin && (
          <TouchableOpacity style={styles.addBotBtn} onPress={() => setView('create_raid')}>
            <Plus size={16} color={colors.primary} />
            <Text style={styles.addBotText}>New Raid Task</Text>
          </TouchableOpacity>
        )}
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
        ) : raids.length === 0 ? (
          <View style={styles.emptyState}>
            <Sword size={36} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>No raids yet</Text>
            <Text style={styles.emptyDesc}>Create a raid task to coordinate X/Twitter engagement with your community.</Text>
          </View>
        ) : (
          raids.map(raid => (
            <View key={raid.id} style={styles.raidCard}>
              <View style={styles.raidHeader}>
                <Text style={styles.raidTitle} numberOfLines={1}>{raid.title}</Text>
                <View style={[styles.raidStatus, { backgroundColor: raidStatusColor(raid.status) + '20' }]}>
                  <Text style={[styles.raidStatusText, { color: raidStatusColor(raid.status) }]}>{raid.status}</Text>
                </View>
              </View>
              <Text style={styles.raidUrl} numberOfLines={1}>{raid.target_url}</Text>
              <View style={styles.raidMeta}>
                <Text style={styles.raidMetaText}>Actions: {raid.required_actions.join(', ')}</Text>
                <Text style={styles.raidMetaText}>{raid.participant_count} participants</Text>
                {raid.reward_points > 0 && <Text style={[styles.raidMetaText, { color: '#eab308' }]}>{raid.reward_points} $DAWORLD</Text>}
              </View>
            </View>
          ))
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    );
  }

  function renderCreateRaid() {
    const ACTIONS = ['like', 'repost', 'reply', 'follow', 'comment', 'quote'];
    const raidBot = bots.find(b => b.bot_type === 'raid' || b.bot_type === 'core');
    return (
      <ScrollView showsVerticalScrollIndicator={false}>
        {!raidBot && (
          <View style={styles.warnCard}>
            <AlertTriangle size={13} color="#f59e0b" />
            <Text style={styles.warnText}>Add and enable the DAWEN Raid Bot or Core Bot to announce raids in chat.</Text>
          </View>
        )}

        <Text style={styles.fieldLabel}>Title *</Text>
        <TextInput style={styles.input} value={raidTitle} onChangeText={setRaidTitle} placeholder="Raid name" placeholderTextColor={colors.textMuted} />

        <Text style={styles.fieldLabel}>Target X/Twitter URL *</Text>
        <TextInput style={styles.input} value={raidUrl} onChangeText={setRaidUrl} placeholder="https://x.com/..." placeholderTextColor={colors.textMuted} autoCapitalize="none" />

        <Text style={styles.fieldLabel}>Description (optional)</Text>
        <TextInput
          style={[styles.input, { minHeight: 64, textAlignVertical: 'top' }]}
          value={raidDesc}
          onChangeText={setRaidDesc}
          placeholder="What to do, context..."
          placeholderTextColor={colors.textMuted}
          multiline
        />

        <Text style={styles.fieldLabel}>Required Actions</Text>
        <View style={styles.actionChipsRow}>
          {ACTIONS.map(a => (
            <TouchableOpacity
              key={a}
              style={[styles.actionChip, raidActions.includes(a) && styles.actionChipActive]}
              onPress={() => setRaidActions(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a])}
            >
              <Text style={[styles.actionChipText, raidActions.includes(a) && { color: colors.primary }]}>{a}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.fieldLabel}>Reward ($DAWORLD points)</Text>
        <TextInput
          style={[styles.input, { width: 100 }]}
          value={raidPoints}
          onChangeText={setRaidPoints}
          keyboardType="numeric"
          placeholderTextColor={colors.textMuted}
        />

        <TouchableOpacity
          style={[styles.primaryBtn, (saving || !raidTitle.trim() || !raidUrl.trim()) && { opacity: 0.5 }]}
          onPress={handleCreateRaid}
          disabled={saving || !raidTitle.trim() || !raidUrl.trim()}
        >
          {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.primaryBtnText}>Create Raid</Text>}
        </TouchableOpacity>

        {error && <Text style={styles.errorText}>{error}</Text>}
        <View style={{ height: 40 }} />
      </ScrollView>
    );
  }

  function getBackView(): ScreenView {
    switch (view) {
      case 'add': return 'list';
      case 'detail': return 'list';
      case 'module': return 'detail';
      case 'logs': return selectedBot ? 'detail' : 'list';
      case 'raids': return 'list';
      case 'create_raid': return 'raids';
      default: return 'list';
    }
  }

  const VIEW_TITLES: Record<ScreenView, string> = {
    list: 'Bot Engine',
    add: 'Add Bot',
    detail: selectedBot?.bot_name ?? 'Bot Details',
    module: selectedModule ? (MOD_META[selectedModule.module_name]?.label ?? selectedModule.module_name) : 'Module',
    logs: 'Bot Logs',
    raids: 'Raid Tasks',
    create_raid: 'New Raid',
  };

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="pageSheet">
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          {view !== 'list' ? (
            <TouchableOpacity onPress={() => setView(getBackView())} style={styles.headerBtn}>
              <Text style={styles.backText}>Back</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ width: 60 }} />
          )}
          <Text style={styles.headerTitle} numberOfLines={1}>{VIEW_TITLES[view]}</Text>
          <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
            <X size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Success banner */}
        {successMsg && (
          <View style={styles.successBar}>
            <CheckCircle size={13} color="#10b981" />
            <Text style={styles.successText}>{successMsg}</Text>
          </View>
        )}

        <View style={styles.content}>
          {view === 'list' && renderList()}
          {view === 'add' && renderAdd()}
          {view === 'detail' && renderDetail()}
          {view === 'module' && renderModule()}
          {view === 'logs' && renderLogs()}
          {view === 'raids' && renderRaids()}
          {view === 'create_raid' && renderCreateRaid()}
        </View>
      </View>
    </Modal>
  );
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function logTypeColor(type: string): string {
  const m: Record<string, string> = {
    command: '#3b82f6', moderation: '#ef4444', raid: '#f97316',
    warn: '#f59e0b', ban: '#ef4444', kick: '#ef4444', mute: '#f59e0b',
  };
  return m[type] ?? colors.textSecondary;
}

function raidStatusColor(status: string): string {
  if (status === 'active') return colors.success ?? '#10b981';
  if (status === 'ended' || status === 'completed') return colors.textMuted;
  return '#f59e0b';
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    marginTop: 60,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  headerBtn: { width: 60, alignItems: 'flex-end' },
  headerTitle: { color: colors.textPrimary, fontSize: fontSize.md, fontWeight: '700', flex: 1, textAlign: 'center' },
  backText: { color: colors.primary, fontSize: fontSize.sm },
  content: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.lg },

  successBar: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(16,185,129,0.1)',
    borderRadius: 8, paddingHorizontal: spacing.lg, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: 'rgba(16,185,129,0.2)',
  },
  successText: { color: '#10b981', fontSize: fontSize.xs, fontWeight: '600', flex: 1 },

  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  statCard: {
    flex: 1, backgroundColor: colors.surface, borderRadius: borderRadius.md,
    padding: spacing.md, alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: colors.surfaceBorder,
  },
  statNum: { color: colors.textPrimary, fontSize: fontSize.lg, fontWeight: '700' },
  statLabel: { color: colors.textMuted, fontSize: fontSize.xs },

  infoCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: `${colors.primary}10`,
    borderRadius: borderRadius.sm, padding: spacing.sm,
    borderWidth: 1, borderColor: `${colors.primary}25`,
    marginBottom: spacing.sm,
  },
  infoText: { color: colors.textSecondary, fontSize: fontSize.xs, flex: 1, lineHeight: 17 },

  warnCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: 'rgba(245,158,11,0.08)',
    borderRadius: borderRadius.sm, padding: spacing.sm,
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.2)',
    marginBottom: spacing.sm,
  },
  warnText: { color: '#f59e0b', fontSize: fontSize.xs, flex: 1, lineHeight: 17 },

  emptyState: { alignItems: 'center', paddingVertical: 48, gap: spacing.sm },
  emptyTitle: { color: colors.textPrimary, fontSize: fontSize.md, fontWeight: '600' },
  emptyDesc: { color: colors.textMuted, fontSize: fontSize.sm, textAlign: 'center', maxWidth: 260 },

  botCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface,
    borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.surfaceBorder, gap: spacing.sm,
  },
  botIconBox: { width: 40, height: 40, borderRadius: borderRadius.sm, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  botInfo: { flex: 1, minWidth: 0 },
  botNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: 2 },
  botName: { color: colors.textPrimary, fontSize: fontSize.sm, fontWeight: '600', flexShrink: 1 },
  botBadge: { backgroundColor: colors.primary + '30', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
  botBadgeText: { color: colors.primaryLight ?? colors.primary, fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10b981' },
  botDesc: { color: colors.textMuted, fontSize: fontSize.xs, marginBottom: 2 },
  botPrefix: { color: colors.textSecondary, fontSize: fontSize.xs },

  addBotBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: spacing.md,
    borderWidth: 1, borderColor: colors.primary + '40', gap: spacing.xs, marginTop: spacing.sm,
  },
  addBotText: { color: colors.primary, fontSize: fontSize.sm, fontWeight: '600' },

  botTypeCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface,
    borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.surfaceBorder, gap: spacing.sm,
  },
  botTypeCardAdded: { opacity: 0.55 },
  addedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addedBadgeText: { color: colors.textMuted, fontSize: fontSize.xs, fontWeight: '600' },

  detailHeader: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface,
    borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.lg,
    borderWidth: 1, gap: spacing.sm,
  },
  detailIconLarge: { width: 48, height: 48, borderRadius: borderRadius.sm, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  detailBotName: { color: colors.textPrimary, fontSize: fontSize.md, fontWeight: '700', flexShrink: 1 },

  section: { marginBottom: spacing.xl },
  sectionTitle: { color: colors.textSecondary, fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: spacing.sm },
  sectionHint: { color: colors.textMuted, fontSize: fontSize.xs, marginBottom: spacing.md, lineHeight: 17 },
  fieldLabel: { color: colors.textSecondary, fontSize: fontSize.xs, marginBottom: spacing.xs, marginTop: spacing.sm },

  input: {
    backgroundColor: colors.surfaceElevated, borderRadius: borderRadius.sm,
    borderWidth: 1, borderColor: colors.surfaceBorder, color: colors.textPrimary,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: fontSize.sm,
    marginBottom: spacing.sm,
  },

  moduleCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceElevated,
    borderRadius: borderRadius.sm, padding: spacing.sm + 2, marginBottom: spacing.xs, gap: spacing.sm,
  },
  moduleColorDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  moduleName: { color: colors.textPrimary, fontSize: fontSize.sm, fontWeight: '500' },
  moduleStatus: { color: colors.textMuted, fontSize: fontSize.xs },

  cmdRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs, flexWrap: 'wrap' },
  cmdName: { color: colors.primary, fontSize: fontSize.sm, fontWeight: '600', minWidth: 80 },
  cmdDesc: { color: colors.textMuted, fontSize: fontSize.xs, flex: 1 },
  builtinBadge: { backgroundColor: colors.surfaceLight, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
  builtinText: { color: colors.textMuted, fontSize: 9, fontWeight: '600' },
  moduleBadge: { borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
  moduleBadgeText: { fontSize: 9, fontWeight: '600' },

  actionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  actionText: { color: colors.textSecondary, fontSize: fontSize.sm },

  configRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.surfaceBorder,
  },
  configLabel: { color: colors.textSecondary, fontSize: fontSize.sm, flex: 1 },
  configFieldWrap: { marginBottom: spacing.xs },

  logRow: {
    flexDirection: 'row', alignItems: 'flex-start', backgroundColor: colors.surface,
    borderRadius: borderRadius.sm, padding: spacing.sm, marginBottom: spacing.xs,
    borderWidth: 1, borderColor: colors.surfaceBorder,
  },
  logTypeBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, minWidth: 70, alignItems: 'center', flexShrink: 0 },
  logTypeText: { fontSize: fontSize.xs, fontWeight: '600' },
  logCmd: { color: colors.primary, fontSize: fontSize.xs, fontWeight: '600' },
  logActor: { color: colors.textSecondary, fontSize: fontSize.xs },
  logTime: { color: colors.textMuted, fontSize: fontSize.xs },

  raidCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: spacing.md,
    marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.surfaceBorder,
  },
  raidHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  raidTitle: { color: colors.textPrimary, fontSize: fontSize.sm, fontWeight: '600', flex: 1 },
  raidStatus: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  raidStatusText: { fontSize: fontSize.xs, fontWeight: '600' },
  raidUrl: { color: colors.textMuted, fontSize: fontSize.xs, marginBottom: spacing.xs },
  raidMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  raidMetaText: { color: colors.textSecondary, fontSize: fontSize.xs },

  actionChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm },
  actionChip: {
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
    backgroundColor: colors.surfaceElevated, borderRadius: borderRadius.full,
    borderWidth: 1, borderColor: colors.surfaceBorder,
  },
  actionChipActive: { borderColor: colors.primary, backgroundColor: colors.primaryMuted ?? `${colors.primary}15` },
  actionChipText: { color: colors.textSecondary, fontSize: fontSize.xs },

  primaryBtn: {
    backgroundColor: colors.primary, borderRadius: borderRadius.md,
    paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.lg,
  },
  primaryBtnText: { color: '#fff', fontSize: fontSize.sm, fontWeight: '700' },

  secondaryBtn: {
    borderWidth: 1, borderColor: colors.primary, borderRadius: borderRadius.md,
    paddingVertical: spacing.sm, alignItems: 'center', marginTop: spacing.xs,
  },
  secondaryBtnText: { color: colors.primary, fontSize: fontSize.sm, fontWeight: '600' },

  errorText: { color: colors.error, fontSize: fontSize.xs, marginTop: spacing.sm, textAlign: 'center' },
});
