import { View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, TextInput, Switch, ActivityIndicator, ScrollView } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Bell, BellOff, Plus, Trash2, TrendingUp, TrendingDown, Search, X } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { colors, spacing, borderRadius, fontSize, elevation } from '@/constants/theme';
import { AlertsService, PriceAlert } from '@/services/alertsService';
import { liveMarketService, LiveToken } from '@/services/liveMarketService';
import { useWallet } from '@/contexts/WalletContext';
import { useProfile } from '@/contexts/ProfileContext';
import { VerificationService } from '@/services/verificationService';
import { PremiumUpsellModal } from '@/components/PremiumUpsellModal';

const FREE_ALERT_LIMIT = 3;
const PREMIUM_ALERT_LIMIT = 50;

export default function PriceAlertsScreen() {
  const router = useRouter();
  const { activeAddress } = useWallet();
  const { profile } = useProfile();
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [showPremiumUpsell, setShowPremiumUpsell] = useState(false);
  const [premiumUpsellNote, setPremiumUpsellNote] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Token search state
  const [tokenSearch, setTokenSearch] = useState('');
  const [searchResults, setSearchResults] = useState<LiveToken[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedToken, setSelectedToken] = useState<LiveToken | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [alertType, setAlertType] = useState<'above' | 'below'>('above');
  const [targetPrice, setTargetPrice] = useState('');

  useEffect(() => {
    loadAlerts();
  }, [activeAddress]);

  useEffect(() => {
    if (!showCreateModal) {
      setTokenSearch('');
      setSearchResults([]);
      setSelectedToken(null);
      setTargetPrice('');
      setAlertType('above');
      setCreateError(null);
    }
  }, [showCreateModal]);

  useEffect(() => {
    if (!tokenSearch.trim()) {
      setSearchResults([]);
      return;
    }
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const results = await liveMarketService.searchTokens(tokenSearch.trim());
        setSearchResults(results.slice(0, 8));
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 400);
    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current); };
  }, [tokenSearch]);

  const loadAlerts = async () => {
    if (!activeAddress) return;
    setLoading(true);
    const userAlerts = await AlertsService.getUserAlerts(activeAddress);
    setAlerts(userAlerts);
    setLoading(false);
  };

  const handleSelectToken = (token: LiveToken) => {
    setSelectedToken(token);
    setTokenSearch('');
    setSearchResults([]);
  };

  const handleClearToken = () => {
    setSelectedToken(null);
    setTokenSearch('');
    setSearchResults([]);
  };

  const handleCreateAlert = async () => {
    if (!activeAddress || !targetPrice || !selectedToken) return;

    setCreateError(null);
    setCreating(true);

    try {
      const parsedPrice = parseFloat(targetPrice);
      if (isNaN(parsedPrice) || parsedPrice <= 0) {
        setCreateError('Please enter a valid target price greater than 0.');
        return;
      }

      const alert = await AlertsService.createAlert(
        activeAddress,
        selectedToken.address,
        selectedToken.symbol.toUpperCase(),
        selectedToken.name,
        alertType,
        parsedPrice,
        selectedToken.price
      );

      if (alert) {
        setShowCreateModal(false);
        loadAlerts();
      } else {
        setCreateError('Failed to create alert. Please check your connection and try again.');
      }
    } catch (err: any) {
      setCreateError(err?.message || 'An unexpected error occurred. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const handleToggleAlert = async (alertId: string, currentState: boolean) => {
    const success = await AlertsService.toggleAlert(alertId, !currentState);
    if (success) loadAlerts();
  };

  const handleDeleteAlert = async (alertId: string) => {
    const success = await AlertsService.deleteAlert(alertId);
    if (success) loadAlerts();
  };

  const renderAlert = ({ item }: { item: PriceAlert }) => (
    <View style={styles.alertCard}>
      <View style={[styles.alertIcon, { backgroundColor: item.alert_type === 'above' ? colors.successMuted : colors.errorMuted }]}>
        {item.alert_type === 'above' ? (
          <TrendingUp size={20} color={colors.success} />
        ) : (
          <TrendingDown size={20} color={colors.error} />
        )}
      </View>

      <View style={styles.alertInfo}>
        <View style={styles.alertHeader}>
          <Text style={styles.alertToken}>{item.token_symbol}</Text>
          {item.triggered && (
            <View style={styles.triggeredBadge}>
              <Text style={styles.triggeredText}>Triggered</Text>
            </View>
          )}
        </View>
        <Text style={styles.alertCondition}>
          {item.alert_type === 'above' ? 'Above' : 'Below'} ${item.target_price.toLocaleString()}
        </Text>
        {item.triggered_at && (
          <Text style={styles.alertDate}>
            {new Date(item.triggered_at).toLocaleString()}
          </Text>
        )}
      </View>

      <View style={styles.alertActions}>
        {!item.triggered && (
          <Switch
            value={item.is_active}
            onValueChange={() => handleToggleAlert(item.id, item.is_active)}
            trackColor={{ false: colors.surfaceBorder, true: colors.primaryMuted }}
            thumbColor={item.is_active ? colors.primary : colors.textMuted}
          />
        )}
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDeleteAlert(item.id)}
        >
          <Trash2 size={18} color={colors.error} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <LinearGradient colors={colors.gradient.primary as any} style={styles.container}>
      <PremiumUpsellModal
        visible={showPremiumUpsell}
        onClose={() => setShowPremiumUpsell(false)}
        featureNote={premiumUpsellNote}
      />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Price Alerts</Text>
        <TouchableOpacity
          onPress={() => {
            const isPremium = profile ? VerificationService.isPremiumActive(profile as any) : false;
            const limit = isPremium ? PREMIUM_ALERT_LIMIT : FREE_ALERT_LIMIT;
            const activeAlerts = alerts.filter(a => !a.triggered).length;
            if (activeAlerts >= limit) {
              setPremiumUpsellNote(
                isPremium
                  ? `You have reached the maximum of ${PREMIUM_ALERT_LIMIT} active price alerts.`
                  : `Free users can create up to ${FREE_ALERT_LIMIT} price alerts. Upgrade to Premium for more alerts.`
              );
              setShowPremiumUpsell(!isPremium);
              return;
            }
            setShowCreateModal(true);
          }}
          style={styles.addButton}
        >
          <Plus size={24} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : alerts.length === 0 ? (
        <View style={styles.emptyContainer}>
          <BellOff size={64} color={colors.textMuted} />
          <Text style={styles.emptyText}>No price alerts set</Text>
          <Text style={styles.emptySubtext}>Get notified when prices reach your targets</Text>
          <TouchableOpacity style={styles.createFirstButton} onPress={() => setShowCreateModal(true)} >
            <Text style={styles.createFirstButtonText}>Create Your First Alert</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={alerts}
          renderItem={renderAlert}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      <Modal
        visible={showCreateModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Price Alert</Text>
              <TouchableOpacity onPress={() => setShowCreateModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={styles.inputLabel}>Select Token</Text>

              {selectedToken ? (
                <View style={styles.selectedTokenRow}>
                  <View style={styles.selectedTokenInfo}>
                    <Text style={styles.selectedTokenSymbol}>{selectedToken.symbol}</Text>
                    <Text style={styles.selectedTokenName}>{selectedToken.name}</Text>
                  </View>
                  <View style={styles.selectedTokenPrice}>
                    <Text style={styles.selectedTokenPriceLabel}>Current Price</Text>
                    <Text style={styles.selectedTokenPriceValue}>
                      ${selectedToken.price < 0.01
                        ? selectedToken.price.toFixed(6)
                        : selectedToken.price < 1
                        ? selectedToken.price.toFixed(4)
                        : selectedToken.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={handleClearToken} style={styles.clearTokenBtn}>
                    <X size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.searchContainer}>
                  <View style={styles.searchInputRow}>
                    <Search size={16} color={colors.textMuted} />
                    <TextInput
                      style={styles.searchInput}
                      placeholder="Search token name or symbol..."
                      placeholderTextColor={colors.textMuted}
                      value={tokenSearch}
                      onChangeText={setTokenSearch}
                      autoCapitalize="none"
                    />
                    {searchLoading && <ActivityIndicator size="small" color={colors.primary} />}
                  </View>
                  {searchResults.length > 0 && (
                    <View style={styles.searchDropdown}>
                      {searchResults.map((token) => (
                        <TouchableOpacity
                          key={token.address}
                          style={styles.searchResultItem}
                          onPress={() => handleSelectToken(token)}
                        >
                          <View style={styles.searchResultLeft}>
                            <Text style={styles.searchResultSymbol}>{token.symbol}</Text>
                            <Text style={styles.searchResultName} numberOfLines={1}>{token.name}</Text>
                          </View>
                          <Text style={styles.searchResultPrice}>
                            ${token.price < 0.01
                              ? token.price.toFixed(6)
                              : token.price < 1
                              ? token.price.toFixed(4)
                              : token.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              )}

              <Text style={styles.inputLabel}>Alert Type</Text>
              <View style={styles.alertTypeRow}>
                <TouchableOpacity
                  style={[styles.alertTypeButton, alertType === 'above' && styles.alertTypeButtonSelected]}
                  onPress={() => setAlertType('above')}
                >
                  <TrendingUp size={20} color={alertType === 'above' ? colors.white : colors.success} />
                  <Text style={[styles.alertTypeText, alertType === 'above' && styles.alertTypeTextSelected]}>
                    Above
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.alertTypeButton, alertType === 'below' && styles.alertTypeButtonSelected]}
                  onPress={() => setAlertType('below')}
                >
                  <TrendingDown size={20} color={alertType === 'below' ? colors.white : colors.error} />
                  <Text style={[styles.alertTypeText, alertType === 'below' && styles.alertTypeTextSelected]}>
                    Below
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.inputLabel}>Target Price (USD)</Text>
              <TextInput
                style={styles.priceInput}
                placeholder="Enter price"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
                value={targetPrice}
                onChangeText={setTargetPrice}
              />

              {createError && (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorBannerText}>{createError}</Text>
                </View>
              )}

              <TouchableOpacity
                style={[styles.createButton, (!targetPrice || !selectedToken || creating) && styles.createButtonDisabled]}
                onPress={handleCreateAlert}
                disabled={!targetPrice || !selectedToken || creating}
              >
                {creating ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <>
                    <Bell size={20} color={colors.white} />
                    <Text style={styles.createButtonText}>Create Alert</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.xl * 2,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    ...elevation.sm,
  },
  headerTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    ...elevation.sm,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyText: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: spacing.lg,
  },
  emptySubtext: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
  },
  createFirstButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.xl,
    ...elevation.md,
  },
  createFirstButtonText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.white,
  },
  listContent: {
    padding: spacing.lg,
  },
  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.md,
    ...elevation.sm,
  },
  alertIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertInfo: {
    flex: 1,
  },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  alertToken: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  triggeredBadge: {
    backgroundColor: colors.primaryMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  triggeredText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.primary,
  },
  alertCondition: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  alertDate: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  alertActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  deleteButton: {
    padding: spacing.xs,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingBottom: spacing.xl,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  modalClose: {
    fontSize: fontSize.xl,
    color: colors.textMuted,
    fontWeight: '700',
  },
  modalBody: {
    padding: spacing.xl,
  },
  inputLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  searchContainer: {
    position: 'relative',
    zIndex: 10,
  },
  searchInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.textPrimary,
  },
  searchDropdown: {
    backgroundColor: colors.surfaceElevated ?? colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.md,
    marginTop: spacing.xs,
    overflow: 'hidden',
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  searchResultLeft: {
    flex: 1,
    marginRight: spacing.sm,
  },
  searchResultSymbol: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  searchResultName: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  searchResultPrice: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  selectedTokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  selectedTokenInfo: {
    flex: 1,
  },
  selectedTokenSymbol: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.primary,
  },
  selectedTokenName: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  selectedTokenPrice: {
    alignItems: 'flex-end',
  },
  selectedTokenPriceLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  selectedTokenPriceValue: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  clearTokenBtn: {
    padding: spacing.xs,
  },
  alertTypeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  alertTypeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  alertTypeButtonSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  alertTypeText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  alertTypeTextSelected: {
    color: colors.white,
  },
  priceInput: {
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
    ...elevation.md,
  },
  createButtonDisabled: {
    backgroundColor: colors.surfaceBorder,
  },
  createButtonText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.white,
  },
  errorBanner: {
    backgroundColor: colors.errorMuted,
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  errorBannerText: {
    fontSize: fontSize.sm,
    color: colors.error,
    fontWeight: '600',
    textAlign: 'center',
  },
});
