import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  Image,
  Platform,
  Animated,
  KeyboardAvoidingView,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Rocket, Plus, TrendingUp, Sparkles, Clock, CircleCheck as CheckCircle2, ChevronRight, X, Upload, Globe, MessageCircle, Twitter, ExternalLink, Zap, Settings2, Star, Users, DollarSign, Lock, Flame, ArrowRight, Copy, CircleCheck as CheckCircleIcon } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { useWallet } from '@/contexts/WalletContext';
import { launchpadService, LaunchpadToken, LaunchpadStats } from '@/services/launchpadService';
import {
  tokenCreationService,
  EasyModeInput,
  AdvancedModeInput,
  TokenCreationProgress,
} from '@/services/tokenCreationService';
import { colors, spacing, borderRadius, fontSize, elevation } from '@/constants/theme';

type LaunchTab = 'trending' | 'new' | 'near_launch' | 'completed';

const LAUNCH_TABS: { key: LaunchTab; label: string; icon: typeof TrendingUp }[] = [
  { key: 'trending', label: 'Trending', icon: Flame },
  { key: 'new', label: 'New', icon: Sparkles },
  { key: 'near_launch', label: 'Near Launch', icon: Clock },
  { key: 'completed', label: 'Completed', icon: CheckCircle2 },
];

function formatSupply(n: number): string {
  if (n >= 1e12) return `${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── Create Token Modal ────────────────────────────────────────────────────────
interface CreateTokenModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: (mintAddress: string, txSig: string) => void;
  creatorWallet: string;
}

function CreateTokenModal({ visible, onClose, onSuccess, creatorWallet }: CreateTokenModalProps) {
  const [mode, setMode] = useState<'easy' | 'advanced'>('easy');
  const [step, setStep] = useState<'form' | 'progress' | 'done'>('form');

  // Easy mode fields
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [description, setDescription] = useState('');
  const [totalSupply, setTotalSupply] = useState('1000000000');
  const [website, setWebsite] = useState('');
  const [telegram, setTelegram] = useState('');
  const [twitter, setTwitter] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);

  // Advanced extra fields
  const [decimals, setDecimals] = useState('6');
  const [creatorAlloc, setCreatorAlloc] = useState('100000000');
  const [liquidityAlloc, setLiquidityAlloc] = useState('900000000');
  const [useToken2022, setUseToken2022] = useState(false);
  const [revokeMint, setRevokeMint] = useState(false);
  const [revokeFreeze, setRevokeFreeze] = useState(false);

  // Progress
  const [progress, setProgress] = useState<TokenCreationProgress | null>(null);
  const [result, setResult] = useState<{ mintAddress: string; txSig: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedMint, setCopiedMint] = useState(false);

  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (progress) {
      Animated.timing(progressAnim, {
        toValue: progress.step / progress.totalSteps,
        duration: 400,
        useNativeDriver: false,
      }).start();
    }
  }, [progress]);

  const reset = () => {
    setStep('form');
    setProgress(null);
    setResult(null);
    setError(null);
    setName('');
    setSymbol('');
    setDescription('');
    setTotalSupply('1000000000');
    setWebsite('');
    setTelegram('');
    setTwitter('');
    setImageUri(null);
    setDecimals('6');
    setCreatorAlloc('100000000');
    setLiquidityAlloc('900000000');
    setUseToken2022(false);
    setRevokeMint(false);
    setRevokeFreeze(false);
    progressAnim.setValue(0);
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo library access to upload a token logo.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!res.canceled && res.assets[0]) {
      setImageUri(res.assets[0].uri);
    }
  };

  const validate = (): string | null => {
    if (!name.trim()) return 'Token name is required';
    if (!symbol.trim()) return 'Token symbol is required';
    if (symbol.trim().length > 10) return 'Symbol must be 10 characters or less';
    if (!description.trim()) return 'Description is required';
    const supply = parseFloat(totalSupply);
    if (isNaN(supply) || supply <= 0) return 'Invalid total supply';
    if (mode === 'advanced') {
      const dec = parseInt(decimals);
      if (isNaN(dec) || dec < 0 || dec > 9) return 'Decimals must be 0–9';
      const cAlloc = parseFloat(creatorAlloc);
      const lAlloc = parseFloat(liquidityAlloc);
      if (isNaN(cAlloc) || cAlloc < 0) return 'Invalid creator allocation';
      if (isNaN(lAlloc) || lAlloc < 0) return 'Invalid liquidity allocation';
      if (cAlloc + lAlloc > supply) return 'Allocations exceed total supply';
    }
    return null;
  };

  const handleCreate = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setStep('progress');

    const supply = parseFloat(totalSupply);

    const input: EasyModeInput | AdvancedModeInput = mode === 'easy'
      ? {
          mode: 'easy',
          name: name.trim(),
          symbol: symbol.trim().toUpperCase(),
          description: description.trim(),
          totalSupply: supply,
          website: website.trim() || undefined,
          telegram: telegram.trim() || undefined,
          twitter: twitter.trim() || undefined,
          imageUri: imageUri ?? undefined,
        }
      : {
          mode: 'advanced',
          name: name.trim(),
          symbol: symbol.trim().toUpperCase(),
          description: description.trim(),
          totalSupply: supply,
          decimals: parseInt(decimals),
          creatorAllocation: parseFloat(creatorAlloc),
          liquidityAllocation: parseFloat(liquidityAlloc),
          website: website.trim() || undefined,
          telegram: telegram.trim() || undefined,
          twitter: twitter.trim() || undefined,
          useToken2022,
          revokeMintAuthority: revokeMint,
          revokeFreezeAuthority: revokeFreeze,
          imageUri: imageUri ?? undefined,
        };

    const res = await tokenCreationService.createToken(
      input,
      creatorWallet,
      async (tx, signers) => {
        // Signing is handled by SecureWalletManager / connected wallet.
        // For this modal, we surface the "sign" flow through an alert
        // since we don't have direct access to the mnemonic here.
        // The real signing will happen via the wallet provider in a future
        // sign-transaction integration; for now we return a mock signature
        // and let the service verify on-chain.
        throw new Error('Wallet signing not available in this context. Please use the send flow to sign transactions.');
      },
      (p) => setProgress(p),
      imageUri ?? undefined
    );

    if (res.success && res.mintAddress && res.txSignature) {
      setResult({ mintAddress: res.mintAddress, txSig: res.txSignature });
      setStep('done');
      onSuccess(res.mintAddress, res.txSignature);
    } else {
      setError(res.error ?? 'Token creation failed');
      setStep('form');
    }
  };

  const copyMint = async () => {
    if (result?.mintAddress) {
      await Clipboard.setStringAsync(result.mintAddress);
      setCopiedMint(true);
      setTimeout(() => setCopiedMint(false), 2000);
    }
  };

  const barWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <View style={styles.modalOverlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalKeyboardView}
        >
          <View style={styles.createModal}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderLeft}>
                <Rocket size={20} color={colors.primary} />
                <Text style={styles.modalTitle}>
                  {step === 'done' ? 'Token Launched!' : 'Launch Token'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => { reset(); onClose(); }}>
                <X size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {step === 'form' && (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.formScroll}>
                {/* Mode selector */}
                <View style={styles.modeSelector}>
                  <TouchableOpacity
                    style={[styles.modeBtn, mode === 'easy' && styles.modeBtnActive]}
                    onPress={() => setMode('easy')}
                  >
                    <Zap size={15} color={mode === 'easy' ? colors.white : colors.textMuted} />
                    <Text style={[styles.modeBtnText, mode === 'easy' && styles.modeBtnTextActive]}>Easy Mode</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modeBtn, mode === 'advanced' && styles.modeBtnActive]}
                    onPress={() => setMode('advanced')}
                  >
                    <Settings2 size={15} color={mode === 'advanced' ? colors.white : colors.textMuted} />
                    <Text style={[styles.modeBtnText, mode === 'advanced' && styles.modeBtnTextActive]}>Advanced</Text>
                  </TouchableOpacity>
                </View>

                {/* Logo upload */}
                <TouchableOpacity style={styles.logoUpload} onPress={pickImage}>
                  {imageUri ? (
                    <Image source={{ uri: imageUri }} style={styles.logoPreview} />
                  ) : (
                    <View style={styles.logoPlaceholder}>
                      <Upload size={24} color={colors.textMuted} />
                      <Text style={styles.logoPlaceholderText}>Upload Logo</Text>
                    </View>
                  )}
                </TouchableOpacity>

                {error && <Text style={styles.errorText}>{error}</Text>}

                <Text style={styles.fieldLabel}>Token Name *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. My Awesome Token"
                  placeholderTextColor={colors.textMuted}
                  value={name}
                  onChangeText={setName}
                />

                <Text style={styles.fieldLabel}>Symbol / Ticker *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. MAT"
                  placeholderTextColor={colors.textMuted}
                  value={symbol}
                  onChangeText={t => setSymbol(t.toUpperCase())}
                  maxLength={10}
                  autoCapitalize="characters"
                />

                <Text style={styles.fieldLabel}>Description *</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Describe your token..."
                  placeholderTextColor={colors.textMuted}
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  numberOfLines={3}
                />

                <Text style={styles.fieldLabel}>Total Supply *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="1000000000"
                  placeholderTextColor={colors.textMuted}
                  value={totalSupply}
                  onChangeText={setTotalSupply}
                  keyboardType="numeric"
                />

                {mode === 'advanced' && (
                  <>
                    <Text style={styles.fieldLabel}>Decimals (0–9)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="6"
                      placeholderTextColor={colors.textMuted}
                      value={decimals}
                      onChangeText={setDecimals}
                      keyboardType="numeric"
                      maxLength={1}
                    />

                    <Text style={styles.fieldLabel}>Creator Allocation</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="100000000"
                      placeholderTextColor={colors.textMuted}
                      value={creatorAlloc}
                      onChangeText={setCreatorAlloc}
                      keyboardType="numeric"
                    />

                    <Text style={styles.fieldLabel}>Liquidity Allocation</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="900000000"
                      placeholderTextColor={colors.textMuted}
                      value={liquidityAlloc}
                      onChangeText={setLiquidityAlloc}
                      keyboardType="numeric"
                    />

                    <View style={styles.toggleRow}>
                      <Text style={styles.toggleLabel}>Use Token-2022</Text>
                      <TouchableOpacity
                        style={[styles.toggle, useToken2022 && styles.toggleOn]}
                        onPress={() => setUseToken2022(v => !v)}
                      >
                        <View style={[styles.toggleKnob, useToken2022 && styles.toggleKnobOn]} />
                      </TouchableOpacity>
                    </View>

                    <View style={styles.toggleRow}>
                      <Text style={styles.toggleLabel}>Revoke Mint Authority</Text>
                      <TouchableOpacity
                        style={[styles.toggle, revokeMint && styles.toggleOn]}
                        onPress={() => setRevokeMint(v => !v)}
                      >
                        <View style={[styles.toggleKnob, revokeMint && styles.toggleKnobOn]} />
                      </TouchableOpacity>
                    </View>

                    <View style={styles.toggleRow}>
                      <Text style={styles.toggleLabel}>Revoke Freeze Authority</Text>
                      <TouchableOpacity
                        style={[styles.toggle, revokeFreeze && styles.toggleOn]}
                        onPress={() => setRevokeFreeze(v => !v)}
                      >
                        <View style={[styles.toggleKnob, revokeFreeze && styles.toggleKnobOn]} />
                      </TouchableOpacity>
                    </View>
                  </>
                )}

                <Text style={styles.sectionDivider}>Socials (optional)</Text>

                <View style={styles.socialRow}>
                  <Globe size={16} color={colors.textMuted} />
                  <TextInput
                    style={[styles.input, styles.socialInput]}
                    placeholder="Website URL"
                    placeholderTextColor={colors.textMuted}
                    value={website}
                    onChangeText={setWebsite}
                    autoCapitalize="none"
                  />
                </View>

                <View style={styles.socialRow}>
                  <MessageCircle size={16} color={colors.textMuted} />
                  <TextInput
                    style={[styles.input, styles.socialInput]}
                    placeholder="Telegram URL"
                    placeholderTextColor={colors.textMuted}
                    value={telegram}
                    onChangeText={setTelegram}
                    autoCapitalize="none"
                  />
                </View>

                <View style={styles.socialRow}>
                  <Twitter size={16} color={colors.textMuted} />
                  <TextInput
                    style={[styles.input, styles.socialInput]}
                    placeholder="Twitter / X URL"
                    placeholderTextColor={colors.textMuted}
                    value={twitter}
                    onChangeText={setTwitter}
                    autoCapitalize="none"
                  />
                </View>

                {/* Cost estimate */}
                <View style={styles.costCard}>
                  <View style={styles.costRow}>
                    <Text style={styles.costLabel}>Est. creation cost</Text>
                    <Text style={styles.costValue}>~0.022 SOL</Text>
                  </View>
                  <View style={styles.costRow}>
                    <Text style={styles.costLabel}>Platform fee</Text>
                    <Text style={styles.costValue}>0.02 SOL</Text>
                  </View>
                  <View style={styles.costRow}>
                    <Text style={styles.costLabel}>Mint rent exemption</Text>
                    <Text style={styles.costValue}>~0.002 SOL</Text>
                  </View>
                </View>

                <TouchableOpacity style={styles.launchButton} onPress={handleCreate}>
                  <LinearGradient
                    colors={[colors.primary, colors.primaryDark]}
                    style={styles.launchButtonGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  >
                    <Rocket size={18} color={colors.white} />
                    <Text style={styles.launchButtonText}>Launch Token</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </ScrollView>
            )}

            {step === 'progress' && progress && (
              <View style={styles.progressContainer}>
                <Rocket size={48} color={colors.primary} style={{ marginBottom: spacing.xl }} />
                <Text style={styles.progressTitle}>Launching Token...</Text>
                <Text style={styles.progressLabel}>{progress.label}</Text>
                <View style={styles.progressBar}>
                  <Animated.View style={[styles.progressFill, { width: barWidth }]} />
                </View>
                <Text style={styles.progressSteps}>
                  Step {progress.step} of {progress.totalSteps}
                </Text>
              </View>
            )}

            {step === 'done' && result && (
              <View style={styles.doneContainer}>
                <View style={styles.doneIcon}>
                  <CheckCircleIcon size={48} color={colors.success} />
                </View>
                <Text style={styles.doneTitle}>Token Launched!</Text>
                <Text style={styles.doneSubtitle}>Your token is live on Solana</Text>

                <View style={styles.mintAddressCard}>
                  <Text style={styles.mintAddressLabel}>Mint Address</Text>
                  <TouchableOpacity style={styles.mintAddressRow} onPress={copyMint}>
                    <Text style={styles.mintAddress} numberOfLines={1} ellipsizeMode="middle">
                      {result.mintAddress}
                    </Text>
                    {copiedMint
                      ? <CheckCircleIcon size={16} color={colors.success} />
                      : <Copy size={16} color={colors.textMuted} />
                    }
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.explorerButton}
                  onPress={() => {
                    // Opens Solscan in browser
                    if (Platform.OS === 'web') {
                      window.open(`https://solscan.io/tx/${result.txSig}`, '_blank');
                    }
                  }}
                >
                  <ExternalLink size={15} color={colors.primary} />
                  <Text style={styles.explorerButtonText}>View on Solscan</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.doneCloseButton}
                  onPress={() => { reset(); onClose(); }}
                >
                  <Text style={styles.doneCloseText}>Done</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ─── Token Card ───────────────────────────────────────────────────────────────
function LaunchTokenCard({ token, onPress }: { token: LaunchpadToken; onPress: () => void }) {
  const shortAddr = token.mint_address
    ? `${token.mint_address.slice(0, 6)}...${token.mint_address.slice(-4)}`
    : 'Pending...';

  return (
    <TouchableOpacity style={styles.tokenCard} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.tokenCardLeft}>
        {token.image_url ? (
          <Image source={{ uri: token.image_url }} style={styles.tokenLogo} />
        ) : (
          <View style={styles.tokenLogoFallback}>
            <Text style={styles.tokenLogoFallbackText}>{token.symbol.slice(0, 2)}</Text>
          </View>
        )}
        <View style={styles.tokenInfo}>
          <View style={styles.tokenNameRow}>
            <Text style={styles.tokenName}>{token.name}</Text>
            <View style={styles.tokenSymbolBadge}>
              <Text style={styles.tokenSymbolText}>{token.symbol}</Text>
            </View>
          </View>
          <Text style={styles.tokenAddr}>{shortAddr}</Text>
          {token.description ? (
            <Text style={styles.tokenDesc} numberOfLines={1}>{token.description}</Text>
          ) : null}
        </View>
      </View>
      <View style={styles.tokenCardRight}>
        <Text style={styles.tokenSupply}>{formatSupply(token.total_supply)}</Text>
        <Text style={styles.tokenAge}>{timeAgo(token.created_at)}</Text>
        <ChevronRight size={16} color={colors.textMuted} />
      </View>
    </TouchableOpacity>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function LaunchpadScreen() {
  const router = useRouter();
  const { activeAddress, activeWallet } = useWallet();

  const [activeTab, setActiveTab] = useState<LaunchTab>('new');
  const [tokens, setTokens] = useState<LaunchpadToken[]>([]);
  const [featured, setFeatured] = useState<LaunchpadToken | null>(null);
  const [stats, setStats] = useState<LaunchpadStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [successMint, setSuccessMint] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [tokenData, featuredData, statsData] = await Promise.allSettled([
        launchpadService.getTokens(activeTab),
        launchpadService.getFeatured(),
        launchpadService.getStats(),
      ]);
      if (tokenData.status === 'fulfilled') setTokens(tokenData.value);
      if (featuredData.status === 'fulfilled') setFeatured(featuredData.value);
      if (statsData.status === 'fulfilled') setStats(statsData.value);
    } catch (e) {
      console.warn('[Launchpad] loadData error:', e);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    setLoading(true);
    loadData();
  }, [loadData]);

  const handleTokenPress = (token: LaunchpadToken) => {
    if (token.mint_address) {
      router.push(`/token-detail/${token.mint_address}`);
    }
  };

  const handleCreateSuccess = (mintAddress: string, txSig: string) => {
    setSuccessMint(mintAddress);
    loadData();
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <LinearGradient colors={['#1A0B2E', '#12121A']} style={styles.header}>
        <View style={styles.headerContent}>
          <View>
            <View style={styles.headerTitleRow}>
              <Rocket size={22} color={colors.primary} />
              <Text style={styles.headerTitle}>Launchpad</Text>
            </View>
            <Text style={styles.headerSubtitle}>Launch real Solana tokens in minutes</Text>
          </View>
          <TouchableOpacity
            style={styles.createButton}
            onPress={() => {
              if (!activeAddress) {
                Alert.alert('Connect Wallet', 'Please connect your wallet to create a token.');
                return;
              }
              setShowCreate(true);
            }}
          >
            <LinearGradient
              colors={[colors.primary, colors.primaryDark]}
              style={styles.createButtonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Plus size={16} color={colors.white} />
              <Text style={styles.createButtonText}>Create</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Stats */}
        {stats && (
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats.totalLaunched}</Text>
              <Text style={styles.statLabel}>Launched</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats.last24h}</Text>
              <Text style={styles.statLabel}>Last 24h</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statCard}>
              <Text style={styles.statValue}>${(stats.totalVolume / 1000).toFixed(0)}K</Text>
              <Text style={styles.statLabel}>Volume</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statCard}>
              <Text style={[styles.statValue, { color: colors.success }]}>{stats.successRate}%</Text>
              <Text style={styles.statLabel}>Success</Text>
            </View>
          </View>
        )}
      </LinearGradient>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.contentContainer}
      >
        {/* Featured Launch */}
        {featured && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Star size={16} color={colors.warning} />
              <Text style={styles.sectionTitle}>Featured Launch</Text>
            </View>
            <TouchableOpacity
              style={styles.featuredCard}
              onPress={() => handleTokenPress(featured)}
              activeOpacity={0.9}
            >
              <LinearGradient
                colors={['rgba(139,92,246,0.25)', 'rgba(109,40,217,0.15)', 'rgba(13,6,24,0.6)']}
                style={styles.featuredGradient}
              >
                <View style={styles.featuredContent}>
                  {featured.image_url ? (
                    <Image source={{ uri: featured.image_url }} style={styles.featuredLogo} />
                  ) : (
                    <View style={styles.featuredLogoFallback}>
                      <Text style={styles.featuredLogoText}>{featured.symbol.slice(0, 2)}</Text>
                    </View>
                  )}
                  <View style={styles.featuredInfo}>
                    <View style={styles.featuredBadge}>
                      <Zap size={10} color={colors.warning} />
                      <Text style={styles.featuredBadgeText}>NEW LAUNCH</Text>
                    </View>
                    <Text style={styles.featuredName}>{featured.name}</Text>
                    <Text style={styles.featuredSymbol}>{featured.symbol}</Text>
                    {featured.description ? (
                      <Text style={styles.featuredDesc} numberOfLines={2}>
                        {featured.description}
                      </Text>
                    ) : null}
                    <View style={styles.featuredMeta}>
                      <View style={styles.featuredMetaItem}>
                        <DollarSign size={12} color={colors.textMuted} />
                        <Text style={styles.featuredMetaText}>
                          Supply: {formatSupply(featured.total_supply)}
                        </Text>
                      </View>
                      <View style={styles.featuredMetaItem}>
                        <Clock size={12} color={colors.textMuted} />
                        <Text style={styles.featuredMetaText}>{timeAgo(featured.created_at)}</Text>
                      </View>
                    </View>
                  </View>
                  <ChevronRight size={20} color={colors.primary} />
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}

        {/* Tab bar */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabBarContainer}
          style={styles.tabBar}
        >
          {LAUNCH_TABS.map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tab, active && styles.tabActive]}
                onPress={() => setActiveTab(tab.key)}
              >
                <Icon size={14} color={active ? colors.primary : colors.textMuted} />
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Token List */}
        <View style={styles.section}>
          {loading ? (
            <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 48 }} />
          ) : tokens.length === 0 ? (
            <View style={styles.emptyState}>
              <Rocket size={48} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No tokens yet</Text>
              <Text style={styles.emptySubtitle}>Be the first to launch on DAWEN</Text>
              <TouchableOpacity
                style={styles.emptyCreateButton}
                onPress={() => {
                  if (!activeAddress) {
                    Alert.alert('Connect Wallet', 'Please connect your wallet to create a token.');
                    return;
                  }
                  setShowCreate(true);
                }}
              >
                <Plus size={16} color={colors.white} />
                <Text style={styles.emptyCreateText}>Create Token</Text>
              </TouchableOpacity>
            </View>
          ) : (
            tokens.map(token => (
              <LaunchTokenCard
                key={token.id}
                token={token}
                onPress={() => handleTokenPress(token)}
              />
            ))
          )}
        </View>

        {/* CTA Section */}
        <View style={styles.ctaSection}>
          <LinearGradient
            colors={['rgba(139,92,246,0.2)', 'rgba(109,40,217,0.1)', 'rgba(13,6,24,0)']}
            style={styles.ctaGradient}
          >
            <View style={styles.ctaIcon}>
              <Rocket size={32} color={colors.primary} />
            </View>
            <Text style={styles.ctaTitle}>Launch Your Token</Text>
            <Text style={styles.ctaSubtitle}>
              Create a real Solana token with metadata, supply, and socials in minutes.
              No coding required.
            </Text>

            <View style={styles.ctaFeatures}>
              {[
                { icon: Zap, text: 'Easy or Advanced mode' },
                { icon: Lock, text: 'Non-custodial — your keys only' },
                { icon: Star, text: 'SPL Token & Token-2022 support' },
                { icon: Users, text: 'Auto-registered & searchable' },
              ].map((f, i) => (
                <View key={i} style={styles.ctaFeatureRow}>
                  <f.icon size={14} color={colors.primary} />
                  <Text style={styles.ctaFeatureText}>{f.text}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={styles.ctaButton}
              onPress={() => {
                if (!activeAddress) {
                  Alert.alert('Connect Wallet', 'Please connect your wallet to create a token.');
                  return;
                }
                setShowCreate(true);
              }}
            >
              <LinearGradient
                colors={[colors.primary, colors.primaryDark]}
                style={styles.ctaButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Rocket size={16} color={colors.white} />
                <Text style={styles.ctaButtonText}>Start Now</Text>
                <ArrowRight size={16} color={colors.white} />
              </LinearGradient>
            </TouchableOpacity>
          </LinearGradient>
        </View>
      </ScrollView>

      {/* Create Token Modal */}
      <CreateTokenModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onSuccess={handleCreateSuccess}
        creatorWallet={activeAddress ?? ''}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // Header
  header: {
    paddingTop: 56,
    paddingHorizontal: spacing.xxl,
    paddingBottom: spacing.lg,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.lg,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  createButton: {
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  createButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  createButtonText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.white,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorderLight,
    overflow: 'hidden',
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  statDivider: {
    width: 1,
    backgroundColor: colors.surfaceBorder,
  },
  statValue: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  statLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },

  // Content
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 40,
  },

  // Section
  section: {
    paddingHorizontal: spacing.xxl,
    marginTop: spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
  },

  // Featured Card
  featuredCard: {
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.surfaceBorderLight,
    ...elevation.md,
  },
  featuredGradient: {
    padding: spacing.lg,
  },
  featuredContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  featuredLogo: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
  },
  featuredLogoFallback: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featuredLogoText: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.primary,
  },
  featuredInfo: {
    flex: 1,
    gap: 4,
  },
  featuredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(245,158,11,0.15)',
    borderRadius: borderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  featuredBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.warning,
    letterSpacing: 0.5,
  },
  featuredName: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  featuredSymbol: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: '600',
  },
  featuredDesc: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  featuredMeta: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: 4,
  },
  featuredMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  featuredMetaText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },

  // Tab bar
  tabBar: {
    marginTop: spacing.xl,
  },
  tabBarContainer: {
    paddingHorizontal: spacing.xxl,
    gap: spacing.sm,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  tabActive: {
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primary,
  },
  tabText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.primary,
  },

  // Token Card
  tokenCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...elevation.sm,
  },
  tokenCardLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  tokenLogo: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceLight,
  },
  tokenLogoFallback: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tokenLogoFallbackText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.primary,
  },
  tokenInfo: {
    flex: 1,
    gap: 2,
  },
  tokenNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  tokenName: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  tokenSymbolBadge: {
    backgroundColor: colors.primaryMuted,
    borderRadius: borderRadius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  tokenSymbolText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primary,
  },
  tokenAddr: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
  },
  tokenDesc: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  tokenCardRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  tokenSupply: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  tokenAge: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: spacing.md,
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  emptySubtitle: {
    fontSize: fontSize.md,
    color: colors.textMuted,
  },
  emptyCreateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.md,
    marginTop: spacing.md,
  },
  emptyCreateText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.white,
  },

  // CTA Section
  ctaSection: {
    paddingHorizontal: spacing.xxl,
    marginTop: spacing.xxl,
  },
  ctaGradient: {
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.surfaceBorderLight,
    padding: spacing.xxl,
    alignItems: 'center',
  },
  ctaIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    ...elevation.glow,
  },
  ctaTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  ctaSubtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.xl,
  },
  ctaFeatures: {
    alignSelf: 'stretch',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  ctaFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  ctaFeatureText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  ctaButton: {
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    alignSelf: 'stretch',
  },
  ctaButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  ctaButtonText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.white,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  modalKeyboardView: {
    justifyContent: 'flex-end',
  },
  createModal: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorderLight,
    maxHeight: '92%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.xxl,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  formScroll: {
    padding: spacing.xxl,
    paddingBottom: 48,
  },

  // Mode selector
  modeSelector: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    padding: 4,
    marginBottom: spacing.xl,
  },
  modeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  modeBtnActive: {
    backgroundColor: colors.primary,
  },
  modeBtnText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textMuted,
  },
  modeBtnTextActive: {
    color: colors.white,
  },

  // Logo upload
  logoUpload: {
    alignSelf: 'center',
    marginBottom: spacing.xl,
  },
  logoPreview: {
    width: 80,
    height: 80,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surfaceLight,
  },
  logoPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surfaceLight,
    borderWidth: 2,
    borderColor: colors.surfaceBorderLight,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  logoPlaceholderText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },

  // Form fields
  errorText: {
    fontSize: fontSize.sm,
    color: colors.error,
    backgroundColor: colors.errorMuted,
    borderRadius: borderRadius.sm,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  fieldLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    fontSize: fontSize.md,
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  socialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 0,
  },
  socialInput: {
    flex: 1,
    marginBottom: spacing.lg,
  },
  sectionDivider: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.lg,
    marginTop: spacing.sm,
  },

  // Toggles
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
    marginBottom: spacing.md,
  },
  toggleLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  toggle: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.surfaceLight,
    padding: 2,
    justifyContent: 'center',
  },
  toggleOn: {
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  toggleKnob: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.textMuted,
  },
  toggleKnobOn: {
    backgroundColor: colors.primary,
    alignSelf: 'flex-end',
  },

  // Cost card
  costCard: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  costRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  costLabel: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  costValue: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
  },

  // Launch button
  launchButton: {
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  launchButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  launchButtonText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.white,
  },

  // Progress
  progressContainer: {
    padding: spacing.xxxl,
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 300,
    justifyContent: 'center',
  },
  progressTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  progressLabel: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  progressBar: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.surfaceLight,
    overflow: 'hidden',
    marginVertical: spacing.md,
  },
  progressFill: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  progressSteps: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },

  // Done
  doneContainer: {
    padding: spacing.xxxl,
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 360,
    justifyContent: 'center',
  },
  doneIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.successMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  doneTitle: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  doneSubtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
  },
  mintAddressCard: {
    alignSelf: 'stretch',
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  mintAddressLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  mintAddressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  mintAddress: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
  },
  explorerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorderLight,
    backgroundColor: colors.primaryMuted,
  },
  explorerButtonText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.primary,
  },
  doneCloseButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xxxl,
    borderRadius: borderRadius.md,
    marginTop: spacing.sm,
  },
  doneCloseText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.white,
  },
});
