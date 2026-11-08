import SwiftUI
import WidgetKit

@main
struct ClawMuseAgentLiveActivityWidgetBundle: WidgetBundle {
  var body: some Widget {
    if #available(iOS 16.2, *) {
      ClawMuseAgentLiveActivityWidget()
    }
    if #available(iOS 17.0, *) {
      QuotaWidget()
      DailyUsageWidget()
      ClawMuseAgentQuotaWidget()
    }
  }
}
