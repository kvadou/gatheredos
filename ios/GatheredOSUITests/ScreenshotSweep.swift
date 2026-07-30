import XCTest

// The iOS pw-verify equivalent: launch the app, sign in with the dev account if
// the auth screen shows, then screenshot each of the 5 tabs. Attachments are kept
// in the .xcresult; extract them with `xcrun xcresulttool`.
//
// Dev-only credentials for the seeded demo account (documented in repo docs).
final class ScreenshotSweep: XCTestCase {
    private let email = "dev@gatheredos.local"
    private let password = "gatheredos-dev-2026!"
    private let tabs = ["Home", "Care", "Projects", "Library", "Ask"]

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testScreenshotSweep() {
        let app = XCUIApplication()
        app.launch()

        signInIfNeeded(app)
        dismissSavePasswordDialog()

        XCTAssertTrue(waitForAppShell(app), "Adaptive app navigation never appeared")

        for name in tabs {
            selectSection(name, in: app)
            sleep(2) // let async loads + transitions settle
            let shot = XCTAttachment(screenshot: app.screenshot())
            shot.name = "tab-\(name)"
            shot.lifetime = .keepAlways
            add(shot)
        }
    }

    /// Verifies the size-class navigation independently of auth and seed data.
    /// The launch argument is compiled into Debug builds only.
    func testAdaptiveNavigationShell() {
        let app = XCUIApplication()
        app.launchArguments.append("-ui-testing-adaptive-shell")
        app.launch()

        XCTAssertTrue(waitForAppShell(app), "Adaptive app navigation never appeared")
        for name in tabs {
            selectSection(name, in: app)
        }

        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = app.tabBars.firstMatch.exists ? "adaptive-compact-shell" : "adaptive-regular-shell"
        shot.lifetime = .keepAlways
        add(shot)
    }

    func testAdaptiveNavigationShellLandscape() {
        XCUIDevice.shared.orientation = .landscapeLeft
        defer { XCUIDevice.shared.orientation = .portrait }

        let app = XCUIApplication()
        app.launchArguments.append("-ui-testing-adaptive-shell")
        app.launch()

        XCTAssertTrue(waitForAppShell(app), "Landscape adaptive navigation never appeared")
        for name in tabs {
            selectSection(name, in: app)
        }

        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = app.tabBars.firstMatch.exists ? "adaptive-compact-landscape" : "adaptive-regular-landscape"
        shot.lifetime = .keepAlways
        add(shot)
    }

    func testCoreInteractionFlows() {
        let app = XCUIApplication()
        app.launch()
        signInIfNeeded(app)
        dismissSavePasswordDialog()
        XCTAssertTrue(waitForAppShell(app))

        selectSection("Care", in: app)
        let addCare = app.buttons["Add to Care"]
        XCTAssertTrue(addCare.waitForExistence(timeout: 10))
        addCare.tap()
        XCTAssertTrue(app.buttons["Add task"].waitForExistence(timeout: 3))
        app.buttons["Add task"].tap()
        XCTAssertTrue(app.navigationBars["New Task"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.textFields["What needs attention?"].exists)
        app.buttons["Cancel"].tap()

        selectSection("Projects", in: app)
        let addProject = app.buttons["Add project"]
        XCTAssertTrue(addProject.waitForExistence(timeout: 10))
        addProject.tap()
        XCTAssertTrue(app.navigationBars["New Project"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.textFields["Project name"].exists)
        XCTAssertFalse(app.buttons["Save"].isEnabled)
        app.buttons["Cancel"].tap()

        selectSection("Library", in: app)
        let addLibrary = app.buttons["Add"]
        XCTAssertTrue(addLibrary.waitForExistence(timeout: 10))
        addLibrary.tap()
        XCTAssertTrue(app.buttons["Add item"].waitForExistence(timeout: 3))
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.15, dy: 0.25)).tap()

        selectSection("Ask", in: app)
        XCTAssertTrue(app.textFields["Ask about your home"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["Send"].isEnabled)
    }

    func testProjectCreateAndDelete() {
        let app = XCUIApplication()
        app.launch()
        signInIfNeeded(app)
        dismissSavePasswordDialog()
        XCTAssertTrue(waitForAppShell(app))
        selectSection("Projects", in: app)

        let name = "UI verification \(Int(Date().timeIntervalSince1970))"
        let addProject = app.buttons["Add project"]
        XCTAssertTrue(addProject.waitForExistence(timeout: 10))
        addProject.tap()
        let nameField = app.textFields["Project name"]
        XCTAssertTrue(nameField.waitForExistence(timeout: 3))
        nameField.tap()
        nameField.typeText(name)
        app.buttons["Save"].tap()

        let created = app.staticTexts[name]
        XCTAssertTrue(created.waitForExistence(timeout: 10), "Created project never appeared")
        created.tap()
        XCTAssertTrue(app.navigationBars["Edit Project"].waitForExistence(timeout: 3))
        app.buttons["Delete Project"].tap()
        let confirmation = app.sheets.buttons["Delete Project"]
        XCTAssertTrue(confirmation.waitForExistence(timeout: 3))
        confirmation.tap()
        XCTAssertTrue(created.waitForNonExistence(timeout: 10), "Deleted project still appeared")
    }

    func testItemIntelligenceAndRepairEntryPoints() {
        let app = XCUIApplication()
        app.launch()
        signInIfNeeded(app)
        dismissSavePasswordDialog()
        XCTAssertTrue(waitForAppShell(app))

        selectSection("Library", in: app)
        let dishwasher = app.staticTexts["Dishwasher"].firstMatch
        XCTAssertTrue(dishwasher.waitForExistence(timeout: 15), "Seeded dishwasher was not available")
        dishwasher.tap()

        XCTAssertTrue(app.staticTexts["Completeness"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Identity"].exists)
        XCTAssertTrue(app.staticTexts["Coverage"].exists)
        XCTAssertTrue(app.staticTexts["Documents"].exists)
        XCTAssertTrue(app.staticTexts["Care"].exists)

        app.swipeUp()
        app.swipeUp()
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = "item-intelligence"
        shot.lifetime = .keepAlways
        add(shot)
        let ask = app.staticTexts["Ask GatheredOS"]
        XCTAssertTrue(ask.waitForExistence(timeout: 5))
        ask.tap()
        let composer = app.textFields.firstMatch
        XCTAssertTrue(composer.waitForExistence(timeout: 5))
        XCTAssertTrue((composer.value as? String)?.contains("Dishwasher") == true)
    }

    func testRepairHelpIntakeAndConsent() {
        let app = XCUIApplication()
        app.launch()
        signInIfNeeded(app)
        dismissSavePasswordDialog()
        XCTAssertTrue(waitForAppShell(app))

        selectSection("Library", in: app)
        let dishwasher = app.staticTexts["Dishwasher"].firstMatch
        XCTAssertTrue(dishwasher.waitForExistence(timeout: 15))
        dishwasher.tap()
        for _ in 0..<3 { app.swipeUp() }
        let repairHelp = app.staticTexts["Get repair help"]
        XCTAssertTrue(repairHelp.waitForExistence(timeout: 8))
        repairHelp.tap()

        let symptom = app.textFields["service-symptom"]
        XCTAssertTrue(symptom.waitForExistence(timeout: 5))
        symptom.tap()
        symptom.typeText("Leaves water in the bottom after a cycle")
        app.buttons["service-next"].tap()

        XCTAssertTrue(app.staticTexts["Safety check"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.switches["Gas or fuel smell"].exists)
        app.buttons["service-next"].tap()

        XCTAssertTrue(app.staticTexts["Preferred visit window"].waitForExistence(timeout: 5))
        app.buttons["service-next"].tap()

        XCTAssertTrue(app.staticTexts["What GatheredOS may share"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["service-next"].isEnabled)
        let approval = app.buttons["service-share-approval"]
        XCTAssertTrue(approval.exists)
        approval.tap()
        XCTAssertEqual(approval.value as? String, "Approved")

        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = "repair-sharing-review"
        shot.lifetime = .keepAlways
        add(shot)
    }

    /// Drives the auth screen only if it appears; if a session is already
    /// persisted the app boots straight to the adaptive shell and this is a no-op.
    private func signInIfNeeded(_ app: XCUIApplication) {
        let signIn = app.buttons["Sign In"]
        // Wait for the app to settle into either auth or the signed-in shell.
        let deadline = Date().addingTimeInterval(30)
        while Date() < deadline && !signIn.exists && !appShellExists(app) {
            usleep(200_000)
        }
        guard signIn.exists else { return }

        let emailField = app.textFields["Email"]
        if emailField.waitForExistence(timeout: 5) {
            emailField.tap()
            emailField.typeText(email)
        }
        let passwordField = app.secureTextFields["Password"]
        if passwordField.waitForExistence(timeout: 5) {
            passwordField.tap()
            passwordField.typeText(password)
        }
        if signIn.isHittable {
            signIn.tap()
        }
    }

    /// Compact windows expose a tab bar; regular-width iPad windows expose the
    /// same five destinations in a sidebar. Keep the flow assertions shared.
    private func appShellExists(_ app: XCUIApplication) -> Bool {
        app.tabBars.firstMatch.exists
            || app.descendants(matching: .any)["app-shell"].exists
            || (app.buttons["Care"].exists && app.buttons["Library"].exists)
    }

    private func waitForAppShell(_ app: XCUIApplication, timeout: TimeInterval = 30) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if appShellExists(app) { return true }
            usleep(200_000)
        }
        return false
    }

    private func selectSection(_ name: String, in app: XCUIApplication) {
        let tab = app.tabBars.buttons[name]
        if tab.exists {
            tab.tap()
            return
        }

        let sidebarButton = app.buttons[name].firstMatch
        XCTAssertTrue(sidebarButton.waitForExistence(timeout: 10), "\(name) navigation item was unavailable")
        if sidebarButton.isHittable { sidebarButton.tap() }
    }

    /// iOS offers to save the password to Keychain right after sign-in. Left up,
    /// this springboard alert covers the first screenshot and steals the first
    /// tab tap, so dismiss it before the sweep.
    private func dismissSavePasswordDialog() {
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let notNow = springboard.buttons["Not Now"]
        if notNow.waitForExistence(timeout: 8) {
            notNow.tap()
        }
    }
}
