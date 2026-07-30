import Foundation
import Supabase

// The whole model layer: one client + a handful of async queries. RLS scopes
// every read/write to the caller's homes, so the app never sends a user id.
@MainActor
@Observable
final class SupabaseService {
    let client: SupabaseClient
    var currentUser: User?
    var isBootstrapping = true

    init() {
        client = SupabaseClient(
            supabaseURL: Config.supabaseURL,
            supabaseKey: Config.supabaseAnonKey
        )
    }

    /// Restores a persisted session and then tracks auth changes for the app's
    /// lifetime. supabase-swift emits `.initialSession` on subscription, which
    /// is what flips `isBootstrapping` off (signed in or out).
    func observeAuth() async {
        for await change in client.auth.authStateChanges {
            currentUser = change.session?.user
            isBootstrapping = false
        }
    }

    // MARK: - Auth

    func signIn(email: String, password: String) async throws {
        try await client.auth.signIn(email: email, password: password)
    }

    /// Returns the session when the project auto-confirms; nil means the user
    /// must confirm via email before a session exists.
    func signUp(email: String, password: String, name: String) async throws -> Session? {
        try await client.auth.signUp(
            email: email,
            password: password,
            data: ["name": .string(name)]
        ).session
    }

    func signOut() async throws {
        try await client.auth.signOut()
    }

    // MARK: - Data

    func firstHome() async throws -> Home? {
        let rows: [Home] = try await client.from("homes")
            .select("id, name, city, state")
            .limit(1)
            .execute()
            .value
        return rows.first
    }

    func profile() async throws -> Profile? {
        guard let uid = currentUser?.id else { return nil }
        let row: Profile = try await client.from("profiles")
            .select("name, email")
            .eq("id", value: uid.uuidString)
            .single()
            .execute()
            .value
        return row
    }

    func items(homeID: String) async throws -> [Item] {
        let rows: [Item] = try await client.from("items")
            .select("id, name, category, status, manufacturer, model, serial, installed_on, lifespan_years, summary")
            .eq("home_id", value: homeID)
            .order("name")
            .execute()
            .value
        return rows
    }

    func canWrite(homeID: String) async throws -> Bool {
        guard let uid = currentUser?.id else { return false }
        struct RoleRow: Decodable { let role: String }
        let row: RoleRow = try await client.from("home_members").select("role")
            .eq("home_id", value: homeID).eq("user_id", value: uid.uuidString).single().execute().value
        return row.role == "owner" || row.role == "family"
    }

    /// Head-count for the Home stat tiles. `filters` are extra equality clauses
    /// (e.g. category=system, status=open).
    func count(_ table: String, homeID: String, filters: [(String, String)] = []) async throws -> Int {
        var query = client.from(table)
            .select("*", head: true, count: .exact)
            .eq("home_id", value: homeID)
        for (column, value) in filters {
            query = query.eq(column, value: value)
        }
        return try await query.execute().count ?? 0
    }

    func addItem(_ item: NewItem) async throws {
        try await client.from("items").insert(item).execute()
    }

    func updateItem(id: String, _ patch: ItemUpdate) async throws {
        try await client.from("items").update(patch).eq("id", value: id).execute()
    }

    func deleteItem(id: String) async throws {
        try await client.from("items").delete().eq("id", value: id).execute()
    }

    // MARK: - Settings + onboarding (Phase D)

    /// Full home row for the settings editor.
    func homeDetail(id: String) async throws -> HomeDetail {
        try await client.from("homes")
            .select("id, name, street, city, state, zip, year_built, sqft, beds, baths")
            .eq("id", value: id)
            .single()
            .execute()
            .value
    }

    func updateHome(id: String, _ patch: HomeUpdate) async throws {
        try await client.from("homes").update(patch).eq("id", value: id).execute()
    }

    /// Update the caller's own display name (profiles RLS: "update own").
    func updateProfileName(_ name: String) async throws {
        guard let uid = currentUser?.id else { return }
        try await client.from("profiles")
            .update(["name": name])
            .eq("id", value: uid.uuidString)
            .execute()
    }

    /// Everyone on the home, with names/emails embedded. Co-member profile reads
    /// are allowed by the `profiles: co-members read` policy.
    func members(homeID: String) async throws -> [Member] {
        try await client.from("home_members")
            .select("user_id, role, profiles(name, email)")
            .eq("home_id", value: homeID)
            .order("role")
            .execute()
            .value
    }

    func notificationPreferences(homeID: String) async throws -> NotificationPreferences {
        guard let uid = currentUser?.id else { return .defaults }
        let rows: [NotificationPreferences] = try await client.from("notification_preferences")
            .select("safety_alerts, care_reminders, warranty_alerts, weekly_digest")
            .eq("home_id", value: homeID)
            .eq("user_id", value: uid.uuidString)
            .limit(1)
            .execute()
            .value
        return rows.first ?? .defaults
    }

    func updateNotificationPreferences(homeID: String, preferences: NotificationPreferences) async throws {
        guard let uid = currentUser?.id else { return }
        struct Row: Encodable {
            let user_id: String
            let home_id: String
            let safety_alerts: Bool
            let care_reminders: Bool
            let warranty_alerts: Bool
            let weekly_digest: Bool
        }
        try await client.from("notification_preferences").upsert(Row(
            user_id: uid.uuidString, home_id: homeID,
            safety_alerts: preferences.safetyAlerts,
            care_reminders: preferences.careReminders,
            warranty_alerts: preferences.warrantyAlerts,
            weekly_digest: preferences.weeklyDigest
        ), onConflict: "user_id,home_id").execute()
    }

    /// Create the home; the `handle_new_home` trigger adds the caller as owner.
    /// Returns the lean `Home` the app's dashboards use.
    func createHome(_ home: NewHome) async throws -> Home {
        try await client.from("homes")
            .insert(home)
            .select("id, name, city, state")
            .single()
            .execute()
            .value
    }

    // MARK: - Care

    private static let careColumns =
        "id, title, detail, priority, season, due_on, recurrence, status, item_id, completed_at, source"

    /// Active tasks (open + snoozed), soonest due first, undated last.
    func careTasks(homeID: String) async throws -> [CareTask] {
        try await client.from("care_tasks")
            .select(Self.careColumns)
            .eq("home_id", value: homeID)
            .in("status", values: ["open", "snoozed"])
            .order("due_on", ascending: true, nullsFirst: false)
            .execute()
            .value
    }

    /// Recently completed tasks for the service-history feed.
    func doneCareTasks(homeID: String, limit: Int = 20) async throws -> [CareTask] {
        try await client.from("care_tasks")
            .select(Self.careColumns)
            .eq("home_id", value: homeID)
            .eq("status", value: "done")
            .order("completed_at", ascending: false, nullsFirst: false)
            .limit(limit)
            .execute()
            .value
    }

    func careEvents(homeID: String, limit: Int = 25) async throws -> [CareEvent] {
        try await client.from("care_events")
            .select("id, title, note, cost, occurred_on, item_id")
            .eq("home_id", value: homeID)
            .order("occurred_on", ascending: false)
            .limit(limit)
            .execute()
            .value
    }

    func addCareTask(_ task: NewCareTask) async throws {
        try await client.from("care_tasks").insert(task).execute()
    }

    func addCareEvent(_ event: NewCareEvent) async throws {
        try await client.from("care_events").insert(event).execute()
    }

    // ponytail: mirrors the web completeTask server action (lib/actions/care.ts) with
    // two deliberate deltas — the web omits the recurrence roll, and it revalidates
    // its Next cache. Unify both behind a shared /api/care/complete route later so a
    // single code path owns completion + rolling.
    func completeCareTask(_ task: CareTask, homeID: String) async throws {
        let now = ISO8601DateFormatter().string(from: Date())

        try await client.from("care_tasks")
            .update(TaskDone(completed_at: now, completed_by: currentUser?.id.uuidString))
            .eq("id", value: task.id)
            .execute()

        try await client.from("care_events").insert(NewCareEvent(
            home_id: homeID,
            title: "\(task.title) completed",   // matches the web event title for feed parity
            note: nil,
            cost: nil,
            occurred_on: Self.isoDay(Date()),
            item_id: task.itemId
        )).execute()

        // Roll the next occurrence for recurring tasks. Unknown vocabulary → skip.
        if let recurrence = task.recurrence,
           let interval = Self.recurrenceInterval(recurrence),
           let next = Calendar.current.date(byAdding: interval, to: Date()) {
            try await client.from("care_tasks").insert(NewCareTask(
                home_id: homeID,
                item_id: task.itemId,
                title: task.title,
                detail: task.detail,
                priority: task.priority,
                season: task.season,
                due_on: Self.isoDay(next),
                recurrence: recurrence,
                template_slug: nil,   // ponytail: not on the model; pipeline re-seeds template tasks by slug
                source: "user"
            )).execute()
        }
    }

    /// Snooze a task out of the active list and push its due date to `until`.
    func snoozeCareTask(id: String, until: Date) async throws {
        try await client.from("care_tasks")
            .update(TaskSnooze(due_on: Self.isoDay(until)))
            .eq("id", value: id)
            .execute()
    }

    // MARK: - Projects

    func projects(homeID: String) async throws -> [Project] {
        try await client.from("projects")
            .select("id, name, kind, status, progress, summary, budget, spent, cost, value_added, completed_year")
            .eq("home_id", value: homeID)
            .order("updated_at", ascending: false)
            .execute()
            .value
    }


    func addProject(_ project: NewProject) async throws {
        try await client.from("projects").insert(project).execute()
    }

    func updateProject(id: String, _ patch: ProjectUpdate) async throws {
        try await client.from("projects").update(patch).eq("id", value: id).execute()
    }

    func completeProject(id: String) async throws {
        struct Completion: Encodable {
            let kind = "completed"
            let status = "Completed"
            let progress = 100
            let completed_year = Calendar.current.component(.year, from: Date())
        }
        try await client.from("projects").update(Completion()).eq("id", value: id).execute()
    }

    func deleteProject(id: String) async throws {
        try await client.from("projects").delete().eq("id", value: id).execute()
    }

    // MARK: - Insights

    func insights(homeID: String) async throws -> [Insight] {
        try await client.from("insights")
            .select("id, category, headline, detail, stat, action, status, basis, source, confidence, source_extraction_id, dedupe_slug")
            .eq("home_id", value: homeID)
            .eq("status", value: "active")
            .order("created_at", ascending: false)
            .execute()
            .value
    }

    func dismissInsight(id: String) async throws {
        try await client.from("insights")
            .update(["status": "dismissed"])
            .eq("id", value: id)
            .execute()
    }

    // MARK: - Rooms & Files

    func rooms(homeID: String) async throws -> [Room] {
        try await client.from("rooms")
            .select("id, name, slug")
            .eq("home_id", value: homeID)
            .order("name")
            .execute()
            .value
    }

    func files(homeID: String, itemID: String? = nil) async throws -> [HomeFile] {
        var query = client.from("files")
            .select("id, name, type, item_id, created_at, extraction_status, storage_path")
            .eq("home_id", value: homeID)
        if let itemID {
            query = query.eq("item_id", value: itemID)
        }
        return try await query.order("created_at", ascending: false).execute().value
    }

    func warranties(homeID: String, itemID: String) async throws -> [Warranty] {
        try await client.from("warranties")
            .select("id, provider, kind, coverage, starts_on, ends_on, status, source_kind, confidence, notes")
            .eq("home_id", value: homeID).eq("item_id", value: itemID)
            .order("ends_on", ascending: false, nullsFirst: false).execute().value
    }

    func itemCareEvents(homeID: String, itemID: String) async throws -> [CareEvent] {
        try await client.from("care_events")
            .select("id, title, note, cost, occurred_on, item_id")
            .eq("home_id", value: homeID).eq("item_id", value: itemID)
            .order("occurred_on", ascending: false).execute().value
    }

    func contractors(homeID: String) async throws -> [Contractor] {
        try await client.from("contractors")
            .select("id, name, company, phone, email, notes")
            .eq("home_id", value: homeID).order("name").execute().value
    }

    // MARK: - Ingestion (captured receipts / photos)

    /// Upload a downscaled JPEG to the home-files bucket under {home}/receipts/.
    /// Returns the storage path the files row will point at.
    func uploadReceipt(data: Data, homeID: String) async throws -> String {
        let path = "\(homeID)/receipts/\(UUID().uuidString).jpg"
        try await client.storage
            .from("home-files")
            .upload(path, data: data, options: FileOptions(contentType: "image/jpeg"))
        return path
    }

    /// Insert the files row after the object is in Storage. Throws
    /// `IngestError.duplicate` on the (home_id, content_hash) unique violation
    /// so the caller can show a friendly notice instead of an error state.
    func insertFile(
        homeID: String,
        name: String,
        type: String,
        storagePath: String,
        contentHash: String,
        extractionStatus: String,
        metadata: [String: String] = [:]
    ) async throws -> String {
        do {
            let row: InsertedID = try await client.from("files")
                .insert(NewFile(
                    home_id: homeID,
                    item_id: nil,
                    type: type,
                    name: name,
                    storage_path: storagePath,
                    content_hash: contentHash,
                    extraction_status: extractionStatus,
                    meta: metadata
                ))
                .select("id")
                .single()
                .execute()
                .value
            return row.id
        } catch let error as PostgrestError where error.code == "23505" {
            throw IngestError.duplicate
        }
    }

    /// Drop an orphaned Storage object (e.g. a duplicate whose files row never landed).
    func removeFile(path: String) async throws {
        _ = try await client.storage.from("home-files").remove(paths: [path])
    }

    /// Remove both the private object and its metadata row. Storage goes first so
    /// an object-removal failure leaves the still-valid library record intact.
    func deleteFile(_ file: HomeFile) async throws {
        _ = try await client.storage.from("home-files").remove(paths: [file.storagePath])
        try await client.from("files").delete().eq("id", value: file.id).execute()
    }

    func attachFile(id: String, to itemID: String) async throws {
        try await client.from("files")
            .update(["item_id": itemID])
            .eq("id", value: id)
            .execute()
    }

    func classifyAsHomeDocument(id: String) async throws {
        try await client.from("files")
            .update(["type": "document"])
            .eq("id", value: id)
            .execute()
    }

    /// Fire the web extraction pipeline for a freshly-inserted file. Mirrors the
    /// `after(ingestFile)` hook recordUpload runs server-side. Fire-and-forget:
    /// the file's extraction_status is the trail if this never lands.
    func ingestRemote(fileId: String) async throws {
        var request = URLRequest(url: Config.apiBaseURL.appendingPathComponent("api/ingest"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token = await accessToken() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        request.httpBody = try JSONSerialization.data(withJSONObject: ["fileId": fileId])
        let (_, response) = try await URLSession.shared.data(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 202 else {
            throw URLError(.badServerResponse)
        }
    }

    /// Resolve the visible outcome of a photo scan, including queued new-item confirmation.
    func scanOutcome(fileId: String) async throws -> ScanOutcome {
        let file: ScanFileState = try await client.from("files")
            .select("item_id, extraction_status, scope_status:meta->>scope_status, scope_reason:meta->>scope_reason")
            .eq("id", value: fileId).single().execute().value
        if file.extractionStatus == "pending" { return .processing }
        if file.extractionStatus == "failed" { return .failed }
        if let itemID = file.itemId {
            let item: Item = try await client.from("items")
                .select("id, name, category, status, manufacturer, model, serial, installed_on, lifespan_years, summary")
                .eq("id", value: itemID).single().execute().value
            if likelyOutOfScopeItem(item.name) {
                return .outOfScopeMatch(itemID: item.id, itemName: item.name)
            }
            return .matched(itemName: item.name)
        }
        if file.scopeStatus == "out_of_scope" {
            return .outOfScope(reason: file.scopeReason ?? "This does not appear to be a durable household item.")
        }
        let suggestions: [ScanSuggestion] = try await client.from("suggestions")
            .select("id, summary, provenance")
            .eq("target", value: "items")
            .eq("status", value: "pending")
            .eq("provenance->>file_id", value: fileId)
            .limit(1).execute().value
        if let suggestion = suggestions.first { return .needsReview(suggestion) }
        return .noMatch
    }

    func removeScanFile(id: String) async throws {
        let file: HomeFile = try await client.from("files")
            .select("id, name, type, item_id, created_at, extraction_status, storage_path")
            .eq("id", value: id).single().execute().value
        try await deleteFile(file)
    }

    func detachFile(id: String) async throws {
        try await client.from("files")
            .update(["item_id": AnyJSON.null])
            .eq("id", value: id)
            .execute()
    }

    func resolveScanSuggestion(id: String, accept: Bool, removeEvidence: Bool = false, allowOutOfScope: Bool = false) async throws {
        var url = Config.apiBaseURL.appendingPathComponent("api/suggestions/\(id)")
        if !accept && removeEvidence {
            url = url.appending(queryItems: [URLQueryItem(name: "removeEvidence", value: "1")])
        } else if accept && allowOutOfScope {
            url = url.appending(queryItems: [URLQueryItem(name: "allowOutOfScope", value: "1")])
        }
        var request = URLRequest(url: url)
        request.httpMethod = accept ? "POST" : "DELETE"
        if let token = await accessToken() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        let (_, response) = try await URLSession.shared.data(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else {
            throw URLError(.badServerResponse)
        }
    }

    func submitScanFeedback(fileId: String, outcome: String, reason: String? = nil) async throws {
        var request = URLRequest(url: Config.apiBaseURL.appendingPathComponent("api/scan-feedback"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token = await accessToken() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        var body: [String: String] = ["fileId": fileId, "outcome": outcome, "surface": "ios"]
        if let reason { body["reason"] = reason }
        request.httpBody = try JSONEncoder().encode(body)
        let (_, response) = try await URLSession.shared.data(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else {
            throw URLError(.badServerResponse)
        }
    }

    // MARK: - Web API auth

    /// Current session JWT for calling the Vercel API routes (Ask, ingest).
    func accessToken() async -> String? {
        try? await client.auth.session.accessToken
    }

    // MARK: - Service coordination

    func createServiceCase(_ intake: ServiceIntakeRequest) async throws -> ServiceIntakeResponse {
        var request = URLRequest(url: Config.apiBaseURL.appendingPathComponent("api/service-cases"))
        request.httpMethod = "POST"
        request.timeoutInterval = 20
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        guard let token = await accessToken() else { throw ServiceRequestError.signedOut }
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONEncoder().encode(intake)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw ServiceRequestError.unavailable }
        guard http.statusCode == 200 else {
            let message = (try? JSONDecoder().decode(ServiceAPIError.self, from: data).error)
            throw ServiceRequestError.server(message ?? "We could not save the repair request.")
        }
        return try JSONDecoder().decode(ServiceIntakeResponse.self, from: data)
    }

    func serviceCase(id: String) async throws -> ServiceCaseDetail {
        try await serviceAPI(path: "api/service-cases/\(id)", method: "GET", body: Optional<String>.none)
    }

    func activeServiceCase(itemId: String) async throws -> ServiceCase? {
        var components = URLComponents(
            url: Config.apiBaseURL.appendingPathComponent("api/service-cases"),
            resolvingAgainstBaseURL: false
        )
        components?.queryItems = [URLQueryItem(name: "itemId", value: itemId)]
        guard let url = components?.url else { throw ServiceRequestError.unavailable }
        let response: ActiveServiceCaseResponse = try await serviceAPI(
            url: url, method: "GET", body: Optional<String>.none
        )
        return response.case
    }

    func bookServiceOffer(caseId: String, offerId: String) async throws -> ServiceBookingResponse {
        try await serviceAPI(path: "api/service-cases/\(caseId)/book", method: "POST", body: ["offerId": offerId])
    }

    func recordCalendarEvent(caseId: String, identifier: String) async throws {
        let _: CalendarRecordResponse = try await serviceAPI(path: "api/service-cases/\(caseId)/calendar", method: "POST", body: ["identifier": identifier])
    }

    func recordServiceOutcome(caseId: String, outcome: ServiceOutcomeRequest) async throws -> ServiceOutcome {
        try await serviceAPI(path: "api/service-cases/\(caseId)/outcome", method: "POST", body: outcome)
    }

    func reportServiceException(caseId: String, kind: String, note: String) async throws {
        let _: CalendarRecordResponse = try await serviceAPI(path: "api/service-cases/\(caseId)/exception", method: "POST", body: ["kind": kind, "note": note])
    }

    func submitMonetizationResponse(response: String, billingPeriod: String) async throws {
        let _: CalendarRecordResponse = try await serviceAPI(
            path: "api/membership/research",
            method: "POST",
            body: ["response": response, "billingPeriod": billingPeriod]
        )
    }

    private func serviceAPI<Response: Decodable, Body: Encodable>(path: String, method: String, body: Body?) async throws -> Response {
        try await serviceAPI(url: Config.apiBaseURL.appendingPathComponent(path), method: method, body: body)
    }

    private func serviceAPI<Response: Decodable, Body: Encodable>(url: URL, method: String, body: Body?) async throws -> Response {
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 20
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        guard let token = await accessToken() else { throw ServiceRequestError.signedOut }
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        if let body { request.httpBody = try JSONEncoder().encode(body) }
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw ServiceRequestError.unavailable }
        guard (200..<300).contains(http.statusCode) else {
            let message = (try? JSONDecoder().decode(ServiceAPIError.self, from: data).error)
            throw ServiceRequestError.server(message ?? "Repair help is temporarily unavailable.")
        }
        return try JSONDecoder().decode(Response.self, from: data)
    }

    // MARK: - Address autocomplete

    /// Best-effort address suggestions from the web app's OSM/Nominatim-backed
    /// route. Returns [] on ANY failure (offline, 401, non-200, decode) — the
    /// feature only augments manual entry, so it must never surface an error.
    func searchAddresses(query: String) async -> [AddressSuggestion] {
        guard var components = URLComponents(
            url: Config.apiBaseURL.appendingPathComponent("api/address-search"),
            resolvingAgainstBaseURL: false
        ) else { return [] }
        components.queryItems = [URLQueryItem(name: "q", value: query)]
        guard let url = components.url else { return [] }

        var request = URLRequest(url: url, timeoutInterval: 4)
        if let token = await accessToken() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard (response as? HTTPURLResponse)?.statusCode == 200 else { return [] }
            return try JSONDecoder().decode(AddressSearchResponse.self, from: data).suggestions
        } catch {
            return []
        }
    }

    // MARK: - Helpers

    private struct TaskDone: Encodable {
        let status = "done"
        let completed_at: String
        let completed_by: String?
    }

    private struct ServiceAPIError: Decodable { let error: String }
    private struct CalendarRecordResponse: Decodable { let ok: Bool }

    private struct TaskSnooze: Encodable {
        let status = "snoozed"
        let due_on: String
    }

    /// Postgres `date` wants a plain calendar day; POSIX locale keeps it stable.
    static func isoDay(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }

    /// Maps the web's recurrence vocabulary (lib/care-data.ts) to a calendar
    /// interval. Order matters: "twice yearly" must match before "yearly".
    static func recurrenceInterval(_ recurrence: String) -> DateComponents? {
        let r = recurrence.lowercased()
        if r.contains("every 3 months") || r.contains("quarterly") { return DateComponents(month: 3) }
        if r.contains("twice yearly") || r.contains("semiannual")
            || r.contains("semi-annual") || r.contains("biannual") { return DateComponents(month: 6) }
        if r.contains("monthly") { return DateComponents(month: 1) }
        if r.contains("yearly") || r.contains("annual") { return DateComponents(year: 1) }
        return nil
    }
}

enum ServiceRequestError: LocalizedError {
    case signedOut
    case unavailable
    case server(String)

    var errorDescription: String? {
        switch self {
        case .signedOut: "Sign in again to request repair help."
        case .unavailable: "GatheredOS could not reach the service request. Check your connection and try again."
        case .server(let message): message
        }
    }
}
