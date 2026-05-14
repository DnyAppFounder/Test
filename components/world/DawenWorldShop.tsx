import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, ShoppingBag, Zap, Crown, Lock } from 'lucide-react-native';
import {
  WorldCatalogItem, WorldInventoryItem, purchaseWorldItem, getCatalog,
  getDawenCoinBalance,
} from '@/services/worldService';
import { colors, spacing, fontSize, borderRadius } from '@/constants/theme';
import { WorldSprite } from './WorldSprite';

const CATEGORIES = ['All','Chairs','Tables','Sofas','Beds','Lamps','Rugs','Wall Items',
  'Plants','Tech Items','Gaming Items','Luxury Items','DAWEN Specials','Solana Items','VIP / Premium'];

const RARITY_COLOR: Record<string, string> = {
  common: '#6B7280', uncommon: '#10B981', rare: '#3B82F6', epic: '#8B5CF6', legendary: '#F59E0B',
};

interface Props {
  walletAddress: string;
  isPremium: boolean;
  connectedWalletId?: string | null;
  internalAccountIndex?: number;
  inventory: WorldInventoryItem[];
  onClose: () => void;
  onPurchased: (item: WorldCatalogItem) => void;
}

export function DawenWorldShop({
  walletAddress, isPremium, connectedWalletId, internalAccountIndex,
  inventory, onClose, onPurchased,
}: Props) {
  const [catalog, setCatalog] = useState<WorldCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('All');
  const [buyItem, setBuyItem] = useState<WorldCatalogItem | null>(null);
  const [buying, setBuying] = useState(false);
  const [buyStatus, setBuyStatus] = useState('');
  const [buyError, setBuyError] = useState('');
  const [dawenBalance, setDawenBalance] = useState(0);

  useEffect(() => {
    getCatalog().then(c => { setCatalog(c.filter(i => !i.is_starter)); setLoading(false); });
    getDawenCoinBalance(walletAddress).then(b => setDawenBalance(b)).catch(() => {});
  }, []);

  const filtered = catalog.filter(i => {
    if (category !== 'All' && i.category !== category) return false;
    if (i.is_premium_only && !isPremium) return false;
    return true;
  });

  const ownedMap = new Map(inventory.map(i => [i.item_id, i.quantity]));

  const handleBuy = async (currency: 'SOL' | 'DAWEN') => {
    if (!buyItem || buying) return;
    setBuying(true);
    setBuyError('');
    const price = currency === 'SOL' ? buyItem.price_sol : buyItem.price_dawen;
    if (!price || price <= 0) { setBuyError('No price configured for this currency.'); setBuying(false); return; }

    const result = await purchaseWorldItem({
      walletAddress, item: buyItem, currency,
      connectedWalletId, internalAccountIndex,
      onStatus: s => setBuyStatus(s),
    });

    setBuying(false);
    setBuyStatus('');
    if (result.success) {
      setBuyItem(null);
      onPurchased(buyItem);
      getDawenCoinBalance(walletAddress).then(b => setDawenBalance(b)).catch(() => {});
    } else {
      setBuyError(result.error ?? 'Purchase failed');
    }
  };

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#0D0A1A', '#1A0A2E']} style={StyleSheet.absoluteFill} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn}>
          <ArrowLeft size={20} color="#fff" strokeWidth={2.5} />
        </TouchableOpacity>
        <ShoppingBag size={18} color={colors.primary} strokeWidth={2} />
        <Text style={styles.title}>World Shop</Text>
        <View style={styles.balancePill}>
          <Zap size={12} color="#F59E0B" fill="#F59E0B" strokeWidth={0} />
          <Text style={styles.balanceText}>{Math.floor(dawenBalance).toLocaleString()}</Text>
        </View>
      </View>

      {/* Category tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll} contentContainerStyle={styles.catContent}>
        {CATEGORIES.map(cat => (
          <TouchableOpacity
            key={cat}
            style={[styles.catPill, category === cat && styles.catPillActive]}
            onPress={() => setCategory(cat)}
          >
            <Text style={[styles.catText, category === cat && styles.catTextActive]}>{cat}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Grid */}
      {loading ? (
        <View style={styles.loader}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : (
        <ScrollView style={styles.grid} contentContainerStyle={styles.gridContent} showsVerticalScrollIndicator={false}>
          {filtered.map(item => {
            const owned = ownedMap.get(item.id) ?? 0;
            return (
              <TouchableOpacity
                key={item.id}
                style={[styles.itemCard, item.is_premium_only && styles.itemCardPremium]}
                onPress={() => setBuyItem(item)}
                activeOpacity={0.8}
              >
                <View style={[styles.itemIconBg, { backgroundColor: item.color_hex + '22' }]}>
                  <WorldSprite emoji={item.icon_emoji} size={44} color={item.color_hex} />
                </View>
                <Text style={styles.itemName} numberOfLines={2}>{item.item_name}</Text>
                <View style={[styles.rarityBadge, { backgroundColor: RARITY_COLOR[item.rarity] + '33' }]}>
                  <Text style={[styles.rarityText, { color: RARITY_COLOR[item.rarity] }]}>{item.rarity}</Text>
                </View>
                {item.price_sol && item.price_sol > 0 ? (
                  <Text style={styles.price}>{item.price_sol} SOL</Text>
                ) : null}
                {owned > 0 && <View style={styles.ownedBadge}><Text style={styles.ownedText}>×{owned}</Text></View>}
                {item.is_premium_only && (
                  <View style={styles.premBadge}><Crown size={10} color="#F59E0B" strokeWidth={2.5} /></View>
                )}
              </TouchableOpacity>
            );
          })}
          {filtered.length === 0 && <Text style={styles.empty}>No items in this category</Text>}
        </ScrollView>
      )}

      {/* Purchase modal */}
      <Modal visible={!!buyItem} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <LinearGradient colors={['#1A0A2E', '#0D0D1A']} style={StyleSheet.absoluteFill} />
            {buyItem && (
              <>
                <View style={[styles.modalIcon, { backgroundColor: buyItem.color_hex + '22' }]}>
                  <WorldSprite emoji={buyItem.icon_emoji} size={64} color={buyItem.color_hex} />
                </View>
                <Text style={styles.modalName}>{buyItem.item_name}</Text>
                <View style={[styles.rarityBadge, { backgroundColor: RARITY_COLOR[buyItem.rarity] + '33', marginBottom: spacing.md }]}>
                  <Text style={[styles.rarityText, { color: RARITY_COLOR[buyItem.rarity] }]}>{buyItem.rarity.toUpperCase()}</Text>
                </View>
                <Text style={styles.modalCat}>{buyItem.category}</Text>

                {buyStatus ? <Text style={styles.status}>{buyStatus}…</Text> : null}
                {buyError ? <Text style={styles.errorText}>{buyError}</Text> : null}

                <View style={styles.buyBtns}>
                  {buyItem.price_sol && buyItem.price_sol > 0 ? (
                    <TouchableOpacity
                      style={[styles.buyBtn, buying && { opacity: 0.6 }]}
                      onPress={() => handleBuy('SOL')}
                      disabled={buying}
                    >
                      {buying ? <ActivityIndicator size="small" color="#fff" /> : (
                        <Text style={styles.buyBtnText}>Buy {buyItem.price_sol} SOL</Text>
                      )}
                    </TouchableOpacity>
                  ) : null}
                  {buyItem.price_dawen && buyItem.price_dawen > 0 ? (
                    <TouchableOpacity
                      style={[styles.buyBtnDawen, buying && { opacity: 0.6 }]}
                      onPress={() => handleBuy('DAWEN')}
                      disabled={buying}
                    >
                      <Zap size={14} color="#fff" fill="#fff" strokeWidth={0} />
                      <Text style={styles.buyBtnText}>{Number(buyItem.price_dawen).toLocaleString()} DAWEN</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>

                <TouchableOpacity onPress={() => { setBuyItem(null); setBuyError(''); setBuyStatus(''); }} style={styles.cancelBtn} disabled={buying}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0D0A1A' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: 'rgba(139,92,246,0.2)' },
  backBtn: { width: 34, height: 34, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.08)', justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: fontSize.lg, fontWeight: '900', color: '#fff', flex: 1 },
  catScroll: { maxHeight: 46, borderBottomWidth: 1, borderBottomColor: 'rgba(139,92,246,0.1)' },
  catContent: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: 8, gap: 6 },
  catPill: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'transparent' },
  catPillActive: { backgroundColor: 'rgba(139,92,246,0.25)', borderColor: colors.primary },
  catText: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.45)' },
  catTextActive: { color: colors.primary },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  grid: { flex: 1 },
  gridContent: { flexDirection: 'row', flexWrap: 'wrap', padding: spacing.md, gap: 10 },
  itemCard: {
    width: '47%', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: borderRadius.lg,
    padding: spacing.md, alignItems: 'center', gap: 6, borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.15)', position: 'relative',
  },
  itemCardPremium: { borderColor: 'rgba(245,158,11,0.4)', backgroundColor: 'rgba(245,158,11,0.05)' },
  itemIconBg: { width: 56, height: 56, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  itemEmoji: { fontSize: 32 },
  itemName: { fontSize: 11, fontWeight: '700', color: '#fff', textAlign: 'center' },
  rarityBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  rarityText: { fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  price: { fontSize: 11, fontWeight: '800', color: colors.primary },
  ownedBadge: { position: 'absolute', top: 6, right: 6, backgroundColor: colors.primaryMuted, borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 },
  ownedText: { fontSize: 9, fontWeight: '800', color: colors.primary },
  premBadge: { position: 'absolute', top: 6, left: 6, backgroundColor: 'rgba(245,158,11,0.2)', borderRadius: 8, padding: 3 },
  empty: { color: 'rgba(255,255,255,0.3)', fontSize: fontSize.sm, padding: spacing.xl, textAlign: 'center', width: '100%' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#1A0A2E', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.xxl, alignItems: 'center', gap: 10, overflow: 'hidden', borderTopWidth: 1, borderColor: 'rgba(139,92,246,0.3)' },
  modalIcon: { width: 80, height: 80, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  modalName: { fontSize: fontSize.xl, fontWeight: '900', color: '#fff', textAlign: 'center' },
  modalCat: { fontSize: fontSize.sm, color: 'rgba(255,255,255,0.4)', fontWeight: '500' },
  status: { fontSize: 12, color: colors.primary, fontWeight: '600' },
  errorText: { fontSize: 12, color: '#EF4444', fontWeight: '600', textAlign: 'center' },
  buyBtns: { flexDirection: 'row', gap: 10, width: '100%', marginTop: 4 },
  buyBtn: { flex: 1, backgroundColor: colors.primary, borderRadius: borderRadius.lg, paddingVertical: spacing.md, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 },
  buyBtnDawen: { flex: 1, backgroundColor: '#7C3AED', borderRadius: borderRadius.lg, paddingVertical: spacing.md, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 },
  buyBtnText: { fontSize: fontSize.sm, fontWeight: '800', color: '#fff' },
  cancelBtn: { paddingVertical: spacing.sm },
  cancelText: { fontSize: fontSize.sm, color: 'rgba(255,255,255,0.4)', fontWeight: '600' },
  balancePill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(245,158,11,0.15)', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)',
  },
  balanceText: { fontSize: 12, fontWeight: '800', color: '#F59E0B' },
});
