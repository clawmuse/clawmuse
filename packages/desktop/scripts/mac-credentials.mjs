// Read-only inventory. Keys stay on the Mac; command output containing credentials is never logged.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { parseEnv } from "node:util";

if (process.platform !== "darwin") throw new Error("Run credential inventory on the Mac.");

function run(command, args) {
  return spawnSync(command, args, { encoding: "utf8", timeout: 60_000 });
}

const home = homedir();
const envPath =
  process.env.CLAWMUSE_IOS_ASC_ENV || path.join(home, ".private_keys/appstoreconnect.env");
const shared = existsSync(envPath) ? parseEnv(readFileSync(envPath, "utf8")) : {};
const keyPath = process.env.APPLE_API_KEY || shared.ASC_KEY_PATH;
const keyId = process.env.APPLE_API_KEY_ID || shared.ASC_KEY_ID;
const issuer = process.env.APPLE_API_ISSUER || shared.ASC_ISSUER_ID;
const resolvedKeyPath = keyPath?.replace(/^~\//, `${home}/`);
const keyExists = Boolean(resolvedKeyPath && existsSync(resolvedKeyPath));

const dedicatedKeychain =
  process.env.CLAWMUSE_IOS_KEYCHAIN_PATH ||
  path.join(home, ".endto-secrets/clawmuse-ios/clawmuse-runner.keychain-db");
const keychains = [undefined, ...(existsSync(dedicatedKeychain) ? [dedicatedKeychain] : [])];
const identities = keychains.map((keychain) => {
  const result = run("/usr/bin/security", [
    "find-identity",
    "-v",
    "-p",
    "codesigning",
    ...(keychain ? [keychain] : []),
  ]);
  const names = [...(result.stdout || "").matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  return { keychain: keychain || "default search list", status: result.status, names };
});

let signing = { status: "not tested" };
if (process.argv.includes("--probe-signing")) {
  const identity = process.env.APPLE_SIGN_IDENTITY;
  signing = { status: "not configured" };
  if (identity?.startsWith("Developer ID Application:")) {
    const directory = mkdtempSync(path.join(tmpdir(), "clawmuse-signing-probe-"));
    try {
      const target = path.join(directory, "probe");
      copyFileSync("/bin/echo", target);
      const result = run("/usr/bin/codesign", [
        "--force",
        "--sign",
        identity,
        "--options",
        "runtime",
        "--timestamp=none",
        target,
      ]);
      const verify =
        result.status === 0 ? run("/usr/bin/codesign", ["--verify", "--strict", target]) : null;
      signing = {
        status: result.status === 0 && verify?.status === 0 ? "passed" : "failed",
        exitCode: result.status,
        keychainAccessDenied: /errSecInternalComponent|User interaction is not allowed/.test(
          result.stderr || "",
        ),
        timedOut: result.error?.code === "ETIMEDOUT",
      };
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
}

let notaryArgs = null;
if (process.env.APPLE_KEYCHAIN_PROFILE) {
  notaryArgs = [
    "--keychain-profile",
    process.env.APPLE_KEYCHAIN_PROFILE,
    ...(process.env.APPLE_KEYCHAIN ? ["--keychain", process.env.APPLE_KEYCHAIN] : []),
  ];
} else if (keyExists && keyId && issuer) {
  notaryArgs = ["--key", resolvedKeyPath, "--key-id", keyId, "--issuer", issuer];
}
let notarization = { status: "not configured" };
if (notaryArgs) {
  const result = run("/usr/bin/xcrun", [
    "notarytool",
    "history",
    ...notaryArgs,
    "--output-format",
    "json",
  ]);
  // Only report status; notarytool's raw output is kept out of workflow logs.
  notarization = {
    status: result.status === 0 ? "authenticated" : result.error?.code || "authentication failed",
    exitCode: result.status,
    method: process.env.APPLE_KEYCHAIN_PROFILE ? "keychain profile" : "App Store Connect API key",
  };
}

const credentialFiles = [".private_keys", ".endto-secrets/clawmuse-ios"].map((directory) => {
  const fullPath = path.join(home, directory);
  return {
    directory,
    files: existsSync(fullPath)
      ? readdirSync(fullPath).filter((name) => /\.(p12|p8|cer|cert|keychain-db|env)$/.test(name))
      : [],
  };
});

console.log(
  JSON.stringify(
    {
      identities,
      signing,
      sharedApiConfig: {
        present: existsSync(envPath),
        keyReadable: keyExists,
        hasKeyId: Boolean(keyId),
        hasIssuer: Boolean(issuer),
      },
      notarization,
      credentialFiles,
    },
    null,
    2,
  ),
);

if (
  process.argv.includes("--probe-signing") &&
  (signing.status !== "passed" || notarization.status !== "authenticated")
)
  process.exitCode = 1;
