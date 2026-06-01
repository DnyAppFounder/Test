import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { SocialService, UserProfile } from '@/services/socialService';
import { supabase } from '@/lib/supabase';

interface ProfileContextValue {
  profile: UserProfile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  updateProfile: (updates: { username?: string; bio?: string; avatar_url?: string; banner_url?: string; twitter_url?: string | null; telegram_url?: string | null; discord_url?: string | null; [key: string]: unknown }) => Promise<void>;
  uploadAvatar: (imageUri: string) => Promise<string | null>;
  unreadNotifCount: number;
  clearUnreadNotifCount: () => void;
  unreadMessageCount: number;
  clearUnreadMessageCount: () => void;
}

const ProfileContext = createContext<ProfileContextValue>({
  profile: null,
  loading: true,
  refreshProfile: async () => {},
  updateProfile: async () => {},
  uploadAvatar: async () => null,
  unreadNotifCount: 0,
  clearUnreadNotifCount: () => {},
  unreadMessageCount: 0,
  clearUnreadMessageCount: () => {},
});

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { activeAddress } = useWallet();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);

  const clearUnreadNotifCount = useCallback(() => {
    setUnreadNotifCount(0);
  }, []);

  const clearUnreadMessageCount = useCallback(() => {
    setUnreadMessageCount(0);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!activeAddress) {
      setProfile(null);
      return;
    }
    const normalizedAddr = activeAddress.toLowerCase();
    console.log('[ProfileContext] refreshProfile — wallet:', activeAddress.slice(0, 8), '| normalized:', normalizedAddr.slice(0, 8));
    setLoading(true);
    try {
      const p = await SocialService.getOrCreateProfile(activeAddress);
      console.log('[ProfileContext] refreshProfile result — found:', !!p, '| username:', p?.username ?? '(none)', '| id:', p?.id?.slice(0, 8) ?? 'n/a');
      if (!p) {
        console.warn('[ProfileContext] getOrCreateProfile returned null for wallet:', activeAddress.slice(0, 8));
      }
      // Only clear profile if we got a definitive null (not an error path)
      setProfile(p);
    } catch (e) {
      console.error('[ProfileContext] refreshProfile error:', e);
      // Do NOT overwrite an existing profile with null on transient error
    } finally {
      setLoading(false);
    }
  }, [activeAddress]);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  useEffect(() => {
    if (!profile?.id) {
      setUnreadNotifCount(0);
      setUnreadMessageCount(0);
      return;
    }
    // Initial fetch of unread counts
    const fetchCounts = async () => {
      try {
        const [notifs, convos] = await Promise.all([
          SocialService.getNotifications(profile.id),
          SocialService.getConversations(profile.id),
        ]);
        setUnreadNotifCount(notifs.filter(n => !n.read).length);
        const dmCount = convos.reduce((sum, c) => sum + ((c as any).unreadCount || 0), 0);

        // Sum group unread counts
        const groupIds = await SocialService.getUserGroupIds(profile.id);
        let groupUnread = 0;
        if (groupIds.length > 0) {
          const counts = await Promise.all(groupIds.map(gid => SocialService.getGroupUnreadCount(gid, profile.id)));
          groupUnread = counts.reduce((s, n) => s + n, 0);
        }
        setUnreadMessageCount(dmCount + groupUnread);
      } catch {}
    };
    fetchCounts();

    // Realtime: increment counters instantly without polling
    const channel = supabase
      .channel(`profile_unread_${profile.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile.id}` },
        () => { setUnreadNotifCount(c => c + 1); }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${profile.id}` },
        () => { setUnreadMessageCount(c => c + 1); }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'group_messages' },
        (payload) => {
          const raw = payload.new as any;
          if (raw.sender_id !== profile.id) {
            setUnreadMessageCount(c => c + 1);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile?.id]);

  const updateProfile = useCallback(async (updates: { username?: string; bio?: string; avatar_url?: string; banner_url?: string; twitter_url?: string | null; telegram_url?: string | null; discord_url?: string | null; [key: string]: unknown }) => {
    if (!profile) return;
    const updated = await SocialService.updateProfile(profile.id, updates);
    if (updated) setProfile(updated);
  }, [profile]);

  const uploadAvatar = useCallback(async (imageUri: string): Promise<string | null> => {
    if (!profile || !activeAddress) return null;
    const url = await SocialService.uploadAvatar(activeAddress, imageUri, profile.id);
    if (url) setProfile(prev => prev ? { ...prev, avatar_url: url } : prev);
    return url;
  }, [profile, activeAddress]);

  const value = useMemo(
    () => ({ profile, loading, refreshProfile, updateProfile, uploadAvatar, unreadNotifCount, clearUnreadNotifCount, unreadMessageCount, clearUnreadMessageCount }),
    [profile, loading, refreshProfile, updateProfile, uploadAvatar, unreadNotifCount, clearUnreadNotifCount, unreadMessageCount, clearUnreadMessageCount]
  );

  return (
    <ProfileContext.Provider value={value}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  return useContext(ProfileContext);
}
