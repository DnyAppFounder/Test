import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useWallet } from '@/contexts/WalletContext';
import { LeaveYourMarkScreen } from '@/components/game/LeaveYourMark';
import { colors } from '@/constants/theme';

export default function SignatureWallRoute() {
  const router = useRouter();
  const { activeWallet } = useWallet();
  const walletAddress = activeWallet?.publicKey ?? '';

  return (
    <View style={styles.container}>
      <LeaveYourMarkScreen walletAddress={walletAddress} onBack={() => router.back()} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
});
