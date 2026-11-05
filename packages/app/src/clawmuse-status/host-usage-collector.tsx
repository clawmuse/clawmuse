import { useEffect, useMemo } from "react";
import { useHostUsage } from "@/usage/queries";
import { useHostRuntimeConnectionStatuses, useHosts } from "@/runtime/host-runtime";
import { publishHostUsagePlans, retainHostUsagePlans } from "./host-usage-plans";
import { projectProviderUsagePlans } from "./usage-windows";

function HostUsageProbe({ serverId, hostName }: { serverId: string; hostName: string }) {
  const { view } = useHostUsage(serverId);

  useEffect(() => {
    if (view.kind !== "ready") {
      return;
    }
    publishHostUsagePlans({
      serverId,
      hostName,
      plans: projectProviderUsagePlans(view.reports),
    });
  }, [hostName, serverId, view]);

  return null;
}

/**
 * Mounted by every surface that needs plan usage. React Query keys the fetch by
 * host, so a second mount shares the first one's request, and the published
 * list is identical either way.
 */
export function ClawMuseHostUsageCollector() {
  const hosts = useHosts();
  const serverIds = useMemo(() => hosts.map((host) => host.serverId), [hosts]);
  const connectionStatuses = useHostRuntimeConnectionStatuses(serverIds);
  const onlineHosts = useMemo(
    () => hosts.filter((host) => connectionStatuses.get(host.serverId) === "online"),
    [connectionStatuses, hosts],
  );
  const onlineServerIds = useMemo(() => onlineHosts.map((host) => host.serverId), [onlineHosts]);

  useEffect(() => {
    retainHostUsagePlans(onlineServerIds);
  }, [onlineServerIds]);

  return onlineHosts.map((host) => (
    <HostUsageProbe key={host.serverId} serverId={host.serverId} hostName={host.label} />
  ));
}
