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
import { withTaskApi, type TaskCreateBody } from "./api.js";

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
  sourceKind?: string;
  sourceKey?: string;
  sourceUrl?: string;
  paths?: string;
  run?: string;
  confirmExecutionStopped?: boolean;
  mergeMethod?: string;
}
function single(value: unknown): SingleResult<Task> {
  return { type: "single", data: envelope.parse(value).goal, schema };
}
export function formatTaskCreateError(error: unknown, requestId: string): Error {
  const message = (error instanceof Error ? error.message : String(error)).replace(/\.$/, "");
  return new Error(`${message}. Retry with --request-id ${requestId}`, { cause: error });
}

export function taskCreateBody(title: string, options: TaskOptions): TaskCreateBody {
  if (!options.repo || !options.summary) throw new Error("--repo and --summary are required");
  if ((options.sourceKind && !options.sourceKey) || (!options.sourceKind && options.sourceKey)) {
    throw new Error("--source-kind and --source-key must be used together");
  }
  const paths = options.paths
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
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
    ...(options.sourceKind
      ? {
          source: {
            kind: options.sourceKind,
            key: options.sourceKey ?? null,
            url: options.sourceUrl ?? null,
          },
        }
      : {}),
    ...(paths && paths.length > 0 ? { paths } : {}),
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
      .option("--goal <id>", "Only this goal's tasks")
      .option("--source-kind <kind>", "Only tasks from this external source kind"),
  ).action(
    withOutput(
      async (options: TaskOptions, _command: Command): Promise<ListResult<Task>> =>
        withTaskApi(options, async (api) => ({
          type: "list",
          data: z.array(taskSchema).parse(
            await api.listTasks({
              filter: options.filter ?? "all",
              repoKey: options.repo,
              parentGoalId: options.goal,
              sourceKind: options.sourceKind,
            }),
          ),
          schema,
        })),
    ),
  );
  addJsonAndDaemonHostOptions(task.command("inspect").argument("<id>")).action(
    withOutput(async (id: string, options: TaskOptions, _command: Command) =>
      withTaskApi(options, async (api) => single(await api.getTask(id))),
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
    .option("--source-kind <kind>", "External source kind, e.g. bianpai-idea")
    .option("--source-key <key>", "Stable external source identity")
    .option("--source-url <url>", "External source URL")
    .option("--paths <paths>", "Comma-separated allowed file or directory prefixes")
    .option("--draft", "Save without starting execution")
    .option("--request-id <uuid>", "Reuse this ID after an ambiguous create response");
  addJsonAndDaemonHostOptions(create).action(
    withOutput(async (title: string, options: TaskOptions, _command: Command) => {
      const body = taskCreateBody(title, options);
      try {
        return await withTaskApi(options, async (api) => single(await api.createTask(body)));
      } catch (error) {
        throw formatTaskCreateError(error, body.requestId);
      }
    }),
  );
  for (const action of ["accept", "approve", "pause", "discard", "continue", "land"] as const) {
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
        )
        .option("--merge-method <method>", "For land: merge, squash, or rebase"),
    ).action(
      withOutput(async (id: string, options: TaskOptions, _command: Command) =>
        withTaskApi(options, async (api) => {
          if (options.mergeMethod && !["merge", "squash", "rebase"].includes(options.mergeMethod)) {
            throw new Error("--merge-method must be merge, squash, or rebase");
          }
          const body = {
            ...(action === "continue" || action === "accept"
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
              : {}),
            ...(action === "land" && options.mergeMethod
              ? { mergeMethod: options.mergeMethod as "merge" | "squash" | "rebase" }
              : {}),
          };
          return single(await api.actOnTask(id, action, body));
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
      if (!options.evidence || !options.run || !options.summary) {
        throw new Error("--run, --summary and --evidence are required");
      }
      const evidence: unknown = JSON.parse(await readFile(options.evidence, "utf8"));
      return withTaskApi(options, async (api) =>
        single(
          await api.submitTaskReview(id, {
            runId: options.run!,
            message: options.summary!,
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
      return withTaskApi(options, async (api) =>
        single(
          await api.createTask({
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
      withTaskApi(options, async (api, client) => {
        const existing = await client.fetchAgent({ agentId });
        if (!existing || existing.agent.archivedAt)
          throw new Error("Existing session is unavailable or archived");
        return single(
          await api.attachSession({
            requestId: options.requestId ?? randomUUID(),
            agentId,
            repoKey: options.repo!,
            title: existing.agent.title ?? "Existing session",
            summary: options.summary ?? existing.agent.title ?? "Review existing work",
            ...(options.acceptance ? { acceptance: options.acceptance } : {}),
            ...(options.goal ? { parentGoalId: options.goal } : {}),
          }),
        );
      }),
    ),
  );
  return task;
}
