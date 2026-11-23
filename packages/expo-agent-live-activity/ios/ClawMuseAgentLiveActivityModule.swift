import ActivityKit
import ExpoModulesCore
import Foundation
import Security
import UIKit
import WidgetKit

private let pushTokenEvent = "onAgentLiveActivityPushToken"
private let pushToStartTokenEvent = "onAgentLiveActivityPushToStartToken"

@MainActor
private final class BackgroundTaskBox {
  private var id: UIBackgroundTaskIdentifier = .invalid

  func begin() {
    id = UIApplication.shared.beginBackgroundTask(withName: "ClawMuseLiveActivityTokenSync") {
      [weak self] in
      Task { @MainActor in
        self?.end()
      }
    }
  }

  func end() {
    guard id != .invalid else { return }
    let current = id
    id = .invalid
    UIApplication.shared.endBackgroundTask(current)
  }
}

private enum LiveActivityPushCredentialStore {
  private static let service = "com.clawmuse.live-activity-push"
  private static let account = "credentials"

  static func write(baseUrl: String?, token: String?) {
    let deleteQuery: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
    ]
    SecItemDelete(deleteQuery as CFDictionary)
    guard let baseUrl, let token, !baseUrl.isEmpty, !token.isEmpty,
      let data = try? JSONSerialization.data(
        withJSONObject: ["baseUrl": baseUrl, "token": token]
      )
    else { return }
    var addQuery = deleteQuery
    addQuery[kSecValueData as String] = data
    addQuery[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    SecItemAdd(addQuery as CFDictionary, nil)
  }

  static func read() -> (baseUrl: String, token: String)? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    var item: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
      let data = item as? Data,
      let object = try? JSONSerialization.jsonObject(with: data) as? [String: String],
      let baseUrl = object["baseUrl"], !baseUrl.isEmpty,
      let token = object["token"], !token.isEmpty
    else { return nil }
    return (baseUrl, token)
  }
}

private struct PendingActivityPushTokenEntry: Codable {
  let activityId: String
  let generation: String
  let tokenHex: String
  let recordedAt: Double
}

private enum PendingActivityPushTokenStore {
  private static let service = "com.clawmuse.live-activity-pending-tokens"
  private static let account = "pending"
  private static let maxEntries = 8
  private static let maxAgeSeconds: TimeInterval = 24 * 3600
  private static let lock = NSLock()

  static func readAll(now: TimeInterval = Date().timeIntervalSince1970) -> [PendingActivityPushTokenEntry] {
    lock.lock()
    defer { lock.unlock() }
    return readUnlocked(now: now)
  }

  static func upsert(activityId: String, generation: String, tokenHex: String) {
    guard !activityId.isEmpty, !generation.isEmpty, !tokenHex.isEmpty else { return }
    lock.lock()
    defer { lock.unlock() }
    let now = Date().timeIntervalSince1970
    var entries = readUnlocked(now: now).filter {
      !($0.activityId == activityId && $0.generation == generation)
    }
    entries.append(
      PendingActivityPushTokenEntry(
        activityId: activityId,
        generation: generation,
        tokenHex: tokenHex,
        recordedAt: now
      )
    )
    if entries.count > maxEntries {
      entries = Array(entries.suffix(maxEntries))
    }
    writeUnlocked(entries)
  }

  static func remove(activityId: String, generation: String, tokenHex: String) {
    lock.lock()
    defer { lock.unlock() }
    let now = Date().timeIntervalSince1970
    let remaining = readUnlocked(now: now).filter {
      !($0.activityId == activityId && $0.generation == generation && $0.tokenHex == tokenHex)
    }
    writeUnlocked(remaining)
  }

  static func hasPending(activityId: String, now: TimeInterval = Date().timeIntervalSince1970) -> Bool {
    guard !activityId.isEmpty else { return false }
    lock.lock()
    defer { lock.unlock() }
    return readUnlocked(now: now).contains { $0.activityId == activityId }
  }

  static func clear() {
    lock.lock()
    defer { lock.unlock() }
    writeUnlocked([])
  }

  private static func readUnlocked(now: TimeInterval) -> [PendingActivityPushTokenEntry] {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    var item: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
      let data = item as? Data,
      let decoded = try? JSONDecoder().decode([PendingActivityPushTokenEntry].self, from: data)
    else { return [] }
    return decoded.filter { now - $0.recordedAt < maxAgeSeconds }
  }

  private static func writeUnlocked(_ entries: [PendingActivityPushTokenEntry]) {
    let deleteQuery: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
    ]
    SecItemDelete(deleteQuery as CFDictionary)
    guard !entries.isEmpty, let data = try? JSONEncoder().encode(entries) else { return }
    var addQuery = deleteQuery
    addQuery[kSecValueData as String] = data
    addQuery[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    SecItemAdd(addQuery as CFDictionary, nil)
  }
}

private enum ActivityTokenUploadOutcome {
  case delivered
  case unauthorized
  case permanentRejection
  case retryableFailure
}

private enum ClawMuseLiveActivityTokenUploader {
  static func flushPending(allowRetries: Bool) async {
    let pending = PendingActivityPushTokenStore.readAll()
    for entry in pending {
      guard !Task.isCancelled else { return }
      await upload(
        tokenHex: entry.tokenHex,
        activityId: entry.activityId,
        generation: entry.generation,
        allowRetries: allowRetries
      )
    }
  }

  static func upload(
    tokenHex: String,
    activityId: String,
    generation: String,
    allowRetries: Bool
  ) async {
    guard !tokenHex.isEmpty, !activityId.isEmpty, !generation.isEmpty else { return }
    PendingActivityPushTokenStore.upsert(
      activityId: activityId,
      generation: generation,
      tokenHex: tokenHex
    )
    guard let credentials = LiveActivityPushCredentialStore.read(),
      let endpointURL = URL(string: "\(credentials.baseUrl)/v1/mobile/push-endpoints")
    else { return }

    let retryDelaysNanoseconds: [UInt64] = allowRetries
      ? [1_000_000_000, 2_000_000_000, 4_000_000_000]
      : []
    var attempt = 0
    while true {
      let outcome = await sendOnce(
        endpointURL: endpointURL,
        bearerToken: credentials.token,
        tokenHex: tokenHex,
        activityId: activityId,
        generation: generation
      )
      switch outcome {
      case .delivered, .permanentRejection:
        PendingActivityPushTokenStore.remove(
          activityId: activityId,
          generation: generation,
          tokenHex: tokenHex
        )
        return
      case .unauthorized:
        return
      case .retryableFailure:
        guard attempt < retryDelaysNanoseconds.count, !Task.isCancelled else {
          return
        }
        let delay = retryDelaysNanoseconds[attempt]
        attempt += 1
        try? await Task.sleep(nanoseconds: delay)
      }
    }
  }

  private static func sendOnce(
    endpointURL: URL,
    bearerToken: String,
    tokenHex: String,
    activityId: String,
    generation: String
  ) async -> ActivityTokenUploadOutcome {
    var request = URLRequest(url: endpointURL)
    request.httpMethod = "POST"
    request.timeoutInterval = 10
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("Bearer \(bearerToken)", forHTTPHeaderField: "Authorization")
    let body: [String: String] = [
      "kind": "activity_update",
      "token": tokenHex,
      "activityId": activityId,
      "generation": generation,
    ]
    guard let payload = try? JSONSerialization.data(withJSONObject: body) else {
      return .permanentRejection
    }
    request.httpBody = payload
    do {
      let (data, response) = try await URLSession.shared.data(for: request)
      guard let http = response as? HTTPURLResponse else {
        return .retryableFailure
      }
      switch http.statusCode {
      case 200..<300:
        return .delivered
      case 401, 403:
        return .unauthorized
      case 409:
        let text = String(data: data, encoding: .utf8) ?? ""
        return text.contains("activity_identity_mismatch") ? .permanentRejection : .retryableFailure
      case 408, 429, 500...599:
        return .retryableFailure
      default:
        return .permanentRejection
      }
    } catch {
      return .retryableFailure
    }
  }
}

public final class ClawMuseLiveActivityNotificationSubscriber: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    didReceiveRemoteNotification userInfo: [AnyHashable: Any],
    fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
  ) {
    guard #available(iOS 16.2, *) else {
      completionHandler(.noData)
      return
    }
    let statusEnvelope = Self.extractStatusEnvelope(from: userInfo)
    let agentReason = Self.extractAgentNotificationReason(from: userInfo)
    let isStatusReconcile = (statusEnvelope?["reconcileLiveActivity"] as? Bool) == true
    let isTerminalAgentPush = agentReason == "finished" || agentReason == "error"

    if !isStatusReconcile && !isTerminalAgentPush && PendingActivityPushTokenStore.readAll().isEmpty {
      completionHandler(.noData)
      return
    }

    Task {
      let box = await MainActor.run {
        let created = BackgroundTaskBox()
        created.begin()
        return created
      }
      defer {
        Task { @MainActor in
          box.end()
        }
      }
      var endedCount = 0
      if isStatusReconcile {
        let staleGeneration = statusEnvelope?["staleGeneration"] as? String
        let endAllIfIdle = (statusEnvelope?["endIdleActivities"] as? Bool) == true
        if !endAllIfIdle {
          await ClawMuseLiveActivityTokenUploader.flushPending(allowRetries: true)
        }
        let summary = await AgentLiveActivityController.shared.reconcileBackgroundActivities(
          staleGeneration: staleGeneration,
          endAllIfIdle: endAllIfIdle
        )
        if endAllIfIdle {
          PendingActivityPushTokenStore.clear()
        }
        endedCount = summary["endedCount"] ?? 0
      } else {
        await ClawMuseLiveActivityTokenUploader.flushPending(allowRetries: false)
        if isTerminalAgentPush {
          let summary = await AgentLiveActivityController.shared.reconcileTerminalPushArrival {
            PendingActivityPushTokenStore.hasPending(activityId: $0)
          }
          endedCount = summary["endedCount"] ?? 0
        }
      }
      await MainActor.run {
        completionHandler(endedCount > 0 ? .newData : .noData)
      }
    }
  }

  private static func parseBodyDictionary(from userInfo: [AnyHashable: Any]) -> [String: Any]? {
    if let dict = userInfo["body"] as? [String: Any] {
      return dict
    }
    if let dict = userInfo["body"] as? [AnyHashable: Any] {
      var mapped: [String: Any] = [:]
      for (key, value) in dict {
        if let stringKey = key as? String {
          mapped[stringKey] = value
        }
      }
      return mapped
    }
    if let jsonString = userInfo["body"] as? String,
      let data = jsonString.data(using: .utf8),
      let parsed = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    {
      return parsed
    }
    return nil
  }

  private static func extractStatusEnvelope(from userInfo: [AnyHashable: Any]) -> [String: Any]? {
    if let direct = userInfo["status"] as? [String: Any] {
      return direct
    }
    if let body = parseBodyDictionary(from: userInfo),
      let nested = body["status"] as? [String: Any]
    {
      return nested
    }
    return nil
  }

  private static func extractAgentNotificationReason(from userInfo: [AnyHashable: Any]) -> String? {
    if let body = parseBodyDictionary(from: userInfo),
      let reason = body["reason"] as? String, !reason.isEmpty
    {
      return reason
    }
    if let directReason = userInfo["reason"] as? String, !directReason.isEmpty {
      return directReason
    }
    return nil
  }
}

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

    AsyncFunction("setLiveActivityPushCredentials") { (baseUrl: String?, token: String?) in
      LiveActivityPushCredentialStore.write(baseUrl: baseUrl, token: token)
      guard #available(iOS 16.2, *), let baseUrl, let token, !baseUrl.isEmpty, !token.isEmpty else {
        if baseUrl == nil || token == nil {
          PendingActivityPushTokenStore.clear()
        }
        return
      }
      await self.flushPendingActivityPushTokens(allowRetries: true)
      let snapshot = await self.controller().pushTokenSnapshot()
      guard let activities = snapshot["activities"] as? [[String: String]] else { return }
      for entry in activities {
        if let pushToken = entry["pushToken"],
          let activityId = entry["activityId"],
          let generation = entry["generation"]
        {
          await self.uploadActivityPushToken(
            tokenHex: pushToken,
            activityId: activityId,
            generation: generation,
            allowRetries: true
          )
        }
      }
    }

    AsyncFunction("reconcileBackgroundActivities") {
      (staleGeneration: String?, endAllIfIdle: Bool) -> [String: Int] in
      guard #available(iOS 16.2, *) else {
        return ["endedCount": 0, "remainingCount": 0]
      }
      var result: [String: Int] = ["endedCount": 0, "remainingCount": 0]
      await self.withBackgroundExecution {
        if !endAllIfIdle {
          await self.flushPendingActivityPushTokens(allowRetries: true)
        }
        result = await self.controller().reconcileBackgroundActivities(
          staleGeneration: staleGeneration,
          endAllIfIdle: endAllIfIdle
        )
        if endAllIfIdle {
          PendingActivityPushTokenStore.clear()
        }
        self.cancelEndedActivityTokenTasks()
      }
      return result
    }

    Function("writeUsageWidgetSnapshot") { (json: String) -> Bool in
      guard let url = self.usageWidgetSnapshotURL() else { return false }
      do {
        try Data(json.utf8).write(to: url, options: .atomic)
      } catch {
        return false
      }
      if #available(iOS 14.0, *) {
        WidgetCenter.shared.reloadAllTimelines()
      }
      return true
    }

    Function("readUsageWidgetSnapshot") { () -> String? in
      guard let url = self.usageWidgetSnapshotURL(),
        let data = try? Data(contentsOf: url)
      else { return nil }
      return String(data: data, encoding: .utf8)
    }

    Function("readPinnedUsageWidgetDeviceIds") { () -> [String] in
      guard let defaults = UserDefaults(suiteName: AgentWidgetSharing.appGroup),
        let pins = defaults.dictionary(forKey: AgentWidgetSharing.usageWidgetPinsKey)
          as? [String: Double]
      else { return [] }
      let now = Date().timeIntervalSince1970
      return
        pins
        .filter { now - $0.value < AgentWidgetSharing.usageWidgetPinMaxAge }
        .map(\.key)
        .sorted()
    }

    Function("clearUsageWidgetSnapshot") { () -> Void in
      guard let url = self.usageWidgetSnapshotURL() else { return }
      try? FileManager.default.removeItem(at: url)
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
        await self?.flushPendingActivityPushTokens(allowRetries: false)
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
    static let usageWidgetFileName = "usage-widget-snapshot.json"
    static let usageWidgetPinsKey = "usageWidgetPins"
    static let usageWidgetPinMaxAge: TimeInterval = 2 * 24 * 3600
  }

  private func usageWidgetSnapshotURL() -> URL? {
    FileManager.default
      .containerURL(forSecurityApplicationGroupIdentifier: AgentWidgetSharing.appGroup)?
      .appendingPathComponent(AgentWidgetSharing.usageWidgetFileName)
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
        let tokenHex = token.hexString
        await self?.withBackgroundExecution {
          guard await self?.controller().recordPushToken(token, for: activity.id) == true else {
            return
          }
          guard !Task.isCancelled else { return }
          self?.sendEvent(
            pushTokenEvent,
            [
              "activityId": activity.id,
              "generation": activity.attributes.activityGeneration,
              "pushToken": tokenHex,
            ])
          await self?.uploadActivityPushToken(
            tokenHex: tokenHex,
            activityId: activity.id,
            generation: activity.attributes.activityGeneration,
            allowRetries: true
          )
        }
      }
    }
  }

  private func withBackgroundExecution(_ operation: () async -> Void) async {
    let box = await MainActor.run {
      let created = BackgroundTaskBox()
      created.begin()
      return created
    }
    await operation()
    await MainActor.run {
      box.end()
    }
  }

  private func flushPendingActivityPushTokens(allowRetries: Bool) async {
    await ClawMuseLiveActivityTokenUploader.flushPending(allowRetries: allowRetries)
  }

  private func uploadActivityPushToken(
    tokenHex: String,
    activityId: String,
    generation: String,
    allowRetries: Bool
  ) async {
    await ClawMuseLiveActivityTokenUploader.upload(
      tokenHex: tokenHex,
      activityId: activityId,
      generation: generation,
      allowRetries: allowRetries
    )
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
