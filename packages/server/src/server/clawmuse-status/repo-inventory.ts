import type { PersistedProjectRecord } from "../workspace-registry.js";

/** What a host publishes about a repository: the daemon project key and a name. No paths. */
export interface ClawMuseGoalRepo {
  repoKey: string;
  displayName: string;
}

const REMOTE_PREFIX = "remote:";
const SUBDIR_MARKER = "#subdir:";
const GITHUB_HOSTS = new Set(["github.com", "www.github.com"]);

/** `remote:github.com/acme/app` → `acme/app`; other forges keep their host. */
export function goalRepoDisplayName(repoKey: string): string {
  if (!repoKey.startsWith(REMOTE_PREFIX)) {
    return repoKey;
  }
  const body = repoKey.slice(REMOTE_PREFIX.length);
  const subdirAt = body.indexOf(SUBDIR_MARKER);
  const location = subdirAt === -1 ? body : body.slice(0, subdirAt);
  const subdir = subdirAt === -1 ? null : body.slice(subdirAt + SUBDIR_MARKER.length);
  const slash = location.indexOf("/");
  const host = slash === -1 ? location : location.slice(0, slash);
  const path = slash === -1 ? "" : location.slice(slash + 1).replace(/\.git$/, "");
  const name = GITHUB_HOSTS.has(host.toLowerCase()) && path ? path : location;
  return subdir ? `${name}/${subdir}` : name;
}

/**
 * Only remote-backed projects are eligible: the service identifies work by the
 * remote, and a second host can only pick it up if it has the same remote.
 */
export function listGoalRepos(projects: readonly PersistedProjectRecord[]): ClawMuseGoalRepo[] {
  const byKey = new Map<string, ClawMuseGoalRepo>();
  for (const project of projects) {
    if (project.archivedAt || project.kind !== "git") {
      continue;
    }
    const repoKey = project.projectKey;
    if (!repoKey || !repoKey.startsWith(REMOTE_PREFIX) || /\s/.test(repoKey)) {
      continue;
    }
    if (!byKey.has(repoKey)) {
      byKey.set(repoKey, { repoKey, displayName: goalRepoDisplayName(repoKey) });
    }
  }
  return [...byKey.values()].sort((left, right) => left.repoKey.localeCompare(right.repoKey));
}

/** The checkout a leased run should work in. Null when this host no longer has it. */
export function findGoalRepoRoot(
  projects: readonly PersistedProjectRecord[],
  repoKey: string,
): string | null {
  const candidates = projects
    .filter(
      (project) => !project.archivedAt && project.kind === "git" && project.projectKey === repoKey,
    )
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  return candidates[0]?.rootPath ?? null;
}
