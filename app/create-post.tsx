import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Image,
  Switch,
  SafeAreaView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { X, Check, ChevronDown, Globe, Image as ImageIcon, Video, ChartBar as BarChart2, Coins, MapPin, Lock, MessageCircle, AtSign, User } from 'lucide-react-native';
import { colors, spacing, borderRadius, fontSize } from '@/constants/theme';
import { useProfile } from '@/contexts/ProfileContext';
import { SocialService } from '@/services/socialService';

const CHART_POINTS = [30, 45, 35, 50, 40, 60, 52, 68, 58, 75, 65, 80, 70, 85];

const QUICK_ACTIONS = [
  { icon: ImageIcon, label: 'Image', color: '#8B5CF6' },
  { icon: Video, label: 'Video', color: '#ef4444' },
  { icon: BarChart2, label: 'Poll', color: '#f59e0b' },
  { icon: Coins, label: 'Token', color: '#10b981' },
  { icon: () => (
    <View style={qaGifBox}>
      <Text style={qaGifText}>GIF</Text>
    </View>
  ), label: 'GIF', color: '#10b981' },
  { icon: MapPin, label: 'Location', color: '#06b6d4' },
];
const qaGifBox: any = {
  width: 28, height: 28, borderRadius: 6, borderWidth: 2, borderColor: '#10b981',
  justifyContent: 'center', alignItems: 'center',
};
const qaGifText: any = {
  fontSize: 10, fontWeight: '900', color: '#10b981',
};

export default function CreatePostScreen() {
  const router = useRouter();
  const { profile } = useProfile();
  const [content, setContent] = useState('');
  const [posting, setPosting] = useState(false);
  const [allowQuotes, setAllowQuotes] = useState(true);
  const [mentionedReply, setMentionedReply] = useState(true);
  const [timeframe, setTimeframe] = useState('1D');

  const TIMEFRAMES = ['1D', '1W', '1M', '3M', '1Y', 'ALL'];

  const handlePost = async () => {
    if (!profile || !content.trim() || posting) return;
    setPosting(true);
    try {
      await SocialService.createPost(profile.id, content.trim());
      router.back();
    } catch (e) {
      console.error('[CreatePost] error:', e);
    } finally {
      setPosting(false);
    }
  };

  const displayName = profile?.username || profile?.wallet_address?.slice(0, 8) || 'Anonymous';
  const handleText = `@${(profile?.username || 'user').toLowerCase()}`;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn} activeOpacity={0.7}>
            <X size={22} color={colors.textPrimary} strokeWidth={2.5} />
          </TouchableOpacity>
          <Text style={styles.topTitle}>Create Post</Text>
          <TouchableOpacity
            style={[styles.postBtn, content.trim() && !posting ? styles.postBtnActive : styles.postBtnDisabled]}
            activeOpacity={0.85}
            onPress={handlePost}
            disabled={!content.trim() || posting}
          >
            {posting ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Text style={styles.postBtnText}>Post</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* User info */}
          <View style={styles.userRow}>
            <View style={styles.avatar}>
              {profile?.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={styles.avatarImg} />
              ) : (
                <User size={24} color={colors.textMuted} />
              )}
            </View>
            <View style={styles.userInfo}>
              <View style={styles.nameRow}>
                <Text style={styles.username}>{displayName}</Text>
                {profile?.is_verified && (
                  <View style={styles.verifiedBadge}>
                    <Check size={9} color={colors.white} strokeWidth={3} />
                  </View>
                )}
              </View>
              <Text style={styles.handle}>{handleText}</Text>
              <TouchableOpacity style={styles.visibilityBtn} activeOpacity={0.8}>
                <Globe size={13} color={colors.textSecondary} strokeWidth={2} />
                <Text style={styles.visibilityText}>Public</Text>
                <ChevronDown size={13} color={colors.textSecondary} strokeWidth={2} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Text input */}
          <TextInput
            style={styles.contentInput}
            placeholder={'What\'s happening in the market?\nShare your thoughts with the DAWEN community.'}
            placeholderTextColor={colors.textMuted}
            value={content}
            onChangeText={setContent}
            multiline
            autoFocus={false}
          />

          {/* Media row: Token card + Add media */}
          <View style={styles.mediaRow}>
            {/* Token preview card */}
            <View style={styles.tokenCard}>
              <View style={styles.tokenCardHeader}>
                <Text style={styles.tokenCardSymbol}>$DAWEN</Text>
                <TouchableOpacity style={styles.tokenCardRemove}>
                  <X size={13} color={colors.textMuted} strokeWidth={2.5} />
                </TouchableOpacity>
              </View>
              <Text style={styles.tokenCardPrice}>$0.04269</Text>
              <Text style={styles.tokenCardChange}>+23.45% ↗</Text>

              {/* Chart area */}
              <View style={styles.chartArea}>
                <View style={styles.chartLine} />
                <View style={[styles.chartLine, { top: '40%', opacity: 0.6 }]} />
                <View style={[styles.chartLine, { top: '70%', opacity: 0.3 }]} />
                {/* Simulated chart curve using Views */}
                <View style={styles.chartCurve}>
                  {CHART_POINTS.map((v, i) => {
                    const min = 30; const max = 85;
                    const h = ((v - min) / (max - min)) * 36;
                    return (
                      <View
                        key={i}
                        style={[styles.chartBar, {
                          height: h,
                          left: (i / (CHART_POINTS.length - 1)) * 120,
                        }]}
                      />
                    );
                  })}
                </View>
              </View>

              {/* Timeframes */}
              <View style={styles.timeframeRow}>
                {TIMEFRAMES.map(tf => (
                  <TouchableOpacity
                    key={tf}
                    style={[styles.tfBtn, timeframe === tf && styles.tfBtnActive]}
                    onPress={() => setTimeframe(tf)}
                  >
                    <Text style={[styles.tfText, timeframe === tf && styles.tfTextActive]}>{tf}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Add media box */}
            <TouchableOpacity style={styles.addMediaBox} activeOpacity={0.8}>
              <Text style={styles.addMediaPlus}>+</Text>
              <Text style={styles.addMediaLabel}>Add media</Text>
            </TouchableOpacity>
          </View>

          {/* Quick actions */}
          <View style={styles.quickActionsRow}>
            {QUICK_ACTIONS.map((action, idx) => {
              const IconComp = action.icon;
              return (
                <TouchableOpacity key={idx} style={styles.qaItem} activeOpacity={0.8}>
                  <View style={[styles.qaIconWrap, { backgroundColor: action.color + '22' }]}>
                    <IconComp size={20} color={action.color} strokeWidth={2} />
                  </View>
                  <Text style={styles.qaLabel}>{action.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Post settings */}
          <Text style={styles.settingsHeader}>POST SETTINGS</Text>
          <View style={styles.settingsCard}>
            {/* Who can reply */}
            <TouchableOpacity style={[styles.settingRow, styles.settingRowBorder]} activeOpacity={0.8}>
              <View style={styles.settingLeft}>
                <View style={[styles.settingIcon, { backgroundColor: 'rgba(139,92,246,0.15)' }]}>
                  <Lock size={16} color={colors.primary} strokeWidth={2} />
                </View>
                <Text style={styles.settingLabel}>Who can reply?</Text>
              </View>
              <View style={styles.settingRight}>
                <Text style={styles.settingValue}>Everyone</Text>
                <ChevronRight size={16} color={colors.textMuted} strokeWidth={2} />
              </View>
            </TouchableOpacity>

            {/* Allow quotes */}
            <View style={[styles.settingRow, styles.settingRowBorder]}>
              <View style={styles.settingLeft}>
                <View style={[styles.settingIcon, { backgroundColor: 'rgba(139,92,246,0.15)' }]}>
                  <MessageCircle size={16} color={colors.primary} strokeWidth={2} />
                </View>
                <Text style={styles.settingLabel}>Allow quotes</Text>
              </View>
              <Switch
                value={allowQuotes}
                onValueChange={setAllowQuotes}
                trackColor={{ false: '#2A2A3A', true: colors.primary }}
                thumbColor={colors.white}
              />
            </View>

            {/* Mentioned people */}
            <View style={[styles.settingRow, styles.settingRowBorder]}>
              <View style={styles.settingLeft}>
                <View style={[styles.settingIcon, { backgroundColor: 'rgba(139,92,246,0.15)' }]}>
                  <AtSign size={16} color={colors.primary} strokeWidth={2} />
                </View>
                <Text style={styles.settingLabel}>Mentioned people can reply</Text>
              </View>
              <Switch
                value={mentionedReply}
                onValueChange={setMentionedReply}
                trackColor={{ false: '#2A2A3A', true: colors.primary }}
                thumbColor={colors.white}
              />
            </View>

            {/* Language */}
            <TouchableOpacity style={styles.settingRow} activeOpacity={0.8}>
              <View style={styles.settingLeft}>
                <View style={[styles.settingIcon, { backgroundColor: 'rgba(139,92,246,0.15)' }]}>
                  <Globe size={16} color={colors.primary} strokeWidth={2} />
                </View>
                <Text style={styles.settingLabel}>Language</Text>
              </View>
              <View style={styles.settingRight}>
                <Text style={styles.settingValue}>English</Text>
                <ChevronRight size={16} color={colors.textMuted} strokeWidth={2} />
              </View>
            </TouchableOpacity>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0D0D15',
  },
  container: {
    flex: 1,
    backgroundColor: '#0D0D15',
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: Platform.OS === 'android' ? 44 : spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(139,92,246,0.1)',
  },
  closeBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  topTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  postBtn: {
    paddingHorizontal: 22,
    paddingVertical: 9,
    borderRadius: borderRadius.full,
  },
  postBtnActive: {
    backgroundColor: colors.primary,
  },
  postBtnDisabled: {
    backgroundColor: colors.primary,
    opacity: 0.8,
  },
  postBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.white,
  },

  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
  },

  // User
  userRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#1E1E2E',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarImg: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  userInfo: {
    gap: 4,
    justifyContent: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  username: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  verifiedBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  handle: {
    fontSize: 13,
    color: colors.textMuted,
  },
  visibilityBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#1E1E2E',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    alignSelf: 'flex-start',
    marginTop: 2,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.2)',
  },
  visibilityText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },

  // Content input
  contentInput: {
    fontSize: 18,
    color: colors.textMuted,
    lineHeight: 26,
    minHeight: 80,
    marginBottom: spacing.xl,
  },

  // Media row
  mediaRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  tokenCard: {
    flex: 1,
    backgroundColor: '#12121E',
    borderRadius: 16,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.2)',
    minHeight: 170,
    overflow: 'hidden',
  },
  tokenCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  tokenCardSymbol: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  tokenCardRemove: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#2A2A3A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tokenCardPrice: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  tokenCardChange: {
    fontSize: 12,
    fontWeight: '700',
    color: '#10b981',
    marginBottom: spacing.sm,
  },
  chartArea: {
    flex: 1,
    minHeight: 55,
    position: 'relative',
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  chartLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(139,92,246,0.12)',
    top: '25%',
  },
  chartCurve: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 40,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  chartBar: {
    position: 'absolute',
    width: 2,
    bottom: 0,
    backgroundColor: colors.primary,
    borderRadius: 1,
    opacity: 0.9,
  },
  timeframeRow: {
    flexDirection: 'row',
    gap: 2,
  },
  tfBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
    borderRadius: 6,
  },
  tfBtnActive: {
    backgroundColor: colors.primary,
  },
  tfText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
  },
  tfTextActive: {
    color: colors.white,
  },
  addMediaBox: {
    width: 110,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(139,92,246,0.3)',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    minHeight: 170,
    backgroundColor: 'rgba(139,92,246,0.04)',
  },
  addMediaPlus: {
    fontSize: 28,
    fontWeight: '300',
    color: colors.primary,
  },
  addMediaLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },

  // Quick actions
  quickActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#12121E',
    borderRadius: 16,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.1)',
  },
  qaItem: {
    alignItems: 'center',
    gap: 6,
  },
  qaIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qaLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
  },

  // Settings
  settingsHeader: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textMuted,
    letterSpacing: 1,
    marginBottom: spacing.md,
  },
  settingsCard: {
    backgroundColor: '#12121E',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.12)',
    overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: 16,
  },
  settingRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(139,92,246,0.08)',
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  settingIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  settingRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  settingValue: {
    fontSize: 14,
    color: colors.textMuted,
    fontWeight: '500',
  },
});
