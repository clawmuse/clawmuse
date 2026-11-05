/**
 * @vitest-environment jsdom
 */
import appPackage from "../../../package.json";
import { AbortController as NativeAbortController } from "abort-controller";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { DaemonClient, type DaemonTransport } from "@getpaseo/client/internal/daemon-client";
import React, { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hostClient = vi.hoisted(() => ({ invokePluginRpc: async () => null }));
const selectedHost = vi.hoisted(() => ({ client: null as DaemonClient | null }));
vi.mock("@/runtime/host-runtime", () => ({
  useHostRuntimeClient: () => selectedHost.client ?? (hostClient as unknown as DaemonClient),
  useHosts: () => [{ serverId: "host-1", label: "Local" }],
}));
vi.mock("@/constants/layout", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/constants/layout")>()),
  useIsCompactFormFactor: () => false,
}));
vi.mock("../navigation", () => ({
  createPluginNavigation: () => ({}),
}));
vi.mock("../client-runtime", () => ({
  createPluginClientRuntime: () => ({
    paseo: {},
    dispose: () => {},
    rpc: async () => undefined,
    openSurface: () => undefined,
    openPanel: () => undefined,
    addComposerPill: () => ({ update() {}, remove() {} }),
    addHeaderButton: () => ({ update() {}, remove() {} }),
  }),
}));
vi.mock("../icons", () => ({
  Icon: () => null,
  pluginIconComponent: () => () => null,
}));

import { pluginRegistry } from "../registry";
import { darkTheme } from "@/styles/theme";
import { toPluginTheme } from "../theme";
import { PluginTimelineItemView } from "./view";

const audio = { play: async () => 0 };

const bundle = `(function(require) {
  const React = require("react");
  return { default: function(plugin) {
    function Card(props) {
      return React.createElement("span", null, props.item.data.label);
    }
    plugin.addTimelineRenderer({
      kind: "test-report",
      version: 1,
      schema: { safeParse(value) { return { success: true, data: value }; } },
      Component: Card,
    });
    return function() {};
  } };
})`;

const failingBundle = `(function() {
  return { default: function(plugin) {
    function BrokenCard() { throw new Error("timeline renderer exploded"); }
    plugin.addTimelineRenderer({
      kind: "test-report",
      version: 1,
      schema: { safeParse(value) { return { success: true, data: value }; } },
      Component: BrokenCard,
    });
    return function() {};
  } };
})`;

const recoveringBundle = `(function(require) {
  const React = require("react");
  return { default: function(plugin) {
    function RecoveringCard(props) {
      if (props.item.data.label === "explode") throw new Error("transient renderer failure");
      return React.createElement("span", null, props.item.data.label);
    }
    plugin.addTimelineRenderer({
      kind: "test-report",
      version: 1,
      schema: { safeParse(value) { return { success: true, data: value }; } },
      Component: RecoveringCard,
    });
    return function() {};
  } };
})`;

const timelineItem = {
  kind: "plugin" as const,
  id: "item-1",
  pluginId: "reports",
  pluginItemId: "item-1",
  itemKind: "test-report",
  version: 1,
  data: { label: "Four tests passed" },
  timestamp: new Date("2026-01-01T00:00:00.000Z"),
};
const failingTimelineItem = { ...timelineItem, data: { label: "explode" } };
const recoveredTimelineItem = { ...timelineItem, data: { label: "Recovered" } };
const translatedItem = {
  ...timelineItem,
  pluginId: "conversation-translation",
  itemKind: "translation",
  data: {
    text: "Hello! What would you like to work on?",
    role: "assistant",
    phase: "complete",
  },
};

const roots: Array<ReturnType<typeof createRoot>> = [];
const containers: HTMLElement[] = [];
const daemonClient = {} as DaemonClient;

beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  for (const container of containers.splice(0)) container.remove();
  pluginRegistry.removeHost("host-1");
  selectedHost.client = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("translates received replies with React Native's AbortController", async () => {
  // Compile outside jsdom so esbuild uses Node's typed arrays and encoders.
  const entry = resolve(
    __dirname,
    "../../../../../plugins/conversation-translation/client/row.tsx",
  );
  const clientBundle = execFileSync(process.execPath, ["--input-type=module"], {
    input: `import { build } from "esbuild";
        const result = await build({
          entryPoints: [${JSON.stringify(entry)}], bundle: true, format: "cjs",
          platform: "neutral", target: "es2020", jsx: "automatic", write: false,
          external: ["@getpaseo/*", "@tanstack/react-query", "react", "react/jsx-runtime", "react-native", "zod"],
        });
        process.stdout.write(result.outputFiles[0].text);`,
    encoding: "utf8",
  });
  const translationBundle = `(function(require) {
      const module = { exports: {} };
      const exports = module.exports;
      ${clientBundle}
      const Row = module.exports.TranslationRow;
      return { default(plugin) {
        plugin.addTimelineRenderer({
          kind: "translation", version: 1,
          schema: { safeParse(data) { return { success: true, data }; } },
          Component(props) {
            return require("react").createElement(Row, {
              ...props, theme: ${JSON.stringify(toPluginTheme(darkTheme))},
            });
          },
        });
        return () => {};
      }};
    })`;
  const client = new DaemonClient({ url: "ws://translation.test", clientId: "translation-test" });
  const invoke = vi.spyOn(client, "invokePluginRpc").mockImplementation(async (_id, method) => {
    if (method === "settings.translation.read")
      return {
        status: "ready",
        revision: "configured",
        values: { provider: "codex", model: "test" },
      };
    if (method === "translation.reply") return { text: "你好！你想做些什么？" };
    throw new Error(`Unexpected RPC: ${method}`);
  });
  vi.stubGlobal("AbortController", NativeAbortController);
  pluginRegistry.installCatalog(
    "host-1",
    [
      {
        id: "conversation-translation",
        requirements: { paseo: `>=${appPackage.version}` },
        clientBundle: translationBundle,
      },
    ],
    { client, audio },
  );
  const container = document.createElement("div");
  containers.push(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () =>
    root.render(
      <PluginTimelineItemView serverId="host-1" agentId="agent-1" item={translatedItem} />,
    ),
  );
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(container.textContent).toContain("你好！你想做些什么？");
  });
  expect(invoke).toHaveBeenCalledWith("conversation-translation", "translation.reply", {
    text: "Hello! What would you like to work on?",
    revision: "configured",
  });
  expect(container.textContent).not.toContain("翻译失败");
});

describe("PluginTimelineItemView", () => {
  it("validates and renders the matching plugin component", async () => {
    pluginRegistry.installCatalog(
      "host-1",
      [{ id: "reports", requirements: { paseo: `>=${appPackage.version}` }, clientBundle: bundle }],
      {
        client: daemonClient,
        audio,
      },
    );

    const container = document.createElement("div");
    containers.push(container);
    const root = createRoot(container);
    roots.push(root);
    await act(async () =>
      root.render(
        <PluginTimelineItemView serverId="host-1" agentId="agent-1" item={timelineItem} />,
      ),
    );
    expect(container.textContent).toContain("Four tests passed");
  });

  it("contains renderer crashes to one timeline item", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    pluginRegistry.installCatalog(
      "host-1",
      [
        {
          id: "reports",
          requirements: { paseo: `>=${appPackage.version}` },
          clientBundle: failingBundle,
        },
      ],
      {
        client: daemonClient,
        audio,
      },
    );
    const container = document.createElement("div");
    containers.push(container);
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(
        <div>
          <span>Message before</span>
          <PluginTimelineItemView serverId="host-1" agentId="agent-1" item={timelineItem} />
          <span>Message after</span>
        </div>,
      );
    });

    expect(container.textContent).toContain("Message before");
    expect(container.textContent).toContain("Plugin failed: timeline renderer exploded");
    expect(container.textContent).toContain("Message after");
  });

  it("recovers when a streaming item's data changes", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    pluginRegistry.installCatalog(
      "host-1",
      [
        {
          id: "reports",
          requirements: { paseo: `>=${appPackage.version}` },
          clientBundle: recoveringBundle,
        },
      ],
      {
        client: daemonClient,
        audio,
      },
    );
    const container = document.createElement("div");
    containers.push(container);
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);
    await act(async () => {
      root.render(
        <PluginTimelineItemView serverId="host-1" agentId="agent-1" item={failingTimelineItem} />,
      );
    });
    expect(container.textContent).toBe("Plugin failed: transient renderer failure");

    await act(async () => {
      root.render(
        <PluginTimelineItemView serverId="host-1" agentId="agent-1" item={recoveredTimelineItem} />,
      );
    });
    expect(container.textContent).toBe("Recovered");
  });
});

it("a renderer releases its observation on the plugin's client when it crashes, and remounts in StrictMode", async () => {
  let receive: Parameters<DaemonTransport["onMessage"]>[0] = () => {};
  let opened: () => void = () => {};
  let nextId = 0;
  const retained = new Set<string>();
  const released: string[] = [];
  const deliver = (message: unknown) =>
    receive(JSON.stringify({ type: "session", message }), false);
  const client = new DaemonClient({
    url: "ws://surface-observation.test",
    clientId: "surface-lifetime-test",
    transportFactory: () => ({
      send(data) {
        if (typeof data !== "string") throw new Error("Expected a JSON request");
        const frame = JSON.parse(data) as {
          type: string;
          message?: { type: string; requestId: string; subscriptionId: string };
        };
        if (frame.type === "hello")
          deliver({
            type: "status",
            payload: {
              status: "server_info",
              serverId: "host-1",
              hostname: null,
              version: null,
              features: { ownedSubscriptions: true },
            },
          });
        const request = frame.message;
        if (request?.type === "session.events.set_subscription.request") {
          const id = `surface-${++nextId}`;
          retained.add(id);
          deliver({
            type: "session.events.set_subscription.response",
            payload: {
              requestId: request.requestId,
              subscriptionId: id,
              events: ["project.update"],
              snapshots: [],
            },
          });
        } else if (request?.type === "subscription.release.request") {
          retained.delete(request.subscriptionId);
          released.push(request.subscriptionId);
          deliver({ type: "subscription.release.response", payload: request });
        }
      },
      close() {},
      onMessage(handler) {
        receive = handler;
        return () => {};
      },
      onOpen(handler) {
        opened = handler;
        return () => {};
      },
      onClose() {
        return () => {};
      },
      onError() {
        return () => {};
      },
    }),
  });
  const connecting = client.connect();
  opened();
  await connecting;
  selectedHost.client = client;
  const liveBundle = `(function(require) {
    const React = require("react");
    const { usePaseo } = require("@getpaseo/plugin/client");
    return { default(plugin) {
      function Card(props) {
        const paseo = usePaseo();
        React.useEffect(() => {
          const owner = paseo.observeEvents(["project.update"]);
          return () => { void owner.release(); };
        }, [paseo]);
        if (props.item.data.label === "explode") throw new Error("owned renderer failed");
        return React.createElement("span", null, props.item.data.label);
      }
      plugin.addTimelineRenderer({ kind:"test-report", version:1, schema:{safeParse(data){return {success:true,data};}}, Component:Card });
      return () => {};
    }};
  })`;
  const survivor = client.observeEvents(["project.update"]);
  const updates: unknown[] = [];
  survivor.subscribe({ snapshot: () => {}, update: (message) => updates.push(message) });
  await survivor.ready;
  pluginRegistry.installCatalog(
    "host-1",
    [
      {
        id: "reports",
        requirements: { paseo: `>=${appPackage.version}` },
        clientBundle: liveBundle,
      },
    ],
    { client, audio },
  );
  const container = document.createElement("div");
  containers.push(container);
  const root = createRoot(container);
  roots.push(root);
  const render = (item: typeof timelineItem) =>
    act(async () =>
      root.render(
        <StrictMode>
          <PluginTimelineItemView serverId="host-1" agentId="agent-1" item={item} />
        </StrictMode>,
      ),
    );
  try {
    await render(timelineItem);
    expect(retained.size).toBe(2);
    const initialIds = new Set(retained);
    await render(failingTimelineItem);
    expect(container.textContent).toContain("Plugin failed:");
    expect([...retained]).toEqual([survivor.subscriptionId]);
    expect(released.some((id) => initialIds.has(id))).toBe(true);
    deliver({
      type: "project.update",
      payload: { subscriptionId: survivor.subscriptionId, kind: "remove", projectId: "still-live" },
    });
    expect(updates).toHaveLength(1);
    await render(recoveredTimelineItem);
    expect(container.textContent).toContain("Recovered");
    expect(retained.size).toBe(2);
    expect([...retained].filter((id) => !initialIds.has(id))).toHaveLength(1);
    await act(async () => root.unmount());
    roots.splice(roots.indexOf(root), 1);
    expect([...retained]).toEqual([survivor.subscriptionId]);
  } finally {
    await survivor.release();
    await client.close();
  }
});
