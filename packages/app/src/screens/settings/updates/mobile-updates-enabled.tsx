import { useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import * as Updates from "expo-updates";
import { useTranslation } from "react-i18next";
import { confirmDialog } from "@/utils/confirm-dialog";
import {
  applyMobileUpdate,
  checkAndDownloadMobileUpdate,
  formatMobileUpdateError,
} from "./mobile-update-actions";
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
  const { mutate: checkUpdate, reset: resetCheck } = check;
  const { mutate: applyUpdate, reset: resetApply } = apply;
  const handleCheck = useCallback(() => {
    resetApply();
    checkUpdate();
  }, [resetApply, checkUpdate]);
  const handleApply = useCallback(() => {
    resetCheck();
    applyUpdate();
  }, [resetCheck, applyUpdate]);
  const pending = state.isUpdatePending || check.data === "downloaded";
  const rawError =
    apply.error?.message ??
    (pending
      ? undefined
      : (check.error?.message ?? state.downloadError?.message ?? state.checkError?.message));
  const error = formatMobileUpdateError(rawError);
  const checked =
    check.data === "current" ||
    (Boolean(state.lastCheckForUpdateTimeSinceRestart) &&
      !state.isUpdateAvailable &&
      !state.checkError &&
      !state.downloadError);
  return (
    <MobileUpdatesView
      buildNumber={buildNumber}
      enabled={Updates.isEnabled}
      updateId={state.currentlyRunning.updateId}
      embedded={state.currentlyRunning.isEmbeddedLaunch}
      createdAt={state.currentlyRunning.createdAt}
      channel={state.currentlyRunning.channel}
      pendingId={state.downloadedUpdate?.updateId}
      pending={pending}
      available={state.isUpdateAvailable}
      checking={state.isChecking || (check.isPending && !state.isDownloading)}
      downloading={state.isDownloading}
      progress={state.downloadProgress}
      restarting={state.isRestarting || apply.isPending}
      checked={checked}
      lastChecked={state.lastCheckForUpdateTimeSinceRestart}
      error={error}
      emergency={state.currentlyRunning.isEmergencyLaunch}
      onCheck={handleCheck}
      onApply={handleApply}
    />
  );
}
