import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "@paseo:clawmuse-status-host-unbind-intents";
const RELAY_HOST_ID = /^[A-Za-z0-9_-]{16}$/;

/**
 * Ported from agent/mobile/src/status-saas/status-saas-host-unbind-intents.ts.
 *
 * Removing a host is two writes on two systems. The intent is recorded before
 * the local registry drops the host and only acted on once the host is really
 * gone, so a crash in between still unbinds on the next launch and an aborted
 * removal never revokes a host the user kept.
 */
export interface ClawMuseStatusHostUnbindIntent {
  baseUrl: string;
  installationId: string;
  serverId: string;
  relayHostId: string;
  ready: boolean;
}

let mutationQueue: Promise<void> = Promise.resolve();
const listeners = new Set<() => void>();

function intentKey(intent: ClawMuseStatusHostUnbindIntent): string {
  return JSON.stringify([
    intent.baseUrl,
    intent.installationId,
    intent.serverId,
    intent.relayHostId,
  ]);
}

export function parseClawMuseStatusHostUnbindIntents(
  value: string | null,
): ClawMuseStatusHostUnbindIntent[] {
  if (!value) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object") {
    return [];
  }
  const record = parsed as Record<string, unknown>;
  if (record.version !== 1 || !Array.isArray(record.intents)) {
    return [];
  }
  return record.intents.flatMap((intent) => {
    if (!intent || typeof intent !== "object") {
      return [];
    }
    const candidate = intent as Record<string, unknown>;
    if (
      typeof candidate.baseUrl !== "string" ||
      candidate.baseUrl.length === 0 ||
      typeof candidate.installationId !== "string" ||
      candidate.installationId.length === 0 ||
      typeof candidate.serverId !== "string" ||
      candidate.serverId.length === 0 ||
      typeof candidate.relayHostId !== "string" ||
      !RELAY_HOST_ID.test(candidate.relayHostId) ||
      typeof candidate.ready !== "boolean"
    ) {
      return [];
    }
    return [
      {
        baseUrl: candidate.baseUrl,
        installationId: candidate.installationId,
        serverId: candidate.serverId,
        relayHostId: candidate.relayHostId,
        ready: candidate.ready,
      },
    ];
  });
}

async function readIntents(): Promise<ClawMuseStatusHostUnbindIntent[]> {
  return parseClawMuseStatusHostUnbindIntents(await AsyncStorage.getItem(STORAGE_KEY));
}

function mutateIntents(
  update: (current: ClawMuseStatusHostUnbindIntent[]) => ClawMuseStatusHostUnbindIntent[],
): Promise<void> {
  const operation = mutationQueue.then(async () => {
    const next = update(await readIntents());
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, intents: next }));
    for (const listener of listeners) {
      listener();
    }
    return;
  });
  mutationQueue = operation.catch(() => {});
  return operation;
}

export async function loadClawMuseStatusHostUnbindIntents(): Promise<
  ClawMuseStatusHostUnbindIntent[]
> {
  await mutationQueue;
  return readIntents();
}

export function prepareClawMuseStatusHostUnbindIntent(
  intent: Omit<ClawMuseStatusHostUnbindIntent, "ready">,
): Promise<ClawMuseStatusHostUnbindIntent> {
  const prepared: ClawMuseStatusHostUnbindIntent = { ...intent, ready: false };
  return mutateIntents((current) => [
    ...current.filter((candidate) => intentKey(candidate) !== intentKey(prepared)),
    prepared,
  ]).then(() => prepared);
}

export function markClawMuseStatusHostUnbindReady(serverId: string): Promise<void> {
  return mutateIntents((current) =>
    current.map((candidate) =>
      candidate.serverId === serverId ? { ...candidate, ready: true } : candidate,
    ),
  );
}

export function removeClawMuseStatusHostUnbindIntent(
  intent: ClawMuseStatusHostUnbindIntent,
): Promise<void> {
  return mutateIntents((current) =>
    current.filter((candidate) => intentKey(candidate) !== intentKey(intent)),
  );
}

export function subscribeClawMuseStatusHostUnbindIntents(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
