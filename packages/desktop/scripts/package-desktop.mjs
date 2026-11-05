import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { isMainModule } from "../../../scripts/is-main-module.mjs";
import { MAC_SIGNING_ENV_KEYS } from "./mac-signing.mjs";

export function sanitizeElectronBuilderEnv(env = process.env) {
  const sanitized = { ...env };
  for (const key of MAC_SIGNING_ENV_KEYS) {
    if (!sanitized[key]?.trim()) delete sanitized[key];
  }
  return sanitized;
}

export function packageDesktop(
  args = process.argv.slice(2),
  run = spawnSync,
  resolveBuilderCli = () =>
    createRequire(import.meta.url).resolve("electron-builder/out/cli/cli.js"),
) {
  const packageRoot = fileURLToPath(new URL("..", import.meta.url));
  const electronBuilderCli = resolveBuilderCli();
  const build = run(
    process.execPath,
    [electronBuilderCli, "--config", "electron-builder.config.cjs", ...args],
    { cwd: packageRoot, env: sanitizeElectronBuilderEnv(), stdio: "inherit" },
  );
  if (build.error) throw build.error;
  if (build.status !== 0) process.exit(build.status ?? 1);

  const finalize = run(
    process.execPath,
    [fileURLToPath(new URL("./finalize-mac-distribution.mjs", import.meta.url)), "release"],
    { cwd: packageRoot, env: sanitizeElectronBuilderEnv(), stdio: "inherit" },
  );
  if (finalize.error) throw finalize.error;
  if (finalize.status !== 0) process.exit(finalize.status ?? 1);
}

if (isMainModule(import.meta.url)) packageDesktop();
