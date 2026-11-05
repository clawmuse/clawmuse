import { brand } from "../../brand.generated.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import { app } from "electron";
import log from "electron-log/main";
import {
  cliCommandNames,
  isOwnCliTarget,
  planCliInstall,
  type CliTargetState,
} from "./cli-names.js";
import { resolveCliInstallSourcePath } from "./path.js";
import { getBundledCliShimPath, getCliTargetPath, getLocalBinDir } from "./paths.js";
import { ensurePathInShellRc } from "./shell-rc.js";

interface InstallStatus {
  installed: boolean;
  /** Command names left alone because another program already provides them. */
  skipped: string[];
}

const WINDOWS_EXECUTABLE_EXTENSIONS = [".exe", ".cmd", ".bat", ".com"];
const MAX_TRAMPOLINE_BYTES = 64 * 1024;

function resolveSources(): { shimPath: string; installSourcePath: string } {
  const shimPath = getBundledCliShimPath();
  const installSourcePath = resolveCliInstallSourcePath({
    platform: process.platform,
    isPackaged: app.isPackaged,
    executablePath: app.getPath("exe"),
    shimPath,
    appImagePath: process.env.APPIMAGE,
  });
  return { shimPath, installSourcePath };
}

async function readTargetState(targetPath: string, sourcePaths: string[]): Promise<CliTargetState> {
  let stat;
  try {
    stat = await fs.lstat(targetPath);
  } catch {
    return "missing";
  }
  if (stat.isSymbolicLink()) {
    const target = await fs.readlink(targetPath);
    return isOwnCliTarget({ kind: "symlink", target }, { sourcePaths }) ? "ours" : "foreign";
  }
  if (stat.isFile() && stat.size <= MAX_TRAMPOLINE_BYTES) {
    const content = await fs.readFile(targetPath, "utf-8");
    return isOwnCliTarget({ kind: "file", content }, { sourcePaths }) ? "ours" : "foreign";
  }
  return "foreign";
}

async function namesProvidedElsewhereOnPath(
  names: string[],
  localBinDir: string,
): Promise<Set<string>> {
  const found = new Set<string>();
  const directories = (process.env.PATH ?? "")
    .split(path.delimiter)
    .filter((directory) => directory && path.resolve(directory) !== path.resolve(localBinDir));
  const candidatesFor = (name: string) =>
    process.platform === "win32"
      ? WINDOWS_EXECUTABLE_EXTENSIONS.map((extension) => `${name}${extension}`)
      : [name];
  for (const name of names) {
    for (const directory of directories) {
      const hits = await Promise.all(
        candidatesFor(name).map((filename) =>
          fs.access(path.join(directory, filename)).then(
            () => true,
            () => false,
          ),
        ),
      );
      if (hits.some(Boolean)) {
        found.add(name);
        break;
      }
    }
  }
  return found;
}

async function inspectCliInstall() {
  const sources = resolveSources();
  const sourcePaths = [sources.shimPath, sources.installSourcePath];
  const names = cliCommandNames();
  const targets: Record<string, CliTargetState> = {};
  for (const name of names)
    targets[name] = await readTargetState(getCliTargetPath(name), sourcePaths);
  const onPath = await namesProvidedElsewhereOnPath(names, getLocalBinDir());
  return { sources, targets, plan: planCliInstall({ names, targets, onPath }) };
}

function trampoline(shimPath: string): string {
  // Only the app install path is baked in — internal details (asar layout,
  // entrypoint scripts) live in the bundled shim and update with the app.
  return [
    "@echo off",
    `set "BUNDLED_CLI=${shimPath}"`,
    `if not exist "%BUNDLED_CLI%" (`,
    `  echo ${brand.name} CLI not found at %BUNDLED_CLI% — is ${brand.name} installed? 1>&2`,
    `  exit /b 1`,
    `)`,
    `call "%BUNDLED_CLI%" %*`,
    `exit /b %errorlevel%`,
  ].join("\r\n");
}

export async function installCli(): Promise<InstallStatus> {
  const { sources, targets, plan } = await inspectCliInstall();
  await fs.mkdir(getLocalBinDir(), { recursive: true });

  for (const name of plan.install) {
    const targetPath = getCliTargetPath(name);
    if (targets[name] !== "missing") await fs.unlink(targetPath);
    if (process.platform === "win32") {
      await fs.writeFile(targetPath, trampoline(sources.shimPath), "utf-8");
    } else {
      await fs.symlink(sources.installSourcePath, targetPath);
    }
  }
  if (plan.skipped.length > 0) {
    log.warn("[integrations] Skipped CLI names provided by another program", {
      skipped: plan.skipped,
    });
  }

  const { shellUpdated } = await ensurePathInShellRc();
  if (shellUpdated) {
    log.info("[integrations] Updated shell rc with ~/.local/bin PATH");
  }

  return getCliInstallStatus();
}

export async function getCliInstallStatus(): Promise<InstallStatus> {
  const { targets, plan } = await inspectCliInstall();
  return {
    installed: plan.install.every((name) => targets[name] === "ours"),
    skipped: plan.skipped,
  };
}
