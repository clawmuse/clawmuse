import type { AggregatedAgent } from "@/hooks/use-aggregated-agents";
import type { ArchiveRowItem } from "./types";

export const ALL_PROJECTS_OPTION_ID = "__all_projects__";
const UNASSIGNED_PROJECT_ID = "__unassigned__";

export interface ResolvedAgentProject {
  id: string;
  label: string;
  pathHint?: string;
}

export interface ProjectArchiveOption {
  id: string;
  label: string;
  description?: string;
  count: number;
}

function normalizePath(raw: string): string {
  const trimmed = raw.trim().replaceAll("\\", "/");
  if (!trimmed) return "";
  if (trimmed === "/") return "/";
  const withoutTrailing = trimmed.replace(/\/+$/, "");
  // Keep Windows drive root such as "C:" as "C:/"
  if (/^[A-Za-z]:$/.test(withoutTrailing)) return `${withoutTrailing}/`;
  return withoutTrailing || "/";
}

function lastPathSegment(normalizedPath: string): string {
  if (!normalizedPath) return "";
  const parts = normalizedPath.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? normalizedPath;
}

function parentPathHint(normalizedPath: string): string | undefined {
  if (!normalizedPath) return undefined;
  const parts = normalizedPath.split("/").filter(Boolean);
  if (parts.length <= 1) return normalizedPath;
  return normalizedPath;
}

/**
 * Derive a stable project identity and display label for an agent so AI archive
 * can group and filter agents consistently across structured worktrees and raw `cwd`s.
 */
export function resolveAgentProject(
  agent: Pick<AggregatedAgent, "projectPlacement" | "cwd">,
): ResolvedAgentProject {
  const placement = agent.projectPlacement;
  if (placement) {
    const checkoutPath = normalizePath(
      placement.checkout.mainRepoRoot || placement.checkout.cwd || agent.cwd || "",
    );
    const label = placement.projectName.trim() || lastPathSegment(checkoutPath);
    const rawKey = placement.projectKey.trim();
    const id = rawKey || (label ? `name:${label.toLowerCase()}` : UNASSIGNED_PROJECT_ID);
    return {
      id,
      label,
      pathHint: parentPathHint(checkoutPath),
    };
  }

  const normalizedCwd = normalizePath(agent.cwd || "");
  if (normalizedCwd) {
    return {
      id: `cwd:${normalizedCwd}`,
      label: lastPathSegment(normalizedCwd) || normalizedCwd,
      pathHint: parentPathHint(normalizedCwd),
    };
  }

  return {
    id: UNASSIGNED_PROJECT_ID,
    label: "",
  };
}

/**
 * Group archive rows by project, disambiguating duplicate project names using paths,
 * ordered by open/session count descending then alphabetically.
 */
export function buildProjectArchiveOptions(
  items: readonly ArchiveRowItem[],
  fallbackLabel: string,
): ProjectArchiveOption[] {
  const grouped = new Map<
    string,
    { id: string; label: string; pathHint?: string; count: number }
  >();

  for (const item of items) {
    const resolved = resolveAgentProject(item.agent);
    const label = resolved.label || fallbackLabel;
    const existing = grouped.get(resolved.id);
    if (existing) {
      existing.count += 1;
      if (!existing.pathHint && resolved.pathHint) {
        existing.pathHint = resolved.pathHint;
      }
      continue;
    }
    grouped.set(resolved.id, {
      id: resolved.id,
      label,
      pathHint: resolved.pathHint,
      count: 1,
    });
  }

  const labelCounts = new Map<string, number>();
  for (const entry of grouped.values()) {
    const key = entry.label.toLowerCase();
    labelCounts.set(key, (labelCounts.get(key) ?? 0) + 1);
  }

  const options: ProjectArchiveOption[] = Array.from(grouped.values()).map((entry) => {
    const isDuplicateLabel = (labelCounts.get(entry.label.toLowerCase()) ?? 0) > 1;
    return {
      id: entry.id,
      label: entry.label,
      description: isDuplicateLabel ? entry.pathHint : undefined,
      count: entry.count,
    };
  });

  options.sort((left, right) => {
    if (right.count !== left.count) return right.count - left.count;
    return left.label.localeCompare(right.label);
  });

  return options;
}
