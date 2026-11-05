import { useMutation } from "@tanstack/react-query";
import type { MutableDaemonConfig } from "@getpaseo/protocol/messages";
import { useShallow } from "zustand/shallow";
import { useReplicaQueries } from "@/data/query";
import { daemonConfigQueryKey } from "@/data/daemon-config";
import { getHostRuntimeStore } from "@/runtime/host-runtime";
import type { UsageHost } from "./model";
import { useCallback } from "react";
import { useDaemonConfig } from "@/hooks/use-daemon-config";
import { useSessionStore } from "@/stores/session-store";

/** Host policy comes from the live daemon config replica. */
export function useUsageSetting(serverId: string | null) {
  const supported = useSessionStore((state) =>
    Boolean(serverId && state.sessions[serverId]?.serverInfo?.features?.usageSetting),
  );
  const { config, patchConfig } = useDaemonConfig(supported ? serverId : null);
  const mutation = useMutation({
    mutationFn: (enabled: boolean) => patchConfig({ usage: { enabled } }),
  });
  const setEnabled = mutation.mutate;
  const turnOn = useCallback(() => setEnabled(true), [setEnabled]);
  return {
    supported,
    error: mutation.error,
    // COMPAT(usageSetting): added in v0.14, remove after 2027-05-01.
    enabled: !supported || (config !== null && config.usage?.enabled !== false),
    ready: !supported || config !== null,
    setEnabled,
    turnOn,
  };
}

/** Share the live config replica when the all-hosts view owns several usage queries. */
export function useUsageSettings(hosts: UsageHost[]) {
  const supported = useSessionStore(
    useShallow((state) =>
      hosts.map((host) =>
        Boolean(state.sessions[host.serverId]?.serverInfo?.features?.usageSetting),
      ),
    ),
  );
  const configs = useReplicaQueries<MutableDaemonConfig>(
    hosts.map((host, index) => ({
      queryKey: daemonConfigQueryKey(host.serverId),
      enabled: host.isConnected && supported[index],
      pushEvent: "status:daemon_config_changed",
      queryFn: async () => {
        const client = getHostRuntimeStore().getClient(host.serverId);
        if (!client) throw new Error("Host disconnected");
        return (await client.getDaemonConfig()).config;
      },
    })),
  );
  return hosts.map((_host, index) => {
    if (!supported[index]) return true;
    const config = configs[index].data;
    return config ? config.usage?.enabled !== false : undefined;
  });
}
