export interface GoalExternalSource {
  kind: string;
  key: string | null | undefined;
  url?: string | null;
}

export interface GoalWithExternalSource {
  repoKey: string;
  source?: GoalExternalSource;
}

function sourceIdentity(
  source: GoalExternalSource | undefined,
): { kind: string; key: string } | null {
  const kind = source?.kind.trim();
  const key = source?.key?.trim();
  return kind && key ? { kind, key } : null;
}

/**
 * Returns the record for an external signal already known by this repository.
 * Closed records deliberately match too: a discarded signal must never reopen
 * work merely because its upstream scanner retried delivery.
 */
export function findExistingGoalByExternalSource<T extends GoalWithExternalSource>(
  goals: readonly T[],
  repoKey: string,
  source: GoalExternalSource | undefined,
): T | undefined {
  const identity = sourceIdentity(source);
  if (!identity) return undefined;
  return goals.find((goal) => {
    const existing = sourceIdentity(goal.source);
    return (
      goal.repoKey === repoKey && existing?.kind === identity.kind && existing.key === identity.key
    );
  });
}

export function normalizePathScopes(paths: readonly string[] | undefined): string[] {
  if (!paths) return [];
  const seen = new Set<string>();
  for (const rawPath of paths) {
    const path = rawPath.trim().replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/+$/, "");
    if (!path || path === "." || path.split("/").includes("..")) continue;
    seen.add(path);
  }
  return [...seen];
}

function literalPrefix(path: string): string {
  const wildcardAt = path.search(/[?*[]/);
  return wildcardAt === -1 ? path : path.slice(0, wildcardAt).replace(/\/+$/, "");
}

function pathsMayOverlap(a: string, b: string): boolean {
  const aPrefix = literalPrefix(a);
  const bPrefix = literalPrefix(b);
  if (!aPrefix || !bPrefix) return true;
  if (
    aPrefix !== bPrefix &&
    !aPrefix.startsWith(`${bPrefix}/`) &&
    !bPrefix.startsWith(`${aPrefix}/`)
  ) {
    return false;
  }
  // A glob is intentionally conservative. It might match any descendant of
  // its literal prefix, so queue rather than risk two worktrees editing it.
  return true;
}

/**
 * An undeclared scope is an exclusive scope. Callers supply only concurrently
 * active goals; an empty active list can always start regardless of paths.
 */
export function hasPathScopeOverlap(
  candidatePaths: readonly string[] | undefined,
  activeGoalPathsOrChangedFiles: ReadonlyArray<readonly string[] | undefined>,
): boolean {
  if (activeGoalPathsOrChangedFiles.length === 0) return false;
  const candidate = normalizePathScopes(candidatePaths);
  if (candidate.length === 0) return true;
  return activeGoalPathsOrChangedFiles.some((activePaths) => {
    const active = normalizePathScopes(activePaths);
    return active.length === 0 || candidate.some((a) => active.some((b) => pathsMayOverlap(a, b)));
  });
}

export function pathScopePrompt(paths: readonly string[] | undefined): string | null {
  const normalized = normalizePathScopes(paths);
  if (normalized.length === 0) return null;
  return `文件范围白名单：仅可修改以下文件或目录前缀：${normalized.join("、")}。若完成目标必须改动范围外文件，报告 needs_decision 并停止。`;
}
