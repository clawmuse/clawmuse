import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { DaemonConnectionError } from "@getpaseo/client/internal/daemon-client";
import {
  PermissionResponseTimeoutError,
  submitPermissionResponse,
  type SubmitPermissionResponseInput,
} from "./permission-response";

class FakeHostLink {
  private reconnectWaiters: Array<() => void> = [];
  readonly answers: Array<Error | null> = [];
  attempts = 0;
  pending = true;
  waitingNotices = 0;

  input(deadlineMs = 60_000): SubmitPermissionResponseInput {
    return {
      respond: async () => {
        this.attempts += 1;
        const answer = this.answers.shift() ?? null;
        if (answer) throw answer;
      },
      waitForReconnect: (signal) =>
        new Promise((resolve, reject) => {
          this.reconnectWaiters.push(resolve);
          signal.addEventListener("abort", () => reject(signal.reason));
        }),
      isStillPending: () => this.pending,
      onWaitingForNetwork: () => {
        this.waitingNotices += 1;
      },
      deadlineMs,
    };
  }

  reconnect(): void {
    const waiters = this.reconnectWaiters;
    this.reconnectWaiters = [];
    for (const resolve of waiters) resolve();
  }
}

describe("submitPermissionResponse", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("retries a response lost to a dropped connection once the host is back", async () => {
    const link = new FakeHostLink();
    link.answers.push(new DaemonConnectionError("Connection lost", "DAEMON_CONNECTION_LOST"));

    const outcome = submitPermissionResponse(link.input());
    await vi.advanceTimersByTimeAsync(0);
    expect(link.waitingNotices).toBe(1);
    expect(link.attempts).toBe(1);

    link.reconnect();
    await expect(outcome).resolves.toBe("resolved");
    expect(link.attempts).toBe(2);
  });

  test("a request gone after reconnect counts as already resolved", async () => {
    const link = new FakeHostLink();
    link.answers.push(new Error("Timeout waiting for message (15000ms)"));

    const outcome = submitPermissionResponse(link.input());
    await vi.advanceTimersByTimeAsync(0);
    link.pending = false;
    link.reconnect();

    await expect(outcome).resolves.toBe("already_resolved");
    expect(link.attempts).toBe(1);
  });

  test("a provider refusal for a request that is no longer pending is success", async () => {
    const link = new FakeHostLink();
    link.answers.push(new Error("No pending permission request with id perm-1"));

    await expect(submitPermissionResponse(link.input())).resolves.toBe("already_resolved");
  });

  test("other daemon errors fail immediately", async () => {
    const link = new FakeHostLink();
    const refusal = new Error("Agent not found");
    link.answers.push(refusal);

    await expect(submitPermissionResponse(link.input())).rejects.toBe(refusal);
    expect(link.waitingNotices).toBe(0);
  });

  test("gives up when the host stays unreachable past the deadline", async () => {
    const link = new FakeHostLink();
    link.answers.push(new DaemonConnectionError("Connection lost", "DAEMON_CONNECTION_LOST"));

    const outcome = submitPermissionResponse(link.input(30_000));
    const assertion = expect(outcome).rejects.toBeInstanceOf(PermissionResponseTimeoutError);
    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
  });
});
