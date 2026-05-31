import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, ActivityIndicator, Image, KeyboardAvoidingView,
  Platform, RefreshControl,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowLeft, Send, Shield, Users, Clock, CircleCheck as CheckCircle,
  X, TriangleAlert as AlertTriangle, FileText, ChevronRight,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useWallet } from '@/contexts/WalletContext';
import {
  CrewService, CrewApplication, CrewApplicationMessage,
  CrewRole, CrewAppStatus,
} from '@/services/crewService';
import { SocialService } from '@/services/socialService';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function StatusBadge({ status }: { status: CrewAppStatus }) {
  const map: Record<string, { label: string; color: string }> = {
    draft:          { label: 'Draft',          color: '#6B7280' },
    submitted:      { label: 'Submitted',       color: '#3B82F6' },
    under_review:   { label: 'Under Review',    color: '#8B5CF6' },
    shortlisted:    { label: 'Shortlisted',     color: '#06B6D4' },
    trial:          { label: 'Trial',           color: '#F59E0B' },
    accepted:       { label: 'Accepted',        color: '#10B981' },
    rejected:       { label: 'Rejected',        color: '#EF4444' },
    needs_changes:  { label: 'Needs Changes',   color: '#F97316' },
    paused:         { label: 'Paused',          color: '#6B7280' },
    removed:        { label: 'Removed',         color: '#6B7280' },
    blacklisted:    { label: 'Blacklisted',     color: '#EF4444' },
  };
  const s = map[status] ?? { label: status, color: '#6B7280' };
  return (
    <View style={[styles.statusBadge, { backgroundColor: s.color + '22', borderColor: s.color + '44' }]}>
      <View style={[styles.statusDot, { backgroundColor: s.color }]} />
      <Text style={[styles.statusText, { color: s.color }]}>{s.label}</Text>
    </View>
  );
}

export default function CrewMessageThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { activeAddress } = useWallet();

  const [loading, setLoading] = useState(true);
  const [application, setApplication] = useState<CrewApplication | null>(null);
  const [messages, setMessages] = useState<CrewApplicationMessage[]>([]);
  const [roles, setRoles] = useState<CrewRole[]>([]);
  const [myProfileId, setMyProfileId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    if (!id || !activeAddress) return;
    try {
      const [rolesData, profile] = await Promise.all([
        CrewService.getRoles(),
        SocialService.getOrCreateProfile(activeAddress),
      ]);
      setRoles(rolesData);
      if (profile) setMyProfileId(profile.id);

      // Load application
      const { data: appData } = await supabase
        .from('crew_applications')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (appData) {
        setApplication(appData as CrewApplication);
        const msgs = await CrewService.getApplicationMessages(id);
        setMessages(msgs);
      }
    } finally {
      setLoading(false);
    }
  }, [id, activeAddress]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const sendReply = async () => {
    if (!replyText.trim() || !myProfileId || !id || sending) return;
    setSending(true);
    setSendError('');
    const { error } = await CrewService.sendApplicationMessage(
      id, myProfileId, replyText.trim(), 'applicant'
    );
    if (error) {
      setSendError(error);
    } else {
      setReplyText('');
      const msgs = await CrewService.getApplicationMessages(id);
      setMessages(msgs);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
    setSending(false);
  };

  const role = roles.find(r => r.role_key === application?.role_key);

  if (loading) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={['#1A1A28', '#12121A']} style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ArrowLeft size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Application Thread</Text>
        </LinearGradient>
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </View>
    );
  }

  if (!application) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={['#1A1A28', '#12121A']} style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ArrowLeft size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Application Thread</Text>
        </LinearGradient>
        <View style={styles.centerState}>
          <Text style={styles.emptyText}>Thread not found.</Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <LinearGradient colors={['#1A1A28', '#12121A']} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerMeta}>
          <Text style={styles.headerTitle}>DAWEN Crew Application</Text>
          {role && (
            <Text style={[styles.headerSub, { color: role.badge_color }]}>
              {role.role_name}
            </Text>
          )}
        </View>
      </LinearGradient>

      {/* Application status banner */}
      <View style={styles.statusBanner}>
        <View style={styles.statusBannerLeft}>
          <Shield size={14} color={colors.textMuted} strokeWidth={2} />
          <Text style={styles.statusBannerLabel}>Application Status</Text>
        </View>
        <StatusBadge status={application.status as CrewAppStatus} />
        <TouchableOpacity
          style={styles.viewAppBtn}
          onPress={() => router.push('/crew' as any)}
          activeOpacity={0.8}
        >
          <Text style={styles.viewAppBtnText}>View My App</Text>
          <ChevronRight size={12} color={colors.primary} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      {/* user_visible_message from admin (legacy, shown if no messages yet) */}
      {messages.length === 0 && application.user_visible_message && (
        <View style={styles.legacyMsgCard}>
          <FileText size={14} color={colors.primary} strokeWidth={2} />
          <View style={{ flex: 1 }}>
            <Text style={styles.legacyMsgLabel}>Message from DAWEN Crew</Text>
            <Text style={styles.legacyMsgText}>{application.user_visible_message}</Text>
          </View>
        </View>
      )}

      {/* Messages list */}
      <ScrollView
        ref={scrollRef}
        style={styles.messagesScroll}
        contentContainerStyle={styles.messagesContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
        {messages.length === 0 ? (
          <View style={styles.emptyMessages}>
            <Text style={styles.emptyText}>No messages yet.</Text>
            <Text style={styles.emptySubText}>The DAWEN team will reach out here with updates about your application.</Text>
          </View>
        ) : (
          messages.map(msg => {
            const isMe = msg.sender_id === myProfileId;
            const sender = msg.sender;
            const senderName = sender?.display_name || sender?.username || (msg.sender_role === 'admin' ? 'DAWEN Crew' : 'You');
            return (
              <View key={msg.id} style={[styles.messageRow, isMe && styles.messageRowRight]}>
                {!isMe && (
                  <View style={styles.senderAvatar}>
                    {sender?.avatar_url ? (
                      <Image source={{ uri: sender.avatar_url }} style={styles.avatarImg} />
                    ) : (
                      <View style={styles.avatarFallback}>
                        <Shield size={14} color={colors.primary} strokeWidth={2} />
                      </View>
                    )}
                  </View>
                )}
                <View style={[styles.messageBubble, isMe ? styles.messageBubbleMe : styles.messageBubbleAdmin]}>
                  {!isMe && (
                    <Text style={styles.senderName}>{senderName}</Text>
                  )}
                  <Text style={styles.messageText}>{msg.message}</Text>
                  <Text style={styles.messageTime}>{timeAgo(msg.created_at)}</Text>
                </View>
              </View>
            );
          })
        )}
        <View style={{ height: 8 }} />
      </ScrollView>

      {/* Reply box */}
      <View style={styles.replyBox}>
        {sendError ? (
          <Text style={styles.sendErrorText}>{sendError}</Text>
        ) : null}
        <View style={styles.replyRow}>
          <TextInput
            style={styles.replyInput}
            value={replyText}
            onChangeText={setReplyText}
            placeholder="Reply to DAWEN Crew..."
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={1000}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!replyText.trim() || sending) && styles.sendBtnDisabled]}
            onPress={sendReply}
            disabled={!replyText.trim() || sending}
            activeOpacity={0.8}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Send size={16} color="#fff" strokeWidth={2} />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingBottom: 14, paddingHorizontal: 16,
  },
  backBtn: { padding: 4 },
  headerMeta: { flex: 1 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  headerSub: { fontSize: 12, fontWeight: '600', marginTop: 1 },

  statusBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.surface,
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
    flexWrap: 'wrap',
  },
  statusBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 },
  statusBannerLabel: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 1 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '700' },
  viewAppBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: 'rgba(139,92,246,0.12)', borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)' },
  viewAppBtnText: { fontSize: 11, fontWeight: '700', color: colors.primary },

  legacyMsgCard: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    margin: 14, padding: 12, borderRadius: 12,
    backgroundColor: 'rgba(139,92,246,0.08)',
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.2)',
  },
  legacyMsgLabel: { fontSize: 11, fontWeight: '700', color: colors.primary, marginBottom: 3 },
  legacyMsgText: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },

  messagesScroll: { flex: 1 },
  messagesContent: { paddingHorizontal: 14, paddingTop: 12 },

  emptyMessages: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  emptyText: { fontSize: 14, color: colors.textMuted, fontWeight: '600', textAlign: 'center' },
  emptySubText: { fontSize: 12, color: colors.textMuted, textAlign: 'center', marginTop: 6, lineHeight: 18, maxWidth: 260 },

  messageRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 12 },
  messageRowRight: { flexDirection: 'row-reverse' },

  senderAvatar: { width: 30, height: 30, flexShrink: 0 },
  avatarImg: { width: 30, height: 30, borderRadius: 15 },
  avatarFallback: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(139,92,246,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },

  messageBubble: {
    maxWidth: '78%', borderRadius: 14, padding: 10,
    gap: 4,
  },
  messageBubbleAdmin: {
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
    borderBottomLeftRadius: 4,
  },
  messageBubbleMe: {
    backgroundColor: 'rgba(139,92,246,0.18)',
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)',
    borderBottomRightRadius: 4,
  },
  senderName: { fontSize: 11, fontWeight: '700', color: colors.primary, marginBottom: 2 },
  messageText: { fontSize: 14, color: colors.textPrimary, lineHeight: 20 },
  messageTime: { fontSize: 10, color: colors.textMuted, alignSelf: 'flex-end' },

  replyBox: {
    backgroundColor: colors.surface,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)',
    paddingHorizontal: 14, paddingVertical: 10,
    paddingBottom: Platform.OS === 'ios' ? 28 : 10,
  },
  sendErrorText: { fontSize: 12, color: colors.error, marginBottom: 6 },
  replyRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  replyInput: {
    flex: 1, backgroundColor: colors.surfaceElevated,
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
    color: colors.textPrimary, fontSize: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    maxHeight: 100, minHeight: 42,
  },
  sendBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: colors.primary,
    justifyContent: 'center', alignItems: 'center',
    flexShrink: 0,
  },
  sendBtnDisabled: { backgroundColor: 'rgba(139,92,246,0.3)' },

  centerState: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
