import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ExternalLink, Star, Sparkles } from 'lucide-react-native';
import { DApp } from '@/types/crypto';
import { BlockchainService } from '@/services/blockchainService';
import { useLanguage } from '@/contexts/LanguageContext';
import { colors, spacing, borderRadius, fontSize } from '@/constants/theme';

const CATEGORIES = ['All', 'DeFi', 'NFT', 'Gaming', 'Social'];

export default function DAppsScreen() {
  const { t } = useLanguage();
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [featuredDApps, setFeaturedDApps] = useState<DApp[]>([]);
  const [allDApps, setAllDApps] = useState<DApp[]>([]);

  useEffect(() => {
    loadDApps();
  }, []);

  const loadDApps = async () => {
    try {
      const [featured, all] = await Promise.all([
        BlockchainService.getFeaturedDApps(),
        BlockchainService.getDApps(),
      ]);
      setFeaturedDApps(featured);
      setAllDApps(all);
    } catch {}
  };

  const openDApp = async (dapp: DApp) => {
    try {
      await Linking.openURL(dapp.url);
    } catch {}
  };

  const filteredDApps =
    selectedCategory === 'All'
      ? allDApps
      : allDApps.filter((d) => d.category === selectedCategory);

  return (
    <View style={styles.container}>
      <LinearGradient colors={colors.gradient.header} style={styles.header}>
        <Text style={styles.headerTitle}>{t.tabs.dapps}</Text>
        <Text style={styles.headerSubtitle}>Explore decentralized applications</Text>
      </LinearGradient>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[0]}
      >
        <View style={styles.categoriesWrapper}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categories}>
            {CATEGORIES.map((category) => (
              <TouchableOpacity
                key={category}
                style={[styles.categoryButton, selectedCategory === category && styles.categoryButtonActive]}
                onPress={() => setSelectedCategory(category)}
              >
                <Text style={[styles.categoryText, selectedCategory === category && styles.categoryTextActive]}>
                  {category}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {selectedCategory === 'All' && featuredDApps.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Sparkles size={20} color={colors.primary} />
              <Text style={styles.sectionTitle}>Featured</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.featuredList}>
              {featuredDApps.map((dapp) => (
                <TouchableOpacity key={dapp.id} style={styles.featuredCard} onPress={() => openDApp(dapp)}>
                  <View style={styles.featuredIcon}>
                    <ExternalLink size={32} color={colors.primary} />
                  </View>
                  <Text style={styles.featuredName} numberOfLines={1}>{dapp.name}</Text>
                  <Text style={styles.featuredCategory}>{dapp.category}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {selectedCategory === 'All' ? 'All dApps' : selectedCategory}
          </Text>
          <View style={styles.dappList}>
            {filteredDApps.map((dapp) => (
              <TouchableOpacity key={dapp.id} style={styles.dappCard} onPress={() => openDApp(dapp)}>
                <View style={styles.dappIcon}>
                  <ExternalLink size={24} color={colors.primary} />
                </View>
                <View style={styles.dappInfo}>
                  <View style={styles.dappHeader}>
                    <Text style={styles.dappName}>{dapp.name}</Text>
                    {dapp.is_featured && <Star size={14} color={colors.warning} fill={colors.warning} />}
                  </View>
                  {dapp.description && (
                    <Text style={styles.dappDescription} numberOfLines={2}>{dapp.description}</Text>
                  )}
                  <View style={styles.categoryBadge}>
                    <Text style={styles.categoryBadgeText}>{dapp.category}</Text>
                  </View>
                </View>
                <ExternalLink size={20} color={colors.textMuted} />
              </TouchableOpacity>
            ))}
            {filteredDApps.length === 0 && (
              <Text style={styles.emptyText}>{t.common.noResults}</Text>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
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
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: spacing.xxxl,
  },
  categoriesWrapper: {
    backgroundColor: colors.background,
    paddingVertical: spacing.lg,
  },
  categories: {
    paddingHorizontal: spacing.xxl,
    gap: spacing.sm,
  },
  categoryButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  categoryButtonActive: {
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primary,
  },
  categoryText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textMuted,
  },
  categoryTextActive: {
    color: colors.primary,
  },
  section: {
    paddingHorizontal: spacing.xxl,
    marginBottom: spacing.xxxl,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  featuredList: {
    gap: spacing.md,
  },
  featuredCard: {
    width: 140,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  featuredIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primaryMuted,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  featuredName: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
    textAlign: 'center',
  },
  featuredCategory: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  dappList: {
    gap: spacing.md,
  },
  dappCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  dappIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primaryMuted,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  dappInfo: {
    flex: 1,
  },
  dappHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  dappName: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  dappDescription: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    lineHeight: 18,
  },
  categoryBadge: {
    backgroundColor: colors.primaryMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  categoryBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.primary,
  },
  emptyText: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: fontSize.md,
    paddingVertical: 48,
  },
});
