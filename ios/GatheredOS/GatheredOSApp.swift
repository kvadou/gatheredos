import SwiftUI

@main
struct GatheredOSApp: App {
    @State private var supabase = SupabaseService()

    init() {
        Theme.applyNavigationBarAppearance()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(supabase)
                .tint(Color.homeNavy)
                .task { await supabase.observeAuth() }
        }
    }
}

struct RootView: View {
    @Environment(SupabaseService.self) private var supabase

    private enum HomeGate { case checking, needsHome, ready, failed(String) }
    @State private var gate: HomeGate = .checking

    var body: some View {
        Group {
            #if DEBUG
            if ProcessInfo.processInfo.arguments.contains("-ui-testing-adaptive-shell") {
                MainTabView()
            } else {
                authenticatedContent
            }
            #else
            authenticatedContent
            #endif
        }
        // Re-resolve whenever the signed-in identity changes (sign in/out/switch).
        .task(id: supabase.currentUser?.id) { await resolveHome() }
    }

    @ViewBuilder
    private var authenticatedContent: some View {
        if supabase.isBootstrapping {
            LoadingView()
        } else if supabase.currentUser == nil {
            AuthView()
        } else {
            switch gate {
            case .checking: LoadingView()   // resolving firstHome — no flash
            case .needsHome: CreateHomeView { gate = .ready }
            case .ready: MainTabView()
            case .failed(let message):
                ContentUnavailableView {
                    Label("Couldn't open your home", systemImage: "wifi.exclamationmark")
                } description: { Text(message) } actions: {
                    Button("Try Again") { Task { await resolveHome() } }
                }
            }
        }
    }

    private func resolveHome() async {
        guard supabase.currentUser != nil else { gate = .checking; return }
        gate = .checking
        do {
            let home = try await supabase.firstHome()
            gate = home == nil ? .needsHome : .ready
        } catch {
            gate = .failed(error.localizedDescription)
        }
    }
}

struct MainTabView: View {
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @State private var selection: AppSection = .home

    var body: some View {
        Group {
            if horizontalSizeClass == .regular {
                regularWidthNavigation
            } else {
                compactNavigation
            }
        }
        .accessibilityIdentifier("app-shell")
    }

    private var compactNavigation: some View {
        TabView(selection: $selection) {
            ForEach(AppSection.allCases) { section in
                destination(for: section)
                    .tabItem { Label(section.title, systemImage: section.icon) }
                    .tag(section)
            }
        }
    }

    private var regularWidthNavigation: some View {
        NavigationSplitView {
            List(AppSection.allCases) { section in
                Button {
                    selection = section
                } label: {
                    Label(section.title, systemImage: section.icon)
                        .font(.body.weight(selection == section ? .semibold : .regular))
                        .foregroundStyle(selection == section ? Color.homeNavy : Color.homeInk)
                        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .listRowBackground(
                    selection == section ? Color.homeNavy.opacity(0.12) : Color.clear
                )
                .accessibilityAddTraits(selection == section ? .isSelected : [])
            }
            .listStyle(.sidebar)
            .scrollContentBackground(.hidden)
            .background(Color.homeCanvas)
            .navigationTitle("GatheredOS")
            .navigationSplitViewColumnWidth(min: 220, ideal: 250, max: 300)
        } detail: {
            destination(for: selection)
        }
        .navigationSplitViewStyle(.balanced)
    }

    @ViewBuilder
    private func destination(for section: AppSection) -> some View {
        switch section {
        case .home: HomeView()
        case .care: CareView()
        case .projects: ProjectsView()
        case .library: LibraryView()
        case .ask: AskView()
        }
    }
}

private enum AppSection: String, CaseIterable, Identifiable {
    case home, care, projects, library, ask

    var id: Self { self }

    var title: String {
        switch self {
        case .home: "Home"
        case .care: "Care"
        case .projects: "Projects"
        case .library: "Library"
        case .ask: "Ask"
        }
    }

    var icon: String {
        switch self {
        case .home: "house.fill"
        case .care: "heart.text.square.fill"
        case .projects: "hammer.fill"
        case .library: "square.grid.2x2.fill"
        case .ask: "sparkles"
        }
    }
}

struct LoadingView: View {
    var body: some View {
        ZStack {
            Color.homeCanvas.ignoresSafeArea()
            ProgressView().tint(Color.homeNavy)
        }
    }
}
