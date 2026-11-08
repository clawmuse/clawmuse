import assert from "node:assert/strict";
import test from "node:test";

import { collectAssets, uploadWithRetry } from "./upload-release-assets.mjs";
import { assertDraftRelease } from "./cnb/upload-github-draft.mjs";

test("ClawMuse uploads refuse public releases and incorrectly marked stable releases", () => {
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
