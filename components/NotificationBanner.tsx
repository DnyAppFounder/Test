import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Platform,
  Image,
} from 'react-native';
import {
  Bell,
  Heart,
  MessageCircle,
  UserPlus,
  AtSign,
  Repeat2,
  Mail,
  TrendingUp,
  User,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { Notification, UserProfile } from '@/services/socialService';
import {
  TrendingTokenNotification,
  trendingNotificationService,
} from '@/services/trendingNotificationService';
import { supabase } from '@/lib/supabase';
import { colors, spacing, fontSize } from '@/constants/theme';
import VerificationBadge from './VerificationBadge';

// ─── Banner item union ─────────────────────────────────────────────────────────

interface SocialBannerItem {
  kind: 'social';
  notification: Notification;
  actorProfile: UserProfile | null;
  actorLoading: boolean;
  msgPreview: string | null;
}

interface TrendingBannerItem {
  kind: 'trending';
  token: TrendingTokenNotification;
}

export type BannerItem = SocialBannerItem | TrendingBannerItem;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function notifIconProps(type: Notification['type']): { Icon: React.ComponentType<any>; color: string } {
  switch (type) {
    case 'like':    return { Icon: Heart,         color: '#EF4444' };
    case 'comment': return { Icon: MessageCircle, color: '#A78BFA' };
    case 'follow':  return { Icon: UserPlus,      color: '#10B981' };
    case 'mention': return { Icon: AtSign,        color: '#F59E0B' };
    case 'repost':  return { Icon: Repeat2,       color: '#10B981' };
    case 'message': return { Icon: Mail,          color: '#60A5FA' };
    default:        return { Icon: Bell,          color: colors.primary };
  }
}

function fmtPrice(price: number): string {
  if (price >= 1)    return `$${price.toFixed(2)}`;
  if (price >= 0.01) return `$${price.toFixed(4)}`;
  return `$${price.toFixed(8)}`;
}

function fmtChange(change: number): string {
  return `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`;
}

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// ─── Toast UI (default export) ────────────────────────────────────────────────

interface ToastProps {
  item: BannerItem | null;
  onDismiss: () => void;
  onPress: () => void;
}

export default function NotificationBannerToast({ item, onDismiss, onPress }: ToastProps) {
  const slideY   = useRef(new Animated.Value(-130)).current;
  const opacity  = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [avatarErr, setAvatarErr] = useState(false);

  useEffect(() => {
    if (!item) return;
    setAvatarErr(false);

    if (timerRef.current) clearTimeout(timerRef.current);

    Animated.parallel([
      Animated.spring(slideY, { toValue: 0, useNativeDriver: true, tension: 100, friction: 14 }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();

    timerRef.current = setTimeout(() => {
      Animated.parallel([
        Animated.timing(slideY, { toValue: -130, duration: 280, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start(() => onDismiss());
    }, 4500);

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [item]);

  if (!item) return null;

  // ── Trending token banner ─────────────────────────────────────────────────
  if (item.kind === 'trending') {
    const { token } = item;
    const changeColor = (token.priceChange24h ?? 0) >= 0 ? '#10B981' : '#EF4444';

    return (
      <Animated.View
        style={[styles.banner, { transform: [{ translateY: slideY }], opacity }]}
        pointerEvents="box-none"
      >
        <TouchableOpacity style={styles.inner} onPress={onPress} activeOpacity={0.88}>
          <View style={styles.avatarWrap}>
            {token.imageUrl && !avatarErr ? (
              <Image
                source={{ uri: token.imageUrl }}
                style={styles.avatar}
                onError={() => setAvatarErr(true)}
              />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <TrendingUp size={17} color="#10B981" strokeWidth={2.5} />
              </View>
            )}
            <View style={[styles.typeDot, { backgroundColor: '#10B981' }]} />
          </View>

          <View style={styles.textWrap}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>
                {token.symbol}
                <Text style={styles.nameSub}> · {token.name}</Text>
              </Text>
              <View style={styles.trendingPill}>
                <TrendingUp size={8} color="#10B981" strokeWidth={3} />
                <Text style={styles.trendingPillText}>Trending</Text>
              </View>
            </View>

            <View style={styles.priceRow}>
              {token.priceUsd != null && token.priceUsd > 0 && (
                <Text style={styles.priceText}>{fmtPrice(token.priceUsd)}</Text>
              )}
              {token.priceChange24h != null && (
                <Text style={[styles.changeText, { color: changeColor }]}>
                  {fmtChange(token.priceChange24h)}
                </Text>
              )}
              <Text style={styles.mintText}>
                {token.mint.slice(0, 4)}…{token.mint.slice(-4)}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.dismissBtn}
            onPress={onDismiss}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.dismissX}>✕</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  // ── Social notification banner ────────────────────────────────────────────
  const { notification, actorProfile, actorLoading, msgPreview } = item;
  const { Icon: NotifIcon, color: iconColor } = notifIconProps(notification.type);

  const resolvedProfile = actorProfile ?? notification.actor ?? null;
  const displayName = resolvedProfile?.username
    || (resolvedProfile?.wallet_address ? shortAddr(resolvedProfile.wallet_address) : null);
  const avatarUrl = resolvedProfile?.avatar_url ?? null;
  const messageText = msgPreview || notification.message;

  return (
    <Animated.View
      style={[styles.banner, { transform: [{ translateY: slideY }], opacity }]}
      pointerEvents="box-none"
    >
      <TouchableOpacity style={styles.inner} onPress={onPress} activeOpacity={0.88}>
        {/* Actor avatar with type-icon badge */}
        <View style={styles.avatarWrap}>
          {actorLoading ? (
            <View style={[styles.avatar, styles.avatarSkeleton]} />
          ) : avatarUrl && !avatarErr ? (
            <Image
              source={{ uri: avatarUrl }}
              style={styles.avatar}
              onError={() => setAvatarErr(true)}
            />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <User size={17} color={colors.textMuted} />
            </View>
          )}
          <View style={[styles.typeDot, { backgroundColor: iconColor }]}>
            <NotifIcon size={8} color="#fff" strokeWidth={2.5} />
          </View>
        </View>

        {/* Name + message */}
        <View style={styles.textWrap}>
          {actorLoading ? (
            <>
              <View style={styles.skeletonName} />
              <View style={styles.skeletonMsg} />
            </>
          ) : (
            <>
              <View style={styles.nameRow}>
                <Text style={styles.name} numberOfLines={1}>
                  {displayName ?? 'Unknown'}
                </Text>
                {resolvedProfile && (
                  <VerificationBadge profile={resolvedProfile} size="sm" />
                )}
              </View>
              <Text style={styles.msg} numberOfLines={1}>{messageText}</Text>
            </>
          )}
        </View>

        <TouchableOpacity
          style={styles.dismissBtn}
          onPress={onDismiss}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.dismissX}>✕</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Self-contained named export ──────────────────────────────────────────────

const TRENDING_INITIAL_DELAY = 30_000;      // 30 s before first check
const TRENDING_INTERVAL      = 5 * 60_000;  // 5 min recurring check

export function NotificationBanner({ userId }: { userId: string | null }) {
  const router = useRouter();
  const [item, setItem] = useState<BannerItem | null>(null);
  const itemRef = useRef<BannerItem | null>(null);
  useEffect(() => { itemRef.current = item; }, [item]);

  // ── Social notifications via Supabase realtime ──────────────────────────
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`notif_banner_${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        async (payload) => {
          const n = payload.new as any;
          console.log('[NotificationBanner] received type=', n.type);

          // Show immediately with loading skeleton for actor
          const initial: SocialBannerItem = {
            kind: 'social',
            notification: {
              id:         n.id,
              user_id:    n.user_id,
              actor_id:   n.actor_id,
              type:       n.type,
              post_id:    n.post_id,
              message:    n.message ?? '',
              read:       n.read ?? false,
              created_at: n.created_at,
            },
            actorProfile: null,
            actorLoading: !!n.actor_id,
            msgPreview: null,
          };
          setItem(initial);

          if (!n.actor_id) return;

          // Fetch actor profile and (for DMs) latest message preview in parallel
          const [profileRes, msgRes] = await Promise.all([
            supabase
              .from('user_profiles')
              .select(
                'id, username, avatar_url, wallet_address, is_verified, verified_basic, ' +
                'is_premium, premium_expires_at, premium_expiration, premium_tier, ' +
                'bio, token_balance, created_at'
              )
              .eq('id', n.actor_id)
              .maybeSingle(),

            n.type === 'message'
              ? supabase
                  .from('messages')
                  .select('content')
                  .eq('sender_id', n.actor_id)
                  .eq('receiver_id', n.user_id)
                  .order('created_at', { ascending: false })
                  .limit(1)
                  .maybeSingle()
              : Promise.resolve({ data: null }),
          ]);

          const actor   = profileRes.data as UserProfile | null;
          const preview = (msgRes.data as any)?.content
            ? String((msgRes.data as any).content).slice(0, 80)
            : null;

          console.log('[NotificationBanner] actor loaded:', actor?.username ?? actor?.wallet_address?.slice(0, 8) ?? 'unknown');

          setItem(prev => {
            if (!prev || prev.kind !== 'social' || prev.notification.id !== n.id) return prev;
            return { ...prev, actorProfile: actor, actorLoading: false, msgPreview: preview };
          });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  // ── Trending token check ───────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;

    const check = async () => {
      if (itemRef.current) return; // don't interrupt a visible notification
      const token = await trendingNotificationService.getNextTrendingToken();
      if (token) {
        console.log('[NotificationBanner] trending token:', token.symbol);
        setItem({ kind: 'trending', token });
      }
    };

    const initialTimer = setTimeout(check, TRENDING_INITIAL_DELAY);
    const interval     = setInterval(check, TRENDING_INTERVAL);
    return () => { clearTimeout(initialTimer); clearInterval(interval); };
  }, [userId]);

  // ── Navigation ─────────────────────────────────────────────────────────────
  const handlePress = useCallback(() => {
    if (!item) return;

    if (item.kind === 'trending') {
      console.log('[NotificationBanner] navigate to token-detail:', item.token.mint);
      trendingNotificationService.markSeen(item.token.mint);
      router.push(`/token-detail/${item.token.mint}` as any);
    } else {
      const notif  = item.notification;
      const actorId = item.actorProfile?.id ?? notif.actor_id;
      if (notif.type === 'message' && actorId) {
        console.log('[NotificationBanner] navigate to chat:', actorId);
        router.push(`/chat/${actorId}` as any);
      } else if (notif.type === 'follow' && actorId) {
        console.log('[NotificationBanner] navigate to profile:', actorId);
        router.push(`/profile/${actorId}` as any);
      }
      // like/comment/repost/mention: toast is informational; user checks notifications tab
    }

    setItem(null);
  }, [item, router]);

  const handleDismiss = useCallback(() => {
    if (item?.kind === 'trending') {
      trendingNotificationService.markSeen(item.token.mint);
    }
    setItem(null);
  }, [item]);

  return (
    <NotificationBannerToast
      item={item}
      onDismiss={handleDismiss}
      onPress={handlePress}
    />
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 40,
    left: 16,
    right: 16,
    zIndex: 9999,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: 'rgba(13,10,22,0.96)',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.55,
    shadowRadius: 18,
    elevation: 14,
    ...(Platform.OS === 'web'
      ? ({ backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' } as any)
      : {}),
  },
  avatarWrap: {
    position: 'relative',
    flexShrink: 0,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarFallback: {
    backgroundColor: '#1A1A2E',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarSkeleton: {
    backgroundColor: '#252535',
  },
  typeDot: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 17,
    height: 17,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(13,10,22,0.96)',
  },
  textWrap: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'nowrap',
  },
  name: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    color: colors.textPrimary,
    flexShrink: 1,
  },
  nameSub: {
    fontWeight: '500',
    color: colors.textMuted,
  },
  msg: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  priceText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  changeText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  mintText: {
    fontSize: 10,
    color: colors.textMuted,
    fontFamily: 'SpaceMono-Regular',
  },
  trendingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(16,185,129,0.14)',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    flexShrink: 0,
  },
  trendingPillText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#10B981',
    letterSpacing: 0.3,
  },
  dismissBtn: {
    paddingHorizontal: 4,
    paddingVertical: 4,
    flexShrink: 0,
  },
  dismissX: {
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: '600',
  },
  skeletonName: {
    height: 13,
    width: 96,
    borderRadius: 6,
    backgroundColor: '#252535',
  },
  skeletonMsg: {
    height: 10,
    width: 136,
    borderRadius: 5,
    backgroundColor: '#1A1A2E',
    marginTop: 2,
  },
});
