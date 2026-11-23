import { describe, expect, it } from "vitest";
import {
  arrangeHostOrder,
  compareDefaultHosts,
  mergeAccountHostOrder,
  orderHosts,
} from "./host-order";

describe("host-order", () => {
  const local = { serverId: "srv_local", label: "Mac Studio" };
  const gd32 = { serverId: "srv_gd32", label: "GD32" };
  const sg = { serverId: "srv_sg", label: "SG" };
  const us = { serverId: "srv_us", label: "US" };

  it("orders unarranged hosts deterministically with local host first on desktop", () => {
    const desktopA = orderHosts([us, sg, local, gd32], {
      hostOrder: [],
      localServerId: local.serverId,
    });
    const desktopB = orderHosts([gd32, local, us, sg], {
      hostOrder: [],
      localServerId: local.serverId,
    });
    expect(desktopA.map((host) => host.serverId)).toEqual([
      "srv_local",
      "srv_gd32",
      "srv_sg",
      "srv_us",
    ]);
    expect(desktopB).toEqual(desktopA);

    const phone = orderHosts([us, sg, local, gd32], {
      hostOrder: [],
      localServerId: null,
    });
    expect(phone.map((host) => host.serverId)).toEqual([
      "srv_gd32",
      "srv_local",
      "srv_sg",
      "srv_us",
    ]);
  });

  it("uses serverId as deterministic tie-breaker for identical labels", () => {
    expect(
      compareDefaultHosts(
        { serverId: "srv_b", label: "Worker" },
        { serverId: "srv_a", label: "Worker" },
        null,
      ),
    ).toBeGreaterThan(0);
  });

  it("allows dragging another host ahead of local host and respects the arranged position", () => {
    const firstDrag = arrangeHostOrder([], {
      moved: "srv_gd32",
      after: ["srv_gd32", "srv_local", "srv_sg", "srv_us"],
    });
    expect(firstDrag).toEqual(["srv_gd32", "srv_local", "srv_sg", "srv_us"]);

    const desktopOrdered = orderHosts([local, gd32, sg, us], {
      hostOrder: firstDrag,
      localServerId: local.serverId,
    });
    const phoneOrdered = orderHosts([us, sg, gd32, local], {
      hostOrder: firstDrag,
      localServerId: null,
    });
    expect(desktopOrdered.map((host) => host.serverId)).toEqual(firstDrag);
    expect(phoneOrdered.map((host) => host.serverId)).toEqual(firstDrag);
  });

  it("still pins an unarranged local daemon first when remote hosts were arranged before it existed", () => {
    const ordered = orderHosts([gd32, sg, local], {
      hostOrder: ["srv_sg", "srv_gd32"],
      localServerId: local.serverId,
    });
    expect(ordered.map((host) => host.serverId)).toEqual(["srv_local", "srv_sg", "srv_gd32"]);
  });

  it("preserves hidden host slots when visible hosts are reordered", () => {
    const next = arrangeHostOrder(["srv_local", "srv_hidden", "srv_gd32", "srv_sg"], {
      moved: "srv_sg",
      after: ["srv_sg", "srv_local", "srv_gd32"],
    });
    expect(next).toEqual(["srv_sg", "srv_local", "srv_hidden", "srv_gd32"]);
  });

  it("merges synced account host order while retaining non-account hosts in place", () => {
    const merged = mergeAccountHostOrder(["srv_manual", "srv_local", "srv_gd32", "srv_cloud"], {
      accountServerIds: ["srv_local", "srv_gd32", "srv_sg"],
      orderedAccountServerIds: ["srv_gd32", "srv_local"],
    });
    expect(merged).toEqual(["srv_manual", "srv_gd32", "srv_local", "srv_cloud"]);

    const unchanged = mergeAccountHostOrder(["srv_manual", "srv_local"], {
      accountServerIds: ["srv_local", "srv_gd32"],
      orderedAccountServerIds: [],
    });
    expect(unchanged).toEqual(["srv_manual", "srv_local"]);
  });
});
