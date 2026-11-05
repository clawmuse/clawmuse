import { app, BrowserWindow, type IpcMainInvokeEvent } from "electron";

/**
 * Credential bridges (ClawMuse account, ClawMuse Status vault) only answer the
 * app's own main frame: the packaged `paseo://app` page, or the dev server
 * while unpackaged. Embedded browser webviews and iframes never qualify.
 */
export function assertTrustedRendererCaller(event: IpcMainInvokeEvent, devOrigin: string): void {
  const url = new URL(event.sender.getURL());
  const isAppPage = url.protocol === "paseo:" && url.host === "app";
  const isDevPage = !app.isPackaged && url.origin === new URL(devOrigin).origin;
  if (
    !BrowserWindow.fromWebContents(event.sender) ||
    event.senderFrame !== event.sender.mainFrame ||
    (!isAppPage && !isDevPage)
  ) {
    throw new Error("Untrusted caller");
  }
}
