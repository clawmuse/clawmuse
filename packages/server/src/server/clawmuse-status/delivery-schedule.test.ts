import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ClawMuseStatusDeliverySchedule } from "./delivery-schedule.js";

interface ScheduleCounts {
  heartbeats: number;
  retries: number;
  refreshes: number;
}

interface ScheduleHarness {
  schedule: ClawMuseStatusDeliverySchedule;
  counts: ScheduleCounts;
  stop: () => void;
}

function harness(): ScheduleHarness {
  const counts: ScheduleCounts = { heartbeats: 0, retries: 0, refreshes: 0 };
  let running = true;
  const schedule = new ClawMuseStatusDeliverySchedule({
    shouldRun: () => running,
    onHeartbeat: () => {
      counts.heartbeats += 1;
    },
    onRetry: () => {
      counts.retries += 1;
    },
    onProjectionRefresh: () => {
      counts.refreshes += 1;
    },
  });
  return {
    schedule,
    counts,
    stop: () => {
      running = false;
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ClawMuseStatusDeliverySchedule", () => {
  it("runs the heartbeat the service asked for and never faster than a second", () => {
    const state = harness();

    state.schedule.scheduleHeartbeat(20_000);
    vi.advanceTimersByTime(19_999);
    expect(state.counts.heartbeats).toBe(0);
    vi.advanceTimersByTime(1);
    expect(state.counts.heartbeats).toBe(1);

    state.schedule.scheduleHeartbeat(5);
    vi.advanceTimersByTime(999);
    expect(state.counts.heartbeats).toBe(1);
    vi.advanceTimersByTime(1);
    expect(state.counts.heartbeats).toBe(2);
  });

  it("backs off exponentially and collapses concurrent retry requests", () => {
    const state = harness();

    state.schedule.scheduleRetry();
    state.schedule.scheduleRetry();
    vi.advanceTimersByTime(1_000);
    expect(state.counts.retries).toBe(1);

    state.schedule.scheduleRetry();
    vi.advanceTimersByTime(1_999);
    expect(state.counts.retries).toBe(1);
    vi.advanceTimersByTime(1);
    expect(state.counts.retries).toBe(2);
  });

  it("returns to the first delay once a request succeeds", () => {
    const state = harness();

    state.schedule.scheduleRetry();
    vi.advanceTimersByTime(1_000);
    state.schedule.scheduleRetry();
    vi.advanceTimersByTime(2_000);
    state.schedule.resetRetry();

    state.schedule.scheduleRetry();
    vi.advanceTimersByTime(1_000);
    expect(state.counts.retries).toBe(3);
  });

  it("wakes up when the next unseen item expires and ignores a past deadline", () => {
    const state = harness();

    state.schedule.armProjectionRefresh(5_000, 0);
    vi.advanceTimersByTime(5_001);
    expect(state.counts.refreshes).toBe(1);

    state.schedule.armProjectionRefresh(null, 5_001);
    vi.advanceTimersByTime(60_000);
    expect(state.counts.refreshes).toBe(1);
  });

  it("schedules nothing once the publisher has stopped", () => {
    const state = harness();
    state.stop();

    state.schedule.scheduleHeartbeat(1_000);
    state.schedule.scheduleRetry();
    state.schedule.armProjectionRefresh(1_000, 0);
    vi.advanceTimersByTime(60_000);

    expect(state.counts).toEqual({ heartbeats: 0, retries: 0, refreshes: 0 });
    expect(state.schedule.retryScheduled).toBe(false);
  });

  it("clears every armed timer", () => {
    const state = harness();

    state.schedule.scheduleHeartbeat(1_000);
    state.schedule.scheduleRetry();
    state.schedule.armProjectionRefresh(1_000, 0);
    state.schedule.clearAll();
    vi.advanceTimersByTime(60_000);

    expect(state.counts).toEqual({ heartbeats: 0, retries: 0, refreshes: 0 });
  });
});
