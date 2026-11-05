import { describe, expect, it } from "vitest";

import type { AgentPermissionRequest } from "../agent/agent-sdk-types.js";
import {
  CLAWMUSE_STATUS_COMPLETED_DWELL_MS,
  CLAWMUSE_STATUS_FAILED_DWELL_MS,
  ClawMuseStatusProjection,
  type ClawMuseStatusAgentSnapshot,
} from "./projection.js";

const NOW = 1_760_000_000_000;
const AGENT_ID = "5f4d3c2b-1a09-4877-8665-544332211000";

function agent(overrides: Partial<ClawMuseStatusAgentSnapshot> = {}): ClawMuseStatusAgentSnapshot {
  return {
    id: AGENT_ID,
    lifecycle: "idle",
    attention: { requiresAttention: false },
    pendingPermissions: new Map(),
    activeTurnId: null,
    activeTurnStartedAt: null,
    lastUserMessageAt: null,
    updatedAt: new Date(NOW),
    ...overrides,
  };
}

const PERMISSION_REQUEST: AgentPermissionRequest = {
  id: "request-1",
  provider: "claude",
  name: "Bash",
  kind: "tool",
};

function projection(): ClawMuseStatusProjection {
  let counter = 0;
  return new ClawMuseStatusProjection({
    createEventId: () => `event-${(counter += 1)}`,
  });
}

describe("ClawMuseStatusProjection", () => {
  it("publishes a running turn as an opaque item with no workspace detail", () => {
    const result = projection().project(
      [
        agent({
          lifecycle: "running",
          activeTurnId: "turn-1",
          activeTurnStartedAt: new Date(NOW - 5_000),
        }),
      ],
      NOW,
    );

    expect(result).toEqual({
      items: [
        {
          itemId: AGENT_ID,
          eventId: "event-1",
          phase: "running",
          stateChangedAt: new Date(NOW - 5_000).toISOString(),
          observation: "live",
        },
      ],
      nextRefreshAtMs: null,
    });
  });

  it("reports a pending permission as needs_action even while the turn runs", () => {
    const attentionAt = new Date(NOW - 1_000);
    const result = projection().project(
      [
        agent({
          lifecycle: "running",
          activeTurnId: "turn-1",
          activeTurnStartedAt: new Date(NOW - 5_000),
          pendingPermissions: new Map([[PERMISSION_REQUEST.id, PERMISSION_REQUEST]]),
          attention: {
            requiresAttention: true,
            attentionReason: "permission",
            attentionTimestamp: attentionAt,
          },
        }),
      ],
      NOW,
    );

    expect(result.items).toEqual([
      {
        itemId: AGENT_ID,
        eventId: "event-1",
        phase: "needs_action",
        stateChangedAt: attentionAt.toISOString(),
        observation: "live",
      },
    ]);
  });

  it("does not repeat a permission notification when unrelated agent state changes", () => {
    const projected = projection();
    const pending = agent({
      pendingPermissions: new Map([[PERMISSION_REQUEST.id, PERMISSION_REQUEST]]),
    });
    const first = projected.project([pending], NOW);

    const updated = projected.project(
      [{ ...pending, updatedAt: new Date(NOW + 1_000) }],
      NOW + 1_000,
    );

    expect(updated.items).toEqual(first.items);
  });

  it("keeps the permission event when the client clears attention", () => {
    const projected = projection();
    const pending = agent({
      pendingPermissions: new Map([[PERMISSION_REQUEST.id, PERMISSION_REQUEST]]),
      attention: {
        requiresAttention: true,
        attentionReason: "permission",
        attentionTimestamp: new Date(NOW - 1_000),
      },
    });
    const first = projected.project([pending], NOW);

    const seen = projected.project(
      [{ ...pending, attention: { requiresAttention: false }, updatedAt: new Date(NOW + 1_000) }],
      NOW + 1_000,
    );

    expect(seen.items).toEqual(first.items);
  });

  it("creates a new permission event when the pending request changes", () => {
    const projected = projection();
    const pending = agent({
      pendingPermissions: new Map([[PERMISSION_REQUEST.id, PERMISSION_REQUEST]]),
    });
    const first = projected.project([pending], NOW);
    const nextRequest = { ...PERMISSION_REQUEST, id: "request-2" };

    const next = projected.project(
      [{ ...pending, pendingPermissions: new Map([[nextRequest.id, nextRequest]]) }],
      NOW,
    );

    expect(next.items[0]?.phase).toBe("needs_action");
    expect(next.items[0]?.eventId).not.toBe(first.items[0]?.eventId);
  });

  it("does not repeat the remaining permission alert when another request is resolved", () => {
    const projected = projection();
    const secondRequest = { ...PERMISSION_REQUEST, id: "request-2" };
    const pending = agent({
      pendingPermissions: new Map([
        [PERMISSION_REQUEST.id, PERMISSION_REQUEST],
        [secondRequest.id, secondRequest],
      ]),
    });
    const first = projected.project([pending], NOW);
    const remaining = projected.project(
      [
        {
          ...pending,
          pendingPermissions: new Map([[secondRequest.id, secondRequest]]),
          updatedAt: new Date(NOW + 1_000),
        },
      ],
      NOW + 1_000,
    );

    expect(remaining.items).toEqual(first.items);
    expect(projected.project([agent()], NOW + 2_000).items).toEqual([]);
    expect(projected.project([pending], NOW + 3_000).items[0]?.eventId).not.toBe(
      first.items[0]?.eventId,
    );
  });

  it("keeps an unseen completion for its dwell and asks to re-project when it expires", () => {
    const finishedAt = NOW - 1_000;
    const agents = [
      agent({
        attention: {
          requiresAttention: true,
          attentionReason: "finished",
          attentionTimestamp: new Date(finishedAt),
        },
      }),
    ];
    const projected = projection();

    const live = projected.project(agents, NOW);
    const expired = projected.project(agents, finishedAt + CLAWMUSE_STATUS_COMPLETED_DWELL_MS);

    expect(live.items.map((item) => item.phase)).toEqual(["completed"]);
    expect(live.nextRefreshAtMs).toBe(finishedAt + CLAWMUSE_STATUS_COMPLETED_DWELL_MS);
    expect(expired).toEqual({ items: [], nextRefreshAtMs: null });
  });

  it("dwells longer on a failure than on a completion", () => {
    const failedAt = NOW - 1_000;
    const result = projection().project(
      [
        agent({
          lifecycle: "error",
          attention: {
            requiresAttention: true,
            attentionReason: "error",
            attentionTimestamp: new Date(failedAt),
          },
        }),
      ],
      NOW,
    );

    expect(result.items.map((item) => item.phase)).toEqual(["failed"]);
    expect(result.nextRefreshAtMs).toBe(failedAt + CLAWMUSE_STATUS_FAILED_DWELL_MS);
    expect(CLAWMUSE_STATUS_FAILED_DWELL_MS).toBeGreaterThan(CLAWMUSE_STATUS_COMPLETED_DWELL_MS);
  });

  it("drops a completion the moment a focused client has seen it", () => {
    const finishedAt = NOW - 1_000;
    const agents = [
      agent({
        attention: {
          requiresAttention: true,
          attentionReason: "finished",
          attentionTimestamp: new Date(finishedAt),
        },
      }),
    ];
    const projected = projection();

    expect(projected.project(agents, NOW).items).toHaveLength(1);
    projected.markSeen(AGENT_ID, NOW);

    expect(projected.project(agents, NOW).items).toEqual([]);
  });

  it("treats a new user message as having seen the previous outcome", () => {
    const finishedAt = NOW - 2_000;
    const attention = {
      requiresAttention: true,
      attentionReason: "finished",
      attentionTimestamp: new Date(finishedAt),
    } as const;
    const projected = projection();

    projected.project([agent({ attention, lastUserMessageAt: new Date(NOW - 10_000) })], NOW);
    const afterPrompt = projected.project(
      [agent({ attention, lastUserMessageAt: new Date(NOW - 500) })],
      NOW,
    );

    expect(afterPrompt.items).toEqual([]);
  });

  it("keeps one event id per phase and mints a new one on a transition", () => {
    const running = agent({
      lifecycle: "running",
      activeTurnId: "turn-1",
      activeTurnStartedAt: new Date(NOW - 5_000),
    });
    const projected = projection();

    const first = projected.project([running], NOW);
    const retried = projected.project([running], NOW + 1_000);
    const finished = projected.project(
      [
        agent({
          attention: {
            requiresAttention: true,
            attentionReason: "finished",
            attentionTimestamp: new Date(NOW + 2_000),
          },
        }),
      ],
      NOW + 2_000,
    );

    expect(retried.items[0]).toEqual(first.items[0]);
    expect(finished.items[0]?.eventId).toBe("event-2");
    expect(finished.items[0]?.itemId).toBe(first.items[0]?.itemId);
  });

  it("has no item for an idle, internal, or closed agent", () => {
    const result = projection().project(
      [
        agent(),
        agent({ id: "internal", internal: true, lifecycle: "running", activeTurnId: "turn-1" }),
        agent({
          id: "closed",
          lifecycle: "closed",
          attention: {
            requiresAttention: true,
            attentionReason: "finished",
            attentionTimestamp: new Date(NOW),
          },
        }),
      ],
      NOW,
    );

    expect(result.items).toEqual([]);
  });
});
