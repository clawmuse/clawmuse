import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, expect, test } from "vitest";
import { z } from "zod";
import { compilePlugin } from "../compiler.js";
import { readPluginManifest } from "../manifest.js";
import { DaemonClient } from "../../test-utils/daemon-client.js";
import { createTestPaseoDaemon } from "../../test-utils/paseo-daemon.js";
import { loadConfig } from "../../config.js";
import {
  BuiltinPluginLoader,
  builtinPlugins,
  optionalBundledPlugins,
  resolveBuiltinPluginsRoot,
} from "./index.js";
import { capabilitiesRpc } from "../../../../../../plugins/device-preview/shared/contracts.js";

const roots: string[] = [];

test("device preview is optional and its RPC lifecycle works without a host SDK", async () => {
  expect(builtinPlugins).not.toContain("device-preview");
  expect(optionalBundledPlugins).toContain("device-preview");
  const daemon = await createTestPaseoDaemon({
    daemonVersion: "1.4.4",
    pluginsEnabled: true,
    builtinPlugins: new BuiltinPluginLoader(resolveBuiltinPluginsRoot(), [], ["device-preview"]),
  });
  const client = new DaemonClient({ url: `ws://127.0.0.1:${daemon.port}/ws`, appVersion: "1.4.4" });
  try {
    await client.connect();
    expect(await client.listPlugins()).toMatchObject([
      { id: "device-preview", bundled: true, enabled: false, status: "disabled" },
    ]);
    await client.enablePlugin("device-preview");
    const capabilities = await client.invokePluginRpc("device-preview", capabilitiesRpc.name, {});
    expect(capabilitiesRpc.output.safeParse(capabilities).success).toBe(true);
    await expect(
      client.invokePluginRpc("device-preview", "device-preview.start", {
        platform: "android",
        deviceId: "a;shutdown",
      }),
    ).rejects.toThrow();
    await expect(
      client.invokePluginRpc("device-preview", "device-preview.frame", {
        operationId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      }),
    ).rejects.toThrow("无效");
    await client.disablePlugin("device-preview");
    expect(await client.listPlugins()).toMatchObject([
      { id: "device-preview", enabled: false, status: "disabled" },
    ]);
  } finally {
    await client.close();
    await daemon.close();
  }
}, 30_000);

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(root: string, id: string, client = false): Promise<string> {
  const directory = path.join(root, id);
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, "paseo-plugin.json"),
    JSON.stringify({ id, requirements: { paseo: ">=0.9.2" } }),
  );
  await writeFile(
    path.join(directory, "index.server.ts"),
    "export default function contribute() { return () => {}; }",
  );
  if (client) {
    await writeFile(
      path.join(directory, "index.client.tsx"),
      "export default function contribute() { const marker = 'builtin-client-marker'; void marker; return () => {}; }",
    );
  }
  return directory;
}

test("listed built-ins resolve to matching manifests and compile", async () => {
  const root = resolveBuiltinPluginsRoot();
  for (const id of [...builtinPlugins, ...optionalBundledPlugins]) {
    const directory = path.join(root, id);
    expect((await readPluginManifest(directory)).id).toBe(id);
    const findEntry = async (names: string[]) => {
      for (const name of names) {
        const entry = path.join(directory, name);
        if ((await stat(entry).catch(() => null))?.isFile()) return entry;
      }
      return null;
    };
    const bundles = await compilePlugin({
      server: await findEntry(["index.server.ts", "index.server.tsx"]),
      client: await findEntry(["index.client.ts", "index.client.tsx"]),
    });
    expect(bundles.serverBundle).toBeTruthy();
  }
});

test("official conversation plugins default on, persist opt-outs, and follow the global switch", async () => {
  const daemon = await createTestPaseoDaemon({
    daemonVersion: "1.1.0",
    builtinPlugins: new BuiltinPluginLoader(
      undefined,
      [],
      [],
      ["usage-display", "prompt-prediction"],
    ),
  });
  const client = new DaemonClient({ url: `ws://127.0.0.1:${daemon.port}/ws`, appVersion: "1.1.0" });
  try {
    await client.connect();
    expect(await client.listPlugins()).toMatchObject([
      { id: "prompt-prediction", bundled: true, enabled: true, status: "running" },
      { id: "usage-display", bundled: true, enabled: true, status: "running" },
    ]);
    expect(await client.getPluginCatalog()).toEqual([]);
    await expect(client.removePlugin("usage-display")).rejects.toThrow(/disable/i);
    await client.disablePlugin("usage-display");
    await client.disablePlugin("prompt-prediction");
    expect((await client.getDaemonConfig()).config).toMatchObject({
      plugins: { "usage-display": { enabled: false } },
      metadataGeneration: { promptPredictions: false },
    });
    expect(loadConfig(daemon.paseoHome, { env: {} })).toMatchObject({
      plugins: { "usage-display": { enabled: false } },
      metadataGeneration: { promptPredictions: false },
    });
    expect(await client.getPluginSourceStatus()).toEqual([]);
    expect(await client.previewPluginUpdates()).toEqual([]);
    await client.patchDaemonConfig({ pluginsEnabled: false });
    await client.enablePlugin("usage-display");
    expect(await client.listPlugins()).toMatchObject([
      { id: "prompt-prediction", enabled: false, status: "disabled" },
      { id: "usage-display", enabled: true, status: "disabled" },
    ]);
    await client.patchDaemonConfig({ pluginsEnabled: true });
    expect(await client.listPlugins()).toMatchObject([
      { id: "prompt-prediction", enabled: false, status: "disabled" },
      { id: "usage-display", enabled: true, status: "running" },
    ]);
    await client.enablePlugin("prompt-prediction");
    expect((await client.getDaemonConfig()).config.metadataGeneration.promptPredictions).toBe(true);
  } finally {
    await client.close();
    await daemon.close();
  }
}, 60_000);

test("official translation is disabled by default and only applies after explicit model configuration", async () => {
  const daemon = await createTestPaseoDaemon({
    daemonVersion: "0.13.0",
    pluginsEnabled: true,
    builtinPlugins: new BuiltinPluginLoader(
      resolveBuiltinPluginsRoot(),
      [],
      ["conversation-translation"],
    ),
  });
  const client = new DaemonClient({
    url: `ws://127.0.0.1:${daemon.port}/ws`,
    appVersion: "0.13.0",
  });
  const pluginId = "conversation-translation";
  try {
    await client.connect();
    expect(await client.listPlugins()).toMatchObject([
      {
        id: pluginId,
        bundled: true,
        enabled: false,
        status: "disabled",
        setupScreen: "translation",
      },
    ]);
    expect(await client.getPluginCatalog()).toEqual([]);
    expect(
      await daemon.daemon.agentManager.transformUserPrompt({
        agentId: "translation-test",
        prompt: "Hello",
      }),
    ).toBe("Hello");
    await expect(
      client.invokePluginRpc(pluginId, "translation.reply", { text: "Hello" }),
    ).rejects.toThrow();
    await expect(client.removePlugin(pluginId)).rejects.toThrow(/disable/i);
    await client.enablePlugin(pluginId);
    expect((await client.getPluginCatalog()).map(({ id }) => id)).toEqual([pluginId]);
    const initial = await client.invokePluginRpc(pluginId, "settings.translation.read", {});
    expect(initial).toMatchObject({ status: "ready", values: { provider: "", model: "" } });
    // Enabled but unconfigured must not invoke a CLI (even when no CLI account is available).
    expect(await client.invokePluginRpc(pluginId, "translation.reply", { text: "Hello" })).toEqual({
      text: "Hello",
    });
    expect(
      await daemon.daemon.agentManager.transformUserPrompt({
        agentId: "translation-test",
        prompt: "Hello",
      }),
    ).toBe("Hello");
    await client.invokePluginRpc(pluginId, "settings.translation.write", {
      revision: z.object({ revision: z.string() }).parse(initial).revision,
      values: { provider: "codex", model: "user-selected-model" },
    });
    expect(
      await daemon.daemon.agentManager.transformUserPrompt({
        agentId: "translation-test",
        prompt: "Hello",
      }),
    ).toContain("Respond in English");
    await client.disablePlugin(pluginId);
    expect(await client.getPluginCatalog()).toEqual([]);
    expect(
      await daemon.daemon.agentManager.transformUserPrompt({
        agentId: "translation-test",
        prompt: "Hello",
      }),
    ).toBe("Hello");
    await expect(
      client.invokePluginRpc(pluginId, "translation.reply", { text: "Hello" }),
    ).rejects.toThrow();
    await client.patchDaemonConfig({ pluginsEnabled: false });
    expect(await client.enablePlugin(pluginId)).toMatchObject({
      enabled: true,
      status: "disabled",
    });
    expect(await client.getPluginCatalog()).toEqual([]);
    await client.patchDaemonConfig({ pluginsEnabled: true });
    await client.reloadPlugin(pluginId);
    expect(await client.invokePluginRpc(pluginId, "settings.translation.read", {})).toMatchObject({
      values: { provider: "codex", model: "user-selected-model" },
    });
  } finally {
    await client.close();
    await daemon.close();
  }
}, 60_000);

test("listed client bundle is published while plugins are disabled; unlisted directory is inert", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "paseo-builtin-fixture-"));
  roots.push(root);
  await fixture(root, "listed", true);
  await fixture(root, "unlisted", true);
  const daemon = await createTestPaseoDaemon({
    daemonVersion: "0.9.2",
    pluginsEnabled: false,
    builtinPlugins: new BuiltinPluginLoader(root, ["listed"]),
  });
  const client = new DaemonClient({ url: `ws://127.0.0.1:${daemon.port}/ws`, appVersion: "0.9.2" });
  try {
    await client.connect();
    expect(await client.listPlugins()).toEqual([]);
    const catalog = await client.getPluginCatalog();
    expect(catalog.map(({ id }) => id)).toEqual(["listed"]);
    expect(catalog[0]?.clientBundle).toContain("builtin-client-marker");
  } finally {
    await client.close();
    await daemon.close();
  }
}, 60_000);

test("a repeated catalog fetch leaves out the client bundle the client already holds", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "paseo-builtin-catalog-cache-"));
  roots.push(root);
  const directory = await fixture(root, "large", true);
  // About the size of a real plugin client bundle.
  await writeFile(
    path.join(directory, "index.client.tsx"),
    `const payload = ${JSON.stringify("x".repeat(1_000_000))};
export default function contribute() { void payload; return () => {}; }`,
  );
  const daemon = await createTestPaseoDaemon({
    daemonVersion: "0.9.2",
    pluginsEnabled: false,
    builtinPlugins: new BuiltinPluginLoader(root, ["large"]),
  });
  const client = new DaemonClient({ url: `ws://127.0.0.1:${daemon.port}/ws`, appVersion: "0.9.2" });
  const responseBytes: number[] = [];
  const unsubscribe = client.subscribeRawMessages((message) => {
    if (message.type === "plugin.catalog.get.response") {
      responseBytes.push(JSON.stringify(message).length);
    }
  });
  try {
    await client.connect();
    const first = await client.getPluginCatalog();
    const second = await client.getPluginCatalog();

    expect(second).toEqual(first);
    expect(second[0]?.clientBundle).toContain("x".repeat(1_000_000));
    expect(responseBytes).toHaveLength(2);
    expect(responseBytes[0]).toBeGreaterThan(1_000_000);
    expect(responseBytes[1]).toBeLessThan(500);
  } finally {
    unsubscribe();
    await client.close();
    await daemon.close();
  }
}, 60_000);

test("directory, Git, and npm installs reject a built-in ID", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "paseo-builtin-install-"));
  roots.push(root);
  const directory = await fixture(root, "reserved");
  const gitDirectory = await fixture(root, "git-source");
  await writeFile(
    path.join(gitDirectory, "paseo-plugin.json"),
    JSON.stringify({ id: "reserved", requirements: { paseo: ">=0.9.2" } }),
  );
  execFileSync("git", ["init", "-q", gitDirectory]);
  execFileSync("git", [
    "-C",
    gitDirectory,
    "-c",
    "user.name=Paseo Tests",
    "-c",
    "user.email=paseo@example.test",
    "add",
    ".",
  ]);
  execFileSync("git", [
    "-C",
    gitDirectory,
    "-c",
    "user.name=Paseo Tests",
    "-c",
    "user.email=paseo@example.test",
    "commit",
    "-qm",
    "fixture",
  ]);
  const daemon = await createTestPaseoDaemon({
    daemonVersion: "0.9.2",
    pluginsEnabled: false,
    builtinPlugins: new BuiltinPluginLoader(root, ["reserved"]),
  });
  const client = new DaemonClient({ url: `ws://127.0.0.1:${daemon.port}/ws`, appVersion: "0.9.2" });
  try {
    await client.connect();
    await expect(client.installDirectoryPlugin(directory)).rejects.toThrow(
      /reserved for a built-in/,
    );
    await expect(
      client.installPluginSource({ source: pathToFileURL(gitDirectory).href }),
    ).rejects.toThrow(/reserved for a built-in/);
    await expect(
      client.installPluginSource({ source: "npm:unused-fixture", id: "reserved" }),
    ).rejects.toThrow(/reserved for a built-in/);
    expect(await client.listPlugins()).toEqual([]);
  } finally {
    await client.close();
    await daemon.close();
  }
}, 60_000);
