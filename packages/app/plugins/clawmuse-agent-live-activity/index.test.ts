import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  configurationList,
  createFakeProject,
  group,
  MAIN_TARGET_NAME,
  type PbxFileReference,
  type PbxNativeTarget,
} from "./xcode-project-fake";

const {
  APP_GROUP,
  APP_GROUPS_ENTITLEMENT,
  TARGET_NAME,
  buildExtensionEntitlements,
  extensionBundleIdentifier,
  withAppendedValue,
} = require("./index");
const { copyLiveActivityFiles, copyLocalizationFiles } = require("./live-activity-files");
const {
  applyLiveActivityTarget,
  applyResourceFilesToTarget,
  EMBED_PHASE_NAME,
} = require("./xcode-project");

function createSourceDirectory(): {
  root: string;
  sourceDirectory: string;
  attributesPath: string;
} {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clawmuse-live-activity-"));
  const sourceDirectory = path.join(root, "source");
  const attributesPath = path.join(root, "AgentLiveActivityAttributes.swift");
  fs.mkdirSync(path.join(sourceDirectory, "en.lproj"), { recursive: true });
  fs.mkdirSync(path.join(sourceDirectory, "zh-Hans.lproj"), { recursive: true });
  fs.writeFileSync(path.join(sourceDirectory, "Info.plist"), "<plist/>");
  fs.writeFileSync(path.join(sourceDirectory, "Widget.swift"), "struct Widget {}");
  fs.writeFileSync(
    path.join(sourceDirectory, "en.lproj", "Localizable.strings"),
    '"CLAWMUSE_LIVE_ACTIVITY_TITLE" = "ClawMuse remote tasks";',
  );
  fs.writeFileSync(
    path.join(sourceDirectory, "zh-Hans.lproj", "Localizable.strings"),
    '"CLAWMUSE_LIVE_ACTIVITY_TITLE" = "ClawMuse 远程任务";',
  );
  fs.writeFileSync(attributesPath, "struct Attributes {}");
  return { root, sourceDirectory, attributesPath };
}

function fileReferencePaths(references: Record<string, PbxFileReference>): string[] {
  return Object.values(references).map((reference) => reference.path);
}

describe("clawmuse-agent-live-activity files", () => {
  it("copies tracked extension files and shared attributes idempotently", () => {
    const { root, sourceDirectory, attributesPath } = createSourceDirectory();
    const destinationDirectory = path.join(root, "ios", TARGET_NAME);

    const firstFiles = copyLiveActivityFiles({
      sourceDirectory,
      attributesPath,
      destinationDirectory,
    });
    const secondFiles = copyLiveActivityFiles({
      sourceDirectory,
      attributesPath,
      destinationDirectory,
    });

    expect(secondFiles).toEqual(firstFiles);
    expect(fs.readFileSync(path.join(destinationDirectory, "Widget.swift"), "utf8")).toBe(
      "struct Widget {}",
    );
    expect(
      fs.readFileSync(path.join(destinationDirectory, "AgentLiveActivityAttributes.swift"), "utf8"),
    ).toBe("struct Attributes {}");
    expect(
      fs.readFileSync(path.join(destinationDirectory, "en.lproj", "Localizable.strings"), "utf8"),
    ).toContain("ClawMuse remote tasks");
    expect(
      fs.readFileSync(
        path.join(destinationDirectory, "zh-Hans.lproj", "Localizable.strings"),
        "utf8",
      ),
    ).toContain("ClawMuse 远程任务");
  });

  it("gives the app target the same localized tables as the extension", () => {
    const { root, sourceDirectory } = createSourceDirectory();
    const destinationDirectory = path.join(root, "ios", MAIN_TARGET_NAME);

    const files = copyLocalizationFiles({ sourceDirectory, destinationDirectory });

    // The locale is carried by the path, so the app target keeps the .lproj shape.
    expect(files).toEqual(["en.lproj/Localizable.strings", "zh-Hans.lproj/Localizable.strings"]);
    expect(
      fs.readFileSync(
        path.join(destinationDirectory, "zh-Hans.lproj", "Localizable.strings"),
        "utf8",
      ),
    ).toContain("ClawMuse 远程任务");
  });

  it("refuses a target directory with no localizations rather than shipping none", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "clawmuse-live-activity-"));
    const sourceDirectory = path.join(root, "source");
    fs.mkdirSync(sourceDirectory);

    expect(() =>
      copyLocalizationFiles({ sourceDirectory, destinationDirectory: path.join(root, "ios") }),
    ).toThrow(/no <lang>\.lproj resources/);
  });
});

describe("clawmuse-agent-live-activity identity", () => {
  it("derives the extension bundle id from whichever app variant is building", () => {
    expect(extensionBundleIdentifier("com.clawmuse")).toBe(
      "com.clawmuse.AgentLiveActivityExtension",
    );
    expect(extensionBundleIdentifier("com.clawmuse.debug")).toBe(
      "com.clawmuse.debug.AgentLiveActivityExtension",
    );
  });

  it("fails loudly when the app has no bundle identifier to extend", () => {
    expect(() => extensionBundleIdentifier(undefined)).toThrow(/ios.bundleIdentifier is not set/);
  });

  it("puts the app and the extension in the same App Group", () => {
    expect(APP_GROUP).toBe("group.com.clawmuse");
    expect(buildExtensionEntitlements(APP_GROUP)).toContain(`<key>${APP_GROUPS_ENTITLEMENT}</key>`);
    expect(buildExtensionEntitlements(APP_GROUP)).toContain(`<string>${APP_GROUP}</string>`);
  });

  it("adds the App Group to the app entitlements without dropping existing ones", () => {
    expect(withAppendedValue(undefined, APP_GROUP)).toEqual([APP_GROUP]);
    expect(withAppendedValue(["group.other"], APP_GROUP)).toEqual(["group.other", APP_GROUP]);
    expect(withAppendedValue([APP_GROUP], APP_GROUP)).toEqual([APP_GROUP]);
  });
});

describe("clawmuse-agent-live-activity Xcode project", () => {
  it("adds status localization to the main app resources only once", () => {
    const project = createFakeProject();
    const localizations = ["en.lproj/Localizable.strings", "zh-Hans.lproj/Localizable.strings"];

    applyResourceFilesToTarget(project, MAIN_TARGET_NAME, localizations);
    applyResourceFilesToTarget(project, MAIN_TARGET_NAME, localizations);

    const resourcePhase = project.buildPhaseObject("PBXResourcesBuildPhase", "Resources", "MAIN");
    expect(resourcePhase?.files).toHaveLength(2);
    expect(fileReferencePaths(project.pbxFileReferenceSection()).sort()).toEqual(localizations);
  });

  it("keeps app localization separate from the extension file reference", () => {
    const project = createFakeProject();
    const objects = project.hash.project.objects;
    const references = project.pbxFileReferenceSection();
    references.EXT_LOCALIZABLE = { path: "en.lproj/Localizable.strings" };
    objects.PBXGroup.EXTENSION = {
      children: [{ value: "EXT_LOCALIZABLE", comment: "Localizable.strings" }],
      name: TARGET_NAME,
      path: TARGET_NAME,
    };

    applyResourceFilesToTarget(project, MAIN_TARGET_NAME, ["en.lproj/Localizable.strings"]);

    expect(
      fileReferencePaths(references).filter((value) => value === "en.lproj/Localizable.strings"),
    ).toHaveLength(2);
    expect(group(objects, "APP").children[0].value).not.toBe("EXT_LOCALIZABLE");
  });

  it("uses a project-relative path when the main target group has no path", () => {
    const project = createFakeProject();
    delete group(project.hash.project.objects, "APP").path;

    applyResourceFilesToTarget(project, MAIN_TARGET_NAME, ["en.lproj/Localizable.strings"]);

    expect(fileReferencePaths(project.pbxFileReferenceSection())).toEqual([
      `${MAIN_TARGET_NAME}/en.lproj/Localizable.strings`,
    ]);
  });

  it("adds the app extension Xcode target only once", () => {
    const project = createFakeProject();
    const options = {
      targetName: TARGET_NAME,
      bundleIdentifier: extensionBundleIdentifier("com.clawmuse"),
      deploymentTarget: "16.2",
      buildNumber: "8000001",
      version: "0.8.0",
      generatedFiles: [
        "AgentLiveActivityAttributes.swift",
        "Info.plist",
        "en.lproj/Localizable.strings",
        "zh-Hans.lproj/Localizable.strings",
      ],
    };

    expect(applyLiveActivityTarget(project, options).created).toBe(true);
    const expandedOptions = {
      ...options,
      generatedFiles: [...options.generatedFiles, "ClawMuseAgentLiveActivityWidget.swift"],
    };
    expect(applyLiveActivityTarget(project, expandedOptions).created).toBe(false);
    expect(applyLiveActivityTarget(project, expandedOptions).created).toBe(false);

    const targets = Object.entries(project.pbxNativeTargetSection()).filter(
      ([uuid]) => !uuid.endsWith("_comment"),
    ) as [string, PbxNativeTarget][];
    expect(targets).toHaveLength(2);
    expect(project.calls.products).toBe(1);
    expect(project.calls.dependencies).toBe(1);
    expect(project.calls.groups).toBe(1);
    expect(project.calls.buildPhases[0].files).toEqual(["AgentLiveActivityAttributes.swift"]);

    const extensionTargetEntry = targets.find(([, target]) => target.name === TARGET_NAME);
    expect(extensionTargetEntry).toBeDefined();
    const [extensionTargetUuid, extensionTarget] = extensionTargetEntry!;
    expect(
      project.buildPhaseObject("PBXSourcesBuildPhase", "Sources", extensionTargetUuid)?.files,
    ).toHaveLength(2);
    expect(
      project.buildPhaseObject("PBXResourcesBuildPhase", "Resources", extensionTargetUuid)?.files,
    ).toHaveLength(2);
    expect(
      fileReferencePaths(project.pbxFileReferenceSection()).filter(
        (value) => value === "ClawMuseAgentLiveActivityWidget.swift",
      ),
    ).toHaveLength(1);
    expect(project.calls.buildPhases.map(({ type, comment }) => [type, comment])).toEqual([
      ["PBXSourcesBuildPhase", "Sources"],
      ["PBXResourcesBuildPhase", "Resources"],
      ["PBXFrameworksBuildPhase", "Frameworks"],
      ["PBXCopyFilesBuildPhase", EMBED_PHASE_NAME],
    ]);

    const configurations = configurationList(
      project,
      extensionTarget.buildConfigurationList as string,
    );
    for (const item of configurations.buildConfigurations) {
      const settings = project.pbxXCBuildConfigurationSection()[item.value].buildSettings;
      expect(settings.IPHONEOS_DEPLOYMENT_TARGET).toBe('"16.2"');
      expect(settings.GENERATE_INFOPLIST_FILE).toBe("NO");
      expect(settings.PRODUCT_BUNDLE_IDENTIFIER).toBe('"com.clawmuse.AgentLiveActivityExtension"');
      // Without this the extension builds unsigned for the App Group and the
      // widget silently reads an empty UserDefaults suite on device.
      expect(settings.CODE_SIGN_ENTITLEMENTS).toBe(`${TARGET_NAME}/Extension.entitlements`);
    }
  });
});
