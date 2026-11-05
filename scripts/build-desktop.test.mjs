import assert from "node:assert/strict";
import test from "node:test";
import { runDesktopBuild } from "./build-desktop.mjs";

test("forwards platform and architecture arguments to the desktop workspace build", () => {
  const calls = [];
  runDesktopBuild(["--publish", "never", "--win", "--arm64"], (command, args, options) => {
    calls.push({ command, args, cwd: options.cwd, env: options.env });
    return { status: 0 };
  });

  assert.deepEqual(calls.at(-1).args, [
    "run",
    "build",
    "--workspace=@getpaseo/desktop",
    "--",
    "--publish",
    "never",
    "--win",
    "--arm64",
  ]);
  assert.equal(calls[1].env.PASEO_WEB_PLATFORM, "electron");
});
