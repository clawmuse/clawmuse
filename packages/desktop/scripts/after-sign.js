const path = require("node:path");

const { smokePackagedDesktopApp } = require("../e2e/packaged-app-smoke.js");

const EXECUTABLE_NAME = "ClawMuse";

exports.default = async function afterSign(context) {
  if (context.electronPlatformName !== "darwin") {
    return;
  }

  const appPath = path.join(context.appOutDir, `${EXECUTABLE_NAME}.app`);
  const { verifyMacDistribution } = await import("./mac-signing.mjs");
  verifyMacDistribution({ appPath, version: context.packager.appInfo.version });
  if (process.env.PASEO_DESKTOP_SMOKE !== "1") return;

  await smokePackagedDesktopApp({
    appPath,
  });
};
