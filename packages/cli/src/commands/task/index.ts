import { ClawMuseStatusGetResponseSchema } from "@getpaseo/protocol/messages";
import { Command } from "commander";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import {
  withOutput,
  type CommandOptions,
  type OutputSchema,
  type SingleResult,
  type ListResult,
} from "../../output/index.js";
import { addJsonAndDaemonHostOptions } from "../../utils/command-options.js";
import { withTaskApi } from "./api.js";

const taskSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    status: z.string(),
    repoDisplayName: z.string(),
    parentGoalId: z.string().nullable().optional(),
    currentRun: z
      .object({ id: z.string(), hostDisplayName: z.string().nullable() })
      .passthrough()
      .nullable(),
  })
  .passthrough();
type Task = z.infer<typeof taskSchema>;
const envelope = z.object({ goal: taskSchema });
const schema: OutputSchema<Task> = {
  idField: "id",
  columns: [
    { header: "ID", field: "id" },
    { header: "TASK", field: "title" },
    { header: "STATUS", field: "status" },
    { header: "PROJECT", field: "repoDisplayName" },
    { header: "GOAL", field: "parentGoalId" },
  ],
};
interface TaskOptions extends CommandOptions {
  repo?: string;
  summary?: string;
  acceptance?: string;
  goal?: string;
  dependsOn?: string;
  runOn?: string;
  model?: string;
  draft?: boolean;
  requestId?: string;
  filter?: string;
  instruction?: string;
  evidence?: string;
  run?: string;
  confirmExecutionStopped?: boolean;
}
function single(value: unknown): SingleResult<Task> {
  return { type: "single", data: envelope.parse(value).goal, schema };
}
export function formatTaskCreateError(error: unknown, requestId: string): Error {
  const message = (error instanceof Error ? error.message : String(error)).replace(/\.$/, "");
  return new Error(`${message}. Retry with --request-id ${requestId}`, { cause: error });
}

export function taskCreateBody(title: string, options: TaskOptions) {
  if (!options.repo || !options.summary) throw new Error("--repo and --summary are required");
  return {
    requestId: options.requestId ?? randomUUID(),
    repoKey: options.repo,
    title,
    summary: options.summary,
    ...(options.acceptance ? { acceptance: options.acceptance } : {}),
    ...(options.goal ? { parentGoalId: options.goal } : {}),
    ...(options.dependsOn
      ? { dependsOn: options.dependsOn.split(",").map((value) => value.trim()) }
      : {}),
    ...(options.runOn ? { hostId: options.runOn } : {}),
    ...(options.model ? { agent: options.model } : {}),
    start: !options.draft,
  };
}
export function parseGitHubIssueUrl(input: string) {
  const url = new URL(input);
  const match = /^\/([^/]+)\/([^/]+)\/issues\/([1-9][0-9]*)\/?$/.exec(url.pathname);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "github.com" ||
    url.username ||
    url.password ||
    url.port ||
    !match
  ) {
    throw new Error("Expected https://github.com/owner/repo/issues/number");
  }
  return {
    url: `https://github.com/${match[1]}/${match[2]}/issues/${match[3]}`,
    repoKey: `remote:github.com/${match[1]}/${match[2]}`,
  };
}
export function createTaskCommand(): Command {
  const task = new Command("task").description(
    "Manage tasks across linked hosts; reuses Goals execution and review",
  );
  addJsonAndDaemonHostOptions(
    task
      .command("list")
      .alias("ls")
      .option("--filter <filter>", "all, active, suggested, needs_review, or closed", "all")
      .option("--repo <key>", "Remote project key")
      .option("--goal <id>", "Only this goal's tasks"),
  ).action(
    withOutput(
      async (options: TaskOptions, _command: Command): Promise<ListResult<Task>> =>
        withTaskApi(options, async (request) => {
          const query = new URLSearchParams({ filter: options.filter ?? "all" });
          if (options.repo) query.set("repoKey", options.repo);
          if (options.goal) query.set("parentGoalId", options.goal);
          const tasks = new Map<string, Task>();
          let before: string | null | undefined;
          do {
            if (before) query.set("before", before);
            const value = z
              .object({ goals: z.array(taskSchema), nextCursor: z.string().nullable().optional() })
              .parse(await request(`/tasks?${query}`));
            for (const item of value.goals) tasks.set(item.id, item);
            before = value.nextCursor;
          } while (before);
          return { type: "list", data: [...tasks.values()], schema };
        }),
    ),
  );
  addJsonAndDaemonHostOptions(task.command("inspect").argument("<id>")).action(
    withOutput(async (id: string, options: TaskOptions, _command: Command) =>
      withTaskApi(options, async (request) =>
        single(await request(`/tasks/${encodeURIComponent(id)}`)),
      ),
    ),
  );
  const create = task
    .command("create")
    .argument("<title>")
    .requiredOption("--repo <key>", "Remote project key, e.g. remote:github.com/owner/repo")
    .requiredOption("--summary <text>", "Work to perform")
    .option("--acceptance <text>", "Definition of done")
    .option("--goal <id>", "Parent goal")
    .option("--depends-on <ids>", "Comma-separated tasks that must be accepted first")
    .option("--run-on <host-id>", "Pin to a status-service host")
    .option("--model <provider/model>", "Execution model")
    .option("--draft", "Save without starting execution")
    .option("--request-id <uuid>", "Reuse this ID after an ambiguous create response");
  addJsonAndDaemonHostOptions(create).action(
    withOutput(async (title: string, options: TaskOptions, _command: Command) => {
      const body = taskCreateBody(title, options);
      try {
        return await withTaskApi(options, async (request) =>
          single(await request("/tasks", "POST", body)),
        );
      } catch (error) {
        throw formatTaskCreateError(error, body.requestId);
      }
    }),
  );
  for (const action of ["accept", "approve", "pause", "discard", "continue"] as const) {
    addJsonAndDaemonHostOptions(
      task
        .command(action)
        .argument("<id>")
        .option("--instruction <text>", "Direction for continuation")
        .option("--run-on <host-id>", "Execution host")
        .option("--model <provider/model>", "Execution model")
        .option(
          "--confirm-execution-stopped",
          "Confirm you checked the original host and its prior executor has stopped",
        ),
    ).action(
      withOutput(async (id: string, options: TaskOptions, _command: Command) =>
        withTaskApi(options, async (request) => {
          const body =
            action === "continue" || action === "accept"
              ? {
                  ...(options.runOn ? { hostId: options.runOn } : {}),
                  ...(options.model ? { agent: options.model } : {}),
                  ...(action === "continue" && options.instruction
                    ? { instruction: options.instruction }
                    : {}),
                  ...(action === "continue" && options.confirmExecutionStopped
                    ? { confirmExecutionStopped: true }
                    : {}),
                }
              : {};
          return single(await request(`/tasks/${encodeURIComponent(id)}/${action}`, "POST", body));
        }),
      ),
    );
  }
  addJsonAndDaemonHostOptions(
    task
      .command("report")
      .argument("<id>")
      .requiredOption("--run <id>", "Completed run being reviewed")
      .requiredOption("--summary <text>", "Verified result")
      .requiredOption(
        "--evidence <file>",
        "JSON with revision, checks and artifacts; does not accept the task",
      ),
  ).action(
    withOutput(async (id: string, options: TaskOptions, _command: Command) => {
      if (!options.evidence) throw new Error("Evidence file is required");
      const evidence: unknown = JSON.parse(await readFile(options.evidence, "utf8"));
      return withTaskApi(options, async (request) =>
        single(
          await request(`/tasks/${encodeURIComponent(id)}/submit`, "POST", {
            runId: options.run,
            message: options.summary,
            evidence,
          }),
        ),
      );
    }),
  );
  addJsonAndDaemonHostOptions(
    task
      .command("import-issue")
      .argument("<url>")
      .option("--goal <id>", "Parent goal")
      .option("--acceptance <text>", "Definition of done"),
  ).action(
    withOutput(async (input: string, options: TaskOptions, _command: Command) => {
      const issue = parseGitHubIssueUrl(input);
      const result = await promisify(execFile)(
        "gh",
        ["issue", "view", issue.url, "--json", "title,body,url"],
        { timeout: 20_000, maxBuffer: 1024 * 1024 },
      );
      const details = z
        .object({ title: z.string(), body: z.string(), url: z.string().url() })
        .parse(JSON.parse(result.stdout));
      return withTaskApi(options, async (request) =>
        single(
          await request("/tasks", "POST", {
            ...taskCreateBody(details.title.slice(0, 200), {
              ...options,
              repo: issue.repoKey,
              summary: (details.body || details.title).slice(0, 4000),
              draft: true,
            }),
            source: { kind: "github", key: issue.url, url: issue.url },
          }),
        ),
      );
    }),
  );
  addJsonAndDaemonHostOptions(
    task
      .command("attach")
      .argument("<agent-id>")
      .requiredOption("--repo <key>", "Project of the existing session")
      .option("--goal <id>", "Parent goal")
      .option("--summary <text>", "Work being tracked")
      .option("--acceptance <text>", "Definition of done"),
  ).action(
    withOutput(async (agentId: string, options: TaskOptions, _command: Command) =>
      withTaskApi(options, async (request, client) => {
        const existing = await client.fetchAgent({ agentId });
        if (!existing || existing.agent.archivedAt)
          throw new Error("Existing session is unavailable or archived");
        const status = ClawMuseStatusGetResponseSchema.shape.payload.parse(
          await client.getClawMuseStatus(),
        );
        const repos = z
          .object({
            repos: z.array(
              z.object({
                repoKey: z.string(),
                hosts: z.array(z.object({ hostId: z.string(), relayHostId: z.string() })),
              }),
            ),
          })
          .parse(await request("/goal-repos"));
        const host = repos.repos
          .find((repo) => repo.repoKey === options.repo)
          ?.hosts.find((candidate) => candidate.relayHostId === status.relayHostId);
        if (!host) throw new Error("This host has not published the selected project");
        return single(
          await request("/tasks", "POST", {
            ...taskCreateBody(existing.agent.title ?? "Existing session", {
              ...options,
              summary: options.summary ?? existing.agent.title ?? "Review existing work",
              runOn: host.hostId,
            }),
            attachedAgentRef: existing.agent.id,
            source: { kind: "session", key: `${host.hostId}/${existing.agent.id}` },
          }),
        );
      }),
    ),
  );
  return task;
}
