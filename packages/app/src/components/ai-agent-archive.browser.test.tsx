import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { page } from "vitest/browser";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AggregatedAgent } from "@/hooks/use-aggregated-agents";
import type { AgentArchiveReview } from "@getpaseo/protocol/messages";
import { i18n } from "@/i18n/i18next";
import { AiAgentArchiveSheet } from "./ai-agent-archive";

// Inject the host boundary. Real controls, locale resources, pointer events and
// failure/retry rendering run in Chromium; these tests do not exercise a model.
const fixture = vi.hoisted(() => ({
  agents: [] as AggregatedAgent[],
  review: vi.fn<(id: string) => Promise<AgentArchiveReview>>(),
  apply: vi.fn<(id: string, token: string) => Promise<{ archivedAt: string }>>(),
  archived: vi.fn(),
  connected: true,
  supported: true,
}));
vi.mock("@/hooks/use-aggregated-agents", () => ({
  useAggregatedAgents: () => ({ agents: fixture.agents, isInitialLoad: false }),
}));
vi.mock("@/stores/session-store", () => ({
  useSessionStore: {
    getState: () => ({
      sessions: {
        host: {
          client: {
            isConnected: fixture.connected,
            reviewAgentArchive: fixture.review,
            applyAgentArchive: fixture.apply,
          },
          serverInfo: {
            features: { aiAgentArchive: fixture.supported },
            permissions: ["workspace.write"],
          },
        },
      },
    }),
  },
}));
vi.mock("@/hooks/use-archive-agent", () => ({ applyArchivedAgentCloseResults: fixture.archived }));

let root: Root;
let container: HTMLDivElement;
let client: QueryClient;
function agent(id: string): AggregatedAgent {
  return {
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
    requiresAttention: false,
    attentionReason: null,
    attentionTimestamp: null,
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
  fixture.agents = [agent("Completed work"), agent("Waiting for permission")];
  fixture.review.mockReset().mockImplementation(async (id) => ({
    agentId: id,
    eligible: id === "Completed work",
    token: id === "Completed work" ? "issued-token" : null,
    reason: id === "Completed work" ? "Implemented the change and all tests passed." : "permission",
  }));
  fixture.apply.mockReset().mockResolvedValue({ archivedAt: "2026-11-11T10:00:00Z" });
  fixture.archived.mockReset();
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

it("shows each decision and only archives reviewed completed agents on request", async () => {
  mount();
  await page.getByTestId("ai-archive-scan").click();
  await expect.element(page.getByText("Ready to archive", { exact: true })).toBeVisible();
  await expect.element(page.getByText("Waiting for permission.", { exact: true })).toBeVisible();
  expect(fixture.apply).not.toHaveBeenCalled();
  await page.screenshot({ path: "../../.vitest-screenshots/ai-archive-decisions.png" });
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
    };
  });
  mount();
  await page.getByTestId("ai-archive-auto").click();
  await expect.element(page.getByText("Archived", { exact: true })).toBeVisible();
  await expect.element(page.getByText("Model is unavailable. Check again.")).toBeVisible();
  expect(fixture.apply).toHaveBeenCalledTimes(1);
  await expect.element(page.getByTestId("ai-archive-scan")).toBeEnabled();
  await page.screenshot({ path: "../../.vitest-screenshots/ai-archive-partial-failure.png" });
  fixture.agents = [agent("Waiting for permission")];
  fixture.review.mockResolvedValue({
    agentId: "Waiting for permission",
    eligible: false,
    token: null,
    reason: "permission",
  });
  mount();
  await page.getByTestId("ai-archive-scan").click();
  await expect.element(page.getByText("Waiting for permission.", { exact: true })).toBeVisible();
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
  ["old", "Update this host to use AI archive."],
])(
  "explains an unavailable host (%s) without sending unsupported requests",
  async (kind, message) => {
    fixture.connected = kind !== "offline";
    fixture.supported = kind !== "old";
    mount();
    await page.getByTestId("ai-archive-scan").click();
    await expect.element(page.getByText(message).first()).toBeVisible();
    expect(fixture.review).not.toHaveBeenCalled();
    expect(fixture.apply).not.toHaveBeenCalled();
  },
);

it("stops the batch before archiving when dismissed during a pending review", async () => {
  let resolve!: (review: AgentArchiveReview) => void;
  fixture.review.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  mount();
  await page.getByTestId("ai-archive-auto").click();
  await expect.element(page.getByText("Checking", { exact: true })).toBeVisible();
  await expect.element(page.getByTestId("ai-archive-auto")).toBeDisabled();
  await page.getByTestId("ai-archive-stop").click();
  expect(close).toHaveBeenCalledOnce();
  await act(async () =>
    resolve({
      agentId: "Completed work",
      eligible: true,
      token: "issued-token",
      reason: "Completed and verified.",
    }),
  );
  expect(fixture.apply).not.toHaveBeenCalled();
  expect(fixture.review).toHaveBeenCalledTimes(1);
});
