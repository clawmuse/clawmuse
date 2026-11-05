import {
  addAgentLiveActivityPushToStartTokenListener,
  addAgentLiveActivityPushTokenListener,
  getAgentLiveActivityPushTokenSnapshot,
  getAgentLiveActivityRemoteStatusCapability,
  resetAgentLiveActivityRemoteStatusSession,
  setAgentWidgetCredentials,
  type AgentLiveActivityPushToken,
} from "@clawmuse/expo-agent-live-activity";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";
import { useEffect, useState } from "react";
import { AppState, Platform } from "react-native";
import { i18n } from "@/i18n/i18next";
import { goalStatusLabelKey } from "./goals/presentation";
import { subscribeAccountChange } from "@/clawmuse/account-activity";
import { useClawMuseAccount } from "@/clawmuse/account-provider";
import { ClawMuseLiveActivityRoot } from "@/live-activity/root";
import {
  supportsClawMuseLiveActivity,
  supportsRemoteStatusLiveActivity,
} from "@/live-activity/remote-status-capability";
import { getHostRuntimeStore } from "@/runtime/host-runtime";
import { hostSupportsFeature } from "@/runtime/host-features";
import { getIsElectron } from "@/constants/platform";
import { parseNotificationOpenTarget } from "@/notification-open";
import { sendOsNotification } from "@/utils/os-notifications";
import { usePanelStore } from "@/stores/panel-store";
import { useSessionStore } from "@/stores/session-store";
import { shouldResetRemoteLiveActivity } from "./activity-recovery";
import { normalizeFcmToken, readAndroidGoalPushToken } from "./android-push";
import { ClawMuseStatusApiClient } from "./api";
import { getClawMuseStatusApiClient, publishClawMuseStatusApiClient } from "./api-access";
import { normalizeClawMuseStatusBaseUrl } from "./base-url";
import { secureStoreSupported, statusSessionIsEphemeral } from "./secure-store";
import {
  publishClawMuseStatusBindings,
  resetClawMuseStatusBindings,
  type ClawMuseStatusHostBinding,
} from "./binding-state";
import { getClawMuseStatusControls, registerClawMuseStatusControls } from "./controls";
import { isClawMuseStatusHomeDeepLink, isClawMuseStatusHomeNotification } from "./deep-link";
import { readClawMuseStatusRelayHostId, requestClawMuseStatusEnrollment } from "./enrollment";
import { processClawMuseStatusHostUnbinds } from "./host-unbind";
import {
  markClawMuseStatusHostUnbindReady,
  prepareClawMuseStatusHostUnbindIntent,
  subscribeClawMuseStatusHostUnbindIntents,
} from "./host-unbind-intents";
import {
  flushClawMuseStatusHostUnbinds,
  registerClawMuseStatusHostUnbindRunner,
} from "./host-unbind-runner";
import { ClawMuseStatusPushSyncState } from "./push-sync-state";
import { deleteClawMuseStatusSession, loadClawMuseStatusSession } from "./session-store";
import { publishClawMuseStatusSummary } from "./summary";
import {
  enrollClawMuseStatusHosts,
  enrollClawMuseStatusSession,
  synchronizeClawMuseStatus,
} from "./synchronization";
import type { ClawMuseStatusPushEndpoint } from "./types";
import { ensureClawMuseStatusWidgetCredentials } from "./widget-credentials";

const RETRY_BASE_MS = 1_000;
const RETRY_MAX_MS = 60_000;
const SUMMARY_POLL_MS = 30_000;
const HEX_TOKEN = /^[0-9a-fA-F]{32,512}$/;
const OPAQUE_ID = /^[A-Za-z0-9_-]{1,128}$/;

interface TokenState {
  alert?: string;
  pushToStart?: string;
  activities: Map<string, AgentLiveActivityPushToken>;
}

interface EnrollmentCandidate {
  serverId: string;
  client: DaemonClient;
}

interface EnrollmentRecord {
  client: DaemonClient;
  installationId: string | null;
}

function normalizeHexToken(value: unknown): string | null {
  return typeof value === "string" && HEX_TOKEN.test(value) ? value.toLowerCase() : null;
}

function endpointKey(installationId: string, endpoint: ClawMuseStatusPushEndpoint): string {
  return [
    installationId,
    endpoint.kind,
    endpoint.token,
    endpoint.kind === "activity_update" ? endpoint.activityId : "",
    endpoint.kind === "activity_update" ? endpoint.generation : "",
  ].join(":");
}

function addActivityToken(state: TokenState, event: AgentLiveActivityPushToken): void {
  const token = normalizeHexToken(event.pushToken);
  if (!token || !OPAQUE_ID.test(event.activityId) || !OPAQUE_ID.test(event.generation)) {
    return;
  }
  state.activities.set(event.activityId, { ...event, pushToken: token });
}

/**
 * The APNs alert token, gated on the app's notification permission.
 *
 * Paseo has no separate in-app push toggle on iOS: the OS permission is the
 * preference, and it is the same one the per-agent Expo push registration
 * already asks for. Turning notifications off in iOS Settings therefore
 * unregisters the aggregate alert endpoint too.
 */
async function readAlertToken(current: string | undefined): Promise<string | null> {
  const permission = await Notifications.getPermissionsAsync();
  if (permission.status !== Notifications.PermissionStatus.GRANTED) {
    return null;
  }
  if (current) {
    return current;
  }
  return normalizeHexToken((await Notifications.getDevicePushTokenAsync()).data);
}

function listFeatureHosts(allowedHosts?: ReadonlySet<string>): EnrollmentCandidate[] {
  const store = getHostRuntimeStore();
  const sessions = useSessionStore.getState().sessions;
  return store.getHosts().flatMap((host) => {
    if (allowedHosts && !allowedHosts.has(host.serverId)) return [];
    const snapshot = store.getSnapshot(host.serverId);
    const client = snapshot?.client;
    if (!client || snapshot.connectionStatus !== "online") {
      return [];
    }
    if (!hostSupportsFeature(sessions[host.serverId]?.serverInfo, "clawmuseStatus")) {
      return [];
    }
    return [{ serverId: host.serverId, client }];
  });
}

function featureHostFingerprint(): string {
  return listFeatureHosts()
    .map((candidate) => candidate.serverId)
    .sort()
    .join(",");
}

interface ResolveHostBindingInput {
  relayHostId: string | undefined;
  mismatchedBaseUrl: string | undefined;
  failure: string | undefined;
  isOnline: boolean;
  supportsFeature: boolean;
}

function resolveHostBinding(input: ResolveHostBindingInput): ClawMuseStatusHostBinding {
  if (input.relayHostId) {
    return { kind: "bound", relayHostId: input.relayHostId };
  }
  if (input.mismatchedBaseUrl) {
    return { kind: "base_url_mismatch", hostBaseUrl: input.mismatchedBaseUrl };
  }
  if (!input.isOnline) {
    return { kind: "offline" };
  }
  if (!input.supportsFeature) {
    return { kind: "unsupported" };
  }
  return input.failure ? { kind: "error", message: input.failure } : { kind: "unbound" };
}

/**
 * ClawMuse Status: enrollment, push endpoints, summary polling, and the widget
 * token. The full set runs on iOS when the Live Activity native module is
 * present. The Electron desktop runs the same synchronizer without the device
 * parts (APNs, Live Activity, widget, deep links): it enrolls with the hosts so
 * the goals screen and the summary have a status-service session.
 *
 * Ported from agent/mobile/src/status-saas/MobileStatusSaasRoot.tsx. The one
 * structural change: Orca shipped the status service URL in the app, while the
 * phone here learns it from the first host's enrollment response, so the API
 * client is created after the first successful probe rather than up front.
 */
export function ClawMuseStatusRoot() {
  const { state: account } = useClawMuseAccount();
  const [changingAccount, setChangingAccount] = useState(false);
  useEffect(
    () =>
      subscribeAccountChange(async () => {
        setChangingAccount(true);
        const previous = getClawMuseStatusApiClient();
        publishClawMuseStatusApiClient(null);
        publishClawMuseStatusSummary(null);
        resetClawMuseStatusBindings();
        if (previous) await previous.close();
        else if (secureStoreSupported) await deleteClawMuseStatusSession();
        if (Platform.OS === "ios") {
          await resetAgentLiveActivityRemoteStatusSession(false);
          await ensureClawMuseStatusWidgetCredentials({
            baseUrl: previous?.baseUrl ?? "",
            installationId: null,
            issueToken: async () => {
              throw new Error("No installation during account change");
            },
            storage: AsyncStorage,
            publish: setAgentWidgetCredentials,
          });
        }
      }),
    [],
  );
  useEffect(() => {
    if (!account.busy) setChangingAccount(false);
  }, [account.busy]);
  if (changingAccount || !account.initialized) return null;
  const accountId = account.account?.id ?? (account.error ? undefined : null);
  const accountHostIds = account.devices.map((device) => device.serverId);
  if (account.cloud?.offer) accountHostIds.push(account.cloud.offer.serverId);
  const hostScope = account.account ? JSON.stringify(accountHostIds.sort()) : null;
  const capability = getAgentLiveActivityRemoteStatusCapability();
  if (Platform.OS === "ios" && supportsClawMuseLiveActivity(capability)) {
    return (
      <>
        <ClawMuseStatusSynchronizer
          devicePush
          accountId={accountId}
          hostScope={hostScope}
          usesLocalActivity={!supportsRemoteStatusLiveActivity(capability)}
        />
        <ClawMuseStatusDeepLinkListener />
        <ClawMuseLiveActivityRoot />
      </>
    );
  }
  if (
    (getIsElectron() || Platform.OS === "android" || statusSessionIsEphemeral) &&
    secureStoreSupported
  ) {
    return (
      <ClawMuseStatusSynchronizer
        devicePush={false}
        usesLocalActivity={false}
        accountId={accountId}
        hostScope={hostScope}
      />
    );
  }
  return null;
}

interface ClawMuseStatusSynchronizerProps {
  accountId: string | null | undefined;
  hostScope: string | null;
  /** APNs alert, Live Activity, and widget endpoints. iOS only. */
  devicePush: boolean;
  usesLocalActivity: boolean;
}

function ClawMuseStatusSynchronizer({
  devicePush,
  usesLocalActivity,
  accountId,
  hostScope,
}: ClawMuseStatusSynchronizerProps) {
  useEffect(() => {
    const allowedHosts = hostScope === null ? undefined : new Set<string>(JSON.parse(hostScope));
    let api: ClawMuseStatusApiClient | null = null;
    let storedSessionRead = false;
    let disposed = false;
    let failureCount = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let runningPass: Promise<void> | null = null;
    let queuedPass: Promise<void> | null = null;
    let pendingActivityResetInstallationId: string | null = null;
    let activityAbsenceReportedFor: string | null = null;
    let liveActivityId: string | undefined;
    const androidPush = Platform.OS === "android";
    const tokens: TokenState = { activities: new Map() };
    const pushSyncState = new ClawMuseStatusPushSyncState();
    const enrolledClients = new Map<string, EnrollmentRecord>();
    const mismatchedBaseUrls = new Map<string, string>();
    const enrollmentErrors = new Map<string, string>();

    async function ensureApiFromStoredSession(): Promise<void> {
      if (api || storedSessionRead) {
        return;
      }
      storedSessionRead = true;
      const stored = await loadClawMuseStatusSession();
      if (disposed) return;
      if (accountId !== undefined && (stored?.accountId ?? null) !== accountId) return;
      const baseUrl = normalizeClawMuseStatusBaseUrl(stored?.baseUrl, __DEV__);
      if (baseUrl) {
        api = new ClawMuseStatusApiClient(baseUrl, undefined, undefined, accountId);
        publishClawMuseStatusApiClient(api);
      }
    }

    async function replaceActivitySnapshot(): Promise<void> {
      if (!devicePush) {
        return;
      }
      const snapshot = await getAgentLiveActivityPushTokenSnapshot();
      liveActivityId = snapshot.activityId;
      const pushToStart = normalizeHexToken(snapshot.pushToStartToken);
      if (pushToStart) {
        tokens.pushToStart = pushToStart;
      }
      tokens.activities.clear();
      for (const activity of snapshot.activities) {
        addActivityToken(tokens, activity);
      }
    }

    async function publishBindings(): Promise<void> {
      const store = getHostRuntimeStore();
      const sessions = useSessionStore.getState().sessions;
      const boundHosts = api ? await api.getBoundHosts() : {};
      const hosts: Record<string, ClawMuseStatusHostBinding> = {};
      for (const host of store.getHosts()) {
        hosts[host.serverId] = resolveHostBinding({
          relayHostId: boundHosts[host.serverId],
          mismatchedBaseUrl: mismatchedBaseUrls.get(host.serverId),
          failure: enrollmentErrors.get(host.serverId),
          isOnline: store.getSnapshot(host.serverId)?.connectionStatus === "online",
          supportsFeature: hostSupportsFeature(
            sessions[host.serverId]?.serverInfo,
            "clawmuseStatus",
          ),
        });
      }
      if (disposed) return;
      publishClawMuseStatusBindings({
        supported: true,
        liveActivity: devicePush,
        baseUrl: api?.baseUrl ?? null,
        installationId: api ? await api.getInstallationId() : null,
        hosts,
      });
    }

    async function enrollHost(candidate: EnrollmentCandidate): Promise<boolean> {
      const enrollment = await requestClawMuseStatusEnrollment(candidate.client, __DEV__);
      if (disposed) return false;
      const installationId = api ? await api.getInstallationId() : null;
      if (api && enrollment.statusBaseUrl !== api.baseUrl) {
        // A second status service would need a second installation; the phone
        // keeps one, so the host is left unbound and Settings explains why.
        mismatchedBaseUrls.set(candidate.serverId, enrollment.statusBaseUrl);
        enrolledClients.set(candidate.serverId, { client: candidate.client, installationId });
        return false;
      }
      mismatchedBaseUrls.delete(candidate.serverId);
      const client =
        api ??
        new ClawMuseStatusApiClient(enrollment.statusBaseUrl, undefined, undefined, accountId);
      api = client;
      const relayHostId = await readClawMuseStatusRelayHostId(candidate.client);
      if (!relayHostId) {
        throw new Error("Host did not report a ClawMuse Status id");
      }
      if (disposed) return false;
      const enrolledInstallationId = await enrollClawMuseStatusSession({
        enroll: () =>
          client.enroll(
            { serverId: candidate.serverId, relayHostId },
            enrollment.enrollmentCode,
            enrollment.expiresAt,
          ),
        getInstallationId: () => client.getInstallationId(),
        publish: () => {
          if (!disposed) publishClawMuseStatusApiClient(client);
        },
      });
      enrolledClients.set(candidate.serverId, {
        client: candidate.client,
        installationId: enrolledInstallationId,
      });
      return true;
    }

    async function enrollConnectedHosts() {
      const installationId = api ? await api.getInstallationId() : null;
      const boundHosts = api ? await api.getBoundHosts() : {};
      const candidates = listFeatureHosts(allowedHosts).filter((candidate) => {
        if (boundHosts[candidate.serverId] !== undefined) {
          return false;
        }
        const previous = enrolledClients.get(candidate.serverId);
        return previous?.client !== candidate.client || previous.installationId !== installationId;
      });
      return enrollClawMuseStatusHosts({
        candidates,
        enroll: async (candidate) => {
          try {
            const enrolled = await enrollHost(candidate);
            enrollmentErrors.delete(candidate.serverId);
            return enrolled;
          } catch (error) {
            enrollmentErrors.set(
              candidate.serverId,
              error instanceof Error ? error.message : String(error),
            );
            throw error;
          }
        },
      });
    }

    async function registerEndpoints(): Promise<void> {
      if (!devicePush && !androidPush) {
        return;
      }
      const client = api;
      const installationId = client ? await client.getInstallationId() : null;
      if (!client || !installationId) {
        return;
      }
      if (androidPush) tokens.alert = (await readAndroidGoalPushToken()) ?? undefined;
      const alertKind = androidPush ? "fcm_alert" : "alert";
      if (!tokens.alert && pushSyncState.shouldUnregisterAlert(installationId)) {
        await client.unregisterAlertPushEndpoint(alertKind);
        pushSyncState.markAlertUnregistered(installationId);
      }
      const endpoints: ClawMuseStatusPushEndpoint[] = [];
      if (tokens.alert) {
        endpoints.push({ kind: alertKind, token: tokens.alert });
      }
      if (tokens.pushToStart) {
        endpoints.push({ kind: "push_to_start", token: tokens.pushToStart });
      }
      for (const activity of tokens.activities.values()) {
        endpoints.push({
          kind: "activity_update",
          token: activity.pushToken,
          activityId: activity.activityId,
          generation: activity.generation,
        });
      }
      for (const endpoint of endpoints) {
        const key = endpointKey(installationId, endpoint);
        if (pushSyncState.shouldRegister(key)) {
          await client.registerPushEndpoint(endpoint);
          pushSyncState.markRegistered(installationId, endpoint.kind, key);
        }
      }
    }

    // Why: the widget refreshes on its own timeline, so it needs its own token;
    // a failure here must not block status synchronization.
    async function syncWidgetCredentials(installationId: string | null): Promise<void> {
      if (!devicePush) {
        return;
      }
      const client = api;
      if (!client) {
        return;
      }
      try {
        await ensureClawMuseStatusWidgetCredentials({
          baseUrl: client.baseUrl,
          installationId,
          issueToken: () => client.issueWidgetToken(),
          storage: AsyncStorage,
          publish: setAgentWidgetCredentials,
        });
      } catch {
        // Retried on the next summary refresh.
      }
    }

    async function notifyGoalReviews(): Promise<void> {
      if (devicePush || (androidPush && tokens.alert) || !api || disposed) return;
      const client = api;
      const installationId = await client.getInstallationId();
      if (!installationId || disposed) return;
      const key = `clawmuse.goals.notified.${installationId}`;
      const raw = await AsyncStorage.getItem(key);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      const seen = new Set(
        Array.isArray(parsed)
          ? parsed.filter((item): item is string => typeof item === "string")
          : [],
      );
      const reviews = await client.listGoals("needs_review");
      for (const goal of reviews) {
        if (disposed) return;
        const eventKey = `${goal.id}:${goal.reviewEventVersion ?? goal.updatedAt}`;
        if (seen.has(eventKey)) continue;
        const data = {
          goal: {
            goalId: goal.id,
            installationId,
            ...(goal.reviewEventVersion ? { eventVersion: goal.reviewEventVersion } : {}),
          },
        };
        let accepted = false;
        if (getIsElectron()) {
          accepted = await sendOsNotification({
            title: "ClawMuse",
            body: i18n.t(goalStatusLabelKey(goal)),
            data,
          });
        } else if (Platform.OS === "android") {
          const permission = await Notifications.getPermissionsAsync();
          if (permission.status === Notifications.PermissionStatus.GRANTED) {
            await Notifications.scheduleNotificationAsync({
              content: { title: "ClawMuse", body: i18n.t(goalStatusLabelKey(goal)), data },
              trigger: null,
            });
            accepted = true;
          }
        }
        if (accepted) seen.add(eventKey);
      }
      if (!disposed) await AsyncStorage.setItem(key, JSON.stringify([...seen].slice(-500)));
    }

    async function refreshSummary(): Promise<void> {
      const client = api;
      if (!client || !(await client.hasSession())) {
        publishClawMuseStatusSummary(null);
        await syncWidgetCredentials(null);
        return;
      }
      try {
        publishClawMuseStatusSummary(await client.getSummary());
        await syncWidgetCredentials(await client.getInstallationId());
      } catch (error) {
        if (!(await client.hasSession().catch(() => false))) {
          publishClawMuseStatusSummary(null);
        }
        throw error;
      }
    }

    // Why: the service only sends updates to an activity it believes is
    // running; if this device no longer has one, nothing is visible until the
    // service is told to plan a fresh start.
    async function reportMissingLiveActivity(installationId: string | null): Promise<void> {
      if (!devicePush) {
        return;
      }
      const client = api;
      if (
        !client ||
        !shouldResetRemoteLiveActivity({
          usesLocalActivity,
          installationId,
          liveActivityCount: tokens.activities.size,
          liveActivityId,
          reportedForInstallationId: activityAbsenceReportedFor,
        })
      ) {
        return;
      }
      try {
        await client.resetLiveActivity();
        activityAbsenceReportedFor = installationId;
      } catch {
        // Retried on the next synchronization pass.
      }
    }

    async function processUnbinds(): Promise<void> {
      const client = api;
      if (!client) {
        return;
      }
      await processClawMuseStatusHostUnbinds({
        baseUrl: client.baseUrl,
        installationId: await client.getInstallationId(),
        currentServerIds: new Set(
          getHostRuntimeStore()
            .getHosts()
            .map((host) => host.serverId),
        ),
        unbindHost: (relayHostId, serverId) => client.unbindHost(relayHostId, serverId),
      });
    }

    async function applyPendingActivityReset(installationBefore: string | null): Promise<void> {
      if (!devicePush) {
        return;
      }
      if (!pendingActivityResetInstallationId) {
        return;
      }
      if (pendingActivityResetInstallationId === installationBefore) {
        await resetAgentLiveActivityRemoteStatusSession(usesLocalActivity);
        pushSyncState.invalidateRegistrations();
      }
      pendingActivityResetInstallationId = null;
    }

    // A new installation invalidates every endpoint the old one registered, so
    // the capsule is restarted before the tokens are published again.
    async function afterEnrollment(installationBefore: string | null): Promise<void> {
      if (!devicePush) {
        return;
      }
      const installationAfter = api ? await api.getInstallationId() : null;
      if (installationAfter === installationBefore) {
        return;
      }
      pendingActivityResetInstallationId = installationAfter;
      await resetAgentLiveActivityRemoteStatusSession(usesLocalActivity);
      pendingActivityResetInstallationId = null;
      await replaceActivitySnapshot();
      pushSyncState.invalidateRegistrations();
    }

    async function synchronize(): Promise<void> {
      if (disposed) return;
      await ensureApiFromStoredSession();
      const installationBefore = api ? await api.getInstallationId() : null;
      await flushClawMuseStatusHostUnbinds();
      await applyPendingActivityReset(installationBefore);
      await replaceActivitySnapshot();
      tokens.alert = devicePush ? ((await readAlertToken(tokens.alert)) ?? undefined) : undefined;
      let synchronizationError: unknown;
      try {
        await synchronizeClawMuseStatus({
          registerEndpoints,
          enrollConnectedHosts,
          afterEnrollment: () => afterEnrollment(installationBefore),
        });
      } catch (error) {
        synchronizationError = error;
      }
      const installationAfter = api ? await api.getInstallationId() : null;
      if (installationAfter !== installationBefore) {
        publishClawMuseStatusSummary(null);
      }
      await reportMissingLiveActivity(installationAfter);
      await notifyGoalReviews();
      try {
        await refreshSummary();
      } finally {
        await publishBindings();
      }
      if (synchronizationError !== undefined) {
        throw synchronizationError;
      }
    }

    function startPass(): Promise<void> {
      runningPass = synchronize().finally(() => {
        runningPass = null;
      });
      return runningPass;
    }

    /** At most one pass running and one queued; a burst of triggers coalesces. */
    function runSynchronize(): Promise<void> {
      if (queuedPass) {
        return queuedPass;
      }
      if (!runningPass) {
        return startPass();
      }
      queuedPass = runningPass
        .catch(() => {})
        .then(() => {
          queuedPass = null;
          return startPass();
        });
      return queuedPass;
    }

    function scheduleRetry(): void {
      const delay = Math.min(RETRY_BASE_MS * 2 ** failureCount, RETRY_MAX_MS);
      failureCount += 1;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        trigger();
      }, delay);
    }

    function trigger(): void {
      if (disposed) {
        return;
      }
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      void runSynchronize()
        .then(() => {
          failureCount = 0;
          return;
        })
        .catch(() => {
          if (!disposed) {
            scheduleRetry();
          }
        });
    }

    const unregisterControls = registerClawMuseStatusControls({
      synchronize: () => {
        // A manual bind retries the hosts an automatic pass has stopped probing.
        enrolledClients.clear();
        mismatchedBaseUrls.clear();
        enrollmentErrors.clear();
        return runSynchronize();
      },
      unbindHost: async (serverId) => {
        const client = api;
        if (!client) {
          return;
        }
        const relayHostId = (await client.getBoundHosts())[serverId];
        if (!relayHostId) {
          return;
        }
        await client.unbindHost(relayHostId, serverId);
        const hostClient = getHostRuntimeStore().getSnapshot(serverId)?.client;
        if (hostClient) {
          // Remembered as handled so the next pass does not bind it straight back.
          enrolledClients.set(serverId, {
            client: hostClient,
            installationId: await client.getInstallationId(),
          });
        }
        await publishBindings();
      },
      recreateLiveActivity: async () => {
        if (!devicePush) {
          return;
        }
        await resetAgentLiveActivityRemoteStatusSession(usesLocalActivity);
        pushSyncState.invalidateRegistrations();
        activityAbsenceReportedFor = null;
        await replaceActivitySnapshot();
        await api?.resetLiveActivity().catch(() => undefined);
        trigger();
      },
    });

    const unregisterUnbindRunner = registerClawMuseStatusHostUnbindRunner({
      prepare: async (serverId) => {
        const client = api;
        if (!client) {
          return;
        }
        const relayHostId = (await client.getBoundHosts())[serverId];
        const installationId = await client.getInstallationId();
        if (!relayHostId || !installationId) {
          return;
        }
        await prepareClawMuseStatusHostUnbindIntent({
          baseUrl: client.baseUrl,
          installationId,
          serverId,
          relayHostId,
        });
      },
      commit: async (serverId) => {
        enrolledClients.delete(serverId);
        mismatchedBaseUrls.delete(serverId);
        enrollmentErrors.delete(serverId);
        await markClawMuseStatusHostUnbindReady(serverId);
        await flushClawMuseStatusHostUnbinds();
        trigger();
      },
      flush: processUnbinds,
    });

    // The host runtime ticks on every connection probe. Only a change to the
    // set of hosts this feature can enroll is worth another pass.
    let hostFingerprint = featureHostFingerprint();
    function triggerOnHostChange(): void {
      const next = featureHostFingerprint();
      if (next === hostFingerprint) {
        return;
      }
      hostFingerprint = next;
      trigger();
    }

    const hostRuntimeStore = getHostRuntimeStore();
    const unsubscribeHosts = hostRuntimeStore.subscribeAll(triggerOnHostChange);
    const unsubscribeHostList = hostRuntimeStore.subscribeHostList(triggerOnHostChange);
    const unsubscribeFeatures = useSessionStore.subscribe(
      featureHostFingerprint,
      triggerOnHostChange,
    );
    const unsubscribeUnbindIntents = subscribeClawMuseStatusHostUnbindIntents(trigger);
    const summaryPollTimer = setInterval(() => {
      if (AppState.currentState === "active") {
        trigger();
      }
    }, SUMMARY_POLL_MS);
    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        // APNs can invalidate an endpoint after the last successful POST;
        // foreground is a cheap repair point.
        pushSyncState.invalidateRegistrations();
        trigger();
      }
    });
    function subscribeDevicePushTokens(): Array<{ remove: () => void } | null | undefined> {
      const pushTokenSubscription = Notifications.addPushTokenListener((token) => {
        const normalized = androidPush
          ? normalizeFcmToken(token.data)
          : normalizeHexToken(token.data);
        if (normalized) {
          tokens.alert = normalized;
          trigger();
        }
      });
      const activityTokenSubscription =
        devicePush &&
        addAgentLiveActivityPushTokenListener(() => {
          // Re-read the native singleton snapshot before registration. Appending
          // this token could leave the replaced card's token in the same pass.
          trigger();
        });
      const pushToStartSubscription =
        devicePush &&
        addAgentLiveActivityPushToStartTokenListener((event) => {
          const token = normalizeHexToken(event.pushToStartToken);
          if (token) {
            tokens.pushToStart = token;
            trigger();
          }
        });
      const observedSubscription = Notifications.addNotificationReceivedListener((notification) => {
        const target = parseNotificationOpenTarget(notification.request.content.data);
        if (target?.kind !== "goal" || !target.eventVersion || !api) return;
        const client = api;
        void (async () => {
          if ((await client.getInstallationId()) !== target.installationId || disposed) return;
          await client.recordGoalNotificationReceipt(
            target.goalId,
            target.eventVersion!,
            "observed",
          );
        })().catch(() => {});
      });
      return [
        pushTokenSubscription,
        activityTokenSubscription || null,
        pushToStartSubscription || null,
        observedSubscription,
      ];
    }

    // F-Droid replaces expo-notifications with an adapter that has no push listeners.
    const deviceSubscriptions =
      (devicePush || androidPush) && typeof Notifications.addPushTokenListener === "function"
        ? subscribeDevicePushTokens()
        : [];
    publishClawMuseStatusSummary(null);
    trigger();

    return () => {
      disposed = true;
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
      clearInterval(summaryPollTimer);
      unregisterControls();
      unregisterUnbindRunner();
      unsubscribeHosts();
      unsubscribeHostList();
      unsubscribeFeatures();
      unsubscribeUnbindIntents();
      appStateSubscription.remove();
      for (const subscription of deviceSubscriptions) {
        subscription?.remove();
      }
      publishClawMuseStatusApiClient(null);
      publishClawMuseStatusSummary(null);
      resetClawMuseStatusBindings();
    };
  }, [devicePush, usesLocalActivity, accountId, hostScope]);

  return null;
}

/**
 * `clawmuse://home?focus=agent-activity` and the aggregate alert that carries
 * it. Paseo's own per-agent notification routing is untouched: those payloads
 * carry a serverId and are handled by `PushNotificationRouter`.
 */
function ClawMuseStatusDeepLinkListener() {
  useEffect(() => {
    function openHome(): void {
      usePanelStore.getState().showMobileAgentList();
      void getClawMuseStatusControls()?.synchronize();
    }

    function handleUrl(url: string | null): void {
      if (url && isClawMuseStatusHomeDeepLink(url)) {
        openHome();
      }
    }

    void Linking.getInitialURL()
      .then((url) => {
        handleUrl(url);
        return;
      })
      .catch(() => undefined);

    const linkSubscription = Linking.addEventListener("url", (event) => handleUrl(event.url));
    const notificationSubscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        if (isClawMuseStatusHomeNotification(response.notification.request.content.data)) {
          openHome();
        }
      },
    );

    return () => {
      linkSubscription.remove();
      notificationSubscription.remove();
    };
  }, []);

  return null;
}
