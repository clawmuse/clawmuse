import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import {
  checkDesktopAppUpdate,
  formatVersionWithPrefix,
  installDesktopAppUpdate,
  shouldShowDesktopUpdateSection,
  type DesktopAppUpdateCheckResult,
  type DesktopAppUpdateCheckIntent,
  type DesktopAppUpdateInstallResult,
} from "@/desktop/updates/desktop-updates";
import { useDesktopSettings } from "@/desktop/settings/desktop-settings";
import { useDesktopIpcErrorReporter } from "@/desktop/hooks/desktop-ipc-error";
import {
  PENDING_RECHECK_MS,
  PENDING_TIMEOUT_MS,
  createDesktopAppUpdater,
  formatStatusText,
  type DesktopAppUpdateStatus,
} from "@/desktop/updates/desktop-app-updater";
import { formatMessageTimestamp } from "@/utils/time";

export type { DesktopAppUpdateStatus };

const PENDING_PROGRESS_TICK_MS = 2_000;
const PENDING_STALL_TIMEOUT_MESSAGE = "Timed out while downloading the update.";

export interface UseDesktopAppUpdaterReturn {
  isDesktopApp: boolean;
  status: DesktopAppUpdateStatus;
  statusText: string;
  availableUpdate: DesktopAppUpdateCheckResult | null;
  errorMessage: string | null;
  lastCheckedAt: number | null;
  isChecking: boolean;
  isInstalling: boolean;
  checkForUpdates: (options?: {
    intent?: DesktopAppUpdateCheckIntent;
    silent?: boolean;
  }) => Promise<DesktopAppUpdateCheckResult | null>;
  installUpdate: () => Promise<DesktopAppUpdateInstallResult | null>;
}

export function useDesktopAppUpdater(): UseDesktopAppUpdaterReturn {
  useTranslation();
  const isDesktopApp = shouldShowDesktopUpdateSection();
  const { settings: desktopSettings } = useDesktopSettings();
  const releaseChannel = desktopSettings.releaseChannel;
  const reportError = useDesktopIpcErrorReporter();
  const [progressTick, setProgressTick] = useState(0);

  const updater = useMemo(
    () =>
      createDesktopAppUpdater({
        port: {
          checkDesktopAppUpdate,
          installDesktopAppUpdate,
        },
        now: () => Date.now(),
        reportInstallError: reportError,
      }),
    [reportError],
  );

  const snapshot = useSyncExternalStore(
    updater.subscribe,
    updater.getSnapshot,
    updater.getSnapshot,
  );

  const checkForUpdates = useCallback(
    async (options: { intent?: DesktopAppUpdateCheckIntent; silent?: boolean } = {}) => {
      if (!isDesktopApp) {
        return null;
      }
      return updater.checkForUpdates({
        releaseChannel,
        intent: options.intent ?? "manual",
        silent: options.silent,
      });
    },
    [isDesktopApp, releaseChannel, updater],
  );

  const installUpdate = useCallback(async () => {
    if (!isDesktopApp) {
      return null;
    }
    return updater.installUpdate({ releaseChannel });
  }, [isDesktopApp, releaseChannel, updater]);

  useEffect(() => {
    if (!isDesktopApp) {
      return;
    }
    void checkForUpdates({ intent: "automatic", silent: true });
  }, [checkForUpdates, isDesktopApp]);

  // Polls while a download is pending and re-renders between polls so the
  // percent and the eventual stall timeout stay live. A download that never
  // finishes surfaces as an error after PENDING_TIMEOUT_MS.
  const [stalledStatus, setStalledStatus] = useState<DesktopAppUpdateStatus | null>(null);
  const [stalledErrorMessage, setStalledErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isDesktopApp || snapshot.status !== "pending") {
      setStalledStatus(null);
      setStalledErrorMessage(null);
      return undefined;
    }

    setStalledStatus(null);
    setStalledErrorMessage(null);
    const pendingSince = snapshot.lastCheckedAt ?? Date.now();
    const stallDeadline = pendingSince + PENDING_TIMEOUT_MS;

    const pollId = setInterval(() => {
      void checkForUpdates({ intent: "automatic", silent: true });
    }, PENDING_RECHECK_MS);

    const tickId = setInterval(() => {
      setProgressTick((tick) => tick + 1);
      if (Date.now() >= stallDeadline) {
        setStalledStatus("error");
        setStalledErrorMessage((current) => current ?? PENDING_STALL_TIMEOUT_MESSAGE);
      }
    }, PENDING_PROGRESS_TICK_MS);

    return () => {
      clearInterval(pollId);
      clearInterval(tickId);
    };
  }, [checkForUpdates, isDesktopApp, snapshot.status, snapshot.lastCheckedAt]);

  const downloadPercent = useMemo(() => {
    void progressTick;
    if (snapshot.status !== "pending") {
      return null;
    }
    return updater.resolveDownloadPercent();
  }, [progressTick, snapshot.status, updater]);

  const effectiveStatus = stalledStatus ?? snapshot.status;
  const effectiveErrorMessage = stalledErrorMessage ?? snapshot.errorMessage;

  return {
    isDesktopApp,
    status: effectiveStatus,
    statusText: formatStatusText({
      status: effectiveStatus,
      availableUpdate: snapshot.availableUpdate,
      installMessage: snapshot.installMessage,
      lastCheckedAt: snapshot.lastCheckedAt,
      downloadPercent,
      formatVersion: formatVersionWithPrefix,
      formatLastCheckedAt: (timestamp) => formatMessageTimestamp(new Date(timestamp)),
    }),
    availableUpdate: snapshot.availableUpdate,
    errorMessage: effectiveErrorMessage,
    lastCheckedAt: snapshot.lastCheckedAt,
    isChecking: snapshot.isChecking,
    isInstalling: snapshot.isInstalling,
    checkForUpdates,
    installUpdate,
  };
}
