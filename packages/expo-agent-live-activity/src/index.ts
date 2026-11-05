import type { EventSubscription } from "expo-modules-core";
import { requireOptionalNativeModule } from "expo-modules-core";
import { Platform } from "react-native";

export interface AgentLiveActivityUsageWindow {
  usedPercent: number;
  windowMinutes: number;
  /** Epoch seconds. */
  resetsAt?: number | null;
  unlimited?: boolean;
}

export interface AgentLiveActivityUsage {
  provider: string;
  label?: string;
  session?: AgentLiveActivityUsageWindow | null;
  weekly?: AgentLiveActivityUsageWindow | null;
}

export interface AgentLiveActivityNativePayload {
  id: string;
  phase: "attention" | "error" | "completed" | "working" | "monitoring" | "unverifiable";
  title: string;
  status: string;
  compact: string;
  detail?: string;
  workspace?: string;
  activeCount: number;
  attentionCount: number;
  runningCount: number;
  needsActionCount: number;
  completedUnreadCount: number;
  unverifiableCount: number;
  connectionState: "live" | "unverifiable";
  revision: number;
  updatedAt: number;
  deepLink: string;
  usages?: AgentLiveActivityUsage[];
}

export interface AgentLiveActivitySyncResult {
  supported: boolean;
  enabled: boolean;
  activityId?: string;
  pushToken?: string;
}

export interface AgentLiveActivityPushToken {
  activityId: string;
  generation: string;
  pushToken: string;
}

export interface AgentLiveActivityPushTokenSnapshot {
  pushToStartToken?: string;
  /** The retained live card, including while its push token is still pending. */
  activityId?: string;
  activities: AgentLiveActivityPushToken[];
}

export interface AgentLiveActivityRemoteStatusCapability {
  schemaVersion: number;
  pushToStartSupported?: boolean;
}

type PushTokenEvent = AgentLiveActivityPushToken;
interface PushToStartTokenEvent {
  pushToStartToken: string;
}

interface NativeAgentLiveActivityModule {
  getAvailability(): { supported: boolean; enabled: boolean };
  getRemoteStatusCapability?(): AgentLiveActivityRemoteStatusCapability;
  getPushTokenSnapshot?(): Promise<AgentLiveActivityPushTokenSnapshot>;
  sync(payload: AgentLiveActivityNativePayload): Promise<AgentLiveActivitySyncResult>;
  end(payload?: AgentLiveActivityNativePayload): Promise<void>;
  endLegacyActivities?(): Promise<void>;
  resetRemoteStatusSession?(restartIfPresent: boolean): Promise<AgentLiveActivitySyncResult>;
  updateWidgetSnapshot?(json: string): Promise<void>;
  setWidgetCredentials?(baseUrl: string | null, token: string | null): Promise<void>;
  addListener(
    event: "onAgentLiveActivityPushToken",
    listener: (event: PushTokenEvent) => void,
  ): EventSubscription;
  addListener(
    event: "onAgentLiveActivityPushToStartToken",
    listener: (event: PushToStartTokenEvent) => void,
  ): EventSubscription;
}

/**
 * The name must match `Name("ClawMuseAgentLiveActivity")` in
 * `ios/ClawMuseAgentLiveActivityModule.swift`; see the fixed-names table in
 * `docs/clawmuse-status.md`.
 */
const nativeModule =
  Platform.OS === "ios"
    ? requireOptionalNativeModule<NativeAgentLiveActivityModule>("ClawMuseAgentLiveActivity")
    : null;

export function getAgentLiveActivityAvailability(): { supported: boolean; enabled: boolean } {
  return nativeModule?.getAvailability() ?? { supported: false, enabled: false };
}

export function getAgentLiveActivityRemoteStatusCapability(): AgentLiveActivityRemoteStatusCapability | null {
  const capability = nativeModule?.getRemoteStatusCapability?.();
  return capability && Number.isInteger(capability.schemaVersion) ? capability : null;
}

export async function getAgentLiveActivityPushTokenSnapshot(): Promise<AgentLiveActivityPushTokenSnapshot> {
  return (await nativeModule?.getPushTokenSnapshot?.()) ?? { activities: [] };
}

export async function syncAgentLiveActivity(
  payload: AgentLiveActivityNativePayload,
): Promise<AgentLiveActivitySyncResult> {
  return nativeModule?.sync(payload) ?? { supported: false, enabled: false };
}

export async function endAgentLiveActivity(
  finalPayload?: AgentLiveActivityNativePayload,
): Promise<void> {
  await nativeModule?.end(finalPayload);
}

export async function endLegacyAgentLiveActivities(): Promise<void> {
  await nativeModule?.endLegacyActivities?.();
}

export async function resetAgentLiveActivityRemoteStatusSession(
  restartIfPresent: boolean,
): Promise<AgentLiveActivitySyncResult> {
  return (
    (await nativeModule?.resetRemoteStatusSession?.(restartIfPresent)) ?? {
      supported: false,
      enabled: false,
    }
  );
}

export interface AgentWidgetTask {
  repo: string;
  title: string;
  phase: string;
  /** Epoch seconds. */
  changedAt: number;
  color?: string;
}

/** What the home-screen widget renders; the app writes it into the App Group. */
export interface AgentWidgetSnapshot {
  /** Epoch seconds. */
  updatedAt: number;
  connectionState: "live" | "unverifiable";
  headline?: string;
  runningCount: number;
  needsActionCount: number;
  completedUnreadCount: number;
  unverifiableCount: number;
  usages: AgentLiveActivityUsage[];
  tasks: AgentWidgetTask[];
}

export async function updateAgentWidgetSnapshot(snapshot: AgentWidgetSnapshot): Promise<void> {
  await nativeModule?.updateWidgetSnapshot?.(JSON.stringify(snapshot));
}

export async function setAgentWidgetCredentials(
  credentials: { baseUrl: string; token: string } | null,
): Promise<void> {
  await nativeModule?.setWidgetCredentials?.(
    credentials?.baseUrl ?? null,
    credentials?.token ?? null,
  );
}

export function addAgentLiveActivityPushTokenListener(
  listener: (event: PushTokenEvent) => void,
): EventSubscription | null {
  return nativeModule?.addListener("onAgentLiveActivityPushToken", listener) ?? null;
}

export function addAgentLiveActivityPushToStartTokenListener(
  listener: (event: PushToStartTokenEvent) => void,
): EventSubscription | null {
  return nativeModule?.addListener("onAgentLiveActivityPushToStartToken", listener) ?? null;
}
