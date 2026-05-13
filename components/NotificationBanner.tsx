import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Platform } from 'react-native';
import { Bell, Heart, MessageCircle, UserPlus, AtSign, Repeat2, Mail } from 'lucide-react-native';
import { Notification } from '@/services/socialService';
import { supabase } from '@/lib/supabase';
import { colors, spacing, fontSize } from '@/constants/theme';

interface NotificationBannerProps {
  notification: Notification | null;
  onDismiss: () => void;
  onPress: () => void;
}

function notifIcon(type: Notification['type']) {
  switch (type) {
    case 'like':    return { icon: Heart,         color: '#EF4444' };
    case 'comment': return { icon: MessageCircle, color: '#A78BFA' };
    case 'follow':  return { icon: UserPlus,      color: '#10B981' };
    case 'mention': return { icon: AtSign,        color: '#F59E0B' };
    case 'repost':  return { icon: Repeat2,       color: '#10B981' };
    case 'message': return { icon: Mail,          color: '#60A5FA' };
    default:        return { icon: Bell,          color: colors.primary };
  }
}

export default function NotificationBannerInner({ notification, onDismiss, onPress }: NotificationBannerProps) {
  const slideY = useRef(new Animated.Value(-120)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!notification) return;

    if (timerRef.current) clearTimeout(timerRef.current);

    Animated.parallel([
      Animated.spring(slideY, { toValue: 0, useNativeDriver: true, tension: 100, friction: 14 }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();

    timerRef.current = setTimeout(() => {
      Animated.parallel([
        Animated.timing(slideY, { toValue: -120, duration: 280, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start(() => onDismiss());
    }, 4000);

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [notification]);

  if (!notification) return null;

  const { icon: IconComp, color: iconColor } = notifIcon(notification.type);
  const actorName = notification.actor?.username
    || (notification.actor?.wallet_address
        ? `${notification.actor.wallet_address.slice(0, 6)}...${notification.actor.wallet_address.slice(-4)}`
        : 'Someone');

  return (
    <Animated.View
      style={[
        styles.banner,
        { transform: [{ translateY: slideY }], opacity },
      ]}
      pointerEvents="box-none"
    >
      <TouchableOpacity style={styles.inner} onPress={onPress} activeOpacity={0.88}>
        <View style={[styles.iconWrap, { backgroundColor: `${iconColor}22` }]}>
          <IconComp size={16} color={iconColor} strokeWidth={2.5} />
        </View>
        <View style={styles.textWrap}>
          <Text style={styles.name} numberOfLines={1}>{actorName}</Text>
          <Text style={styles.msg} numberOfLines={1}>{notification.message}</Text>
        </View>
        <TouchableOpacity style={styles.dismissBtn} onPress={onDismiss} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.dismissX}>✕</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

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
    backgroundColor: 'rgba(15,15,25,0.92)',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
    // glassmorphism on web
    ...(Platform.OS === 'web' ? {
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
    } as any : {}),
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  textWrap: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  msg: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: '500',
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
});

// Self-contained named export: subscribes to realtime notifications for a user
export function NotificationBanner({ userId }: { userId: string | null }) {
  const [notification, setNotification] = useState<Notification | null>(null);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`notif_banner_${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          const n = payload.new as any;
          setNotification({
            id: n.id,
            user_id: n.user_id,
            actor_id: n.actor_id,
            type: n.type,
            post_id: n.post_id,
            message: n.message ?? '',
            read: n.read ?? false,
            created_at: n.created_at,
          });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  return (
    <NotificationBannerInner
      notification={notification}
      onDismiss={() => setNotification(null)}
      onPress={() => setNotification(null)}
    />
  );
}
