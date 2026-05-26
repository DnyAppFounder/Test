import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Shield } from 'lucide-react-native';

export default function PrivacyPage() {
  const router = useRouter();

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#06060D', '#0D0620', '#06060D']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace('/onboarding');
            }
          }}
          activeOpacity={0.75}
        >
          <ArrowLeft size={18} color="#A78BFA" strokeWidth={2} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <View style={styles.headerIconWrap}>
          <Shield size={18} color="#8B5CF6" strokeWidth={2} />
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Title */}
        <View style={styles.titleRow}>
          <Text style={styles.title}>Privacy Policy</Text>
          <Text style={styles.subtitle}>dawen.app</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.effectiveDate}>Effective: Coming soon</Text>

          <Section title="Overview">
            DAWEN ("we", "us", or "our") operates dawen.app. This Privacy Policy
            explains how we handle your information when you use our platform.
          </Section>

          <Section title="Non-Custodial Wallet">
            DAWEN is a non-custodial application. We do not store, transmit, or
            have access to your private keys, seed phrases, or encrypted wallet
            data. All cryptographic material stays on your device.
          </Section>

          <Section title="Data We Collect">
            • Public wallet address (used as your user identity){'\n'}
            • Username and profile information you choose to provide{'\n'}
            • Posts, comments, and social interactions you create{'\n'}
            • In-app activity (game scores, trading history){'\n'}
            {'\n'}
            We do not collect passwords, seed phrases, or private keys.
          </Section>

          <Section title="How We Use Your Data">
            • To provide and improve the DAWEN platform{'\n'}
            • To show your profile and activity to other users{'\n'}
            • To process referral rewards and game results{'\n'}
            • To ensure platform security and prevent abuse
          </Section>

          <Section title="Data Sharing">
            We do not sell your personal data. Public wallet activity on the
            Solana blockchain is publicly visible by nature. Profile data you
            post is visible to other DAWEN users.
          </Section>

          <Section title="Cookies & Storage">
            We use local storage and session storage on your device for
            authentication state and preferences. No third-party advertising
            cookies are used.
          </Section>

          <Section title="Your Rights">
            You may request deletion of your DAWEN profile data by contacting
            support. Note that on-chain transactions are permanent and cannot
            be deleted.
          </Section>

          <Section title="Contact">
            For privacy questions or data requests, contact us at:
          </Section>

          <TouchableOpacity
            onPress={() => Linking.openURL('mailto:support@dawen.app').catch(() => {})}
            activeOpacity={0.75}
          >
            <Text style={styles.emailLink}>support@dawen.app</Text>
          </TouchableOpacity>

          <Text style={styles.placeholder}>
            Full legal policy coming soon. For support, contact support@dawen.app.
          </Text>
        </View>

        <Text style={styles.copyright}>© 2026 DAWEN. All rights reserved.</Text>
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={sectionStyles.wrap}>
      <Text style={sectionStyles.title}>{title}</Text>
      <Text style={sectionStyles.body}>{children}</Text>
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  wrap: { marginBottom: 20 },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: '#C084FC',
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  body: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.65)',
    lineHeight: 20,
  },
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#06060D',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 12,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  backText: {
    fontSize: 15,
    color: '#A78BFA',
    fontWeight: '600',
  },
  headerIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(139,92,246,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 48,
    gap: 16,
  },
  titleRow: {
    gap: 4,
    marginBottom: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    color: 'rgba(139,92,246,0.7)',
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.15)',
    padding: 20,
    gap: 4,
  },
  effectiveDate: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
    marginBottom: 16,
    fontStyle: 'italic',
  },
  emailLink: {
    fontSize: 13,
    color: '#A78BFA',
    textDecorationLine: 'underline',
    fontWeight: '600',
    marginTop: -8,
    marginBottom: 16,
  },
  placeholder: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.25)',
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  copyright: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.25)',
    textAlign: 'center',
    marginTop: 8,
  },
});
