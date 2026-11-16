import * as Notifications from "expo-notifications";
import { getNotificationPreferencesSnapshot } from "@/notifications/preferences";
import { useSessionStore } from "@/stores/session-store";
import { parseNotificationOpenTarget } from "./model";
import type { NotificationOpenSource, NotificationTap } from "./source";

function toTap(response: Notifications.NotificationResponse): NotificationTap {
  return {
    id: response.notification.request.identifier,
    data: response.notification.request.content.data,
  };
}

export function createNotificationOpenSource(): NotificationOpenSource {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const { preferences } = getNotificationPreferencesSnapshot();
      if (!preferences.pushEnabled) {
        return {
          shouldShowAlert: false,
          shouldShowBanner: false,
          shouldShowList: false,
          shouldPlaySound: false,
          shouldSetBadge: false,
        };
      }
      if (!preferences.foregroundBanner) {
        return {
          shouldShowAlert: false,
          shouldShowBanner: false,
          shouldShowList: true,
          shouldPlaySound: false,
          shouldSetBadge: false,
        };
      }
      const target = parseNotificationOpenTarget(notification.request.content.data);
      const isViewingTargetAgent =
        target?.kind === "agent" &&
        useSessionStore.getState().sessions[target.serverId]?.focusedAgentId === target.agentId;
      if (isViewingTargetAgent) {
        return {
          shouldShowAlert: false,
          shouldShowBanner: false,
          shouldShowList: true,
          shouldPlaySound: false,
          shouldSetBadge: false,
        };
      }
      return {
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      };
    },
  });
  return {
    subscribe(onTap) {
      const subscription = Notifications.addNotificationResponseReceivedListener((response) =>
        onTap(toTap(response)),
      );
      return () => subscription.remove();
    },
    async takeLaunchTap() {
      const response = await Notifications.getLastNotificationResponseAsync();
      return response ? toTap(response) : null;
    },
    acknowledge() {
      Notifications.clearLastNotificationResponse();
    },
  };
}
