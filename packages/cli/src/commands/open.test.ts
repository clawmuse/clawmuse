import path from "node:path";
import { describe, expect, test } from "vitest";
import { desktopAppCandidates } from "./open.js";

describe("desktopAppCandidates", () => {
  test("looks for the branded app bundle on macOS", () => {
    expect(desktopAppCandidates({ platform: "darwin", home: "/Users/me" })).toEqual([
      "/Applications/ClawMuse.app",
      path.join("/Users/me", "Applications", "ClawMuse.app"),
    ]);
  });

  test("covers the deb/rpm install and the published AppImage names on Linux", () => {
    expect(desktopAppCandidates({ platform: "linux", home: "/home/me" })).toEqual([
      "/usr/bin/ClawMuse",
      "/opt/ClawMuse/ClawMuse",
      path.join("/home/me", "Applications", "ClawMuse.AppImage"),
      path.join("/home/me", "Applications", "ClawMuse-x86_64.AppImage"),
      path.join("/home/me", "Applications", "ClawMuse-arm64.AppImage"),
    ]);
  });

  test("uses the per-user NSIS install directory on Windows", () => {
    expect(
      desktopAppCandidates({
        platform: "win32",
        home: "C:\\Users\\me",
        localAppData: "C:\\Users\\me\\AppData\\Local",
      }),
    ).toEqual([path.join("C:\\Users\\me\\AppData\\Local", "Programs", "ClawMuse", "ClawMuse.exe")]);
  });

  test("has no Windows candidate without LOCALAPPDATA", () => {
    expect(desktopAppCandidates({ platform: "win32", home: "C:\\Users\\me" })).toEqual([]);
  });
});
