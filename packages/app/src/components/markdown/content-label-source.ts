/** Labels are literal text, including Markdown punctuation, entities and URLs. */
export function contentLabelSource(text: string): string {
  const label = text.replace(/\s+/g, " ").trim();
  return label ? label.replace(/[!-/:-@[-`{-~]/g, "\\$&") : "";
}
