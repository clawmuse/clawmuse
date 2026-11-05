import { brand } from "@/brand.generated";

// Rebrand standalone product names, preserving paths, URLs and technical identifiers.
export function formatErrorMessage(message: string): string {
  return message
    .replace(/(?:Error: )?Error invoking remote method '[^']+':\s*(?:Error:\s*)?/g, "")
    .replace(/(?<![\w./\\:@-])paseo(?![\w./\\:@-])/gi, brand.name);
}

export function toErrorMessage(error: unknown): string {
  return formatErrorMessage(error instanceof Error ? error.message : String(error));
}
