import type { AgentLiveActivityRemoteStatusCapability } from "@clawmuse/expo-agent-live-activity";

// Ported from agent/mobile/src/live-activity/remote-status-capability.ts.
export function supportsRemoteStatusLiveActivity(
  capability: AgentLiveActivityRemoteStatusCapability | null,
): boolean {
  return (capability?.schemaVersion ?? 0) >= 1 && capability?.pushToStartSupported === true;
}

/** The native module is present and speaks the schema, push-to-start or not. */
export function supportsClawMuseLiveActivity(
  capability: AgentLiveActivityRemoteStatusCapability | null,
): boolean {
  return (capability?.schemaVersion ?? 0) >= 1;
}
