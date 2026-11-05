import { useEffect } from "react";
import { getHostRuntimeStore, useHosts } from "@/runtime/host-runtime";
import { usePromptPredictionHost } from "./use-prompt-prediction";

function HostPredictions({ serverId }: { serverId: string }) {
  const { enabled } = usePromptPredictionHost(serverId);
  useEffect(() => {
    if (enabled) return getHostRuntimeStore().acquireDirectoryDemand(serverId);
  }, [enabled, serverId]);
  return null;
}

// Cindy records background completions outside the chat input. Keep that observer
// mounted while browsing settings or another workspace, without requesting a model.
export function PromptPredictionsRoot() {
  const hosts = useHosts();
  return hosts.map((host) => <HostPredictions key={host.serverId} serverId={host.serverId} />);
}
