import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  computeNextReleaseVersion,
  getReleaseInfoFromSourceTag,
  parseReleaseVersion,
} from "./release-version-utils.mjs";

import { planDesktopBeta } from "./release-desktop-beta.mjs";
import { checkReleaseSource } from "./check-release-source.mjs";

test("release source rejects divergent tags, dirty sources, and obsolete betas", () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "clawmuse-release-source-"));
  const git = (...args) =>
    execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
  try {
    git("init");
    git("config", "user.name", "Release test");
    git("config", "user.email", "release@example.test");
    const packagePath = path.join(cwd, "package.json");
    writeFileSync(packagePath, JSON.stringify({ version: "1.0.0", workspaces: [] }));
    git("add", ".");
    git("commit", "-m", "release");
    git("tag", "v1.0.0");
    git("tag", "v0.1.26-r10");
    const commit = git("rev-parse", "HEAD");
    git("update-ref", "refs/remotes/origin/main", commit);
    assert.deepEqual(checkReleaseSource({ cwd, tag: "v1.0.0" }), {
      version: "1.0.0",
      sourceTag: "v1.0.0",
      sourceCommit: commit,
    });
    git("tag", "ios-v1.0.0");
    assert.deepEqual(checkReleaseSource({ cwd, tag: "ios-v1.0.0" }), {
      version: "1.0.0",
      sourceTag: "ios-v1.0.0",
      sourceCommit: commit,
    });
    writeFileSync(packagePath, JSON.stringify({ version: "1.0.1", workspaces: [] }));
    assert.throws(() => checkReleaseSource({ cwd, tag: "v1.0.0" }), /uncommitted/);
    git("add", ".");
    git("commit", "-m", "next source");
    assert.throws(() => checkReleaseSource({ cwd, tag: "v1.0.0" }), /checked-out source/);
    git("tag", "desktop-macos-v1.0.0");
    assert.throws(
      () => checkReleaseSource({ cwd, tag: "desktop-macos-v1.0.0" }),
      /different source/,
    );
    git("tag", "desktop-macos-v1.0.0-beta.1");
    assert.throws(
      () => checkReleaseSource({ cwd, tag: "desktop-macos-v1.0.0-beta.1" }),
      /newer than stable/,
    );
    git("tag", "v1.0.2");
    assert.throws(() => checkReleaseSource({ cwd, tag: "v1.0.2" }), /expected version/);
    git("tag", "v1.0.1");
    assert.equal(checkReleaseSource({ cwd, tag: "v1.0.1" }).version, "1.0.1");
    git("commit", "--allow-empty", "-m", "new main work");
    git("update-ref", "refs/remotes/origin/main", "HEAD");
    git("tag", "ios-v1.0.1");
    assert.throws(() => checkReleaseSource({ cwd, tag: "ios-v1.0.1" }), /different source/);
    git("checkout", "v1.0.1");
    assert.throws(() => checkReleaseSource({ cwd, tag: "v1.0.1" }), /missing commits/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("computes the next beta patch from a stable version", () => {
  assert.equal(computeNextReleaseVersion("0.1.59", "beta-patch"), "0.1.60-beta.1");
});

test("advances beta versions", () => {
  assert.equal(computeNextReleaseVersion("0.1.60-beta.1", "beta-next"), "0.1.60-beta.2");
});

test("promotes beta versions to stable", () => {
  assert.equal(computeNextReleaseVersion("0.1.60-beta.2", "promote"), "0.1.60");
});

test("parses beta release metadata", () => {
  assert.deepEqual(parseReleaseVersion("0.1.60-beta.1"), {
    version: "0.1.60-beta.1",
    major: 0,
    minor: 1,
    patch: 60,
    prerelease: "beta.1",
    baseVersion: "0.1.60",
    isPrerelease: true,
    isBeta: true,
    betaNumber: 1,
  });
});

test("emits beta release info from tags", () => {
  assert.deepEqual(getReleaseInfoFromSourceTag("v0.1.60-beta.1"), {
    sourceTag: "v0.1.60-beta.1",
    releaseTag: "v0.1.60-beta.1",
    version: "0.1.60-beta.1",
    baseVersion: "0.1.60",
    prerelease: "beta.1",
    isPrerelease: true,
    isBeta: true,
    betaNumber: 1,
    releaseType: "prerelease",
    releaseChannel: "beta",
    isSmokeTag: false,
  });
});

test("rejects non-beta prerelease versions", () => {
  assert.throws(() => parseReleaseVersion("0.1.60-canary.1"), /Expected beta prerelease versions/);
});

test("workspace version sync preserves the desktop distribution's own branding", () => {
  const root = mkdtempSync(path.join(tmpdir(), "clawmuse-version-sync-"));
  try {
    mkdirSync(path.join(root, "scripts"));
    mkdirSync(path.join(root, "packages/desktop"), { recursive: true });
    cpSync(
      new URL("./sync-workspace-versions.mjs", import.meta.url),
      path.join(root, "scripts/sync.mjs"),
    );
    writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({
        version: "0.13.0",
        workspaces: ["packages/desktop"],
        homepage: "https://paseo.sh",
        repository: { type: "git", url: "https://github.com/getpaseo/paseo.git" },
        license: "Apache-2.0",
      }),
    );
    const desktopFile = path.join(root, "packages/desktop/package.json");
    const repository = { type: "git", url: "https://github.com/endvin/clawmuse.git" };
    writeFileSync(
      desktopFile,
      JSON.stringify({
        name: "@getpaseo/desktop",
        version: "0.12.0",
        private: true,
        homepage: "https://clawmuse.com",
        repository,
        dependencies: { "@getpaseo/server": "0.12.0" },
      }),
    );
    execFileSync(process.execPath, [path.join(root, "scripts/sync.mjs")]);
    const desktop = JSON.parse(readFileSync(desktopFile, "utf8"));
    assert.equal(desktop.version, "0.13.0");
    assert.equal(desktop.dependencies["@getpaseo/server"], "*");
    assert.equal(desktop.homepage, "https://clawmuse.com");
    assert.deepEqual(desktop.repository, repository);
    assert.equal(desktop.license, "Apache-2.0");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("per-platform beta plans only trigger the selected desktop build", () => {
  const commit = "a".repeat(40);
  for (const platform of ["macos", "linux", "windows"]) {
    const plan = planDesktopBeta({ platform, version: "0.13.0-beta.4", commit });
    assert.equal(plan.releaseTag, "v0.13.0-beta.4");
    assert.deepEqual(plan.refs, [
      `${commit}:refs/tags/desktop-${platform}-v0.13.0-beta.4`,
      ...(platform === "macos"
        ? []
        : [`${commit}:refs/heads/release-build/desktop-${platform}-v0.13.0-beta.4`]),
    ]);
    assert.ok(!plan.refs.some((ref) => ref.includes(":refs/tags/v")));
  }
  assert.throws(
    () => planDesktopBeta({ platform: "macos", version: "0.13.0", commit }),
    /beta version/,
  );
  assert.throws(
    () => planDesktopBeta({ platform: "android", version: "0.13.0-beta.4", commit }),
    /platform/,
  );
});
