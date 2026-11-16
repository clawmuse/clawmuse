import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { publishClawMuseStatusApiClient } from "../api-access";
import { getHostRuntimeStore } from "@/runtime/host-runtime";
import { useSessionStore } from "@/stores/session-store";
import { useGoalsStore } from "./store";

type SessionServerInfo = NonNullable<
  Parameters<ReturnType<typeof useSessionStore.getState>["updateSessionServerInfo"]>[1]
>;

afterEach(() => {
  publishClawMuseStatusApiClient(null);
  vi.restoreAllMocks();
  useSessionStore.getState().clearSession("srv-1");
  useSessionStore.getState().clearSession("srv-2");
  useGoalsStore.setState({
    filter: "all",
    repoKey: null,
    goals: [],
    repos: [],
    status: "idle",
    refreshing: false,
    error: null,
    unavailable: false,
    unavailableReason: null,
    detail: null,
    pendingActionGoalId: null,
  });
});

function makeServerInfo(localGoals?: boolean): SessionServerInfo {
  return {
    serverId: "srv-1",
    hostname: "mac.local",
    version: "1.5.10",
    capabilities: {} as SessionServerInfo["capabilities"],
    ...(localGoals !== undefined ? { features: { localGoals } } : {}),
  };
}

describe("useGoalsStore direct daemon aggregation", () => {
  it("defaults to the board filter ('all') and aggregates goals and repos across localGoals hosts", async () => {
    expect(useGoalsStore.getState().filter).toBe("all");

    const runtime = getHostRuntimeStore();
    vi.spyOn(runtime, "getHosts").mockReturnValue([
      { serverId: "srv-1", label: "MacBook Pro" } as never,
      { serverId: "srv-2", label: "Linux Box" } as never,
    ]);
    vi.spyOn(runtime, "getSnapshot").mockImplementation(
      (serverId) => ({ connectionStatus: "online", serverId }) as never,
    );

    const client1 = {
      listGoals: vi.fn(async () => ({
        requestId: "r1",
        goals: [
          {
            id: "g-1",
            serverId: "srv-1",
            repoKey: "remote:github.com/acme/shared",
            repoDisplayName: "acme/shared",
            title: "Goal on Mac",
            summary: "Summary 1",
            acceptance: "Checks pass",
            origin: "manual" as const,
            status: "running" as const,
            reviewReason: null,
            priority: 2,
            budgetRuns: 3,
            runsUsed: 1,
            expiresAt: null,
            decidedAt: 10,
            createdAt: 10,
            updatedAt: 20,
            hostId: "srv-1",
            hostDisplayName: "raw-mac",
            agent: "claude",
            latestReport: null,
            currentRun: null,
          },
        ],
        repos: [
          {
            repoKey: "remote:github.com/acme/shared",
            displayName: "acme/shared",
            planEnabled: false,
            lastPlannedAt: null,
            preferredHostId: "srv-1",
            planAgent: null,
            executeAgent: "claude",
            lastPlanRun: null,
            hosts: [
              {
                hostId: "srv-1",
                serverId: "srv-1",
                relayHostId: "relay-1",
                displayName: "raw-mac",
                connectivity: "live" as const,
              },
            ],
            suggestedCount: 0,
            activeCount: 1,
          },
        ],
      })),
      createGoal: vi.fn(async (input: { title: string; repoKey: string; summary: string }) => ({
        requestId: "r-create",
        goal: {
          id: "g-created",
          serverId: "srv-1",
          repoKey: input.repoKey,
          repoDisplayName: "acme/shared",
          title: input.title,
          summary: input.summary,
          acceptance: "Done",
          origin: "manual" as const,
          status: "running" as const,
          reviewReason: null,
          priority: 3,
          budgetRuns: 3,
          runsUsed: 1,
          expiresAt: null,
          decidedAt: 30,
          createdAt: 30,
          updatedAt: 30,
          hostId: "srv-1",
          hostDisplayName: "raw-mac",
          agent: null,
          latestReport: null,
          currentRun: null,
        },
      })),
    } as unknown as DaemonClient;

    const client2 = {
      listGoals: vi.fn(async () => ({
        requestId: "r2",
        goals: [],
        repos: [
          {
            repoKey: "remote:github.com/acme/shared",
            displayName: "acme/shared",
            planEnabled: true,
            lastPlannedAt: 100,
            preferredHostId: null,
            planAgent: null,
            executeAgent: null,
            lastPlanRun: null,
            hosts: [
              {
                hostId: "srv-2",
                serverId: "srv-2",
                relayHostId: "relay-2",
                displayName: "raw-linux",
                connectivity: "live" as const,
              },
            ],
            suggestedCount: 2,
            activeCount: 0,
          },
        ],
      })),
    } as unknown as DaemonClient;

    vi.spyOn(runtime, "getClient").mockImplementation((serverId) =>
      serverId === "srv-1" ? client1 : client2,
    );

    useSessionStore.getState().initializeSession("srv-1", client1, 1);
    useSessionStore.getState().updateSessionServerInfo("srv-1", makeServerInfo(true));
    useSessionStore.getState().initializeSession("srv-2", client2, 1);
    useSessionStore.getState().updateSessionServerInfo("srv-2", makeServerInfo(true));

    await useGoalsStore.getState().load();

    const state = useGoalsStore.getState();
    expect(state.unavailable).toBe(false);
    expect(state.goals).toHaveLength(1);
    expect(state.goals[0]?.hostDisplayName).toBe("MacBook Pro");
    expect(state.repos).toHaveLength(1);
    expect(state.repos[0]?.hosts.map((h) => h.displayName)).toEqual(["MacBook Pro", "Linux Box"]);
    expect(state.repos[0]?.suggestedCount).toBe(2);
    expect(state.repos[0]?.activeCount).toBe(1);

    const created = await useGoalsStore.getState().createGoal({
      repoKey: "remote:github.com/acme/shared",
      title: "Ship board",
      summary: "Connect direct RPCs",
      acceptance: "Board works",
      hostId: "srv-1",
    });
    expect(created.id).toBe("g-created");
    expect(useGoalsStore.getState().goals.map((g) => g.id)).toContain("g-created");
  });

  it("reports host_needs_update when online hosts predate localGoals support and Status is unconfigured", async () => {
    const runtime = getHostRuntimeStore();
    vi.spyOn(runtime, "getHosts").mockReturnValue([
      { serverId: "srv-1", label: "MacBook Pro" } as never,
    ]);
    vi.spyOn(runtime, "getSnapshot").mockReturnValue({
      connectionStatus: "online",
      serverId: "srv-1",
    } as never);
    const legacyClient = {} as unknown as DaemonClient;
    vi.spyOn(runtime, "getClient").mockReturnValue(legacyClient);
    useSessionStore.getState().initializeSession("srv-1", legacyClient, 1);
    useSessionStore.getState().updateSessionServerInfo("srv-1", makeServerInfo(false));

    await useGoalsStore.getState().load();

    expect(useGoalsStore.getState().unavailable).toBe(true);
    expect(useGoalsStore.getState().unavailableReason).toBe("host_needs_update");
  });
});
