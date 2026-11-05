import SwiftUI
import WidgetKit

@available(iOS 17.0, *)
struct ClawMuseAgentQuotaEntry: TimelineEntry {
  let date: Date
  let snapshot: ClawMuseAgentWidgetSnapshot?
}

@available(iOS 17.0, *)
struct ClawMuseAgentQuotaProvider: TimelineProvider {
  func placeholder(in context: Context) -> ClawMuseAgentQuotaEntry {
    ClawMuseAgentQuotaEntry(date: Date(), snapshot: ClawMuseAgentWidgetStore.readSnapshot())
  }

  func getSnapshot(in context: Context, completion: @escaping (ClawMuseAgentQuotaEntry) -> Void) {
    completion(ClawMuseAgentQuotaEntry(date: Date(), snapshot: ClawMuseAgentWidgetStore.readSnapshot()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<ClawMuseAgentQuotaEntry>) -> Void) {
    Task {
      let snapshot = await ClawMuseAgentWidgetRefresh.load()
      let entry = ClawMuseAgentQuotaEntry(date: Date(), snapshot: snapshot)
      completion(Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(ClawMuseAgentWidgetRefresh.interval))))
    }
  }
}

@available(iOS 17.0, *)
struct ClawMuseAgentQuotaWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "ClawMuseAgentQuotaWidget", provider: ClawMuseAgentQuotaProvider()) { entry in
      ClawMuseAgentQuotaWidgetView(entry: entry)
        .containerBackground(ClawMuseAgentActivityPalette.background, for: .widget)
        .widgetURL(URL(string: ClawMuseAgentActivityAttributes.homeDeepLink))
    }
    .configurationDisplayName(ClawMuseAgentActivityCopy.widgetTitle)
    .description(ClawMuseAgentActivityCopy.widgetDescription)
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    .contentMarginsDisabled()
  }
}

@available(iOS 17.0, *)
struct ClawMuseAgentQuotaWidgetView: View {
  @Environment(\.widgetFamily) private var family
  let entry: ClawMuseAgentQuotaEntry

  var body: some View {
    if let snapshot = entry.snapshot {
      switch family {
      case .systemSmall: ClawMuseAgentQuotaSmallView(snapshot: snapshot, now: entry.date)
      case .systemLarge: ClawMuseAgentQuotaLargeView(snapshot: snapshot, now: entry.date)
      default: ClawMuseAgentQuotaMediumView(snapshot: snapshot, now: entry.date)
      }
    } else {
      Text(ClawMuseAgentActivityCopy.noData)
        .font(.system(size: 12))
        .foregroundStyle(ClawMuseAgentActivityPalette.mutedText)
        .multilineTextAlignment(.center)
        .padding(16)
    }
  }
}

@available(iOS 17.0, *)
private enum ClawMuseAgentQuotaFormat {
  static func age(since updatedAt: Double, now: Date) -> String {
    let minutes = Int(max(0, now.timeIntervalSince1970 - updatedAt) / 60)
    if minutes < 1 { return ClawMuseAgentActivityCopy.ageJustNow }
    if minutes < 60 {
      return String(format: ClawMuseAgentActivityCopy.ageMinutesFormat, minutes)
    }
    return String(format: ClawMuseAgentActivityCopy.ageHoursFormat, minutes / 60)
  }

  static func phaseColor(_ phase: String) -> Color {
    switch phase {
    case "attention", "error", "needs_action", "failed": return ClawMuseAgentActivityPalette.amber
    case "completed": return ClawMuseAgentActivityPalette.blue
    case "unverifiable": return ClawMuseAgentActivityPalette.mutedText
    default: return ClawMuseAgentActivityPalette.green
    }
  }

  static func hex(_ value: String?) -> Color? {
    guard var text = value?.trimmingCharacters(in: .whitespaces), text.hasPrefix("#") else { return nil }
    text.removeFirst()
    guard text.count == 6, let number = UInt32(text, radix: 16) else { return nil }
    return Color(
      red: Double((number >> 16) & 0xFF) / 255,
      green: Double((number >> 8) & 0xFF) / 255,
      blue: Double(number & 0xFF) / 255
    )
  }
}

/// Small: the primary plan's 5h remaining as one number, then both window bars.
@available(iOS 17.0, *)
struct ClawMuseAgentQuotaSmallView: View {
  let snapshot: ClawMuseAgentWidgetSnapshot
  let now: Date

  private var state: ClawMuseAgentActivityAttributes.ContentState { snapshot.contentState }
  private var primary: ClawMuseAgentActivityAttributes.Usage? {
    snapshot.usages.first(where: { $0.hasWindows })
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack {
        Text(primary?.displayName ?? "—")
          .font(.system(size: 11, weight: .semibold))
          .foregroundStyle(ClawMuseAgentActivityPalette.mutedText)
          .lineLimit(1)
          .minimumScaleFactor(0.8)
        Spacer(minLength: 0)
        Circle().fill(state.statusColor).frame(width: 7, height: 7)
      }
      if let session = primary?.session {
        VStack(alignment: .leading, spacing: 1) {
          HStack(alignment: .firstTextBaseline, spacing: 1) {
            Text("\(session.remainingPercent)")
              .font(.system(size: 38, weight: .bold))
              .monospacedDigit()
            Text("%")
              .font(.system(size: 19, weight: .semibold))
              .foregroundStyle(ClawMuseAgentActivityPalette.mutedText)
          }
          .lineLimit(1)
          .minimumScaleFactor(0.7)
          Text(
            [
              ClawMuseAgentActivityCopy.usageRemainingWord,
              ClawMuseAgentUsageCopy.resetCountdown(
                to: session.resetsAt,
                from: now,
                includesResetLabel: true
              )
            ]
            .compactMap { $0 }.joined(separator: " · ")
          )
          .font(.system(size: 11))
          .foregroundStyle(ClawMuseAgentActivityPalette.mutedText)
          .lineLimit(1)
        }
      }
      Spacer(minLength: 0)
      if let primary {
        VStack(alignment: .leading, spacing: 3) {
          if let session = primary.session {
            ClawMuseAgentUsageWindowRow(
              label: ClawMuseAgentActivityCopy.usageSession,
              window: session,
              barHeight: 5
            )
          }
          if let weekly = primary.weekly {
            ClawMuseAgentUsageWindowRow(
              label: ClawMuseAgentActivityCopy.usageWeekly,
              window: weekly,
              barHeight: 5
            )
          }
        }
      }
    }
    .padding(14)
  }
}

@available(iOS 17.0, *)
struct ClawMuseAgentQuotaMediumView: View {
  let snapshot: ClawMuseAgentWidgetSnapshot
  let now: Date

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack {
        Text(ClawMuseAgentActivityCopy.usageTitle)
          .font(.system(size: 11, weight: .semibold))
          .foregroundStyle(ClawMuseAgentActivityPalette.mutedText)
        Spacer(minLength: 0)
        ClawMuseAgentCountsInlineView(state: snapshot.contentState, isStale: false, size: 11)
      }
      ClawMuseAgentUsageGridView(
        usages: snapshot.usages,
        maximum: 4,
        columnSpacing: 14,
        nameSize: 12,
        valueSize: 11
      )
      Spacer(minLength: 0)
    }
    .padding(14)
  }
}

@available(iOS 17.0, *)
struct ClawMuseAgentQuotaLargeView: View {
  let snapshot: ClawMuseAgentWidgetSnapshot
  let now: Date

  private var state: ClawMuseAgentActivityAttributes.ContentState { snapshot.contentState }

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack {
        Text(snapshot.headline ?? state.headline)
          .font(.system(size: 15, weight: .semibold))
          .lineLimit(1)
        Spacer(minLength: 0)
        HStack(spacing: 6) {
          Text(ClawMuseAgentQuotaFormat.age(since: snapshot.updatedAt, now: now))
            .font(.system(size: 11))
            .foregroundStyle(ClawMuseAgentActivityPalette.mutedText)
          ClawMuseAgentOnlineBadgeView(showsUnverifiable: state.isUnverifiable)
        }
      }
      if !visibleTasks.isEmpty {
        VStack(spacing: 10) {
          ForEach(Array(visibleTasks.enumerated()), id: \.offset) { _, task in
            HStack(spacing: 10) {
              Circle().fill(ClawMuseAgentQuotaFormat.phaseColor(task.phase)).frame(width: 8, height: 8)
              Text(task.repo)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(ClawMuseAgentQuotaFormat.hex(task.color) ?? ClawMuseAgentActivityPalette.primaryText)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .frame(width: 78, alignment: .leading)
              Text(task.title)
                .font(.system(size: 12))
                .foregroundStyle(ClawMuseAgentActivityPalette.secondaryText)
                .lineLimit(1)
              Spacer(minLength: 0)
              Text(ClawMuseAgentQuotaFormat.age(since: task.changedAt, now: now))
                .font(.system(size: 11))
                .foregroundStyle(ClawMuseAgentActivityPalette.mutedText)
                .monospacedDigit()
            }
          }
        }
        Divider().overlay(ClawMuseAgentActivityPalette.raised)
      }
      HStack {
        Text(ClawMuseAgentActivityCopy.usageTitle)
          .font(.system(size: 11, weight: .semibold))
          .foregroundStyle(ClawMuseAgentActivityPalette.mutedText)
        Spacer(minLength: 0)
        Text(ClawMuseAgentActivityCopy.usageTimeHint)
          .font(.system(size: 11))
          .foregroundStyle(ClawMuseAgentActivityPalette.mutedText)
      }
      ClawMuseAgentUsageGridView(
        usages: snapshot.usages,
        maximum: nil,
        columnSpacing: 16,
        rowSpacing: 8,
        nameSize: 12,
        valueSize: 11,
        showsResetCountdown: true,
        now: now
      )
      // Why: sections stack from the top; slack collects at the bottom instead
      // of tearing a hole between them when a host reports few plans or tasks.
      Spacer(minLength: 0)
    }
    .padding(16)
  }

  private var visibleTasks: ArraySlice<ClawMuseAgentWidgetTask> {
    snapshot.tasks.prefix(taskLimit)
  }

  /// Quota rows own the fixed widget height; tasks use only the remaining room.
  private var taskLimit: Int {
    switch (snapshot.usages.filter(\.hasWindows).count + 1) / 2 {
    case ...3: return 3
    case 4: return 2
    default: return 0
    }
  }
}
