import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  SafeAreaView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Users, ArrowLeft, LogIn } from 'lucide-react-native';
import { colors, spacing, fontSize } from '@/constants/theme';
import { useProfile } from '@/contexts/ProfileContext';
import { SocialService } from '@/services/socialService';

export default function GroupInviteScreen() {
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code: string }>();
  const { profile } = useProfile();

  const [invite, setInvite] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    if (!code) return;
    (async () => {
      setLoading(true);
      const data = await SocialService.getGroupInviteByCode(code);
      if (!data) {
        setError('This invite link is invalid or has expired.');
      } else if (data.expires_at && new Date(data.expires_at) < new Date()) {
        setError('This invite link has expired.');
      } else if (data.max_uses != null && data.uses >= data.max_uses) {
        setError('This invite has reached its maximum number of uses.');
      } else {
        setInvite(data);
      }
      setLoading(false);
    })();
  }, [code]);

  const handleJoin = async () => {
    if (!profile || !code || joining) return;
    setJoining(true);
    const result = await SocialService.useGroupInvite(code, profile.id);
    if (result.success && result.groupId) {
      setJoined(true);
      setTimeout(() => {
        router.replace(`/chat/group/${result.groupId}` as any);
      }, 1200);
    } else {
      setError(result.error ?? 'Failed to join group');
    }
    setJoining(false);
  };

  const group = invite?.group;
  const memberCount = group?.member_count ?? invite?.uses ?? 0;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <ArrowLeft size={22} color={colors.textPrimary} strokeWidth={2.5} />
        </TouchableOpacity>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
        ) : error ? (
          <View style={styles.center}>
            <View style={styles.errorIcon}>
              <Users size={36} color={colors.textMuted} strokeWidth={1.5} />
            </View>
            <Text style={styles.errorTitle}>Invalid Invite</Text>
            <Text style={styles.errorMsg}>{error}</Text>
            <TouchableOpacity style={styles.backToHome} onPress={() => router.back()} activeOpacity={0.8}>
              <Text style={styles.backToHomeText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        ) : joined ? (
          <View style={styles.center}>
            <View style={styles.successIcon}>
              <Users size={36} color={colors.primary} strokeWidth={2} />
            </View>
            <Text style={styles.successTitle}>Joined!</Text>
            <Text style={styles.successMsg}>Taking you to the group...</Text>
            <ActivityIndicator color={colors.primary} style={{ marginTop: 16 }} />
          </View>
        ) : (
          <View style={styles.center}>
            {/* Group card */}
            <View style={styles.groupCard}>
              <View style={styles.groupAvatarWrap}>
                {group?.avatar_url ? (
                  <Image source={{ uri: group.avatar_url }} style={styles.groupAvatar} />
                ) : (
                  <View style={[styles.groupAvatar, styles.groupAvatarFallback]}>
                    <Users size={32} color={colors.primary} strokeWidth={2} />
                  </View>
                )}
              </View>

              <Text style={styles.groupName}>{group?.name || 'Group Chat'}</Text>
              <Text style={styles.groupMeta}>You were invited to join this group</Text>

              <View style={styles.divider} />

              <Text style={styles.inviteInfo}>
                This invite was shared via a DAWEN group link
              </Text>
            </View>

            {!profile ? (
              <Text style={styles.noProfileMsg}>Set up your profile to join this group</Text>
            ) : (
              <TouchableOpacity
                style={[styles.joinBtn, joining && styles.joinBtnLoading]}
                onPress={handleJoin}
                activeOpacity={0.85}
                disabled={joining}
              >
                {joining ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <LogIn size={20} color="#fff" strokeWidth={2.5} />
                    <Text style={styles.joinBtnText}>Join Group</Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={styles.cancelBtn}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
    paddingHorizontal: spacing.lg,
    paddingTop: Platform.OS === 'android' ? 44 : 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
    paddingBottom: 80,
  },

  // Group card
  groupCard: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  groupAvatarWrap: {
    marginBottom: spacing.sm,
  },
  groupAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  groupAvatarFallback: {
    backgroundColor: 'rgba(59,130,246,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupName: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  groupMeta: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
  },
  divider: {
    width: '100%',
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginVertical: spacing.sm,
  },
  inviteInfo: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
  },

  // Join button
  joinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    width: '100%',
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: colors.primary,
  },
  joinBtnLoading: {
    opacity: 0.7,
  },
  joinBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
  },
  cancelBtn: {
    paddingVertical: 12,
  },
  cancelBtnText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textMuted,
  },

  // Error state
  errorIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(239,68,68,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.2)',
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  errorMsg: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 280,
  },
  backToHome: {
    marginTop: spacing.md,
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  backToHomeText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  noProfileMsg: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
  },

  // Success state
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(59,130,246,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.3)',
  },
  successTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  successMsg: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
});
