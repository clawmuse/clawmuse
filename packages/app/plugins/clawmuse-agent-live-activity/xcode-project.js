// Ported from the EndToAI/Orca fork (`agent/mobile/plugins/orca-agent-live-activity`).
const path = require("node:path");

const TARGET_PRODUCT_TYPE = '"com.apple.product-type.app-extension"';
const EMBED_PHASE_NAME = "Embed Foundation Extensions";

function isResourceFile(filePath) {
  return /\.(strings|stringsdict|xcstrings)$/.test(filePath);
}

function unquote(value) {
  return typeof value === "string" ? value.replace(/^"(.*)"$/, "$1") : value;
}

function findNativeTarget(project, targetName) {
  const section = project.pbxNativeTargetSection();
  for (const [uuid, target] of Object.entries(section)) {
    if (uuid.endsWith("_comment")) {
      continue;
    }
    if (unquote(target.name) === targetName || unquote(target.productName) === targetName) {
      return { uuid, target };
    }
  }
  return null;
}

function buildSettings({
  targetName,
  bundleIdentifier,
  deploymentTarget,
  buildNumber,
  version,
  appleTeamId,
}) {
  return {
    PRODUCT_NAME: '"$(TARGET_NAME)"',
    SWIFT_VERSION: "5.0",
    TARGETED_DEVICE_FAMILY: '"1,2"',
    INFOPLIST_FILE: `${targetName}/Info.plist`,
    // App Group shared with the app: the home-screen widget reads its snapshot there.
    CODE_SIGN_ENTITLEMENTS: `${targetName}/Extension.entitlements`,
    CURRENT_PROJECT_VERSION: `"${buildNumber}"`,
    MARKETING_VERSION: `"${version}"`,
    IPHONEOS_DEPLOYMENT_TARGET: `"${deploymentTarget}"`,
    PRODUCT_BUNDLE_IDENTIFIER: `"${bundleIdentifier}"`,
    GENERATE_INFOPLIST_FILE: "NO",
    INFOPLIST_KEY_CFBundleDisplayName: targetName,
    APPLICATION_EXTENSION_API_ONLY: "YES",
    SKIP_INSTALL: "YES",
    LD_RUNPATH_SEARCH_PATHS:
      '"$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks"',
    ...(appleTeamId ? { DEVELOPMENT_TEAM: appleTeamId } : {}),
  };
}

function addConfigurationList(project, settings, targetName) {
  return project.addXCConfigurationList(
    ["Debug", "Release"].map((name) => ({
      isa: "XCBuildConfiguration",
      name,
      buildSettings: { ...settings },
    })),
    "Release",
    `Build configuration list for PBXNativeTarget "${targetName}"`,
  );
}

function updateConfigurationList(project, target, settings) {
  const lists = project.pbxXCConfigurationList();
  const configurations = project.pbxXCBuildConfigurationSection();
  const list = lists[target.buildConfigurationList];
  for (const item of list?.buildConfigurations ?? []) {
    configurations[item.value].buildSettings = {
      ...configurations[item.value].buildSettings,
      ...settings,
    };
  }
}

function addTargetToProject(project, targetName, targetUuid, productFile, configurationList) {
  const target = {
    uuid: targetUuid,
    pbxNativeTarget: {
      isa: "PBXNativeTarget",
      name: targetName,
      productName: targetName,
      productReference: productFile.fileRef,
      productType: TARGET_PRODUCT_TYPE,
      buildConfigurationList: configurationList.uuid,
      buildPhases: [],
      buildRules: [],
      dependencies: [],
    },
  };
  project.addToPbxNativeTargetSection(target);
  project.addToPbxProjectSection(target);

  const projectSection = project.pbxProjectSection()[project.getFirstProject().uuid];
  projectSection.attributes ??= {};
  projectSection.attributes.TargetAttributes ??= {};
  projectSection.attributes.TargetAttributes[targetUuid] = { LastSwiftMigration: 1250 };
  return target;
}

function addTargetDependency(project, targetUuid) {
  project.hash.project.objects.PBXTargetDependency ??= {};
  project.hash.project.objects.PBXContainerItemProxy ??= {};
  project.addTargetDependency(project.getFirstTarget().uuid, [targetUuid]);
}

function addBuildPhases(project, targetUuid, productFile, swiftFiles, resourceFiles) {
  project.addBuildPhase(swiftFiles, "PBXSourcesBuildPhase", "Sources", targetUuid);
  project.addBuildPhase(resourceFiles, "PBXResourcesBuildPhase", "Resources", targetUuid);
  project.addBuildPhase([], "PBXFrameworksBuildPhase", "Frameworks", targetUuid);

  const mainTargetUuid = project.getFirstTarget().uuid;
  project.addBuildPhase(
    [],
    "PBXCopyFilesBuildPhase",
    EMBED_PHASE_NAME,
    mainTargetUuid,
    "app_extension",
    '""',
  );
  const embedPhase = project.buildPhaseObject(
    "PBXCopyFilesBuildPhase",
    EMBED_PHASE_NAME,
    mainTargetUuid,
  );
  embedPhase.files.push({
    value: productFile.uuid,
    comment: `${productFile.basename} in ${productFile.group}`,
  });
  project.addToPbxBuildFileSection(productFile);
}

function addTargetGroup(project, targetName, generatedFiles) {
  const { uuid } = project.addPbxGroup(generatedFiles, targetName, targetName);
  const groups = project.hash.project.objects.PBXGroup;
  const rootGroupUuid = Object.keys(groups).find(
    (key) =>
      !key.endsWith("_comment") && groups[key].name === undefined && groups[key].path === undefined,
  );
  if (!rootGroupUuid) {
    throw new Error("ClawMuse Live Activity: unable to find the Xcode root group");
  }
  project.addToPbxGroup(uuid, rootGroupUuid);
  return uuid;
}

function findTargetGroupUuid(project, targetName) {
  const groups = project.hash.project.objects.PBXGroup;
  return Object.keys(groups).find(
    (key) =>
      !key.endsWith("_comment") &&
      (unquote(groups[key].name) === targetName || unquote(groups[key].path) === targetName),
  );
}

function findFileReference(project, groupUuid, filePath) {
  const references = project.pbxFileReferenceSection();
  const group = project.hash.project.objects.PBXGroup[groupUuid];
  for (const child of group?.children ?? []) {
    const uuid = child.value;
    const reference = references[uuid];
    if (reference && unquote(reference.path) === filePath) {
      return { uuid, basename: path.posix.basename(filePath) };
    }
  }
  return null;
}

function ensureFileReference(project, groupUuid, filePath) {
  let reference = findFileReference(project, groupUuid, filePath);
  if (!reference) {
    const file = project.addFile(filePath, groupUuid);
    if (!file) {
      throw new Error(`ClawMuse Live Activity: unable to add ${filePath} to the Xcode project`);
    }
    reference = { uuid: file.fileRef, basename: file.basename };
  }

  const group = project.hash.project.objects.PBXGroup[groupUuid];
  if (!group.children.some((child) => child.value === reference.uuid)) {
    project.addToPbxGroup({ fileRef: reference.uuid, basename: reference.basename }, groupUuid);
  }
  return reference;
}

function ensureSourceBuildFile(project, targetUuid, reference) {
  const sourcePhase = project.buildPhaseObject("PBXSourcesBuildPhase", "Sources", targetUuid);
  if (!sourcePhase) {
    throw new Error("ClawMuse Live Activity: extension Sources phase is missing");
  }

  const buildFiles = project.pbxBuildFileSection();
  const alreadyIncluded = sourcePhase.files.some(
    (entry) => buildFiles[entry.value]?.fileRef === reference.uuid,
  );
  if (alreadyIncluded) {
    return;
  }

  const file = {
    uuid: project.generateUuid(),
    fileRef: reference.uuid,
    basename: reference.basename,
    group: "Sources",
  };
  project.addToPbxBuildFileSection(file);
  sourcePhase.files.push({ value: file.uuid, comment: `${file.basename} in Sources` });
}

function ensureResourceBuildFile(project, targetUuid, reference) {
  let resourcePhase = project.buildPhaseObject("PBXResourcesBuildPhase", "Resources", targetUuid);
  if (!resourcePhase) {
    project.addBuildPhase([], "PBXResourcesBuildPhase", "Resources", targetUuid);
    resourcePhase = project.buildPhaseObject("PBXResourcesBuildPhase", "Resources", targetUuid);
  }
  if (!resourcePhase) {
    throw new Error("ClawMuse Live Activity: extension Resources phase is missing");
  }

  const buildFiles = project.pbxBuildFileSection();
  const alreadyIncluded = resourcePhase.files.some(
    (entry) => buildFiles[entry.value]?.fileRef === reference.uuid,
  );
  if (alreadyIncluded) {
    return;
  }

  const file = {
    uuid: project.generateUuid(),
    fileRef: reference.uuid,
    basename: reference.basename,
    group: "Resources",
  };
  project.addToPbxBuildFileSection(file);
  resourcePhase.files.push({ value: file.uuid, comment: `${file.basename} in Resources` });
}

function ensureTargetFiles(project, targetUuid, targetName, generatedFiles) {
  const groupUuid = findTargetGroupUuid(project, targetName);
  if (!groupUuid) {
    throw new Error(`ClawMuse Live Activity: ${targetName} Xcode group is missing`);
  }

  for (const filePath of generatedFiles) {
    const reference = ensureFileReference(project, groupUuid, filePath);
    if (filePath.endsWith(".swift")) {
      ensureSourceBuildFile(project, targetUuid, reference);
    } else if (isResourceFile(filePath)) {
      ensureResourceBuildFile(project, targetUuid, reference);
    }
  }
}

function applyResourceFilesToTarget(project, targetName, resourceFiles) {
  const existing = findNativeTarget(project, targetName);
  if (!existing) {
    throw new Error(`ClawMuse Live Activity: ${targetName} app target is missing`);
  }
  const groupUuid = findTargetGroupUuid(project, targetName);
  if (!groupUuid) {
    throw new Error(`ClawMuse Live Activity: ${targetName} Xcode group is missing`);
  }
  const groupPath = unquote(project.hash.project.objects.PBXGroup[groupUuid].path);
  // A group with its own path makes children relative to it; without one every
  // reference is project-root relative. Localized resources arrive as
  // `<lang>.lproj/<file>`, so "already contains a slash" cannot stand in for
  // "already scoped" — only the target prefix can.
  const scopedFiles = resourceFiles.map((filePath) =>
    groupPath || filePath === targetName || filePath.startsWith(`${targetName}/`)
      ? filePath
      : path.posix.join(targetName, filePath),
  );
  ensureTargetFiles(project, existing.uuid, targetName, scopedFiles);
}

function applyLiveActivityTarget(project, options) {
  const existing = findNativeTarget(project, options.targetName);
  const settings = buildSettings(options);
  if (existing) {
    if (existing.target.productType !== TARGET_PRODUCT_TYPE) {
      throw new Error(
        `ClawMuse Live Activity: ${options.targetName} exists but is not an app extension`,
      );
    }
    updateConfigurationList(project, existing.target, settings);
    ensureTargetFiles(project, existing.uuid, options.targetName, options.generatedFiles);
    return { created: false, targetUuid: existing.uuid };
  }

  const targetUuid = project.generateUuid();
  const configurationList = addConfigurationList(project, settings, options.targetName);
  const productFile = project.addProductFile(options.targetName, {
    basename: `${options.targetName}.appex`,
    group: EMBED_PHASE_NAME,
    target: project.getFirstTarget().uuid,
    explicitFileType: "wrapper.app-extension",
    settings: { ATTRIBUTES: ["RemoveHeadersOnCopy"] },
    includeInIndex: 0,
    path: `${options.targetName}.appex`,
    sourceTree: "BUILT_PRODUCTS_DIR",
  });
  const target = addTargetToProject(
    project,
    options.targetName,
    targetUuid,
    productFile,
    configurationList,
  );
  addTargetDependency(project, target.uuid);
  addBuildPhases(
    project,
    target.uuid,
    productFile,
    options.generatedFiles.filter((file) => file.endsWith(".swift")),
    options.generatedFiles.filter(isResourceFile),
  );
  addTargetGroup(project, options.targetName, options.generatedFiles);
  return { created: true, targetUuid };
}

module.exports = {
  EMBED_PHASE_NAME,
  TARGET_PRODUCT_TYPE,
  applyResourceFilesToTarget,
  applyLiveActivityTarget,
  findNativeTarget,
};
