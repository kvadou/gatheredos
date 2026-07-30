import Foundation

// Plain Codable mirrors of the Postgres tables. Only the columns the app reads
// are modeled; jsonb/blob columns are left out so decoding stays trivial.

struct Home: Identifiable, Decodable, Hashable {
    let id: String
    let name: String
    let city: String?
    let state: String?
}

struct Item: Identifiable, Decodable, Hashable {
    let id: String
    let name: String
    let category: String
    let status: String?
    let manufacturer: String?
    let model: String?
    let serial: String?
    let installedOn: String?      // date column arrives as "yyyy-MM-dd"
    let lifespanYears: Int?
    let summary: String?

    enum CodingKeys: String, CodingKey {
        case id, name, category, status, manufacturer, model, serial, summary
        case installedOn = "installed_on"
        case lifespanYears = "lifespan_years"
    }
}

// Insert payload — snake_case property names map straight onto the columns,
// so no encoder key strategy is needed.
struct NewItem: Encodable {
    let home_id: String
    let name: String
    let category: String
    let manufacturer: String?
    let model: String?
    let installed_on: String?
}

struct Profile: Decodable {
    let name: String?
    let email: String
}

struct CareTask: Identifiable, Decodable, Hashable {
    let id: String
    let title: String
    let detail: String?
    let priority: String?
    let season: String?
    let dueOn: String?          // date column arrives as "yyyy-MM-dd"
    let recurrence: String?     // vocabulary: "yearly" / "every 3 months" / "twice yearly"
    let status: String
    let itemId: String?
    let completedAt: String?
    let source: String

    enum CodingKeys: String, CodingKey {
        case id, title, detail, priority, season, recurrence, status, source
        case dueOn = "due_on"
        case itemId = "item_id"
        case completedAt = "completed_at"
    }
}

struct CareEvent: Identifiable, Decodable, Hashable {
    let id: String
    let title: String
    let note: String?
    let cost: Double?           // numeric column
    let occurredOn: String?
    let itemId: String?

    enum CodingKeys: String, CodingKey {
        case id, title, note, cost
        case occurredOn = "occurred_on"
        case itemId = "item_id"
    }
}

struct Project: Identifiable, Decodable, Hashable {
    let id: String
    let name: String
    let kind: String            // active / idea / recommended / completed
    let status: String?
    let progress: Int?
    let summary: String?
    let budget: Double?
    let spent: Double?
    let cost: Double?
    let valueAdded: Double?
    let completedYear: Int?

    enum CodingKeys: String, CodingKey {
        case id, name, kind, status, progress, summary, budget, spent, cost
        case valueAdded = "value_added"
        case completedYear = "completed_year"
    }
}

struct Insight: Identifiable, Decodable, Hashable {
    let id: String
    let category: String?
    let headline: String
    let detail: String?
    let stat: String?
    let action: String?
    let status: String
    let basis: String?
    let source: String
    let confidence: Double?
    let sourceExtractionId: String?
    let dedupeSlug: String?

    enum CodingKeys: String, CodingKey {
        case id, category, headline, detail, stat, action, status, basis, source, confidence
        case sourceExtractionId = "source_extraction_id"
        case dedupeSlug = "dedupe_slug"
    }
}

struct Room: Identifiable, Decodable, Hashable {
    let id: String
    let name: String
    let slug: String
}

struct HomeFile: Identifiable, Decodable, Hashable {
    let id: String
    let name: String
    let type: String            // document/photo/video/receipt/manual/warranty
    let itemId: String?
    let createdAt: String
    let extractionStatus: String?
    let storagePath: String

    enum CodingKeys: String, CodingKey {
        case id, name, type
        case itemId = "item_id"
        case createdAt = "created_at"
        case extractionStatus = "extraction_status"
        case storagePath = "storage_path"
    }
}

struct Warranty: Identifiable, Decodable, Hashable {
    let id: String
    let provider: String?
    let kind: String?
    let coverage: String?
    let startsOn: String?
    let endsOn: String?
    let status: String
    let sourceKind: String
    let confidence: Double?
    let notes: String?

    enum CodingKeys: String, CodingKey {
        case id, provider, kind, coverage, status, confidence, notes
        case startsOn = "starts_on"
        case endsOn = "ends_on"
        case sourceKind = "source_kind"
    }
}

struct Contractor: Identifiable, Decodable, Hashable {
    let id: String
    let name: String
    let company: String?
    let phone: String?
    let email: String?
    let notes: String?
}

// MARK: - Service coordination

struct ServiceCase: Identifiable, Decodable, Hashable {
    let id: String
    let status: String
    let symptomSummary: String?
    let urgency: String
    let sharingStatus: String
    let sharingExpiresAt: String?
    let openedAt: String

    enum CodingKeys: String, CodingKey {
        case id, status, urgency
        case symptomSummary = "symptom_summary"
        case sharingStatus = "sharing_status"
        case sharingExpiresAt = "sharing_expires_at"
        case openedAt = "opened_at"
    }
}

struct ServiceSafetyAnswers: Encodable, Hashable {
    var gasSmell = false
    var smokeOrSparks = false
    var electricShock = false
    var activeFloodingNearPower = false
    var carbonMonoxideAlarm = false
    var severeOverheating = false

    var hasStopCondition: Bool {
        gasSmell || smokeOrSparks || electricShock || activeFloodingNearPower
            || carbonMonoxideAlarm || severeOverheating
    }
}

struct ServiceIntakeRequest: Encodable {
    let itemId: String
    let symptom: String
    let errorCode: String?
    let urgency: String
    let safety: ServiceSafetyAnswers
    let availability: ServiceAvailability
    let fileIds: [String]
    let shareApproved: Bool
}

struct ServiceAvailability: Encodable {
    let start: String
    let end: String
    let notes: String?
}

struct ServiceIntakeResponse: Decodable {
    let `case`: ServiceCase
    let safety: ServiceSafetyResult
}

struct ActiveServiceCaseResponse: Decodable {
    let `case`: ServiceCase?
}

struct ServiceSafetyResult: Decodable {
    let stopped: Bool
    let triggered: [String]
    let guidance: String
}

struct ServiceCaseDetail: Decodable {
    let `case`: ServiceCase
    let options: [ServiceOption]
    let appointment: ServiceAppointment?
    let outcome: ServiceOutcome?
}

struct ServiceOption: Identifiable, Decodable, Hashable {
    let id: String
    let providerId: String
    let providerName: String
    let visitType: String
    let diagnosticFee: Double?
    let travelFee: Double?
    let deposit: Double?
    let currency: String
    let priceNotes: String?
    let windowStart: String?
    let windowEnd: String?
    let timezone: String
    let providerConfirmedAt: String?
    let expiresAt: String?
    let cancellationTerms: String?
    let partsLaborWarranty: String?
    let serviceFit: [String: Bool]?
    let verifiedFacts: [ServiceVerifiedFact]

    var knownVisitCost: Double? {
        let values = [diagnosticFee, travelFee, deposit].compactMap { $0 }
        return values.isEmpty ? nil : values.reduce(0, +)
    }
}

struct ServiceVerifiedFact: Decodable, Hashable {
    let kind: String
    let status: String
    let value: String?
    let source: String?
    let verifiedAt: String?
    let expiresAt: String?
}

struct ServiceAppointment: Decodable, Hashable {
    let id: String
    let status: String
    let providerId: String
    let providerName: String
    let offerId: String
    let windowStart: String
    let windowEnd: String
    let timezone: String
    let externalReference: String?
    let confirmedAt: String?
    let calendarEventIdentifier: String?
    let cancellationTerms: String?
}

struct ServiceBookingResponse: Decodable {
    let caseId: String
    let status: String
    let appointmentId: String
    let providerName: String
}

struct ServiceOutcome: Identifiable, Decodable {
    let id: String
    let resolution: String
    let workPerformed: String
    let finalCost: Double?
    let partsSummary: String?
    let laborWarranty: String?
    let occurredOn: String
    let careEventId: String?

    enum CodingKeys: String, CodingKey {
        case id, resolution
        case workPerformed = "work_performed"
        case finalCost = "final_cost"
        case partsSummary = "parts_summary"
        case laborWarranty = "labor_warranty"
        case occurredOn = "occurred_on"
        case careEventId = "care_event_id"
    }
}

struct ServiceOutcomeRequest: Encodable {
    let resolution: String
    let workPerformed: String
    let finalCost: Double?
    let partsSummary: String?
    let laborWarranty: String?
    let invoiceFileId: String?
    let providerTimeliness: Int?
    let providerCommunication: Int?
    let privateFeedback: String?
    let occurredOn: String
}

// Insert payloads — snake_case property names map straight onto the columns.
struct NewCareEvent: Encodable {
    let home_id: String
    let title: String
    let note: String?
    let cost: Double?
    let occurred_on: String
    let item_id: String?
}

struct NewCareTask: Encodable {
    let home_id: String
    let item_id: String?
    let title: String
    let detail: String?
    let priority: String?
    let season: String?
    let due_on: String?
    let recurrence: String?
    let template_slug: String?
    let source: String
}

struct NewProject: Encodable {
    let home_id: String
    let name: String
    let kind: String
    let status: String?
    let progress: Int?
    let summary: String?
    let budget: Double?
    let spent: Double?
}

struct ProjectUpdate: Encodable {
    let name: String
    let kind: String
    let status: String?
    let progress: Int?
    let summary: String?
    let budget: Double?
    let spent: Double?
}

// Insert payload for a captured receipt/photo — mirrors recordUpload's files row
// (lib/actions/library.ts). Both receipts and photos route through extraction.
struct NewFile: Encodable {
    let home_id: String
    let item_id: String?
    let type: String
    let name: String
    let storage_path: String
    let content_hash: String
    let extraction_status: String
    let meta: [String: String]
}

/// Minimal decode of an `insert ... .select("id")` response.
struct InsertedID: Decodable {
    let id: String
}

/// Raised when a file insert hits the (home_id, content_hash) unique index — the
/// exact bytes are already filed. The capture UI turns this into a calm notice.
enum IngestError: Error {
    case duplicate
}

struct ScanSuggestion: Decodable {
    let id: String
    let summary: String
    let provenance: ScanSuggestionProvenance?

    var isOutOfScope: Bool { provenance?.scopeStatus == "out_of_scope" }
    var scopeReason: String? { provenance?.scopeReason }
}

struct ScanSuggestionProvenance: Decodable {
    let scopeStatus: String?
    let scopeReason: String?

    enum CodingKeys: String, CodingKey {
        case scopeStatus = "scope_status"
        case scopeReason = "scope_reason"
    }
}

struct ScanFileState: Decodable {
    let itemId: String?
    let extractionStatus: String?
    let scopeStatus: String?
    let scopeReason: String?

    enum CodingKeys: String, CodingKey {
        case itemId = "item_id"
        case extractionStatus = "extraction_status"
        case scopeStatus = "scope_status"
        case scopeReason = "scope_reason"
    }
}

enum ScanOutcome {
    case processing
    case matched(itemName: String)
    case outOfScopeMatch(itemID: String, itemName: String)
    case outOfScope(reason: String)
    case needsReview(ScanSuggestion)
    case noMatch
    case failed
}

// MARK: - Settings + onboarding (Phase D)

/// Full home row for the settings editor. `firstHome`'s lean `Home` only carries
/// what the dashboards need; this adds the editable address/spec columns.
struct HomeDetail: Decodable {
    let id: String
    let name: String
    let street: String?
    let city: String?
    let state: String?
    let zip: String?
    let yearBuilt: Int?
    let sqft: Int?
    let beds: Double?          // beds/baths are `numeric` columns
    let baths: Double?

    enum CodingKeys: String, CodingKey {
        case id, name, street, city, state, zip, sqft, beds, baths
        case yearBuilt = "year_built"
    }
}

/// A home_members row with its profile embedded (PostgREST `profiles(name, email)`).
struct Member: Identifiable, Decodable, Hashable {
    let userId: String
    let role: String
    let profile: MemberProfile?
    var id: String { userId }

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case role
        case profile = "profiles"
    }
}

struct MemberProfile: Decodable, Hashable {
    let name: String?
    let email: String
}

struct NotificationPreferences: Codable {
    var safetyAlerts: Bool
    var careReminders: Bool
    var warrantyAlerts: Bool
    var weeklyDigest: Bool

    static let defaults = NotificationPreferences(
        safetyAlerts: true, careReminders: true,
        warrantyAlerts: true, weeklyDigest: false
    )

    enum CodingKeys: String, CodingKey {
        case safetyAlerts = "safety_alerts"
        case careReminders = "care_reminders"
        case warrantyAlerts = "warranty_alerts"
        case weeklyDigest = "weekly_digest"
    }
}

/// Insert payload for a brand-new home. The DB trigger `handle_new_home` adds the
/// creator as owner, so we never touch home_members from the client (RLS blocks it).
struct NewHome: Encodable {
    let created_by: String
    let name: String
    let street: String?
    let city: String?
    let state: String?
    let zip: String?
}

/// Home settings patch. Explicit `encode(to:)` so cleared fields persist as SQL
/// null (the synthesized encoder omits nil optionals, which would leave them stale).
struct HomeUpdate: Encodable {
    let name: String
    let street: String?
    let city: String?
    let state: String?
    let zip: String?
    let year_built: Int?
    let sqft: Int?
    let beds: Double?
    let baths: Double?

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(name, forKey: .name)
        try c.encode(street, forKey: .street)
        try c.encode(city, forKey: .city)
        try c.encode(state, forKey: .state)
        try c.encode(zip, forKey: .zip)
        try c.encode(year_built, forKey: .year_built)
        try c.encode(sqft, forKey: .sqft)
        try c.encode(beds, forKey: .beds)
        try c.encode(baths, forKey: .baths)
    }

    enum CodingKeys: String, CodingKey {
        case name, street, city, state, zip, year_built, sqft, beds, baths
    }
}

/// Item edit patch. Same null-forcing encode so cleared text fields don't stick.
struct ItemUpdate: Encodable {
    let name: String
    let category: String
    let manufacturer: String?
    let model: String?
    let serial: String?
    let installed_on: String?
    let lifespan_years: Int?

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(name, forKey: .name)
        try c.encode(category, forKey: .category)
        try c.encode(manufacturer, forKey: .manufacturer)
        try c.encode(model, forKey: .model)
        try c.encode(serial, forKey: .serial)
        try c.encode(installed_on, forKey: .installed_on)
        try c.encode(lifespan_years, forKey: .lifespan_years)
    }

    enum CodingKeys: String, CodingKey {
        case name, category, manufacturer, model, serial, installed_on, lifespan_years
    }
}

// MARK: - Address autocomplete

/// One hit from GET /api/address-search (OSM/Nominatim-backed). `state`/`zip` are
/// optional-tolerant — Nominatim omits them for some results. Hashable so the
/// suggestions list can key its ForEach on the whole value.
struct AddressSuggestion: Decodable, Hashable {
    let label: String       // "1600 Pennsylvania Ave NW, Washington, DC 20500"
    let street: String
    let city: String
    let state: String?
    let zip: String?
}

struct AddressSearchResponse: Decodable {
    let suggestions: [AddressSuggestion]
}
