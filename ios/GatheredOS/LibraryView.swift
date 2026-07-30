import SwiftUI

private enum LibraryFilter: String, CaseIterable, Identifiable {
    case all, appliance, system, fixture, structure, equipment, safety, homeDocuments, needsReview
    var id: String { rawValue }
    var label: String {
        switch self {
        case .all: return "All"
        case .appliance: return "Appliances"
        case .system: return "Systems"
        case .fixture: return "Fixtures"
        case .structure: return "Structure"
        case .equipment: return "Equipment"
        case .safety: return "Safety & Security"
        case .homeDocuments: return "Home Documents"
        case .needsReview: return "Needs Review"
        }
    }
    var icon: String {
        switch self {
        case .all: return "square.grid.2x2"
        case .homeDocuments: return "doc.text"
        case .needsReview: return "tray.full"
        default: return categoryIcon(rawValue)
        }
    }
    var itemCategory: String? {
        switch self {
        case .appliance, .system, .fixture, .structure, .equipment, .safety: return rawValue
        default: return nil
        }
    }
    var showsItems: Bool { self != .homeDocuments && self != .needsReview }
    var showsHomeDocuments: Bool { self == .all || self == .homeDocuments }
    var showsReview: Bool { self == .all || self == .needsReview }
    var itemSectionTitle: String { self == .all ? "Items" : label }
}

struct LibraryView: View {
    @Environment(SupabaseService.self) private var supabase

    @State private var items: [Item] = []
    @State private var files: [HomeFile] = []
    @State private var homeID: String?
    @State private var loading = true
    @State private var loadError: String?
    @State private var query = ""
    @State private var filter: LibraryFilter = .all
    @State private var sheet: LibrarySheet?
    @State private var path: [Item] = []
    @State private var deletingFile: HomeFile?
    @State private var deleteError: String?
    @State private var canWrite = false

    private enum LibrarySheet: Identifiable {
        case addItem, scanReceipt, addPhoto, review(HomeFile)
        var id: String {
            switch self {
            case .addItem: return "add-item"
            case .scanReceipt: return "scan-receipt"
            case .addPhoto: return "add-photo"
            case .review(let file): return "review-\(file.id)"
            }
        }
    }

    var body: some View {
        NavigationStack(path: $path) {
            ZStack {
                Color.homeCanvas.ignoresSafeArea()
                content.adaptiveContentWidth(Theme.Layout.listMaxWidth)
            }
            .navigationTitle("Library")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button { sheet = .addItem } label: { Label("Add item", systemImage: "plus.square") }
                        Button { sheet = .scanReceipt } label: { Label("Scan receipt", systemImage: "doc.text.viewfinder") }
                        Button { sheet = .addPhoto } label: { Label("Identify item", systemImage: "viewfinder") }
                    } label: {
                        Image(systemName: "plus")
                    }
                    .tint(Color.homeNavy)
                    .accessibilityLabel("Add")
                    .disabled(homeID == nil)
                }
            }
            .navigationDestination(for: Item.self) { item in
                ItemDetailView(item: item) { await reload() }
            }
            .sheet(item: $sheet) { which in
                if let homeID {
                    switch which {
                    case .addItem: AddItemView(homeID: homeID) { await reload() }
                    case .scanReceipt: CaptureView(kind: .receipt, homeID: homeID) { await reload() }
                    case .addPhoto: CaptureView(kind: .photo, homeID: homeID, onOpenItem: { itemID in Task { await openItem(itemID) } }) { await reload() }
                    case .review(let file): ReviewLibraryFileView(file: file, items: items) { await reload() }
                    }
                }
            }
            .task { await reload() }
            .refreshable { await reload() }
            .confirmationDialog("Delete this file?", isPresented: Binding(get: { deletingFile != nil }, set: { if !$0 { deletingFile = nil } }), titleVisibility: .visible) {
                Button("Delete file", role: .destructive) { if let file = deletingFile { Task { await remove(file) } } }
                Button("Cancel", role: .cancel) { deletingFile = nil }
            } message: {
                Text("The stored image will be permanently removed. Any item it helped create will remain.")
            }
            .alert("Couldn't delete file", isPresented: Binding(get: { deleteError != nil }, set: { if !$0 { deleteError = nil } })) {
                Button("OK") { deleteError = nil }
            } message: { Text(deleteError ?? "Please try again.") }
        }
    }

    @ViewBuilder private var content: some View {
        if loading {
            ProgressView().tint(Color.homeNavy)
        } else if let loadError {
            ContentUnavailableView("Couldn't load library", systemImage: "exclamationmark.triangle",
                                   description: Text(loadError))
        } else if items.isEmpty && topLevelFiles.isEmpty {
            ContentUnavailableView("Nothing here yet", systemImage: "square.grid.2x2",
                                   description: Text("Add an item, or scan a receipt to get started."))
        } else {
            VStack(spacing: 0) {
            searchBar
            categoryBar
            List {
                if !filteredItems.isEmpty {
                    Section(filter.itemSectionTitle) {
                        ForEach(filteredItems) { item in
                            NavigationLink(value: item) { ItemRow(item: item) }
                                .listRowBackground(Color.homeSurface)
                        }
                    }
                }
                if filter.showsHomeDocuments && !filteredHomeDocuments.isEmpty {
                    Section("Home Documents") {
                        ForEach(filteredHomeDocuments) { file in
                            FileRow(file: file)
                                .listRowBackground(Color.homeSurface)
                                .swipeActions { if canWrite { Button(role: .destructive) { deletingFile = file } label: { Label("Delete", systemImage: "trash") } } }
                                .contextMenu { if canWrite { Button(role: .destructive) { deletingFile = file } label: { Label("Delete File", systemImage: "trash") } } }
                        }
                    }
                }
                if filter.showsReview && !filteredNeedsReview.isEmpty {
                    Section {
                        ForEach(filteredNeedsReview) { file in
                            Button { sheet = .review(file) } label: { FileRow(file: file) }
                                .buttonStyle(.plain)
                                .listRowBackground(Color.homeSurface)
                        }
                    } header: {
                        Text("Needs Review")
                    } footer: {
                        Text("Attach each scan to an item, keep it as a whole-home document, or remove it.")
                    }
                }
                if filteredItems.isEmpty && filteredHomeDocuments.isEmpty && filteredNeedsReview.isEmpty {
                    ContentUnavailableView("Nothing in \(filter.label)", systemImage: filter.icon,
                                           description: Text("Add a record or choose another category."))
                        .listRowBackground(Color.clear)
                }
            }
            .listStyle(.insetGrouped)
            .listSectionSpacing(.compact)
            .scrollContentBackground(.hidden)
            .contentMargins(.top, 0, for: .scrollContent)
            }
        }
    }

    private var searchBar: some View {
        HStack(spacing: Theme.Spacing.small) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(.secondary)
            TextField("Search items and documents", text: $query)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            if !query.isEmpty {
                Button { query = "" } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.secondary)
                        .frame(width: 44, height: 44)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Clear search")
            }
        }
        .padding(.leading, Theme.Spacing.large)
        .padding(.trailing, query.isEmpty ? Theme.Spacing.large : 0)
        .frame(minHeight: 44)
        .background(Color.homeSurface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .padding(.horizontal, Theme.Spacing.large)
        .padding(.top, Theme.Spacing.small)
        .accessibilityElement(children: .contain)
    }

    private var categoryBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(primaryFilters) { option in
                    Button { filter = option } label: {
                        Label(option.label, systemImage: option.icon)
                            .font(.subheadline.weight(.medium))
                            .padding(.horizontal, Theme.Spacing.medium)
                            .frame(minHeight: 44)
                            .foregroundStyle(filter == option ? Color.white : Color.homeInk)
                            .background(filter == option ? Color.homeNavy : Color.homeSurface, in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(filter == option ? .isSelected : [])
                }
                Menu {
                    ForEach(secondaryFilters) { option in
                        Button { filter = option } label: { Label(option.label, systemImage: option.icon) }
                    }
                } label: {
                    Label(secondaryFilters.contains(filter) ? filter.label : "More", systemImage: "line.3.horizontal.decrease")
                        .font(.subheadline.weight(.medium))
                        .padding(.horizontal, Theme.Spacing.medium)
                        .frame(minHeight: 44)
                        .foregroundStyle(secondaryFilters.contains(filter) ? Color.white : Color.homeInk)
                        .background(secondaryFilters.contains(filter) ? Color.homeNavy : Color.homeSurface, in: Capsule())
                }
            }
            .padding(.horizontal, Theme.Spacing.large).padding(.vertical, Theme.Spacing.small)
        }
        .frame(minHeight: 44)
    }

    private var primaryFilters: [LibraryFilter] { [.all, .appliance, .system] }
    private var secondaryFilters: [LibraryFilter] { [.fixture, .structure, .equipment, .safety, .homeDocuments, .needsReview] }

    private var filteredItems: [Item] {
        let q = query.trimmed.lowercased()
        return items.filter { item in
            let matchesCategory = filter.itemCategory == nil || libraryCategory(item.category) == filter.itemCategory
            let linkedFileMatches = files.contains { $0.itemId == item.id && $0.name.lowercased().contains(q) }
            let matchesQuery = q.isEmpty ||
            item.name.lowercased().contains(q)
                || item.category.lowercased().contains(q)
                || (item.manufacturer?.lowercased().contains(q) ?? false)
                || (item.model?.lowercased().contains(q) ?? false)
                || (item.serial?.lowercased().contains(q) ?? false)
                || linkedFileMatches
            return filter.showsItems && matchesCategory && matchesQuery
        }
    }

    private var topLevelFiles: [HomeFile] { files.filter { $0.itemId == nil } }
    private var homeDocuments: [HomeFile] {
        topLevelFiles.filter { $0.type == "document" }
    }
    private var needsReview: [HomeFile] { topLevelFiles.filter { !homeDocuments.contains($0) } }
    private var filteredHomeDocuments: [HomeFile] { matchingFiles(homeDocuments) }
    private var filteredNeedsReview: [HomeFile] { matchingFiles(needsReview) }
    private func matchingFiles(_ source: [HomeFile]) -> [HomeFile] {
        let q = query.trimmed.lowercased()
        return q.isEmpty ? source : source.filter { $0.name.lowercased().contains(q) || $0.type.lowercased().contains(q) }
    }

    private func reload() async {
        loading = items.isEmpty && files.isEmpty
        loadError = nil
        do {
            let loadedHome = try await supabase.firstHome()
            homeID = loadedHome?.id
            if let id = loadedHome?.id {
                async let loadedItems = supabase.items(homeID: id)
                async let loadedFiles = supabase.files(homeID: id)
                async let writer = supabase.canWrite(homeID: id)
                items = try await loadedItems
                files = try await loadedFiles
                canWrite = try await writer
            } else {
                items = []
                files = []
                canWrite = false
            }
        } catch {
            loadError = error.localizedDescription
        }
        loading = false
    }

    private func openItem(_ itemID: String) async {
        do {
            let loadedHome = try await supabase.firstHome()
            guard let home = loadedHome else { return }
            let all = try await supabase.items(homeID: home.id)
            guard let item = all.first(where: { $0.id == itemID }) else { return }
            sheet = nil
            path.append(item)
        } catch { loadError = error.localizedDescription }
    }

    private func remove(_ file: HomeFile) async {
        deletingFile = nil
        do { try await supabase.deleteFile(file); await reload() }
        catch { deleteError = error.localizedDescription }
    }
}

struct ItemRow: View {
    let item: Item

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: categoryIcon(item.category))
                .font(.title3)
                .foregroundStyle(Color.homeNavy)
                .frame(width: 36, height: 36)
                .background(Color.homeNavy.opacity(0.10),
                           in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            VStack(alignment: .leading, spacing: 3) {
                Text(item.name)
                    .font(.headline)
                    .foregroundStyle(Color.homeInk)
                Text(subtitle)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }

    private var subtitle: String {
        [item.category.capitalized, item.manufacturer]
            .compactMap { $0 }
            .filter { !$0.isEmpty }
            .joined(separator: "  ·  ")
    }
}

struct FileRow: View {
    let file: HomeFile

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: fileIcon(file.type))
                .font(.title3)
                .foregroundStyle(Color.homeNavy)
                .frame(width: 36, height: 36)
                .background(Color.homeNavy.opacity(0.10),
                           in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            VStack(alignment: .leading, spacing: 3) {
                Text(file.name)
                    .font(.headline)
                    .foregroundStyle(Color.homeInk)
                Text(subtitle)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 8)
            if let chip = statusChip {
                Text(chip.label)
                    .font(.caption).fontWeight(.medium)
                    .foregroundStyle(chip.tint)
                    .padding(.horizontal, 8).padding(.vertical, 4)
                    .background(chip.tint.opacity(0.12), in: Capsule())
            }
        }
        .padding(.vertical, 4)
    }

    private var subtitle: String {
        [file.type.capitalized, Self.dayString(file.createdAt)]
            .filter { !$0.isEmpty }
            .joined(separator: "  ·  ")
    }

    /// Extraction state as a trailing chip. Only pending/failed surface; a
    /// finished ('done') or non-extractable ('none') file shows nothing.
    private var statusChip: (label: String, tint: Color)? {
        switch file.extractionStatus {
        case "pending": return ("Processing…", Color.homeNavy)
        case "failed": return ("Failed", .orange)
        default: return nil
        }
    }

    /// created_at arrives as an ISO timestamp; the calendar-day prefix dodges any
    /// timezone drift, then reformats to a short local date.
    static func dayString(_ iso: String) -> String {
        let day = String(iso.prefix(10))   // yyyy-MM-dd
        let parse = DateFormatter()
        parse.locale = Locale(identifier: "en_US_POSIX")
        parse.dateFormat = "yyyy-MM-dd"
        guard let date = parse.date(from: day) else { return day }
        let out = DateFormatter()
        out.dateStyle = .medium
        return out.string(from: date)
    }
}

private struct ReviewLibraryFileView: View {
    @Environment(SupabaseService.self) private var supabase
    @Environment(\.dismiss) private var dismiss
    let file: HomeFile
    let items: [Item]
    let onChanged: () async -> Void
    @State private var selectedItemID = ""
    @State private var working = false
    @State private var error: String?
    @State private var confirmingDelete = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Record") { FileRow(file: file) }
                Section {
                    Picker("Item", selection: $selectedItemID) {
                        Text("Choose an item").tag("")
                        ForEach(items.sorted { $0.name < $1.name }) { Text($0.name).tag($0.id) }
                    }
                    Button("Attach to selected item") { Task { await attach() } }
                        .disabled(selectedItemID.isEmpty || working)
                } header: {
                    Text("Attach to an item")
                } footer: {
                    Text("Receipts, manuals, labels, warranties, and barcode photos belong with the item they describe.")
                }
                Section("Or keep independently") {
                    Button { Task { await keepAsHomeDocument() } } label: {
                        Label("Keep as Home Document", systemImage: "house.and.flag")
                    }
                    Text("Use this for inspections, permits, insurance, plans, surveys, and other records about the whole property.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                Section { Button("Remove Record", role: .destructive) { confirmingDelete = true } }
                if let error { Section { Text(error).foregroundStyle(.red) } }
            }
            .adaptiveContentWidth(Theme.Layout.formMaxWidth)
            .navigationTitle("File this record")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
            .confirmationDialog("Remove this record?", isPresented: $confirmingDelete, titleVisibility: .visible) {
                Button("Remove", role: .destructive) { Task { await remove() } }
                Button("Cancel", role: .cancel) {}
            } message: { Text("The stored file will be permanently removed.") }
        }
    }

    private func finish(_ operation: () async throws -> Void) async {
        working = true; error = nil
        do { try await operation(); await onChanged(); dismiss() }
        catch { self.error = error.localizedDescription; working = false }
    }
    private func attach() async { await finish { try await supabase.attachFile(id: file.id, to: selectedItemID) } }
    private func keepAsHomeDocument() async { await finish { try await supabase.classifyAsHomeDocument(id: file.id) } }
    private func remove() async { await finish { try await supabase.deleteFile(file) } }
}

// SF Symbol per file type — falls back to a generic document glyph.
private func fileIcon(_ type: String) -> String {
    switch type.lowercased() {
    case "receipt": return "receipt.fill"
    case "photo": return "photo.fill"
    case "video": return "video.fill"
    case "manual": return "book.fill"
    case "warranty": return "checkmark.shield.fill"
    default: return "doc.fill"
    }
}
