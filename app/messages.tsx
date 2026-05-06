import { Redirect } from 'expo-router';

// /messages → community tab (where DMs and social live)
export default function MessagesRoute() {
  return <Redirect href="/(tabs)/community" />;
}
