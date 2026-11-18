import {
  negotiateProviderCapabilities,
  requireProviderCapabilities,
  type ProviderCatalog,
  type ProviderConnection,
  type ProviderEvent,
  type ProviderInput,
  type ProviderLaunch,
  type ProviderRegistration,
  type ProviderSessionSummary,
} from "@getpaseo/plugin/server/provider";
import { createStatusProbe, getCatalog, launchCacheKey } from "./internal/catalog.js";
import { DriverProcess } from "./internal/process.js";
import { Session } from "./internal/session.js";
import { CredentialMonitor } from "./internal/credentials.js";
import {
  acpInitializeResultSchema,
  acpSessionListResultSchema,
  AntigravityError,
  isMethodNotFoundError,
} from "./internal/wire.js";
import type { Usage } from "./usage.js";

const capabilities = [
  "prompt.message",
  "prompt.command",
  "prompt.image",
  "session.can_stop_runtime",
  "session.configure",
  "session.list",
  "session.persistence",
  "session.subsession",
  "permission",
] as const;

export interface AntigravityProviderOptions {
  now?: () => number;
  statusCacheTtlMs?: number;
}

function isUsageInstance(value: unknown): value is Usage {
  return Boolean(value && typeof value === "object" && "rememberLaunch" in value);
}

export function createAntigravityProvider(
  usageOrOptions?: Usage | AntigravityProviderOptions,
  credentials = new CredentialMonitor(),
  maybeOptions?: AntigravityProviderOptions,
): ProviderRegistration {
  const usage = isUsageInstance(usageOrOptions) ? usageOrOptions : undefined;
  const options = isUsageInstance(usageOrOptions) ? (maybeOptions ?? {}) : (usageOrOptions ?? {});
  const statusProbe = createStatusProbe({
    now: options.now,
    ttlMs: options.statusCacheTtlMs,
  });

  return {
    id: "antigravity",
    label: "Antigravity",
    icon: "icon.svg",
    command: ["agy"],
    description: "Antigravity CLI on your host",
    async status({ launch }) {
      if (!launch)
        return {
          available: false,
          diagnostic: "agy not found on PATH. Install Antigravity, then run `agy` and sign in.",
        };
      usage?.rememberLaunch(launch);
      return statusProbe.getStatus(launch);
    },
    async getCatalogCacheKey({ launch }) {
      if (!launch) return undefined;
      const credential = await credentials.read(launch.env);
      return launchCacheKey(launch, credential);
    },
    async connect(request) {
      if (!request.versions.includes(1))
        throw new AntigravityError(
          "Provider protocol version 1 is required",
          "UNSUPPORTED_VERSION",
        );
      if (!request.launch)
        throw new AntigravityError(
          "The daemon must supply the Antigravity launch",
          "MISSING_LAUNCH",
        );
      const launch = request.launch;
      usage?.rememberLaunch(launch);
      const negotiated = negotiateProviderCapabilities(request.capabilities, capabilities);
      return createConnection(launch, negotiated, credentials, usage, () =>
        statusProbe.invalidate(launch),
      );
    },
  };
}

function createConnection(
  launch: ProviderLaunch,
  negotiated: readonly string[],
  credentials: CredentialMonitor,
  usage?: Usage,
  onInvalidateStatus?: () => void,
): ProviderConnection {
  const sessions = new Map<string, Session>();
  const sessionQueues = new Map<string, Promise<void>>();
  const activeOpens = new Map<string, Promise<void>>();
  const inFlight = new Set<Promise<void>>();
  const listeners = new Set<(event: ProviderEvent) => void>();
  let discovered: ProviderCatalog | null = null;
  let catalogPromise: Promise<ProviderCatalog> | null = null;
  let catalogStale = false;
  let closed = false;

  function emit(event: ProviderEvent): void {
    if (closed) return;
    for (const listener of listeners) listener(event);
  }
  function catalog(): ProviderCatalog {
    if (discovered === null)
      throw new AntigravityError("Antigravity catalog has not been discovered", "MISSING_CATALOG");
    return discovered;
  }
  async function ensureCatalog(cwd?: string, forceRefresh = false): Promise<ProviderCatalog> {
    if (!forceRefresh && !catalogStale && discovered !== null) return discovered;
    if (!forceRefresh && catalogPromise) return catalogPromise;
    const request = getCatalog(launch, cwd).then((next) => {
      discovered = next;
      catalogStale = false;
      return next;
    });
    catalogPromise = request;
    try {
      return await request;
    } finally {
      if (catalogPromise === request) catalogPromise = null;
    }
  }
  async function resolveSession(id: string, waitForOpen = true): Promise<Session> {
    if (waitForOpen) {
      const pendingOpen = activeOpens.get(id);
      if (pendingOpen) await pendingOpen;
    }
    const existing = sessions.get(id);
    if (!existing)
      throw new AntigravityError(`Unknown Antigravity session: ${id}`, "UNKNOWN_SESSION");
    return existing;
  }
  async function openSession(
    input: Extract<ProviderInput, { type: "session.open" }>,
  ): Promise<void> {
    if (sessions.has(input.sessionId))
      throw new AntigravityError(`Session already exists: ${input.sessionId}`, "DUPLICATE_SESSION");
    await ensureCatalog(input.config.cwd);
    if (sessions.has(input.sessionId))
      throw new AntigravityError(`Session already exists: ${input.sessionId}`, "DUPLICATE_SESSION");
    let opened: Session;
    const credentialWatch = credentials.watch({ ...launch.env, ...input.config.env }, (state) => {
      // Stop the observed old owner immediately, even while open/configure is awaiting an RPC.
      // Only starting the replacement belongs in the session lane; a later read cannot undo this change.
      const retirement = opened.invalidateCredentials(state);
      void retirement.catch(() => {});
      enqueueSessionTask(input.sessionId, async () => {
        await retirement;
      });
      catalogStale = true;
      onInvalidateStatus?.();
    });
    try {
      opened = new Session({
        id: input.sessionId,
        config: input.config,
        persistence: input.persistence,
        history: input.history,
        catalog,
        launch,
        emit,
        usage,
        credentials: credentialWatch,
        refreshCatalog: () => ensureCatalog(input.config.cwd),
      });
    } catch (error) {
      credentialWatch.dispose();
      throw error;
    }
    sessions.set(input.sessionId, opened);
    try {
      await opened.open(input.requestId, negotiated);
    } catch (error) {
      sessions.delete(input.sessionId);
      await opened.close();
      throw error;
    }
  }
  async function dispatch(input: ProviderInput): Promise<void> {
    switch (input.type) {
      case "catalog":
        emit({
          type: "catalog",
          requestId: input.requestId,
          catalog: await ensureCatalog(input.cwd, true),
        });
        return;
      case "sessions":
        emit({
          type: "sessions",
          requestId: input.requestId,
          sessions: await listAntigravitySessions(launch, input),
        });
        return;
      case "session.can_stop_runtime":
        emit({
          type: "session.can_stop_runtime",
          requestId: input.requestId,
          sessionId: input.sessionId,
          canStop: (await resolveSession(input.sessionId)).canStopRuntime(),
        });
        return;
      case "session.open":
        await openSession(input);
        return;
      case "session.prompt": {
        const target = await resolveSession(input.sessionId, false);
        await target.prompt(input.prompt);
        return;
      }
      case "session.permission":
        (await resolveSession(input.sessionId)).respondToPermission(
          input.permissionId,
          input.response,
        );
        return;
      case "session.configure":
        await (await resolveSession(input.sessionId, false)).configure(input.changes);
        break;
      case "session.interrupt":
        await (await resolveSession(input.sessionId)).interrupt();
        break;
      case "session.close": {
        const target = await resolveSession(input.sessionId);
        sessions.delete(input.sessionId);
        sessionQueues.delete(input.sessionId);
        await target.close();
        emit({ type: "session.closed", sessionId: input.sessionId });
        break;
      }
      default:
        throw new AntigravityError(
          `Unsupported Antigravity operation: ${input.type}`,
          "UNSUPPORTED_OPERATION",
        );
    }
    emit({ type: "request.completed", requestId: input.requestId });
  }
  function failed(input: ProviderInput, error: unknown): void {
    if (error instanceof AntigravityError) onInvalidateStatus?.();
    const message = error instanceof Error ? error.message : String(error);
    const code = error instanceof AntigravityError ? error.code : "ANTIGRAVITY_ERROR";
    if (input.type === "session.prompt")
      emit({
        type: "session.prompt_result",
        sessionId: input.sessionId,
        clientMessageId: input.prompt.clientMessageId,
        result: { type: "failed", error: { message, code } },
      });
    else if ("requestId" in input)
      emit({ type: "request.failed", requestId: input.requestId, error: { message, code } });
  }
  function trackTask(task: Promise<void>): void {
    inFlight.add(task);
    void task.finally(() => {
      inFlight.delete(task);
    });
  }
  function enqueueSessionTask(id: string, action: () => Promise<void>): void {
    const previous = sessionQueues.get(id) ?? Promise.resolve();
    const next = previous
      .then(async () => {
        if (!closed) await action();
        return undefined;
      })
      .catch(() => {
        if (!closed)
          emit({
            type: "session.runtime_failed",
            sessionId: id,
            error: {
              code: "CREDENTIAL_SYNC_FAILED",
              message:
                "Could not reload Antigravity after an account change. Reload the agent to retry.",
            },
          });
      });
    sessionQueues.set(id, next);
    trackTask(
      next.finally(() => {
        if (sessionQueues.get(id) === next) sessionQueues.delete(id);
      }),
    );
  }
  function scheduleInput(input: ProviderInput): void {
    const serializedForSession =
      input.type === "session.open" ||
      input.type === "session.configure" ||
      input.type === "session.prompt";
    if (!serializedForSession) {
      trackTask(
        Promise.resolve()
          .then(async () => {
            if (!closed) await dispatch(input);
            return undefined;
          })
          .catch((error) => failed(input, error)),
      );
      return;
    }
    const previous = sessionQueues.get(input.sessionId) ?? Promise.resolve();
    const next = previous
      .then(async () => {
        if (!closed) await dispatch(input);
        return undefined;
      })
      .catch((error) => failed(input, error));
    if (input.type === "session.open" && !sessions.has(input.sessionId)) {
      activeOpens.set(input.sessionId, next);
      void next.finally(() => {
        if (activeOpens.get(input.sessionId) === next) {
          activeOpens.delete(input.sessionId);
        }
      });
    }
    sessionQueues.set(input.sessionId, next);
    trackTask(
      next.finally(() => {
        if (sessionQueues.get(input.sessionId) === next) {
          sessionQueues.delete(input.sessionId);
        }
      }),
    );
  }
  return {
    version: 1,
    capabilities: negotiated,
    async send(input) {
      if (closed) throw new AntigravityError("Antigravity connection is closed", "CLOSED");
      requireProviderCapabilities(negotiated, input);
      scheduleInput(input);
    },
    onEvent(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async close() {
      if (closed) return;
      closed = true;
      await Promise.allSettled(inFlight);
      await Promise.all([...sessions.values()].map((opened) => opened.close()));
      sessions.clear();
      sessionQueues.clear();
      listeners.clear();
    },
  };
}

async function listAntigravitySessions(
  launch: ProviderLaunch,
  input: Extract<ProviderInput, { type: "sessions" }>,
): Promise<ProviderSessionSummary[]> {
  const cwd = input.cwd || process.cwd();
  const driver = new DriverProcess(
    { launch, cwd },
    {
      onNotification: () => {},
      onRequest: (id) => driver.respondError(id, -32601, "Unsupported client method"),
      onExit: () => {},
    },
  );
  try {
    await driver.requestInit(
      "initialize",
      {
        protocolVersion: 1,
        clientCapabilities: {},
        clientInfo: { name: "paseo", version: "1.0.0" },
      },
      acpInitializeResultSchema,
    );
    const result = await driver.requestInit(
      "session/list",
      input.cwd ? { cwd: input.cwd } : {},
      acpSessionListResultSchema,
    );
    const query = input.query?.trim().toLowerCase();
    const filtered = result.sessions.filter((entry) => {
      if (entry.title?.trim() === "<chat-history-summary>") return false;
      if (input.cwd && entry.cwd && entry.cwd !== input.cwd) return false;
      if (!query) return true;
      return (
        entry.sessionId.toLowerCase().includes(query) ||
        entry.cwd.toLowerCase().includes(query) ||
        Boolean(entry.title?.toLowerCase().includes(query))
      );
    });
    const limited =
      input.limit !== undefined && input.limit >= 0 ? filtered.slice(0, input.limit) : filtered;
    return limited.map((entry) => {
      const summary: ProviderSessionSummary = {
        persistence: { version: 1, data: { conversationId: entry.sessionId } },
        cwd: entry.cwd || cwd,
      };
      if (entry.title) summary.title = entry.title;
      if (entry.updatedAt) summary.updatedAt = entry.updatedAt;
      return summary;
    });
  } catch (error) {
    if (isMethodNotFoundError(error)) return [];
    throw error;
  } finally {
    await driver.stop();
  }
}
