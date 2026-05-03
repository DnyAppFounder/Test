import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { SocialService, UserProfile } from '@/services/socialService';

interface ProfileContextValue {
  profile: UserProfile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  updateProfile: (updates: { username?: string; bio?: string; avatar_url?: string; banner_url?: string; twitter_url?: string | null; telegram_url?: string | null; discord_url?: string | null; [key: string]: unknown }) => Promise<void>;
  uploadAvatar: (imageUri: string) => Promise<string | null>;
  unreadNotifCount: number;
  clearUnreadNotifCount: () => void;
}

const ProfileContext = createContext<ProfileContextValue>({
  profile: null,
  loading: true,
  refreshProfile: async () => {},
  updateProfile: async () => {},
  uploadAvatar: async () => null,
  unreadNotifCount: 0,
  clearUnreadNotifCount: () => {},
});

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { activeAddress } = useWallet();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);

  const clearUnreadNotifCount = useCallback(() => {
    setUnreadNotifCount(0);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!activeAddress) {
      setProfile(null);
      return;
    }
    setLoading(true);
    try {
      const p = await SocialService.getOrCreateProfile(activeAddress);
      setProfile(p);
    } catch (e) {
      console.error('[ProfileContext] refreshProfile error:', e);
    } finally {
      setLoading(false);
    }
  }, [activeAddress]);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  useEffect(() => {
    if (!profile?.id) { setUnreadNotifCount(0); return; }
    let cancelled = false;
    const poll = async () => {
      try {
        const notifs = await SocialService.getNotifications(profile.id);
        if (!cancelled) setUnreadNotifCount(notifs.filter(n => !n.read).length);
      } catch {}
    };
    poll();
    const interval = setInterval(poll, 30000);
    return () => { cancelled = true; clearInterval(interval); };
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

  return (
    <ProfileContext.Provider value={{ profile, loading, refreshProfile, updateProfile, uploadAvatar, unreadNotifCount, clearUnreadNotifCount }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  return useContext(ProfileContext);
}
