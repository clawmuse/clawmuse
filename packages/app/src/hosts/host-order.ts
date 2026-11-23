import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useLocalDaemonServerId } from "@/hooks/use-is-local-daemon";
import { useVisibleHosts } from "@/runtime/host-runtime";
import { createValidatedPersistStorage } from "@/storage/validated-persist-storage";
import type { HostProfile } from "@/types/host-connection";

export interface HostOrderDrop {
  moved: string;
  after: readonly string[];
}

export interface AccountHostOrderSyncInput {
  accountServerIds: readonly string[];
  orderedAccountServerIds: readonly string[];
}

const HOST_ORDER_STORAGE_KEY = "host-order";
const HOST_ORDER_STORE_VERSION = 1;

const HostOrderPersistedStateSchema = z.strictObject({
  hostOrder: z.array(z.string()).default([]),
  pendingAccountOrder: z.array(z.string()).nullable().default(null),
});

type HostOrderPersistedState = z.infer<typeof HostOrderPersistedStateSchema>;

interface HostOrderStoreState extends HostOrderPersistedState {
  setHostOrder: (keys: readonly string[]) => void;
  arrangeHosts: (drop: HostOrderDrop) => string[];
  syncAccountOrder: (input: AccountHostOrderSyncInput) => void;
  setPendingAccountOrder: (ids: readonly string[] | null) => void;
  removeHostsFromOrder: (serverIds: readonly string[]) => void;
}

function dedupeOrderKeys(keys: readonly string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const raw of keys) {
    const key = raw.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(key);
  }
  return deduped;
}

function areArraysEqual(left: readonly string[] | null, right: readonly string[] | null): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

/**
 * Deterministic fallback order for hosts that have not been explicitly arranged.
 * On desktop, the built-in local daemon leads; otherwise hosts sort by label then serverId
 * so independent clients agree regardless of connection or discovery timing.
 */
export function compareDefaultHosts(
  a: { serverId: string; label?: string },
  b: { serverId: string; label?: string },
  localServerId: string | null,
): number {
  if (a.serverId === b.serverId) return 0;
  if (localServerId) {
    if (a.serverId === localServerId) return -1;
    if (b.serverId === localServerId) return 1;
  }
  const aLabel = a.label?.trim() || a.serverId;
  const bLabel = b.label?.trim() || b.serverId;
  return (
    aLabel.localeCompare(bLabel, undefined, { numeric: true, sensitivity: "base" }) ||
    aLabel.localeCompare(bLabel) ||
    a.serverId.localeCompare(b.serverId)
  );
}

/**
 * Sorts hosts using the saved manual `hostOrder` and deterministic fallback rules.
 *
 * Option B local-first policy: before `localServerId` has been explicitly placed in `hostOrder`,
 * it defaults to index 0; once `localServerId` appears in `hostOrder`, its saved position wins
 * so cross-device custom ordering (e.g. moving a remote server ahead of `localServerId`) is
 * preserved identically across desktop and phone.
 */
export function orderHosts<T extends { serverId: string; label?: string }>(
  hosts: readonly T[],
  input: { hostOrder: readonly string[]; localServerId: string | null },
): T[] {
  if (hosts.length <= 1) {
    return hosts as T[];
  }
  const dedupedOrder = dedupeOrderKeys(input.hostOrder);
  const rank = new Map(dedupedOrder.map((serverId, index) => [serverId, index]));
  const pinUnarrangedLocalFirst = Boolean(input.localServerId && !rank.has(input.localServerId));

  const sorted = [...hosts].sort((a, b) => {
    if (pinUnarrangedLocalFirst) {
      if (a.serverId === input.localServerId && b.serverId !== input.localServerId) return -1;
      if (b.serverId === input.localServerId && a.serverId !== input.localServerId) return 1;
    }
    const rankA = rank.get(a.serverId);
    const rankB = rank.get(b.serverId);
    if (rankA !== undefined && rankB !== undefined) return rankA - rankB;
    if (rankA !== undefined) return -1;
    if (rankB !== undefined) return 1;
    return compareDefaultHosts(a, b, input.localServerId);
  });

  if (sorted.every((host, index) => host === hosts[index])) {
    return hosts as T[];
  }
  return sorted;
}

/**
 * Updates `currentOrder` after moving one host in a visible list.
 * Hidden hosts already in `currentOrder` retain their relative positions.
 */
export function arrangeHostOrder(
  currentOrder: readonly string[],
  { moved, after }: HostOrderDrop,
): string[] {
  const dedupedCurrent = dedupeOrderKeys(currentOrder);
  const dedupedAfter = dedupeOrderKeys(after);
  const normalizedMoved = moved.trim();
  if (!normalizedMoved || !dedupedAfter.includes(normalizedMoved)) {
    return dedupedCurrent;
  }

  const arranged = new Set([...dedupedCurrent, normalizedMoved]);
  const rest = [
    ...dedupedCurrent.filter((id) => id !== normalizedMoved),
    ...dedupedAfter.filter((id) => !arranged.has(id)),
  ];
  const index = dedupedAfter.indexOf(normalizedMoved);
  const successor = dedupedAfter[index + 1];
  let at: number;
  if (successor !== undefined) {
    at = rest.indexOf(successor);
  } else if (index > 0) {
    at = rest.indexOf(dedupedAfter[index - 1]!) + 1;
  } else {
    at = 0;
  }
  rest.splice(Math.max(0, at), 0, normalizedMoved);
  return rest;
}

/**
 * Applies the account directory's explicit order to `currentOrder` while keeping non-account
 * hosts (manual direct/SSH hosts or Cloud Space) in their relative slots.
 */
export function mergeAccountHostOrder(
  currentOrder: readonly string[],
  input: AccountHostOrderSyncInput,
): string[] {
  const dedupedCurrent = dedupeOrderKeys(currentOrder);
  const accountSet = new Set(dedupeOrderKeys(input.accountServerIds));
  const orderedAccount = dedupeOrderKeys(input.orderedAccountServerIds).filter((id) =>
    accountSet.has(id),
  );
  if (orderedAccount.length === 0) {
    return dedupedCurrent;
  }

  const queue = [...orderedAccount];
  const merged: string[] = [];
  for (const id of dedupedCurrent) {
    if (!accountSet.has(id)) {
      merged.push(id);
    } else if (queue.length > 0) {
      merged.push(queue.shift()!);
    }
  }
  merged.push(...queue);
  return dedupeOrderKeys(merged);
}

export const useHostOrderStore = create<HostOrderStoreState>()(
  persist(
    (set, get) => ({
      hostOrder: [],
      pendingAccountOrder: null,
      setHostOrder: (keys) => {
        const next = dedupeOrderKeys(keys);
        set((state) => (areArraysEqual(state.hostOrder, next) ? state : { hostOrder: next }));
      },
      arrangeHosts: (drop) => {
        const next = arrangeHostOrder(get().hostOrder, drop);
        set((state) => (areArraysEqual(state.hostOrder, next) ? state : { hostOrder: next }));
        return next;
      },
      syncAccountOrder: (input) => {
        set((state) => {
          const next = mergeAccountHostOrder(state.hostOrder, input);
          return areArraysEqual(state.hostOrder, next) ? state : { hostOrder: next };
        });
      },
      setPendingAccountOrder: (ids) => {
        const next = ids === null ? null : dedupeOrderKeys(ids);
        set((state) =>
          areArraysEqual(state.pendingAccountOrder, next) ? state : { pendingAccountOrder: next },
        );
      },
      removeHostsFromOrder: (serverIds) => {
        const removed = new Set(dedupeOrderKeys(serverIds));
        if (removed.size === 0) return;
        set((state) => {
          const nextOrder = state.hostOrder.filter((id) => !removed.has(id));
          const nextPending = state.pendingAccountOrder
            ? state.pendingAccountOrder.filter((id) => !removed.has(id))
            : null;
          const normalizedPending = nextPending && nextPending.length === 0 ? null : nextPending;
          if (
            areArraysEqual(state.hostOrder, nextOrder) &&
            areArraysEqual(state.pendingAccountOrder, normalizedPending)
          ) {
            return state;
          }
          return {
            hostOrder: nextOrder,
            pendingAccountOrder: normalizedPending,
          };
        });
      },
    }),
    {
      name: HOST_ORDER_STORAGE_KEY,
      version: HOST_ORDER_STORE_VERSION,
      storage: createValidatedPersistStorage(AsyncStorage, HostOrderPersistedStateSchema),
      partialize: (state) => ({
        hostOrder: state.hostOrder,
        pendingAccountOrder: state.pendingAccountOrder,
      }),
    },
  ),
);

export function useHostOrderHydrated(): boolean {
  const [hasHydrated, setHasHydrated] = useState(() => useHostOrderStore.persist.hasHydrated());
  useEffect(() => {
    if (useHostOrderStore.persist.hasHydrated()) {
      setHasHydrated(true);
      return;
    }
    return useHostOrderStore.persist.onFinishHydration(() => {
      setHasHydrated(true);
    });
  }, []);
  return hasHydrated;
}

export function useOrderedHosts<T extends { serverId: string; label?: string }>(
  hosts: readonly T[],
): T[] {
  const hostOrder = useHostOrderStore((state) => state.hostOrder);
  const localServerId = useLocalDaemonServerId();
  return useMemo(
    () => orderHosts(hosts, { hostOrder, localServerId }),
    [hosts, hostOrder, localServerId],
  );
}

export function useOrderedVisibleHosts(): HostProfile[] {
  return useOrderedHosts(useVisibleHosts());
}
