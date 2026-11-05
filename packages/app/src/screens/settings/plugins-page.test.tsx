import { router } from "expo-router";
import { buildPluginSettingsRoute } from "@/plugins/settings/routes";
import { subscriptionFixture } from "@/runtime/subscription-fixture";
/**
 * @vitest-environment jsdom
 */
import { i18n as testI18n } from "@/i18n/i18next";
import React, { type ReactElement } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { PluginListItem, PluginLogEntry } from "@getpaseo/protocol/messages";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HostPluginsPage } from "./plugins-page";
import { toDaemonServerInfo, useSessionStore } from "@/stores/session-store";
import { MutableDaemonConfigSchema } from "@getpaseo/protocol/messages";
import { AgentUsageStrip } from "@/usage/agent-usage-strip";
import { daemonConfigQueryKey } from "@/data/daemon-config";

void testI18n;

const runtime = vi.hoisted(() => ({
  connected: true,
  supported: true,
  logsSupported: true,
  client: null as DaemonClient | null,
}));

const usage = vi.hoisted(() => ({
  render: vi.fn(() => ({ kind: "ready", reports: [] })),
}));

vi.mock("@/usage/queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/usage/queries")>()),
  useAgentUsageStrip: usage.render,
}));

vi.mock("@/runtime/host-runtime", () => ({
  useHostRuntimeClient: () => runtime.client,
  useHostRuntimeIsConnected: () => runtime.connected,
}));

vi.mock("@/runtime/host-features", () => ({
  useHostFeature: (_serverId: string, feature: string) => {
    if (feature === "pluginLogs") return runtime.logsSupported;
    return runtime.supported;
  },
}));

// Plugin execution pulls in native runtimes; this suite exercises management RPCs.
vi.mock("@/plugins/registry", () => ({
  pluginRegistry: { getEvaluationError: () => undefined },
  useInstalledPlugin: () => undefined,
  useInstalledPlugins: () => [],
}));

vi.mock("@/components/adaptive-modal-sheet", async () => {
  const ReactModule = await vi.importActual<typeof import("react")>("react");
  const actual = await vi.importActual<typeof import("@/components/adaptive-modal-sheet")>(
    "@/components/adaptive-modal-sheet",
  );
  return {
    ...actual,
    AdaptiveModalSheet: ({
      header,
      children,
      onClose,
    }: {
      header: { title: string; actions?: React.ReactNode };
      children: React.ReactNode;
      onClose(): void;
    }) =>
      ReactModule.createElement(
        "div",
        { role: "dialog" },
        ReactModule.createElement("h2", null, header.title),
        header.actions,
        ReactModule.createElement("button", { type: "button", onClick: onClose }, "Close"),
        children,
      ),
  };
});

vi.mock("react-native-reanimated", () => ({
  default: { View: "div" },
  FadeIn: {
    duration() {
      return this;
    },
  },
  FadeOut: {
    duration() {
      return this;
    },
  },
  Keyframe: class {
    duration() {
      return this;
    }
  },
  Easing: { ease: "ease", inOut: (value: unknown) => value },
  interpolateColor: (value: number, _input: number[], output: string[]) =>
    value >= 1 ? output[1] : output[0],
  useAnimatedStyle: (factory: () => unknown) => factory(),
  useDerivedValue: (factory: () => unknown) => ({ value: factory() }),
  withTiming: (value: unknown) => value,
}));

vi.mock("@gorhom/bottom-sheet", async () => {
  const ReactModule = await vi.importActual<typeof import("react")>("react");
  const { ScrollView, TextInput } =
    await vi.importActual<typeof import("react-native")>("react-native");
  return {
    BottomSheetBackdrop: () => null,
    BottomSheetHandle: () => null,
    BottomSheetModal: ReactModule.forwardRef(() => null),
    BottomSheetScrollView: ScrollView,
    BottomSheetTextInput: TextInput,
    useBottomSheetInternal: () => null,
  };
});

vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

function plugin(enabled = true): PluginListItem {
  return {
    id: "example",
    description: "Reviews changes before merge",
    path: "/plugins/example",
    enabled,
    status: enabled ? "running" : "disabled",
  };
}

async function selectPluginAction(action: string): Promise<void> {
  fireEvent.click(await screen.findByRole("button", { name: "Actions for example" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: action }));
}

function createClient() {
  const config = MutableDaemonConfigSchema.parse({
    mcp: { injectIntoAgents: false },
    pluginsEnabled: true,
  });
  return {
    observeEvents: () =>
      subscriptionFixture(
        Promise.resolve({ events: ["status.plugin_catalog_changed"] }),
        () => () => {},
      ),
    getDaemonConfig: vi.fn(async () => ({ config })),
    patchDaemonConfig: vi.fn(async () => ({ config: { pluginsEnabled: true } })),
    listPlugins: vi.fn(async (): Promise<PluginListItem[]> => []),
    installPluginSource: vi.fn(async () => plugin()),
    reloadPlugin: vi.fn(async () => plugin()),
    enablePlugin: vi.fn(async () => plugin()),
    disablePlugin: vi.fn(async () => plugin(false)),
    removePlugin: vi.fn(async () => undefined),
    getPluginLogs: vi.fn(async (): Promise<PluginLogEntry[]> => []),
  };
}

type PluginClient = ReturnType<typeof createClient>;

function renderPage(client: PluginClient | null): void {
  runtime.client = client as unknown as DaemonClient | null;
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const element: ReactElement = (
    <QueryClientProvider client={queryClient}>
      <HostPluginsPage serverId="host-a" />
    </QueryClientProvider>
  );
  render(element);
}

describe("HostPluginsPage", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    runtime.connected = true;
    runtime.supported = true;
    runtime.logsSupported = true;
    runtime.client = null;
    usage.render.mockClear();
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
  });

  afterEach(() => {
    cleanup();
    useSessionStore.getState().clearSession("host-a");
    vi.unstubAllGlobals();
  });

  it("unmounts quota display and its usage query when the official plugin is disabled", async () => {
    const client = createClient();
    const config = (await client.getDaemonConfig()).config;
    const disabled = {
      ...config,
      plugins: { "usage-display": { source: "directory" as const, path: "/host", enabled: false } },
    };
    client.getDaemonConfig.mockResolvedValue({ config: disabled });
    runtime.client = client as unknown as DaemonClient;
    const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={cache}>
        <AgentUsageStrip serverId="host-a" agentId="agent-a" totalCostUsd={1} />
      </QueryClientProvider>,
    );
    await waitFor(() =>
      expect(cache.getQueryData(daemonConfigQueryKey("host-a"))).toEqual(disabled),
    );
    expect(screen.queryByTestId("agent-usage-strip")).toBeNull();
    expect(usage.render).not.toHaveBeenCalled();

    act(() => cache.setQueryData(daemonConfigQueryKey("host-a"), config));
    expect(await screen.findByTestId("agent-usage-strip")).toBeDefined();
    expect(usage.render).toHaveBeenCalled();

    act(() => cache.setQueryData(daemonConfigQueryKey("host-a"), disabled));
    await waitFor(() => expect(screen.queryByTestId("agent-usage-strip")).toBeNull());
  });

  it("honors the plugin global switch on the first-release host without a legacy feature flag", async () => {
    runtime.supported = false;
    const client = createClient();
    const config = { ...(await client.getDaemonConfig()).config, pluginsEnabled: false };
    client.getDaemonConfig.mockResolvedValue({ config });
    runtime.client = client as unknown as DaemonClient;
    const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={cache}>
        <AgentUsageStrip serverId="host-a" agentId="agent-a" totalCostUsd={1} />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(cache.getQueryData(daemonConfigQueryKey("host-a"))).toEqual(config));
    expect(screen.queryByTestId("agent-usage-strip")).toBeNull();
    expect(usage.render).not.toHaveBeenCalled();
  });

  it.each([{ permissions: [] }, { permissions: ["daemon.read", "workspace.write"] }] as const)(
    "explains missing management authority ($permissions) without loading or exposing plugin controls",
    ({ permissions }) => {
      const client = createClient();
      useSessionStore.getState().initializeSession("host-a", client as unknown as DaemonClient);
      useSessionStore.getState().updateSessionServerInfo(
        "host-a",
        toDaemonServerInfo({
          status: "server_info",
          serverId: "host-a",
          hostname: null,
          version: null,
          permissions: [...permissions],
        }),
      );
      renderPage(client);

      expect(screen.getByRole("alert").textContent).toContain(
        "Plugin management requires permission",
      );
      expect(screen.getByRole("alert").textContent).toContain("management access");
      expect(screen.queryByRole("switch")).toBeNull();
      expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
      expect(screen.queryByRole("textbox")).toBeNull();
      expect(client.listPlugins).not.toHaveBeenCalled();
      expect(client.getDaemonConfig).not.toHaveBeenCalled();
    },
  );

  it("restores plugin management when the connection gains management authority", async () => {
    const client = createClient();
    const store = useSessionStore.getState();
    store.initializeSession("host-a", client as unknown as DaemonClient);
    const info = {
      status: "server_info",
      serverId: "host-a",
      hostname: null,
      version: null,
    } as const;
    store.updateSessionServerInfo("host-a", toDaemonServerInfo({ ...info, permissions: [] }));
    renderPage(client);
    expect(client.listPlugins).not.toHaveBeenCalled();

    act(() => {
      store.updateSessionServerInfo(
        "host-a",
        toDaemonServerInfo({ ...info, permissions: ["daemon.read", "daemon.manage"] }),
      );
    });

    expect(await screen.findByText("No plugins configured")).toBeDefined();
    expect(client.listPlugins).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("switch", { name: "Enable plugins" })).toBeDefined();
    fireEvent.click(screen.getByRole("switch", { name: "Enable plugins" }));
    await waitFor(() =>
      expect(client.patchDaemonConfig).toHaveBeenCalledWith({ pluginsEnabled: false }),
    );

    act(() => {
      store.updateSessionServerInfo("host-a", toDaemonServerInfo({ ...info, permissions: [] }));
    });
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain(
      "Plugin management requires permission",
    );
  });

  it("renders the offline state", () => {
    runtime.connected = false;
    renderPage(null);

    expect(screen.getByRole("alert").textContent).toContain("Plugin host is offline");
  });

  it("keeps plugin management available on older hosts that omit session permissions", async () => {
    const client = createClient();
    const store = useSessionStore.getState();
    store.initializeSession("host-a", client as unknown as DaemonClient);
    store.updateSessionServerInfo(
      "host-a",
      toDaemonServerInfo({
        status: "server_info",
        serverId: "host-a",
        hostname: null,
        version: null,
      }),
    );
    renderPage(client);

    expect(await screen.findByText("No plugins configured")).toBeDefined();
    expect(screen.getByRole("switch", { name: "Enable plugins" })).toBeDefined();
    expect(client.listPlugins).toHaveBeenCalledTimes(1);
  });

  it("renders a catalog error and retries through the real query", async () => {
    const client = createClient();
    client.listPlugins.mockRejectedValueOnce(new Error("catalog exploded"));
    renderPage(client);

    expect(await screen.findByText("Unable to load plugins")).toBeDefined();
    expect(screen.getByText("catalog exploded")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(client.listPlugins).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("No plugins configured")).toBeDefined();
  });

  it.each([
    ["reloadPlugin", "Reload"],
    ["removePlugin", "Remove"],
  ] as const)("runs %s from the plugin actions menu", async (method, action) => {
    const client = createClient();
    client.listPlugins.mockResolvedValue([plugin()]);
    renderPage(client);

    await selectPluginAction(action);

    await waitFor(() => expect(client[method]).toHaveBeenCalledTimes(1));
  });

  it("shows bundled plugins as official, disabled, and without a remove action", async () => {
    const client = createClient();
    client.listPlugins.mockResolvedValue([
      { ...plugin(false), name: "Conversation translation", bundled: true },
    ]);
    renderPage(client);
    expect(await screen.findByText("Conversation translation")).toBeDefined();
    expect(screen.getByText("Official · included with ClawMuse")).toBeDefined();
    expect(
      screen.getByRole("switch", { name: "example: Enable" }).getAttribute("aria-checked"),
    ).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Actions for example" }));
    expect(screen.queryByRole("menuitem", { name: "Remove" })).toBeNull();
  });

  it("opens configuration directly and after enabling a setup plugin", async () => {
    const client = createClient();
    const configured = { ...plugin(), setupScreen: "translation" };
    client.listPlugins.mockResolvedValue([configured]);
    client.enablePlugin.mockResolvedValue(configured);
    renderPage(client);
    const configure = await screen.findByRole("button", { name: "Configure" });
    expect(screen.getByRole("button", { name: "Actions for example" }).textContent).toBe("Manage");
    fireEvent.click(configure);
    expect(router.push).toHaveBeenCalledWith(
      buildPluginSettingsRoute("host-a", "example", "translation"),
    );
    cleanup();
    vi.mocked(router.push).mockClear();
    client.listPlugins.mockResolvedValue([{ ...configured, ...plugin(false) }]);
    renderPage(client);
    fireEvent.click(await screen.findByRole("switch", { name: "example: Enable" }));
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith(
        buildPluginSettingsRoute("host-a", "example", "translation"),
      ),
    );
  });

  it("opens the setup screen after installing a plugin", async () => {
    const client = createClient();
    client.installPluginSource.mockResolvedValue({ ...plugin(), setupScreen: "translation" });
    renderPage(client);
    fireEvent.change(await screen.findByRole("textbox"), { target: { value: "/plugins/example" } });
    fireEvent.click(screen.getByRole("button", { name: "Install plugin" }));
    await waitFor(() => expect(client.installPluginSource).toHaveBeenCalledTimes(1));
    expect(router.push).toHaveBeenCalledWith(
      buildPluginSettingsRoute("host-a", "example", "translation"),
    );
  });

  it("hides the logs action when the host does not advertise support", async () => {
    runtime.logsSupported = false;
    const client = createClient();
    client.listPlugins.mockResolvedValue([plugin()]);
    renderPage(client);

    await screen.findByText("example");
    fireEvent.click(screen.getByRole("button", { name: "Actions for example" }));
    expect(screen.queryByRole("menuitem", { name: "Logs" })).toBeNull();
  });

  it("opens readable stdout and stderr logs and refreshes them", async () => {
    const client = createClient();
    client.listPlugins.mockResolvedValue([plugin()]);
    client.getPluginLogs.mockResolvedValue([
      {
        sequence: 1,
        timestamp: "2026-08-16T12:00:00.000Z",
        stream: "stdout",
        message: "ready",
      },
      {
        sequence: 2,
        timestamp: "2026-08-16T12:00:01.000Z",
        stream: "stderr",
        message: "warning",
      },
    ]);
    renderPage(client);

    await selectPluginAction("Logs");

    expect(await screen.findByRole("dialog")).toBeDefined();
    expect(screen.getByText("Logs: example")).toBeDefined();
    expect(await screen.findByText("ready")).toBeDefined();
    expect(screen.getByText("warning")).toBeDefined();
    expect(screen.getByText(/stdout/)).toBeDefined();
    expect(screen.getByText(/stderr/)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(client.getPluginLogs).toHaveBeenCalledTimes(2));
  });

  it("shows empty and recoverable error states for plugin logs", async () => {
    const client = createClient();
    client.listPlugins.mockResolvedValue([plugin()]);
    client.getPluginLogs.mockRejectedValueOnce(new Error("logs exploded"));
    renderPage(client);

    await selectPluginAction("Logs");
    expect(await screen.findByText("Unable to load plugin logs")).toBeDefined();
    expect(screen.getByText("logs exploded")).toBeDefined();

    fireEvent.click(screen.getAllByRole("button", { name: "Refresh" }).at(-1)!);
    await waitFor(() => expect(client.getPluginLogs).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("No plugin output yet")).toBeDefined();
  });
});
