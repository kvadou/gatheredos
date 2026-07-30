import SwiftUI
import UIKit

// Settings sheet: edit your name + the home profile, see who's on the home, sign
// out. Mirrors the web /settings page (lib/actions/settings.ts) minus invites —
// those need existing accounts and ship as a web-phase feature.
struct SettingsView: View {
    @Environment(SupabaseService.self) private var supabase
    @Environment(\.dismiss) private var dismiss

    // Profile
    @State private var name = ""
    @State private var email = ""

    // Home
    @State private var homeID = ""
    @State private var homeName = ""
    @State private var street = ""
    @State private var city = ""
    @State private var state = ""
    @State private var zip = ""
    @State private var yearBuilt = ""
    @State private var sqft = ""
    @State private var beds = ""
    @State private var baths = ""

    @State private var members: [Member] = []
    @State private var notifications = NotificationPreferences.defaults
    @State private var loading = true
    @State private var saving = false
    @State private var error: String?
    @State private var saveTick = 0
    @State private var loadError: String?
    @State private var signingOut = false

    var body: some View {
        NavigationStack {
            ZStack {
                Color.homeCanvas.ignoresSafeArea()
                content
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }
                        .fontWeight(.semibold)
                        .disabled(loading || saving || homeName.isBlank)
                }
            }
            .sensoryFeedback(.success, trigger: saveTick)
            .task { await load() }
        }
    }

    @ViewBuilder private var content: some View {
        if loading {
            ProgressView().tint(Color.homeNavy)
        } else if let loadError {
            ContentUnavailableView {
                Label("Couldn't load settings", systemImage: "exclamationmark.triangle")
            } description: { Text(loadError) } actions: {
                Button("Try Again") { Task { await load() } }
            }
        } else {
            Form {
                Section("Profile") {
                    TextField("Name", text: $name)
                        .textContentType(.name)
                    LabeledContent("Email", value: email)
                        .foregroundStyle(.secondary)
                }
                .listRowBackground(Color.homeSurface)

                Section("Membership") {
                    NavigationLink {
                        MembershipView()
                    } label: {
                        Label("GatheredOS Plus research", systemImage: "checkmark.seal")
                    }
                }
                .listRowBackground(Color.homeSurface)

                Section("Home") {
                    TextField("Home name", text: $homeName)
                    TextField("Street", text: $street)
                        .textContentType(.streetAddressLine1)
                    TextField("City", text: $city)
                        .textContentType(.addressCity)
                    TextField("State", text: $state)
                        .textContentType(.addressState)
                    TextField("ZIP", text: $zip)
                        .textContentType(.postalCode)
                        .keyboardType(.numbersAndPunctuation)
                }
                .listRowBackground(Color.homeSurface)

                Section("Property") {
                    numberField("Year built", text: $yearBuilt, keyboard: .numberPad)
                    numberField("Square feet", text: $sqft, keyboard: .numberPad)
                    numberField("Bedrooms", text: $beds, keyboard: .decimalPad)
                    numberField("Bathrooms", text: $baths, keyboard: .decimalPad)
                }
                .listRowBackground(Color.homeSurface)

                Section {
                    Toggle("Safety alerts", isOn: $notifications.safetyAlerts)
                    Toggle("Care reminders", isOn: $notifications.careReminders)
                    Toggle("Warranty alerts", isOn: $notifications.warrantyAlerts)
                    Toggle("Weekly Home Briefing", isOn: $notifications.weeklyDigest)
                } header: {
                    Text("Notifications")
                } footer: {
                    Text("The optional Monday briefing contains only reminders and verified records saved for your home.")
                }
                .tint(Color.homeNavy)
                .listRowBackground(Color.homeSurface)

                Section {
                    ForEach(members) { member in
                        memberRow(member)
                    }
                } header: {
                    Text("Members")
                } footer: {
                    Text("Invite family from the web app at gatherroot.vercel.app.")
                }
                .listRowBackground(Color.homeSurface)

                if let error {
                    Section {
                        Text(error).font(.footnote).foregroundStyle(.red)
                    }
                    .listRowBackground(Color.homeSurface)
                }

                Section {
                    Button(role: .destructive) {
                        Task { await signOut() }
                    } label: {
                        if signingOut { ProgressView() }
                        else { Label("Sign Out", systemImage: "rectangle.portrait.and.arrow.right") }
                    }
                    .disabled(signingOut)
                }
                .listRowBackground(Color.homeSurface)
            }
            .scrollContentBackground(.hidden)
            .adaptiveContentWidth(Theme.Layout.listMaxWidth)
        }
    }

    private func memberRow(_ member: Member) -> some View {
        let displayName = (member.profile?.name).flatMap { $0.isBlank ? nil : $0 } ?? "Member"
        return HStack(spacing: 12) {
            Image(systemName: "person.crop.circle.fill")
                .font(.title2)
                .foregroundStyle(Color.homeNavy)
            VStack(alignment: .leading, spacing: 2) {
                Text(displayName)
                    .font(.body).foregroundStyle(Color.homeInk)
                if let email = member.profile?.email, !email.isBlank {
                    Text(email).font(.subheadline).foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 8)
            Text(member.role.capitalized)
                .font(.caption).fontWeight(.medium)
                .foregroundStyle(Color.homeNavy)
                .padding(.horizontal, 8).padding(.vertical, 4)
                .background(Color.homeNavy.opacity(0.12), in: Capsule())
        }
        .padding(.vertical, 2)
    }

    private func numberField(_ label: String, text: Binding<String>, keyboard: UIKeyboardType) -> some View {
        HStack {
            Text(label).foregroundStyle(Color.homeInk)
            Spacer()
            TextField("—", text: text)
                .keyboardType(keyboard)
                .multilineTextAlignment(.trailing)
                .frame(maxWidth: 120)
        }
    }

    // MARK: - Data

    private func load() async {
        loading = true
        loadError = nil
        do {
        async let profileTask = supabase.profile()
        async let homeTask = supabase.firstHome()
        let profile = try await profileTask
        let home = try await homeTask

        name = profile?.name ?? ""
        email = profile?.email ?? ""

        if let id = home?.id {
            homeID = id
            let detail = try await supabase.homeDetail(id: id)
            async let memTask = supabase.members(homeID: id)
            async let notificationTask = supabase.notificationPreferences(homeID: id)
            let (mem, savedNotifications) = try await (memTask, notificationTask)
                homeName = detail.name
                street = detail.street ?? ""
                city = detail.city ?? ""
                state = detail.state ?? ""
                zip = detail.zip ?? ""
                yearBuilt = detail.yearBuilt.map(String.init) ?? ""
                sqft = detail.sqft.map(String.init) ?? ""
                beds = Self.numString(detail.beds)
                baths = Self.numString(detail.baths)
            members = mem
            notifications = savedNotifications
        }
        } catch { loadError = error.localizedDescription }
        loading = false
    }

    private func signOut() async {
        signingOut = true
        error = nil
        do { try await supabase.signOut(); dismiss() }
        catch { self.error = "Couldn't sign out. \(error.localizedDescription)"; signingOut = false }
    }

    private func save() async {
        saving = true
        error = nil
        do {
            let trimmedName = name.trimmed
            if !trimmedName.isEmpty { try await supabase.updateProfileName(trimmedName) }
            try await supabase.updateHome(id: homeID, HomeUpdate(
                name: homeName.trimmed,
                street: street.isBlank ? nil : street.trimmed,
                city: city.isBlank ? nil : city.trimmed,
                state: state.isBlank ? nil : state.trimmed,
                zip: zip.isBlank ? nil : zip.trimmed,
                year_built: Self.parseInt(yearBuilt),
                sqft: Self.parseInt(sqft),
                beds: Self.parseNum(beds),
                baths: Self.parseNum(baths)
            ))
            try await supabase.updateNotificationPreferences(homeID: homeID, preferences: notifications)
            saveTick += 1
            dismiss()
        } catch {
            self.error = error.localizedDescription
            saving = false
        }
    }

    // MARK: - Number helpers (mirror lib/actions/onboarding.ts toInt/toNum)

    static func parseInt(_ s: String) -> Int? {
        let digits = s.filter(\.isNumber)
        return digits.isEmpty ? nil : Int(digits)
    }

    static func parseNum(_ s: String) -> Double? {
        let cleaned = s.filter { $0.isNumber || $0 == "." }
        return cleaned.isEmpty ? nil : Double(cleaned)
    }

    /// Whole numbers render without a trailing ".0"; halves keep their decimal.
    static func numString(_ v: Double?) -> String {
        guard let v else { return "" }
        return v == v.rounded() ? String(Int(v)) : String(v)
    }
}
