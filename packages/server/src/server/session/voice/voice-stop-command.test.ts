import { describe, expect, test } from "vitest";
import { isExplicitStopCommand } from "./voice-stop-command.js";

describe("isExplicitStopCommand", () => {
  test.each([
    "停",
    "停下。",
    "停一下吧",
    "好，先停一下",
    "别做了！",
    "算了",
    "取消",
    "Stop.",
    "stop it",
    "Never mind",
  ])("treats %j as a stop command", (text) => {
    expect(isExplicitStopCommand(text)).toBe(true);
  });

  test.each([
    "",
    "   ",
    "现在做得怎么样了？",
    "停一下，先看看这个文件",
    "你的状态为什么又断开了？",
    "不要停，继续做",
    "Sir, sir, you're requested to sit please.",
    "stop the server and restart it",
  ])("delivers %j as a normal message", (text) => {
    expect(isExplicitStopCommand(text)).toBe(false);
  });
});
