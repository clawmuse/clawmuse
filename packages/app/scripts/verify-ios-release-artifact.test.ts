import { describe, expect, it } from "vitest";
import {
  LIVE_ACTIVITY_EXTENSION_NAME,
  resolveIosArtifactEntries,
  verifyIosSceneManifest,
  verifyIosStoreRequirements,
} from "./verify-ios-release-artifact.mjs";

const APP_ROOT = "Payload/ClawMuse.app/";
const EXTENSION_ROOT = `${APP_ROOT}PlugIns/${LIVE_ACTIVITY_EXTENSION_NAME}.appex/`;

function completeArchive(): string[] {
  return [
    "Payload/",
    APP_ROOT,
    `${APP_ROOT}ClawMuse`,
    `${APP_ROOT}main.jsbundle`,
    `${APP_ROOT}Info.plist`,
    `${APP_ROOT}PrivacyInfo.xcprivacy`,
    `${APP_ROOT}en.lproj/Localizable.strings`,
    `${APP_ROOT}zh-Hans.lproj/Localizable.strings`,
    `${EXTENSION_ROOT}${LIVE_ACTIVITY_EXTENSION_NAME}`,
    `${EXTENSION_ROOT}Info.plist`,
    `${EXTENSION_ROOT}en.lproj/Localizable.strings`,
    `${EXTENSION_ROOT}zh-Hans.lproj/Localizable.strings`,
  ];
}

describe("verify-ios-release-artifact", () => {
  it("requires a current SDK and meaningful permission purpose strings before upload", () => {
    const plist = {
      DTSDKName: "iphoneos26.0",
      NSMicrophoneUsageDescription: "Dictate messages",
      NSCameraUsageDescription: "Scan pairing codes",
      NSPhotoLibraryUsageDescription: "Attach photos",
      NSLocalNetworkUsageDescription: "Connect to agent hosts",
    };
    expect(() => verifyIosStoreRequirements(plist)).not.toThrow();
    expect(() => verifyIosStoreRequirements({ ...plist, DTSDKName: "iphoneos18.5" })).toThrow(
      /iOS 26 SDK/,
    );
    expect(() =>
      verifyIosStoreRequirements({ ...plist, NSLocalNetworkUsageDescription: "" }),
    ).toThrow(/NSLocalNetworkUsageDescription/);
  });

  it("rejects an archive missing its required-reason API privacy manifest", () => {
    const entries = completeArchive().filter((entry) => !entry.endsWith("PrivacyInfo.xcprivacy"));
    expect(() => resolveIosArtifactEntries(entries)).toThrow(/privacy manifest/);
  });

  it("rejects the legacy app lifecycle that crashes on iOS 27", () => {
    expect(() => verifyIosSceneManifest({ CFBundleExecutable: "ClawMuse" })).toThrow(
      /UIKit scene configuration/,
    );
  });

  it("checks that the scene delegate matches the native plugin", () => {
    const plist = {
      CFBundleExecutable: "ClawMuse",
      UIApplicationSceneManifest: {
        UIApplicationSupportsMultipleScenes: false,
        UISceneConfigurations: {
          UIWindowSceneSessionRoleApplication: [{ UISceneDelegateClassName: "PaseoSceneDelegate" }],
        },
      },
    };
    expect(() => verifyIosSceneManifest(plist)).not.toThrow();
    plist.UIApplicationSceneManifest.UISceneConfigurations.UIWindowSceneSessionRoleApplication[0].UISceneDelegateClassName =
      "ClawMuseSceneDelegate";
    expect(() => verifyIosSceneManifest(plist)).toThrow(/UIKit scene configuration/);
  });

  it("accepts a release archive that carries the app and the extension", () => {
    const resolved = resolveIosArtifactEntries(completeArchive());

    expect(resolved.extensionBinary).toBe(`${EXTENSION_ROOT}${LIVE_ACTIVITY_EXTENSION_NAME}`);
    expect(resolved.mainLocalizations["zh-Hans"]).toBe(
      `${APP_ROOT}zh-Hans.lproj/Localizable.strings`,
    );
    expect(resolved.extensionLocalizations.en).toBe(
      `${EXTENSION_ROOT}en.lproj/Localizable.strings`,
    );
  });

  // The build that silently drops the extension still uploads and still
  // installs, which is exactly why this runs before the upload.
  it("rejects an archive whose extension never embedded", () => {
    const entries = completeArchive().filter((entry) => !entry.startsWith(EXTENSION_ROOT));

    expect(() => resolveIosArtifactEntries(entries)).toThrow(/Live Activity extension binary/);
  });

  it("rejects an archive missing a localization the alert payloads reference", () => {
    const entries = completeArchive().filter(
      (entry) => entry !== `${EXTENSION_ROOT}zh-Hans.lproj/Localizable.strings`,
    );

    expect(() => resolveIosArtifactEntries(entries)).toThrow(
      /extension zh-Hans Localizable.strings/,
    );
  });

  it("rejects an archive with no app bundle at all", () => {
    expect(() => resolveIosArtifactEntries(["Payload/"])).toThrow(/main\.jsbundle/);
  });
});
