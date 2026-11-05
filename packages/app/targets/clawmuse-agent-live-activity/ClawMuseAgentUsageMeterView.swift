import SwiftUI

// Why: one meter for the capsule and the widgets so both read the same way —
// colour is used quota, the vertical line marks how much of the window has
// elapsed, and the thin connector between them is the pace gap (line to the
// right of the fill = usage trailing time, so the window will not run out).
@available(iOS 16.2, *)
struct ClawMuseAgentUsageMeterView: View {
  let window: ClawMuseAgentActivityAttributes.UsageWindow
  var height: CGFloat = 5
  var now = Date()

  var body: some View {
    GeometryReader { proxy in
      ZStack(alignment: .leading) {
        if window.unlimited {
          ClawMuseAgentDashedTrack(height: height)
        } else {
          Capsule().fill(ClawMuseAgentActivityPalette.raised)
          let used = max(0, proxy.size.width * window.usedPercent / 100)
          Capsule()
            .fill(ClawMuseAgentActivityPalette.usageColor(usedPercent: window.usedPercent))
            .frame(width: used)
          if let elapsed = window.elapsedFraction(at: now) {
            let mark = proxy.size.width * elapsed
            // Why: a low connector, not a full-height block — the gap should
            // read as a distance between two marks, not as a second fill.
            Rectangle()
              .fill(ClawMuseAgentActivityPalette.primaryText.opacity(0.22))
              .frame(width: abs(mark - used), height: 2)
              .offset(x: min(mark, used))
            Rectangle()
              .fill(ClawMuseAgentActivityPalette.primaryText.opacity(0.9))
              .frame(width: 2, height: height + 6)
              .cornerRadius(1)
              .offset(x: max(0, min(proxy.size.width - 2, mark - 1)))
          }
        }
      }
      .frame(height: height)
      .frame(maxHeight: .infinity, alignment: .center)
    }
    // Why: the vertical mark overhangs the bar, so the row reserves room for it.
    .frame(height: height + 6)
  }
}

@available(iOS 16.2, *)
private struct ClawMuseAgentDashedTrack: View {
  let height: CGFloat

  var body: some View {
    GeometryReader { proxy in
      HStack(spacing: 4) {
        ForEach(0..<max(1, Int(proxy.size.width / 8)), id: \.self) { _ in
          Capsule().fill(ClawMuseAgentActivityPalette.raised).frame(width: 4, height: height)
        }
      }
    }
  }
}

/// "5h ▓▓▓░░ 47%" — one window line inside a plan cell.
@available(iOS 16.2, *)
struct ClawMuseAgentUsageWindowRow: View {
  let label: String
  let window: ClawMuseAgentActivityAttributes.UsageWindow
  var barHeight: CGFloat = 5
  var valueSize: CGFloat = 11
  var showsResetCountdown = false
  var now = Date()

  var body: some View {
    HStack(alignment: .center, spacing: 6) {
      Text(label)
        .font(.system(size: 10, weight: .semibold))
        .foregroundStyle(ClawMuseAgentActivityPalette.mutedText)
        .frame(width: 16, alignment: .leading)
      ClawMuseAgentUsageMeterView(window: window, height: barHeight)
      HStack(alignment: .firstTextBaseline, spacing: 3) {
        Text(ClawMuseAgentUsageCopy.remaining(window))
          .font(.system(size: valueSize, weight: .semibold))
          .foregroundStyle(ClawMuseAgentActivityPalette.primaryText)
        if showsResetCountdown,
          let countdown = ClawMuseAgentUsageCopy.resetCountdown(to: window.resetsAt, from: now)
        {
          Text(countdown)
            .font(.system(size: 9))
            .foregroundStyle(ClawMuseAgentActivityPalette.mutedText)
        }
      }
      .monospacedDigit()
      .lineLimit(1)
      .minimumScaleFactor(0.75)
      .frame(width: showsResetCountdown ? 72 : 32, alignment: .trailing)
    }
  }
}

/// When the session window comes back, as a countdown the system keeps running.
///
/// Why not the computed string `ClawMuseAgentUsageCopy.resetCountdown` returns: a Live Activity
/// is redrawn when a push lands, not on a clock, so a countdown rendered from `now` freezes
/// at that instant and drifts for as long as the counts hold still. A date-styled `Text` is
/// the one kind iOS keeps ticking on its own — which also means it has to stand alone, so
/// the trailing words are a sibling view rather than part of its string.
@available(iOS 16.2, *)
struct ClawMuseAgentUsageResetLabel: View {
  let resetsAt: Double
  var size: CGFloat = 10

  var body: some View {
    HStack(spacing: 3) {
      Text(Date(timeIntervalSince1970: resetsAt), style: .relative)
      Text(ClawMuseAgentActivityCopy.resetsSuffix)
    }
    .font(.system(size: size))
    .foregroundStyle(ClawMuseAgentActivityPalette.mutedText)
    .lineLimit(1)
    .minimumScaleFactor(0.7)
  }
}

/// Plan name plus its 5h / 7d rows — the 2×2 grid cell.
@available(iOS 16.2, *)
struct ClawMuseAgentUsagePlanCell: View {
  let usage: ClawMuseAgentActivityAttributes.Usage
  var nameSize: CGFloat = 11
  var barHeight: CGFloat = 5
  var valueSize: CGFloat = 11
  var showsResetCountdown = false
  /// Puts the session window's reset beside the plan name. The capsule uses this instead of
  /// the per-row countdown: the row's value column would have to more than double, and the
  /// meter it takes that width from is what carries the pace reading.
  var showsSessionReset = false
  var now = Date()

  private var sessionResetsAt: Double? {
    guard showsSessionReset, let resetsAt = usage.session?.resetsAt else { return nil }
    // A reset already in the past is a window whose refresh no push has reported yet;
    // "Resets in 0 seconds" would be a claim we cannot make.
    return resetsAt > now.timeIntervalSince1970 ? resetsAt : nil
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      HStack(spacing: 6) {
        Text(usage.displayName)
          .font(.system(size: nameSize, weight: .semibold))
          .foregroundStyle(ClawMuseAgentActivityPalette.secondaryText)
          .lineLimit(1)
          .minimumScaleFactor(0.8)
          // Why: the countdown's width is the system's to choose, so the plan name claims
          // the cell first — a long localisation must squeeze the clock, not the identity.
          .layoutPriority(1)
        if let sessionResetsAt {
          Spacer(minLength: 2)
          ClawMuseAgentUsageResetLabel(resetsAt: sessionResetsAt)
        }
      }
      if let session = usage.session {
        ClawMuseAgentUsageWindowRow(
          label: ClawMuseAgentActivityCopy.usageSession,
          window: session,
          barHeight: barHeight,
          valueSize: valueSize,
          showsResetCountdown: showsResetCountdown,
          now: now
        )
      }
      if let weekly = usage.weekly {
        ClawMuseAgentUsageWindowRow(
          label: ClawMuseAgentActivityCopy.usageWeekly,
          window: weekly,
          barHeight: barHeight,
          valueSize: valueSize,
          showsResetCountdown: showsResetCountdown,
          now: now
        )
      }
    }
  }
}

/// Plans in two columns; compact surfaces cap the count while the large widget shows all.
@available(iOS 16.2, *)
struct ClawMuseAgentUsageGridView: View {
  let usages: [ClawMuseAgentActivityAttributes.Usage]
  var maximum: Int? = 4
  var columnSpacing: CGFloat = 16
  var rowSpacing: CGFloat = 6
  var nameSize: CGFloat = 11
  var barHeight: CGFloat = 5
  var valueSize: CGFloat = 11
  var showsResetCountdown = false
  var showsSessionReset = false
  var now = Date()

  private var rows: [[ClawMuseAgentActivityAttributes.Usage]] {
    let plans = usages.filter(\.hasWindows)
    let visible = maximum.map { Array(plans.prefix($0)) } ?? plans
    return stride(from: 0, to: visible.count, by: 2).map { Array(visible[$0..<min($0 + 2, visible.count)]) }
  }

  var body: some View {
    if !rows.isEmpty {
      VStack(alignment: .leading, spacing: rowSpacing) {
        ForEach(Array(rows.enumerated()), id: \.offset) { _, pair in
          HStack(alignment: .top, spacing: columnSpacing) {
            ForEach(Array(pair.enumerated()), id: \.offset) { _, usage in
              ClawMuseAgentUsagePlanCell(
                usage: usage,
                nameSize: nameSize,
                barHeight: barHeight,
                valueSize: valueSize,
                showsResetCountdown: showsResetCountdown,
                showsSessionReset: showsSessionReset,
                now: now
              )
              .frame(maxWidth: .infinity, alignment: .leading)
            }
            if pair.count == 1 {
              Color.clear.frame(maxWidth: .infinity, maxHeight: 1)
            }
          }
        }
      }
    }
  }
}

enum ClawMuseAgentUsageCopy {
  @available(iOS 16.2, *)
  static func remaining(_ window: ClawMuseAgentActivityAttributes.UsageWindow) -> String {
    window.unlimited ? ClawMuseAgentActivityCopy.usageUnlimited : "\(window.remainingPercent)%"
  }

  @available(iOS 16.2, *)
  static func resetCountdown(
    to resetsAt: Double?,
    from now: Date,
    includesResetLabel: Bool = false
  ) -> String? {
    guard let resetsAt else { return nil }
    let minutes = Int(max(0, resetsAt - now.timeIntervalSince1970) / 60)
    let text: String
    if minutes < 60 {
      text = "\(minutes)m"
    } else if minutes < 24 * 60 {
      text = minutes % 60 > 0 ? "\(minutes / 60)h \(minutes % 60)m" : "\(minutes / 60)h"
    } else {
      text = "\(minutes / (24 * 60))d \((minutes % (24 * 60)) / 60)h"
    }
    return includesResetLabel ? String(format: ClawMuseAgentActivityCopy.resetsFormat, text) : text
  }
}

/// Small ring used by the compact and minimal island states.
@available(iOS 16.2, *)
struct ClawMuseAgentRemainingRingView: View {
  let fraction: Double
  let color: Color
  var size: CGFloat = 18
  var lineWidth: CGFloat = 3

  var body: some View {
    ZStack {
      Circle().stroke(ClawMuseAgentActivityPalette.raised, lineWidth: lineWidth)
      Circle()
        .trim(from: 0, to: max(0, min(1, fraction)))
        .stroke(color, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
        .rotationEffect(.degrees(-90))
    }
    .frame(width: size, height: size)
  }
}

/// Three inline counters: running / needs action / unread completion.
@available(iOS 16.2, *)
struct ClawMuseAgentCountsInlineView: View {
  let state: ClawMuseAgentActivityAttributes.ContentState
  let isStale: Bool
  var size: CGFloat = 12

  private var presentation: ClawMuseAgentActivityPresentation {
    ClawMuseAgentActivityPresentation(state: state, isStale: isStale)
  }

  var body: some View {
    HStack(spacing: 10) {
      counter(state.displayedRunningCount, ClawMuseAgentActivityCopy.running, ClawMuseAgentActivityPalette.green, stale: true)
      counter(state.displayedNeedsActionCount, ClawMuseAgentActivityCopy.needsAction, ClawMuseAgentActivityPalette.amber, stale: true)
      counter(state.displayedCompletedUnreadCount, ClawMuseAgentActivityCopy.completedCompact, ClawMuseAgentActivityPalette.blue, stale: false)
    }
  }

  private func counter(_ count: Int, _ label: String, _ color: Color, stale: Bool) -> some View {
    HStack(spacing: 4) {
      Circle().fill(color).frame(width: 6, height: 6)
      Text(presentation.metricText(count, mayBeStale: stale))
        .font(.system(size: size, weight: .semibold))
        .foregroundStyle(color)
        .monospacedDigit()
      Text(label)
        .font(.system(size: size, weight: .medium))
        .foregroundStyle(ClawMuseAgentActivityPalette.secondaryText)
    }
    .lineLimit(1)
  }
}

/// "⚡ Online" — the connectivity badge.
@available(iOS 16.2, *)
struct ClawMuseAgentOnlineBadgeView: View {
  let showsUnverifiable: Bool

  var body: some View {
    HStack(spacing: 4) {
      Image(systemName: showsUnverifiable ? "bolt.slash.fill" : "bolt.fill")
        .font(.system(size: 11, weight: .semibold))
        .foregroundStyle(showsUnverifiable ? ClawMuseAgentActivityPalette.mutedText : ClawMuseAgentActivityPalette.green)
      Text(showsUnverifiable ? ClawMuseAgentActivityCopy.unverifiableCompact : ClawMuseAgentActivityCopy.online)
        .font(.system(size: 10))
        .foregroundStyle(ClawMuseAgentActivityPalette.mutedText)
    }
  }
}
