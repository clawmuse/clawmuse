export interface Paragraph {
  start: number;
  text: string;
  complete: boolean;
}

// Only finalized paragraphs are translated during streaming, never a growing token prefix.
export function paragraphs(text: string, phase: "streaming" | "complete"): Paragraph[] {
  const result: Paragraph[] = [];
  let start = 0;
  let offset = 0;
  let fence: string | null = null;
  for (const line of text.match(/[^\n]*\n|[^\n]+$/g) ?? []) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) {
      if (!fence) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
    }
    offset += line.length;
    if (!fence && /^\s*\n$/.test(line)) {
      result.push({ start, text: text.slice(start, offset), complete: true });
      start = offset;
    }
  }
  if (start < text.length)
    result.push({ start, text: text.slice(start), complete: phase === "complete" });
  return result;
}
