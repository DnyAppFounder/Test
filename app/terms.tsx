import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, FileText } from 'lucide-react-native';

export default function TermsPage() {
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
          <FileText size={18} color="#8B5CF6" strokeWidth={2} />
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Title */}
        <View style={styles.titleRow}>
          <Text style={styles.title}>Terms of Service</Text>
          <Text style={styles.subtitle}>dawen.app</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.effectiveDate}>Effective: Coming soon</Text>

          <Section title="Acceptance of Terms">
            By accessing or using DAWEN ("the Platform"), you agree to be bound
            by these Terms of Service. If you do not agree, do not use the Platform.
          </Section>

          <Section title="Non-Custodial Service">
            DAWEN is a non-custodial platform. We do not hold, manage, or have
            access to your private keys or cryptocurrency funds. You are solely
            responsible for the security of your wallet.
          </Section>

          <Section title="Eligibility">
            You must be at least 18 years old to use this Platform. By using
            DAWEN, you represent that you meet this requirement and that use of
            the Platform is legal in your jurisdiction.
          </Section>

          <Section title="User Conduct">
            You agree not to:{'\n'}
            • Use the Platform for illegal activities{'\n'}
            • Attempt to manipulate markets or gaming systems{'\n'}
            • Post spam, harmful, or misleading content{'\n'}
            • Exploit bugs or vulnerabilities{'\n'}
            • Harass other users
          </Section>

          <Section title="Risk Disclosure">
            Cryptocurrency trading involves significant risk. Token prices can
            be highly volatile. DAWEN does not provide financial advice.
            Only invest what you can afford to lose.
          </Section>

          <Section title="Gaming">
            DAWEN games are skill-based. Results are determined by player
            performance. Rewards are distributed according to on-chain smart
            contract logic.
          </Section>

          <Section title="Intellectual Property">
            All DAWEN branding, UI, and content are owned by DAWEN. You may
            not reproduce or distribute them without written permission.
          </Section>

          <Section title="Disclaimer of Warranties">
            The Platform is provided "as is" without warranty of any kind.
            DAWEN is not liable for any losses arising from use of the Platform,
            including losses due to bugs, downtime, or market volatility.
          </Section>

          <Section title="Changes to Terms">
            We may update these Terms at any time. Continued use of the Platform
            after changes constitutes acceptance of the new Terms.
          </Section>

          <Section title="Contact">
            For questions about these Terms, contact us at:
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
