import { AGENT_PROVIDER_DEFINITIONS } from "@getpaseo/protocol/provider-manifest";
import type { Provider } from "./demo-state";

// A fixture catalogue, not an advertised live availability list. Labels match the
// model IDs used by the app/server provider fixtures; the host owns the real list.
export const demoModels: Record<Provider, readonly [string, string]> = {
  "Claude Code": ["Sonnet 4.6", "Haiku 4.5"],
  Codex: ["GPT-5.4", "GPT-5.4-mini"],
  "GitHub Copilot": ["Claude Sonnet 4.6", "GPT-5.4"],
  OpenCode: ["anthropic/claude-sonnet-4-6", "openai/gpt-5.4-mini"],
  Pi: ["claude-sonnet-4-6", "gpt-5.4-mini"],
  Antigravity: ["Gemini 3 Pro", "Gemini 3 Flash"],
  "Muse Code": ["GPT-5.4", "GPT-5.4-mini"],
};
const providerIds: Record<Provider, string> = {
  "Claude Code": "claude",
  Codex: "codex",
  "GitHub Copilot": "copilot",
  OpenCode: "opencode",
  Pi: "pi",
  Antigravity: "antigravity",
  "Muse Code": "muse",
};
export function modelLabel(provider: Provider, model: "default" | "fast") {
  return demoModels[provider][model === "default" ? 0 : 1];
}
export function providerDefinition(provider: Provider) {
  return AGENT_PROVIDER_DEFINITIONS.find((entry) => entry.id === providerIds[provider]);
}
