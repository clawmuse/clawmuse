import { describe, expect, test, vi } from "vitest";
import pino from "pino";
import { generateKeyPair } from "@getpaseo/relay";
import { createRelayRuntime } from "./relay-runtime.js";
import { startRelayTransport, type RelayTransportController } from "./relay-transport.js";

describe("RelayRuntime", () => {
  test("starts and stops transport as enabled state changes", async () => {
    const stops: Array<ReturnType<typeof vi.fn>> = [];
    const starts: string[] = [];
    const startTransport: typeof startRelayTransport = (options) => {
      starts.push(options.relayEndpoint);
      const stop = vi.fn(async () => undefined);
      stops.push(stop);
      return { stop } satisfies RelayTransportController;
    };
    const runtime = createRelayRuntime({
      config: {
        enabled: false,
        endpoint: "relay.example.test:443",
        publicEndpoint: "relay.example.test:443",
        useTls: true,
        publicUseTls: true,
      },
      logger: pino({ level: "silent" }),
      attachSocket: async () => undefined,
      serverId: "relay-runtime-test",
      daemonKeyPair: generateKeyPair(),
      startTransport,
    });

    expect(starts).toEqual([]);
    runtime.setEnabled(true);
    runtime.setEnabled(true);
    expect(starts).toEqual(["relay.example.test:443"]);
    expect(runtime.getConfig().enabled).toBe(true);

    runtime.setEnabled(false);
    await vi.waitFor(() => expect(stops[0]).toHaveBeenCalledOnce());
    expect(runtime.getConfig().enabled).toBe(false);
  });

  test("keeps relay disabled when transport startup fails", () => {
    const runtime = createRelayRuntime({
      config: {
        enabled: false,
        endpoint: "invalid-endpoint",
        publicEndpoint: "invalid-endpoint",
        useTls: false,
        publicUseTls: false,
      },
      logger: pino({ level: "silent" }),
      attachSocket: async () => undefined,
      serverId: "relay-runtime-test",
      daemonKeyPair: generateKeyPair(),
      startTransport: () => {
        throw new Error("Invalid relay endpoint");
      },
    });

    expect(() => runtime.setEnabled(true)).toThrow("Invalid relay endpoint");
    expect(runtime.getConfig().enabled).toBe(false);
  });

  test("hot-reconfigures endpoints and drains the previous transport after grace period", async () => {
    vi.useFakeTimers();
    try {
      const stops: Array<ReturnType<typeof vi.fn>> = [];
      const starts: Array<{ endpoint: string; useTls: boolean }> = [];
      const startTransport: typeof startRelayTransport = (options) => {
        starts.push({ endpoint: options.relayEndpoint, useTls: options.relayUseTls });
        const stop = vi.fn(async () => undefined);
        stops.push(stop);
        return { stop } satisfies RelayTransportController;
      };
      const runtime = createRelayRuntime({
        config: {
          enabled: true,
          endpoint: "agent-relay.clawmuse.com:443",
          publicEndpoint: "agent-relay.ppb.cn:443",
          useTls: true,
          publicUseTls: true,
        },
        logger: pino({ level: "silent" }),
        attachSocket: async () => undefined,
        serverId: "relay-runtime-reconfigure",
        startTransport,
        reconfigureDrainMs: 1000,
      });

      expect(starts).toEqual([{ endpoint: "agent-relay.clawmuse.com:443", useTls: true }]);

      runtime.reconfigure({
        enabled: true,
        endpoint: "agent-relay-cn.ppb.cn:443",
        publicEndpoint: "agent-relay-cn.ppb.cn:443",
        useTls: true,
        publicUseTls: true,
      });

      expect(starts).toEqual([
        { endpoint: "agent-relay.clawmuse.com:443", useTls: true },
        { endpoint: "agent-relay-cn.ppb.cn:443", useTls: true },
      ]);
      expect(runtime.getConfig().endpoint).toBe("agent-relay-cn.ppb.cn:443");
      expect(runtime.getConfig().publicEndpoint).toBe("agent-relay-cn.ppb.cn:443");
      // Previous transport stays alive during the drain window for in-flight RPC responses.
      expect(stops[0]).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1000);
      expect(stops[0]).toHaveBeenCalledOnce();
      expect(stops[1]).not.toHaveBeenCalled();

      await runtime.stop();
      expect(stops[1]).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  test("preserves the active transport when reconfiguring to an invalid endpoint fails", async () => {
    const stops: Array<ReturnType<typeof vi.fn>> = [];
    const runtime = createRelayRuntime({
      config: {
        enabled: true,
        endpoint: "agent-relay.clawmuse.com:443",
        publicEndpoint: "agent-relay.ppb.cn:443",
        useTls: true,
        publicUseTls: true,
      },
      logger: pino({ level: "silent" }),
      attachSocket: async () => undefined,
      serverId: "relay-runtime-rollback",
      startTransport: (options) => {
        if (options.relayEndpoint === "broken-endpoint") {
          throw new Error("Invalid host:port");
        }
        const stop = vi.fn(async () => undefined);
        stops.push(stop);
        return { stop } satisfies RelayTransportController;
      },
      reconfigureDrainMs: 0,
    });

    expect(() =>
      runtime.reconfigure({
        enabled: true,
        endpoint: "broken-endpoint",
        publicEndpoint: "broken-endpoint",
        useTls: true,
        publicUseTls: true,
      }),
    ).toThrow("Invalid host:port");
    expect(runtime.getConfig().endpoint).toBe("agent-relay.clawmuse.com:443");
    expect(stops[0]).not.toHaveBeenCalled();
  });
});
