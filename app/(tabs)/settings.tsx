import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Image,
  Share,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Globe, Shield, User, ChevronRight, Key, LogOut, X, Check, Bell, Info, UserPlus, Circle as CircleHelp, Bot, Wallet, Plus, Eye, EyeOff, Copy, MessageCircle, ChevronDown, ChevronUp, BellRing, Lock, Gift, Camera } from 'lucide-react-native';
import VerificationBadge from '@/components/VerificationBadge';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useLanguage } from '@/contexts/LanguageContext';
import { useWallet, UnifiedWallet } from '@/contexts/WalletContext';
import { Language, languageNames } from '@/constants/i18n';
import { SocialService, UserProfile, NotificationSettings } from '@/services/socialService';
import { useProfile } from '@/contexts/ProfileContext';
import { SecureWalletManager } from '@/lib/wallet/SecureWalletManager';
import { payToTreasury, DTEST_MINT, PayStatus } from '@/services/treasuryService';
import { SolanaPriceService } from '@/services/solana/priceService';
import { VerificationService, PREMIUM_TIERS, PremiumTierKey } from '@/services/verificationService';
import { colors, spacing, borderRadius, fontSize, elevation } from '@/constants/theme';

type SettingsModal = 'language' | 'profile' | 'accounts' | 'recovery' | 'help' | 'invite' | 'assistant' | 'notifications' | 'rewards' | 'verify' | 'premium' | null;

export default function SettingsScreen() {
  const router = useRouter();
  const { t, language, setLanguage } = useLanguage();
  const { accounts, selectedAccount, setSelectedAccount, forceReloadAccounts, allWallets, activeWallet, activeAddress, setActiveWallet, connectedWallet, disconnectExternalWallet, fullLogout } = useWallet();
  const { profile, updateProfile: updateGlobalProfile, uploadAvatar: uploadGlobalAvatar, refreshProfile } = useProfile();
  const [activeModal, setActiveModal] = useState<SettingsModal>(null);
  const [editUsername, setEditUsername] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editAvatarUrl, setEditAvatarUrl] = useState('');
  const [showRecoveryPhrase, setShowRecoveryPhrase] = useState(false);
  const [recoveryPhrase, setRecoveryPhrase] = useState('');
  const [copied, setCopied] = useState(false);
  const [addingAccount, setAddingAccount] = useState(false);
  const [notifSettings, setNotifSettings] = useState<NotificationSettings | null>(null);
  const [notifLoading, setNotifLoading] = useState(false);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  // Blue badge verification (free 4-step)
  const [verifyStatus, setVerifyStatus] = useState<{
    followsDecent: boolean; followsBadge: boolean; followsDawenPulse: boolean; sentBlueDM: boolean;
    alreadyVerified: boolean; decentId: string | null; badgeId: string | null; dawenPulseId: string | null; blueBadgeId: string | null;
  } | null>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyChecking, setVerifyChecking] = useState(false);

  // Premium certification (paid)
  const [premiumTierKey, setPremiumTierKey] = useState<PremiumTierKey>('1m');
  const [premiumPayWith, setPremiumPayWith] = useState<'SOL' | 'DTEST'>('SOL');
  const [premiumPayStatus, setPremiumPayStatus] = useState<PayStatus>('idle');
  const [premiumTxSig, setPremiumTxSig] = useState<string | null>(null);
  const [premiumDone, setPremiumDone] = useState(false);
  const [solUsdPrice, setSolUsdPrice] = useState(0);

  useEffect(() => {
    const svc = new SolanaPriceService();
    svc.getSOLPrice().then(p => { if (p > 0) setSolUsdPrice(p); }).catch(() => {});
  }, []);

  const usdToSol = (usd: number) => solUsdPrice > 0 ? usd / solUsdPrice : 0;

  const loadVerifyStatus = async () => {
    if (!profile?.id) return;
    setVerifyLoading(true);
    try {
      const status = await VerificationService.getVerificationStatus(profile.id);
      setVerifyStatus(status);
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleCheckVerification = async () => {
    if (!profile?.id) return;
    setVerifyChecking(true);
    try {
      const granted = await VerificationService.checkAndGrantBasicVerification(profile.id);
      if (granted) {
        await refreshProfile();
        const status = await VerificationService.getVerificationStatus(profile.id);
        setVerifyStatus(status);
      } else {
        const status = await VerificationService.getVerificationStatus(profile.id);
        setVerifyStatus(status);
        Alert.alert('Not Yet Verified', 'Please complete all 4 steps first.');
      }
    } finally {
      setVerifyChecking(false);
    }
  };

  const handleConfirmPremium = async () => {
    if (!profile || !activeAddress) return;
    const tier = PREMIUM_TIERS.find(t => t.key === premiumTierKey)!;
    const solAmt = usdToSol(tier.usd);
    setPremiumPayStatus('preparing');

    const result = await payToTreasury({
      fromAddress: activeAddress,
      amountSol: premiumPayWith === 'SOL' ? (solAmt > 0 ? solAmt : 0.001) : undefined,
      amountToken: premiumPayWith === 'DTEST' ? tier.usd : undefined,
      tokenMint: premiumPayWith === 'DTEST' ? DTEST_MINT : undefined,
      connectedWalletId: connectedWallet?.id ?? null,
      internalAccountIndex: selectedAccount?.accountIndex ?? 0,
      onStatus: setPremiumPayStatus,
    });

    if (!result.success) {
      setPremiumPayStatus('idle');
      Alert.alert('Payment Failed', result.error || 'Could not complete payment.');
      return;
    }

    setPremiumTxSig(result.signature ?? null);

    try {
      await VerificationService.activatePremium(profile.id, premiumTierKey, result.signature ?? undefined);
      await refreshProfile();
    } catch {}
    setPremiumDone(true);
  };

  const rawWalletAddress = activeAddress || selectedAccount?.address || '';
  const walletAddress = rawWalletAddress
    ? `${rawWalletAddress.slice(0, 6)}...${rawWalletAddress.slice(-4)}`
    : '';

  const loadNotifSettings = useCallback(async () => {
    if (!profile) return;
    setNotifLoading(true);
    try {
      const s = await SocialService.getOrCreateNotificationSettings(profile.id);
      setNotifSettings(s);
    } finally {
      setNotifLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    if (activeModal === 'notifications') {
      loadNotifSettings();
    }
  }, [activeModal, loadNotifSettings]);

  const handleToggleNotif = async (key: keyof Omit<NotificationSettings, 'id' | 'user_id'>) => {
    if (!notifSettings) return;
    const newVal = !notifSettings[key];
    const updated = { ...notifSettings, [key]: newVal };
    setNotifSettings(updated);
    await SocialService.updateNotificationSettings(notifSettings.id, { [key]: newVal });
  };

  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleSaveProfile = async () => {
    if (!profile) return;
    setIsUploading(true);
    setUploadError(null);
    try {
      let avatarUrl: string | undefined = editAvatarUrl.trim() || undefined;
      if (avatarUrl && !avatarUrl.startsWith('http')) {
        // Local URI — upload to storage
        try {
          const uploaded = await uploadGlobalAvatar(avatarUrl);
          if (uploaded) {
            avatarUrl = uploaded;
          } else {
            setUploadError('Upload failed. Please try again.');
            setIsUploading(false);
            return;
          }
        } catch (uploadErr: any) {
          setUploadError(uploadErr?.message || 'Upload failed. Please try again.');
          setIsUploading(false);
          return;
        }
      }
      await updateGlobalProfile({
        username: editUsername.trim() || undefined,
        bio: editBio.trim(),
        avatar_url: avatarUrl && avatarUrl.startsWith('http') ? avatarUrl : profile.avatar_url ?? undefined,
      });
      setActiveModal(null);
    } catch (err: any) {
      setUploadError(err?.message || 'Save failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handlePickImage = async () => {
    setUploadError(null);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      base64: false,
    });

    if (!result.canceled && result.assets[0]) {
      setEditAvatarUrl(result.assets[0].uri);
    }
  };

  const handleLogout = async () => {
    // 1. Delete stored wallet data first
    try {
      const walletManager = SecureWalletManager.getInstance();
      await walletManager.deleteWallet();
    } catch (e) {
      console.warn('[Logout] deleteWallet error:', e);
    }
    // 2. Clear extra AsyncStorage keys (belt+suspenders)
    try {
      await Promise.all([
        AsyncStorage.removeItem('onboarding_completed'),
        AsyncStorage.removeItem('wallet_config'),
        AsyncStorage.removeItem('secure_wallet_data'),
        AsyncStorage.removeItem('wallet_data_fallback'),
        AsyncStorage.removeItem('external_wallet_connected'),
      ]);
    } catch (e) {
      console.warn('[Logout] AsyncStorage clear error:', e);
    }
    // 3. Clear in-memory context state
    try {
      await fullLogout();
    } catch (e) {
      console.warn('[Logout] fullLogout error:', e);
    }
    // 4. Navigate to onboarding (replace so back button doesn't return to settings)
    router.replace('/onboarding');
  };

  const handleLanguageSelect = async (lang: Language) => {
    await setLanguage(lang);
    setActiveModal(null);
  };

  const handleShowRecovery = async () => {
    try {
      const walletManager = SecureWalletManager.getInstance();
      const mnemonic = await walletManager.getMnemonicUnlocked();
      if (mnemonic && mnemonic.split(' ').length >= 12) {
        setRecoveryPhrase(mnemonic);
      } else {
        setRecoveryPhrase('');
      }
    } catch (err) {
      console.error('[Settings] Failed to unlock wallet for recovery:', err);
      setRecoveryPhrase('');
    }
    setActiveModal('recovery');
  };

  const handleCopyPhrase = async () => {
    await Clipboard.setStringAsync(recoveryPhrase);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAddAccount = async (chain: 'solana') => {
    setAddingAccount(true);
    const walletManager = SecureWalletManager.getInstance();
    await walletManager.unlockWallet();
    await walletManager.addAccount(chain);
    await forceReloadAccounts();
    setAddingAccount(false);
  };

  const handleInviteFriends = async () => {
    try {
      await Share.share({
        message: 'Join me on DNY - the crypto super app! Trade, Post, Play, Earn. Download now: https://dny.app',
      });
    } catch {}
  };

  const settingsSections = [
    {
      title: 'Earn',
      items: [
        {
          icon: <Gift size={20} color={colors.primary} />,
          label: 'Rewards & Referrals',
          onPress: () => router.push('/rewards' as any),
        },
        {
          icon: <Shield size={20} color="#3b82f6" />,
          label: 'Get Verified (Free)',
          value: (profile as any)?.verified_basic ? 'Verified' : undefined,
          onPress: () => { loadVerifyStatus(); setActiveModal('verify'); },
        },
        {
          icon: <Shield size={20} color="#f59e0b" />,
          label: 'Premium Certification',
          value: VerificationService.isPremiumActive(profile as any) ? 'Active' : undefined,
          onPress: () => { setPremiumDone(false); setPremiumPayStatus('idle'); setPremiumTxSig(null); setActiveModal('premium'); },
        },
      ],
    },
    {
      title: t.settings.preferences,
      items: [
        {
          icon: <Globe size={20} color={colors.primary} />,
          label: t.settings.language,
          value: languageNames[language],
          onPress: () => setActiveModal('language'),
        },
        {
          icon: <Bell size={20} color={colors.primary} />,
          label: t.settings.notifications,
          onPress: () => setActiveModal('notifications'),
        },
      ],
    },
    {
      title: t.settings.security,
      items: [
        {
          icon: <Key size={20} color={colors.primary} />,
          label: t.settings.recoveryPhrase,
          onPress: handleShowRecovery,
        },
        {
          icon: <Shield size={20} color={colors.primary} />,
          label: t.settings.biometric,
          value: Platform.OS === 'web' ? 'Not available' : undefined,
          onPress: () => {},
        },
      ],
    },
    {
      title: t.settings.manageAccounts,
      items: [
        {
          icon: <Wallet size={20} color={colors.primary} />,
          label: `${allWallets.length} wallet${allWallets.length !== 1 ? 's' : ''}`,
          value: activeWallet?.name || selectedAccount?.name || 'Select',
          onPress: () => setActiveModal('accounts'),
        },
      ],
    },
    {
      title: t.settings.about,
      items: [
        {
          icon: <CircleHelp size={20} color={colors.primary} />,
          label: t.settings.helpSupport,
          onPress: () => setActiveModal('help'),
        },
        {
          icon: <UserPlus size={20} color={colors.primary} />,
          label: t.settings.inviteFriends,
          onPress: handleInviteFriends,
        },
        {
          icon: <Bot size={20} color={colors.primary} />,
          label: t.settings.assistant,
          onPress: () => setActiveModal('assistant'),
        },
        {
          icon: <Info size={20} color={colors.primary} />,
          label: t.settings.version,
          value: '1.0.0',
          onPress: () => {},
        },
      ],
    },
  ];

  const faqItems = [
    { q: 'What is DNY?', a: 'DNY is a non-custodial crypto super app. Your private keys never leave your device. Trade, post, play, and earn all in one place.' },
    { q: 'Is my wallet safe?', a: 'Yes. DNY is non-custodial, meaning only you hold your private keys. Your seed phrase is encrypted and stored locally on your device.' },
    { q: 'How do I recover my wallet?', a: 'Go to Settings > Security > Recovery Phrase to view your seed phrase. Write it down and store it safely. You can import it on any device.' },
    { q: 'What chains are supported?', a: 'Currently Solana, Ethereum, Polygon, and Base. More chains are coming soon.' },
    { q: 'How does the Community work?', a: 'Post updates, share images, like and comment. You can promote posts for visibility with various duration tiers.' },
  ];

  return (
    <View style={styles.container}>
      <LinearGradient colors={colors.gradient.header} style={styles.header}>
        <Text style={styles.headerTitle}>{t.settings.title}</Text>
      </LinearGradient>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity style={styles.profileCard} onPress={() => {
          setEditUsername(profile?.username || '');
          setEditBio(profile?.bio || '');
          setEditAvatarUrl(profile?.avatar_url || '');
          setActiveModal('profile');
        }}>
          <View style={styles.profileAvatar}>
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.profileAvatarImage} />
            ) : (
              <User size={32} color={colors.textMuted} />
            )}
          </View>
          <View style={styles.profileInfo}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.profileName}>{profile?.username || 'Set username'}</Text>
              {profile && (profile.is_verified || (profile as any).verified_basic || (profile as any).premium_expiration) && (
                <VerificationBadge profile={profile as any} size="sm" />
              )}
            </View>
            {walletAddress ? (
              <Text style={styles.profileAddress}>{walletAddress}</Text>
            ) : null}
          </View>
          <ChevronRight size={20} color={colors.textMuted} />
        </TouchableOpacity>

        {settingsSections.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.sectionCard}>
              {section.items.map((item, idx) => (
                <TouchableOpacity
                  key={item.label}
                  style={[styles.settingRow, idx < section.items.length - 1 && styles.settingRowBorder]}
                  onPress={item.onPress}
                >
                  {item.icon}
                  <Text style={styles.settingLabel}>{item.label}</Text>
                  {item.value && <Text style={styles.settingValue}>{item.value}</Text>}
                  <ChevronRight size={18} color={colors.textMuted} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <LogOut size={20} color={colors.error} />
          <Text style={styles.logoutText}>{t.settings.logout}</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={activeModal === 'language'} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t.settings.language}</Text>
              <TouchableOpacity onPress={() => setActiveModal(null)}>
                <X size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {(Object.entries(languageNames) as [Language, string][]).map(([lang, name]) => (
                <TouchableOpacity
                  key={lang}
                  style={[styles.languageRow, language === lang && styles.languageRowActive]}
                  onPress={() => handleLanguageSelect(lang)}
                >
                  <Text style={[styles.languageName, language === lang && styles.languageNameActive]}>
                    {name}
                  </Text>
                  {language === lang && <Check size={20} color={colors.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={activeModal === 'profile'} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.profileModalContent}>
            {/* Header */}
            <View style={styles.profileModalHeader}>
              <Text style={styles.profileModalTitle}>Edit Profile</Text>
              <TouchableOpacity onPress={() => setActiveModal(null)} style={styles.profileModalClose}>
                <X size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            {/* Avatar */}
            <TouchableOpacity style={styles.profileAvatarWrap} onPress={handlePickImage} activeOpacity={0.85}>
              <View style={styles.profileAvatarRing}>
                {editAvatarUrl ? (
                  <Image source={{ uri: editAvatarUrl }} style={styles.profileAvatarLarge} />
                ) : (
                  <View style={styles.profileAvatarEmpty}>
                    <User size={44} color={colors.textMuted} />
                  </View>
                )}
              </View>
              <View style={styles.editPencilBtn}>
                <Camera size={16} color={colors.white} />
              </View>
            </TouchableOpacity>
            <Text style={styles.avatarHint}>Tap on the image to change it</Text>

            {/* Username */}
            <Text style={styles.profileFieldLabel}>Username</Text>
            <View style={styles.profileInputWrap}>
              <User size={18} color={colors.primary} strokeWidth={2} />
              <TextInput
                style={styles.profileFieldInput}
                placeholder="Choose a username"
                placeholderTextColor={colors.textMuted}
                value={editUsername}
                onChangeText={setEditUsername}
                maxLength={30}
              />
            </View>

            {/* Bio */}
            <Text style={styles.profileFieldLabel}>Bio</Text>
            <View style={styles.profileBioWrap}>
              <TextInput
                style={styles.profileBioInput}
                placeholder="Tell us about yourself"
                placeholderTextColor={colors.textMuted}
                value={editBio}
                onChangeText={setEditBio}
                multiline
                maxLength={160}
                textAlignVertical="top"
              />
              <Text style={styles.profileCharCount}>{editBio.length}/160</Text>
            </View>

            {/* Error message */}
            {uploadError ? (
              <Text style={{ color: colors.error, fontSize: 13, marginBottom: 12, textAlign: 'center' }}>
                {uploadError}
              </Text>
            ) : null}

            {/* Save button */}
            <TouchableOpacity
              style={[styles.profileSaveBtn, isUploading && { opacity: 0.7 }]}
              onPress={handleSaveProfile}
              disabled={isUploading}
              activeOpacity={0.9}
            >
              {isUploading
                ? <ActivityIndicator size="small" color={colors.white} />
                : <Text style={styles.profileSaveBtnText}>Save Changes</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={activeModal === 'accounts'} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t.settings.manageAccounts}</Text>
              <TouchableOpacity onPress={() => setActiveModal(null)}>
                <X size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 400 }}>
              {allWallets.length === 0 && (
                <Text style={styles.noWalletsText}>No wallets connected or created yet.</Text>
              )}
              {allWallets.map((wallet) => {
                const isActive = wallet.isActive;
                return (
                  <TouchableOpacity
                    key={wallet.id}
                    style={[styles.accountRow, isActive && styles.accountRowActive]}
                    onPress={() => {
                      setActiveWallet(wallet);
                      setActiveModal(null);
                    }}
                  >
                    {wallet.type === 'connected' && wallet.providerIcon ? (
                      <Image
                        source={{ uri: wallet.providerIcon }}
                        style={styles.walletProviderIcon}
                      />
                    ) : (
                      <View style={[styles.chainDot, { backgroundColor: getChainColor(wallet.blockchain || 'solana') }]} />
                    )}
                    <View style={styles.accountInfo}>
                      <View style={styles.accountNameRow}>
                        <Text style={styles.accountName}>{wallet.name}</Text>
                        <View style={[styles.walletTypeBadge, wallet.type === 'connected' && styles.walletTypeBadgeConnected]}>
                          <Text style={styles.walletTypeBadgeText}>
                            {wallet.type === 'connected' ? 'Connected' : 'Internal'}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.accountAddress}>
                        {wallet.address.slice(0, 8)}...{wallet.address.slice(-6)}
                      </Text>
                    </View>
                    {isActive ? (
                      <Check size={18} color={colors.primary} />
                    ) : wallet.type === 'connected' ? (
                      <TouchableOpacity
                        style={styles.disconnectButton}
                        onPress={async () => {
                          await disconnectExternalWallet();
                          setActiveModal(null);
                        }}
                      >
                        <Text style={styles.disconnectButtonText}>Disconnect</Text>
                      </TouchableOpacity>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <View style={styles.addAccountSection}>
              <Text style={styles.addAccountTitle}>Add Solana Account</Text>
              <View style={styles.chainButtons}>
                <TouchableOpacity
                  style={styles.chainButton}
                  onPress={() => handleAddAccount('solana')}
                  disabled={addingAccount}
                >
                  <View style={[styles.chainButtonDot, { backgroundColor: getChainColor('solana') }]} />
                  <Text style={styles.chainButtonText}>Solana</Text>
                  <Plus size={14} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={activeModal === 'recovery'} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t.settings.recoveryPhrase}</Text>
              <TouchableOpacity onPress={() => { setActiveModal(null); setShowRecoveryPhrase(false); setRecoveryPhrase(''); }}>
                <X size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <View style={styles.recoveryWarning}>
              <Lock size={18} color={colors.warning} />
              <Text style={styles.recoveryWarningText}>
                Never share your recovery phrase. Anyone with it can access your wallet and steal your funds.
              </Text>
            </View>

            {!showRecoveryPhrase ? (
              <TouchableOpacity
                style={styles.revealButton}
                onPress={() => setShowRecoveryPhrase(true)}
              >
                <Eye size={20} color={colors.white} />
                <Text style={styles.revealButtonText}>Reveal Phrase</Text>
              </TouchableOpacity>
            ) : !recoveryPhrase || recoveryPhrase.trim().split(' ').length < 12 ? (
              <View style={styles.recoveryWarning}>
                <Text style={styles.recoveryWarningText}>
                  {connectedWallet
                    ? 'Connected wallets do not have a recovery phrase stored in this app. Check your external wallet for recovery options.'
                    : 'Unable to retrieve recovery phrase. Your wallet data may be corrupted.'}
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.phraseGrid}>
                  {recoveryPhrase.trim().split(' ').map((word, idx) => (
                    <View key={idx} style={styles.phraseWord}>
                      <Text style={styles.phraseWordNum}>{idx + 1}</Text>
                      <Text style={styles.phraseWordText}>{word}</Text>
                    </View>
                  ))}
                </View>
                <TouchableOpacity style={styles.copyPhraseButton} onPress={handleCopyPhrase}>
                  {copied ? <Check size={16} color={colors.success} /> : <Copy size={16} color={colors.primary} />}
                  <Text style={[styles.copyPhraseText, copied && { color: colors.success }]}>
                    {copied ? 'Copied!' : 'Copy to clipboard'}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={activeModal === 'notifications'} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t.settings.notifications}</Text>
              <TouchableOpacity onPress={() => setActiveModal(null)}>
                <X size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            {notifLoading || !notifSettings ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.xxl }} />
            ) : (
              <View style={styles.notifSection}>
                {([
                  { key: 'likes', label: 'Likes' },
                  { key: 'comments', label: 'Comments' },
                  { key: 'follows', label: 'New Followers' },
                  { key: 'reposts', label: 'Reposts' },
                  { key: 'mentions', label: 'Mentions' },
                  { key: 'messages', label: 'Messages' },
                ] as { key: keyof Omit<NotificationSettings, 'id' | 'user_id'>; label: string }[]).map(({ key, label }) => (
                  <TouchableOpacity
                    key={key}
                    style={styles.notifToggleRow}
                    onPress={() => handleToggleNotif(key)}
                  >
                    <Text style={styles.notifToggleLabel}>{label}</Text>
                    <View style={[styles.toggleTrack, notifSettings[key] && styles.toggleTrackActive]}>
                      <View style={[styles.toggleThumb, notifSettings[key] && styles.toggleThumbActive]} />
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={activeModal === 'help'} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t.settings.helpSupport}</Text>
              <TouchableOpacity onPress={() => setActiveModal(null)}>
                <X size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 420 }}>
              <Text style={styles.helpSectionTitle}>Frequently Asked Questions</Text>
              {faqItems.map((faq, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.faqItem}
                  onPress={() => setExpandedFaq(expandedFaq === idx ? null : idx)}
                >
                  <View style={styles.faqHeader}>
                    <Text style={styles.faqQuestion}>{faq.q}</Text>
                    {expandedFaq === idx ? (
                      <ChevronUp size={18} color={colors.textMuted} />
                    ) : (
                      <ChevronDown size={18} color={colors.textMuted} />
                    )}
                  </View>
                  {expandedFaq === idx && (
                    <Text style={styles.faqAnswer}>{faq.a}</Text>
                  )}
                </TouchableOpacity>
              ))}
              <View style={styles.contactSection}>
                <MessageCircle size={24} color={colors.primary} />
                <Text style={styles.contactTitle}>Need more help?</Text>
                <Text style={styles.contactText}>Reach us at support@dny.app</Text>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={activeModal === 'assistant'} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t.settings.assistant}</Text>
              <TouchableOpacity onPress={() => setActiveModal(null)}>
                <X size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <View style={styles.assistantSection}>
              <Bot size={56} color={colors.primary} style={{ alignSelf: 'center' }} />
              <Text style={styles.assistantTitle}>DNY Assistant</Text>
              <Text style={styles.assistantDesc}>
                Your AI-powered crypto companion. Get help navigating the app, understanding market trends, and managing your portfolio.
              </Text>
              <View style={styles.assistantFeatures}>
                {[
                  'Portfolio insights and analysis',
                  'Transaction help and guidance',
                  'Market trend summaries',
                  'Security best practices',
                ].map((feature) => (
                  <View key={feature} style={styles.assistantFeatureRow}>
                    <Check size={16} color={colors.success} />
                    <Text style={styles.assistantFeatureText}>{feature}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.comingSoonBadge}>
                <Text style={styles.comingSoonText}>Coming Soon</Text>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Blue Badge Verification Modal (Free) */}
      <Modal visible={activeModal === 'verify'} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: 32 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Get Verified</Text>
              <TouchableOpacity onPress={() => setActiveModal(null)}>
                <X size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            {verifyLoading ? (
              <ActivityIndicator size="large" color={colors.primary} style={{ marginVertical: 40 }} />
            ) : verifyStatus?.alreadyVerified ? (
              <View style={{ alignItems: 'center', gap: 16, paddingVertical: 24 }}>
                <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(59,130,246,0.15)', justifyContent: 'center', alignItems: 'center' }}>
                  <Check size={36} color="#3b82f6" />
                </View>
                <Text style={{ fontSize: 20, fontWeight: '800', color: colors.textPrimary }}>Already Verified!</Text>
                <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: 'center' }}>
                  Your blue badge is active on your profile and posts.
                </Text>
                <TouchableOpacity style={{ backgroundColor: colors.primary, paddingVertical: 14, paddingHorizontal: 40, borderRadius: 50, marginTop: 8 }} onPress={() => setActiveModal(null)}>
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Done</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 20, lineHeight: 18 }}>
                  Complete all 4 steps below to receive your free blue verification badge.
                </Text>

                {/* Step 1 */}
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginBottom: 12, backgroundColor: verifyStatus?.followsDecent ? 'rgba(59,130,246,0.08)' : colors.surface, borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: verifyStatus?.followsDecent ? '#3b82f6' : colors.surfaceBorder }}>
                  <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: verifyStatus?.followsDecent ? '#3b82f6' : 'rgba(59,130,246,0.15)', justifyContent: 'center', alignItems: 'center' }}>
                    {verifyStatus?.followsDecent ? <Check size={16} color="#fff" strokeWidth={3} /> : <Text style={{ fontSize: 14, fontWeight: '800', color: '#3b82f6' }}>1</Text>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary }}>Follow @Decent</Text>
                    <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>Follow the official Decent account</Text>
                  </View>
                  {verifyStatus?.decentId && (
                    <TouchableOpacity
                      style={{ backgroundColor: '#3b82f6', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12 }}
                      onPress={() => { setActiveModal(null); router.push(`/profile/${verifyStatus!.decentId}` as any); }}
                      activeOpacity={0.8}
                    >
                      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{verifyStatus?.followsDecent ? 'Done' : 'Follow'}</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Step 2 */}
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginBottom: 12, backgroundColor: verifyStatus?.followsBadge ? 'rgba(59,130,246,0.08)' : colors.surface, borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: verifyStatus?.followsBadge ? '#3b82f6' : colors.surfaceBorder }}>
                  <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: verifyStatus?.followsBadge ? '#3b82f6' : 'rgba(59,130,246,0.15)', justifyContent: 'center', alignItems: 'center' }}>
                    {verifyStatus?.followsBadge ? <Check size={16} color="#fff" strokeWidth={3} /> : <Text style={{ fontSize: 14, fontWeight: '800', color: '#3b82f6' }}>2</Text>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary }}>Follow @VerificationBadge</Text>
                    <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>Follow the verification account</Text>
                  </View>
                  {verifyStatus?.badgeId && (
                    <TouchableOpacity
                      style={{ backgroundColor: '#3b82f6', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12 }}
                      onPress={() => { setActiveModal(null); router.push(`/profile/${verifyStatus!.badgeId}` as any); }}
                      activeOpacity={0.8}
                    >
                      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{verifyStatus?.followsBadge ? 'Done' : 'Follow'}</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Step 3 */}
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginBottom: 12, backgroundColor: verifyStatus?.followsDawenPulse ? 'rgba(59,130,246,0.08)' : colors.surface, borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: verifyStatus?.followsDawenPulse ? '#3b82f6' : colors.surfaceBorder }}>
                  <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: verifyStatus?.followsDawenPulse ? '#3b82f6' : 'rgba(59,130,246,0.15)', justifyContent: 'center', alignItems: 'center' }}>
                    {verifyStatus?.followsDawenPulse ? <Check size={16} color="#fff" strokeWidth={3} /> : <Text style={{ fontSize: 14, fontWeight: '800', color: '#3b82f6' }}>3</Text>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary }}>Follow @DawenPulse</Text>
                    <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>Follow the official DawenPulse account</Text>
                  </View>
                  {verifyStatus?.dawenPulseId && (
                    <TouchableOpacity
                      style={{ backgroundColor: '#3b82f6', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12 }}
                      onPress={() => { setActiveModal(null); router.push(`/profile/${verifyStatus!.dawenPulseId}` as any); }}
                      activeOpacity={0.8}
                    >
                      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{verifyStatus?.followsDawenPulse ? 'Done' : 'Follow'}</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Step 4 */}
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginBottom: 12, backgroundColor: verifyStatus?.sentBlueDM ? 'rgba(59,130,246,0.08)' : colors.surface, borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: verifyStatus?.sentBlueDM ? '#3b82f6' : colors.surfaceBorder }}>
                  <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: verifyStatus?.sentBlueDM ? '#3b82f6' : 'rgba(59,130,246,0.15)', justifyContent: 'center', alignItems: 'center' }}>
                    {verifyStatus?.sentBlueDM ? <Check size={16} color="#fff" strokeWidth={3} /> : <Text style={{ fontSize: 14, fontWeight: '800', color: '#3b82f6' }}>4</Text>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary }}>DM "Blue" to @BlueBadge</Text>
                    <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>Send the message "Blue" to @BlueBadge</Text>
                  </View>
                  {verifyStatus?.blueBadgeId && (
                    <TouchableOpacity
                      style={{ backgroundColor: '#3b82f6', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12 }}
                      onPress={() => { setActiveModal(null); router.push(`/chat/${verifyStatus!.blueBadgeId}` as any); }}
                      activeOpacity={0.8}
                    >
                      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{verifyStatus?.sentBlueDM ? 'Done' : 'DM'}</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <TouchableOpacity
                  style={{ backgroundColor: '#3b82f6', borderRadius: 14, paddingVertical: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 8 }}
                  onPress={handleCheckVerification}
                  disabled={verifyChecking}
                  activeOpacity={0.88}
                >
                  {verifyChecking
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Check size={18} color="#fff" />
                  }
                  <Text style={{ fontSize: 16, fontWeight: '900', color: '#fff', letterSpacing: 0.5 }}>
                    {verifyChecking ? 'Checking...' : 'CHECK & VERIFY'}
                  </Text>
                </TouchableOpacity>
                <Text style={{ fontSize: 11, color: colors.textMuted, textAlign: 'center', marginTop: 10 }}>
                  Verification is free. Make sure all 4 steps are completed before checking.
                </Text>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Premium Certification Modal (Paid) */}
      <Modal visible={activeModal === 'premium'} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: 32 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Premium Certification</Text>
              <TouchableOpacity onPress={() => { setActiveModal(null); setPremiumDone(false); setPremiumPayStatus('idle'); }}>
                <X size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            {premiumDone ? (
              <View style={{ alignItems: 'center', gap: 16, paddingVertical: 24 }}>
                <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(16,185,129,0.15)', justifyContent: 'center', alignItems: 'center' }}>
                  <Check size={36} color="#10b981" />
                </View>
                <Text style={{ fontSize: 20, fontWeight: '800', color: colors.textPrimary }}>Premium Active!</Text>
                <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: 'center' }}>
                  Your {PREMIUM_TIERS.find(t => t.key === premiumTierKey)?.label} premium is now active.
                </Text>
                {premiumTxSig && (
                  <Text style={{ fontSize: 11, color: colors.primary, textAlign: 'center', fontWeight: '600' }} numberOfLines={1} ellipsizeMode="middle">
                    {premiumTxSig}
                  </Text>
                )}
                <TouchableOpacity style={{ backgroundColor: colors.primary, paddingVertical: 14, paddingHorizontal: 40, borderRadius: 50, marginTop: 8 }} onPress={() => { setActiveModal(null); setPremiumDone(false); }}>
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Done</Text>
                </TouchableOpacity>
              </View>
            ) : premiumPayStatus === 'preparing' || premiumPayStatus === 'signing' || premiumPayStatus === 'sending' ? (
              <View style={{ alignItems: 'center', gap: 16, paddingVertical: 32 }}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPrimary }}>
                  {premiumPayStatus === 'signing' ? 'Confirm in wallet...' :
                   premiumPayStatus === 'sending' ? 'Transaction pending...' :
                   'Preparing transaction...'}
                </Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textMuted, marginBottom: 10, marginTop: 4 }}>SELECT PLAN</Text>
                {PREMIUM_TIERS.map(tier => {
                  const isSelected = premiumTierKey === tier.key;
                  const solAmt = usdToSol(tier.usd);
                  const dispAmt = premiumPayWith === 'SOL'
                    ? (solUsdPrice > 0 ? `≈ ${solAmt.toFixed(3)} SOL` : '... SOL')
                    : `≈ ${tier.usd} DTEST`;
                  return (
                    <TouchableOpacity
                      key={tier.key}
                      style={{ backgroundColor: isSelected ? 'rgba(245,158,11,0.1)' : colors.surface, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1.5, borderColor: isSelected ? '#f59e0b' : colors.surfaceBorder, flexDirection: 'row', alignItems: 'center', gap: 12 }}
                      onPress={() => setPremiumTierKey(tier.key)}
                      activeOpacity={0.8}
                    >
                      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: isSelected ? '#f59e0b' : 'rgba(245,158,11,0.15)', justifyContent: 'center', alignItems: 'center' }}>
                        <Shield size={20} color={isSelected ? '#fff' : '#f59e0b'} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPrimary }}>{tier.label}</Text>
                        <Text style={{ fontSize: 12, color: '#f59e0b', fontWeight: '600', marginTop: 3 }}>{dispAmt}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 4 }}>
                        <Text style={{ fontSize: 18, fontWeight: '900', color: colors.textPrimary }}>${tier.usd}</Text>
                        {isSelected && <Check size={16} color="#f59e0b" strokeWidth={3} />}
                      </View>
                    </TouchableOpacity>
                  );
                })}

                <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textMuted, marginBottom: 10, marginTop: 6 }}>PAY WITH</Text>
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
                  {(['SOL', 'DTEST'] as const).map(method => (
                    <TouchableOpacity
                      key={method}
                      style={{ flex: 1, backgroundColor: premiumPayWith === method ? 'rgba(59,130,246,0.12)' : colors.surface, borderRadius: 12, padding: 12, borderWidth: 1.5, borderColor: premiumPayWith === method ? colors.primary : colors.surfaceBorder, alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'center' }}
                      onPress={() => setPremiumPayWith(method)}
                      activeOpacity={0.8}
                    >
                      <Text style={{ fontSize: 16 }}>{method === 'SOL' ? '◎' : 'D'}</Text>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: premiumPayWith === method ? colors.primary : colors.textPrimary }}>{method}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {(() => {
                  const tier = PREMIUM_TIERS.find(t => t.key === premiumTierKey)!;
                  const solAmt = usdToSol(tier.usd);
                  const dispAmt = premiumPayWith === 'SOL' ? (solUsdPrice > 0 ? `${solAmt.toFixed(4)} SOL` : '... SOL') : `${tier.usd} DTEST`;
                  return (
                    <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: colors.surfaceBorder, gap: 10 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: 13, color: colors.textMuted }}>Selected Plan</Text>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary }}>{tier.label}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: 13, color: colors.textMuted }}>USD Price</Text>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary }}>${tier.usd}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: 13, color: colors.textMuted }}>You Pay</Text>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary }}>{dispAmt}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: 13, color: colors.textMuted }}>Network</Text>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary }}>Solana</Text>
                      </View>
                    </View>
                  );
                })()}

                <TouchableOpacity
                  style={{ backgroundColor: '#f59e0b', borderRadius: 14, paddingVertical: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
                  onPress={handleConfirmPremium}
                  activeOpacity={0.88}
                >
                  <Shield size={18} color="#fff" />
                  <Text style={{ fontSize: 16, fontWeight: '900', color: '#fff', letterSpacing: 1 }}>CONFIRM PREMIUM</Text>
                </TouchableOpacity>
                <Text style={{ fontSize: 11, color: colors.textMuted, textAlign: 'center', marginTop: 10 }}>
                  Payment goes directly to DAWEN treasury on Solana. Non-refundable.
                </Text>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function getChainColor(chain: string): string {
  switch (chain) {
    case 'solana': return '#9945FF';
    case 'ethereum': return '#627EEA';
    case 'polygon': return '#8247E5';
    case 'base': return '#0052FF';
    default: return colors.primary;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingTop: 56,
    paddingBottom: 16,
    paddingHorizontal: spacing.xxl,
  },
  headerTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  content: {
    flex: 1,
    paddingTop: spacing.lg,
  },
  contentContainer: {
    paddingBottom: spacing.xxxl,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    marginHorizontal: spacing.xxl,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    ...elevation.sm,
    marginBottom: spacing.xxl,
  },
  profileAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  profileAvatarImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  profileInfo: {
    flex: 1,
    marginLeft: spacing.lg,
  },
  profileName: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  profileAddress: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 4,
  },
  section: {
    marginHorizontal: spacing.xxl,
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    ...elevation.sm,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  settingRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  settingLabel: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.textPrimary,
  },
  settingValue: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.xxl,
    paddingVertical: spacing.lg,
    backgroundColor: colors.errorMuted,
    borderRadius: borderRadius.md,
    marginTop: spacing.lg,
  },
  logoutText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.error,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.xxl,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  languageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
  },
  languageRowActive: {
    backgroundColor: colors.primaryMuted,
  },
  languageName: {
    fontSize: fontSize.md,
    color: colors.textPrimary,
  },
  languageNameActive: {
    fontWeight: '600',
    color: colors.primary,
  },
  editAvatarContainer: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  editAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  editAvatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  cameraButton: {
    position: 'absolute',
    bottom: 0,
    right: '35%',
    backgroundColor: colors.primary,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: colors.surface,
    ...elevation.md,
  },
  inputLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  inputHint: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginBottom: spacing.sm,
    lineHeight: 16,
  },
  textInput: {
    fontSize: fontSize.md,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  bioInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textAlign: 'right',
    marginTop: -spacing.md,
    marginBottom: spacing.lg,
  },
  saveButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.white,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  accountRowActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryMuted,
  },
  chainDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: spacing.md,
  },
  walletProviderIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: spacing.md,
    backgroundColor: colors.surfaceBorder,
  },
  accountInfo: {
    flex: 1,
  },
  accountNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: 2,
  },
  accountName: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  walletTypeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceBorder,
  },
  walletTypeBadgeConnected: {
    backgroundColor: 'rgba(20, 241, 149, 0.15)',
  },
  walletTypeBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  accountAddress: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  disconnectButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.errorMuted,
    borderWidth: 1,
    borderColor: colors.error,
  },
  disconnectButtonText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.error,
  },
  noWalletsText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
  addAccountSection: {
    marginTop: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
    paddingTop: spacing.lg,
  },
  addAccountTitle: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  chainButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chainButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  chainButtonDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  chainButtonText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  recoveryWarning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: colors.warningMuted,
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  recoveryWarningText: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.warning,
    lineHeight: 18,
  },
  revealButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.md,
  },
  revealButtonText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.white,
  },
  phraseGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  phraseWord: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    width: '30%',
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  phraseWordNum: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    width: 16,
  },
  phraseWordText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  copyPhraseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  copyPhraseText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.primary,
  },
  notifSection: {
    paddingVertical: spacing.lg,
  },
  notifToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    marginBottom: spacing.md,
  },
  notifToggleLabel: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  toggleTrack: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surfaceBorder,
    justifyContent: 'center',
    padding: 2,
  },
  toggleTrackActive: {
    backgroundColor: colors.primary,
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.white,
  },
  toggleThumbActive: {
    alignSelf: 'flex-end',
  },
  notifHint: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  helpSectionTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  faqItem: {
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  faqHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  faqQuestion: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
    flex: 1,
    marginRight: spacing.sm,
  },
  faqAnswer: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
    marginTop: spacing.md,
  },
  contactSection: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  contactTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  contactText: {
    fontSize: fontSize.sm,
    color: colors.primary,
  },
  assistantSection: {
    paddingVertical: spacing.lg,
    gap: spacing.lg,
  },
  assistantTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  assistantDesc: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  assistantFeatures: {
    gap: spacing.md,
  },
  assistantFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.sm,
  },
  assistantFeatureText: {
    fontSize: fontSize.sm,
    color: colors.textPrimary,
  },
  comingSoonBadge: {
    alignSelf: 'center',
    backgroundColor: colors.primaryMuted,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xxl,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  comingSoonText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.primary,
  },

  // Redesigned Edit Profile modal
  profileModalContent: {
    backgroundColor: '#13131D',
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.xxl,
    paddingBottom: 40,
    maxHeight: '88%',
  },
  profileModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  profileModalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  profileModalClose: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileAvatarWrap: {
    alignSelf: 'center',
    marginBottom: spacing.md,
    position: 'relative',
  },
  profileAvatarRing: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2.5,
    borderColor: colors.primary,
    overflow: 'hidden',
  },
  profileAvatarLarge: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  profileAvatarEmpty: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#1E1E2E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editPencilBtn: {
    position: 'absolute',
    bottom: 4,
    right: 0,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#13131D',
  },
  avatarHint: {
    textAlign: 'center',
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: spacing.xxl,
  },
  profileFieldLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  profileInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: '#1A1A28',
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.2)',
  },
  profileFieldInput: {
    flex: 1,
    fontSize: 16,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  profileBioWrap: {
    backgroundColor: '#1A1A28',
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    marginBottom: spacing.xxl,
    minHeight: 120,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.2)',
  },
  profileBioInput: {
    fontSize: 15,
    color: colors.textPrimary,
    minHeight: 88,
    lineHeight: 22,
  },
  profileCharCount: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'right',
    paddingBottom: spacing.sm,
  },
  profileSaveBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: 18,
    alignItems: 'center',
  },
  profileSaveBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.white,
  },
});
