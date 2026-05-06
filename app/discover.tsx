import { Redirect } from 'expo-router';

// /discover → wallet tab (market/token discovery)
export default function DiscoverRoute() {
  return <Redirect href="/(tabs)" />;
}
