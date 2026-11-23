import AsyncStorage from "@react-native-async-storage/async-storage";
import type { PushNotificationPreferences } from "@getpaseo/protocol/messages";
import * as Notifications from "expo-notifications";
import { useEffect, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { isNative } from "@/constants/platform";

export const NOTIFICATION_PREFERENCES_KEY = "@paseo:notification-preferences:v1";
export const PENDING_PUSH_UNREGISTER_KEY = "@paseo:pending-push-unregister:v1";

export type NotificationOsPermissionState = "unknown" | "granted" | "denied" | "undetermined";

export interface MobileNotificationPreferences {
  pushEnabled: boolean;
  needsAction: boolean;
  taskCompleted: boolean;
  taskError: boolean;
  taskRunning: boolean;
  goalsReview: boolean;
  showPreview: boolean;
  suppressWhenActive: boolean;
  foregroundBanner: boolean;
  singleTaskChannelPriority: boolean;
  liveActivityEnabled: boolean;
  liveActivityPushToStart: boolean;
}

export interface StatusInstallationPushPreferences {
  taskAlerts: boolean;
  completionPushActive: boolean;
  needsAction: boolean;
  completed: boolean;
  runningAlert: boolean;
  goalsReview: boolean;
  suppressWhenActive: boolean;
}

export interface NotificationPreferencesSnapshot {
  hydrated: boolean;
  saving: boolean;
  osPermissionStatus: NotificationOsPermissionState;
  permissionDeniedPrompt: boolean;
  preferences: MobileNotificationPreferences;
}

export const DEFAULT_MOBILE_NOTIFICATION_PREFERENCES: MobileNotificationPreferences = {
  pushEnabled: false,
  needsAction: true,
  taskCompleted: true,
  taskError: true,
  taskRunning: false,
  goalsReview: true,
  showPreview: true,
  suppressWhenActive: true,
  foregroundBanner: false,
  singleTaskChannelPriority: true,
  liveActivityEnabled: true,
  liveActivityPushToStart: true,
};

export interface NotificationPreferencesStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface NotificationPermissionsAdapter {
  isNative: boolean;
  getPermissionsAsync: () => Promise<{ status: string; canAskAgain?: boolean }>;
  requestPermissionsAsync: () => Promise<{ status: string; canAskAgain?: boolean }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function parsePersistedPreferences(raw: unknown): MobileNotificationPreferences {
  const record = isRecord(raw) ? raw : {};
  const defaults = DEFAULT_MOBILE_NOTIFICATION_PREFERENCES;
  return {
    pushEnabled: readBoolean(record.pushEnabled, defaults.pushEnabled),
    needsAction: readBoolean(record.needsAction, defaults.needsAction),
    taskCompleted: readBoolean(record.taskCompleted, defaults.taskCompleted),
    taskError: readBoolean(record.taskError, defaults.taskError),
    taskRunning: readBoolean(record.taskRunning, defaults.taskRunning),
    goalsReview: readBoolean(record.goalsReview, defaults.goalsReview),
    showPreview: readBoolean(record.showPreview, defaults.showPreview),
    suppressWhenActive: readBoolean(record.suppressWhenActive, defaults.suppressWhenActive),
    foregroundBanner: readBoolean(record.foregroundBanner, defaults.foregroundBanner),
    // Per-agent host notifications always own task alerts; normalize legacy
    // persisted false values so upgraded devices never stay stuck on duplicate
    // or context-free aggregate Status alerts.
    singleTaskChannelPriority: true,
    liveActivityEnabled: readBoolean(record.liveActivityEnabled, defaults.liveActivityEnabled),
    liveActivityPushToStart: readBoolean(
      record.liveActivityPushToStart,
      defaults.liveActivityPushToStart,
    ),
  };
}

function toOsPermissionState(status: string | undefined): NotificationOsPermissionState {
  if (status === "granted") return "granted";
  if (status === "denied") return "denied";
  if (status === "undetermined") return "undetermined";
  return "unknown";
}

export function toDaemonPushPreferences(
  prefs: MobileNotificationPreferences,
): PushNotificationPreferences {
  return {
    permission: prefs.needsAction,
    finished: prefs.taskCompleted,
    error: prefs.taskError,
    running: prefs.taskRunning,
    showPreview: prefs.showPreview,
    suppressWhenActive: prefs.suppressWhenActive,
  };
}

export function toStatusPushPreferences(
  prefs: MobileNotificationPreferences,
): StatusInstallationPushPreferences {
  const taskAlerts = prefs.pushEnabled && !prefs.singleTaskChannelPriority;
  const completionPushActive = prefs.pushEnabled && prefs.taskCompleted;
  return {
    taskAlerts,
    completionPushActive,
    needsAction: prefs.needsAction,
    completed: prefs.taskCompleted,
    runningAlert: prefs.taskRunning,
    goalsReview: prefs.pushEnabled && prefs.goalsReview,
    suppressWhenActive: prefs.suppressWhenActive,
  };
}

export interface NotificationPreferencesStore {
  getSnapshot(): NotificationPreferencesSnapshot;
  subscribe(listener: () => void): () => void;
  ensureLoaded(): Promise<MobileNotificationPreferences>;
  refreshPermissionStatus(): Promise<NotificationOsPermissionState>;
  setPushEnabled(enabled: boolean): Promise<{ enabled: boolean; permissionDenied: boolean }>;
  updatePreferences(
    patch: Partial<Omit<MobileNotificationPreferences, "pushEnabled">>,
  ): Promise<MobileNotificationPreferences>;
  readPendingUnregisterToken(serverId: string): Promise<string | null>;
  recordPendingUnregisterToken(serverId: string, token: string): Promise<void>;
  clearPendingUnregisterToken(serverId: string): Promise<void>;
}

export function createNotificationPreferencesStore(deps: {
  storage: NotificationPreferencesStorage;
  permissions: NotificationPermissionsAdapter;
}): NotificationPreferencesStore {
  const listeners = new Set<() => void>();
  let snapshot: NotificationPreferencesSnapshot = {
    hydrated: false,
    saving: false,
    osPermissionStatus: "unknown",
    permissionDeniedPrompt: false,
    preferences: { ...DEFAULT_MOBILE_NOTIFICATION_PREFERENCES },
  };
  let loadPromise: Promise<MobileNotificationPreferences> | null = null;
  let mutationChain: Promise<void> = Promise.resolve();

  function emit(next: Partial<NotificationPreferencesSnapshot>): void {
    snapshot = { ...snapshot, ...next };
    for (const listener of listeners) {
      listener();
    }
  }

  async function persistPreferences(next: MobileNotificationPreferences): Promise<void> {
    await deps.storage.setItem(NOTIFICATION_PREFERENCES_KEY, JSON.stringify(next));
  }

  function enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
    const run = mutationChain.then(operation, operation);
    mutationChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async function refreshPermissionStatus(): Promise<NotificationOsPermissionState> {
    if (!deps.permissions.isNative) {
      return "unknown";
    }
    try {
      const permission = await deps.permissions.getPermissionsAsync();
      const status = toOsPermissionState(permission.status);
      if (snapshot.osPermissionStatus !== status) {
        emit({
          osPermissionStatus: status,
          ...(status === "granted" ? { permissionDeniedPrompt: false } : {}),
        });
      }
      return status;
    } catch {
      return snapshot.osPermissionStatus;
    }
  }

  async function loadInitial(): Promise<MobileNotificationPreferences> {
    const raw = await deps.storage.getItem(NOTIFICATION_PREFERENCES_KEY);
    const permissionStatus = await refreshPermissionStatus();
    if (raw !== null) {
      try {
        const parsed = parsePersistedPreferences(JSON.parse(raw));
        emit({
          hydrated: true,
          osPermissionStatus: permissionStatus,
          preferences: parsed,
        });
        return parsed;
      } catch {
        // Corrupted JSON falls through to fresh initialization.
      }
    }

    // Option A backward compatibility: preserve push delivery for existing
    // installations that already granted OS notification permissions, while
    // keeping fresh installations opt-in without surprise permission prompts.
    const migrated: MobileNotificationPreferences = {
      ...DEFAULT_MOBILE_NOTIFICATION_PREFERENCES,
      pushEnabled: permissionStatus === "granted",
    };
    await persistPreferences(migrated);
    emit({
      hydrated: true,
      osPermissionStatus: permissionStatus,
      preferences: migrated,
    });
    return migrated;
  }

  function ensureLoaded(): Promise<MobileNotificationPreferences> {
    if (snapshot.hydrated) {
      return Promise.resolve(snapshot.preferences);
    }
    if (!loadPromise) {
      loadPromise = loadInitial().finally(() => {
        loadPromise = null;
      });
    }
    return loadPromise;
  }

  async function readPendingMap(): Promise<Record<string, string>> {
    try {
      const raw = await deps.storage.getItem(PENDING_PUSH_UNREGISTER_KEY);
      if (!raw) return {};
      const parsed: unknown = JSON.parse(raw);
      if (!isRecord(parsed)) return {};
      const out: Record<string, string> = {};
      for (const [key, val] of Object.entries(parsed)) {
        if (typeof val === "string" && val.trim().length > 0) {
          out[key] = val.trim();
        }
      }
      return out;
    } catch {
      return {};
    }
  }

  async function writePendingMap(next: Record<string, string>): Promise<void> {
    if (Object.keys(next).length === 0) {
      await deps.storage.removeItem(PENDING_PUSH_UNREGISTER_KEY);
      return;
    }
    await deps.storage.setItem(PENDING_PUSH_UNREGISTER_KEY, JSON.stringify(next));
  }

  async function requestNativePushPermission(): Promise<NotificationOsPermissionState> {
    const status = await refreshPermissionStatus();
    if (status === "granted") {
      return "granted";
    }
    try {
      const existing = await deps.permissions.getPermissionsAsync();
      if (existing.canAskAgain === false) {
        return "denied";
      }
      const requested = await deps.permissions.requestPermissionsAsync();
      return toOsPermissionState(requested.status);
    } catch {
      return "denied";
    }
  }

  return {
    getSnapshot() {
      return snapshot;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    ensureLoaded,

    refreshPermissionStatus,

    setPushEnabled(enabled) {
      return enqueueMutation(async () => {
        const current = await ensureLoaded();
        emit({ saving: true });
        try {
          if (!enabled) {
            const next: MobileNotificationPreferences = { ...current, pushEnabled: false };
            await persistPreferences(next);
            emit({
              saving: false,
              permissionDeniedPrompt: false,
              preferences: next,
            });
            return { enabled: false, permissionDenied: false };
          }

          if (deps.permissions.isNative) {
            const status = await requestNativePushPermission();
            if (status !== "granted") {
              const deniedNext: MobileNotificationPreferences = { ...current, pushEnabled: false };
              await persistPreferences(deniedNext);
              emit({
                saving: false,
                osPermissionStatus: status,
                permissionDeniedPrompt: true,
                preferences: deniedNext,
              });
              return { enabled: false, permissionDenied: true };
            }
          }

          const next: MobileNotificationPreferences = { ...current, pushEnabled: true };
          await persistPreferences(next);
          emit({
            saving: false,
            osPermissionStatus: deps.permissions.isNative ? "granted" : snapshot.osPermissionStatus,
            permissionDeniedPrompt: false,
            preferences: next,
          });
          return { enabled: true, permissionDenied: false };
        } finally {
          if (snapshot.saving) {
            emit({ saving: false });
          }
        }
      });
    },

    updatePreferences(patch) {
      return enqueueMutation(async () => {
        const current = await ensureLoaded();
        const next: MobileNotificationPreferences = {
          ...current,
          ...patch,
          pushEnabled: current.pushEnabled,
        };
        await persistPreferences(next);
        emit({ preferences: next });
        return next;
      });
    },

    async readPendingUnregisterToken(serverId) {
      const pending = await readPendingMap();
      return pending[serverId] ?? null;
    },

    recordPendingUnregisterToken(serverId, token) {
      return enqueueMutation(async () => {
        const trimmed = token.trim();
        if (!trimmed) return;
        const pending = await readPendingMap();
        pending[serverId] = trimmed;
        await writePendingMap(pending);
      });
    },

    clearPendingUnregisterToken(serverId) {
      return enqueueMutation(async () => {
        const pending = await readPendingMap();
        if (!(serverId in pending)) return;
        delete pending[serverId];
        await writePendingMap(pending);
      });
    },
  };
}

const defaultPermissionsAdapter: NotificationPermissionsAdapter = {
  isNative,
  getPermissionsAsync: () =>
    typeof Notifications.getPermissionsAsync === "function"
      ? Notifications.getPermissionsAsync()
      : Promise.resolve({ status: "denied", canAskAgain: false }),
  requestPermissionsAsync: () =>
    typeof Notifications.requestPermissionsAsync === "function"
      ? Notifications.requestPermissionsAsync()
      : Promise.resolve({ status: "denied", canAskAgain: false }),
};

export const notificationPreferencesStore = createNotificationPreferencesStore({
  storage: AsyncStorage,
  permissions: defaultPermissionsAdapter,
});

export function getNotificationPreferencesSnapshot(): NotificationPreferencesSnapshot {
  return notificationPreferencesStore.getSnapshot();
}

export function useNotificationPreferences(): NotificationPreferencesSnapshot & {
  setPushEnabled: NotificationPreferencesStore["setPushEnabled"];
  updatePreferences: NotificationPreferencesStore["updatePreferences"];
  refreshPermissionStatus: NotificationPreferencesStore["refreshPermissionStatus"];
} {
  const state = useSyncExternalStore(
    notificationPreferencesStore.subscribe,
    notificationPreferencesStore.getSnapshot,
    notificationPreferencesStore.getSnapshot,
  );

  useEffect(() => {
    void notificationPreferencesStore.ensureLoaded();
    if (!isNative) {
      return;
    }
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        void notificationPreferencesStore.refreshPermissionStatus();
      }
    });
    return () => {
      subscription.remove();
    };
  }, []);

  return {
    ...state,
    setPushEnabled: notificationPreferencesStore.setPushEnabled,
    updatePreferences: notificationPreferencesStore.updatePreferences,
    refreshPermissionStatus: notificationPreferencesStore.refreshPermissionStatus,
  };
}
