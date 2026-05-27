import { useState, useCallback, useRef, useEffect } from 'react';
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
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  X, Check, ChevronDown, ChevronRight, Globe,
  ChartBar as BarChart2,
  Coins, MapPin, Lock, MessageCircle, AtSign, User,
  Search, Film, Megaphone, Zap, Wallet, Clock, CircleAlert,
} from 'lucide-react-native';
import VerificationBadge from '@/components/VerificationBadge';
import { colors, spacing, borderRadius, fontSize } from '@/constants/theme';
import { useProfile } from '@/contexts/ProfileContext';
import { useWallet } from '@/contexts/WalletContext';
import { VerificationService } from '@/services/verificationService';
import { SocialService, PROMOTE_TIERS } from '@/services/socialService';
import { liveMarketService, LiveToken } from '@/services/liveMarketService';
import { SolanaPriceService } from '@/services/solana/priceService';
import { payToTreasury, TREASURY_WALLET, PayStatus } from '@/services/treasuryService';
import { supabase } from '@/lib/supabase';
import { PremiumUpsellModal } from '@/components/PremiumUpsellModal';

type WhoCanReply = 'everyone' | 'followers' | 'mentioned';
type Visibility = 'public' | 'followers';

const TIMEFRAMES = ['1D', '1W', '1M', '3M', '1Y', 'ALL'];
const WHO_CAN_REPLY_OPTIONS: { value: WhoCanReply; label: string }[] = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'followers', label: 'Followers only' },
  { value: 'mentioned', label: 'Mentioned people' },
];

const MAX_MEDIA = 4;
const MAX_TOKENS = 2;

const qaGifBox: any = {
  width: 28, height: 28, borderRadius: 6, borderWidth: 2, borderColor: '#10b981',
  justifyContent: 'center', alignItems: 'center',
};
const qaGifText: any = { fontSize: 10, fontWeight: '900', color: '#10b981' };

export default function CreatePostScreen() {
  const router = useRouter();
  const { profile, refreshProfile } = useProfile();
  const { activeAddress, connectedWallet, selectedAccount, refreshPortfolio } = useWallet();

  const isPremium = profile ? VerificationService.isPremiumActive(profile as any) : false;
  const CHAR_LIMIT = isPremium ? 1000 : 230;

  const [content, setContent] = useState('');
  const [posting, setPosting] = useState(false);

  // Multi-media
  const [mediaUris, setMediaUris] = useState<string[]>([]);
  const [mediaUploading, setMediaUploading] = useState(false);

  // @mention
  const [mentionResults, setMentionResults] = useState<any[]>([]);
  const [mentionLoading, setMentionLoading] = useState(false);

  // Token attachment (max 2)
  const [attachedTokens, setAttachedTokens] = useState<LiveToken[]>([]);
  const [showTokenPicker, setShowTokenPicker] = useState(false);
  const [tokenSearch, setTokenSearch] = useState('');
  const [tokenResults, setTokenResults] = useState<LiveToken[]>([]);
  const [tokenSearching, setTokenSearching] = useState(false);
  const [timeframe, setTimeframe] = useState('1D');

  // Promote
  const [showPromoteModal, setShowPromoteModal] = useState(false);
  const [promoteStep, setPromoteStep] = useState<'select' | 'confirm' | 'processing' | 'done'>('select');
  const [selectedTierKey, setSelectedTierKey] = useState<string | null>(null);
  const [solUsdPrice, setSolUsdPrice] = useState<number>(0);
  const [promotePayStatus, setPromotePayStatus] = useState<PayStatus>('idle');

  // Premium upsell
  const [showPremiumUpsell, setShowPremiumUpsell] = useState(false);
  const [premiumUpsellNote, setPremiumUpsellNote] = useState('');

  // GIF
  const [gifUrl, setGifUrl] = useState<string | null>(null);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [gifQuery, setGifQuery] = useState('');
  const [gifResults, setGifResults] = useState<{ id: string; url: string; preview: string }[]>([]);
  const [gifSearching, setGifSearching] = useState(false);
  // Tenor demo key — works without configuration
  const TENOR_KEY = process.env.EXPO_PUBLIC_TENOR_API_KEY || 'LIVDSRZULELA';

  // Text color (premium only)
  const DAWEN_TEXT_COLORS = [
    { label: 'Default', value: null },
    { label: 'Blue', value: '#60A5FA' },
    { label: 'Teal', value: '#2DD4BF' },
    { label: 'Green', value: '#34D399' },
    { label: 'Gold', value: '#FBBF24' },
    { label: 'Orange', value: '#FB923C' },
    { label: 'Pink', value: '#F472B6' },
    { label: 'Red', value: '#F87171' },
  ] as const;
  const [selectedTextColor, setSelectedTextColor] = useState<string | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);

  // Poll
  const [showPoll, setShowPoll] = useState(false);
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);

  useEffect(() => {
    const svc = new SolanaPriceService();
    svc.getSOLPrice().then(p => { if (p > 0) setSolUsdPrice(p); }).catch(() => {});
  }, []);

  const usdToSol = (usd: number) => solUsdPrice > 0 ? (usd / solUsdPrice) : 0;

  const selectedTier = PROMOTE_TIERS.find(t => t.key === selectedTierKey) ?? null;

  const pendingCredit = (profile as any)?.pending_promote_tier as string | null | undefined;

  const handleConfirmPromotion = async () => {
    if (!selectedTierKey || !profile) return;
    const tier = PROMOTE_TIERS.find(t => t.key === selectedTierKey);
    if (!tier) return;

    // If already paid for this exact tier, skip payment
    if (pendingCredit === selectedTierKey) {
      setPromoteStep('done');
      return;
    }

    if (!activeAddress) {
      Alert.alert('No Wallet', 'Connect or unlock your wallet first.');
      return;
    }

    const solAmount = usdToSol(tier.usdPrice);
    if (solAmount <= 0) {
      Alert.alert('Price Error', 'Unable to fetch SOL price. Please try again.');
      return;
    }

    setPromoteStep('processing');
    setPromotePayStatus('idle');

    try {
      const result = await payToTreasury({
        fromAddress: activeAddress,
        amountSol: solAmount,
        connectedWalletId: connectedWallet?.id ?? null,
        internalAccountIndex: selectedAccount?.accountIndex ?? 0,
        onStatus: setPromotePayStatus,
      });

      if (!result.success) throw new Error(result.error || 'Transaction failed');

      // Save pending credit to DB
      await supabase
        .from('user_profiles')
        .update({ pending_promote_tier: selectedTierKey })
        .eq('id', profile.id);

      await refreshProfile();
      await refreshPortfolio();
      setPromoteStep('done');
    } catch (err: any) {
      setPromoteStep('confirm');
      setPromotePayStatus('idle');
      const msg = err?.message || 'Could not complete payment.';
      Alert.alert('Payment Failed', msg);
    }
  };

  // Settings
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [whoCanReply, setWhoCanReply] = useState<WhoCanReply>('everyone');
  const [allowQuotes, setAllowQuotes] = useState(true);
  const [mentionedReply, setMentionedReply] = useState(true);
  const [showReplyPicker, setShowReplyPicker] = useState(false);
  const [showVisibilityPicker, setShowVisibilityPicker] = useState(false);

  // Animated dashed border
  const dashAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(dashAnim, { toValue: 1, duration: 1800, useNativeDriver: false }),
        Animated.timing(dashAnim, { toValue: 0, duration: 1800, useNativeDriver: false }),
      ])
    ).start();
  }, []);

  const borderColor = dashAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ['rgba(139,92,246,0.25)', 'rgba(139,92,246,0.7)', 'rgba(139,92,246,0.25)'],
  });

  const displayName = profile?.username
    || (profile?.wallet_address ? `${profile.wallet_address.slice(0, 6)}...${profile.wallet_address.slice(-4)}` : 'Wallet');
  const handleText = `@${(profile?.username || 'user').toLowerCase()}`;

  // ── Media picker ─────────────────────────────────────────────────────────
  const pickMedia = async () => {
    if (mediaUris.length >= MAX_MEDIA) {
      Alert.alert('Limit reached', `You can attach up to ${MAX_MEDIA} media items.`);
      return;
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo/video access to attach media.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.85,
      allowsMultipleSelection: true,
      selectionLimit: MAX_MEDIA - mediaUris.length,
    });
    if (!result.canceled && result.assets.length > 0) {
      const newUris = result.assets.map(a => a.uri);
      setMediaUris(prev => [...prev, ...newUris].slice(0, MAX_MEDIA));
    }
  };

  const removeMedia = (uri: string) => setMediaUris(prev => prev.filter(u => u !== uri));

  // ── @mention handling ─────────────────────────────────────────────────────
  const handleContentChange = async (text: string) => {
    if (text.length > CHAR_LIMIT) return;
    setContent(text);
    const match = text.match(/@(\w+)$/);
    if (match && match[1].length >= 1) {
      setMentionLoading(true);
      try {
        const results = await SocialService.searchUsers(match[1]);
        setMentionResults(results.slice(0, 6));
      } catch {
        setMentionResults([]);
      } finally {
        setMentionLoading(false);
      }
    } else {
      setMentionResults([]);
    }
  };

  const insertMention = (username: string) => {
    const updated = content.replace(/@(\w+)$/, `@${username} `);
    setContent(updated);
    setMentionResults([]);
  };

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
    if (attachedTokens.find(t => t.address === token.address)) {
      setShowTokenPicker(false);
      return;
    }
    if (attachedTokens.length >= MAX_TOKENS) {
      Alert.alert('Limit reached', 'You can attach up to 2 tokens per post.');
      return;
    }
    setAttachedTokens(prev => [...prev, token]);
    setShowTokenPicker(false);
    setTokenSearch('');
    setTokenResults([]);
  };

  const removeToken = (address: string) => {
    setAttachedTokens(prev => prev.filter(t => t.address !== address));
  };

  // ── GIF search ────────────────────────────────────────────────────────────
  function parseTenorResults(items: any[]): { id: string; url: string; preview: string }[] {
    return items.map((item: any) => {
      const fmt = item.media_formats ?? item.media?.[0] ?? {};
      const url = fmt.gif?.url ?? fmt.mediumgif?.url ?? fmt.tinygif?.url ?? '';
      const preview = fmt.tinygif?.url ?? fmt.nanogif?.url ?? fmt.gif?.url ?? '';
      return { id: item.id, url, preview };
    }).filter((g: any) => g.url);
  }

  const searchGifs = useCallback(async (query: string) => {
    setGifQuery(query);
    if (!query.trim()) { setGifResults([]); return; }
    setGifSearching(true);
    try {
      const url = `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(query)}&key=${TENOR_KEY}&limit=20&media_filter=gif,tinygif`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setGifResults(parseTenorResults(json.results ?? []));
    } catch {
      setGifResults([]);
    } finally {
      setGifSearching(false);
    }
  }, [TENOR_KEY]);

  const openGifPicker = () => {
    if (!isPremium) {
      setPremiumUpsellNote('GIF posting is a Premium feature.');
      setShowPremiumUpsell(true);
      return;
    }
    setGifQuery('');
    setGifResults([]);
    setShowGifPicker(true);
    // Load featured/trending GIFs immediately on open
    setGifSearching(true);
    fetch(`https://tenor.googleapis.com/v2/featured?key=${TENOR_KEY}&limit=20&media_filter=gif,tinygif`, { signal: AbortSignal.timeout(5000) })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(json => setGifResults(parseTenorResults(json.results ?? [])))
      .catch(() => setGifResults([]))
      .finally(() => setGifSearching(false));
  };

  const selectGif = (url: string) => {
    setGifUrl(url);
    setShowGifPicker(false);
  };

  // ── Poll helpers ─────────────────────────────────────────────────────────
  const togglePoll = () => {
    if (showPoll) {
      setShowPoll(false);
      setPollOptions(['', '']);
    } else {
      setShowPoll(true);
    }
  };

  const setPollOption = (idx: number, text: string) => {
    setPollOptions(prev => prev.map((o, i) => i === idx ? text : o));
  };

  const addPollOption = () => {
    if (pollOptions.length < 4) setPollOptions(prev => [...prev, '']);
  };

  const removePollOption = (idx: number) => {
    if (pollOptions.length <= 2) return;
    setPollOptions(prev => prev.filter((_, i) => i !== idx));
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handlePost = async () => {
    if (!profile || !content.trim() || posting) return;
    setPosting(true);
    try {
      const effectiveReply = mentionedReply ? 'mentioned' : whoCanReply;
      const primaryToken = attachedTokens[0] ?? null;
      const secondToken = attachedTokens[1] ?? null;
      const promoteTier = pendingCredit ?? undefined;

      const validPollOptions = showPoll ? pollOptions.filter(o => o.trim().length > 0) : [];
      await SocialService.createPost(profile.id, content.trim(), {
        mediaUris: mediaUris.length > 0 ? mediaUris : undefined,
        tokenAddress: primaryToken?.address ?? undefined,
        tokenSymbol: primaryToken?.symbol ?? undefined,
        tokenPrice: primaryToken?.price ?? undefined,
        tokenChange24h: primaryToken?.priceChange24h ?? undefined,
        tokenLogoUri: primaryToken?.image ?? undefined,
        tokenAddress2: secondToken?.address ?? undefined,
        tokenSymbol2: secondToken?.symbol ?? undefined,
        tokenPrice2: secondToken?.price ?? undefined,
        tokenChange24h2: secondToken?.priceChange24h ?? undefined,
        tokenLogoUri2: secondToken?.image ?? undefined,
        visibility,
        whoCanReply: effectiveReply,
        allowQuotes,
        language: 'en',
        promoteTier,
        gifUrl: gifUrl ?? undefined,
        pollOptions: validPollOptions.length >= 2 ? validPollOptions : undefined,
        textColor: isPremium && selectedTextColor ? selectedTextColor : null,
      });

      // Consume promotion credit after post is submitted
      if (pendingCredit) {
        await supabase
          .from('user_profiles')
          .update({ pending_promote_tier: null })
          .eq('id', profile.id);
        await refreshProfile();
      }

      router.back();
    } catch (e) {
      console.error('[CreatePost] error:', e);
      Alert.alert('Error', 'Failed to create post. Please try again.');
    } finally {
      setPosting(false);
    }
  };

  const charLeft = CHAR_LIMIT - content.length;
  const charWarning = charLeft <= 30;
  const pollValid = !showPoll || pollOptions.filter(o => o.trim().length > 0).length >= 2;
  const canPost = content.trim().length > 0 && content.length <= CHAR_LIMIT && !posting && pollValid;

  const renderTokenCard = (token: LiveToken) => {
    const change = token.priceChange24h ?? 0;
    const isPositive = change >= 0;
    return (
      <View key={token.address} style={styles.tokenCard}>
        <View style={styles.tokenCardHeader}>
          <View style={styles.tokenCardTitleRow}>
            {token.image ? <Image source={{ uri: token.image }} style={styles.tokenLogo} /> : null}
            <Text style={styles.tokenCardSymbol}>${token.symbol}</Text>
          </View>
          <TouchableOpacity style={styles.tokenCardRemove} onPress={() => removeToken(token.address)}>
            <X size={13} color={colors.textMuted} strokeWidth={2.5} />
          </TouchableOpacity>
        </View>
        <Text style={styles.tokenCardPrice}>{liveMarketService.formatPrice(token.price)}</Text>
        <Text style={[styles.tokenCardChange, { color: isPositive ? '#10b981' : '#ef4444' }]}>
          {isPositive ? '+' : ''}{change.toFixed(2)}% {isPositive ? '↗' : '↘'}
        </Text>
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
      <PremiumUpsellModal
        visible={showPremiumUpsell}
        onClose={() => setShowPremiumUpsell(false)}
        featureNote={premiumUpsellNote}
      />
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
                />
              ) : (
                <User size={24} color={colors.textMuted} />
              )}
            </View>
            <View style={styles.userInfo}>
              <View style={styles.nameRow}>
                <Text style={styles.username}>{displayName}</Text>
                {profile && <VerificationBadge profile={profile} size="sm" />}
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

          {/* Text input with animated dashed border */}
          <Animated.View style={[styles.inputWrapper, { borderColor }]}>
            <TextInput
              style={[styles.contentInput, isPremium && selectedTextColor ? { color: selectedTextColor } : null]}
              placeholder={"What's happening in the market?\nShare your thoughts with the DAWEN community."}
              placeholderTextColor={colors.textMuted}
              value={content}
              onChangeText={handleContentChange}
              multiline
              autoFocus={false}
              maxLength={CHAR_LIMIT}
            />
            <View style={styles.charCountRow}>
              {isPremium && (
                <View style={styles.premiumBadgeRow}>
                  <Text style={styles.premiumLabel}>Premium · 1000 chars</Text>
                </View>
              )}
              <Text style={[styles.charCount, charWarning && styles.charCountWarn]}>
                {charLeft}
              </Text>
            </View>
          </Animated.View>

          {/* @mention dropdown */}
          {mentionResults.length > 0 && (
            <View style={styles.mentionDropdown}>
              {mentionLoading && <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 4 }} />}
              {mentionResults.map(u => (
                <TouchableOpacity
                  key={u.id}
                  style={styles.mentionRow}
                  onPress={() => insertMention(u.username || u.wallet_address?.slice(0, 8))}
                  activeOpacity={0.75}
                >
                  {u.avatar_url ? (
                    <Image source={{ uri: u.avatar_url }} style={styles.mentionAvatar} />
                  ) : (
                    <View style={[styles.mentionAvatar, styles.mentionAvatarFallback]}>
                      <User size={13} color={colors.textMuted} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={styles.mentionUsername}>{u.username || (u.wallet_address ? `${u.wallet_address.slice(0, 6)}...${u.wallet_address.slice(-4)}` : 'Wallet')}</Text>
                      <VerificationBadge profile={u} size="sm" />
                    </View>
                    <Text style={styles.mentionAddr}>
                      {u.wallet_address?.slice(0, 6)}...{u.wallet_address?.slice(-4)}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* GIF preview */}
          {gifUrl && (
            <View style={styles.gifPreviewWrap}>
              <Image source={{ uri: gifUrl }} style={styles.gifPreview} resizeMode="cover" />
              <TouchableOpacity style={styles.removeGifBtn} onPress={() => setGifUrl(null)} activeOpacity={0.8}>
                <X size={14} color={colors.white} strokeWidth={2.5} />
              </TouchableOpacity>
            </View>
          )}

          {/* Poll composer */}
          {showPoll && (
            <View style={styles.pollComposer}>
              <View style={styles.pollHeader}>
                <BarChart2 size={14} color="#ef4444" strokeWidth={2} />
                <Text style={styles.pollHeaderText}>Poll Options</Text>
                <TouchableOpacity onPress={togglePoll} activeOpacity={0.7} style={styles.pollCloseBtn}>
                  <X size={15} color={colors.textMuted} strokeWidth={2.5} />
                </TouchableOpacity>
              </View>
              {pollOptions.map((opt, idx) => (
                <View key={idx} style={styles.pollOptionRow}>
                  <TextInput
                    style={styles.pollOptionInput}
                    placeholder={`Option ${idx + 1}`}
                    placeholderTextColor={colors.textMuted}
                    value={opt}
                    onChangeText={t => setPollOption(idx, t)}
                    maxLength={80}
                  />
                  {pollOptions.length > 2 && (
                    <TouchableOpacity onPress={() => removePollOption(idx)} activeOpacity={0.7} style={styles.pollRemoveBtn}>
                      <X size={13} color={colors.textMuted} strokeWidth={2.5} />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              {pollOptions.length < 4 && (
                <TouchableOpacity style={styles.pollAddBtn} onPress={addPollOption} activeOpacity={0.8}>
                  <Text style={styles.pollAddBtnText}>+ Add option</Text>
                </TouchableOpacity>
              )}
              {pollOptions.filter(o => o.trim().length > 0).length < 2 && (
                <Text style={styles.pollValidationText}>At least 2 options required</Text>
              )}
            </View>
          )}

          {/* Attached media grid */}
          {mediaUris.length > 0 && (
            <View style={styles.mediaGrid}>
              {mediaUris.map(uri => (
                <View key={uri} style={styles.mediaThumbWrap}>
                  <Image source={{ uri }} style={styles.mediaThumb} resizeMode="cover" />
                  <TouchableOpacity style={styles.removeMediaBtn} onPress={() => removeMedia(uri)}>
                    <X size={14} color={colors.white} strokeWidth={2.5} />
                  </TouchableOpacity>
                </View>
              ))}
              {mediaUris.length < MAX_MEDIA && (
                <TouchableOpacity style={styles.addMoreMedia} onPress={pickMedia} activeOpacity={0.8}>
                  <Text style={styles.addMediaPlus}>+</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Token cards (up to 2, stacked vertically) */}
          {attachedTokens.length > 0 && (
            <View>
              {attachedTokens.map(renderTokenCard)}
            </View>
          )}

          {/* Action row: add media + token */}
          {(mediaUris.length === 0 || attachedTokens.length < MAX_TOKENS) && (
            <View style={styles.mediaRow}>
              {mediaUris.length === 0 && (
                <TouchableOpacity style={styles.addMediaBox} activeOpacity={0.8} onPress={pickMedia}>
                  <Text style={styles.addMediaPlus}>+</Text>
                  <Text style={styles.addMediaLabel}>Add media</Text>
                </TouchableOpacity>
              )}
              {attachedTokens.length < MAX_TOKENS && (
                <TouchableOpacity
                  style={styles.tokenPickerTrigger}
                  activeOpacity={0.8}
                  onPress={() => setShowTokenPicker(true)}
                >
                  <Coins size={22} color={colors.primary} strokeWidth={2} />
                  <Text style={styles.tokenPickerText}>
                    {attachedTokens.length === 0 ? 'Attach Token' : 'Add 2nd Token'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Quick actions */}
          <View style={styles.quickActionsRow}>
            <TouchableOpacity style={styles.qaItem} activeOpacity={0.8} onPress={pickMedia}>
              <View style={[styles.qaIconWrap, { backgroundColor: '#8B5CF622' }]}>
                <Film size={20} color="#8B5CF6" strokeWidth={2} />
              </View>
              <Text style={styles.qaLabel}>Media</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.qaItem} activeOpacity={0.8} onPress={() => { setPromoteStep('select'); setSelectedTierKey(null); setShowPromoteModal(true); }}>
              <View style={[styles.qaIconWrap, { backgroundColor: '#f59e0b22' }]}>
                <Megaphone size={20} color="#f59e0b" strokeWidth={2} />
              </View>
              <Text style={styles.qaLabel}>Promote</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.qaItem} activeOpacity={0.8} onPress={togglePoll}>
              <View style={[styles.qaIconWrap, { backgroundColor: showPoll ? '#ef444430' : '#ef444422', borderWidth: showPoll ? 1 : 0, borderColor: '#ef4444' }]}>
                <BarChart2 size={20} color="#ef4444" strokeWidth={2} />
              </View>
              <Text style={[styles.qaLabel, showPoll && { color: '#ef4444' }]}>Poll</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.qaItem} activeOpacity={0.8} onPress={() => setShowTokenPicker(true)}>
              <View style={[styles.qaIconWrap, { backgroundColor: '#10b98122' }]}>
                <Coins size={20} color="#10b981" strokeWidth={2} />
              </View>
              <Text style={styles.qaLabel}>Token</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.qaItem} activeOpacity={0.8} onPress={openGifPicker}>
              <View style={[styles.qaIconWrap, { backgroundColor: gifUrl ? '#10b98130' : '#10b98122', borderWidth: gifUrl ? 1 : 0, borderColor: '#10b981' }]}>
                <View style={qaGifBox}><Text style={qaGifText}>GIF</Text></View>
              </View>
              <Text style={[styles.qaLabel, gifUrl && { color: '#10b981' }]}>GIF</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.qaItem}
              activeOpacity={0.8}
              onPress={() => {
                if (!isPremium) {
                  setPremiumUpsellNote('Text color is a Premium feature.');
                  setShowPremiumUpsell(true);
                } else {
                  setShowColorPicker(p => !p);
                }
              }}
            >
              <View style={[styles.qaIconWrap, {
                backgroundColor: selectedTextColor ? `${selectedTextColor}30` : '#60A5FA22',
                borderWidth: selectedTextColor ? 1 : 0,
                borderColor: selectedTextColor ?? '#60A5FA',
              }]}>
                <Text style={{ fontSize: 16, fontWeight: '900', color: selectedTextColor ?? '#60A5FA' }}>A</Text>
              </View>
              <Text style={[styles.qaLabel, selectedTextColor ? { color: selectedTextColor } : null]}>Color</Text>
            </TouchableOpacity>
          </View>

          {/* Text color picker (premium only) */}
          {showColorPicker && isPremium && (
            <View style={{ marginTop: 8, padding: 12, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Text Color</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {DAWEN_TEXT_COLORS.map(c => (
                  <TouchableOpacity
                    key={c.label}
                    activeOpacity={0.8}
                    onPress={() => { setSelectedTextColor(c.value); }}
                    style={{
                      paddingHorizontal: 12, paddingVertical: 6,
                      borderRadius: 20,
                      backgroundColor: c.value ? `${c.value}20` : 'rgba(255,255,255,0.08)',
                      borderWidth: selectedTextColor === c.value ? 1.5 : 1,
                      borderColor: c.value ? (selectedTextColor === c.value ? c.value : `${c.value}60`) : (selectedTextColor === null ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.15)'),
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: c.value ?? 'rgba(255,255,255,0.85)' }}>{c.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {selectedTextColor && (
                <Text style={{ marginTop: 8, fontSize: 14, color: selectedTextColor, fontWeight: '600' }}>
                  Preview: This is how your post text will look.
                </Text>
              )}
            </View>
          )}

          {/* Post settings */}
          <Text style={styles.settingsHeader}>POST SETTINGS</Text>
          <View style={styles.settingsCard}>
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
            <Text style={styles.modalTitle}>
              {attachedTokens.length === 0 ? 'Attach Token' : 'Add 2nd Token'}
            </Text>
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

      {/* Promote modal */}
      <Modal
        visible={showPromoteModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowPromoteModal(false)}
      >
        <View style={styles.modalContainer}>
          {promoteStep === 'select' && (
            <>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Promote Post</Text>
                <TouchableOpacity onPress={() => setShowPromoteModal(false)}>
                  <X size={22} color={colors.textPrimary} strokeWidth={2.5} />
                </TouchableOpacity>
              </View>
              <Text style={[styles.emptySearch, { marginTop: 0, marginBottom: 20, textAlign: 'left', paddingHorizontal: spacing.xl }]}>
                Boost your post to reach more users. Payment in SOL.
              </Text>
              {PROMOTE_TIERS.map(tier => (
                <TouchableOpacity
                  key={tier.key}
                  style={styles.promTierCard}
                  onPress={() => { setSelectedTierKey(tier.key); setPromoteStep('confirm'); }}
                  activeOpacity={0.8}
                >
                  <View style={styles.promTierLeft}>
                    <View style={styles.promTierIcon}>
                      <Clock size={16} color={colors.primary} strokeWidth={2} />
                    </View>
                    <View>
                      <Text style={styles.promTierLabel}>{tier.label}</Text>
                      <Text style={styles.promTierSub}>{tier.hours}h visibility boost</Text>
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.promTierUsd}>${tier.usdPrice}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <Zap size={11} color={colors.textMuted} strokeWidth={2} />
                      <Text style={styles.promTierSol}>
                        {solUsdPrice > 0 ? `${usdToSol(tier.usdPrice).toFixed(4)} SOL` : '... SOL'}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </>
          )}

          {promoteStep === 'confirm' && selectedTier && (
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
              <View style={[styles.modalHeader, { paddingTop: spacing.xl }]}>
                <Text style={styles.modalTitle}>Confirm Promotion</Text>
                <TouchableOpacity onPress={() => setPromoteStep('select')}>
                  <X size={22} color={colors.textPrimary} strokeWidth={2.5} />
                </TouchableOpacity>
              </View>
              <View style={styles.promConfirmCard}>
                <View style={styles.promConfirmRow}>
                  <Text style={styles.promConfirmLabel}>Duration</Text>
                  <Text style={styles.promConfirmValue}>{selectedTier.label} ({selectedTier.hours}h)</Text>
                </View>
                <View style={styles.promConfirmDivider} />
                <View style={styles.promConfirmRow}>
                  <Text style={styles.promConfirmLabel}>Price</Text>
                  <View style={{ alignItems: 'flex-end', gap: 2 }}>
                    <Text style={[styles.promConfirmValue, { color: '#F59E0B' }]}>${selectedTier.usdPrice}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <Zap size={11} color={colors.textMuted} strokeWidth={2} />
                      <Text style={styles.promTierSol}>
                        {solUsdPrice > 0 ? `${usdToSol(selectedTier.usdPrice).toFixed(4)} SOL` : '... SOL'}
                      </Text>
                    </View>
                  </View>
                </View>
                <View style={styles.promConfirmDivider} />
                <View style={styles.promConfirmRow}>
                  <Text style={styles.promConfirmLabel}>Payment</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Wallet size={13} color={colors.primary} strokeWidth={2} />
                    <Text style={[styles.promConfirmValue, { color: colors.primary }]}>Solana Wallet</Text>
                  </View>
                </View>
              </View>
              {pendingCredit === selectedTierKey ? (
                <View style={[styles.promNotice, { backgroundColor: 'rgba(16,185,129,0.08)' }]}>
                  <Check size={14} color="#10b981" strokeWidth={2} />
                  <Text style={[styles.promNoticeText, { color: '#10b981' }]}>
                    You already paid for this tier. Submit your post to apply the credit.
                  </Text>
                </View>
              ) : (
                <View style={styles.promNotice}>
                  <CircleAlert size={14} color={colors.warning} strokeWidth={2} />
                  <Text style={styles.promNoticeText}>
                    Real SOL transaction. Wallet must be unlocked with sufficient balance.
                  </Text>
                </View>
              )}
              <TouchableOpacity style={styles.promConfirmBtn} onPress={handleConfirmPromotion} activeOpacity={0.85}>
                <Zap size={16} color={colors.white} strokeWidth={2} />
                <Text style={styles.promConfirmBtnText}>
                  {pendingCredit === selectedTierKey
                    ? 'Use Existing Credit'
                    : `Pay ${solUsdPrice > 0 ? `${usdToSol(selectedTier.usdPrice).toFixed(4)} SOL` : `$${selectedTier.usdPrice}`} & Promote`}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ alignItems: 'center', marginTop: 12 }} onPress={() => setPromoteStep('select')} activeOpacity={0.7}>
                <Text style={{ color: colors.textMuted, fontSize: 14 }}>Go back</Text>
              </TouchableOpacity>
            </ScrollView>
          )}

          {promoteStep === 'processing' && (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 }}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={{ fontSize: 18, fontWeight: '700', color: colors.textPrimary }}>
                {promotePayStatus === 'signing' ? 'Waiting for signature...' :
                 promotePayStatus === 'sending' ? 'Broadcasting transaction...' :
                 promotePayStatus === 'confirmed' ? 'Confirmed!' : 'Processing...'}
              </Text>
              <Text style={{ fontSize: 14, color: colors.textMuted }}>Sending SOL to DAWEN treasury</Text>
            </View>
          )}

          {promoteStep === 'done' && (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, paddingHorizontal: spacing.xl }}>
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#10b98122', justifyContent: 'center', alignItems: 'center' }}>
                <Check size={32} color="#10b981" strokeWidth={2.5} />
              </View>
              <Text style={{ fontSize: 22, fontWeight: '800', color: colors.textPrimary }}>Promotion Ready!</Text>
              <Text style={{ fontSize: 15, color: colors.textMuted, textAlign: 'center' }}>
                Payment confirmed on-chain. Tap "Post" to publish and apply your boost.
              </Text>
              <TouchableOpacity style={styles.promConfirmBtn} onPress={() => setShowPromoteModal(false)} activeOpacity={0.85}>
                <Text style={styles.promConfirmBtnText}>Got it — Write Post</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>

      {/* GIF picker modal */}
      <Modal
        visible={showGifPicker}
        animationType="slide"
        onRequestClose={() => setShowGifPicker(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Search GIFs</Text>
            <TouchableOpacity onPress={() => setShowGifPicker(false)}>
              <X size={22} color={colors.textPrimary} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>

          <View style={styles.searchBox}>
            <Search size={18} color={colors.textMuted} strokeWidth={2} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search GIFs…"
              placeholderTextColor={colors.textMuted}
              value={gifQuery}
              onChangeText={searchGifs}
              autoFocus
            />
            {gifSearching && <ActivityIndicator size="small" color={colors.primary} />}
          </View>
          <FlatList
            data={gifResults}
            keyExtractor={item => item.id}
            numColumns={2}
            columnWrapperStyle={styles.gifGrid}
            contentContainerStyle={{ padding: spacing.sm }}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.gifItem}
                onPress={() => selectGif(item.url)}
                activeOpacity={0.8}
              >
                <Image source={{ uri: item.preview }} style={styles.gifThumb} resizeMode="cover" />
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              gifSearching ? (
                <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} />
              ) : gifQuery.length > 0 ? (
                <Text style={styles.emptySearch}>No GIFs found for "{gifQuery}"</Text>
              ) : (
                <Text style={[styles.emptySearch, { marginTop: 60 }]}>Search for GIFs above</Text>
              )
            }
          />
        </View>
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
  handle: { fontSize: 13, color: colors.textMuted },
  visibilityBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#1E1E2E', paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: borderRadius.full, alignSelf: 'flex-start', marginTop: 2,
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.2)',
  },
  visibilityText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },

  inputWrapper: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 16,
    padding: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: 'rgba(139,92,246,0.03)',
  },
  contentInput: {
    fontSize: 18, color: colors.textPrimary, lineHeight: 26, minHeight: 80,
  },
  charCountRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  premiumBadgeRow: {
    backgroundColor: 'rgba(245,158,11,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  premiumLabel: { fontSize: 10, fontWeight: '700', color: '#F59E0B' },
  charCount: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  charCountWarn: { color: '#ef4444' },

  mentionDropdown: {
    backgroundColor: '#1A1A28',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.3)',
    borderRadius: 12,
    marginBottom: spacing.lg,
    overflow: 'hidden',
  },
  mentionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  mentionAvatar: { width: 30, height: 30, borderRadius: 15 },
  mentionAvatarFallback: { backgroundColor: '#2A2A3A', justifyContent: 'center', alignItems: 'center' },
  mentionUsername: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textPrimary },
  mentionAddr: { fontSize: 10, color: colors.textMuted },

  mediaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  mediaThumbWrap: {
    width: 90, height: 90, borderRadius: 12, overflow: 'hidden', position: 'relative',
  },
  mediaThumb: { width: '100%', height: '100%' },
  removeMediaBtn: {
    position: 'absolute', top: 5, right: 5,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center', alignItems: 'center',
  },
  addMoreMedia: {
    width: 90, height: 90, borderRadius: 12,
    borderWidth: 1.5, borderStyle: 'dashed',
    borderColor: 'rgba(139,92,246,0.4)',
    backgroundColor: 'rgba(139,92,246,0.04)',
    justifyContent: 'center', alignItems: 'center',
  },

  tokenCard: {
    flex: 1, backgroundColor: '#12121E', borderRadius: 16, padding: spacing.md,
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.2)', minHeight: 170, overflow: 'hidden',
    marginBottom: spacing.lg,
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

  mediaRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.xl },
  tokenPickerTrigger: {
    flex: 1, minHeight: 80, borderRadius: 16, borderWidth: 1.5,
    borderColor: 'rgba(139,92,246,0.3)', borderStyle: 'dashed',
    backgroundColor: 'rgba(139,92,246,0.04)',
    justifyContent: 'center', alignItems: 'center', gap: 8,
  },
  tokenPickerText: { fontSize: 14, fontWeight: '700', color: colors.primary },
  addMediaBox: {
    width: 110, borderRadius: 16, borderWidth: 1.5,
    borderColor: 'rgba(139,92,246,0.3)', borderStyle: 'dashed',
    justifyContent: 'center', alignItems: 'center', gap: 6,
    minHeight: 80, backgroundColor: 'rgba(139,92,246,0.04)',
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

  promTierCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.xl, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: 'rgba(139,92,246,0.08)',
  },
  promTierLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  promTierIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: 'rgba(139,92,246,0.12)',
    justifyContent: 'center', alignItems: 'center',
  },
  promTierLabel: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  promTierSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  promTierUsd: { fontSize: 16, fontWeight: '800', color: '#F59E0B' },
  promTierSol: { fontSize: 11, color: colors.textMuted, fontWeight: '500' },

  promConfirmCard: {
    marginHorizontal: spacing.xl, marginTop: spacing.xl,
    backgroundColor: '#12121E', borderRadius: 16,
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.15)',
    overflow: 'hidden',
  },
  promConfirmRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: 16,
  },
  promConfirmDivider: { height: 1, backgroundColor: 'rgba(139,92,246,0.08)' },
  promConfirmLabel: { fontSize: 14, color: colors.textMuted, fontWeight: '500' },
  promConfirmValue: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },

  promNotice: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    marginHorizontal: spacing.xl, marginTop: 16,
    backgroundColor: 'rgba(245,158,11,0.08)',
    borderRadius: 12, padding: 12,
  },
  promNoticeText: { flex: 1, fontSize: 12, color: colors.warning, lineHeight: 18 },

  promConfirmBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginHorizontal: spacing.xl, marginTop: 20,
    backgroundColor: colors.primary, borderRadius: borderRadius.full,
    paddingVertical: 15,
  },
  promConfirmBtnText: { fontSize: 16, fontWeight: '800', color: colors.white },
  pickerTitle: { fontSize: 17, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.lg },
  pickerOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(139,92,246,0.08)',
  },
  pickerOptionText: { fontSize: 16, fontWeight: '600', color: colors.textSecondary },
  pickerOptionActive: { color: colors.primary },

  // GIF preview
  gifPreviewWrap: {
    marginBottom: spacing.lg, borderRadius: 16, overflow: 'hidden', position: 'relative',
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)',
  },
  gifPreview: { width: '100%', height: 200 },
  removeGifBtn: {
    position: 'absolute', top: 8, right: 8,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center', alignItems: 'center',
  },

  // GIF picker
  gifNoKeyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, paddingHorizontal: spacing.xxl },
  gifNoKeyText: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
  gifNoKeySub: { fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
  gifGrid: { gap: spacing.sm, paddingHorizontal: spacing.sm },
  gifItem: { flex: 1, borderRadius: 12, overflow: 'hidden', margin: 4, minHeight: 90 },
  gifThumb: { width: '100%', height: 100, backgroundColor: '#1A1A2E' },

  // Poll composer
  pollComposer: {
    backgroundColor: '#12121E',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.2)',
    padding: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  pollHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm,
  },
  pollHeaderText: { fontSize: 13, fontWeight: '700', color: '#ef4444', flex: 1 },
  pollCloseBtn: { padding: 2 },
  pollOptionRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
  },
  pollOptionInput: {
    flex: 1,
    fontSize: 15, color: colors.textPrimary, fontWeight: '500',
    backgroundColor: '#1A1A2A',
    borderRadius: 10, borderWidth: 1, borderColor: 'rgba(139,92,246,0.2)',
    paddingHorizontal: spacing.md, paddingVertical: 10,
  },
  pollRemoveBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#2A2A3A', justifyContent: 'center', alignItems: 'center',
  },
  pollAddBtn: {
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', borderStyle: 'dashed',
    borderRadius: 8, paddingVertical: 8, alignItems: 'center',
  },
  pollAddBtnText: { fontSize: 13, fontWeight: '700', color: '#ef4444' },
  pollValidationText: { fontSize: 11, color: colors.textMuted, fontWeight: '500', textAlign: 'center' },
});
