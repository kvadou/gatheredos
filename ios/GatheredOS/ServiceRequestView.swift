import SwiftUI
import EventKit

struct ServiceRequestView: View {
    @Environment(SupabaseService.self) private var supabase
    @Environment(\.dismiss) private var dismiss

    let item: Item
    let files: [HomeFile]
    let contractors: [Contractor]

    @State private var step = 0
    @State private var symptom = ""
    @State private var errorCode = ""
    @State private var urgency = "routine"
    @State private var safety = ServiceSafetyAnswers()
    @State private var start = Calendar.current.date(byAdding: .day, value: 1, to: Date()) ?? Date()
    @State private var end = Calendar.current.date(byAdding: .hour, value: 3, to: Calendar.current.date(byAdding: .day, value: 1, to: Date()) ?? Date()) ?? Date()
    @State private var availabilityNotes = ""
    @State private var selectedFiles = Set<String>()
    @State private var sharingApproved = false
    @State private var saving = false
    @State private var error: String?
    @State private var result: ServiceIntakeResponse?

    private let titles = ["What’s happening?", "Safety check", "Timing and records", "Review sharing"]

    init(item: Item, files: [HomeFile], contractors: [Contractor], existingCase: ServiceCase? = nil) {
        self.item = item
        self.files = files
        self.contractors = contractors
        _result = State(initialValue: existingCase.map {
            ServiceIntakeResponse(
                case: $0,
                safety: ServiceSafetyResult(stopped: $0.status == "safety_stopped", triggered: [], guidance: "")
            )
        })
    }

    var body: some View {
        NavigationStack {
            Group {
                if let result { ServiceCaseTimelineView(item: item, response: result, files: files, contractors: contractors) }
                else { intakeForm }
            }
            .navigationTitle(result == nil ? titles[step] : "Repair Help")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(result == nil ? "Close" : "Done") { dismiss() }
                }
            }
        }
        .interactiveDismissDisabled(saving)
    }

    private var intakeForm: some View {
        VStack(spacing: 0) {
            ProgressView(value: Double(step + 1), total: Double(titles.count))
                .tint(Color.homeNavy).padding(.horizontal).padding(.top, 8)
                .accessibilityLabel("Step \(step + 1) of \(titles.count)")
            Form {
                switch step {
                case 0: problemStep
                case 1: safetyStep
                case 2: timingStep
                default: sharingStep
                }
                if let error {
                    Section { Label(error, systemImage: "exclamationmark.circle.fill").foregroundStyle(.red) }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Color.homeCanvas)
            footer
        }
        .background(Color.homeCanvas)
    }

    private var problemStep: some View {
        Group {
            Section {
                Text("Tell GatheredOS what changed. A specific symptom helps a provider understand the job before anyone is contacted.")
                    .font(.subheadline).foregroundStyle(.secondary)
                TextField("What is the item doing?", text: $symptom, axis: .vertical)
                    .lineLimit(3...6).accessibilityIdentifier("service-symptom")
                TextField("Error code, if shown", text: $errorCode)
            }
            Section("How soon do you need help?") {
                Picker("Urgency", selection: $urgency) {
                    Text("Routine").tag("routine")
                    Text("Within a few days").tag("soon")
                }.pickerStyle(.inline).labelsHidden()
            }
        }
    }

    private var safetyStep: some View {
        Group {
            Section {
                Text("Answer for what is happening now. If any item is true, GatheredOS will stop the request and show safer next steps.")
                    .font(.subheadline).foregroundStyle(.secondary)
            }
            Section("Do you notice any of these?") {
                Toggle("Gas or fuel smell", isOn: $safety.gasSmell)
                Toggle("Smoke, flame, or sparks", isOn: $safety.smokeOrSparks)
                Toggle("Shock or tingling", isOn: $safety.electricShock)
                Toggle("Active water near electricity", isOn: $safety.activeFloodingNearPower)
                Toggle("Carbon monoxide alarm", isOn: $safety.carbonMonoxideAlarm)
                Toggle("Severe overheating or burning odor", isOn: $safety.severeOverheating)
            }
            Section { Text("This check does not replace emergency services, a utility emergency line, or a qualified technician.").font(.footnote).foregroundStyle(.secondary) }
        }
    }

    private var timingStep: some View {
        Group {
            if !safety.hasStopCondition {
                Section("Preferred visit window") {
                    DatePicker("Start", selection: $start, in: Date()...)
                    DatePicker("End", selection: $end, in: start...)
                    TextField("Access or timing notes", text: $availabilityNotes, axis: .vertical).lineLimit(2...4)
                }
                Section("Records to include") {
                    if files.isEmpty {
                        Text("No photos or documents are linked to this item. You can continue without them.").foregroundStyle(.secondary)
                    } else {
                        ForEach(files) { file in
                            Toggle(isOn: fileSelection(file.id)) {
                                Label(file.name, systemImage: file.type == "photo" ? "photo" : "doc.text")
                            }
                        }
                    }
                    Text("Only records you select will be approved for this request.").font(.footnote).foregroundStyle(.secondary)
                }
            } else {
                Section {
                    Label("Stop using \(item.name)", systemImage: "exclamationmark.triangle.fill").font(.headline).foregroundStyle(.red)
                    Text("Move away from the immediate hazard. Call emergency services for immediate danger, and use your utility or manufacturer emergency number when appropriate.")
                }
                Section { Text("GatheredOS will save this safety result, but it will not contact or book a provider from this screen.").font(.subheadline).foregroundStyle(.secondary) }
            }
        }
    }

    private var sharingStep: some View {
        Group {
            Section("Repair request") {
                LabeledContent("Item", value: item.name)
                LabeledContent("Problem", value: symptom)
                if !errorCode.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { LabeledContent("Error code", value: errorCode) }
                LabeledContent("Records", value: "\(selectedFiles.count) selected")
            }
            Section("What GatheredOS may share") {
                Label("Item identity: maker, model, serial, and age when known", systemImage: "shippingbox")
                Label("Your problem description and safety answers", systemImage: "text.bubble")
                Label("Your preferred timing and service address", systemImage: "calendar")
                if !selectedFiles.isEmpty { Label("The \(selectedFiles.count) selected record\(selectedFiles.count == 1 ? "" : "s")", systemImage: "doc") }
            }
            Section {
                Button { sharingApproved.toggle() } label: {
                    Label("Approve this sharing scope", systemImage: sharingApproved ? "checkmark.square.fill" : "square")
                        .foregroundStyle(sharingApproved ? Color.homeNavy : Color.homeInk)
                }
                .accessibilityValue(sharingApproved ? "Approved" : "Not approved")
                .accessibilityIdentifier("service-share-approval")
                Text("Approval expires in 14 days. No provider is contacted and no appointment is booked until GatheredOS has real availability and you approve the specific option.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
        }
    }

    private var footer: some View {
        HStack(spacing: 12) {
            if step > 0 { Button("Back") { error = nil; step -= 1 }.buttonStyle(.bordered).controlSize(.large) }
            Button(nextLabel) { Task { await advance() } }
                .buttonStyle(.borderedProminent).controlSize(.large).tint(safety.hasStopCondition ? .red : Color.homeNavy)
                .frame(maxWidth: .infinity, alignment: .trailing)
                .disabled(saving || (step == 0 && symptom.trimmingCharacters(in: .whitespacesAndNewlines).count < 3) || (step == 3 && !sharingApproved))
                .accessibilityIdentifier("service-next")
        }
        .padding().background(.bar)
    }

    private var nextLabel: String {
        if saving { return "Saving…" }
        if safety.hasStopCondition && step == 2 { return "Save safety result" }
        return step == 3 ? "Approve and create request" : "Continue"
    }

    private func fileSelection(_ id: String) -> Binding<Bool> {
        Binding(get: { selectedFiles.contains(id) }, set: { selected in
            if selected { selectedFiles.insert(id) } else { selectedFiles.remove(id) }
        })
    }

    private func advance() async {
        error = nil
        if safety.hasStopCondition && step == 2 { await save() }
        else if step < 3 { step += 1 }
        else { await save() }
    }

    private func save() async {
        saving = true
        defer { saving = false }
        do {
            result = try await supabase.createServiceCase(ServiceIntakeRequest(
                itemId: item.id, symptom: symptom, errorCode: errorCode.isBlank ? nil : errorCode,
                urgency: urgency, safety: safety,
                availability: ServiceAvailability(start: start.ISO8601Format(), end: end.ISO8601Format(), notes: availabilityNotes.isBlank ? nil : availabilityNotes),
                fileIds: Array(selectedFiles).sorted(), shareApproved: sharingApproved
            ))
        } catch { self.error = error.localizedDescription }
    }
}

private struct ServiceOutcomeSheet: View {
    @Environment(SupabaseService.self) private var supabase
    @Environment(\.dismiss) private var dismiss
    let caseId: String
    let item: Item
    let files: [HomeFile]
    let onSaved: () async -> Void

    @State private var resolution = "resolved"
    @State private var workPerformed = ""
    @State private var finalCost = ""
    @State private var parts = ""
    @State private var warranty = ""
    @State private var invoiceFileId = ""
    @State private var timeliness = 0
    @State private var communication = 0
    @State private var feedback = ""
    @State private var occurredOn = Date()
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Was the issue resolved?") {
                    Picker("Outcome", selection: $resolution) {
                        Text("Yes, resolved").tag("resolved")
                        Text("Partially").tag("partially_resolved")
                        Text("No, still unresolved").tag("not_resolved")
                    }.pickerStyle(.inline).labelsHidden()
                }
                Section("Confirmed service record") {
                    TextField("What work was performed?", text: $workPerformed, axis: .vertical).lineLimit(3...6)
                    TextField("Final cost", text: $finalCost).keyboardType(.decimalPad)
                    DatePicker("Visit date", selection: $occurredOn, displayedComponents: .date)
                    TextField("Parts replaced, if any", text: $parts, axis: .vertical)
                    TextField("Parts or labor warranty", text: $warranty, axis: .vertical)
                    if !files.isEmpty {
                        Picker("Saved invoice", selection: $invoiceFileId) {
                            Text("No invoice attached").tag("")
                            ForEach(files) { file in Text(file.name).tag(file.id) }
                        }
                    }
                }
                Section("Private provider feedback") {
                    ratingPicker("Timeliness", selection: $timeliness)
                    ratingPicker("Communication", selection: $communication)
                    TextField("Anything GatheredOS should know?", text: $feedback, axis: .vertical).lineLimit(2...5)
                    Text("This feedback is for service quality and provider operations. It is not published as a public review.").font(.footnote).foregroundStyle(.secondary)
                }
                Section {
                    Text("Saving creates one permanent care event for \(item.name). Review the details before confirming.").font(.footnote).foregroundStyle(.secondary)
                    if let error { Label(error, systemImage: "exclamationmark.circle").foregroundStyle(.red) }
                }
            }
            .navigationTitle("After your visit").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(saving) }
                ToolbarItem(placement: .confirmationAction) { Button(saving ? "Saving…" : "Confirm record") { Task { await save() } }.disabled(saving || workPerformed.trimmingCharacters(in: .whitespacesAndNewlines).count < 3) }
            }
        }.interactiveDismissDisabled(saving)
    }

    private func ratingPicker(_ title: String, selection: Binding<Int>) -> some View {
        Picker(title, selection: selection) {
            Text("Not rated").tag(0)
            ForEach(1...5, id: \.self) { Text("\($0)").tag($0) }
        }
    }

    private func save() async {
        saving = true; error = nil; defer { saving = false }
        do {
            let cost = finalCost.trimmingCharacters(in: .whitespaces).isEmpty ? nil : Double(finalCost)
            if !finalCost.isBlank && cost == nil { error = "Enter the final cost as a number."; return }
            _ = try await supabase.recordServiceOutcome(caseId: caseId, outcome: ServiceOutcomeRequest(
                resolution: resolution, workPerformed: workPerformed.trimmingCharacters(in: .whitespacesAndNewlines),
                finalCost: cost, partsSummary: parts.isBlank ? nil : parts, laborWarranty: warranty.isBlank ? nil : warranty,
                invoiceFileId: invoiceFileId.isBlank ? nil : invoiceFileId,
                providerTimeliness: timeliness == 0 ? nil : timeliness,
                providerCommunication: communication == 0 ? nil : communication,
                privateFeedback: feedback.isBlank ? nil : feedback, occurredOn: SupabaseService.isoDay(occurredOn)
            ))
            await onSaved(); dismiss()
        } catch { self.error = error.localizedDescription }
    }
}

private struct ServiceExceptionSheet: View {
    @Environment(SupabaseService.self) private var supabase
    @Environment(\.dismiss) private var dismiss
    let caseId: String
    let onSaved: () async -> Void
    @State private var kind = "provider_cancelled"
    @State private var note = ""
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("What happened?") {
                    Picker("Problem", selection: $kind) {
                        Text("Provider cancelled").tag("provider_cancelled")
                        Text("Provider did not arrive").tag("no_show")
                        Text("Dispute or serious concern").tag("dispute")
                    }.pickerStyle(.inline).labelsHidden()
                }
                Section("Details") {
                    TextField("Tell us what happened", text: $note, axis: .vertical).lineLimit(3...6)
                    Text("GatheredOS will flag this for human follow-up. Reporting a problem does not create a completed service record.").font(.footnote).foregroundStyle(.secondary)
                    if let error { Label(error, systemImage: "exclamationmark.circle").foregroundStyle(.red) }
                }
            }.navigationTitle("Report appointment problem").navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(saving) }
                    ToolbarItem(placement: .confirmationAction) { Button(saving ? "Sending…" : "Send") { Task { await save() } }.disabled(saving || note.trimmingCharacters(in: .whitespacesAndNewlines).count < 3) }
                }
        }.interactiveDismissDisabled(saving)
    }

    private func save() async {
        saving = true; error = nil; defer { saving = false }
        do { try await supabase.reportServiceException(caseId: caseId, kind: kind, note: note); await onSaved(); dismiss() }
        catch { self.error = error.localizedDescription }
    }
}

struct ServiceCaseTimelineView: View {
    @Environment(SupabaseService.self) private var supabase
    let item: Item
    let response: ServiceIntakeResponse
    let files: [HomeFile]
    let contractors: [Contractor]

    @State private var detail: ServiceCaseDetail?
    @State private var selectedOption: ServiceOption?
    @State private var loading = true
    @State private var booking = false
    @State private var calendarSaving = false
    @State private var message: String?
    @State private var showingOutcome = false
    @State private var showingException = false

    var body: some View {
        List {
            Section {
                if response.safety.stopped {
                    Label("Safety stop saved", systemImage: "exclamationmark.triangle.fill").font(.title3.bold()).foregroundStyle(.red)
                    Text(response.safety.guidance).foregroundStyle(.secondary)
                } else {
                    Label("Request ready", systemImage: "checkmark.circle.fill").font(.title3.bold()).foregroundStyle(.green)
                    Text("Your repair details are saved and the exact sharing scope is approved.").foregroundStyle(.secondary)
                }
            }
            if let detail, !detail.options.isEmpty, detail.case.status == "options_ready" {
                optionsSection(detail.options)
            }
            if let appointment = detail?.appointment {
                appointmentSection(appointment)
            }
            if let outcome = detail?.outcome { outcomeSection(outcome) }
            Section("Timeline") {
                timelineRow("Problem captured", detail: response.case.symptomSummary ?? item.name, done: true)
                timelineRow(response.safety.stopped ? "Safety stop" : "Safety check complete", detail: response.safety.stopped ? "Provider search did not begin" : "No immediate stop condition reported", done: true)
                if !response.safety.stopped {
                    timelineRow("Sharing approved", detail: "Approval expires automatically after 14 days", done: true)
                    timelineRow("Provider coordination", detail: providerTimelineDetail, done: detail?.case.status == "options_ready" || detail?.appointment != nil)
                    timelineRow("Appointment", detail: appointmentTimelineDetail, done: detail?.appointment?.status == "confirmed")
                }
            }
            if loading { Section { ProgressView("Checking for updates…") } }
            if let message { Section { Label(message, systemImage: "exclamationmark.circle").foregroundStyle(.secondary) } }
            if !response.safety.stopped && detail?.case.status == "sharing_approved" {
                Section("What happens next") {
                    Text("GatheredOS will only show a provider after trade fit, trust signals, price terms, and real availability are available. You will approve the provider and appointment before anything is booked.")
                        .font(.subheadline).foregroundStyle(.secondary)
                }
            }
        }
        .scrollContentBackground(.hidden).background(Color.homeCanvas)
        .refreshable { await refresh() }
        .task { await refresh() }
        .sheet(item: $selectedOption) { option in confirmationSheet(option) }
        .sheet(isPresented: $showingOutcome) { ServiceOutcomeSheet(caseId: response.case.id, item: item, files: files) { await refresh() } }
        .sheet(isPresented: $showingException) { ServiceExceptionSheet(caseId: response.case.id) { await refresh() } }
    }

    private var providerTimelineDetail: String {
        if let count = detail?.options.count, count > 0 { return "\(count) reviewed option\(count == 1 ? "" : "s") ready" }
        if detail?.appointment != nil { return "Provider selected" }
        return contractors.isEmpty ? "Not started — verified availability is still being gathered" : "Saved contacts are not treated as verified availability"
    }

    private var appointmentTimelineDetail: String {
        guard let appointment = detail?.appointment else { return "Nothing has been booked" }
        return appointment.status == "confirmed" ? "Provider confirmed the visit" : "Request sent — waiting for provider confirmation"
    }

    private func optionsSection(_ options: [ServiceOption]) -> some View {
        Section {
            ForEach(options) { option in
                Button { selectedOption = option } label: {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack(alignment: .firstTextBaseline) {
                            Text(option.providerName).font(.headline).foregroundStyle(Color.homeInk)
                            Spacer()
                            if let label = evidenceLabel(option, in: options) {
                                Text(label).font(.caption.bold()).foregroundStyle(Color.homeNavy)
                            }
                        }
                        Label(windowText(option), systemImage: "calendar").font(.subheadline).foregroundStyle(.secondary)
                        HStack {
                            Text(knownCostText(option)).font(.subheadline).foregroundStyle(Color.homeInk)
                            Spacer()
                            Image(systemName: "chevron.right").font(.caption.bold()).foregroundStyle(.tertiary)
                        }
                        if option.providerConfirmedAt != nil {
                            Label(confirmationFreshness(option), systemImage: "checkmark.seal.fill").font(.caption).foregroundStyle(.green)
                        }
                    }.padding(.vertical, 6)
                }.buttonStyle(.plain).accessibilityHint("Review exact terms and request this appointment")
            }
            if options.count < 3 {
                Text("We found \(options.count) reviewed option\(options.count == 1 ? "" : "s"). We would rather show fewer trustworthy choices than pad the list with unverified providers.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
        } header: { Text("Provider options") } footer: { Text("No appointment is made until you review and confirm one exact option.") }
    }

    private func appointmentSection(_ appointment: ServiceAppointment) -> some View {
        Section(appointment.status == "completed" ? "Completed visit" : appointment.status == "confirmed" ? "Confirmed appointment" : "Appointment request") {
            Label(appointment.status == "completed" ? "Visit record confirmed" : appointment.status == "confirmed" ? "Provider confirmed" : "Waiting for provider confirmation",
                  systemImage: appointment.status == "completed" ? "checkmark.seal.fill" : appointment.status == "confirmed" ? "checkmark.circle.fill" : "clock.fill")
                .font(.headline).foregroundStyle(appointment.status == "confirmed" || appointment.status == "completed" ? .green : .orange)
            LabeledContent("Provider", value: appointment.providerName)
            LabeledContent("Visit", value: appointmentWindow(appointment))
            if let reference = appointment.externalReference { LabeledContent("Confirmation", value: reference) }
            if appointment.status == "confirmed" {
                if appointment.calendarEventIdentifier != nil {
                    Label("Added to Apple Calendar", systemImage: "calendar.badge.checkmark").foregroundStyle(.green)
                } else {
                    Button { Task { await addToCalendar(appointment) } } label: {
                        Label(calendarSaving ? "Adding…" : "Add to Apple Calendar", systemImage: "calendar.badge.plus")
                    }.disabled(calendarSaving)
                }
                Button { showingOutcome = true } label: { Label("Record visit outcome", systemImage: "checkmark.clipboard") }
                    .accessibilityIdentifier("service-record-outcome")
                Button { showingException = true } label: { Label("Report a cancellation, no-show, or problem", systemImage: "exclamationmark.bubble") }
            } else if appointment.status != "completed" {
                Text("This is not booked yet. GatheredOS will show a confirmation reference here after the provider accepts the exact window.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
        }
    }

    private func outcomeSection(_ outcome: ServiceOutcome) -> some View {
        Section("Service history saved") {
            Label(resolutionLabel(outcome.resolution), systemImage: "checkmark.seal.fill").font(.headline).foregroundStyle(.green)
            LabeledContent("Work performed", value: outcome.workPerformed)
            if let cost = outcome.finalCost { LabeledContent("Final cost", value: cost.formatted(.currency(code: "USD"))) }
            if let parts = outcome.partsSummary { LabeledContent("Parts", value: parts) }
            if let warranty = outcome.laborWarranty { LabeledContent("Warranty", value: warranty) }
            Text("This confirmed record is now part of \(item.name)’s care history.").font(.footnote).foregroundStyle(.secondary)
        }
    }

    private func resolutionLabel(_ value: String) -> String {
        switch value { case "resolved": return "Issue resolved"; case "partially_resolved": return "Follow-up still needed"; default: return "Issue remains unresolved" }
    }

    private func confirmationSheet(_ option: ServiceOption) -> some View {
        NavigationStack {
            List {
                Section("Exact appointment request") {
                    LabeledContent("Provider", value: option.providerName)
                    LabeledContent("Visit type", value: option.visitType.replacingOccurrences(of: "_", with: " ").capitalized)
                    LabeledContent("Window", value: windowText(option))
                    LabeledContent("Known visit cost", value: knownCostText(option))
                }
                Section("Terms") {
                    LabeledContent("Cancellation", value: option.cancellationTerms ?? "Not provided")
                    LabeledContent("Parts / labor warranty", value: option.partsLaborWarranty ?? "Not provided")
                    if let notes = option.priceNotes { Text(notes).foregroundStyle(.secondary) }
                }
                Section("Trust and sharing") {
                    if let confirmedAt = option.providerConfirmedAt.flatMap(parseDate) {
                        LabeledContent("Availability checked", value: confirmedAt.formatted(date: .abbreviated, time: .shortened))
                    }
                    if let expiresAt = option.expiresAt.flatMap(parseDate) {
                        LabeledContent("Proposal valid until", value: expiresAt.formatted(date: .abbreviated, time: .shortened))
                    }
                    ForEach(option.verifiedFacts, id: \.self) { fact in
                        Label(verifiedFactText(fact), systemImage: "checkmark.seal")
                    }
                    Text("This request shares only the item, issue, safety, timing, address, and records you approved earlier.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                Section {
                    Button { Task { await book(option) } } label: {
                        HStack { Spacer(); Text(booking ? "Sending request…" : "Confirm and request appointment").fontWeight(.semibold); Spacer() }
                    }.disabled(booking || option.providerConfirmedAt == nil)
                    Text("Your request stays pending until the provider confirms. It will not be added to your calendar yet.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }.navigationTitle("Confirm appointment").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { selectedOption = nil } } }
        }.presentationDetents([.large])
    }

    private func refresh() async {
        loading = detail == nil
        defer { loading = false }
        do { detail = try await supabase.serviceCase(id: response.case.id); message = nil }
        catch { message = error.localizedDescription }
    }

    private func book(_ option: ServiceOption) async {
        booking = true; defer { booking = false }
        do {
            _ = try await supabase.bookServiceOffer(caseId: response.case.id, offerId: option.id)
            selectedOption = nil
            await refresh()
        } catch { message = error.localizedDescription; selectedOption = nil }
    }

    @MainActor private func addToCalendar(_ appointment: ServiceAppointment) async {
        guard let start = parseDate(appointment.windowStart), let end = parseDate(appointment.windowEnd) else {
            message = "The confirmed visit time could not be read."; return
        }
        calendarSaving = true; defer { calendarSaving = false }
        do {
            let store = EKEventStore()
            guard try await store.requestFullAccessToEvents() else { message = "Calendar access was not granted."; return }
            let event = EKEvent(eventStore: store)
            event.title = "Service for \(item.name) — \(appointment.providerName)"
            event.startDate = start; event.endDate = end
            event.notes = [appointment.externalReference.map { "Confirmation: \($0)" }, appointment.cancellationTerms].compactMap { $0 }.joined(separator: "\n")
            event.calendar = store.defaultCalendarForNewEvents
            try store.save(event, span: .thisEvent)
            guard let identifier = event.eventIdentifier else { throw ServiceRequestError.unavailable }
            try await supabase.recordCalendarEvent(caseId: response.case.id, identifier: identifier)
            await refresh()
        } catch { message = error.localizedDescription }
    }

    private func evidenceLabel(_ option: ServiceOption, in options: [ServiceOption]) -> String? {
        let confirmed = options.filter { $0.providerConfirmedAt != nil }
        if let soonest = confirmed.compactMap({ option -> (ServiceOption, Date)? in
            guard let date = option.windowStart.flatMap(parseDate) else { return nil }; return (option, date)
        }).min(by: { $0.1 < $1.1 })?.0, soonest.id == option.id { return "Soonest confirmed" }
        let priced = options.compactMap { option -> (ServiceOption, Double)? in option.knownVisitCost.map { (option, $0) } }
        if let lowest = priced.min(by: { $0.1 < $1.1 })?.0, lowest.id == option.id { return "Lowest known cost" }
        return nil
    }

    private func knownCostText(_ option: ServiceOption) -> String {
        guard let cost = option.knownVisitCost else { return "Cost not provided" }
        return cost.formatted(.currency(code: option.currency)) + " known before service"
    }
    private func windowText(_ option: ServiceOption) -> String {
        guard let start = option.windowStart.flatMap(parseDate), let end = option.windowEnd.flatMap(parseDate) else { return "Window not provided" }
        return start.formatted(date: .abbreviated, time: .shortened) + "–" + end.formatted(date: .omitted, time: .shortened)
    }
    private func appointmentWindow(_ appointment: ServiceAppointment) -> String {
        guard let start = parseDate(appointment.windowStart), let end = parseDate(appointment.windowEnd) else { return "Time unavailable" }
        return start.formatted(date: .abbreviated, time: .shortened) + "–" + end.formatted(date: .omitted, time: .shortened)
    }
    private func verifiedFactText(_ fact: ServiceVerifiedFact) -> String {
        switch fact.kind { case "contact": return "Contact independently verified"; case "insurance": return "Insurance verified"; case "license": return "License verified"; default: return fact.kind.replacingOccurrences(of: "_", with: " ").capitalized + " verified" }
    }
    private func confirmationFreshness(_ option: ServiceOption) -> String {
        guard let confirmed = option.providerConfirmedAt.flatMap(parseDate) else { return "Availability not confirmed" }
        let relative = RelativeDateTimeFormatter()
        relative.unitsStyle = .full
        return "Provider confirmed \(relative.localizedString(for: confirmed, relativeTo: Date()))"
    }
    private func parseDate(_ value: String) -> Date? { ISO8601DateFormatter().date(from: value) }

    private func timelineRow(_ title: String, detail: String, done: Bool) -> some View {
        Label {
            VStack(alignment: .leading, spacing: 3) { Text(title); Text(detail).font(.caption).foregroundStyle(.secondary) }
        } icon: { Image(systemName: done ? "checkmark.circle.fill" : "circle").foregroundStyle(done ? .green : .secondary) }
        .padding(.vertical, 2)
    }
}
