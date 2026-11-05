import type { MutableDaemonConfig } from "@getpaseo/protocol/messages";
import { describe, expect, it } from "vitest";
import { i18n } from "@/i18n/i18next";
import {
  createBrowserToolsPatch,
  getBrowserToolsCardState,
  getBrowserToolsMutationViewState,
} from "./browser-tools-config";

function makeConfig(browserToolsEnabled = false): MutableDaemonConfig {
  return {
    relay: { enabled: false },
    mcp: { injectIntoAgents: false },
    browserTools: { enabled: browserToolsEnabled },
    providers: {},
    metadataGeneration: { providers: [] },
    autoArchiveAfterMerge: false,
    enableTerminalAgentHooks: false,
    appendSystemPrompt: "",
  };
}

describe("browser tools opt-in config", () => {
  it("uses Chinese for the browser access warning and pending feedback", async () => {
    await i18n.changeLanguage("zh-CN");
    try {
      expect(getBrowserToolsCardState({ isConnected: true, config: makeConfig(false) })).toEqual({
        isVisible: true,
        isEnabled: false,
        title: "浏览器工具",
        warning:
          "允许代理访问和控制 ClawMuse 的浏览器标签页，包括已登录的账号状态。请仅为你信任的代理启用。",
      });
      expect(getBrowserToolsMutationViewState({ isPending: true, error: null })).toEqual({
        isSwitchDisabled: true,
        loadingText: "正在更新浏览器工具…",
        errorText: null,
      });
    } finally {
      await i18n.changeLanguage("en");
    }
  });
  it("shows the card with the logged-in browser state warning when connected", () => {
    expect(getBrowserToolsCardState({ isConnected: true, config: makeConfig(false) })).toEqual({
      isVisible: true,
      isEnabled: false,
      title: "Browser tools",
      warning:
        "Allow agents to access and control ClawMuse browser tabs, including logged-in browser state. Only enable this for agents you trust.",
    });
  });

  it("reads enabled state from daemon config", () => {
    expect(getBrowserToolsCardState({ isConnected: true, config: makeConfig(true) })).toMatchObject(
      {
        isEnabled: true,
      },
    );
  });

  it("hides the card when the host is disconnected", () => {
    expect(
      getBrowserToolsCardState({ isConnected: false, config: makeConfig(true) }),
    ).toMatchObject({
      isVisible: false,
    });
  });

  it("writes daemon.browserTools.enabled when toggled", () => {
    expect(createBrowserToolsPatch(true)).toEqual({ browserTools: { enabled: true } });
    expect(createBrowserToolsPatch(false)).toEqual({ browserTools: { enabled: false } });
  });

  it("shows loading and disables the toggle while browser tool settings save", () => {
    expect(getBrowserToolsMutationViewState({ isPending: true, error: null })).toEqual({
      isSwitchDisabled: true,
      loadingText: "Updating browser tools…",
      errorText: null,
    });
  });

  it("shows the save error when browser tool settings fail", () => {
    expect(
      getBrowserToolsMutationViewState({ isPending: false, error: new Error("Disk full") }),
    ).toEqual({
      isSwitchDisabled: false,
      loadingText: null,
      errorText: "Disk full",
    });
  });
});
