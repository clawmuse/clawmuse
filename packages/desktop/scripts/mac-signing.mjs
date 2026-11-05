import { spawnSync } from "node:child_process";
import { closeSync, openSync, readSync, statSync } from "node:fs";
import { parseReleaseVersion } from "../../../scripts/release-version-utils.mjs";
import { isMainModule } from "../../../scripts/is-main-module.mjs";

export const MAC_SIGNING_ENV_KEYS = [
  "CSC_LINK",
  "CSC_KEY_PASSWORD",
  "CSC_NAME",
  "CSC_KEYCHAIN",
  "APPLE_SIGN_IDENTITY",
  "APPLE_ID",
  "APPLE_APP_SPECIFIC_PASSWORD",
  "APPLE_TEAM_ID",
  "APPLE_API_KEY",
  "APPLE_API_KEY_ID",
  "APPLE_API_ISSUER",
  "APPLE_KEYCHAIN",
  "APPLE_KEYCHAIN_PROFILE",
];

export function isMacCodePath(file) {
  // osx-sign already selects code-bundle directories, but treats binary data as code too.
  // Like Cindy, individually sign Mach-O files; the outer bundle seals all other resources.
  if (statSync(file).isDirectory()) return true;
  const descriptor = openSync(file, "r");
  try {
    const header = Buffer.alloc(8);
    const size = readSync(descriptor, header, 0, header.length, 0);
    if (size < 4) return false;
    const magic = header.readUInt32BE(0);
    if ([0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe].includes(magic)) return true;
    if (size < 8) return false;
    let architectures;
    if ([0xcafebabe, 0xcafebabf].includes(magic)) architectures = header.readUInt32BE(4);
    else if ([0xbebafeca, 0xbfbafeca].includes(magic)) architectures = header.readUInt32LE(4);
    else return false;
    // Java class files share FAT_MAGIC, but put a class-file version in this field.
    return architectures > 0 && architectures <= 32;
  } finally {
    closeSync(descriptor);
  }
}

export function resolveMacSigning({ version, env = process.env }) {
  if (env.CLAWMUSE_UNSIGNED_BUILD === "1" || parseReleaseVersion(version).isBeta) {
    return { identity: "-", forceCodeSigning: false, notarize: false };
  }

  const identity = (env.APPLE_SIGN_IDENTITY || env.CSC_NAME || "").trim();
  const match = /^Developer ID Application: (.+ \(([A-Z0-9]{10})\))$/.exec(identity);
  if (!match) {
    throw new Error(
      "Mac stable builds require APPLE_SIGN_IDENTITY (a Developer ID Application certificate).",
    );
  }
  if (env.APPLE_TEAM_ID !== match[2]) {
    throw new Error("APPLE_TEAM_ID must match the Developer ID Application certificate.");
  }

  // Match electron-builder 26's credential precedence, including incomplete sets.
  if (env.APPLE_ID || env.APPLE_APP_SPECIFIC_PASSWORD) {
    if (!env.APPLE_ID || !env.APPLE_APP_SPECIFIC_PASSWORD) {
      throw new Error("Mac notarization requires both APPLE_ID and APPLE_APP_SPECIFIC_PASSWORD.");
    }
  } else if (env.APPLE_API_KEY || env.APPLE_API_KEY_ID || env.APPLE_API_ISSUER) {
    if (!env.APPLE_API_KEY || !env.APPLE_API_KEY_ID || !env.APPLE_API_ISSUER) {
      throw new Error(
        "Mac notarization requires APPLE_API_KEY, APPLE_API_KEY_ID and APPLE_API_ISSUER.",
      );
    }
  } else if (!env.APPLE_KEYCHAIN_PROFILE) {
    throw new Error(
      "Mac stable builds require notarization credentials or APPLE_KEYCHAIN_PROFILE.",
    );
  }

  // electron-builder rejects the certificate type prefix in its identity qualifier.
  return { identity: match[1], forceCodeSigning: true, notarize: true };
}

function runVerification(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 120_000 });
  if (result.error) throw result.error;
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (result.status !== 0)
    throw new Error(`Mac distribution verification failed: ${command}\n${output}`);
  return output;
}

export function verifyMacDistribution({
  appPath,
  version,
  env = process.env,
  run = runVerification,
}) {
  if (env.CLAWMUSE_UNSIGNED_BUILD === "1" || parseReleaseVersion(version).isBeta) return;
  resolveMacSigning({ version, env });
  run("/usr/bin/codesign", ["--verify", "--deep", "--strict", appPath]);
  const signature = run("/usr/bin/codesign", ["--display", "--verbose=4", appPath]);
  const identity = (env.APPLE_SIGN_IDENTITY || env.CSC_NAME).trim();
  const authority = signature.split(/\r?\n/).includes(`Authority=${identity}`);
  const team = signature.split(/\r?\n/).includes(`TeamIdentifier=${env.APPLE_TEAM_ID}`);
  if (!authority || !team || !/flags=.*\bruntime\b/.test(signature)) {
    throw new Error(
      "Mac stable bundle must have the expected Developer ID, Team ID and hardened runtime.",
    );
  }
  // electron-builder 26 silently skips notarization without credentials; config alone is insufficient.
  run("/usr/bin/xcrun", ["stapler", "validate", appPath]);
  const assessment = run("/usr/sbin/spctl", [
    "--assess",
    "--type",
    "execute",
    "--verbose=4",
    appPath,
  ]);
  if (!assessment.includes("source=Notarized Developer ID")) {
    throw new Error(
      "Gatekeeper did not recognize the Mac stable bundle as Notarized Developer ID.",
    );
  }
}

if (isMainModule(import.meta.url)) {
  const version = process.argv[2];
  if (!version) throw new Error("Usage: node mac-signing.mjs <desktop-version>");
  const options = resolveMacSigning({ version });
  console.log(
    options.notarize
      ? "Mac release: Developer ID signing and notarization required"
      : "Mac beta: ad-hoc signing",
  );
}
