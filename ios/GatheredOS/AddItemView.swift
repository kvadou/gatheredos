import SwiftUI

struct AddItemView: View {
    @Environment(SupabaseService.self) private var supabase
    @Environment(\.dismiss) private var dismiss

    let homeID: String
    let onAdded: () async -> Void

    @State private var name = ""
    @State private var category = "system"
    @State private var manufacturer = ""
    @State private var model = ""
    @State private var installedOn = Date()
    @State private var hasInstallDate = false
    @State private var saving = false
    @State private var error: String?

    private let categories = ["appliance", "system", "fixture", "structure", "equipment", "safety"]

    var body: some View {
        NavigationStack {
            Form {
                Section("Item") {
                    TextField("Name", text: $name)
                    Picker("Category", selection: $category) {
                        ForEach(categories, id: \.self) { Text(categoryLabel($0)).tag($0) }
                    }
                }
                Section("Details") {
                    TextField("Manufacturer", text: $manufacturer)
                    TextField("Model", text: $model)
                    Toggle("Set installed date", isOn: $hasInstallDate.animation())
                    if hasInstallDate {
                        DatePicker("Installed", selection: $installedOn, displayedComponents: .date)
                    }
                }
                if let error {
                    Section {
                        Text(error).font(.footnote).foregroundStyle(.red)
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Color.homeCanvas)
            .navigationTitle("Add Item")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }
                        .disabled(name.isBlank || saving)
                }
            }
        }
    }

    private func save() async {
        saving = true
        error = nil
        let payload = NewItem(
            home_id: homeID,
            name: name.trimmed,
            category: category,
            manufacturer: manufacturer.isBlank ? nil : manufacturer.trimmed,
            model: model.isBlank ? nil : model.trimmed,
            installed_on: hasInstallDate ? Self.dateString(installedOn) : nil
        )
        do {
            try await supabase.addItem(payload)
            await onAdded()
            dismiss()
        } catch {
            self.error = error.localizedDescription
            saving = false
        }
    }

    // Postgres `date` wants a plain calendar day; POSIX locale keeps it stable.
    static func dateString(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }
}
