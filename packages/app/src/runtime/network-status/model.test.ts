import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { watchNetworkRecovery, type NetworkStatus, type NetworkStatusSource } from "./model";

class FakeNetwork implements NetworkStatusSource {
  private listener: ((status: NetworkStatus) => void) | null = null;

  constructor(private status: NetworkStatus) {}

  subscribe(listener: (status: NetworkStatus) => void): () => void {
    this.listener = listener;
    listener(this.status);
    return () => {
      this.listener = null;
    };
  }

  report(status: NetworkStatus): void {
    this.status = status;
    this.listener?.(status);
  }
}

const wifi: NetworkStatus = { online: true, type: "wifi" };
const cellular: NetworkStatus = { online: true, type: "cellular" };
const offline: NetworkStatus = { online: false, type: "none" };

function watch(network: FakeNetwork) {
  const recoveries: NetworkStatus[] = [];
  const statuses: NetworkStatus[] = [];
  const stop = watchNetworkRecovery({
    source: network,
    onStatus: (status) => statuses.push(status),
    onRecover: (status) => recoveries.push(status),
  });
  return { recoveries, statuses, stop };
}

describe("watchNetworkRecovery", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("the initial status is reported but never treated as a recovery", async () => {
    const network = new FakeNetwork(wifi);
    const { recoveries, statuses } = watch(network);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(statuses).toEqual([wifi]);
    expect(recoveries).toEqual([]);
  });

  test("recovers once the network has been back for the debounce window", async () => {
    const network = new FakeNetwork(offline);
    const { recoveries } = watch(network);
    network.report(wifi);
    await vi.advanceTimersByTimeAsync(499);
    expect(recoveries).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(recoveries).toEqual([wifi]);
  });

  test("an interface switch while online is a recovery", async () => {
    const network = new FakeNetwork(wifi);
    const { recoveries } = watch(network);
    network.report(cellular);
    await vi.advanceTimersByTimeAsync(500);
    expect(recoveries).toEqual([cellular]);
  });

  test("flapping collapses into one recovery for the settled interface", async () => {
    const network = new FakeNetwork(wifi);
    const { recoveries } = watch(network);
    network.report(offline);
    network.report(cellular);
    await vi.advanceTimersByTimeAsync(200);
    network.report(offline);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(recoveries).toEqual([]);
    network.report(wifi);
    await vi.advanceTimersByTimeAsync(500);
    expect(recoveries).toEqual([wifi]);
  });

  test("an unchanged online report does not recover", async () => {
    const network = new FakeNetwork(wifi);
    const { recoveries } = watch(network);
    network.report(wifi);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(recoveries).toEqual([]);
  });

  test("stopping cancels a pending recovery", async () => {
    const network = new FakeNetwork(offline);
    const { recoveries, stop } = watch(network);
    network.report(wifi);
    stop();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(recoveries).toEqual([]);
  });
});
