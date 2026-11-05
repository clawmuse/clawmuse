import { describe, expect, test } from "vitest";
import { cliCommandNames, isOwnCliTarget, planCliInstall } from "./cli-names.js";

describe("cliCommandNames", () => {
  test("lists the branded command, its aliases and the legacy name once each", () => {
    expect(cliCommandNames()).toEqual(["clawmuse", "cm", "paseo"]);
  });
});

describe("planCliInstall", () => {
  test("installs every name on a clean machine", () => {
    expect(
      planCliInstall({
        names: ["clawmuse", "cm", "paseo"],
        targets: { clawmuse: "missing", cm: "missing", paseo: "missing" },
        onPath: new Set(),
      }),
    ).toEqual({ install: ["clawmuse", "cm", "paseo"], skipped: [] });
  });

  test("skips a new alias owned by another program instead of overwriting it", () => {
    expect(
      planCliInstall({
        names: ["clawmuse", "cm", "paseo"],
        targets: { clawmuse: "ours", cm: "foreign", paseo: "ours" },
        onPath: new Set(),
      }),
    ).toEqual({ install: ["clawmuse", "paseo"], skipped: ["cm"] });
  });

  test("skips a new alias that another directory on PATH already provides", () => {
    expect(
      planCliInstall({
        names: ["clawmuse", "cm", "paseo"],
        targets: { clawmuse: "missing", cm: "missing", paseo: "missing" },
        onPath: new Set(["cm"]),
      }),
    ).toEqual({ install: ["clawmuse", "paseo"], skipped: ["cm"] });
  });

  test("keeps replacing the legacy name, which the app has always owned", () => {
    expect(
      planCliInstall({
        names: ["clawmuse", "cm", "paseo"],
        targets: { clawmuse: "missing", cm: "missing", paseo: "foreign" },
        onPath: new Set(["paseo"]),
      }),
    ).toEqual({ install: ["clawmuse", "cm", "paseo"], skipped: [] });
  });
});

describe("isOwnCliTarget", () => {
  const shimPath = "/Applications/ClawMuse.app/Contents/Resources/bin/paseo";

  test("recognizes links to the bundled shim, including hand-made ones", () => {
    expect(isOwnCliTarget({ kind: "symlink", target: shimPath }, { sourcePaths: [shimPath] })).toBe(
      true,
    );
    expect(
      isOwnCliTarget(
        {
          kind: "symlink",
          target: "/Users/me/Applications/ClawMuse.app/Contents/Resources/bin/paseo",
        },
        { sourcePaths: [shimPath] },
      ),
    ).toBe(true);
  });

  test("recognizes the deb/rpm shim under /opt", () => {
    expect(
      isOwnCliTarget(
        { kind: "symlink", target: "/opt/ClawMuse/resources/bin/paseo" },
        { sourcePaths: [] },
      ),
    ).toBe(true);
  });

  test("recognizes links to a ClawMuse AppImage", () => {
    expect(
      isOwnCliTarget(
        { kind: "symlink", target: "/home/me/Applications/ClawMuse-x86_64.AppImage" },
        { sourcePaths: ["/tmp/.mount_x/resources/bin/paseo"] },
      ),
    ).toBe(true);
  });

  test("recognizes the generated Windows trampoline", () => {
    expect(
      isOwnCliTarget(
        { kind: "file", content: '@echo off\r\nset "BUNDLED_CLI=C:\\x\\paseo.cmd"\r\n' },
        { sourcePaths: [] },
      ),
    ).toBe(true);
  });

  test("treats other programs as foreign", () => {
    expect(
      isOwnCliTarget(
        { kind: "symlink", target: "/opt/plasticscm5/client/cm" },
        { sourcePaths: [shimPath] },
      ),
    ).toBe(false);
    expect(
      isOwnCliTarget({ kind: "file", content: "#!/bin/sh\nexec cm" }, { sourcePaths: [] }),
    ).toBe(false);
  });
});
