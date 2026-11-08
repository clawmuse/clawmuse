import type { ComponentType, SVGProps } from "react";
import {
  AntigravityIcon,
  ClaudeCodeIcon,
  CodexIcon,
  CursorIcon,
  MuseCodeIcon,
  OmpIcon,
  OpenCodeIcon,
  PiIcon,
} from "../src/components/agent-icons";
import { CopilotIcon } from "./demo-provider-icon";
import { agentFor, type AgentSlug } from "./agents-content";

const marks: Partial<Record<AgentSlug, ComponentType<SVGProps<SVGSVGElement>>>> = {
  "claude-code": ClaudeCodeIcon,
  codex: CodexIcon,
  opencode: OpenCodeIcon,
  pi: PiIcon,
  omp: OmpIcon,
  cursor: CursorIcon,
  "muse-code": MuseCodeIcon,
  antigravity: AntigravityIcon,
};

interface AgentIconProps {
  slug: AgentSlug;
  size?: number;
  className?: string;
}

export function AgentIcon({ slug, size = 28, className = "" }: AgentIconProps) {
  const Mark = marks[slug];
  if (Mark) {
    return (
      <span className={`agent-icon agent-icon--mark ${className}`} aria-hidden="true">
        <Mark width={size} height={size} focusable="false" />
      </span>
    );
  }
  if (slug === "copilot") {
    return (
      <span className={`agent-icon agent-icon--mark ${className}`} aria-hidden="true">
        <CopilotIcon size={size} />
      </span>
    );
  }
  const agent = agentFor(`/agents/${slug}`, "en");
  return (
    <span className={`agent-icon agent-icon--asset ${className}`} aria-hidden="true">
      <img
        src={`/agent-icons/${agent.providerId}.svg`}
        width={size}
        height={size}
        alt=""
        decoding="async"
      />
    </span>
  );
}
