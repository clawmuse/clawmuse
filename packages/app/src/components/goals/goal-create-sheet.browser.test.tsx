import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { page } from "vitest/browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGoalsStore } from "@/clawmuse-status/goals/store";
import type { GoalDetail, GoalRepo } from "@/clawmuse-status/goals/types";
import { GoalCreateSheet } from "./goal-create-sheet";
import { ClawMuseStatusApiClient } from "@/clawmuse-status/api";
import { publishClawMuseStatusApiClient } from "@/clawmuse-status/api-access";
import { TaskBoard } from "./task-board";
import { TaskReviewForm } from "./task-review-form";
import { GoalDetailSheet } from "./goal-detail-sheet";

// The shared Unistyles test adapter has no runtime breakpoint. Bridge this one
// hook to the real RN Web window dimensions so viewport changes exercise layout.
vi.mock("@/constants/layout", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/constants/layout")>();
  const { useWindowDimensions } = await import("react-native");
  return { ...actual, useIsCompactFormFactor: () => useWindowDimensions().width < 600 };
});

// Platform toast adapter is unrelated to the form. The controls and editor run in Chromium.
vi.mock("@/components/toast-host", () => ({
  useToastHost: () => ({ toasts: [], dismiss() {} }),
  useToast: () => ({ show() {}, error() {}, success() {} }),
  ToastViewport: () => null,
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Vite's test runtime lacks Reanimated's native/Metro prop updater. Keep the
// real controls and input events; animation interpolation is outside this test.
vi.mock("react-native-reanimated", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-native-reanimated")>();
  return {
    ...actual,
    useAnimatedStyle: () => ({}),
    useDerivedValue: (updater: () => unknown) => ({ value: updater() }),
    withTiming: (value: unknown) => value,
  };
});

const repo: GoalRepo = {
  repoKey: "remote:example.invalid/demo",
  displayName: "Demo repository",
  planEnabled: false,
  lastPlannedAt: null,
  preferredHostId: null,
  planAgent: null,
  executeAgent: null,
  lastPlanRun: null,
  hosts: [],
  suggestedCount: 0,
  activeCount: 0,
};
let root: Root | null = null;
let container: HTMLDivElement | null = null;
const originalCreate = useGoalsStore.getState().createGoal;
const originalLoad = useGoalsStore.getState().load;
const originalOpenDetail = useGoalsStore.getState().openDetail;
const originalAct = useGoalsStore.getState().act;
beforeEach(async () => {
  await page.viewport(1280, 1000);
});
afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  publishClawMuseStatusApiClient(null);
  vi.restoreAllMocks();
  useGoalsStore.setState({
    createGoal: originalCreate,
    load: originalLoad,
    openDetail: originalOpenDetail,
  });
  useGoalsStore.setState({ detail: null, act: originalAct });
});

function mount(onClose: () => void, parentGoal?: GoalDetail) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() =>
    root?.render(
      <QueryClientProvider client={new QueryClient()}>
        <GoalCreateSheet
          visible
          onClose={onClose}
          repos={[repo]}
          initialRepoKey={null}
          parentGoal={parentGoal}
        />
      </QueryClientProvider>,
    ),
  );
}

function reviewGoal(): GoalDetail {
  return {
    id: "goal",
    repoKey: repo.repoKey,
    repoDisplayName: repo.displayName,
    title: "Ready for review",
    summary: "Repository changes",
    acceptance: "Owner reviews checks",
    origin: "manual",
    status: "needs_review",
    reviewReason: "completed",
    priority: 3,
    budgetRuns: 3,
    runsUsed: 3,
    expiresAt: null,
    decidedAt: null,
    createdAt: 1,
    updatedAt: 2,
    hostId: null,
    hostDisplayName: null,
    agent: null,
    latestReport: null,
    currentRun: null,
    runs: [],
    reports: [
      {
        id: "report",
        runId: "run",
        seq: 1,
        kind: "done",
        message: "node --test: 2 passed",
        prUrl: null,
        createdAt: 2,
        evidence: {
          revision: "commit:abc123",
          checks: [{ name: "Integration check", result: "passed" }],
          artifacts: [],
        },
      },
    ],
  };
}

describe("goal start form in Chromium", () => {
  it("groups work across hosts on desktop and stacks the same board on a phone", async () => {
    const base = reviewGoal();
    const tasks: GoalDetail[] = [
      { ...base, id: "suggested", title: "Proposed work", status: "suggested" },
      {
        ...base,
        id: "active",
        title: "Implement release",
        status: "accepted",
        parentGoalTitle: "Release",
        currentRun: {
          id: "run",
          kind: "execute",
          status: "running",
          hostId: "host-b",
          hostDisplayName: "Linux builder",
          agent: null,
          pinned: true,
          agentRef: null,
          relayHostId: null,
          instruction: null,
          outcome: null,
          createdAt: 1,
          startedAt: 1,
          finishedAt: null,
        },
      },
      { ...base, id: "review", title: "Review checks" },
      { ...base, id: "done", title: "Accepted work", status: "done" },
    ];
    const open = vi.fn();
    await page.viewport(1440, 1000);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root?.render(<TaskBoard goals={tasks} onPress={open} />));
    await expect
      .element(page.getByTestId("task-column-active").getByText("Implement release"))
      .toBeVisible();
    await expect.element(page.getByText("Linux builder", { exact: false })).toBeVisible();
    await page.getByTestId("goal-row-active").click();
    expect(open).toHaveBeenCalledWith(tasks[1]);
    await page.screenshot({ path: "../../../.vitest-screenshots/task-board-desktop.png" });
    await page.viewport(390, 844);
    await expect
      .poll(
        () => getComputedStyle(document.querySelector('[data-testid="task-board"]')!).flexDirection,
      )
      .toBe("column");
    await expect.element(page.getByTestId("goal-row-review")).toBeVisible();
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390);
    await page.screenshot({ path: "../../../.vitest-screenshots/task-board-phone.png" });
  });

  it("renders the result evidence without raw native text and requires an explicit acceptance action", async () => {
    const errors = vi.spyOn(console, "error");
    const goal = reviewGoal();
    useGoalsStore.setState({ detail: { goalId: goal.id, status: "loaded", goal, error: null } });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const onClose = vi.fn();
    act(() =>
      root?.render(
        <QueryClientProvider client={new QueryClient()}>
          <GoalDetailSheet visible onClose={onClose} />
        </QueryClientProvider>,
      ),
    );
    await expect.element(page.getByText("node --test: 2 passed")).toBeVisible();
    await expect.element(page.getByText("Evidence for commit:abc123")).toBeVisible();
    await expect.element(page.getByText("Integration check", { exact: false })).toBeVisible();
    await expect.element(page.getByTestId("goal-action-approve")).toBeVisible();
    expect(useGoalsStore.getState().detail?.goal?.status).toBe("needs_review");
    expect(errors.mock.calls.flat().map(String).join(" ")).not.toMatch(
      /Unexpected text node|Text strings must be rendered/,
    );
    errors.mockRestore();
    const resume = vi.fn(async () => null);
    act(() =>
      useGoalsStore.setState({
        act: resume,
        detail: {
          goalId: goal.id,
          status: "loaded",
          goal: { ...goal, executionUnconfirmed: true, reviewReason: "blocked" },
          error: null,
        },
      }),
    );
    await page.getByTestId("goal-action-continue").click();
    await expect.element(page.getByTestId("goal-continue-submit")).toBeDisabled();
    expect(resume).not.toHaveBeenCalled();
    await page.getByTestId("goal-confirm-execution-stopped").click();
    await expect.element(page.getByTestId("goal-continue-submit")).toBeEnabled();
    await page.getByTestId("goal-continue-submit").click();
    expect(resume).toHaveBeenCalledWith(
      goal.id,
      "continue",
      expect.objectContaining({ confirmExecutionStopped: true }),
    );
  });
  it("requires acceptance, keeps failed input editable and retries the same request identity", async () => {
    await page.viewport(1280, 1000);
    const closed = vi.fn();
    const create = vi
      .fn()
      .mockRejectedValueOnce(new Error("Host unavailable; retry after reconnection"))
      .mockResolvedValueOnce({ id: "created" });
    useGoalsStore.setState({ createGoal: create });
    mount(closed);
    await page.getByTestId("goal-create-title").fill("Implement sum");
    await page
      .getByTestId("goal-create-summary")
      .fill("Edit this repository and verify the result");
    await expect.element(page.getByTestId("goal-create-submit")).toBeDisabled();
    await page
      .getByTestId("goal-create-acceptance")
      .fill("npm test passes and the owner reviews the files");
    await page.getByTestId("goal-create-submit").click();
    await expect
      .element(page.getByText("Host unavailable; retry after reconnection"))
      .toBeInViewport();
    expect(closed).not.toHaveBeenCalled();
    await expect
      .element(page.getByTestId("goal-create-summary"))
      .toHaveValue("Edit this repository and verify the result");
    await page.screenshot({ path: "../../../.vitest-screenshots/goal-create-failure.png" });
    await page.getByTestId("goal-create-submit").click();
    await expect.poll(() => closed.mock.calls.length).toBe(1);
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0]![0].requestId).toBe(create.mock.calls[1]![0].requestId);
    expect(create.mock.calls[0]![0]).toMatchObject({
      repoKey: repo.repoKey,
      acceptance: "npm test passes and the owner reviews the files",
      budgetRuns: 3,
    });
  });
  it("keeps a child task linked to its parent after a failed create and successful retry", async () => {
    const closed = vi.fn();
    const create = vi
      .fn()
      .mockRejectedValueOnce(new Error("Project host offline"))
      .mockResolvedValueOnce({ id: "child" });
    useGoalsStore.setState({ createGoal: create });
    mount(closed, {
      ...reviewGoal(),
      id: "parent",
      title: "Release project",
      repoKey: repo.repoKey,
    });
    await page.getByTestId("goal-create-draft").click();
    await page.getByTestId("goal-create-title").fill("Verify release");
    await page.getByTestId("goal-create-summary").fill("Check the release build");
    await page.getByTestId("goal-create-acceptance").fill("Release checks pass");
    await page.getByTestId("goal-create-submit").click();
    await expect.element(page.getByText("Project host offline")).toBeVisible();
    expect(closed).not.toHaveBeenCalled();
    await page.getByTestId("goal-create-submit").click();
    await expect.poll(() => closed.mock.calls.length).toBe(1);
    expect(create.mock.calls[1]![0]).toMatchObject({
      parentGoalId: "parent",
      start: false,
      repoKey: repo.repoKey,
    });
  });

  it("keeps evidence editable on failure and submits verified checks without accepting the task", async () => {
    // Isolate the service boundary; real browser controls drive the complete mutation state.
    const api = new ClawMuseStatusApiClient("https://status.example");
    const submit = vi
      .spyOn(api, "submitTaskReview")
      .mockRejectedValueOnce(new Error("Run changed; inspect the current result"));
    const approve = vi.spyOn(api, "approveGoal");
    publishClawMuseStatusApiClient(api);
    const load = vi.fn(async () => {});
    const openDetail = vi.fn(async () => {});
    useGoalsStore.setState({ load, openDetail });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() =>
      root?.render(
        <QueryClientProvider client={new QueryClient()}>
          <TaskReviewForm goalId="task" runId="run" />
        </QueryClientProvider>,
      ),
    );
    await expect.element(page.getByTestId("task-review-submit")).toBeDisabled();
    await page.getByTestId("task-review-revision").fill("commit:abc123");
    await page.getByTestId("task-review-checks").fill("Integration tests passed");
    await page.getByTestId("task-review-message").fill("I checked the current commit");
    await page.getByTestId("task-review-submit").click();
    await expect.element(page.getByText("Run changed; inspect the current result")).toBeVisible();
    await expect.element(page.getByTestId("task-review-revision")).toHaveValue("commit:abc123");
    submit.mockImplementationOnce(async () => {
      throw new Error("Host offline; retry later");
    });
    await page.getByTestId("task-review-submit").click();
    await expect.element(page.getByText("Host offline; retry later")).toBeVisible();
    expect(submit).toHaveBeenLastCalledWith("task", {
      runId: "run",
      message: "I checked the current commit",
      evidence: {
        revision: "commit:abc123",
        checks: [{ name: "Integration tests passed", result: "passed" }],
        artifacts: [],
      },
    });
    expect(approve).not.toHaveBeenCalled();
    expect(openDetail).not.toHaveBeenCalled();
    await page.screenshot({ path: "../../../.vitest-screenshots/task-review-failure.png" });
    submit.mockResolvedValueOnce(reviewGoal());
    await page.getByTestId("task-review-submit").click();
    await expect.poll(() => load.mock.calls.length).toBe(1);
    expect(openDetail).toHaveBeenCalledWith("task");
    expect(approve).not.toHaveBeenCalled();
    await expect
      .element(page.getByText("Evidence saved. Review the result before accepting."))
      .toBeVisible();
  });
});
