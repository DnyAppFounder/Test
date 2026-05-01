import { useState, useCallback } from 'react';
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
  Alert,
  Modal,
  FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  X, Check, ChevronDown, ChevronRight, Globe,
  Image as ImageIcon, Video, ChartBar as BarChart2,
  Coins, MapPin, Lock, MessageCircle, AtSign, User,
  Search,
} from 'lucide-react-native';
import { colors, spacing, borderRadius, fontSize } from '@/constants/theme';
import { useProfile } from '@/contexts/ProfileContext';
import { SocialService } from '@/services/socialService';
import { liveMarketService, LiveToken } from '@/services/liveMarketService';

type WhoCanReply = 'everyone' | 'followers' | 'mentioned';
type Visibility = 'public' | 'followers';

const TIMEFRAMES = ['1D', '1W', '1M', '3M', '1Y', 'ALL'];
const WHO_CAN_REPLY_OPTIONS: { value: WhoCanReply; label: string }[] = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'followers', label: 'Followers only' },
  { value: 'mentioned', label: 'Mentioned people' },
];

const qaGifBox: any = {
  width: 28, height: 28, borderRadius: 6, borderWidth: 2, borderColor: '#10b981',
  justifyContent: 'center', alignItems: 'center',
};
const qaGifText: any = { fontSize: 10, fontWeight: '900', color: '#10b981' };

export default function CreatePostScreen() {
  const router = useRouter();
  const { profile } = useProfile();

  const [content, setContent] = useState('');
  const [posting, setPosting] = useState(false);

  // Media
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [mediaUploading, setMediaUploading] = useState(false);

  // Token attachment
  const [attachedToken, setAttachedToken] = useState<LiveToken | null>(null);
  const [showTokenPicker, setShowTokenPicker] = useState(false);
  const [tokenSearch, setTokenSearch] = useState('');
  const [tokenResults, setTokenResults] = useState<LiveToken[]>([]);
  const [tokenSearching, setTokenSearching] = useState(false);
  const [timeframe, setTimeframe] = useState('1D');

  // Settings
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [whoCanReply, setWhoCanReply] = useState<WhoCanReply>('everyone');
  const [allowQuotes, setAllowQuotes] = useState(true);
  const [mentionedReply, setMentionedReply] = useState(true);
  const [showReplyPicker, setShowReplyPicker] = useState(false);
  const [showVisibilityPicker, setShowVisibilityPicker] = useState(false);

  const displayName = profile?.username || profile?.wallet_address?.slice(0, 8) || 'Anonymous';
  const handleText = `@${(profile?.username || 'user').toLowerCase()}`;

  // ── Image picker ──────────────────────────────────────────────────────────
  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo access to attach images.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsEditing: true,
    });
    if (!result.canceled && result.assets[0]) {
      setMediaUri(result.assets[0].uri);
    }
  };

  const removeMedia = () => setMediaUri(null);

  // ── Token search ──────────────────────────────────────────────────────────
  const searchTokens = useCallback(async (query: string) => {
    setTokenSearch(query);
    if (!query.trim()) { setTokenResults([]); return; }
    setTokenSearching(true);
    try {
      const results = await liveMarketService.searchTokens(query);
      setTokenResults(results.slice(0, 20));
    } catch {
      setTokenResults([]);
    } finally {
      setTokenSearching(false);
    }
  }, []);

  const selectToken = (token: LiveToken) => {
    setAttachedToken(token);
    setShowTokenPicker(false);
    setTokenSearch('');
    setTokenResults([]);
  };

  const removeToken = () => setAttachedToken(null);

  // ── Submit ────────────────────────────────────────────────────────────────
  const handlePost = async () => {
    if (!profile || !content.trim() || posting) return;
    setPosting(true);
    try {
      const effectiveReply = mentionedReply ? 'mentioned' : whoCanReply;

      await SocialService.createPost(profile.id, content.trim(), {
        imageUri: mediaUri || undefined,
        tokenAddress: attachedToken?.address ?? undefined,
        tokenSymbol: attachedToken?.symbol ?? undefined,
        tokenPrice: attachedToken?.price ?? undefined,
        tokenChange24h: attachedToken?.priceChange24h ?? undefined,
        visibility,
        whoCanReply: effectiveReply,
        allowQuotes,
        language: 'en',
      });

      router.back();
    } catch (e) {
      console.error('[CreatePost] error:', e);
      Alert.alert('Error', 'Failed to create post. Please try again.');
    } finally {
      setPosting(false);
    }
  };

  const canPost = content.trim().length > 0 && !posting;

  // ── Token card chart (static SVG-like bar chart) ──────────────────────────
  const renderTokenChart = () => {
    if (!attachedToken) return null;
    const price = attachedToken.price;
    const change = attachedToken.priceChange24h ?? 0;
    const isPositive = change >= 0;
    return (
      <View style={styles.tokenCard}>
        <View style={styles.tokenCardHeader}>
          <View style={styles.tokenCardTitleRow}>
            {attachedToken.image ? (
              <Image source={{ uri: attachedToken.image }} style={styles.tokenLogo} />
            ) : null}
            <Text style={styles.tokenCardSymbol}>${attachedToken.symbol}</Text>
          </View>
          <TouchableOpacity style={styles.tokenCardRemove} onPress={removeToken}>
            <X size={13} color={colors.textMuted} strokeWidth={2.5} />
          </TouchableOpacity>
        </View>
        <Text style={styles.tokenCardPrice}>
          {liveMarketService.formatPrice(price)}
        </Text>
        <Text style={[styles.tokenCardChange, { color: isPositive ? '#10b981' : '#ef4444' }]}>
          {isPositive ? '+' : ''}{change.toFixed(2)}% {isPositive ? '↗' : '↘'}
        </Text>
        {/* Simple bar chart visual */}
        <View style={styles.chartArea}>
          <View style={styles.chartLine} />
          <View style={[styles.chartLine, { top: '40%', opacity: 0.6 }]} />
          <View style={[styles.chartLine, { top: '70%', opacity: 0.3 }]} />
          <View style={styles.chartCurve}>
            {[30,45,35,55,42,62,54,70,60,77,67,82,72,87].map((v, i, arr) => {
              const min = 30; const max = 87;
              const h = ((v - min) / (max - min)) * 36;
              return (
                <View key={i} style={[styles.chartBar, {
                  height: h,
                  left: (i / (arr.length - 1)) * 120,
                  backgroundColor: isPositive ? '#10b981' : '#ef4444',
                }]} />
              );
            })}
          </View>
        </View>
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
    );
  };

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
            style={[styles.postBtn, canPost ? styles.postBtnActive : styles.postBtnDisabled]}
            activeOpacity={0.85}
            onPress={handlePost}
            disabled={!canPost}
          >
            {posting ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Text style={styles.postBtnText}>Post</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* User info */}
          <View style={styles.userRow}>
            <View style={styles.avatar}>
              {profile?.avatar_url ? (
                <Image
                  source={{ uri: profile.avatar_url }}
                  style={styles.avatarImg}
                  defaultSource={{ uri: 'https://images.pexels.com/photos/220453/pexels-photo-220453.jpeg?auto=compress&cs=tinysrgb&w=100' }}
                />
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
              <TouchableOpacity
                style={styles.visibilityBtn}
                activeOpacity={0.8}
                onPress={() => setShowVisibilityPicker(true)}
              >
                <Globe size={13} color={colors.textSecondary} strokeWidth={2} />
                <Text style={styles.visibilityText}>
                  {visibility === 'public' ? 'Public' : 'Followers only'}
                </Text>
                <ChevronDown size={13} color={colors.textSecondary} strokeWidth={2} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Text input */}
          <TextInput
            style={styles.contentInput}
            placeholder={"What's happening in the market?\nShare your thoughts with the DAWEN community."}
            placeholderTextColor={colors.textMuted}
            value={content}
            onChangeText={setContent}
            multiline
            autoFocus={false}
          />

          {/* Attached media */}
          {mediaUri && (
            <View style={styles.mediaPreviewWrap}>
              <Image
                source={{ uri: mediaUri }}
                style={styles.mediaPreview}
                resizeMode="cover"
              />
              <TouchableOpacity style={styles.removeMediaBtn} onPress={removeMedia}>
                <X size={16} color={colors.white} strokeWidth={2.5} />
              </TouchableOpacity>
            </View>
          )}

          {/* Token card or picker trigger */}
          <View style={styles.mediaRow}>
            {attachedToken ? (
              renderTokenChart()
            ) : (
              <TouchableOpacity
                style={styles.tokenPickerTrigger}
                activeOpacity={0.8}
                onPress={() => setShowTokenPicker(true)}
              >
                <Coins size={22} color={colors.primary} strokeWidth={2} />
                <Text style={styles.tokenPickerText}>Attach Token</Text>
              </TouchableOpacity>
            )}

            {/* Add media box */}
            <TouchableOpacity style={styles.addMediaBox} activeOpacity={0.8} onPress={pickImage}>
              {mediaUri ? (
                <Check size={22} color={colors.primary} strokeWidth={2.5} />
              ) : (
                <>
                  <Text style={styles.addMediaPlus}>+</Text>
                  <Text style={styles.addMediaLabel}>Add media</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Quick actions */}
          <View style={styles.quickActionsRow}>
            <TouchableOpacity style={styles.qaItem} activeOpacity={0.8} onPress={pickImage}>
              <View style={[styles.qaIconWrap, { backgroundColor: '#8B5CF622' }]}>
                <ImageIcon size={20} color="#8B5CF6" strokeWidth={2} />
              </View>
              <Text style={styles.qaLabel}>Image</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.qaItem} activeOpacity={0.8} onPress={() => Alert.alert('Video', 'Not configured yet')}>
              <View style={[styles.qaIconWrap, { backgroundColor: '#ef444422' }]}>
                <Video size={20} color="#ef4444" strokeWidth={2} />
              </View>
              <Text style={styles.qaLabel}>Video</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.qaItem} activeOpacity={0.8} onPress={() => Alert.alert('Poll', 'Not configured yet')}>
              <View style={[styles.qaIconWrap, { backgroundColor: '#f59e0b22' }]}>
                <BarChart2 size={20} color="#f59e0b" strokeWidth={2} />
              </View>
              <Text style={styles.qaLabel}>Poll</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.qaItem} activeOpacity={0.8} onPress={() => setShowTokenPicker(true)}>
              <View style={[styles.qaIconWrap, { backgroundColor: '#10b98122' }]}>
                <Coins size={20} color="#10b981" strokeWidth={2} />
              </View>
              <Text style={styles.qaLabel}>Token</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.qaItem} activeOpacity={0.8} onPress={() => Alert.alert('GIF', 'Not configured yet')}>
              <View style={[styles.qaIconWrap, { backgroundColor: '#10b98122' }]}>
                <View style={qaGifBox}><Text style={qaGifText}>GIF</Text></View>
              </View>
              <Text style={styles.qaLabel}>GIF</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.qaItem} activeOpacity={0.8} onPress={() => Alert.alert('Location', 'Not configured yet')}>
              <View style={[styles.qaIconWrap, { backgroundColor: '#06b6d422' }]}>
                <MapPin size={20} color="#06b6d4" strokeWidth={2} />
              </View>
              <Text style={styles.qaLabel}>Location</Text>
            </TouchableOpacity>
          </View>

          {/* Post settings */}
          <Text style={styles.settingsHeader}>POST SETTINGS</Text>
          <View style={styles.settingsCard}>
            {/* Who can reply */}
            <TouchableOpacity
              style={[styles.settingRow, styles.settingRowBorder]}
              activeOpacity={0.8}
              onPress={() => setShowReplyPicker(true)}
            >
              <View style={styles.settingLeft}>
                <View style={[styles.settingIcon, { backgroundColor: 'rgba(139,92,246,0.15)' }]}>
                  <Lock size={16} color={colors.primary} strokeWidth={2} />
                </View>
                <Text style={styles.settingLabel}>Who can reply?</Text>
              </View>
              <View style={styles.settingRight}>
                <Text style={styles.settingValue}>
                  {WHO_CAN_REPLY_OPTIONS.find(o => o.value === whoCanReply)?.label ?? 'Everyone'}
                </Text>
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

            {/* Mentioned people can reply */}
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

      {/* Token picker modal */}
      <Modal
        visible={showTokenPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowTokenPicker(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Attach Token</Text>
            <TouchableOpacity onPress={() => setShowTokenPicker(false)}>
              <X size={22} color={colors.textPrimary} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>
          <View style={styles.searchBox}>
            <Search size={18} color={colors.textMuted} strokeWidth={2} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search tokens..."
              placeholderTextColor={colors.textMuted}
              value={tokenSearch}
              onChangeText={searchTokens}
              autoFocus
            />
            {tokenSearching && <ActivityIndicator size="small" color={colors.primary} />}
          </View>
          <FlatList
            data={tokenResults}
            keyExtractor={(item) => item.address}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.tokenRow} onPress={() => selectToken(item)} activeOpacity={0.8}>
                {item.image ? (
                  <Image source={{ uri: item.image }} style={styles.tokenRowLogo} />
                ) : (
                  <View style={styles.tokenRowLogoFallback}>
                    <Text style={styles.tokenRowLogoText}>{item.symbol[0]}</Text>
                  </View>
                )}
                <View style={styles.tokenRowInfo}>
                  <Text style={styles.tokenRowSymbol}>{item.symbol}</Text>
                  <Text style={styles.tokenRowName} numberOfLines={1}>{item.name}</Text>
                </View>
                <View style={styles.tokenRowRight}>
                  <Text style={styles.tokenRowPrice}>{liveMarketService.formatPrice(item.price)}</Text>
                  <Text style={[styles.tokenRowChange, {
                    color: (item.priceChange24h ?? 0) >= 0 ? '#10b981' : '#ef4444',
                  }]}>
                    {(item.priceChange24h ?? 0) >= 0 ? '+' : ''}{(item.priceChange24h ?? 0).toFixed(2)}%
                  </Text>
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              tokenSearch.length > 0 && !tokenSearching ? (
                <Text style={styles.emptySearch}>No tokens found</Text>
              ) : null
            }
          />
        </View>
      </Modal>

      {/* Who can reply picker */}
      <Modal
        visible={showReplyPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowReplyPicker(false)}
      >
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setShowReplyPicker(false)}>
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>Who can reply?</Text>
            {WHO_CAN_REPLY_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={styles.pickerOption}
                onPress={() => { setWhoCanReply(opt.value); setShowReplyPicker(false); }}
              >
                <Text style={[styles.pickerOptionText, whoCanReply === opt.value && styles.pickerOptionActive]}>
                  {opt.label}
                </Text>
                {whoCanReply === opt.value && <Check size={18} color={colors.primary} strokeWidth={2.5} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Visibility picker */}
      <Modal
        visible={showVisibilityPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowVisibilityPicker(false)}
      >
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setShowVisibilityPicker(false)}>
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>Post visibility</Text>
            {([{ value: 'public', label: 'Public' }, { value: 'followers', label: 'Followers only' }] as const).map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={styles.pickerOption}
                onPress={() => { setVisibility(opt.value); setShowVisibilityPicker(false); }}
              >
                <Text style={[styles.pickerOptionText, visibility === opt.value && styles.pickerOptionActive]}>
                  {opt.label}
                </Text>
                {visibility === opt.value && <Check size={18} color={colors.primary} strokeWidth={2.5} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0D0D15' },
  container: { flex: 1, backgroundColor: '#0D0D15' },

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
  closeBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'flex-start' },
  topTitle: { fontSize: 17, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.2 },
  postBtn: { paddingHorizontal: 22, paddingVertical: 9, borderRadius: borderRadius.full },
  postBtnActive: { backgroundColor: colors.primary },
  postBtnDisabled: { backgroundColor: colors.primary, opacity: 0.45 },
  postBtnText: { fontSize: 15, fontWeight: '700', color: colors.white },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl },

  userRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  avatar: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: '#1E1E2E', justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
  },
  avatarImg: { width: 52, height: 52, borderRadius: 26 },
  userInfo: { gap: 4, justifyContent: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  username: { fontSize: 16, fontWeight: '800', color: colors.textPrimary },
  verifiedBadge: {
    width: 18, height: 18, borderRadius: 9, backgroundColor: colors.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  handle: { fontSize: 13, color: colors.textMuted },
  visibilityBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#1E1E2E', paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: borderRadius.full, alignSelf: 'flex-start', marginTop: 2,
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.2)',
  },
  visibilityText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },

  contentInput: {
    fontSize: 18, color: colors.textPrimary, lineHeight: 26, minHeight: 80, marginBottom: spacing.xl,
  },

  mediaPreviewWrap: { marginBottom: spacing.lg, borderRadius: 16, overflow: 'hidden', position: 'relative' },
  mediaPreview: { width: '100%', height: 200, borderRadius: 16 },
  removeMediaBtn: {
    position: 'absolute', top: 10, right: 10,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', alignItems: 'center',
  },

  mediaRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.xl },

  tokenPickerTrigger: {
    flex: 1, minHeight: 80, borderRadius: 16, borderWidth: 1.5,
    borderColor: 'rgba(139,92,246,0.3)', borderStyle: 'dashed',
    backgroundColor: 'rgba(139,92,246,0.04)',
    justifyContent: 'center', alignItems: 'center', gap: 8,
  },
  tokenPickerText: { fontSize: 14, fontWeight: '700', color: colors.primary },

  tokenCard: {
    flex: 1, backgroundColor: '#12121E', borderRadius: 16, padding: spacing.md,
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.2)', minHeight: 170, overflow: 'hidden',
  },
  tokenCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  tokenCardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tokenLogo: { width: 20, height: 20, borderRadius: 10 },
  tokenCardSymbol: { fontSize: 13, fontWeight: '800', color: colors.textMuted, letterSpacing: 0.5 },
  tokenCardRemove: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: '#2A2A3A',
    justifyContent: 'center', alignItems: 'center',
  },
  tokenCardPrice: { fontSize: 20, fontWeight: '900', color: colors.textPrimary, marginBottom: 2 },
  tokenCardChange: { fontSize: 12, fontWeight: '700', marginBottom: spacing.sm },
  chartArea: { flex: 1, minHeight: 55, position: 'relative', marginBottom: spacing.sm, overflow: 'hidden' },
  chartLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: 'rgba(139,92,246,0.12)', top: '25%' },
  chartCurve: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 40, flexDirection: 'row', alignItems: 'flex-end' },
  chartBar: { position: 'absolute', width: 2, bottom: 0, borderRadius: 1, opacity: 0.9 },
  timeframeRow: { flexDirection: 'row', gap: 2 },
  tfBtn: { flex: 1, alignItems: 'center', paddingVertical: 4, borderRadius: 6 },
  tfBtnActive: { backgroundColor: colors.primary },
  tfText: { fontSize: 10, fontWeight: '700', color: colors.textMuted },
  tfTextActive: { color: colors.white },

  addMediaBox: {
    width: 110, borderRadius: 16, borderWidth: 1.5,
    borderColor: 'rgba(139,92,246,0.3)', borderStyle: 'dashed',
    justifyContent: 'center', alignItems: 'center', gap: 6,
    minHeight: 170, backgroundColor: 'rgba(139,92,246,0.04)',
  },
  addMediaPlus: { fontSize: 28, fontWeight: '300', color: colors.primary },
  addMediaLabel: { fontSize: 13, fontWeight: '600', color: colors.primary },

  quickActionsRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    backgroundColor: '#12121E', borderRadius: 16, padding: spacing.lg,
    marginBottom: spacing.xl, borderWidth: 1, borderColor: 'rgba(139,92,246,0.1)',
  },
  qaItem: { alignItems: 'center', gap: 6 },
  qaIconWrap: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  qaLabel: { fontSize: 11, fontWeight: '600', color: colors.textMuted },

  settingsHeader: { fontSize: 11, fontWeight: '800', color: colors.textMuted, letterSpacing: 1, marginBottom: spacing.md },
  settingsCard: {
    backgroundColor: '#12121E', borderRadius: 16,
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.12)', overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: 16,
  },
  settingRowBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(139,92,246,0.08)' },
  settingLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
  settingIcon: { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  settingLabel: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  settingRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  settingValue: { fontSize: 14, color: colors.textMuted, fontWeight: '500' },

  // Modal
  modalContainer: { flex: 1, backgroundColor: '#0D0D15', paddingTop: spacing.xl },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.xl, paddingBottom: spacing.lg,
    borderBottomWidth: 1, borderBottomColor: 'rgba(139,92,246,0.1)',
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: colors.textPrimary },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: '#1A1A2E', borderRadius: 14, paddingHorizontal: spacing.lg,
    paddingVertical: 12, margin: spacing.xl,
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.15)',
  },
  searchInput: { flex: 1, fontSize: 16, color: colors.textPrimary },
  emptySearch: { textAlign: 'center', color: colors.textMuted, marginTop: 40, fontSize: 15 },

  tokenRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.xl, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: 'rgba(139,92,246,0.06)',
  },
  tokenRowLogo: { width: 40, height: 40, borderRadius: 20 },
  tokenRowLogoFallback: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#1E1E2E',
    justifyContent: 'center', alignItems: 'center',
  },
  tokenRowLogoText: { fontSize: 16, fontWeight: '800', color: colors.textPrimary },
  tokenRowInfo: { flex: 1 },
  tokenRowSymbol: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  tokenRowName: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  tokenRowRight: { alignItems: 'flex-end' },
  tokenRowPrice: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  tokenRowChange: { fontSize: 12, fontWeight: '600', marginTop: 2 },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', paddingHorizontal: spacing.xl },
  pickerCard: { backgroundColor: '#1A1A2E', borderRadius: 20, padding: spacing.xl, borderWidth: 1, borderColor: 'rgba(139,92,246,0.2)' },
  pickerTitle: { fontSize: 17, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.lg },
  pickerOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(139,92,246,0.08)',
  },
  pickerOptionText: { fontSize: 16, fontWeight: '600', color: colors.textSecondary },
  pickerOptionActive: { color: colors.primary },
});
