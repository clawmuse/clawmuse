import path from "node:path";
import { rm } from "node:fs/promises";
import { app, autoUpdater as nativeUpdater } from "electron";
import { AppUpdater, type DownloadUpdateOptions } from "electron-updater/out/AppUpdater.js";
import { ElectronHttpExecutor } from "electron-updater/out/electronHttpExecutor.js";
import {
  launchMacBundleInstallation,
  prepareMacBundleInstallation,
  type MacBundleInstallation,
} from "./mac-bundle-install.js";

export class MacBundleUpdater extends AppUpdater {
  private prepared: MacBundleInstallation | null = null;
  private installing = false;
  private readonly downloader = new ElectronHttpExecutor((info, callback) =>
    this.emit("login", info, callback),
  );

  constructor() {
    super(null);
  }

  protected async doDownloadUpdate(options: DownloadUpdateOptions): Promise<string[]> {
    const { info, provider } = options.updateInfoAndProvider;
    const files = provider.resolveFiles(info);
    const file = files.find((entry) => entry.url.pathname.endsWith(`-${process.arch}.zip`));
    if (!file || !file.info.sha512) throw new Error(`No verified Mac ZIP for ${process.arch}.`);
    return this.executeDownload({
      fileExtension: "zip",
      fileInfo: file,
      downloadUpdateOptions: options,
      task: (destination, downloadOptions) =>
        this.downloader.download(file.url, destination, downloadOptions),
      done: async (event) => {
        if (this.prepared?.version !== info.version) {
          const prepared = await prepareMacBundleInstallation({
            zipPath: event.downloadedFile,
            executable: app.getPath("exe"),
            bundleId: "sh.paseo.desktop",
            version: info.version,
          });
          const previous = this.prepared;
          this.prepared = prepared;
          if (previous) await rm(previous.staging, { recursive: true, force: true });
        }
        this.dispatchUpdateDownloaded(event);
      },
    });
  }

  quitAndInstall(isSilent = false, isForceRunAfter = false): void {
    if (this.installing) return;
    const isCurrent = this.prepared?.version === this.updateInfoAndProvider?.info.version;
    if (!this.prepared || !isCurrent)
      throw new Error("The current Mac update has not been prepared.");
    const restart = !isSilent || isForceRunAfter;
    launchMacBundleInstallation({
      installation: this.prepared,
      restart,
      logPath: path.join(app.getPath("logs"), "bundle-update.log"),
    });
    this.installing = true;
    setImmediate(() => {
      nativeUpdater.emit("before-quit-for-update");
      app.quit();
    });
  }
}
