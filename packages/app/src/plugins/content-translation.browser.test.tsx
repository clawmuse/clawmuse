import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { page } from "vitest/browser";
import { within } from "@testing-library/dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { PluginContentTranslatorContribution } from "@getpaseo/plugin/client";
import { i18n } from "@/i18n/i18next";
import { TranslatedQuestionFormCard, TranslatedPlanCard } from "./content-translation";

const registry = vi.hoisted(() => ({
  plugins: [] as {
    id: string;
    serverId: string;
    contentTranslators: PluginContentTranslatorContribution[];
  }[],
}));
vi.mock("./registry", () => ({ useInstalledPlugins: () => registry.plugins }));
vi.mock("@/components/markdown/renderer", () => ({
  MarkdownRenderer: ({ text }: { text: string }) => <span>{text}</span>,
}));

const permission = {
  key: "question",
  agentId: "agent",
  request: {
    id: "question",
    provider: "claude" as const,
    kind: "question" as const,
    name: "AskUserQuestion",
    input: {
      questions: [
        {
          header: "Entity",
          question: "Where registered?",
          options: [{ label: "Mainland China", description: "Needs a representative" }],
          multiSelect: true,
          allowOther: true,
          placeholder: "Other country",
        },
        { header: "Hosting", question: "Where hosted?", options: [{ label: "US" }] },
      ],
    },
  },
};
const dictionary: Record<string, string> = {
  Entity: "主体",
  Hosting: "托管",
  "Where registered?": "在哪里注册？",
  "Where hosted?": "在哪里托管？",
  "Mainland China": "中国大陆",
  "Needs a representative": "需要代表",
  "Other country": "其他国家",
  US: "美国",
};
let root: Root;
let container: HTMLDivElement;
let queryClient: QueryClient;
const respond = vi.fn();
const approve = vi.fn();
const planFooter = (
  <button type="button" onClick={approve}>
    Approve
  </button>
);

beforeEach(async () => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  await i18n.changeLanguage("en");
  registry.plugins = [];
  respond.mockClear();
  approve.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => {
  act(() => root.unmount());
  queryClient.clear();
  container.remove();
  vi.unstubAllGlobals();
});
function render() {
  act(() =>
    root.render(
      <QueryClientProvider client={queryClient}>
        <TranslatedQuestionFormCard
          serverId="host"
          permission={permission}
          onRespond={respond}
          isResponding={false}
          responseError={null}
        />
      </QueryClientProvider>,
    ),
  );
  return within(container);
}
function install(translate: PluginContentTranslatorContribution["translate"], revision = "one") {
  registry.plugins = [
    {
      id: "translation",
      serverId: "host",
      contentTranslators: [{ id: "questions", revision, translate }],
    },
  ];
}
function click(name: string, role = "button") {
  act(() => within(container).getByRole(role, { name }).click());
}

it("translates a paged question, preserves choices across original toggle and submits canonical answers", async () => {
  const translate = vi.fn(async (texts: string[]) => texts.map((text) => dictionary[text] ?? text));
  install(translate);
  await page.viewport(393, 852);
  const view = render();
  await vi.waitFor(() => expect(view.getByRole("checkbox", { name: "中国大陆" })).toBeVisible());
  await act(async () => {
    await i18n.changeLanguage("zh-CN");
  });
  await page.screenshot({
    path: "../../.vitest-screenshots/conversation-translation-question-phone.png",
  });
  await act(async () => {
    await i18n.changeLanguage("en");
  });
  expect(view.getByRole("tab", { name: /主体/ })).toBeVisible();
  expect(view.getByPlaceholderText("其他国家")).toBeVisible();
  click("中国大陆", "checkbox");
  click("Show original");
  expect(view.getByRole("checkbox", { name: "Mainland China" }).getAttribute("aria-checked")).toBe(
    "true",
  );
  click("Show translation");
  expect(view.getByRole("checkbox", { name: "中国大陆" }).getAttribute("aria-checked")).toBe(
    "true",
  );
  click("Next");
  click("美国", "radio");
  click("Submit");
  expect(respond.mock.calls[0][0].updatedInput.answers).toEqual({
    Entity: "Mainland China",
    Hosting: "US",
  });
  expect(translate).toHaveBeenCalledTimes(1);
});

it("shows retry while preserving the usable original question after failure", async () => {
  const translate = vi
    .fn<PluginContentTranslatorContribution["translate"]>()
    .mockRejectedValueOnce(new Error("unavailable"))
    .mockImplementation(async (texts) => texts.map((text) => dictionary[text] ?? text));
  install(translate);
  const view = render();
  await vi.waitFor(() =>
    expect(view.getByRole("alert").textContent).toContain("Translation failed"),
  );
  click("Mainland China", "checkbox");
  click("Retry");
  await vi.waitFor(() =>
    expect(view.getByRole("checkbox", { name: "中国大陆" }).getAttribute("aria-checked")).toBe(
      "true",
    ),
  );
  expect(view.queryByRole("alert")).toBeNull();
});

it("drops old translations on model changes and plugin removal without resetting the answer", async () => {
  install(async (texts) => texts.map((text) => dictionary[text] ?? text));
  const view = render();
  await vi.waitFor(() => expect(view.getByRole("checkbox", { name: "中国大陆" })).toBeVisible());
  click("中国大陆", "checkbox");
  let finish!: (texts: string[]) => void;
  install(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
    "two",
  );
  render();
  expect(view.getByRole("checkbox", { name: "Mainland China" }).getAttribute("aria-checked")).toBe(
    "true",
  );
  registry.plugins = [];
  render();
  await act(async () => finish(Object.keys(dictionary).map((text) => dictionary[text])));
  expect(view.getByRole("checkbox", { name: "Mainland China" }).getAttribute("aria-checked")).toBe(
    "true",
  );
  expect(view.queryByRole("button", { name: "Show original" })).toBeNull();
});

it("translates plan prose while the approval action keeps its original payload", async () => {
  install(async (texts) =>
    texts.map((text) =>
      text.replace("Implement the change", "实现修改").replace("Review the proposal", "检查方案"),
    ),
  );
  act(() =>
    root.render(
      <QueryClientProvider client={queryClient}>
        <TranslatedPlanCard
          serverId="host"
          text="Implement the change"
          description="Review the proposal"
          footer={planFooter}
        />
      </QueryClientProvider>,
    ),
  );
  const view = within(container);
  await vi.waitFor(() => expect(view.getByText("实现修改")).toBeVisible());
  expect(view.getByText("检查方案")).toBeVisible();
  click("Show original");
  expect(view.getByText("Implement the change")).toBeVisible();
  click("Approve");
  expect(approve).toHaveBeenCalledTimes(1);
});
