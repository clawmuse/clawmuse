import { describe, expect, it } from "vitest";
import { shouldShowVoiceModeButton } from "./voice-mode-button";

const base = {
  showVoice: true,
  isVoiceModeForAgent: false,
  canStartVoice: true,
  isAgentRunning: false,
  isCompact: true,
  hasSendableContent: false,
};

describe("shouldShowVoiceModeButton", () => {
  it("shows on a new conversation draft that can create its agent for voice", () => {
    expect(shouldShowVoiceModeButton(base)).toBe(true);
  });

  it("hides when there is no agent and the host cannot create one", () => {
    expect(shouldShowVoiceModeButton({ ...base, canStartVoice: false })).toBe(false);
  });

  it("hides while voice mode is already on, or the agent is mid-turn", () => {
    expect(shouldShowVoiceModeButton({ ...base, isVoiceModeForAgent: true })).toBe(false);
    expect(shouldShowVoiceModeButton({ ...base, isAgentRunning: true })).toBe(false);
  });

  it("gives way to the send button on compact layouts once text is typed", () => {
    expect(shouldShowVoiceModeButton({ ...base, hasSendableContent: true })).toBe(false);
    expect(shouldShowVoiceModeButton({ ...base, isCompact: false, hasSendableContent: true })).toBe(
      true,
    );
  });
});
