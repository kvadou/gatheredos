import SwiftUI

enum HomeDestination: Hashable {
    case systems, tasks, items
    case task(CareTask)
    case insight(Insight)
    case event(CareEvent)
}

struct HomeDestinationView: View {
    let destination: HomeDestination
    let items: [Item]
    let tasks: [CareTask]
    let events: [CareEvent]
    let onChange: () async -> Void

    var body: some View {
        switch destination {
        case .systems:
            itemList(title: "Systems", rows: items.filter { $0.category.lowercased() == "system" })
        case .items:
            itemList(title: "Home Inventory", rows: items)
        case .tasks:
            taskList
        case .task(let task):
            CareTaskDetailView(task: task, onChange: onChange)
        case .insight(let insight):
            InsightDetailView(insight: insight)
        case .event(let event):
            CareEventDetailView(event: event, linkedItem: items.first { $0.id == event.itemId }, onChange: onChange)
        }
    }

    private func itemList(title: String, rows: [Item]) -> some View {
        List(rows) { item in
            NavigationLink { ItemDetailView(item: item, onChange: onChange) } label: {
                Label {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(item.name).foregroundStyle(Color.homeInk)
                        Text([item.manufacturer, item.model].compactMap { $0 }.filter { !$0.isBlank }.joined(separator: " · "))
                            .font(.caption).foregroundStyle(.secondary)
                    }
                } icon: { Image(systemName: categoryIcon(item.category)).foregroundStyle(Color.homeNavy) }
            }
        }
        .overlay { if rows.isEmpty { ContentUnavailableView("Nothing recorded yet", systemImage: "square.grid.2x2", description: Text("Add or scan a home item to build this view.")) } }
        .scrollContentBackground(.hidden).background(Color.homeCanvas)
        .adaptiveContentWidth(Theme.Layout.listMaxWidth)
        .navigationTitle(title)
    }

    private var taskList: some View {
        List(tasks) { task in
            NavigationLink { CareTaskDetailView(task: task, onChange: onChange) } label: {
                VStack(alignment: .leading, spacing: 3) {
                    Text(task.title).foregroundStyle(Color.homeInk)
                    Text(HomeView.duePhrase(task.dueOn).isEmpty ? "Flexible timing" : HomeView.duePhrase(task.dueOn))
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
        }
        .overlay { if tasks.isEmpty { ContentUnavailableView("No open tasks", systemImage: "checkmark.seal", description: Text("Your current care list is clear.")) } }
        .scrollContentBackground(.hidden).background(Color.homeCanvas)
        .adaptiveContentWidth(Theme.Layout.listMaxWidth)
        .navigationTitle("Open Tasks")
    }
}

private struct InsightDetailView: View {
    let insight: Insight
    var body: some View {
        List {
            Section {
                if let stat = insight.stat, !stat.isBlank { Text(stat).font(.largeTitle).fontDesign(.serif).foregroundStyle(Color.homeNavy) }
                Text(insight.headline).font(.title2).fontDesign(.serif).foregroundStyle(Color.homeInk)
                if let detail = insight.detail, !detail.isBlank { Text(detail).foregroundStyle(Color.homeInk) }
            }
            Section("What GatheredOS knows") {
                Label(intelligenceTier.title, systemImage: intelligenceTier.icon)
                    .foregroundStyle(intelligenceTier.color)
                Text(intelligenceTier.explanation).font(.subheadline).foregroundStyle(.secondary)
                if let confidence = insight.confidence {
                    LabeledContent("Confidence", value: confidence.formatted(.percent.precision(.fractionLength(0))))
                }
            }
            Section("Evidence") {
                if let basis = insight.basis, !basis.isBlank {
                    Label(basis, systemImage: "doc.text.magnifyingglass")
                } else if insight.sourceExtractionId != nil {
                    Label("Extracted from a saved home record", systemImage: "doc.text.magnifyingglass")
                } else if insight.dedupeSlug?.hasPrefix("recall:") == true {
                    Label("Matched against a manufacturer recall record", systemImage: "checkmark.shield")
                } else {
                    Text("No supporting home record is attached yet.").foregroundStyle(.secondary)
                }
                LabeledContent("Origin", value: sourceLabel)
            }
            Section("What would make this stronger") {
                Text(missingInformation).font(.subheadline).foregroundStyle(.secondary)
            }
            if let action = insight.action, !action.isBlank {
                Section("Recommended next action") { Label(action, systemImage: "arrow.forward.circle.fill").foregroundStyle(Color.homeNavy) }
            }
        }
        .scrollContentBackground(.hidden).background(Color.homeCanvas)
        .adaptiveContentWidth(Theme.Layout.listMaxWidth)
        .navigationTitle("Home Intelligence").navigationBarTitleDisplayMode(.inline)
    }

    private var intelligenceTier: (title: String, explanation: String, icon: String, color: Color) {
        if insight.source == "user" || insight.confidence == 1 {
            return ("Known fact", "This is directly recorded or deterministically verified for your home.", "checkmark.seal.fill", .green)
        }
        if insight.sourceExtractionId != nil || insight.confidence != nil {
            return ("Evidence-based estimate", "This conclusion uses a saved record, but some interpretation or estimation is involved.", "chart.bar.doc.horizontal", Color.homeNavy)
        }
        return ("General guidance", "This may be useful, but GatheredOS cannot yet verify that it applies specifically to your home.", "info.circle.fill", .orange)
    }

    private var sourceLabel: String {
        switch insight.source.lowercased() {
        case "user": return "Entered by your household"
        case "ai": return "Analyzed from home information"
        case "system": return "GatheredOS rule"
        default: return "General home guidance"
        }
    }

    private var missingInformation: String {
        switch insight.category?.lowercased() {
        case "warranty": return "Add the warranty document, covered item, purchase date, and expiration date."
        case "maintenance", "hvac", "water": return "Confirm the exact item, manufacturer, model, installation date, and most recent service."
        case "cost", "spending", "wealth", "equity": return "Add receipts, project costs, dates, and relevant property records."
        case "energy": return "Add the exact system model, service history, and recent utility information."
        default: return "Attach the related item or document and confirm dates, model information, and service history."
        }
    }
}

private struct CareEventDetailView: View {
    let event: CareEvent
    let linkedItem: Item?
    let onChange: () async -> Void
    var body: some View {
        List {
            Section("Service record") {
                LabeledContent("Date", value: event.occurredOn ?? "Not recorded")
                if let cost = event.cost { LabeledContent("Cost", value: cost.formatted(.currency(code: "USD"))) }
                if let note = event.note, !note.isBlank { Text(note) }
            }
            if let linkedItem { Section("Related item") { NavigationLink(linkedItem.name) { ItemDetailView(item: linkedItem, onChange: onChange) } } }
        }
        .scrollContentBackground(.hidden).background(Color.homeCanvas)
        .adaptiveContentWidth(Theme.Layout.listMaxWidth)
        .navigationTitle(event.title).navigationBarTitleDisplayMode(.inline)
    }
}
