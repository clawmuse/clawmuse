import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { validateDesktopManifests } from "./validate-desktop-manifests.mjs";
import { prepareDesktopUpdates } from "./prepare-desktop-updates.mjs";
import { finalizeMacDistribution } from "../packages/desktop/scripts/finalize-mac-distribution.mjs";
import { dump, load } from "js-yaml";
import { findFile, resolveFiles } from "electron-updater/out/providers/Provider.js";

const releaseDate = "2026-09-04T00:00:00.000Z";
const scriptPath = fileURLToPath(new URL("./validate-desktop-manifests.mjs", import.meta.url));

test("DMG stapling refreshes checksums and blockmaps before staging Mac updates", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "clawmuse-notarized-dmg-"));
  const source = path.join(directory, "source");
  mkdirSync(source);
  const identity = "Developer ID Application: ClawMuse Test (ABCDEFGHIJ)";
  const env = {
    APPLE_SIGN_IDENTITY: identity,
    APPLE_TEAM_ID: "ABCDEFGHIJ",
    APPLE_KEYCHAIN_PROFILE: "test-notary",
  };
  const zip = "ClawMuse-0.13.0-arm64.zip",
    dmg = "ClawMuse-0.13.0-arm64.dmg";
  const manifestPath = path.join(source, "latest-mac.yml");
  function info(file) {
    const bytes = readFileSync(file);
    return { size: bytes.length, sha512: createHash("sha512").update(bytes).digest("base64") };
  }
  try {
    writeFileSync(path.join(source, zip), "notarized app ZIP");
    writeFileSync(path.join(source, dmg), "signed DMG");
    const manifest = {
      version: "0.13.0",
      releaseDate,
      files: [zip, dmg].map((url) => Object.assign({ url }, info(path.join(source, url)))),
      path: zip,
      sha512: info(path.join(source, zip)).sha512,
    };
    writeFileSync(manifestPath, dump(manifest));
    writeFileSync(path.join(source, "beta-linux-arm64.yml"), "unchanged Linux feed");
    const original = readFileSync(manifestPath, "utf8");
    const calls = [];
    let accepted = false;
    const run = (command, args) => {
      calls.push([command, args]);
      if (args[0] === "--display") return `Authority=${identity}`;
      if (args[0] === "notarytool")
        return JSON.stringify({ id: "test-id", status: accepted ? "Accepted" : "Invalid" });
      if (args[0] === "stapler" && args[1] === "staple")
        writeFileSync(args[2], "signed DMG with stapled ticket");
      if (command.endsWith("spctl")) return "accepted\nsource=Notarized Developer ID";
      return "";
    };
    const blockmap = async (file) => {
      writeFileSync(`${file}.blockmap`, "fresh blockmap");
      return info(file);
    };
    await assert.rejects(
      finalizeMacDistribution({ directory: source, version: "0.13.0", env, run, blockmap }),
      /not accepted/,
    );
    assert.equal(readFileSync(manifestPath, "utf8"), original);
    assert.equal(existsSync(path.join(source, `${dmg}.blockmap`)), false);
    accepted = true;
    await finalizeMacDistribution({ directory: source, version: "0.13.0", env, run, blockmap });
    assert.ok(
      calls.some(
        ([command, args]) =>
          command.endsWith("spctl") && args.includes("context:primary-signature"),
      ),
    );
    const result = load(readFileSync(manifestPath, "utf8"));
    assert.deepEqual(result.files[0], manifest.files[0]);
    assert.deepEqual(result.files[1], { url: dmg, ...info(path.join(source, dmg)) });
    assert.notEqual(result.files[1].sha512, manifest.files[1].sha512);
    const output = path.join(directory, "output");
    await assert.rejects(
      prepareDesktopUpdates(source, output, { platform: "macos", expectedVersion: "1.0.0" }),
      /expected version 1.0.0/,
    );
    assert.equal(existsSync(output), false);
    await prepareDesktopUpdates(source, output, { platform: "macos" });
    assert.equal(
      readFileSync(path.join(output, `releases/0.13.0/${dmg}.blockmap`), "utf8"),
      "fresh blockmap",
    );
    assert.equal(
      readFileSync(path.join(source, "beta-linux-arm64.yml"), "utf8"),
      "unchanged Linux feed",
    );
    let called = false;
    await finalizeMacDistribution({
      directory: source,
      version: "0.13.0-beta.8",
      env: {},
      run: () => {
        called = true;
      },
    });
    assert.equal(called, false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

function withManifest(contents, run) {
  const dir = mkdtempSync(path.join(tmpdir(), "paseo-validate-desktop-manifest-"));
  const manifestPath = path.join(dir, "latest-mac.yml");
  try {
    writeFileSync(manifestPath, contents);
    run(manifestPath);
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
}

test("accepts a guarded macOS update manifest", () => {
  withManifest(
    `version: 0.7.3\nreleaseDate: '${releaseDate}'\nrolloutHours: 36\nminimumSystemVersion: 22.0.0\n`,
    (manifestPath) => {
      validateDesktopManifests({ releaseDate, rolloutHours: 36 }, [manifestPath]);
    },
  );
});

test("validates release manifests through the workflow CLI", () => {
  withManifest(
    `version: 0.7.3\nreleaseDate: '${releaseDate}'\nrolloutHours: 36\nminimumSystemVersion: 22.0.0\n`,
    (manifestPath) => {
      const result = spawnSync(
        process.execPath,
        [scriptPath, "--release-date", releaseDate, "--rollout-hours", "36", manifestPath],
        { encoding: "utf8" },
      );

      assert.equal(result.status, 0, result.stderr);
    },
  );
});

test("rejects a macOS update manifest without the system floor", () => {
  withManifest(
    `version: 0.7.3\nreleaseDate: '${releaseDate}'\nrolloutHours: 36\n`,
    (manifestPath) => {
      assert.throws(
        () => validateDesktopManifests({ releaseDate, rolloutHours: 36 }, [manifestPath]),
        /minimumSystemVersion=undefined, expected 22\.0\.0/,
      );
    },
  );
});

test("rejects invalid rollout metadata", () => {
  withManifest(
    `version: 0.7.3\nreleaseDate: '${releaseDate}'\nrolloutHours: 24\nminimumSystemVersion: 22.0.0\n`,
    (manifestPath) => {
      assert.throws(
        () => validateDesktopManifests({ releaseDate, rolloutHours: 36 }, [manifestPath]),
        /rolloutHours=24, expected 36/,
      );
    },
  );
});

test("stages verified installers before exposing versioned beta manifests", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "clawmuse-update-feed-"));
  try {
    const source = path.join(dir, "source");
    const output = path.join(dir, "output");
    mkdirSync(source);
    const artifact = Buffer.from("installer bytes");
    const sha512 = createHash("sha512").update(artifact).digest("base64");
    const filename = "ClawMuse-arm64.AppImage";
    writeFileSync(path.join(source, filename), artifact);
    writeFileSync(
      path.join(source, "beta-linux-arm64.yml"),
      dump({
        version: "0.13.0-beta.2",
        releaseDate,
        files: [{ url: filename, sha512, size: artifact.length }],
        path: filename,
        sha512,
      }),
    );
    await prepareDesktopUpdates(source, output);
    const manifest = load(readFileSync(path.join(output, "beta-linux-arm64.yml"), "utf8"));
    const url = `releases/0.13.0-beta.2/${filename}`;
    assert.equal(manifest.files[0].url, url);
    assert.equal(manifest.path, url);
    assert.deepEqual(readFileSync(path.join(output, url)), artifact);
    assert.equal(existsSync(path.join(output, "latest-linux-arm64.yml")), false);
    writeFileSync(path.join(source, filename), "corrupted download");
    await assert.rejects(prepareDesktopUpdates(source, output), /checksum|size/i);
    assert.deepEqual(readFileSync(path.join(output, url)), artifact);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("keeps AppImage, deb and rpm targets usable from the same Linux update feed", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "clawmuse-linux-feed-"));
  try {
    const source = path.join(dir, "source");
    const output = path.join(dir, "output");
    mkdirSync(source);
    const filenames = [
      "ClawMuse-x64.AppImage",
      "ClawMuse-0.13.0-x64.deb",
      "ClawMuse-0.13.0-x64.rpm",
    ];
    const files = filenames.map((url) => {
      const bytes = Buffer.from(`installer ${url}`);
      writeFileSync(path.join(source, url), bytes);
      return {
        url,
        sha512: createHash("sha512").update(bytes).digest("base64"),
        size: bytes.length,
      };
    });
    writeFileSync(
      path.join(source, "latest-linux.yml"),
      dump({ version: "0.13.0", releaseDate, files }),
    );
    await prepareDesktopUpdates(source, output);
    const manifest = load(readFileSync(path.join(output, "latest-linux.yml"), "utf8"));
    const resolved = resolveFiles(
      manifest,
      new URL("https://agent-relay.clawmuse.com/updates/desktop/"),
    );
    for (const [index, extension] of ["AppImage", "deb", "rpm"].entries()) {
      const selected = findFile(
        resolved,
        extension,
        ["AppImage", "deb", "rpm"].filter((item) => item !== extension),
      );
      const relative = `releases/0.13.0/${filenames[index]}`;
      assert.equal(selected.url.pathname, `/updates/desktop/${relative}`);
      assert.deepEqual(
        readFileSync(path.join(output, relative)),
        readFileSync(path.join(source, filenames[index])),
      );
    }
    assert.equal(
      readFileSync(path.join(output, "beta-linux.yml"), "utf8"),
      readFileSync(path.join(output, "latest-linux.yml"), "utf8"),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("promotes Mac stable releases to beta without publishing other platforms", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "clawmuse-stable-feed-"));
  try {
    const source = path.join(dir, "source");
    const output = path.join(dir, "output");
    mkdirSync(source);
    const filename = "ClawMuse-0.13.0-arm64.zip";
    const artifact = Buffer.from("signed Mac zip");
    const sha512 = createHash("sha512").update(artifact).digest("base64");
    writeFileSync(path.join(source, filename), artifact);
    writeFileSync(path.join(source, `${filename}.blockmap`), "blockmap");
    writeFileSync(
      path.join(source, "latest-mac.yml"),
      dump({
        version: "0.13.0",
        releaseDate,
        files: [{ url: filename, sha512, size: artifact.length }],
      }),
    );
    // Artifacts from other platforms may still be drafts or from another version.
    writeFileSync(path.join(source, "latest-linux.yml"), dump({ version: "0.12.0" }));
    await prepareDesktopUpdates(source, output, { platform: "macos" });
    await prepareDesktopUpdates(source, output, { platform: "macos" });
    const latest = readFileSync(path.join(output, "latest-mac.yml"), "utf8");
    assert.equal(readFileSync(path.join(output, "beta-mac.yml"), "utf8"), latest);
    assert.equal(load(latest).minimumSystemVersion, "22.0.0");
    assert.equal(existsSync(path.join(output, "latest-linux.yml")), false);
    assert.equal(existsSync(path.join(output, "beta-linux.yml")), false);
    assert.equal(
      readFileSync(path.join(output, "releases/0.13.0", `${filename}.blockmap`), "utf8"),
      "blockmap",
    );
    writeFileSync(path.join(source, `${filename}.blockmap`), "changed blockmap");
    await assert.rejects(
      prepareDesktopUpdates(source, output, { platform: "macos" }),
      /cannot replace/,
    );
    assert.equal(readFileSync(path.join(output, "latest-mac.yml"), "utf8"), latest);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("rejects incorrect channels, remote paths and incomplete releases before exposing any manifest", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "clawmuse-invalid-feed-"));
  try {
    const source = path.join(dir, "source");
    const output = path.join(dir, "output");
    mkdirSync(source);
    const filename = "ClawMuse-Setup-0.13.0-beta.2-x64.exe";
    const artifact = Buffer.from("Windows installer");
    const sha512 = createHash("sha512").update(artifact).digest("base64");
    writeFileSync(path.join(source, filename), artifact);
    const manifest = { version: "0.13.0-beta.2", releaseDate, files: [{ url: filename, sha512 }] };
    const manifestPath = path.join(source, "latest.yml");
    writeFileSync(manifestPath, dump(manifest));
    await assert.rejects(prepareDesktopUpdates(source, output), /wrong channel/);
    rmSync(manifestPath);
    const betaPath = path.join(source, "beta.yml");
    writeFileSync(betaPath, dump({ ...manifest, files: [{ url: `../${filename}`, sha512 }] }));
    await assert.rejects(prepareDesktopUpdates(source, output), /local filename/);
    writeFileSync(
      betaPath,
      dump({ ...manifest, files: [{ url: `https://example.com/${filename}`, sha512 }] }),
    );
    await assert.rejects(prepareDesktopUpdates(source, output), /local filename/);
    writeFileSync(betaPath, dump(manifest));
    writeFileSync(
      path.join(source, "beta-mac.yml"),
      dump({
        ...manifest,
        files: [{ url: "ClawMuse-missing.zip", sha512 }],
      }),
    );
    await assert.rejects(prepareDesktopUpdates(source, output), /ENOENT/);
    assert.equal(existsSync(path.join(output, "beta.yml")), false);
    assert.equal(existsSync(path.join(output, "beta-mac.yml")), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("publishes Mac first and adds Windows later without moving other channels", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "clawmuse-platform-feed-"));
  try {
    const source = path.join(dir, "source");
    const output = path.join(dir, "output");
    mkdirSync(source);
    mkdirSync(output);
    for (const name of ["beta-linux.yml", "latest-mac.yml", "beta.yml"]) {
      writeFileSync(path.join(output, name), `previous ${name}`);
    }
    const targets = [
      ["beta-mac.yml", "ClawMuse-0.13.0-beta.4-arm64.zip"],
      ["beta.yml", "ClawMuse-Setup-0.13.0-beta.4-x64.exe"],
    ];
    for (const [manifest, filename] of targets) {
      const artifact = Buffer.from(filename);
      writeFileSync(path.join(source, filename), artifact);
      writeFileSync(
        path.join(source, manifest),
        dump({
          version: "0.13.0-beta.4",
          releaseDate,
          files: [
            {
              url: filename,
              sha512: createHash("sha512").update(artifact).digest("base64"),
              size: artifact.length,
            },
          ],
        }),
      );
    }
    // Unselected manifests can be from another version or an incomplete build.
    writeFileSync(path.join(source, "beta-linux.yml"), "incomplete Linux candidate");
    assert.deepEqual(await prepareDesktopUpdates(source, output, { platform: "macos" }), [
      "beta-mac.yml",
    ]);
    const mac = readFileSync(path.join(output, "beta-mac.yml"), "utf8");
    assert.equal(readFileSync(path.join(output, "beta.yml"), "utf8"), "previous beta.yml");
    assert.equal(
      readFileSync(path.join(output, "latest-mac.yml"), "utf8"),
      "previous latest-mac.yml",
    );
    assert.deepEqual(await prepareDesktopUpdates(source, output, { platform: "windows" }), [
      "beta.yml",
    ]);
    assert.equal(readFileSync(path.join(output, "beta-mac.yml"), "utf8"), mac);
    assert.equal(
      readFileSync(path.join(output, "beta-linux.yml"), "utf8"),
      "previous beta-linux.yml",
    );
    for (const [, filename] of targets) {
      assert.equal(
        readFileSync(path.join(output, "releases/0.13.0-beta.4", filename), "utf8"),
        filename,
      );
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
