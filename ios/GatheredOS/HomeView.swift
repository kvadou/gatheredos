import SwiftUI

struct HomeView: View {
    @Environment(SupabaseService.self) private var supabase

    @State private var greetingName = ""
    @State private var home: Home?
    @State private var systems = 0
    @State private var openTasks = 0
    @State private var itemsTotal = 0

    // Worth Knowing + care digest, loaded alongside the stat counts.
    @State private var insights: [Insight] = []
    @State private var tasks: [CareTask] = []
    @State private var events: [CareEvent] = []
    @State private var items: [Item] = []
    @State private var dismissTick = 0
    @State private var showSettings = false
    @State private var loadError: String?
    @State private var dismissError: String?

    var body: some View {
        NavigationStack {
            ZStack {
                Color.homeCanvas.ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: Theme.Spacing.xLarge) {
                        greeting
                        if let loadError {
                            Label(loadError, systemImage: "wifi.exclamationmark")
                                .font(.footnote)
                                .foregroundStyle(.red)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(12)
                                .background(Color.red.opacity(0.10), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                                .accessibilityLabel("Home update failed. \(loadError)")
                        }
                        stats
                        worthKnowingSection
                        weekendSection
                        comingUpSection
                        activitySection
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, Theme.Spacing.small)
                    .padding(.bottom, Theme.Spacing.xLarge)
                    .adaptiveContentWidth(Theme.Layout.dashboardMaxWidth, alignment: .leading)
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showSettings = true
                    } label: {
                        Image(systemName: "person.crop.circle")
                    }
                    .tint(Color.homeNavy)
                    .accessibilityLabel("Settings")
                }
            }
            .sheet(isPresented: $showSettings) { SettingsView() }
            .navigationDestination(for: HomeDestination.self) { destination in
                HomeDestinationView(destination: destination, items: items, tasks: tasks, events: events) { await load() }
            }
            .alert("Couldn't dismiss insight", isPresented: Binding(get: { dismissError != nil }, set: { if !$0 { dismissError = nil } })) {
                Button("OK") { dismissError = nil }
            } message: { Text(dismissError ?? "Please try again.") }
            .task { await load() }
            .refreshable { await load() }
        }
    }

    private var greeting: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(timeGreeting + (greetingName.isEmpty ? "" : ", \(greetingName)"))
                .font(.largeTitle).fontDesign(.serif).fontWeight(.medium)
                .foregroundStyle(Color.homeInk)
            if let home {
                Label(home.name, systemImage: "house.fill")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var stats: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("At a glance")
                .font(.headline)
                .foregroundStyle(Color.homeInk)
            ViewThatFits(in: .horizontal) {
                HStack(spacing: Theme.Spacing.medium) {
                    statLink(.systems, value: systems, label: "Systems", icon: "gearshape.2.fill", hint: "Shows your home systems")
                    statLink(.tasks, value: openTasks, label: "Open Tasks", icon: "checklist", hint: "Shows open care tasks")
                    statLink(.items, value: itemsTotal, label: "Items", icon: "square.grid.2x2.fill", hint: "Shows everything recorded for your home")
                }
                VStack(spacing: 0) {
                    statRowLink(.systems, value: systems, label: "Systems", icon: "gearshape.2.fill", hint: "Shows your home systems")
                    Divider()
                    statRowLink(.tasks, value: openTasks, label: "Open Tasks", icon: "checklist", hint: "Shows open care tasks")
                    Divider()
                    statRowLink(.items, value: itemsTotal, label: "Items", icon: "square.grid.2x2.fill", hint: "Shows everything recorded for your home")
                }
                .padding(.horizontal, Theme.Spacing.large)
                .padding(.vertical, Theme.Spacing.small)
                .background(Color.homeSurface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
        }
    }

    private func statLink(_ destination: HomeDestination, value: Int, label: String, icon: String, hint: String) -> some View {
        NavigationLink(value: destination) { StatTile(value: value, label: label, icon: icon) }
            .buttonStyle(.plain).accessibilityHint(hint)
    }

    private func statRowLink(_ destination: HomeDestination, value: Int, label: String, icon: String, hint: String) -> some View {
        NavigationLink(value: destination) { StatRow(value: value, label: label, icon: icon) }
            .buttonStyle(.plain).accessibilityHint(hint)
    }

    // MARK: - Worth knowing

    // Horizontal snapping carousel: reads more native for editorial "spotlight"
    // cards than a stacked list, and mirrors the web's rotating hero. Each card
    // dismisses via the corner x (swipe left/right just pages between insights).
    @ViewBuilder private var worthKnowingSection: some View {
        if !insights.isEmpty {
            VStack(alignment: .leading, spacing: 14) {
                sectionHeader("Worth knowing")
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 14) {
                        ForEach(insights) { insight in
                            NavigationLink(value: HomeDestination.insight(insight)) { insightCard(insight) }
                                .buttonStyle(.plain)
                                .containerRelativeFrame(.horizontal)
                        }
                    }
                    .scrollTargetLayout()
                }
                .scrollTargetBehavior(.viewAligned)
                .scrollClipDisabled()
                .sensoryFeedback(.impact, trigger: dismissTick)
            }
        }
    }

    private func insightCard(_ insight: Insight) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: insightIcon(insight.category))
                    .font(.title3)
                    .foregroundStyle(Color.homeNavy)
                if let category = insight.category, !category.isBlank {
                    Text(category.capitalized)
                        .font(.caption).fontWeight(.medium)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.trailing, 28)   // clears the dismiss button overlay
            if let stat = insight.stat, !stat.isBlank {
                Text(stat)
                    .font(.largeTitle).fontDesign(.serif).fontWeight(.medium)
                    .foregroundStyle(Color.homeNavy)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Text(insight.headline)
                .font(.title3).fontDesign(.serif)
                .foregroundStyle(Color.homeInk)
                .fixedSize(horizontal: false, vertical: true)
            if let detail = insight.detail, !detail.isBlank {
                Text(detail)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.homeSurface, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(alignment: .topTrailing) {
            Button {
                dismiss(insight)
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.title3)
                    .foregroundStyle(.secondary)
                    .frame(width: 44, height: 44)   // 44pt tap target
                    .contentShape(Rectangle())
            }
            .accessibilityLabel("Dismiss")
        }
    }

    private func dismiss(_ insight: Insight) {
        withAnimation(.spring) {
            insights.removeAll { $0.id == insight.id }
        }
        dismissTick += 1
        Task {
            do { try await supabase.dismissInsight(id: insight.id) }
            catch {
                withAnimation(.easeOut(duration: 0.2)) { insights.insert(insight, at: 0) }
                dismissError = error.localizedDescription
            }
        }
    }

    // MARK: - This weekend

    @ViewBuilder private var weekendSection: some View {
        let picks = weekendTasks
        if !picks.isEmpty {
            VStack(alignment: .leading, spacing: 14) {
                sectionHeader("This weekend")
                rowsCard(picks) { task in NavigationLink(value: HomeDestination.task(task)) { weekendRow(task) }.buttonStyle(.plain) }
            }
        }
    }

    // ponytail: web ranks "This weekend" by priority + overdue-ness (weekend-priorities).
    // Same intent computed in-view: overdue first, then highest priority, then soonest due.
    private var weekendTasks: [CareTask] {
        let ranked = tasks.sorted { a, b in
            let ao = Self.isOverdue(a.dueOn), bo = Self.isOverdue(b.dueOn)
            if ao != bo { return ao }
            let ap = (a.priority == "highest"), bp = (b.priority == "highest")
            if ap != bp { return ap }
            return Self.dueKey(a.dueOn) < Self.dueKey(b.dueOn)
        }
        return Array(ranked.prefix(3))
    }

    private func weekendRow(_ task: CareTask) -> some View {
        let overdue = Self.isOverdue(task.dueOn)
        let phrase = Self.duePhrase(task.dueOn)
        return HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                if task.priority == "highest" {
                    Label("Highest impact", systemImage: "star.fill")
                        .font(.caption2).fontWeight(.medium)
                        .foregroundStyle(Color.homeNavy)
                }
                Text(task.title)
                    .font(.body).fontWeight(.medium)
                    .foregroundStyle(Color.homeInk)
                    .fixedSize(horizontal: false, vertical: true)
                if !phrase.isEmpty {
                    Text(phrase)
                        .font(.subheadline)
                        .foregroundStyle(overdue ? Color.red : .secondary)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .frame(minHeight: 44)
        .contentShape(Rectangle())
    }

    // MARK: - Coming up

    @ViewBuilder private var comingUpSection: some View {
        let picks = comingUp
        if !picks.isEmpty {
            VStack(alignment: .leading, spacing: 14) {
                sectionHeader("Coming up")
                rowsCard(picks) { task in NavigationLink(value: HomeDestination.task(task)) { comingUpRow(task) }.buttonStyle(.plain) }
            }
        }
    }

    // Dated tasks in the next 60 days, minus whatever the weekend list already shows.
    private var comingUp: [CareTask] {
        let cal = Calendar.current
        let today = cal.startOfDay(for: Date())
        guard let horizon = cal.date(byAdding: .day, value: 60, to: today) else { return [] }
        let shown = Set(weekendTasks.map(\.id))
        let dated = tasks.filter { task in
            guard let d = Self.parseDay(task.dueOn) else { return false }
            let day = cal.startOfDay(for: d)
            return day >= today && day <= horizon && !shown.contains(task.id)
        }
        .sorted { Self.dueKey($0.dueOn) < Self.dueKey($1.dueOn) }
        return Array(dated.prefix(5))
    }

    private func comingUpRow(_ task: CareTask) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "calendar")
                .font(.callout)
                .foregroundStyle(Color.homeNavy)
                .frame(width: 24)
            Text(task.title)
                .font(.body)
                .foregroundStyle(Color.homeInk)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 8)
            Text(Self.duePhrase(task.dueOn))
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .frame(minHeight: 44)
        .contentShape(Rectangle())
    }

    // MARK: - Recent activity

    // ponytail: shows care_events only. In this app completing a task inserts a
    // care_event (SupabaseService.completeCareTask), so the feed already captures
    // completions — no need to merge done tasks like the web buildActivity does.
    @ViewBuilder private var activitySection: some View {
        let recent = Array(events.prefix(5))
        if !recent.isEmpty {
            VStack(alignment: .leading, spacing: 14) {
                sectionHeader("Recent activity")
                rowsCard(recent) { event in NavigationLink(value: HomeDestination.event(event)) { activityRow(event) }.buttonStyle(.plain) }
            }
        }
    }

    private func activityRow(_ event: CareEvent) -> some View {
        HStack(spacing: 12) {
            Image(systemName: event.cost != nil ? "wrench.and.screwdriver.fill" : "checkmark.circle.fill")
                .font(.callout)
                .foregroundStyle(Color.homeNavy)
                .frame(width: 24)
            VStack(alignment: .leading, spacing: 2) {
                Text(event.title)
                    .font(.body)
                    .foregroundStyle(Color.homeInk)
                    .fixedSize(horizontal: false, vertical: true)
                Text(Self.relativeDay(event.occurredOn))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 8)
            if let cost = event.cost {
                Text(cost.formatted(.currency(code: "USD").precision(.fractionLength(0))))
                    .font(.subheadline).fontWeight(.medium).monospacedDigit()
                    .foregroundStyle(Color.homeInk)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .frame(minHeight: 44)
        .contentShape(Rectangle())
    }

    // MARK: - Shared section chrome

    private func sectionHeader(_ title: String) -> some View {
        Text(title)
            .font(.headline)
            .foregroundStyle(Color.homeInk)
    }

    // A grouped surface card with hairline-separated rows. Small counts only
    // (<=5), so List's overhead isn't worth it inside this scroll composition.
    // ponytail: rows are plain (non-interactive) in v1; cross-tab deep links
    // (row -> Care/Library detail) are deferred until tab navigation is wired.
    private func rowsCard<T: Identifiable, Row: View>(
        _ items: [T],
        @ViewBuilder row: @escaping (T) -> Row
    ) -> some View {
        VStack(spacing: 0) {
            ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                if index > 0 {
                    Divider().padding(.leading, 16)
                }
                row(item)
            }
        }
        .background(Color.homeSurface, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    // MARK: - Data

    private func load() async {
        loadError = nil
        do {
        async let profileTask = supabase.profile()
        async let homeTask = supabase.firstHome()
        let profile = try await profileTask
        let loadedHome = try await homeTask

        greetingName = displayName(profile)
        home = loadedHome

        guard let id = loadedHome?.id else { return }
        async let s = supabase.count("items", homeID: id, filters: [("category", "system")])
        async let o = supabase.count("care_tasks", homeID: id, filters: [("status", "open")])
        async let t = supabase.count("items", homeID: id)
        async let ins = supabase.insights(homeID: id)
        async let tks = supabase.careTasks(homeID: id)
        async let evs = supabase.careEvents(homeID: id, limit: 5)
        async let itemRows = supabase.items(homeID: id)

        let sVal = try await s
        let oVal = try await o
        let tVal = try await t
        let insVal = try await ins
        let tksVal = try await tks
        let evsVal = try await evs
        let itemValues = try await itemRows
        withAnimation(.spring) {
            systems = sVal
            openTasks = oVal
            itemsTotal = tVal
            insights = insVal
            tasks = tksVal
            events = evsVal
            items = itemValues
        }
        } catch { loadError = "Couldn't refresh your home. Pull down to try again." }
    }

    private func displayName(_ profile: Profile?) -> String {
        if let name = profile?.name, !name.isBlank { return name }
        if let email = profile?.email { return String(email.prefix(while: { $0 != "@" })) }
        return ""
    }

    private var timeGreeting: String {
        switch Calendar.current.component(.hour, from: Date()) {
        case 5..<12: return "Good morning"
        case 12..<17: return "Good afternoon"
        default: return "Good evening"
        }
    }

    // MARK: - Date / icon helpers

    private static let dayParser: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    /// Parses a Postgres `date` ("yyyy-MM-dd", or a timestamp's leading day).
    static func parseDay(_ iso: String?) -> Date? {
        guard let iso else { return nil }
        return dayParser.date(from: String(iso.prefix(10)))
    }

    /// Sort key for a due date; undated tasks sort last.
    static func dueKey(_ iso: String?) -> Date { parseDay(iso) ?? .distantFuture }

    static func isOverdue(_ iso: String?) -> Bool {
        guard let d = parseDay(iso) else { return false }
        let cal = Calendar.current
        return cal.startOfDay(for: d) < cal.startOfDay(for: Date())
    }

    /// "Overdue by 2 days" / "Due today" / "In 4 days" / "Jul 20".
    static func duePhrase(_ iso: String?) -> String {
        guard let d = parseDay(iso) else { return "" }
        let cal = Calendar.current
        let days = cal.dateComponents([.day], from: cal.startOfDay(for: Date()), to: cal.startOfDay(for: d)).day ?? 0
        switch days {
        case ..<0: return days == -1 ? "Overdue by 1 day" : "Overdue by \(-days) days"
        case 0: return "Due today"
        case 1: return "Due tomorrow"
        case 2..<7: return "In \(days) days"
        default: return shortDate(d)
        }
    }

    /// "Today" / "Yesterday" / "3 days ago" / "Last week" / "Jul 3" — mirrors
    /// the web relativeWhen calm tone for the activity feed.
    static func relativeDay(_ iso: String?) -> String {
        guard let d = parseDay(iso) else { return "" }
        let cal = Calendar.current
        let days = cal.dateComponents([.day], from: cal.startOfDay(for: d), to: cal.startOfDay(for: Date())).day ?? 0
        switch days {
        case ..<0: return shortDate(d)
        case 0: return "Today"
        case 1: return "Yesterday"
        case 2..<7: return "\(days) days ago"
        case 7..<14: return "Last week"
        default: return shortDate(d)
        }
    }

    private static func shortDate(_ d: Date) -> String {
        d.formatted(.dateTime.month(.abbreviated).day())
    }

    // insights.category (lowercase) → SF Symbol, mirroring the web icon map.
    private func insightIcon(_ category: String?) -> String {
        switch category?.lowercased() {
        case "hvac": return "wind"
        case "warranty": return "checkmark.shield.fill"
        case "maintenance": return "wrench.and.screwdriver.fill"
        case "cost": return "creditcard.fill"
        case "spending": return "chart.line.uptrend.xyaxis"
        case "wealth", "equity": return "dollarsign.circle.fill"
        case "longevity": return "house.fill"
        case "land": return "mountain.2.fill"
        case "energy": return "sun.max.fill"
        case "water": return "drop.fill"
        case "seasonal": return "leaf.fill"
        case "trends": return "timer"
        case "paint": return "paintbrush.fill"
        default: return "sparkles"
        }
    }
}
