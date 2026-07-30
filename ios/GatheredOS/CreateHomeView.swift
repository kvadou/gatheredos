import SwiftUI

// Shown when someone is signed in but has no home yet (the iOS-first-signup dead
// end). A friendly one-screen create form — the full guided onboarding stays web.
// Mirrors lib/actions/onboarding.ts: insert a homes row with created_by; the DB
// trigger adds the owner membership. Systems/goals/features are web-only.
struct CreateHomeView: View {
    @Environment(SupabaseService.self) private var supabase
    let onCreated: () -> Void

    @State private var name = ""
    @State private var street = ""
    @State private var city = ""
    @State private var state = ""
    @State private var zip = ""
    @State private var saving = false
    @State private var error: String?

    // Address autocomplete. suggestions render in the VStack flow (never an
    // overlay), so they can't cover the Create button. searchTask is the live
    // debounce job — cancelled on every keystroke and on suggestion tap.
    @State private var suggestions: [AddressSuggestion] = []
    @State private var searchTask: Task<Void, Never>?
    @State private var pickCount = 0
    @FocusState private var streetFocused: Bool

    var body: some View {
        ZStack {
            Color.homeCanvas.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    header
                    fields
                    if let error { banner(error) }
                    submit
                    signOut
                }
                .padding(24)
                .adaptiveContentWidth(Theme.Layout.formMaxWidth, alignment: .leading)
                .sensoryFeedback(.selection, trigger: pickCount)
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            Image(systemName: "house.lodge.fill")
                .font(.largeTitle)
                .foregroundStyle(Color.homeNavy)
            Text("Set up your home")
                .font(.largeTitle).fontDesign(.serif).fontWeight(.medium)
                .foregroundStyle(Color.homeInk)
            Text("Just an address to start. You can add the rest anytime in Settings.")
                .font(.title3).fontDesign(.serif)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.top, 48)
        .padding(.bottom, 6)
    }

    private var fields: some View {
        VStack(spacing: 14) {
            // Street first + .streetAddressLine1 so iOS QuickType offers the
            // user's contact-card address above the keyboard.
            streetField
            if !suggestions.isEmpty { suggestionsCard }
            HStack(spacing: 14) {
                LabeledField(icon: "building.2", placeholder: "City", text: $city)
                    .textContentType(.addressCity)
                LabeledField(icon: "flag", placeholder: "State", text: $state)
                    .textContentType(.addressState)
                    .frame(maxWidth: 110)
            }
            LabeledField(icon: "number", placeholder: "ZIP", text: $zip)
                .textContentType(.postalCode)
                .keyboardType(.numbersAndPunctuation)
            LabeledField(icon: "house", placeholder: "Home name (optional)", text: $name)
                .textInputAutocapitalization(.words)
        }
        .onChange(of: street) { _, value in scheduleAddressSearch(value) }
        .onChange(of: streetFocused) { _, focused in
            if !focused { suggestions = [] }   // dismiss on the field losing focus
        }
        .animation(.easeInOut(duration: 0.2), value: suggestions)
    }

    // Inline twin of LabeledField so the street field can carry @FocusState — the
    // shared component (Theme.swift) has no focus binding.
    // ponytail: duplicated styling; fold a focus binding into LabeledField instead
    // once Theme.swift is in scope, then delete this.
    private var streetField: some View {
        HStack(spacing: 12) {
            Image(systemName: "mappin.and.ellipse")
                .foregroundStyle(.secondary)
                .frame(width: 22)
            TextField("Street address", text: $street)
                .font(.body)
                .textContentType(.streetAddressLine1)
                .focused($streetFocused)
        }
        .padding(.vertical, 14)
        .padding(.horizontal, 16)
        .background(Color.homeSurface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(Color.homeInk.opacity(0.08))
        )
    }

    private var suggestionsCard: some View {
        let rows = Array(suggestions.prefix(5))
        return VStack(spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.element) { index, suggestion in
                Button { apply(suggestion) } label: {
                    HStack(spacing: 12) {
                        Image(systemName: "mappin.and.ellipse")
                            .foregroundStyle(Color.homeNavy)
                            .frame(width: 22)
                        Text(suggestion.label)
                            .font(.subheadline)
                            .foregroundStyle(Color.homeInk)
                            .fixedSize(horizontal: false, vertical: true)   // wrap, don't truncate
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .padding(.vertical, 12)
                    .padding(.horizontal, 16)
                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(suggestion.label)
                if index < rows.count - 1 {
                    Divider().padding(.leading, 50)
                }
            }
            HStack {
                Spacer()
                Text("© OpenStreetMap")   // Nominatim license attribution (required)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }
        .background(Color.homeSurface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .shadow(color: Color.homeInk.opacity(0.08), radius: 8, y: 4)
    }

    private var submit: some View {
        Button {
            Task { await create() }
        } label: {
            HStack(spacing: 8) {
                if saving { ProgressView().tint(.white) }
                Text("Create home").fontWeight(.semibold)
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.large)
        .tint(Color.homeNavy)
        .disabled(saving || (name.isBlank && street.isBlank))
    }

    private var signOut: some View {
        Button {
            Task {
                do { try await supabase.signOut() }
                catch { self.error = "Couldn't sign out. \(error.localizedDescription)" }
            }
        } label: {
            Text("Sign out")
                .font(.subheadline)
                .foregroundStyle(Color.homeNavy)
        }
        .frame(maxWidth: .infinity, minHeight: 44)   // HIG: 44pt tap target
        .padding(.top, 4)
    }

    private func banner(_ text: String) -> some View {
        Text(text)
            .font(.footnote)
            .foregroundStyle(.red)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(Color.red.opacity(0.10), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    // Debounced address lookup. Cancels the prior job, waits 300ms, then only
    // shows results if the field is still focused (the post-sleep focus check is
    // what stops a suggestion tap — which sets `street` — from re-searching).
    private func scheduleAddressSearch(_ value: String) {
        searchTask?.cancel()
        let query = value.trimmed
        guard query.count >= 3 else {
            suggestions = []                       // cleared below 3 chars
            return
        }
        searchTask = Task {
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled, streetFocused else { return }
            let results = await supabase.searchAddresses(query: query)
            guard !Task.isCancelled, streetFocused else { return }
            suggestions = results
        }
    }

    // Fill from a tapped suggestion. Dropping focus both dismisses the keyboard
    // and (via onChange) clears the card; the re-search that `street =` triggers
    // bails on the focus check. Manual typing is never blocked by any of this.
    private func apply(_ suggestion: AddressSuggestion) {
        searchTask?.cancel()
        street = suggestion.street
        city = suggestion.city
        state = suggestion.state ?? ""
        zip = suggestion.zip ?? ""
        suggestions = []
        streetFocused = false
        pickCount += 1
    }

    private func create() async {
        guard let uid = supabase.currentUser?.id else { return }
        saving = true
        error = nil
        do {
            _ = try await supabase.createHome(NewHome(
                created_by: uid.uuidString,
                name: derivedName(),
                street: street.isBlank ? nil : street.trimmed,
                city: city.isBlank ? nil : city.trimmed,
                state: state.isBlank ? nil : state.trimmed,
                zip: zip.isBlank ? nil : zip.trimmed
            ))
            onCreated()
        } catch {
            self.error = error.localizedDescription
            saving = false
        }
    }

    // Blank name falls back to the street with its leading house number stripped
    // ("7263 Little Ave NE" -> "Little Ave NE"). Web parity: lib/onboarding.ts homeShortName.
    private func derivedName() -> String {
        if !name.isBlank { return name.trimmed }
        let s = street.trimmed
        let stripped = s.replacingOccurrences(of: #"^\d+\s+"#, with: "", options: .regularExpression)
        return stripped.isEmpty ? s : stripped
    }
}
