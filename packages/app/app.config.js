const brand = require("../../branding/brand.json");
const fs = require("node:fs");
const path = require("node:path");
const pkg = require("./package.json");
const withAndroidAsyncStorageSize = require("./plugins/with-android-async-storage-size");
const withAndroidOptionalCamera = require("./plugins/with-android-optional-camera");
const withAndroidProfileable = require("./plugins/with-android-profileable");
const withFdroidAutolinking = require("./plugins/with-fdroid-autolinking");
const withPasteInput = require("./plugins/with-paste-input");
const withClawMuseAgentLiveActivity = require("./plugins/clawmuse-agent-live-activity");
const withAndroidScroll = require("./modules/paseo-scroll/app.plugin");
const withIosDeploymentFloor = require("./plugins/with-ios-deployment-floor");
const { getNativeReleaseVersion } = require("./native-release-version");
const { resolveUpdatesConfig } = require("./updates-config");
const appVariant = process.env.APP_VARIANT ?? "production";
const isFdroidBuild = process.env.PASEO_FDROID_BUILD === "1";
const isWatchdogBuild = process.env.PASEO_WATCHDOG_BUILD === "1";
const isProfileBuild = process.env.PASEO_PROFILE_BUILD === "1";

const buildProfile = isFdroidBuild
  ? {
      androidPermissions: [
        "RECORD_AUDIO",
        "android.permission.RECORD_AUDIO",
        "android.permission.MODIFY_AUDIO_SETTINGS",
      ],
      cameraPlugins: [],
      fdroidPlugins: [withFdroidAutolinking],
      notificationPlugins: [],
    }
  : {
      androidPermissions: [
        "RECORD_AUDIO",
        "android.permission.RECORD_AUDIO",
        "android.permission.MODIFY_AUDIO_SETTINGS",
        "CAMERA",
        "android.permission.CAMERA",
      ],
      cameraPlugins: [
        [
          "expo-camera",
          {
            cameraPermission:
              "Allow $(PRODUCT_NAME) to access your camera to scan pairing QR codes.",
          },
        ],
        [
          "expo-media-library",
          {
            // Android uses the system Photo Picker; only iOS offers a latest-photo shortcut.
            photosPermission:
              "Show your latest photo so you can attach it to an agent conversation.",
            savePhotosPermission: false,
            granularPermissions: [],
          },
        ],
      ],
      fdroidPlugins: [],
      notificationPlugins: [
        [
          "expo-notifications",
          {
            icon: "./assets/images/notification-icon.png",
            color: "#20744A",
          },
        ],
      ],
    };

function resolveSecretFile(params) {
  const fromEnv = process.env[params.envKey];
  if (typeof fromEnv === "string" && fromEnv.trim().length > 0) {
    return fromEnv.trim();
  }

  const fallbackAbsolutePath = path.resolve(__dirname, params.fallbackRelativePath);
  if (fs.existsSync(fallbackAbsolutePath)) {
    return params.fallbackRelativePath;
  }

  return undefined;
}

const variants = {
  production: {
    name: brand.name,
    packageId: "com.clawmuse",
    googleServicesFile: resolveSecretFile({
      envKey: "GOOGLE_SERVICES_FILE_PROD",
      fallbackRelativePath: "./.secrets/google-services.prod.json",
    }),
    googleServiceInfoPlist: resolveSecretFile({
      envKey: "GOOGLE_SERVICE_INFO_PLIST_PROD",
      fallbackRelativePath: "./.secrets/GoogleService-Info.prod.plist",
    }),
  },
  development: {
    name: `${brand.name} Debug`,
    packageId: "com.clawmuse.debug",
    googleServicesFile: resolveSecretFile({
      envKey: "GOOGLE_SERVICES_FILE_DEBUG",
      fallbackRelativePath: "./.secrets/google-services.debug.json",
    }),
    googleServiceInfoPlist: resolveSecretFile({
      envKey: "GOOGLE_SERVICE_INFO_PLIST_DEBUG",
      fallbackRelativePath: "./.secrets/GoogleService-Info.debug.plist",
    }),
  },
};

const variant = variants[appVariant] ?? variants.production;
const nativeReleaseVersion = getNativeReleaseVersion(pkg.version);
const iosBundleIdentifier =
  appVariant === "development" ? `${brand.iosBundleId}.debug` : brand.iosBundleId;
const iosBuildNumber = process.env.CLAWMUSE_IOS_BUILD_NUMBER ?? nativeReleaseVersion.iosBuildNumber;
if (!/^[1-9][0-9]*$/.test(iosBuildNumber)) throw new Error("Invalid CLAWMUSE_IOS_BUILD_NUMBER");

export default {
  expo: {
    name: variant.name,
    slug: "clawmuse",
    version: nativeReleaseVersion.appVersion,
    orientation: "default",
    icon: "./assets/images/icon.png",
    scheme: ["paseo", "clawmuse"],
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    // Localized InfoPlist.strings so permission prompts follow the system
    // language instead of falling back to the English Info.plist strings.
    locales: {
      en: "./locales/en.json",
      ar: "./locales/ar.json",
      es: "./locales/es.json",
      fr: "./locales/fr.json",
      ja: "./locales/ja.json",
      ko: "./locales/ko.json",
      "pt-BR": "./locales/pt-BR.json",
      ru: "./locales/ru.json",
      "zh-Hans": "./locales/zh-Hans.json",
    },
    // Fingerprint, not appVersion: an update may only land on a binary whose
    // native side is identical, so a JS bundle can never reach a build that
    // lacks a native module it calls.
    runtimeVersion: { policy: "fingerprint" },
    updates: resolveUpdatesConfig({
      easProjectId: process.env.EAS_PROJECT_ID,
      isFdroidBuild,
      appVariant,
      channelOverride: process.env.CLAWMUSE_UPDATE_CHANNEL,
    }),
    ios: {
      supportsTablet: true,
      infoPlist: {
        NSMicrophoneUsageDescription: "This app needs access to the microphone for voice commands.",
        NSLocalNetworkUsageDescription: "Connect to coding agent hosts on your local network.",
        NSSupportsLiveActivities: true,
        // The two-way engine owns the live session; iOS must keep it running offscreen.
        UIBackgroundModes: ["audio"],
      },
      entitlements: {
        // Shared with ClawMuseAgentLiveActivityExtension; the home-screen widget
        // reads its snapshot out of this App Group.
        "com.apple.security.application-groups": ["group.com.clawmuse"],
      },
      bundleIdentifier: iosBundleIdentifier,
      ...(variant.googleServiceInfoPlist
        ? { googleServicesFile: variant.googleServiceInfoPlist }
        : {}),
      buildNumber: iosBuildNumber,
    },
    android: {
      adaptiveIcon: {
        backgroundColor: "#102827",
        foregroundImage: "./assets/images/android-icon-foreground.png",
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      softwareKeyboardLayoutMode: "resize",
      // Allow HTTP connections for local network hosts (required for release builds)
      usesCleartextTraffic: true,
      permissions: buildProfile.androidPermissions,
      blockedPermissions: [
        "android.permission.READ_MEDIA_IMAGES",
        "android.permission.READ_MEDIA_VIDEO",
        "android.permission.READ_MEDIA_AUDIO",
        "android.permission.READ_MEDIA_VISUAL_USER_SELECTED",
        "android.permission.READ_EXTERNAL_STORAGE",
        "android.permission.WRITE_EXTERNAL_STORAGE",
      ],
      package: process.env.ANDROID_APPLICATION_ID || variant.packageId,
      versionCode: nativeReleaseVersion.androidVersionCode,
      ...(variant.googleServicesFile ? { googleServicesFile: variant.googleServicesFile } : {}),
    },
    web: {
      output: "single",
      favicon: "./assets/images/favicon.png",
    },
    autolinking: {
      searchPaths: ["../../node_modules", "./node_modules"],
    },
    plugins: [
      "expo-secure-store",
      "expo-router",
      withPasteInput,
      withAndroidScroll,
      withIosDeploymentFloor,
      [withAndroidAsyncStorageSize, 64],
      ...buildProfile.cameraPlugins,
      withAndroidOptionalCamera,
      [
        "expo-splash-screen",
        {
          image: "./assets/images/splash-icon.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#102827",
          dark: {
            backgroundColor: "#102827",
          },
        },
      ],
      ...buildProfile.notificationPlugins,
      ["expo-audio", { enableBackgroundPlayback: false, enableBackgroundRecording: false }],
      [
        "expo-gradle-jvmargs",
        {
          xmx: "4096m",
          maxMetaspace: "1024m",
        },
      ],
      [
        "expo-build-properties",
        {
          ios: { enableSceneSupport: true },
          android: {
            minSdkVersion: 29,
            targetSdkVersion: 36,
            kotlinVersion: "2.1.20",
            // Allow HTTP connections for local network hosts in release builds
            usesCleartextTraffic: true,
          },
        },
      ],
      withClawMuseAgentLiveActivity,
      ...buildProfile.fdroidPlugins,
      ...(isProfileBuild || isWatchdogBuild ? [withAndroidProfileable] : []),
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
      autolinkingModuleResolution: true,
    },
    extra: {
      fdroidBuild: isFdroidBuild,
      profileBuild: isProfileBuild,
      watchdogBuild: isWatchdogBuild,
      diagnosticRevision: process.env.PASEO_DIAGNOSTIC_REVISION,
      diagnosticBuildTime: process.env.PASEO_DIAGNOSTIC_BUILD_TIME,
      router: {},
      eas: {
        ...(process.env.EAS_PROJECT_ID ? { projectId: process.env.EAS_PROJECT_ID } : {}),
        // EAS needs the extension declared to manage its own credentials; the
        // Mac release script signs it from fastlane instead.
        build: {
          experimental: {
            ios: {
              appExtensions: [
                {
                  targetName: "ClawMuseAgentLiveActivityExtension",
                  bundleIdentifier: `${iosBundleIdentifier}.AgentLiveActivityExtension`,
                },
              ],
            },
          },
        },
      },
    },
    ...(process.env.EXPO_OWNER ? { owner: process.env.EXPO_OWNER } : {}),
  },
};
