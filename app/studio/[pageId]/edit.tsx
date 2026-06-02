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
import { useWallet } from '@/contexts/WalletContext';
import { colors, spacing, fontSize, fontWeight, borderRadius } from '@/constants/theme';
import { BlockRenderer } from '@/components/studio/BlockRenderer';
import { BLOCK_TYPE_INFO } from '@/components/studio/templates';
import {
  getPageEditor,
  saveBlocks,
  updatePage,
  publishPage,
  deletePage,
  checkSlug,
} from '@/services/pageStudioService';
import type { Page, PageBlock, BlockType } from '@/services/pageStudioService';

const ACCENT_COLORS = ['#4B8FFF', '#22c55e', '#f59e0b', '#ef4444', '#00D4FF', '#FF006E'];

export default function EditScreen() {
  const { pageId } = useLocalSearchParams<{ pageId: string }>();
  const router = useRouter();
  const { activeAddress } = useWallet();

  // State
  const [page, setPage] = useState<Page | null>(null);
  const [blocks, setBlocks] = useState<PageBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // UI State
  const [activeTab, setActiveTab] = useState<'blocks' | 'settings'>('blocks');
  const [blockPickerVisible, setBlockPickerVisible] = useState(false);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [editingBlockContent, setEditingBlockContent] = useState<Record<string, any> | null>(null);

  // Settings tab state
  const [settingsTitle, setSettingsTitle] = useState('');
  const [settingsSlug, setSettingsSlug] = useState('');
  const [settingsDescription, setSettingsDescription] = useState('');
  const [settingsTheme, setSettingsTheme] = useState<'dark' | 'light'>('dark');
  const [settingsAccentColor, setSettingsAccentColor] = useState('#4B8FFF');
  const [customAccentColor, setCustomAccentColor] = useState('');
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [checkingSlug, setCheckingSlug] = useState(false);

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load page data
  useEffect(() => {
    loadPageData();
  }, []);

  const loadPageData = async () => {
    if (!activeAddress || !pageId) return;

    try {
      setLoading(true);
      setError(null);
      const data = await getPageEditor(activeAddress, pageId);
      setPage(data.page);
      setBlocks(data.blocks);

      // Initialize settings
      setSettingsTitle(data.page.title);
      setSettingsSlug(data.page.slug);
      setSettingsDescription(data.page.description || '');
      setSettingsTheme(data.page.global_settings.theme || 'dark');
      setSettingsAccentColor(data.page.global_settings.accentColor || '#4B8FFF');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load page');
    } finally {
      setLoading(false);
    }
  };

  // Auto-save blocks
  const handleBlocksChange = useCallback((newBlocks: PageBlock[]) => {
    setBlocks(newBlocks);

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      autoSaveBlocks(newBlocks);
    }, 2000);
  }, []);

  const autoSaveBlocks = async (blocksToSave: PageBlock[]) => {
    if (!activeAddress || !pageId) return;

    try {
      const savePayload = blocksToSave.map((block) => ({
        id: block.id,
        block_type: block.block_type,
        sort_order: block.sort_order,
        content_json: block.content_json,
        style_json: block.style_json,
        animation_json: block.animation_json,
        is_hidden: block.is_hidden,
      }));

      await saveBlocks(activeAddress, pageId, savePayload);
    } catch (err) {
      setError('Auto-save failed');
    }
  };

  const handleSaveSettings = async () => {
    if (!activeAddress || !page) return;

    try {
      setSaving(true);
      await updatePage(activeAddress, pageId!, {
        title: settingsTitle,
        slug: settingsSlug,
        description: settingsDescription,
        global_settings: {
          ...page.global_settings,
          theme: settingsTheme,
          accentColor: settingsAccentColor,
        },
      });

      Alert.alert('Success', 'Settings saved successfully');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handlePublishPage = async () => {
    if (!activeAddress || !page) return;

    Alert.alert('Publish Page', 'Are you sure you want to publish this page?', [
      { text: 'Cancel' },
      {
        text: 'Publish',
        onPress: async () => {
          try {
            setSaving(true);
            await publishPage(activeAddress, pageId!, 'published');
            Alert.alert('Success', 'Page published successfully');
            setPage({ ...page, status: 'published' });
          } catch (err) {
            Alert.alert('Error', err instanceof Error ? err.message : 'Failed to publish');
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  const handleDeleteBlock = (blockId: string) => {
    Alert.alert('Delete Block', 'Are you sure you want to delete this block?', [
      { text: 'Cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          const newBlocks = blocks.filter((b) => b.id !== blockId);
          handleBlocksChange(newBlocks);
        },
      },
    ]);
  };

  const handleMoveBlock = (blockId: string, direction: 'up' | 'down') => {
    const index = blocks.findIndex((b) => b.id === blockId);
    if (direction === 'up' && index > 0) {
      const newBlocks = [...blocks];
      [newBlocks[index], newBlocks[index - 1]] = [newBlocks[index - 1], newBlocks[index]];
      const reordered = newBlocks.map((b, i) => ({ ...b, sort_order: i + 1 }));
      handleBlocksChange(reordered);
    } else if (direction === 'down' && index < blocks.length - 1) {
      const newBlocks = [...blocks];
      [newBlocks[index], newBlocks[index + 1]] = [newBlocks[index + 1], newBlocks[index]];
      const reordered = newBlocks.map((b, i) => ({ ...b, sort_order: i + 1 }));
      handleBlocksChange(reordered);
    }
  };

  const handleEditBlock = (block: PageBlock) => {
    setEditingBlockId(block.id);
    setEditingBlockContent(JSON.parse(JSON.stringify(block.content_json)));
  };

  const handleSaveBlockEdit = () => {
    if (!editingBlockId || !editingBlockContent) return;

    const updatedBlocks = blocks.map((b) =>
      b.id === editingBlockId ? { ...b, content_json: editingBlockContent } : b
    );
    handleBlocksChange(updatedBlocks);
    setEditingBlockId(null);
    setEditingBlockContent(null);
  };

  const handleAddBlock = (blockType: BlockType) => {
    const newBlock: PageBlock = {
      id: `new-${Date.now()}`,
      page_id: pageId!,
      block_type: blockType,
      sort_order: blocks.length + 1,
      content_json: {},
      style_json: {},
      animation_json: {},
      is_hidden: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    handleBlocksChange([...blocks, newBlock]);
    setBlockPickerVisible(false);
  };

  const handleCheckSlug = async (slug: string) => {
    if (!slug) return;

    try {
      setCheckingSlug(true);
      const result = await checkSlug(slug, pageId!);
      setSlugAvailable(result.available);
    } catch (err) {
      setSlugAvailable(false);
    } finally {
      setCheckingSlug(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!page) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.errorText}>{error || 'Page not found'}</Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.headerBackIcon}>← Back</Text>
        </TouchableOpacity>

        <TextInput
          style={styles.headerTitle}
          value={settingsTitle}
          onChangeText={setSettingsTitle}
          placeholder="Page Title"
          placeholderTextColor={colors.textMuted}
        />

        <TouchableOpacity
          style={[styles.headerButton, saving && styles.headerButtonDisabled]}
          onPress={handleSaveSettings}
          disabled={saving}
        >
          <Text style={styles.headerButtonText}>
            {saving ? 'Saving...' : 'Save'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.headerButton, styles.publishButton]}
          onPress={handlePublishPage}
          disabled={saving}
        >
          <Text style={styles.headerButtonText}>Publish</Text>
        </TouchableOpacity>
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'blocks' && styles.tabActive]}
          onPress={() => setActiveTab('blocks')}
        >
          <Text style={[styles.tabText, activeTab === 'blocks' && styles.tabTextActive]}>
            Blocks
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'settings' && styles.tabActive]}
          onPress={() => setActiveTab('settings')}
        >
          <Text style={[styles.tabText, activeTab === 'settings' && styles.tabTextActive]}>
            Settings
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {activeTab === 'blocks' ? (
        <ScrollView style={styles.content} contentContainerStyle={styles.contentPadding}>
          {blocks.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>No blocks yet. Add one to get started.</Text>
            </View>
          ) : (
            blocks.map((block, index) => (
              <View key={block.id} style={styles.blockContainer}>
                <View style={styles.blockToolbar}>
                  <Text style={styles.blockLabel}>
                    {BLOCK_TYPE_INFO[block.block_type]?.emoji || '📦'} {BLOCK_TYPE_INFO[block.block_type]?.label || block.block_type}
                  </Text>
                  <View style={styles.blockActions}>
                    <TouchableOpacity
                      style={styles.toolbarIcon}
                      onPress={() => handleMoveBlock(block.id, 'up')}
                      disabled={index === 0}
                    >
                      <Text style={[styles.toolbarIconText, index === 0 && styles.toolbarIconDisabled]}>
                        ↑
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.toolbarIcon}
                      onPress={() => handleMoveBlock(block.id, 'down')}
                      disabled={index === blocks.length - 1}
                    >
                      <Text style={[styles.toolbarIconText, index === blocks.length - 1 && styles.toolbarIconDisabled]}>
                        ↓
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.toolbarIcon}
                      onPress={() => handleDeleteBlock(block.id)}
                    >
                      <Text style={styles.toolbarIconText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.blockContent}
                  onPress={() => handleEditBlock(block)}
                >
                  <BlockRenderer
                    block={block}
                    pageId={pageId!}
                    isEditing={true}
                    theme={page.global_settings.theme}
                    accentColor={page.global_settings.accentColor}
                    onEdit={() => handleEditBlock(block)}
                  />
                </TouchableOpacity>
              </View>
            ))
          )}

          <TouchableOpacity
            style={styles.addBlockButton}
            onPress={() => setBlockPickerVisible(true)}
          >
            <Text style={styles.addBlockButtonText}>+ Add Block</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : (
        <ScrollView style={styles.content} contentContainerStyle={styles.contentPadding}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            {/* Title */}
            <View style={styles.settingSection}>
              <Text style={styles.settingLabel}>Title</Text>
              <TextInput
                style={styles.settingInput}
                value={settingsTitle}
                onChangeText={setSettingsTitle}
                placeholder="Page Title"
                placeholderTextColor={colors.textMuted}
              />
            </View>

            {/* Slug */}
            <View style={styles.settingSection}>
              <Text style={styles.settingLabel}>Slug</Text>
              <View style={styles.slugContainer}>
                <TextInput
                  style={[styles.settingInput, styles.slugInput]}
                  value={settingsSlug}
                  onChangeText={(text) => {
                    setSettingsSlug(text);
                    handleCheckSlug(text);
                  }}
                  placeholder="page-slug"
                  placeholderTextColor={colors.textMuted}
                />
                {checkingSlug ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : slugAvailable !== null ? (
                  <Text style={[styles.slugStatus, slugAvailable ? styles.slugAvailable : styles.slugUnavailable]}>
                    {slugAvailable ? '✓ Available' : '✕ Taken'}
                  </Text>
                ) : null}
              </View>
            </View>

            {/* Description */}
            <View style={styles.settingSection}>
              <Text style={styles.settingLabel}>Description</Text>
              <TextInput
                style={[styles.settingInput, styles.descriptionInput]}
                value={settingsDescription}
                onChangeText={setSettingsDescription}
                placeholder="Page description"
                placeholderTextColor={colors.textMuted}
                multiline
              />
            </View>

            {/* Theme */}
            <View style={styles.settingSection}>
              <Text style={styles.settingLabel}>Theme</Text>
              <View style={styles.themeButtons}>
                <TouchableOpacity
                  style={[styles.themeButton, settingsTheme === 'dark' && styles.themeButtonActive]}
                  onPress={() => setSettingsTheme('dark')}
                >
                  <Text style={[styles.themeButtonText, settingsTheme === 'dark' && styles.themeButtonTextActive]}>
                    Dark
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.themeButton, settingsTheme === 'light' && styles.themeButtonActive]}
                  onPress={() => setSettingsTheme('light')}
                >
                  <Text style={[styles.themeButtonText, settingsTheme === 'light' && styles.themeButtonTextActive]}>
                    Light
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Accent Color */}
            <View style={styles.settingSection}>
              <Text style={styles.settingLabel}>Accent Color</Text>
              <View style={styles.colorSwatches}>
                {ACCENT_COLORS.map((color) => (
                  <TouchableOpacity
                    key={color}
                    style={[
                      styles.colorSwatch,
                      { backgroundColor: color },
                      settingsAccentColor === color && styles.colorSwatchActive,
                    ]}
                    onPress={() => setSettingsAccentColor(color)}
                  >
                    {settingsAccentColor === color && (
                      <Text style={styles.colorSwatchCheck}>✓</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.customColorContainer}>
                <Text style={styles.customColorLabel}>Custom Hex</Text>
                <TextInput
                  style={styles.customColorInput}
                  value={customAccentColor}
                  onChangeText={setCustomAccentColor}
                  placeholder="#RRGGBB"
                  placeholderTextColor={colors.textMuted}
                />
                <TouchableOpacity
                  style={styles.customColorButton}
                  onPress={() => {
                    if (/^#[0-9A-Fa-f]{6}$/.test(customAccentColor)) {
                      setSettingsAccentColor(customAccentColor);
                      setCustomAccentColor('');
                    } else {
                      Alert.alert('Invalid Color', 'Please enter a valid hex color code');
                    }
                  }}
                >
                  <Text style={styles.customColorButtonText}>Apply</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Save Button */}
            <TouchableOpacity
              style={[styles.saveSettingsButton, saving && styles.saveSettingsButtonDisabled]}
              onPress={handleSaveSettings}
              disabled={saving}
            >
              <Text style={styles.saveSettingsButtonText}>
                {saving ? 'Saving Settings...' : 'Save Settings'}
              </Text>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </ScrollView>
      )}

      {/* Block Type Picker Modal */}
      <Modal
        visible={blockPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setBlockPickerVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Block</Text>
              <TouchableOpacity onPress={() => setBlockPickerVisible(false)}>
                <Text style={styles.modalCloseButton}>✕</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={Object.entries(BLOCK_TYPE_INFO)}
              keyExtractor={([key]) => key}
              renderItem={({ item: [key, info] }) => (
                <TouchableOpacity
                  style={styles.blockTypeItem}
                  onPress={() => handleAddBlock(key as BlockType)}
                >
                  <Text style={styles.blockTypeEmoji}>{info.emoji}</Text>
                  <View style={styles.blockTypeText}>
                    <Text style={styles.blockTypeLabel}>{info.label}</Text>
                    <Text style={styles.blockTypeDescription}>{info.description}</Text>
                  </View>
                </TouchableOpacity>
              )}
              scrollEnabled
              style={styles.blockTypeList}
            />
          </View>
        </View>
      </Modal>

      {/* Block Editor Modal */}
      <Modal
        visible={editingBlockId !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setEditingBlockId(null)}
      >
        <View style={styles.editorModalOverlay}>
          <View style={styles.editorModal}>
            <View style={styles.editorModalHeader}>
              <Text style={styles.editorModalTitle}>Edit Block Content</Text>
              <TouchableOpacity onPress={() => setEditingBlockId(null)}>
                <Text style={styles.editorModalCloseButton}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.editorContent}>
              {editingBlockContent &&
                Object.entries(editingBlockContent).map(([key, value]) => (
                  <View key={key} style={styles.editorField}>
                    <Text style={styles.editorFieldLabel}>{key}</Text>
                    <TextInput
                      style={styles.editorFieldInput}
                      value={typeof value === 'string' ? value : JSON.stringify(value)}
                      onChangeText={(text) => {
                        setEditingBlockContent((prev) =>
                          prev ? { ...prev, [key]: text } : null
                        );
                      }}
                      multiline
                      placeholder={`Enter ${key}`}
                      placeholderTextColor={colors.textMuted}
                    />
                  </View>
                ))}
            </ScrollView>

            <View style={styles.editorActions}>
              <TouchableOpacity
                style={styles.editorCancelButton}
                onPress={() => setEditingBlockId(null)}
              >
                <Text style={styles.editorCancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.editorSaveButton} onPress={handleSaveBlockEdit}>
                <Text style={styles.editorSaveButtonText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surfaceElevated,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
    gap: spacing.sm,
  },
  headerBackIcon: {
    color: colors.primary,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  headerTitle: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    paddingHorizontal: spacing.sm,
  },
  headerButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
  },
  headerButtonDisabled: {
    opacity: 0.5,
  },
  headerButtonText: {
    color: colors.textPrimary,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  publishButton: {
    backgroundColor: colors.success,
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
    backgroundColor: colors.surface,
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
    color: colors.textMuted,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  tabTextActive: {
    color: colors.primary,
  },
  content: {
    flex: 1,
  },
  contentPadding: {
    padding: spacing.lg,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
  },
  emptyStateText: {
    color: colors.textMuted,
    fontSize: fontSize.md,
  },
  blockContainer: {
    marginBottom: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  blockToolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceLight,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  blockLabel: {
    color: colors.textPrimary,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  blockActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  toolbarIcon: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: borderRadius.sm,
    backgroundColor: colors.primaryMuted,
  },
  toolbarIconText: {
    color: colors.primary,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
  toolbarIconDisabled: {
    opacity: 0.3,
  },
  blockContent: {
    paddingVertical: spacing.md,
  },
  addBlockButton: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    borderRadius: borderRadius.lg,
    marginTop: spacing.lg,
  },
  addBlockButtonText: {
    color: colors.primary,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  settingSection: {
    marginBottom: spacing.lg,
  },
  settingLabel: {
    color: colors.textPrimary,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.sm,
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
  slugContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  slugInput: {
    flex: 1,
  },
  slugStatus: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  slugAvailable: {
    color: colors.success,
  },
  slugUnavailable: {
    color: colors.error,
  },
  descriptionInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  themeButtons: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  themeButton: {
    flex: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  themeButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  themeButtonText: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  themeButtonTextActive: {
    color: colors.textPrimary,
  },
  colorSwatches: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  colorSwatch: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    borderWidth: 2,
    borderColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorSwatchActive: {
    borderColor: colors.textPrimary,
  },
  colorSwatchCheck: {
    color: colors.textPrimary,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
  customColorContainer: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  customColorLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  customColorInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.textPrimary,
    fontSize: fontSize.sm,
  },
  customColorButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
  },
  customColorButtonText: {
    color: colors.textPrimary,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  saveSettingsButton: {
    paddingVertical: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.xxl,
  },
  saveSettingsButtonDisabled: {
    opacity: 0.5,
  },
  saveSettingsButtonText: {
    color: colors.textPrimary,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  errorText: {
    color: colors.error,
    fontSize: fontSize.md,
    marginBottom: spacing.lg,
  },
  backButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
  },
  backButtonText: {
    color: colors.textPrimary,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    maxHeight: '70%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
    paddingTop: spacing.md,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  modalTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
  modalCloseButton: {
    color: colors.textMuted,
    fontSize: fontSize.lg,
  },
  blockTypeList: {
    paddingHorizontal: spacing.lg,
  },
  blockTypeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
    gap: spacing.md,
  },
  blockTypeEmoji: {
    fontSize: fontSize.xxxl,
  },
  blockTypeText: {
    flex: 1,
  },
  blockTypeLabel: {
    color: colors.textPrimary,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.xs,
  },
  blockTypeDescription: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
  editorModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  editorModal: {
    height: '80%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
    paddingTop: spacing.md,
  },
  editorModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  editorModalTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
  editorModalCloseButton: {
    color: colors.textMuted,
    fontSize: fontSize.lg,
  },
  editorContent: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  editorField: {
    marginBottom: spacing.lg,
  },
  editorFieldLabel: {
    color: colors.textPrimary,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.sm,
  },
  editorFieldInput: {
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.textPrimary,
    fontSize: fontSize.sm,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  editorActions: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
  },
  editorCancelButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  editorCancelButtonText: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  editorSaveButton: {
    flex: 1,
    paddingVertical: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  editorSaveButtonText: {
    color: colors.textPrimary,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
});
