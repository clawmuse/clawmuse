// Ported from the EndToAI/Orca fork
// (`agent/mobile/plugins/orca-agent-live-activity/live-activity-product-contract.test.js`).
// These assertions exist because nothing else on a Linux checkout can catch a
// broken Live Activity: the Swift is not compiled here, so the product contract
// is pinned as text.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const APP_ROOT = path.resolve(__dirname, "../..");
const MODULE_ROOT = path.resolve(APP_ROOT, "../expo-agent-live-activity");
const TARGET_ROOT = path.resolve(APP_ROOT, "targets/clawmuse-agent-live-activity");

function readApp(relativePath: string): string {
  return fs.readFileSync(path.join(APP_ROOT, relativePath), "utf8");
}

function readModule(relativePath: string): string {
  return fs.readFileSync(path.join(MODULE_ROOT, relativePath), "utf8");
}

function readTarget(relativePath: string): string {
  return fs.readFileSync(path.join(TARGET_ROOT, relativePath), "utf8");
}

function localizationKeys(contents: string): string[] {
  return contents
    .split("\n")
    .map((line) => /^"([A-Z0-9_]+)"\s*=/.exec(line)?.[1])
    .filter((key): key is string => key !== undefined);
}

describe("ClawMuse Live Activity product contract", () => {
  it("ships no Bluetooth path and no app delegate subscriber", () => {
    const moduleConfig = JSON.parse(readModule("expo-module.config.json"));
    const iosDirectory = path.join(MODULE_ROOT, "ios");

    expect(moduleConfig.ios.appDelegateSubscribers ?? []).toEqual([]);
    expect(fs.readdirSync(iosDirectory).filter((name) => /Bluetooth/i.test(name))).toEqual([]);
    expect(readModule("ios/ClawMuseAgentLiveActivity.podspec")).not.toMatch(/CoreBluetooth/);
    expect(
      fs.existsSync(path.join(iosDirectory, "AgentLiveActivityAppDelegateSubscriber.swift")),
    ).toBe(false);
  });

  it("uses the fixed native module name the app calls", () => {
    expect(readModule("ios/ClawMuseAgentLiveActivityModule.swift")).toContain(
      'Name("ClawMuseAgentLiveActivity")',
    );
    expect(readModule("src/index.ts")).toContain(
      'requireOptionalNativeModule<NativeAgentLiveActivityModule>("ClawMuseAgentLiveActivity")',
    );
    expect(JSON.parse(readModule("expo-module.config.json")).ios.modules).toEqual([
      "ClawMuseAgentLiveActivityModule",
    ]);
  });

  it("reconciles remote cards before publishing tokens and dismisses old cards immediately", () => {
    const controller = readModule("ios/AgentLiveActivityController.swift");
    const module = readModule("ios/ClawMuseAgentLiveActivityModule.swift");

    expect(module).toContain('AsyncFunction("getPushTokenSnapshot")');
    expect(module).toMatch(
      /for await activity in [^\n]*activityUpdates \{[\s\S]*?await self\?\.observeCurrentActivityToken\(including: activity\)/,
    );
    expect(module).toMatch(
      /AsyncFunction\("getPushTokenSnapshot"\)[\s\S]*?await self\.controller\(\)\.pushTokenSnapshot\(\)/,
    );
    expect(module).toMatch(
      /OnAppEntersForeground \{[\s\S]*?await self\?\.observeCurrentActivityToken\(\)/,
    );
    expect(controller).toMatch(/case \.active, \.stale:/);
    expect(controller).toMatch(/duplicate\.end\(nil, dismissalPolicy: \.immediate\)/);
    expect(controller).not.toContain("dismissalPolicy: .after");
  });

  it("keeps streamed update tokens available to later snapshots", () => {
    const module = readModule("ios/ClawMuseAgentLiveActivityModule.swift");
    const controller = readModule("ios/AgentLiveActivityController.swift");

    expect(module).toMatch(
      /await self\?\.controller\(\)\.recordPushToken\(token, for: activity\.id\)[\s\S]*?self\?\.sendEvent\(/,
    );
    expect(controller).toContain("activityPushToken = (activityId, token)");
    expect(controller).toContain("token = activityPushToken?.token");
    expect(controller).toContain('return ["activityId": activity.id, "activities": tokens]');
  });

  it("routes every Live Activity presentation to the aggregate home screen", () => {
    const appConfig = readApp("app.config.js");
    const attributes = readModule("ios/AgentLiveActivityAttributes.swift");
    const widget = readTarget("ClawMuseAgentLiveActivityWidget.swift");

    // Both schemes stay registered: the service accepts clawmuse:// and paseo://.
    expect(appConfig).toContain('scheme: ["paseo", "clawmuse"]');
    expect(attributes).toMatch(/homeDeepLink = "clawmuse:\/\/home\?focus=agent-activity"/);
    expect(
      widget.match(/\.widgetURL\(URL\(string: ClawMuseAgentActivityAttributes\.homeDeepLink\)\)/g),
    ).toHaveLength(2);
  });

  it("declares the App Group and Live Activity support on the app itself", () => {
    const appConfig = readApp("app.config.js");

    expect(appConfig).toContain("NSSupportsLiveActivities: true");
    expect(appConfig).toContain('"com.apple.security.application-groups": ["group.com.clawmuse"]');
    expect(appConfig).toContain("withClawMuseAgentLiveActivity");
    expect(readTarget("Extension.entitlements")).toContain("group.com.clawmuse");
  });

  it("keeps the widget kind stable so an installed widget survives an update", () => {
    expect(readTarget("ClawMuseAgentQuotaWidget.swift")).toContain(
      'StaticConfiguration(kind: "ClawMuseAgentQuotaWidget"',
    );
  });

  it("exposes all three useful alert counts and both localizations", () => {
    const chinese = readTarget("zh-Hans.lproj/Localizable.strings");
    const english = readTarget("en.lproj/Localizable.strings");
    const island = readTarget("ClawMuseAgentDynamicIslandViews.swift");
    const widget = readTarget("ClawMuseAgentLiveActivityWidget.swift");
    const counts = readTarget("ClawMuseAgentUsageMeterView.swift");

    // Every key exists in both tables, or a locale silently falls back mid-screen.
    expect(localizationKeys(english)).toEqual(localizationKeys(chinese));
    expect(localizationKeys(chinese).every((key) => key.startsWith("CLAWMUSE_"))).toBe(true);

    for (const strings of [chinese, english]) {
      const bodies = strings
        .split("\n")
        .filter((line) => /^"CLAWMUSE_STATUS_(NEEDS_ACTION|COMPLETED|MIXED)_BODY"/.test(line));
      expect(bodies).toHaveLength(3);
      for (const body of bodies) {
        // The APNs payload orders its args running / needs-action / completed.
        expect(body).toMatch(/%3\$@/);
        expect(body).toMatch(/%1\$@/);
        expect(body).toMatch(/%2\$@/);
      }
    }
    expect(chinese).toMatch(/"CLAWMUSE_LIVE_ACTIVITY_START_TITLE" = "ClawMuse 远程任务"/);
    expect(chinese).not.toMatch(/"Orca 远程任务"/);
    expect(chinese).toMatch(
      /"CLAWMUSE_LIVE_ACTIVITY_START_BODY" = "%3\$@ 个进行中，%1\$@ 个待操作，%2\$@ 个完成待查看"/,
    );

    expect(island).toMatch(/ClawMuseAgentCompactLeadingView/);
    expect(island).toMatch(/presentation\.showsUnverifiable/);
    // Every Live Activity surface is about tasks, including the smallest island slot.
    const lockScreen = readTarget("ClawMuseAgentLockScreenView.swift");
    for (const surface of [lockScreen, island, widget]) {
      expect(surface).not.toMatch(/UsageView|UsageBar|UsageWindow|featuredUsage|RemainingRing/);
    }
    expect(lockScreen).toContain("ClawMuseAgentActivitySummaryView");
    expect(island).toContain("ClawMuseAgentActivitySummaryView");
    for (const count of [
      "displayedRunningCount",
      "displayedNeedsActionCount",
      "displayedCompletedUnreadCount",
    ]) {
      expect(counts).toMatch(new RegExp(count));
    }
    expect(widget).toMatch(/ClawMuseAgentMinimalIslandView/);
  });

  it("keeps user-visible copy out of the Swift sources", () => {
    const chinese = new RegExp("[\\u4e00-\\u9fff]");
    for (const name of fs.readdirSync(TARGET_ROOT).filter((file) => file.endsWith(".swift"))) {
      expect(readTarget(name), `${name} still holds hard-coded Chinese`).not.toMatch(chinese);
    }
  });

  it("shows every plan and both reset countdowns in the large quota widget", () => {
    const quota = readTarget("ClawMuseAgentQuotaWidget.swift");
    const usage = readTarget("ClawMuseAgentUsageMeterView.swift");

    expect(quota).toMatch(/maximum: nil/);
    expect(quota).toMatch(/showsResetCountdown: true/);
    expect(usage).toMatch(
      /ClawMuseAgentUsageCopy\.resetCountdown\(to: window\.resetsAt, from: now\)/,
    );
    expect(usage).toMatch(/includesResetLabel/);
  });
});
