import { randomUUID } from "node:crypto";
import type { z } from "zod";
import type { AgentArchiveReview, AgentArchiveReviewDecision } from "@getpaseo/protocol/messages";
import type { AssistantTaskDetail, VoiceAssistantHost } from "./voice/voice-assistant.js";
import { TaskDecisionSchema } from "./voice/task-review.js";

export type AgentArchiveEvaluation = z.infer<typeof TaskDecisionSchema> & {
  evaluatedBy?: { provider: string; model: string };
};

interface Options {
  host: Pick<VoiceAssistantHost, "getTask" | "listTasks" | "archiveTask">;
  evaluate(task: AssistantTaskDetail): Promise<AgentArchiveEvaluation>;
  canStopRuntime?(agentId: string): Promise<boolean>;
  now?: () => number;
}

function excerpt(text: string | null | undefined, maxLength: number): string | undefined {
  if (!text) return undefined;
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (!collapsed) return undefined;
  return collapsed.length <= maxLength ? collapsed : `${collapsed.slice(0, maxLength - 1)}…`;
}

function retentionReason(task: AssistantTaskDetail): string | null {
  if (task.status !== "idle" && task.status !== "closed") return "active";
  if (task.pendingPermissions.length || task.attention === "permission") return "permission";
  if (task.awaitingAgentReply) return "awaiting_reply";
  if (task.error || task.attention === "error" || task.providerUnavailable) return "error";
  if (!task.lastUserMessage || !task.lastMessage) return "missing_context";
  return null;
}

// Reviews belong to the requesting session. The client cannot supply its own
// completion evidence or reuse an approval for a different conversation revision.
export function createAgentArchiveReview(options: Options) {
  const approvals = new Map<
    string,
    {
      agentId: string;
      revision: string;
      evidence: string;
      expiresAt: number;
    }
  >();
  const now = options.now ?? Date.now;

  async function review(agentId: string): Promise<AgentArchiveReview> {
    const startedAt = now();
    const task = await options.host.getTask(agentId);
    const latestUserMessage = excerpt(task.lastUserMessage, 240);
    const latestReply = excerpt(task.lastMessage, 360);
    const meta = (
      decision: AgentArchiveReviewDecision,
      evaluatedBy?: { provider: string; model: string },
    ): Partial<AgentArchiveReview> => ({
      decision,
      durationMs: Math.max(0, now() - startedAt),
      agentStatus: task.status,
      ...(evaluatedBy ? { provider: evaluatedBy.provider, model: evaluatedBy.model } : {}),
      ...(latestUserMessage ? { latestUserMessage } : {}),
      ...(latestReply ? { latestReply } : {}),
    });
    const keep = (
      reason: string,
      decision: AgentArchiveReviewDecision = "blocked",
      evaluatedBy?: { provider: string; model: string },
    ): AgentArchiveReview => ({
      agentId,
      eligible: false,
      reason,
      token: null,
      ...meta(decision, evaluatedBy),
    });

    const retained = retentionReason(task);
    if (retained) return keep(retained);
    const tasks = await options.host.listTasks();
    if (tasks.some((child) => child.parentAgentId === agentId)) return keep("children");
    if (options.canStopRuntime && !(await options.canStopRuntime(agentId)))
      return keep("background_work");

    const { evaluatedBy, ...rawDecision } = await options.evaluate(task);
    const decision = TaskDecisionSchema.parse(rawDecision);
    if (decision.decision !== "completed") {
      return keep(decision.nextStep || decision.decision, decision.decision, evaluatedBy);
    }
    const evidence = decision.completionEvidence.trim();
    if (!task.lastMessage?.includes(evidence)) {
      return keep("missing_evidence", "blocked", evaluatedBy);
    }
    const current = await options.host.getTask(agentId);
    if (current.revision !== task.revision) {
      return keep("changed", "blocked", evaluatedBy);
    }

    for (const [token, approval] of approvals) {
      if (approval.expiresAt <= now() || approval.agentId === agentId) approvals.delete(token);
    }
    if (approvals.size >= 256) approvals.delete(approvals.keys().next().value!);
    const token = randomUUID();
    approvals.set(token, {
      agentId,
      revision: task.revision,
      evidence,
      expiresAt: now() + 600_000,
    });
    return {
      agentId,
      eligible: true,
      reason: evidence,
      token,
      ...meta("completed", evaluatedBy),
    };
  }

  async function archive(agentId: string, token: string) {
    const approval = approvals.get(token);
    if (!approval || approval.agentId !== agentId || approval.expiresAt <= now()) {
      throw new Error("Archive review expired; scan again");
    }
    approvals.delete(token);
    return options.host.archiveTask(agentId, approval.revision, approval.evidence);
  }

  return { review, archive };
}
