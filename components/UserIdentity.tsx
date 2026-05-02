import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { User } from 'lucide-react-native';
import VerificationBadge from './VerificationBadge';
import { UserProfile } from '@/services/socialService';
import { colors, spacing, fontSize, borderRadius } from '@/constants/theme';

export type IdentitySize = 'xs' | 'sm' | 'md' | 'lg';

interface UserIdentityProps {
  profile: UserProfile | null | undefined;
  size?: IdentitySize;
  /** Override display name (e.g. from post.author which may be a partial profile) */
  showWalletAddr?: boolean;
  onPress?: () => void;
  /** Extra right-side slot (e.g. timestamp) */
  rightSlot?: React.ReactNode;
}

const SIZE_CONFIG: Record<IdentitySize, { avatar: number; name: number; addr: number; gap: number }> = {
  xs: { avatar: 24, name: 12, addr: 10, gap: 6 },
  sm: { avatar: 32, name: 13, addr: 10, gap: 8 },
  md: { avatar: 40, name: 15, addr: 12, gap: 10 },
  lg: { avatar: 52, name: 17, addr: 13, gap: 12 },
};

export default function UserIdentity({
  profile,
  size = 'md',
  showWalletAddr = true,
  onPress,
  rightSlot,
}: UserIdentityProps) {
  const cfg = SIZE_CONFIG[size];
  const [avatarError, setAvatarError] = React.useState(false);

  const displayName = profile?.username
    || (profile?.wallet_address
      ? `${profile.wallet_address.slice(0, 6)}...${profile.wallet_address.slice(-4)}`
      : 'Wallet');

  const shortAddr = profile?.wallet_address
    ? `${profile.wallet_address.slice(0, 4)}...${profile.wallet_address.slice(-4)}`
    : null;

  const content = (
    <View style={[styles.row, { gap: cfg.gap }]}>
      {/* Avatar */}
      <View style={[styles.avatar, { width: cfg.avatar, height: cfg.avatar, borderRadius: cfg.avatar / 2 }]}>
        {profile?.avatar_url && !avatarError ? (
          <Image
            source={{ uri: profile.avatar_url }}
            style={{ width: cfg.avatar, height: cfg.avatar, borderRadius: cfg.avatar / 2 }}
            onError={() => setAvatarError(true)}
          />
        ) : (
          <User size={cfg.avatar * 0.45} color={colors.textMuted} />
        )}
      </View>

      {/* Name + addr */}
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={[styles.name, { fontSize: cfg.name }]} numberOfLines={1}>
            {displayName}
          </Text>
          {profile && <VerificationBadge profile={profile} size="sm" />}
        </View>
        {showWalletAddr && shortAddr && profile?.username && (
          <Text style={[styles.addr, { fontSize: cfg.addr }]}>{shortAddr}</Text>
        )}
      </View>

      {rightSlot && <View style={styles.right}>{rightSlot}</View>}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
        {content}
      </TouchableOpacity>
    );
  }
  return content;
}

// Need React for useState
import React from 'react';

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    backgroundColor: '#1E1E2E',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'nowrap',
  },
  name: {
    fontWeight: '700',
    color: colors.textPrimary,
    flexShrink: 1,
  },
  addr: {
    color: colors.textMuted,
    fontFamily: 'SpaceMono-Regular',
    fontWeight: '400',
  },
  right: {
    marginLeft: 'auto',
    flexShrink: 0,
  },
});
