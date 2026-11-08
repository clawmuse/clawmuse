import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PluginRpcProvider } from "@getpaseo/plugin/client/host";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PreviewPanel } from "../../../../plugins/device-preview/client/panel";
import { darkTheme } from "@/styles/theme";
import { toPluginTheme } from "./theme";

vi.mock("@getpaseo/plugin/client/ui", () => import("./react-native/modal"));

const id = "12345678-1234-4123-8123-123456789abc";
const status = {
  operationId: id,
  platform: "ios",
  deviceId: id,
  quality: "balanced",
  controls: ["touch", "home", "recents", "appearance", "rotate"],
  phase: "ready",
  reason: null,
};
const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=";
const props = {
  theme: toPluginTheme(darkTheme),
  host: { id: "test-host", label: "Test Mac" },
  layout: { compact: false, platform: "web" as const },
  workspaceId: "workspace",
  context: "workspace" as const,
  params: {},
  revision: 0,
  tab: { state: undefined, setState() {}, setModified() {} },
};
let root: Root, container: HTMLDivElement, queries: QueryClient;
beforeEach(() => {
  vi.stubGlobal("React", React);
  container = document.createElement("div");
  container.style.width = "400px";
  container.style.height = "800px";
  document.body.appendChild(container);
  root = createRoot(container);
  queries = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});
afterEach(() => {
  act(() => root.unmount());
  queries.clear();
  container.remove();
  vi.unstubAllGlobals();
});

function render(invoke: (method: string, input: unknown) => Promise<unknown>) {
  act(() =>
    root.render(
      <QueryClientProvider client={queries}>
        <PluginRpcProvider invoke={invoke}>
          <PreviewPanel {...props} />
        </PluginRpcProvider>
      </QueryClientProvider>,
    ),
  );
}
function click(title: string) {
  const button = [...container.querySelectorAll<HTMLElement>('[role="button"]')].find(
    (element) => element.textContent === title,
  );
  if (!button) throw new Error(`Missing button: ${title}`);
  act(() => button.click());
}
function environment(method: string) {
  if (method === "device-preview.capabilities")
    return {
      ios: { available: true, reason: "Native preview" },
      android: { available: false, reason: "SDK unavailable" },
    };
  if (method === "device-preview.list")
    return {
      devices: [{ id, name: "iPhone", state: "booted", busy: false, reason: null }],
      notes: [],
    };
  throw new Error(`Unexpected call: ${method}`);
}

it("renders an unavailable host in the real dark-theme panel", async () => {
  render(async () => ({
    ios: { available: false, reason: "需要 Apple Silicon Mac 和 Xcode" },
    android: { available: false, reason: "SDK unavailable" },
  }));
  await expect.poll(() => container.textContent).toContain("需要 Apple Silicon Mac 和 Xcode");
  const label = [...container.querySelectorAll<HTMLElement>("div")].find(
    (element) => element.textContent === "设备预览 · Test Mac",
  );
  expect(label).toBeInstanceOf(HTMLElement);
  expect(getComputedStyle(label!).color).not.toBe("rgb(0, 0, 0)");
  expect(container.textContent).not.toContain("启动并预览");
});

it("cancels a pending start and stops a late operation without reconnecting the panel", async () => {
  let finish: (value: unknown) => void = () => {};
  const pending = new Promise((resolve) => {
    finish = resolve;
  });
  const stopped: unknown[] = [];
  const invoke = async (method: string, input: unknown) => {
    if (method === "device-preview.start") return pending;
    if (method === "device-preview.stop") {
      stopped.push(input);
      return { ...status, phase: "stopped" };
    }
    return environment(method);
  };
  render(invoke);
  await expect.poll(() => container.textContent).toContain("预览");
  await expect.poll(() => container.textContent).toContain("iPhone");
  click("预览");
  await expect.poll(() => container.textContent).toContain("正在请求预览");
  click("停止预览");
  await act(async () => {
    finish({ ...status, phase: "preparing" });
    await pending;
  });
  await expect.poll(() => stopped).toEqual([{ operationId: id }]);
  expect(container.textContent).not.toContain("已连接");
  expect(container.querySelector("img")).toBeNull();
});

it("decodes a frame and shows an input error inline without exposing unsupported iOS buttons", async () => {
  const invoke = async (method: string, input: unknown) => {
    if (method === "device-preview.start") return { ...status, phase: "preparing" };
    if (method === "device-preview.stop") return { ...status, phase: "stopped" };
    if (method === "device-preview.input") throw new Error("输入未确认，请重新连接");
    if (method === "device-preview.frame") {
      const previous =
        typeof input === "object" && input !== null && "afterSequence" in input
          ? input.afterSequence
          : 0;
      return {
        status,
        image: previous
          ? null
          : {
              base64: png,
              mime: "image/png",
              width: 1,
              height: 1,
              sequence: 1,
              geometry: 1,
              rotation: 0,
            },
        unchanged: !!previous,
      };
    }
    return environment(method);
  };
  render(invoke);
  await expect.poll(() => container.textContent).toContain("iPhone");
  click("预览");
  await expect.poll(() => container.textContent).toContain("已连接");
  await expect.poll(() => container.querySelector("img")?.complete).toBe(true);
  expect(container.textContent).not.toContain("返回");
  click("Home");
  await expect
    .poll(() => container.querySelector('[role="alert"]')?.textContent)
    .toContain("输入未确认");
});
