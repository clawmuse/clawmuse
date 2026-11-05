import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useShallow } from "zustand/shallow";
import { z } from "zod";
import { createValidatedPersistStorage } from "@/storage/validated-persist-storage";
import type { OutboxEntryStore } from "./delivery";
import { OutboxEntrySchema, type OutboxEntry } from "./model";

interface OutboxStoreState {
  entries: OutboxEntry[];
}

const OutboxPersistedStateSchema = z.strictObject({ entries: z.array(OutboxEntrySchema) });

// Persisted so a prompt typed in a dead zone survives the OS killing the app
// before the network returns; restore resends it with the same client message id.
const useOutboxStore = create<OutboxStoreState>()(
  persist((): OutboxStoreState => ({ entries: [] }), {
    name: "paseo-message-outbox",
    version: 1,
    storage: createValidatedPersistStorage(AsyncStorage, OutboxPersistedStateSchema),
  }),
);

export const persistedOutboxEntries: OutboxEntryStore = {
  list: () => useOutboxStore.getState().entries,
  put: (entry) =>
    useOutboxStore.setState((state) => {
      const index = state.entries.findIndex(
        (existing) => existing.clientMessageId === entry.clientMessageId,
      );
      if (index < 0) return { entries: [...state.entries, entry] };
      const entries = state.entries.slice();
      entries[index] = entry;
      return { entries };
    }),
  remove: (clientMessageId) =>
    useOutboxStore.setState((state) => {
      const entries = state.entries.filter((entry) => entry.clientMessageId !== clientMessageId);
      return entries.length === state.entries.length ? state : { entries };
    }),
};

export function whenOutboxHydrated(): Promise<void> {
  if (useOutboxStore.persist.hasHydrated()) return Promise.resolve();
  return new Promise((resolve) => {
    const unsubscribe = useOutboxStore.persist.onFinishHydration(() => {
      unsubscribe();
      resolve();
    });
  });
}

export function useAgentOutboxEntries(serverId: string, agentId: string): OutboxEntry[] {
  return useOutboxStore(
    useShallow((state) =>
      state.entries.filter((entry) => entry.serverId === serverId && entry.agentId === agentId),
    ),
  );
}
