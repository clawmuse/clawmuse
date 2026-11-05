export class TranslationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TranslationError";
  }
}

// Protect literals before asking the model. A prompt alone cannot preserve executable text.
const literals =
  /(^[ \t]*(`{3,}|~{3,})[^\n]*(?:\n|$)[\s\S]*?(?:^[ \t]*\2[ \t]*(?=\n|$)|(?![\s\S])))|(`+)[^\n]*?\3|https?:\/\/[^\s<>\])]+|(?:[A-Za-z]:\\|\.{0,2}\/|~\/)[^\s<>`"'，。；：！？]+|\b[\w@.-]+(?:\/[\w@.\-\u4e00-\u9fff]+)+|\b[\w.-]+\.(?:tsx?|jsx?|json|md|py|sh|yaml|yml|toml|css|html)\b|^[ \t]*(?:\$ |(?:npm|npx|pnpm|yarn|git|docker|curl|sudo|pip|python3?|node|cd|ls|rm|mkdir) )[^\n]*$/gm;

function jsonEnd(source: string, start: number): number | null {
  const stack: string[] = [];
  let quoted = false;
  let escaped = false;
  for (let i = start; i < source.length; i++) {
    const char = source[i]!;
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === "{" || char === "[") stack.push(char);
    else if (char === "}" || char === "]") {
      const expected = char === "}" ? "{" : "[";
      if (stack.pop() !== expected) return null;
      if (!stack.length) return i + 1;
    }
  }
  return null;
}

export function protectLiterals(source: string, markerPrefix = "PASEO_LITERAL_") {
  let prefix = markerPrefix;
  while (source.includes(prefix)) prefix += "X_";
  const values: string[] = [];
  function protect(value: string) {
    const token = `${prefix}${values.length}_END`;
    values.push(value);
    return token;
  }
  let text = "";
  for (let i = 0; i < source.length; ) {
    const end = source[i] === "{" || source[i] === "[" ? jsonEnd(source, i) : null;
    if (end !== null) {
      const value = source.slice(i, end);
      try {
        JSON.parse(value);
        text += protect(value);
        i = end;
        continue;
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
      }
    }
    text += source[i];
    i++;
  }
  // Nested markers can occur when a JSON literal was protected inside a code fence.
  text = text.replace(literals, protect);
  return {
    text,
    prose: text.replace(new RegExp(`${prefix}\\d+_END`, "g"), ""),
    restore(translated: string): string {
      const marker = new RegExp(`${prefix}\\d+_END`, "g");
      if (JSON.stringify(translated.match(marker)) !== JSON.stringify(text.match(marker))) {
        throw new TranslationError("翻译改变了代码或路径标记，请重试");
      }
      let restored = translated;
      for (let i = values.length - 1; i >= 0; i--) {
        const token = `${prefix}${i}_END`;
        if (restored.split(token).length !== 2) {
          throw new TranslationError("翻译改变了代码或路径标记，请重试");
        }
        restored = restored.replace(token, () => values[i]!);
      }
      if (restored.includes(prefix)) throw new TranslationError("翻译返回了无效的内容标记");
      return restored;
    },
  };
}

export function protectFields(sources: string[]) {
  let prefix = "PASEO_LITERAL_";
  while (sources.some((source) => source.includes(prefix))) prefix += "X_";
  const fields = sources.map((source, index) =>
    protectLiterals(source, `${prefix}FIELD_${index}_`),
  );
  const boundaries = fields.slice(1).map((_, index) => `${prefix}BOUNDARY_${index}_END`);
  const marker = new RegExp(`${prefix}BOUNDARY_\\d+_END`, "g");
  return {
    text: fields
      .map((field, index) => (index ? `${boundaries[index - 1]}\n\n${field.text}` : field.text))
      .join("\n\n"),
    prose: fields.map((field) => field.prose).join("\n"),
    restore(translated: string): string {
      if (JSON.stringify(translated.match(marker) ?? []) !== JSON.stringify(boundaries)) {
        throw new TranslationError("翻译改变了问题或选项顺序，请重试");
      }
      const parts = translated.split(marker);
      const restored = fields.map((field, index) => field.restore(parts[index]!.trim()));
      if (restored.some((field) => field.includes(prefix))) {
        throw new TranslationError("翻译返回了无效的内容标记");
      }
      if (restored.some((field, index) => sources[index]!.trim() && !field)) {
        throw new TranslationError("翻译丢失了问题或选项，请重试");
      }
      return JSON.stringify(restored);
    },
  };
}
