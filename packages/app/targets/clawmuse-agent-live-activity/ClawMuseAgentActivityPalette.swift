import Foundation
import SwiftUI

enum ClawMuseAgentActivityPalette {
  static let background = Color(uiColor: .secondarySystemBackground)
  static let raised = Color(uiColor: .tertiarySystemFill)
  static let primaryText = Color.primary
  static let secondaryText = Color.secondary
  static let mutedText = Color.secondary.opacity(0.8)
  static let green = Color.green
  static let amber = Color.orange
  static let red = Color.red
  static let blue = Color.blue

  // Why: same consumption bands as the mobile UsageBar (green <60, amber <80, red ≥80).
  static func usageColor(usedPercent: Double) -> Color {
    if usedPercent >= 80 { return red }
    if usedPercent >= 60 { return amber }
    return green
  }
}

// Why: `en.lproj` is the development language, so the in-code fallbacks are the
// English strings. They only surface if Localizable.strings failed to copy into
// the bundle; zh-Hans.lproj carries the Chinese.
enum ClawMuseAgentActivityCopy {
  static let title = localized("CLAWMUSE_LIVE_ACTIVITY_TITLE", fallback: "ClawMuse remote tasks")
  static let running = localized("CLAWMUSE_LIVE_ACTIVITY_RUNNING", fallback: "Running")
  static let needsAction = localized(
    "CLAWMUSE_LIVE_ACTIVITY_NEEDS_ACTION",
    fallback: "Needs action"
  )
  static let completedUnread = localized(
    "CLAWMUSE_LIVE_ACTIVITY_COMPLETED_UNREAD",
    fallback: "Done unread"
  )
  static let completedCompact = localized(
    "CLAWMUSE_LIVE_ACTIVITY_COMPLETED_COMPACT",
    fallback: "Unread"
  )
  static let runningCompact = localized(
    "CLAWMUSE_LIVE_ACTIVITY_RUNNING_COMPACT",
    fallback: "Run"
  )
  static let pendingCompact = localized(
    "CLAWMUSE_LIVE_ACTIVITY_PENDING_COMPACT",
    fallback: "Pending"
  )
  static let statusCompact = localized(
    "CLAWMUSE_LIVE_ACTIVITY_STATUS_COMPACT",
    fallback: "Status"
  )
  static let unverifiableCompact = localized(
    "CLAWMUSE_LIVE_ACTIVITY_UNVERIFIABLE_COMPACT",
    fallback: "Unverified"
  )
  static let unverifiable = localized(
    "CLAWMUSE_LIVE_ACTIVITY_UNVERIFIABLE",
    fallback: "Status unverifiable"
  )
  static let idle = localized("CLAWMUSE_LIVE_ACTIVITY_IDLE", fallback: "No tasks running")
  static let runningHeadline = localized(
    "CLAWMUSE_LIVE_ACTIVITY_RUNNING_HEADLINE",
    fallback: "Tasks are running"
  )
  static let actionHeadline = localized(
    "CLAWMUSE_LIVE_ACTIVITY_ACTION_HEADLINE",
    fallback: "A task needs you"
  )
  static let completionHeadline = localized(
    "CLAWMUSE_LIVE_ACTIVITY_COMPLETION_HEADLINE",
    fallback: "A task finished"
  )
  static let usageSession = localized("CLAWMUSE_LIVE_ACTIVITY_USAGE_SESSION", fallback: "5h")
  static let usageWeekly = localized("CLAWMUSE_LIVE_ACTIVITY_USAGE_WEEKLY", fallback: "7d")
  static let usageRemainingFormat = localized(
    "CLAWMUSE_LIVE_ACTIVITY_USAGE_REMAINING",
    fallback: "%d%% left"
  )
  static let usageAccessibility = localized(
    "CLAWMUSE_LIVE_ACTIVITY_USAGE_ACCESSIBILITY",
    fallback: "Quota"
  )
  static let usageUnlimited = localized(
    "CLAWMUSE_LIVE_ACTIVITY_USAGE_UNLIMITED",
    fallback: "Unlimited"
  )
  static let waitingForUpdate = localized("CLAWMUSE_LIVE_ACTIVITY_WAITING_FOR_UPDATE", fallback: "Awaiting update")
  static let lastUpdated = localized("CLAWMUSE_LIVE_ACTIVITY_LAST_UPDATED", fallback: "Last synced")
  static let online = localized("CLAWMUSE_LIVE_ACTIVITY_ONLINE", fallback: "Online")
  // Why a key and not a literal: the Chinese build joins with a full-width comma
  // and the English one with ", ".
  static let listSeparator = localized("CLAWMUSE_LIST_SEPARATOR", fallback: ", ")
  static let usageRemainingWord = localized("CLAWMUSE_WIDGET_REMAINING", fallback: "Left")
  static let usageTimeHint = localized(
    "CLAWMUSE_WIDGET_TIME_HINT",
    fallback: "Line = time elapsed"
  )
  static let usageTitle = localized("CLAWMUSE_WIDGET_USAGE_TITLE", fallback: "Quota left")
  static let usageWeeklyShort = localized("CLAWMUSE_WIDGET_USAGE_WEEKLY_SHORT", fallback: "7d left")
  static let resetsFormat = localized("CLAWMUSE_WIDGET_RESETS_FORMAT", fallback: "Resets in %@")
  // Why a bare suffix as well as the format: the capsule's countdown is a date-styled
  // Text the system keeps ticking, and only a standalone Text gets that treatment — so
  // the words after it have to be their own view rather than interpolated into one string.
  static let resetsSuffix = localized("CLAWMUSE_WIDGET_RESETS_SUFFIX", fallback: "until reset")
  static let widgetTitle = localized(
    "CLAWMUSE_WIDGET_TITLE",
    fallback: "ClawMuse quota and tasks"
  )
  static let widgetDescription = localized(
    "CLAWMUSE_WIDGET_DESCRIPTION",
    fallback: "Remaining plan quota and remote task status"
  )
  static let noData = localized(
    "CLAWMUSE_WIDGET_NO_DATA",
    fallback: "Open ClawMuse and pair a host to see data"
  )
  static let ageJustNow = localized("CLAWMUSE_WIDGET_AGE_JUST_NOW", fallback: "just now")
  static let ageMinutesFormat = localized("CLAWMUSE_WIDGET_AGE_MINUTES", fallback: "%dm ago")
  static let ageHoursFormat = localized("CLAWMUSE_WIDGET_AGE_HOURS", fallback: "%dh ago")

  private static func localized(_ key: String, fallback: String) -> String {
    Bundle.main.localizedString(forKey: key, value: fallback, table: nil)
  }
}

@available(iOS 16.2, *)
extension ClawMuseAgentActivityAttributes.ContentState {
  private var aggregateCount: Int {
    runningCount + needsActionCount + completedUnreadCount + unverifiableCount
  }

  private var usesLegacyCounts: Bool {
    aggregateCount == 0 && activeCount > 0
  }

  var displayedRunningCount: Int {
    guard usesLegacyCounts else { return runningCount }
    switch phase {
    case "completed", "unverifiable": return 0
    default: return max(0, activeCount - displayedNeedsActionCount)
    }
  }

  var displayedNeedsActionCount: Int {
    guard usesLegacyCounts else { return needsActionCount }
    return phase == "attention" || phase == "error" ? max(1, attentionCount) : attentionCount
  }

  var displayedCompletedUnreadCount: Int {
    usesLegacyCounts && phase == "completed" ? max(1, activeCount) : completedUnreadCount
  }

  var displayedUnverifiableCount: Int {
    usesLegacyCounts && phase == "unverifiable" ? max(1, activeCount) : unverifiableCount
  }

  var isUnverifiable: Bool {
    connectionState == "unverifiable" || phase == "unverifiable"
      || displayedUnverifiableCount > 0
  }

  var headline: String {
    if displayedNeedsActionCount > 0 { return ClawMuseAgentActivityCopy.actionHeadline }
    if displayedCompletedUnreadCount > 0 { return ClawMuseAgentActivityCopy.completionHeadline }
    if displayedRunningCount > 0 { return ClawMuseAgentActivityCopy.runningHeadline }
    if isUnverifiable { return ClawMuseAgentActivityCopy.unverifiable }
    return ClawMuseAgentActivityCopy.idle
  }

  var compactSummary: String {
    var parts: [String] = []
    if displayedRunningCount > 0 {
      parts.append("\(displayedRunningCount)\(ClawMuseAgentActivityCopy.runningCompact)")
    }
    if displayedNeedsActionCount > 0 {
      parts.append("\(displayedNeedsActionCount)\(ClawMuseAgentActivityCopy.needsAction)")
    }
    if displayedCompletedUnreadCount > 0 {
      parts.append("\(displayedCompletedUnreadCount)\(ClawMuseAgentActivityCopy.completedCompact)")
    }
    if !parts.isEmpty {
      return parts.joined(separator: " ")
    }
    return isUnverifiable ? ClawMuseAgentActivityCopy.unverifiable : ClawMuseAgentActivityCopy.idle
  }

  var accessibilitySummary: String {
    var parts = [
      "\(displayedRunningCount) \(ClawMuseAgentActivityCopy.running)",
      "\(displayedNeedsActionCount) \(ClawMuseAgentActivityCopy.needsAction)",
      "\(displayedCompletedUnreadCount) \(ClawMuseAgentActivityCopy.completedUnread)",
    ]
    if isUnverifiable {
      parts.append(ClawMuseAgentActivityCopy.unverifiable)
    }
    return parts.joined(separator: ClawMuseAgentActivityCopy.listSeparator)
  }

  var statusColor: Color {
    if displayedNeedsActionCount > 0 { return ClawMuseAgentActivityPalette.amber }
    if displayedCompletedUnreadCount > 0 { return ClawMuseAgentActivityPalette.blue }
    if displayedRunningCount > 0 { return ClawMuseAgentActivityPalette.green }
    if isUnverifiable { return ClawMuseAgentActivityPalette.mutedText }
    return ClawMuseAgentActivityPalette.mutedText
  }

  var statusSymbol: String {
    if displayedNeedsActionCount > 0 { return "exclamationmark" }
    if displayedCompletedUnreadCount > 0 { return "checkmark" }
    if displayedRunningCount > 0 { return "sparkles" }
    if isUnverifiable { return "wifi.slash" }
    return "circle"
  }
}

@available(iOS 16.2, *)
struct ClawMuseAgentActivityPresentation {
  let state: ClawMuseAgentActivityAttributes.ContentState
  let isStale: Bool

  // ActivityKit staleness means no fresh push arrived. Preserve the last known
  // counts and label their age instead of turning a delayed snapshot into an error.
  var headline: String {
    showsUnverifiable ? ClawMuseAgentActivityCopy.title : state.headline
  }

  var compactSummary: String {
    showsUnverifiable ? ClawMuseAgentActivityCopy.waitingForUpdate : state.compactSummary
  }

  var updatedAt: Date? {
    guard state.updatedAt.isFinite, state.updatedAt > 0 else { return nil }
    // Both the native bridge and the status service send Unix milliseconds.
    return Date(timeIntervalSince1970: state.updatedAt / 1_000)
  }

  var accessibilitySummary: String {
    var parts = [
      "\(metricText(state.displayedRunningCount, mayBeStale: true)) \(ClawMuseAgentActivityCopy.running)",
      "\(metricText(state.displayedNeedsActionCount, mayBeStale: true)) \(ClawMuseAgentActivityCopy.needsAction)",
      "\(state.displayedCompletedUnreadCount) \(ClawMuseAgentActivityCopy.completedCompact)",
    ]
    if showsUnverifiable {
      parts.append(ClawMuseAgentActivityCopy.waitingForUpdate)
    }
    if let updatedAt {
      parts.append("\(ClawMuseAgentActivityCopy.lastUpdated) \(updatedAt.formatted(date: .omitted, time: .shortened))")
    }
    return parts.joined(separator: ClawMuseAgentActivityCopy.listSeparator)
  }

  var statusColor: Color {
    showsUnverifiable ? ClawMuseAgentActivityPalette.mutedText : state.statusColor
  }

  var statusSymbol: String {
    showsUnverifiable ? "clock" : state.statusSymbol
  }

  var showsUnverifiable: Bool {
    isStale || state.isUnverifiable
  }

  var minimalCount: Int? {
    let pendingCount = state.displayedNeedsActionCount + state.displayedCompletedUnreadCount
    if pendingCount > 0 { return pendingCount }
    return state.displayedRunningCount > 0 ? state.displayedRunningCount : nil
  }

  var minimalCountText: String? {
    guard let minimalCount else { return nil }
    return minimalCount > 99 ? "99+" : "\(minimalCount)"
  }

  func metricText(_ count: Int, mayBeStale: Bool) -> String {
    // An expired host lease moves active items into unverifiableCount. Zero here
    // means unknown, not that every task stopped. Completed facts remain readable.
    if mayBeStale && state.isUnverifiable && count == 0 { return "–" }
    return "\(count)"
  }
}
