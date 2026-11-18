import { randomUUID } from "node:crypto";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ProviderPrompt } from "@getpaseo/plugin/server/provider";
import { AntigravityError } from "./wire.js";

export interface EncodedPrompt {
  text: string;
  nativeText: string;
}

export class PromptFiles {
  private directory: string | null = null;
  private readonly attachedPaths = new Set<string>();

  get directoryPath(): string | null {
    return this.directory;
  }

  get additionalDirectories(): string[] {
    const dirs = new Set<string>();
    if (this.directory) dirs.add(this.directory);
    for (const filePath of this.attachedPaths) {
      dirs.add(path.dirname(filePath));
    }
    return [...dirs];
  }

  ownsPath(candidatePath: string): boolean {
    const resolvedCandidate = path.resolve(candidatePath);
    if (this.attachedPaths.has(resolvedCandidate)) return true;
    if (!this.directory) return false;
    const resolvedDir = path.resolve(this.directory);
    return (
      resolvedCandidate === resolvedDir || resolvedCandidate.startsWith(`${resolvedDir}${path.sep}`)
    );
  }

  async encode(prompt: ProviderPrompt): Promise<EncodedPrompt> {
    if (prompt.delivery === "steer" || prompt.outputSchema !== undefined) {
      throw new AntigravityError(
        "Antigravity supports standard messages and slash commands only",
        "UNSUPPORTED_PROMPT",
      );
    }
    if (prompt.input.type === "command") {
      const args = prompt.input.arguments.trim();
      const commandText = args ? `/${prompt.input.name} ${args}` : `/${prompt.input.name}`;
      return { text: commandText, nativeText: commandText };
    }
    const parts = prompt.input.content.map((part) => {
      if (part.type === "text" || part.type === "uploaded_file") return part;
      if (part.type === "image") return { ...part, extension: imageExtension(part.mimeType) };
      throw new AntigravityError(
        "Antigravity supports text, image and uploaded file content only",
        "UNSUPPORTED_CONTENT",
      );
    });
    const text: string[] = [];
    const native: string[] = [];
    for (const part of parts) {
      if (part.type === "text") {
        text.push(part.text);
        native.push(part.text);
      } else if (part.type === "image") {
        const extension = part.extension;
        if (this.directory === null) {
          this.directory = await mkdtemp(path.join(os.tmpdir(), "paseo-antigravity-images-"));
          await chmod(this.directory, 0o700);
        }
        const file = path.join(this.directory, `${randomUUID()}.${extension}`);
        await writeFile(file, Buffer.from(part.data, "base64"), { flag: "wx", mode: 0o600 });
        await chmod(file, 0o600);
        this.attachedPaths.add(path.resolve(file));
        native.push(`Attached image: ${file}`);
      } else if (part.type === "uploaded_file") {
        this.attachedPaths.add(path.resolve(part.path));
        if (part.mimeType.startsWith("image/")) {
          native.push(`Attached image: ${part.path}`);
        } else {
          const reference = [
            `Uploaded file: ${part.fileName}`,
            `Path: ${part.path}`,
            `MIME: ${part.mimeType}`,
            `Size: ${part.size} bytes`,
          ].join("\n");
          text.push(reference);
          native.push(reference);
        }
      }
    }
    return { text: text.join("\n"), nativeText: native.join("\n") };
  }

  async close(): Promise<void> {
    this.attachedPaths.clear();
    if (this.directory !== null) {
      await rm(this.directory, { recursive: true, force: true });
      this.directory = null;
    }
  }
}

function imageExtension(mimeType: string): string {
  const match = /^image\/([a-z0-9][a-z0-9.+-]*)$/i.exec(mimeType);
  if (!match) {
    throw new AntigravityError(
      `Expected an image MIME type, received ${mimeType}`,
      "INVALID_IMAGE_MIME",
    );
  }
  const subtype = match[1].toLowerCase();
  if (subtype === "jpeg") return "jpg";
  if (subtype === "svg+xml") return "svg";
  return subtype;
}
