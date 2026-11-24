import assert from "node:assert/strict";
import test from "node:test";

import { collectAssets, uploadWithRetry } from "./upload-release-assets.mjs";
import { assertDraftRelease, planPrereleaseAssetAction } from "./cnb/upload-github-draft.mjs";
import {
  classifyUploadTier,
  planDraftUploads,
  resolveCnbArtifactsImage,
  verifyFinalAssets,
} from "./cnb/relay-release-upload.mjs";

test("ClawMuse uploads refuse public stable releases while allowing additive beta prereleases", () => {
  const stable = { tag: "v1.0.0", prerelease: "false" };
  assert.doesNotThrow(() => assertDraftRelease(undefined, stable));
  assert.doesNotThrow(() => assertDraftRelease({ draft: true, prerelease: false }, stable));
  assert.throws(
    () => assertDraftRelease({ draft: false, prerelease: false }, stable),
    /already public/,
  );
  assert.throws(
    () => assertDraftRelease({ draft: true, prerelease: true }, stable),
    /channel mismatch/,
  );
  assert.throws(
    () => assertDraftRelease(undefined, { ...stable, prerelease: "true" }),
    /Wrong prerelease/,
  );

  const beta = { tag: "v1.6.1-beta.5", prerelease: "true" };
  assert.doesNotThrow(() => assertDraftRelease(undefined, beta));
  assert.doesNotThrow(() => assertDraftRelease({ draft: true, prerelease: true }, beta));
  assert.doesNotThrow(() => assertDraftRelease({ draft: false, prerelease: true }, beta));
  assert.throws(
    () => assertDraftRelease({ draft: false, prerelease: false }, beta),
    /channel mismatch/,
  );

  // Published prerelease allows appending new platform assets, skipping identical uploads,
  // refreshing aggregate SHA256SUMS.txt, and refuses overwriting published binary installers.
  assert.deepEqual(
    planPrereleaseAssetAction({
      filename: "ClawMuse-1.6.1-beta.5-arm64.dmg",
      size: 190_000_000,
      existingAssets: [],
      isPublishedPrerelease: true,
    }),
    { action: "upload", deleteIds: [] },
  );
  assert.deepEqual(
    planPrereleaseAssetAction({
      filename: "ClawMuse-Setup-1.6.1-beta.5-x64.exe",
      size: 150_000_000,
      existingAssets: [{ id: 10, state: "uploaded", size: 150_000_000 }],
      isPublishedPrerelease: true,
    }),
    { action: "skip", deleteIds: [] },
  );
  assert.deepEqual(
    planPrereleaseAssetAction({
      filename: "SHA256SUMS.txt",
      size: 1800,
      existingAssets: [{ id: 11, state: "uploaded", size: 900 }],
      isPublishedPrerelease: true,
    }),
    { action: "upload", deleteIds: [11] },
  );
  assert.throws(
    () =>
      planPrereleaseAssetAction({
        filename: "ClawMuse-Setup-1.6.1-beta.5-x64.exe",
        size: 151_000_000,
        existingAssets: [{ id: 10, state: "uploaded", size: 150_000_000 }],
        isPublishedPrerelease: true,
      }),
    /Refusing to overwrite published prerelease asset/,
  );
});

const noSleep = () => Promise.resolve();

test("retries a failing asset and keeps its siblings", async () => {
  const calls = [];
  const exitCodes = { "a.dmg": [1, 1, 0], "b.zip": [0] };

  const exitCode = await uploadWithRetry(
    { release: "rel", files: ["a.dmg", "b.zip"], repo: "getpaseo/paseo" },
    {
      sleep: noSleep,
      upload: ({ file }) => {
        calls.push(file);
        return exitCodes[file].shift();
      },
    },
  );

  assert.equal(exitCode, 0);
  assert.deepEqual(calls, ["a.dmg", "a.dmg", "a.dmg", "b.zip"]);
});

test("gives up after the attempt limit and reports failure", async () => {
  let calls = 0;

  const exitCode = await uploadWithRetry(
    { release: "rel", files: ["a.dmg", "b.zip"], repo: "getpaseo/paseo" },
    {
      attempts: 3,
      sleep: noSleep,
      upload: () => {
        calls += 1;
        return 1;
      },
    },
  );

  assert.equal(exitCode, 1);
  // Stops at the first unrecoverable file rather than attempting b.zip.
  assert.equal(calls, 3);
});

test("collects release files and skips manifests", () => {
  const files = collectAssets("/release", {
    readDir: () => ["Paseo.dmg", "beta-mac.yml", "Paseo.zip", "nested"],
    stat: (file) => ({ isFile: () => !file.endsWith("nested") }),
  });

  assert.deepEqual(files, ["/release/Paseo.dmg", "/release/Paseo.zip"]);
});

test("resolves CNB desktop-artifacts image tags and rejects macOS/mobile tags", () => {
  const opts = { registry: "registry.example.test", repoSlug: "acme/clawmuse" };
  assert.match(
    resolveCnbArtifactsImage({ tag: "v1.6.0-beta.1" }).image,
    /\/desktop-artifacts:v1\.6\.0-beta\.1$/,
  );
  assert.deepEqual(resolveCnbArtifactsImage({ tag: "v1.6.0-beta.1", ...opts }), {
    image: "registry.example.test/acme/clawmuse/desktop-artifacts:v1.6.0-beta.1",
    imageTag: "v1.6.0-beta.1",
    platforms: ["linux", "windows"],
  });
  assert.deepEqual(resolveCnbArtifactsImage({ tag: "v1.5.5+1108", ...opts }), {
    image: "registry.example.test/acme/clawmuse/desktop-artifacts:v1.5.5_1108",
    imageTag: "v1.5.5_1108",
    platforms: ["linux", "windows"],
  });
  assert.deepEqual(resolveCnbArtifactsImage({ tag: "desktop-linux-v1.6.0-beta.1", ...opts }), {
    image: "registry.example.test/acme/clawmuse/desktop-artifacts:desktop-linux-v1.6.0-beta.1",
    imageTag: "desktop-linux-v1.6.0-beta.1",
    platforms: ["linux"],
  });
  assert.deepEqual(resolveCnbArtifactsImage({ tag: "desktop-windows-v1.6.0-beta.1", ...opts }), {
    image: "registry.example.test/acme/clawmuse/desktop-artifacts:desktop-windows-v1.6.0-beta.1",
    imageTag: "desktop-windows-v1.6.0-beta.1",
    platforms: ["windows"],
  });
  assert.throws(() => resolveCnbArtifactsImage({ tag: "desktop-macos-v1.6.0-beta.1" }), /no CNB/);
  assert.throws(() => resolveCnbArtifactsImage({ tag: "ios-v1.6.0-beta.1" }), /no CNB/);
});

test("plans draft uploads by deleting starter/mismatched assets and ordering by tier", () => {
  const localFiles = [
    { filename: "ClawMuse-1.6.0-beta.1-arm64.zip", size: 180_000_000 },
    { filename: "ClawMuse-1.6.0-beta.1-arm64.dmg", size: 190_000_000 },
    { filename: "ClawMuse-Setup-1.6.0-beta.1.exe", size: 290_000_000 },
    { filename: "ClawMuse-Setup-1.6.0-beta.1-x64.exe", size: 150_000_000 },
    { filename: "SHA256SUMS.txt", size: 1200 },
    { filename: "beta-mac.yml", size: 877 },
    { filename: "beta.yml", size: 700 },
  ];
  const remoteAssets = [
    { id: 1, name: "beta-mac.yml", size: 877, state: "uploaded" },
    { id: 2, name: "SHA256SUMS.txt", size: 1200, state: "uploaded" },
    { id: 3, name: "ClawMuse-1.6.0-beta.1-arm64.dmg", size: 190_000_000, state: "starter" },
    { id: 4, name: "ClawMuse-Setup-1.6.0-beta.1-x64.exe", size: 100, state: "uploaded" },
  ];

  const plan = planDraftUploads({
    localFiles,
    remoteAssets,
    forceNames: new Set(["SHA256SUMS.txt"]),
  });

  assert.deepEqual(
    plan.skipped.map((item) => item.filename),
    ["beta-mac.yml"],
  );
  assert.deepEqual(
    plan.deleteAssets.map((item) => item.id),
    [3, 4, 2],
  );
  assert.deepEqual(
    plan.uploads.map((item) => item.filename),
    [
      "beta.yml",
      "SHA256SUMS.txt",
      "ClawMuse-Setup-1.6.0-beta.1-x64.exe",
      "ClawMuse-1.6.0-beta.1-arm64.dmg",
      "ClawMuse-1.6.0-beta.1-arm64.zip",
      "ClawMuse-Setup-1.6.0-beta.1.exe",
    ],
  );
  assert.equal(classifyUploadTier("beta.yml", 700), 1);
  assert.equal(classifyUploadTier("ClawMuse-1.6.0-beta.1-android.apk", 300_000_000), 2);
  assert.equal(classifyUploadTier("ClawMuse-Setup-1.6.0-beta.1.exe", 290_000_000), 3);

  // Published beta prereleases allow adding new platforms and refreshing SHA256SUMS.txt,
  // while refusing to replace an already-uploaded binary installer with different bytes.
  const additive = planDraftUploads({
    localFiles: [
      { filename: "ClawMuse-Setup-1.6.1-beta.5-x64.exe", size: 150_000_000 },
      { filename: "ClawMuse-1.6.1-beta.5-arm64.dmg", size: 190_000_000 },
      { filename: "SHA256SUMS.txt", size: 1500 },
    ],
    remoteAssets: [
      { id: 10, name: "ClawMuse-Setup-1.6.1-beta.5-x64.exe", size: 150_000_000, state: "uploaded" },
      { id: 11, name: "SHA256SUMS.txt", size: 800, state: "uploaded" },
    ],
    forceNames: new Set(["SHA256SUMS.txt"]),
    publishedPrerelease: true,
  });
  assert.deepEqual(
    additive.skipped.map((item) => item.filename),
    ["ClawMuse-Setup-1.6.1-beta.5-x64.exe"],
  );
  assert.deepEqual(
    additive.deleteAssets.map((item) => item.id),
    [11],
  );
  assert.deepEqual(
    additive.uploads.map((item) => item.filename),
    ["SHA256SUMS.txt", "ClawMuse-1.6.1-beta.5-arm64.dmg"],
  );
  assert.throws(
    () =>
      planDraftUploads({
        localFiles: [{ filename: "ClawMuse-Setup-1.6.1-beta.5-x64.exe", size: 151_000_000 }],
        remoteAssets: [
          {
            id: 10,
            name: "ClawMuse-Setup-1.6.1-beta.5-x64.exe",
            size: 150_000_000,
            state: "uploaded",
          },
        ],
        publishedPrerelease: true,
      }),
    /Refusing to overwrite published prerelease asset/,
  );
});

test("verifies final GitHub assets require state=uploaded and exact byte sizes", () => {
  const expectedFiles = [
    { filename: "beta.yml", size: 700 },
    { filename: "ClawMuse-1.6.0-beta.1-arm64.dmg", size: 190_000_000 },
  ];

  assert.deepEqual(
    verifyFinalAssets({
      expectedFiles,
      remoteAssets: [
        { name: "beta.yml", size: 700, state: "uploaded" },
        { name: "ClawMuse-1.6.0-beta.1-arm64.dmg", size: 190_000_000, state: "uploaded" },
      ],
    }),
    { verifiedCount: 2, totalBytes: 190_000_700 },
  );

  assert.throws(
    () =>
      verifyFinalAssets({
        expectedFiles,
        remoteAssets: [
          { name: "beta.yml", size: 700, state: "uploaded" },
          { name: "ClawMuse-1.6.0-beta.1-arm64.dmg", size: 190_000_000, state: "starter" },
        ],
      }),
    /incomplete \(starter\): ClawMuse-1\.6\.0-beta\.1-arm64\.dmg/,
  );

  assert.throws(
    () =>
      verifyFinalAssets({
        expectedFiles,
        remoteAssets: [{ name: "beta.yml", size: 699, state: "uploaded" }],
      }),
    /size mismatch: beta\.yml[\s\S]*missing: ClawMuse-1\.6\.0-beta\.1-arm64\.dmg/,
  );
});
