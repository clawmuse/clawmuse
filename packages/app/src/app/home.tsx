import { Redirect } from "expo-router";

/**
 * `paseo://home` and `clawmuse://home` deep links (Live Activity taps, status
 * push notifications) resolve to this route. The actual "open agent
 * activity" behavior is handled by `ClawMuseStatusDeepLinkListener` in
 * `@/clawmuse-status/root`, which listens to the raw `Linking` URL directly.
 * This route only exists so Expo Router has something to match instead of
 * falling through to +not-found.
 */
export default function Home() {
  return <Redirect href="/" />;
}
