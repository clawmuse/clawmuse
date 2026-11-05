import ActivityKit
import Foundation
import UIKit

private enum AgentLiveActivityControllerError: Error {
  case applicationInactive
}

@available(iOS 16.2, *)
actor AgentLiveActivityController {
  static let shared = AgentLiveActivityController()

  private static let layoutVersion = "2026-09-03-usage-meters-v3"
  private static let layoutVersionKey = "ClawMuseAgentLiveActivityLayoutVersion"

  private var activity: Activity<ClawMuseAgentActivityAttributes>?
  private var activityPushToken: (activityId: String, token: Data)?
  private var pendingRemoteStatusRestartState: ClawMuseAgentActivityAttributes.ContentState?

  func sync(_ payload: AgentLiveActivityPayloadRecord) async throws -> [String: Any] {
    guard ActivityAuthorizationInfo().areActivitiesEnabled else {
      return ["supported": true, "enabled": false]
    }

    let state = ClawMuseAgentActivityAttributes.ContentState(payload: payload)
    let applied = try await apply(
      state,
      createIfNeeded: true,
      migrateLayout: true,
      requireForegroundForCreation: false
    )
    return applied.map(syncResult) ?? ["supported": true, "enabled": true]
  }

  func startOrUpdate(_ state: AgentLiveActivityState) async -> Bool {
    guard ActivityAuthorizationInfo().areActivitiesEnabled else { return false }
    do {
      return try await apply(
        .init(state: state),
        createIfNeeded: true,
        migrateLayout: true,
        requireForegroundForCreation: true
      ) != nil
    } catch {
      await recoverExistingActivity(endingDuplicates: true)
      return false
    }
  }

  func updateExisting(_ state: AgentLiveActivityState) async -> Bool {
    guard ActivityAuthorizationInfo().areActivitiesEnabled else { return false }
    return
      (try? await apply(
        .init(state: state),
        createIfNeeded: false,
        migrateLayout: false,
        requireForegroundForCreation: false
      )) != nil
  }

  func endExisting() async {
    await recoverExistingActivity(endingDuplicates: false)
    for existing in Activity<ClawMuseAgentActivityAttributes>.activities {
      await existing.end(nil, dismissalPolicy: .immediate)
    }
    activity = nil
  }

  func resetRemoteStatusSession(restartIfPresent: Bool) async throws -> [String: Any] {
    guard ActivityAuthorizationInfo().areActivitiesEnabled else {
      return ["supported": true, "enabled": false]
    }
    await recoverExistingActivity(endingDuplicates: false)
    if restartIfPresent {
      pendingRemoteStatusRestartState = activity?.content.state ?? pendingRemoteStatusRestartState
    } else {
      pendingRemoteStatusRestartState = nil
    }
    for existing in Activity<ClawMuseAgentActivityAttributes>.activities {
      await existing.end(nil, dismissalPolicy: .immediate)
    }
    activity = nil
    guard restartIfPresent, let restartState = pendingRemoteStatusRestartState else {
      return ["supported": true, "enabled": true]
    }
    let applicationIsActive = await MainActor.run {
      UIApplication.shared.applicationState == .active
    }
    guard applicationIsActive else {
      throw AgentLiveActivityControllerError.applicationInactive
    }
    let created = try Activity.request(
      attributes: ClawMuseAgentActivityAttributes(),
      content: activityContent(for: restartState),
      pushType: .token
    )
    activity = created
    pendingRemoteStatusRestartState = nil
    return syncResult(for: created)
  }

  func end(_ payload: AgentLiveActivityPayloadRecord?) async {
    await recoverExistingActivity(endingDuplicates: false)
    let finalContent = payload.map {
      activityContent(for: ClawMuseAgentActivityAttributes.ContentState(payload: $0))
    }
    for existing in Activity<ClawMuseAgentActivityAttributes>.activities {
      await existing.end(
        finalContent,
        dismissalPolicy: .immediate
      )
    }
    activity = nil
  }

  func currentActivityID() async -> String? {
    await recoverExistingActivity(endingDuplicates: true)
    return activity?.id
  }

  func pushTokenSnapshot() async -> [String: Any] {
    await recoverExistingActivity(endingDuplicates: true)
    guard let activity else {
      activityPushToken = nil
      return ["activities": []]
    }
    let token: Data?
    if activityPushToken?.activityId == activity.id {
      token = activityPushToken?.token
    } else {
      token = activity.pushToken
    }
    var tokens: [[String: String]] = []
    if let token {
      tokens.append([
        "activityId": activity.id,
        "generation": activity.attributes.activityGeneration,
        "pushToken": token.hexString,
      ])
    }
    return ["activityId": activity.id, "activities": tokens]
  }

  func recordPushToken(_ token: Data, for activityId: String) async -> Bool {
    await recoverExistingActivity(endingDuplicates: true)
    guard activity?.id == activityId else { return false }
    // A newly fetched Activity can still expose a nil pushToken after the stream
    // yields. Keep that token with the retained card, even before JS subscribes.
    activityPushToken = (activityId, token)
    return true
  }

  private func recoverExistingActivity(endingDuplicates: Bool) async {
    let activities = Activity<ClawMuseAgentActivityAttributes>.activities
    // Ended activities can still be visible on the lock screen, but cannot
    // receive updates or own the service's activity token.
    let live = activities.filter {
      switch $0.activityState {
      case .active, .stale: return true
      default: return false
      }
    }
    let newest = live.max(by: {
      if $0.content.state.updatedAt != $1.content.state.updatedAt {
        return $0.content.state.updatedAt < $1.content.state.updatedAt
      }
      if $0.content.state.revision != $1.content.state.revision {
        return $0.content.state.revision < $1.content.state.revision
      }
      return $0.id < $1.id
    })
    activity = newest
    if endingDuplicates {
      for duplicate in activities where duplicate.id != newest?.id {
        await duplicate.end(nil, dismissalPolicy: .immediate)
      }
    }
  }

  private func apply(
    _ state: ClawMuseAgentActivityAttributes.ContentState,
    createIfNeeded: Bool,
    migrateLayout: Bool,
    requireForegroundForCreation: Bool
  ) async throws -> Activity<ClawMuseAgentActivityAttributes>? {
    if migrateLayout {
      _ = await migrateLayoutIfNeeded()
    }
    await recoverExistingActivity(endingDuplicates: true)
    if let activity {
      await activity.update(activityContent(for: state))
      return activity
    }
    guard createIfNeeded else { return nil }
    if requireForegroundForCreation {
      let applicationIsActive = await MainActor.run {
        UIApplication.shared.applicationState == .active
      }
      guard applicationIsActive else { return nil }
      // The actor can admit another creator while the MainActor check waits.
      await recoverExistingActivity(endingDuplicates: true)
      if let activity {
        await activity.update(activityContent(for: state))
        return activity
      }
    }
    let created = try Activity.request(
      attributes: ClawMuseAgentActivityAttributes(),
      content: activityContent(for: state),
      pushType: .token
    )
    activity = created
    return created
  }

  private func migrateLayoutIfNeeded() async -> Bool {
    let defaults = UserDefaults.standard
    guard defaults.string(forKey: Self.layoutVersionKey) != Self.layoutVersion else {
      return false
    }
    let existing = Activity<ClawMuseAgentActivityAttributes>.activities
    for activity in existing {
      await activity.end(nil, dismissalPolicy: .immediate)
    }
    activity = nil
    defaults.set(Self.layoutVersion, forKey: Self.layoutVersionKey)
    return !existing.isEmpty
  }

  private func activityContent(
    for state: ClawMuseAgentActivityAttributes.ContentState
  ) -> ActivityContent<ClawMuseAgentActivityAttributes.ContentState> {
    return ActivityContent(
      state: state,
      staleDate: Date().addingTimeInterval(120),
      relevanceScore: relevanceScore(for: state.phase)
    )
  }

  private func relevanceScore(for phase: String) -> Double {
    switch phase {
    case "attention", "error": return 1
    case "working": return 0.8
    case "completed": return 0.65
    case "monitoring": return 0.5
    default: return 0.2
    }
  }

  private func syncResult(
    for activity: Activity<ClawMuseAgentActivityAttributes>
  ) -> [String: Any] {
    var result: [String: Any] = [
      "supported": true,
      "enabled": true,
      "activityId": activity.id,
    ]
    if let token = activity.pushToken {
      result["pushToken"] = token.hexString
    }
    return result
  }
}

extension Data {
  var hexString: String {
    map { String(format: "%02x", $0) }.joined()
  }
}
