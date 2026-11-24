import manifest from "./releases.json" with { type: "json" };
import betaManifest from "./beta-releases.json" with { type: "json" };

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

export interface ReleaseManifest {
  version: string;
  checksumsUrl: string;
  publishedAt: string | null;
  mirrored?: boolean;
  files: DownloadFile[];
  ios?: typeof manifest.ios;
}

export const release = manifest as ReleaseManifest & { ios: typeof manifest.ios };
export const betaRelease = betaManifest as ReleaseManifest;

function parseCoreTriplet(version: string): [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function hasActiveBetaRelease(): boolean {
  if (betaRelease.files.length === 0) return false;
  const betaCore = parseCoreTriplet(betaRelease.version);
  const stableCore = parseCoreTriplet(release.version);
  if (!betaCore || !stableCore) return false;
  for (let i = 0; i < 3; i += 1) {
    if (betaCore[i] !== stableCore[i]) return betaCore[i] > stableCore[i];
  }
  return release.version.includes("-beta.");
}

export function fileVersion(file: DownloadFile, manifestVersion = release.version): string {
  return file.version ?? manifestVersion;
}

export function platformVersion(
  platform: DownloadPlatform,
  target: ReleaseManifest = release,
): string {
  const match = target.files.find((file) => file.platform === platform);
  return match ? fileVersion(match, target.version) : target.version;
}

export function primaryPlatformInstaller(
  platform: "macos" | "windows" | "android",
  arch?: "x64" | "arm64",
): DownloadFile | undefined {
  if (platform === "macos") {
    const preferred = arch ?? "arm64";
    return (
      release.files.find((file) => file.platform === "macos" && file.arch === preferred) ??
      release.files.find((file) => file.platform === "macos" && file.arch === "arm64") ??
      release.files.find((file) => file.platform === "macos")
    );
  }
  if (platform === "android") {
    return release.files.find((file) => file.platform === "android");
  }
  const preferred = arch ?? "x64";
  return (
    release.files.find((file) => file.platform === "windows" && file.arch === preferred) ??
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

export function installerDownloadUrl(file: DownloadFile, mirrored = true): string {
  return mirrored ? installerMirrorUrl(file) : file.url;
}

// The release page lists every installer with its checksums for anyone who wants them.
export function githubReleaseUrl(version = release.version): string {
  return `https://github.com/endvin/clawmuse-releases/releases/tag/v${version}`;
}
