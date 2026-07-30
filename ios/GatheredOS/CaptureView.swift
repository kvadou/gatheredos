import SwiftUI
import PhotosUI
import CryptoKit
import UIKit
import Vision
import VisionKit

// Camera / receipt capture. Presented as a sheet from the Library toolbar.
// Two entry points share one flow: a "receipt" defaults to the camera (a scan),
// a "photo" defaults to the library. The camera is offered only where it exists
// (the simulator has none), so the PhotosPicker path is always available.

enum CaptureKind {
    case receipt, photo

    var fileType: String { self == .receipt ? "receipt" : "photo" }
    var title: String { self == .receipt ? "Scan Receipt" : "Identify Item" }
    var heroSymbol: String { self == .receipt ? "doc.text.viewfinder" : "viewfinder" }
    var prefersCamera: Bool { self == .receipt }
}

struct CaptureView: View {
    @Environment(SupabaseService.self) private var supabase
    @Environment(\.dismiss) private var dismiss

    let kind: CaptureKind
    let homeID: String
    var onOpenItem: ((String) -> Void)? = nil
    let onSaved: () async -> Void

    private enum Phase {
        case choosing, uploading, resolving, analyzing(String?), done, delayed, duplicate, failed
        case identified(String), outOfScopeMatch(String, String), review(ScanSuggestion), excluded(String?), noMatch
    }

    @State private var phase: Phase = .choosing
    @State private var message: String?
    @State private var photoItem: PhotosPickerItem?
    @State private var showCamera = false
    @State private var showLiveScanner = false
    @State private var showLibrary = false
    @State private var savedTick = 0   // .success haptic trigger
    @State private var savedFileID: String?
    @State private var feedbackSent = false
    @State private var rejectedReason: String?

    private var cameraAvailable: Bool { UIImagePickerController.isSourceTypeAvailable(.camera) }

    var body: some View {
        NavigationStack {
            ZStack {
                Color.homeCanvas.ignoresSafeArea()
                ScrollView {
                    content
                        .frame(maxWidth: .infinity, alignment: .top)
                        .padding(.horizontal, 24)
                        .padding(.top, Theme.Spacing.xLarge)
                        .padding(.bottom, Theme.Spacing.xLarge)
                }
                .scrollBounceBehavior(.basedOnSize)
            }
            .navigationTitle(kind.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .fullScreenCover(isPresented: $showCamera) {
                CameraPicker { picked in
                    showCamera = false
                    if let picked { Task { await handle(picked) } }
                }
                .ignoresSafeArea()
            }
            .fullScreenCover(isPresented: $showLiveScanner) {
                LiveItemScanner { image, evidence in
                    showLiveScanner = false
                    if let itemID = evidence?.gatheredOSItemID {
                        dismiss()
                        onOpenItem?(itemID)
                    } else if let image { Task { await handle(image, liveEvidence: evidence) } }
                }
            }
            .photosPicker(isPresented: $showLibrary, selection: $photoItem, matching: .images)
            .onChange(of: photoItem) { _, item in
                guard let item else { return }
                Task { await loadFromLibrary(item) }
            }
            .task { presentInitialSource() }
            .alert("Not a household item", isPresented: Binding(
                get: { rejectedReason != nil },
                set: { if !$0 { rejectedReason = nil } }
            )) {
                Button("OK", role: .cancel) { rejectedReason = nil }
            } message: {
                Text(rejectedReason ?? "GatheredOS did not add this scan.")
            }
            .sensoryFeedback(.success, trigger: savedTick)
        }
        .presentationDetents([.medium, .large])
    }

    @ViewBuilder private var content: some View {
        switch phase {
        case .choosing:
            VStack(spacing: 22) {
                Image(systemName: kind.heroSymbol)
                    .font(.largeTitle)
                    .foregroundStyle(Color.homeNavy)
                Text(kind == .receipt
                     ? "Snap a receipt and we'll file it, then pull out the vendor, cost, and warranty automatically."
                     : "Photograph an item, data plate, QR code, or barcode and we'll identify what we can.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                VStack(spacing: 12) {
                    if cameraAvailable {
                        Button { openCamera() } label: {
                            Label(kind == .photo ? "Scan Live" : "Take Photo", systemImage: "camera.fill").frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.large)
                        .tint(Color.homeNavy)
                    }
                    Button { showLibrary = true } label: {
                        Label("Choose from Library", systemImage: "photo.on.rectangle").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.large)
                    .tint(Color.homeNavy)
                }
            }

        case .uploading:
            VStack(spacing: 14) {
                ProgressView().tint(Color.homeNavy)
                Text("Saving photo…").font(.subheadline).foregroundStyle(.secondary)
            }

        case .resolving:
            VStack(spacing: 14) {
                ProgressView().tint(Color.homeNavy)
                Text("Saving your choice…").font(.subheadline).foregroundStyle(.secondary)
            }

        case .analyzing(let code):
            VStack(spacing: 14) {
                ProgressView().tint(Color.homeNavy)
                Text("Identifying item…").font(.headline).foregroundStyle(Color.homeInk)
                Text(code.map { "Code detected: \($0)\nChecking the photo and label details. This usually takes 10–30 seconds." }
                     ?? "Checking the photo, label text, and product details. This usually takes 10–30 seconds.")
                    .font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
            }

        case .done:
            result(icon: "checkmark.circle.fill", tint: .green,
                   title: "Saved to your Library",
                   subtitle: kind == .receipt ? "GatheredOS is reading the receipt now." : "The photo is saved with your home records.")

        case .delayed:
            result(icon: "clock", tint: Color.homeNavy,
                   title: "Still identifying this item",
                   subtitle: "The photo and code are saved safely. GatheredOS will finish processing them in your Library.")

        case .identified(let name):
            VStack(spacing: 14) {
                Image(systemName: "checkmark.circle.fill").font(.largeTitle).foregroundStyle(.green)
                Text("Matched to \(name)").font(.headline).foregroundStyle(Color.homeInk)
                Text("The photo and detected code are now attached to this item.")
                    .font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
                scanFeedbackButtons()
                Button("Done") { Task { await onSaved(); dismiss() } }
                    .buttonStyle(.borderedProminent).controlSize(.large).tint(Color.homeNavy)
                    .frame(maxWidth: .infinity, minHeight: 44)
            }

        case .outOfScopeMatch(let itemID, let name):
            VStack(spacing: 14) {
                Image(systemName: "line.3.horizontal.decrease.circle")
                    .font(.largeTitle).foregroundStyle(.orange)
                Text("This may not belong in GatheredOS")
                    .font(.headline).foregroundStyle(Color.homeInk)
                Text("\(name) appears to be food or another consumable, not a durable part of your home.")
                    .font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
                Button("Remove from GatheredOS") { Task { await removeOutOfScopeMatch(itemID: itemID) } }
                    .buttonStyle(.borderedProminent).controlSize(.large).tint(Color.homeNavy)
                    .frame(maxWidth: .infinity, minHeight: 44)
                Button("Keep anyway") { phase = .identified(name) }
                    .buttonStyle(.bordered).controlSize(.large).tint(Color.homeNavy)
                    .frame(maxWidth: .infinity, minHeight: 44)
                Button("Wrong match") { Task { await detachWrongMatch() } }
                    .buttonStyle(.plain).font(.footnote).foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, minHeight: 44)
            }

        case .review(let suggestion):
            reviewResult(suggestion)

        case .excluded(let reason):
            result(icon: "checkmark.circle", tint: Color.homeNavy,
                   title: "Not added",
                   subtitle: [reason, "The scan was removed. GatheredOS will focus on durable things connected to your home."]
                    .compactMap { $0 }.joined(separator: " "))

        case .noMatch:
            VStack(spacing: 14) {
                Image(systemName: "questionmark.circle").font(.largeTitle).foregroundStyle(Color.homeNavy)
                Text("We couldn’t identify the item yet").font(.headline).foregroundStyle(Color.homeInk)
                Text("The photo is saved. Fill the frame with the manufacturer, model, and serial number, then scan again.")
                    .font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
                Button("Scan Label Again") { phase = .choosing; openCamera() }
                    .buttonStyle(.borderedProminent).controlSize(.large).tint(Color.homeNavy)
                    .frame(maxWidth: .infinity, minHeight: 44)
                if !feedbackSent {
                    Button("The label wasn't readable") {
                        Task { await sendFeedback(outcome: "no_match", reason: "label_unreadable") }
                    }
                    .buttonStyle(.bordered).controlSize(.large).tint(Color.homeNavy)
                } else {
                    Text("Thanks—this helps improve identification.")
                        .font(.caption).foregroundStyle(.secondary)
                }
                Button("Done") { Task { await onSaved(); dismiss() } }
                    .buttonStyle(.bordered).controlSize(.large).tint(Color.homeNavy)
                    .frame(maxWidth: .infinity, minHeight: 44)
            }

        case .duplicate:
            result(icon: "checkmark.seal.fill", tint: Color.homeNavy,
                   title: "Already in your Library",
                   subtitle: "This exact file is already saved, nothing to add.")

        case .failed:
            result(icon: "exclamationmark.triangle.fill", tint: .orange,
                   title: "Couldn't save that", subtitle: message ?? "Please try again.")
        }
    }

    private func result(icon: String, tint: Color, title: String, subtitle: String) -> some View {
        VStack(spacing: 14) {
            Image(systemName: icon).font(.largeTitle).foregroundStyle(tint)
            Text(title).font(.headline).foregroundStyle(Color.homeInk)
            Text(subtitle).font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
            Button("Done") { Task { await onSaved(); dismiss() } }
                .buttonStyle(.borderedProminent).controlSize(.large).tint(Color.homeNavy)
                .frame(maxWidth: .infinity, minHeight: 44)
                .padding(.top, 6)
        }
    }

    private func reviewResult(_ suggestion: ScanSuggestion) -> some View {
        VStack(spacing: 14) {
            Image(systemName: suggestion.isOutOfScope ? "line.3.horizontal.decrease.circle" : "sparkles")
                .font(.largeTitle)
                .foregroundStyle(suggestion.isOutOfScope ? .orange : Color.homeNavy)
            Text(suggestion.isOutOfScope ? "This may not belong in GatheredOS" : "Item identified")
                .font(.headline).foregroundStyle(Color.homeInk)
            Text(suggestion.isOutOfScope
                 ? (suggestion.scopeReason ?? "This appears to be a consumable rather than a durable part of your home.")
                 : suggestion.summary)
                .font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
            if suggestion.isOutOfScope {
                Button("Don’t add") { Task { await resolve(suggestion, accept: false, removeEvidence: true) } }
                    .buttonStyle(.borderedProminent).controlSize(.large).tint(Color.homeNavy)
                    .frame(maxWidth: .infinity, minHeight: 44)
                Button("Add anyway") { Task { await resolve(suggestion, accept: true) } }
                    .buttonStyle(.bordered).controlSize(.large).tint(Color.homeNavy)
                    .frame(maxWidth: .infinity, minHeight: 44)
                Button("Identification is wrong") { Task { await resolve(suggestion, accept: false) } }
                    .buttonStyle(.plain).font(.footnote).foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, minHeight: 44)
            } else {
                Button("Add this item") { Task { await resolve(suggestion, accept: true) } }
                    .buttonStyle(.borderedProminent).controlSize(.large).tint(Color.homeNavy)
                    .frame(maxWidth: .infinity, minHeight: 44)
                Button("Not this item") { Task { await resolve(suggestion, accept: false) } }
                    .buttonStyle(.bordered).controlSize(.large).tint(Color.homeNavy)
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
        }
    }

    // MARK: - Flow

    private func presentInitialSource() {
        if kind.prefersCamera && cameraAvailable {
            showCamera = true
        } else if kind == .photo && DataScannerViewController.isSupported && DataScannerViewController.isAvailable {
            showLiveScanner = true
        } else {
            showLibrary = true
        }
    }

    private func openCamera() {
        if kind == .photo && DataScannerViewController.isSupported && DataScannerViewController.isAvailable {
            showLiveScanner = true
        } else {
            showCamera = true
        }
    }

    private func loadFromLibrary(_ item: PhotosPickerItem) async {
        guard let data = try? await item.loadTransferable(type: Data.self),
              let image = UIImage(data: data) else {
            phase = .failed
            message = "Couldn't read that image."
            return
        }
        await handle(image)
    }

    @MainActor
    private func handle(_ image: UIImage, liveEvidence: LiveScanEvidence? = nil) async {
        phase = .uploading
        message = nil
        guard let jpeg = Self.downscaledJPEG(image) else {
            phase = .failed
            message = "Couldn't process that image."
            return
        }
        let hash = Self.sha256Hex(jpeg)
        let name = Self.captureName(kind: kind)
        let code = liveEvidence?.code ?? Self.detectBarcode(in: image)
        var metadata: [String: String] = [:]
        if let code {
            metadata["scan_code"] = code.value
            metadata["scan_format"] = code.format
        }
        let scanText = [liveEvidence?.text, Self.detectText(in: image)]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: "\n")
        if !scanText.isEmpty {
            metadata["scan_text"] = String(scanText.prefix(4000))
        }
        do {
            let path = try await supabase.uploadReceipt(data: jpeg, homeID: homeID)
            do {
                let fileId = try await supabase.insertFile(
                    homeID: homeID, name: name, type: kind.fileType,
                    storagePath: path, contentHash: hash,
                    extractionStatus: "pending", metadata: metadata
                )
                savedFileID = fileId
                try await supabase.ingestRemote(fileId: fileId)
                savedTick += 1
                if kind == .photo {
                    phase = .analyzing(code.map { String($0.value.prefix(80)) })
                    await waitForScanOutcome(fileId: fileId)
                } else {
                    phase = .done
                }
            } catch is IngestError {
                try? await supabase.removeFile(path: path)          // drop the orphaned duplicate
                phase = .duplicate
            }
        } catch {
            phase = .failed
            message = error.localizedDescription
        }
    }

    @ViewBuilder
    private func scanFeedbackButtons() -> some View {
        if feedbackSent {
            Text("Thanks—this helps improve identification.")
                .font(.caption).foregroundStyle(.secondary)
        } else {
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 10) { feedbackActions }
                VStack(spacing: 8) { feedbackActions }
            }
        }
    }

    @ViewBuilder private var feedbackActions: some View {
        Button("Looks right") { Task { await sendFeedback(outcome: "correct") } }
            .buttonStyle(.bordered).tint(Color.homeNavy)
            .frame(minHeight: 44)
        Button("Wrong item") { Task { await sendFeedback(outcome: "incorrect", reason: "wrong_item") } }
            .buttonStyle(.bordered).tint(Color.homeNavy)
            .frame(minHeight: 44)
    }

    @MainActor
    private func sendFeedback(outcome: String, reason: String? = nil) async {
        guard let savedFileID, !feedbackSent else { return }
        do {
            try await supabase.submitScanFeedback(fileId: savedFileID, outcome: outcome, reason: reason)
            feedbackSent = true
        } catch {
            message = "Couldn't send feedback right now. Your scan is still saved."
        }
    }

    @MainActor
    private func waitForScanOutcome(fileId: String) async {
        for _ in 0..<18 {
            try? await Task.sleep(for: .seconds(2))
            do {
                switch try await supabase.scanOutcome(fileId: fileId) {
                case .processing: continue
                case .matched(let itemName): phase = .identified(itemName)
                case .outOfScopeMatch(let itemID, let itemName): phase = .outOfScopeMatch(itemID, itemName)
                case .outOfScope(let reason):
                    await rejectOutOfScope(fileId: fileId, reason: reason)
                case .needsReview(let suggestion): phase = .review(suggestion)
                case .noMatch: phase = .noMatch
                case .failed:
                    phase = .failed
                    message = "GatheredOS saved the photo but couldn’t analyze it. Try scanning the label again."
                }
                return
            } catch {
                // A transient poll failure should not discard the successfully saved photo.
                continue
            }
        }
        phase = .delayed
    }

    @MainActor
    private func rejectOutOfScope(fileId: String, reason: String) async {
        phase = .resolving
        do {
            try await supabase.removeScanFile(id: fileId)
            savedFileID = nil
            await onSaved()
            phase = .excluded(reason)
            rejectedReason = reason
        } catch {
            phase = .failed
            message = "GatheredOS rejected this scan but couldn't remove the saved photo. Please try again."
        }
    }

    @MainActor
    private func removeOutOfScopeMatch(itemID: String) async {
        phase = .resolving
        do {
            if let savedFileID { try await supabase.removeScanFile(id: savedFileID) }
            try await supabase.deleteItem(id: itemID)
            await onSaved()
            phase = .excluded("This appears to be food or another consumable, not a durable part of your home.")
        } catch {
            phase = .failed
            message = "Couldn't remove that record. Please try again."
        }
    }

    @MainActor
    private func detachWrongMatch() async {
        phase = .resolving
        do {
            if let savedFileID { try await supabase.detachFile(id: savedFileID) }
            phase = .noMatch
        } catch {
            phase = .failed
            message = "Couldn't correct that match. Please try again."
        }
    }

    @MainActor
    private func resolve(_ suggestion: ScanSuggestion, accept: Bool, removeEvidence: Bool = false) async {
        phase = .resolving
        do {
            try await supabase.resolveScanSuggestion(
                id: suggestion.id,
                accept: accept,
                removeEvidence: removeEvidence,
                allowOutOfScope: accept && suggestion.isOutOfScope
            )
            savedTick += 1
            if accept {
                let cleaned = suggestion.summary
                    .replacingOccurrences(of: "Add \"", with: "")
                    .replacingOccurrences(of: "\" to your Library?", with: "")
                phase = .identified(cleaned)
            } else if removeEvidence {
                phase = .excluded(suggestion.scopeReason)
            } else {
                phase = .noMatch
            }
        } catch {
            phase = .failed
            message = "Couldn’t save that choice. Please try again."
        }
    }

    // MARK: - Image helpers

    /// Longest side capped at 2000px, JPEG 0.8 — keeps receipts legible but small
    /// enough to upload and to fit a vision call. `scale = 1` treats the target
    /// as pixels, so the output is exactly `maxSide` on its longest edge.
    static func downscaledJPEG(_ image: UIImage, maxSide: CGFloat = 2000, quality: CGFloat = 0.8) -> Data? {
        let size = image.size
        let longest = max(size.width, size.height)
        guard longest > 0 else { return nil }
        let ratio = longest > maxSide ? maxSide / longest : 1
        let target = CGSize(width: (size.width * ratio).rounded(), height: (size.height * ratio).rounded())
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        let rendered = UIGraphicsImageRenderer(size: target, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: target))
        }
        return rendered.jpegData(compressionQuality: quality)
    }

    /// SHA-256 hex of the JPEG bytes — must match the web's hashFile() so identical
    /// captures dedupe against uploads (lib/actions/library.ts content_hash).
    static func sha256Hex(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }

    /// Vision reads QR/UPC/EAN/Data Matrix and similar codes from the still image.
    static func detectBarcode(in image: UIImage) -> (value: String, format: String)? {
        guard let cgImage = image.cgImage else { return nil }
        let request = VNDetectBarcodesRequest()
        try? VNImageRequestHandler(cgImage: cgImage, orientation: .up).perform([request])
        guard let hit = request.results?.first, let value = hit.payloadStringValue else { return nil }
        return (value, hit.symbology.rawValue)
    }

    /// Preserve a still-frame OCR transcript as deterministic evidence for the
    /// server. Live Scanner observations can disappear between camera frames.
    static func detectText(in image: UIImage) -> String? {
        guard let cgImage = image.cgImage else { return nil }
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = false
        try? VNImageRequestHandler(cgImage: cgImage, orientation: .up).perform([request])
        let lines = request.results?.compactMap { $0.topCandidates(1).first?.string } ?? []
        return lines.isEmpty ? nil : lines.joined(separator: "\n")
    }

    /// "Receipt · Jul 12, 2026" — no em dash (house rule); the middle dot matches
    /// the app's existing separator style.
    static func captureName(kind: CaptureKind) -> String {
        let df = DateFormatter()
        df.locale = Locale(identifier: "en_US_POSIX")
        df.dateFormat = "MMM d, yyyy"
        let day = df.string(from: Date())
        return "\(kind == .receipt ? "Receipt" : "Item scan") · \(day)"
    }
}

struct LiveScanEvidence {
    let code: (value: String, format: String)?
    let text: String
    var gatheredOSItemID: String? { code.flatMap { GatheredOSCode.itemID(from: $0.value) } }
}

private enum GatheredOSCode {
    static func itemID(from value: String) -> String? {
        guard let url = webURL(from: value),
              url.host?.lowercased() == Config.apiBaseURL.host?.lowercased() else { return nil }
        let parts = url.pathComponents.filter { $0 != "/" }
        guard parts.count == 3, parts[0] == "library", parts[1] == "item", UUID(uuidString: parts[2]) != nil else { return nil }
        return parts[2]
    }

    private static func webURL(from value: String) -> URL? {
        guard let url = URL(string: value),
              let scheme = url.scheme?.lowercased(),
              scheme == "https" || scheme == "http",
              url.host != nil else { return nil }
        return url
    }
}

/// Full-screen live text/code scanner. The user confirms the frame before GatheredOS analyzes it.
private struct LiveItemScanner: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var model = LiveItemScannerModel()
    let onCapture: (UIImage?, LiveScanEvidence?) -> Void

    var body: some View {
        ZStack {
            LiveScannerController(model: model).ignoresSafeArea()
            VStack {
                HStack {
                    Button { onCapture(nil, nil); dismiss() } label: {
                        Image(systemName: "xmark").font(.headline).padding(12).background(.ultraThinMaterial, in: Circle())
                    }
                    Spacer()
                    Text(model.status).font(.caption.weight(.semibold)).padding(.horizontal, 12).padding(.vertical, 8).background(.ultraThinMaterial, in: Capsule())
                }.padding()
                Spacer()
                VStack(spacing: 12) {
                    if let preview = model.preview {
                        Text(preview).font(.caption).lineLimit(2).multilineTextAlignment(.center).padding(.horizontal, 14).padding(.vertical, 9).background(.ultraThinMaterial, in: Capsule())
                    }
                    Button {
                        capture(model.evidence)
                    } label: {
                        if model.evidence.gatheredOSItemID != nil {
                            Label("Open saved item", systemImage: "house.fill").font(.headline).padding(.horizontal, 20).frame(minHeight: 52).background(.white, in: Capsule()).foregroundStyle(Color.homeNavy)
                        } else {
                            ZStack { Circle().fill(.white).frame(width: 72, height: 72); Circle().stroke(.black.opacity(0.25), lineWidth: 3).frame(width: 62, height: 62) }
                        }
                    }
                    .accessibilityLabel(model.evidence.gatheredOSItemID != nil ? "Open saved item" : "Capture item")
                    Text(model.evidence.gatheredOSItemID != nil ? "GatheredOS label found" : model.latestCodeFound ? "Code found. Capture to identify what it belongs to." : "Hold the label steady, then capture").font(.caption).foregroundStyle(.white).shadow(radius: 2)
                }.padding(.bottom, 28)
            }
        }
        .task { model.start() }
        .onDisappear { model.scanner.stopScanning() }
    }

    private func capture(_ evidence: LiveScanEvidence) {
        Task {
            let image = evidence.gatheredOSItemID == nil ? try? await model.scanner.capturePhoto() : nil
            model.scanner.stopScanning()
            onCapture(image, evidence)
        }
    }
}

@MainActor private final class LiveItemScannerModel: NSObject, ObservableObject, DataScannerViewControllerDelegate {
    @Published var preview: String?
    @Published var status = "Looking for label or code"
    private var latestText = ""
    private var latestCode: (value: String, format: String)?

    lazy var scanner: DataScannerViewController = {
        let controller = DataScannerViewController(
            recognizedDataTypes: [.text(languages: ["en-US"]), .barcode()],
            qualityLevel: .accurate,
            recognizesMultipleItems: true,
            isHighFrameRateTrackingEnabled: true,
            isPinchToZoomEnabled: true,
            // GatheredOS provides its own single status pill; Apple's guidance occupies
            // the same top-center space and the two labels overlap on a phone.
            isGuidanceEnabled: false,
            isHighlightingEnabled: true
        )
        controller.delegate = self
        return controller
    }()

    var evidence: LiveScanEvidence { LiveScanEvidence(code: latestCode, text: latestText) }
    var latestCodeFound: Bool { latestCode != nil }
    func start() { try? scanner.startScanning() }
    func dataScanner(_ dataScanner: DataScannerViewController, didAdd addedItems: [RecognizedItem], allItems: [RecognizedItem]) { update(allItems) }
    func dataScanner(_ dataScanner: DataScannerViewController, didUpdate updatedItems: [RecognizedItem], allItems: [RecognizedItem]) { update(allItems) }

    private func update(_ items: [RecognizedItem]) {
        var texts: [String] = []
        var code: (String, String)?
        for item in items {
            switch item {
            case .text(let text): texts.append(text.transcript)
            case .barcode(let barcode):
                if let value = barcode.payloadStringValue { code = (value, barcode.observation.symbology.rawValue) }
            @unknown default: break
            }
        }
        latestText = texts.joined(separator: " ")
        latestCode = code
        preview = code?.0 ?? texts.prefix(3).joined(separator: " · ")
        status = code != nil ? "Code detected" : texts.isEmpty ? "Looking for label or code" : "Label text detected"
    }
}

private struct LiveScannerController: UIViewControllerRepresentable {
    let model: LiveItemScannerModel
    func makeUIViewController(context: Context) -> DataScannerViewController { model.scanner }
    func updateUIViewController(_ uiViewController: DataScannerViewController, context: Context) {}
}

/// Minimal UIImagePickerController wrapper for camera capture. PhotosPicker owns
/// the library path, so this is only mounted where a camera exists.
private struct CameraPicker: UIViewControllerRepresentable {
    let onPicked: (UIImage?) -> Void

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ controller: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(onPicked: onPicked) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let onPicked: (UIImage?) -> Void
        init(onPicked: @escaping (UIImage?) -> Void) { self.onPicked = onPicked }

        func imagePickerController(
            _ picker: UIImagePickerController,
            didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
        ) {
            onPicked(info[.originalImage] as? UIImage)
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            onPicked(nil)
        }
    }
}
