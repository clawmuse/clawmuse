import assert from "node:assert/strict";
import { test } from "vitest";
import { resolveMacSigning, verifyMacDistribution } from "./mac-signing.mjs";
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

test("community builds do not require credentials or invoke Apple verification", () => {
  const env = { CLAWMUSE_UNSIGNED_BUILD: "1" };
  assert.deepEqual(resolveMacSigning({ version: "1.5.5", env }), {
    identity: "-",
    forceCodeSigning: false,
    notarize: false,
  });
  verifyMacDistribution({
    appPath: "/unused.app",
    version: "1.5.5",
    env,
    run: () => {
      throw new Error("Community build must not invoke Apple verification");
    },
  });
});

test("stable signing remains mandatory without the community build flag", () => {
  assert.throws(
    () => resolveMacSigning({ version: "1.5.5", env: {} }),
    /require APPLE_SIGN_IDENTITY/,
  );
});
