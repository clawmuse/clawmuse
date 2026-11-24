import type pino from "pino";
import type { ExternalSocketMetadata } from "./websocket-server.js";
import {
  startRelayTransport,
  type RelaySocketLike,
  type RelayTransportController,
} from "./relay-transport.js";

export interface RelayRuntimeConfig {
  enabled: boolean;
  endpoint: string;
  publicEndpoint: string;
  useTls: boolean;
  publicUseTls: boolean;
}

interface RelayRuntimeOptions {
  config: RelayRuntimeConfig;
  logger: pino.Logger;
  attachSocket(ws: RelaySocketLike, metadata?: ExternalSocketMetadata): Promise<void>;
  serverId: string;
  startTransport?: typeof startRelayTransport;
  /**
   * Grace period before stopping the previous transport after switching relay
   * endpoints. Gives a remote caller connected through the old relay time to
   * receive the config update response before its socket closes.
   */
  reconfigureDrainMs?: number;
}

export interface RelayRuntime {
  getConfig(): RelayRuntimeConfig;
  setEnabled(enabled: boolean): void;
  reconfigure(next: RelayRuntimeConfig): void;
  stop(): Promise<void>;
}

const DEFAULT_RECONFIGURE_DRAIN_MS = 1500;

export function createRelayRuntime(options: RelayRuntimeOptions): RelayRuntime {
  const startTransport = options.startTransport ?? startRelayTransport;
  const reconfigureDrainMs = options.reconfigureDrainMs ?? DEFAULT_RECONFIGURE_DRAIN_MS;
  let config = options.config;
  let transport: RelayTransportController | null = null;
  const drainingTransports = new Map<RelayTransportController, ReturnType<typeof setTimeout>>();

  function stopControllerQuietly(controller: RelayTransportController): void {
    void controller.stop().catch((error) => {
      options.logger.warn({ err: error }, "Failed to stop relay transport");
    });
  }

  function flushDrainingTransports(): Promise<void[]> {
    const entries = Array.from(drainingTransports.entries());
    drainingTransports.clear();
    return Promise.all(
      entries.map(([controller, timer]) => {
        clearTimeout(timer);
        return controller.stop().catch((error) => {
          options.logger.warn({ err: error }, "Failed to stop draining relay transport");
        });
      }),
    );
  }

  function drainPreviousTransport(previous: RelayTransportController): void {
    // Only keep one previous transport draining at a time so rapid switches never leak sockets.
    void flushDrainingTransports();
    if (reconfigureDrainMs <= 0) {
      stopControllerQuietly(previous);
      return;
    }
    const timer = setTimeout(() => {
      drainingTransports.delete(previous);
      stopControllerQuietly(previous);
    }, reconfigureDrainMs);
    timer.unref?.();
    drainingTransports.set(previous, timer);
  }

  function startWith(target: RelayRuntimeConfig): RelayTransportController {
    return startTransport({
      logger: options.logger,
      attachSocket: options.attachSocket,
      relayEndpoint: target.endpoint,
      relayUseTls: target.useTls,
      serverId: options.serverId,
    });
  }

  function start(): void {
    if (transport) return;
    transport = startWith(config);
  }

  function setEnabled(enabled: boolean): void {
    if (config.enabled === enabled) return;
    reconfigure({ ...config, enabled });
  }

  function reconfigure(next: RelayRuntimeConfig): void {
    const endpointChanged = config.endpoint !== next.endpoint || config.useTls !== next.useTls;
    const enabledChanged = config.enabled !== next.enabled;
    const publicChanged =
      config.publicEndpoint !== next.publicEndpoint || config.publicUseTls !== next.publicUseTls;

    if (!endpointChanged && !enabledChanged && !publicChanged) return;

    if (!next.enabled) {
      config = next;
      const current = transport;
      transport = null;
      if (current) stopControllerQuietly(current);
      void flushDrainingTransports();
      return;
    }

    if (!transport || endpointChanged) {
      // Start the new transport first so invalid endpoints fail before dropping the active one.
      const nextTransport = startWith(next);
      const previous = transport;
      transport = nextTransport;
      config = next;
      if (previous) {
        drainPreviousTransport(previous);
      }
      return;
    }

    config = next;
  }

  async function stop(): Promise<void> {
    const current = transport;
    transport = null;
    await Promise.all([current?.stop(), flushDrainingTransports()]);
  }

  if (config.enabled) start();

  return {
    getConfig: () => config,
    setEnabled,
    reconfigure,
    stop,
  };
}
