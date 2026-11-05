import { createHash } from "node:crypto";

/**
 * Host identity the status service knows this daemon by. Derived from the
 * persisted `$PASEO_HOME/server-id` so it survives restarts without another
 * piece of state, and hashed so the service never learns the server id itself.
 * The service validates `^[A-Za-z0-9_-]{16}$`.
 */
export function deriveRelayHostId(serverId: string): string {
  return createHash("sha256").update(serverId, "utf8").digest("base64url").slice(0, 16);
}
