import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  conversationPluginIds,
  type ConversationPluginId,
} from "@getpaseo/protocol/conversation-plugins";

export const builtinPlugins = [
  "antigravity-provider",
  "claude-usage-source",
  "codex-usage-source",
  "copilot-usage-source",
  "cursor-usage-source",
  "grok-usage-source",
  "hoplite-provider",
  "kimi-usage-source",
  "minimax-usage-source",
  "muse-provider",
  "opencode-go-usage-source",
  "worktree-include",
  "zai-usage-source",
] as const;

export const optionalBundledPlugins = [
  "conversation-translation",
  "capacity-retry",
  "device-preview",
] as const;

export function resolveBuiltinPluginsRoot(moduleUrl: string | URL = import.meta.url): string {
  const moduleDir = path.dirname(fileURLToPath(moduleUrl));
  const archiveSegment = `${path.sep}app.asar${path.sep}`;
  const archiveIndex = moduleDir.indexOf(archiveSegment);
  if (archiveIndex !== -1) {
    // esbuild runs outside Electron's filesystem shim and cannot read archive entries.
    return path.join(moduleDir.slice(0, archiveIndex), "builtin-plugins");
  }
  const candidates = [
    path.resolve(moduleDir, "..", "..", "..", "builtin-plugins"),
    path.resolve(moduleDir, "..", "..", "..", "..", "..", "..", "plugins"),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]!;
}

export interface BuiltinPlugin {
  id: string;
  directory: string;
}

export class BuiltinPluginLoader {
  readonly ids: ReadonlySet<string>;
  readonly optional: ReadonlyMap<string, string>;
  readonly conversation: ReadonlySet<ConversationPluginId>;
  readonly conversationDirectory = path.dirname(fileURLToPath(import.meta.url));

  constructor(
    private readonly root = resolveBuiltinPluginsRoot(),
    private readonly list: readonly string[] = builtinPlugins,
    optional: readonly string[] = list === builtinPlugins ? optionalBundledPlugins : [],
    conversation: readonly ConversationPluginId[] = list === builtinPlugins
      ? conversationPluginIds
      : [],
  ) {
    this.ids = new Set([...list, ...optional, ...conversation]);
    this.optional = new Map(optional.map((id) => [id, path.join(root, id)]));
    this.conversation = new Set(conversation);
  }

  async load(start: (plugin: BuiltinPlugin) => Promise<void>): Promise<void> {
    for (const id of this.list) {
      await start({ id, directory: path.join(this.root, id) });
    }
  }
}
