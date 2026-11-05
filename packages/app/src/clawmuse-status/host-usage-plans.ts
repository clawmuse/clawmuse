import { useSyncExternalStore } from "react";
import type { ClawMuseUsageHostPlans } from "./usage-rows";

/**
 * Host usage cannot be read in a loop — `useHostUsage` is a hook — so
 * one probe component per online host publishes here and every surface (sidebar
 * card, settings card, widget snapshot) reads the same list.
 */
let entries: readonly ClawMuseUsageHostPlans[] = [];
const listeners = new Set<() => void>();

function notify(next: readonly ClawMuseUsageHostPlans[]): void {
  if (JSON.stringify(next) === JSON.stringify(entries)) {
    return;
  }
  entries = next;
  for (const listener of listeners) {
    listener();
  }
}

export function publishHostUsagePlans(entry: ClawMuseUsageHostPlans): void {
  const others = entries.filter((candidate) => candidate.serverId !== entry.serverId);
  notify([...others, entry].sort((left, right) => left.serverId.localeCompare(right.serverId)));
}

/** Drops hosts that went offline or left the registry. */
export function retainHostUsagePlans(serverIds: readonly string[]): void {
  const retained = new Set(serverIds);
  notify(entries.filter((entry) => retained.has(entry.serverId)));
}

export function getHostUsagePlansSnapshot(): readonly ClawMuseUsageHostPlans[] {
  return entries;
}

export function subscribeHostUsagePlans(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useHostUsagePlans(): readonly ClawMuseUsageHostPlans[] {
  return useSyncExternalStore(
    subscribeHostUsagePlans,
    getHostUsagePlansSnapshot,
    getHostUsagePlansSnapshot,
  );
}
