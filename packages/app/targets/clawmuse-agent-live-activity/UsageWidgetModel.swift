import Foundation

// Mirrors `UsageWidgetState` / `MobileUsageWidgetSnapshot` in the app (TypeScript). The app
// writes it into the shared App Group; this extension only reads and renders.

@available(iOS 17.0, *)
struct WidgetSource: Decodable, Identifiable {
  let id: String
  let kind: String
  let name: String
  let logo: String?
  let monogram: String
  let value: String?
  let unit: String?
  let label: String?
  let level: String
  let fill: Double
  let reserve: Bool
  let emphasized: Bool
  let when: String
  let resetsAtMs: Double?
  /// Last reading of a computer that is offline now; drawn faded, `when` says its age.
  var stale: Bool? = nil
  /// Will reset with quota unused at the current pace; the reset time colors as it nears.
  var unusedAtReset: Bool? = nil
  /// The panel's detail ring; drawn when the widget shows a single source.
  var detail: WidgetDetail? = nil
}

@available(iOS 17.0, *)
struct WidgetRing: Decodable {
  let fraction: Double
  let color: String
}

@available(iOS 17.0, *)
struct WidgetLegend: Decodable {
  let label: String
  let color: String
}

@available(iOS 17.0, *)
struct WidgetDetail: Decodable {
  let title: String
  let plan: String
  let rings: [WidgetRing]
  let bigValue: String
  let bigUnit: String?
  let bigColor: String?
  let bigCompact: Bool
  let bigCaption: String
  let legend: [WidgetLegend]
}

@available(iOS 17.0, *)
struct WidgetDay: Decodable {
  let money: [Double]
  let paid: Double
  let tokens: [Double]
  var costAvailable: Bool? = nil
  /// Value per `WidgetUsage.models` entry, then everything else.
  var models: [Double]? = nil
  /// Tokens per `WidgetUsage.models` entry, then everything else.
  var modelTokens: [Double]? = nil

  var total: Double { money.reduce(0, +) }
  var totalTokens: Double { tokens.reduce(0, +) }
  var hasCost: Bool { costAvailable ?? (total > 0) }
}

@available(iOS 17.0, *)
struct WidgetModel: Decodable {
  let name: String
  let harness: String
}

@available(iOS 17.0, *)
struct WidgetUsage: Decodable {
  let scope: String
  let days: [String]
  let daily: [WidgetDay]
  /// Busiest models of the window, in color order; absent from older computers.
  var models: [WidgetModel]? = nil

  /// Keep dates paired with their readings; missing dates are not invented zero-use days.
  var recentDays: [(date: String, tokens: Double)] {
    Array(zip(days, daily).map { date, day in
      (date: date, tokens: day.totalTokens.isFinite ? max(0, day.totalTokens) : 0)
    }.sorted { $0.date < $1.date }.suffix(7))
  }
}

/// Compare subscription fractions, never currency balances; retain source order on ties.
@available(iOS 17.0, *)
func inlineQuotaSources(_ sources: [WidgetSource]) -> [WidgetSource] {
  let subscriptions = sources.filter { $0.kind == "subscription" }
  let comparable = subscriptions.enumerated().filter { $0.element.fill.isFinite && ($0.element.unit == "%" || $0.element.reserve) }
  let sorted = comparable.sorted {
    let left = $0.element.reserve ? 0 : $0.element.fill
    let right = $1.element.reserve ? 0 : $1.element.fill
    return left == right ? $0.offset < $1.offset : left < right
  }.map(\.element)
  return Array((sorted.isEmpty ? (subscriptions.isEmpty ? sources : subscriptions) : sorted).prefix(2))
}

@available(iOS 17.0, *)
func lowestQuotaSource(_ sources: [WidgetSource]) -> WidgetSource? {
  inlineQuotaSources(sources).first
}

@available(iOS 17.0, *)
struct WidgetSnapshot: Decodable {
  let version: Int
  let generatedAtMs: Double
  let updatedAtMs: Double?
  let locale: String
  let moneySymbol: String
  var sources: [WidgetSource]
  let usage: WidgetUsage
  let strings: [String: String]
}

@available(iOS 17.0, *)
enum WidgetState: Decodable {
  case snapshot(receivedAtMs: Double, deviceName: String, snapshot: WidgetSnapshot)
  case updateDesktop
  case empty

  private enum Keys: String, CodingKey { case kind, receivedAtMs, deviceName, snapshot }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: Keys.self)
    switch try container.decode(String.self, forKey: .kind) {
    case "snapshot":
      self = .snapshot(
        receivedAtMs: try container.decode(Double.self, forKey: .receivedAtMs),
        deviceName: try container.decode(String.self, forKey: .deviceName),
        snapshot: try container.decode(WidgetSnapshot.self, forKey: .snapshot)
      )
    case "update-desktop":
      self = .updateDesktop
    default:
      self = .empty
    }
  }

  /// The state of the computer a widget is set to; nil or "auto" merges all connected computers.
  static func load(computer: String?) -> WidgetState {
    guard let store = WidgetStore.load() else { return .empty }
    if computer == nil || computer == ComputerEntity.autoID {
      if let merged = store.states[ComputerEntity.autoID] { return merged }
    }
    let id = computer == nil || computer == ComputerEntity.autoID ? store.autoDeviceId : computer
    return id.flatMap { store.states[$0] } ?? .empty
  }

  var snapshot: WidgetSnapshot? {
    if case .snapshot(_, _, let snapshot) = self { return snapshot }
    return nil
  }

  /// The edit sheet's arrangement: pinned accounts first in their order, hidden ones left out,
  /// the rest (accounts added later included) after them in the computer's order. Nil when it
  /// changes nothing. Hiding every account shows them all, still in the pinned order, as the Mac
  /// panel does.
  func arranged(pinned: [String]?, hidden: [String]?) -> (state: WidgetState, pinnedCount: Int)? {
    guard case .snapshot(let receivedAtMs, let deviceName, var snapshot) = self else { return nil }
    let sources = snapshot.sources
    var hiddenIDs = Set(Self.matching(hidden ?? [], in: sources).map(\.id))
    var first = Self.matching(pinned ?? [], in: sources).filter { !hiddenIDs.contains($0.id) }
    func ordered() -> [WidgetSource] {
      let firstIDs = Set(first.map(\.id))
      return first + sources.filter { !hiddenIDs.contains($0.id) && !firstIDs.contains($0.id) }
    }
    var shown = ordered()
    if shown.isEmpty {
      // Never an empty widget: show everything, keeping the pinned order.
      hiddenIDs = []
      first = Self.matching(pinned ?? [], in: sources)
      shown = ordered()
    }
    if first.isEmpty && hiddenIDs.isEmpty { return nil }
    snapshot.sources = shown
    return (.snapshot(receivedAtMs: receivedAtMs, deviceName: deviceName, snapshot: snapshot), first.count)
  }

  /// The sources the keys name, in key order and each once (the edit sheet lets one account fill
  /// two places). A connection's id only means something on its own computer (every computer's
  /// built-in OpenAI connection can be a different login), so an account is the same one on
  /// another computer when its logo and name match; the id only confirms it. Every key is looked
  /// up among all sources and duplicates dropped afterwards, so a repeated choice never falls
  /// through to a different account that happens to share its logo and name.
  private static func matching(_ keys: [String], in sources: [WidgetSource]) -> [WidgetSource] {
    var found: [WidgetSource] = []
    for key in keys.map(AccountKey.init(encoded:)) {
      let source = sources.first(where: { $0.id == key.id && $0.logo == key.logo && $0.name == key.name })
        ?? sources.first(where: { $0.logo == key.logo && $0.name == key.name })
      if let source, !found.contains(where: { $0.id == source.id }) { found.append(source) }
    }
    return found
  }
}

/// A chosen account as the widget configuration stores it: the source id, logo and name in one
/// string (the configuration keeps only entity ids).
@available(iOS 17.0, *)
struct AccountKey {
  let id: String
  let logo: String?
  let name: String

  private static let separator: Character = "\u{1F}"

  init(source: WidgetSource) {
    id = source.id
    logo = source.logo
    name = source.name
  }

  init(encoded: String) {
    let parts = encoded.split(separator: Self.separator, omittingEmptySubsequences: false).map(String.init)
    id = parts.first ?? ""
    logo = parts.count > 1 && !parts[1].isEmpty ? parts[1] : nil
    name = parts.count > 2 ? parts[2...].joined(separator: String(Self.separator)) : ""
  }

  var encoded: String { [id, logo ?? "", name].joined(separator: String(Self.separator)) }
}

/// `UsageWidgetStore` in the app: every computer's latest state and the automatic choice.
@available(iOS 17.0, *)
struct WidgetStore: Decodable {
  struct Computer: Decodable {
    let id: String
    let name: String
  }

  let autoDeviceId: String?
  let computers: [Computer]
  let states: [String: WidgetState]

  static var group: String? {
    (Bundle.main.object(forInfoDictionaryKey: "ClawMuseAppGroupId") as? String) ?? "group.com.clawmuse"
  }

  /// Same file name as `ClawMuseUsageWidgetsModule` in the app.
  static func load() -> WidgetStore? {
    guard let group, let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group),
          let data = try? Data(contentsOf: container.appendingPathComponent("usage-widget-snapshot.json"))
    else { return nil }
    return try? JSONDecoder().decode(WidgetStore.self, from: data)
  }

  /// Tells the app this computer has a widget, so it asks it on each refresh
  /// (`readPinnedDeviceIds` in `ClawMuseUsageWidgetsModule`).
  static func recordPin(_ id: String) {
    guard let group, let defaults = UserDefaults(suiteName: group) else { return }
    let now = Date().timeIntervalSince1970
    var pins = (defaults.dictionary(forKey: "usageWidgetPins") as? [String: Double] ?? [:])
      .filter { now - $0.value < 2 * 24 * 3600 }
    pins[id] = now
    defaults.set(pins, forKey: "usageWidgetPins")
  }
}

/// Formatting shared by both widgets. Templates come from the computer's menu bar strings;
/// the few widget-only sentences live in `WidgetText`.
@available(iOS 17.0, *)
struct WidgetFormat {
  let snapshot: WidgetSnapshot?
  let now: Date

  var locale: Locale { Locale(identifier: snapshot?.locale ?? Locale.preferredLanguages.first ?? "en") }

  func s(_ key: String, _ values: [String: String] = [:]) -> String {
    var text = snapshot?.strings[key] ?? WidgetText.fallback(key, locale: locale)
    for (name, value) in values { text = text.replacingOccurrences(of: "{{\(name)}}", with: value) }
    return text
  }

  func money(_ value: Double) -> String {
    let symbol = snapshot?.moneySymbol ?? "$"
    if value >= 10_000 { return symbol + String(format: "%.1fk", value / 1000) }
    if value >= 100 {
      let formatter = NumberFormatter()
      formatter.numberStyle = .decimal
      formatter.locale = Locale(identifier: "en_US")
      formatter.maximumFractionDigits = 0
      return symbol + (formatter.string(from: NSNumber(value: value.rounded())) ?? String(Int(value)))
    }
    return symbol + String(format: "%.2f", value)
  }

  func reportedCost(_ days: [WidgetDay]) -> String {
    let usedDays = days.filter { $0.totalTokens > 0 || $0.hasCost }
    guard !usedDays.isEmpty, usedDays.allSatisfy({ $0.hasCost }) else { return s("noCostData") }
    return "\(s("reportedCost")) \(money(usedDays.reduce(0) { $0 + $1.total }))"
  }

  func tokens(_ value: Double) -> String {
    let millions = value / 1_000_000
    if millions >= 1000 { return String(format: "%.1fB", millions / 1000) }
    if millions >= 1 { return "\(Int(millions.rounded()))M" }
    if value >= 1000 { return "\(Int((value / 1000).rounded()))K" }
    return "\(Int(max(0, value).rounded()))"
  }

  var isChinese: Bool {
    (locale.language.languageCode?.identifier ?? locale.identifier).lowercased().hasPrefix("zh")
  }

  func chineseTokenHint(_ value: Double) -> String? {
    guard isChinese, value.isFinite, value >= 10_000 else { return nil }
    if value >= 100_000_000 {
      let yi = value / 100_000_000
      if yi >= 100 { return "\(Int(yi.rounded()))\u{4ebf}" }
      let formatted = String(format: "%.1f", yi)
      let trimmed = formatted.hasSuffix(".0") ? String(formatted.dropLast(2)) : formatted
      return "\(trimmed)\u{4ebf}"
    }
    let wan = value / 10_000
    if wan >= 10 { return "\(Int(wan.rounded()))\u{4e07}" }
    let formatted = String(format: "%.1f", wan)
    let trimmed = formatted.hasSuffix(".0") ? String(formatted.dropLast(2)) : formatted
    return "\(trimmed)\u{4e07}"
  }

  func tokenUnit(_ value: Double) -> String {
    let base = s("tokenUnit")
    guard let hint = chineseTokenHint(value) else { return base }
    return "\(base)\u{ff08}\(hint)\u{ff09}"
  }

  /// "5\u{5929}9\u{65f6}" from the reset time, so the countdown stays right between refreshes.
  /// `coarse` keeps only the largest unit for the narrow small widget.
  func when(_ source: WidgetSource, coarse: Bool = false) -> String {
    guard let resetsAtMs = source.resetsAtMs else { return source.when }
    let ms = resetsAtMs - now.timeIntervalSince1970 * 1000
    if ms <= 0 { return WidgetText.text("reset", locale: locale) }
    let minutes = max(1, Int(ms / 60_000))
    let d = minutes / 1440, h = (minutes % 1440) / 60, m = minutes % 60
    if d > 0 { return h > 0 && !coarse ? s("durationShort.daysHours", ["d": "\(d)", "h": "\(h)"]) : s("durationShort.days", ["d": "\(d)"]) }
    if h > 0 { return m > 0 && !coarse ? s("durationShort.hoursMinutes", ["h": "\(h)", "m": "\(m)"]) : s("durationShort.hours", ["h": "\(h)"]) }
    return s("durationShort.minutes", ["m": "\(m)"])
  }

  /// Reset-time color (`resetTimeLevel` in `@cindy/maker-shared/quota-level`): only for quota that
  /// will go unused, a day or less to go is yellow, six hours or less red. Counted from now, so a
  /// widget that has not been refreshed still turns red on time.
  func resetLevel(_ source: WidgetSource) -> String {
    guard source.unusedAtReset == true, let resetsAtMs = source.resetsAtMs else { return "normal" }
    let leftHours = (resetsAtMs - now.timeIntervalSince1970 * 1000) / 3_600_000
    if leftHours <= 0 { return "normal" }
    if leftHours <= 6 { return "error" }
    if leftHours <= 24 { return "warn" }
    return "normal"
  }

  /// Age of the quota readings; nil when fresh enough not to mention.
  func staleLabel(minimumHours: Double) -> String? {
    guard let updated = snapshot?.updatedAtMs ?? snapshot?.generatedAtMs else { return nil }
    let seconds = max(0, now.timeIntervalSince1970 - updated / 1000)
    guard seconds >= minimumHours * 3600 else { return nil }
    return updatedLabel(seconds)
  }

  func updatedLabel() -> String {
    guard let updated = snapshot?.updatedAtMs ?? snapshot?.generatedAtMs else { return "" }
    return updatedLabel(max(0, now.timeIntervalSince1970 - updated / 1000))
  }

  private func updatedLabel(_ seconds: Double) -> String {
    if seconds < 60 { return s("updatedJustNow") }
    if seconds < 3600 { return s("updatedMinutes", ["n": "\(Int(seconds / 60))"]) }
    if seconds < 86400 { return s("updatedHours", ["n": "\(Int(seconds / 3600))"]) }
    return s("updatedDays", ["n": "\(Int(seconds / 86400))"])
  }

  func date(_ iso: String) -> Date {
    let parts = iso.split(separator: "-").compactMap { Int($0) }
    var components = DateComponents()
    if parts.count == 3 { components.year = parts[0]; components.month = parts[1]; components.day = parts[2]; components.hour = 12 }
    return Calendar.current.date(from: components) ?? now
  }

  func isToday(_ iso: String) -> Bool {
    Calendar.current.isDate(date(iso), inSameDayAs: now)
  }

  func monthDay(_ iso: String) -> String {
    let formatter = DateFormatter()
    formatter.locale = locale
    formatter.setLocalizedDateFormatFromTemplate("MMMd")
    return formatter.string(from: date(iso))
  }

  func weekdayNarrow(_ iso: String) -> String {
    let formatter = DateFormatter()
    formatter.locale = locale
    formatter.setLocalizedDateFormatFromTemplate("EEEEE")
    return formatter.string(from: date(iso))
  }

  func weekday(_ iso: String) -> String {
    let formatter = DateFormatter()
    formatter.locale = locale
    formatter.setLocalizedDateFormatFromTemplate("EEE")
    return formatter.string(from: date(iso))
  }
}

/// Sentences the computer does not send: empty states and the widget gallery.
@available(iOS 17.0, *)
enum WidgetText {
  private static let table: [String: [String: String]] = [
    "zh-Hans": [
      "quotaName": "\u{8ba2}\u{9605}\u{4f59}\u{91cf}", "quotaDescription": "\u{6bcf}\u{4e2a}\u{8ba2}\u{9605}\u{8fd8}\u{5269}\u{591a}\u{5c11}、\u{4ec0}\u{4e48}\u{65f6}\u{5019}\u{56de}\u{6ee1}。",
      "usageName": "\u{6bcf}\u{65e5}\u{7528}\u{91cf}", "usageDescription": "\u{4eca}\u{5929}\u{7528}\u{4e86}\u{591a}\u{5c11}，\u{548c}\u{6700}\u{8fd1}\u{6bcf}\u{5929}\u{7684}\u{8d70}\u{52bf}。",
      "emptyTitle": "\u{8fd8}\u{6ca1}\u{8bfb}\u{5230}\u{4f59}\u{91cf}", "emptyBody": "\u{6253}\u{5f00} ClawMuse \u{8fde}\u{4e0a}\u{4e00}\u{53f0}\u{7535}\u{8111}，\u{8fd9}\u{91cc}\u{5c31}\u{4f1a}\u{663e}\u{793a}\u{6bcf}\u{4e2a}\u{8ba2}\u{9605}\u{8fd8}\u{5269}\u{591a}\u{5c11}、\u{4ec0}\u{4e48}\u{65f6}\u{5019}\u{56de}\u{6ee1}。",
      "emptyUsageTitle": "\u{8fd8}\u{6ca1}\u{8bfb}\u{5230}\u{7528}\u{91cf}", "emptyUsageBody": "\u{6253}\u{5f00} ClawMuse \u{8fde}\u{4e0a}\u{4e00}\u{53f0}\u{7535}\u{8111}，\u{8fd9}\u{91cc}\u{5c31}\u{4f1a}\u{663e}\u{793a}\u{6bcf}\u{5929}\u{7684}\u{7528}\u{91cf}。",
      "updateTitle": "\u{7535}\u{8111}\u{4e0a}\u{7684} ClawMuse \u{9700}\u{8981}\u{66f4}\u{65b0}", "updateBody": "\u{66f4}\u{65b0}\u{540e}\u{8fd9}\u{91cc}\u{4f1a}\u{663e}\u{793a}\u{4f59}\u{91cf}\u{548c}\u{6bcf}\u{5929}\u{7684}\u{7528}\u{91cf}。",
      "noSources": "\u{8fd8}\u{6ca1}\u{6709}\u{5e26}\u{4f59}\u{91cf}\u{7684}\u{8d26}\u{53f7}", "valueBasis": "\u{8ba2}\u{9605}\u{7b49}\u{503c}", "valueBasisLong": "\u{8ba2}\u{9605}\u{7b49}\u{503c}\u{4f30}\u{7b97}", "reset": "\u{5df2}\u{91cd}\u{7f6e}",
      "todayNone": "\u{4eca}\u{5929}\u{8fd8}\u{6ca1}\u{6709}\u{7528}\u{91cf}", "resetsIn": "{{duration}}\u{540e}\u{91cd}\u{7f6e}", "other": "\u{5176}\u{4ed6}",
      "today": "\u{4eca}\u{5929}", "dailyAverage": "\u{65e5}\u{5747}", "paid": "\u{5b9e}\u{4ed8}", "tokenUnit": "token",
      "monthScopeAll": "\u{8fd1} 30 \u{5929} · \u{5168}\u{90e8}\u{8bbe}\u{5907}", "monthScopeLocal": "\u{8fd1} 30 \u{5929} · \u{8fd9}\u{53f0}\u{7535}\u{8111}",
      "scopeAll": "\u{5168}\u{90e8}\u{8bbe}\u{5907}", "scopeLocal": "\u{8fd9}\u{53f0}\u{7535}\u{8111}",
      "harness.claude-code": "Claude Code", "harness.codex": "Codex", "harness.pi": "Pi",
      "updatedJustNow": "\u{521a}\u{521a}\u{66f4}\u{65b0}", "updatedMinutes": "{{n}} \u{5206}\u{949f}\u{524d}\u{66f4}\u{65b0}", "updatedHours": "{{n}} \u{5c0f}\u{65f6}\u{524d}\u{66f4}\u{65b0}",
      "updatedDays": "{{n}} \u{5929}\u{524d}\u{66f4}\u{65b0}",
      "durationShort.daysHours": "{{d}}\u{5929}{{h}}\u{65f6}", "durationShort.days": "{{d}}\u{5929}", "durationShort.hoursMinutes": "{{h}}\u{65f6}{{m}}\u{5206}",
      "durationShort.hours": "{{h}}\u{65f6}", "durationShort.minutes": "{{m}}\u{5206}",
    ],
    "zh-Hant": [
      "quotaName": "\u{8a02}\u{95b1}\u{9918}\u{91cf}", "quotaDescription": "\u{6bcf}\u{500b}\u{8a02}\u{95b1}\u{9084}\u{5269}\u{591a}\u{5c11}、\u{4ec0}\u{9ebc}\u{6642}\u{5019}\u{56de}\u{6eff}。",
      "usageName": "\u{6bcf}\u{65e5}\u{7528}\u{91cf}", "usageDescription": "\u{4eca}\u{5929}\u{7528}\u{4e86}\u{591a}\u{5c11}，\u{548c}\u{6700}\u{8fd1}\u{6bcf}\u{5929}\u{7684}\u{8d70}\u{52e2}。",
      "emptyTitle": "\u{9084}\u{6c92}\u{8b80}\u{5230}\u{9918}\u{91cf}", "emptyBody": "\u{6253}\u{958b} ClawMuse \u{9023}\u{4e0a}\u{4e00}\u{53f0}\u{96fb}\u{8166}，\u{9019}\u{88e1}\u{5c31}\u{6703}\u{986f}\u{793a}\u{6bcf}\u{500b}\u{8a02}\u{95b1}\u{9084}\u{5269}\u{591a}\u{5c11}、\u{4ec0}\u{9ebc}\u{6642}\u{5019}\u{56de}\u{6eff}。",
      "emptyUsageTitle": "\u{9084}\u{6c92}\u{8b80}\u{5230}\u{7528}\u{91cf}", "emptyUsageBody": "\u{6253}\u{958b} ClawMuse \u{9023}\u{4e0a}\u{4e00}\u{53f0}\u{96fb}\u{8166}，\u{9019}\u{88e1}\u{5c31}\u{6703}\u{986f}\u{793a}\u{6bcf}\u{5929}\u{7684}\u{7528}\u{91cf}。",
      "updateTitle": "\u{96fb}\u{8166}\u{4e0a}\u{7684} ClawMuse \u{9700}\u{8981}\u{66f4}\u{65b0}", "updateBody": "\u{66f4}\u{65b0}\u{5f8c}\u{9019}\u{88e1}\u{6703}\u{986f}\u{793a}\u{9918}\u{91cf}\u{548c}\u{6bcf}\u{5929}\u{7684}\u{7528}\u{91cf}。",
      "noSources": "\u{9084}\u{6c92}\u{6709}\u{5e36}\u{9918}\u{91cf}\u{7684}\u{5e33}\u{865f}", "valueBasis": "\u{8a02}\u{95b1}\u{7b49}\u{503c}", "valueBasisLong": "\u{8a02}\u{95b1}\u{7b49}\u{503c}\u{4f30}\u{7b97}", "reset": "\u{5df2}\u{91cd}\u{7f6e}",
      "todayNone": "\u{4eca}\u{5929}\u{9084}\u{6c92}\u{6709}\u{7528}\u{91cf}", "resetsIn": "{{duration}}\u{5f8c}\u{91cd}\u{7f6e}", "other": "\u{5176}\u{4ed6}",
      "today": "\u{4eca}\u{5929}", "dailyAverage": "\u{65e5}\u{5747}", "paid": "\u{5be6}\u{4ed8}", "tokenUnit": "token",
      "monthScopeAll": "\u{8fd1} 30 \u{5929} · \u{5168}\u{90e8}\u{88dd}\u{7f6e}", "monthScopeLocal": "\u{8fd1} 30 \u{5929} · \u{9019}\u{53f0}\u{96fb}\u{8166}",
      "scopeAll": "\u{5168}\u{90e8}\u{88dd}\u{7f6e}", "scopeLocal": "\u{9019}\u{53f0}\u{96fb}\u{8166}",
      "harness.claude-code": "Claude Code", "harness.codex": "Codex", "harness.pi": "Pi",
      "updatedJustNow": "\u{525b}\u{525b}\u{66f4}\u{65b0}", "updatedMinutes": "{{n}} \u{5206}\u{9418}\u{524d}\u{66f4}\u{65b0}", "updatedHours": "{{n}} \u{5c0f}\u{6642}\u{524d}\u{66f4}\u{65b0}",
      "updatedDays": "{{n}} \u{5929}\u{524d}\u{66f4}\u{65b0}",
      "durationShort.daysHours": "{{d}}\u{5929}{{h}}\u{6642}", "durationShort.days": "{{d}}\u{5929}", "durationShort.hoursMinutes": "{{h}}\u{6642}{{m}}\u{5206}",
      "durationShort.hours": "{{h}}\u{6642}", "durationShort.minutes": "{{m}}\u{5206}",
    ],
    "ja": [
      "quotaName": "サブスクの\u{6b8b}り", "quotaDescription": "\u{5404}サブスクリプションの\u{6b8b}りと、いつ\u{6e80}タンに\u{623b}るか。",
      "usageName": "\u{6bce}\u{65e5}の\u{4f7f}\u{7528}\u{91cf}", "usageDescription": "\u{4eca}\u{65e5}の\u{4f7f}\u{7528}\u{91cf}と、\u{6700}\u{8fd1}の\u{65e5}ごとの\u{63a8}\u{79fb}。",
      "emptyTitle": "\u{6b8b}りをまだ\u{53d6}\u{5f97}できていません", "emptyBody": "ClawMuse を\u{958b}いてコンピュータに\u{63a5}\u{7d9a}すると、\u{5404}サブスクリプションの\u{6b8b}りがここに\u{8868}\u{793a}されます。",
      "emptyUsageTitle": "\u{4f7f}\u{7528}\u{91cf}をまだ\u{53d6}\u{5f97}できていません", "emptyUsageBody": "ClawMuse を\u{958b}いてコンピュータに\u{63a5}\u{7d9a}すると、\u{6bce}\u{65e5}の\u{4f7f}\u{7528}\u{91cf}がここに\u{8868}\u{793a}されます。",
      "updateTitle": "コンピュータの ClawMuse を\u{66f4}\u{65b0}してください", "updateBody": "\u{66f4}\u{65b0}すると、\u{6b8b}りと\u{6bce}\u{65e5}の\u{4f7f}\u{7528}\u{91cf}がここに\u{8868}\u{793a}されます。",
      "noSources": "\u{6b8b}\u{91cf}を\u{8868}\u{793a}できるアカウントがまだありません", "valueBasis": "サブスク\u{63db}\u{7b97}", "valueBasisLong": "サブスク\u{63db}\u{7b97}（\u{898b}\u{7a4d}もり）",
      "reset": "リセット\u{6e08}み", "todayNone": "\u{4eca}\u{65e5}の\u{4f7f}\u{7528}\u{91cf}はまだありません", "resetsIn": "{{duration}}\u{5f8c}にリセット", "other": "その\u{4ed6}",
      "today": "\u{4eca}\u{65e5}", "dailyAverage": "1 \u{65e5}\u{5e73}\u{5747}", "paid": "\u{652f}\u{6255}\u{984d}", "tokenUnit": "token",
      "monthScopeAll": "\u{76f4}\u{8fd1} 30 \u{65e5} · すべてのデバイス", "monthScopeLocal": "\u{76f4}\u{8fd1} 30 \u{65e5} · このコンピュータ",
      "scopeAll": "すべてのデバイス", "scopeLocal": "このコンピュータ",
      "harness.claude-code": "Claude Code", "harness.codex": "Codex", "harness.pi": "Pi",
      "updatedJustNow": "たった\u{4eca}\u{66f4}\u{65b0}", "updatedMinutes": "{{n}} \u{5206}\u{524d}に\u{66f4}\u{65b0}", "updatedHours": "{{n}} \u{6642}\u{9593}\u{524d}に\u{66f4}\u{65b0}",
      "updatedDays": "{{n}} \u{65e5}\u{524d}に\u{66f4}\u{65b0}",
      "durationShort.daysHours": "{{d}}\u{65e5}{{h}}\u{6642}\u{9593}", "durationShort.days": "{{d}}\u{65e5}", "durationShort.hoursMinutes": "{{h}}\u{6642}\u{9593}{{m}}\u{5206}",
      "durationShort.hours": "{{h}}\u{6642}\u{9593}", "durationShort.minutes": "{{m}}\u{5206}",
    ],
    "ko": [
      "quotaName": "구독 남은 양", "quotaDescription": "구독마다 얼마나 남았는지, 언제 다시 채워지는지.",
      "usageName": "일일 사용량", "usageDescription": "오늘 사용량과 최근 며칠의 추이.",
      "emptyTitle": "아직 남은 양을 읽지 못했어요", "emptyBody": "ClawMuse를 열고 컴퓨터에 연결하면 구독마다 얼마나 남았는지 여기에 표시돼요.",
      "emptyUsageTitle": "아직 사용량을 읽지 못했어요", "emptyUsageBody": "ClawMuse를 열고 컴퓨터에 연결하면 일일 사용량이 여기에 표시돼요.",
      "updateTitle": "컴퓨터의 ClawMuse를 업데이트해 주세요", "updateBody": "업데이트하면 남은 양과 일일 사용량이 여기에 표시돼요.",
      "noSources": "남은 양을 보여 줄 계정이 아직 없어요", "valueBasis": "구독 환산", "valueBasisLong": "구독 환산 추정",
      "reset": "초기화됨", "todayNone": "오늘 사용량이 아직 없어요", "resetsIn": "{{duration}} 후 초기화", "other": "기타",
      "today": "오늘", "dailyAverage": "하루 평균", "paid": "실제 결제", "tokenUnit": "token",
      "monthScopeAll": "최근 30일 · 모든 기기", "monthScopeLocal": "최근 30일 · 이 컴퓨터",
      "scopeAll": "모든 기기", "scopeLocal": "이 컴퓨터",
      "harness.claude-code": "Claude Code", "harness.codex": "Codex", "harness.pi": "Pi",
      "updatedJustNow": "방금 업데이트", "updatedMinutes": "{{n}}분 전 업데이트", "updatedHours": "{{n}}시간 전 업데이트",
      "updatedDays": "{{n}}일 전 업데이트",
      "durationShort.daysHours": "{{d}}일 {{h}}시간", "durationShort.days": "{{d}}일", "durationShort.hoursMinutes": "{{h}}시간 {{m}}분",
      "durationShort.hours": "{{h}}시간", "durationShort.minutes": "{{m}}분",
    ],
    "de": [
      "quotaName": "Abo-Kontingent",
      "quotaDescription": "Wie viel jedes Abo noch hat und wann es sich wieder auffüllt.",
      "usageName": "Tägliche Nutzung",
      "usageDescription": "Die heutige Nutzung und der Verlauf der letzten Tage.",
      "emptyTitle": "Kontingent noch nicht abgerufen",
      "emptyBody": "Öffne ClawMuse und verbinde einen Computer, dann siehst du hier, wie viel jedes Abo noch hat.",
      "emptyUsageTitle": "Nutzung noch nicht abgerufen",
      "emptyUsageBody": "Öffne ClawMuse und verbinde einen Computer, dann siehst du hier deine tägliche Nutzung.",
      "updateTitle": "Aktualisiere ClawMuse auf deinem Computer",
      "updateBody": "Nach dem Update erscheinen hier Kontingent und tägliche Nutzung.",
      "noSources": "Noch nichts mit Kontingent vorhanden",
      "valueBasis": "Abonnementwert",
      "valueBasisLong": "Abonnementwert (geschätzt)",
      "reset": "Zurückgesetzt",
      "todayNone": "Heute noch keine Nutzung",
      "resetsIn": "Zurücksetzung in {{duration}}",
      "other": "Sonstige",
      "today": "Heute",
      "dailyAverage": "Tagesdurchschnitt",
      "paid": "Bezahlt",
      "monthScopeAll": "Letzte 30 Tage · Alle Geräte",
      "monthScopeLocal": "Letzte 30 Tage · Dieser Computer",
      "scopeAll": "Alle Geräte",
      "scopeLocal": "Dieser Computer",
      "updatedJustNow": "Gerade aktualisiert",
      "updatedMinutes": "Vor {{n}} Min. aktualisiert",
      "updatedHours": "Vor {{n}} Std. aktualisiert",
      "updatedDays": "Vor {{n}} Tagen aktualisiert",
      "tokenUnit": "token",
      "harness.claude-code": "Claude Code",
      "harness.codex": "Codex",
      "harness.pi": "Pi",
      "durationShort.daysHours": "{{d}} T. {{h}} Std.",
      "durationShort.days": "{{d}} T.",
      "durationShort.hoursMinutes": "{{h}} Std. {{m}} Min.",
      "durationShort.hours": "{{h}} Std.",
      "durationShort.minutes": "{{m}} Min.",
    ],
    "es": [
      "quotaName": "Cuota de suscripciones",
      "quotaDescription": "Cuánto le queda a cada suscripción y cuándo se recarga.",
      "usageName": "Uso diario",
      "usageDescription": "El uso de hoy y la tendencia de los últimos días.",
      "emptyTitle": "Cuota no leída aún",
      "emptyBody": "Abre ClawMuse y conecta una computadora para ver cuánto le queda a cada suscripción.",
      "emptyUsageTitle": "Uso no leído aún",
      "emptyUsageBody": "Abre ClawMuse y conecta una computadora para ver tu uso diario.",
      "updateTitle": "Actualiza ClawMuse en tu computadora",
      "updateBody": "Tras actualizar, aquí verás la cuota y el uso diario.",
      "noSources": "Nada con cuota todavía",
      "valueBasis": "Valor de suscripción",
      "valueBasisLong": "Valor de suscripción estimado",
      "reset": "Reiniciado",
      "todayNone": "Sin uso hoy",
      "resetsIn": "Se reinicia en {{duration}}",
      "other": "Otros",
      "today": "Hoy",
      "dailyAverage": "Promedio diario",
      "paid": "De pago",
      "monthScopeAll": "Últimos 30 días · Todos los dispositivos",
      "monthScopeLocal": "Últimos 30 días · Esta computadora",
      "scopeAll": "Todos los dispositivos",
      "scopeLocal": "Esta computadora",
      "updatedJustNow": "Actualizado hace un momento",
      "updatedMinutes": "Actualizado hace {{n}} min",
      "updatedHours": "Actualizado hace {{n}} h",
      "updatedDays": "Actualizado hace {{n}} días",
      "tokenUnit": "token",
      "harness.claude-code": "Claude Code",
      "harness.codex": "Codex",
      "harness.pi": "Pi",
      "durationShort.daysHours": "{{d}}d {{h}}h",
      "durationShort.days": "{{d}}d",
      "durationShort.hoursMinutes": "{{h}}h {{m}}m",
      "durationShort.hours": "{{h}}h",
      "durationShort.minutes": "{{m}}m",
    ],
    "fr": [
      "quotaName": "Quota des abonnements",
      "quotaDescription": "Ce qu'il reste à chaque abonnement et quand il se recharge.",
      "usageName": "Usage quotidien",
      "usageDescription": "L'usage d'aujourd'hui et la tendance des derniers jours.",
      "emptyTitle": "Quota pas encore lu",
      "emptyBody": "Ouvrez ClawMuse et connectez un ordinateur pour voir ce qu'il reste à chaque abonnement.",
      "emptyUsageTitle": "Usage pas encore lu",
      "emptyUsageBody": "Ouvrez ClawMuse et connectez un ordinateur pour voir votre usage quotidien.",
      "updateTitle": "Mettez à jour ClawMuse sur votre ordinateur",
      "updateBody": "Après la mise à jour, le quota et l'usage quotidien s'afficheront ici.",
      "noSources": "Aucune source avec quota pour l'instant",
      "valueBasis": "Valeur de l'abonnement",
      "valueBasisLong": "Valeur de l'abonnement (estimation)",
      "reset": "Réinitialisé",
      "todayNone": "Aucun usage aujourd'hui",
      "resetsIn": "Réinitialisation dans {{duration}}",
      "other": "Autres",
      "today": "Aujourd'hui",
      "dailyAverage": "Moy. quotidienne",
      "paid": "Payant",
      "monthScopeAll": "30 derniers jours · Tous les appareils",
      "monthScopeLocal": "30 derniers jours · Cet ordinateur",
      "scopeAll": "Tous les appareils",
      "scopeLocal": "Cet ordinateur",
      "updatedJustNow": "Mis à jour à l'instant",
      "updatedMinutes": "Mis à jour il y a {{n}} min",
      "updatedHours": "Mis à jour il y a {{n}} h",
      "updatedDays": "Mis à jour il y a {{n}} jours",
      "tokenUnit": "token",
      "harness.claude-code": "Claude Code",
      "harness.codex": "Codex",
      "harness.pi": "Pi",
      "durationShort.daysHours": "{{d}} j {{h}} h",
      "durationShort.days": "{{d}} j",
      "durationShort.hoursMinutes": "{{h}} h {{m}} min",
      "durationShort.hours": "{{h}} h",
      "durationShort.minutes": "{{m}} min",
    ],
    "pt-BR": [
      "quotaName": "Cota das assinaturas",
      "quotaDescription": "Quanto resta em cada assinatura e quando ela renova.",
      "usageName": "Uso diário",
      "usageDescription": "O uso de hoje e a tendência dos últimos dias.",
      "emptyTitle": "Cota ainda não consultada",
      "emptyBody": "Abra o ClawMuse e conecte um computador para ver quanto resta em cada assinatura.",
      "emptyUsageTitle": "Uso ainda não consultado",
      "emptyUsageBody": "Abra o ClawMuse e conecte um computador para ver seu uso diário.",
      "updateTitle": "Atualize o ClawMuse no seu computador",
      "updateBody": "Depois da atualização, a cota e o uso diário aparecem aqui.",
      "noSources": "Ainda não há fontes com cota",
      "valueBasis": "Valor da assinatura",
      "valueBasisLong": "Valor da assinatura (estimativa)",
      "reset": "Renovada",
      "todayNone": "Nenhum uso hoje",
      "resetsIn": "Renova em {{duration}}",
      "other": "Outros",
      "today": "Hoje",
      "dailyAverage": "Média diária",
      "paid": "Pago",
      "monthScopeAll": "Últimos 30 dias · Todos os dispositivos",
      "monthScopeLocal": "Últimos 30 dias · Este computador",
      "scopeAll": "Todos os dispositivos",
      "scopeLocal": "Este computador",
      "updatedJustNow": "Atualizado agora",
      "updatedMinutes": "Atualizado há {{n}} min",
      "updatedHours": "Atualizado há {{n}} h",
      "updatedDays": "Atualizado há {{n}} dias",
      "tokenUnit": "token",
      "harness.claude-code": "Claude Code",
      "harness.codex": "Codex",
      "harness.pi": "Pi",
      "durationShort.daysHours": "{{d}}d {{h}}h",
      "durationShort.days": "{{d}}d",
      "durationShort.hoursMinutes": "{{h}}h {{m}}m",
      "durationShort.hours": "{{h}}h",
      "durationShort.minutes": "{{m}}m",
    ],
    "pt-PT": [
      "quotaName": "Quota das subscrições",
      "quotaDescription": "Quanto resta em cada subscrição e quando volta a encher.",
      "usageName": "Utilização diária",
      "usageDescription": "A utilização de hoje e a tendência dos últimos dias.",
      "emptyTitle": "Quota ainda não consultada",
      "emptyBody": "Abra o ClawMuse e ligue um computador para ver quanto resta em cada subscrição.",
      "emptyUsageTitle": "Utilização ainda não consultada",
      "emptyUsageBody": "Abra o ClawMuse e ligue um computador para ver a sua utilização diária.",
      "updateTitle": "Atualize o ClawMuse no seu computador",
      "updateBody": "Depois da atualização, a quota e a utilização diária aparecem aqui.",
      "noSources": "Ainda não há fontes com quota",
      "valueBasis": "Valor da subscrição",
      "valueBasisLong": "Valor da subscrição (estimativa)",
      "reset": "Reposta",
      "todayNone": "Sem utilização hoje",
      "resetsIn": "Reposição dentro de {{duration}}",
      "other": "Outros",
      "today": "Hoje",
      "dailyAverage": "Média diária",
      "paid": "Pago",
      "monthScopeAll": "Últimos 30 dias · Todos os dispositivos",
      "monthScopeLocal": "Últimos 30 dias · Este computador",
      "scopeAll": "Todos os dispositivos",
      "scopeLocal": "Este computador",
      "updatedJustNow": "Atualizado agora mesmo",
      "updatedMinutes": "Atualizado há {{n}} min",
      "updatedHours": "Atualizado há {{n}} h",
      "updatedDays": "Atualizado há {{n}} dias",
      "tokenUnit": "token",
      "harness.claude-code": "Claude Code",
      "harness.codex": "Codex",
      "harness.pi": "Pi",
      "durationShort.daysHours": "{{d}}d {{h}}h",
      "durationShort.days": "{{d}}d",
      "durationShort.hoursMinutes": "{{h}}h {{m}}m",
      "durationShort.hours": "{{h}}h",
      "durationShort.minutes": "{{m}}m",
    ],
    "en": [
      "quotaName": "Subscription quota", "quotaDescription": "What each subscription has left and when it refills.",
      "usageName": "Daily usage", "usageDescription": "Today's usage and the trend of recent days.",
      "emptyTitle": "No quota yet", "emptyBody": "Open ClawMuse and connect a computer to see what each subscription has left.",
      "emptyUsageTitle": "No usage yet", "emptyUsageBody": "Open ClawMuse and connect a computer to see your daily usage.",
      "updateTitle": "Update ClawMuse on your computer", "updateBody": "Quota and daily usage appear here after the update.",
      "noSources": "No accounts with quota yet", "valueBasis": "Subscription value", "valueBasisLong": "Subscription value estimate",
      "reset": "Reset", "todayNone": "No usage today", "resetsIn": "Resets in {{duration}}", "other": "Other",
      "today": "Today", "dailyAverage": "Daily avg", "paid": "Paid", "tokenUnit": "tokens",
      "monthScopeAll": "Last 30 days · All devices", "monthScopeLocal": "Last 30 days · This computer",
      "scopeAll": "All devices", "scopeLocal": "This computer",
      "harness.claude-code": "Claude Code", "harness.codex": "Codex", "harness.pi": "Pi",
      "updatedJustNow": "Updated just now", "updatedMinutes": "Updated {{n}}m ago", "updatedHours": "Updated {{n}}h ago",
      "updatedDays": "Updated {{n}}d ago",
      "durationShort.daysHours": "{{d}}d {{h}}h", "durationShort.days": "{{d}}d", "durationShort.hoursMinutes": "{{h}}h {{m}}m",
      "durationShort.hours": "{{h}}h", "durationShort.minutes": "{{m}}m",
    ],
  ]

  private static func language(_ locale: Locale) -> String {
    let id = locale.identifier
    if id.hasPrefix("zh") { return id.contains("Hant") || id.contains("TW") || id.contains("HK") ? "zh-Hant" : "zh-Hans" }
    if id.hasPrefix("ja") { return "ja" }
    if id.hasPrefix("ko") { return "ko" }
    if id.hasPrefix("de") { return "de" }
    if id.hasPrefix("es") { return "es" }
    if id.hasPrefix("fr") { return "fr" }
    if id.hasPrefix("pt") { return id.contains("PT") ? "pt-PT" : "pt-BR" }
    return "en"
  }

  static func text(_ key: String, locale: Locale = Locale(identifier: Locale.preferredLanguages.first ?? "en")) -> String {
    table[language(locale)]?[key] ?? table["en"]?[key] ?? key
  }

  /// Strings normally sent by the computer, for snapshots that lack them and for placeholders.
  static func fallback(_ key: String, locale: Locale) -> String {
    if let value = table[language(locale)]?[key] { return value }
    return table["en"]?[key] ?? key
  }
}
