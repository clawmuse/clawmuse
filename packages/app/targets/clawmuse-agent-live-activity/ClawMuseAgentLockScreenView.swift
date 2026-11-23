import SwiftUI

@available(iOS 16.2, *)
struct ClawMuseAgentLockScreenView: View {
  let state: ClawMuseAgentActivityAttributes.ContentState
  let isStale: Bool

  private var presentation: ClawMuseAgentActivityPresentation {
    ClawMuseAgentActivityPresentation(state: state, isStale: isStale)
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      HStack(spacing: 8) {
        ClawMuseAgentActivityStatusView(
          state: state,
          isStale: isStale,
          size: presentation.collapsesStaleSummary ? 24 : 28
        )
        VStack(alignment: .leading, spacing: 2) {
          Text(presentation.headline)
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(ClawMuseAgentActivityPalette.primaryText)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
          if presentation.collapsesStaleSummary {
            Text(ClawMuseAgentActivityCopy.staleHint)
              .font(.caption2)
              .foregroundStyle(ClawMuseAgentActivityPalette.secondaryText)
              .lineLimit(1)
              .minimumScaleFactor(0.8)
          }
        }
        Spacer(minLength: 4)
        ClawMuseAgentActivityFreshnessView(state: state, isStale: isStale)
      }
      if !presentation.collapsesStaleSummary {
        ClawMuseAgentActivitySummaryView(state: state, isStale: isStale)
      }
    }
    .padding(.horizontal, 16)
    .padding(.vertical, presentation.collapsesStaleSummary ? 12 : 16)
    .accessibilityLabel(presentation.accessibilitySummary)
    .accessibilityElement(children: .combine)
  }
}
