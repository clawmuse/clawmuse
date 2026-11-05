import { createHash } from "node:crypto";
import { getParentAgentIdFromLabels } from "@getpaseo/protocol/agent-labels";
import type { AgentSnapshotPayload } from "../../messages.js";
import type { AgentManager } from "../../agent/agent-manager.js";
import { curateAgentActivity } from "../../agent/activity-curator.js";
import type { AssistantTask, AssistantTaskDetail, VoiceAssistantHost } from "./voice-assistant.js";

interface Options {
  listAgents(): Promise<AgentSnapshotPayload[]>;
  getAgent(agentId: string): Promise<AgentSnapshotPayload | null>;
  assertPermission(permission: "workspace.read" | "workspace.write"): void;
  manager: Pick<AgentManager, "readAgentActivity" | "getLastAssistantMessage" | "subscribe">;
  sendMessage(agentId: string, message: string): Promise<void>;
  archive(
    agentId: string,
    expectedUpdatedAt: string,
    signal?: AbortSignal,
  ): Promise<{ agentId: string; archivedAt: string }>;
}

function taskFromSnapshot(agent: AgentSnapshotPayload): AssistantTask {
  return {
    id: agent.id,
    title: agent.title ?? agent.id,
    status: agent.status,
    attention: agent.requiresAttention ? (agent.attentionReason ?? null) : null,
    updatedAt: agent.updatedAt,
    workspaceId: agent.workspaceId,
    cwd: agent.cwd,
    parentAgentId: getParentAgentIdFromLabels(agent.labels),
  };
}

export function createVoiceAssistantTaskHost(
  options: Options,
): Omit<VoiceAssistantHost, "createTask"> {
  async function requireTask(agentId: string) {
    options.assertPermission("workspace.read");
    const agent = await options.getAgent(agentId);
    if (!agent || agent.internal || agent.archivedAt) throw new Error("Task is unavailable");
    return agent;
  }

  async function getTask(agentId: string): Promise<AssistantTaskDetail> {
    const agent = await requireTask(agentId);
    const activity = await options.manager.readAgentActivity(agentId, 30);
    let lastMessage = await options.manager.getLastAssistantMessage(agentId);
    const lastUserIndex = activity.findLastIndex((item) => item.type === "user_message");
    const lastAssistantIndex = activity.findLastIndex((item) => item.type === "assistant_message");
    // A history-only provider reader does not populate the live timeline cache.
    if (!lastMessage && lastAssistantIndex >= 0) {
      const chunks: string[] = [];
      for (let index = lastAssistantIndex; index >= 0; index--) {
        const item = activity[index];
        if (item.type !== "assistant_message") break;
        chunks.unshift(item.text);
      }
      lastMessage = chunks.join("");
    }
    const lastUser = activity[lastUserIndex];
    const olderActivity = activity.filter((item, index) => {
      if (index === lastUserIndex) return false;
      if (item.type === "assistant_message" && lastMessage?.includes(item.text)) return false;
      return true;
    });
    const recentActivity = curateAgentActivity(olderActivity, {
      labelAssistantMessages: true,
    }).slice(-4000);
    const result = {
      ...taskFromSnapshot(agent),
      updatedAt: agent.updatedAt,
      lastMessage: lastMessage?.slice(-8000) ?? null,
      recentActivity,
      lastUserMessage: lastUser?.type === "user_message" ? lastUser.text.slice(-4000) : null,
      awaitingAgentReply: lastUserIndex > lastAssistantIndex,
      error: agent.lastError?.slice(0, 1000) ?? null,
      pendingPermissions: agent.pendingPermissions.map((request) => ({
        id: request.id,
        kind: request.kind,
      })),
      providerUnavailable: agent.providerUnavailable === true,
    };
    return {
      ...result,
      revision: createHash("sha256").update(JSON.stringify(result)).digest("hex"),
    };
  }

  return {
    listTasks: async () => {
      options.assertPermission("workspace.read");
      const agents = await options.listAgents();
      return agents
        .filter((agent) => !agent.internal && !agent.archivedAt)
        .map(taskFromSnapshot)
        .sort((a, b) => {
          const priority = (task: AssistantTask) => {
            if (task.attention === "permission" || task.status === "error") return 0;
            return task.status === "running" ? 1 : 2;
          };
          return (
            priority(a) - priority(b) ||
            (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "") ||
            a.id.localeCompare(b.id)
          );
        });
    },
    getTask,
    subscribeTasks: (listener) =>
      options.manager.subscribe((event) => {
        if (
          event.type === "agent_state" ||
          event.type === "agent_removed" ||
          event.type === "provider_subagent" ||
          event.type === "timeline_replacement"
        )
          listener();
      }),
    sendTaskMessage: async (agentId, message) => {
      options.assertPermission("workspace.write");
      const agent = await requireTask(agentId);
      if (agent.pendingPermissions.length || agent.attentionReason === "permission") {
        throw new Error("This task needs permission. Review it in the app before continuing.");
      }
      await options.sendMessage(agentId, message);
    },
    archiveTask: async (agentId, revision, completionEvidence, signal) => {
      options.assertPermission("workspace.write");
      const task = await getTask(agentId);
      if (task.revision !== revision) throw new Error("Task changed since review; read it again");
      if (!task.lastMessage?.includes(completionEvidence)) {
        throw new Error("Completion evidence must quote the task's latest assistant reply");
      }
      if (
        (task.status !== "idle" && task.status !== "closed") ||
        task.pendingPermissions.length ||
        task.awaitingAgentReply ||
        task.attention === "permission" ||
        task.attention === "error" ||
        task.error
      ) {
        throw new Error("Task is not ready to archive; report what still needs attention");
      }
      options.assertPermission("workspace.write");
      signal?.throwIfAborted();
      return options.archive(agentId, task.updatedAt, signal);
    },
  };
}
