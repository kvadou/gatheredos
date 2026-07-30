import SwiftUI

enum CareEntryKind: String, Identifiable {
    case task
    case maintenance
    var id: String { rawValue }
}

struct CareEntryView: View {
    @Environment(SupabaseService.self) private var supabase
    @Environment(\.dismiss) private var dismiss

    let kind: CareEntryKind
    let homeID: String
    let onSaved: () async -> Void

    @State private var title = ""
    @State private var detail = ""
    @State private var date = Date()
    @State private var hasDueDate = false
    @State private var priority = "normal"
    @State private var cost = ""
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section(kind == .task ? "Task" : "Maintenance") {
                    TextField(kind == .task ? "What needs attention?" : "What was completed?", text: $title)
                        .textInputAutocapitalization(.sentences)
                    TextField("Notes (optional)", text: $detail, axis: .vertical)
                        .lineLimit(2...5)
                }

                if kind == .task {
                    Section("Plan") {
                        Picker("Priority", selection: $priority) {
                            Text("Low").tag("low")
                            Text("Normal").tag("normal")
                            Text("High").tag("high")
                            Text("Highest").tag("highest")
                        }
                        Toggle("Set due date", isOn: $hasDueDate)
                        if hasDueDate {
                            DatePicker("Due", selection: $date, displayedComponents: .date)
                        }
                    }
                } else {
                    Section("Details") {
                        DatePicker("Completed", selection: $date, displayedComponents: .date)
                        TextField("Cost (optional)", text: $cost)
                            .keyboardType(.decimalPad)
                    }
                }

                if let error {
                    Section { Text(error).foregroundStyle(.red) }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Color.homeCanvas)
            .navigationTitle(kind == .task ? "New Task" : "Record Maintenance")
            .navigationBarTitleDisplayMode(.inline)
            .interactiveDismissDisabled(saving)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }
                        .fontWeight(.semibold)
                        .disabled(title.trimmed.isEmpty || title.trimmed.count > 160 || saving)
                }
            }
        }
    }

    private func save() async {
        let cleanTitle = title.trimmed
        guard !cleanTitle.isEmpty else { return }
        saving = true
        error = nil
        do {
            if kind == .task {
                try await supabase.addCareTask(NewCareTask(
                    home_id: homeID,
                    item_id: nil,
                    title: cleanTitle,
                    detail: detail.isBlank ? nil : detail.trimmed,
                    priority: priority,
                    season: nil,
                    due_on: hasDueDate ? SupabaseService.isoDay(date) : nil,
                    recurrence: nil,
                    template_slug: nil,
                    source: "user"
                ))
            } else {
                let parsedCost = Double(cost.replacingOccurrences(of: ",", with: ""))
                try await supabase.addCareEvent(NewCareEvent(
                    home_id: homeID,
                    title: cleanTitle,
                    note: detail.isBlank ? nil : detail.trimmed,
                    cost: parsedCost.map { max(0, $0) },
                    occurred_on: SupabaseService.isoDay(date),
                    item_id: nil
                ))
            }
            await onSaved()
            dismiss()
        } catch {
            self.error = "Couldn't save this entry. \(error.localizedDescription)"
            saving = false
        }
    }
}
