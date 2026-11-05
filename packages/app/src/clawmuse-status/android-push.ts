import * as Notifications from "expo-notifications";

export function normalizeFcmToken(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9_:-]{16,4096}$/.test(value) ? value : null;
}

/** Uses the existing OS permission; the paired-host notification flow owns prompting. */
export async function readAndroidGoalPushToken(): Promise<string | null> {
  const permission = await Notifications.getPermissionsAsync();
  if (permission.status !== Notifications.PermissionStatus.GRANTED) return null;
  await Notifications.setNotificationChannelAsync("clawmuse-goals", {
    name: "ClawMuse Goals",
    importance: Notifications.AndroidImportance.DEFAULT,
  });
  try {
    return normalizeFcmToken((await Notifications.getDevicePushTokenAsync()).data);
  } catch {
    // F-Droid and builds without google-services keep the in-app review inbox.
    console.warn("[ClawMuseStatus] Android background push token unavailable");
    return null;
  }
}
