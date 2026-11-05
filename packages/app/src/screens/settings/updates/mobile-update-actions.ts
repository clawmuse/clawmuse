interface MobileUpdatePort {
  checkForUpdateAsync(): Promise<{ isAvailable: boolean; isRollBackToEmbedded: boolean }>;
  fetchUpdateAsync(): Promise<{ isNew: boolean; isRollBackToEmbedded: boolean }>;
}

export async function checkAndDownloadMobileUpdate(
  updater: MobileUpdatePort,
  downloadFailedMessage: string,
): Promise<"current" | "downloaded"> {
  const available = await updater.checkForUpdateAsync();
  if (!available.isAvailable && !available.isRollBackToEmbedded) return "current";
  const downloaded = await updater.fetchUpdateAsync();
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
