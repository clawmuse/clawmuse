import { createReadStream } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { isMainModule } from "./is-main-module.mjs";
import { prepareDesktopUpdates, verifyDesktopUpdateManifests } from "./prepare-desktop-updates.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const sha256Pattern = /^[a-f0-9]{64}$/;
const sha512Pattern = /^[A-Za-z0-9+/]{86}==$/;

async function loadMetadataMap(metadataPath) {
  if (!metadataPath) return new Map();
  const parsed = JSON.parse(await readFile(metadataPath, "utf8"));
  if (!parsed || !Array.isArray(parsed.files)) {
    throw new Error(`Invalid metadata file: ${metadataPath}`);
  }
  const byName = new Map();
  for (const entry of parsed.files) {
    if (
      !entry ||
      typeof entry.filename !== "string" ||
      entry.filename.length === 0 ||
      basename(entry.filename) !== entry.filename ||
      entry.filename.includes("/") ||
      entry.filename.includes("\\")
    ) {
      throw new Error(`Invalid metadata filename: ${String(entry?.filename)}`);
    }
    if (!Number.isInteger(entry.size) || entry.size < 0) {
      throw new Error(`Invalid metadata size for ${entry.filename}`);
    }
    if (typeof entry.sha256 !== "string" || !sha256Pattern.test(entry.sha256)) {
      throw new Error(`Invalid metadata SHA-256 for ${entry.filename}`);
    }
    if (
      entry.sha512 !== undefined &&
      (typeof entry.sha512 !== "string" || !sha512Pattern.test(entry.sha512))
    ) {
      throw new Error(`Invalid metadata SHA-512 for ${entry.filename}`);
    }
    if (byName.has(entry.filename)) {
      throw new Error(`Duplicate metadata entry for ${entry.filename}`);
    }
    byName.set(entry.filename, {
      size: entry.size,
      sha256: entry.sha256,
      sha512: entry.sha512,
    });
  }
  return byName;
}

async function computeSha256(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

function parseCliArgs(args) {
  let directory;
  let noMirror = false;
  let beta = false;
  let mergeExisting = false;
  let metadataPath;
  let version;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--no-mirror") {
      noMirror = true;
    } else if (arg === "--beta") {
      beta = true;
    } else if (arg === "--merge-existing") {
      mergeExisting = true;
    } else if (arg === "--metadata") {
      metadataPath = args[i + 1];
      if (!metadataPath || metadataPath.startsWith("-")) {
        throw new Error("Missing value for --metadata");
      }
      i += 1;
    } else if (arg.startsWith("--metadata=")) {
      metadataPath = arg.slice("--metadata=".length);
      if (!metadataPath) throw new Error("Missing value for --metadata");
    } else if (arg === "--version") {
      version = args[i + 1];
      if (!version || version.startsWith("-")) {
        throw new Error("Missing value for --version");
      }
      i += 1;
    } else if (arg.startsWith("--version=")) {
      version = arg.slice("--version=".length);
      if (!version) throw new Error("Missing value for --version");
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (!directory) {
      directory = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }
  if (!directory) {
    throw new Error(
      "Usage: node scripts/prepare-clawmuse-downloads.mjs <artifact-directory> [--beta] [--merge-existing] [--version <ver>] [--no-mirror] [--metadata <path>]",
    );
  }
  return { directory, beta, mergeExisting, noMirror, metadataPath, version };
}

const INSTALLER_PATTERNS = [
  [/^ClawMuse-Setup-(.+)-(x64|arm64)(?:-r\d+)?\.exe$/, "windows", "EXE"],
  [/^ClawMuse-(.+)-(x64|arm64)\.dmg$/, "macos", "DMG"],
  [/^ClawMuse-(x64|x86_64|arm64|aarch64)\.AppImage$/, "linux", "AppImage"],
  [/^ClawMuse-(.+)-(x64|arm64|amd64|x86_64|aarch64)\.(deb|rpm|tar\.gz)$/, "linux", null],
  [/^ClawMuse-(.+)-android\.apk$/, "android", "APK"],
];

function matchInstallerFile(filename, version) {
  if (!filename.startsWith("ClawMuse-")) return null;
  const pattern = INSTALLER_PATTERNS.find(([regex]) => regex.test(filename));
  if (!pattern) return null;
  const [regex, platform, fixedFormat] = pattern;
  const match = filename.match(regex);
  const stableName = fixedFormat === "AppImage";
  if (!stableName && match[1] !== version) {
    throw new Error(`Version mismatch: ${filename} (expected ${version})`);
  }
  let arch = stableName ? match[1] : match[2];
  if (arch === "amd64" || arch === "x86_64") arch = "x64";
  if (arch === "aarch64") arch = "arm64";
  if (platform === "android") arch = "universal";
  return {
    platform,
    arch,
    format: fixedFormat ?? match[3].toUpperCase(),
  };
}

async function resolveInstallerDigest(filePath, filename, metadataByName) {
  let localInfo = null;
  try {
    localInfo = await stat(filePath);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const meta = metadataByName.get(filename);
  if (!localInfo) {
    if (!meta) throw new Error(`Missing installer file: ${filename}`);
    return { size: meta.size, sha256: meta.sha256 };
  }
  if (!localInfo.isFile()) throw new Error(`Expected regular installer file: ${filename}`);
  const size = localInfo.size;
  const sha256 = await computeSha256(filePath);
  if (meta) {
    if (meta.size !== size) {
      throw new Error(`Size mismatch for ${filename} (local ${size} vs metadata ${meta.size})`);
    }
    if (meta.sha256 !== sha256) {
      throw new Error(`SHA-256 mismatch for ${filename}`);
    }
  }
  return { size, sha256 };
}

async function validateDesktopFeeds(directory, desktopPlatforms, version, metadataByName) {
  if (metadataByName.size > 0) {
    for (const platform of desktopPlatforms) {
      await verifyDesktopUpdateManifests(directory, {
        platform,
        expectedVersion: version,
        fileMetadata: metadataByName,
      });
    }
    return;
  }
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
}

function buildDownloadManifest({
  isBeta,
  version,
  downloadBase,
  noMirror,
  currentFiles,
  appStoreUrl,
}) {
  if (isBeta) {
    return {
      version,
      checksumsUrl: `${downloadBase}/SHA256SUMS.txt`,
      publishedAt: new Date().toISOString(),
      mirrored: !noMirror,
      files: currentFiles,
    };
  }
  return {
    version,
    checksumsUrl: `${downloadBase}/SHA256SUMS.txt`,
    publishedAt: new Date().toISOString(),
    files: currentFiles,
    ios: {
      url: appStoreUrl,
      status: "available",
    },
  };
}

async function loadSameVersionBetaFiles(manifestPath, version) {
  let raw;
  try {
    raw = await readFile(manifestPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const existing = JSON.parse(raw);
  if (!existing || existing.version !== version || !Array.isArray(existing.files)) {
    return [];
  }
  return existing.files.filter(
    (item) =>
      item &&
      typeof item.filename === "string" &&
      typeof item.sha256 === "string" &&
      sha256Pattern.test(item.sha256) &&
      Number.isInteger(item.size) &&
      item.size >= 1_000_000,
  );
}

export async function prepareClawmuseDownloads(
  directory,
  {
    beta = false,
    mergeExisting = false,
    noMirror = false,
    metadataPath,
    version: explicitVersion,
    rootDir = root,
  } = {},
) {
  const version =
    explicitVersion ||
    JSON.parse(await readFile(resolve(rootDir, "packages/desktop/package.json"), "utf8")).version;
  const isBeta = beta || version.includes("-beta.");
  const manifestPath = resolve(
    rootDir,
    isBeta
      ? "packages/website/clawmuse/beta-releases.json"
      : "packages/website/clawmuse/releases.json",
  );
  const stableManifest = JSON.parse(
    await readFile(resolve(rootDir, "packages/website/clawmuse/releases.json"), "utf8"),
  );
  const metadataByName = await loadMetadataMap(metadataPath);
  const downloadBase = `https://github.com/endvin/clawmuse-releases/releases/download/v${version}`;
  const candidateNames = [
    ...new Set([...(await readdir(directory)), ...metadataByName.keys()]),
  ].sort();

  const files = [];
  for (const filename of candidateNames) {
    const parsed = matchInstallerFile(filename, version);
    if (!parsed) continue;
    const { size, sha256 } = await resolveInstallerDigest(
      resolve(directory, filename),
      filename,
      metadataByName,
    );
    if (size < 1_000_000) throw new Error(`Installer is unexpectedly small: ${filename}`);
    files.push({
      ...parsed,
      filename: basename(filename),
      url: `${downloadBase}/${encodeURIComponent(filename)}`,
      size,
      sha256,
    });
  }
  if (files.length === 0) throw new Error("No completed ClawMuse installers found");

  // A website installer must have a usable update feed from the same build.
  const desktopPlatforms = new Set(
    files.map((file) => file.platform).filter((platform) => platform !== "android"),
  );
  await validateDesktopFeeds(directory, desktopPlatforms, version, metadataByName);

  const appStoreUrl = process.env.CLAWMUSE_APP_STORE_URL || stableManifest.ios.url;
  if (
    !appStoreUrl ||
    !/^https:\/\/apps\.apple\.com\/(?:[a-z]{2}\/)?app\/(?:[a-zA-Z0-9-]+\/)?id[0-9]+$/.test(
      appStoreUrl,
    )
  ) {
    throw new Error("Expected an Apple App Store URL");
  }
  // Retain checksums for existing downloads while pointing Windows users to the latest rebuild.
  const mergedFilesMap = new Map();
  if (isBeta && mergeExisting) {
    for (const prev of await loadSameVersionBetaFiles(manifestPath, version)) {
      mergedFilesMap.set(prev.filename, prev);
    }
  }
  for (const file of files) {
    mergedFilesMap.set(file.filename, file);
  }
  const allFiles = [...mergedFilesMap.values()].sort((a, b) =>
    a.filename.localeCompare(b.filename),
  );
  const windowsRevision = (file) => Number(file.filename.match(/-r(\d+)\.exe$/)?.[1] ?? 0);
  const currentFiles = allFiles.filter(
    (file) =>
      file.platform !== "windows" ||
      !allFiles.some(
        (other) =>
          other.platform === "windows" &&
          other.arch === file.arch &&
          windowsRevision(other) > windowsRevision(file),
      ),
  );
  const manifest = buildDownloadManifest({
    isBeta,
    version,
    downloadBase,
    noMirror,
    currentFiles,
    appStoreUrl,
  });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await mkdir(directory, { recursive: true });
  const checksumsPath = resolve(directory, "SHA256SUMS.txt");
  await writeFile(
    checksumsPath,
    allFiles.map((file) => `${file.sha256}  ${file.filename}\n`).join(""),
  );
  return {
    version,
    manifestPath,
    checksumsPath,
    currentCount: currentFiles.length,
    totalCount: allFiles.length,
  };
}

if (isMainModule(import.meta.url)) {
  const { directory, beta, mergeExisting, noMirror, metadataPath, version } = parseCliArgs(
    process.argv.slice(2),
  );
  const result = await prepareClawmuseDownloads(directory, {
    beta,
    mergeExisting,
    noMirror,
    metadataPath,
    version,
  });
  console.log(
    `Prepared ${result.currentCount} current installers for ClawMuse ${result.version}; ${result.totalCount} files checksummed`,
  );
}
