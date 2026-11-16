/**
 * Ported from agent/mobile/src/status-saas/status-saas-push-sync-state.ts.
 * Remembers which endpoint registrations this process already completed so a
 * synchronization pass only POSTs what changed.
 */
export class ClawMuseStatusPushSyncState {
  private readonly registered = new Set<string>();
  private readonly clearedAlertInstallations = new Set<string>();
  private readonly clearedPushToStartInstallations = new Set<string>();
  private readonly syncedPreferences = new Map<string, string>();

  shouldRegister(key: string): boolean {
    return !this.registered.has(key);
  }

  markRegistered(installationId: string, kind: string, key: string): void {
    this.registered.add(key);
    if (kind === "alert" || kind === "fcm_alert") {
      this.clearedAlertInstallations.delete(installationId);
    } else if (kind === "push_to_start") {
      this.clearedPushToStartInstallations.delete(installationId);
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

  shouldUnregisterPushToStart(installationId: string): boolean {
    return !this.clearedPushToStartInstallations.has(installationId);
  }

  markPushToStartUnregistered(installationId: string): void {
    const prefix = `${installationId}:push_to_start:`;
    for (const key of this.registered) {
      if (key.startsWith(prefix)) {
        this.registered.delete(key);
      }
    }
    this.clearedPushToStartInstallations.add(installationId);
  }

  shouldSyncPreferences(installationId: string, serialized: string): boolean {
    return this.syncedPreferences.get(installationId) !== serialized;
  }

  markPreferencesSynced(installationId: string, serialized: string): void {
    this.syncedPreferences.set(installationId, serialized);
  }

  invalidateRegistrations(): void {
    this.registered.clear();
    this.syncedPreferences.clear();
  }
}
