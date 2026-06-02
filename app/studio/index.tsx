import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  ScrollView,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWallet } from '@/contexts/WalletContext';
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
  Globe,
  Archive,
  FileText,
  LayoutTemplate,
} from 'lucide-react-native';

type FilterType = 'all' | 'published' | 'draft' | 'archived';

const FILTERS: { key: FilterType; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'published', label: 'Published' },
  { key: 'draft', label: 'Drafts' },
  { key: 'archived', label: 'Archived' },
];

const STATUS_COLORS: Record<string, string> = {
  published: '#22c55e',
  draft: '#3b82f6',
  unlisted: '#f59e0b',
  archived: '#6b7280',
};

const PAGE_TYPE_ICONS: Record<string, string> = {
  token: '💎',
  project: '🏢',
  personal: '👤',
  'link-in-bio': '🔗',
  whitelist: '📋',
  claim: '🎁',
  countdown: '⏰',
  general: '📄',
};

export default function StudioDashboard() {
  const router = useRouter();
  const { activeAddress } = useWallet();
  const insets = useSafeAreaInsets();
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadPages = useCallback(async () => {
    if (!activeAddress) return;
    try {
      const data = await getMyPages(activeAddress);
      setPages(data || []);
    } catch {
      // silently fail — user sees empty list
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeAddress]);

  useEffect(() => {
    setLoading(true);
    loadPages();
  }, [loadPages]);

  const onRefresh = () => {
    setRefreshing(true);
    loadPages();
  };

  const handleDelete = (page: Page) => {
    Alert.alert(
      'Delete Page',
      `Delete "${page.title}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(page.id + '_delete');
            try {
              await deletePage(activeAddress!, page.id);
              setPages(prev => prev.filter(p => p.id !== page.id));
            } catch {
              Alert.alert('Error', 'Failed to delete page');
            } finally {
              setActionLoading(null);
            }
          },
        },
      ]
    );
  };

  const handleDuplicate = async (page: Page) => {
    setActionLoading(page.id + '_dup');
    try {
      const result = await duplicatePage(activeAddress!, page.id);
      setPages(prev => [result.page, ...prev]);
    } catch {
      Alert.alert('Error', 'Failed to duplicate page');
    } finally {
      setActionLoading(null);
    }
  };

  const handleTogglePublish = async (page: Page) => {
    const newStatus: PageStatus = page.status === 'published' ? 'draft' : 'published';
    setActionLoading(page.id + '_pub');
    try {
      const updated = await publishPage(activeAddress!, page.id, newStatus);
      setPages(prev => prev.map(p => (p.id === page.id ? updated : p)));
    } catch {
      Alert.alert('Error', 'Failed to update page status');
    } finally {
      setActionLoading(null);
    }
  };

  const handleArchive = async (page: Page) => {
    const newStatus: PageStatus = page.status === 'archived' ? 'draft' : 'archived';
    setActionLoading(page.id + '_arch');
    try {
      const updated = await publishPage(activeAddress!, page.id, newStatus);
      setPages(prev => prev.map(p => (p.id === page.id ? updated : p)));
    } catch {
      Alert.alert('Error', 'Failed to archive page');
    } finally {
      setActionLoading(null);
    }
  };

  const filteredPages = pages.filter(p => {
    if (filter === 'all') return p.status !== 'archived';
    if (filter === 'draft') return p.status === 'draft' || p.status === 'unlisted';
    return p.status === filter;
  });

  const emptyMessages: Record<FilterType, { title: string; sub: string }> = {
    all: { title: 'No pages yet', sub: 'Create your first page to get started' },
    published: { title: 'No published pages yet', sub: 'Publish a draft to make it live' },
    draft: { title: 'No draft pages', sub: 'All clear — or create a new page' },
    archived: { title: 'No archived pages', sub: 'Archived pages will appear here' },
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Page Studio</Text>
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <LayoutTemplate size={22} color={colors.primary} />
          <Text style={styles.headerTitle}>Page Studio</Text>
        </View>
        <TouchableOpacity
          style={styles.newPageBtn}
          onPress={() => router.push('/studio/new')}
          activeOpacity={0.8}
        >
          <Plus size={18} color={colors.white} strokeWidth={2.5} />
          <Text style={styles.newPageBtnText}>New Page</Text>
        </TouchableOpacity>
      </View>

      {/* Filter tabs */}
      <View style={styles.filterRow}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterTab, filter === f.key && styles.filterTabActive]}
            onPress={() => setFilter(f.key)}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterTabText, filter === f.key && styles.filterTabTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Page list */}
      <ScrollView
        style={styles.list}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + 80 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {filteredPages.length === 0 ? (
          <View style={styles.emptyState}>
            <FileText size={40} color={colors.textMuted} strokeWidth={1.5} />
            <Text style={styles.emptyTitle}>{emptyMessages[filter].title}</Text>
            <Text style={styles.emptySub}>{emptyMessages[filter].sub}</Text>
            {filter === 'all' && (
              <TouchableOpacity
                style={styles.emptyCtaBtn}
                onPress={() => router.push('/studio/new')}
              >
                <Text style={styles.emptyCtaText}>Create Page</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          filteredPages.map(page => (
            <PageCard
              key={page.id}
              page={page}
              actionLoading={actionLoading}
              onEdit={() => router.push(`/studio/${page.id}/edit`)}
              onAnalytics={() => router.push(`/studio/${page.id}/analytics`)}
              onTogglePublish={() => handleTogglePublish(page)}
              onDuplicate={() => handleDuplicate(page)}
              onArchive={() => handleArchive(page)}
              onDelete={() => handleDelete(page)}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

interface PageCardProps {
  page: Page;
  actionLoading: string | null;
  onEdit: () => void;
  onAnalytics: () => void;
  onTogglePublish: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onDelete: () => void;
}

function PageCard({
  page,
  actionLoading,
  onEdit,
  onAnalytics,
  onTogglePublish,
  onDuplicate,
  onArchive,
  onDelete,
}: PageCardProps) {
  const statusColor = STATUS_COLORS[page.status] || '#6b7280';
  const emoji = PAGE_TYPE_ICONS[page.type] || '📄';

  const isLoading = (suffix: string) => actionLoading === page.id + suffix;

  return (
    <View style={styles.card}>
      {/* Card header */}
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardEmoji}>{emoji}</Text>
          <Text style={styles.cardTitle} numberOfLines={1}>{page.title}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusColor + '22', borderColor: statusColor + '55' }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>{page.status}</Text>
        </View>
      </View>

      {/* Slug */}
      <Text style={styles.cardSlug} numberOfLines={1}>dawen.app/page/{page.slug}</Text>

      {/* Stats row */}
      <View style={styles.cardStats}>
        <Eye size={13} color={colors.textMuted} />
        <Text style={styles.statText}>{page.view_count} views</Text>
        <Text style={styles.statDivider}>·</Text>
        <Text style={styles.statText}>
          {new Date(page.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </Text>
      </View>

      {/* Action buttons */}
      <View style={styles.cardActions}>
        <ActionBtn icon={<Edit3 size={14} color={colors.primary} />} label="Edit" onPress={onEdit} />
        <ActionBtn
          icon={<BarChart3 size={14} color={colors.primary} />}
          label="Analytics"
          onPress={onAnalytics}
        />
        <ActionBtn
          icon={
            isLoading('_pub') ? (
              <ActivityIndicator size="small" color={colors.success} />
            ) : page.status === 'published' ? (
              <EyeOff size={14} color={colors.warning} />
            ) : (
              <Globe size={14} color={colors.success} />
            )
          }
          label={page.status === 'published' ? 'Unpublish' : 'Publish'}
          onPress={onTogglePublish}
          disabled={isLoading('_pub')}
        />
        <ActionBtn
          icon={
            isLoading('_dup') ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Copy size={14} color={colors.primary} />
            )
          }
          label="Copy"
          onPress={onDuplicate}
          disabled={isLoading('_dup')}
        />
        <ActionBtn
          icon={
            isLoading('_arch') ? (
              <ActivityIndicator size="small" color={colors.textMuted} />
            ) : (
              <Archive size={14} color={colors.textMuted} />
            )
          }
          label={page.status === 'archived' ? 'Restore' : 'Archive'}
          onPress={onArchive}
          disabled={isLoading('_arch')}
        />
        <ActionBtn
          icon={
            isLoading('_delete') ? (
              <ActivityIndicator size="small" color={colors.error} />
            ) : (
              <Trash2 size={14} color={colors.error} />
            )
          }
          label="Delete"
          onPress={onDelete}
          disabled={isLoading('_delete')}
          danger
        />
      </View>
    </View>
  );
}

function ActionBtn({
  icon,
  label,
  onPress,
  disabled,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.actionBtn, danger && styles.actionBtnDanger, disabled && styles.actionBtnDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
    >
      {icon}
      <Text style={[styles.actionBtnText, danger && styles.actionBtnTextDanger]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerTitle: {
    fontSize: fontSize.xl,
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
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  filterTab: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginRight: spacing.xs,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  filterTabActive: {
    borderBottomColor: colors.primary,
  },
  filterTabText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textMuted,
  },
  filterTabTextActive: {
    color: colors.primary,
    fontWeight: fontWeight.semibold,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 64,
    gap: spacing.md,
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    marginTop: spacing.sm,
  },
  emptySub: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  emptyCtaBtn: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
  },
  emptyCtaText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.white,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: spacing.lg,
    gap: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  cardEmoji: {
    fontSize: 18,
  },
  cardTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    flex: 1,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: fontWeight.semibold,
    textTransform: 'capitalize',
  },
  cardSlug: {
    fontSize: 12,
    color: colors.textMuted,
  },
  cardStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  statText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  statDivider: {
    fontSize: 12,
    color: colors.textMuted,
  },
  cardActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: 2,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    backgroundColor: colors.surfaceElevated,
    borderRadius: borderRadius.sm,
    gap: 4,
  },
  actionBtnDanger: {
    backgroundColor: colors.errorMuted,
  },
  actionBtnDisabled: {
    opacity: 0.5,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
  },
  actionBtnTextDanger: {
    color: colors.error,
  },
});
