export const CLIENT_SHUTDOWN_RPC_REASON = "client_shutdown_rpc";
export const DEFAULT_CLIENT_RESTART_RPC_REASON = "client_restart_rpc";

export function normalizeClientShutdownRpcReason(reason: string | undefined): string {
  return reason === "app_update" ? reason : CLIENT_SHUTDOWN_RPC_REASON;
}

export function normalizeClientRestartRpcReason(reason: string | undefined): string {
  return reason?.trim() || DEFAULT_CLIENT_RESTART_RPC_REASON;
}
