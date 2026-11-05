// Ported from agent/mobile/src/status-saas/status-saas-synchronization.ts.
export interface ClawMuseStatusEnrollmentOutcome {
  enrolled: boolean;
  error?: unknown;
}

/** Screens start reading immediately when the client is published. */
export async function enrollClawMuseStatusSession(input: {
  enroll: () => Promise<void>;
  getInstallationId: () => Promise<string | null>;
  publish: () => void;
}): Promise<string> {
  await input.enroll();
  const installationId = await input.getInstallationId();
  if (!installationId) throw new Error("Status service enrollment did not create a session");
  input.publish();
  return installationId;
}

export interface EnrollClawMuseStatusHostsInput<T> {
  candidates: readonly T[];
  enroll: (candidate: T) => Promise<boolean>;
}

/** One failing host must not stop the others from binding. */
export async function enrollClawMuseStatusHosts<T>(
  input: EnrollClawMuseStatusHostsInput<T>,
): Promise<ClawMuseStatusEnrollmentOutcome> {
  let enrolled = false;
  let firstError: unknown;
  for (const candidate of input.candidates) {
    try {
      enrolled = (await input.enroll(candidate)) || enrolled;
    } catch (error) {
      firstError ??= error;
    }
  }
  return { enrolled, ...(firstError === undefined ? {} : { error: firstError }) };
}

export interface SynchronizeClawMuseStatusInput {
  registerEndpoints: () => Promise<void>;
  enrollConnectedHosts: () => Promise<ClawMuseStatusEnrollmentOutcome>;
  afterEnrollment?: () => Promise<void>;
}

/**
 * Endpoints first so an installation that already exists keeps receiving
 * pushes, then enrollment, then endpoints again because a new installation
 * invalidates every registration made against the old one.
 */
export async function synchronizeClawMuseStatus(
  input: SynchronizeClawMuseStatusInput,
): Promise<void> {
  await input.registerEndpoints();
  const outcome = await input.enrollConnectedHosts();
  if (outcome.enrolled) {
    await input.afterEnrollment?.();
    await input.registerEndpoints();
  }
  if (outcome.error !== undefined) {
    throw outcome.error;
  }
}
