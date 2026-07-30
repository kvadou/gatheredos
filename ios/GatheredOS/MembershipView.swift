import SwiftUI

struct MembershipView: View {
    @Environment(SupabaseService.self) private var supabase
    @State private var annual = true
    @State private var saving = false
    @State private var saved = false
    @State private var error: String?

    private let benefits = [
        "Proactive Home Briefings and lifecycle intelligence",
        "Deeper cited answers and advanced home reports",
        "Household collaboration and handoff workflows",
        "Connected-source imports and future integrations",
        "Concierge provider coordination where available"
    ]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("PRICE RESEARCH").font(.caption.weight(.semibold)).tracking(1.4).foregroundStyle(Color.homeNavy)
                    Text("More help, never less ownership.").font(.largeTitle.weight(.semibold)).foregroundStyle(Color.homeInk)
                    Text("We are testing what ongoing intelligence is worth before turning on billing.").foregroundStyle(.secondary)
                }

                VStack(alignment: .leading, spacing: 18) {
                    HStack {
                        Text("GatheredOS Plus").font(.title2.weight(.semibold))
                        Spacer()
                        Image(systemName: "checkmark.shield").foregroundStyle(Color.homeNavy)
                    }
                    Picker("Billing period", selection: $annual) {
                        Text("Annual").tag(true)
                        Text("Monthly").tag(false)
                    }.pickerStyle(.segmented)
                    Text(annual ? "$99/year" : "$12/month").font(.largeTitle.weight(.semibold))
                    if annual { Text("Equivalent to $8.25/month").font(.subheadline).foregroundStyle(.secondary) }
                    ForEach(benefits, id: \.self) { benefit in
                        Label(benefit, systemImage: "checkmark").font(.subheadline)
                    }
                    Divider()
                    Text("If this were available at \(annual ? "$99/year" : "$12/month"), what would you do?").font(.headline)
                    Button("Request early access") { submit("early_access") }.buttonStyle(.borderedProminent).tint(Color.homeNavy).disabled(saving)
                    HStack {
                        Button("Likely") { submit("likely") }.buttonStyle(.bordered)
                        Button("Maybe") { submit("maybe") }.buttonStyle(.bordered)
                        Button("Not now") { submit("not_now") }.buttonStyle(.borderless)
                    }.disabled(saving)
                    Text("This records your preference only. You will not be charged, and no trial begins.").font(.footnote).foregroundStyle(.secondary)
                    if saved { Label("Preference saved", systemImage: "checkmark.circle.fill").font(.subheadline).foregroundStyle(Color.homeNavy) }
                    if let error { Text(error).font(.footnote).foregroundStyle(.red) }
                }
                .padding(20)
                .background(Color.homeSurface, in: RoundedRectangle(cornerRadius: 24))

                VStack(alignment: .leading, spacing: 12) {
                    Text("Free stays useful").font(.title3.weight(.semibold))
                    Label("Your complete home record stays usable", systemImage: "checkmark")
                    Label("You can always edit, delete, and export your data", systemImage: "checkmark")
                    Label("Basic care, safety information, and grounded answers remain available", systemImage: "checkmark")
                }.font(.subheadline).foregroundStyle(.secondary)
            }
            .padding()
            .adaptiveContentWidth(Theme.Layout.formMaxWidth, alignment: .leading)
        }
        .background(Color.homeCanvas.ignoresSafeArea())
        .navigationTitle("Membership")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func submit(_ response: String) {
        saving = true
        saved = false
        error = nil
        Task {
            do {
                try await supabase.submitMonetizationResponse(response: response, billingPeriod: annual ? "year" : "month")
                saved = true
            } catch { self.error = "Your preference couldn't be saved. Please try again." }
            saving = false
        }
    }
}
