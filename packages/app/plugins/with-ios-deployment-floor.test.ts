import { describe, expect, it } from "vitest";

const { configurePodfileDeploymentFloor } = require("./with-ios-deployment-floor");

const GENERATED_POST_INSTALL_TAIL = [
  "  post_install do |installer|",
  "    react_native_post_install(",
  "      installer,",
  "      config[:reactNativePath],",
  "      :mac_catalyst_enabled => false,",
  "      :ccache_enabled => ccache_enabled?(podfile_properties),",
  "    )",
  "  end",
  "end",
].join("\n");

describe("withIosDeploymentFloor", () => {
  it("floors pod deployment targets after react_native_post_install", () => {
    const configured = configurePodfileDeploymentFloor(GENERATED_POST_INSTALL_TAIL);

    expect(configured).toContain("Gem::Version.new(current) < Gem::Version.new('15.1')");
    expect(configured).toContain("config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.1'");
    expect(configured.indexOf("react_native_post_install")).toBeLessThan(
      configured.indexOf("installer.pods_project.targets.each"),
    );
    expect(configurePodfileDeploymentFloor(configured)).toBe(configured);
  });

  it("throws when the generated Podfile shape changes", () => {
    expect(() =>
      configurePodfileDeploymentFloor("post_install do |installer|\n  end\nend"),
    ).toThrow("react_native_post_install");
  });
});
