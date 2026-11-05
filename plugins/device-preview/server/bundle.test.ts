import { expect, test } from "vitest";
import { fileURLToPath } from "node:url";
import { compilePlugin } from "../../../packages/server/src/server/plugins/compiler-build.js";
import { evaluateBundle } from "../../../packages/server/src/server/plugins/bundle-evaluator.js";
import * as sharedSdk from "@getpaseo/plugin";
import * as zod from "zod";

test("both real plugin bundles compile; server and client register and clean up without SDK discovery", async () => {
  const root = new URL("../", import.meta.url);
  const bundles = await compilePlugin({
    server: fileURLToPath(new URL("index.server.ts", root)),
    client: fileURLToPath(new URL("index.client.tsx", root)),
  });
  if (!bundles.serverBundle || !bundles.clientBundle) throw new Error("Missing plugin bundle");
  const methods: string[] = [];
  const contribute = evaluateBundle(bundles.serverBundle);
  const server = {
    handle: (contract: { name: string }) => {
      methods.push(contract.name);
    },
  };
  const cleanup = Reflect.apply(contribute, undefined, [server]);
  expect(methods).toEqual([
    "device-preview.capabilities",
    "device-preview.list",
    "device-preview.start",
    "device-preview.status",
    "device-preview.frame",
    "device-preview.input",
    "device-preview.stop",
  ]);
  await cleanup();
  const factory = globalThis.eval(bundles.clientBundle);
  const exports = factory((name: string) => {
    if (name === "@getpaseo/plugin") return sharedSdk;
    if (name === "zod") return zod;
    return {};
  });
  const registrations: string[] = [];
  const removals: string[] = [];
  const client = {
    addWorkspacePanel: (panel: { id: string }) => {
      registrations.push(panel.id);
      return () => {
        removals.push(panel.id);
      };
    },
    addCommandCenterItem: (command: { id: string }) => {
      registrations.push(command.id);
      return () => {
        removals.push(command.id);
      };
    },
  };
  const remove = exports.default(client);
  expect(registrations).toEqual(["preview", "open-preview"]);
  remove();
  expect(removals).toEqual(["open-preview", "preview"]);
});
