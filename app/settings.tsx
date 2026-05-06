import { Redirect } from 'expo-router';

// /settings → settings tab
export default function SettingsRoute() {
  return <Redirect href="/(tabs)/settings" />;
}
