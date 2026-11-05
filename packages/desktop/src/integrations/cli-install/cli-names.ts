import { brand } from "../../brand.generated.js";

// Installed agent skills and saved Claude/Codex/OpenCode hooks call `paseo`, so it stays installed.
export const LEGACY_CLI_NAME = "paseo";

export type CliTargetState = "missing" | "ours" | "foreign";

export function cliCommandNames(): string[] {
  return [...new Set<string>([brand.cliName, ...brand.cliAliases, LEGACY_CLI_NAME])];
}

// New names never overwrite another program (e.g. Unity Version Control ships `cm`).
export function planCliInstall(input: {
  names: string[];
  targets: Record<string, CliTargetState>;
  onPath: Set<string>;
}): { install: string[]; skipped: string[] } {
  const install: string[] = [];
  const skipped: string[] = [];
  for (const name of input.names) {
    const state = input.targets[name] ?? "missing";
    const taken = state === "foreign" || (state === "missing" && input.onPath.has(name));
    if (name !== LEGACY_CLI_NAME && taken) skipped.push(name);
    else install.push(name);
  }
  return { install, skipped };
}

export function isOwnCliTarget(
  entry: { kind: "symlink"; target: string } | { kind: "file"; content: string },
  context: { sourcePaths: string[] },
): boolean {
  if (entry.kind === "file") return entry.content.includes('set "BUNDLED_CLI=');
  if (context.sourcePaths.includes(entry.target)) return true;
  const normalized = entry.target.replaceAll("\\", "/");
  return (
    (normalized.includes(`/${brand.name}`) && normalized.endsWith(`/bin/${LEGACY_CLI_NAME}`)) ||
    new RegExp(`/${brand.name}[^/]*\\.AppImage$`).test(normalized)
  );
}
