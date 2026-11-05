import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";
import { verifyIosSceneManifest } from "./scripts/verify-ios-release-artifact.mjs";

// Load the copies the Expo CLI uses for prebuild, not older hoisted ones.
const requireFromExpo = createRequire(require.resolve("expo/package.json"));
const requireFromExpoCli = createRequire(requireFromExpo.resolve("@expo/cli/package.json"));
const { getPrebuildConfigAsync } = requireFromExpoCli("@expo/prebuild-config");
const { compileModsAsync } = requireFromExpoCli(
  "@expo/config-plugins/build/plugins/mod-compiler.js",
);
const { getResolvedLocalesAsync } = requireFromExpoCli(
  "@expo/config-plugins/build/utils/locales.js",
);

interface ManifestEntry {
  $: Record<string, string>;
}

const originalFdroidFlag = process.env.PASEO_FDROID_BUILD;
const originalApplicationId = process.env.ANDROID_APPLICATION_ID;

async function resolveAndroidManifest() {
  const { exp } = await getPrebuildConfigAsync(__dirname, { platforms: ["android"] });
  await compileModsAsync(exp, {
    projectRoot: __dirname,
    introspect: true,
    platforms: ["android"],
    assertMissingModProviders: false,
  });
  return exp._internal.modResults.android.manifest.manifest;
}

describe("Android app config", () => {
  it("keeps native permission translations on iOS without generating unused Android strings", async () => {
    const { exp } = await getPrebuildConfigAsync(__dirname, { platforms: ["android"] });
    const android = await getResolvedLocalesAsync(__dirname, exp.locales, "android");
    const ios = await getResolvedLocalesAsync(__dirname, exp.locales, "ios");
    const permissionKeys = [
      "NSCameraUsageDescription",
      "NSMicrophoneUsageDescription",
      "NSPhotoLibraryUsageDescription",
      "NSLocalNetworkUsageDescription",
      "NSFaceIDUsageDescription",
    ];
    for (const locale of Object.keys(exp.locales)) {
      for (const key of permissionKeys) {
        expect(android.localesMap[locale], `${locale} Android resources`).not.toHaveProperty(key);
        expect(ios.localesMap[locale][key], `${locale} iOS ${key}`).toEqual(expect.any(String));
        expect(ios.localesMap[locale][key].trim().length).toBeGreaterThan(0);
      }
    }
  }, 30_000);

  afterEach(() => {
    if (originalApplicationId === undefined) {
      delete process.env.ANDROID_APPLICATION_ID;
    } else {
      process.env.ANDROID_APPLICATION_ID = originalApplicationId;
    }
    if (originalFdroidFlag === undefined) {
      delete process.env.PASEO_FDROID_BUILD;
    } else {
      process.env.PASEO_FDROID_BUILD = originalFdroidFlag;
    }
  });

  it("defaults to the ClawMuse application id for store builds", async () => {
    delete process.env.ANDROID_APPLICATION_ID;
    const { exp } = await getPrebuildConfigAsync(__dirname, { platforms: ["android"] });
    expect(exp.android.package).toBe("com.clawmuse");
  }, 30_000);

  it("uses a separate application id for the ClawMuse standalone installer", async () => {
    process.env.ANDROID_APPLICATION_ID = "com.clawmuse";
    const { exp } = await getPrebuildConfigAsync(__dirname, { platforms: ["android"] });
    expect(exp.android.package).toBe("com.clawmuse");
  }, 30_000);

  it.each([
    ["Google Play", "0"],
    ["F-Droid", "1"],
  ])(
    "%s build installs on devices without a camera",
    async (_build, fdroidFlag) => {
      process.env.PASEO_FDROID_BUILD = fdroidFlag;
      const manifest = await resolveAndroidManifest();
      const permissions = (manifest["uses-permission"] ?? []).map(
        (entry: ManifestEntry) => entry.$["android:name"],
      );
      const features = (manifest["uses-feature"] ?? []).map((entry: ManifestEntry) => entry.$);
      const broadMediaPermissions = [
        "READ_MEDIA_IMAGES",
        "READ_MEDIA_VIDEO",
        "READ_MEDIA_AUDIO",
        "READ_MEDIA_VISUAL_USER_SELECTED",
        "READ_EXTERNAL_STORAGE",
        "WRITE_EXTERNAL_STORAGE",
      ];
      for (const permission of broadMediaPermissions) {
        const declaration = (manifest["uses-permission"] ?? []).find(
          (entry: ManifestEntry) => entry.$["android:name"] === `android.permission.${permission}`,
        );
        expect(declaration?.$["tools:node"]).toBe("remove");
      }

      expect(permissions).toContain("android.permission.CAMERA");
      expect(features).toEqual(
        expect.arrayContaining([
          { "android:name": "android.hardware.camera", "android:required": "false" },
          { "android:name": "android.hardware.camera.autofocus", "android:required": "false" },
        ]),
      );
    },
    30_000,
  );
});

describe("iOS app config", () => {
  it("composes Expo scene support with paste input and ClawMuse capabilities", async () => {
    const { exp } = await getPrebuildConfigAsync(__dirname, { platforms: ["ios"] });
    // Introspection seeds modResults from the generated ios/ Info.plist, whose
    // scene manifest already carries PaseoSceneDelegate; expo-build-properties
    // then refuses to compose. Clearing the key mirrors a clean checkout.
    exp.ios.infoPlist.UIApplicationSceneManifest = undefined;
    await compileModsAsync(exp, {
      projectRoot: __dirname,
      introspect: true,
      platforms: ["ios"],
      assertMissingModProviders: false,
    });

    const { infoPlist, entitlements } = exp._internal.modResults.ios;
    expect(() => verifyIosSceneManifest(infoPlist)).not.toThrow();
    const orientations = [
      "UIInterfaceOrientationPortrait",
      "UIInterfaceOrientationPortraitUpsideDown",
      "UIInterfaceOrientationLandscapeLeft",
      "UIInterfaceOrientationLandscapeRight",
    ];
    expect(infoPlist.UISupportedInterfaceOrientations).toEqual(orientations);
    expect(infoPlist["UISupportedInterfaceOrientations~ipad"]).toEqual(orientations);
    expect(infoPlist.NSSupportsLiveActivities).toBe(true);
    expect(infoPlist.UIBackgroundModes).toContain("audio");
    expect(infoPlist.NSLocalNetworkUsageDescription).toBe(
      "Connect to coding agent hosts on your local network.",
    );
    expect(infoPlist.NSPhotoLibraryUsageDescription).toContain("attach");
    expect(infoPlist.ITSAppUsesNonExemptEncryption).toBeUndefined();
    expect(entitlements["com.apple.security.application-groups"]).toContain("group.com.clawmuse");
    expect(exp.runtimeVersion).toEqual({ policy: "fingerprint" });
  }, 30_000);
});

it("follows system rotation on Android", async () => {
  const manifest = await resolveAndroidManifest();
  const activity = manifest.application[0].activity.find(
    (entry: ManifestEntry) => entry.$["android:name"] === ".MainActivity",
  );
  expect(activity.$["android:screenOrientation"]).toBe("unspecified");
}, 30_000);
