import type {
  DesktopAppUpdateCheckResult,
  DesktopAppUpdateCheckIntent,
  DesktopAppUpdateInstallResult,
  DesktopReleaseChannel,
} from "@/desktop/updates/desktop-updates";
import { i18n } from "@/i18n/i18next";
import { toErrorMessage } from "@/utils/error-messages";

export type DesktopAppUpdateStatus =
  | "idle"
  | "checking"
  | "pending"
  | "up-to-date"
  | "available"
  | "installing"
  | "installed"
  | "error";

export const PENDING_RECHECK_MS = 10_000;
export const PENDING_TIMEOUT_MS = 30 * 60 * 1000;
const DOWNLOAD_PROGRESS_STALE_MS = 20_000;

export interface DesktopAppUpdaterSnapshot {
  status: DesktopAppUpdateStatus;
  availableUpdate: DesktopAppUpdateCheckResult | null;
  errorMessage: string | null;
  installMessage: string | null;
  lastCheckedAt: number | null;
  isChecking: boolean;
  isInstalling: boolean;
}

export interface DesktopAppUpdaterPort {
  checkDesktopAppUpdate(input: {
    releaseChannel: DesktopReleaseChannel;
    intent: DesktopAppUpdateCheckIntent;
  }): Promise<DesktopAppUpdateCheckResult>;
  installDesktopAppUpdate(input: {
    releaseChannel: DesktopReleaseChannel;
  }): Promise<DesktopAppUpdateInstallResult>;
}

export interface DesktopAppUpdaterErrorReport {
  error: unknown;
  message: string;
  logLabel: string;
}

export interface DesktopAppUpdaterDeps {
  port: DesktopAppUpdaterPort;
  now(): number;
  reportInstallError?(report: DesktopAppUpdaterErrorReport): void;
}

export interface DesktopAppUpdater {
  getSnapshot(): DesktopAppUpdaterSnapshot;
  subscribe(listener: () => void): () => void;
  checkForUpdates(options?: {
    releaseChannel: DesktopReleaseChannel;
    intent?: DesktopAppUpdateCheckIntent;
    silent?: boolean;
  }): Promise<DesktopAppUpdateCheckResult | null>;
  installUpdate(options: {
    releaseChannel: DesktopReleaseChannel;
  }): Promise<DesktopAppUpdateInstallResult | null>;
  resolveDownloadPercent(input?: { now?: number }): number | null;
}

interface InternalState {
  status: DesktopAppUpdateStatus;
  availableUpdate: DesktopAppUpdateCheckResult | null;
  errorMessage: string | null;
  installMessage: string | null;
  lastCheckedAt: number | null;
  isInstalling: boolean;
  requestVersion: number;
  pendingSince: number | null;
}

const INITIAL_STATE: InternalState = {
  status: "idle",
  availableUpdate: null,
  errorMessage: null,
  installMessage: null,
  lastCheckedAt: null,
  isInstalling: false,
  requestVersion: 0,
  pendingSince: null,
};

function buildSnapshot(state: InternalState): DesktopAppUpdaterSnapshot {
  return {
    status: state.status,
    availableUpdate: state.availableUpdate,
    errorMessage: state.errorMessage,
    installMessage: state.installMessage,
    lastCheckedAt: state.lastCheckedAt,
    isChecking: state.status === "checking",
    isInstalling: state.status === "installing" || state.isInstalling,
  };
}

function getErrorMessage(error: unknown): string {
  const message = toErrorMessage(error);
  if (/Command pkexec exited with code 127\b/.test(message)) {
    return i18n.t("desktop.updates.authorizationFailed");
  }
  if (/Command pkexec exited with code 126\b/.test(message)) {
    return i18n.t("desktop.updates.authorizationCancelled");
  }
  return message;
}

function isDownloadProgressFresh(state: InternalState, now: number): boolean {
  return (
    state.lastCheckedAt != null &&
    state.pendingSince != null &&
    state.lastCheckedAt >= state.pendingSince &&
    now - state.lastCheckedAt <= DOWNLOAD_PROGRESS_STALE_MS
  );
}

interface FormatStatusTextInput {
  status: DesktopAppUpdateStatus;
  availableUpdate: DesktopAppUpdateCheckResult | null;
  installMessage: string | null;
  lastCheckedAt: number | null;
  downloadPercent: number | null;
  formatVersion: (version: string | null | undefined) => string;
  formatLastCheckedAt: (timestamp: number) => string;
}

function formatPendingStatusText(input: FormatStatusTextInput): string {
  const { availableUpdate, lastCheckedAt, downloadPercent, formatVersion, formatLastCheckedAt } =
    input;

  if (downloadPercent != null) {
    const key = availableUpdate?.latestVersion
      ? "desktop.updates.status.pendingWithVersionAndProgress"
      : "desktop.updates.status.pendingWithProgress";
    return i18n.t(key, {
      version: availableUpdate?.latestVersion
        ? formatVersion(availableUpdate.latestVersion)
        : undefined,
      percent: Math.max(0, Math.min(100, Math.round(downloadPercent))),
    });
  }

  if (availableUpdate?.latestVersion) {
    return i18n.t(
      lastCheckedAt != null
        ? "desktop.updates.status.pendingWithVersionAndLastChecked"
        : "desktop.updates.status.pendingWithVersion",
      {
        version: formatVersion(availableUpdate.latestVersion),
        time: lastCheckedAt != null ? formatLastCheckedAt(lastCheckedAt) : undefined,
      },
    );
  }

  if (lastCheckedAt != null) {
    return i18n.t("desktop.updates.status.pendingWithLastChecked", {
      time: formatLastCheckedAt(lastCheckedAt),
    });
  }
  return i18n.t("desktop.updates.status.pending");
}

function formatAvailableStatusText(input: FormatStatusTextInput): string {
  const { availableUpdate, lastCheckedAt, formatVersion, formatLastCheckedAt } = input;

  if (availableUpdate?.latestVersion) {
    return i18n.t(
      lastCheckedAt != null
        ? "desktop.updates.status.availableWithVersionAndLastChecked"
        : "desktop.updates.status.availableWithVersion",
      {
        version: formatVersion(availableUpdate.latestVersion),
        time: lastCheckedAt != null ? formatLastCheckedAt(lastCheckedAt) : undefined,
      },
    );
  }

  if (lastCheckedAt != null) {
    return i18n.t("desktop.updates.status.availableWithLastChecked", {
      time: formatLastCheckedAt(lastCheckedAt),
    });
  }
  return i18n.t("desktop.updates.status.available");
}

export function formatStatusText(input: FormatStatusTextInput): string {
  const { status, lastCheckedAt, formatLastCheckedAt } = input;

  if (status === "checking") {
    return i18n.t("desktop.updates.status.checking");
  }

  if (status === "installing") {
    return i18n.t("desktop.updates.status.installing");
  }

  if (status === "up-to-date") {
    if (lastCheckedAt != null) {
      return i18n.t("desktop.updates.status.upToDateWithLastChecked", {
        time: formatLastCheckedAt(lastCheckedAt),
      });
    }
    return i18n.t("desktop.updates.status.upToDate");
  }

  if (status === "pending") {
    return formatPendingStatusText(input);
  }

  if (status === "available") {
    return formatAvailableStatusText(input);
  }

  if (status === "installed") {
    // The updater's message is an English diagnostic. UI copy follows the app language.
    return i18n.t("desktop.updates.status.installed");
  }

  if (status === "error") {
    if (lastCheckedAt != null) {
      return i18n.t("desktop.updates.status.failedWithLastChecked", {
        time: formatLastCheckedAt(lastCheckedAt),
      });
    }
    return i18n.t("desktop.updates.status.failed");
  }

  return i18n.t("desktop.updates.status.idle");
}

export function createDesktopAppUpdater(deps: DesktopAppUpdaterDeps): DesktopAppUpdater {
  let state: InternalState = { ...INITIAL_STATE };
  let cachedSnapshot: DesktopAppUpdaterSnapshot = buildSnapshot(state);
  const listeners = new Set<() => void>();

  function commit(next: InternalState): void {
    state = next;
    cachedSnapshot = buildSnapshot(state);
    for (const listener of listeners) {
      listener();
    }
  }

  function commitCheckOutcome(
    result: DesktopAppUpdateCheckResult,
    nextLastCheckedAt: number | null,
  ): void {
    let nextStatus: DesktopAppUpdateStatus;
    let nextAvailable: DesktopAppUpdateCheckResult | null;

    if (result.readyToInstall) {
      nextStatus = "available";
      nextAvailable = result;
    } else if (result.hasUpdate) {
      nextStatus = "pending";
      nextAvailable = result;
    } else {
      nextStatus = "up-to-date";
      nextAvailable = null;
    }

    commit({
      ...state,
      status: nextStatus,
      availableUpdate: nextAvailable,
      errorMessage: null,
      installMessage: null,
      lastCheckedAt: nextLastCheckedAt,
      pendingSince:
        nextStatus === "pending" ? (state.pendingSince ?? nextLastCheckedAt ?? deps.now()) : null,
    });
  }

  async function checkForUpdates(options?: {
    releaseChannel: DesktopReleaseChannel;
    intent?: DesktopAppUpdateCheckIntent;
    silent?: boolean;
  }): Promise<DesktopAppUpdateCheckResult | null> {
    if (!options) {
      return null;
    }
    const { releaseChannel, intent = "manual", silent = false } = options;
    const preserveFeedback = state.status === "checking" || state.status === "error";
    if (state.isInstalling || (silent && preserveFeedback)) {
      return null;
    }

    const requestVersion = state.requestVersion + 1;

    commit({
      ...state,
      requestVersion,
      status: silent ? state.status : "checking",
      errorMessage: silent ? state.errorMessage : null,
    });

    try {
      const result = await deps.port.checkDesktopAppUpdate({ releaseChannel, intent });
      if (requestVersion !== state.requestVersion) {
        return result;
      }

      // Poll-based progress ticks need a timestamp even for automatic checks;
      // lastCheckedAt doubles as the freshness marker for downloadProgress.
      const nextLastCheckedAt =
        intent === "manual" || result.downloadProgress != null ? deps.now() : state.lastCheckedAt;
      if (result.errorMessage) {
        if (silent && !result.hasUpdate) {
          console.warn("[DesktopUpdater] Silent update check failed", result.errorMessage);
          return result;
        }

        commit({
          ...state,
          status: "error",
          availableUpdate: null,
          errorMessage: getErrorMessage(result.errorMessage),
          installMessage: null,
          lastCheckedAt: nextLastCheckedAt,
          pendingSince: null,
        });
        return result;
      }

      commitCheckOutcome(result, nextLastCheckedAt);
      return result;
    } catch (error) {
      if (requestVersion !== state.requestVersion) {
        return null;
      }

      const message = getErrorMessage(error);
      if (silent) {
        console.warn("[DesktopUpdater] Silent update check failed", message);
      } else {
        commit({
          ...state,
          status: "error",
          errorMessage: message,
          lastCheckedAt: intent === "manual" ? deps.now() : state.lastCheckedAt,
          pendingSince: null,
        });
      }
      return null;
    }
  }

  async function installUpdate(options: {
    releaseChannel: DesktopReleaseChannel;
  }): Promise<DesktopAppUpdateInstallResult | null> {
    commit({
      ...state,
      status: "installing",
      // An earlier background check must not overwrite this install's result.
      requestVersion: state.requestVersion + 1,
      errorMessage: null,
      isInstalling: true,
    });

    try {
      const result = await deps.port.installDesktopAppUpdate({
        releaseChannel: options.releaseChannel,
      });
      const nextLastCheckedAt = deps.now();
      commit({
        ...state,
        status: result.installed ? "installed" : "up-to-date",
        availableUpdate: null,
        installMessage: result.message,
        lastCheckedAt: nextLastCheckedAt,
        isInstalling: false,
        pendingSince: null,
      });
      return result;
    } catch (error) {
      const message = getErrorMessage(error);
      deps.reportInstallError?.({
        error,
        message: i18n.t("desktop.updates.installError"),
        logLabel: "[DesktopUpdater] Failed to install app update",
      });
      commit({
        ...state,
        status: "error",
        errorMessage: message,
        isInstalling: false,
        pendingSince: null,
      });
      return null;
    }
  }

  function resolveDownloadPercent(input?: { now?: number }): number | null {
    if (state.status !== "pending") {
      return null;
    }
    const percent = state.availableUpdate?.downloadProgress?.percent;
    if (percent == null) {
      return null;
    }
    if (!isDownloadProgressFresh(state, input?.now ?? deps.now())) {
      return null;
    }
    return percent;
  }

  return {
    getSnapshot: () => cachedSnapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    checkForUpdates,
    installUpdate,
    resolveDownloadPercent,
  };
}
