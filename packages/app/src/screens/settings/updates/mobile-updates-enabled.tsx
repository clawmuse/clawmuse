import { useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import * as Updates from "expo-updates";
import { useTranslation } from "react-i18next";
import { confirmDialog } from "@/utils/confirm-dialog";
import { applyMobileUpdate, checkAndDownloadMobileUpdate } from "./mobile-update-actions";
import { MobileUpdatesView } from "./mobile-updates-view";

export function MobileUpdatesEnabled({ buildNumber }: { buildNumber: string }) {
  const { t } = useTranslation();
  const state = Updates.useUpdates();
  const check = useMutation({
    mutationFn: () => checkAndDownloadMobileUpdate(Updates, t("mobileUpdates.downloadFailed")),
  });
  const apply = useMutation({
    mutationFn: () =>
      applyMobileUpdate({
        confirm: () =>
          confirmDialog({
            title: t("mobileUpdates.restartTitle"),
            message: t("mobileUpdates.restartMessage"),
            confirmLabel: t("mobileUpdates.restart"),
            cancelLabel: t("mobileUpdates.later"),
          }),
        reload: () => Updates.reloadAsync(),
      }),
  });
  const { mutate: checkUpdate } = check;
  const { mutate: applyUpdate } = apply;
  const handleCheck = useCallback(() => checkUpdate(), [checkUpdate]);
  const handleApply = useCallback(() => applyUpdate(), [applyUpdate]);
  return (
    <MobileUpdatesView
      buildNumber={buildNumber}
      enabled={Updates.isEnabled}
      updateId={state.currentlyRunning.updateId}
      embedded={state.currentlyRunning.isEmbeddedLaunch}
      createdAt={state.currentlyRunning.createdAt}
      channel={state.currentlyRunning.channel}
      pendingId={state.downloadedUpdate?.updateId}
      pending={state.isUpdatePending || check.data === "downloaded"}
      checking={state.isChecking || (check.isPending && !state.isDownloading)}
      downloading={state.isDownloading}
      progress={state.downloadProgress}
      restarting={state.isRestarting || apply.isPending}
      checked={check.data === "current"}
      lastChecked={state.lastCheckForUpdateTimeSinceRestart}
      error={
        apply.error?.message ??
        check.error?.message ??
        state.downloadError?.message ??
        state.checkError?.message
      }
      emergency={state.currentlyRunning.isEmergencyLaunch}
      onCheck={handleCheck}
      onApply={handleApply}
    />
  );
}
