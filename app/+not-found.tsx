import { Redirect } from 'expo-router';

// Any unknown route redirects to the main app instead of showing a 404 page.
// This handles deep links and direct URL access in SPA mode.
export default function NotFoundScreen() {
  return <Redirect href="/(tabs)" />;
}
