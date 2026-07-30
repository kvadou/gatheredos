import SwiftUI

struct CoverageDetailView: View {
    let item: Item
    let warranties: [Warranty]
    var body: some View {
        List {
            Section("Age and expected life") {
                LabeledContent("Installed", value: item.installedOn ?? "Unknown")
                LabeledContent("Expected lifespan", value: item.lifespanYears.map { "\($0) years (estimate)" } ?? "Not enough information")
            }
            Section("Warranty") {
                if warranties.isEmpty {
                    ContentUnavailableView("No warranty proof", systemImage: "checkmark.shield", description: Text("Add a receipt or warranty document. GatheredOS will extract provider, coverage, dates, and confidence."))
                } else {
                    ForEach(warranties) { warranty in
                        VStack(alignment: .leading, spacing: 5) {
                            Text(warranty.provider ?? warranty.kind?.capitalized ?? "Warranty").font(.headline)
                            Text([warranty.coverage, warranty.endsOn.map { "Ends \($0)" }].compactMap { $0 }.joined(separator: " · ")).font(.subheadline).foregroundStyle(.secondary)
                            Label(warranty.status.capitalized, systemImage: warranty.status == "active" ? "checkmark.seal.fill" : "exclamationmark.triangle.fill")
                                .font(.caption).foregroundStyle(warranty.status == "active" ? .green : .orange)
                        }.padding(.vertical, 3)
                    }
                }
            }
            Section("Recall check") { Text("GatheredOS only reports a recall after the manufacturer and model match a verified recall source. No match is not a guarantee that no recall exists.").font(.subheadline).foregroundStyle(.secondary) }
        }.scrollContentBackground(.hidden).background(Color.homeCanvas).navigationTitle("Coverage").navigationBarTitleDisplayMode(.inline)
    }
}

struct ItemDocumentsView: View {
    let item: Item
    let files: [HomeFile]
    var body: some View {
        List {
            if files.isEmpty { ContentUnavailableView("No linked documents", systemImage: "doc.badge.plus", description: Text("Add a manual, receipt, warranty, service invoice, or equipment photo from Library.")) }
            ForEach(files) { file in Label(file.name, systemImage: icon(file.type)) }
            Section("Best next records") { Text("A model-label photo, purchase receipt, manufacturer manual, warranty terms, and latest service invoice unlock the strongest item intelligence.").font(.subheadline).foregroundStyle(.secondary) }
        }.scrollContentBackground(.hidden).background(Color.homeCanvas).navigationTitle("Documents").navigationBarTitleDisplayMode(.inline)
    }
    private func icon(_ type: String) -> String { type == "manual" ? "book.closed.fill" : type == "receipt" ? "receipt.fill" : type == "warranty" ? "checkmark.shield.fill" : "doc.fill" }
}

struct ItemCareHistoryView: View {
    let item: Item
    let events: [CareEvent]
    var body: some View {
        List {
            if events.isEmpty { ContentUnavailableView("No service history", systemImage: "wrench.and.screwdriver", description: Text("Record maintenance, repairs, parts, cost, and technician notes to build a durable history.")) }
            ForEach(events) { event in VStack(alignment: .leading) { Text(event.title); Text(event.occurredOn ?? "Date unknown").font(.caption).foregroundStyle(.secondary) } }
        }.scrollContentBackground(.hidden).background(Color.homeCanvas).navigationTitle("Care History").navigationBarTitleDisplayMode(.inline)
    }
}

struct TroubleshootingView: View {
    let item: Item
    let files: [HomeFile]
    var body: some View {
        List {
            Section("Start safely") {
                Label("Describe the symptom and when it started", systemImage: "text.bubble")
                Label("Add a photo or error code when available", systemImage: "camera")
                Label("Stop for gas, smoke, sparks, flooding, or exposed wiring", systemImage: "exclamationmark.triangle.fill").foregroundStyle(.red)
            }
            Section("Available evidence") {
                LabeledContent("Manufacturer", value: item.manufacturer ?? "Unknown")
                LabeledContent("Model", value: item.model ?? "Unknown")
                LabeledContent("Manual", value: files.contains { $0.type == "manual" } ? "Available" : "Missing")
            }
            Section { Text("Model-specific repair steps require a verified manual or manufacturer source. Until then, GatheredOS should offer only reversible checks and clearly labeled general guidance.").font(.subheadline).foregroundStyle(.secondary) }
        }.scrollContentBackground(.hidden).background(Color.homeCanvas).navigationTitle("Troubleshoot").navigationBarTitleDisplayMode(.inline)
    }
}

struct LocalServiceView: View {
    let item: Item
    let contractors: [Contractor]
    var body: some View {
        List {
            Section { Text("GatheredOS will rank service options by verified trade fit, licensing where applicable, insurance, reputation, and availability. Price is shown, but never substitutes for trust.").font(.subheadline).foregroundStyle(.secondary) }
            if contractors.isEmpty {
                ContentUnavailableView("Provider network not connected", systemImage: "person.badge.shield.checkmark", description: Text("No local provider has been verified for this item yet. GatheredOS will not fabricate availability or qualifications."))
            } else {
                Section("Pros saved by your household") {
                    ForEach(contractors) { pro in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(pro.company ?? pro.name).font(.headline)
                            Text("Saved contact · qualifications not independently verified").font(.caption).foregroundStyle(.orange)
                            if let notes = pro.notes, !notes.isBlank { Text(notes).font(.subheadline).foregroundStyle(.secondary) }
                        }.padding(.vertical, 3)
                    }
                }
            }
            Section("Before booking") { Text("You will review the provider, qualifications, scope, estimated price, appointment time, cancellation terms, information shared, and calendar event. Booking requires your approval.").font(.subheadline).foregroundStyle(.secondary) }
        }.scrollContentBackground(.hidden).background(Color.homeCanvas).navigationTitle("Local Service").navigationBarTitleDisplayMode(.inline)
    }
}
