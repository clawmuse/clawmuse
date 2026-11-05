/**
 * Whether to tell the service that this device has no Live Activity.
 *
 * Why: the service keeps a record of the running activity and only ever sends
 * it updates. If the activity disappeared from the device — an app update, or
 * the user swiping it away — those updates land nowhere and no start is ever
 * planned, so the capsule stays invisible for good. The device is the only
 * witness, so it reports the absence once per launch (and again whenever the
 * installation changes, since that is a different record).
 *
 * Ported from agent/mobile/src/status-saas/status-saas-activity-recovery.ts.
 */
export interface ClawMuseStatusActivityRecoveryInput {
  usesLocalActivity: boolean;
  installationId: string | null;
  liveActivityCount: number;
  liveActivityId?: string;
  reportedForInstallationId: string | null;
}

export function shouldResetRemoteLiveActivity(input: ClawMuseStatusActivityRecoveryInput): boolean {
  const hasLiveActivity = Boolean(input.liveActivityId) || input.liveActivityCount > 0;
  if (input.usesLocalActivity || !input.installationId || hasLiveActivity) {
    return false;
  }
  return input.reportedForInstallationId !== input.installationId;
}
