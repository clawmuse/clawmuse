// Ported from agent/mobile/src/status-saas/status-saas-mobile-types.ts.
export interface ClawMuseStatusAccessToken {
  value: string;
  expiresAt: number;
  installationId: string;
}

/**
 * Thrown when the stored installation changed underneath an in-flight request.
 * The caller must abandon the result instead of applying it to the new session.
 */
export class ClawMuseStatusSessionChangedError extends Error {
  constructor(options?: ErrorOptions) {
    super("Status service session changed during request", options);
    this.name = "ClawMuseStatusSessionChangedError";
  }
}

export type ClawMuseStatusPushEndpoint =
  | { kind: "alert"; token: string }
  | { kind: "fcm_alert"; token: string }
  | { kind: "push_to_start"; token: string }
  | { kind: "activity_update"; token: string; activityId: string; generation: string };
