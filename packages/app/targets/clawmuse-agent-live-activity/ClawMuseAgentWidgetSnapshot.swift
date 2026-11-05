import Foundation
import WidgetKit

// Shared with the app through the App Group: the app writes the last snapshot
// it rendered (counts, plans, and the task titles only it knows) plus a
// summary-only token; the widget refreshes counts and plans from the status
// service on its own timeline and keeps the cached tasks.
enum ClawMuseAgentWidgetStore {
  static let appGroup = "group.com.clawmuse"
  static let snapshotKey = "clawmuse.widget.snapshot"
  static let credentialsKey = "clawmuse.widget.credentials"

  static var defaults: UserDefaults? { UserDefaults(suiteName: appGroup) }

  static func readSnapshot() -> ClawMuseAgentWidgetSnapshot? {
    guard let data = defaults?.data(forKey: snapshotKey) else { return nil }
    return try? JSONDecoder().decode(ClawMuseAgentWidgetSnapshot.self, from: data)
  }

  static func readCredentials() -> ClawMuseAgentWidgetCredentials? {
    guard let data = defaults?.data(forKey: credentialsKey) else { return nil }
    return try? JSONDecoder().decode(ClawMuseAgentWidgetCredentials.self, from: data)
  }
}

struct ClawMuseAgentWidgetCredentials: Codable {
  var baseUrl: String
  var token: String
}

struct ClawMuseAgentWidgetTask: Codable, Hashable {
  var repo: String
  var title: String
  var phase: String
  var changedAt: Double
  var color: String?
}

@available(iOS 16.2, *)
struct ClawMuseAgentWidgetSnapshot: Codable {
  var updatedAt: Double = 0
  var connectionState = "live"
  var headline: String?
  var runningCount = 0
  var needsActionCount = 0
  var completedUnreadCount = 0
  var unverifiableCount = 0
  var usages: [ClawMuseAgentActivityAttributes.Usage] = []
  var tasks: [ClawMuseAgentWidgetTask] = []

  private enum CodingKeys: String, CodingKey {
    case updatedAt, connectionState, headline, runningCount, needsActionCount
    case completedUnreadCount, unverifiableCount, usages, tasks
  }

  init() {}

  init(from decoder: Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    updatedAt = try values.decodeIfPresent(Double.self, forKey: .updatedAt) ?? 0
    connectionState = try values.decodeIfPresent(String.self, forKey: .connectionState) ?? "live"
    headline = try values.decodeIfPresent(String.self, forKey: .headline)
    runningCount = try values.decodeIfPresent(Int.self, forKey: .runningCount) ?? 0
    needsActionCount = try values.decodeIfPresent(Int.self, forKey: .needsActionCount) ?? 0
    completedUnreadCount = try values.decodeIfPresent(Int.self, forKey: .completedUnreadCount) ?? 0
    unverifiableCount = try values.decodeIfPresent(Int.self, forKey: .unverifiableCount) ?? 0
    usages = (try? values.decodeIfPresent([ClawMuseAgentActivityAttributes.Usage].self, forKey: .usages)) ?? []
    tasks = (try? values.decodeIfPresent([ClawMuseAgentWidgetTask].self, forKey: .tasks)) ?? []
  }

  /// The capsule's content state, so widget views reuse the same presentation rules.
  var contentState: ClawMuseAgentActivityAttributes.ContentState {
    var state = ClawMuseAgentActivityAttributes.ContentState()
    state.runningCount = runningCount
    state.needsActionCount = needsActionCount
    state.completedUnreadCount = completedUnreadCount
    state.unverifiableCount = unverifiableCount
    state.connectionState = connectionState
    state.updatedAt = updatedAt
    state.usages = usages
    return state
  }

  /// Overlays the service summary (counts + plans) on the cached snapshot,
  /// which also holds the tasks and the host plans only the app can see.
  func merging(summary: ClawMuseAgentWidgetSummary) -> ClawMuseAgentWidgetSnapshot {
    var next = self
    next.updatedAt = Date().timeIntervalSince1970
    next.connectionState = summary.connectivity
    next.runningCount = summary.runningCount
    next.needsActionCount = summary.needsActionCount
    next.completedUnreadCount = summary.completedUnreadCount
    next.unverifiableCount = summary.unverifiableCount
    next.usages = Self.mergedUsages(cached: usages, fresh: summary.usages)
    return next
  }

  /// Refresh what the service reports and keep the rest in the app's order —
  /// a host that publishes no usage would otherwise drop off on every refresh.
  static func mergedUsages(
    cached: [ClawMuseAgentActivityAttributes.Usage],
    fresh: [ClawMuseAgentActivityAttributes.Usage]
  ) -> [ClawMuseAgentActivityAttributes.Usage] {
    let key = { (usage: ClawMuseAgentActivityAttributes.Usage) in "\(usage.provider)\u{0}\(usage.label ?? "")" }
    var byKey: [String: ClawMuseAgentActivityAttributes.Usage] = [:]
    for usage in fresh {
      byKey[key(usage)] = usage
    }
    var merged = cached.map { byKey.removeValue(forKey: key($0)) ?? $0 }
    merged.append(contentsOf: fresh.filter { byKey[key($0)] != nil })
    return merged
  }
}

/// `GET /v1/mobile/summary` — only the fields the widget renders; `resetsAt`
/// arrives as ISO-8601 and becomes epoch seconds like the push payload.
@available(iOS 16.2, *)
struct ClawMuseAgentWidgetSummary: Decodable {
  var connectivity = "live"
  var runningCount = 0
  var needsActionCount = 0
  var completedUnreadCount = 0
  var unverifiableCount = 0
  var usages: [ClawMuseAgentActivityAttributes.Usage] = []

  private enum CodingKeys: String, CodingKey {
    case connectivity, runningCount, needsActionCount, completedUnreadCount, unverifiableCount, usages
  }

  private struct Window: Decodable {
    var usedPercent: Double?
    var windowMinutes: Int?
    var resetsAt: String?
    var unlimited: Bool?
  }

  private struct Entry: Decodable {
    var provider: String?
    var label: String?
    var session: Window?
    var weekly: Window?
  }

  init(from decoder: Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    connectivity = try values.decodeIfPresent(String.self, forKey: .connectivity) ?? "live"
    runningCount = try values.decodeIfPresent(Int.self, forKey: .runningCount) ?? 0
    needsActionCount = try values.decodeIfPresent(Int.self, forKey: .needsActionCount) ?? 0
    completedUnreadCount = try values.decodeIfPresent(Int.self, forKey: .completedUnreadCount) ?? 0
    unverifiableCount = try values.decodeIfPresent(Int.self, forKey: .unverifiableCount) ?? 0
    let entries = (try? values.decodeIfPresent([Entry].self, forKey: .usages)) ?? []
    let iso = ISO8601DateFormatter()
    iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    let plain = ISO8601DateFormatter()
    func window(_ value: Window?) -> ClawMuseAgentActivityAttributes.UsageWindow? {
      guard let value, let used = value.usedPercent, let minutes = value.windowMinutes else { return nil }
      let resets = value.resetsAt.flatMap { iso.date(from: $0) ?? plain.date(from: $0) }
      return ClawMuseAgentActivityAttributes.UsageWindow(
        usedPercent: used,
        windowMinutes: minutes,
        resetsAt: resets?.timeIntervalSince1970,
        unlimited: value.unlimited ?? false
      )
    }
    usages = entries.compactMap { entry in
      guard let provider = entry.provider, !provider.isEmpty else { return nil }
      return ClawMuseAgentActivityAttributes.Usage(
        provider: provider, label: entry.label, session: window(entry.session), weekly: window(entry.weekly)
      )
    }
  }
}

@available(iOS 16.2, *)
enum ClawMuseAgentWidgetRefresh {
  static let interval: TimeInterval = 15 * 60

  /// Cached snapshot, refreshed from the service when a widget token exists.
  static func load() async -> ClawMuseAgentWidgetSnapshot? {
    let cached = ClawMuseAgentWidgetStore.readSnapshot()
    guard let credentials = ClawMuseAgentWidgetStore.readCredentials(),
      let url = URL(string: credentials.baseUrl.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + "/v1/mobile/summary")
    else { return cached }
    var request = URLRequest(url: url, timeoutInterval: 12)
    request.setValue("Bearer \(credentials.token)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    guard let (data, response) = try? await URLSession.shared.data(for: request),
      (response as? HTTPURLResponse)?.statusCode == 200,
      let summary = try? JSONDecoder().decode(ClawMuseAgentWidgetSummary.self, from: data)
    else { return cached }
    return (cached ?? ClawMuseAgentWidgetSnapshot()).merging(summary: summary)
  }
}
