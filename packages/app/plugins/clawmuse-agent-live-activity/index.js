// Ported from the EndToAI/Orca fork (`agent/mobile/plugins/orca-agent-live-activity`).
const fs = require("node:fs");
const path = require("node:path");
const {
  createRunOncePlugin,
  withDangerousMod,
  withEntitlementsPlist,
  withInfoPlist,
  withXcodeProject,
} = require("expo/config-plugins");
const { copyLiveActivityFiles, copyLocalizationFiles } = require("./live-activity-files");
const { applyLiveActivityTarget, applyResourceFilesToTarget } = require("./xcode-project");

// The fixed-names table in docs/clawmuse-status.md is the contract for all four.
const TARGET_NAME = "ClawMuseAgentLiveActivityExtension";
const BUNDLE_IDENTIFIER_SUFFIX = ".AgentLiveActivityExtension";
const APP_GROUP = "group.com.clawmuse";
const APP_GROUPS_ENTITLEMENT = "com.apple.security.application-groups";
const DEPLOYMENT_TARGET = "16.2";
const SOURCE_DIRECTORY = path.resolve(__dirname, "../../targets/clawmuse-agent-live-activity");
const ATTRIBUTES_PATH = path.resolve(
  __dirname,
  "../../../expo-agent-live-activity/ios/AgentLiveActivityAttributes.swift",
);

function extensionBundleIdentifier(appBundleIdentifier) {
  if (!appBundleIdentifier) {
    throw new Error("ClawMuse Live Activity: ios.bundleIdentifier is not set");
  }
  return `${appBundleIdentifier}${BUNDLE_IDENTIFIER_SUFFIX}`;
}

/**
 * The extension's entitlements are generated rather than copied so the App Group
 * has exactly one definition: a mismatch between the app and the extension makes
 * the widget read an empty `UserDefaults` suite with no build error.
 */
function buildExtensionEntitlements(appGroup) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    "<dict>",
    `\t<key>${APP_GROUPS_ENTITLEMENT}</key>`,
    "\t<array>",
    `\t\t<string>${appGroup}</string>`,
    "\t</array>",
    "</dict>",
    "</plist>",
    "",
  ].join("\n");
}

/** Adds `value` to `list` without reordering or duplicating what is already there. */
function withAppendedValue(list, value) {
  const existing = Array.isArray(list) ? list : [];
  return existing.includes(value) ? existing : [...existing, value];
}

function withLiveActivityFiles(config, onFilesCopied) {
  return withDangerousMod(config, [
    "ios",
    (modConfig) => {
      const destinationDirectory = path.join(modConfig.modRequest.platformProjectRoot, TARGET_NAME);
      const copiedFiles = copyLiveActivityFiles({
        sourceDirectory: SOURCE_DIRECTORY,
        attributesPath: ATTRIBUTES_PATH,
        destinationDirectory,
      });
      fs.writeFileSync(
        path.join(destinationDirectory, "Extension.entitlements"),
        buildExtensionEntitlements(APP_GROUP),
      );

      const mainTargetName = modConfig.modRequest.projectName;
      if (!mainTargetName) {
        throw new Error("ClawMuse Live Activity: unable to resolve the main iOS target");
      }
      // The APNs alert payloads reference these keys by name (`loc-key`), so the
      // app bundle needs the same table the extension ships.
      const mainResourceFiles = copyLocalizationFiles({
        sourceDirectory: SOURCE_DIRECTORY,
        destinationDirectory: path.join(modConfig.modRequest.platformProjectRoot, mainTargetName),
      });

      onFilesCopied({
        extensionFiles: copiedFiles.map((file) =>
          path.relative(destinationDirectory, file).split(path.sep).join("/"),
        ),
        mainTargetName,
        mainResourceFiles,
      });
      return modConfig;
    },
  ]);
}

function withLiveActivityXcodeTarget(config, getGeneratedFiles) {
  return withXcodeProject(config, (modConfig) => {
    const generated = getGeneratedFiles();
    if (generated.extensionFiles.length === 0) {
      throw new Error(
        "ClawMuse Live Activity: extension files were not copied before Xcode configuration",
      );
    }
    applyLiveActivityTarget(modConfig.modResults, {
      targetName: TARGET_NAME,
      bundleIdentifier: extensionBundleIdentifier(modConfig.ios?.bundleIdentifier),
      deploymentTarget: DEPLOYMENT_TARGET,
      buildNumber: modConfig.ios?.buildNumber ?? "1",
      version: modConfig.version ?? "1.0.0",
      appleTeamId: modConfig.ios?.appleTeamId,
      generatedFiles: generated.extensionFiles,
    });
    applyResourceFilesToTarget(
      modConfig.modResults,
      generated.mainTargetName,
      generated.mainResourceFiles,
    );
    return modConfig;
  });
}

function withLiveActivityAppCapabilities(config) {
  const withPlist = withInfoPlist(config, (modConfig) => {
    modConfig.modResults.NSSupportsLiveActivities = true;
    return modConfig;
  });
  return withEntitlementsPlist(withPlist, (modConfig) => {
    modConfig.modResults[APP_GROUPS_ENTITLEMENT] = withAppendedValue(
      modConfig.modResults[APP_GROUPS_ENTITLEMENT],
      APP_GROUP,
    );
    return modConfig;
  });
}

function withClawMuseAgentLiveActivity(config) {
  let generatedFiles = { extensionFiles: [], mainTargetName: "", mainResourceFiles: [] };
  config = withLiveActivityAppCapabilities(config);
  config = withLiveActivityFiles(config, (files) => {
    generatedFiles = files;
  });
  return withLiveActivityXcodeTarget(config, () => generatedFiles);
}

module.exports = createRunOncePlugin(
  withClawMuseAgentLiveActivity,
  "clawmuse-agent-live-activity",
  "1.0.0",
);
module.exports.APP_GROUP = APP_GROUP;
module.exports.APP_GROUPS_ENTITLEMENT = APP_GROUPS_ENTITLEMENT;
module.exports.DEPLOYMENT_TARGET = DEPLOYMENT_TARGET;
module.exports.SOURCE_DIRECTORY = SOURCE_DIRECTORY;
module.exports.TARGET_NAME = TARGET_NAME;
module.exports.buildExtensionEntitlements = buildExtensionEntitlements;
module.exports.extensionBundleIdentifier = extensionBundleIdentifier;
module.exports.withAppendedValue = withAppendedValue;
module.exports.withClawMuseAgentLiveActivity = withClawMuseAgentLiveActivity;
