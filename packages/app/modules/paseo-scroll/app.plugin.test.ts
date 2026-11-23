import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const { configureScrollPackage } = require("./app.plugin");

describe("Android scroll registration", () => {
  it("gives the app scroll manager precedence over the prebuilt React Native manager", () => {
    const source = "PackageList(this).packages.apply {\n}";
    const result = configureScrollPackage(source);
    expect(result).toBe(
      "PackageList(this).packages.apply {\n              add(0, sh.paseo.scroll.PaseoScrollPackage())\n}",
    );
    expect(configureScrollPackage(result)).toBe(result);
  });

  it("fails prebuild when the template no longer supports registration", () => {
    expect(() => configureScrollPackage("changed template")).toThrow(
      "Could not register Android scroll behavior",
    );
  });
});

describe("iOS PaseoScrollViewComponentView gesture attachment", () => {
  it("does not override -[RCTViewComponentView contentView] which breaks NativeViewGestureHandler", () => {
    const iosSource = readFileSync(join(__dirname, "ios/PaseoScrollViewComponentView.mm"), "utf8");
    expect(iosSource).not.toMatch(/-\s*\([^)]*\)\s*contentView\b/);
    expect(iosSource).not.toMatch(/@property[^;]*\bcontentView\b/);
    expect(iosSource).toContain("- (UIView *)scrollContentView");
  });
});
