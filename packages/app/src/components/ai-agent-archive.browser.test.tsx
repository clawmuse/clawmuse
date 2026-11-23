import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { page } from "vitest/browser";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ProviderSnapshotEntry } from "@getpaseo/protocol/agent-types";
import type { AgentArchiveReview, MutableDaemonConfig } from "@getpaseo/protocol/messages";
import type { AggregatedAgent } from "@/hooks/use-aggregated-agents";
import type { HostRuntimeConnectionStatus } from "@/runtime/host-runtime";
import { i18n } from "@/i18n/i18next";
import { AiAgentArchiveSheet } from "./ai-agent-archive";

interface MockHostSession {
  client: {
    isConnected: boolean;
    reviewAgentArchive: typeof fixture.review;
    applyAgentArchive: typeof fixture.apply;
    archiveAgent: typeof fixture.manualArchive;
  };
  serverInfo: {
    features: { aiAgentArchive: boolean; aiArchiveModelConfig: boolean };
    permissions: string[];
  };
  agents: Map<
    string,
    {
      id: string;
      provider: string;
      model: string | null;
      runtimeInfo?: { model?: string | null };
      lastError?: string | null;
      parentAgentId: string | null;
      labels: Record<string, string>;
      archivedAt?: Date | null;
      background?: boolean;
    }
  >;
}

const fixture = vi.hoisted(() => ({
  hosts: [{ serverId: "host", label: "My Mac" }],
  connectionStatuses: { host: "online" } as Record<string, HostRuntimeConnectionStatus>,
  agents: [] as AggregatedAgent[],
  sessions: {} as Record<string, MockHostSession>,
  daemonConfigs: {} as Record<string, MutableDaemonConfig>,
  providerSnapshots: {} as Record<string, ProviderSnapshotEntry[]>,
  lastWorkspace: null as { serverId: string; workspaceId: string } | null,
  review: vi.fn<(id: string) => Promise<AgentArchiveReview>>(),
  apply: vi.fn<(id: string, token: string) => Promise<{ archivedAt: string }>>(),
  manualArchive: vi.fn<(id: string) => Promise<{ archivedAt: string }>>(),
  patchConfig:
    vi.fn<(serverId: string, patch: unknown) => Promise<MutableDaemonConfig | undefined>>(),
  archived: vi.fn(),
  confirm: vi.fn<() => Promise<boolean>>(),
  navigate: vi.fn(),
  push: vi.fn(),
  connected: true,
  supported: true,
  modelConfigSupported: true,
}));

vi.mock("@/hooks/use-aggregated-agents", () => ({
  useAggregatedAgents: () => ({ agents: fixture.agents, isInitialLoad: false }),
}));

vi.mock("@/runtime/host-runtime", () => ({
  useHosts: () => fixture.hosts,
  useVisibleHosts: () => fixture.hosts,
  useHostRuntimeClient: () => null,
  useHostRuntimeConnectionStatuses: () => new Map(Object.entries(fixture.connectionStatuses)),
  useHostRuntimeConnectionStatus: (serverId: string) =>
    fixture.connectionStatuses[serverId] ?? "offline",
  useHostRuntimeIsConnected: (serverId: string) =>
    (fixture.connectionStatuses[serverId] ?? "offline") === "online",
}));

vi.mock("@/stores/session-store", () => {
  const useSessionStore = (selector: (state: { sessions: typeof fixture.sessions }) => unknown) =>
    selector({ sessions: fixture.sessions });
  useSessionStore.getState = () => ({ sessions: fixture.sessions });
  useSessionStore.getInitialState = () => ({ sessions: fixture.sessions });
  useSessionStore.subscribe = () => () => {};
  return { useSessionStore };
});

vi.mock("@/stores/navigation-active-workspace-store", () => ({
  useLastWorkspaceSelection: () => fixture.lastWorkspace,
}));

vi.mock("@/hooks/use-archive-agent", () => ({
  applyArchivedAgentCloseResults: fixture.archived,
}));

vi.mock("@/hooks/use-daemon-config", () => ({
  useDaemonConfig: (serverId: string | null) => ({
    config: serverId ? (fixture.daemonConfigs[serverId] ?? null) : null,
    isLoading: false,
    patchConfig: (patch: unknown) =>
      serverId ? fixture.patchConfig(serverId, patch) : Promise.resolve(undefined),
  }),
}));

vi.mock("@/hooks/use-providers-snapshot", () => ({
  useProvidersSnapshot: (serverId: string | null) => ({
    entries: serverId ? (fixture.providerSnapshots[serverId] ?? []) : [],
    isLoading: false,
    isFetching: false,
    isRefreshing: false,
    error: null,
    supportsSnapshot: true,
    refresh: vi.fn(async () => {}),
    refetchIfStale: vi.fn(),
  }),
}));

vi.mock("@/utils/confirm-dialog", () => ({
  confirmDialog: fixture.confirm,
}));

vi.mock("@/utils/navigate-to-agent", () => ({
  navigateToAgent: fixture.navigate,
}));

vi.mock("expo-router", () => ({
  router: { push: fixture.push },
}));

let root: Root;
let container: HTMLDivElement;
let client: QueryClient;

function makeAgent(
  id: string,
  overrides: Partial<AggregatedAgent> & {
    model?: string | null;
    lastError?: string | null;
    parentAgentId?: string | null;
  } = {},
): AggregatedAgent {
  const { model = null, lastError = null, parentAgentId = null, ...rest } = overrides;
  const agentObj: AggregatedAgent = {
    id,
    serverId: "host",
    serverLabel: "My Mac",
    provider: "codex",
    title: id,
    cwd: "/repo",
    workspaceId: "workspace",
    status: "idle",
    labels: {},
    turn: { phase: "idle", cancellationRequestId: null },
    createdAt: new Date("2026-11-11"),
    lastActivityAt: new Date("2026-11-11"),
    archivedAt: null,
    pendingPermissionCount: 0,
    requiresAttention: false,
    attentionReason: null,
    attentionTimestamp: null,
    ...rest,
  };
  const session = fixture.sessions[agentObj.serverId];
  if (session) {
    session.agents.set(id, {
      id,
      provider: agentObj.provider,
      model,
      runtimeInfo: model ? { model } : undefined,
      lastError,
      parentAgentId,
      labels: agentObj.labels,
      archivedAt: null,
      background: false,
    });
  }
  return agentObj;
}

function makeSession(
  serverId: string,
  options: { connected?: boolean; supported?: boolean; modelConfigSupported?: boolean } = {},
): MockHostSession {
  const connected = options.connected ?? true;
  return {
    client: {
      isConnected: connected,
      reviewAgentArchive: fixture.review,
      applyAgentArchive: fixture.apply,
      archiveAgent: fixture.manualArchive,
    },
    serverInfo: {
      features: {
        aiAgentArchive: options.supported ?? true,
        aiArchiveModelConfig: options.modelConfigSupported ?? true,
      },
      permissions: ["workspace.write", "daemon.manage"],
    },
    agents: new Map(),
  };
}

function makeDaemonConfig(
  overrides: Partial<MutableDaemonConfig["metadataGeneration"]> = {},
): MutableDaemonConfig {
  return {
    mcp: { injectIntoAgents: false },
    browserTools: { enabled: false },
    providers: {},
    metadataGeneration: {
      providers: [],
      ...overrides,
    },
    autoArchiveAfterMerge: false,
    enableTerminalAgentHooks: false,
    appendSystemPrompt: "",
  };
}

const close = vi.fn();

function mount() {
  act(() =>
    root.render(
      <QueryClientProvider client={client}>
        <AiAgentArchiveSheet onClose={close} />
      </QueryClientProvider>,
    ),
  );
}

beforeEach(async () => {
  vi.stubGlobal("React", React);
  await page.viewport(1280, 900);
  await i18n.changeLanguage("en");
  fixture.connected = true;
  fixture.supported = true;
  fixture.modelConfigSupported = true;
  fixture.hosts = [{ serverId: "host", label: "My Mac" }];
  fixture.connectionStatuses = { host: "online" };
  fixture.lastWorkspace = null;
  fixture.review.mockReset().mockImplementation(async (id) => ({
    agentId: id,
    eligible: id === "Completed work",
    token: id === "Completed work" ? "issued-token" : null,
    reason: id === "Completed work" ? "Implemented the change and all tests passed." : "permission",
    decision: id === "Completed work" ? "completed" : "blocked",
    provider: id === "Completed work" ? "claude" : undefined,
    model: id === "Completed work" ? "haiku" : undefined,
    durationMs: id === "Completed work" ? 400 : 10,
    latestUserMessage: "Update archive flow",
    latestReply: "Implemented the change and all tests passed.",
  }));
  fixture.apply.mockReset().mockResolvedValue({ archivedAt: "2026-11-11T10:00:00Z" });
  fixture.manualArchive.mockReset().mockResolvedValue({ archivedAt: "2026-11-11T10:05:00Z" });
  fixture.patchConfig.mockReset().mockImplementation(async (serverId, patch) => {
    const prev = fixture.daemonConfigs[serverId] ?? makeDaemonConfig();
    const typedPatch = patch as { metadataGeneration?: MutableDaemonConfig["metadataGeneration"] };
    const next: MutableDaemonConfig = {
      ...prev,
      metadataGeneration: {
        ...prev.metadataGeneration,
        ...typedPatch.metadataGeneration,
      },
    };
    fixture.daemonConfigs[serverId] = next;
    return next;
  });
  fixture.archived.mockReset();
  fixture.confirm.mockReset().mockResolvedValue(true);
  fixture.navigate.mockReset();
  fixture.push.mockReset();
  fixture.sessions = { host: makeSession("host") };
  fixture.daemonConfigs = { host: makeDaemonConfig() };
  fixture.providerSnapshots = {
    host: [
      {
        provider: "claude",
        status: "ready",
        enabled: true,
        models: [
          { provider: "claude", id: "claude-haiku-2026", label: "Claude Haiku", isDefault: true },
        ],
      },
    ],
  };
  fixture.agents = [makeAgent("Completed work"), makeAgent("Waiting for permission")];
  close.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  client = new QueryClient();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  client.clear();
});

it("shows open agents with live detailed status immediately before scanning", async () => {
  fixture.sessions.host = makeSession("host");
  fixture.agents = [
    makeAgent("Active task", {
      status: "running",
      turn: { phase: "open", turnId: null, startedAt: null, cancellationRequestId: null },
      model: "gpt-5.4",
      projectPlacement: {
        projectKey: "proj-1",
        projectName: "My App",
        workspaceName: "Main",
        checkout: {
          worktreeRoot: "/repo",
          cwd: "/repo",
          isGit: true,
          currentBranch: "feat/archive",
          remoteUrl: null,
          isPaseoOwnedWorktree: false,
          mainRepoRoot: "/repo",
        },
      },
    }),
    makeAgent("Permission task", {
      pendingPermissionCount: 1,
      attentionReason: "permission",
      requiresAttention: true,
    }),
    makeAgent("Broken task", {
      status: "error",
      lastError: "Rate limit exceeded",
    }),
  ];

  mount();

  await expect
    .element(page.getByTestId("ai-archive-progress"))
    .toHaveTextContent("3 open · 1 running · 2 needs attention · 0 idle");
  await expect.element(page.getByText("Running", { exact: true })).toBeVisible();
  await expect.element(page.getByText("Needs permission", { exact: true })).toBeVisible();
  await expect.element(page.getByText("Error", { exact: true })).toBeVisible();
  await expect.element(page.getByText("codex · gpt-5.4", { exact: true })).toBeVisible();
  await expect.element(page.getByText("My App / Main (feat/archive)")).toBeVisible();
  await expect.element(page.getByText("1 pending permission")).toBeVisible();
  await expect.element(page.getByText("Rate limit exceeded")).toBeVisible();
  expect(fixture.review).not.toHaveBeenCalled();
});

it("switches between hosts and All hosts while preserving review results", async () => {
  fixture.hosts = [
    { serverId: "host-a", label: "Mac Studio" },
    { serverId: "host-b", label: "Linux Box" },
  ];
  fixture.connectionStatuses = { "host-a": "online", "host-b": "online" };
  fixture.sessions = {
    "host-a": makeSession("host-a"),
    "host-b": makeSession("host-b"),
  };
  fixture.daemonConfigs = {
    "host-a": makeDaemonConfig(),
    "host-b": makeDaemonConfig(),
  };
  fixture.lastWorkspace = { serverId: "host-a", workspaceId: "ws-1" };
  fixture.agents = [
    makeAgent("Completed work", { serverId: "host-a", serverLabel: "Mac Studio" }),
    makeAgent("Remote task", { serverId: "host-b", serverLabel: "Linux Box" }),
  ];

  mount();

  await expect.element(page.getByTestId("ai-archive-row-Completed work")).toBeVisible();
  await expect.element(page.getByTestId("ai-archive-row-Remote task")).not.toBeInTheDocument();

  await page.getByTestId("ai-archive-scan").click();
  await expect.element(page.getByText("Ready to archive", { exact: true })).toBeVisible();
  await expect.element(page.getByText("AI · claude / haiku · 0.4s")).toBeVisible();

  await page.getByTestId("ai-archive-details-toggle-Completed work").click();
  await expect.element(page.getByText("Update archive flow")).toBeVisible();

  await page.getByTestId("ai-archive-host-filter").click();
  await page.getByText("Linux Box", { exact: true }).click();
  await expect.element(page.getByTestId("ai-archive-row-Remote task")).toBeVisible();
  await expect.element(page.getByTestId("ai-archive-row-Completed work")).not.toBeInTheDocument();

  await page.getByTestId("ai-archive-host-filter").click();
  await page.getByText("All hosts", { exact: true }).click();
  await expect.element(page.getByTestId("ai-archive-row-Completed work")).toBeVisible();
  await expect.element(page.getByTestId("ai-archive-row-Remote task")).toBeVisible();
  await expect.element(page.getByText("Ready to archive", { exact: true })).toBeVisible();
});

it("shows each decision and only archives reviewed completed agents on request", async () => {
  mount();
  await page.getByTestId("ai-archive-scan").click();
  await expect.element(page.getByText("Ready to archive", { exact: true })).toBeVisible();
  await expect.element(page.getByText("Waiting for permission.", { exact: true })).toBeVisible();
  expect(fixture.apply).not.toHaveBeenCalled();
  await page.getByTestId("ai-archive-auto").click();
  await expect.element(page.getByText("Archived", { exact: true })).toBeVisible();
  expect(fixture.apply).toHaveBeenCalledExactlyOnceWith("Completed work", "issued-token");
  expect(fixture.archived).toHaveBeenCalledTimes(1);
  await expect
    .element(page.getByTestId("ai-archive-progress"))
    .toHaveTextContent("0 ready · 1 archived · 1 kept");
});

it("auto archive scans and archives in one action while preserving failures for retry", async () => {
  fixture.review.mockImplementation(async (id) => {
    if (id !== "Completed work") throw new Error("Model is unavailable. Check again.");
    return {
      agentId: id,
      eligible: true,
      token: "issued-token",
      reason: "Completed and verified.",
      decision: "completed",
      provider: "claude",
      model: "haiku",
    };
  });
  mount();
  await page.getByTestId("ai-archive-auto").click();
  await expect.element(page.getByText("Archived", { exact: true })).toBeVisible();
  await expect.element(page.getByText("Model is unavailable. Check again.")).toBeVisible();
  expect(fixture.apply).toHaveBeenCalledTimes(1);
  await expect.element(page.getByTestId("ai-archive-scan")).toBeEnabled();
  fixture.agents = [makeAgent("Waiting for permission")];
  fixture.review.mockResolvedValue({
    agentId: "Waiting for permission",
    eligible: false,
    token: null,
    reason: "permission",
    decision: "blocked",
  });
  mount();
  await page.getByTestId("ai-archive-scan").click();
  await expect.element(page.getByText("Waiting for permission.", { exact: true })).toBeVisible();
});

it("supports manual archive directly for idle agents and confirms running agents", async () => {
  fixture.sessions.host = makeSession("host");
  fixture.agents = [
    makeAgent("Idle task"),
    makeAgent("Running task", {
      status: "running",
      turn: { phase: "open", turnId: null, startedAt: null, cancellationRequestId: null },
    }),
  ];
  mount();

  await page.getByTestId("ai-archive-manual-Idle task").click();
  expect(fixture.confirm).not.toHaveBeenCalled();
  expect(fixture.manualArchive).toHaveBeenCalledWith("Idle task");
  await expect.element(page.getByText("Archived manually", { exact: true })).toBeVisible();

  fixture.confirm.mockResolvedValueOnce(false);
  await page.getByTestId("ai-archive-manual-Running task").click();
  expect(fixture.confirm).toHaveBeenCalledTimes(1);
  expect(fixture.manualArchive).toHaveBeenCalledTimes(1);

  fixture.confirm.mockResolvedValueOnce(true);
  await page.getByTestId("ai-archive-manual-Running task").click();
  expect(fixture.manualArchive).toHaveBeenCalledWith("Running task");

  await page.getByTestId("ai-archive-open-Running task").click();
  expect(close).toHaveBeenCalledOnce();
  expect(fixture.navigate).toHaveBeenCalledWith({ serverId: "host", agentId: "Running task" });
});

it("keeps a stale or busy task open when the host refuses archive", async () => {
  fixture.apply.mockRejectedValue(new Error("Task changed since review; read it again"));
  mount();
  await page.getByTestId("ai-archive-auto").click();
  await expect.element(page.getByText("Task changed since review; read it again")).toBeVisible();
  expect(fixture.archived).not.toHaveBeenCalled();
  await expect.element(page.getByTestId("ai-archive-scan")).toBeEnabled();
});

it.each([
  ["offline", "Host is offline. Reconnect and check again."],
  ["old", "Update this host to use AI archive. Manual archive is still available."],
])(
  "explains an unavailable host (%s) without sending unsupported requests",
  async (kind, message) => {
    const isOnline = kind !== "offline";
    const isSupported = kind !== "old";
    fixture.connectionStatuses = { host: isOnline ? "online" : "offline" };
    fixture.sessions.host = makeSession("host", {
      connected: isOnline,
      supported: isSupported,
      modelConfigSupported: isSupported,
    });
    mount();
    await expect.element(page.getByTestId("ai-archive-host-alert")).toHaveTextContent(message);
    await expect.element(page.getByTestId("ai-archive-scan")).toBeDisabled();
    await expect.element(page.getByTestId("ai-archive-auto")).toBeDisabled();
    if (kind === "old") {
      await expect.element(page.getByTestId("ai-archive-manual-Completed work")).toBeEnabled();
    } else {
      await expect.element(page.getByTestId("ai-archive-manual-Completed work")).toBeDisabled();
    }
    expect(fixture.review).not.toHaveBeenCalled();
    expect(fixture.apply).not.toHaveBeenCalled();
  },
);

it("stops an in-flight batch without closing the sheet and halts when dismissed", async () => {
  let resolveFirst!: (review: AgentArchiveReview) => void;
  fixture.review.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolveFirst = done;
      }),
  );
  mount();
  await page.getByTestId("ai-archive-auto").click();
  await expect.element(page.getByText("Checking", { exact: true })).toBeVisible();
  await expect.element(page.getByTestId("ai-archive-auto")).toBeDisabled();
  await page.getByTestId("ai-archive-stop").click();
  expect(close).not.toHaveBeenCalled();
  await act(async () =>
    resolveFirst({
      agentId: "Completed work",
      eligible: true,
      token: "issued-token",
      reason: "Completed and verified.",
    }),
  );
  expect(fixture.apply).not.toHaveBeenCalled();
  expect(fixture.review).toHaveBeenCalledTimes(1);
  await expect.element(page.getByTestId("ai-archive-scan")).toBeEnabled();
});

it("configures a custom AI archive model inline for the selected host", async () => {
  mount();
  await page.getByTestId("ai-archive-model-toggle").click();
  await expect.element(page.getByTestId("ai-archive-model-card")).toBeVisible();
  await page.getByRole("button", { name: "Custom", exact: true }).click();
  await page.getByTestId("combined-model-selector").click();
  await page.getByText("Claude Haiku", { exact: true }).click();

  expect(fixture.patchConfig).toHaveBeenCalledWith("host", {
    metadataGeneration: {
      aiArchiveProviders: [{ provider: "claude", model: "claude-haiku-2026" }],
    },
  });
});
