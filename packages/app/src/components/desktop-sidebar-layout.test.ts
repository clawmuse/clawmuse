import { describe, expect, it } from "vitest";
import {
  canDesktopAppSidebarShare,
  resolveDesktopAppChromeLayout,
  resolveDesktopAppContentMinimum,
  resolveDesktopSidebarVisibility,
  resolveDesktopSidebarWidth,
  resolveDesktopSidebarScale,
  resolveDesktopSidebarToggleScale,
} from "@/components/desktop-sidebar-layout";

describe("desktop sidebar layout", () => {
  it("scales narrow navigation continuously while keeping text at a readable minimum", () => {
    expect(resolveDesktopSidebarScale(140)).toBe(0.7);
    expect(resolveDesktopSidebarScale(230)).toBeCloseTo(0.85);
    expect(resolveDesktopSidebarScale(320)).toBe(1);
    expect(resolveDesktopSidebarScale(600)).toBe(1);
    expect(resolveDesktopSidebarScale(80)).toBe(0.7);
  });
  it("scales the window toggle only when it shares the sidebar without native window controls", () => {
    const input = { contentWidth: 140, sidebarVisible: true, hasTopLeftWindowControls: false };
    expect(resolveDesktopSidebarToggleScale(input)).toBe(0.7);
    expect(resolveDesktopSidebarToggleScale({ ...input, sidebarVisible: false })).toBe(1);
    expect(resolveDesktopSidebarToggleScale({ ...input, hasTopLeftWindowControls: true })).toBe(1);
  });
  it("keeps a retained sidebar hidden while app chrome is suppressed", () => {
    expect(
      resolveDesktopSidebarVisibility({
        chromeEnabled: false,
        isCompactLayout: false,
        isMounted: true,
        isOpen: true,
        canShare: true,
      }),
    ).toBe(false);
  });

  it("keeps the sidebar toggle window-owned on every desktop", () => {
    expect(
      resolveDesktopAppChromeLayout({
        desktopSidebarRendered: true,
        hasTopLeftWindowControls: true,
        sidebarControlsEnabled: true,
      }),
    ).toEqual({
      sidebarCorners: "top-left",
      contentCorners: "top-right",
      sidebarToggleOwner: "window",
    });
    expect(
      resolveDesktopAppChromeLayout({
        desktopSidebarRendered: true,
        hasTopLeftWindowControls: false,
        sidebarControlsEnabled: true,
      }),
    ).toEqual({
      sidebarCorners: "none",
      contentCorners: "both",
      sidebarToggleOwner: "window",
    });
    expect(
      resolveDesktopAppChromeLayout({
        desktopSidebarRendered: false,
        hasTopLeftWindowControls: true,
        sidebarControlsEnabled: true,
      }),
    ).toEqual({
      sidebarCorners: "none",
      contentCorners: "both",
      sidebarToggleOwner: "window",
    });
  });

  it("hides the window-owned sidebar toggle when app chrome is suppressed", () => {
    expect(
      resolveDesktopAppChromeLayout({
        desktopSidebarRendered: false,
        hasTopLeftWindowControls: true,
        sidebarControlsEnabled: false,
      }).sidebarToggleOwner,
    ).toBe("none");
  });

  it("clamps a persisted wide sidebar to preserve the center pane", () => {
    const atHalfScreen = resolveDesktopSidebarWidth({ requestedWidth: 600, viewportWidth: 751 });
    expect(atHalfScreen).toBe(351);
    expect(751 - atHalfScreen).toBe(400);

    const atBreakpoint = resolveDesktopSidebarWidth({ requestedWidth: 600, viewportWidth: 720 });
    expect(atBreakpoint).toBe(320);
    expect(720 - atBreakpoint).toBe(400);

    expect(resolveDesktopSidebarWidth({ requestedWidth: 600, viewportWidth: 1440 })).toBe(600);
  });

  it("lets foldable sidebars shrink to 140 points without losing the center minimum", () => {
    expect(resolveDesktopSidebarWidth({ requestedWidth: 80, viewportWidth: 720 })).toBe(140);
    expect(resolveDesktopSidebarWidth({ requestedWidth: 140, viewportWidth: 720 })).toBe(140);
    expect(resolveDesktopSidebarWidth({ requestedWidth: 600, viewportWidth: 600 })).toBe(200);
  });

  it("yields app navigation when settings needs the shell width", () => {
    const settingsMinimum = resolveDesktopAppContentMinimum({ isSettingsRoute: true });
    expect(settingsMinimum).toBe(720);
    expect(
      canDesktopAppSidebarShare({
        contentMinimumWidth: settingsMinimum,
        requestedSidebarWidth: 320,
        viewportWidth: 751,
      }),
    ).toBe(false);
  });

  it("imposes no content minimum outside settings", () => {
    expect(resolveDesktopAppContentMinimum({ isSettingsRoute: false })).toBe(0);
    expect(
      canDesktopAppSidebarShare({
        contentMinimumWidth: resolveDesktopAppContentMinimum({ isSettingsRoute: false }),
        requestedSidebarWidth: 320,
        viewportWidth: 751,
      }),
    ).toBe(true);
  });
});

it("reserves room for Explorer and the workspace before showing app navigation", () => {
  const contentMinimumWidth = resolveDesktopAppContentMinimum({
    isSettingsRoute: false,
    explorerVisible: true,
  });
  expect(contentMinimumWidth).toBe(600);
  expect(
    canDesktopAppSidebarShare({
      contentMinimumWidth,
      requestedSidebarWidth: 320,
      viewportWidth: 744,
    }),
  ).toBe(false);
  expect(
    canDesktopAppSidebarShare({
      contentMinimumWidth,
      requestedSidebarWidth: 320,
      viewportWidth: 951,
    }),
  ).toBe(true);
});
