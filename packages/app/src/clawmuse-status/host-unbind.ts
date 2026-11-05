import {
  loadClawMuseStatusHostUnbindIntents,
  removeClawMuseStatusHostUnbindIntent,
  type ClawMuseStatusHostUnbindIntent,
} from "./host-unbind-intents";

export interface ProcessClawMuseStatusHostUnbindsInput {
  baseUrl: string;
  installationId: string | null;
  currentServerIds: ReadonlySet<string>;
  unbindHost: (relayHostId: string, serverId: string) => Promise<number>;
  loadIntents?: () => Promise<ClawMuseStatusHostUnbindIntent[]>;
  removeIntent?: (intent: ClawMuseStatusHostUnbindIntent) => Promise<void>;
}

/**
 * Ported from agent/mobile/src/status-saas/status-saas-host-unbind.ts.
 *
 * A host that is back in the registry was never really removed — its intent is
 * dropped instead of revoking a binding the user still wants. Only a host that
 * is gone locally is unbound at the service.
 */
export async function processClawMuseStatusHostUnbinds(
  input: ProcessClawMuseStatusHostUnbindsInput,
): Promise<void> {
  const loadIntents = input.loadIntents ?? loadClawMuseStatusHostUnbindIntents;
  const removeIntent = input.removeIntent ?? removeClawMuseStatusHostUnbindIntent;
  const intents = (await loadIntents()).filter((intent) => intent.baseUrl === input.baseUrl);
  if (intents.length === 0 || !input.installationId) {
    return;
  }
  for (const intent of intents) {
    if (intent.installationId !== input.installationId) {
      continue;
    }
    if (input.currentServerIds.has(intent.serverId)) {
      if (intent.ready) {
        await removeIntent(intent);
      }
      continue;
    }
    await input.unbindHost(intent.relayHostId, intent.serverId);
    await removeIntent(intent);
  }
}
