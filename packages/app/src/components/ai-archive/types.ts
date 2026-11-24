import type { AgentArchiveReview } from "@getpaseo/protocol/messages";
import type { AggregatedAgent } from "@/hooks/use-aggregated-agents";
import type { HostRuntimeConnectionStatus } from "@/runtime/host-runtime";
import type { EmptyWorkspaceArchiveOutcome } from "./empty-workspace-archive";

export type ReviewPhase =
  | "idle"
  | "pending"
  | "reviewing"
  | "ready"
  | "kept"
  | "archiving"
  | "archived"
  | "failed";

export type ArchiveStatusFilter = "all" | "ready" | "kept" | "archived";

export interface AgentLiveMeta {
  model: string | null;
  lastError: string | null;
  parentAgentId: string | null;
  childCount: number;
}

export interface ReviewEntry {
  phase: ReviewPhase;
  review?: AgentArchiveReview;
  reason?: string;
  archivedAt?: string;
  archivedBy?: "ai" | "manual";
  workspaceOutcome?: EmptyWorkspaceArchiveOutcome;
}

export interface ArchiveRowItem {
  key: string;
  agent: AggregatedAgent;
  meta: AgentLiveMeta;
  entry: ReviewEntry;
  archivedSnapshot?: boolean;
}

export interface HostArchiveInfo {
  serverId: string;
  label: string;
  isConnected: boolean;
  connectionStatus: HostRuntimeConnectionStatus;
  supportsAiArchive: boolean;
  supportsModelConfig: boolean;
  canWriteWorkspace: boolean;
  canManageDaemon: boolean;
  openCount: number;
}

export interface LiveRiskFlags {
  isRunning: boolean;
  needsPermission: boolean;
  hasError: boolean;
  hasBackgroundWork: boolean;
  hasChildren: boolean;
  needsConfirmForManualArchive: boolean;
}

export function keyOfAgent(agent: Pick<AggregatedAgent, "serverId" | "id">): string {
  return `${agent.serverId}:${agent.id}`;
}

export function deriveLiveRiskFlags(agent: AggregatedAgent, meta: AgentLiveMeta): LiveRiskFlags {
  const isRunning =
    agent.status === "running" || agent.status === "initializing" || agent.turn.phase === "open";
  const needsPermission =
    (agent.pendingPermissionCount ?? 0) > 0 || agent.attentionReason === "permission";
  const hasError =
    agent.status === "error" || agent.attentionReason === "error" || Boolean(meta.lastError);
  const hasBackgroundWork = (agent.backgroundWork?.count ?? 0) > 0;
  const hasChildren = meta.childCount > 0;
  return {
    isRunning,
    needsPermission,
    hasError,
    hasBackgroundWork,
    hasChildren,
    needsConfirmForManualArchive: isRunning || needsPermission || hasBackgroundWork || hasChildren,
  };
}
