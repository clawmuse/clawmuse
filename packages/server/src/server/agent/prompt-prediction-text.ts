// Ported from makecindy/cindy@da94e838e (Apache-2.0), promptPrediction.ts.
// Electron/database ownership is supplied by prompt-prediction-runtime.ts.
const PREDICTION_CONTEXT_MAX_CHARS = 2000;
const PREDICTION_USER_MSG_MAX = 400;
const PREDICTION_ASSISTANT_MSG_MAX = 600;
interface SlimMessage {
  role: string;
  content: string;
}

export function buildConversationContext(messages: SlimMessage[], maxPairs: number): string {
  const conversational = messages.filter((m) => m.role === "user" || m.role === "assistant");
  // 从末尾往前取 maxPairs*2 条(user+assistant)
  const recent = conversational.slice(-maxPairs * 2);
  if (recent.length === 0) return "";

  const lines: string[] = [];
  for (const m of recent) {
    const maxChars = m.role === "user" ? PREDICTION_USER_MSG_MAX : PREDICTION_ASSISTANT_MSG_MAX;
    const text = m.content.replace(/\s+/g, " ").trim();
    // 保留首尾:Assistant 长回复的结尾通常包含总结/待确认问题/下一步建议,
    // 仅保留开头会丢失关键上下文。
    let truncated = text;
    if (text.length > maxChars) {
      truncated = text.slice(0, maxChars);
      if (m.role === "assistant") {
        truncated =
          text.slice(0, Math.floor(maxChars * 0.4)) +
          " … " +
          text.slice(-Math.floor(maxChars * 0.6));
      }
    }
    if (!truncated) continue;
    lines.push(`${m.role === "user" ? "User" : "Assistant"}: ${truncated}`);
  }
  // 超长时从最旧侧裁剪，保留最新对话（刚完成的回复与结尾指令不丢失）。
  const context = lines.join("\n");
  return context.length > PREDICTION_CONTEXT_MAX_CHARS
    ? context.slice(-PREDICTION_CONTEXT_MAX_CHARS)
    : context;
}

function escapeReferenceData(value: string): string {
  return value.replace(/[&<>]/gu, (char) => {
    if (char === "&") return "&amp;";
    if (char === "<") return "&lt;";
    return "&gt;";
  });
}

export function buildPredictionPrompt(
  context: string,
  locale: string,
  workingDir?: string,
): { system: string; user: string } {
  const languageHints: Record<string, string> = {
    "zh-CN": "Match the user's language. The user types in Simplified Chinese.",
    "zh-TW": "Match the user's language. The user types in Traditional Chinese.",
    en: "Match the user's language. The user types in English.",
    ja: "Match the user's language. The user types in Japanese.",
    ko: "Match the user's language. The user types in Korean.",
  };
  const wdLine = workingDir
    ? `Current working directory: ${escapeReferenceData(workingDir)}`
    : null;

  // 系统指令写入各辅助供应商对应的 system/instructions 段（Anthropic
  // Messages API 使用顶层 system 字段），不混入 user message，避免被
  // Anthropic API 拒绝。该固定指令有意随共享辅助链发送到所有支持的路由。
  const system = [
    "You are a terse predictive text engine for a coding chat input.",
    "Return only the predicted next user message — no quotes, markdown, commentary, or multiple options.",
    "Keep it under 140 characters. Make it actionable for a coding agent.",
    languageHints[locale] ?? "Match the user's language and tone.",
  ].join("\n");

  const user = [
    "Predict the next message the user is likely to type.",
    wdLine,
    "",
    "<recent_conversation>",
    escapeReferenceData(context),
    "</recent_conversation>",
    "",
    "Return exactly one concise user prompt.",
    "Match the user's tone, brevity, phrasing, and terminology based on their recent messages.",
    "Do not copy prior messages verbatim.",
    "Make it actionable.",
    "Keep it under 140 characters.",
    "No quotes, markdown, commentary, explanations, or multiple options.",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  return { system, user };
}
