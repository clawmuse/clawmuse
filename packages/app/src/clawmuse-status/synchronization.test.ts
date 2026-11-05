import { describe, expect, it, vi } from "vitest";
import {
  enrollClawMuseStatusHosts,
  enrollClawMuseStatusSession,
  synchronizeClawMuseStatus,
} from "./synchronization";

describe("first Status session activation", () => {
  it("does not expose a client to Goals until enrollment credentials have persisted", async () => {
    let finish!: () => void;
    const enrollment = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const publish = vi.fn();
    const getInstallationId = vi.fn(async () => "installation");
    const pending = enrollClawMuseStatusSession({
      enroll: () => enrollment,
      getInstallationId,
      publish,
    });
    expect(publish).not.toHaveBeenCalled();
    expect(getInstallationId).not.toHaveBeenCalled();
    finish();
    expect(await pending).toBe("installation");
    expect(publish).toHaveBeenCalledOnce();
  });
  it("leaves failed or incomplete enrollment unpublished so retry can recover", async () => {
    const publish = vi.fn();
    await expect(
      enrollClawMuseStatusSession({
        enroll: async () => {
          throw new Error("offline");
        },
        getInstallationId: async () => null,
        publish,
      }),
    ).rejects.toThrow("offline");
    await expect(
      enrollClawMuseStatusSession({
        enroll: async () => {},
        getInstallationId: async () => null,
        publish,
      }),
    ).rejects.toThrow("did not create a session");
    expect(publish).not.toHaveBeenCalled();
  });
});

describe("enrollClawMuseStatusHosts", () => {
  it("keeps going after a failing host and reports the first error", async () => {
    const failure = new Error("first");
    const outcome = await enrollClawMuseStatusHosts({
      candidates: ["a", "b", "c"],
      enroll: async (candidate) => {
        if (candidate === "a") {
          throw failure;
        }
        if (candidate === "b") {
          throw new Error("second");
        }
        return true;
      },
    });
    expect(outcome).toEqual({ enrolled: true, error: failure });
  });

  it("omits the error key when every host succeeded", async () => {
    expect(
      await enrollClawMuseStatusHosts({ candidates: ["a"], enroll: async () => false }),
    ).toEqual({ enrolled: false });
  });
});

describe("synchronizeClawMuseStatus", () => {
  it("re-registers endpoints after a new binding", async () => {
    const registerEndpoints = vi.fn(async () => {});
    const afterEnrollment = vi.fn(async () => {});
    await synchronizeClawMuseStatus({
      registerEndpoints,
      enrollConnectedHosts: async () => ({ enrolled: true }),
      afterEnrollment,
    });
    expect(registerEndpoints).toHaveBeenCalledTimes(2);
    expect(afterEnrollment).toHaveBeenCalledTimes(1);
  });

  it("registers once when nothing bound", async () => {
    const registerEndpoints = vi.fn(async () => {});
    await synchronizeClawMuseStatus({
      registerEndpoints,
      enrollConnectedHosts: async () => ({ enrolled: false }),
    });
    expect(registerEndpoints).toHaveBeenCalledTimes(1);
  });

  it("rethrows the enrollment error after finishing the pass", async () => {
    const registerEndpoints = vi.fn(async () => {});
    const failure = new Error("enroll failed");
    await expect(
      synchronizeClawMuseStatus({
        registerEndpoints,
        enrollConnectedHosts: async () => ({ enrolled: true, error: failure }),
      }),
    ).rejects.toBe(failure);
    expect(registerEndpoints).toHaveBeenCalledTimes(2);
  });
});
