import { View, Text, StyleSheet, TouchableOpacity, ScrollView, FlatList } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Package } from 'lucide-react-native';
import { WorldInventoryItem } from '@/services/worldService';
import { colors, spacing, fontSize, borderRadius } from '@/constants/theme';
import { WorldSprite } from './WorldSprite';
import { getAssetForItem } from '@/services/worldAssetRegistry';

const RARITY_COLOR: Record<string, string> = {
  common: '#6B7280', uncommon: '#10B981', rare: '#3B82F6', epic: '#8B5CF6', legendary: '#F59E0B',
};

const SOURCE_LABEL: Record<string, string> = {
  starter: 'Starter', purchased_sol: 'Bought (SOL)',
  purchased_dawen: 'Bought (DAWEN)', nft: 'NFT',
};

interface Props {
  inventory: WorldInventoryItem[];
  onClose: () => void;
}

export function DawenWorldInventory({ inventory, onClose }: Props) {
  const sorted = [...inventory].sort((a, b) =>
    (a.catalog_item?.sort_order ?? 0) - (b.catalog_item?.sort_order ?? 0)
  );

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#0D0D1A', '#1A0A2E']} style={StyleSheet.absoluteFill} />

      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn}>
          <ArrowLeft size={20} color="#fff" strokeWidth={2.5} />
        </TouchableOpacity>
        <Package size={18} color={colors.primary} strokeWidth={2} />
        <Text style={styles.title}>My Inventory</Text>
        <Text style={styles.count}>{sorted.length} items</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {sorted.length === 0 ? (
          <View style={styles.empty}>
            <WorldSprite emoji="📦" size={56} color="#8B5CF6" />
            <Text style={styles.emptyTitle}>No items yet</Text>
            <Text style={styles.emptySub}>Visit the World Shop to get furniture and decorations for your room.</Text>
          </View>
        ) : (
          sorted.map(inv => {
            const item = inv.catalog_item;
            if (!item) return null;
            const rColor = RARITY_COLOR[item.rarity] ?? '#6B7280';
            return (
              <View key={inv.id} style={styles.row}>
                <View style={[styles.iconBg, { backgroundColor: item.color_hex + '22' }]}>
                  <WorldSprite
                    emoji={item.icon_emoji}
                    size={36}
                    color={item.color_hex}
                    imageUrl={getAssetForItem(item.icon_emoji, item.item_type).defaultUrl}
                  />
                </View>
                <View style={styles.info}>
                  <Text style={styles.name}>{item.item_name}</Text>
                  <View style={styles.tags}>
                    <View style={[styles.rarityTag, { backgroundColor: rColor + '22' }]}>
                      <Text style={[styles.rarityText, { color: rColor }]}>{item.rarity}</Text>
                    </View>
                    <Text style={styles.source}>{SOURCE_LABEL[inv.source] ?? inv.source}</Text>
                    <Text style={styles.category}>{item.category}</Text>
                  </View>
                </View>
                <View style={styles.qtyBox}>
                  <Text style={styles.qty}>×{inv.quantity}</Text>
                </View>
              </View>
            );
          })
        )}

        <View style={styles.hint}>
          <Text style={styles.hintText}>
            To place items in your room, tap the ✏️ Decorate button in your room,
            then select an item from the quick bar that appears at the bottom.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0D0D1A' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: 'rgba(139,92,246,0.2)' },
  backBtn: { width: 34, height: 34, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.08)', justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: fontSize.lg, fontWeight: '900', color: '#fff', flex: 1 },
  count: { fontSize: fontSize.sm, color: 'rgba(255,255,255,0.4)', fontWeight: '600' },
  scroll: { flex: 1 },
  content: { padding: spacing.lg, gap: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: borderRadius.lg,
    padding: spacing.md, borderWidth: 1, borderColor: 'rgba(139,92,246,0.12)',
  },
  iconBg: { width: 48, height: 48, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  emoji: { fontSize: 26 },
  info: { flex: 1, gap: 4 },
  name: { fontSize: fontSize.sm, fontWeight: '700', color: '#fff' },
  tags: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  rarityTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  rarityText: { fontSize: 9, fontWeight: '800', textTransform: 'uppercase' },
  source: { fontSize: 9, color: 'rgba(255,255,255,0.4)', fontWeight: '600' },
  category: { fontSize: 9, color: 'rgba(255,255,255,0.3)', fontWeight: '500' },
  qtyBox: { backgroundColor: colors.primaryMuted, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  qty: { fontSize: fontSize.sm, fontWeight: '800', color: colors.primary },
  empty: { alignItems: 'center', paddingVertical: 48, gap: spacing.md },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: fontSize.xl, fontWeight: '800', color: '#fff' },
  emptySub: { fontSize: fontSize.sm, color: 'rgba(255,255,255,0.4)', textAlign: 'center', maxWidth: 280 },
  hint: { marginTop: spacing.xl, backgroundColor: 'rgba(139,92,246,0.1)', borderRadius: borderRadius.lg, padding: spacing.lg, borderWidth: 1, borderColor: 'rgba(139,92,246,0.2)' },
  hintText: { fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: '500', lineHeight: 18 },
});
