import ActivityKit
import ExpoModulesCore
import Foundation
import WidgetKit

private let pushTokenEvent = "onAgentLiveActivityPushToken"
private let pushToStartTokenEvent = "onAgentLiveActivityPushToStartToken"

public final class ClawMuseAgentLiveActivityModule: Module {
  private var activityUpdatesTask: Task<Void, Never>?
  private var pushToStartTask: Task<Void, Never>?
  private var pushTokenTasks: [String: Task<Void, Never>] = [:]

  public func definition() -> ModuleDefinition {
    Name("ClawMuseAgentLiveActivity")
    Events(pushTokenEvent, pushToStartTokenEvent)

    Function("getAvailability") { () -> [String: Any] in
      guard #available(iOS 16.2, *) else {
        return ["supported": false, "enabled": false]
      }
      return [
        "supported": true,
        "enabled": ActivityAuthorizationInfo().areActivitiesEnabled,
      ]
    }

    Function("getRemoteStatusCapability") { () -> [String: Any] in
      [
        "schemaVersion": 1,
        "pushToStartSupported": {
          if #available(iOS 17.2, *) { return true }
          return false
        }(),
      ]
    }

    AsyncFunction("getPushTokenSnapshot") { () -> [String: Any] in
      guard #available(iOS 16.2, *) else {
        return ["activities": []]
      }
      await self.observeCurrentActivityToken()
      var result = await self.controller().pushTokenSnapshot()
      self.cancelEndedActivityTokenTasks()
      if #available(iOS 17.2, *),
        let pushToStartToken = Activity<ClawMuseAgentActivityAttributes>.pushToStartToken
      {
        result["pushToStartToken"] = pushToStartToken.hexString
      }
      return result
    }

    AsyncFunction("sync") { (payload: AgentLiveActivityPayloadRecord) -> [String: Any] in
      guard #available(iOS 16.2, *) else {
        return ["supported": false, "enabled": false]
      }
      let result = try await self.controller().sync(payload)
      await self.observeCurrentActivityToken()
      return result
    }

    AsyncFunction("end") { (payload: AgentLiveActivityPayloadRecord?) in
      guard #available(iOS 16.2, *) else { return }
      await self.controller().end(payload)
      self.cancelEndedActivityTokenTasks()
    }

    AsyncFunction("endLegacyActivities") {
      guard #available(iOS 16.2, *) else { return }
      for activity in Activity<ClawMuseAgentActivityAttributes>.activities
      where activity.attributes.activityGeneration.isEmpty {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
      self.cancelEndedActivityTokenTasks()
    }

    AsyncFunction("resetRemoteStatusSession") { (restartIfPresent: Bool) -> [String: Any] in
      guard #available(iOS 16.2, *) else {
        return ["supported": false, "enabled": false]
      }
      let result = try await self.controller().resetRemoteStatusSession(
        restartIfPresent: restartIfPresent
      )
      self.cancelEndedActivityTokenTasks()
      await self.observeCurrentActivityToken()
      return result
    }

    // Why: the home-screen widget lives in the extension; the App Group is the
    // only channel the app has to hand it a snapshot and a summary-only token.
    AsyncFunction("updateWidgetSnapshot") { (json: String) in
      guard let defaults = UserDefaults(suiteName: AgentWidgetSharing.appGroup) else { return }
      defaults.set(Data(json.utf8), forKey: AgentWidgetSharing.snapshotKey)
      if #available(iOS 14.0, *) {
        WidgetCenter.shared.reloadAllTimelines()
      }
    }

    AsyncFunction("setWidgetCredentials") { (baseUrl: String?, token: String?) in
      guard let defaults = UserDefaults(suiteName: AgentWidgetSharing.appGroup) else { return }
      if let baseUrl, let token, !baseUrl.isEmpty, !token.isEmpty,
        let data = try? JSONSerialization.data(withJSONObject: ["baseUrl": baseUrl, "token": token])
      {
        defaults.set(data, forKey: AgentWidgetSharing.credentialsKey)
      } else {
        defaults.removeObject(forKey: AgentWidgetSharing.credentialsKey)
      }
      if #available(iOS 14.0, *) {
        WidgetCenter.shared.reloadAllTimelines()
      }
    }

    OnCreate {
      self.startActivityObserversIfAvailable()
    }

    OnAppEntersForeground {
      guard #available(iOS 16.2, *) else { return }
      Task { [weak self] in
        await self?.observeCurrentActivityToken()
      }
    }

    OnDestroy {
      self.activityUpdatesTask?.cancel()
      self.pushToStartTask?.cancel()
      self.pushTokenTasks.values.forEach { $0.cancel() }
      self.pushTokenTasks.removeAll()
    }
  }

  // Keep in step with ClawMuseAgentWidgetStore in the widget extension.
  private enum AgentWidgetSharing {
    static let appGroup = "group.com.clawmuse"
    static let snapshotKey = "clawmuse.widget.snapshot"
    static let credentialsKey = "clawmuse.widget.credentials"
  }

  @available(iOS 16.2, *)
  private func controller() -> AgentLiveActivityController {
    AgentLiveActivityController.shared
  }

  private func startActivityObserversIfAvailable() {
    guard #available(iOS 16.2, *) else { return }
    activityUpdatesTask = Task { [weak self] in
      await self?.observeCurrentActivityToken()
      for await activity in Activity<ClawMuseAgentActivityAttributes>.activityUpdates {
        guard !Task.isCancelled else { return }
        await self?.observeCurrentActivityToken(including: activity)
      }
    }
    if #available(iOS 17.2, *) {
      pushToStartTask = Task { [weak self] in
        for await token in Activity<ClawMuseAgentActivityAttributes>.pushToStartTokenUpdates {
          guard !Task.isCancelled else { return }
          self?.sendEvent(pushToStartTokenEvent, ["pushToStartToken": token.hexString])
        }
      }
    }
  }

  @available(iOS 16.2, *)
  private func observeCurrentActivityToken(
    including incomingActivity: Activity<ClawMuseAgentActivityAttributes>? = nil
  ) async {
    let id = await controller().currentActivityID()
    cancelEndedActivityTokenTasks()
    guard let id else { return }
    let activity = incomingActivity ?? Activity<ClawMuseAgentActivityAttributes>.activities.first {
      $0.id == id
    }
    guard let activity, activity.id == id else { return }
    observePushTokenUpdates(for: activity)
  }

  @available(iOS 16.2, *)
  private func observePushTokenUpdates(for activity: Activity<ClawMuseAgentActivityAttributes>) {
    guard pushTokenTasks[activity.id] == nil else { return }
    pushTokenTasks[activity.id] = Task { [weak self] in
      defer { self?.pushTokenTasks.removeValue(forKey: activity.id) }
      await Task.yield()
      for await token in activity.pushTokenUpdates {
        guard !Task.isCancelled else { return }
        guard await self?.controller().recordPushToken(token, for: activity.id) == true else { return }
        guard !Task.isCancelled else { return }
        self?.sendEvent(
          pushTokenEvent,
          [
            "activityId": activity.id,
            "generation": activity.attributes.activityGeneration,
            "pushToken": token.hexString,
          ])
      }
    }
  }

  private func cancelEndedActivityTokenTasks() {
    guard #available(iOS 16.2, *) else { return }
    let retainedIDs = Set(
      Activity<ClawMuseAgentActivityAttributes>.activities.filter {
        switch $0.activityState {
        case .active, .stale: return true
        default: return false
        }
      }.map(\.id))
    let endedIDs = pushTokenTasks.keys.filter { !retainedIDs.contains($0) }
    for id in endedIDs {
      pushTokenTasks[id]?.cancel()
      pushTokenTasks.removeValue(forKey: id)
    }
  }
}
