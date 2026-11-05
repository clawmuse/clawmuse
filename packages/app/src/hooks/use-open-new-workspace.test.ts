import { describe, expect, it } from "vitest";
import { resolveNewWorkspaceHost } from "./use-open-new-workspace";

describe("resolveNewWorkspaceHost", () => {
  it("starts on the active workspace's host when no host is pinned", () => {
    expect(resolveNewWorkspaceHost({ activeServerId: "host-a", hostFilters: [] })).toEqual({
      serverId: "host-a",
      keepActiveWorkspace: true,
    });
  });

  it("starts on the pinned host when the active workspace lives elsewhere", () => {
    expect(resolveNewWorkspaceHost({ activeServerId: "host-a", hostFilters: ["host-b"] })).toEqual({
      serverId: "host-b",
      keepActiveWorkspace: false,
    });
  });

  it("starts on the pinned host when nothing is active", () => {
    expect(resolveNewWorkspaceHost({ activeServerId: null, hostFilters: ["host-b"] })).toEqual({
      serverId: "host-b",
      keepActiveWorkspace: false,
    });
  });

  it("keeps the active workspace's project when it is on the pinned host", () => {
    expect(resolveNewWorkspaceHost({ activeServerId: "host-b", hostFilters: ["host-b"] })).toEqual({
      serverId: "host-b",
      keepActiveWorkspace: true,
    });
  });

  it("does not pick between several pinned hosts", () => {
    expect(
      resolveNewWorkspaceHost({ activeServerId: "host-a", hostFilters: ["host-b", "host-c"] }),
    ).toEqual({ serverId: "host-a", keepActiveWorkspace: true });
  });
});
