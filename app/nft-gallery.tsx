import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, ActivityIndicator, Dimensions } from 'react-native';
import { useState, useEffect } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Grid3x3, List, ExternalLink } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { colors, spacing, borderRadius, fontSize, elevation } from '@/constants/theme';
import { NFTService, NFT } from '@/services/nftService';
import { useWallet } from '@/contexts/WalletContext';

const { width } = Dimensions.get('window');
const GRID_ITEM_SIZE = (width - spacing.lg * 3) / 2;

export default function NFTGalleryScreen() {
  const router = useRouter();
  const { activeAddress } = useWallet();
  const [loading, setLoading] = useState(true);
  const [nfts, setNFTs] = useState<NFT[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [filter, setFilter] = useState<'all' | 'rare'>('all');

  useEffect(() => {
    loadNFTs();
  }, [activeAddress]);

  const loadNFTs = async () => {
    setLoading(true);
    try {
      if (activeAddress) {
        const userNFTs = await NFTService.getUserNFTs(activeAddress);
        setNFTs(userNFTs);
      } else {
        setNFTs([]);
      }
    } catch {
      setNFTs([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredNFTs = filter === 'rare'
    ? nfts.filter(nft => (nft.rarity_rank || 0) < 1000)
    : nfts;

  const renderGridItem = ({ item }: { item: NFT }) => (
    <TouchableOpacity
      style={styles.gridItem}
      onPress={() => {}}
      activeOpacity={0.8}
    >
      {item.image_url ? (
        <Image source={{ uri: item.image_url }} style={styles.gridImage} />
      ) : (
        <View style={[styles.gridImage, { backgroundColor: colors.surfaceLight, justifyContent: 'center', alignItems: 'center' }]}>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>No Image</Text>
        </View>
      )}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.8)']}
        style={styles.gridOverlay}
      >
        <Text style={styles.gridName} numberOfLines={1}>{item.name || 'Unknown NFT'}</Text>
        {item.rarity_rank != null && (
          <Text style={styles.gridRank}>#{item.rarity_rank}</Text>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );

  const renderListItem = ({ item }: { item: NFT }) => (
    <TouchableOpacity
      style={styles.listItem}
      onPress={() => {}}
      activeOpacity={0.8}
    >
      {item.image_url ? (
        <Image source={{ uri: item.image_url }} style={styles.listImage} />
      ) : (
        <View style={[styles.listImage, { backgroundColor: colors.surfaceLight, justifyContent: 'center', alignItems: 'center' }]}>
          <Text style={{ color: colors.textMuted, fontSize: 10 }}>No Img</Text>
        </View>
      )}
      <View style={styles.listInfo}>
        <Text style={styles.listName}>{item.name || 'Unknown NFT'}</Text>
        <Text style={styles.listCollection} numberOfLines={1}>
          {item.description || 'NFT Collection'}
        </Text>
        <View style={styles.listStats}>
          {item.rarity_rank != null && (
            <View style={styles.statBadge}>
              <Text style={styles.statText}>Rank #{item.rarity_rank}</Text>
            </View>
          )}
          {item.last_sale_price != null && (
            <View style={styles.statBadge}>
              <Text style={styles.statText}>{item.last_sale_price} SOL</Text>
            </View>
          )}
        </View>
      </View>
      <ExternalLink size={20} color={colors.textMuted} />
    </TouchableOpacity>
  );

  return (
    <LinearGradient colors={colors.gradient.primary as any} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My NFTs</Text>
        <TouchableOpacity
          style={styles.viewToggle}
          onPress={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
        >
          {viewMode === 'grid' ? (
            <List size={24} color={colors.textPrimary} />
          ) : (
            <Grid3x3 size={24} color={colors.textPrimary} />
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.filterBar}>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'all' && styles.filterButtonActive]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>
            All ({nfts.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'rare' && styles.filterButtonActive]}
          onPress={() => setFilter('rare')}
        >
          <Text style={[styles.filterText, filter === 'rare' && styles.filterTextActive]}>
            Rare ({nfts.filter(n => (n.rarity_rank || 0) < 1000).length})
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : filteredNFTs.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No NFTs found</Text>
          <Text style={styles.emptySubtext}>Your NFT collection will appear here</Text>
        </View>
      ) : (
        <FlatList
          data={filteredNFTs}
          renderItem={viewMode === 'grid' ? renderGridItem : renderListItem}
          keyExtractor={(item) => item.id}
          numColumns={viewMode === 'grid' ? 2 : 1}
          key={viewMode}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
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
  viewToggle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    ...elevation.sm,
  },
  filterBar: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  filterButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  filterButtonActive: {
    backgroundColor: colors.primaryMuted,
  },
  filterText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textMuted,
  },
  filterTextActive: {
    color: colors.primary,
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
    marginBottom: spacing.xs,
  },
  emptySubtext: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
  },
  listContent: {
    padding: spacing.lg,
    paddingTop: 0,
  },
  gridItem: {
    width: GRID_ITEM_SIZE,
    height: GRID_ITEM_SIZE,
    marginRight: spacing.md,
    marginBottom: spacing.md,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    ...elevation.md,
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  gridOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.sm,
  },
  gridName: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.white,
    marginBottom: 2,
  },
  gridRank: {
    fontSize: fontSize.xs,
    color: colors.white,
    opacity: 0.8,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.md,
    ...elevation.sm,
  },
  listImage: {
    width: 80,
    height: 80,
    borderRadius: borderRadius.md,
  },
  listInfo: {
    flex: 1,
  },
  listName: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  listCollection: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  listStats: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  statBadge: {
    backgroundColor: colors.primaryMuted,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  statText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.primary,
  },
});
