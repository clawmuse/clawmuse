import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const ScheduledJobSchema = z.object({
  agentId: z.string(),
  provider: z.string(),
  title: z.string().nullable(),
  projectName: z.string().nullable(),
  workspaceName: z.string().nullable(),
  /** Reset instant the continue waits for; null while it is unknown and rechecked. */
  resetAt: z.string().nullable(),
  dueAt: z.string(),
  enabled: z.boolean(),
  /** The continue is being delivered right now. */
  sending: z.boolean(),
  /** This row's time is a status check, not a promised continue. */
  waiting: z.enum(["auth", "usage"]).optional(),
});

export type ScheduledJob = z.infer<typeof ScheduledJobSchema>;

export const listScheduledRpc = defineRpc({
  name: "auto-resume.list",
  input: z.object({}),
  output: z.object({ jobs: z.array(ScheduledJobSchema) }),
});

export const setEnabledRpc = defineRpc({
  name: "auto-resume.set-enabled",
  input: z.object({ agentId: z.string(), dueAt: z.string(), enabled: z.boolean() }),
  /** False when the job already ran, was canceled, or was rescheduled since it was shown. */
  output: z.object({ changed: z.boolean() }),
});

export const RescheduleResultSchema = z.discriminatedUnion("changed", [
  z.object({ changed: z.literal(true), dueAt: z.string() }),
  z.object({
    changed: z.literal(false),
    /**
     * `changed`: the job already ran, was canceled, or moved since it was shown.
     * `sending`: the continue is being delivered. `too-early`: before `earliest` (the limit
     * reset plus grace, or a minute from now). `too-late`: more than a week out.
     */
    reason: z.enum(["changed", "sending", "too-early", "too-late"]),
    earliest: z.string().optional(),
  }),
]);

export type RescheduleResult = z.infer<typeof RescheduleResultSchema>;

export const rescheduleRpc = defineRpc({
  name: "auto-resume.reschedule",
  /** `dueAt` is the time the screen showed; `newDueAt` replaces it. */
  input: z.object({ agentId: z.string(), dueAt: z.string(), newDueAt: z.iso.datetime() }),
  output: RescheduleResultSchema,
});

export const setAllEnabledRpc = defineRpc({
  name: "auto-resume.set-all-enabled",
  /** The rows the screen showed; jobs scheduled since, or being sent, are left alone. */
  input: z.object({
    enabled: z.boolean(),
    jobs: z.array(z.object({ agentId: z.string(), dueAt: z.string() })),
  }),
  /** How many jobs flipped. */
  output: z.object({ changed: z.number().int().nonnegative() }),
});

export const DiscoveredProviderSchema = z.object({
  id: z.string(),
  label: z.string(),
  cli: z.enum(["claude", "codex", "antigravity"]),
  /** False when the provider is turned off in Paseo itself, so it starts no agents. */
  paseoEnabled: z.boolean(),
  /** Email the CLI signs in as; null for Antigravity or when it cannot be read. */
  account: z.string().nullable(),
});

export type DiscoveredProvider = z.infer<typeof DiscoveredProviderSchema>;

export const listProvidersRpc = defineRpc({
  name: "auto-resume.providers",
  input: z.object({}),
  output: z.object({ providers: z.array(DiscoveredProviderSchema) }),
});

export const QueuedMessageSchema = z.object({
  id: z.string(),
  text: z.string(),
  createdAt: z.string(),
  state: z.enum(["queued", "running", "uncertain"]),
});

/**
 * Why a paused queue paused, or why a saved queue is not yet waiting. The client translates
 * this key; never send a localized sentence through the wire schema.
 */
export const QueueReasonSchema = z.enum([
  "saved",
  "paused-by-user",
  "schedule-failed",
  "provider-model-changed",
  "manual-activity",
  "conversation-changed",
  "turn-changed",
  "auto-resume-stopped",
  "other-turn-ended",
  "turn-not-ours",
  "canceled",
  "failed",
  "context-changed",
  "auto-resume-off",
  "account-changed",
  "agent-changed",
  "delivery-unknown",
  "plugin-restarted",
  "agent-gone",
  "provider-unsupported",
  "provider-off",
  "continue-delivery-unknown",
  "resume-delivery-unknown",
  "agent-unavailable",
  "agent-archived",
  "agent-busy",
  "agent-pending",
]);
export type QueueReason = z.infer<typeof QueueReasonSchema>;

export const QueueSchema = z.object({
  agentId: z.string(),
  provider: z.string(),
  title: z.string().nullable(),
  status: z.enum(["waiting", "ready", "running", "paused"]),
  // Persisted queues and older hosts also send human-readable reason text.
  reason: z.string().nullable(),
  /** A previous send may have reached the agent. Resuming requires an explicit decision. */
  uncertainMessageId: z.string().nullable(),
  messages: z.array(QueuedMessageSchema),
});

export type QueuedMessage = z.infer<typeof QueuedMessageSchema>;
export type MessageQueue = z.infer<typeof QueueSchema>;

export const listQueuesRpc = defineRpc({
  name: "auto-resume.queue.list",
  input: z.object({ agentId: z.string().optional() }),
  output: z.object({ queues: z.array(QueueSchema) }),
});

export const addQueuedMessageRpc = defineRpc({
  name: "auto-resume.queue.add",
  /** The client keeps this ID across retries after a timeout or disconnect. */
  input: z.object({
    agentId: z.string(),
    id: z.uuid(),
    text: z.string().trim().min(1).max(20_000),
  }),
  output: z.object({ queue: QueueSchema }),
});

export const removeQueuedMessageRpc = defineRpc({
  name: "auto-resume.queue.remove",
  input: z.object({ agentId: z.string(), id: z.string() }),
  output: z.object({ changed: z.boolean(), queue: QueueSchema.nullable() }),
});

export const resumeQueueRpc = defineRpc({
  name: "auto-resume.queue.resume",
  input: z.object({
    agentId: z.string(),
    /** Only for a message whose previous delivery/completion could not be established. */
    uncertain: z.enum(["retry", "skip"]).optional(),
  }),
  output: z.object({ queue: QueueSchema }),
});

export const pauseQueueRpc = defineRpc({
  name: "auto-resume.queue.pause",
  input: z.object({ agentId: z.string() }),
  output: z.object({ queue: QueueSchema }),
});
