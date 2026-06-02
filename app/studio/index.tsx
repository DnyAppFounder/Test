import React, { useState, useEffect } from 'react';
import {
  View,
  ScrollView,
  Text,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TouchableOpacity,
  FlatList,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useWallet } from '@/contexts/WalletContext';
import { useProfile } from '@/contexts/ProfileContext';
import {
  getMyPages,
  deletePage,
  duplicatePage,
  publishPage,
  Page,
  PageStatus,
} from '@/services/pageStudioService';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '@/constants/theme';
import {
  Plus,
  Edit3,
  BarChart3,
  Trash2,
  Copy,
  Eye,
  EyeOff,
} from 'lucide-react-native';

type FilterType = 'all' | 'published' | 'draft' | 'archived';

export default function StudioDashboard() {
  const router = useRouter();
  const { activeAddress } = useWallet();
  const { profile } = useProfile();
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');

  useEffect(() => {
    loadPages();
  }, [activeAddress]);

  const loadPages = async () => {
    if (!activeAddress) return;
    try {
      setLoading(true);
      const data = await getMyPages(activeAddress);
      setPages(data || []);
    } catch (error) {
      console.error('Error loading pages:', error);
      Alert.alert('Error', 'Failed to load pages');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadPages();
    setRefreshing(false);
  };

  const handleDelete = (page: Page) => {
    Alert.alert(
      'Delete Page',
      `Are you sure you want to delete "${page.title}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deletePage(activeAddress!, page.id);
              setPages(pages.filter(p => p.id !== page.id));
              Alert.alert('Success', 'Page deleted');
            } catch (error) {
              console.error('Error deleting page:', error);
              Alert.alert('Error', 'Failed to delete page');
            }
          },
        },
      ]
    );
  };

  const handleDuplicate = async (page: Page) => {
    try {
      const result = await duplicatePage(activeAddress!, page.id);
      setPages([...pages, result.page]);
      Alert.alert('Success', 'Page duplicated');
    } catch (error) {
      console.error('Error duplicating page:', error);
      Alert.alert('Error', 'Failed to duplicate page');
    }
  };

  const handleTogglePublish = async (page: Page) => {
    try {
      const newStatus: PageStatus =
        page.status === 'published' ? 'unlisted' : 'published';
      const updated = await publishPage(activeAddress!, page.id, newStatus);
      setPages(pages.map(p => (p.id === page.id ? updated : p)));
    } catch (error) {
      console.error('Error updating page status:', error);
      Alert.alert('Error', 'Failed to update page status');
    }
  };

  const getStatusColor = (status: PageStatus) => {
    switch (status) {
      case 'published':
        return '#22c55e';
      case 'draft':
        return '#3b82f6';
      case 'unlisted':
        return '#f59e0b';
      case 'archived':
        return '#6b7280';
      default:
        return '#6b7280';
    }
  };

  const getPageEmoji = (type: string) => {
    const emojis: Record<string, string> = {
      token: '💎',
      project: '🏢',
      personal: '👤',
      'link-in-bio': '🔗',
      whitelist: '📋',
      claim: '🎁',
      countdown: '⏱️',
      general: '📄',
    };
    return emojis[type] || '📄';
  };

  const filteredPages = pages.filter(page => {
    if (filter === 'all') return true;
    return page.status === filter;
  });

  const renderPageCard = (page: Page) => (
    <View key={page.id} style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.titleRow}>
          <Text style={styles.pageEmoji}>{getPageEmoji(page.type)}</Text>
          <Text style={styles.pageTitle}>{page.title}</Text>
        </View>
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: getStatusColor(page.status) },
          ]}
        >
          <Text style={styles.statusText}>{page.status}</Text>
        </View>
      </View>

      <Text style={styles.slug}>dawen.app/page/{page.slug}</Text>

      <View style={styles.stats}>
        <View style={styles.statItem}>
          <Eye size={14} color={colors.textSecondary} />
          <Text style={styles.statText}>{page.view_count} views</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() =>
            router.push(`/studio/${page.id}/edit`)
          }
        >
          <Edit3 size={16} color={colors.primary} />
          <Text style={styles.actionBtnText}>Edit</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn}>
          <BarChart3 size={16} color={colors.primary} />
          <Text style={styles.actionBtnText}>Analytics</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => handleTogglePublish(page)}
        >
          {page.status === 'published' ? (
            <>
              <EyeOff size={16} color={colors.warning} />
              <Text style={styles.actionBtnText}>Unpublish</Text>
            </>
          ) : (
            <>
              <Eye size={16} color={colors.success} />
              <Text style={styles.actionBtnText}>Publish</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => handleDuplicate(page)}
        >
          <Copy size={16} color={colors.primary} />
          <Text style={styles.actionBtnText}>Duplicate</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => handleDelete(page)}
        >
          <Trash2 size={16} color={colors.error} />
          <Text style={[styles.actionBtnText, { color: colors.error }]}>
            Delete
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Page Studio</Text>
        <TouchableOpacity
          style={styles.newPageBtn}
          onPress={() => router.push('/studio/new')}
        >
          <Plus size={20} color={colors.white} />
          <Text style={styles.newPageBtnText}>New Page</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
      >
        {(['all', 'published', 'draft', 'archived'] as FilterType[]).map(
          filterOption => (
            <TouchableOpacity
              key={filterOption}
              style={[
                styles.filterTab,
                filter === filterOption && styles.filterTabActive,
              ]}
              onPress={() => setFilter(filterOption)}
            >
              <Text
                style={[
                  styles.filterTabText,
                  filter === filterOption && styles.filterTabTextActive,
                ]}
              >
                {filterOption.charAt(0).toUpperCase() + filterOption.slice(1)}
              </Text>
            </TouchableOpacity>
          )
        )}
      </ScrollView>

      <FlatList
        data={filteredPages}
        renderItem={({ item }) => renderPageCard(item)}
        keyExtractor={item => item.id}
        scrollEnabled={false}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No pages yet</Text>
            <Text style={styles.emptyStateSubText}>
              Create your first page to get started
            </Text>
            <TouchableOpacity
              style={styles.emptyStateCta}
              onPress={() => router.push('/studio/new')}
            >
              <Text style={styles.emptyStateCtaText}>Create Page</Text>
            </TouchableOpacity>
          </View>
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      />
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  headerTitle: {
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  newPageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    gap: spacing.xs,
  },
  newPageBtnText: {
    color: colors.white,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  filterScroll: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  filterTab: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginRight: spacing.md,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  filterTabActive: {
    borderBottomColor: colors.primary,
  },
  filterTabText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
  },
  filterTabTextActive: {
    color: colors.primary,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  pageEmoji: {
    fontSize: 20,
  },
  pageTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  statusText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.white,
    textTransform: 'capitalize',
  },
  slug: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  stats: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  statText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceElevated,
    borderRadius: borderRadius.md,
    gap: spacing.xs,
  },
  actionBtnText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.primary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxxl,
    gap: spacing.md,
  },
  emptyStateText: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  emptyStateSubText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  emptyStateCta: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
  },
  emptyStateCtaText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.white,
  },
});
