import type pino from "pino";

import type { SessionInboundMessage, SessionOutboundMessage } from "../messages.js";
import { ClawMuseStatusRequestError } from "./client.js";
import type { ClawMuseStatusService } from "./service.js";
import { ClawMuseStatusNotConnectedError } from "./snapshot-publisher.js";

export type ClawMuseStatusRequest = Extract<
  SessionInboundMessage,
  { type: "clawmuse.status.get.request" | "clawmuse.status.create_mobile_enrollment.request" }
>;

export interface ClawMuseStatusSessionContext {
  service: ClawMuseStatusService | null;
  /** The Hub is a remote principal; enrolling a phone is a local-operator action. */
  isHubSession: boolean;
  clientId: string;
  emit: (message: SessionOutboundMessage) => void;
  logger: pino.Logger;
}

const DISCONNECTED_REPORT = {
  configured: false,
  baseUrl: null,
  relayHostId: null,
  connected: false,
  lastPublishedAt: null,
  lastError: null,
  goals: null,
} as const;

function errorCodeFor(error: unknown): string {
  if (error instanceof ClawMuseStatusNotConnectedError) {
    return "clawmuse_status_not_connected";
  }
  if (error instanceof ClawMuseStatusRequestError) {
    return `clawmuse_status_http_${error.statusCode}`;
  }
  return "handler_error";
}

export async function handleClawMuseStatusRequest(
  context: ClawMuseStatusSessionContext,
  msg: ClawMuseStatusRequest,
): Promise<void> {
  if (context.isHubSession) {
    context.emit({
      type: "rpc_error",
      payload: {
        requestId: msg.requestId,
        requestType: msg.type,
        error: "ClawMuse Status is not available to Hub sessions",
        code: "hub_session_forbidden",
      },
    });
    return;
  }
  if (msg.type === "clawmuse.status.get.request") {
    context.emit({
      type: "clawmuse.status.get.response",
      payload: {
        requestId: msg.requestId,
        ...(context.service?.report() ?? DISCONNECTED_REPORT),
      },
    });
    return;
  }
  try {
    if (!context.service?.isConfigured) {
      throw new ClawMuseStatusNotConnectedError();
    }
    const enrollment = await context.service.createMobileEnrollment(context.clientId);
    context.emit({
      type: "clawmuse.status.create_mobile_enrollment.response",
      payload: { requestId: msg.requestId, ...enrollment },
    });
  } catch (error) {
    context.logger.warn({ err: error }, "Failed to create a ClawMuse Status mobile enrollment");
    context.emit({
      type: "rpc_error",
      payload: {
        requestId: msg.requestId,
        requestType: msg.type,
        error: error instanceof Error ? error.message : String(error),
        code: errorCodeFor(error),
      },
    });
  }
}
