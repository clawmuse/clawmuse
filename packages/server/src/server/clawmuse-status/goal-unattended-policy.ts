import { tmpdir } from "node:os";

import type { ClaudeProviderOptions } from "../agent/providers/claude/options.js";
import type { PersistedWorkspaceRecord } from "../workspace-registry.js";
import { getGitCommonDir, isPaseoOwnedWorktreeCwd } from "../../utils/worktree.js";

/**
 * Worktree-scoped unattended policy for goal runs.
 *
 * The relaxed profile is earned by the environment, never by the prompt: it
 * only applies to an execute run whose workspace is a verified Paseo-owned
 * worktree on a non-default branch. Every check fails closed to "local",
 * which keeps the conservative ask-first sandbox used everywhere else.
 */
export type GoalRunIsolation = "local" | "worktree";

export interface GoalRunIsolationContext {
  isolation: GoalRunIsolation;
  /** Verified worktree checkout root; only set when isolation === "worktree". */
  worktreePath: string | null;
}

export const GOAL_RUN_ISOLATION_LOCAL: GoalRunIsolationContext = {
  isolation: "local",
  worktreePath: null,
};

const DEFAULT_BRANCH_NAMES = new Set(["main", "master"]);

export type OwnedWorktreeProbe = (cwd: string) => Promise<boolean>;

/**
 * Ownership by path shape is not enough for a live run: a stray directory under
 * the worktrees root archives cleanly but has no git root. Requiring the git
 * common dir to resolve proves the checkout is real and not the main checkout
 * (a main checkout never lands under the Paseo worktrees root).
 *
 * `paseoHome` must be the daemon's configured home — the worktrees root is
 * derived from it, not from ambient process env.
 */
export function paseoOwnedWorktreeProbe(paseoHome: string): OwnedWorktreeProbe {
  return async (cwd: string): Promise<boolean> => {
    const ownership = await isPaseoOwnedWorktreeCwd(cwd, { paseoHome });
    if (!ownership.allowed || ownership.worktreePath === undefined) {
      return false;
    }
    try {
      await getGitCommonDir(cwd);
      return true;
    } catch {
      return false;
    }
  };
}

/**
 * Resolve the isolation context for an execute workspace. `kind === "worktree"`
 * alone is not proof: the path must survive the ownership check (Paseo worktree
 * layout or git-registered metadata worktree), and a worktree parked on a
 * default branch degrades to local because its pushes would land on main.
 */
export async function resolveGoalRunIsolation(
  workspace: Pick<PersistedWorkspaceRecord, "kind" | "cwd"> & {
    branch?: string | null;
  },
  probe: OwnedWorktreeProbe,
): Promise<GoalRunIsolationContext> {
  if (workspace.kind !== "worktree") {
    return GOAL_RUN_ISOLATION_LOCAL;
  }
  const branch = workspace.branch?.replace(/^refs\/heads\//, "");
  if (!branch || DEFAULT_BRANCH_NAMES.has(branch)) {
    return GOAL_RUN_ISOLATION_LOCAL;
  }
  try {
    if (!(await probe(workspace.cwd))) {
      return GOAL_RUN_ISOLATION_LOCAL;
    }
  } catch {
    return GOAL_RUN_ISOLATION_LOCAL;
  }
  return { isolation: "worktree", worktreePath: workspace.cwd };
}

// ---------------------------------------------------------------------------
// Command guard
//
// The pure checker is the policy source of truth; provider rules below are a
// translation of it. Splitting is deliberately crude — quoting is not honored —
// which blocks some innocent commands but never lets a red line through.
// ---------------------------------------------------------------------------

/** Hard-blocked `gh` invocations (first subcommand tokens). */
const BLOCKED_GH_PREFIXES = [
  "gh pr merge",
  "gh repo delete",
  "gh secret",
  "gh release",
  "gh api",
] as const;

/**
 * Hard-blocked `git` spellings, expressed as command prefixes. The remote name
 * cannot be enumerated, so push refspecs are checked token-wise by
 * {@link blockedGoalCommandReason} too — this list covers the common spellings
 * so providers can surface an explicit rejection instead of a stall.
 */
const BLOCKED_GIT_PREFIXES = [
  "git push --force",
  "git push -f",
  "git push --force-with-lease",
  "git push --delete",
  "git push -d",
  "git push --mirror",
  "git push origin main",
  "git push origin master",
  "git push origin HEAD:main",
  "git push origin HEAD:master",
  "git push upstream main",
  "git push upstream master",
  "git push upstream HEAD:main",
  "git push upstream HEAD:master",
  "git worktree",
  "git config --global",
] as const;

export const GOAL_UNATTENDED_BLOCKED_COMMAND_PREFIXES: readonly string[] = [
  ...BLOCKED_GH_PREFIXES,
  ...BLOCKED_GIT_PREFIXES,
];

const GIT_PUSH_FORCE_FLAGS = new Set([
  "-f",
  "--force",
  "--force-with-lease",
  "--mirror",
  "--delete",
  "-d",
]);

const DEFAULT_BRANCH_TOKEN_RE = /^main$|^master$|^refs\/heads\/(main|master)$/;
const DEFAULT_BRANCH_REFSPEC_RE = /[:+](refs\/heads\/)?(main|master)$/;

/** Git options that take a separate value token before the subcommand. */
const GIT_VALUE_OPTIONS = new Set([
  "-C",
  "-c",
  "--git-dir",
  "--work-tree",
  "--exec-path",
  "--namespace",
]);

/** The subcommand and its args, skipping git's own global options. */
function gitSubcommandArgs(tokens: string[]): string[] {
  const rest = tokens.slice(1);
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i]!;
    if (GIT_VALUE_OPTIONS.has(token)) {
      i += 1;
      continue;
    }
    if (token.startsWith("-")) {
      continue;
    }
    return rest.slice(i);
  }
  return [];
}

function shellSegments(command: string): string[] {
  return command
    .split(/&&|\|\||;|\||\n/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

function gitPushBlockReason(tokens: string[]): string | null {
  for (const token of tokens) {
    if (GIT_PUSH_FORCE_FLAGS.has(token) || token.startsWith("--force")) {
      return `git push ${token} 被目标运行策略禁止`;
    }
    // `+` refspecs are force pushes; `src:dst` refspecs and bare branch names
    // can address the default branch directly.
    if (
      token.startsWith("+") ||
      DEFAULT_BRANCH_TOKEN_RE.test(token) ||
      DEFAULT_BRANCH_REFSPEC_RE.test(token)
    ) {
      return `禁止向默认分支 main/master 推送：${token}`;
    }
  }
  return null;
}

function blockedSegmentReason(segment: string): string | null {
  const tokens = segment.split(/\s+/).filter((token) => token.length > 0);
  if (tokens.length === 0) return null;
  if (tokens[0] === "gh") {
    const prefix = `gh ${tokens[1] ?? ""}`;
    const pair = `${prefix} ${tokens[2] ?? ""}`.trim();
    if (
      pair === "gh pr merge" ||
      pair === "gh repo delete" ||
      prefix === "gh secret" ||
      prefix === "gh release" ||
      prefix === "gh api"
    ) {
      return `命令被目标运行策略硬拦截：${pair === prefix ? prefix : pair}`;
    }
    return null;
  }
  if (tokens[0] === "git") {
    const sub = gitSubcommandArgs(tokens);
    if (sub[0] === "push") {
      return gitPushBlockReason(sub.slice(1));
    }
    if (sub[0] === "worktree") {
      return "目标运行策略禁止在无人值守会话中管理 git worktree";
    }
    if (sub[0] === "config" && (sub.includes("--global") || sub.includes("-g"))) {
      return "目标运行策略禁止修改全局 git 配置";
    }
  }
  return null;
}

/**
 * Returns a human-readable reason when the command crosses a hard red line
 * (merge/delete/secret/release/gh api, force push, push to a default branch,
 * worktree management, global git config), or null when it does not.
 */
export function blockedGoalCommandReason(command: string): string | null {
  for (const segment of shellSegments(command)) {
    const reason = blockedSegmentReason(segment);
    if (reason) return reason;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Claude Code translation: explicit allow rules plus deny rules that surface an
// immediate rejection for the blocked spellings. Anything outside both lists
// falls back to the provider's permission prompt, which interrupts the run —
// the fail-safe direction.
// ---------------------------------------------------------------------------

function claudeBashRule(prefix: string): string {
  return `Bash(${prefix}:*)`;
}

function claudeBashExactRule(command: string): string {
  return `Bash(${command})`;
}

const GOAL_UNATTENDED_GIT_ALLOW_PREFIXES = [
  "git status",
  "git diff",
  "git log",
  "git show",
  "git blame",
  "git shortlog",
  "git describe",
  "git rev-parse",
  "git ls-remote",
  "git ls-files",
  "git remote -v",
  "git remote get-url",
  "git add",
  "git rm",
  "git mv",
  "git restore",
  "git reset",
  "git clean",
  "git commit",
  "git checkout",
  "git switch",
  "git stash",
  "git branch",
  "git fetch",
  "git merge",
  "git rebase",
  "git cherry-pick",
  "git pull",
  "git tag -l",
] as const;

/**
 * Push is allowed only in spellings that cannot name a remote branch: the
 * worktree branch is verified non-default at policy resolution time, so a bare
 * or HEAD push always lands on a feature branch.
 */
const GOAL_UNATTENDED_GIT_PUSH_ALLOW_COMMANDS = [
  "git push",
  "git push -u",
  "git push origin",
  "git push origin HEAD",
  "git push -u origin",
  "git push -u origin HEAD",
  "git push --set-upstream origin HEAD",
  "git push upstream HEAD",
  "git push -u upstream HEAD",
] as const;

const GOAL_UNATTENDED_TOOLCHAIN_PREFIXES = [
  "node",
  "npm",
  "npx",
  "pnpm",
  "yarn",
  "bun",
  "deno",
  "corepack",
  "vitest",
  "jest",
  "tsc",
  "tsx",
  "eslint",
  "biome",
  "oxlint",
  "prettier",
  "make",
  "cmake",
  "go",
  "cargo",
  "rustc",
  "rustup",
  "python",
  "python3",
  "pytest",
  "pip",
  "pip3",
  "uv",
  "poetry",
  "ls",
  "cat",
  "echo",
  "pwd",
  "which",
  "head",
  "tail",
  "grep",
  "rg",
  "find",
  "wc",
  "sort",
  "uniq",
  "diff",
  "env",
  "date",
  "uname",
  "basename",
  "dirname",
  "realpath",
] as const;

const GOAL_UNATTENDED_GH_ALLOW_PREFIXES = [
  "gh pr create",
  "gh pr view",
  "gh pr list",
  "gh pr checks",
  "gh pr diff",
  "gh pr status",
  "gh issue list",
  "gh issue view",
  "gh run list",
  "gh run view",
  "gh repo view",
  "gh search",
  "gh status",
] as const;

const GOAL_UNATTENDED_GH_ALLOW_COMMANDS = ["gh auth status"] as const;

const GOAL_UNATTENDED_CLAUDE_ALLOW_TOOLS = [
  "Read",
  "Glob",
  "Grep",
  "LS",
  "Task",
  "TodoWrite",
  "WebFetch",
  "WebSearch",
] as const;

/** Permission rules that run an isolated worktree executor without prompts. */
export function goalUnattendedClaudeAllowRules(): string[] {
  return [
    ...GOAL_UNATTENDED_CLAUDE_ALLOW_TOOLS,
    ...GOAL_UNATTENDED_GIT_ALLOW_PREFIXES.map(claudeBashRule),
    ...GOAL_UNATTENDED_GIT_PUSH_ALLOW_COMMANDS.map(claudeBashExactRule),
    ...GOAL_UNATTENDED_TOOLCHAIN_PREFIXES.map(claudeBashRule),
    ...GOAL_UNATTENDED_GH_ALLOW_PREFIXES.map(claudeBashRule),
    ...GOAL_UNATTENDED_GH_ALLOW_COMMANDS.map(claudeBashExactRule),
  ];
}

/** Explicit rejections for the blocked command spellings. */
export function goalUnattendedClaudeDenyRules(): string[] {
  return GOAL_UNATTENDED_BLOCKED_COMMAND_PREFIXES.map(claudeBashRule);
}

/**
 * Claude options for an isolated execute run: file tools stay confined to the
 * worktree plus the OS temp dir via `additionalDirectories`; `acceptEdits` (or
 * the `auto` classifier mode) auto-approves edits; the allow rules cover the
 * dev toolchain, git branch work, feature-branch pushes and `gh pr create`;
 * the deny rules hard-reject the red lines.
 */
export function buildClaudeGoalUnattendedOptions(): ClaudeProviderOptions {
  return {
    additionalDirectories: [tmpdir()],
    disallowedTools: goalUnattendedClaudeDenyRules(),
    settings: {
      permissions: {
        allow: goalUnattendedClaudeAllowRules(),
        deny: goalUnattendedClaudeDenyRules(),
      },
    },
  };
}
