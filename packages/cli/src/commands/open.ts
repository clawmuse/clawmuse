import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { spawnProcess } from "@getpaseo/server/process";
import { buildAgentDeepLink, type AgentDeepLinkTarget } from "@getpaseo/protocol/agent-deep-link";
import { brand } from "../brand.generated.js";

export function desktopAppCandidates(input: {
  platform: NodeJS.Platform;
  home: string;
  localAppData?: string;
}): string[] {
  const name = brand.name;
  if (input.platform === "darwin") {
    return [`/Applications/${name}.app`, path.join(input.home, "Applications", `${name}.app`)];
  }
  if (input.platform === "linux") {
    const applications = path.join(input.home, "Applications");
    return [
      `/usr/bin/${name}`,
      `/opt/${name}/${name}`,
      path.join(applications, `${name}.AppImage`),
      path.join(applications, `${name}-x86_64.AppImage`),
      path.join(applications, `${name}-arm64.AppImage`),
    ];
  }
  if (input.platform === "win32") {
    return input.localAppData
      ? [path.join(input.localAppData, "Programs", name, `${name}.exe`)]
      : [];
  }
  return [];
}

function findDesktopApp(): string | null {
  const candidates = desktopAppCandidates({
    platform: process.platform,
    home: homedir(),
    localAppData: process.env.LOCALAPPDATA,
  });
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function cleanEnvForDesktopLaunch(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  // The CLI runs via ELECTRON_RUN_AS_NODE=1. On Linux/Windows the spawned
  // desktop process inherits the env directly, so we must strip it or the
  // desktop app would start as a bare Node process instead of Electron.
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ELECTRON_NO_ATTACH_CONSOLE;
  delete env.PASEO_NODE_ENV;
  return env;
}

function spawnDetached(command: string, args: string[]): void {
  spawnProcess(command, args, {
    detached: true,
    stdio: "ignore",
    env: cleanEnvForDesktopLaunch(),
  }).unref();
}

function launchDesktop(args: string[]): void {
  if (process.env.PASEO_DESKTOP_CLI === "1") {
    throw new Error(
      `Cannot open ${brand.name} Desktop while running in desktop CLI passthrough mode.`,
    );
  }

  const desktopApp = findDesktopApp();
  if (!desktopApp) {
    throw new Error(
      `${brand.name} desktop app not found. Install it from ${brand.websiteUrl}/download/`,
    );
  }

  if (process.platform === "darwin") {
    // -n forces a new instance even if the app is already running. The new
    // instance relays its argv to the existing one through Electron's
    // single-instance lock. -g keeps the terminal in the foreground.
    spawnDetached("open", ["-n", "-g", "-a", desktopApp, "--args", ...args]);
    return;
  }

  spawnDetached(desktopApp, args);
}

export async function openDesktopWithProject(projectPath: string): Promise<void> {
  try {
    launchDesktop([projectPath]);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error) throw error;
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

export async function openDesktopWithAgent(target: AgentDeepLinkTarget): Promise<void> {
  launchDesktop([buildAgentDeepLink(target)]);
}
