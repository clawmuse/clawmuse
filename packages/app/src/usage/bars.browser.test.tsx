import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { i18n } from "@/i18n/i18next";
import { UsageWindowBar } from "./window-bar";
import type { UsageBalance, UsageWindow } from "./types";
import { UsageBalanceBar } from "./balance-bar";

const quota: UsageBalance = {
  id: "copilot_chat",
  label: "Chat requests",
  unit: "requests",
  limit: 200,
  used: 50,
  remaining: 150,
};
const window: UsageWindow = { id: "session", label: "Session", usedPct: 70 };
const balance: UsageBalance = { id: "credits", label: "Credits", unit: "usd", remaining: 12 };
const ignorePin = () => {};

let root: Root;
let container: HTMLDivElement;
beforeEach(async () => {
  vi.stubGlobal("React", React);
  await i18n.changeLanguage("en");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  act(() => root.unmount());
  container.remove();
  await i18n.changeLanguage("en");
  vi.unstubAllGlobals();
});

it("translates mounted usage rows when the language changes", async () => {
  act(() =>
    root.render(
      <>
        <UsageWindowBar
          window={window}
          displayAs="used"
          pinnable={false}
          pinned={false}
          onTogglePin={ignorePin}
          pinLabel=""
          pinTestID=""
        />
        <UsageBalanceBar balance={balance} />
      </>,
    ),
  );
  expect(container.textContent).toContain("Session70% used");
  expect(container.textContent).toContain("Credits");
  await act(async () => {
    await i18n.changeLanguage("ja");
  });
  expect(container.textContent).toContain("セッション70% 使用済み");
  expect(container.textContent).toContain("クレジット");
});

it("shows whether finite Copilot quota counts are used or remaining", async () => {
  act(() => root.render(<UsageBalanceBar balance={quota} displayAs="remaining" />));
  expect(container.textContent).toContain("150 / 200 left");
  await act(async () => {
    await i18n.changeLanguage("zh-CN");
  });
  expect(container.textContent).toContain("聊天请求剩余 150 / 200");
  act(() => root.render(<UsageBalanceBar balance={quota} displayAs="used" />));
  expect(container.textContent).toContain("聊天请求已用 50 / 200");
});
