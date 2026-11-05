import { describe, expect, it } from "vitest";
import { resolveUpdateChannel, resolveUpdatesConfig } from "./updates-config";

const { EXCLUDED_ANDROID_MODULES } = require("./plugins/with-fdroid-autolinking");

const PROJECT = "11111111-2222-3333-4444-555555555555";

describe("resolveUpdatesConfig", () => {
  it("points a production build at the EAS project and stamps its channel", () => {
    expect(
      resolveUpdatesConfig({
        easProjectId: PROJECT,
        isFdroidBuild: false,
        appVariant: "production",
      }),
    ).toEqual({
      url: `https://u.expo.dev/${PROJECT}`,
      requestHeaders: { "expo-channel-name": "production" },
    });
  });

  // F-Droid ships an APK built from source and has to reproduce what runs.
  it("refuses to enable updates for an F-Droid build even with a project to fetch from", () => {
    expect(
      resolveUpdatesConfig({
        easProjectId: PROJECT,
        isFdroidBuild: true,
        appVariant: "production",
      }),
    ).toEqual({ enabled: false });
  });

  it("disables updates when no project is named, rather than building an unresolvable URL", () => {
    for (const easProjectId of [undefined, "", "   "]) {
      expect(
        resolveUpdatesConfig({ easProjectId, isFdroidBuild: false, appVariant: "production" }),
      ).toEqual({ enabled: false });
    }
  });
});

describe("resolveUpdateChannel", () => {
  it("follows the app variant", () => {
    expect(resolveUpdateChannel({ appVariant: "production" })).toBe("production");
    expect(resolveUpdateChannel({ appVariant: "development" })).toBe("development");
  });

  it("takes an explicit override, ignoring a blank one", () => {
    expect(resolveUpdateChannel({ appVariant: "production", channelOverride: " staging " })).toBe(
      "staging",
    );
    expect(resolveUpdateChannel({ appVariant: "production", channelOverride: "  " })).toBe(
      "production",
    );
  });
});

describe("F-Droid autolinking", () => {
  it("keeps the updates module out of the APK, not just the config", () => {
    expect(EXCLUDED_ANDROID_MODULES).toContain("expo-updates");
  });
});
