import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const appRoot = fileURLToPath(new URL("..", import.meta.url));

export function resolveUpdateTarget(info, expo, fingerprint) {
  const project = /^https:\/\/u\.expo\.dev\/([0-9a-f-]{36})$/i.exec(expo.EXUpdatesURL ?? "");
  const channel = expo.EXUpdatesRequestHeaders?.["expo-channel-name"];
  const runtime = fingerprint.trim();
  if (!expo.EXUpdatesEnabled || !project || !channel || !/^[a-f0-9]{40,64}$/i.test(runtime)) {
    throw new Error(
      "Archive does not contain an enabled EAS Update project, channel, and fingerprint.",
    );
  }
  if (!/^\d+$/.test(info.CFBundleVersion ?? "")) {
    throw new Error("Archive has no valid iOS build number.");
  }
  return { projectId: project[1], channel, runtime, buildNumber: info.CFBundleVersion };
}

export function verifyUpdateRuntime(target, generated) {
  if (target.runtime !== generated.hash) {
    throw new Error(
      `Native fingerprint mismatch: archive ${target.runtime}, source ${generated.hash}. Use matching native sources or install a new TestFlight build.`,
    );
  }
}

function run() {
  const { values } = parseArgs({
    options: {
      archive: { type: "string" },
      message: { type: "string" },
      check: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });
  if (values.help) {
    console.log(
      'node scripts/publish-ios-update.mjs --archive "/path/to/ClawMuse.xcarchive" --message "What changed" [--check]',
    );
    return;
  }
  if (!values.archive || (!values.check && !values.message?.trim())) {
    throw new Error("Specify --archive and --message, or --archive and --check.");
  }
  if (process.env.EXPO_PUBLIC_LOCAL_DAEMON || process.env.PASEO_FDROID_BUILD === "1") {
    throw new Error("Remove local daemon and F-Droid overrides before publishing.");
  }
  const applications = path.join(path.resolve(values.archive), "Products/Applications");
  const apps = readdirSync(applications).filter((entry) => entry.endsWith(".app"));
  if (apps.length !== 1) throw new Error("Expected exactly one app in the archive.");
  const app = path.join(applications, apps[0]);
  const plist = (name) =>
    JSON.parse(
      execFileSync("plutil", ["-convert", "json", "-o", "-", path.join(app, name)], {
        encoding: "utf8",
      }),
    );
  const target = resolveUpdateTarget(
    plist("Info.plist"),
    plist("Expo.plist"),
    readFileSync(path.join(app, "EXUpdates.bundle/fingerprint"), "utf8"),
  );
  const env = {
    ...process.env,
    APP_VARIANT: "production",
    EAS_PROJECT_ID: target.projectId,
    CLAWMUSE_IOS_BUILD_NUMBER: target.buildNumber,
    CLAWMUSE_UPDATE_CHANNEL: target.channel,
  };
  const generated = JSON.parse(
    execFileSync(
      "npx",
      ["--no-install", "expo-updates", "fingerprint:generate", "--platform", "ios"],
      { cwd: appRoot, env, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
    ),
  );
  verifyUpdateRuntime(target, generated);
  console.log(
    `Verified iOS build ${target.buildNumber}, channel ${target.channel}, runtime ${target.runtime}.`,
  );
  if (values.check) return;
  const result = spawnSync(
    "npx",
    [
      "--no-install",
      "eas",
      "update",
      "--channel",
      target.channel,
      "--platform",
      "ios",
      "--environment",
      "production",
      "--message",
      values.message,
      "--non-interactive",
    ],
    { cwd: appRoot, env, stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`EAS Update failed (${result.status}).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    run();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
