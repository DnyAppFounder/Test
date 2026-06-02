import React, { useState } from 'react';
import {
  View,
  ScrollView,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useWallet } from '@/contexts/WalletContext';
import { createPage, generateSlug } from '@/services/pageStudioService';
import { PAGE_TEMPLATES } from '@/components/studio/templates';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '@/constants/theme';
import { ArrowLeft } from 'lucide-react-native';

export default function NewPageScreen() {
  const router = useRouter();
  const { activeAddress } = useWallet();
  const [pageTitle, setPageTitle] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCreatePage = async () => {
    if (!pageTitle.trim()) {
      Alert.alert('Error', 'Please enter a page title');
      return;
    }

    if (!selectedTemplate) {
      Alert.alert('Error', 'Please select a template');
      return;
    }

    if (!activeAddress) {
      Alert.alert('Error', 'Wallet not connected');
      return;
    }

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

      router.push(`/studio/${newPage.id}/edit`);
    } catch (error) {
      console.error('Error creating page:', error);
      Alert.alert(
        'Error',
        error instanceof Error ? error.message : 'Failed to create page'
      );
      setLoading(false);
    }
  };

  const renderTemplateCard = (templateId: string) => {
    const template = PAGE_TEMPLATES.find(t => t.id === templateId);
    if (!template) return null;

    const isSelected = selectedTemplate === templateId;

    return (
      <TouchableOpacity
        key={templateId}
        style={[
          styles.templateCard,
          isSelected && styles.templateCardSelected,
        ]}
        onPress={() => setSelectedTemplate(templateId)}
      >
        <View style={styles.templateEmoji}>{template.emoji}</View>
        <Text style={styles.templateName}>{template.name}</Text>
        <Text style={styles.templateDescription} numberOfLines={2}>
          {template.description}
        </Text>
        <View
          style={[
            styles.themeTag,
            {
              backgroundColor:
                template.theme === 'dark'
                  ? colors.surfaceElevated
                  : 'rgba(255, 255, 255, 0.1)',
            },
          ]}
        >
          <Text style={styles.themeTagText}>
            {template.theme.charAt(0).toUpperCase() + template.theme.slice(1)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ArrowLeft size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create New Page</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Page Title</Text>
          <TextInput
            style={styles.titleInput}
            placeholder="Enter page title"
            placeholderTextColor={colors.textMuted}
            value={pageTitle}
            onChangeText={setPageTitle}
            editable={!loading}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Choose Template</Text>
          <Text style={styles.sectionDescription}>
            Select a template to get started. You can customize it later.
          </Text>

          <View style={styles.templateGrid}>
            {PAGE_TEMPLATES.map(template => renderTemplateCard(template.id))}
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.createButton,
            !selectedTemplate && styles.createButtonDisabled,
          ]}
          onPress={handleCreatePage}
          disabled={loading || !selectedTemplate}
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
    backgroundColor: '#0D0618',
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
  headerTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    gap: spacing.lg,
    paddingBottom: 200,
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
  },
  titleInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSize.md,
    color: colors.textPrimary,
  },
  templateGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  templateCard: {
    width: '48%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  templateCardSelected: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  templateEmoji: {
    fontSize: 32,
  },
  templateName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  templateDescription: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  themeTag: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  themeTagText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    backgroundColor: '#0D0618',
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
  },
  createButton: {
    paddingVertical: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createButtonDisabled: {
    opacity: 0.5,
  },
  createButtonText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.white,
  },
});
