import { randomUUID } from "node:crypto";
import type { z } from "zod";
import type { AgentArchiveReview } from "@getpaseo/protocol/messages";
import type { AssistantTaskDetail, VoiceAssistantHost } from "./voice/voice-assistant.js";
import { TaskDecisionSchema } from "./voice/task-review.js";

interface Options {
  host: Pick<VoiceAssistantHost, "getTask" | "listTasks" | "archiveTask">;
  evaluate(task: AssistantTaskDetail): Promise<z.infer<typeof TaskDecisionSchema>>;
  canStopRuntime?(agentId: string): Promise<boolean>;
  now?: () => number;
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
    const keep = (reason: string): AgentArchiveReview => ({
      agentId,
      eligible: false,
      reason,
      token: null,
    });
    const task = await options.host.getTask(agentId);
    const retained = retentionReason(task);
    if (retained) return keep(retained);
    const tasks = await options.host.listTasks();
    if (tasks.some((child) => child.parentAgentId === agentId)) return keep("children");
    if (options.canStopRuntime && !(await options.canStopRuntime(agentId)))
      return keep("background_work");

    const decision = TaskDecisionSchema.parse(await options.evaluate(task));
    if (decision.decision !== "completed") return keep(decision.nextStep || decision.decision);
    const evidence = decision.completionEvidence.trim();
    if (!task.lastMessage?.includes(evidence)) return keep("missing_evidence");
    const current = await options.host.getTask(agentId);
    if (current.revision !== task.revision) return keep("changed");

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
    return { agentId, eligible: true, reason: evidence, token };
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
