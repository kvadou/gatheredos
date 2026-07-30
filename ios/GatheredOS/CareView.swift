import SwiftUI
import UIKit
import StoreKit

// The Care tab: what the home needs now, what's coming, and everything already
// handled. Mirrors the web /care surface — same buckets, same calm date tone,
// same "your home thanks you" voice — over the SupabaseService care queries.
struct CareView: View {
    @Environment(SupabaseService.self) private var supabase

    @State private var tasks: [CareTask] = []       // active: open + snoozed
    @State private var doneTasks: [CareTask] = []
    @State private var events: [CareEvent] = []
    @State private var homeID: String?
    @State private var loading = true
    @State private var loadError: String?
    @State private var completeTick = 0
    @State private var snoozeTick = 0
    @State private var entry: CareEntryKind?
    @State private var actionError: String?

    var body: some View {
        NavigationStack {
            ZStack {
                Color.homeCanvas.ignoresSafeArea()
                content.adaptiveContentWidth(Theme.Layout.listMaxWidth)
            }
            .navigationTitle("Care")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button { entry = .task } label: { Label("Add task", systemImage: "checklist") }
                        Button { entry = .maintenance } label: { Label("Record maintenance", systemImage: "wrench.and.screwdriver") }
                    } label: { Image(systemName: "plus") }
                    .accessibilityLabel("Add to Care")
                    .disabled(homeID == nil)
                }
            }
            .sheet(item: $entry) { kind in
                if let homeID { CareEntryView(kind: kind, homeID: homeID) { await reload() } }
            }
            .alert("Care couldn't be updated", isPresented: Binding(get: { actionError != nil }, set: { if !$0 { actionError = nil } })) {
                Button("OK") { actionError = nil }
            } message: { Text(actionError ?? "Please try again.") }
            .task { await reload() }
            .refreshable { await reload() }
            .sensoryFeedback(.success, trigger: completeTick)
            .sensoryFeedback(.impact(weight: .light), trigger: snoozeTick)
        }
    }

    // MARK: - Content states

    @ViewBuilder private var content: some View {
        if loading {
            ProgressView().tint(Color.homeNavy)
        } else if let loadError {
            ContentUnavailableView("Couldn't load Care", systemImage: "exclamationmark.triangle",
                                   description: Text(loadError))
        } else if tasks.isEmpty && doneTasks.isEmpty && events.isEmpty {
            ContentUnavailableView("All caught up", systemImage: "checkmark.seal",
                                   description: Text("Nothing needs your attention right now."))
        } else {
            careList
        }
    }

    private var careList: some View {
        List {
            if activeEmpty {
                Section {
                    HStack(spacing: 10) {
                        Image(systemName: "checkmark.seal.fill").foregroundStyle(.green)
                        Text("You're all caught up. Nothing needs attention right now.")
                            .font(.subheadline).foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 2)
                    .listRowBackground(Color.homeSurface)
                }
            }

            if !overdue.isEmpty {
                Section {
                    ForEach(overdue) { taskRow($0) }
                } header: {
                    Label("Overdue", systemImage: "exclamationmark.triangle.fill")
                        .foregroundStyle(.red)
                }
            }

            plainSection("Due soon", dueSoon)
            plainSection("Upcoming", upcoming)
            plainSection("Seasonal & flexible", seasonal)

            if !doneTasks.isEmpty {
                Section {
                    DisclosureGroup {
                        ForEach(doneTasks) { task in
                            CompletedRow(task: task)
                                .listRowBackground(Color.homeSurface)
                        }
                    } label: {
                        Label("Recently completed", systemImage: "checkmark.circle")
                            .font(.subheadline).foregroundStyle(Color.homeInk)
                    }
                    .tint(Color.homeNavy)
                    .listRowBackground(Color.homeSurface)
                }
            }

            if !events.isEmpty {
                Section("Service history") {
                    ForEach(Array(events.prefix(10))) { event in
                        ServiceEventRow(event: event)
                            .listRowBackground(Color.homeSurface)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .listSectionSpacing(.compact)
        .scrollContentBackground(.hidden)
        .contentMargins(.top, 0, for: .scrollContent)
        .contentMargins(.bottom, Theme.Spacing.xLarge, for: .scrollContent)
    }

    @ViewBuilder private func plainSection(_ title: String, _ items: [CareTask]) -> some View {
        if !items.isEmpty {
            Section(title) {
                ForEach(items) { taskRow($0) }
            }
        }
    }

    @ViewBuilder private func taskRow(_ task: CareTask) -> some View {
        let due = dueLabel(task)
        NavigationLink {
            CareTaskDetailView(task: task, onChange: { await reload() })
        } label: {
            CareTaskRow(task: task, dueText: due?.text, dueUrgent: due?.urgent ?? false)
        }
            .listRowBackground(Color.homeSurface)
            .swipeActions(edge: .leading, allowsFullSwipe: true) {
                Button { complete(task) } label: { Label("Complete", systemImage: "checkmark") }
                    .tint(.green)
            }
            .swipeActions(edge: .trailing) {
                Button { snooze(task) } label: { Label("Snooze", systemImage: "clock") }
                    .tint(.orange)
            }
    }

    // MARK: - Buckets (careTasks arrives pre-sorted soonest-due first, undated last)

    private var today: Date { Calendar.current.startOfDay(for: Date()) }
    private var soonEnd: Date { Calendar.current.date(byAdding: .day, value: 30, to: today) ?? today }

    private var overdue: [CareTask] {
        tasks.filter { guard let d = Self.parseDay($0.dueOn) else { return false }; return d < today }
    }
    private var dueSoon: [CareTask] {
        tasks.filter {
            guard let d = Self.parseDay($0.dueOn) else { return false }
            return d >= today && d <= soonEnd
        }
    }
    private var upcoming: [CareTask] {
        tasks.filter { guard let d = Self.parseDay($0.dueOn) else { return false }; return d > soonEnd }
    }
    private var seasonal: [CareTask] {
        tasks.filter { Self.parseDay($0.dueOn) == nil }
    }
    private var activeEmpty: Bool {
        overdue.isEmpty && dueSoon.isEmpty && upcoming.isEmpty && seasonal.isEmpty
    }

    /// Natural, low-precision due text + whether it should read as urgent (red).
    private func dueLabel(_ task: CareTask) -> (text: String, urgent: Bool)? {
        guard let d = Self.parseDay(task.dueOn) else { return nil }
        let days = Calendar.current.dateComponents([.day], from: today, to: d).day ?? 0
        switch days {
        case ..<0:
            let n = -days
            return (n == 1 ? "1 day overdue" : "\(n) days overdue", true)
        case 0: return ("Due today", true)
        case 1: return ("Due tomorrow", false)
        case 2...6: return ("Due in \(days) days", false)
        default: return ("Due \(Self.dueDateText(d))", false)
        }
    }

    // MARK: - Actions

    private func complete(_ task: CareTask) {
        guard let homeID else { return }
        completeTick += 1
        let previous = tasks
        tasks.removeAll { $0.id == task.id }
        Task {
            do {
                try await supabase.completeCareTask(task, homeID: homeID)
                await reload()
            } catch {
                tasks = previous
                actionError = error.localizedDescription
            }
        }
    }

    private func snooze(_ task: CareTask) {
        snoozeTick += 1
        let until = Calendar.current.date(byAdding: .day, value: 7, to: Date()) ?? Date()
        Task {
            do {
                try await supabase.snoozeCareTask(id: task.id, until: until)
                await reload()
            } catch {
                actionError = error.localizedDescription
            }
        }
    }

    // MARK: - Load

    private func reload() async {
        loading = tasks.isEmpty && doneTasks.isEmpty && events.isEmpty
        loadError = nil
        do {
            guard let home = try await supabase.firstHome() else {
                homeID = nil; tasks = []; doneTasks = []; events = []; loading = false; return
            }
            homeID = home.id
            tasks = try await supabase.careTasks(homeID: home.id)
            doneTasks = try await supabase.doneCareTasks(homeID: home.id)
            events = try await supabase.careEvents(homeID: home.id)
        } catch {
            loadError = error.localizedDescription
        }
        loading = false
    }

    // MARK: - Date helpers

    /// Postgres `date` day, parsed to a stable calendar day for comparison.
    private static let dayParser: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()
    static func parseDay(_ s: String?) -> Date? {
        guard let s, let d = dayParser.date(from: s) else { return nil }
        return Calendar.current.startOfDay(for: d)
    }

    /// "Aug 12" this year, "Aug 2026" otherwise — the calm date tone Care uses.
    private static func dueDateText(_ d: Date) -> String {
        let cal = Calendar.current
        let f = DateFormatter()
        f.locale = .autoupdatingCurrent
        f.setLocalizedDateFormatFromTemplate(
            cal.component(.year, from: d) == cal.component(.year, from: Date()) ? "MMMd" : "MMMyyyy"
        )
        return f.string(from: d)
    }

    /// "Mar 2026" from either a plain day or an ISO timestamp — parses the leading
    /// yyyy-MM so timezone/fractional-second variance never matters for display.
    private static let ymParser: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM"
        return f
    }()
    private static let monthYearFmt: DateFormatter = {
        let f = DateFormatter()
        f.locale = .autoupdatingCurrent
        f.setLocalizedDateFormatFromTemplate("MMMyyyy")
        return f
    }()
    static func monthYear(_ s: String?) -> String? {
        guard let s, s.count >= 7, let d = ymParser.date(from: String(s.prefix(7))) else { return nil }
        return monthYearFmt.string(from: d)
    }
}

struct CareTaskDetailView: View {
    @Environment(SupabaseService.self) private var supabase
    @Environment(\.dismiss) private var dismiss
    @Environment(\.requestReview) private var requestReview
    let task: CareTask
    let onChange: () async -> Void
    @State private var working = false
    @State private var error: String?

    var body: some View {
        List {
            Section {
                Text(task.title).font(.title2).fontDesign(.serif).foregroundStyle(Color.homeInk)
                if let detail = task.detail, !detail.isBlank { Text(detail).foregroundStyle(Color.homeInk) }
            }
            Section("Plan") {
                LabeledContent("Timing", value: HomeView.duePhrase(task.dueOn).isEmpty ? "Flexible" : HomeView.duePhrase(task.dueOn))
                if let priority = task.priority, !priority.isBlank { LabeledContent("Priority", value: priority.capitalized) }
                if let season = task.season, !season.isBlank { LabeledContent("Season", value: season.capitalized) }
                if let recurrence = task.recurrence, !recurrence.isBlank { LabeledContent("Repeats", value: recurrence.capitalized) }
            }
            Section("Why this matters") {
                Text(task.detail?.isBlank == false ? "This guidance is tied to the care record saved for your home." : "GatheredOS has the task name and schedule, but not enough supporting information to make a stronger claim yet.")
                    .font(.subheadline).foregroundStyle(.secondary)
            }
            Section("Intelligence basis") {
                LabeledContent("Origin", value: task.source == "user" ? "Entered by your household" : "Generated from home context")
                Text(task.itemId == nil ? "Link this task to the exact appliance or system to unlock model-specific instructions, documents, and service history." : "This task is linked to a saved home item. Add its manual and latest service record for stronger guidance.")
                    .font(.subheadline).foregroundStyle(.secondary)
            }
            Section {
                Button { Task { await complete() } } label: { Label("Mark Complete", systemImage: "checkmark.circle.fill") }
                    .disabled(working)
                Button { Task { await snooze() } } label: { Label("Remind Me in One Week", systemImage: "clock.fill") }
                    .disabled(working)
            }
        }
        .scrollContentBackground(.hidden).background(Color.homeCanvas)
        .adaptiveContentWidth(Theme.Layout.listMaxWidth)
        .navigationTitle("Care Task").navigationBarTitleDisplayMode(.inline)
        .alert("Care couldn't be updated", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) { Button("OK") { error = nil } } message: { Text(error ?? "Please try again.") }
    }

    private func complete() async {
        guard let home = try? await supabase.firstHome() else { return }
        working = true
        do {
            try await supabase.completeCareTask(task, homeID: home.id)
            await onChange()
            if ReviewEligibility.recordSuccess() { requestReview() }
            dismiss()
        }
        catch { self.error = error.localizedDescription; working = false }
    }

    private func snooze() async {
        working = true
        let date = Calendar.current.date(byAdding: .day, value: 7, to: Date()) ?? Date()
        do { try await supabase.snoozeCareTask(id: task.id, until: date); await onChange(); dismiss() }
        catch { self.error = error.localizedDescription; working = false }
    }
}

// MARK: - Rows

private struct CareTaskRow: View {
    let task: CareTask
    let dueText: String?
    let dueUrgent: Bool

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Circle()
                .fill(priorityColor)
                .frame(width: 10, height: 10)
                .padding(.top, 6)
                .accessibilityLabel("\(priorityLabel) priority")
            VStack(alignment: .leading, spacing: 4) {
                Text(task.title)
                    .font(.headline)
                    .foregroundStyle(Color.homeInk)
                if let detail = task.detail, !detail.isBlank {
                    Text(detail)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                HStack(spacing: 8) {
                    if let dueText {
                        Label(dueText, systemImage: "calendar")
                            .font(.caption)
                            .foregroundStyle(dueUrgent ? Color.red : Color.secondary)
                    }
                    if let season = task.season, !season.isBlank {
                        SeasonChip(season: season)
                    }
                }
                .padding(.top, 1)
            }
        }
        .padding(.vertical, 4)
    }

    // Traffic-light ramp over the web's priority vocabulary — system tints only.
    private var priorityColor: Color {
        switch (task.priority ?? "").lowercased() {
        case "highest": return .red
        case "high": return .orange
        case "medium": return .yellow
        case "low": return .green
        default: return Color(.tertiaryLabel)
        }
    }
    private var priorityLabel: String { task.priority?.capitalized ?? "Normal" }
}

private struct SeasonChip: View {
    let season: String

    var body: some View {
        Label(season.capitalized, systemImage: icon)
            .font(.caption2)
            .foregroundStyle(.secondary)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(Color(.tertiarySystemFill), in: Capsule())
    }

    private var icon: String {
        switch season.lowercased() {
        case "spring": return "leaf.fill"
        case "summer": return "sun.max.fill"
        case "fall", "autumn": return "wind"
        case "winter": return "snowflake"
        default: return "calendar"
        }
    }
}

private struct CompletedRow: View {
    let task: CareTask

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(.green)
            VStack(alignment: .leading, spacing: 2) {
                Text(task.title)
                    .font(.subheadline)
                    .foregroundStyle(Color.homeInk)
                if let when = CareView.monthYear(task.completedAt) {
                    Text(when)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(.vertical, 2)
    }
}

private struct ServiceEventRow: View {
    let event: CareEvent

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            // Wrench when it cost money, doc otherwise — matches web care-activity.
            Image(systemName: event.cost != nil ? "wrench.and.screwdriver.fill" : "doc.text.fill")
                .foregroundStyle(Color.homeNavy)
                .frame(width: 24)
            VStack(alignment: .leading, spacing: 2) {
                Text(event.title)
                    .font(.subheadline)
                    .foregroundStyle(Color.homeInk)
                if let when = CareView.monthYear(event.occurredOn) {
                    Text(when)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 8)
            if let cost = event.cost {
                Text(cost.formatted(.currency(code: "USD")))
                    .font(.subheadline)
                    .monospacedDigit()
                    .foregroundStyle(Color.homeInk)
            }
        }
        .padding(.vertical, 2)
    }
}
