import ActivityKit
import SwiftUI
import WidgetKit

@available(iOS 16.2, *)
struct ClawMuseAgentLiveActivityWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: ClawMuseAgentActivityAttributes.self) { context in
      ClawMuseAgentLockScreenView(state: context.state, isStale: context.isStale)
        .activityBackgroundTint(ClawMuseAgentActivityPalette.background)
        .activitySystemActionForegroundColor(ClawMuseAgentActivityPalette.primaryText)
        .widgetURL(URL(string: ClawMuseAgentActivityAttributes.homeDeepLink))
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          ClawMuseAgentExpandedIslandLeadingView(state: context.state, isStale: context.isStale)
        }
        DynamicIslandExpandedRegion(.trailing) {
          ClawMuseAgentExpandedIslandTrailingView(state: context.state, isStale: context.isStale)
        }
        DynamicIslandExpandedRegion(.bottom) {
          ClawMuseAgentExpandedIslandView(state: context.state, isStale: context.isStale)
        }
      } compactLeading: {
        ClawMuseAgentCompactLeadingView(state: context.state, isStale: context.isStale)
      } compactTrailing: {
        ClawMuseAgentCompactTrailingView(state: context.state, isStale: context.isStale)
      } minimal: {
        ClawMuseAgentMinimalIslandView(state: context.state, isStale: context.isStale)
      }
      .keylineTint(
        ClawMuseAgentActivityPresentation(state: context.state, isStale: context.isStale)
          .statusColor
      )
      .widgetURL(URL(string: ClawMuseAgentActivityAttributes.homeDeepLink))
    }
  }
}

// The minimal slot carries task status; quota belongs to the home-screen widget.
@available(iOS 16.2, *)
private struct ClawMuseAgentMinimalIslandView: View {
  let state: ClawMuseAgentActivityAttributes.ContentState
  let isStale: Bool

  private var presentation: ClawMuseAgentActivityPresentation {
    ClawMuseAgentActivityPresentation(state: state, isStale: isStale)
  }

  var body: some View {
    Image(systemName: presentation.statusSymbol)
      .font(.system(size: 10, weight: .semibold))
      .foregroundStyle(presentation.statusColor)
      .accessibilityLabel(presentation.accessibilitySummary)
  }
}
