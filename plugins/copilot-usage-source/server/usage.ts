import type { UsageInput } from "../shared/input.js";
import { promises as fs, constants } from "node:fs";
import { homedir } from "node:os";
import { join, delimiter } from "node:path";
import { z } from "zod";
import {
  unavailable,
  toneFromUsedPct,
  type UsageAccount,
  type UsageReport,
  type UsageDetail,
  type UsageBalance,
} from "@getpaseo/plugin/server/usage";

const ApiOptionalStringSchema = z.preprocess(
  (value) => (value == null ? undefined : value),
  z.coerce.string().optional(),
);
const QuotaSchema = z.object({
  entitlement: z.number().finite().nullish(),
  remaining: z.number().finite().nullish(),
  quota_remaining: z.number().finite().nullish(),
  unlimited: z.boolean().nullish(),
  has_quota: z.boolean().nullish(),
});
const CopilotUsageResponseSchema = z.object({
  copilot_plan: ApiOptionalStringSchema,
  quota_reset_date: ApiOptionalStringSchema,
  quota_snapshots: z.record(z.string(), z.unknown()).nullish(),
});

async function readStore(locator: string): Promise<string | undefined> {
  try {
    const raw = await fs.readFile(locator, "utf8");
    // A GitHub Enterprise token must not be sent to github.com.
    return raw.match(/^github\.com:\s*\n((?:[ \t]+[^\n]*\n?|\s*\n)*)/m)?.[1];
  } catch {
    return undefined;
  }
}

async function readToken(input: UsageInput): Promise<string | undefined> {
  if (input.store === "env") return process.env[input.locator]?.trim() || undefined;
  const store = await readStore(input.locator);
  if (!store) return undefined;
  const direct = storeValue(store, "oauth_token");
  if (direct) return direct;
  const user = storeValue(store, "user");
  if (!user) return undefined;
  const lines = store.split("\n");
  const index = lines.findIndex((line) => line.trim() === `${user}:`);
  if (index < 0) return undefined;
  const indent = lines[index]!.search(/\S/);
  const end = lines.findIndex(
    (line, offset) => offset > index && line.trim() !== "" && line.search(/\S/) <= indent,
  );
  return storeValue(lines.slice(index + 1, end < 0 ? undefined : end).join("\n"), "oauth_token");
}

function storeValue(store: string, key: "user" | "oauth_token"): string | undefined {
  const lines = store.split("\n").filter((line) => line.trim() !== "");
  const indent = Math.min(...lines.map((line) => line.search(/\S/)));
  const field = lines.find(
    (line) => line.search(/\S/) === indent && line.trimStart().startsWith(`${key}:`),
  );
  return field
    ?.slice(field.indexOf(":") + 1)
    .trim()
    .match(/^["']?([a-zA-Z0-9_-]+)["']?$/)?.[1];
}

async function hasCopilotCommand(): Promise<boolean> {
  const extensions =
    process.platform === "win32" ? (process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";") : [""];
  for (const directory of (process.env.PATH ?? "").split(delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const filename = join(directory, `copilot${extension}`);
      try {
        await fs.access(filename, process.platform === "win32" ? constants.F_OK : constants.X_OK);
        if ((await fs.stat(filename)).isFile()) return true;
      } catch {
        // Continue through PATH without launching the agent or its login flow.
      }
    }
  }
  return false;
}

export async function discover(monitoring: "auto" | "always" = "auto"): Promise<UsageAccount[]> {
  const direct: UsageInput = { store: "env", locator: "COPILOT_TOKEN" };
  if (await readToken(direct)) return [{ key: "default", input: direct }];
  if (monitoring !== "always" && !(await hasCopilotCommand())) return [];

  const candidates: UsageInput[] = ["GITHUB_TOKEN", "GITHUB_PAT"].map((locator) => ({
    store: "env",
    locator,
  }));
  const configDirectory =
    process.env.GH_CONFIG_DIR ??
    (process.env.APPDATA
      ? join(process.env.APPDATA, "GitHub CLI")
      : join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "gh"));
  candidates.push({ store: "file", locator: join(configDirectory, "hosts.yml") });
  for (const input of candidates) {
    if (!(await readToken(input))) continue;
    const store = input.store === "file" ? await readStore(input.locator) : undefined;
    const label = store ? storeValue(store, "user") : undefined;
    return [
      { key: "default", label, harness: input.store === "file" ? "GitHub CLI" : "GitHub", input },
    ];
  }
  return [];
}

const quotas = [
  ["chat", "Chat requests"],
  ["completions", "Code completions"],
  ["premium_interactions", "Premium requests"],
] as const;

export async function fetchUsage(
  input: UsageInput,
  fetchApi: typeof fetch = fetch,
): Promise<UsageReport> {
  const token = await readToken(input);
  if (!token) throw new Error("Copilot login store no longer exists");
  const res = await fetchApi("https://api.github.com/copilot_internal/user", {
    signal: AbortSignal.timeout(15_000),
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/json",
      "Editor-Version": "vscode/1.96.2",
      "Editor-Plugin-Version": "copilot-chat/0.26.7",
      "User-Agent": "GitHubCopilotChat/0.26.7",
      "X-Github-Api-Version": "2025-04-01",
    },
  });
  if (res.status === 401 || res.status === 403)
    return unavailable({ kind: "rejected", status: res.status });
  if (!res.ok) throw new Error(`Copilot usage API returned ${res.status}`);

  const resp = CopilotUsageResponseSchema.parse(await res.json());
  // A date alone does not report the reset hour or timezone. Keep it in details.
  const resetTime = resp.quota_reset_date?.includes("T") ? Date.parse(resp.quota_reset_date) : NaN;
  const resetsAt = Number.isFinite(resetTime) ? new Date(resetTime).toISOString() : null;
  const details: UsageDetail[] = [
    {
      id: "copilot_source",
      label: "Account source",
      value: accountSource(input),
    },
  ];
  const balances = quotaBalances(resp.quota_snapshots, resetsAt, details);
  if (resp.quota_reset_date)
    details.push({ id: "reset", label: "Quota reset", value: resp.quota_reset_date });
  return {
    status: "available",
    planLabel: resp.copilot_plan || undefined,
    windows: [],
    balances,
    details,
  };
}

function quotaBalances(
  snapshots: z.infer<typeof CopilotUsageResponseSchema>["quota_snapshots"],
  resetsAt: string | null,
  details: UsageDetail[],
): UsageBalance[] {
  const balances: UsageBalance[] = [];
  for (const [key, label] of quotas) {
    const id = `copilot_${key}`;
    const parsed = QuotaSchema.safeParse(snapshots?.[key]);
    if (!parsed.success) {
      details.push({ id, label, value: "Not reported" });
      continue;
    }
    const quota = parsed.data;
    if (quota.unlimited) {
      details.push({ id, label, value: "Unlimited" });
      continue;
    }
    if (quota.has_quota === false) {
      details.push({ id, label, value: "Not included" });
      continue;
    }
    const remaining = quota.remaining ?? quota.quota_remaining;
    const limit = quota.entitlement;
    if (remaining == null || remaining < 0 || limit == null || limit <= 0) {
      details.push({ id, label, value: "Not reported" });
      continue;
    }
    const used = Math.max(0, limit - remaining);
    balances.push({
      id,
      label,
      remaining,
      used,
      limit,
      unit: "requests",
      resetsAt,
      tone: toneFromUsedPct((used / limit) * 100),
    });
  }
  return balances;
}

function accountSource(input: UsageInput): string {
  if (input.store === "file") return "GitHub CLI";
  return input.locator === "COPILOT_TOKEN" ? "Copilot token" : "GitHub token";
}
