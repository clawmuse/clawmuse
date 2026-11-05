import { z } from "zod";
import {
  AgentMessageOutcomeUnknownError,
  DaemonConnectionError,
} from "@getpaseo/client/internal/daemon-client";
import { ActiveTurnBehaviorSchema, AgentAttachmentSchema } from "@getpaseo/protocol/messages";
import { AttachmentMetadataSchema } from "@/stores/draft-store/state";

/** How long a prompt keeps waiting for its host before it is marked failed. */
export const OUTBOX_DELIVERY_DEADLINE_MS = 5 * 60 * 1000;

export const OutboxEntrySchema = z.strictObject({
  serverId: z.string(),
  agentId: z.string(),
  clientMessageId: z.string(),
  text: z.string(),
  images: z.array(AttachmentMetadataSchema),
  attachments: z.array(AgentAttachmentSchema),
  activeTurnBehavior: ActiveTurnBehaviorSchema.nullable(),
  turnId: z.string().nullable(),
  submittedAt: z.number(),
  deadlineAt: z.number(),
  delivery: z.discriminatedUnion("status", [
    z.strictObject({ status: z.literal("waiting") }),
    z.strictObject({ status: z.literal("failed"), error: z.string() }),
  ]),
});

export type OutboxEntry = z.infer<typeof OutboxEntrySchema>;

export type DeliveryErrorKind = "connection" | "outcome_unknown" | "rejected";

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

/**
 * The daemon's message receipts make a resend with the same client message id
 * idempotent, so anything that only says "the request did not get an answer" is a
 * connection failure worth resending. Only an answer from the daemon is a rejection.
 */
export function classifyDeliveryError(error: unknown): DeliveryErrorKind {
  if (error instanceof AgentMessageOutcomeUnknownError) return "outcome_unknown";
  if (error instanceof DaemonConnectionError) return "connection";
  if (hasCode(error, "host_offline")) return "connection";
  if (!(error instanceof Error)) return "rejected";
  const message = error.message;
  if (message.startsWith("Transport not connected")) return "connection";
  if (message.startsWith("Timeout waiting for message")) return "connection";
  if (message === "Daemon client closed" || message === "Daemon client is disposed") {
    return "connection";
  }
  return "rejected";
}
