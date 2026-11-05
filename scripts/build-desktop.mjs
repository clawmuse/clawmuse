import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { isMainModule } from "./is-main-module.mjs";

export function runDesktopBuild(args = process.argv.slice(2), run = spawnSync) {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const commands = [
    ["npm", ["run", "build:app-deps:clean"]],
    [
      "npx",
      ["expo", "export", "--platform", "web", "--max-workers", "2"],
      { cwd: fileURLToPath(new URL("../packages/app", import.meta.url)) },
    ],
    ["npm", ["run", "build", "--workspace=@getpaseo/desktop", "--", ...args]],
  ];

  for (const [command, commandArgs, options = {}] of commands) {
    const result = run(command, commandArgs, {
      cwd: root,
      env: {
        ...process.env,
        NODE_OPTIONS: "--max-old-space-size=4096",
        PASEO_WEB_PLATFORM: "electron",
      },
      stdio: "inherit",
      ...options,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}

if (isMainModule(import.meta.url)) runDesktopBuild();
