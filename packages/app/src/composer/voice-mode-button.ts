/**
 * 输入框右侧的「语音对话」按钮什么时候出现。
 * canStartVoice：已有 agent，或者宿主能先建 agent 再开语音（新建对话的草稿页）。
 * 以前只认「已有 agent」，新建对话时这个按钮不出现，只能先打字发一条才能开口。
 */
export function shouldShowVoiceModeButton(input: {
  showVoice: boolean;
  isVoiceModeForAgent: boolean;
  canStartVoice: boolean;
  isAgentRunning: boolean;
  isCompact: boolean;
  hasSendableContent: boolean;
}): boolean {
  // 窄屏上已经打了字时让位给发送按钮
  const hideVoiceForCompactInput = input.isCompact && input.hasSendableContent;
  return (
    input.showVoice &&
    !input.isVoiceModeForAgent &&
    input.canStartVoice &&
    !input.isAgentRunning &&
    !hideVoiceForCompactInput
  );
}
