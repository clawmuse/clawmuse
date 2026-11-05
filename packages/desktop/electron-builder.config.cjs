const path = require("node:path");

module.exports = async function () {
  const config = { extends: path.join(__dirname, "electron-builder.yml") };
  if (process.platform !== "darwin") return config;

  const { resolveMacSigning, MAC_SIGNING_ENV_KEYS, isMacCodePath } =
    await import("./scripts/mac-signing.mjs");
  const { version } = require("./package.json");
  config.mac = resolveMacSigning({ version });
  config.mac.sign = async (options) => {
    const { signAsync } = require("@electron/osx-sign");
    const originalIgnore = options.ignore;
    return signAsync({
      ...options,
      ignore: (file) => Boolean(originalIgnore?.(file)) || !isMacCodePath(file),
    });
  };
  config.dmg = { sign: config.mac.notarize };
  if (!config.mac.notarize) {
    // A local test build must not import certificates or touch a signing keychain.
    for (const key of MAC_SIGNING_ENV_KEYS) delete process.env[key];
    process.env.CSC_IDENTITY_AUTO_DISCOVERY = "false";
  }
  return config;
};
