interface MobileUpdatePort {
  checkForUpdateAsync(): Promise<{ isAvailable: boolean; isRollBackToEmbedded: boolean }>;
  fetchUpdateAsync(): Promise<{ isNew: boolean; isRollBackToEmbedded: boolean }>;
}

export function formatMobileUpdateError(message: string | undefined): string | undefined {
  const trimmed = message?.trim();
  if (!trimmed) return undefined;
  const cleaned = trimmed
    .replace(/\s*\(at [^)]+\)\s*$/, "")
    .replace(/^ERR_[A-Z0-9_]+:\s*/, "")
    .trim();
  return cleaned || trimmed;
}

async function fetchUpdateWithRetry(updater: MobileUpdatePort) {
  try {
    return await updater.fetchUpdateAsync();
  } catch {
    return await updater.fetchUpdateAsync();
  }
}

export async function checkAndDownloadMobileUpdate(
  updater: MobileUpdatePort,
  downloadFailedMessage: string,
): Promise<"current" | "downloaded"> {
  const available = await updater.checkForUpdateAsync();
  if (!available.isAvailable && !available.isRollBackToEmbedded) return "current";
  const downloaded = await fetchUpdateWithRetry(updater);
  if (!downloaded.isNew && !downloaded.isRollBackToEmbedded) {
    throw new Error(downloadFailedMessage);
  }
  return "downloaded";
}

export async function applyMobileUpdate(params: {
  confirm: () => Promise<boolean>;
  reload: () => Promise<void>;
}): Promise<void> {
  if (await params.confirm()) await params.reload();
}
