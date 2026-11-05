import { useEffect, useState } from "react";
import { View } from "react-native";
import type { DaemonClient, RelayRouteInfo } from "@getpaseo/client/internal/daemon-client";
import { StatusBadge } from "@/components/ui/status-badge";
import { useAppVisible } from "@/hooks/use-app-visible";
import { useHostRuntimeSnapshot } from "@/runtime/host-runtime";
import { connectionRouteCode } from "./route-code";

interface Observation {
  client: DaemonClient;
  epoch: number;
  info: RelayRouteInfo | null;
}

function useRouteObservation(
  client: DaemonClient | null | undefined,
  epoch: number,
  enabled: boolean,
) {
  const visible = useAppVisible();
  const [observation, setObservation] = useState<Observation | null>(null);
  useEffect(() => {
    if (!visible || !enabled || !client) return;
    let disposed = false;
    let next: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    const poll = async () => {
      const request = new AbortController();
      controller = request;
      const deadline = setTimeout(() => request.abort(), 6000);
      let info: RelayRouteInfo | null = null;
      try {
        info = await client.getRelayRouteInfo({ signal: request.signal });
      } catch {
        /* Network metadata is optional. */
      } finally {
        clearTimeout(deadline);
      }
      if (disposed) return;
      setObservation({ client, epoch, info });
      next = setTimeout(() => {
        void poll();
      }, 15_000);
    };
    void poll();
    return () => {
      disposed = true;
      clearTimeout(next);
      controller?.abort();
    };
  }, [client, epoch, enabled, visible]);
  if (
    !visible ||
    !enabled ||
    !observation ||
    observation.client !== client ||
    observation.epoch !== epoch
  )
    return null;
  return observation;
}

export function HostConnectionRouteBadge({ serverId }: { serverId: string }) {
  const snapshot = useHostRuntimeSnapshot(serverId);
  const enabled =
    snapshot?.connectionStatus === "online" && snapshot.activeConnection?.type === "relay";
  const observation = useRouteObservation(
    snapshot?.client,
    snapshot?.connectionEpoch ?? 0,
    enabled,
  );
  if (!enabled) return null;
  return (
    <View testID="host-connection-route-code">
      <StatusBadge label={connectionRouteCode(observation?.info ?? null)} />
    </View>
  );
}
