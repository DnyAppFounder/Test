import { View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, TextInput, Switch, ActivityIndicator } from 'react-native';
import { useState, useEffect } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Bell, BellOff, Plus, Trash2, TrendingUp, TrendingDown } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { colors, spacing, borderRadius, fontSize, elevation } from '@/constants/theme';
import { AlertsService, PriceAlert } from '@/services/alertsService';
import { MarketService } from '@/services/marketService';
import { useWallet } from '@/contexts/WalletContext';

export default function PriceAlertsScreen() {
  const router = useRouter();
  const { selectedAccount } = useWallet();
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);

  const [selectedToken, setSelectedToken] = useState('bitcoin');
  const [alertType, setAlertType] = useState<'above' | 'below'>('above');
  const [targetPrice, setTargetPrice] = useState('');
  const [currentPrice, setCurrentPrice] = useState(0);

  useEffect(() => {
    loadAlerts();
  }, [selectedAccount]);

  useEffect(() => {
    if (showCreateModal) {
      loadCurrentPrice();
    }
  }, [showCreateModal, selectedToken]);

  const loadAlerts = async () => {
    if (!selectedAccount) return;

    setLoading(true);
    const userAlerts = await AlertsService.getUserAlerts(selectedAccount.address);
    setAlerts(userAlerts);
    setLoading(false);
  };

  const loadCurrentPrice = async () => {
    const coins = await MarketService.getTopCoins();
    const coin = coins.find(c => c.id === selectedToken);
    if (coin) {
      setCurrentPrice(coin.current_price);
    }
  };

  const handleCreateAlert = async () => {
    if (!selectedAccount || !targetPrice) return;

    setCreating(true);
    const coins = await MarketService.getTopCoins();
    const coin = coins.find(c => c.id === selectedToken);
    if (!coin) {
      setCreating(false);
      return;
    }

    const alert = await AlertsService.createAlert(
      selectedAccount.address,
      selectedToken,
      coin.symbol.toUpperCase(),
      coin.name,
      alertType,
      parseFloat(targetPrice)
    );

    if (alert) {
      setShowCreateModal(false);
      setTargetPrice('');
      loadAlerts();
    }
    setCreating(false);
  };

  const handleToggleAlert = async (alertId: string, currentState: boolean) => {
    const success = await AlertsService.toggleAlert(alertId, !currentState);
    if (success) {
      loadAlerts();
    }
  };

  const handleDeleteAlert = async (alertId: string) => {
    const success = await AlertsService.deleteAlert(alertId);
    if (success) {
      loadAlerts();
    }
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

  const topCoins = [
    { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' },
    { id: 'ethereum', symbol: 'ETH', name: 'Ethereum' },
    { id: 'solana', symbol: 'SOL', name: 'Solana' },
    { id: 'cardano', symbol: 'ADA', name: 'Cardano' },
    { id: 'ripple', symbol: 'XRP', name: 'XRP' },
  ];

  return (
    <LinearGradient colors={colors.gradient.primary as any} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Price Alerts</Text>
        <TouchableOpacity onPress={() => setShowCreateModal(true)} style={styles.addButton}>
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
          <TouchableOpacity style={styles.createFirstButton} onPress={() => setShowCreateModal(true)}>
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

            <View style={styles.modalBody}>
              <Text style={styles.inputLabel}>Select Token</Text>
              <View style={styles.tokenGrid}>
                {topCoins.map((coin) => (
                  <TouchableOpacity
                    key={coin.id}
                    style={[styles.tokenChip, selectedToken === coin.id && styles.tokenChipSelected]}
                    onPress={() => setSelectedToken(coin.id)}
                  >
                    <Text style={[styles.tokenChipText, selectedToken === coin.id && styles.tokenChipTextSelected]}>
                      {coin.symbol}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {currentPrice > 0 && (
                <View style={styles.currentPriceCard}>
                  <Text style={styles.currentPriceLabel}>Current Price</Text>
                  <Text style={styles.currentPriceValue}>${currentPrice.toLocaleString()}</Text>
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

              <Text style={styles.inputLabel}>Target Price</Text>
              <TextInput
                style={styles.priceInput}
                placeholder="Enter price"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
                value={targetPrice}
                onChangeText={setTargetPrice}
              />

              <TouchableOpacity
                style={[styles.createButton, (!targetPrice || creating) && styles.createButtonDisabled]}
                onPress={handleCreateAlert}
                disabled={!targetPrice || creating}
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
            </View>
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
  tokenGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tokenChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  tokenChipSelected: {
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primary,
  },
  tokenChipText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  tokenChipTextSelected: {
    color: colors.primary,
  },
  currentPriceCard: {
    backgroundColor: colors.primaryMuted,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginTop: spacing.md,
    alignItems: 'center',
  },
  currentPriceLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  currentPriceValue: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.primary,
    marginTop: spacing.xs,
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
});
