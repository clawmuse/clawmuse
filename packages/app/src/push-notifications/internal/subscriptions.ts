import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { z } from "zod";
import { notificationPreferencesStore, toDaemonPushPreferences } from "@/notifications/preferences";
import { readValidatedString } from "@/storage/validated-storage";
import type { RevokePushNotificationsInput, StartPushNotificationsInput } from "./types";

const STORAGE_PREFIX = "@paseo:expo-push-token:";
const ExpoPushTokenSchema = z.string().trim().min(1);

function storageKey(serverId: string): string {
  return `${STORAGE_PREFIX}${serverId}`;
}

function getExpoProjectId(): string | null {
  const fromEas = ExpoPushTokenSchema.safeParse(Constants.easConfig?.projectId);
  if (fromEas.success) return fromEas.data;
  const fromExtra = ExpoPushTokenSchema.safeParse(Constants.expoConfig?.extra?.eas?.projectId);
  return fromExtra.success ? fromExtra.data : null;
}

async function hasGrantedPushPermission(): Promise<boolean> {
  const existing = await Notifications.getPermissionsAsync();
  return existing.status === Notifications.PermissionStatus.GRANTED;
}

async function resolveToken(serverId: string): Promise<string | null> {
  const key = storageKey(serverId);
  const cached = await readValidatedString(AsyncStorage, key, ExpoPushTokenSchema);
  if (!(await hasGrantedPushPermission())) {
    await AsyncStorage.removeItem(key);
    return null;
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const projectId = getExpoProjectId();
  if (!projectId) {
    console.warn("[PushNotifications] Missing EAS projectId; cannot fetch Expo push token");
    return cached;
  }

  const result = await Notifications.getExpoPushTokenAsync({ projectId });
  const token = result.data.trim();
  if (!token) return cached;
  await AsyncStorage.setItem(key, token);
  return token;
}

async function revokeOrQueueToken(input: RevokePushNotificationsInput): Promise<void> {
  const key = storageKey(input.serverId);
  const cached = await readValidatedString(AsyncStorage, key, ExpoPushTokenSchema);
  const pending = await notificationPreferencesStore.readPendingUnregisterToken(input.serverId);
  const token = cached ?? pending;
  if (!token) {
    return;
  }

  if (input.client?.isConnected) {
    if (input.client.getLastServerInfoMessage()?.features?.pushTokenRevocation === true) {
      try {
        await input.client.unregisterPushToken(token);
      } catch (error) {
        console.warn("[PushNotifications] Failed to revoke push token", error);
        await notificationPreferencesStore.recordPendingUnregisterToken(input.serverId, token);
        await AsyncStorage.removeItem(key);
        return;
      }
    }
    await AsyncStorage.removeItem(key);
    await notificationPreferencesStore.clearPendingUnregisterToken(input.serverId);
    return;
  }

  await notificationPreferencesStore.recordPendingUnregisterToken(input.serverId, token);
  await AsyncStorage.removeItem(key);
}

export function startSubscription(input: StartPushNotificationsInput): () => void {
  let stopped = false;
  let token: string | null = null;
  let tokenRequestInFlight = false;
  let lastRegisteredKey: string | null = null;

  const register = () => {
    if (stopped || !token || !input.client.isConnected) {
      return;
    }
    const { hydrated, preferences } = notificationPreferencesStore.getSnapshot();
    if (!hydrated || !preferences.pushEnabled) {
      return;
    }
    const daemonPrefs = toDaemonPushPreferences(preferences);
    const registrationKey = `${token}:${JSON.stringify(daemonPrefs)}`;
    if (registrationKey === lastRegisteredKey) {
      return;
    }
    lastRegisteredKey = registrationKey;
    input.client.registerPushToken(token, daemonPrefs);
  };

  const sync = () => {
    if (stopped) {
      return;
    }
    const { hydrated, preferences } = notificationPreferencesStore.getSnapshot();
    if (!hydrated) {
      return;
    }

    if (!preferences.pushEnabled) {
      token = null;
      lastRegisteredKey = null;
      void revokeOrQueueToken({ client: input.client, serverId: input.serverId }).catch((error) =>
        console.warn("[PushNotifications] Failed to process push revocation", error),
      );
      return;
    }

    if (!input.client.isConnected) {
      return;
    }

    void notificationPreferencesStore.clearPendingUnregisterToken(input.serverId).catch(() => {});

    if (token) {
      register();
      return;
    }

    if (tokenRequestInFlight) {
      return;
    }
    tokenRequestInFlight = true;
    void resolveToken(input.serverId)
      .then((resolved) => {
        tokenRequestInFlight = false;
        if (stopped) return undefined;
        token = resolved;
        register();
        return undefined;
      })
      .catch((error) => {
        tokenRequestInFlight = false;
        console.warn("[PushNotifications] Failed to register push token", error);
      });
  };

  const unsubscribeConnection = input.client.subscribeConnectionStatus((state) => {
    if (state.status === "connected") {
      lastRegisteredKey = null;
      sync();
    }
  });
  const unsubscribePrefs = notificationPreferencesStore.subscribe(sync);

  void notificationPreferencesStore.ensureLoaded().then(() => {
    sync();
    return undefined;
  });

  return () => {
    stopped = true;
    unsubscribeConnection();
    unsubscribePrefs();
  };
}

export async function revokeSubscription(input: RevokePushNotificationsInput): Promise<void> {
  await revokeOrQueueToken(input);
}
