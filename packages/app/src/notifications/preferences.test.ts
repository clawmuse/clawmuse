import { describe, expect, it, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  },
}));

vi.mock("expo-notifications", () => ({
  getPermissionsAsync: vi.fn(async () => ({ status: "undetermined", canAskAgain: true })),
  requestPermissionsAsync: vi.fn(async () => ({ status: "granted", canAskAgain: true })),
}));

vi.mock("react-native", () => ({
  AppState: {
    addEventListener: vi.fn(() => ({ remove: vi.fn() })),
  },
}));

vi.mock("@/constants/platform", () => ({
  isNative: true,
}));

const {
  createNotificationPreferencesStore,
  DEFAULT_MOBILE_NOTIFICATION_PREFERENCES,
  toDaemonPushPreferences,
  toStatusPushPreferences,
} = await import("./preferences");

function createMemoryStorage() {
  const map = new Map<string, string>();
  return {
    map,
    storage: {
      getItem: async (key: string) => map.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        map.set(key, value);
      },
      removeItem: async (key: string) => {
        map.delete(key);
      },
    },
  };
}

describe("notification preferences store", () => {
  it("initializes fresh native installs as opt-in false without requesting OS permission", async () => {
    const { storage } = createMemoryStorage();
    const requestPermissionsAsync = vi.fn(async () => ({ status: "granted" }));
    const store = createNotificationPreferencesStore({
      storage,
      permissions: {
        isNative: true,
        getPermissionsAsync: async () => ({ status: "undetermined", canAskAgain: true }),
        requestPermissionsAsync,
      },
    });

    const loaded = await store.ensureLoaded();

    expect(loaded.pushEnabled).toBe(false);
    expect(loaded.taskRunning).toBe(false);
    expect(loaded.suppressWhenActive).toBe(true);
    expect(loaded.foregroundBanner).toBe(false);
    expect(loaded.singleTaskChannelPriority).toBe(true);
    expect(requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it("migrates existing native installs with granted OS permission to pushEnabled: true", async () => {
    const { storage } = createMemoryStorage();
    const store = createNotificationPreferencesStore({
      storage,
      permissions: {
        isNative: true,
        getPermissionsAsync: async () => ({ status: "granted", canAskAgain: true }),
        requestPermissionsAsync: async () => ({ status: "granted" }),
      },
    });

    const loaded = await store.ensureLoaded();

    expect(loaded.pushEnabled).toBe(true);
    expect(store.getSnapshot().osPermissionStatus).toBe("granted");
  });

  it("requests OS permission on opt-in and rolls back with permissionDeniedPrompt if denied", async () => {
    const { storage } = createMemoryStorage();
    let allowGrant = false;
    const store = createNotificationPreferencesStore({
      storage,
      permissions: {
        isNative: true,
        getPermissionsAsync: async () => ({ status: "undetermined", canAskAgain: true }),
        requestPermissionsAsync: async () => ({
          status: allowGrant ? "granted" : "denied",
          canAskAgain: allowGrant,
        }),
      },
    });

    const denied = await store.setPushEnabled(true);
    expect(denied).toEqual({ enabled: false, permissionDenied: true });
    expect(store.getSnapshot().permissionDeniedPrompt).toBe(true);
    expect(store.getSnapshot().preferences.pushEnabled).toBe(false);

    allowGrant = true;
    const granted = await store.setPushEnabled(true);
    expect(granted).toEqual({ enabled: true, permissionDenied: false });
    expect(store.getSnapshot().permissionDeniedPrompt).toBe(false);
    expect(store.getSnapshot().preferences.pushEnabled).toBe(true);
  });

  it("queues and clears pending offline Expo push unregistrations per server", async () => {
    const { storage, map } = createMemoryStorage();
    const store = createNotificationPreferencesStore({
      storage,
      permissions: {
        isNative: true,
        getPermissionsAsync: async () => ({ status: "granted" }),
        requestPermissionsAsync: async () => ({ status: "granted" }),
      },
    });

    await store.recordPendingUnregisterToken("srv-offline", "ExponentPushToken[abc]");
    expect(await store.readPendingUnregisterToken("srv-offline")).toBe("ExponentPushToken[abc]");

    await store.clearPendingUnregisterToken("srv-offline");
    expect(await store.readPendingUnregisterToken("srv-offline")).toBeNull();
    expect(map.size).toBe(0);
  });

  it("projects single-task priority and running alert flags to daemon and status preferences", () => {
    const custom = {
      ...DEFAULT_MOBILE_NOTIFICATION_PREFERENCES,
      pushEnabled: true,
      taskRunning: true,
      suppressWhenActive: false,
      showPreview: false,
      singleTaskChannelPriority: true,
    };

    expect(toDaemonPushPreferences(custom)).toEqual({
      permission: true,
      finished: true,
      error: true,
      running: true,
      showPreview: false,
      suppressWhenActive: false,
    });

    expect(toStatusPushPreferences(custom)).toEqual({
      taskAlerts: false,
      needsAction: true,
      completed: true,
      runningAlert: true,
      goalsReview: true,
      suppressWhenActive: false,
    });

    expect(
      toStatusPushPreferences({
        ...custom,
        singleTaskChannelPriority: false,
      }).taskAlerts,
    ).toBe(true);
  });
});
