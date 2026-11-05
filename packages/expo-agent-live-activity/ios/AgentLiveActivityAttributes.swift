import ActivityKit
import Foundation

@available(iOS 16.2, *)
struct ClawMuseAgentActivityAttributes: ActivityAttributes {
  static let homeDeepLink = "clawmuse://home?focus=agent-activity"

  // Why: account consumption only (schema v3). Decoded leniently so a
  // malformed usage block never drops the whole status update.
  struct UsageWindow: Codable, Hashable {
    var usedPercent = 0.0
    var windowMinutes = 0
    var resetsAt: Double?
    var unlimited = false

    private enum CodingKeys: String, CodingKey {
      case usedPercent, windowMinutes, resetsAt, unlimited
    }

    init(usedPercent: Double, windowMinutes: Int, resetsAt: Double?, unlimited: Bool = false) {
      self.usedPercent = min(100, max(0, usedPercent))
      self.windowMinutes = max(0, windowMinutes)
      self.resetsAt = resetsAt
      self.unlimited = unlimited
    }

    init(from decoder: Decoder) throws {
      let values = try decoder.container(keyedBy: CodingKeys.self)
      usedPercent = min(
        100, max(0, try values.decodeIfPresent(Double.self, forKey: .usedPercent) ?? 0)
      )
      windowMinutes = max(0, try values.decodeIfPresent(Int.self, forKey: .windowMinutes) ?? 0)
      resetsAt = try values.decodeIfPresent(Double.self, forKey: .resetsAt)
      unlimited = try values.decodeIfPresent(Bool.self, forKey: .unlimited) ?? false
    }

    var remainingPercent: Int {
      Int((100 - usedPercent).rounded())
    }

    /// Fraction of the window already elapsed, derived from the reset time.
    func elapsedFraction(at now: Date) -> Double? {
      guard let resetsAt, windowMinutes > 0 else { return nil }
      let remainingSeconds = resetsAt - now.timeIntervalSince1970
      let windowSeconds = Double(windowMinutes) * 60
      return min(1, max(0, 1 - remainingSeconds / windowSeconds))
    }
  }

  struct Usage: Codable, Hashable {
    var provider = ""
    var label: String?
    var session: UsageWindow?
    var weekly: UsageWindow?

    private enum CodingKeys: String, CodingKey {
      case provider, label, session, weekly
    }

    init(provider: String, label: String? = nil, session: UsageWindow?, weekly: UsageWindow?) {
      self.provider = provider
      self.label = label
      self.session = session
      self.weekly = weekly
    }

    init(from decoder: Decoder) throws {
      let values = try decoder.container(keyedBy: CodingKeys.self)
      provider = try values.decodeIfPresent(String.self, forKey: .provider) ?? ""
      label = try values.decodeIfPresent(String.self, forKey: .label)
      session = try? values.decodeIfPresent(UsageWindow.self, forKey: .session)
      weekly = try? values.decodeIfPresent(UsageWindow.self, forKey: .weekly)
    }

    /// Short name for the row: the plan label when one was published, else the provider.
    var displayName: String {
      if let label, !label.isEmpty { return label }
      switch provider {
      case "claude": return "Claude"
      case "codex": return "Codex"
      case "zhipu": return "GLM"
      case "minimax": return "MiniMax"
      default: return provider
      }
    }

    var hasWindows: Bool {
      session != nil || weekly != nil
    }
  }

  struct ContentState: Codable, Hashable {
    var id = "clawmuse-agent-live-activity"
    var phase = "working"
    var title = "ClawMuse"
    var status = ""
    var compact = ""
    var detail: String?
    var workspace: String?
    var activeCount = 0
    var attentionCount = 0
    var runningCount = 0
    var needsActionCount = 0
    var completedUnreadCount = 0
    var unverifiableCount = 0
    var connectionState = "live"
    var revision = 0
    var updatedAt = 0.0
    var deepLink = ClawMuseAgentActivityAttributes.homeDeepLink
    var usages: [Usage] = []

    private enum CodingKeys: String, CodingKey {
      case id, phase, title, status, compact, detail, workspace
      case activeCount, attentionCount, runningCount, needsActionCount
      case completedUnreadCount, unverifiableCount, connectionState, revision
      case updatedAt, deepLink, usages
    }

    // Why: declaring init(from:) removes the synthesized no-argument init the
    // widget uses to build a state from its own snapshot.
    init() {}

    init(from decoder: Decoder) throws {
      let values = try decoder.container(keyedBy: CodingKeys.self)
      id = try values.decodeIfPresent(String.self, forKey: .id) ?? id
      phase = try values.decodeIfPresent(String.self, forKey: .phase) ?? phase
      title = try values.decodeIfPresent(String.self, forKey: .title) ?? title
      status = try values.decodeIfPresent(String.self, forKey: .status) ?? status
      compact = try values.decodeIfPresent(String.self, forKey: .compact) ?? compact
      detail = try values.decodeIfPresent(String.self, forKey: .detail)
      workspace = try values.decodeIfPresent(String.self, forKey: .workspace)
      activeCount = Self.safeCount(try values.decodeIfPresent(Int.self, forKey: .activeCount))
      attentionCount = Self.safeCount(
        try values.decodeIfPresent(Int.self, forKey: .attentionCount)
      )

      let decodedRunning = try values.decodeIfPresent(Int.self, forKey: .runningCount)
      let decodedNeedsAction = try values.decodeIfPresent(Int.self, forKey: .needsActionCount)
      let decodedCompleted = try values.decodeIfPresent(Int.self, forKey: .completedUnreadCount)
      let decodedUnverifiable = try values.decodeIfPresent(Int.self, forKey: .unverifiableCount)
      let hasAggregateCounts =
        decodedRunning != nil || decodedNeedsAction != nil || decodedCompleted != nil
        || decodedUnverifiable != nil

      if hasAggregateCounts {
        runningCount = Self.safeCount(decodedRunning)
        needsActionCount = Self.safeCount(decodedNeedsAction)
        completedUnreadCount = Self.safeCount(decodedCompleted)
        unverifiableCount = Self.safeCount(decodedUnverifiable)
        activeCount = max(
          activeCount,
          runningCount + needsActionCount + completedUnreadCount + unverifiableCount
        )
        attentionCount = max(attentionCount, needsActionCount)
      } else {
        applyLegacyCounts()
      }

      let decodedConnection = try values.decodeIfPresent(String.self, forKey: .connectionState)
      connectionState =
        decodedConnection == "unverifiable" || phase == "unverifiable" ? "unverifiable" : "live"
      revision = max(0, try values.decodeIfPresent(Int.self, forKey: .revision) ?? 0)
      updatedAt = max(0, try values.decodeIfPresent(Double.self, forKey: .updatedAt) ?? 0)
      deepLink =
        try values.decodeIfPresent(String.self, forKey: .deepLink)
        ?? ClawMuseAgentActivityAttributes.homeDeepLink
      usages = ((try? values.decodeIfPresent([Usage].self, forKey: .usages)) ?? nil) ?? []
    }

    private static func safeCount(_ count: Int?) -> Int {
      min(9_999, max(0, count ?? 0))
    }

    private mutating func applyLegacyCounts() {
      let total = Self.safeCount(activeCount)
      switch phase {
      case "attention", "error":
        needsActionCount = max(1, Self.safeCount(attentionCount))
        runningCount = max(0, total - needsActionCount)
      case "completed":
        completedUnreadCount = max(1, total)
      case "unverifiable":
        unverifiableCount = max(1, total)
      default:
        needsActionCount = Self.safeCount(attentionCount)
        runningCount = max(0, total - needsActionCount)
      }
    }
  }

  var kind = "clawmuse-agent-activity"
  var activityGeneration = ""

  private enum CodingKeys: String, CodingKey {
    case kind, activityGeneration
  }

  init(activityGeneration: String = UUID().uuidString.lowercased()) {
    self.activityGeneration = activityGeneration
  }

  init(from decoder: Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    kind = try values.decodeIfPresent(String.self, forKey: .kind) ?? kind
    activityGeneration =
      try values.decodeIfPresent(String.self, forKey: .activityGeneration) ?? activityGeneration
  }
}
