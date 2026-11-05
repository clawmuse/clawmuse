/**
 * Ported from agent/mobile/src/status-saas/status-saas-push-sync-state.ts.
 * Remembers which endpoint registrations this process already completed so a
 * synchronization pass only POSTs what changed.
 */
export class ClawMuseStatusPushSyncState {
  private readonly registered = new Set<string>();
  private readonly clearedAlertInstallations = new Set<string>();

  shouldRegister(key: string): boolean {
    return !this.registered.has(key);
  }

  markRegistered(installationId: string, kind: string, key: string): void {
    this.registered.add(key);
    if (kind === "alert" || kind === "fcm_alert") {
      this.clearedAlertInstallations.delete(installationId);
    }
  }

  shouldUnregisterAlert(installationId: string): boolean {
    return !this.clearedAlertInstallations.has(installationId);
  }

  markAlertUnregistered(installationId: string): void {
    const prefixes = [`${installationId}:alert:`, `${installationId}:fcm_alert:`];
    for (const key of this.registered) {
      if (prefixes.some((prefix) => key.startsWith(prefix))) {
        this.registered.delete(key);
      }
    }
    this.clearedAlertInstallations.add(installationId);
  }

  invalidateRegistrations(): void {
    this.registered.clear();
  }
}
