import { afterEach, expect, test } from "vitest";
import { i18n } from "@/i18n/i18next";
import { formatErrorMessage, toErrorMessage } from "./error-messages";

afterEach(async () => {
  await i18n.changeLanguage("en");
});

const mismatch =
  "This chat uses openai, but your current provider is magpie. Switch to openai to continue.";

test("localizes provider conflicts and preserves provider identifiers", async () => {
  await i18n.changeLanguage("zh-CN");
  const expected =
    "这条对话使用的模型服务商是 openai，当前已切换为 magpie。请切回 openai 后继续，或使用 magpie 新建对话。";
  expect(formatErrorMessage(mismatch)).toBe(expected);
  expect(
    toErrorMessage(
      Object.assign(
        new Error(`${mismatch} requestType=agent_permission_response code=handler_error`),
        {
          userMessage: `Request failed: ${mismatch}`,
        },
      ),
    ),
  ).toBe(expected);
  await i18n.changeLanguage("en");
  expect(formatErrorMessage(mismatch)).toBe(
    "This conversation uses openai, but the current model provider is magpie. Switch back to openai to continue, or start a new conversation with magpie.",
  );
});

test("uses typed connection failures without exposing technical IDs", async () => {
  await i18n.changeLanguage("zh-CN");
  expect(
    toErrorMessage(
      Object.assign(new Error("Transport closed (code 1005)"), {
        code: "DAEMON_CONNECTION_LOST",
      }),
    ),
  ).toBe("与主机的连接已中断。请等待重新连接后再试。");
  expect(
    toErrorMessage(
      Object.assign(new Error("Request req-123 timed out"), {
        code: "DAEMON_REQUEST_TIMEOUT",
      }),
    ),
  ).toBe("主机响应超时，暂时无法确认操作是否成功。请检查连接和会话状态后再试。");
});

test("does not reinterpret unknown errors, quoted output, or contradictory provider guidance", async () => {
  await i18n.changeLanguage("zh-CN");
  for (const message of [
    "Unknown provider error: /tmp/model.json",
    `Tool output: ${mismatch}`,
    mismatch.replace("Switch to openai", "Switch to different-provider"),
  ]) {
    expect(formatErrorMessage(message)).toBe(message);
  }
  expect(
    toErrorMessage(
      Object.assign(new Error("debug metadata"), {
        userMessage: "Unknown provider error",
      }),
    ),
  ).toBe("Unknown provider error");
});
