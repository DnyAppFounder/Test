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
  Dimensions,
  SafeAreaView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Rocket, Plus, Sparkles, Clock, CircleCheck as CheckCircle2, ChevronRight, X, Upload, Globe, MessageCircle, Twitter, ExternalLink, Zap, Settings2, Star, DollarSign, Lock, Flame, ArrowRight, Copy, CircleCheck as CheckCircleIcon, ChartBar as BarChart3, TrendingUp, TrendingDown, Users } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { useWallet } from '@/contexts/WalletContext';
import { launchpadService, LaunchpadToken, LaunchpadStats } from '@/services/launchpadService';
import {
  tokenCreationService,
  EasyModeInput,
  AdvancedModeInput,
  TokenCreationProgress,
} from '@/services/tokenCreationService';
import {
  presaleService,
  Presale,
  validatePresaleInput,
  computePresaleStatus,
  getPresaleProgress,
  formatTimeRemaining,
} from '@/services/presaleService';
import { colors, spacing, borderRadius, fontSize, elevation } from '@/constants/theme';

const { width: SCREEN_W } = Dimensions.get('window');

type LaunchTab = 'featured' | 'trending' | 'new' | 'near_launch' | 'completed';

const LAUNCH_TABS: { key: LaunchTab; label: string }[] = [
  { key: 'featured', label: 'Featured' },
  { key: 'trending', label: 'Trending' },
  { key: 'new', label: 'New' },
  { key: 'near_launch', label: 'Near Launch' },
  { key: 'completed', label: 'Completed' },
];

function fmtUsd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n <= 0) return '$0';
  return `$${n.toExponential(3)}`;
}

function fmtPrice(n: number): string {
  if (!n || n <= 0) return '$0';
  if (n >= 1) return `$${n.toFixed(4)}`;
  if (n >= 0.0001) return `$${n.toFixed(6)}`;
  const exp = n.toExponential(3);
  return `$${exp}`;
}

function fmtSupply(n: number): string {
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

// ─── Setup Presale Modal ──────────────────────────────────────────────────────
interface SetupPresaleModalProps {
  visible: boolean;
  tokenId: string;
  tokenSymbol: string;
  totalSupply: number;
  onClose: () => void;
  onSuccess: (presaleId: string) => void;
}

function SetupPresaleModal({ visible, tokenId, tokenSymbol, totalSupply, onClose, onSuccess }: SetupPresaleModalProps) {
  const router = useRouter();
  const [softCap, setSoftCap] = useState('5');
  const [hardCap, setHardCap] = useState('50');
  const [minBuy, setMinBuy] = useState('0.1');
  const [maxBuy, setMaxBuy] = useState('5');
  const [launchPrice, setLaunchPrice] = useState('0.000003');
  const [listingPrice, setListingPrice] = useState('0.000005');
  const [tokensForSale, setTokensForSale] = useState(String(Math.floor(totalSupply * 0.5)));
  const [liquidityPct, setLiquidityPct] = useState('60');
  const [unsold, setUnsold] = useState<'burn' | 'return'>('burn');
  const [startNow, setStartNow] = useState(true);
  const [durationDays, setDurationDays] = useState('7');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    const startAt = startNow ? new Date() : new Date(Date.now() + 60 * 60 * 1000);
    const endAt = new Date(startAt.getTime() + parseFloat(durationDays) * 86_400_000);

    const input = {
      tokenId,
      softCap: parseFloat(softCap),
      hardCap: parseFloat(hardCap),
      minBuy: parseFloat(minBuy),
      maxBuy: parseFloat(maxBuy),
      launchPrice: parseFloat(launchPrice),
      listingPrice: parseFloat(listingPrice),
      tokensForSale: parseFloat(tokensForSale),
      liquidityPercent: parseInt(liquidityPct),
      unsoldBehavior: unsold,
      startAt,
      endAt,
    };

    const validationError = validatePresaleInput(input);
    if (validationError) { setError(validationError); return; }

    setError(null);
    setLoading(true);
    const ps = await presaleService.createPresale(input);
    setLoading(false);

    if (!ps) { setError('Failed to create presale'); return; }
    onSuccess(ps.id);
    router.push(`/launchpad/${ps.id}`);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} statusBarTranslucent>
      <SafeAreaView style={mStyles.safeArea}>
        <View style={mStyles.header}>
          <TouchableOpacity onPress={onClose} style={mStyles.backBtn}>
            <X size={22} color={colors.textMuted} />
          </TouchableOpacity>
          <View style={mStyles.headerCenter}>
            <Zap size={16} color={colors.warning} />
            <Text style={mStyles.headerTitle}>Setup Presale</Text>
          </View>
          <View style={mStyles.headerRight} />
        </View>

        <ScrollView style={mStyles.flex} contentContainerStyle={mStyles.formContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {error ? <Text style={mStyles.errorText}>{error}</Text> : null}

          <View style={psStyles.infoCard}>
            <Zap size={14} color={colors.warning} />
            <Text style={psStyles.infoText}>Configure your presale for <Text style={{ color: colors.primary, fontWeight: '700' }}>{tokenSymbol}</Text>. Buyers send SOL and receive tokens after finalization.</Text>
          </View>

          <Text style={mStyles.label}>Soft Cap (SOL) *</Text>
          <TextInput style={mStyles.input} placeholder="5" placeholderTextColor={colors.textMuted} value={softCap} onChangeText={setSoftCap} keyboardType="decimal-pad" />

          <Text style={mStyles.label}>Hard Cap (SOL) *</Text>
          <TextInput style={mStyles.input} placeholder="50" placeholderTextColor={colors.textMuted} value={hardCap} onChangeText={setHardCap} keyboardType="decimal-pad" />

          <View style={psStyles.row}>
            <View style={psStyles.halfField}>
              <Text style={mStyles.label}>Min Buy (SOL)</Text>
              <TextInput style={mStyles.input} placeholder="0.1" placeholderTextColor={colors.textMuted} value={minBuy} onChangeText={setMinBuy} keyboardType="decimal-pad" />
            </View>
            <View style={psStyles.halfField}>
              <Text style={mStyles.label}>Max Buy (SOL)</Text>
              <TextInput style={mStyles.input} placeholder="5" placeholderTextColor={colors.textMuted} value={maxBuy} onChangeText={setMaxBuy} keyboardType="decimal-pad" />
            </View>
          </View>

          <View style={psStyles.row}>
            <View style={psStyles.halfField}>
              <Text style={mStyles.label}>Launch Price ($)</Text>
              <TextInput style={mStyles.input} placeholder="0.000003" placeholderTextColor={colors.textMuted} value={launchPrice} onChangeText={setLaunchPrice} keyboardType="decimal-pad" />
            </View>
            <View style={psStyles.halfField}>
              <Text style={mStyles.label}>Listing Price ($)</Text>
              <TextInput style={mStyles.input} placeholder="0.000005" placeholderTextColor={colors.textMuted} value={listingPrice} onChangeText={setListingPrice} keyboardType="decimal-pad" />
            </View>
          </View>

          <Text style={mStyles.label}>Tokens for Sale</Text>
          <TextInput style={mStyles.input} placeholder={String(Math.floor(totalSupply * 0.5))} placeholderTextColor={colors.textMuted} value={tokensForSale} onChangeText={setTokensForSale} keyboardType="numeric" />

          <Text style={mStyles.label}>Liquidity % (10–95)</Text>
          <TextInput style={mStyles.input} placeholder="60" placeholderTextColor={colors.textMuted} value={liquidityPct} onChangeText={setLiquidityPct} keyboardType="numeric" maxLength={2} />

          <Text style={mStyles.label}>Duration (days)</Text>
          <TextInput style={mStyles.input} placeholder="7" placeholderTextColor={colors.textMuted} value={durationDays} onChangeText={setDurationDays} keyboardType="numeric" />

          <Text style={mStyles.label}>Unsold Tokens</Text>
          <View style={mStyles.modeSelector}>
            {(['burn', 'return'] as const).map(opt => (
              <TouchableOpacity key={opt} style={[mStyles.modeBtn, unsold === opt && mStyles.modeBtnActive]} onPress={() => setUnsold(opt)}>
                <Text style={[mStyles.modeBtnText, unsold === opt && mStyles.modeBtnTextActive]}>
                  {opt === 'burn' ? 'Burn Unsold' : 'Return to Creator'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={mStyles.toggleRow}>
            <Text style={mStyles.toggleLabel}>Start immediately</Text>
            <TouchableOpacity style={[mStyles.toggle, startNow && mStyles.toggleOn]} onPress={() => setStartNow(v => !v)}>
              <View style={[mStyles.toggleKnob, startNow && mStyles.toggleKnobOn]} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={handleCreate} style={mStyles.launchBtn} disabled={loading}>
            {loading
              ? <ActivityIndicator color="#fff" style={{ paddingVertical: 14 }} />
              : (
                <LinearGradient colors={['#F59E0B', '#D97706']} style={mStyles.launchBtnGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                  <Zap size={18} color="#fff" />
                  <Text style={mStyles.launchBtnText}>Create Presale</Text>
                </LinearGradient>
              )
            }
          </TouchableOpacity>

          <TouchableOpacity onPress={onClose} style={psStyles.skipBtn}>
            <Text style={psStyles.skipBtnText}>Skip for now</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
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
  const [step, setStep] = useState<'form' | 'progress' | 'done' | 'presale'>('form');
  const [createdTokenId, setCreatedTokenId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [description, setDescription] = useState('');
  const [totalSupply, setTotalSupply] = useState('1000000000');
  const [website, setWebsite] = useState('');
  const [telegram, setTelegram] = useState('');
  const [twitter, setTwitter] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);

  const [decimals, setDecimals] = useState('6');
  const [creatorAlloc, setCreatorAlloc] = useState('100000000');
  const [liquidityAlloc, setLiquidityAlloc] = useState('900000000');
  const [useToken2022, setUseToken2022] = useState(false);
  const [revokeMint, setRevokeMint] = useState(false);
  const [revokeFreeze, setRevokeFreeze] = useState(false);

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
    setStep('form'); setProgress(null); setResult(null); setError(null);
    setCreatedTokenId(null);
    setName(''); setSymbol(''); setDescription(''); setTotalSupply('1000000000');
    setWebsite(''); setTelegram(''); setTwitter(''); setImageUri(null);
    setDecimals('6'); setCreatorAlloc('100000000'); setLiquidityAlloc('900000000');
    setUseToken2022(false); setRevokeMint(false); setRevokeFreeze(false);
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
    if (!res.canceled && res.assets[0]) setImageUri(res.assets[0].uri);
  };

  const validate = (): string | null => {
    if (!name.trim()) return 'Token name is required';
    if (!symbol.trim()) return 'Token symbol is required';
    if (symbol.trim().length > 10) return 'Symbol must be 10 chars or less';
    if (!description.trim()) return 'Description is required';
    const supply = parseFloat(totalSupply);
    if (isNaN(supply) || supply <= 0) return 'Invalid total supply';
    if (mode === 'advanced') {
      const dec = parseInt(decimals);
      if (isNaN(dec) || dec < 0 || dec > 9) return 'Decimals must be 0–9';
      const ca = parseFloat(creatorAlloc), la = parseFloat(liquidityAlloc);
      if (isNaN(ca) || ca < 0) return 'Invalid creator allocation';
      if (isNaN(la) || la < 0) return 'Invalid liquidity allocation';
      if (ca + la > supply) return 'Allocations exceed total supply';
    }
    return null;
  };

  const handleCreate = async () => {
    const err = validate();
    if (err) { setError(err); return; }
    setError(null);
    setStep('progress');
    const supply = parseFloat(totalSupply);

    const input: EasyModeInput | AdvancedModeInput = mode === 'easy'
      ? { mode: 'easy', name: name.trim(), symbol: symbol.trim().toUpperCase(), description: description.trim(), totalSupply: supply, website: website.trim() || undefined, telegram: telegram.trim() || undefined, twitter: twitter.trim() || undefined, imageUri: imageUri ?? undefined }
      : { mode: 'advanced', name: name.trim(), symbol: symbol.trim().toUpperCase(), description: description.trim(), totalSupply: supply, decimals: parseInt(decimals), creatorAllocation: parseFloat(creatorAlloc), liquidityAllocation: parseFloat(liquidityAlloc), website: website.trim() || undefined, telegram: telegram.trim() || undefined, twitter: twitter.trim() || undefined, useToken2022, revokeMintAuthority: revokeMint, revokeFreezeAuthority: revokeFreeze, imageUri: imageUri ?? undefined };

    const res = await tokenCreationService.createToken(
      input,
      creatorWallet,
      async () => { throw new Error('Wallet signing not available in this context. Please use the send flow to sign transactions.'); },
      (p) => setProgress(p),
      imageUri ?? undefined
    );

    if (res.success && res.mintAddress && res.txSignature) {
      setResult({ mintAddress: res.mintAddress, txSig: res.txSignature });
      if (res.tokenId) setCreatedTokenId(res.tokenId);
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

  const barWidth = progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <Modal visible={visible} animationType="slide" transparent={false} statusBarTranslucent>
      <SafeAreaView style={mStyles.safeArea}>
        <KeyboardAvoidingView
          style={mStyles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          {/* Fixed header */}
          <View style={mStyles.header}>
            <TouchableOpacity onPress={() => { reset(); onClose(); }} style={mStyles.backBtn}>
              <X size={22} color={colors.textMuted} />
            </TouchableOpacity>
            <View style={mStyles.headerCenter}>
              <Rocket size={18} color={colors.primary} />
              <Text style={mStyles.headerTitle}>
                {step === 'done' ? 'Token Launched!' : 'Launch Token'}
              </Text>
            </View>
            <View style={mStyles.headerRight} />
          </View>

          {step === 'form' && (
            <ScrollView
              style={mStyles.flex}
              contentContainerStyle={mStyles.formContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Mode selector */}
              <View style={mStyles.modeSelector}>
                {(['easy', 'advanced'] as const).map(m => (
                  <TouchableOpacity
                    key={m}
                    style={[mStyles.modeBtn, mode === m && mStyles.modeBtnActive]}
                    onPress={() => setMode(m)}
                  >
                    {m === 'easy'
                      ? <Zap size={14} color={mode === m ? colors.white : colors.textMuted} />
                      : <Settings2 size={14} color={mode === m ? colors.white : colors.textMuted} />
                    }
                    <Text style={[mStyles.modeBtnText, mode === m && mStyles.modeBtnTextActive]}>
                      {m === 'easy' ? 'Easy Mode' : 'Advanced'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Logo */}
              <TouchableOpacity style={mStyles.logoUpload} onPress={pickImage}>
                {imageUri
                  ? <Image source={{ uri: imageUri }} style={mStyles.logoPreview} />
                  : (
                    <View style={mStyles.logoPlaceholder}>
                      <Upload size={22} color={colors.textMuted} />
                      <Text style={mStyles.logoPlaceholderText}>Upload Logo</Text>
                    </View>
                  )
                }
              </TouchableOpacity>

              {error ? <Text style={mStyles.errorText}>{error}</Text> : null}

              <Text style={mStyles.label}>Token Name *</Text>
              <TextInput style={mStyles.input} placeholder="e.g. My Token" placeholderTextColor={colors.textMuted} value={name} onChangeText={setName} />

              <Text style={mStyles.label}>Symbol *</Text>
              <TextInput style={mStyles.input} placeholder="e.g. MTK" placeholderTextColor={colors.textMuted} value={symbol} onChangeText={t => setSymbol(t.toUpperCase())} maxLength={10} autoCapitalize="characters" />

              <Text style={mStyles.label}>Description *</Text>
              <TextInput style={[mStyles.input, mStyles.textArea]} placeholder="Describe your token..." placeholderTextColor={colors.textMuted} value={description} onChangeText={setDescription} multiline numberOfLines={3} textAlignVertical="top" />

              <Text style={mStyles.label}>Total Supply *</Text>
              <TextInput style={mStyles.input} placeholder="1000000000" placeholderTextColor={colors.textMuted} value={totalSupply} onChangeText={setTotalSupply} keyboardType="numeric" />

              {mode === 'advanced' && (
                <>
                  <Text style={mStyles.label}>Decimals (0–9)</Text>
                  <TextInput style={mStyles.input} placeholder="6" placeholderTextColor={colors.textMuted} value={decimals} onChangeText={setDecimals} keyboardType="numeric" maxLength={1} />

                  <Text style={mStyles.label}>Creator Allocation</Text>
                  <TextInput style={mStyles.input} placeholder="100000000" placeholderTextColor={colors.textMuted} value={creatorAlloc} onChangeText={setCreatorAlloc} keyboardType="numeric" />

                  <Text style={mStyles.label}>Liquidity Allocation</Text>
                  <TextInput style={mStyles.input} placeholder="900000000" placeholderTextColor={colors.textMuted} value={liquidityAlloc} onChangeText={setLiquidityAlloc} keyboardType="numeric" />

                  {[
                    { label: 'Use Token-2022', val: useToken2022, set: setUseToken2022 },
                    { label: 'Revoke Mint Authority', val: revokeMint, set: setRevokeMint },
                    { label: 'Revoke Freeze Authority', val: revokeFreeze, set: setRevokeFreeze },
                  ].map(row => (
                    <View key={row.label} style={mStyles.toggleRow}>
                      <Text style={mStyles.toggleLabel}>{row.label}</Text>
                      <TouchableOpacity style={[mStyles.toggle, row.val && mStyles.toggleOn]} onPress={() => row.set(v => !v)}>
                        <View style={[mStyles.toggleKnob, row.val && mStyles.toggleKnobOn]} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </>
              )}

              <Text style={mStyles.divider}>Socials (optional)</Text>

              <View style={mStyles.socialRow}>
                <Globe size={16} color={colors.textMuted} />
                <TextInput style={mStyles.socialInput} placeholder="Website URL" placeholderTextColor={colors.textMuted} value={website} onChangeText={setWebsite} autoCapitalize="none" />
              </View>
              <View style={mStyles.socialRow}>
                <MessageCircle size={16} color={colors.textMuted} />
                <TextInput style={mStyles.socialInput} placeholder="Telegram URL" placeholderTextColor={colors.textMuted} value={telegram} onChangeText={setTelegram} autoCapitalize="none" />
              </View>
              <View style={mStyles.socialRow}>
                <Twitter size={16} color={colors.textMuted} />
                <TextInput style={mStyles.socialInput} placeholder="Twitter / X URL" placeholderTextColor={colors.textMuted} value={twitter} onChangeText={setTwitter} autoCapitalize="none" />
              </View>

              {/* Cost estimate */}
              <View style={mStyles.costCard}>
                <Text style={mStyles.costTitle}>Estimated Cost</Text>
                {[
                  ['Mint rent exemption', '~0.002 SOL'],
                  ['Platform fee', '0.02 SOL'],
                  ['Network fee', '~0.000005 SOL'],
                  ['Total', '~0.022 SOL'],
                ].map(([label, val]) => (
                  <View key={label} style={mStyles.costRow}>
                    <Text style={mStyles.costLabel}>{label}</Text>
                    <Text style={[mStyles.costValue, label === 'Total' && { color: colors.primary }]}>{val}</Text>
                  </View>
                ))}
              </View>

              <TouchableOpacity onPress={handleCreate} style={mStyles.launchBtn}>
                <LinearGradient colors={[colors.primary, colors.primaryDark]} style={mStyles.launchBtnGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                  <Rocket size={18} color="#fff" />
                  <Text style={mStyles.launchBtnText}>Launch Token</Text>
                </LinearGradient>
              </TouchableOpacity>
            </ScrollView>
          )}

          {step === 'progress' && progress && (
            <View style={mStyles.progressContainer}>
              <View style={mStyles.progressIconWrap}>
                <Rocket size={40} color={colors.primary} />
              </View>
              <Text style={mStyles.progressTitle}>Launching Token…</Text>
              <Text style={mStyles.progressLabel}>{progress.label}</Text>
              <View style={mStyles.progressBar}>
                <Animated.View style={[mStyles.progressFill, { width: barWidth }]} />
              </View>
              <Text style={mStyles.progressSteps}>Step {progress.step} of {progress.totalSteps}</Text>
            </View>
          )}

          {step === 'done' && result && (
            <ScrollView contentContainerStyle={mStyles.doneContainer} showsVerticalScrollIndicator={false}>
              <View style={mStyles.doneIconWrap}>
                <CheckCircleIcon size={48} color={colors.success} />
              </View>
              <Text style={mStyles.doneTitle}>Token Launched!</Text>
              <Text style={mStyles.doneSubtitle}>Your token is live on Solana</Text>

              <View style={mStyles.mintCard}>
                <Text style={mStyles.mintLabel}>Mint Address</Text>
                <TouchableOpacity style={mStyles.mintRow} onPress={copyMint}>
                  <Text style={mStyles.mintAddr} numberOfLines={1} ellipsizeMode="middle">{result.mintAddress}</Text>
                  {copiedMint
                    ? <CheckCircleIcon size={16} color={colors.success} />
                    : <Copy size={16} color={colors.textMuted} />
                  }
                </TouchableOpacity>
              </View>

              {Platform.OS === 'web' && (
                <TouchableOpacity style={mStyles.explorerBtn} onPress={() => (window as any).open(`https://solscan.io/tx/${result.txSig}`, '_blank')}>
                  <ExternalLink size={14} color={colors.primary} />
                  <Text style={mStyles.explorerBtnText}>View on Solscan</Text>
                </TouchableOpacity>
              )}

              {/* Setup Presale CTA */}
              {createdTokenId && (
                <TouchableOpacity
                  style={mStyles.presaleCta}
                  onPress={() => setStep('presale')}
                >
                  <LinearGradient
                    colors={['rgba(245,158,11,0.2)', 'rgba(217,119,6,0.1)']}
                    style={mStyles.presaleCtaGrad}
                  >
                    <Zap size={20} color={colors.warning} />
                    <View style={{ flex: 1 }}>
                      <Text style={mStyles.presaleCtaTitle}>Setup Presale</Text>
                      <Text style={mStyles.presaleCtaSub}>Create a presale to raise SOL before listing</Text>
                    </View>
                    <ChevronRight size={18} color={colors.warning} />
                  </LinearGradient>
                </TouchableOpacity>
              )}

              <TouchableOpacity style={mStyles.doneClose} onPress={() => { reset(); onClose(); }}>
                <Text style={mStyles.doneCloseText}>Done</Text>
              </TouchableOpacity>
            </ScrollView>
          )}

          {step === 'presale' && createdTokenId && (
            <SetupPresaleModal
              visible={true}
              tokenId={createdTokenId}
              tokenSymbol={symbol.toUpperCase()}
              totalSupply={parseFloat(totalSupply) || 1000000000}
              onClose={() => { reset(); onClose(); }}
              onSuccess={() => { reset(); onClose(); }}
            />
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Token Row ─────────────────────────────────────────────────────────────────
function TokenRow({
  token, rank, presale, onPress, onPresale,
}: {
  token: LaunchpadToken;
  rank: number;
  presale?: Presale | null;
  onPress: () => void;
  onPresale?: () => void;
}) {
  const change = 0;
  const positive = change >= 0;
  const psStatus = presale ? computePresaleStatus(presale) : null;
  const psProgress = presale ? getPresaleProgress(presale) : null;

  const STATUS_COLORS: Record<string, string> = {
    live: '#10b981', upcoming: '#F59E0B', successful: '#10b981',
    failed: '#ef4444', claim_live: colors.primary, finalized: '#6B7280',
  };

  return (
    <TouchableOpacity
      style={styles.tokenRow}
      onPress={presale && onPresale ? onPresale : onPress}
      activeOpacity={0.8}
    >
      <Text style={styles.tokenRank}>{rank}</Text>
      {token.image_url
        ? <Image source={{ uri: token.image_url }} style={styles.tokenRowLogo} />
        : (
          <View style={styles.tokenRowLogoFallback}>
            <Text style={styles.tokenRowLogoText}>{token.symbol.slice(0, 2)}</Text>
          </View>
        )
      }
      <View style={styles.tokenRowInfo}>
        <Text style={styles.tokenRowName}>{token.name}</Text>
        {presale && psProgress ? (
          <View style={styles.psProgressMini}>
            <View style={styles.psProgressMiniBar}>
              <View style={[styles.psProgressMiniFill, { width: `${psProgress.hardCapPercent}%` as any }]} />
            </View>
            <Text style={[styles.psStatusLabel, { color: STATUS_COLORS[psStatus ?? 'upcoming'] ?? '#6B7280' }]}>
              {psProgress.hardCapPercent.toFixed(0)}% · {psStatus?.toUpperCase()}
            </Text>
          </View>
        ) : (
          <Text style={styles.tokenRowVol}>Vol {fmtUsd(token.total_supply * 0.001)}</Text>
        )}
      </View>
      {presale ? (
        <View style={[styles.tokenRowBadge, { backgroundColor: `${STATUS_COLORS[psStatus ?? 'upcoming']}20` }]}>
          <Users size={10} color={STATUS_COLORS[psStatus ?? 'upcoming']} />
          <Text style={[styles.tokenRowBadgeText, { color: STATUS_COLORS[psStatus ?? 'upcoming'] }]}>
            {presale.buyer_count}
          </Text>
        </View>
      ) : (
        <View style={styles.tokenRowBadge}>
          <Zap size={10} color={colors.warning} />
          <Text style={styles.tokenRowBadgeText}>{Math.floor(token.total_supply / 1e6)}</Text>
        </View>
      )}
      <View style={styles.tokenRowRight}>
        <Text style={styles.tokenRowPrice}>{fmtPrice(0.000003)}</Text>
        <Text style={[styles.tokenRowChange, { color: positive ? colors.success : colors.error }]}>
          {positive ? '↑' : '↓'} {Math.abs(change).toFixed(2)}%
        </Text>
      </View>
      <ChevronRight size={16} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function LaunchpadScreen() {
  const router = useRouter();
  const { activeAddress } = useWallet();

  const [activeTab, setActiveTab] = useState<LaunchTab>('featured');
  const [tokens, setTokens] = useState<LaunchpadToken[]>([]);
  const [featured, setFeatured] = useState<LaunchpadToken | null>(null);
  const [stats, setStats] = useState<LaunchpadStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  // Map tokenId → presale for inline presale indicators
  const [presaleMap, setPresaleMap] = useState<Map<string, Presale>>(new Map());

  const loadData = useCallback(async () => {
    try {
      const tab = activeTab === 'featured' ? 'new' : activeTab as any;
      const [tokenData, featuredData, statsData, activePresales] = await Promise.allSettled([
        launchpadService.getTokens(tab),
        launchpadService.getFeatured(),
        launchpadService.getStats(),
        presaleService.getActivePresales(50),
      ]);
      if (tokenData.status === 'fulfilled') setTokens(tokenData.value);
      if (featuredData.status === 'fulfilled') setFeatured(featuredData.value);
      if (statsData.status === 'fulfilled') setStats(statsData.value);
      if (activePresales.status === 'fulfilled') {
        const map = new Map<string, Presale>();
        activePresales.value.forEach(ps => map.set(ps.token_id, ps));
        setPresaleMap(map);
      }
    } catch {}
    finally { setLoading(false); }
  }, [activeTab]);

  useEffect(() => { setLoading(true); loadData(); }, [loadData]);

  const handleTokenPress = (token: LaunchpadToken) => {
    if (token.mint_address) router.push(`/token-detail/${token.mint_address}`);
  };

  const handleCreateSuccess = () => { loadData(); };

  const openCreate = () => {
    if (!activeAddress) {
      Alert.alert('Connect Wallet', 'Please connect your wallet to create a token.');
      return;
    }
    setShowCreate(true);
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={styles.headerSection}>
          <View style={styles.headerLeft}>
            <View style={styles.headerLogoWrap}>
              <Rocket size={28} color={colors.primary} />
            </View>
            <View>
              <Text style={styles.headerTitle}>Launchpad</Text>
              <Text style={styles.headerSub}>Create. Launch. Grow.</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.createBtn} onPress={openCreate}>
            <Plus size={15} color="#fff" />
            <Text style={styles.createBtnText}>Create Token</Text>
          </TouchableOpacity>
        </View>

        {/* ── Stats ── */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <View style={styles.statIconWrap}>
              <Rocket size={18} color={colors.primary} />
            </View>
            <Text style={styles.statTitle}>Total Launched</Text>
            <Text style={styles.statValue}>{stats?.totalLaunched ?? 0}</Text>
            <Text style={styles.statSub}>Tokens</Text>
          </View>
          <View style={styles.statCard}>
            <View style={styles.statIconWrap}>
              <BarChart3 size={18} color={colors.primary} />
            </View>
            <Text style={styles.statTitle}>Total Volume</Text>
            <Text style={styles.statValue}>{fmtUsd(stats?.totalVolume ?? 0)}</Text>
            <Text style={styles.statSub}>24h</Text>
          </View>
          <View style={styles.statCard}>
            <View style={styles.statIconWrap}>
              <DollarSign size={18} color={colors.primary} />
            </View>
            <Text style={styles.statTitle}>Total Raised</Text>
            <Text style={styles.statValue}>{fmtUsd((stats?.totalVolume ?? 0) * 0.3)}</Text>
            <Text style={styles.statSub}>All time</Text>
          </View>
        </View>

        {/* ── Featured Card ── */}
        <View style={styles.featuredCard}>
          <View style={styles.featuredHeader}>
            <View style={styles.featuredBadge}>
              <Zap size={11} color={colors.warning} />
              <Text style={styles.featuredBadgeText}>FEATURED LAUNCH</Text>
            </View>
            <ExternalLink size={16} color={colors.primary} />
          </View>

          {featured ? (
            <>
              <View style={styles.featuredTop}>
                {featured.image_url
                  ? <Image source={{ uri: featured.image_url }} style={styles.featuredLogo} />
                  : (
                    <View style={styles.featuredLogoFallback}>
                      <Text style={styles.featuredLogoText}>{featured.symbol.slice(0, 2)}</Text>
                    </View>
                  )
                }
                <View style={styles.featuredNameBlock}>
                  <View style={styles.featuredNameRow}>
                    <Text style={styles.featuredName}>{featured.name}</Text>
                    <CheckCircle2 size={16} color={colors.primary} />
                  </View>
                  <Text style={styles.featuredSymbol}>{featured.symbol}</Text>
                </View>
                <View style={styles.featuredPriceBlock}>
                  <Text style={styles.featuredPrice}>{fmtPrice(0.000003)}</Text>
                  <View style={styles.featuredChangeBadge}>
                    <TrendingUp size={10} color={colors.success} />
                    <Text style={styles.featuredChangeText}>0.24%</Text>
                  </View>
                </View>
              </View>

              <View style={styles.featuredStats}>
                <View style={styles.featuredStatItem}>
                  <Text style={styles.featuredStatLabel}>24h Volume</Text>
                  <Text style={styles.featuredStatValue}>{fmtUsd(featured.total_supply * 0.0001)}</Text>
                </View>
                <View style={styles.featuredStatDivider} />
                <View style={styles.featuredStatItem}>
                  <Text style={styles.featuredStatLabel}>Liquidity</Text>
                  <Text style={styles.featuredStatValue}>$0</Text>
                </View>
                <View style={styles.featuredStatDivider} />
                <View style={styles.featuredStatItem}>
                  <Text style={styles.featuredStatLabel}>Market Cap</Text>
                  <Text style={styles.featuredStatValue}>{fmtUsd(featured.total_supply * 0.000003)}</Text>
                </View>
              </View>

              <View style={styles.featuredActions}>
                <TouchableOpacity
                  style={styles.buyBtn}
                  onPress={() => featured.mint_address && router.push(`/swap?inputMint=So11111111111111111111111111111111111111112&outputMint=${featured.mint_address}`)}
                >
                  <Text style={styles.buyBtnText}>Buy {featured.symbol}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.chartBtn}
                  onPress={() => handleTokenPress(featured)}
                >
                  <Text style={styles.chartBtnText}>View Chart</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <View style={styles.featuredEmpty}>
              <Rocket size={32} color={colors.textMuted} />
              <Text style={styles.featuredEmptyText}>No featured launch yet</Text>
              <Text style={styles.featuredEmptySubtext}>Be the first to launch</Text>
            </View>
          )}
        </View>

        {/* ── Tabs ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsContainer}
          style={styles.tabsScroll}
        >
          {LAUNCH_TABS.map(tab => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabBtn, activeTab === tab.key && styles.tabBtnActive]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text style={[styles.tabBtnText, activeTab === tab.key && styles.tabBtnTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ── Token List ── */}
        <View style={styles.tokenList}>
          {loading ? (
            <ActivityIndicator size="large" color={colors.primary} style={{ marginVertical: 40 }} />
          ) : tokens.length === 0 ? (
            <View style={styles.emptyState}>
              <Rocket size={40} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No tokens yet</Text>
              <Text style={styles.emptySub}>Be the first to launch on DAWEN</Text>
              <TouchableOpacity style={styles.emptyCreateBtn} onPress={openCreate}>
                <Plus size={14} color="#fff" />
                <Text style={styles.emptyCreateText}>Create Token</Text>
              </TouchableOpacity>
            </View>
          ) : (
            tokens.map((token, i) => {
              const ps = presaleMap.get(token.id) ?? null;
              return (
                <TokenRow
                  key={token.id}
                  token={token}
                  rank={i + 1}
                  presale={ps}
                  onPress={() => handleTokenPress(token)}
                  onPresale={ps ? () => router.push(`/launchpad/${ps.id}`) : undefined}
                />
              );
            })
          )}
        </View>

        {/* ── Bottom CTA ── */}
        <View style={styles.ctaCard}>
          <View style={styles.ctaLogoWrap}>
            <Rocket size={28} color={colors.primary} />
          </View>
          <View style={styles.ctaText}>
            <Text style={styles.ctaTitle}>Launch your token</Text>
            <Text style={styles.ctaSub}>Create your own Solana token in minutes.</Text>
          </View>
          <TouchableOpacity style={styles.ctaBtn} onPress={openCreate}>
            <Text style={styles.ctaBtnText}>Create Token</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Create Modal */}
      <CreateTokenModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onSuccess={handleCreateSuccess}
        creatorWallet={activeAddress ?? ''}
      />
    </View>
  );
}

// ─── Main Page Styles ─────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0F' },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 32 },

  // Header
  headerSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingBottom: 16,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerLogoWrap: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: 'rgba(139,92,246,0.15)',
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#fff' },
  headerSub: { fontSize: 13, color: '#6B7280', marginTop: 1 },
  createBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.primary,
    paddingVertical: 10, paddingHorizontal: 14,
    borderRadius: 12,
  },
  createBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  // Stats
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#12121A',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.1)',
    padding: 12,
    alignItems: 'flex-start',
  },
  statIconWrap: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: 'rgba(139,92,246,0.12)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 8,
  },
  statTitle: { fontSize: 11, color: '#6B7280', marginBottom: 2 },
  statValue: { fontSize: 17, fontWeight: '800', color: '#fff' },
  statSub: { fontSize: 11, color: '#6B7280', marginTop: 1 },

  // Featured
  featuredCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#12121A',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.3)',
    padding: 16,
  },
  featuredHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  featuredBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(245,158,11,0.15)',
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)',
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4,
  },
  featuredBadgeText: { fontSize: 11, fontWeight: '700', color: '#F59E0B', letterSpacing: 0.5 },

  featuredTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  featuredLogo: { width: 52, height: 52, borderRadius: 14, backgroundColor: '#20202E' },
  featuredLogoFallback: {
    width: 52, height: 52, borderRadius: 14,
    backgroundColor: 'rgba(139,92,246,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  featuredLogoText: { fontSize: 16, fontWeight: '700', color: colors.primary },
  featuredNameBlock: { flex: 1 },
  featuredNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  featuredName: { fontSize: 16, fontWeight: '700', color: '#fff' },
  featuredSymbol: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  featuredPriceBlock: { alignItems: 'flex-end' },
  featuredPrice: { fontSize: 18, fontWeight: '800', color: '#fff' },
  featuredChangeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(16,185,129,0.15)',
    borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3,
    marginTop: 4,
  },
  featuredChangeText: { fontSize: 12, fontWeight: '700', color: '#10b981' },

  featuredStats: {
    flexDirection: 'row',
    backgroundColor: '#0A0A0F',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  featuredStatItem: { flex: 1, alignItems: 'center' },
  featuredStatDivider: { width: 1, backgroundColor: 'rgba(139,92,246,0.12)' },
  featuredStatLabel: { fontSize: 11, color: '#6B7280', marginBottom: 4 },
  featuredStatValue: { fontSize: 14, fontWeight: '700', color: '#fff' },

  featuredActions: { flexDirection: 'row', gap: 10 },
  buyBtn: {
    flex: 1, backgroundColor: colors.primary,
    borderRadius: 12, paddingVertical: 13, alignItems: 'center',
  },
  buyBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  chartBtn: {
    flex: 1,
    borderRadius: 12, paddingVertical: 13, alignItems: 'center',
    borderWidth: 1, borderColor: colors.primary,
  },
  chartBtnText: { fontSize: 14, fontWeight: '700', color: colors.primary },

  featuredEmpty: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  featuredEmptyText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  featuredEmptySubtext: { fontSize: 13, color: '#6B7280' },

  // Tabs
  tabsScroll: { marginBottom: 4 },
  tabsContainer: { paddingHorizontal: 16, gap: 6, paddingVertical: 4 },
  tabBtn: {
    paddingVertical: 7, paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: 'transparent',
  },
  tabBtnActive: { backgroundColor: 'rgba(139,92,246,0.15)' },
  tabBtnText: { fontSize: 14, fontWeight: '500', color: '#6B7280' },
  tabBtnTextActive: { color: colors.primary, fontWeight: '700' },

  // Token list
  tokenList: { paddingHorizontal: 16, marginTop: 4 },
  tokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#12121A',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 8,
    gap: 10,
  },
  tokenRank: { fontSize: 13, fontWeight: '600', color: '#6B7280', width: 16 },
  tokenRowLogo: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#20202E' },
  tokenRowLogoFallback: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: 'rgba(139,92,246,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  tokenRowLogoText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  tokenRowInfo: { flex: 1 },
  tokenRowName: { fontSize: 14, fontWeight: '700', color: '#fff' },
  tokenRowVol: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  tokenRowBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(245,158,11,0.15)',
    borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3,
  },
  tokenRowBadgeText: { fontSize: 11, fontWeight: '700', color: '#F59E0B' },
  tokenRowRight: { alignItems: 'flex-end' },
  tokenRowPrice: { fontSize: 13, fontWeight: '700', color: '#fff' },
  tokenRowChange: { fontSize: 12, fontWeight: '600', marginTop: 2 },

  // Presale mini progress inside token row
  psProgressMini: { gap: 3, marginTop: 3 },
  psProgressMiniBar: { height: 3, width: 80, backgroundColor: '#20202E', borderRadius: 2, overflow: 'hidden' },
  psProgressMiniFill: { height: 3, backgroundColor: colors.primary, borderRadius: 2 },
  psStatusLabel: { fontSize: 10, fontWeight: '700' },

  // Empty
  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#fff' },
  emptySub: { fontSize: 13, color: '#6B7280' },
  emptyCreateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.primary,
    paddingVertical: 10, paddingHorizontal: 18,
    borderRadius: 12, marginTop: 6,
  },
  emptyCreateText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // CTA
  ctaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: '#12121A',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.2)',
    padding: 16,
    gap: 12,
  },
  ctaLogoWrap: {
    width: 52, height: 52, borderRadius: 14,
    backgroundColor: 'rgba(139,92,246,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  ctaText: { flex: 1 },
  ctaTitle: { fontSize: 15, fontWeight: '700', color: '#fff' },
  ctaSub: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  ctaBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14,
  },
  ctaBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
});

// ─── Modal Styles ─────────────────────────────────────────────────────────────
const mStyles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#0A0A0F' },
  flex: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(139,92,246,0.12)',
    backgroundColor: '#0A0A0F',
  },
  backBtn: { width: 36, alignItems: 'flex-start' },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  headerRight: { width: 36 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },

  formContent: { padding: 16, paddingBottom: 48 },

  modeSelector: {
    flexDirection: 'row',
    backgroundColor: '#12121A',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  modeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 9, borderRadius: 10,
  },
  modeBtnActive: { backgroundColor: colors.primary },
  modeBtnText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  modeBtnTextActive: { color: '#fff' },

  logoUpload: { alignSelf: 'center', marginBottom: 20 },
  logoPreview: { width: 80, height: 80, borderRadius: 16, backgroundColor: '#20202E' },
  logoPlaceholder: {
    width: 80, height: 80, borderRadius: 16,
    backgroundColor: '#12121A',
    borderWidth: 2, borderColor: 'rgba(139,92,246,0.2)',
    borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  logoPlaceholderText: { fontSize: 11, color: '#6B7280' },

  errorText: {
    fontSize: 13, color: '#ef4444',
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderRadius: 10, padding: 12, marginBottom: 14,
  },
  label: { fontSize: 13, fontWeight: '600', color: '#9CA3AF', marginBottom: 6 },
  input: {
    backgroundColor: '#12121A',
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.15)',
    borderRadius: 12,
    paddingVertical: 13, paddingHorizontal: 14,
    fontSize: 15, color: '#fff',
    marginBottom: 14,
    width: '100%',
  },
  textArea: { height: 88, textAlignVertical: 'top' },

  socialRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  socialInput: {
    flex: 1,
    backgroundColor: '#12121A',
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.15)',
    borderRadius: 12,
    paddingVertical: 13, paddingHorizontal: 14,
    fontSize: 15, color: '#fff',
    marginBottom: 10,
  },

  divider: {
    fontSize: 12, fontWeight: '600', color: '#6B7280',
    textTransform: 'uppercase', letterSpacing: 1,
    marginBottom: 14, marginTop: 6,
  },

  toggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(139,92,246,0.08)',
    marginBottom: 4,
  },
  toggleLabel: { fontSize: 14, color: '#C4C4D4' },
  toggle: {
    width: 44, height: 24, borderRadius: 12,
    backgroundColor: '#20202E', padding: 2, justifyContent: 'center',
  },
  toggleOn: { backgroundColor: 'rgba(139,92,246,0.25)', borderWidth: 1, borderColor: colors.primary },
  toggleKnob: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#6B7280' },
  toggleKnobOn: { backgroundColor: colors.primary, alignSelf: 'flex-end' },

  costCard: {
    backgroundColor: '#12121A',
    borderRadius: 14, borderWidth: 1, borderColor: 'rgba(139,92,246,0.12)',
    padding: 14, marginBottom: 20, marginTop: 6,
  },
  costTitle: { fontSize: 13, fontWeight: '700', color: '#9CA3AF', marginBottom: 10 },
  costRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  costLabel: { fontSize: 13, color: '#6B7280' },
  costValue: { fontSize: 13, fontWeight: '600', color: '#fff' },

  launchBtn: { borderRadius: 14, overflow: 'hidden', marginTop: 4 },
  launchBtnGrad: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 16,
  },
  launchBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  progressContainer: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: 32, gap: 14,
  },
  progressIconWrap: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(139,92,246,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  progressTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  progressLabel: { fontSize: 14, color: '#9CA3AF', textAlign: 'center' },
  progressBar: {
    width: '100%', height: 8, borderRadius: 4,
    backgroundColor: '#20202E', overflow: 'hidden',
  },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: colors.primary },
  progressSteps: { fontSize: 13, color: '#6B7280' },

  doneContainer: { padding: 24, alignItems: 'center', gap: 14, paddingBottom: 48 },
  doneIconWrap: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: 'rgba(16,185,129,0.12)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 6,
  },
  doneTitle: { fontSize: 24, fontWeight: '800', color: '#fff' },
  doneSubtitle: { fontSize: 14, color: '#9CA3AF' },
  mintCard: {
    alignSelf: 'stretch', backgroundColor: '#12121A',
    borderRadius: 14, borderWidth: 1, borderColor: 'rgba(139,92,246,0.15)',
    padding: 14, gap: 8,
  },
  mintLabel: { fontSize: 11, color: '#6B7280', fontWeight: '600', textTransform: 'uppercase' },
  mintRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mintAddr: {
    flex: 1, fontSize: 13, color: '#fff',
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
  },
  explorerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 12, paddingHorizontal: 20,
    borderRadius: 12, borderWidth: 1, borderColor: 'rgba(139,92,246,0.25)',
    backgroundColor: 'rgba(139,92,246,0.1)',
  },
  explorerBtnText: { fontSize: 13, fontWeight: '600', color: colors.primary },
  doneClose: {
    backgroundColor: colors.primary,
    paddingVertical: 14, paddingHorizontal: 48,
    borderRadius: 14, alignSelf: 'stretch', alignItems: 'center',
  },
  doneCloseText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  presaleCta: {
    alignSelf: 'stretch',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
    overflow: 'hidden',
  },
  presaleCtaGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  presaleCtaTitle: { fontSize: 15, fontWeight: '700', color: '#F59E0B' },
  presaleCtaSub: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
});

// ─── Presale Setup Modal Styles ───────────────────────────────────────────────
const psStyles = StyleSheet.create({
  infoCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: 'rgba(245,158,11,0.08)',
    borderRadius: 12, borderWidth: 1, borderColor: 'rgba(245,158,11,0.2)',
    padding: 12, marginBottom: 20,
  },
  infoText: { flex: 1, fontSize: 13, color: '#9CA3AF', lineHeight: 19 },
  row: { flexDirection: 'row', gap: 10 },
  halfField: { flex: 1 },
  skipBtn: {
    alignItems: 'center', paddingVertical: 14,
  },
  skipBtnText: { fontSize: 14, color: '#6B7280' },
});
