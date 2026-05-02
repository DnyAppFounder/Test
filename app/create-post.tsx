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
  Search, Zap, Plus, Trash2,
} from 'lucide-react-native';
import { colors, spacing, borderRadius, fontSize } from '@/constants/theme';
import { useProfile } from '@/contexts/ProfileContext';
import { SocialService, PROMOTE_TIERS } from '@/services/socialService';
import { liveMarketService, LiveToken } from '@/services/liveMarketService';

type WhoCanReply = 'everyone' | 'followers' | 'mentioned';
type Visibility = 'public' | 'followers';
type MediaType = 'image' | 'video';

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

interface PollOption {
  id: string;
  text: string;
}

export default function CreatePostScreen() {
  const router = useRouter();
  const { profile } = useProfile();

  const [content, setContent] = useState('');
  const [posting, setPosting] = useState(false);

  // Media
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<MediaType>('image');

  // Token attachment
  const [attachedToken, setAttachedToken] = useState<LiveToken | null>(null);
  const [showTokenPicker, setShowTokenPicker] = useState(false);
  const [tokenSearch, setTokenSearch] = useState('');
  const [tokenResults, setTokenResults] = useState<LiveToken[]>([]);
  const [tokenSearching, setTokenSearching] = useState(false);
  const [timeframe, setTimeframe] = useState('1D');

  // Poll
  const [showPollModal, setShowPollModal] = useState(false);
  const [pollOptions, setPollOptions] = useState<PollOption[]>([
    { id: '1', text: '' },
    { id: '2', text: '' },
  ]);
  const [pollDuration, setPollDuration] = useState('24h');
  const [activePoll, setActivePoll] = useState(false);

  // Promote
  const [showPromoteModal, setShowPromoteModal] = useState(false);
  const [selectedTierKey, setSelectedTierKey] = useState<string | null>(null);
  const [promoteStep, setPromoteStep] = useState<'select' | 'confirm'>('select');
  const [promoteTierKey, setPromoteTierKey] = useState<string | null>(null);

  // Settings
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [whoCanReply, setWhoCanReply] = useState<WhoCanReply>('everyone');
  const [allowQuotes, setAllowQuotes] = useState(true);
  const [mentionedReply, setMentionedReply] = useState(true);
  const [showReplyPicker, setShowReplyPicker] = useState(false);
  const [showVisibilityPicker, setShowVisibilityPicker] = useState(false);

  const displayName = profile?.username || profile?.wallet_address?.slice(0, 8) || 'Anonymous';
  const handleText = `@${(profile?.username || 'user').toLowerCase()}`;

  // ── Media picker ──────────────────────────────────────────────────────────
  const pickMedia = async (type: MediaType) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow media access to attach files.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: type === 'video'
        ? ImagePicker.MediaTypeOptions.Videos
        : ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsEditing: type === 'image',
    });
    if (!result.canceled && result.assets[0]) {
      setMediaUri(result.assets[0].uri);
      setMediaType(type);
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

  // ── Poll helpers ──────────────────────────────────────────────────────────
  const addPollOption = () => {
    if (pollOptions.length >= 4) return;
    setPollOptions(prev => [...prev, { id: Date.now().toString(), text: '' }]);
  };

  const removePollOption = (id: string) => {
    if (pollOptions.length <= 2) return;
    setPollOptions(prev => prev.filter(o => o.id !== id));
  };

  const updatePollOption = (id: string, text: string) => {
    setPollOptions(prev => prev.map(o => o.id === id ? { ...o, text } : o));
  };

  const confirmPoll = () => {
    const filled = pollOptions.filter(o => o.text.trim());
    if (filled.length < 2) {
      Alert.alert('Poll requires at least 2 options');
      return;
    }
    setActivePoll(true);
    setShowPollModal(false);
  };

  const removePoll = () => {
    setActivePoll(false);
    setPollOptions([{ id: '1', text: '' }, { id: '2', text: '' }]);
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handlePost = async () => {
    if (!profile || !content.trim() || posting) return;
    setPosting(true);
    try {
      const pollJson = activePoll
        ? JSON.stringify({ options: pollOptions.filter(o => o.text.trim()), duration: pollDuration })
        : undefined;

      const postData = await SocialService.createPost(profile.id, content.trim(), {
        imageUri: mediaUri || undefined,
        tokenAddress: attachedToken?.address ?? undefined,
        tokenSymbol: attachedToken?.symbol ?? undefined,
        tokenPrice: attachedToken?.price ?? undefined,
        tokenChange24h: attachedToken?.priceChange24h ?? undefined,
        visibility,
        whoCanReply: mentionedReply ? 'mentioned' : whoCanReply,
        allowQuotes,
        language: 'en',
      });

      // If a promote tier was selected, promote the post
      if (postData && promoteTierKey) {
        await SocialService.promotePost(postData.id, promoteTierKey);
      }

      router.back();
    } catch (e) {
      console.error('[CreatePost] error:', e);
      Alert.alert('Error', 'Failed to create post. Please try again.');
    } finally {
      setPosting(false);
    }
  };

  const canPost = content.trim().length > 0 && !posting;

  // ── Token card preview ────────────────────────────────────────────────────
  const renderTokenCard = () => {
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
        <Text style={styles.tokenCardPrice}>{liveMarketService.formatPrice(price)}</Text>
        <Text style={[styles.tokenCardChange, { color: isPositive ? '#10b981' : '#ef4444' }]}>
          {isPositive ? '+' : ''}{change.toFixed(2)}% {isPositive ? '↗' : '↘'}
        </Text>
        <View style={styles.chartArea}>
          <View style={styles.chartLine} />
          <View style={[styles.chartLine, { top: '40%', opacity: 0.6 }]} />
          <View style={[styles.chartLine, { top: '70%', opacity: 0.3 }]} />
          <View style={styles.chartCurve}>
            {[30,45,35,55,42,62,54,70,60,77,67,82,72,87].map((v, i, arr) => {
              const h = ((v - 30) / (87 - 30)) * 36;
              return (
                <View key={i} style={[styles.chartBar, {
                  height: h, left: (i / (arr.length - 1)) * 120,
                  backgroundColor: isPositive ? '#10b981' : '#ef4444',
                }]} />
              );
            })}
          </View>
        </View>
        <View style={styles.timeframeRow}>
          {TIMEFRAMES.map(tf => (
            <TouchableOpacity key={tf} style={[styles.tfBtn, timeframe === tf && styles.tfBtnActive]} onPress={() => setTimeframe(tf)}>
              <Text style={[styles.tfText, timeframe === tf && styles.tfTextActive]}>{tf}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  // ── Poll preview ──────────────────────────────────────────────────────────
  const renderPollPreview = () => {
    if (!activePoll) return null;
    const filled = pollOptions.filter(o => o.text.trim());
    return (
      <View style={styles.pollPreview}>
        <View style={styles.pollPreviewHeader}>
          <View style={styles.pollPreviewIcon}>
            <BarChart2 size={14} color={colors.primary} strokeWidth={2} />
          </View>
          <Text style={styles.pollPreviewTitle}>Poll · {pollDuration}</Text>
          <TouchableOpacity onPress={removePoll}>
            <X size={15} color={colors.textMuted} strokeWidth={2.5} />
          </TouchableOpacity>
        </View>
        {filled.map((opt, i) => (
          <View key={opt.id} style={styles.pollPreviewOption}>
            <Text style={styles.pollPreviewOptionLetter}>{String.fromCharCode(65 + i)}</Text>
            <Text style={styles.pollPreviewOptionText}>{opt.text}</Text>
          </View>
        ))}
      </View>
    );
  };

  // ── Promote preview ───────────────────────────────────────────────────────
  const renderPromotePreview = () => {
    if (!promoteTierKey) return null;
    const tier = PROMOTE_TIERS.find(t => t.key === promoteTierKey);
    if (!tier) return null;
    return (
      <View style={styles.promotePreview}>
        <Zap size={14} color="#f59e0b" strokeWidth={2} />
        <Text style={styles.promotePreviewText}>Promoted for {tier.label} · ${tier.price}</Text>
        <TouchableOpacity onPress={() => setPromoteTierKey(null)}>
          <X size={14} color={colors.textMuted} strokeWidth={2.5} />
        </TouchableOpacity>
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
              {mediaType === 'image' ? (
                <Image source={{ uri: mediaUri }} style={styles.mediaPreview} resizeMode="cover" />
              ) : (
                <View style={[styles.mediaPreview, styles.videoPreviewBg]}>
                  <Video size={40} color={colors.textMuted} strokeWidth={1.5} />
                  <Text style={styles.videoPreviewText}>Video attached</Text>
                </View>
              )}
              <TouchableOpacity style={styles.removeMediaBtn} onPress={removeMedia}>
                <X size={16} color={colors.white} strokeWidth={2.5} />
              </TouchableOpacity>
            </View>
          )}

          {/* Poll preview */}
          {renderPollPreview()}

          {/* Promote preview */}
          {renderPromotePreview()}

          {/* Token card or picker trigger */}
          <View style={styles.mediaRow}>
            {attachedToken ? (
              renderTokenCard()
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
            <TouchableOpacity style={styles.addMediaBox} activeOpacity={0.8} onPress={() => pickMedia('image')}>
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
            {/* Media (Image + Video combined) */}
            <TouchableOpacity style={styles.qaItem} activeOpacity={0.8} onPress={() => pickMedia('image')}>
              <View style={[styles.qaIconWrap, { backgroundColor: '#8B5CF622' }]}>
                <ImageIcon size={20} color="#8B5CF6" strokeWidth={2} />
              </View>
              <Text style={styles.qaLabel}>Media</Text>
            </TouchableOpacity>

            {/* Poll */}
            <TouchableOpacity style={styles.qaItem} activeOpacity={0.8} onPress={() => setShowPollModal(true)}>
              <View style={[styles.qaIconWrap, { backgroundColor: '#f59e0b22' }]}>
                <BarChart2 size={20} color="#f59e0b" strokeWidth={2} />
              </View>
              <Text style={styles.qaLabel}>Poll</Text>
            </TouchableOpacity>

            {/* Token */}
            <TouchableOpacity style={styles.qaItem} activeOpacity={0.8} onPress={() => setShowTokenPicker(true)}>
              <View style={[styles.qaIconWrap, { backgroundColor: '#10b98122' }]}>
                <Coins size={20} color="#10b981" strokeWidth={2} />
              </View>
              <Text style={styles.qaLabel}>Token</Text>
            </TouchableOpacity>

            {/* Promote */}
            <TouchableOpacity
              style={styles.qaItem}
              activeOpacity={0.8}
              onPress={() => { setPromoteStep('select'); setSelectedTierKey(null); setShowPromoteModal(true); }}
            >
              <View style={[styles.qaIconWrap, { backgroundColor: '#f59e0b22' }]}>
                <Zap size={20} color="#f59e0b" strokeWidth={2} />
              </View>
              <Text style={styles.qaLabel}>Promote</Text>
            </TouchableOpacity>

            {/* Location — shows city name based on coordinates */}
            <TouchableOpacity style={styles.qaItem} activeOpacity={0.8} onPress={async () => {
              try {
                const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
                // Just show a simple input for now — full geolocation requires expo-location
                Alert.alert('Location', 'Add your city or location to this post:', [
                  { text: 'Skip' },
                  { text: 'Add Location', onPress: () => {} },
                ]);
              } catch {}
            }}>
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
            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <View style={[styles.settingIcon, { backgroundColor: 'rgba(139,92,246,0.15)' }]}>
                  <Globe size={16} color={colors.primary} strokeWidth={2} />
                </View>
                <Text style={styles.settingLabel}>Language</Text>
              </View>
              <View style={styles.settingRight}>
                <Text style={styles.settingValue}>English</Text>
              </View>
            </View>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>

      {/* Poll Modal */}
      <Modal visible={showPollModal} animationType="slide" transparent onRequestClose={() => setShowPollModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.pollModalSheet}>
            <View style={styles.pollHandle} />
            <View style={styles.pollHeader}>
              <Text style={styles.pollTitle}>Create Poll</Text>
              <TouchableOpacity onPress={() => setShowPollModal(false)}>
                <X size={22} color={colors.textPrimary} strokeWidth={2.5} />
              </TouchableOpacity>
            </View>

            <Text style={styles.pollSectionLabel}>OPTIONS</Text>
            {pollOptions.map((opt, i) => (
              <View key={opt.id} style={styles.pollOptionRow}>
                <Text style={styles.pollOptionLetter}>{String.fromCharCode(65 + i)}</Text>
                <TextInput
                  style={styles.pollOptionInput}
                  placeholder={`Option ${i + 1}`}
                  placeholderTextColor={colors.textMuted}
                  value={opt.text}
                  onChangeText={text => updatePollOption(opt.id, text)}
                  maxLength={60}
                />
                {i >= 2 && (
                  <TouchableOpacity onPress={() => removePollOption(opt.id)}>
                    <Trash2 size={16} color="#ef4444" strokeWidth={2} />
                  </TouchableOpacity>
                )}
              </View>
            ))}
            {pollOptions.length < 4 && (
              <TouchableOpacity style={styles.addOptionBtn} onPress={addPollOption} activeOpacity={0.8}>
                <Plus size={16} color={colors.primary} strokeWidth={2.5} />
                <Text style={styles.addOptionText}>Add option</Text>
              </TouchableOpacity>
            )}

            <Text style={[styles.pollSectionLabel, { marginTop: spacing.xl }]}>DURATION</Text>
            <View style={styles.durationRow}>
              {['1h', '6h', '24h', '3d', '7d'].map(d => (
                <TouchableOpacity
                  key={d}
                  style={[styles.durationBtn, pollDuration === d && styles.durationBtnActive]}
                  onPress={() => setPollDuration(d)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.durationText, pollDuration === d && styles.durationTextActive]}>{d}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.pollConfirmBtn} onPress={confirmPoll} activeOpacity={0.85}>
              <BarChart2 size={16} color={colors.white} strokeWidth={2} />
              <Text style={styles.pollConfirmBtnText}>Add Poll</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Promote Modal */}
      <Modal visible={showPromoteModal} animationType="slide" transparent onRequestClose={() => setShowPromoteModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.pollModalSheet}>
            <View style={styles.pollHandle} />
            {promoteStep === 'select' ? (
              <>
                <View style={styles.pollHeader}>
                  <Text style={styles.pollTitle}>Boost this Post</Text>
                  <TouchableOpacity onPress={() => setShowPromoteModal(false)}>
                    <X size={22} color={colors.textPrimary} strokeWidth={2.5} />
                  </TouchableOpacity>
                </View>
                <Text style={styles.promoteDesc}>
                  Promoted posts appear at the top of the feed and get more visibility.
                </Text>
                {PROMOTE_TIERS.map(tier => (
                  <TouchableOpacity
                    key={tier.key}
                    style={styles.tierCard}
                    activeOpacity={0.85}
                    onPress={() => { setSelectedTierKey(tier.key); setPromoteStep('confirm'); }}
                  >
                    <View style={styles.tierLeft}>
                      <View style={styles.tierIcon}><Zap size={16} color="#f59e0b" strokeWidth={2} /></View>
                      <View>
                        <Text style={styles.tierLabel}>{tier.label}</Text>
                        <Text style={styles.tierSub}>{tier.hours}h at the top</Text>
                      </View>
                    </View>
                    <Text style={styles.tierPrice}>${tier.price}</Text>
                  </TouchableOpacity>
                ))}
                <Text style={styles.promoteLegalNote}>
                  Payment is applied when you publish the post. SOL from connected wallet.
                </Text>
              </>
            ) : (
              <>
                <View style={styles.pollHeader}>
                  <Text style={styles.pollTitle}>Confirm Boost</Text>
                  <TouchableOpacity onPress={() => setPromoteStep('select')}>
                    <X size={22} color={colors.textPrimary} strokeWidth={2.5} />
                  </TouchableOpacity>
                </View>
                <View style={styles.confirmCard}>
                  <View style={styles.confirmRow}>
                    <Text style={styles.confirmLabel}>Tier</Text>
                    <Text style={styles.confirmValue}>{PROMOTE_TIERS.find(t => t.key === selectedTierKey)?.label}</Text>
                  </View>
                  <View style={[styles.confirmRow, { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', marginTop: spacing.sm, paddingTop: spacing.sm }]}>
                    <Text style={styles.confirmLabel}>Price</Text>
                    <Text style={[styles.confirmValue, { color: colors.primary }]}>${PROMOTE_TIERS.find(t => t.key === selectedTierKey)?.price} USD</Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.pollConfirmBtn}
                  activeOpacity={0.85}
                  onPress={() => {
                    setPromoteTierKey(selectedTierKey);
                    setShowPromoteModal(false);
                  }}
                >
                  <Zap size={16} color={colors.white} strokeWidth={2} />
                  <Text style={styles.pollConfirmBtnText}>Boost Post</Text>
                </TouchableOpacity>
                <TouchableOpacity style={{ alignItems: 'center', paddingVertical: spacing.sm }} onPress={() => setPromoteStep('select')}>
                  <Text style={{ color: colors.textMuted, fontSize: fontSize.sm }}>Go back</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Token picker modal */}
      <Modal visible={showTokenPicker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowTokenPicker(false)}>
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
                  <Text style={[styles.tokenRowChange, { color: (item.priceChange24h ?? 0) >= 0 ? '#10b981' : '#ef4444' }]}>
                    {(item.priceChange24h ?? 0) >= 0 ? '+' : ''}{(item.priceChange24h ?? 0).toFixed(2)}%
                  </Text>
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={tokenSearch.length > 0 && !tokenSearching ? (
              <Text style={styles.emptySearch}>No tokens found</Text>
            ) : null}
          />
        </View>
      </Modal>

      {/* Who can reply picker */}
      <Modal visible={showReplyPicker} transparent animationType="fade" onRequestClose={() => setShowReplyPicker(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setShowReplyPicker(false)}>
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>Who can reply?</Text>
            {WHO_CAN_REPLY_OPTIONS.map(opt => (
              <TouchableOpacity key={opt.value} style={styles.pickerOption} onPress={() => { setWhoCanReply(opt.value); setShowReplyPicker(false); }}>
                <Text style={[styles.pickerOptionText, whoCanReply === opt.value && styles.pickerOptionActive]}>{opt.label}</Text>
                {whoCanReply === opt.value && <Check size={18} color={colors.primary} strokeWidth={2.5} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Visibility picker */}
      <Modal visible={showVisibilityPicker} transparent animationType="fade" onRequestClose={() => setShowVisibilityPicker(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setShowVisibilityPicker(false)}>
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>Post visibility</Text>
            {([{ value: 'public', label: 'Public' }, { value: 'followers', label: 'Followers only' }] as const).map(opt => (
              <TouchableOpacity key={opt.value} style={styles.pickerOption} onPress={() => { setVisibility(opt.value); setShowVisibilityPicker(false); }}>
                <Text style={[styles.pickerOptionText, visibility === opt.value && styles.pickerOptionActive]}>{opt.label}</Text>
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
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: Platform.OS === 'android' ? 44 : spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: 'rgba(139,92,246,0.1)',
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
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#1E1E2E', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  avatarImg: { width: 52, height: 52, borderRadius: 26 },
  userInfo: { gap: 4, justifyContent: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  username: { fontSize: 16, fontWeight: '800', color: colors.textPrimary },
  verifiedBadge: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  handle: { fontSize: 13, color: colors.textMuted },
  visibilityBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#1E1E2E', paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: borderRadius.full, alignSelf: 'flex-start', marginTop: 2,
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.2)',
  },
  visibilityText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },

  contentInput: { fontSize: 18, color: colors.textPrimary, lineHeight: 26, minHeight: 80, marginBottom: spacing.xl },

  mediaPreviewWrap: { marginBottom: spacing.lg, borderRadius: 16, overflow: 'hidden', position: 'relative' },
  mediaPreview: { width: '100%', height: 200, borderRadius: 16 },
  videoPreviewBg: { backgroundColor: '#12121A', justifyContent: 'center', alignItems: 'center', gap: spacing.sm },
  videoPreviewText: { fontSize: fontSize.sm, color: colors.textMuted, fontWeight: '600' },
  removeMediaBtn: {
    position: 'absolute', top: 10, right: 10,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center',
  },

  pollPreview: {
    backgroundColor: '#12121E', borderRadius: 14, padding: spacing.md,
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.2)', marginBottom: spacing.lg, gap: spacing.sm,
  },
  pollPreviewHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pollPreviewIcon: { width: 26, height: 26, borderRadius: 6, backgroundColor: colors.primaryMuted, justifyContent: 'center', alignItems: 'center' },
  pollPreviewTitle: { flex: 1, fontSize: fontSize.sm, fontWeight: '700', color: colors.primary },
  pollPreviewOption: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: '#1A1A28', borderRadius: 8, padding: spacing.sm },
  pollPreviewOptionLetter: { fontSize: 12, fontWeight: '800', color: colors.primary, width: 20 },
  pollPreviewOptionText: { fontSize: fontSize.sm, color: colors.textPrimary, flex: 1 },

  promotePreview: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: 'rgba(245,158,11,0.1)', borderRadius: 10, padding: spacing.md,
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)', marginBottom: spacing.lg,
  },
  promotePreviewText: { flex: 1, fontSize: fontSize.sm, fontWeight: '700', color: '#f59e0b' },

  mediaRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.xl },
  tokenPickerTrigger: {
    flex: 1, minHeight: 80, borderRadius: 16, borderWidth: 1.5,
    borderColor: 'rgba(139,92,246,0.3)', borderStyle: 'dashed',
    backgroundColor: 'rgba(139,92,246,0.04)', justifyContent: 'center', alignItems: 'center', gap: 8,
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
  tokenCardRemove: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#2A2A3A', justifyContent: 'center', alignItems: 'center' },
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
  settingsCard: { backgroundColor: '#12121E', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(139,92,246,0.12)', overflow: 'hidden' },
  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: 16 },
  settingRowBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(139,92,246,0.08)' },
  settingLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
  settingIcon: { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  settingLabel: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  settingRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  settingValue: { fontSize: 14, color: colors.textMuted, fontWeight: '500' },

  // Poll modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  pollModalSheet: { backgroundColor: '#12121A', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.xxl },
  pollHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#2A2A3A', alignSelf: 'center', marginBottom: spacing.lg },
  pollHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xl },
  pollTitle: { fontSize: fontSize.lg, fontWeight: '800', color: colors.textPrimary },
  pollSectionLabel: { fontSize: 11, fontWeight: '800', color: colors.textMuted, letterSpacing: 1, marginBottom: spacing.md },
  pollOptionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  pollOptionLetter: { width: 24, fontSize: 13, fontWeight: '800', color: colors.primary },
  pollOptionInput: {
    flex: 1, backgroundColor: '#1A1A28', borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    fontSize: fontSize.md, color: colors.textPrimary,
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.15)',
  },
  addOptionBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  addOptionText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.primary },
  durationRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xl },
  durationBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: borderRadius.full, backgroundColor: '#1A1A28', borderWidth: 1, borderColor: 'rgba(139,92,246,0.15)' },
  durationBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  durationText: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  durationTextActive: { color: colors.white },
  pollConfirmBtn: {
    backgroundColor: colors.primary, paddingVertical: spacing.lg, borderRadius: borderRadius.md,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.md,
  },
  pollConfirmBtnText: { fontSize: fontSize.md, fontWeight: '700', color: colors.white },

  // Promote modal
  promoteDesc: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.lg, lineHeight: 20 },
  tierCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#1A1A28', borderRadius: borderRadius.md, padding: spacing.lg,
    marginBottom: spacing.md, borderWidth: 1, borderColor: 'rgba(245,158,11,0.15)',
  },
  tierLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  tierIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(245,158,11,0.12)', justifyContent: 'center', alignItems: 'center' },
  tierLabel: { fontSize: fontSize.md, fontWeight: '700', color: colors.textPrimary },
  tierSub: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  tierPrice: { fontSize: fontSize.lg, fontWeight: '800', color: '#f59e0b' },
  promoteLegalNote: { fontSize: fontSize.xs, color: colors.textMuted, textAlign: 'center', marginTop: spacing.md, lineHeight: 18 },
  confirmCard: { backgroundColor: '#1A1A28', borderRadius: borderRadius.md, padding: spacing.lg, marginBottom: spacing.xl, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  confirmRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  confirmLabel: { fontSize: fontSize.md, color: colors.textMuted },
  confirmValue: { fontSize: fontSize.md, fontWeight: '700', color: colors.textPrimary },

  // Token picker
  modalContainer: { flex: 1, backgroundColor: '#0D0D15', paddingTop: spacing.xl },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, paddingBottom: spacing.lg, borderBottomWidth: 1, borderBottomColor: 'rgba(139,92,246,0.1)' },
  modalTitle: { fontSize: 18, fontWeight: '800', color: colors.textPrimary },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: '#1A1A2E', borderRadius: 14, paddingHorizontal: spacing.lg, paddingVertical: 12, margin: spacing.xl, borderWidth: 1, borderColor: 'rgba(139,92,246,0.15)' },
  searchInput: { flex: 1, fontSize: 16, color: colors.textPrimary },
  emptySearch: { textAlign: 'center', color: colors.textMuted, marginTop: 40, fontSize: 15 },

  tokenRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xl, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(139,92,246,0.06)' },
  tokenRowLogo: { width: 40, height: 40, borderRadius: 20 },
  tokenRowLogoFallback: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#1E1E2E', justifyContent: 'center', alignItems: 'center' },
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
  pickerOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(139,92,246,0.08)' },
  pickerOptionText: { fontSize: 16, fontWeight: '600', color: colors.textSecondary },
  pickerOptionActive: { color: colors.primary },
});
