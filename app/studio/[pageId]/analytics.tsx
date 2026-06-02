import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useWallet } from '@/contexts/WalletContext';
import { colors, spacing, fontSize, fontWeight, borderRadius } from '@/constants/theme';
import { getAnalytics } from '@/services/pageStudioService';
import type { AnalyticsData } from '@/services/pageStudioService';

export default function AnalyticsScreen() {
  const { pageId } = useLocalSearchParams<{ pageId: string }>();
  const router = useRouter();
  const { activeAddress } = useWallet();

  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    if (!activeAddress || !pageId) return;

    try {
      setLoading(true);
      setError(null);
      const data = await getAnalytics(activeAddress, pageId);
      setAnalytics(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.headerContainer}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backButton}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Analytics</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !analytics) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.headerContainer}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backButton}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Analytics</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.centerContent}>
          <Text style={styles.errorText}>{error || 'No analytics data'}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={loadAnalytics}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const totalEvents =
    (analytics.total_views || 0) +
    (analytics.form_submissions || 0) +
    (analytics.button_clicks || 0);

  const maxDayCount = Math.max(
    ...Object.values(analytics.recent_days || {}),
    1
  );

  const eventsByTypeArray = Object.entries(analytics.events_by_type || {}).map(
    ([type, count]) => ({
      type,
      count,
      percentage: totalEvents > 0 ? ((count / totalEvents) * 100).toFixed(1) : 0,
    })
  );

  const recentDaysArray = Object.entries(analytics.recent_days || {})
    .slice(-7)
    .map(([date, count]) => ({
      date,
      count,
      height: maxDayCount > 0 ? (count / maxDayCount) * 150 : 30,
    }));

  const hasData = totalEvents > 0;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerContainer}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Analytics</Text>
        <TouchableOpacity onPress={loadAnalytics}>
          <Text style={styles.refreshButton}>↻</Text>
        </TouchableOpacity>
      </View>

      {!hasData ? (
        <ScrollView style={styles.content} contentContainerStyle={styles.emptyStateContainer}>
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateEmoji}>📊</Text>
            <Text style={styles.emptyStateTitle}>No Analytics Data Yet</Text>
            <Text style={styles.emptyStateText}>
              Start sharing your page to see analytics data appear here. Track views, form submissions, and button clicks.
            </Text>
            <TouchableOpacity
              style={styles.emptyStateButton}
              onPress={() => router.back()}
            >
              <Text style={styles.emptyStateButtonText}>Go to Editor</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      ) : (
        <ScrollView style={styles.content} contentContainerStyle={styles.contentPadding}>
          {/* Stats Cards */}
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{analytics.total_views || 0}</Text>
              <Text style={styles.statLabel}>Total Views</Text>
            </View>

            <View style={styles.statCard}>
              <Text style={styles.statValue}>{analytics.form_submissions || 0}</Text>
              <Text style={styles.statLabel}>Form Submissions</Text>
            </View>

            <View style={styles.statCard}>
              <Text style={styles.statValue}>{analytics.button_clicks || 0}</Text>
              <Text style={styles.statLabel}>Button Clicks</Text>
            </View>

            <View style={styles.statCard}>
              <Text style={styles.statValue}>{totalEvents}</Text>
              <Text style={styles.statLabel}>Total Events</Text>
            </View>
          </View>

          {/* Last 7 Days Chart */}
          {recentDaysArray.length > 0 && (
            <View style={styles.chartSection}>
              <Text style={styles.sectionTitle}>Last 7 Days</Text>
              <View style={styles.chartContainer}>
                <View style={styles.barChart}>
                  {recentDaysArray.map((day, index) => (
                    <View key={index} style={styles.barWrapper}>
                      <View
                        style={[
                          styles.bar,
                          {
                            height: day.height,
                            backgroundColor: colors.primary,
                          },
                        ]}
                      />
                      <Text style={styles.barLabel}>
                        {new Date(day.date).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </Text>
                      <Text style={styles.barValue}>{day.count}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          )}

          {/* Events by Type */}
          {eventsByTypeArray.length > 0 && (
            <View style={styles.eventsSection}>
              <Text style={styles.sectionTitle}>Events by Type</Text>

              {eventsByTypeArray.map((item, index) => (
                <View key={index} style={styles.eventItem}>
                  <View style={styles.eventHeader}>
                    <Text style={styles.eventLabel}>{item.type}</Text>
                    <Text style={styles.eventCount}>{item.count}</Text>
                  </View>

                  <View style={styles.progressBarContainer}>
                    <View
                      style={[
                        styles.progressBar,
                        {
                          width: `${item.percentage}%`,
                          backgroundColor: colors.primary,
                        },
                      ]}
                    />
                  </View>

                  <Text style={styles.eventPercentage}>{item.percentage}%</Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surfaceElevated,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  backButton: {
    color: colors.primary,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
  refreshButton: {
    color: colors.primary,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  contentPadding: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
  },
  emptyStateEmoji: {
    fontSize: 64,
    marginBottom: spacing.lg,
  },
  emptyStateTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.md,
  },
  emptyStateText: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    textAlign: 'center',
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  emptyStateButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
  },
  emptyStateButtonText: {
    color: colors.textPrimary,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  statCard: {
    flex: 1,
    minWidth: 150,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    color: colors.primary,
    fontSize: fontSize.xxxl,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.sm,
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
  },
  chartSection: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.md,
  },
  chartContainer: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
    minHeight: 220,
  },
  barChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    height: 180,
    gap: spacing.sm,
  },
  barWrapper: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-end',
  },
  bar: {
    width: '100%',
    backgroundColor: colors.primary,
    borderTopLeftRadius: borderRadius.sm,
    borderTopRightRadius: borderRadius.sm,
    minHeight: 30,
    marginBottom: spacing.sm,
  },
  barLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginBottom: spacing.xs,
  },
  barValue: {
    color: colors.textPrimary,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  eventsSection: {
    marginBottom: spacing.lg,
  },
  eventItem: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  eventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  eventLabel: {
    color: colors.textPrimary,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    textTransform: 'capitalize',
  },
  eventCount: {
    color: colors.primary,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.full,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
  eventPercentage: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    textAlign: 'right',
  },
  errorText: {
    color: colors.error,
    fontSize: fontSize.md,
    marginBottom: spacing.lg,
  },
  retryButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
  },
  retryButtonText: {
    color: colors.textPrimary,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
});
