import { createReadStream } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { prepareDesktopUpdates } from "./prepare-desktop-updates.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const directory = process.argv[2];
if (!directory)
  throw new Error("Usage: node scripts/prepare-clawmuse-downloads.mjs <artifact-directory>");
const { version } = JSON.parse(
  await readFile(resolve(root, "packages/desktop/package.json"), "utf8"),
);
const manifestPath = resolve(root, "packages/website/clawmuse/releases.json");
const previous = JSON.parse(await readFile(manifestPath, "utf8"));
const downloadBase = `https://github.com/endvin/clawmuse-releases/releases/download/v${version}`;
const files = [];
for (const filename of (await readdir(directory)).sort()) {
  if (!filename.startsWith("ClawMuse-")) continue;
  const patterns = [
    [/^ClawMuse-Setup-(.+)-(x64|arm64)(?:-r\d+)?\.exe$/, "windows", "EXE"],
    [/^ClawMuse-(.+)-(x64|arm64)\.dmg$/, "macos", "DMG"],
    [/^ClawMuse-(x64|x86_64|arm64|aarch64)\.AppImage$/, "linux", "AppImage"],
    [/^ClawMuse-(.+)-(x64|arm64|amd64|x86_64|aarch64)\.(deb|rpm|tar\.gz)$/, "linux", null],
    [/^ClawMuse-(.+)-android\.apk$/, "android", "APK"],
  ];
  const pattern = patterns.find(([regex]) => regex.test(filename));
  if (!pattern) continue;
  const [regex, platform, fixedFormat] = pattern;
  const match = filename.match(regex);
  const stableName = fixedFormat === "AppImage";
  if (!stableName && match[1] !== version)
    throw new Error(`Version mismatch: ${filename} (expected ${version})`);
  const file = resolve(directory, filename);
  const size = (await stat(file)).size;
  if (size < 1_000_000) throw new Error(`Installer is unexpectedly small: ${filename}`);
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  let arch = stableName ? match[1] : match[2];
  if (arch === "amd64" || arch === "x86_64") arch = "x64";
  if (arch === "aarch64") arch = "arm64";
  if (platform === "android") arch = "universal";
  files.push({
    platform,
    arch,
    format: fixedFormat ?? match[3].toUpperCase(),
    filename: basename(filename),
    url: `${downloadBase}/${encodeURIComponent(filename)}`,
    size,
    sha256: hash.digest("hex"),
  });
}
if (files.length === 0) throw new Error("No completed ClawMuse installers found");
// A website installer must have a usable update feed from the same build.
const desktopPlatforms = new Set(
  files.map((file) => file.platform).filter((platform) => platform !== "android"),
);
const candidate = await mkdtemp(resolve(tmpdir(), "clawmuse-download-check-"));
try {
  for (const platform of desktopPlatforms) {
    await prepareDesktopUpdates(directory, resolve(candidate, platform), {
      platform,
      expectedVersion: version,
    });
  }
} finally {
  await rm(candidate, { recursive: true, force: true });
}
const appStoreUrl = process.env.CLAWMUSE_APP_STORE_URL || previous.ios.url;
if (
  !appStoreUrl ||
  !/^https:\/\/apps\.apple\.com\/(?:[a-z]{2}\/)?app\/(?:[a-zA-Z0-9-]+\/)?id[0-9]+$/.test(
    appStoreUrl,
  )
) {
  throw new Error("Expected an Apple App Store URL");
}
// Retain checksums for existing downloads while pointing Windows users to the latest rebuild.
const windowsRevision = (file) => Number(file.filename.match(/-r(\d+)\.exe$/)?.[1] ?? 0);
const currentFiles = files.filter(
  (file) =>
    file.platform !== "windows" ||
    !files.some(
      (other) =>
        other.platform === "windows" &&
        other.arch === file.arch &&
        windowsRevision(other) > windowsRevision(file),
    ),
);
const manifest = {
  version,
  checksumsUrl: `${downloadBase}/SHA256SUMS.txt`,
  publishedAt: new Date().toISOString(),
  files: currentFiles,
  ios: {
    url: appStoreUrl,
    status: "available",
  },
};
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
await mkdir(directory, { recursive: true });
await writeFile(
  resolve(directory, "SHA256SUMS.txt"),
  files.map((file) => `${file.sha256}  ${file.filename}\n`).join(""),
);
console.log(
  `Prepared ${currentFiles.length} current installers for ClawMuse ${version}; ${files.length} files checksummed`,
);
