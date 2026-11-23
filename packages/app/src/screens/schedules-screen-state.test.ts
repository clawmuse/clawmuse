import { describe, expect, it } from "vitest";
import { resolveSchedulesScreenBodyState } from "./schedules-screen-state";

describe("resolveSchedulesScreenBodyState", () => {
  it("routes failed loading state to the retry UI instead of the spinner", () => {
    expect(
      resolveSchedulesScreenBodyState({
        loadState: { status: "loading" },
        showLoadError: true,
      }),
    ).toEqual({ kind: "load-error" });
  });

  it("routes offline connecting state to the offline notice instead of an infinite spinner", () => {
    expect(
      resolveSchedulesScreenBodyState({
        loadState: { status: "connecting" },
        showLoadError: false,
        isOffline: true,
      }),
    ).toEqual({ kind: "offline" });
  });

  it("routes empty loaded state with all hosts offline to the hosts-offline notice", () => {
    expect(
      resolveSchedulesScreenBodyState({
        loadState: { status: "loaded", data: [] },
        showLoadError: false,
        isOffline: false,
        allHostsOffline: true,
      }),
    ).toEqual({ kind: "hosts-offline" });
  });

  it("keeps existing loaded schedules visible even when the device goes offline", () => {
    expect(
      resolveSchedulesScreenBodyState({
        loadState: { status: "loaded", data: [{} as never] },
        showLoadError: false,
        isOffline: true,
      }),
    ).toEqual({ kind: "content" });
  });
});
