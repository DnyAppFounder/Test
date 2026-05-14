import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  AvatarConfig, WorldRoom, WorldInventoryItem,
  getWorldAvatar, saveWorldAvatar,
  getPlazaRoom,
  getInventory, grantStarterItems,
  earnDawenCoins, getDawenCoinBalance,
} from '@/services/worldService';
import { DawenWorldAvatarEditor } from './DawenWorldAvatarEditor';
import { DawenWorldRoom } from './DawenWorldRoom';
import { DawenWorldShop } from './DawenWorldShop';
import { DawenWorldInventory } from './DawenWorldInventory';
import { DawenWorldRoomDirectory } from './DawenWorldRoomDirectory';
import { colors, spacing, fontSize } from '@/constants/theme';

type Screen =
  | 'loading'
  | 'avatar_setup'
  | 'room'
  | 'shop'
  | 'inventory'
  | 'directory';

interface Props {
  walletAddress: string;
  username: string;
  isPremium: boolean;
  connectedWalletId?: string | null;
  internalAccountIndex?: number;
  onExit: () => void;
}

export function DawenWorldPage({
  walletAddress, username, isPremium,
  connectedWalletId, internalAccountIndex,
  onExit,
}: Props) {
  const [screen, setScreen] = useState<Screen>('loading');
  const [avatarConfig, setAvatarConfig] = useState<AvatarConfig | null>(null);
  const [currentRoom, setCurrentRoom] = useState<WorldRoom | null>(null);
  const [inventory, setInventory] = useState<WorldInventoryItem[]>([]);
  const [error, setError] = useState('');

  const loadInventory = useCallback(async () => {
    const inv = await getInventory(walletAddress);
    setInventory(inv);
  }, [walletAddress]);

  // Bootstrap: load avatar + grant starters + navigate to plaza
  useEffect(() => {
    if (!walletAddress) return;

    (async () => {
      setScreen('loading');
      setError('');
      try {
        const [existingAvatar, plaza] = await Promise.all([
          getWorldAvatar(walletAddress),
          getPlazaRoom(),
        ]);

        // Grant starter items (idempotent)
        await grantStarterItems(walletAddress);

        // Grant starter DawenCoins if first load
        const bal = await getDawenCoinBalance(walletAddress);
        if (bal === 0) {
          await earnDawenCoins(walletAddress, 500, 'welcome_bonus');
        }

        // Load inventory
        const inv = await getInventory(walletAddress);
        setInventory(inv);

        if (!existingAvatar) {
          // First time: show avatar setup, will enter plaza after
          setCurrentRoom(plaza);
          setScreen('avatar_setup');
        } else {
          setAvatarConfig(existingAvatar);
          setCurrentRoom(plaza);
          setScreen('room');
        }
      } catch (e) {
        console.error('[DawenWorldPage] bootstrap error:', e);
        setError('Failed to connect to DAWEN World. Please try again.');
        setScreen('loading');
      }
    })();
  }, [walletAddress]);

  const handleAvatarSave = async (config: AvatarConfig) => {
    await saveWorldAvatar(walletAddress, config);
    setAvatarConfig(config);
    setScreen('room');
  };

  const handleJoinRoom = (room: WorldRoom) => {
    setCurrentRoom(room);
    setScreen('room');
  };

  if (screen === 'loading') {
    return (
      <View style={styles.fullscreen}>
        <LinearGradient colors={['#0D0D1A', '#1A0A2E']} style={StyleSheet.absoluteFill} />
        {error ? (
          <View style={styles.errorWrap}>
            <Text style={styles.errorTitle}>Connection Error</Text>
            <Text style={styles.errorSub}>{error}</Text>
          </View>
        ) : (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Entering DAWEN World…</Text>
          </View>
        )}
      </View>
    );
  }

  if (screen === 'avatar_setup') {
    return (
      <View style={styles.fullscreen}>
        <DawenWorldAvatarEditor
          initial={avatarConfig}
          username={username}
          onSave={handleAvatarSave}
        />
      </View>
    );
  }

  if (screen === 'room' && currentRoom && avatarConfig) {
    return (
      <View style={styles.fullscreen}>
        <DawenWorldRoom
          room={currentRoom}
          walletAddress={walletAddress}
          username={username}
          avatarConfig={avatarConfig}
          isPremium={isPremium}
          inventory={inventory}
          onBack={onExit}
          onOpenShop={() => setScreen('shop')}
          onOpenInventory={() => setScreen('inventory')}
          onOpenDirectory={() => setScreen('directory')}
        />
      </View>
    );
  }

  if (screen === 'shop') {
    return (
      <View style={styles.fullscreen}>
        <DawenWorldShop
          walletAddress={walletAddress}
          isPremium={isPremium}
          connectedWalletId={connectedWalletId}
          internalAccountIndex={internalAccountIndex}
          inventory={inventory}
          onClose={() => setScreen('room')}
          onPurchased={async () => {
            await loadInventory();
            setScreen('room');
          }}
        />
      </View>
    );
  }

  if (screen === 'inventory') {
    return (
      <View style={styles.fullscreen}>
        <DawenWorldInventory
          inventory={inventory}
          onClose={() => setScreen('room')}
        />
      </View>
    );
  }

  if (screen === 'directory') {
    return (
      <View style={styles.fullscreen}>
        <DawenWorldRoomDirectory
          walletAddress={walletAddress}
          username={username}
          isPremium={isPremium}
          connectedWalletId={connectedWalletId}
          internalAccountIndex={internalAccountIndex}
          onJoinRoom={handleJoinRoom}
          onClose={() => setScreen('room')}
        />
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  fullscreen: { flex: 1 },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.lg },
  loadingText: { fontSize: fontSize.md, color: 'rgba(255,255,255,0.5)', fontWeight: '600' },
  errorWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.md, padding: spacing.xxl },
  errorTitle: { fontSize: fontSize.xl, fontWeight: '800', color: '#EF4444', textAlign: 'center' },
  errorSub: { fontSize: fontSize.sm, color: 'rgba(255,255,255,0.5)', textAlign: 'center' },
});
