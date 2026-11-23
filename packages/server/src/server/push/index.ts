import type pino from "pino";
import type { AgentNotificationReason } from "@getpaseo/protocol/agent-attention-notification";
import type { PushNotificationPreferences } from "@getpaseo/protocol/messages";

import { PushService, type PushPayload } from "./push-service.js";
import { PushTokenStore } from "./token-store.js";

export type { PushPayload };

const PUSH_TOKEN_LEASE_MS = 48 * 60 * 60 * 1000;

export interface SendAgentPushEventInput {
  reason: AgentNotificationReason;
  hasPresentClient: boolean;
  focusedOnTarget: boolean;
  withPreviewPayload: PushPayload;
  withoutPreviewPayload: PushPayload;
}

export interface PushNotifications {
  renew(token: string, preferences?: PushNotificationPreferences): void;
  revoke(token: string): void;
  send(payload: PushPayload): Promise<void>;
  sendAgentEvent(input: SendAgentPushEventInput): Promise<void>;
  hasAlertSubscriber?(input: {
    reason: AgentNotificationReason;
    hasPresentClient: boolean;
  }): boolean;
}

export type PushNotificationSender = Pick<PushNotifications, "send"> &
  Partial<Pick<PushNotifications, "sendAgentEvent">>;

function allowsReason(
  reason: AgentNotificationReason,
  preferences: PushNotificationPreferences | undefined,
): boolean {
  switch (reason) {
    case "permission":
      return preferences?.permission ?? true;
    case "finished":
      return preferences?.finished ?? true;
    case "error":
      // Legacy clients without preferences retain pre-v1.5.11 behavior; modern
      // clients send explicit preferences (with `error: true` by default).
      return preferences?.error ?? false;
    case "running":
      return preferences?.running ?? false;
  }
}

export function createPushNotifications(options: {
  logger: pino.Logger;
  filePath: string;
  now?: () => number;
  deliver?: (tokens: string[], payload: PushPayload) => Promise<void>;
}): PushNotifications {
  const now = options.now ?? Date.now;
  const store = new PushTokenStore(options.logger, options.filePath, now, PUSH_TOKEN_LEASE_MS);
  const service = new PushService(options.logger, (token) => store.revokeToken(token));
  const deliver =
    options.deliver ??
    ((tokens: string[], payload: PushPayload) => service.sendPush(tokens, payload));

  return {
    renew(token, preferences) {
      store.renewToken(token, preferences);
    },
    revoke(token) {
      store.revokeToken(token);
    },
    async send(payload) {
      const tokens = store.getActiveTokens();
      options.logger.info({ tokenCount: tokens.length }, "Sending push notification");
      if (tokens.length === 0) return;
      await deliver(tokens, payload);
    },
    hasAlertSubscriber(input) {
      return store.getActiveSubscriptions().some((subscription) => {
        const prefs = subscription.preferences;
        if (!allowsReason(input.reason, prefs)) {
          return false;
        }
        const suppressWhenActive = prefs?.suppressWhenActive ?? true;
        return !(suppressWhenActive && input.hasPresentClient);
      });
    },
    async sendAgentEvent(input) {
      const subscriptions = store.getActiveSubscriptions();
      if (subscriptions.length === 0) return;

      const withPreviewTokens: string[] = [];
      const withoutPreviewTokens: string[] = [];

      for (const subscription of subscriptions) {
        const prefs = subscription.preferences;
        if (!allowsReason(input.reason, prefs)) {
          continue;
        }
        const suppressWhenActive = prefs?.suppressWhenActive ?? true;
        if (suppressWhenActive && (input.focusedOnTarget || input.hasPresentClient)) {
          continue;
        }
        if (prefs?.showPreview === false) {
          withoutPreviewTokens.push(subscription.token);
        } else {
          withPreviewTokens.push(subscription.token);
        }
      }

      const totalCount = withPreviewTokens.length + withoutPreviewTokens.length;
      if (totalCount === 0) return;
      options.logger.info(
        {
          reason: input.reason,
          tokenCount: totalCount,
          withPreviewCount: withPreviewTokens.length,
          withoutPreviewCount: withoutPreviewTokens.length,
        },
        "Sending agent push notification",
      );

      if (withPreviewTokens.length > 0) {
        await deliver(withPreviewTokens, input.withPreviewPayload);
      }
      if (withoutPreviewTokens.length > 0) {
        await deliver(withoutPreviewTokens, input.withoutPreviewPayload);
      }
    },
  };
}
