import { classifyDeliveryError } from "@/composer/outbox/model";

/** Matches the providers' refusals for a request that is no longer pending. */
const ALREADY_RESOLVED_PATTERN =
  /no pending permission|permission request .*not found|already (been )?(resolved|answered)/i;

export class PermissionResponseTimeoutError extends Error {
  constructor() {
    super("The host stayed unreachable while submitting the permission response");
    this.name = "PermissionResponseTimeoutError";
  }
}

export interface SubmitPermissionResponseInput {
  respond: () => Promise<unknown>;
  /** Resolves once the host is connected again; rejects when `signal` aborts. */
  waitForReconnect: (signal: AbortSignal) => Promise<void>;
  /** Whether the host still lists the request. A reconnect snapshot drops resolved ones. */
  isStillPending: () => boolean;
  onWaitingForNetwork: () => void;
  deadlineMs: number;
}

export type PermissionResponseOutcome = "resolved" | "already_resolved";

/**
 * A permission answer lost to a dropped connection is retried after reconnect,
 * not dropped: the agent stays parked until it arrives. A retry that finds the
 * request gone means the earlier attempt landed.
 */
export async function submitPermissionResponse(
  input: SubmitPermissionResponseInput,
): Promise<PermissionResponseOutcome> {
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), input.deadlineMs);
  try {
    for (;;) {
      try {
        await input.respond();
        return "resolved";
      } catch (error) {
        if (error instanceof Error && ALREADY_RESOLVED_PATTERN.test(error.message)) {
          return "already_resolved";
        }
        if (classifyDeliveryError(error) !== "connection") throw error;
      }
      input.onWaitingForNetwork();
      try {
        await input.waitForReconnect(deadline.signal);
      } catch (error) {
        if (deadline.signal.aborted) throw new PermissionResponseTimeoutError();
        throw error;
      }
      if (!input.isStillPending()) return "already_resolved";
    }
  } finally {
    clearTimeout(timer);
  }
}
