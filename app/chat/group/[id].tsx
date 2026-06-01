import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  TextInput,
  FlatList,
  ScrollView,
  Image,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ActivityIndicator,
  Modal,
  Share,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Send, User, Users, Pin, Settings, Image as ImageIcon, Plus, X, Hash, Trash2, UserPlus, ZoomIn, TriangleAlert as AlertTriangle, ChevronRight, Camera, Shield, ShieldOff, CreditCard as Edit2, LogOut, Link, Bot } from 'lucide-react-native';
import BotSettings from '@/components/BotSettings';
import BotEngineSettings from '@/components/bots/BotEngineSettings';
import { processMessage } from '@/services/botEngineService';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
import * as ImagePicker from 'expo-image-picker';
import { colors, spacing, borderRadius, fontSize } from '@/constants/theme';
import { useProfile } from '@/contexts/ProfileContext';
import { SocialService, GroupTopic, GroupPin } from '@/services/socialService';
import { supabase } from '@/lib/supabase';
import LinkText, { extractUrls } from '@/components/LinkText';
import LinkPreview from '@/components/LinkPreview';

const EMOJI_SET = ['👍', '😂', '🔥', '👀', '😮', '❤️'];
type Reaction = { emoji: string; count: number; userIds: string[] };
type ReactionsMap = Record<string, Reaction[]>;

export default function GroupChatScreen() {
  const router = useRouter();
  const { id: groupId } = useLocalSearchParams<{ id: string }>();
  const { profile } = useProfile();

  const [messages, setMessages] = useState<any[]>([]);
  const [groupDetails, setGroupDetails] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingGroupPhoto, setUploadingGroupPhoto] = useState(false);

  const [topics, setTopics] = useState<GroupTopic[]>([]);
  const [activeTopic, setActiveTopic] = useState<GroupTopic | null>(null);
  const [pins, setPins] = useState<GroupPin[]>([]);
  const [myRole, setMyRole] = useState<'creator' | 'admin' | 'member'>('member');

  const [showSettings, setShowSettings] = useState(false);
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [confirmRemoveMember, setConfirmRemoveMember] = useState<any>(null);
  const [newTopicName, setNewTopicName] = useState('');
  const [creatingTopic, setCreatingTopic] = useState(false);

  const [memberSearch, setMemberSearch] = useState('');
  const [memberSearchResults, setMemberSearchResults] = useState<any[]>([]);
  const [searchingMembers, setSearchingMembers] = useState(false);
  const [addingMember, setAddingMember] = useState<string | null>(null);

  const [promotingMember, setPromotingMember] = useState<string | null>(null);

  const [viewingImage, setViewingImage] = useState<string | null>(null);

  const [longPressMsg, setLongPressMsg] = useState<any>(null);
  const [showMsgActions, setShowMsgActions] = useState(false);
  const [deletingMsg, setDeletingMsg] = useState(false);

  // Rename group name
  const [editingGroupName, setEditingGroupName] = useState(false);
  const [pendingGroupName, setPendingGroupName] = useState('');
  const [savingGroupName, setSavingGroupName] = useState(false);

  // Rename topics inline
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
  const [pendingTopicName, setPendingTopicName] = useState('');
  const [savingTopicName, setSavingTopicName] = useState(false);

  // Leave group
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [leavingGroup, setLeavingGroup] = useState(false);

  // Reactions
  const [reactions, setReactions] = useState<ReactionsMap>({});
  const [reactionTarget, setReactionTarget] = useState<any>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // Group invite
  const [generatingInvite, setGeneratingInvite] = useState(false);

  // Bot settings
  const [showBotSettings, setShowBotSettings] = useState(false);
  const [showBotEngine, setShowBotEngine] = useState(false);

  // Multiple pins & scroll-to
  const [showPinsList, setShowPinsList] = useState(false);
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const listRef = useRef<FlatList>(null);

  const loadData = useCallback(async () => {
    if (!groupId || !profile?.id) return;
    setLoading(true);
    try {
      const [msgs, details, topicList, pinList] = await Promise.all([
        SocialService.getGroupMessages(groupId),
        SocialService.getGroupDetails(groupId),
        SocialService.getGroupTopics(groupId),
        SocialService.getGroupPins(groupId),
      ]);
      setMessages(msgs);
      setGroupDetails(details);
      setPins(pinList);

      if (details) {
        const me = (details.members ?? []).find((m: any) => m.id === profile.id);
        if (details.creator_id === profile.id) setMyRole('creator');
        else if (me?.role === 'admin') setMyRole('admin');
        else setMyRole('member');

      }

      if (topicList.length > 0) {
        setTopics(topicList);
        const def = topicList.find(t => t.is_default) ?? topicList[0];
        setActiveTopic(prev => prev ? (topicList.find(t => t.id === prev.id) ?? def) : def);
      } else {
        const def = await SocialService.ensureDefaultTopic(groupId, profile.id);
        if (def) { setTopics([def]); setActiveTopic(def); }
      }
      // Load reactions
      const realIds = msgs.filter((m: any) => !m.id.startsWith('opt')).map((m: any) => m.id);
      if (realIds.length > 0) {
        const rxMap = await SocialService.batchGetGroupMessageReactions(realIds);
        setReactions(rxMap);
      }
    } catch (e) {
      console.error('[GroupChat] loadData error:', e);
    } finally {
      setLoading(false);
      // Mark messages as read
      if (profile?.id) SocialService.markGroupMessagesRead(groupId!, profile.id);
    }
  }, [groupId, profile?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  // Realtime: INSERT + UPDATE
  useEffect(() => {
    if (!groupId || !profile?.id) return;
    const channel = supabase
      .channel(`group_chat:${groupId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'group_messages',
        filter: `group_id=eq.${groupId}`,
      }, async (payload) => {
        const raw = payload.new as any;
        // Never skip bot responses even if sender_id matches current user
        if (raw.sender_id === profile.id && !raw.is_bot_message) return;
        const sender = await SocialService.getProfile(raw.sender_id);
        const newMsg = { ...raw, sender };
        setMessages(prev => {
          if (prev.some((m: any) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
        SocialService.markGroupMessagesRead(groupId!, profile.id);
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'group_messages',
        filter: `group_id=eq.${groupId}`,
      }, (payload) => {
        const updated = payload.new as any;
        setMessages(prev => prev.map(m => m.id === updated.id ? { ...m, ...updated } : m));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [groupId, profile?.id]);

  // Realtime: group message reactions
  useEffect(() => {
    if (!groupId) return;
    const channel = supabase
      .channel(`group_reactions:${groupId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_message_reactions' }, (payload) => {
        const r = payload.new as any;
        setReactions(prev => {
          const msgRx = [...(prev[r.message_id] ?? [])];
          const idx = msgRx.findIndex(x => x.emoji === r.emoji);
          if (idx >= 0) {
            if (!msgRx[idx].userIds.includes(r.user_id)) {
              msgRx[idx] = { ...msgRx[idx], count: msgRx[idx].count + 1, userIds: [...msgRx[idx].userIds, r.user_id] };
            }
          } else {
            msgRx.push({ emoji: r.emoji, count: 1, userIds: [r.user_id] });
          }
          return { ...prev, [r.message_id]: msgRx };
        });
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'group_message_reactions' }, (payload) => {
        const r = payload.old as any;
        setReactions(prev => {
          const msgRx = [...(prev[r.message_id] ?? [])];
          const idx = msgRx.findIndex(x => x.emoji === r.emoji);
          if (idx >= 0) {
            const newUserIds = msgRx[idx].userIds.filter((id: string) => id !== r.user_id);
            if (newUserIds.length === 0) msgRx.splice(idx, 1);
            else msgRx[idx] = { ...msgRx[idx], count: newUserIds.length, userIds: newUserIds };
          }
          return { ...prev, [r.message_id]: msgRx };
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [groupId]);

  const visibleMessages = messages.filter(m => {
    if (!activeTopic) return true;
    if (activeTopic.is_default) return !m.topic_id || m.topic_id === activeTopic.id;
    return m.topic_id === activeTopic.id;
  });

  const pinnedCount = pins.length;

  const send = async () => {
    const text = input.trim();
    if (!text || !profile || !groupId || sending) return;
    setSending(true);
    const optimistic = {
      id: `opt-${Date.now()}`,
      group_id: groupId,
      sender_id: profile.id,
      content: text,
      topic_id: activeTopic?.id,
      is_deleted: false,
      created_at: new Date().toISOString(),
      sender: profile,
    };
    setMessages(prev => [...prev, optimistic]);
    setInput('');
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    try {
      const ok = await SocialService.sendGroupMessageFull(groupId, profile.id, text, activeTopic?.id);
      if (ok) {
        const cmdBody = JSON.stringify({ group_id: groupId, sender_id: profile.id, content: text });
        const hdr = { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}`, Apikey: ANON_KEY };
        // Trigger internal DAWEN bot (simple command handler)
        fetch(`${SUPABASE_URL}/functions/v1/internal-bot?action=process_command`, { method: 'POST', headers: hdr, body: cmdBody }).catch(() => {});
        // Trigger advanced bot engine (multi-bot system)
        processMessage(groupId, '', text, profile.id).catch(() => {});
      }
    } catch {
      setMessages(prev => prev.filter((m: any) => m.id !== optimistic.id));
    } finally {
      setSending(false);
    }
  };

  const pickAndSendImage = async () => {
    if (!profile || !groupId || uploading) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setUploading(true);
    const optimistic = {
      id: `opt-img-${Date.now()}`,
      group_id: groupId,
      sender_id: profile.id,
      content: '',
      media_url: asset.uri,
      media_type: 'image',
      topic_id: activeTopic?.id,
      is_deleted: false,
      created_at: new Date().toISOString(),
      sender: profile,
    };
    setMessages(prev => [...prev, optimistic]);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    try {
      const ext = asset.uri.split('.').pop() ?? 'jpg';
      const publicUrl = await SocialService.uploadChatMedia({
        uri: asset.uri,
        type: asset.mimeType ?? 'image/jpeg',
        name: `group.${ext}`,
      });
      if (!publicUrl) { setMessages(prev => prev.filter((m: any) => m.id !== optimistic.id)); return; }
      await SocialService.sendGroupMessageFull(groupId, profile.id, '', activeTopic?.id, publicUrl, 'image');
    } catch {
      setMessages(prev => prev.filter((m: any) => m.id !== optimistic.id));
    } finally {
      setUploading(false);
    }
  };

  const pickGroupPhoto = async () => {
    if (!profile || !groupId || uploadingGroupPhoto) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.[0]) return;
    setUploadingGroupPhoto(true);
    try {
      const url = await SocialService.uploadGroupPhoto(groupId, result.assets[0].uri);
      if (url) setGroupDetails((prev: any) => prev ? { ...prev, avatar_url: url } : prev);
    } finally {
      setUploadingGroupPhoto(false);
    }
  };

  const handlePinMessage = async () => {
    if (!longPressMsg || !profile) return;
    await SocialService.pinMessage(groupId!, longPressMsg.id, profile.id);
    const updated = await SocialService.getGroupPins(groupId!);
    setPins(updated);
    setLongPressMsg(null);
    setShowMsgActions(false);
  };

  const handleUnpinMessage = async () => {
    if (!longPressMsg || !profile) return;
    const pin = pins.find(p => p.message_id === longPressMsg.id);
    if (pin) {
      await SocialService.unpinMessage(pin.id);
      const updated = await SocialService.getGroupPins(groupId!);
      setPins(updated);
    }
    setLongPressMsg(null);
    setShowMsgActions(false);
  };

  const handleDeleteMessage = async () => {
    if (!longPressMsg || !profile || deletingMsg) return;
    setDeletingMsg(true);
    const ok = await SocialService.deleteGroupMessage(longPressMsg.id, profile.id);
    if (ok) {
      setMessages(prev => prev.map(m =>
        m.id === longPressMsg.id ? { ...m, is_deleted: true, content: '' } : m
      ));
    }
    setDeletingMsg(false);
    setLongPressMsg(null);
    setShowMsgActions(false);
  };

  const handleLeaveGroup = async () => {
    if (!profile || !groupId || leavingGroup) return;
    setLeavingGroup(true);
    try {
      await SocialService.removeGroupMember(groupId, profile.id);
      setShowLeaveConfirm(false);
      router.back();
    } finally {
      setLeavingGroup(false);
    }
  };

  const handleSaveGroupName = async () => {
    if (!groupId || !pendingGroupName.trim() || savingGroupName) return;
    setSavingGroupName(true);
    const ok = await SocialService.updateGroupConversation(groupId, { name: pendingGroupName.trim() });
    if (ok) {
      setGroupDetails((prev: any) => prev ? { ...prev, name: pendingGroupName.trim() } : prev);
      setEditingGroupName(false);
    }
    setSavingGroupName(false);
  };

  const handleSaveTopicName = async () => {
    if (!editingTopicId || !pendingTopicName.trim() || savingTopicName) return;
    setSavingTopicName(true);
    const { error } = await supabase
      .from('group_topics')
      .update({ name: pendingTopicName.trim() })
      .eq('id', editingTopicId);
    if (!error) {
      setTopics(prev => prev.map(t => t.id === editingTopicId ? { ...t, name: pendingTopicName.trim() } : t));
      if (activeTopic?.id === editingTopicId) setActiveTopic(prev => prev ? { ...prev, name: pendingTopicName.trim() } : prev);
      setEditingTopicId(null);
    }
    setSavingTopicName(false);
  };

  const jumpToPinnedMessage = (pin: GroupPin) => {
    const msg = pin.message as any;
    if (!msg) return;
    setShowPinsList(false);
    // Switch to correct topic if needed
    if (msg.topic_id) {
      const topic = topics.find(t => t.id === msg.topic_id);
      if (topic) setActiveTopic(topic);
    } else {
      const def = topics.find(t => t.is_default) ?? topics[0];
      if (def) setActiveTopic(def);
    }
    // Scroll after topic switch (state update takes effect next render)
    setTimeout(() => {
      const targetMessages = messages.filter(m => {
        if (!activeTopic && !msg.topic_id) return true;
        const topicId = msg.topic_id || activeTopic?.id;
        if (!topicId) return true;
        const topic = topics.find(t => t.id === topicId);
        if (!topic) return true;
        if (topic.is_default) return !m.topic_id || m.topic_id === topicId;
        return m.topic_id === topicId;
      });
      const idx = targetMessages.findIndex((m: any) => m.id === pin.message_id);
      if (idx >= 0) {
        try {
          listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
        } catch {
          listRef.current?.scrollToEnd({ animated: true });
        }
      }
      // Highlight
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      setHighlightedMsgId(pin.message_id);
      highlightTimerRef.current = setTimeout(() => setHighlightedMsgId(null), 2000);
    }, 150);
  };

  const createTopic = async () => {
    if (!newTopicName.trim() || !profile || !groupId) return;
    setCreatingTopic(true);
    const topic = await SocialService.createGroupTopic(groupId, newTopicName.trim(), profile.id);
    if (topic) setTopics(prev => [...prev, topic]);
    setNewTopicName('');
    setCreatingTopic(false);
  };

  const deleteTopic = async (topicId: string) => {
    await SocialService.deleteGroupTopic(topicId);
    setTopics(prev => prev.filter(t => t.id !== topicId));
    if (activeTopic?.id === topicId) {
      const def = topics.find(t => t.is_default);
      setActiveTopic(def ?? null);
    }
  };

  const handlePromoteDemote = async (member: any) => {
    if (!groupId || promotingMember) return;
    const currentRole = member.role ?? 'member';
    const newRole = currentRole === 'admin' ? 'member' : 'admin';
    setPromotingMember(member.id);
    const ok = await SocialService.updateGroupMemberRole(groupId, member.id, newRole);
    if (ok) {
      setGroupDetails((prev: any) => {
        if (!prev) return prev;
        return {
          ...prev,
          members: (prev.members ?? []).map((m: any) =>
            m.id === member.id ? { ...m, role: newRole } : m
          ),
        };
      });
    }
    setPromotingMember(null);
  };

  const handleGroupReact = async (emoji: string) => {
    if (!profile || !reactionTarget || reactionTarget.id.startsWith('opt')) return;
    setShowEmojiPicker(false);
    const msgId = reactionTarget.id;
    setReactions(prev => {
      const msgRx = [...(prev[msgId] ?? [])];
      const idx = msgRx.findIndex(x => x.emoji === emoji);
      const alreadyReacted = idx >= 0 && msgRx[idx].userIds.includes(profile.id);
      if (alreadyReacted) {
        const newUserIds = msgRx[idx].userIds.filter((id: string) => id !== profile.id);
        if (newUserIds.length === 0) msgRx.splice(idx, 1);
        else msgRx[idx] = { ...msgRx[idx], count: newUserIds.length, userIds: newUserIds };
      } else if (idx >= 0) {
        msgRx[idx] = { ...msgRx[idx], count: msgRx[idx].count + 1, userIds: [...msgRx[idx].userIds, profile.id] };
      } else {
        msgRx.push({ emoji, count: 1, userIds: [profile.id] });
      }
      return { ...prev, [msgId]: msgRx };
    });
    await SocialService.toggleGroupMessageReaction(msgId, profile.id, emoji);
    setReactionTarget(null);
  };

  const handleGenerateInvite = async () => {
    if (!groupId || !profile || generatingInvite) return;
    setGeneratingInvite(true);
    try {
      const code = await SocialService.createGroupInvite(groupId, profile.id);
      if (code) {
        const inviteLink = `dawen://chat/group/invite/${code}`;
        await Share.share({ message: `Join ${groupDetails?.name || 'our group'} on DAWEN: ${inviteLink}` });
      }
    } finally {
      setGeneratingInvite(false);
    }
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const canLongPress = (item: any) => {
    if (!profile) return false;
    if (myRole === 'creator' || myRole === 'admin') return true;
    return item.sender_id === profile.id;
  };

  const canDeleteMsg = (item: any) => {
    if (!profile) return false;
    if (myRole === 'creator' || myRole === 'admin') return true;
    return item.sender_id === profile.id;
  };

  const canPinMsg = () => myRole === 'creator' || myRole === 'admin';
  const canManageMembers = () => myRole === 'creator' || myRole === 'admin';
  const canManageTopics = () => myRole === 'creator' || myRole === 'admin';

  const renderReactions = (msgId: string, mine: boolean) => {
    const rx = reactions[msgId];
    if (!rx || rx.length === 0) return null;
    return (
      <View style={[styles.reactionsRow, mine ? styles.reactionsRowRight : styles.reactionsRowLeft]}>
        {rx.map((r: Reaction) => {
          const isMine = profile && r.userIds.includes(profile.id);
          return (
            <TouchableOpacity
              key={r.emoji}
              style={[styles.reactionChip, isMine && styles.reactionChipMine]}
              onPress={() => {
                if (!profile || msgId.startsWith('opt')) return;
                setReactionTarget({ id: msgId });
                handleGroupReact(r.emoji);
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.reactionEmoji}>{r.emoji}</Text>
              {r.count > 1 && <Text style={styles.reactionCount}>{r.count}</Text>}
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  const renderMessage = ({ item, index }: { item: any; index: number }) => {
    const isBot = !!item.is_bot_message;
    // Bot messages always render on the left regardless of sender_id
    const mine = item.sender_id === profile?.id && !isBot;
    const prev = index > 0 ? visibleMessages[index - 1] : null;
    // Show sender info when: not mine, AND (first message, sender changed, or bot identity changed)
    const showSenderInfo = !mine && (
      !prev ||
      prev.sender_id !== item.sender_id ||
      !!prev.is_bot_message !== isBot ||
      (isBot && prev.bot_name !== item.bot_name)
    );
    const senderName = isBot
      ? (item.bot_name || item.bot_username || 'Bot')
      : (item.sender?.username || (item.sender?.wallet_address ? `${item.sender.wallet_address.slice(0, 6)}...` : 'User'));
    const isPinned = pins.some(p => p.message_id === item.id);
    const isDeleted = item.is_deleted;
    const isHighlighted = item.id === highlightedMsgId;
    const msgUrls = (!isDeleted && item.content) ? extractUrls(item.content) : [];

    return (
      <TouchableOpacity
        onLongPress={() => {
          setReactionTarget(item);
          if (canLongPress(item)) { setLongPressMsg(item); setShowMsgActions(true); }
          else { setShowEmojiPicker(true); }
        }}
        activeOpacity={0.95}
        delayLongPress={400}
      >
        <View style={[styles.msgRow, mine ? styles.msgRowRight : styles.msgRowLeft, isHighlighted && styles.msgRowHighlighted]}>
          {!mine && (
            <View style={styles.avatarCol}>
              {showSenderInfo ? (
                <View style={styles.msgAvatar}>
                  {isBot && item.bot_avatar_url ? (
                    <Image source={{ uri: item.bot_avatar_url }} style={styles.msgAvatarImg} />
                  ) : !isBot && item.sender?.avatar_url ? (
                    <Image source={{ uri: item.sender.avatar_url }} style={styles.msgAvatarImg} />
                  ) : (
                    <User size={14} color={colors.textMuted} />
                  )}
                </View>
              ) : (
                <View style={styles.avatarPlaceholder} />
              )}
            </View>
          )}
          <View style={[styles.bubbleWrap, mine ? styles.bubbleWrapRight : styles.bubbleWrapLeft]}>
            {!mine && showSenderInfo && (
              <View style={styles.senderNameRow}>
                <Text style={styles.senderName}>{senderName}</Text>
                {isBot && (
                  <View style={styles.botBadge}>
                    <Bot size={9} color="#fff" strokeWidth={2.5} />
                    <Text style={styles.botBadgeText}>BOT</Text>
                  </View>
                )}
              </View>
            )}
            {isDeleted ? (
              <View style={[styles.bubble, mine ? styles.bubbleMineDeleted : styles.bubbleOtherDeleted]}>
                <Text style={styles.deletedText}>Message deleted</Text>
              </View>
            ) : item.media_url ? (
              mine ? (
                <View style={styles.imgBubbleMine}>
                  <TouchableOpacity activeOpacity={0.85} onPress={() => setViewingImage(item.media_url)}>
                    <Image source={{ uri: item.media_url }} style={styles.msgImage} resizeMode="cover" />
                    <View style={styles.zoomHint}><ZoomIn size={16} color="rgba(255,255,255,0.8)" strokeWidth={2} /></View>
                  </TouchableOpacity>
                  <Text style={[styles.bubbleTimeMine, { paddingHorizontal: 8, paddingBottom: 6 }]}>{formatTime(item.created_at)}</Text>
                </View>
              ) : (
                <View style={styles.imgBubbleOther}>
                  <TouchableOpacity activeOpacity={0.85} onPress={() => setViewingImage(item.media_url)}>
                    <Image source={{ uri: item.media_url }} style={styles.msgImage} resizeMode="cover" />
                    <View style={styles.zoomHint}><ZoomIn size={16} color="rgba(255,255,255,0.8)" strokeWidth={2} /></View>
                  </TouchableOpacity>
                  <Text style={[styles.bubbleTimeOther, { paddingHorizontal: 8, paddingBottom: 6 }]}>{formatTime(item.created_at)}</Text>
                </View>
              )
            ) : mine ? (
              <>
                <LinearGradient
                  colors={['#3B82F6', '#1D4ED8']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.bubble, styles.bubbleMine, isPinned && styles.bubblePinned]}
                >
                  {isPinned && <Pin size={10} color="rgba(255,255,255,0.6)" strokeWidth={2} style={{ marginBottom: 3 }} />}
                  <LinkText text={item.content} style={styles.bubbleTextMine} />
                  <Text style={styles.bubbleTimeMine}>{formatTime(item.created_at)}</Text>
                </LinearGradient>
                {msgUrls.length > 0 && <LinkPreview url={msgUrls[0]} />}
              </>
            ) : (
              <>
                <View style={[styles.bubble, styles.bubbleOther, isPinned && styles.bubblePinnedOther]}>
                  {isPinned && <Pin size={10} color={colors.primary} strokeWidth={2} style={{ marginBottom: 3 }} />}
                  <LinkText text={item.content} style={styles.bubbleTextOther} />
                  <Text style={styles.bubbleTimeOther}>{formatTime(item.created_at)}</Text>
                </View>
                {msgUrls.length > 0 && <LinkPreview url={msgUrls[0]} />}
              </>
            )}
            {renderReactions(item.id, mine)}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const memberCount = groupDetails?.members?.length ?? 0;
  const groupAvatarUrl = groupDetails?.avatar_url;
  const isCreatorOrAdmin = myRole === 'creator' || myRole === 'admin';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {/* Top bar — header info tappable for ALL members */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
            <ArrowLeft size={22} color={colors.textPrimary} strokeWidth={2.5} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.headerInfoRow}
            onPress={() => setShowSettings(true)}
            activeOpacity={0.8}
          >
            <View style={styles.groupAvatarWrap}>
              {uploadingGroupPhoto ? (
                <View style={styles.groupAvatar}>
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              ) : groupAvatarUrl ? (
                <Image source={{ uri: groupAvatarUrl }} style={styles.groupAvatarImg} />
              ) : (
                <View style={styles.groupAvatar}>
                  <Users size={18} color={colors.primary} strokeWidth={2} />
                </View>
              )}
              {isCreatorOrAdmin && (
                <TouchableOpacity style={styles.cameraOverlay} onPress={pickGroupPhoto} activeOpacity={0.8}>
                  <Camera size={11} color="#fff" strokeWidth={2} />
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.topUserInfo}>
              <Text style={styles.topUsername} numberOfLines={1}>{groupDetails?.name || 'Group Chat'}</Text>
              <Text style={styles.memberText}>{memberCount} member{memberCount !== 1 ? 's' : ''} · tap for details</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.adminBtn} onPress={() => setShowSettings(true)} activeOpacity={0.7}>
            <Settings size={20} color={colors.textSecondary} strokeWidth={2} />
          </TouchableOpacity>
        </View>

        <View style={styles.divider} />

        {/* Topics bar */}
        {topics.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.topicsBar}
            style={styles.topicsBarWrap}
          >
            {topics.map(topic => (
              <TouchableOpacity
                key={topic.id}
                style={[styles.topicChip, activeTopic?.id === topic.id && styles.topicChipActive]}
                onPress={() => setActiveTopic(topic)}
                activeOpacity={0.8}
              >
                <Hash size={11} color={activeTopic?.id === topic.id ? colors.primary : colors.textMuted} strokeWidth={2} />
                <Text style={[styles.topicChipText, activeTopic?.id === topic.id && styles.topicChipTextActive]}>
                  {topic.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Pinned message banner — supports multiple pins */}
        {pinnedCount > 0 && (
          <TouchableOpacity style={styles.pinnedBanner} onPress={() => setShowPinsList(true)} activeOpacity={0.9}>
            <Pin size={12} color={colors.primary} strokeWidth={2} />
            {pinnedCount === 1 ? (
              <Text style={styles.pinnedText} numberOfLines={1}>
                <Text style={styles.pinnedLabel}>Pinned: </Text>
                {(pins[0]?.message as any)?.is_deleted
                  ? 'Pinned message no longer available.'
                  : ((pins[0]?.message as any)?.content || (pins[0]?.message as any)?.media_url ? '[media]' : 'Message')}
              </Text>
            ) : (
              <Text style={styles.pinnedText}>
                <Text style={styles.pinnedLabel}>{pinnedCount} pinned messages</Text>
                <Text style={{ color: colors.textMuted }}> · tap to view</Text>
              </Text>
            )}
          </TouchableOpacity>
        )}

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          {loading ? (
            <View style={styles.loadingCenter}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : visibleMessages.length === 0 ? (
            <View style={styles.emptyCenter}>
              <Hash size={36} color={colors.primary} strokeWidth={1.5} />
              <Text style={styles.emptyText}>No messages in #{activeTopic?.name ?? 'General'}</Text>
              <Text style={styles.emptySubText}>Be the first to say something!</Text>
            </View>
          ) : (
            <FlatList
              ref={listRef}
              data={visibleMessages}
              keyExtractor={(item: any) => item.id}
              renderItem={renderMessage}
              contentContainerStyle={styles.msgList}
              showsVerticalScrollIndicator={false}
              onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            />
          )}

          <View style={styles.inputBar}>
            <TouchableOpacity style={styles.imgBtn} activeOpacity={0.8} onPress={pickAndSendImage} disabled={uploading}>
              {uploading ? (
                <ActivityIndicator size="small" color={colors.textMuted} />
              ) : (
                <ImageIcon size={20} color={colors.textMuted} strokeWidth={2} />
              )}
            </TouchableOpacity>
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.input}
                placeholder={`Message #${activeTopic?.name ?? 'General'}...`}
                placeholderTextColor={colors.textMuted}
                value={input}
                onChangeText={setInput}
                multiline
                returnKeyType="send"
                onSubmitEditing={send}
              />
            </View>
            <TouchableOpacity
              style={[styles.sendBtn, input.trim() ? styles.sendBtnActive : styles.sendBtnInactive]}
              onPress={send}
              activeOpacity={0.8}
              disabled={sending || !input.trim()}
            >
              {sending ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Send size={18} color={colors.white} strokeWidth={2.5} />
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>

      {/* Message long-press actions */}
      <Modal visible={showMsgActions} transparent animationType="fade" onRequestClose={() => setShowMsgActions(false)}>
        <TouchableWithoutFeedback onPress={() => { setShowMsgActions(false); setLongPressMsg(null); }}>
          <View style={styles.actionOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.actionSheet}>
                <Text style={styles.actionTitle} numberOfLines={1}>
                  {longPressMsg?.is_deleted ? 'Deleted message' : (longPressMsg?.content?.slice(0, 40) || 'Message')}
                </Text>

                {longPressMsg && !longPressMsg.is_deleted && (
                  <TouchableOpacity
                    style={styles.actionRow}
                    onPress={() => { setShowMsgActions(false); setShowEmojiPicker(true); }}
                    activeOpacity={0.8}
                  >
                    <Text style={{ fontSize: 18 }}>😀</Text>
                    <Text style={styles.actionText}>Add Reaction</Text>
                  </TouchableOpacity>
                )}

                {longPressMsg && !longPressMsg.is_deleted && canPinMsg() && (
                  pins.some(p => p.message_id === longPressMsg.id) ? (
                    <TouchableOpacity style={styles.actionRow} onPress={handleUnpinMessage} activeOpacity={0.8}>
                      <Pin size={16} color="#EF4444" strokeWidth={2} />
                      <Text style={[styles.actionText, { color: '#EF4444' }]}>Unpin Message</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity style={styles.actionRow} onPress={handlePinMessage} activeOpacity={0.8}>
                      <Pin size={16} color={colors.primary} strokeWidth={2} />
                      <Text style={styles.actionText}>Pin Message</Text>
                    </TouchableOpacity>
                  )
                )}

                {longPressMsg && !longPressMsg.is_deleted && canDeleteMsg(longPressMsg) && (
                  <TouchableOpacity style={styles.actionRow} onPress={handleDeleteMessage} activeOpacity={0.8} disabled={deletingMsg}>
                    {deletingMsg ? (
                      <ActivityIndicator size="small" color="#EF4444" />
                    ) : (
                      <Trash2 size={16} color="#EF4444" strokeWidth={2} />
                    )}
                    <Text style={[styles.actionText, { color: '#EF4444' }]}>Delete Message</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[styles.actionRow, styles.actionRowCancel]}
                  onPress={() => { setShowMsgActions(false); setLongPressMsg(null); }}
                  activeOpacity={0.8}
                >
                  <X size={16} color={colors.textMuted} strokeWidth={2} />
                  <Text style={[styles.actionText, { color: colors.textMuted }]}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Group Details / Settings panel — accessible to ALL members */}
      <Modal visible={showSettings} transparent animationType="slide" onRequestClose={() => setShowSettings(false)}>
        <View style={styles.adminOverlay}>
          <View style={styles.adminSheet}>
            <View style={styles.adminHandle} />
            <View style={styles.adminHeader}>
              <Settings size={18} color={colors.primary} strokeWidth={2} />
              <Text style={styles.adminTitle}>Group Details</Text>
              <TouchableOpacity onPress={() => setShowSettings(false)} activeOpacity={0.7}>
                <X size={20} color={colors.textPrimary} strokeWidth={2} />
              </TouchableOpacity>
            </View>

            {/* Group photo in settings */}
            <View style={styles.settingsPhotoRow}>
              <TouchableOpacity
                style={styles.settingsAvatarWrap}
                onPress={isCreatorOrAdmin ? pickGroupPhoto : undefined}
                activeOpacity={isCreatorOrAdmin ? 0.8 : 1}
              >
                {groupAvatarUrl ? (
                  <Image source={{ uri: groupAvatarUrl }} style={styles.settingsAvatar} />
                ) : (
                  <View style={[styles.settingsAvatar, styles.settingsAvatarPlaceholder]}>
                    <Users size={28} color={colors.primary} strokeWidth={2} />
                  </View>
                )}
                {isCreatorOrAdmin && (
                  <View style={styles.settingsCameraOverlay}>
                    {uploadingGroupPhoto ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Camera size={14} color="#fff" strokeWidth={2} />
                    )}
                  </View>
                )}
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                {isCreatorOrAdmin && editingGroupName ? (
                  <View style={styles.inlineEditRow}>
                    <TextInput
                      style={styles.inlineEditInput}
                      value={pendingGroupName}
                      onChangeText={setPendingGroupName}
                      autoFocus
                      maxLength={60}
                      returnKeyType="done"
                      onSubmitEditing={handleSaveGroupName}
                    />
                    <TouchableOpacity onPress={handleSaveGroupName} disabled={savingGroupName} activeOpacity={0.8}>
                      {savingGroupName ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <Text style={styles.inlineEditSave}>Save</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setEditingGroupName(false)} activeOpacity={0.8}>
                      <X size={16} color={colors.textMuted} strokeWidth={2} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.inlineNameRow}>
                    <Text style={styles.settingsGroupName} numberOfLines={1}>{groupDetails?.name || 'Group'}</Text>
                    {isCreatorOrAdmin && (
                      <TouchableOpacity onPress={() => { setPendingGroupName(groupDetails?.name || ''); setEditingGroupName(true); }} activeOpacity={0.7}>
                        <Edit2 size={14} color={colors.textMuted} strokeWidth={2} />
                      </TouchableOpacity>
                    )}
                  </View>
                )}
                <Text style={styles.settingsMemberCount}>{memberCount} member{memberCount !== 1 ? 's' : ''}</Text>
                {isCreatorOrAdmin && !editingGroupName && (
                  <Text style={styles.settingsPhotoHint}>Tap photo to change</Text>
                )}
              </View>
            </View>

            <ScrollView style={styles.settingsScroll} showsVerticalScrollIndicator={false}>
              {/* Topics — creator/admin only */}
              {canManageTopics() && (
                <>
                  <Text style={styles.adminSection}>Topics</Text>
                  {topics.map(topic => (
                    <View key={topic.id} style={styles.adminTopicRow}>
                      <Hash size={13} color={colors.textMuted} strokeWidth={2} />
                      {editingTopicId === topic.id ? (
                        <View style={[styles.inlineEditRow, { flex: 1 }]}>
                          <TextInput
                            style={[styles.inlineEditInput, { flex: 1 }]}
                            value={pendingTopicName}
                            onChangeText={setPendingTopicName}
                            autoFocus
                            maxLength={32}
                            returnKeyType="done"
                            onSubmitEditing={handleSaveTopicName}
                          />
                          <TouchableOpacity onPress={handleSaveTopicName} disabled={savingTopicName} activeOpacity={0.8}>
                            {savingTopicName ? (
                              <ActivityIndicator size="small" color={colors.primary} />
                            ) : (
                              <Text style={styles.inlineEditSave}>Save</Text>
                            )}
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => setEditingTopicId(null)} activeOpacity={0.8}>
                            <X size={14} color={colors.textMuted} strokeWidth={2} />
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <>
                          <Text style={styles.adminTopicName}>{topic.name}</Text>
                          {topic.is_default && (
                            <View style={styles.defaultBadge}>
                              <Text style={styles.defaultBadgeText}>default</Text>
                            </View>
                          )}
                          <TouchableOpacity onPress={() => { setPendingTopicName(topic.name); setEditingTopicId(topic.id); }} activeOpacity={0.7} style={styles.deleteTopicBtn}>
                            <Edit2 size={13} color={colors.textMuted} strokeWidth={2} />
                          </TouchableOpacity>
                          {!topic.is_default && (
                            <TouchableOpacity onPress={() => deleteTopic(topic.id)} activeOpacity={0.7} style={styles.deleteTopicBtn}>
                              <Trash2 size={14} color="#EF4444" strokeWidth={2} />
                            </TouchableOpacity>
                          )}
                        </>
                      )}
                    </View>
                  ))}
                  <View style={styles.newTopicRow}>
                    <TextInput
                      style={styles.newTopicInput}
                      placeholder="New topic name..."
                      placeholderTextColor={colors.textMuted}
                      value={newTopicName}
                      onChangeText={setNewTopicName}
                      maxLength={32}
                    />
                    <TouchableOpacity
                      style={[styles.addTopicBtn, (!newTopicName.trim() || creatingTopic) && styles.addTopicBtnDisabled]}
                      onPress={createTopic}
                      disabled={!newTopicName.trim() || creatingTopic}
                      activeOpacity={0.8}
                    >
                      {creatingTopic ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Plus size={18} color="#fff" strokeWidth={2.5} />
                      )}
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {/* Members */}
              <View style={styles.adminSectionRow}>
                <Text style={[styles.adminSection, { flex: 1 }]}>Members</Text>
                {canManageMembers() && (
                  <TouchableOpacity
                    style={styles.addMemberBtn}
                    onPress={() => { setShowSettings(false); setShowAddMembers(true); }}
                    activeOpacity={0.8}
                  >
                    <UserPlus size={14} color={colors.primary} strokeWidth={2} />
                    <Text style={styles.addMemberBtnText}>Add</Text>
                  </TouchableOpacity>
                )}
              </View>

              {(groupDetails?.members ?? []).map((m: any) => {
                const name = m.username || (m.wallet_address ? `${m.wallet_address.slice(0, 6)}...` : 'User');
                const isMe = m.id === profile?.id;
                const role: string = myRole === 'creator' && m.id === groupDetails?.creator_id
                  ? 'creator'
                  : (m.role ?? 'member');
                return (
                  <View key={m.id} style={styles.adminMemberRow}>
                    <TouchableOpacity
                      style={styles.memberAvatarTap}
                      onPress={() => { setShowSettings(false); router.push(`/profile/${m.id}` as any); }}
                      activeOpacity={0.8}
                    >
                      <View style={styles.memberAvatar}>
                        {m.avatar_url ? (
                          <Image source={{ uri: m.avatar_url }} style={styles.memberAvatarImg} />
                        ) : (
                          <User size={14} color={colors.textMuted} />
                        )}
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.memberNameWrap}
                      onPress={() => { setShowSettings(false); router.push(`/profile/${m.id}` as any); }}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.memberName}>{name}{isMe ? ' (you)' : ''}</Text>
                      {role !== 'member' && (
                        <View style={[styles.roleBadge, role === 'creator' && styles.roleBadgeCreator, role === 'admin' && styles.roleBadgeAdmin]}>
                          <Text style={styles.roleBadgeText}>{role}</Text>
                        </View>
                      )}
                    </TouchableOpacity>

                    {/* Promote/demote — creator only, not self, not the other creator */}
                    {myRole === 'creator' && !isMe && role !== 'creator' && (
                      <TouchableOpacity
                        style={styles.promoteBtn}
                        onPress={() => handlePromoteDemote(m)}
                        activeOpacity={0.8}
                        disabled={promotingMember === m.id}
                      >
                        {promotingMember === m.id ? (
                          <ActivityIndicator size="small" color={colors.textMuted} />
                        ) : role === 'admin' ? (
                          <ShieldOff size={14} color={colors.textMuted} strokeWidth={2} />
                        ) : (
                          <Shield size={14} color='#10B981' strokeWidth={2} />
                        )}
                      </TouchableOpacity>
                    )}

                    {/* Remove — creator/admin can remove (not self, not creator) */}
                    {!isMe && canManageMembers() && role !== 'creator' && (
                      <TouchableOpacity
                        onPress={() => setConfirmRemoveMember(m)}
                        activeOpacity={0.7}
                        style={styles.removeMemberBtn}
                      >
                        <X size={14} color="#EF4444" strokeWidth={2} />
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}

              {isCreatorOrAdmin && (
                <TouchableOpacity
                  style={styles.inviteLinkBtn}
                  onPress={() => { setShowSettings(false); handleGenerateInvite(); }}
                  activeOpacity={0.8}
                  disabled={generatingInvite}
                >
                  {generatingInvite ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Link size={15} color={colors.primary} strokeWidth={2} />
                  )}
                  <Text style={styles.inviteLinkText}>Generate Invite Link</Text>
                </TouchableOpacity>
              )}

              {isCreatorOrAdmin && (
                <TouchableOpacity
                  style={styles.botSettingsBtn}
                  onPress={() => { setShowSettings(false); setShowBotSettings(true); }}
                  activeOpacity={0.8}
                >
                  <Bot size={15} color="#8B5CF6" strokeWidth={2} />
                  <Text style={styles.botSettingsBtnText}>Telegram Bot</Text>
                </TouchableOpacity>
              )}

              {isCreatorOrAdmin && (
                <TouchableOpacity
                  style={styles.botSettingsBtn}
                  onPress={() => { setShowSettings(false); setShowBotEngine(true); }}
                  activeOpacity={0.8}
                >
                  <Bot size={15} color="#06b6d4" strokeWidth={2} />
                  <Text style={[styles.botSettingsBtnText, { color: '#06b6d4' }]}>Bot Engine</Text>
                </TouchableOpacity>
              )}

              {myRole === 'creator' && (
                <TouchableOpacity
                  style={styles.deleteGroupBtn}
                  onPress={() => { setShowSettings(false); setShowDeleteConfirm(true); }}
                  activeOpacity={0.8}
                >
                  <Trash2 size={15} color="#EF4444" strokeWidth={2} />
                  <Text style={styles.deleteGroupText}>Delete Group</Text>
                </TouchableOpacity>
              )}

              {myRole !== 'creator' && (
                <TouchableOpacity
                  style={styles.leaveGroupBtn}
                  onPress={() => { setShowSettings(false); setShowLeaveConfirm(true); }}
                  activeOpacity={0.8}
                >
                  <LogOut size={15} color="#F59E0B" strokeWidth={2} />
                  <Text style={styles.leaveGroupText}>Leave Group</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Add Members modal */}
      <Modal visible={showAddMembers} transparent animationType="slide" onRequestClose={() => setShowAddMembers(false)}>
        <View style={styles.adminOverlay}>
          <View style={styles.adminSheet}>
            <View style={styles.adminHandle} />
            <View style={styles.adminHeader}>
              <UserPlus size={18} color={colors.primary} strokeWidth={2} />
              <Text style={styles.adminTitle}>Add Members</Text>
              <TouchableOpacity onPress={() => setShowAddMembers(false)} activeOpacity={0.7}>
                <X size={20} color={colors.textPrimary} strokeWidth={2} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.searchInput}
              placeholder="Search by username or wallet..."
              placeholderTextColor={colors.textMuted}
              value={memberSearch}
              onChangeText={async (q) => {
                setMemberSearch(q);
                if (!q.trim() || !groupId) { setMemberSearchResults([]); return; }
                setSearchingMembers(true);
                const results = await SocialService.searchUsersNotInGroup(groupId, q);
                setMemberSearchResults(results);
                setSearchingMembers(false);
              }}
            />
            {searchingMembers && <ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} />}
            <ScrollView style={styles.membersList} showsVerticalScrollIndicator={false}>
              {memberSearchResults.map((u: any) => (
                <TouchableOpacity
                  key={u.id}
                  style={styles.adminMemberRow}
                  activeOpacity={0.8}
                  onPress={async () => {
                    if (!groupId || addingMember) return;
                    setAddingMember(u.id);
                    await SocialService.addGroupMember(groupId, u.id);
                    setMemberSearchResults(prev => prev.filter((r: any) => r.id !== u.id));
                    setAddingMember(null);
                    loadData();
                  }}
                >
                  <View style={styles.memberAvatar}>
                    {u.avatar_url ? (
                      <Image source={{ uri: u.avatar_url }} style={styles.memberAvatarImg} />
                    ) : (
                      <User size={14} color={colors.textMuted} />
                    )}
                  </View>
                  <Text style={styles.memberName}>{u.username || u.wallet_address?.slice(0, 10)}</Text>
                  {addingMember === u.id ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Plus size={16} color={colors.primary} strokeWidth={2} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Remove member confirmation */}
      <Modal visible={!!confirmRemoveMember} transparent animationType="fade" onRequestClose={() => setConfirmRemoveMember(null)}>
        <TouchableWithoutFeedback onPress={() => setConfirmRemoveMember(null)}>
          <View style={styles.actionOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.confirmSheet}>
                <AlertTriangle size={28} color="#EF4444" strokeWidth={2} />
                <Text style={styles.confirmTitle}>Remove Member</Text>
                <Text style={styles.confirmText}>
                  Remove {confirmRemoveMember?.username || 'this user'} from the group?
                </Text>
                <View style={styles.confirmBtns}>
                  <TouchableOpacity style={styles.confirmCancel} onPress={() => setConfirmRemoveMember(null)} activeOpacity={0.8}>
                    <Text style={styles.confirmCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.confirmDanger}
                    activeOpacity={0.8}
                    onPress={async () => {
                      if (!confirmRemoveMember || !groupId) return;
                      await SocialService.removeGroupMember(groupId, confirmRemoveMember.id);
                      setConfirmRemoveMember(null);
                      loadData();
                    }}
                  >
                    <Text style={styles.confirmDangerText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Delete group confirmation */}
      <Modal visible={showDeleteConfirm} transparent animationType="fade" onRequestClose={() => setShowDeleteConfirm(false)}>
        <TouchableWithoutFeedback onPress={() => setShowDeleteConfirm(false)}>
          <View style={styles.actionOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.confirmSheet}>
                <AlertTriangle size={28} color="#EF4444" strokeWidth={2} />
                <Text style={styles.confirmTitle}>Delete Group</Text>
                <Text style={styles.confirmText}>
                  This will permanently delete "{groupDetails?.name}". This cannot be undone.
                </Text>
                <View style={styles.confirmBtns}>
                  <TouchableOpacity style={styles.confirmCancel} onPress={() => setShowDeleteConfirm(false)} activeOpacity={0.8}>
                    <Text style={styles.confirmCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.confirmDanger}
                    activeOpacity={0.8}
                    onPress={async () => {
                      if (!groupId || !profile?.id) return;
                      await SocialService.deleteGroup(groupId, profile.id);
                      setShowDeleteConfirm(false);
                      router.back();
                    }}
                  >
                    <Text style={styles.confirmDangerText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Full-screen image viewer */}
      <Modal visible={!!viewingImage} transparent animationType="fade" onRequestClose={() => setViewingImage(null)}>
        <View style={styles.imageViewerOverlay}>
          <TouchableOpacity style={styles.imageViewerClose} onPress={() => setViewingImage(null)} activeOpacity={0.8}>
            <X size={22} color="#fff" strokeWidth={2} />
          </TouchableOpacity>
          {viewingImage && (
            <Image source={{ uri: viewingImage }} style={styles.imageViewerImg} resizeMode="contain" />
          )}
        </View>
      </Modal>

      {/* Pinned messages list */}
      <Modal visible={showPinsList} transparent animationType="slide" onRequestClose={() => setShowPinsList(false)}>
        <View style={styles.adminOverlay}>
          <View style={styles.adminSheet}>
            <View style={styles.adminHandle} />
            <View style={styles.adminHeader}>
              <Pin size={18} color={colors.primary} strokeWidth={2} />
              <Text style={styles.adminTitle}>Pinned Messages</Text>
              <TouchableOpacity onPress={() => setShowPinsList(false)} activeOpacity={0.7}>
                <X size={20} color={colors.textPrimary} strokeWidth={2} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
              {pins.length === 0 ? (
                <Text style={[styles.emptySubText, { textAlign: 'center', paddingVertical: 24 }]}>No pinned messages</Text>
              ) : (
                pins.map((pin, i) => {
                  const msg = pin.message as any;
                  const isDeletedPin = msg?.is_deleted;
                  const pinContent = isDeletedPin
                    ? 'Message no longer available'
                    : (msg?.content || (msg?.media_url ? '[Media]' : 'Message'));
                  const pinnerName = (pin as any).pinner?.username || 'Admin';
                  return (
                    <TouchableOpacity
                      key={pin.id}
                      style={styles.pinListRow}
                      onPress={() => !isDeletedPin && jumpToPinnedMessage(pin)}
                      activeOpacity={isDeletedPin ? 1 : 0.8}
                    >
                      <View style={styles.pinListIcon}>
                        <Pin size={14} color={colors.primary} strokeWidth={2} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.pinListContent, isDeletedPin && { fontStyle: 'italic', color: colors.textMuted }]} numberOfLines={2}>
                          {pinContent}
                        </Text>
                        <Text style={styles.pinListMeta}>Pinned by {pinnerName}</Text>
                      </View>
                      {!isDeletedPin && (
                        <ChevronRight size={14} color={colors.textMuted} strokeWidth={2} />
                      )}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Emoji reaction picker */}
      <Modal
        visible={showEmojiPicker}
        transparent
        animationType="fade"
        onRequestClose={() => { setShowEmojiPicker(false); setReactionTarget(null); }}
      >
        <TouchableWithoutFeedback onPress={() => { setShowEmojiPicker(false); setReactionTarget(null); }}>
          <View style={styles.emojiOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.emojiSheet}>
                <Text style={styles.emojiSheetTitle}>React</Text>
                <View style={styles.emojiGrid}>
                  {EMOJI_SET.map(emoji => (
                    <TouchableOpacity
                      key={emoji}
                      style={styles.emojiBtn2}
                      onPress={() => handleGroupReact(emoji)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.emojiChar}>{emoji}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Telegram Bot Settings */}
      {profile?.wallet_address && (
        <BotSettings
          visible={showBotSettings}
          onClose={() => setShowBotSettings(false)}
          groupId={groupId!}
          walletAddress={profile.wallet_address}
          isAdmin={isCreatorOrAdmin}
        />
      )}

      {/* DAWEN Bot Engine */}
      {profile?.wallet_address && (
        <BotEngineSettings
          visible={showBotEngine}
          onClose={() => setShowBotEngine(false)}
          groupId={groupId!}
          walletAddress={profile.wallet_address}
          isAdmin={isCreatorOrAdmin}
        />
      )}

      {/* Leave group confirmation */}
      <Modal visible={showLeaveConfirm} transparent animationType="fade" onRequestClose={() => setShowLeaveConfirm(false)}>
        <TouchableWithoutFeedback onPress={() => setShowLeaveConfirm(false)}>
          <View style={styles.actionOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.confirmSheet}>
                <LogOut size={28} color="#F59E0B" strokeWidth={2} />
                <Text style={styles.confirmTitle}>Leave Group</Text>
                <Text style={styles.confirmText}>
                  Leave "{groupDetails?.name}"? You'll need to be re-added to rejoin.
                </Text>
                <View style={styles.confirmBtns}>
                  <TouchableOpacity style={styles.confirmCancel} onPress={() => setShowLeaveConfirm(false)} activeOpacity={0.8} disabled={leavingGroup}>
                    <Text style={styles.confirmCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.confirmDanger, { borderColor: 'rgba(245,158,11,0.3)', backgroundColor: 'rgba(245,158,11,0.12)' }]}
                    activeOpacity={0.8}
                    disabled={leavingGroup}
                    onPress={handleLeaveGroup}
                  >
                    {leavingGroup ? (
                      <ActivityIndicator size="small" color="#F59E0B" />
                    ) : (
                      <Text style={[styles.confirmDangerText, { color: '#F59E0B' }]}>Leave</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0A0A0F' },
  container: { flex: 1, backgroundColor: '#0A0A0F' },
  flex: { flex: 1 },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: Platform.OS === 'android' ? 44 : 8,
    paddingBottom: spacing.md,
    backgroundColor: '#0A0A0F',
    gap: spacing.sm,
  },
  backBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  headerInfoRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  groupAvatarWrap: { position: 'relative' },
  groupAvatar: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 2, borderColor: colors.primary,
    backgroundColor: 'rgba(59,130,246,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
  groupAvatarImg: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 2, borderColor: colors.primary,
  },
  cameraOverlay: {
    position: 'absolute', bottom: -2, right: -2,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: colors.primary,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1.5, borderColor: '#0A0A0F',
  },
  topUserInfo: { flex: 1, gap: 2 },
  topUsername: { fontSize: 17, fontWeight: '800', color: colors.textPrimary },
  memberText: { fontSize: 11, color: colors.textMuted, fontWeight: '500' },
  adminBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  divider: { height: 1, backgroundColor: 'rgba(59,130,246,0.12)' },

  // Settings photo
  settingsPhotoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginBottom: spacing.xl },
  settingsAvatarWrap: { position: 'relative' },
  settingsAvatar: { width: 72, height: 72, borderRadius: 36 },
  settingsAvatarPlaceholder: { backgroundColor: 'rgba(59,130,246,0.15)', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: colors.primary },
  settingsCameraOverlay: {
    position: 'absolute', bottom: 0, right: 0,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: colors.primary,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#12121A',
  },
  settingsGroupName: { fontSize: fontSize.lg, fontWeight: '800', color: colors.textPrimary },
  settingsMemberCount: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  settingsPhotoHint: { fontSize: 10, color: colors.textMuted, marginTop: 4 },
  settingsScroll: { flex: 1 },

  // Topics bar
  topicsBarWrap: { maxHeight: 44, backgroundColor: '#0D0D14' },
  topicsBar: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
    gap: 8,
  },
  topicChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
  },
  topicChipActive: { backgroundColor: 'rgba(59,130,246,0.15)', borderColor: 'rgba(59,130,246,0.4)' },
  topicChipText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  topicChipTextActive: { color: colors.primary },

  // Pinned banner
  pinnedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.lg, paddingVertical: 7,
    backgroundColor: 'rgba(59,130,246,0.08)',
    borderBottomWidth: 1, borderBottomColor: 'rgba(59,130,246,0.12)',
  },
  pinnedLabel: { fontWeight: '700', color: colors.primary },
  pinnedText: { fontSize: 12, color: colors.textSecondary, flex: 1 },

  loadingCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10 },
  emptyText: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  emptySubText: { fontSize: 13, color: colors.textMuted },

  msgList: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.lg, gap: 4 },
  msgRow: { flexDirection: 'row', marginBottom: 4 },
  msgRowLeft: { justifyContent: 'flex-start', alignItems: 'flex-end' },
  msgRowRight: { justifyContent: 'flex-end' },
  avatarCol: { width: 36, marginRight: 8, alignItems: 'center', justifyContent: 'flex-end' },
  msgAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#1E1E2E', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  msgAvatarImg: { width: 32, height: 32, borderRadius: 16 },
  avatarPlaceholder: { width: 32, height: 32 },
  bubbleWrap: { maxWidth: '75%' },
  bubbleWrapLeft: {},
  bubbleWrapRight: {},
  senderName: { fontSize: 11, fontWeight: '700', color: colors.primary, marginBottom: 3, marginLeft: 14 },
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMine: { borderBottomRightRadius: 4 },
  bubbleMineDeleted: { borderBottomRightRadius: 4, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  bubbleOther: { backgroundColor: '#1E1E2E', borderBottomLeftRadius: 4 },
  bubbleOtherDeleted: { backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', borderBottomLeftRadius: 4 },
  bubblePinned: { borderColor: 'rgba(255,255,255,0.25)', borderWidth: 1 },
  bubblePinnedOther: { borderColor: 'rgba(59,130,246,0.35)', borderWidth: 1 },
  bubbleTextMine: { fontSize: 15, color: colors.white, lineHeight: 21 },
  bubbleTextOther: { fontSize: 15, color: colors.textPrimary, lineHeight: 21 },
  deletedText: { fontSize: 14, color: colors.textMuted, fontStyle: 'italic' },
  bubbleTimeMine: { fontSize: 10, color: 'rgba(255,255,255,0.55)', textAlign: 'right', marginTop: 4 },
  bubbleTimeOther: { fontSize: 10, color: colors.textMuted, textAlign: 'right', marginTop: 4 },
  msgImage: { width: 220, height: 160, borderRadius: 12 },
  imgBubbleMine: { borderRadius: 14, overflow: 'hidden', borderBottomRightRadius: 4, borderWidth: 1, borderColor: 'rgba(59,130,246,0.3)' },
  imgBubbleOther: { backgroundColor: '#1E1E2E', borderRadius: 14, overflow: 'hidden', borderBottomLeftRadius: 4 },

  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    paddingBottom: Platform.OS === 'ios' ? spacing.xl : spacing.md,
    gap: spacing.sm, backgroundColor: '#0A0A0F',
    borderTopWidth: 1, borderTopColor: 'rgba(59,130,246,0.08)',
  },
  imgBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  inputWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'flex-end',
    backgroundColor: '#1A1A28', borderRadius: 22,
    paddingHorizontal: spacing.lg, paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    minHeight: 44, borderWidth: 1, borderColor: 'rgba(59,130,246,0.15)',
  },
  input: { flex: 1, fontSize: 15, color: colors.textPrimary, minHeight: 24, maxHeight: 120, paddingTop: 0, paddingBottom: 0, textAlignVertical: 'top' },
  sendBtn: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  sendBtnActive: { backgroundColor: colors.primary },
  sendBtnInactive: { backgroundColor: colors.primary, opacity: 0.5 },

  // Message actions modal
  actionOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  actionSheet: {
    backgroundColor: '#1A1A28',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: spacing.md, paddingBottom: 32,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  actionTitle: {
    fontSize: 12, fontWeight: '600', color: colors.textMuted,
    paddingHorizontal: spacing.xl, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
    marginBottom: 4,
  },
  actionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: spacing.xl, paddingVertical: 14,
  },
  actionRowCancel: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', marginTop: 4 },
  actionText: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },

  // Admin modal
  adminOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  adminSheet: {
    backgroundColor: '#12121A',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: spacing.xl, paddingBottom: 40,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    maxHeight: '85%',
  },
  adminHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: spacing.lg },
  adminHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg },
  adminTitle: { flex: 1, fontSize: fontSize.lg, fontWeight: '800', color: colors.textPrimary },
  adminSection: { fontSize: 11, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: spacing.sm, marginTop: spacing.lg },
  adminTopicRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  adminTopicName: { flex: 1, fontSize: fontSize.sm, fontWeight: '600', color: colors.textPrimary },
  defaultBadge: { backgroundColor: 'rgba(59,130,246,0.15)', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: 'rgba(59,130,246,0.3)' },
  defaultBadgeText: { fontSize: 9, fontWeight: '700', color: colors.primary },
  deleteTopicBtn: { padding: 4 },
  newTopicRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', marginBottom: spacing.md },
  newTopicInput: {
    flex: 1, backgroundColor: '#0A0A0F', borderRadius: 12,
    paddingHorizontal: spacing.lg, paddingVertical: 10,
    fontSize: fontSize.sm, color: colors.textPrimary,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  addTopicBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  addTopicBtnDisabled: { opacity: 0.4 },
  membersList: { maxHeight: 200 },
  adminMemberRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  memberAvatarTap: {},
  memberAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#1A1A28', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  memberAvatarImg: { width: 30, height: 30, borderRadius: 15 },
  memberNameWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  memberName: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textPrimary },
  removeMemberBtn: { padding: 6 },
  promoteBtn: {
    padding: 6, borderRadius: 8,
    backgroundColor: 'rgba(16,185,129,0.08)',
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.2)',
  },

  adminSectionRow: { flexDirection: 'row', alignItems: 'center' },
  addMemberBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5,
    backgroundColor: 'rgba(59,130,246,0.1)',
    borderRadius: 8, borderWidth: 1, borderColor: 'rgba(59,130,246,0.3)',
    marginTop: spacing.lg,
  },
  addMemberBtnText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.primary },
  roleBadge: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  roleBadgeCreator: { backgroundColor: 'rgba(59,130,246,0.15)', borderColor: 'rgba(59,130,246,0.4)' },
  roleBadgeAdmin: { backgroundColor: 'rgba(16,185,129,0.12)', borderColor: 'rgba(16,185,129,0.3)' },
  roleBadgeText: { fontSize: 9, fontWeight: '800', color: colors.primary },
  deleteGroupBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginTop: spacing.xl, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: 'rgba(239,68,68,0.15)',
  },
  deleteGroupText: { fontSize: fontSize.sm, fontWeight: '700', color: '#EF4444' },

  searchInput: {
    backgroundColor: '#0A0A0F', borderRadius: 12,
    paddingHorizontal: spacing.lg, paddingVertical: 10,
    fontSize: fontSize.sm, color: colors.textPrimary,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: spacing.md,
  },

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

  zoomHint: {
    position: 'absolute', bottom: 6, right: 6,
    backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 10, padding: 3,
  },
  imageViewerOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center', alignItems: 'center',
  },
  imageViewerClose: {
    position: 'absolute', top: 48, right: 20, zIndex: 10,
    backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20, padding: 8,
  },
  imageViewerImg: { width: '100%', height: '80%' },

  // Highlighted message
  msgRowHighlighted: {
    backgroundColor: 'rgba(59,130,246,0.1)',
    borderRadius: 12,
    marginHorizontal: -4,
    paddingHorizontal: 4,
  },

  // Inline editing
  inlineEditRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  inlineEditInput: {
    flex: 1, fontSize: fontSize.sm, color: colors.textPrimary,
    backgroundColor: '#0A0A0F', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: 'rgba(59,130,246,0.3)',
  },
  inlineEditSave: { fontSize: fontSize.sm, fontWeight: '700', color: colors.primary },
  inlineNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  // Leave group
  leaveGroupBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginTop: spacing.xl, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: 'rgba(245,158,11,0.12)',
  },
  leaveGroupText: { fontSize: fontSize.sm, fontWeight: '700', color: '#F59E0B' },

  // Reactions
  reactionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
  },
  reactionsRowLeft: { justifyContent: 'flex-start' },
  reactionsRowRight: { justifyContent: 'flex-end' },
  reactionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  reactionChipMine: {
    backgroundColor: 'rgba(59,130,246,0.18)',
    borderColor: 'rgba(59,130,246,0.4)',
  },
  reactionEmoji: { fontSize: 14 },
  reactionCount: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
  },

  // Emoji picker
  emojiOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emojiSheet: {
    backgroundColor: '#1A1A28',
    borderRadius: 20,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    gap: spacing.md,
  },
  emojiSheetTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  emojiGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  emojiBtn2: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emojiChar: { fontSize: 24 },

  // Invite link
  inviteLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(59,130,246,0.12)',
  },
  inviteLinkText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.primary },

  // Bot settings button
  botSettingsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(139,92,246,0.12)',
  },
  botSettingsBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: '#8B5CF6' },

  // BOT badge in messages
  senderNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 3, marginLeft: 14 },
  botBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: '#8B5CF6',
    borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2,
  },
  botBadgeText: { fontSize: 8, fontWeight: '900', color: '#fff', letterSpacing: 0.5 },

  // Pins list
  pinListRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  pinListIcon: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: 'rgba(59,130,246,0.1)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(59,130,246,0.2)',
  },
  pinListContent: { fontSize: 14, fontWeight: '600', color: colors.textPrimary, lineHeight: 20 },
  pinListMeta: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
});
