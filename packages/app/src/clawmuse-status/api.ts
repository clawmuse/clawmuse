import { Platform } from "react-native";
import { getIsElectron } from "@/constants/platform";
import {
  getOrCreateClawMuseStatusEnrollmentAttempt,
  removeClawMuseStatusEnrollmentAttempt,
} from "./enrollment-attempts";
import {
  ClawMuseStatusHttpError,
  requestClawMuseStatusJson,
  type ClawMuseStatusFetch,
  type ClawMuseStatusRequestInput,
} from "./http";
import { ClawMuseStatusMobileSession } from "./mobile-session";
import {
  parseClearedLiveActivities,
  parseEnrollmentRedemptionResponse,
  parseMobileSessionResponse,
  parseRemovedPushEndpoints,
  parseRevokedHostBindings,
  parseWidgetTokenResponse,
  type WidgetTokenResponse,
} from "./responses";
import type { ClawMuseStatusStoredSession } from "./session-store";
import { parseClawMuseStatusSummary, type ClawMuseStatusSummary } from "./summary";
import {
  parseGoalDetailEnvelope,
  parseGoalEnvelope,
  parseGoalList,
  parseGoalNextCursor,
  parseGoalRepoList,
  parsePlanRequest,
  type PlanRequestOutcome,
} from "./goals/parse";
import type {
  CreateGoalInput,
  Goal,
  GoalEvidence,
  GoalDetail,
  GoalListFilter,
  GoalRepo,
  GoalTarget,
} from "./goals/types";
import {
  ClawMuseStatusSessionChangedError,
  type ClawMuseStatusAccessToken,
  type ClawMuseStatusPushEndpoint,
} from "./types";

const ACCESS_TOKEN_SKEW_MS = 30_000;

/**
 * The phone omits the field (the service defaults to `ios`); the Electron app
 * says `desktop` so the service can tell an installation without APNs apart.
 */
function installationPlatformField(): { platform?: "desktop" | "android" | "browser" } {
  if (Platform.OS === "android") return { platform: "android" };
  if (getIsElectron()) return { platform: "desktop" };
  return Platform.OS === "web" ? { platform: "browser" } : {};
}

function accountSessionFields(accountId: string | null | undefined): { accountId?: string } {
  return accountId ? { accountId } : {};
}

export interface ClawMuseStatusEnrollmentBinding {
  serverId: string;
  relayHostId: string;
}

/**
 * Ported from agent/mobile/src/status-saas/status-saas-api.ts.
 *
 * One installation per device, bound to many hosts. Every request runs against
 * the installation that was current when it started; a session swap mid-flight
 * throws instead of writing another installation's answer into the new session.
 */
export class ClawMuseStatusApiClient {
  private readonly session: ClawMuseStatusMobileSession;
  private accessToken: ClawMuseStatusAccessToken | null = null;
  private refreshPromise: Promise<ClawMuseStatusAccessToken> | null = null;
  private closed = false;
  private enrollmentQueue: Promise<void> = Promise.resolve();

  constructor(
    readonly baseUrl: string,
    private readonly fetchImplementation: ClawMuseStatusFetch = fetch,
    private readonly now: () => number = Date.now,
    private readonly accountId?: string | null,
  ) {
    this.session = new ClawMuseStatusMobileSession(baseUrl, accountId);
  }

  async hasSession(): Promise<boolean> {
    return (await this.session.read()) !== null;
  }

  async getInstallationId(): Promise<string | null> {
    return (await this.session.read())?.installationId ?? null;
  }

  async getBoundHosts(): Promise<Readonly<Record<string, string>>> {
    return (await this.session.read())?.boundHosts ?? {};
  }

  async isHostBound(serverId: string): Promise<boolean> {
    return (await this.getBoundHosts())[serverId] !== undefined;
  }

  enroll(binding: ClawMuseStatusEnrollmentBinding, code: string, expiresAt: string): Promise<void> {
    const operation = this.enrollmentQueue.then(() => this.enrollImpl(binding, code, expiresAt));
    this.enrollmentQueue = operation.catch(() => {});
    return operation;
  }

  async registerPushEndpoint(endpoint: ClawMuseStatusPushEndpoint): Promise<void> {
    await this.authorizedRequest("/v1/mobile/push-endpoints", { method: "POST", body: endpoint });
  }

  async unregisterAlertPushEndpoint(kind: "alert" | "fcm_alert" = "alert"): Promise<number> {
    return parseRemovedPushEndpoints(
      await this.authorizedRequest(`/v1/mobile/push-endpoints/${kind}`, { method: "DELETE" }),
    );
  }

  async unbindHost(relayHostId: string, serverId: string): Promise<number> {
    const value = await this.authorizedRequest(
      `/v1/mobile/hosts/${encodeURIComponent(relayHostId)}`,
      { method: "DELETE" },
    );
    const revoked = parseRevokedHostBindings(value);
    const current = await this.session.read();
    if (current && current.boundHosts[serverId] !== undefined) {
      const { [serverId]: _removed, ...boundHosts } = current.boundHosts;
      this.session.replace({ ...current, boundHosts });
      await this.session.persist();
    }
    return revoked;
  }

  /**
   * Tells the service this device has no Live Activity, so it stops sending
   * updates into the void and plans a fresh start instead.
   */
  async resetLiveActivity(): Promise<number> {
    return parseClearedLiveActivities(
      await this.authorizedRequest("/v1/mobile/live-activity/reset", { method: "POST" }),
    );
  }

  /** A long-lived summary-only token for the home-screen widget. */
  async issueWidgetToken(): Promise<WidgetTokenResponse> {
    return parseWidgetTokenResponse(
      await this.authorizedRequest("/v1/mobile/widget-tokens", { method: "POST" }),
    );
  }

  async getSummary(): Promise<ClawMuseStatusSummary> {
    return parseClawMuseStatusSummary(
      await this.authorizedRequest("/v1/mobile/summary", { method: "GET" }),
    );
  }

  // ---- goals (services/clawmuse-status/docs/api-contract.md#goals) ----------

  async listGoalRepos(): Promise<GoalRepo[]> {
    return parseGoalRepoList(
      await this.authorizedRequest("/v1/mobile/goal-repos", { method: "GET" }),
    );
  }

  async setGoalRepoPlanEnabled(repoKey: string, planEnabled: boolean): Promise<void> {
    await this.authorizedRequest(`/v1/mobile/goal-repos/${encodeURIComponent(repoKey)}`, {
      method: "PATCH",
      body: { planEnabled },
    });
  }

  /** Omitting `target` uses the target the service remembers for the repository. */
  async requestGoalPlan(repoKey: string, target?: GoalTarget): Promise<PlanRequestOutcome> {
    return parsePlanRequest(
      await this.authorizedRequest(`/v1/mobile/goal-repos/${encodeURIComponent(repoKey)}/plan`, {
        method: "POST",
        ...(target ? { body: target } : {}),
      }),
    );
  }

  async listGoals(filter: GoalListFilter, repoKey: string | null = null): Promise<Goal[]> {
    const query = new URLSearchParams({ filter });
    if (repoKey) {
      query.set("repoKey", repoKey);
    }
    const goals = new Map<string, Goal>();
    let before: string | null = null;
    do {
      if (before) query.set("before", before);
      const value = await this.authorizedRequest(`/v1/mobile/goals?${query.toString()}`, {
        method: "GET",
      });
      for (const goal of parseGoalList(value)) goals.set(goal.id, goal);
      before = parseGoalNextCursor(value);
    } while (before);
    return [...goals.values()];
  }

  async recordGoalNotificationReceipt(
    goalId: string,
    version: number,
    stage: "observed" | "opened",
  ): Promise<void> {
    await this.authorizedRequest(
      `/v1/mobile/goals/${encodeURIComponent(goalId)}/notification-receipts`,
      {
        method: "POST",
        body: { version, stage },
      },
    );
  }

  async getGoal(goalId: string): Promise<GoalDetail> {
    return parseGoalDetailEnvelope(
      await this.authorizedRequest(`/v1/mobile/goals/${encodeURIComponent(goalId)}`, {
        method: "GET",
      }),
    );
  }

  async createGoal(input: CreateGoalInput): Promise<Goal> {
    return parseGoalEnvelope(
      await this.authorizedRequest("/v1/mobile/goals", { method: "POST", body: input }),
    );
  }

  async acceptGoal(
    goalId: string,
    input: { budgetRuns?: number; target?: GoalTarget } = {},
  ): Promise<Goal> {
    return this.goalAction(goalId, "accept", {
      ...(input.budgetRuns === undefined ? {} : { budgetRuns: input.budgetRuns }),
      ...input.target,
    });
  }

  async discardGoal(goalId: string): Promise<Goal> {
    return this.goalAction(goalId, "discard", {});
  }

  async submitTaskReview(
    goalId: string,
    input: { runId: string; message: string; evidence: GoalEvidence },
  ): Promise<Goal> {
    return this.goalAction(goalId, "submit", input);
  }

  async approveGoal(goalId: string): Promise<Goal> {
    return this.goalAction(goalId, "approve", {});
  }

  async continueGoal(
    goalId: string,
    input: { instruction?: string; target?: GoalTarget; confirmExecutionStopped?: boolean } = {},
  ): Promise<Goal> {
    return this.goalAction(goalId, "continue", {
      ...(input.confirmExecutionStopped ? { confirmExecutionStopped: true } : {}),
      ...(input.instruction ? { instruction: input.instruction } : {}),
      ...input.target,
    });
  }

  async pauseGoal(goalId: string): Promise<Goal> {
    return this.goalAction(goalId, "pause", {});
  }

  private async goalAction(goalId: string, action: string, body: unknown): Promise<Goal> {
    return parseGoalEnvelope(
      await this.authorizedRequest(`/v1/mobile/goals/${encodeURIComponent(goalId)}/${action}`, {
        method: "POST",
        body,
      }),
    );
  }

  private async enrollImpl(
    binding: ClawMuseStatusEnrollmentBinding,
    enrollmentCode: string,
    expiresAt: string,
  ): Promise<void> {
    await this.session.read();
    const authorization = await this.readEnrollmentAuthorization();
    const attempt = await getOrCreateClawMuseStatusEnrollmentAttempt({
      baseUrl: this.baseUrl,
      enrollmentCode,
      serverId: binding.serverId,
      expiresAt,
      now: this.now(),
    });
    const body = {
      enrollmentCode: attempt.enrollmentCode,
      idempotencyKey: attempt.idempotencyKey,
      locale: "zh-Hans",
      ...installationPlatformField(),
    };
    let bearerInstallationId = authorization?.installationId ?? null;
    let value: unknown;
    try {
      value = await this.request("/v1/mobile/enrollments", {
        method: "POST",
        body,
        bearer: authorization?.value ?? null,
      });
    } catch (error) {
      // The service refuses to bind a host whose enrollment belongs to another
      // owner. An installation with no hosts yet is disposable, so it is revoked
      // and the exchange retried as a fresh installation.
      const current = this.session.current;
      const reclaimable =
        authorization !== null &&
        error instanceof ClawMuseStatusHttpError &&
        error.code === "installation_owner_mismatch" &&
        current !== null &&
        Object.keys(current.boundHosts).length === 0;
      if (!reclaimable) {
        throw error;
      }
      if (current.installationId !== bearerInstallationId) {
        throw new ClawMuseStatusSessionChangedError({ cause: error });
      }
      await this.revokeInstallation(authorization.value, authorization.installationId);
      await this.clearSession();
      bearerInstallationId = null;
      value = await this.request("/v1/mobile/enrollments", { method: "POST", body, bearer: null });
    }
    const enrolled = parseEnrollmentRedemptionResponse(value);
    if (bearerInstallationId && this.session.current?.installationId !== bearerInstallationId) {
      throw new ClawMuseStatusSessionChangedError();
    }
    const currentSession = this.session.current;
    const sameInstallation = currentSession?.installationId === enrolled.installationId;
    const refreshToken =
      enrolled.refreshToken ?? (sameInstallation ? currentSession.refreshToken : null);
    if (!refreshToken) {
      throw new Error("Invalid status service response: refreshToken");
    }
    const previousBindings = sameInstallation ? currentSession.boundHosts : {};
    const next: ClawMuseStatusStoredSession = {
      version: 1,
      ...accountSessionFields(this.accountId),
      baseUrl: this.baseUrl,
      installationId: enrolled.installationId,
      refreshToken,
      boundHosts: { ...previousBindings, [binding.serverId]: binding.relayHostId },
    };
    this.session.replace(next);
    this.accessToken = {
      value: enrolled.accessToken,
      expiresAt: this.now() + enrolled.expiresIn * 1_000,
      installationId: enrolled.installationId,
    };
    await this.session.persist();
    await removeClawMuseStatusEnrollmentAttempt(attempt);
  }

  private async readEnrollmentAuthorization(): Promise<ClawMuseStatusAccessToken | null> {
    if (!this.session.current) {
      return null;
    }
    try {
      return await this.getAccessToken();
    } catch (error) {
      if (!(error instanceof ClawMuseStatusHttpError) || error.status !== 401) {
        throw error;
      }
      await this.clearSession();
      return null;
    }
  }

  private async authorizedRequest(
    path: string,
    input: Omit<ClawMuseStatusRequestInput, "bearer">,
  ): Promise<unknown> {
    let authorization = await this.getAccessToken();
    try {
      const value = await this.request(path, { ...input, bearer: authorization.value });
      this.assertCurrentInstallation(authorization.installationId);
      return value;
    } catch (error) {
      if (!(error instanceof ClawMuseStatusHttpError) || error.status !== 401) {
        throw error;
      }
      this.assertCurrentInstallation(authorization.installationId);
      this.accessToken = null;
      authorization = await this.getAccessToken();
      const value = await this.request(path, { ...input, bearer: authorization.value });
      this.assertCurrentInstallation(authorization.installationId);
      return value;
    }
  }

  private async getAccessToken(): Promise<ClawMuseStatusAccessToken> {
    await this.session.read();
    if (this.accessToken && this.accessToken.expiresAt - ACCESS_TOKEN_SKEW_MS > this.now()) {
      return this.accessToken;
    }
    if (!this.refreshPromise) {
      this.refreshPromise = this.refresh().finally(() => {
        this.refreshPromise = null;
      });
    }
    return this.refreshPromise;
  }

  private async refresh(): Promise<ClawMuseStatusAccessToken> {
    const storedSession = this.session.current;
    if (!storedSession) {
      throw new Error("Status service is not enrolled");
    }
    let value: unknown;
    try {
      value = await this.request("/v1/mobile/sessions", {
        method: "POST",
        body: {
          installationId: storedSession.installationId,
          refreshToken: storedSession.refreshToken,
        },
        bearer: null,
      });
    } catch (error) {
      if (error instanceof ClawMuseStatusHttpError && error.status === 401) {
        if (this.session.current?.installationId !== storedSession.installationId) {
          throw new ClawMuseStatusSessionChangedError({ cause: error });
        }
        await this.clearSession().catch(() => {});
      }
      throw error;
    }
    const refreshed = parseMobileSessionResponse(value);
    if (
      refreshed.installationId !== storedSession.installationId ||
      this.session.current?.installationId !== storedSession.installationId
    ) {
      throw new Error("Status service changed the installation identity");
    }
    this.session.replace({ ...storedSession, refreshToken: refreshed.refreshToken });
    this.accessToken = {
      value: refreshed.accessToken,
      expiresAt: this.now() + refreshed.expiresIn * 1_000,
      installationId: refreshed.installationId,
    };
    await this.session.persist();
    return this.accessToken;
  }

  private async clearSession(): Promise<void> {
    this.accessToken = null;
    await this.session.clear();
  }

  private async revokeInstallation(accessToken: string, installationId: string): Promise<void> {
    await this.request("/v1/mobile/installation", { method: "DELETE", bearer: accessToken });
    this.assertCurrentInstallation(installationId);
  }

  private assertCurrentInstallation(installationId: string): void {
    if (this.session.current?.installationId !== installationId) {
      throw new ClawMuseStatusSessionChangedError();
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    await this.enrollmentQueue;
    await this.clearSession();
  }

  private async request(path: string, input: ClawMuseStatusRequestInput): Promise<unknown> {
    if (this.closed) throw new ClawMuseStatusSessionChangedError();
    const value = await requestClawMuseStatusJson(
      this.fetchImplementation,
      this.baseUrl,
      path,
      input,
    );
    if (this.closed) throw new ClawMuseStatusSessionChangedError();
    return value;
  }
}
