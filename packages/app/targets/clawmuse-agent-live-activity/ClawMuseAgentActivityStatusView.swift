import SwiftUI

@available(iOS 16.2, *)
struct ClawMuseAgentActivityStatusView: View {
  let state: ClawMuseAgentActivityAttributes.ContentState
  let isStale: Bool
  let size: CGFloat

  private var presentation: ClawMuseAgentActivityPresentation {
    ClawMuseAgentActivityPresentation(state: state, isStale: isStale)
  }

  var body: some View {
    ZStack {
      Circle().fill(ClawMuseAgentActivityPalette.raised)
      Image(systemName: presentation.statusSymbol)
        .font(.system(size: size * 0.43, weight: .semibold))
        .foregroundStyle(presentation.statusColor)
    }
    .frame(width: size, height: size)
    .accessibilityLabel(presentation.headline)
  }
}

@available(iOS 16.2, *)
struct ClawMuseAgentActivityCountsView: View {
  let state: ClawMuseAgentActivityAttributes.ContentState
  let isStale: Bool

  private var presentation: ClawMuseAgentActivityPresentation {
    ClawMuseAgentActivityPresentation(state: state, isStale: isStale)
  }

  var body: some View {
    VStack(alignment: .trailing, spacing: 2) {
      Text(presentation.headline)
        .font(.caption.weight(.semibold))
        .foregroundStyle(presentation.statusColor)
        .lineLimit(1)
      Text(presentation.compactSummary)
        .font(.caption2.weight(.medium))
        .foregroundStyle(ClawMuseAgentActivityPalette.secondaryText)
        .monospacedDigit()
        .lineLimit(1)
    }
  }
}

@available(iOS 16.2, *)
struct ClawMuseAgentActivitySummaryView: View {
  let state: ClawMuseAgentActivityAttributes.ContentState
  let isStale: Bool

  private var presentation: ClawMuseAgentActivityPresentation {
    ClawMuseAgentActivityPresentation(state: state, isStale: isStale)
  }

  var body: some View {
    HStack(spacing: 16) {
      metric(
        state.displayedRunningCount,
        label: ClawMuseAgentActivityCopy.running,
        color: ClawMuseAgentActivityPalette.green,
        mayBeStale: true
      )
      metric(
        state.displayedNeedsActionCount,
        label: ClawMuseAgentActivityCopy.needsAction,
        color: ClawMuseAgentActivityPalette.amber,
        mayBeStale: true
      )
      metric(
        state.displayedCompletedUnreadCount,
        label: ClawMuseAgentActivityCopy.completedCompact,
        color: ClawMuseAgentActivityPalette.blue,
        mayBeStale: false
      )
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private func metric(_ count: Int, label: String, color: Color, mayBeStale: Bool) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(presentation.metricText(count, mayBeStale: mayBeStale))
        .font(.system(size: 24, weight: .semibold))
        .monospacedDigit()
        .foregroundStyle(color)
        .lineLimit(1)
        .minimumScaleFactor(0.7)
      Text(label)
        .font(.caption2)
        .foregroundStyle(ClawMuseAgentActivityPalette.secondaryText)
        .lineLimit(1)
        .minimumScaleFactor(0.8)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityElement(children: .combine)
  }
}

@available(iOS 16.2, *)
struct ClawMuseAgentActivityConnectivityView: View {
  let state: ClawMuseAgentActivityAttributes.ContentState
  let isStale: Bool

  private var presentation: ClawMuseAgentActivityPresentation {
    ClawMuseAgentActivityPresentation(state: state, isStale: isStale)
  }

  var body: some View {
    if presentation.showsUnverifiable {
      Label(ClawMuseAgentActivityCopy.unverifiable, systemImage: "wifi.slash")
        .font(.caption.weight(.medium))
        .foregroundStyle(ClawMuseAgentActivityPalette.secondaryText)
    }
  }
}

/// Freshness describes the snapshot, independently of the task counts.
@available(iOS 16.2, *)
struct ClawMuseAgentActivityFreshnessView: View {
  let state: ClawMuseAgentActivityAttributes.ContentState
  let isStale: Bool

  private var presentation: ClawMuseAgentActivityPresentation {
    ClawMuseAgentActivityPresentation(state: state, isStale: isStale)
  }

  var body: some View {
    VStack(alignment: .trailing, spacing: 2) {
      Text(presentation.showsUnverifiable ? ClawMuseAgentActivityCopy.waitingForUpdate : ClawMuseAgentActivityCopy.online)
      if let updatedAt = presentation.updatedAt {
        Text(updatedAt, style: .time)
          .monospacedDigit()
          .accessibilityLabel(Text(ClawMuseAgentActivityCopy.lastUpdated) + Text(updatedAt, style: .time))
      }
    }
    .font(.system(size: 10, weight: .medium))
    .foregroundStyle(ClawMuseAgentActivityPalette.secondaryText)
    .fixedSize()
  }
}
