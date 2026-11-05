// Ported from agent/mobile/src/status-saas/status-saas-summary.ts.
import { parseGoalCounts } from "./goals/parse";
import type { GoalCounts } from "./goals/types";

export interface ClawMuseStatusHostSummary {
  hostId: string;
  relayHostId: string;
  displayName: string | null;
  connectivity: "live" | "unverifiable";
  observedAt: string;
  leaseExpiresAt: string;
  runningCount: number;
  needsActionCount: number;
  completedUnreadCount: number;
  unverifiableCount: number;
}

export interface ClawMuseStatusUsageWindow {
  usedPercent: number;
  windowMinutes: number;
  /** Unix ms, or null when the service did not report a reset time. */
  resetsAt: number | null;
  unlimited: boolean;
}

/** One plan's consumption: the hosts report theirs, the service polls the rest. */
export interface ClawMuseStatusUsage {
  provider: string;
  label: string | null;
  session: ClawMuseStatusUsageWindow | null;
  weekly: ClawMuseStatusUsageWindow | null;
  updatedAt: number | null;
}

export interface ClawMuseStatusSummary {
  connectivity: "live" | "unverifiable";
  runningCount: number;
  needsActionCount: number;
  completedUnreadCount: number;
  unverifiableCount: number;
  observedAt: string;
  usages: ClawMuseStatusUsage[];
  hosts: ClawMuseStatusHostSummary[];
  /** Null from a service that predates goals. */
  goals: GoalCounts | null;
}

export type ClawMuseStatusSummarySnapshot = ClawMuseStatusSummary & { receivedAt: number };

let currentSummary: ClawMuseStatusSummarySnapshot | null = null;
const listeners = new Set<() => void>();

function count(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid status service response: ${key}`);
  }
  return value;
}

function timestamp(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error(`Invalid status service response: ${key}`);
  }
  return value;
}

function parseHost(value: unknown): ClawMuseStatusHostSummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid status service response: hosts");
  }
  const record = value as Record<string, unknown>;
  if (typeof record.hostId !== "string" || record.hostId.length === 0) {
    throw new Error("Invalid status service response: hostId");
  }
  if (typeof record.relayHostId !== "string" || !/^[A-Za-z0-9_-]{16}$/.test(record.relayHostId)) {
    throw new Error("Invalid status service response: relayHostId");
  }
  if (record.connectivity !== "live" && record.connectivity !== "unverifiable") {
    throw new Error("Invalid status service response: host connectivity");
  }
  return {
    hostId: record.hostId,
    relayHostId: record.relayHostId,
    displayName:
      typeof record.displayName === "string" && record.displayName.length > 0
        ? record.displayName
        : null,
    connectivity: record.connectivity,
    observedAt: timestamp(record, "observedAt"),
    leaseExpiresAt: timestamp(record, "leaseExpiresAt"),
    runningCount: count(record, "runningCount"),
    needsActionCount: count(record, "needsActionCount"),
    completedUnreadCount: count(record, "completedUnreadCount"),
    unverifiableCount: count(record, "unverifiableCount"),
  };
}

function parseUsageWindow(value: unknown): ClawMuseStatusUsageWindow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const usedPercent = record.usedPercent;
  const windowMinutes = record.windowMinutes;
  if (
    typeof usedPercent !== "number" ||
    !Number.isFinite(usedPercent) ||
    typeof windowMinutes !== "number" ||
    !(windowMinutes > 0)
  ) {
    return null;
  }
  const resetsAt = typeof record.resetsAt === "string" ? Date.parse(record.resetsAt) : Number.NaN;
  return {
    usedPercent: Math.max(0, Math.min(100, usedPercent)),
    windowMinutes,
    resetsAt: Number.isFinite(resetsAt) ? resetsAt : null,
    unlimited: record.unlimited === true,
  };
}

// Usage is additive and optional — a malformed entry is dropped rather than
// failing the whole summary, which also carries the task counts.
function parseUsages(value: unknown): ClawMuseStatusUsage[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const usages: ClawMuseStatusUsage[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }
    const record = entry as Record<string, unknown>;
    if (typeof record.provider !== "string" || record.provider.length === 0) {
      continue;
    }
    const updatedAt =
      typeof record.updatedAt === "string" ? Date.parse(record.updatedAt) : Number.NaN;
    usages.push({
      provider: record.provider,
      label: typeof record.label === "string" && record.label.length > 0 ? record.label : null,
      session: parseUsageWindow(record.session),
      weekly: parseUsageWindow(record.weekly),
      updatedAt: Number.isFinite(updatedAt) ? updatedAt : null,
    });
  }
  return usages;
}

export function parseClawMuseStatusSummary(value: unknown): ClawMuseStatusSummary {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid status service summary response");
  }
  const record = value as Record<string, unknown>;
  const connectivity = record.connectivity;
  if (connectivity !== "live" && connectivity !== "unverifiable") {
    throw new Error("Invalid status service response: connectivity");
  }
  if (record.hosts !== undefined && !Array.isArray(record.hosts)) {
    throw new Error("Invalid status service response: hosts");
  }
  return {
    connectivity,
    runningCount: count(record, "runningCount"),
    needsActionCount: count(record, "needsActionCount"),
    completedUnreadCount: count(record, "completedUnreadCount"),
    unverifiableCount: count(record, "unverifiableCount"),
    observedAt: timestamp(record, "observedAt"),
    usages: parseUsages(record.usages),
    hosts: (record.hosts ?? []).map(parseHost),
    goals: parseGoalCounts(record.goals),
  };
}

export function publishClawMuseStatusSummary(
  summary: ClawMuseStatusSummary | null,
  receivedAt = Date.now(),
): void {
  currentSummary = summary ? { ...summary, receivedAt } : null;
  for (const listener of listeners) {
    listener();
  }
}

export function getClawMuseStatusSummarySnapshot(): ClawMuseStatusSummarySnapshot | null {
  return currentSummary;
}

/** A summary the phone could not refresh stops asserting live counts. */
export function ageClawMuseStatusSummary(
  summary: ClawMuseStatusSummarySnapshot | null,
  now: number,
  staleAfterMs: number,
): ClawMuseStatusSummarySnapshot | null {
  if (!summary || now - summary.receivedAt <= staleAfterMs) {
    return summary;
  }
  return {
    ...summary,
    connectivity: "unverifiable",
    runningCount: 0,
    needsActionCount: 0,
    unverifiableCount: summary.unverifiableCount + summary.runningCount + summary.needsActionCount,
    hosts: summary.hosts.map((host) => ({
      ...host,
      connectivity: "unverifiable",
      runningCount: 0,
      needsActionCount: 0,
      unverifiableCount: host.unverifiableCount + host.runningCount + host.needsActionCount,
    })),
  };
}

export function subscribeClawMuseStatusSummary(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
