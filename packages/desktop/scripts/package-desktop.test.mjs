import assert from "node:assert/strict";
import { test } from "vitest";
import { packageDesktop, sanitizeElectronBuilderEnv } from "./package-desktop.mjs";

test("removes empty certificate variables before electron-builder resolves signing", () => {
  assert.deepEqual(sanitizeElectronBuilderEnv({ CSC_LINK: "", CSC_KEY_PASSWORD: " ", KEEP: "x" }), {
    KEEP: "x",
  });
});

test("forwards build arguments to electron-builder and not to finalization", () => {
  const calls = [];
  packageDesktop(
    ["--publish", "never", "--mac", "--arm64"],
    (command, args, options) => {
      calls.push({ command, args, env: options.env });
      return { status: 0 };
    },
    () => "/electron-builder.js",
  );

  assert.deepEqual(calls[0].args.slice(-4), ["--publish", "never", "--mac", "--arm64"]);
  assert.deepEqual(calls[1].args.slice(-1), ["release"]);
});
