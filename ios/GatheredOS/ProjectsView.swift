import SwiftUI

struct ProjectsView: View {
    @Environment(SupabaseService.self) private var supabase

    @State private var projects: [Project] = []
    @State private var segment: ProjectSegment = .active
    @State private var loading = true
    @State private var loadError: String?
    @State private var homeID: String?
    @State private var editing: Project?
    @State private var creating = false

    var body: some View {
        NavigationStack {
            ZStack {
                Color.homeCanvas.ignoresSafeArea()
                VStack(spacing: Theme.Spacing.small) {
                    projectFilters
                    content
                }
                .adaptiveContentWidth(Theme.Layout.listMaxWidth)
            }
            .navigationTitle("Projects")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { creating = true } label: { Image(systemName: "plus") }
                        .accessibilityLabel("Add project")
                        .disabled(homeID == nil)
                }
            }
            .sheet(isPresented: $creating) {
                if let homeID { ProjectEditorView(homeID: homeID, project: nil, defaultKind: segment.createKind) { await reload() } }
            }
            .sheet(item: $editing) { project in
                if let homeID { ProjectEditorView(homeID: homeID, project: project, defaultKind: project.kind) { await reload() } }
            }
            .task { await reload() }
            .refreshable { await reload() }
        }
    }

    private var projectFilters: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: Theme.Spacing.small) {
                ForEach(ProjectSegment.allCases) { option in
                    Button {
                        segment = option
                    } label: {
                        Text(option.title)
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(segment == option ? Color.white : Color.homeInk)
                            .padding(.horizontal, 16)
                            .frame(minHeight: 44)
                            .background(segment == option ? Color.homeNavy : Color.homeSurface, in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(segment == option ? .isSelected : [])
                }
            }
            .padding(.horizontal, 20)
        }
        .frame(minHeight: 44)
        .sensoryFeedback(.selection, trigger: segment)
    }

    private var visible: [Project] {
        let rows = projects.filter { $0.kind == segment.kind }
        return segment == .done ? rows.sorted { ($0.completedYear ?? 0) > ($1.completedYear ?? 0) } : rows
    }

    @ViewBuilder private var content: some View {
        if loading {
            ProgressView().tint(Color.homeNavy).frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if let loadError {
            ContentUnavailableView {
                Label("Couldn't load projects", systemImage: "exclamationmark.triangle")
            } description: { Text(loadError) } actions: {
                Button("Try Again") { Task { await reload() } }
            }
        } else if visible.isEmpty {
            ContentUnavailableView {
                Label(segment.emptyTitle, systemImage: segment.emptyIcon)
            } description: { Text(segment.emptyMessage) } actions: {
                if segment != .done { Button(segment.emptyAction) { creating = true } }
            }
        } else {
            ScrollView {
                LazyVStack(spacing: Theme.Spacing.medium) {
                    ForEach(visible) { project in
                        Button { editing = project } label: { ProjectRow(project: project, segment: segment) }
                            .buttonStyle(.plain)
                            .accessibilityHint(segment == .done ? "View project details" : "Edit project")
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, Theme.Spacing.small)
                .padding(.bottom, Theme.Spacing.xLarge)
            }
        }
    }

    private func reload() async {
        loading = projects.isEmpty
        loadError = nil
        do {
            let home = try await supabase.firstHome()
            homeID = home?.id
            if let home { projects = try await supabase.projects(homeID: home.id) }
            else { projects = [] }
        } catch {
            loadError = error.localizedDescription
        }
        loading = false
    }
}

private struct ProjectRow: View {
    let project: Project
    let segment: ProjectSegment

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.small) {
            HStack(alignment: .firstTextBaseline) {
                Text(project.name).font(.headline).foregroundStyle(Color.homeInk)
                Spacer(minLength: 8)
                if segment == .forYou { Text("Suggested").font(.caption).foregroundStyle(Color.homeNavy) }
                if segment == .done, let year = project.completedYear { Text(String(year)).font(.subheadline).foregroundStyle(.secondary) }
                Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(.tertiary)
            }
            if let summary = project.summary, !summary.isBlank {
                Text(summary).font(.subheadline).foregroundStyle(.secondary).lineLimit(3)
            } else if let status = project.status, !status.isBlank {
                Text(status).font(.subheadline).foregroundStyle(.secondary)
            }
            if segment == .active, let progress = project.progress {
                ProgressView(value: Double(min(max(progress, 0), 100)) / 100).tint(Color.homeNavy)
                    .accessibilityLabel("Progress").accessibilityValue("\(progress) percent")
            }
            if segment == .active, let budget = project.budget {
                Text("\((project.spent ?? 0).formatted(.currency(code: "USD").precision(.fractionLength(0)))) of \(budget.formatted(.currency(code: "USD").precision(.fractionLength(0))))")
                    .font(.footnote).foregroundStyle((project.spent ?? 0) > budget ? .orange : .secondary)
            }
        }
        .padding(Theme.Spacing.large)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.homeSurface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .contentShape(Rectangle())
    }
}

private struct ProjectEditorView: View {
    @Environment(SupabaseService.self) private var supabase
    @Environment(\.dismiss) private var dismiss

    let homeID: String
    let project: Project?
    let defaultKind: String
    let onSaved: () async -> Void

    @State private var name: String
    @State private var kind: String
    @State private var status: String
    @State private var summary: String
    @State private var progress: Double
    @State private var budget: String
    @State private var spent: String
    @State private var saving = false
    @State private var error: String?
    @State private var confirmingDelete = false

    init(homeID: String, project: Project?, defaultKind: String, onSaved: @escaping () async -> Void) {
        self.homeID = homeID; self.project = project; self.defaultKind = defaultKind; self.onSaved = onSaved
        _name = State(initialValue: project?.name ?? "")
        _kind = State(initialValue: project?.kind ?? defaultKind)
        _status = State(initialValue: project?.status ?? "Planning")
        _summary = State(initialValue: project?.summary ?? "")
        _progress = State(initialValue: Double(project?.progress ?? 0))
        _budget = State(initialValue: project?.budget.map { String(format: "%.0f", $0) } ?? "")
        _spent = State(initialValue: project?.spent.map { String(format: "%.0f", $0) } ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Project") {
                    TextField("Project name", text: $name)
                    Picker("Category", selection: $kind) {
                        Text("Active").tag("active")
                        Text("Idea").tag("idea")
                    }
                    TextField("Summary (optional)", text: $summary, axis: .vertical).lineLimit(2...5)
                }
                if kind == "active" {
                    Section("Plan") {
                        Picker("Status", selection: $status) {
                            Text("Planning").tag("Planning")
                            Text("In progress").tag("In progress")
                            Text("On hold").tag("On hold")
                        }
                        VStack(alignment: .leading) {
                            Text("Progress: \(Int(progress))%").font(.subheadline)
                            Slider(value: $progress, in: 0...100, step: 5)
                        }
                        TextField("Budget", text: $budget).keyboardType(.decimalPad)
                        TextField("Spent", text: $spent).keyboardType(.decimalPad)
                    }
                }
                if let error { Section { Text(error).foregroundStyle(.red) } }
                if let project {
                    Section {
                        if project.kind != "completed" {
                            Button { Task { await complete(project) } } label: { Label("Mark Complete", systemImage: "checkmark.circle") }
                        }
                        Button("Delete Project", role: .destructive) { confirmingDelete = true }
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Color.homeCanvas)
            .adaptiveContentWidth(Theme.Layout.formMaxWidth)
            .navigationTitle(project == nil ? "New Project" : "Edit Project")
            .navigationBarTitleDisplayMode(.inline)
            .interactiveDismissDisabled(saving)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }.fontWeight(.semibold)
                        .disabled(name.trimmed.isEmpty || name.trimmed.count > 160 || saving || project?.kind == "completed")
                }
            }
            .confirmationDialog("Delete \(project?.name ?? "this project")?", isPresented: $confirmingDelete, titleVisibility: .visible) {
                Button("Delete Project", role: .destructive) { Task { await remove() } }
                Button("Cancel", role: .cancel) {}
            } message: { Text("This can't be undone.") }
        }
    }

    private func save() async {
        saving = true; error = nil
        let cleanName = name.trimmed
        let payload = ProjectUpdate(name: cleanName, kind: kind, status: kind == "active" ? status : nil, progress: kind == "active" ? Int(progress) : nil, summary: summary.isBlank ? nil : summary.trimmed, budget: number(budget), spent: number(spent))
        do {
            if let project { try await supabase.updateProject(id: project.id, payload) }
            else { try await supabase.addProject(NewProject(home_id: homeID, name: payload.name, kind: payload.kind, status: payload.status, progress: payload.progress, summary: payload.summary, budget: payload.budget, spent: payload.spent)) }
            await onSaved(); dismiss()
        } catch { self.error = "Couldn't save this project. \(error.localizedDescription)"; saving = false }
    }

    private func complete(_ project: Project) async {
        saving = true; error = nil
        do { try await supabase.completeProject(id: project.id); await onSaved(); dismiss() }
        catch { self.error = "Couldn't complete this project. \(error.localizedDescription)"; saving = false }
    }

    private func remove() async {
        guard let project else { return }
        saving = true; error = nil
        do { try await supabase.deleteProject(id: project.id); await onSaved(); dismiss() }
        catch { self.error = "Couldn't delete this project. \(error.localizedDescription)"; saving = false }
    }

    private func number(_ value: String) -> Double? {
        Double(value.replacingOccurrences(of: ",", with: "")).map { max(0, $0) }
    }
}

private enum ProjectSegment: CaseIterable, Identifiable, Hashable {
    case active, ideas, forYou, done
    var id: Self { self }
    var title: String { switch self { case .active: "Active"; case .ideas: "Ideas"; case .forYou: "For You"; case .done: "Done" } }
    var kind: String { switch self { case .active: "active"; case .ideas: "idea"; case .forYou: "recommended"; case .done: "completed" } }
    var createKind: String { self == .ideas ? "idea" : "active" }
    var emptyTitle: String { switch self { case .active: "No active projects"; case .ideas: "No ideas yet"; case .forYou: "Nothing suggested"; case .done: "No completed projects" } }
    var emptyMessage: String { switch self { case .active: "Start a project and keep its plan, budget, and progress together."; case .ideas: "Save a someday project before the idea gets away."; case .forYou: "Recommendations appear only when GatheredOS has enough home information."; case .done: "Finished projects will become part of your home's history." } }
    var emptyIcon: String { switch self { case .active: "hammer"; case .ideas: "lightbulb"; case .forYou: "sparkles"; case .done: "checkmark.seal" } }
    var emptyAction: String { self == .ideas ? "Save an Idea" : "Start a Project" }
}
