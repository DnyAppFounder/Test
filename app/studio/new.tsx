import React, { useState } from 'react';
import {
  View,
  ScrollView,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useWallet } from '@/contexts/WalletContext';
import { createPage, saveBlocks, generateSlug } from '@/services/pageStudioService';
import { PAGE_TEMPLATES } from '@/components/studio/templates';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '@/constants/theme';
import { ArrowLeft, Check } from 'lucide-react-native';

export default function NewPageScreen() {
  const router = useRouter();
  const { activeAddress } = useWallet();
  const [pageTitle, setPageTitle] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreatePage = async () => {
    if (!pageTitle.trim()) {
      setError('Please enter a page title');
      return;
    }
    if (!selectedTemplate) {
      setError('Please select a template');
      return;
    }
    if (!activeAddress) {
      setError('Wallet not connected');
      return;
    }

    setError('');
    try {
      setLoading(true);
      const template = PAGE_TEMPLATES.find(t => t.id === selectedTemplate);
      if (!template) throw new Error('Template not found');

      const slug = generateSlug(pageTitle);
      const newPage = await createPage(activeAddress, {
        title: pageTitle,
        slug,
        type: template.type,
        theme: template.theme,
        global_settings: template.global_settings,
      });

      // Save template blocks if any
      if (template.blocks.length > 0) {
        await saveBlocks(
          activeAddress,
          newPage.id,
          template.blocks.map((b, i) => ({
            block_type: b.block_type,
            sort_order: b.sort_order ?? i + 1,
            content_json: b.content_json,
            style_json: b.style_json,
            animation_json: b.animation_json,
          }))
        );
      }

      router.replace(`/studio/${newPage.id}/edit`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create page');
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.backBtn}
        >
          <ArrowLeft size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create New Page</Text>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Page Title</Text>
          <TextInput
            style={styles.titleInput}
            placeholder="e.g. My Token Launch"
            placeholderTextColor={colors.textMuted}
            value={pageTitle}
            onChangeText={t => { setPageTitle(t); setError(''); }}
            editable={!loading}
            returnKeyType="done"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Choose Template</Text>
          <Text style={styles.sectionDescription}>
            Select a starting point. You can fully customize it in the editor.
          </Text>
          <View style={styles.templateGrid}>
            {PAGE_TEMPLATES.map(template => {
              const isSelected = selectedTemplate === template.id;
              return (
                <TouchableOpacity
                  key={template.id}
                  style={[styles.templateCard, isSelected && styles.templateCardSelected]}
                  onPress={() => { setSelectedTemplate(template.id); setError(''); }}
                  activeOpacity={0.75}
                >
                  {isSelected && (
                    <View style={styles.checkmark}>
                      <Check size={12} color={colors.white} strokeWidth={3} />
                    </View>
                  )}
                  <Text style={styles.templateEmoji}>{template.emoji}</Text>
                  <Text style={styles.templateName}>{template.name}</Text>
                  <Text style={styles.templateDescription} numberOfLines={2}>
                    {template.description}
                  </Text>
                  <View style={[
                    styles.themeTag,
                    { backgroundColor: template.theme === 'dark' ? 'rgba(139,92,246,0.15)' : 'rgba(0,0,0,0.06)' }
                  ]}>
                    <Text style={[
                      styles.themeTagText,
                      { color: template.theme === 'dark' ? colors.primaryLight : '#555' }
                    ]}>
                      {template.blocks.length === 0 ? 'Blank' : `${template.blocks.length} blocks • ${template.theme}`}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <TouchableOpacity
          style={[styles.createButton, (!selectedTemplate || !pageTitle.trim() || loading) && styles.createButtonDisabled]}
          onPress={handleCreatePage}
          disabled={loading || !selectedTemplate || !pageTitle.trim()}
        >
          {loading ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Text style={styles.createButtonText}>Create Page</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  backBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: 140,
    gap: spacing.xxl,
  },
  section: {
    gap: spacing.md,
  },
  sectionLabel: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  sectionDescription: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: -4,
  },
  titleInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontSize: fontSize.md,
    color: colors.textPrimary,
  },
  templateGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  templateCard: {
    width: '47%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    alignItems: 'center',
    position: 'relative',
  },
  templateCardSelected: {
    borderColor: colors.primary,
    borderWidth: 2,
    backgroundColor: colors.primaryMuted,
  },
  checkmark: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  templateEmoji: {
    fontSize: 30,
    marginTop: 4,
  },
  templateName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  templateDescription: {
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 15,
  },
  themeTag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.sm,
    marginTop: 2,
  },
  themeTagText: {
    fontSize: 10,
    fontWeight: fontWeight.medium,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
    gap: spacing.sm,
  },
  errorText: {
    fontSize: fontSize.sm,
    color: colors.error,
    textAlign: 'center',
  },
  createButton: {
    paddingVertical: 15,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createButtonDisabled: {
    opacity: 0.45,
  },
  createButtonText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.white,
  },
});
