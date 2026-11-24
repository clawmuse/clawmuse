const path = require("node:path");

module.exports = async function () {
  const config = { extends: path.join(__dirname, "electron-builder.yml") };
  const { version } = require("./package.json");
  const dateBuild = /^(\d+\.\d+\.\d+)\+(\d{4})$/.exec(version);
  if (dateBuild) {
    config.buildVersion = `${dateBuild[1]}.${Number(dateBuild[2])}`;
    // electron-builder normalizes package.json with semver.clean, which drops build metadata.
    // extraMetadata is applied afterwards, preserving the release identity in artifacts and feeds.
    config.extraMetadata = { version };
  }
  if (process.platform !== "darwin") return config;

  const { resolveMacSigning, isMacCodePath } = await import("./scripts/mac-signing.mjs");
  config.mac = resolveMacSigning({});
  if (dateBuild) {
    config.mac.bundleShortVersion = dateBuild[1];
    config.mac.bundleVersion = String(Number(dateBuild[2]));
    config.mac.extendInfo = { ClawMuseReleaseVersion: version };
  }
  config.mac.sign = async (options) => {
    const { signAsync } = require("@electron/osx-sign");
    const originalIgnore = options.ignore;
    return signAsync({
      ...options,
      ignore: (file) => Boolean(originalIgnore?.(file)) || !isMacCodePath(file),
    });
  };
  config.dmg = { sign: true };
  return config;
};
