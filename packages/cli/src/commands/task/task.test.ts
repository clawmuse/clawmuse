import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import nodePath from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const daemonTarget = { kind: "endpoint" as const, host: "example.test:12345" };

const REPO = "remote:github.com/acme/app";
const LOCAL_REPO = "local:srv-local:p-local";

const features = { localGoals: true };

function makeGoal(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title: `Task ${id}`,
    status: "running",
    repoKey: REPO,
    repoDisplayName: "app",
    parentGoalId: null,
    currentRun: { id: `${id}-run`, hostDisplayName: "Local Mac" },
    ...overrides,
  };
}

const goalStore = new Map<string, ReturnType<typeof makeGoal>>();

const repos = [
  {
    repoKey: REPO,
    displayName: "app",
    hosts: [
      {
        hostId: "srv-local",
        serverId: "srv-local",
        relayHostId: "relay-1",
        displayName: "Local Mac",
        connectivity: "live",
      },
    ],
  },
  {
    repoKey: LOCAL_REPO,
    displayName: "local-notes",
    hosts: [
      {
        hostId: "srv-local",
        serverId: "srv-local",
        relayHostId: "relay-1",
        displayName: "Local Mac",
        connectivity: "live",
      },
    ],
  },
];

const listGoals = vi.fn(async (_input: Record<string, unknown> = {}) => ({
  requestId: "req",
  goals: [...goalStore.values()],
  repos,
}));
const getGoal = vi.fn(async (goalId: string) => ({
  requestId: "req",
  goal: { ...goalStore.get(goalId), runs: [], reports: [] },
}));
const createGoal = vi.fn(async (input: Record<string, unknown>) => ({
  requestId: "req",
  goal: makeGoal("goal-new", {
    repoKey: input.repoKey,
    title: input.title,
    source: input.source,
    attachedAgentRef: input.attachedAgentRef,
  }),
}));
const actOnGoal = vi.fn(async (input: { goalId: string; action: string }) => ({
  requestId: "req",
  goal: { ...goalStore.get(input.goalId), status: "done" },
}));
const submitGoalReview = vi.fn(async (input: Record<string, unknown>) => ({
  requestId: "req",
  goal: { ...goalStore.get(String(input.goalId)), runs: [], reports: [] },
}));
const createClawMuseStatusEnrollment = vi.fn(async () => ({
  requestId: "req",
  enrollmentCode: "code-1",
  expiresAt: "2030-01-01T00:00:00.000Z",
  statusBaseUrl: "https://status.example.com",
}));
const getClawMuseStatus = vi.fn(async () => ({ relayHostId: "relay-1" }));
const fetchAgent = vi.fn(async () => ({
  agent: { id: "agent-1", title: "Existing work", archivedAt: null },
}));
const close = vi.fn(async () => undefined);
const supportsLocalGoals = vi.fn(() => features.localGoals);

vi.mock("../../utils/client.js", () => ({
  connectToDaemon: vi.fn(async () => ({
    supportsLocalGoals,
    listGoals,
    getGoal,
    createGoal,
    actOnGoal,
    submitGoalReview,
    createClawMuseStatusEnrollment,
    getClawMuseStatus,
    fetchAgent,
    close,
  })),
}));

const jsonResponse = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });

const taskId = (t: unknown): string => (t as { id: string }).id;

const fetchCalls: Array<{ url: string; method: string; body?: unknown }> = [];
const fetchMock = vi.fn(async (input: unknown, init?: { method?: string; body?: string }) => {
  const url = String(input);
  const method = init?.method ?? "GET";
  fetchCalls.push({ url, method, body: init?.body ? JSON.parse(init.body) : undefined });
  if (url.endsWith("/v1/mobile/enrollments")) return jsonResponse({ accessToken: "token-1" });
  if (url.includes("/v1/mobile/goal-repos")) {
    return jsonResponse({
      repos: [{ repoKey: REPO, hosts: [{ hostId: "cloud-host", relayHostId: "relay-1" }] }],
    });
  }
  if (url.includes("/v1/mobile/tasks/") && url.endsWith("/submit")) {
    return jsonResponse({
      goal: { id: "g-cloud", title: "Cloud", status: "needs_review", repoDisplayName: "app" },
    });
  }
  if (/\/v1\/mobile\/tasks\/[^/]+\/[^/]+$/.test(url)) {
    return jsonResponse({
      goal: { id: "g-cloud", title: "Cloud", status: "done", repoDisplayName: "app" },
    });
  }
  if (url.includes("/v1/mobile/tasks/")) {
    return jsonResponse({
      goal: { id: "g-cloud", title: "Cloud", status: "running", repoDisplayName: "app" },
    });
  }
  if (url.includes("/v1/mobile/tasks")) {
    return jsonResponse({
      goals: [{ id: "g-cloud", title: "Cloud", status: "running", repoDisplayName: "app" }],
      nextCursor: null,
    });
  }
  return jsonResponse({});
});
vi.stubGlobal("fetch", fetchMock);

import { withTaskApi } from "./api.js";
import { createTaskCommand } from "./index.js";
import type { CommandOptions } from "../../output/index.js";

const options = { daemonTarget } as unknown as CommandOptions;

const tmpDirs: string[] = [];
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("task api dual-mode routing", () => {
  beforeEach(() => {
    features.localGoals = true;
    goalStore.clear();
    goalStore.set("g-local", makeGoal("g-local"));
    fetchCalls.length = 0;
    vi.clearAllMocks();
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  it("lists tasks through goals.* RPCs without any cloud enrollment", async () => {
    await withTaskApi(options, async (api) => {
      const tasks = await api.listTasks({ filter: "all" });
      const ids = tasks.map(taskId);
      expect(ids).toEqual(["g-local"]);
    });
    expect(listGoals).toHaveBeenCalled();
    expect(createClawMuseStatusEnrollment).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
  });

  it("forwards --goal as parentGoalId on the local list RPC", async () => {
    await withTaskApi(options, async (api) => {
      await api.listTasks({ filter: "all", parentGoalId: "g-parent", repoKey: REPO });
    });
    expect(listGoals).toHaveBeenCalledWith(
      expect.objectContaining({ filter: "all", parentGoalId: "g-parent", repoKey: REPO }),
    );
  });

  it("creates tasks locally with idempotency key and source", async () => {
    await withTaskApi(options, async (api) => {
      await api.createTask({
        requestId: "req-1",
        repoKey: REPO,
        title: "Imported",
        summary: "Work",
        start: true,
        source: {
          kind: "github",
          key: "https://github.com/acme/app/issues/1",
          url: "https://github.com/acme/app/issues/1",
        },
      });
    });
    expect(createGoal).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "req-1",
        repoKey: REPO,
        source: {
          kind: "github",
          key: "https://github.com/acme/app/issues/1",
          url: "https://github.com/acme/app/issues/1",
        },
      }),
    );
    expect(createClawMuseStatusEnrollment).not.toHaveBeenCalled();
  });

  it("inspects and acts on local goals via daemon RPCs", async () => {
    await withTaskApi(options, async (api) => {
      await api.getTask("g-local");
      for (const action of ["accept", "approve", "pause", "discard"] as const) {
        await api.actOnTask("g-local", action, {});
      }
      await api.actOnTask("g-local", "continue", {
        instruction: "Keep going",
        confirmExecutionStopped: true,
      });
    });
    expect(getGoal).toHaveBeenCalledWith("g-local");
    expect(actOnGoal.mock.calls.map((call) => call[0].action)).toEqual([
      "accept",
      "approve",
      "pause",
      "discard",
      "continue",
    ]);
    expect(actOnGoal).toHaveBeenLastCalledWith(
      expect.objectContaining({
        goalId: "g-local",
        action: "continue",
        instruction: "Keep going",
        confirmExecutionStopped: true,
      }),
    );
    expect(createClawMuseStatusEnrollment).not.toHaveBeenCalled();
  });

  it("submits owner reviews locally", async () => {
    await withTaskApi(options, async (api) => {
      await api.submitTaskReview("g-local", {
        runId: "g-local-run",
        message: "Verified",
        evidence: { revision: "abc", checks: [{ name: "unit", result: "passed" }], artifacts: [] },
      });
    });
    expect(submitGoalReview).toHaveBeenCalledWith(
      expect.objectContaining({ goalId: "g-local", runId: "g-local-run" }),
    );
  });

  it("attaches an existing session through local goals without cloud status", async () => {
    await withTaskApi(options, async (api) => {
      await api.attachSession({
        requestId: "req-attach",
        agentId: "agent-1",
        repoKey: LOCAL_REPO,
        title: "Existing work",
        summary: "Track it",
      });
    });
    expect(createGoal).toHaveBeenCalledWith(
      expect.objectContaining({
        attachedAgentRef: "agent-1",
        source: { kind: "session", key: "srv-local/agent-1", url: null },
      }),
    );
    expect(getClawMuseStatus).not.toHaveBeenCalled();
    expect(createClawMuseStatusEnrollment).not.toHaveBeenCalled();
  });

  it("falls back to the hosted service when the daemon lacks localGoals", async () => {
    features.localGoals = false;
    await withTaskApi(options, async (api) => {
      await api.listTasks({ filter: "all" });
      await api.getTask("g-cloud");
      await api.actOnTask("g-cloud", "approve", {});
    });
    expect(createClawMuseStatusEnrollment).toHaveBeenCalledTimes(1);
    expect(listGoals).not.toHaveBeenCalled();
    const paths = fetchCalls.map((call) => `${call.method} ${call.url}`);
    expect(paths.some((p) => p.startsWith("GET ") && p.includes("/v1/mobile/tasks?"))).toBe(true);
    expect(paths.some((p) => p === "GET https://status.example.com/v1/mobile/tasks/g-cloud")).toBe(
      true,
    );
    expect(
      paths.some((p) => p === "POST https://status.example.com/v1/mobile/tasks/g-cloud/approve"),
    ).toBe(true);
    expect(
      paths.some((p) => p === "DELETE https://status.example.com/v1/mobile/installation"),
    ).toBe(true);
  });

  it("routes creates to the cloud when the repo is not published locally", async () => {
    await withTaskApi(options, async (api) => {
      await api.createTask({
        requestId: "req-2",
        repoKey: "remote:github.com/acme/other",
        title: "Elsewhere",
        summary: "Work",
        start: true,
      });
    });
    expect(createGoal).not.toHaveBeenCalled();
    expect(
      fetchCalls.some((call) => call.method === "POST" && call.url.endsWith("/v1/mobile/tasks")),
    ).toBe(true);
  });

  it("routes creates to the cloud when --run-on targets a foreign host", async () => {
    await withTaskApi(options, async (api) => {
      await api.createTask({
        requestId: "req-3",
        repoKey: REPO,
        title: "Pinned",
        summary: "Work",
        hostId: "cloud-host",
        start: true,
      });
    });
    expect(createGoal).not.toHaveBeenCalled();
    expect(
      fetchCalls.some(
        (call) =>
          call.method === "POST" &&
          call.url.endsWith("/v1/mobile/tasks") &&
          (call.body as { hostId?: string }).hostId === "cloud-host",
      ),
    ).toBe(true);
  });

  it("routes actions to the cloud for goal ids this daemon does not own", async () => {
    await withTaskApi(options, async (api) => {
      await api.actOnTask("g-remote", "approve", {});
    });
    expect(actOnGoal).not.toHaveBeenCalled();
    expect(
      fetchCalls.some(
        (call) => call.method === "POST" && call.url.endsWith("/v1/mobile/tasks/g-remote/approve"),
      ),
    ).toBe(true);
  });
});

describe("task command wiring", () => {
  beforeEach(() => {
    features.localGoals = true;
    goalStore.clear();
    goalStore.set("g-local", makeGoal("g-local"));
    fetchCalls.length = 0;
    vi.clearAllMocks();
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  it("runs task create locally through the daemon RPC", async () => {
    const command = createTaskCommand();
    await command.parseAsync(
      ["create", "Ship it", "--repo", REPO, "--summary", "Do the work", "--draft"],
      { from: "user" },
    );
    expect(createGoal).toHaveBeenCalledWith(
      expect.objectContaining({ repoKey: REPO, title: "Ship it", start: false }),
    );
  });

  it("runs task report locally with a parsed evidence file", async () => {
    const dir = mkdtempSync(nodePath.join(tmpdir(), "task-evidence-"));
    tmpDirs.push(dir);
    const evidencePath = nodePath.join(dir, "evidence.json");
    writeFileSync(
      evidencePath,
      JSON.stringify({
        revision: "abc123",
        checks: [{ name: "unit", result: "passed" }],
        artifacts: [],
      }),
    );
    const command = createTaskCommand();
    await command.parseAsync(
      [
        "report",
        "g-local",
        "--run",
        "g-local-run",
        "--summary",
        "Verified",
        "--evidence",
        evidencePath,
      ],
      { from: "user" },
    );
    expect(submitGoalReview).toHaveBeenCalledWith(
      expect.objectContaining({
        goalId: "g-local",
        runId: "g-local-run",
        message: "Verified",
      }),
    );
  });
});
