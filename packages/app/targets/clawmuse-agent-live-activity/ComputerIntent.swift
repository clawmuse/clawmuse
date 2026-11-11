import AppIntents
import WidgetKit

/// A computer a widget can show, or "automatic": the one that answered the app last.
@available(iOS 17.0, *)
struct ComputerEntity: AppEntity {
  static let autoID = "auto"
  static let automatic = ComputerEntity(id: autoID, name: "")

  let id: String
  let name: String

  static var typeDisplayRepresentation: TypeDisplayRepresentation = "CLAWMUSE_WIDGET_INTENT_COMPUTER"
  static var defaultQuery = ComputerQuery()

  var displayRepresentation: DisplayRepresentation {
    id == Self.autoID
      ? DisplayRepresentation(title: "CLAWMUSE_WIDGET_INTENT_AUTOMATIC", subtitle: "CLAWMUSE_WIDGET_INTENT_AUTOMATIC_SUBTITLE")
      : DisplayRepresentation(title: "\(name)")
  }
}

/// The computers the app last listed (other computers that allow remote control).
@available(iOS 17.0, *)
struct ComputerQuery: EntityQuery {
  func entities(for identifiers: [String]) async throws -> [ComputerEntity] {
    all().filter { identifiers.contains($0.id) }
  }

  func suggestedEntities() async throws -> [ComputerEntity] {
    all()
  }

  func defaultResult() async -> ComputerEntity? {
    .automatic
  }

  private func all() -> [ComputerEntity] {
    [.automatic] + (WidgetStore.load()?.computers.map { ComputerEntity(id: $0.id, name: $0.name) } ?? [])
  }
}

/// An account the quota widget can list: one of the sources a computer sent. The id carries the
/// logo and name too (`AccountKey`), so a choice still finds the account on another computer.
@available(iOS 17.0, *)
struct AccountEntity: AppEntity {
  let key: AccountKey

  var id: String { key.encoded }

  static var typeDisplayRepresentation: TypeDisplayRepresentation = "CLAWMUSE_WIDGET_INTENT_ACCOUNT"
  static var defaultQuery = AccountQuery()

  var displayRepresentation: DisplayRepresentation {
    let image = key.logo.map { DisplayRepresentation.Image(named: "logo-\($0)") }
    return DisplayRepresentation(title: "\(key.name)", image: image)
  }
}

/// The accounts of the widget's chosen computer, in that computer's order. Hidden ones on the
/// computer are not sent, so they are not offered either.
@available(iOS 17.0, *)
struct AccountQuery: EntityQuery {
  @IntentParameterDependency<QuotaWidgetIntent>(\.$computer)
  var config

  func entities(for identifiers: [String]) async throws -> [AccountEntity] {
    identifiers.map { AccountEntity(key: AccountKey(encoded: $0)) }
  }

  func suggestedEntities() async throws -> [AccountEntity] {
    let sources = WidgetState.load(computer: config?.computer.id).snapshot?.sources ?? []
    return sources.map { AccountEntity(key: AccountKey(source: $0)) }
  }
}

/// What a widget's edit sheet chose; nil or empty means the defaults.
@available(iOS 17.0, *)
protocol UsageWidgetConfiguration: WidgetConfigurationIntent {
  var computerID: String? { get }
  /// Accounts placed first, in this order (`AccountKey` strings).
  var pinnedAccounts: [String]? { get }
  /// Accounts left out (`AccountKey` strings).
  var hiddenAccounts: [String]? { get }
}

/// "Data source" in the daily usage widget's edit sheet.
@available(iOS 17.0, *)
struct SelectComputerIntent: UsageWidgetConfiguration {
  static var title: LocalizedStringResource = "CLAWMUSE_WIDGET_INTENT_DATA_SOURCE"
  static var description = IntentDescription("CLAWMUSE_WIDGET_INTENT_SELECT_COMPUTER_DESC")

  @Parameter(title: "CLAWMUSE_WIDGET_INTENT_COMPUTER")
  var computer: ComputerEntity?

  var computerID: String? { computer?.id }
  var pinnedAccounts: [String]? { nil }
  var hiddenAccounts: [String]? { nil }
}

/// The quota widget's edit sheet, like the Mac menu bar's settings: accounts placed first and
/// accounts hidden; every other account, including ones added later, follows in the computer's
/// order.
@available(iOS 17.0, *)
struct QuotaWidgetIntent: UsageWidgetConfiguration {
  static var title: LocalizedStringResource = "CLAWMUSE_WIDGET_INTENT_DATA_SOURCE"
  static var description = IntentDescription("CLAWMUSE_WIDGET_INTENT_QUOTA_DESC")

  @Parameter(title: "CLAWMUSE_WIDGET_INTENT_COMPUTER")
  var computer: ComputerEntity?

  /// Up to what each size shows; a plain number would mean exactly that many, with no way to
  /// remove one or clear the choice.
  @Parameter(title: "CLAWMUSE_WIDGET_INTENT_ACCOUNTS_FIRST", size: [
    .systemSmall: IntentCollectionSize(min: 0, max: 4),
    .systemMedium: IntentCollectionSize(min: 0, max: 6),
    .systemLarge: IntentCollectionSize(min: 0, max: 7),
    .accessoryCircular: IntentCollectionSize(min: 0, max: 2),
    .accessoryRectangular: IntentCollectionSize(min: 0, max: 4),
    .accessoryInline: IntentCollectionSize(min: 0, max: 1),
  ])
  var pinned: [AccountEntity]?

  @Parameter(title: "CLAWMUSE_WIDGET_INTENT_HIDDEN_ACCOUNTS")
  var hidden: [AccountEntity]?

  var computerID: String? { computer?.id }
  var pinnedAccounts: [String]? { pinned?.map(\.id) }
  var hiddenAccounts: [String]? { hidden?.map(\.id) }
}
