import { describe, expect, it } from "vitest";
import { shouldResetRemoteLiveActivity } from "./activity-recovery";

const BASE = {
  usesLocalActivity: false,
  installationId: "installation-1",
  liveActivityCount: 0,
  reportedForInstallationId: null,
};

describe("shouldResetRemoteLiveActivity", () => {
  it("reports the absence once per installation", () => {
    expect(shouldResetRemoteLiveActivity(BASE)).toBe(true);
    expect(
      shouldResetRemoteLiveActivity({ ...BASE, reportedForInstallationId: "installation-1" }),
    ).toBe(false);
    expect(
      shouldResetRemoteLiveActivity({ ...BASE, reportedForInstallationId: "installation-0" }),
    ).toBe(true);
  });

  it("stays quiet while an activity exists", () => {
    expect(shouldResetRemoteLiveActivity({ ...BASE, liveActivityCount: 1 })).toBe(false);
  });

  it("does not reset a remote card while its update token is still pending", () => {
    expect(
      shouldResetRemoteLiveActivity({
        ...BASE,
        liveActivityId: "remote-activity-1",
        liveActivityCount: 0,
      }),
    ).toBe(false);
  });

  it("stays quiet without an installation or when the capsule is local", () => {
    expect(shouldResetRemoteLiveActivity({ ...BASE, installationId: null })).toBe(false);
    expect(shouldResetRemoteLiveActivity({ ...BASE, usesLocalActivity: true })).toBe(false);
  });
});
