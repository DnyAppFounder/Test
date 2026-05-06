import { Redirect } from 'expo-router';

// /wallet → wallet tab
export default function WalletRoute() {
  return <Redirect href="/(tabs)" />;
}
