import { execFile, spawn } from "node:child_process";
import { constants, closeSync, mkdirSync, openSync, writeFileSync } from "node:fs";
import { access, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

export interface MacBundleInstallation {
  version: string;
  appPath: string;
  staging: string;
}

export function macAppPath(executable: string): string {
  const marker = ".app/Contents/MacOS/";
  const index = executable.lastIndexOf(marker);
  if (index < 0 || executable.includes("/AppTranslocation/")) {
    throw new Error("Move ClawMuse into Applications before installing an update.");
  }
  return executable.slice(0, index + 4);
}

export async function prepareMacBundleInstallation(input: {
  zipPath: string;
  executable: string;
  bundleId: string;
  version: string;
}): Promise<MacBundleInstallation> {
  const appPath = macAppPath(input.executable);
  await access(path.dirname(appPath), constants.W_OK);
  const staging = await mkdtemp(path.join(path.dirname(appPath), ".clawmuse-update-"));
  try {
    await run("/usr/bin/ditto", ["-x", "-k", input.zipPath, staging]);
    const candidate = path.join(staging, path.basename(appPath));
    const plist = path.join(candidate, "Contents", "Info.plist");
    const { stdout: bundleId } = await run("/usr/libexec/PlistBuddy", [
      "-c",
      "Print :CFBundleIdentifier",
      plist,
    ]);
    const { stdout: version } = await run("/usr/libexec/PlistBuddy", [
      "-c",
      "Print :CFBundleShortVersionString",
      plist,
    ]);
    if (bundleId.trim() !== input.bundleId || version.trim() !== input.version) {
      throw new Error(
        "Downloaded Mac bundle does not match the requested application and version.",
      );
    }
    await access(
      path.join(candidate, "Contents", "MacOS", path.basename(input.executable)),
      constants.X_OK,
    );
    return { appPath, staging, version: input.version };
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

// Like Cindy, replace the complete bundle after exit. Keep the previous bundle until
// the replacement has launched; never delete the installed app before a successful swap.
export const MAC_BUNDLE_INSTALL_SCRIPT = `#!/usr/bin/env bash
set -euo pipefail
staging="$1"
app_path="$2"
old_pid="$3"
restart="$4"
wait_limit="$5"
process_pattern="$6"
new_app="$staging/$(basename "$app_path")"
backup="$staging/previous.app"
lock="$app_path.clawmuse-update-lock"
[ -d "$new_app/Contents" ]
mkdir "$lock" || exit 1
finish() {
  result=$?
  trap - EXIT
  if [ "$result" -ne 0 ] && [ -d "$backup" ]; then
    if [ -e "$app_path" ]; then mv "$app_path" "$staging/failed.app"; fi
    mv "$backup" "$app_path"
    if [ "$restart" = 1 ]; then /usr/bin/open "$app_path" || true; fi
  fi
  rmdir "$lock"
  exit "$result"
}
trap finish EXIT
waited=0
while kill -0 "$old_pid" 2>/dev/null; do
  if [ "$waited" -ge "$wait_limit" ]; then
    echo "App did not exit; leaving the installed bundle intact" >&2
    exit 1
  fi
  sleep 1
  waited=$((waited + 1))
done
if /usr/bin/pgrep -f "$process_pattern" >/dev/null; then
  echo "Another app instance is running; leaving the installed bundle intact" >&2
  exit 1
fi
mv "$app_path" "$backup"
mv "$new_app" "$app_path"
if [ "$restart" = 1 ]; then
  /usr/bin/open "$app_path"
  launched=0
  for attempt in $(seq 1 30); do
    if /usr/bin/pgrep -f "$process_pattern" >/dev/null; then launched=1; break; fi
    sleep 1
  done
  [ "$launched" = 1 ]
fi
rm -rf "$staging"
`;

export function launchMacBundleInstallation(input: {
  installation: MacBundleInstallation;
  restart: boolean;
  logPath: string;
}): void {
  const { installation, restart, logPath } = input;
  const scriptPath = path.join(installation.staging, "install.sh");
  writeFileSync(scriptPath, MAC_BUNDLE_INSTALL_SCRIPT, { mode: 0o700 });
  mkdirSync(path.dirname(logPath), { recursive: true });
  const log = openSync(logPath, "a", 0o600);
  const escapedApp = installation.appPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  try {
    const child = spawn(
      "/bin/bash",
      [
        scriptPath,
        installation.staging,
        installation.appPath,
        String(process.pid),
        restart ? "1" : "0",
        "120",
        `^${escapedApp}/Contents/MacOS/`,
      ],
      { detached: true, stdio: ["ignore", log, log] },
    );
    child.on("error", (error) => console.error("Mac update installer failed to start", error));
    if (child.pid === undefined) throw new Error("Could not start the Mac update installer.");
    child.unref();
  } finally {
    closeSync(log);
  }
}
