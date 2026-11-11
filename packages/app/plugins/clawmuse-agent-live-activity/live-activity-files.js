// Ported from the EndToAI/Orca fork (`agent/mobile/plugins/orca-agent-live-activity`).
const fs = require("node:fs");
const path = require("node:path");

const LOCALIZATION_DIRECTORY_PATTERN = /\.lproj$/;
const ASSET_CATALOG_PATTERN = /\.xcassets$/;

function requireFile(filePath, label) {
  if (!fs.statSync(filePath, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`ClawMuse Live Activity: missing ${label} at ${filePath}`);
  }
}

function copyDirectory(sourceDirectory, destinationDirectory) {
  fs.mkdirSync(destinationDirectory, { recursive: true });
  for (const entry of fs.readdirSync(sourceDirectory, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDirectory, entry.name);
    const destinationPath = path.join(destinationDirectory, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(sourcePath, destinationPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(sourcePath, destinationPath);
    }
  }
}

function listFiles(directory) {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory() && !ASSET_CATALOG_PATTERN.test(entry.name)) {
        return listFiles(entryPath);
      }
      return [entryPath];
    })
    .sort();
}

/**
 * `<lang>.lproj/<file>` for every localized resource in the target directory.
 * Xcode derives a resource's locale from that path prefix, so the app target
 * gets the same shape rather than a flattened copy.
 */
function listLocalizationFiles(sourceDirectory) {
  return fs
    .readdirSync(sourceDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && LOCALIZATION_DIRECTORY_PATTERN.test(entry.name))
    .flatMap((entry) =>
      fs
        .readdirSync(path.join(sourceDirectory, entry.name), { withFileTypes: true })
        .filter((file) => file.isFile())
        .map((file) => path.posix.join(entry.name, file.name)),
    )
    .sort();
}

function copyLocalizationFiles({ sourceDirectory, destinationDirectory }) {
  const files = listLocalizationFiles(sourceDirectory);
  if (files.length === 0) {
    throw new Error(`ClawMuse Live Activity: no <lang>.lproj resources under ${sourceDirectory}`);
  }
  for (const file of files) {
    const destinationPath = path.join(destinationDirectory, file);
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.copyFileSync(path.join(sourceDirectory, file), destinationPath);
  }
  return files;
}

function copyLiveActivityFiles({ sourceDirectory, attributesPath, destinationDirectory }) {
  requireFile(path.join(sourceDirectory, "Info.plist"), "extension Info.plist");
  requireFile(attributesPath, "AgentLiveActivityAttributes.swift");

  copyDirectory(sourceDirectory, destinationDirectory);
  fs.copyFileSync(attributesPath, path.join(destinationDirectory, path.basename(attributesPath)));
  return listFiles(destinationDirectory);
}

module.exports = {
  copyLiveActivityFiles,
  copyLocalizationFiles,
  listFiles,
  listLocalizationFiles,
};
