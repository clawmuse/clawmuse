import ExpoModulesCore
import Foundation

struct AgentLiveActivityUsageWindowRecord: Record {
  @Field var usedPercent = 0.0
  @Field var windowMinutes = 0
  @Field var resetsAt: Double?
  @Field var unlimited = false
}

struct AgentLiveActivityUsageRecord: Record {
  @Field var provider = ""
  @Field var label: String?
  @Field var session: AgentLiveActivityUsageWindowRecord?
  @Field var weekly: AgentLiveActivityUsageWindowRecord?
}

struct AgentLiveActivityPayloadRecord: Record {
  @Field var id = "clawmuse-agent-live-activity"
  @Field var phase = "working"
  @Field var title = "ClawMuse"
  @Field var status = "Working"
  @Field var compact = "Working"
  @Field var detail: String?
  @Field var workspace: String?
  @Field var activeCount = 1
  @Field var attentionCount = 0
  @Field var runningCount = 0
  @Field var needsActionCount = 0
  @Field var completedUnreadCount = 0
  @Field var unverifiableCount = 0
  @Field var connectionState = "live"
  @Field var revision = 0
  @Field var updatedAt = 0.0
  @Field var deepLink = "clawmuse://home?focus=agent-activity"
  @Field var usages: [AgentLiveActivityUsageRecord] = []
}

struct AgentLiveActivityUsageWindowState: Equatable, Sendable {
  var usedPercent: Double
  var windowMinutes: Int
  var resetsAt: Double?
  var unlimited: Bool

  init(record: AgentLiveActivityUsageWindowRecord) {
    usedPercent = record.usedPercent
    windowMinutes = record.windowMinutes
    resetsAt = record.resetsAt
    unlimited = record.unlimited
  }
}

struct AgentLiveActivityUsageState: Equatable, Sendable {
  var provider: String
  var label: String?
  var session: AgentLiveActivityUsageWindowState?
  var weekly: AgentLiveActivityUsageWindowState?

  init(record: AgentLiveActivityUsageRecord) {
    provider = record.provider
    label = record.label
    session = record.session.map(AgentLiveActivityUsageWindowState.init(record:))
    weekly = record.weekly.map(AgentLiveActivityUsageWindowState.init(record:))
  }
}

struct AgentLiveActivityState: Equatable, Sendable {
  var id: String
  var phase: String
  var title: String
  var status: String
  var compact: String
  var detail: String?
  var workspace: String?
  var activeCount: Int
  var attentionCount: Int
  var runningCount: Int
  var needsActionCount: Int
  var completedUnreadCount: Int
  var unverifiableCount: Int
  var connectionState: String
  var revision: Int
  var updatedAt: Double
  var deepLink: String
  var usages: [AgentLiveActivityUsageState]

  init(
    id: String,
    phase: String,
    title: String,
    status: String,
    compact: String,
    detail: String?,
    workspace: String?,
    activeCount: Int,
    attentionCount: Int,
    runningCount: Int = 0,
    needsActionCount: Int = 0,
    completedUnreadCount: Int = 0,
    unverifiableCount: Int = 0,
    connectionState: String = "live",
    revision: Int = 0,
    updatedAt: Double,
    deepLink: String,
    usages: [AgentLiveActivityUsageState] = []
  ) {
    self.id = id
    self.phase = phase
    self.title = title
    self.status = status
    self.compact = compact
    self.detail = detail
    self.workspace = workspace
    self.activeCount = activeCount
    self.attentionCount = attentionCount
    self.runningCount = runningCount
    self.needsActionCount = needsActionCount
    self.completedUnreadCount = completedUnreadCount
    self.unverifiableCount = unverifiableCount
    self.connectionState = connectionState
    self.revision = revision
    self.updatedAt = updatedAt
    self.deepLink = deepLink
    self.usages = usages
  }

  init(payload: AgentLiveActivityPayloadRecord) {
    self.init(
      id: payload.id,
      phase: payload.phase,
      title: payload.title,
      status: payload.status,
      compact: payload.compact,
      detail: payload.detail,
      workspace: payload.workspace,
      activeCount: payload.activeCount,
      attentionCount: payload.attentionCount,
      runningCount: payload.runningCount,
      needsActionCount: payload.needsActionCount,
      completedUnreadCount: payload.completedUnreadCount,
      unverifiableCount: payload.unverifiableCount,
      connectionState: payload.connectionState,
      revision: payload.revision,
      updatedAt: payload.updatedAt,
      deepLink: payload.deepLink,
      usages: payload.usages.map(AgentLiveActivityUsageState.init(record:))
    )
  }
}

@available(iOS 16.2, *)
extension ClawMuseAgentActivityAttributes.ContentState {
  init(payload: AgentLiveActivityPayloadRecord) {
    self.init(state: AgentLiveActivityState(payload: payload))
  }

  init(state: AgentLiveActivityState) {
    id = state.id
    phase = state.phase
    title = state.title
    status = state.status
    compact = state.compact
    detail = state.detail
    workspace = state.workspace
    activeCount = state.activeCount
    attentionCount = state.attentionCount
    runningCount = state.runningCount
    needsActionCount = state.needsActionCount
    completedUnreadCount = state.completedUnreadCount
    unverifiableCount = state.unverifiableCount
    connectionState = state.connectionState
    revision = state.revision
    updatedAt = state.updatedAt
    deepLink = state.deepLink
    usages = state.usages.map { usage in
      let window = { (value: AgentLiveActivityUsageWindowState) in
        ClawMuseAgentActivityAttributes.UsageWindow(
          usedPercent: value.usedPercent,
          windowMinutes: value.windowMinutes,
          resetsAt: value.resetsAt,
          unlimited: value.unlimited
        )
      }
      return ClawMuseAgentActivityAttributes.Usage(
        provider: usage.provider,
        label: usage.label,
        session: usage.session.map(window),
        weekly: usage.weekly.map(window)
      )
    }
  }
}
