import SwiftUI

struct AuthView: View {
    @Environment(SupabaseService.self) private var supabase

    enum Mode {
        case signIn, signUp
        var title: String { self == .signIn ? "Welcome back" : "Create your account" }
        var cta: String { self == .signIn ? "Sign In" : "Sign Up" }
        var toggle: String {
            self == .signIn ? "New to GatheredOS?  Create an account"
                            : "Already have an account?  Sign in"
        }
    }

    @State private var mode: Mode = .signIn
    @State private var name = ""
    @State private var email = ""
    @State private var password = ""
    @State private var error: String?
    @State private var info: String?
    @State private var busy = false

    var body: some View {
        ZStack {
            Color.homeCanvas.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    header
                    fields
                    if let error { banner(error, tint: .red) }
                    if let info { banner(info, tint: Color.homeNavy) }
                    submit
                    toggle
                }
                .padding(24)
                .adaptiveContentWidth(Theme.Layout.formMaxWidth, alignment: .leading)
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            Image(systemName: "house.lodge.fill")
                .font(.largeTitle)
                .foregroundStyle(Color.homeNavy)
            Text("GatheredOS")
                .font(.largeTitle).fontDesign(.serif).fontWeight(.medium)
                .foregroundStyle(Color.homeInk)
            Text(mode.title)
                .font(.title3).fontDesign(.serif)
                .foregroundStyle(.secondary)
        }
        .padding(.top, 48)
        .padding(.bottom, 6)
    }

    private var fields: some View {
        VStack(spacing: 14) {
            if mode == .signUp {
                LabeledField(icon: "person", placeholder: "Name", text: $name)
                    .textContentType(.name)
            }
            LabeledField(icon: "envelope", placeholder: "Email", text: $email)
                .textContentType(.emailAddress)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            LabeledField(icon: "lock", placeholder: "Password", text: $password, secure: true)
                .textContentType(mode == .signIn ? .password : .newPassword)
        }
    }

    private var submit: some View {
        Button {
            Task { await handleSubmit() }
        } label: {
            HStack(spacing: 8) {
                if busy { ProgressView().tint(.white) }
                Text(mode.cta).fontWeight(.semibold)
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.large)
        .tint(Color.homeNavy)
        .disabled(busy || email.isBlank || password.isBlank)
    }

    private var toggle: some View {
        Button {
            withAnimation(.easeInOut(duration: 0.2)) {
                mode = (mode == .signIn) ? .signUp : .signIn
                error = nil
                info = nil
            }
        } label: {
            Text(mode.toggle)
                .font(.subheadline)
                .foregroundStyle(Color.homeNavy)
        }
        .frame(maxWidth: .infinity, minHeight: 44)   // HIG: 44pt tap target
        .padding(.top, 4)
    }

    private func banner(_ text: String, tint: Color) -> some View {
        Text(text)
            .font(.footnote)
            .foregroundStyle(tint)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(tint.opacity(0.10), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func handleSubmit() async {
        busy = true
        error = nil
        info = nil
        defer { busy = false }
        do {
            if mode == .signIn {
                try await supabase.signIn(email: email.trimmed, password: password)
            } else {
                let session = try await supabase.signUp(
                    email: email.trimmed, password: password, name: name.trimmed
                )
                if session == nil {
                    info = "Check your email to confirm your account, then sign in."
                    mode = .signIn
                }
            }
        } catch {
            self.error = error.localizedDescription
        }
    }
}
