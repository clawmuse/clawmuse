import manifest from "./releases.json";

export type DownloadPlatform = "windows" | "macos" | "linux" | "android";
export interface DownloadFile {
  platform: DownloadPlatform;
  arch: string;
  format: string;
  filename: string;
  url: string;
  size: number;
  sha256: string;
  version?: string;
}

export const release = manifest as {
  version: string;
  checksumsUrl: string;
  publishedAt: string | null;
  files: DownloadFile[];
  ios: typeof manifest.ios;
};

export function fileVersion(file: DownloadFile): string {
  return file.version ?? release.version;
}

export function platformVersion(platform: DownloadPlatform): string {
  const match = release.files.find((file) => file.platform === platform);
  return match ? fileVersion(match) : release.version;
}

export function primaryPlatformInstaller(
  platform: "macos" | "windows" | "android",
  arch: "x64" | "arm64" = "x64",
): DownloadFile | undefined {
  if (platform === "macos") {
    return release.files.find((file) => file.platform === "macos" && file.arch === "arm64");
  }
  if (platform === "android") {
    return release.files.find((file) => file.platform === "android");
  }
  return (
    release.files.find((file) => file.platform === "windows" && file.arch === arch) ??
    release.files.find((file) => file.platform === "windows" && file.arch === "x64")
  );
}

export function formatSize(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}

const INSTALLER_MIRROR_BASE = "https://agent-relay.clawmuse.com/updates/installers";

// Publication must verify the mirror before updating the manifest; see docs/release.md.
export function installerMirrorUrl(file: DownloadFile): string {
  return `${INSTALLER_MIRROR_BASE}/v${fileVersion(file)}/${encodeURIComponent(file.filename)}`;
}

// The release page lists every installer with its checksums for anyone who wants them.
export function githubReleaseUrl(): string {
  return `https://github.com/endvin/clawmuse-releases/releases/tag/v${release.version}`;
}
