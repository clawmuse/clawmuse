import { brand } from "@/brand.generated";
import { i18n } from "@/i18n/i18next";

// Rebrand standalone product names, preserving paths, URLs and technical identifiers.
export function formatErrorMessage(message: string): string {
  const mismatch =
    /^(?:Request failed: )?This chat uses ([\w.-]+), but your current provider is ([\w.-]+)\. Switch to \1 to continue\.$/.exec(
      message.trim(),
    );
  if (mismatch) {
    return i18n.t("common.errors.modelProviderChanged", {
      expected: mismatch[1],
      current: mismatch[2],
    });
  }
  return message
    .replace(/(?:Error: )?Error invoking remote method '[^']+':\s*(?:Error:\s*)?/g, "")
    .replace(/(?<![\w./\\:@-])paseo(?![\w./\\:@-])/gi, brand.name);
}

export function toErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return formatErrorMessage(String(error));
  if ("code" in error) {
    if (error.code === "DAEMON_CONNECTION_LOST") return i18n.t("common.errors.hostConnectionLost");
    if (error.code === "DAEMON_REQUEST_TIMEOUT") return i18n.t("common.errors.hostRequestTimeout");
  }
  // RPC messages include routing metadata in Error.message; userMessage is the host's reason.
  const message =
    "userMessage" in error && typeof error.userMessage === "string"
      ? error.userMessage
      : error.message;
  return formatErrorMessage(message);
}
