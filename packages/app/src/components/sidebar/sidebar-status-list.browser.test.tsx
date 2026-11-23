import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getByText } from "@testing-library/dom";
import type { SidebarWorkspaceGroup } from "@/components/sidebar/sidebar-labels";
import type { StatusBucket } from "@/hooks/sidebar-status-view-model";
import type { SidebarWorkspaceEntry } from "@/hooks/use-sidebar-workspaces-list";
import { i18n as testI18n } from "@/i18n/i18next";
import { MIN_SIDEBAR_WIDTH } from "@/stores/panel-store";
import { resolveStatusGroupCountPresentation, StatusGroupHeader } from "./sidebar-status-list";

beforeEach(() => vi.stubGlobal("React", React));

interface Mounted {
  root: Root;
  container: HTMLDivElement;
}

const mounted: Mounted[] = [];

afterEach(async () => {
  for (const entry of mounted.splice(0)) {
    act(() => entry.root.unmount());
    entry.container.remove();
  }
  await testI18n.changeLanguage("en");
});

function makeWorkspaceEntry(index: number, bucket: StatusBucket): SidebarWorkspaceEntry {
  return {
    workspaceKey: `srv:ws-${index}`,
    serverId: "srv",
    workspaceId: `ws-${index}`,
    projectViewKey: "proj",
    projectName: "Project",
    workspaceDirectory: `/tmp/ws-${index}`,
    workspaceDirectoryLabel: `~/ws-${index}`,
    projectKind: "git",
    workspaceKind: "worktree",
    name: `ws-${index}`,
    title: null,
    currentBranch: null,
    statusBucket: bucket,
    statusEnteredAt: null,
    archivingAt: null,
    diffStat: null,
    prHint: null,
    archiveHasUncommittedChanges: null,
    archiveUnpushedCommitCount: null,
    scripts: [],
    hasRunningScripts: false,
  };
}

function makeGroup(bucket: StatusBucket, count: number, label: string): SidebarWorkspaceGroup {
  return {
    key: bucket,
    label,
    rows: Array.from({ length: count }, (_, index) => makeWorkspaceEntry(index, bucket)),
    leading: { kind: "status", bucket },
  };
}

function mountHeader(input: {
  bucket: StatusBucket;
  count: number;
  label: string;
  collapsed: boolean;
  width?: number;
}): HTMLElement {
  const container = document.createElement("div");
  container.style.width = `${input.width ?? 320}px`;
  document.body.appendChild(container);
  const root = createRoot(container);
  const group = makeGroup(input.bucket, input.count, input.label);

  act(() => {
    root.render(<StatusGroupHeader group={group} collapsed={input.collapsed} />);
  });
  mounted.push({ root, container });

  const header = container.querySelector(`[data-testid="sidebar-status-group-${input.bucket}"]`);
  if (!(header instanceof HTMLElement)) {
    throw new Error(`StatusGroupHeader did not render for ${input.bucket}`);
  }
  return header;
}

function parseColor(value: string): { rgb: string; alpha: number } {
  const channels = value.match(/[\d.]+/g)?.map(Number) ?? [];
  return { rgb: channels.slice(0, 3).join(","), alpha: channels[3] ?? 1 };
}

describe("resolveStatusGroupCountPresentation", () => {
  it.each([
    ["needs_input", false, { kind: "pill", label: "3", variant: "warning" }],
    ["needs_input", true, { kind: "pill", label: "3", variant: "warning" }],
    ["failed", false, { kind: "pill", label: "3", variant: "error" }],
    ["failed", true, { kind: "pill", label: "3", variant: "error" }],
    ["running", false, { kind: "pill", label: "3", variant: "running" }],
    ["running", true, { kind: "pill", label: "3", variant: "running" }],
    ["attention", false, { kind: "pill", label: "3", variant: "muted" }],
    ["attention", true, { kind: "pill", label: "3", variant: "muted" }],
    ["done", false, null],
    ["done", true, { kind: "plain", label: "3" }],
  ] as const)("maps %s (collapsed=%s)", (bucket, collapsed, expected) => {
    expect(resolveStatusGroupCountPresentation({ bucket, count: 3, collapsed })).toEqual(expected);
  });

  it("returns null when count is 0", () => {
    for (const bucket of ["needs_input", "failed", "attention", "running", "done"] as const) {
      expect(resolveStatusGroupCountPresentation({ bucket, count: 0, collapsed: true })).toBeNull();
    }
  });
});

describe("StatusGroupHeader", () => {
  it("renders a left-aligned blue semantic micro-pill beside the running label", () => {
    const header = mountHeader({
      bucket: "running",
      count: 5,
      label: "运行中",
      collapsed: false,
      width: 320,
    });
    const countSlot = header.querySelector('[data-testid="sidebar-status-group-count-running"]');
    if (!(countSlot instanceof HTMLElement)) {
      throw new Error("Running count slot did not render");
    }
    const pill = countSlot.firstElementChild;
    const pillText = pill?.lastElementChild;
    if (!(pill instanceof HTMLElement) || !(pillText instanceof HTMLElement)) {
      throw new Error("Running StatusBadge did not render");
    }

    expect(pillText.textContent).toBe("5");
    expect(getComputedStyle(pillText).color).toBe("rgb(29, 78, 216)");
    const fill = parseColor(getComputedStyle(pill).backgroundColor);
    expect(fill.rgb).toBe("29,78,216");
    expect(fill.alpha).toBeGreaterThan(0);
    expect(fill.alpha).toBeLessThan(0.5);

    const titleEl = getByText(header, "运行中");
    const headerRect = header.getBoundingClientRect();
    const titleRect = titleEl.getBoundingClientRect();
    const countRect = countSlot.getBoundingClientRect();

    expect(countRect.left).toBeGreaterThanOrEqual(titleRect.right);
    expect(countRect.left - titleRect.right).toBeLessThanOrEqual(16);
    expect(countRect.right).toBeLessThan(headerRect.right - 80);
  });

  it("hides the done count when expanded and renders plain text when collapsed", () => {
    const expandedHeader = mountHeader({
      bucket: "done",
      count: 5,
      label: "已完成",
      collapsed: false,
    });
    expect(
      expandedHeader.querySelector('[data-testid="sidebar-status-group-count-done"]'),
    ).toBeNull();

    const collapsedHeader = mountHeader({
      bucket: "done",
      count: 5,
      label: "已完成",
      collapsed: true,
    });
    const countSlot = collapsedHeader.querySelector(
      '[data-testid="sidebar-status-group-count-done"]',
    );
    if (!(countSlot instanceof HTMLElement)) {
      throw new Error("Collapsed done count did not render");
    }
    const plainText = countSlot.firstElementChild;
    if (!(plainText instanceof HTMLElement)) {
      throw new Error("Collapsed done plain text did not render");
    }
    expect(plainText.textContent).toBe("5");
    expect(parseColor(getComputedStyle(plainText).backgroundColor).alpha).toBe(0);
    expect(parseColor(getComputedStyle(countSlot).backgroundColor).alpha).toBe(0);
  });

  it("keeps the count pill inside the header in a 200px sidebar with a long label", () => {
    const header = mountHeader({
      bucket: "needs_input",
      count: 12,
      label: "需要立即人工输入并且名称特别长的状态分组标题",
      collapsed: false,
      width: MIN_SIDEBAR_WIDTH,
    });
    const countSlot = header.querySelector(
      '[data-testid="sidebar-status-group-count-needs_input"]',
    );
    if (!(countSlot instanceof HTMLElement)) {
      throw new Error("Needs input count slot did not render");
    }

    const headerRect = header.getBoundingClientRect();
    const countRect = countSlot.getBoundingClientRect();
    expect(countRect.right).toBeLessThanOrEqual(headerRect.right);
  });
});
