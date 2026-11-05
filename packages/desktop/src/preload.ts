import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { BrowserKeyboardPolicy } from "./features/browser-keyboard/index.js";
import type { DesktopWindowChromeMode } from "./window/chrome.js";

// This preload runs in Electron's sandbox and is tsc-compiled (not bundled), so it MUST
// NOT emit any runtime module load other than "electron" — a require() of a local or
// third-party module throws and aborts the preload before exposeInMainWorld runs, leaving
// window.paseoDesktop undefined (the 0.1.108 regression, #2103). Keep this literal in sync
// with PASEO_BROWSER_PROFILE_PARTITION in features/browser-profile.ts; preload-sandbox.test.ts
// guards both the no-local-import rule and this drift. Type-only imports are fine (erased at emit).
const PASEO_BROWSER_PROFILE_PARTITION = "persist:paseo-browser";

type EventHandler = (payload: unknown) => void;

async function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  try {
    return await ipcRenderer.invoke(channel, ...args);
  } catch (error) {
    console.error(`[desktop-ipc] ${channel} failed`, error);
    const message = error instanceof Error ? error.message : String(error);
    // Keep this inline: sandboxed preloads cannot load our branding or UI modules.
    throw new Error(
      message
        .replace(/(?:Error: )?Error invoking remote method '[^']+':\s*(?:Error:\s*)?/g, "")
        .replace(/(?<![\w./\\:@-])paseo(?![\w./\\:@-])/gi, "ClawMuse"),
      { cause: error },
    );
  }
}

function readWindowChromeMode(): DesktopWindowChromeMode {
  const prefix = "--paseo-window-chrome-mode=";
  const value = process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
  if (value === "native-mac" || value === "custom-windows" || value === "custom-linux") {
    return value;
  }
  // COMPAT(windowChromeMode): added in v0.5.3; remove after 2026-11-25.
  if (process.platform === "darwin") return "native-mac";
  return process.platform === "linux" ? "custom-linux" : "custom-windows";
}

interface AttachedBrowserRegistration {
  browserId: string;
  workspaceId: string;
  webContentsId: number;
}

contextBridge.exposeInMainWorld("paseoDesktop", {
  clawmuseAccount: (input: { path: string; body?: unknown }) => invoke("clawmuse:account", input),
  clawmuseStatusVault: (
    input: { op: "get" | "delete"; key: string } | { op: "set"; key: string; value: string },
  ) => invoke("clawmuse:status-vault", input) as Promise<string | null>,
  platform: process.platform,
  windowChromeMode: readWindowChromeMode(),
  invoke: (command: string, args?: Record<string, unknown>) =>
    invoke("paseo:invoke", command, args),
  getPendingOpenProject: () => invoke("paseo:get-pending-open-project") as Promise<string | null>,
  agentNavigation: {
    ready: () =>
      invoke("paseo:agent-navigation:ready") as Promise<{
        serverId: string;
        agentId: string;
      } | null>,
  },
  events: {
    on: (event: string, handler: EventHandler): Promise<() => void> => {
      const listener = (_ipcEvent: Electron.IpcRendererEvent, payload: unknown) => {
        handler(payload);
      };
      ipcRenderer.on(`paseo:event:${event}`, listener);
      return Promise.resolve(() => {
        ipcRenderer.removeListener(`paseo:event:${event}`, listener);
      });
    },
  },
  window: {
    openNew: (options?: { pendingOpenProjectPath?: string | null }) =>
      invoke("paseo:window:openNew", options),
    getCurrentWindow: () => ({
      minimize: () => invoke("paseo:window:minimize"),
      close: () => invoke("paseo:window:close"),
      toggleMaximize: () => invoke("paseo:window:toggleMaximize"),
      isMaximized: () => invoke("paseo:window:isMaximized"),
      setFullscreen: (fullscreen: boolean) => invoke("paseo:window:setFullscreen", fullscreen),
      isFullscreen: () => invoke("paseo:window:isFullscreen"),
      updateChrome: (update: { backgroundColor?: string; trafficLightOffsetY?: number }) =>
        invoke("paseo:window:updateChrome", update),
      onResized: (handler: EventHandler): (() => void) => {
        const listener = (_ipcEvent: Electron.IpcRendererEvent, payload: unknown) => {
          handler(payload);
        };
        ipcRenderer.on("paseo:window:resized", listener);
        return () => {
          ipcRenderer.removeListener("paseo:window:resized", listener);
        };
      },
      setBadgeCount: (count?: number) => invoke("paseo:window:setBadgeCount", count),
    }),
  },
  dialog: {
    ask: (message: string, options?: Record<string, unknown>) =>
      invoke("paseo:dialog:ask", message, options),
    askWithCheckbox: (message: string, options: Record<string, unknown>) =>
      invoke("paseo:dialog:askWithCheckbox", message, options),
    open: (options?: Record<string, unknown>) => invoke("paseo:dialog:open", options),
  },
  notification: {
    isSupported: () => invoke("paseo:notification:isSupported"),
    sendNotification: (payload: { title: string; body?: string; data?: Record<string, unknown> }) =>
      invoke("paseo:notification:send", payload),
  },
  opener: {
    openUrl: (url: string) => invoke("paseo:opener:openUrl", url),
  },
  editor: {
    listTargets: (input?: { workspacePath?: string }) => invoke("paseo:editor:listTargets", input),
    openTarget: (input: {
      editorId: string;
      workspacePath: string;
      filePath?: string;
      line?: number;
      column?: number;
    }) => invoke("paseo:editor:openTarget", input),
  },
  webUtils: {
    getPathForFile: (file: File) => webUtils.getPathForFile(file),
  },
  menu: {
    showContextMenu: (input?: Record<string, unknown>) =>
      invoke("paseo:menu:showContextMenu", input),
    setCapturingShortcut: (capturing: boolean) =>
      invoke("paseo:menu:set-capturing-shortcut", capturing),
  },
  browser: {
    setShortcutPolicy: (input: BrowserKeyboardPolicy) =>
      invoke("paseo:browser:set-shortcut-policy", input),
    profilePartition: PASEO_BROWSER_PROFILE_PARTITION,
    registerAttachedBrowser: (input: AttachedBrowserRegistration) =>
      invoke("paseo:browser:register-attached", input),
    unregisterWorkspaceBrowser: (browserId: string) =>
      invoke("paseo:browser:unregister-workspace-browser", browserId),
    setWorkspaceActiveBrowser: (input: { workspaceId: string; browserId: string | null }) =>
      invoke("paseo:browser:set-workspace-active-browser", input),
    focus: (browserId: string) => invoke("paseo:browser:focus", browserId),
    openDevTools: (browserId: string) => invoke("paseo:browser:open-devtools", browserId),
    clearProfile: (legacyBrowserIds: string[]) =>
      invoke("paseo:browser:clear-profile", legacyBrowserIds),
    executeAutomationCommand: (request: Record<string, unknown>) =>
      invoke("paseo:browser:execute-automation-command", request),
    captureElement: (
      browserId: string,
      rect: { x: number; y: number; width: number; height: number },
    ) => invoke("paseo:browser:capture-element", browserId, rect),
    copyElement: (payload: { text?: string; imageDataUrl?: string }) =>
      invoke("paseo:browser:copy-element", payload),
  },
});
