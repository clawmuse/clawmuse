import { requireOptionalNativeModule } from "expo-modules-core";
import Constants from "expo-constants";
import { MobileUpdatesView } from "./mobile-updates-view";

// F-Droid deliberately excludes the native updater. Do not evaluate
// expo-updates (which requires that module) on those builds.
const EnabledUpdates = requireOptionalNativeModule("ExpoUpdates")
  ? require("./mobile-updates-enabled").MobileUpdatesEnabled
  : null;

export function nativeBuildNumber(): string {
  const value = Constants.platform?.ios?.buildNumber ?? Constants.platform?.android?.versionCode;
  return value == null ? "—" : String(value);
}

export function MobileUpdatesSection() {
  if (EnabledUpdates) return <EnabledUpdates buildNumber={nativeBuildNumber()} />;
  return <MobileUpdatesView buildNumber={nativeBuildNumber()} enabled={false} />;
}
