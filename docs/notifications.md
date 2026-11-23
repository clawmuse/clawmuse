# Notifications

Use `notification-open` for OS notification taps. It owns delivery, parsing,
process-local deduplication, startup readiness, and native acknowledgement.
Keep agent and workspace navigation in their existing navigation modules.
Import the pure API from `@/notification-open` and the app-shell component from
`@/notification-open/react`; senders must not load the React routing runtime.

Agent payloads name a host and agent. Ignore their workspace hint when opening:
the agent can move after a notification is sent. Use `navigateToAgent`, which
uses the current store record or the agent route to resolve the workspace from
the host. Terminal payloads name their workspace and use `navigateToWorkspace`.

See [agent targets and deferred opens](expo-router.md#agent-targets) for route
ownership and workspace recovery.

## Preferences and mute

Do not request OS notification permission on first host connection. Existing
installs that already hold OS notification permission migrate once to
`pushEnabled: true`; fresh installs start at `pushEnabled: false` until enabled
in Settings → Notifications (`packages/app/src/notifications/preferences.ts`).
Turning `pushEnabled` off while a host is offline records its Expo push token in
a pending unregister list and flushes `unregister_push_token` when the host
reconnects.

Mobile preferences sync to two backends so per-task and remote-status channels
do not double-fire:

- Daemon `register_push_token` carries per-token `preferences` (`permission`,
  `finished`, `error`, `running`, `showPreview`, `suppressWhenActive`), stored in
  `PushTokenStore`. Setting `suppressWhenActive: false` delivers pushes even
  while a desktop or app client has active presence on that daemon. Terminal
  agent pushes (`finished`, `error`) include `_contentAvailable: true` so the
  native iOS Live Activity subscriber can immediately dismiss any stale or
  unaddressable lock-screen capsule alongside the completion alert.
- Per-agent daemon Expo push always owns task alerts (`singleTaskChannelPriority`
  is normalized to `true` on load); [ClawMuse Status](clawmuse-status.md) keeps
  `taskAlerts: false` (`completionPushActive` mirrors `pushEnabled && taskCompleted`)
  and uses its `alert`/`fcm_alert` endpoint for Goals review notifications and
  silent Live Activity cleanup.

Per-agent mute is stored on the agent's persisted labels
(`paseo.notifications-muted: "true"`). Daemon Expo push, desktop/web session
notifications, and the ClawMuse Status snapshot projection all skip muted
agents.

## Native delivery

Keep the router instance at module scope. Android's `singleTask` Activity can
finish on Back while its JS context remains alive. A React ref is lost when the
root remounts; process-local handled IDs must survive that remount.

Clear `lastNotificationResponse` after dispatch. Reading a launch response does
not acknowledge it. Without clearing it, a later Activity launch can reopen the
old agent.

With expo-notifications 57, Android also replays its pending response list to
new native listeners. Clearing the last response does not drain that list.
Deduplication covers listener registration within one JS context. A development
JS reload creates another context and can replay a cold-launch response; do not
add persisted handled IDs to compensate. Recheck this limitation when upgrading
expo-notifications.

iOS drains pending responses when its delegate first handles them. Push data
read by Expo arrives under `userInfo.body`; simulator payloads must match:

```json
{
  "aps": { "alert": { "title": "Agent finished", "body": "Open the agent" }, "sound": "default" },
  "body": {
    "serverId": "host",
    "workspaceId": "workspace",
    "agentId": "agent",
    "reason": "finished"
  }
}
```

An Android FCM launch intent needs `google.message_id` and a JSON `body` extra.
An arbitrary Activity launch with data extras does not exercise Expo's FCM path.

Foreground pushes stay in Notification Center without a banner or sound by
default, preserving notifications sent with stale presence information. Enabling
`foregroundBanner` shows banners and plays sound while the app is open unless
the target agent is already visible on screen.

## Startup and verification

Wait for the root navigator, host registry, remembered selection, and startup
redirects before handing off a tap. A compact agent route must demand the host's
directory itself; its sidebar can be closed for the entire cold launch.

Verify warm and cold taps, stale and missing workspace hints, two distinct taps,
and Android Back followed by launcher reopen or a different notification tap. Check the focused tab and every
workspace's saved layout, since a foreign pinned tab survives navigation.
Use the daemon's payload shape on both iOS and Android; a browser event alone
does not test native replay or acknowledgement.

Existing foreign pins belong to the reconciliation fix in
[#6900](https://github.com/getpaseo/paseo/issues/6900). Desktop main-process window
selection is tracked separately in
[#6875](https://github.com/getpaseo/paseo/issues/6875).
