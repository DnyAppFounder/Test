import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  FlatList,
  Alert,
  SafeAreaView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWallet } from '@/contexts/WalletContext';
import { colors, spacing, fontSize, fontWeight, borderRadius } from '@/constants/theme';
import { BlockRenderer } from '@/components/studio/BlockRenderer';
import { BLOCK_TYPE_INFO } from '@/components/studio/templates';
import {
  getPageEditor,
  saveBlocks,
  updatePage,
  publishPage,
  checkSlug,
  generateSlug,
} from '@/services/pageStudioService';
import type { Page, PageBlock, BlockType } from '@/services/pageStudioService';
import {
  ArrowLeft,
  Globe,
  EyeOff,
  ChevronUp,
  ChevronDown,
  Trash2,
  Pencil,
  Plus,
  Check,
} from 'lucide-react-native';

const ACCENT_PRESETS = ['#4B8FFF', '#22c55e', '#f59e0b', '#ef4444', '#00D4FF', '#FF006E', '#A78BFA'];

type EditorTab = 'blocks' | 'preview' | 'settings';

// Per-block-type field definitions for the edit modal
const BLOCK_FIELD_DEFS: Record<string, Array<{ key: string; label: string; multiline?: boolean; placeholder?: string }>> = {
  hero: [
    { key: 'title', label: 'Title', placeholder: 'Main headline' },
    { key: 'subtitle', label: 'Subtitle', placeholder: 'Supporting text below title' },
    { key: 'description', label: 'Description', multiline: true, placeholder: 'Body copy' },
    { key: 'primaryButtonText', label: 'Primary Button Text', placeholder: 'Buy Now' },
    { key: 'primaryButtonUrl', label: 'Primary Button URL', placeholder: 'https://...' },
    { key: 'secondaryButtonText', label: 'Secondary Button Text', placeholder: 'Learn More' },
    { key: 'secondaryButtonUrl', label: 'Secondary Button URL', placeholder: 'https://...' },
    { key: 'logoUrl', label: 'Logo URL', placeholder: 'https://...' },
  ],
  text: [
    { key: 'heading', label: 'Heading', placeholder: 'Section heading' },
    { key: 'text', label: 'Body Text', multiline: true, placeholder: 'Paragraph content...' },
  ],
  button: [
    { key: 'text', label: 'Button Label', placeholder: 'Click Here' },
    { key: 'url', label: 'URL', placeholder: 'https://...' },
    { key: 'type', label: 'Style (primary / secondary)', placeholder: 'primary' },
  ],
  token_info: [
    { key: 'name', label: 'Token Name', placeholder: 'My Token' },
    { key: 'symbol', label: 'Symbol', placeholder: 'MTK' },
    { key: 'mint', label: 'Mint Address', placeholder: 'Solana address...' },
    { key: 'supply', label: 'Total Supply', placeholder: '1,000,000,000' },
    { key: 'decimals', label: 'Decimals', placeholder: '9' },
    { key: 'chain', label: 'Chain', placeholder: 'Solana' },
    { key: 'logoUrl', label: 'Logo URL', placeholder: 'https://...' },
    { key: 'presalePrice', label: 'Presale Price (optional)', placeholder: '0.001 SOL' },
    { key: 'launchPrice', label: 'Launch Price (optional)', placeholder: '0.005 SOL' },
  ],
  buy_widget: [
    { key: 'title', label: 'Title', placeholder: 'Buy Token' },
    { key: 'description', label: 'Description', placeholder: 'Get your tokens now' },
  ],
  roadmap: [
    { key: 'title', label: 'Section Title', placeholder: 'Roadmap' },
  ],
  tokenomics: [
    { key: 'title', label: 'Section Title', placeholder: 'Tokenomics' },
    { key: 'vestingSchedule', label: 'Vesting Note', multiline: true, placeholder: 'Tokens vest over 24 months...' },
  ],
  team: [
    { key: 'title', label: 'Section Title', placeholder: 'Meet the Team' },
  ],
  faq: [
    { key: 'title', label: 'Section Title', placeholder: 'Frequently Asked Questions' },
  ],
  gallery: [
    { key: 'title', label: 'Section Title', placeholder: 'Gallery' },
  ],
  video: [
    { key: 'title', label: 'Title', placeholder: 'Video Title' },
    { key: 'url', label: 'Video URL', placeholder: 'https://youtube.com/...' },
    { key: 'thumbnail', label: 'Thumbnail URL', placeholder: 'https://...' },
  ],
  countdown: [
    { key: 'title', label: 'Title', placeholder: 'Launch In:' },
    { key: 'targetDate', label: 'Target Date (ISO)', placeholder: '2025-07-15T00:00:00Z' },
  ],
  whitelist_form: [
    { key: 'title', label: 'Form Title', placeholder: 'Join Whitelist' },
    { key: 'subtitle', label: 'Subtitle', placeholder: 'Reserve your allocation' },
    { key: 'submitText', label: 'Submit Button Text', placeholder: 'Register' },
    { key: 'successMessage', label: 'Success Message', placeholder: 'Thank you! You\'re on the list.' },
  ],
  claim: [
    { key: 'title', label: 'Title', placeholder: 'Claim Your Airdrop' },
    { key: 'subtitle', label: 'Subtitle', placeholder: 'Connect your wallet and click claim' },
    { key: 'tokenAmount', label: 'Token Amount', placeholder: '1000' },
    { key: 'tokenSymbol', label: 'Token Symbol', placeholder: 'TOKEN' },
    { key: 'instructions', label: 'Instructions', multiline: true, placeholder: 'Step-by-step claiming instructions...' },
    { key: 'claimButtonText', label: 'Button Text', placeholder: 'Claim Tokens' },
  ],
  media_kit: [
    { key: 'title', label: 'Title', placeholder: 'Media Kit' },
    { key: 'description', label: 'Description', multiline: true, placeholder: 'Press resources...' },
  ],
  announcement: [
    { key: 'title', label: 'Title', placeholder: 'Announcement' },
    { key: 'message', label: 'Message', multiline: true, placeholder: 'Your announcement here...' },
    { key: 'type', label: 'Type (info/warning/success/alert)', placeholder: 'info' },
    { key: 'icon', label: 'Icon (emoji)', placeholder: '📢' },
  ],
  embed: [
    { key: 'title', label: 'Title', placeholder: 'Embed' },
    { key: 'url', label: 'URL to Embed', placeholder: 'https://...' },
  ],
  qr_code: [
    { key: 'title', label: 'Title', placeholder: 'QR Code' },
    { key: 'data', label: 'QR Data / URL', placeholder: 'https://...' },
    { key: 'caption', label: 'Caption', placeholder: 'Scan to visit...' },
  ],
  footer: [
    { key: 'disclaimer', label: 'Disclaimer', multiline: true, placeholder: 'Not financial advice...' },
  ],
  custom_section: [
    { key: 'heading', label: 'Heading', placeholder: 'Section Heading' },
    { key: 'body', label: 'Body', multiline: true, placeholder: 'Content...' },
  ],
  live_chart: [
    { key: 'title', label: 'Title', placeholder: 'Live Chart' },
    { key: 'symbol', label: 'Token Symbol', placeholder: 'SOL' },
  ],
  social_links: [
    { key: 'title', label: 'Section Title', placeholder: 'Follow Us' },
  ],
};

export default function EditScreen() {
  const { pageId } = useLocalSearchParams<{ pageId: string }>();
  const router = useRouter();
  const { activeAddress } = useWallet();
  const insets = useSafeAreaInsets();

  const [page, setPage] = useState<Page | null>(null);
  const [blocks, setBlocks] = useState<PageBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveIndicator, setSaveIndicator] = useState<'saved' | 'saving' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<EditorTab>('blocks');
  const [blockPickerVisible, setBlockPickerVisible] = useState(false);
  const [editingBlock, setEditingBlock] = useState<PageBlock | null>(null);
  const [editingContent, setEditingContent] = useState<Record<string, any>>({});

  // Settings state
  const [settingsTitle, setSettingsTitle] = useState('');
  const [settingsSlug, setSettingsSlug] = useState('');
  const [settingsDescription, setSettingsDescription] = useState('');
  const [settingsTheme, setSettingsTheme] = useState<'dark' | 'light'>('dark');
  const [settingsAccent, setSettingsAccent] = useState('#4B8FFF');
  const [customHex, setCustomHex] = useState('');
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [checkingSlug, setCheckingSlug] = useState(false);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slugTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadPageData();
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (slugTimerRef.current) clearTimeout(slugTimerRef.current);
    };
  }, []);

  const loadPageData = async () => {
    if (!activeAddress || !pageId) return;
    try {
      setLoading(true);
      setError(null);
      const data = await getPageEditor(activeAddress, pageId);
      setPage(data.page);
      setBlocks(data.blocks.sort((a, b) => a.sort_order - b.sort_order));
      syncSettings(data.page);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load page');
    } finally {
      setLoading(false);
    }
  };

  const syncSettings = (p: Page) => {
    setSettingsTitle(p.title);
    setSettingsSlug(p.slug);
    setSettingsDescription(p.description || '');
    setSettingsTheme((p.global_settings?.theme as 'dark' | 'light') || 'dark');
    setSettingsAccent(p.global_settings?.accentColor || '#4B8FFF');
  };

  const scheduleAutoSave = useCallback((newBlocks: PageBlock[]) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaveIndicator('saving');
    saveTimerRef.current = setTimeout(async () => {
      if (!activeAddress || !pageId) return;
      try {
        const payload = newBlocks.map(b => ({
          // Only send id for persisted blocks (no fake 'new-' prefix)
          ...(b.id && !b.id.startsWith('new-') ? { id: b.id } : {}),
          block_type: b.block_type,
          sort_order: b.sort_order,
          content_json: b.content_json,
          style_json: b.style_json,
          animation_json: b.animation_json,
          is_hidden: b.is_hidden,
        }));
        const saved = await saveBlocks(activeAddress, pageId, payload);
        // Update blocks with server-assigned IDs
        setBlocks(saved.sort((a, b) => a.sort_order - b.sort_order));
        setSaveIndicator('saved');
        setTimeout(() => setSaveIndicator(null), 2000);
      } catch {
        setSaveIndicator(null);
      }
    }, 1500);
  }, [activeAddress, pageId]);

  const updateBlocks = (newBlocks: PageBlock[]) => {
    setBlocks(newBlocks);
    scheduleAutoSave(newBlocks);
  };

  const handleDeleteBlock = (blockId: string) => {
    Alert.alert('Delete Block', 'Remove this block?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          const updated = blocks
            .filter(b => b.id !== blockId)
            .map((b, i) => ({ ...b, sort_order: i + 1 }));
          updateBlocks(updated);
        },
      },
    ]);
  };

  const handleMoveBlock = (blockId: string, dir: 'up' | 'down') => {
    const idx = blocks.findIndex(b => b.id === blockId);
    if (dir === 'up' && idx <= 0) return;
    if (dir === 'down' && idx >= blocks.length - 1) return;
    const next = [...blocks];
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    updateBlocks(next.map((b, i) => ({ ...b, sort_order: i + 1 })));
  };

  const handleOpenEditBlock = (block: PageBlock) => {
    setEditingBlock(block);
    setEditingContent(JSON.parse(JSON.stringify(block.content_json)));
  };

  const handleSaveBlockEdit = () => {
    if (!editingBlock) return;
    const updated = blocks.map(b =>
      b.id === editingBlock.id ? { ...b, content_json: editingContent } : b
    );
    updateBlocks(updated);
    setEditingBlock(null);
    setEditingContent({});
  };

  const handleAddBlock = (blockType: BlockType) => {
    const defaults = getBlockDefaults(blockType);
    const newBlock: PageBlock = {
      id: `new-${Date.now()}`,
      page_id: pageId!,
      block_type: blockType,
      sort_order: blocks.length + 1,
      content_json: defaults,
      style_json: {},
      animation_json: {},
      is_hidden: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    updateBlocks([...blocks, newBlock]);
    setBlockPickerVisible(false);
  };

  const handleSaveSettings = async () => {
    if (!activeAddress || !page) return;
    if (slugAvailable === false) {
      Alert.alert('Slug Taken', 'Please choose a different page slug');
      return;
    }
    setSaving(true);
    try {
      const updated = await updatePage(activeAddress, pageId!, {
        title: settingsTitle,
        slug: settingsSlug,
        description: settingsDescription,
        global_settings: {
          ...page.global_settings,
          theme: settingsTheme,
          accentColor: settingsAccent,
        },
      });
      setPage(updated);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handlePublishToggle = async () => {
    if (!activeAddress || !page) return;
    const isPublished = page.status === 'published';
    Alert.alert(
      isPublished ? 'Unpublish Page' : 'Publish Page',
      isPublished
        ? 'This will take the page offline.'
        : 'This will make the page publicly accessible at its URL.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isPublished ? 'Unpublish' : 'Publish',
          onPress: async () => {
            setSaving(true);
            try {
              const updated = await publishPage(
                activeAddress,
                pageId!,
                isPublished ? 'draft' : 'published'
              );
              setPage(updated);
            } catch (err) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Failed to update status');
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  const handleSlugChange = (text: string) => {
    const clean = text.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-{2,}/g, '-');
    setSettingsSlug(clean);
    setSlugAvailable(null);
    if (slugTimerRef.current) clearTimeout(slugTimerRef.current);
    if (!clean) return;
    slugTimerRef.current = setTimeout(async () => {
      setCheckingSlug(true);
      try {
        const res = await checkSlug(clean, pageId!);
        setSlugAvailable(res.available);
      } catch {
        setSlugAvailable(null);
      } finally {
        setCheckingSlug(false);
      }
    }, 600);
  };

  const accentColor = page?.global_settings?.accentColor || settingsAccent;
  const theme = (page?.global_settings?.theme as 'dark' | 'light') || settingsTheme;

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!page) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.errorMsg}>{error || 'Page not found'}</Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const isPublished = page.status === 'published';

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBack}>
          <ArrowLeft size={20} color={colors.textPrimary} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.headerPageTitle} numberOfLines={1}>{page.title}</Text>
          {saveIndicator === 'saving' && (
            <Text style={styles.saveHint}>Saving…</Text>
          )}
          {saveIndicator === 'saved' && (
            <Text style={[styles.saveHint, { color: colors.success }]}>Saved</Text>
          )}
        </View>

        <TouchableOpacity
          style={[styles.publishBtn, isPublished && styles.publishBtnActive, saving && styles.btnDisabled]}
          onPress={handlePublishToggle}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : isPublished ? (
            <>
              <EyeOff size={14} color={colors.white} />
              <Text style={styles.publishBtnText}>Unpublish</Text>
            </>
          ) : (
            <>
              <Globe size={14} color={colors.white} />
              <Text style={styles.publishBtnText}>Publish</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {(['blocks', 'preview', 'settings'] as EditorTab[]).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Blocks tab */}
      {activeTab === 'blocks' && (
        <ScrollView
          style={styles.content}
          contentContainerStyle={[styles.contentPad, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {blocks.length === 0 ? (
            <View style={styles.emptyBlocks}>
              <Text style={styles.emptyBlocksText}>No blocks yet</Text>
              <Text style={styles.emptyBlocksSub}>Tap "+ Add Block" to build your page</Text>
            </View>
          ) : (
            blocks.map((block, idx) => (
              <View key={block.id} style={styles.blockRow}>
                <View style={styles.blockToolbar}>
                  <Text style={styles.blockLabel}>
                    {BLOCK_TYPE_INFO[block.block_type]?.emoji} {BLOCK_TYPE_INFO[block.block_type]?.label || block.block_type}
                  </Text>
                  <View style={styles.blockActions}>
                    <TouchableOpacity
                      style={[styles.toolBtn, idx === 0 && styles.toolBtnDisabled]}
                      onPress={() => handleMoveBlock(block.id, 'up')}
                      disabled={idx === 0}
                    >
                      <ChevronUp size={16} color={idx === 0 ? colors.textMuted : colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.toolBtn, idx === blocks.length - 1 && styles.toolBtnDisabled]}
                      onPress={() => handleMoveBlock(block.id, 'down')}
                      disabled={idx === blocks.length - 1}
                    >
                      <ChevronDown size={16} color={idx === blocks.length - 1 ? colors.textMuted : colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.toolBtn}
                      onPress={() => handleOpenEditBlock(block)}
                    >
                      <Pencil size={15} color={colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.toolBtn, styles.toolBtnDelete]}
                      onPress={() => handleDeleteBlock(block.id)}
                    >
                      <Trash2 size={15} color={colors.error} />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.blockPreviewWrap} pointerEvents="none">
                  <BlockRenderer
                    block={block}
                    pageId={pageId!}
                    isEditing={false}
                    theme={theme}
                    accentColor={accentColor}
                  />
                </View>
              </View>
            ))
          )}

          <TouchableOpacity
            style={styles.addBlockBtn}
            onPress={() => setBlockPickerVisible(true)}
          >
            <Plus size={18} color={colors.primary} />
            <Text style={styles.addBlockBtnText}>Add Block</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Preview tab — real public-style render */}
      {activeTab === 'preview' && (
        <ScrollView
          style={[styles.content, { backgroundColor: page.global_settings?.backgroundColor || '#0D0618' }]}
          contentContainerStyle={{ paddingBottom: insets.bottom + 60 }}
          showsVerticalScrollIndicator={false}
        >
          {blocks.length === 0 ? (
            <View style={styles.center}>
              <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>No blocks to preview</Text>
            </View>
          ) : (
            blocks.map((block, i) => (
              <BlockRenderer
                key={block.id || i}
                block={block}
                pageId={pageId!}
                isEditing={false}
                theme={theme}
                accentColor={accentColor}
              />
            ))
          )}
        </ScrollView>
      )}

      {/* Settings tab */}
      {activeTab === 'settings' && (
        <KeyboardAvoidingView
          style={styles.content}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={[styles.contentPad, { paddingBottom: insets.bottom + 80 }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <SettingsField label="Page Title">
              <TextInput
                style={styles.settingInput}
                value={settingsTitle}
                onChangeText={setSettingsTitle}
                placeholder="Page title"
                placeholderTextColor={colors.textMuted}
              />
            </SettingsField>

            <SettingsField label="URL Slug" hint={`dawen.app/page/${settingsSlug}`}>
              <View style={styles.slugRow}>
                <TextInput
                  style={[styles.settingInput, styles.slugInput]}
                  value={settingsSlug}
                  onChangeText={handleSlugChange}
                  placeholder="page-slug"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {checkingSlug && <ActivityIndicator size="small" color={colors.primary} />}
                {!checkingSlug && slugAvailable === true && (
                  <View style={styles.slugAvailChip}>
                    <Check size={12} color={colors.success} strokeWidth={3} />
                    <Text style={[styles.slugStatus, { color: colors.success }]}>Available</Text>
                  </View>
                )}
                {!checkingSlug && slugAvailable === false && (
                  <Text style={[styles.slugStatus, { color: colors.error }]}>Taken</Text>
                )}
              </View>
            </SettingsField>

            <SettingsField label="Description">
              <TextInput
                style={[styles.settingInput, styles.descInput]}
                value={settingsDescription}
                onChangeText={setSettingsDescription}
                placeholder="Brief description for SEO and previews"
                placeholderTextColor={colors.textMuted}
                multiline
                textAlignVertical="top"
              />
            </SettingsField>

            <SettingsField label="Theme">
              <View style={styles.themeRow}>
                {(['dark', 'light'] as const).map(t => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.themeBtn, settingsTheme === t && styles.themeBtnActive]}
                    onPress={() => setSettingsTheme(t)}
                  >
                    <Text style={[styles.themeBtnText, settingsTheme === t && styles.themeBtnTextActive]}>
                      {t === 'dark' ? '🌑 Dark' : '☀️ Light'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </SettingsField>

            <SettingsField label="Accent Color">
              <View style={styles.swatchRow}>
                {ACCENT_PRESETS.map(c => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.swatch, { backgroundColor: c }, settingsAccent === c && styles.swatchActive]}
                    onPress={() => setSettingsAccent(c)}
                  >
                    {settingsAccent === c && <Check size={14} color="#fff" strokeWidth={3} />}
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.hexRow}>
                <TextInput
                  style={[styles.settingInput, styles.hexInput]}
                  value={customHex}
                  onChangeText={setCustomHex}
                  placeholder="#RRGGBB"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={7}
                />
                <TouchableOpacity
                  style={styles.hexApplyBtn}
                  onPress={() => {
                    if (/^#[0-9A-Fa-f]{6}$/.test(customHex)) {
                      setSettingsAccent(customHex);
                      setCustomHex('');
                    }
                  }}
                >
                  <Text style={styles.hexApplyText}>Apply</Text>
                </TouchableOpacity>
                {settingsAccent && (
                  <View style={[styles.accentPreview, { backgroundColor: settingsAccent }]} />
                )}
              </View>
            </SettingsField>

            <TouchableOpacity
              style={[styles.saveSettingsBtn, saving && styles.btnDisabled]}
              onPress={handleSaveSettings}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Text style={styles.saveSettingsBtnText}>Save Settings</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {/* Block Picker Modal */}
      <Modal
        visible={blockPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setBlockPickerVisible(false)}
      >
        <View style={styles.sheetOverlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Add Block</Text>
              <TouchableOpacity onPress={() => setBlockPickerVisible(false)}>
                <Text style={styles.sheetClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={Object.entries(BLOCK_TYPE_INFO)}
              keyExtractor={([k]) => k}
              renderItem={({ item: [key, info] }) => (
                <TouchableOpacity
                  style={styles.blockTypeRow}
                  onPress={() => handleAddBlock(key as BlockType)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.blockTypeEmoji}>{info.emoji}</Text>
                  <View style={styles.blockTypeInfo}>
                    <Text style={styles.blockTypeName}>{info.label}</Text>
                    <Text style={styles.blockTypeDesc} numberOfLines={1}>{info.description}</Text>
                  </View>
                </TouchableOpacity>
              )}
              style={styles.blockTypeList}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            />
          </View>
        </View>
      </Modal>

      {/* Block Edit Modal */}
      <Modal
        visible={editingBlock !== null}
        transparent
        animationType="slide"
        onRequestClose={() => { setEditingBlock(null); setEditingContent({}); }}
      >
        <View style={styles.sheetOverlay}>
          <KeyboardAvoidingView
            style={styles.editSheet}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>
                {editingBlock ? `Edit ${BLOCK_TYPE_INFO[editingBlock.block_type]?.label || editingBlock.block_type}` : 'Edit Block'}
              </Text>
              <TouchableOpacity onPress={() => { setEditingBlock(null); setEditingContent({}); }}>
                <Text style={styles.sheetClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.editScrollArea}
              contentContainerStyle={styles.editScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {editingBlock && renderBlockEditFields(
                editingBlock.block_type,
                editingContent,
                (key, val) => setEditingContent(prev => ({ ...prev, [key]: val }))
              )}
            </ScrollView>

            <View style={styles.editActions}>
              <TouchableOpacity
                style={styles.editCancelBtn}
                onPress={() => { setEditingBlock(null); setEditingContent({}); }}
              >
                <Text style={styles.editCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.editSaveBtn} onPress={handleSaveBlockEdit}>
                <Text style={styles.editSaveText}>Save Block</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function SettingsField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={styles.settingSection}>
      <Text style={styles.settingLabel}>{label}</Text>
      {hint ? <Text style={styles.settingHint}>{hint}</Text> : null}
      {children}
    </View>
  );
}

function renderBlockEditFields(
  blockType: BlockType,
  content: Record<string, any>,
  onChange: (key: string, value: any) => void
): React.ReactNode {
  const fields = BLOCK_FIELD_DEFS[blockType];

  if (!fields || fields.length === 0) {
    return (
      <Text style={{ color: colors.textMuted, fontSize: fontSize.sm, textAlign: 'center', padding: 24 }}>
        This block has no editable text fields. Use the Blocks tab to manage it.
      </Text>
    );
  }

  return fields.map(f => (
    <View key={f.key} style={styles.editField}>
      <Text style={styles.editFieldLabel}>{f.label}</Text>
      <TextInput
        style={[styles.editFieldInput, f.multiline && styles.editFieldInputMulti]}
        value={typeof content[f.key] === 'string' ? content[f.key] : (content[f.key] != null ? String(content[f.key]) : '')}
        onChangeText={v => onChange(f.key, v)}
        placeholder={f.placeholder || `Enter ${f.label.toLowerCase()}`}
        placeholderTextColor={colors.textMuted}
        multiline={f.multiline}
        textAlignVertical={f.multiline ? 'top' : 'center'}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  ));
}

function getBlockDefaults(blockType: BlockType): Record<string, any> {
  const defaults: Partial<Record<BlockType, Record<string, any>>> = {
    hero: { title: 'New Section', subtitle: '', description: '', primaryButtonText: 'Get Started', primaryButtonUrl: '', secondaryButtonText: '', secondaryButtonUrl: '', alignment: 'center', logoUrl: '' },
    text: { heading: 'New Heading', text: 'Edit this text block with your content.' },
    button: { text: 'Click Here', url: '', type: 'primary' },
    social_links: { title: 'Follow Us', links: [{ platform: 'x_twitter', url: '' }], style: 'icon-row' },
    token_info: { name: 'Token Name', symbol: 'TKN', mint: '', supply: '', decimals: '9', chain: 'Solana', logoUrl: '' },
    live_chart: { title: 'Live Chart', symbol: '' },
    buy_widget: { title: 'Buy Token', description: '', dexes: ['jupiter'] },
    roadmap: { title: 'Roadmap', items: [{ title: 'Phase 1', description: '', status: 'upcoming', date: '' }] },
    tokenomics: { title: 'Tokenomics', items: [{ label: 'Community', percentage: 50, color: '#4B8FFF' }, { label: 'Team', percentage: 20, color: '#5865F2' }, { label: 'Development', percentage: 30, color: '#00D4FF' }] },
    team: { title: 'Meet the Team', members: [{ name: 'Team Member', role: 'Role', image: '' }] },
    faq: { title: 'FAQ', items: [{ question: 'Question?', answer: 'Answer here.' }] },
    gallery: { title: 'Gallery', images: [{ url: '', title: 'Image 1' }], columns: 2 },
    video: { title: '', url: '', thumbnail: '' },
    countdown: { title: 'Launch In:', targetDate: '', showDays: true, showHours: true, showMinutes: true, showSeconds: true },
    whitelist_form: { title: 'Join Whitelist', subtitle: '', fields: ['wallet_address', 'email'], submitText: 'Submit', successMessage: "You're on the list!" },
    claim: { title: 'Claim Tokens', subtitle: '', tokenAmount: '1000', tokenSymbol: 'TOKEN', instructions: '', claimButtonText: 'Claim Now' },
    media_kit: { title: 'Media Kit', description: '', assets: [] },
    announcement: { title: 'Announcement', message: '', type: 'info', icon: '📢' },
    embed: { title: '', url: '' },
    qr_code: { title: 'QR Code', data: '', caption: '' },
    footer: { links: [], socials: [], disclaimer: '', showDawenBadge: true },
    custom_section: { heading: 'Custom Section', body: '' },
  };
  return defaults[blockType] || {};
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
    backgroundColor: colors.surfaceElevated,
    gap: spacing.sm,
  },
  headerBack: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceLight,
  },
  headerCenter: {
    flex: 1,
  },
  headerPageTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  saveHint: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
  },
  publishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    gap: 5,
  },
  publishBtnActive: {
    backgroundColor: colors.warning,
  },
  publishBtnText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.white,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.primary,
  },
  tabText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.primary,
    fontWeight: fontWeight.semibold,
  },
  content: {
    flex: 1,
  },
  contentPad: {
    padding: spacing.lg,
  },
  emptyBlocks: {
    alignItems: 'center',
    paddingVertical: 56,
    gap: spacing.sm,
  },
  emptyBlocksText: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  emptyBlocksSub: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  blockRow: {
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    overflow: 'hidden',
  },
  blockToolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceElevated,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  blockLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    flex: 1,
  },
  blockActions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  toolBtn: {
    width: 30,
    height: 30,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolBtnDelete: {
    backgroundColor: colors.errorMuted,
  },
  toolBtnDisabled: {
    opacity: 0.3,
  },
  blockPreviewWrap: {
    overflow: 'hidden',
  },
  addBlockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    borderRadius: borderRadius.lg,
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  addBlockBtnText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
  },
  settingSection: {
    marginBottom: spacing.xl,
    gap: spacing.sm,
  },
  settingLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  settingHint: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: -4,
  },
  settingInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.textPrimary,
    fontSize: fontSize.md,
  },
  slugRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  slugInput: {
    flex: 1,
  },
  slugAvailChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  slugStatus: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  descInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  themeRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  themeBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  themeBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  themeBtnText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
  },
  themeBtnTextActive: {
    color: colors.white,
  },
  swatchRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  swatch: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchActive: {
    borderColor: colors.white,
  },
  hexRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  hexInput: {
    flex: 1,
    paddingVertical: spacing.sm,
  },
  hexApplyBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
  },
  hexApplyText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.white,
  },
  accentPreview: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.sm,
  },
  saveSettingsBtn: {
    paddingVertical: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  saveSettingsBtnText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.white,
  },
  errorMsg: {
    color: colors.error,
    fontSize: fontSize.md,
    textAlign: 'center',
  },
  backBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
  },
  backBtnText: {
    color: colors.white,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  // Modals / sheets
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '72%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingBottom: 24,
  },
  editSheet: {
    height: '82%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: colors.surfaceBorderLight,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  sheetTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  sheetClose: {
    fontSize: fontSize.lg,
    color: colors.textMuted,
    padding: 4,
  },
  blockTypeList: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  blockTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
    gap: spacing.md,
  },
  blockTypeEmoji: {
    fontSize: 26,
    width: 32,
    textAlign: 'center',
  },
  blockTypeInfo: {
    flex: 1,
  },
  blockTypeName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  blockTypeDesc: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: 2,
  },
  editScrollArea: {
    flex: 1,
  },
  editScrollContent: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    paddingBottom: 20,
  },
  editField: {
    marginBottom: spacing.lg,
  },
  editFieldLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  editFieldInput: {
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.textPrimary,
    fontSize: fontSize.sm,
  },
  editFieldInputMulti: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  editActions: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
  },
  editCancelBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  editCancelText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
  },
  editSaveBtn: {
    flex: 2,
    paddingVertical: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  editSaveText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.white,
  },
});
