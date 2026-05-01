import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { SocialService, UserProfile } from '@/services/socialService';

interface ProfileContextValue {
  profile: UserProfile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  updateProfile: (updates: { username?: string; bio?: string; avatar_url?: string }) => Promise<void>;
  uploadAvatar: (imageUri: string) => Promise<string | null>;
}

const ProfileContext = createContext<ProfileContextValue>({
  profile: null,
  loading: true,
  refreshProfile: async () => {},
  updateProfile: async () => {},
  uploadAvatar: async () => null,
});

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { activeAddress } = useWallet();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);

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

  const updateProfile = useCallback(async (updates: { username?: string; bio?: string; avatar_url?: string }) => {
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
    <ProfileContext.Provider value={{ profile, loading, refreshProfile, updateProfile, uploadAvatar }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  return useContext(ProfileContext);
}
