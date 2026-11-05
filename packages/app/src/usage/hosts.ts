import { useCallback, useMemo } from "react";
import { useAppSettings } from "@/hooks/use-settings";
import {
  useActiveWorkspaceSelection,
  useLastWorkspaceSelection,
} from "@/stores/navigation-active-workspace-store";
import {
  resolveUsageHostId,
  resolveUsageModalHostId,
  type UsageHost,
  type UsageHostChoice,
} from "./model";
import { setUsageHost } from "./preferences";
import { useUsageHosts } from "./queries";

/** The active workspace's host; off a workspace route, the last workspace visited. */
function useActiveServerId(): string | null {
  const active = useActiveWorkspaceSelection();
  const last = useLastWorkspaceSelection();
  return active?.serverId ?? last?.serverId ?? null;
}

function useUsageHostChoice(): UsageHostChoice {
  const { settings } = useAppSettings();
  return {
    pickedServerId: settings.usage.serverId,
    activeServerId: useActiveServerId(),
    hosts: useUsageHosts(),
  };
}

/** The host the sidebar Usage row reads, or null when none reports usage. */
export function useUsageHostId(): string | null {
  return resolveUsageHostId(useUsageHostChoice());
}

/**
 * The modal's connected-host filter. Choices persist on the device; without a choice it shows all.
 */
export function useUsageHostSelection(): {
  serverId: string | null;
  connectedHosts: UsageHost[];
  select: (serverId: string) => void;
} {
  const { updateSettings } = useAppSettings();
  const choice = useUsageHostChoice();
  const connectedHosts = useMemo(
    () => choice.hosts.filter((host) => host.isConnected),
    [choice.hosts],
  );
  const select = useCallback(
    (serverId: string) => {
      void updateSettings((current) => ({ usage: setUsageHost(current.usage, serverId) }));
    },
    [updateSettings],
  );
  return { serverId: resolveUsageModalHostId(choice), connectedHosts, select };
}
