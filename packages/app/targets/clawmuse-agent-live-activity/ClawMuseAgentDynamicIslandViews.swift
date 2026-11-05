import SwiftUI

@available(iOS 16.2, *)
struct ClawMuseAgentExpandedIslandView: View {
  let state: ClawMuseAgentActivityAttributes.ContentState
  let isStale: Bool

  var body: some View {
    ClawMuseAgentActivitySummaryView(state: state, isStale: isStale)
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.horizontal, 10)
      .padding(.top, 4)
      .padding(.bottom, 6)
  }
}

@available(iOS 16.2, *)
struct ClawMuseAgentExpandedIslandTrailingView: View {
  let state: ClawMuseAgentActivityAttributes.ContentState
  let isStale: Bool

  var body: some View {
    ClawMuseAgentActivityFreshnessView(state: state, isStale: isStale)
  }
}

@available(iOS 16.2, *)
struct ClawMuseAgentExpandedIslandLeadingView: View {
  let state: ClawMuseAgentActivityAttributes.ContentState
  let isStale: Bool

  private var presentation: ClawMuseAgentActivityPresentation {
    ClawMuseAgentActivityPresentation(state: state, isStale: isStale)
  }

  var body: some View {
    HStack(spacing: 8) {
      ClawMuseAgentActivityStatusView(state: state, isStale: isStale, size: 32)
      Text(presentation.headline)
        .font(.system(size: 14, weight: .semibold))
        .foregroundStyle(ClawMuseAgentActivityPalette.primaryText)
        .lineLimit(1)
        .minimumScaleFactor(0.8)
    }
  }
}

@available(iOS 16.2, *)
struct ClawMuseAgentCompactLeadingView: View {
  let state: ClawMuseAgentActivityAttributes.ContentState
  let isStale: Bool

  private var presentation: ClawMuseAgentActivityPresentation {
    ClawMuseAgentActivityPresentation(state: state, isStale: isStale)
  }

  var body: some View {
    Image(systemName: presentation.statusSymbol)
      .font(.system(size: 13, weight: .semibold))
      .foregroundStyle(presentation.statusColor)
      .padding(.trailing, 3)
      .accessibilityLabel(presentation.headline)
  }
}

/// The count that matters most — pending items, else what is running.
@available(iOS 16.2, *)
struct ClawMuseAgentCompactTrailingView: View {
  let state: ClawMuseAgentActivityAttributes.ContentState
  let isStale: Bool

  private var presentation: ClawMuseAgentActivityPresentation {
    ClawMuseAgentActivityPresentation(state: state, isStale: isStale)
  }

  var body: some View {
    HStack(spacing: 4) {
      Circle()
        .fill(presentation.statusColor)
        .frame(width: 6, height: 6)
      Text(presentation.minimalCountText ?? (presentation.showsUnverifiable ? "–" : "0"))
        .font(.system(size: 13, weight: .semibold))
        .foregroundStyle(presentation.statusColor)
        .monospacedDigit()
        .lineLimit(1)
    }
    // Why: keep the dot off the sensor edge.
    .padding(.leading, 3)
    .accessibilityLabel(presentation.accessibilitySummary)
  }
}
