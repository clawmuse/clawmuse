import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useLocalDaemonServerId } from "@/hooks/use-is-local-daemon";

export function useClawMuseDeviceLabel() {
  const localServerId = useLocalDaemonServerId();
  const { t } = useTranslation();
  const localLabel = t("clawmuseAccount.thisDevice");
  return useCallback(
    (serverId: string, label: string) => (serverId === localServerId ? localLabel : label),
    [localServerId, localLabel],
  );
}
