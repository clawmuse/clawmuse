import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  chmod,
  copyFile,
  mkdir,
  link,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { dump, load } from "js-yaml";
import { isMainModule } from "./is-main-module.mjs";
import { MACOS_MINIMUM_DARWIN_VERSION } from "./merge-mac-manifest.mjs";

const manifestPattern = /^(latest|beta)(?:-mac|-linux(?:-(?:arm64|arm))?)?\.yml$/;
const versionPattern =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-beta\.(?:0|[1-9]\d*))?(?:\+[0-9]{4})?$/;
const filenamePattern = /^ClawMuse[A-Za-z0-9._+-]*\.(?:exe|zip|dmg|AppImage|deb|rpm)$/;

async function sha512(file) {
  const hash = createHash("sha512");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("base64");
}

function updateExtension(name) {
  if (name.endsWith("-mac.yml")) return ".zip";
  if (name.includes("-linux")) return ".AppImage";
  return ".exe";
}

function validateManifest(manifest, name, expectedVersion) {
  if (!manifest || typeof manifest !== "object" || !versionPattern.test(manifest.version)) {
    throw new Error(`${name}: invalid release version`);
  }
  if (expectedVersion !== undefined && manifest.version !== expectedVersion) {
    throw new Error(`${name}: expected version ${expectedVersion}, got ${manifest.version}`);
  }
  const channel = manifest.version.includes("-beta.") ? "beta" : "latest";
  if (!name.startsWith(`${channel}.`) && !name.startsWith(`${channel}-`)) {
    throw new Error(`${name}: wrong channel for ${manifest.version}`);
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error(`${name}: missing installer files`);
  }
  const extension = updateExtension(name);
  if (
    !manifest.files.some((file) => typeof file?.url === "string" && file.url.endsWith(extension))
  ) {
    throw new Error(`${name}: missing ${extension} update target`);
  }
  if (
    typeof manifest.releaseDate !== "string" ||
    !Number.isFinite(Date.parse(manifest.releaseDate))
  ) {
    throw new Error(`${name}: invalid releaseDate`);
  }
  if (manifest.path !== undefined) {
    const legacyFile = manifest.files.find((file) => file.url === manifest.path);
    if (!legacyFile || (manifest.sha512 !== undefined && manifest.sha512 !== legacyFile.sha512)) {
      throw new Error(`${name}: legacy installer reference does not match files`);
    }
  }
  if (manifest.packages !== undefined) {
    throw new Error(`${name}: unsupported update packages; use the NSIS target`);
  }
}

async function verifyInstaller(source, file) {
  if (!file || typeof file.url !== "string" || !filenamePattern.test(file.url)) {
    throw new Error("Installer must be a local filename");
  }
  if (typeof file.sha512 !== "string" || !/^[A-Za-z0-9+/]{86}==$/.test(file.sha512)) {
    throw new Error(`${file.url}: invalid SHA-512 checksum`);
  }
  const artifactPath = path.join(source, file.url);
  const info = await stat(artifactPath);
  if (!info.isFile() || (file.size !== undefined && file.size !== info.size)) {
    throw new Error(`${file.url}: installer size mismatch`);
  }
  if ((await sha512(artifactPath)) !== file.sha512) {
    throw new Error(`${file.url}: installer checksum mismatch`);
  }
}

async function installVersionDirectory(staging, releaseDirectory) {
  await mkdir(path.dirname(releaseDirectory), { recursive: true });
  await chmod(path.dirname(releaseDirectory), 0o755);
  await chmod(staging, 0o755);
  try {
    await rename(staging, releaseDirectory);
  } catch (error) {
    if (error.code !== "EEXIST" && error.code !== "ENOTEMPTY") throw error;
    // Another platform may publish this version later. Add its files without replacing bytes
    // already referenced by a public manifest.
    for (const name of await readdir(staging)) {
      try {
        await link(path.join(staging, name), path.join(releaseDirectory, name));
      } catch (linkError) {
        if (linkError.code !== "EEXIST") throw linkError;
        if (
          (await sha512(path.join(staging, name))) !==
          (await sha512(path.join(releaseDirectory, name)))
        ) {
          throw new Error(`${name}: cannot replace an existing release artifact`, {
            cause: linkError,
          });
        }
      }
    }
  }
}

// The output is a candidate directory. Publish it only after reviewing the release.
export async function prepareDesktopUpdates(
  source,
  output,
  { platform = "all", expectedVersion } = {},
) {
  const platformPatterns = {
    all: manifestPattern,
    macos: /^(latest|beta)-mac\.yml$/,
    linux: /^(latest|beta)-linux(?:-(?:arm64|arm))?\.yml$/,
    windows: /^(latest|beta)\.yml$/,
  };
  const selectedPattern = platformPatterns[platform];
  if (!selectedPattern) throw new Error(`Unsupported desktop platform: ${platform}`);
  const sourceFiles = await readdir(source);
  const manifestNames = sourceFiles.filter((name) => selectedPattern.test(name)).sort();
  if (manifestNames.length === 0) {
    throw new Error("No desktop update manifests found. Rebuild with the generic update provider.");
  }
  const manifests = [];
  const artifacts = new Map();
  let version;
  for (const name of manifestNames) {
    const manifest = load(await readFile(path.join(source, name), "utf8"));
    validateManifest(manifest, name, expectedVersion);
    if (version !== undefined && version !== manifest.version) {
      throw new Error("All desktop manifests must belong to the same release version");
    }
    version = manifest.version;
    for (const file of manifest.files) {
      await verifyInstaller(source, file);
      const previous = artifacts.get(file.url);
      if (previous && previous.sha512 !== file.sha512) {
        throw new Error(`${file.url}: conflicting installer checksums`);
      }
      artifacts.set(file.url, file);
    }
    if (manifest.path !== undefined) manifest.path = `releases/${version}/${manifest.path}`;
    manifest.files = manifest.files.map((file) => ({
      ...file,
      url: `releases/${version}/${file.url}`,
    }));
    if (name.endsWith("-mac.yml")) manifest.minimumSystemVersion = MACOS_MINIMUM_DARWIN_VERSION;
    const contents = dump(manifest, { lineWidth: -1, noRefs: true });
    manifests.push({ name, contents });
    if (name.startsWith("latest"))
      manifests.push({ name: name.replace(/^latest/, "beta"), contents });
  }

  await mkdir(output, { recursive: true });
  await chmod(output, 0o755);
  const staging = await mkdtemp(path.join(output, ".staging-"));
  try {
    // Verify the copied bytes too: a build must not change under the publisher.
    for (const [name, file] of artifacts) {
      await copyFile(path.join(source, name), path.join(staging, name));
      if ((await sha512(path.join(staging, name))) !== file.sha512) {
        throw new Error(`${name}: installer changed while staging`);
      }
      if (sourceFiles.includes(`${name}.blockmap`)) {
        await copyFile(
          path.join(source, `${name}.blockmap`),
          path.join(staging, `${name}.blockmap`),
        );
      }
    }
    for (const name of await readdir(staging)) await chmod(path.join(staging, name), 0o644);
    const releaseDirectory = path.join(output, "releases", version);
    await installVersionDirectory(staging, releaseDirectory);
    for (const manifest of manifests) {
      const temporary = path.join(output, `.${manifest.name}-${randomUUID()}`);
      await writeFile(temporary, manifest.contents);
      await chmod(temporary, 0o644);
      await rename(temporary, path.join(output, manifest.name));
    }
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  return manifests.map(({ name }) => name);
}

if (isMainModule(import.meta.url)) {
  const [source, output, flag, platform] = process.argv.slice(2);
  if (
    !source ||
    !output ||
    path.resolve(source) === path.resolve(output) ||
    (flag && flag !== "--platform") ||
    (flag && !platform)
  ) {
    throw new Error(
      "Usage: node scripts/prepare-desktop-updates.mjs <artifact-directory> <candidate-directory> [--platform macos|linux|windows]",
    );
  }
  const names = await prepareDesktopUpdates(source, output, { platform });
  console.log(`已校验并准备桌面更新清单：${names.join(", ")}`);
}
