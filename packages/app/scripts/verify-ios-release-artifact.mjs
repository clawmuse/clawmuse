#!/usr/bin/env node
// Structural check on the .ipa fastlane just built, before it is uploaded.
//
// Ported in spirit from the EndToAI/Orca fork
// (`agent/config/scripts/verify-mobile-ios-release-artifact.mjs`), reduced to the
// checks that still apply: the status service URL is not baked into this app, so
// there is nothing to scan the Hermes bundle for. What is left is the failure
// mode two-target signing actually produces — an .ipa that uploads, installs,
// and runs with no Live Activity and no widget, because the extension or its
// localized tables never made it into the bundle.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

export const LIVE_ACTIVITY_EXTENSION_NAME = "ClawMuseAgentLiveActivityExtension";
export const LOCALIZATIONS = ["en", "zh-Hans"];

export function verifyIosSceneManifest(plist) {
  const manifest = plist.UIApplicationSceneManifest;
  const scenes = manifest?.UISceneConfigurations?.UIWindowSceneSessionRoleApplication;
  const delegate = "PaseoSceneDelegate";
  if (
    manifest?.UIApplicationSupportsMultipleScenes !== false ||
    !Array.isArray(scenes) ||
    scenes.length !== 1 ||
    scenes[0].UISceneDelegateClassName !== delegate
  ) {
    throw new Error(`missing single-window UIKit scene configuration for ${delegate}`);
  }
}

export function verifyIosStoreRequirements(plist) {
  const sdk = /^iphoneos(\d+)(?:\.|$)/.exec(plist.DTSDKName ?? "");
  if (!sdk || Number(sdk[1]) < 26) {
    throw new Error("App Store release requires the iOS 26 SDK or newer");
  }
  for (const key of [
    "NSMicrophoneUsageDescription",
    "NSCameraUsageDescription",
    "NSPhotoLibraryUsageDescription",
    "NSLocalNetworkUsageDescription",
  ]) {
    if (typeof plist[key] !== "string" || plist[key].trim().length === 0) {
      throw new Error(`missing purpose string: ${key}`);
    }
  }
}

function readArchivePlist(archivePath, entry) {
  const extracted = spawnSync("unzip", ["-p", archivePath, entry]);
  if (extracted.error) throw extracted.error;
  if (extracted.status !== 0) throw new Error(`could not read ${entry} from IPA`);
  const converted = spawnSync("plutil", ["-convert", "json", "-o", "-", "--", "-"], {
    input: extracted.stdout,
    encoding: "utf8",
  });
  if (converted.error) throw converted.error;
  if (converted.status !== 0) throw new Error(`could not parse ${entry}: ${converted.stderr}`);
  return JSON.parse(converted.stdout);
}

function requireSingleEntry(entries, predicate, label) {
  const matches = entries.filter(predicate);
  if (matches.length !== 1) {
    throw new Error(`expected exactly one ${label} in the IPA, found ${matches.length}`);
  }
  return matches[0];
}

/**
 * The entries every ClawMuse release .ipa must contain, keyed by what they are.
 * Throws with the missing item named rather than returning a partial result.
 */
export function resolveIosArtifactEntries(entries) {
  const mainBundle = requireSingleEntry(
    entries,
    (entry) => /^Payload\/[^/]+\.app\/main\.jsbundle$/.test(entry),
    "main.jsbundle",
  );
  const appRoot = mainBundle.slice(0, -"main.jsbundle".length);
  const extensionRoot = `${appRoot}PlugIns/${LIVE_ACTIVITY_EXTENSION_NAME}.appex/`;
  const requiredEntry = (relativePath, label) =>
    requireSingleEntry(entries, (entry) => entry === relativePath, label);

  const localizations = (root, owner) =>
    Object.fromEntries(
      LOCALIZATIONS.map((language) => [
        language,
        requiredEntry(
          `${root}${language}.lproj/Localizable.strings`,
          `${owner} ${language} Localizable.strings`,
        ),
      ]),
    );

  return {
    mainBundle,
    privacyManifest: requiredEntry(`${appRoot}PrivacyInfo.xcprivacy`, "app privacy manifest"),
    mainInfo: requiredEntry(`${appRoot}Info.plist`, "main app Info.plist"),
    mainLocalizations: localizations(appRoot, "main app"),
    extensionBinary: requiredEntry(
      `${extensionRoot}${LIVE_ACTIVITY_EXTENSION_NAME}`,
      "Live Activity extension binary",
    ),
    extensionInfo: requiredEntry(`${extensionRoot}Info.plist`, "extension Info.plist"),
    extensionLocalizations: localizations(extensionRoot, "extension"),
  };
}

export function listArchiveEntries(archivePath) {
  const result = spawnSync("unzip", ["-Z1", archivePath], { encoding: "utf8" });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`unzip -Z1 failed for ${archivePath}: ${result.stderr?.trim() ?? ""}`);
  }
  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function main(archivePath) {
  if (!archivePath) {
    throw new Error("usage: verify-ios-release-artifact.mjs <path-to-ipa>");
  }
  if (!existsSync(archivePath)) {
    throw new Error(`IPA not found: ${archivePath}`);
  }
  const entries = resolveIosArtifactEntries(listArchiveEntries(archivePath));
  const info = readArchivePlist(archivePath, entries.mainInfo);
  verifyIosSceneManifest(info);
  verifyIosStoreRequirements(info);
  const privacy = readArchivePlist(archivePath, entries.privacyManifest);
  if (!Array.isArray(privacy.NSPrivacyAccessedAPITypes)) {
    throw new Error("app privacy manifest must declare required-reason APIs");
  }
  console.log(
    `verified ${archivePath}: UIKit scene lifecycle, app bundle, ${LIVE_ACTIVITY_EXTENSION_NAME}, and both localizations`,
  );
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  try {
    main(process.argv[2]);
  } catch (error) {
    console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
