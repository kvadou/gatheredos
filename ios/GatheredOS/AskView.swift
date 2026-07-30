import SwiftUI

struct AskView: View {
    @Environment(SupabaseService.self) private var supabase

    @State private var messages: [AskMessage] = []
    @State private var input: String
    @State private var busy = false
    @State private var conversationId: String?
    @State private var completions = 0   // increments per finished answer → success haptic

    init(initialDraft: String = "") {
        _input = State(initialValue: initialDraft)
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Color.homeCanvas.ignoresSafeArea()
                ScrollViewReader { proxy in
                    ScrollView {
                        if messages.isEmpty {
                            emptyState
                                .padding(.horizontal, 20)
                                .padding(.top, Theme.Spacing.small)
                                .adaptiveContentWidth(Theme.Layout.conversationMaxWidth, alignment: .leading)
                        } else {
                            LazyVStack(alignment: .leading, spacing: 18) {
                                ForEach(messages) { message in
                                    bubble(message).id(message.id)
                                }
                                Color.clear.frame(height: 1).id(bottomAnchor)
                            }
                            .padding(20)
                            .adaptiveContentWidth(Theme.Layout.conversationMaxWidth, alignment: .leading)
                        }
                    }
                    .scrollDismissesKeyboard(.interactively)
                    .onChange(of: scrollKey) {
                        withAnimation(.easeOut(duration: 0.2)) {
                            proxy.scrollTo(bottomAnchor, anchor: .bottom)
                        }
                    }
                }
            }
            .navigationTitle("Ask")
            .navigationBarTitleDisplayMode(.inline)
            .safeAreaInset(edge: .bottom) { composer }
            .sensoryFeedback(.success, trigger: completions)
        }
    }

    // MARK: - Empty state

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.large) {
            VStack(alignment: .leading, spacing: 10) {
                Image(systemName: "sparkles")
                    .font(.largeTitle)
                    .foregroundStyle(Color.homeNavy)
                Text("What would you like to know?")
                    .font(.largeTitle).fontDesign(.serif).fontWeight(.medium)
                    .foregroundStyle(Color.homeInk)
                    .fixedSize(horizontal: false, vertical: true)
                Text("Ask about anything in your home. GatheredOS answers from your own documents, history, and records.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            VStack(spacing: 0) {
                ForEach(Array(starterChips.enumerated()), id: \.element.id) { index, chip in
                    Button { Task { await send(chip.text) } } label: {
                        HStack(spacing: 12) {
                            Image(systemName: chip.icon)
                                .font(.body)
                                .foregroundStyle(Color.homeNavy)
                                .frame(width: 24)
                            Text(chip.text)
                                .font(.subheadline).fontWeight(.medium)
                                .foregroundStyle(Color.homeInk)
                                .frame(maxWidth: .infinity, alignment: .leading)
                            Image(systemName: "arrow.up.right")
                                .font(.footnote)
                                .foregroundStyle(.tertiary)
                        }
                        .padding(.vertical, 12)
                        .padding(.horizontal, 16)
                        .frame(minHeight: 52)
                    }
                    .buttonStyle(.plain)
                    if index < starterChips.count - 1 {
                        Divider().padding(.leading, 52)
                    }
                }
            }
            .background(Color.homeSurface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Color.homeInk.opacity(0.06)))
        }
    }

    // MARK: - Message bubbles

    @ViewBuilder
    private func bubble(_ message: AskMessage) -> some View {
        switch message.role {
        case .user:
            HStack {
                Spacer(minLength: 40)
                Text(message.text)
                    .font(.body)
                    .foregroundStyle(.white)
                    .padding(.vertical, 10)
                    .padding(.horizontal, 16)
                    .background(Color.homeNavy, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            }
        case .assistant:
            answerCard(message)
        }
    }

    private func answerCard(_ message: AskMessage) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 8) {
                Image(systemName: "sparkles")
                    .font(.footnote)
                    .foregroundStyle(.white)
                    .frame(width: 26, height: 26)
                    .background(Color.homeNavy, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
                Text("GatheredOS")
                    .font(.subheadline).fontWeight(.semibold)
                    .foregroundStyle(Color.homeInk)
            }

            if message.failed {
                Label(message.text, systemImage: "exclamationmark.triangle")
                    .font(.subheadline)
                    .foregroundStyle(.orange)
            } else if message.text.isEmpty && message.streaming {
                HStack(spacing: 10) {
                    ProgressView().controlSize(.small).tint(Color.homeNavy)
                    Text("GatheredOS is thinking")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            } else {
                ForEach(Array(paragraphs(message.text).enumerated()), id: \.offset) { i, para in
                    Text(para)
                        .font(.body)
                        .foregroundStyle(i == 0 ? Color.homeInk : Color.homeInk.opacity(0.82))
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }

            if !message.streaming && showSources(message.citations) {
                sources(message.citations)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(Color.homeSurface, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .strokeBorder(Color.homeInk.opacity(0.06))
        )
    }

    // Mirror the web: the Sources strip appears only when at least one citation
    // is grounded in the home's records (all-general answers show none).
    private func showSources(_ citations: [AskCitation]) -> Bool {
        citations.contains { $0.type != "general" }
    }

    private func sources(_ citations: [AskCitation]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("SOURCES")
                .font(.caption2).fontWeight(.semibold).tracking(0.6)
                .foregroundStyle(.secondary)
            ForEach(Array(citations.enumerated()), id: \.element.id) { i, c in
                HStack(alignment: .top, spacing: 10) {
                    Text("\(i + 1)")
                        .font(.caption2).fontWeight(.semibold).monospacedDigit()
                        .foregroundStyle(confidenceColor(c.confidence))
                        .frame(width: 18, height: 18)
                        .background(
                            confidenceColor(c.confidence).opacity(0.16),
                            in: RoundedRectangle(cornerRadius: 5, style: .continuous)
                        )
                    VStack(alignment: .leading, spacing: 1) {
                        Text(c.label)
                            .font(.footnote).fontWeight(.medium)
                            .foregroundStyle(Color.homeInk)
                        if c.type == "general" {
                            Text("General guidance, not from your records")
                                .font(.caption).foregroundStyle(.secondary)
                        } else if let detail = c.detail, !detail.isEmpty {
                            Text(detail).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
        .padding(.top, 4)
    }

    // Confidence tint — semantic system colors so Dark Mode + contrast hold up
    // without adding asset-catalog colors this agent doesn't own.
    private func confidenceColor(_ confidence: String) -> Color {
        switch confidence {
        case "known": return .green        // grounded in a record
        case "estimated": return .orange   // derived from the home profile
        default: return Color(.secondaryLabel)   // general guidance
        }
    }

    // MARK: - Composer

    private var sendEnabled: Bool { !busy && !input.trimmed.isEmpty }

    private var composer: some View {
        HStack(alignment: .bottom, spacing: 10) {
            TextField("Ask about your home", text: $input, axis: .vertical)
                .font(.body)
                .lineLimit(1...5)
                .foregroundStyle(Color.homeInk)
                .padding(.vertical, 10)
                .padding(.horizontal, 16)
                .background(Color.homeSurface, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .strokeBorder(Color.homeInk.opacity(0.08))
                )

            Button { Task { await send(input) } } label: {
                Group {
                    if busy {
                        ProgressView().tint(.white)
                    } else {
                        Image(systemName: "arrow.up").font(.headline).fontWeight(.bold)
                    }
                }
                .foregroundStyle(.white)
                .frame(width: 44, height: 44)
                .background(
                    sendEnabled ? Color.homeNavy : Color.homeNavy.opacity(0.35),
                    in: Circle()
                )
            }
            .accessibilityLabel("Send")
            .disabled(!sendEnabled)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .adaptiveContentWidth(Theme.Layout.conversationMaxWidth)
        .background(Color.homeCanvas)
        .overlay(alignment: .top) { Divider() }
    }

    // MARK: - Networking

    @MainActor
    private func send(_ raw: String) async {
        let question = raw.trimmed
        guard !question.isEmpty, !busy else { return }
        input = ""
        busy = true
        defer { busy = false }

        messages.append(AskMessage(role: .user, text: question))
        messages.append(AskMessage(role: .assistant, text: "", streaming: true))
        let idx = messages.count - 1   // stable: sends are serialized by `busy`

        do {
            var request = URLRequest(url: Config.apiBaseURL.appendingPathComponent("api/ask"))
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            if let token = await supabase.accessToken() {
                request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            }
            var payload: [String: String] = ["question": question]
            if let conversationId { payload["conversationId"] = conversationId }
            request.httpBody = try JSONSerialization.data(withJSONObject: payload)

            let (bytes, response) = try await URLSession.shared.bytes(for: request)
            if let http = response as? HTTPURLResponse {
                if let cid = http.value(forHTTPHeaderField: "x-conversation-id"), !cid.isEmpty {
                    conversationId = cid
                }
                guard (200..<300).contains(http.statusCode) else { throw URLError(.badServerResponse) }
            }

            // Accumulate raw bytes and re-decode the whole buffer on a ~25fps
            // throttle. Decoding can fail mid multi-byte character → skip that
            // flush and retry on the next byte.
            var data = Data()
            var lastFlush = Date.distantPast
            for try await byte in bytes {
                data.append(byte)
                let now = Date()
                if now.timeIntervalSince(lastFlush) > 0.04, let s = String(data: data, encoding: .utf8) {
                    messages[idx].text = stripCitationMarkers(visibleAnswerText(s, streaming: true))
                    lastFlush = now
                }
            }

            let full = String(data: data, encoding: .utf8) ?? ""
            let visible = visibleAnswerText(full)   // markers intact — usedCitations reads them
            messages[idx].text = stripCitationMarkers(visible)
            messages[idx].citations = usedCitations(visible, parseCitations(full))
            messages[idx].streaming = false
            completions += 1
        } catch {
            messages[idx].text = "Couldn't reach GatheredOS. Try again."
            messages[idx].streaming = false
            messages[idx].failed = true
        }
    }

    // MARK: - Prose helpers

    private func paragraphs(_ text: String) -> [String] {
        text.components(separatedBy: "\n\n")
            .map { $0.replacingOccurrences(of: "**", with: "").trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }

    private var scrollKey: String { "\(messages.count)-\(messages.last?.text.count ?? 0)" }
    private let bottomAnchor = "ask-bottom-anchor"

    private struct Starter: Identifiable {
        let id = UUID()
        let text: String
        let icon: String
    }

    // First four of the web's starterQuestions (lib/ask-data.ts), SF Symbol icons.
    private let starterChips: [Starter] = [
        .init(text: "When should I replace my water heater?", icon: "flame"),
        .init(text: "Where is my water shutoff?", icon: "drop"),
        .init(text: "What maintenance should I do before winter?", icon: "snowflake"),
        .init(text: "Who serviced my HVAC last?", icon: "wind"),
    ]
}

// MARK: - Model

private struct AskMessage: Identifiable {
    let id = UUID()
    let role: Role
    var text: String
    var citations: [AskCitation] = []
    var streaming = false
    var failed = false

    enum Role { case user, assistant }
}

private struct AskCitation: Identifiable, Hashable {
    let id: String
    let type: String
    let refId: String?
    let label: String
    let detail: String?
    let confidence: String
}

// MARK: - Citation stream protocol (mirrors lib/ask-data.ts)

private let citationSentinel = "@@CITATIONS@@"

private let citationTypes: Set<String> = [
    "item", "file", "care_event", "care_task", "project", "contractor",
    "timeline", "home_fact", "warranty", "extraction", "home_profile", "general",
]
private let citationConfidences: Set<String> = ["known", "estimated", "general"]

/// Prose before the sentinel. While streaming, also hold back a trailing partial
/// sentinel (e.g. a buffer ending "…@@CIT") so a half-arrived marker never flashes.
private func visibleAnswerText(_ buffer: String, streaming: Bool = false) -> String {
    if let r = buffer.range(of: citationSentinel) {
        return String(buffer[..<r.lowerBound])
    }
    guard streaming else { return buffer }
    let maxN = min(citationSentinel.count - 1, buffer.count)
    if maxN >= 1 {
        for n in stride(from: maxN, through: 1, by: -1) where buffer.hasSuffix(String(citationSentinel.prefix(n))) {
            return String(buffer.dropLast(n))
        }
    }
    return buffer
}

/// Parse the JSON array after the sentinel. Tolerates absence, surrounding
/// whitespace, and malformed tails → []. Normalizes type/confidence the same way
/// the web does: an unknown type (or a confidence on a general citation) reads grey.
private func parseCitations(_ buffer: String) -> [AskCitation] {
    guard let r = buffer.range(of: citationSentinel) else { return [] }
    let tail = buffer[r.upperBound...]
    guard let start = tail.firstIndex(of: "["),
          let end = tail.lastIndex(of: "]"),
          start <= end else { return [] }
    let json = String(tail[start...end])
    guard let data = json.data(using: .utf8),
          let raw = try? JSONDecoder().decode([RawCitation].self, from: data) else { return [] }
    return raw.compactMap { c in
        guard let id = c.id, let label = c.label else { return nil }
        let type = citationTypes.contains(c.type ?? "") ? c.type! : "general"
        let confidence = (type != "general" && citationConfidences.contains(c.confidence ?? ""))
            ? c.confidence! : "general"
        return AskCitation(
            id: id,
            type: type,
            refId: type == "general" ? nil : c.ref_id,
            label: label,
            detail: c.detail,
            confidence: confidence
        )
    }
}

/// Keep only citations actually referenced by a [cN] marker in the prose.
private func usedCitations(_ text: String, _ citations: [AskCitation]) -> [AskCitation] {
    citations.filter { text.contains("[\($0.id)]") }
}

/// Strip inline [cN] markers (with a preceding space) — iOS renders sources as a
/// separate strip, not inline chips like the web.
private func stripCitationMarkers(_ text: String) -> String {
    guard let regex = try? Regex("\\s?\\[c\\d+\\]") else { return text }
    return text.replacing(regex, with: "")
}

private struct RawCitation: Decodable {
    let id: String?
    let type: String?
    let ref_id: String?
    let label: String?
    let detail: String?
    let confidence: String?
}
