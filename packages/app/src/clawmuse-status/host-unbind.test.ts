import { describe, expect, it, vi } from "vitest";
import type { ClawMuseStatusHostUnbindIntent } from "./host-unbind-intents";
import { processClawMuseStatusHostUnbinds } from "./host-unbind";

const BASE_URL = "https://status.example.com";

function intent(
  overrides: Partial<ClawMuseStatusHostUnbindIntent>,
): ClawMuseStatusHostUnbindIntent {
  return {
    baseUrl: BASE_URL,
    installationId: "installation-1",
    serverId: "server-1",
    relayHostId: "AbCdEfGhIjKlMnOp",
    ready: true,
    ...overrides,
  };
}

describe("processClawMuseStatusHostUnbinds", () => {
  it("unbinds a host that is gone from the registry", async () => {
    const unbindHost = vi.fn(async () => 1);
    const removeIntent = vi.fn(async () => {});
    await processClawMuseStatusHostUnbinds({
      baseUrl: BASE_URL,
      installationId: "installation-1",
      currentServerIds: new Set(),
      unbindHost,
      loadIntents: async () => [intent({})],
      removeIntent,
    });
    expect(unbindHost).toHaveBeenCalledWith("AbCdEfGhIjKlMnOp", "server-1");
    expect(removeIntent).toHaveBeenCalledTimes(1);
  });

  it("drops a ready intent for a host the user kept", async () => {
    const unbindHost = vi.fn(async () => 1);
    const removeIntent = vi.fn(async () => {});
    await processClawMuseStatusHostUnbinds({
      baseUrl: BASE_URL,
      installationId: "installation-1",
      currentServerIds: new Set(["server-1"]),
      unbindHost,
      loadIntents: async () => [intent({})],
      removeIntent,
    });
    expect(unbindHost).not.toHaveBeenCalled();
    expect(removeIntent).toHaveBeenCalledTimes(1);
  });

  it("leaves an in-flight removal alone while the host is still listed", async () => {
    const removeIntent = vi.fn(async () => {});
    await processClawMuseStatusHostUnbinds({
      baseUrl: BASE_URL,
      installationId: "installation-1",
      currentServerIds: new Set(["server-1"]),
      unbindHost: async () => 1,
      loadIntents: async () => [intent({ ready: false })],
      removeIntent,
    });
    expect(removeIntent).not.toHaveBeenCalled();
  });

  it("ignores intents from another installation or another status service", async () => {
    const unbindHost = vi.fn(async () => 1);
    await processClawMuseStatusHostUnbinds({
      baseUrl: BASE_URL,
      installationId: "installation-2",
      currentServerIds: new Set(),
      unbindHost,
      loadIntents: async () => [
        intent({}),
        intent({ baseUrl: "https://other.example.com", installationId: "installation-2" }),
      ],
      removeIntent: async () => {},
    });
    expect(unbindHost).not.toHaveBeenCalled();
  });

  it("does nothing before an installation exists", async () => {
    const loadIntents = vi.fn(async () => [intent({})]);
    const unbindHost = vi.fn(async () => 1);
    await processClawMuseStatusHostUnbinds({
      baseUrl: BASE_URL,
      installationId: null,
      currentServerIds: new Set(),
      unbindHost,
      loadIntents,
      removeIntent: async () => {},
    });
    expect(unbindHost).not.toHaveBeenCalled();
  });
});
