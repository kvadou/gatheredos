# GatheredOS Launch Readiness Plan

Updated July 13, 2026. This plan keeps the useful parts of consumer-app launch
strategy—clear outcomes, measured activation, strong App Store presentation,
and continuous iteration—without hard-paywall pressure, cancellation friction,
engagement spam, or pricing copied from unrelated apps.

## Brand direction

**Product name:** GatheredOS

**Brand promise:** Your home, remembered.

**Category descriptor:** Home records, care, and intelligence

GatheredOS is the selected customer-facing name across web, iOS, TestFlight,
product copy, and current App Store metadata. `gatheredos` remains only as a legacy
repository/project identifier where renaming would add migration risk without
customer value. Public launch remains gated on professional trademark clearance
and securing a domain, social handles, and support email.

## Definition of launch-ready

Do not create final App Store screenshots until all of these are true:

- The core web and iOS journeys are functionally complete.
- Item scanning is reliable on representative appliances, systems, receipts,
  QR codes, and barcodes.
- A new user can reach first value without assistance.
- The navigation, visual system, and launch copy are frozen.
- Analytics show where users fail or abandon activation.
- Privacy, permissions, deletion, export, and household access are verified.
- Beta users understand the product and return for ongoing value.

## North star and activation

**North-star behavior:** a household repeatedly uses trusted home knowledge to
complete care or make a decision.

**Initial activation definition:** within seven days, a user creates a home,
confirms at least three real items or records, and receives or acts on one useful
GatheredOS recommendation.

Supporting measures:

- Scan started → identification presented → item confirmed
- Account created → home created → first useful result
- Time to first confirmed item
- Ask question → cited answer viewed
- Suggested care action → completed action
- Day 1, 7, and 30 household retention
- Household member invited

## Phase 1 — Reliability and measurement

Start here while the product is still being completed.

1. Define one analytics event dictionary shared by web and iOS.
2. Instrument the activation funnel:
   - onboarding started/completed
   - home created
   - camera and notification permission outcomes
   - scan started, evidence found, upload completed
   - identification succeeded, failed, retried, confirmed, or rejected
   - first item, document, care task, question, and insight
   - subscription and review-prompt events when those surfaces exist
3. Add an internal funnel view to `/admin` before adding a third-party analytics
   product. Adopt an external tool later only if it answers questions our
   existing `usage_events` data cannot.
4. Build a representative scan test set and establish success thresholds.
5. Add structured in-product feedback after failed or uncertain outcomes.

**Exit gate:** we can identify the largest activation failure with data rather
than anecdotes.

## Phase 2 — First-value onboarding

Onboarding should demonstrate value, not present a long sales deck.

1. Welcome: “Give your home a memory.”
2. Create or confirm the home.
3. Explain privacy and user control in one concise screen.
4. Scan one appliance/system or import one useful record.
5. Present the identified details for confirmation.
6. Deliver an immediate result: manual, maintenance guidance, lifespan, recall,
   warranty, or a useful next action.
7. Offer two logical next steps—not a wall of setup tasks.

Use progressive completion after onboarding:

- Home-memory completion indicator based on genuinely valuable records
- Suggested next room/system
- Clear “why this helps” text
- Resume later without penalty

**Exit gate:** at least 70% of qualified beta users reach a confirmed first item,
and a majority can explain the value of the product without prompting.

## Phase 3 — Retention and trust

1. Introduce a useful, opt-in Home Briefing rather than generic engagement
   notifications.
2. Trigger reminders from real home context: due care, warranty expiration,
   recalls, incomplete emergency information, and project decisions.
3. Ask for an App Store review only after a successful high-value moment.
4. Make notification controls, export, deletion, and subscription management
   easy to find.
5. Never suppress a useful reminder because a subscriber is inactive.

**Exit gate:** beta households return for a useful recurring behavior rather
than merely to finish setup.

## Phase 4 — Name clearance and identity ownership

Do this before public launch assets, but after the core product promise is stable.

1. Run professional trademark clearance for GatheredOS and two backup candidates.
2. Verify corporate-name, App Store, Play Store, domain, and major social-handle
   availability.
3. Secure the final domain and handles before announcing the name.
4. Confirm the existing GatheredOS name across email, legal documents, support,
   domain redirects, and store metadata in one controlled release.
5. Finalize the identity only after the name clears:
   - wordmark and app icon
   - compact symbol that works at 16–1024 px
   - typography and color rules
   - motion behavior
   - light/dark and monochrome variants

Avoid a generic house outline plus AI sparkle. Explore a distinctive memory
metaphor: a doorway formed from nested records, a subtle D made from a home
timeline, or architectural layers accumulating into one mark.

**Exit gate:** the name is cleared and owned; the icon is recognizable without
the wordmark; the identity feels trustworthy rather than trendy.

## Phase 5 — Monetization validation

1. Let users experience one genuine result before showing an upgrade decision.
2. Test entitlements around ongoing intelligence, integrations, household
   collaboration, advanced reports, and additional properties—not basic access
   to the user’s own records.
3. Offer an annual primary option and a transparent monthly alternative.
4. Determine pricing from interviews, retention, and willingness-to-pay tests;
   do not inherit weekly pricing from unrelated consumer apps.
5. Use straightforward trial and cancellation language. No fake urgency, hidden
   close buttons, or cancellation detours.

**Exit gate:** users understand what becomes more valuable when they upgrade,
and paid conversion does not damage activation or trust.

## Phase 6 — Final launch assets

Only begin after the launch UI and public identity are frozen.

Create the App Store story in this order:

1. **Your home, remembered.**
2. **Scan an appliance. Know exactly what it is.**
3. **See what needs care—and when.**
4. **Ask questions about your actual home.**
5. **Keep the whole household prepared.**

Assets:

- Real screenshots from polished production flows
- Short scan-to-result demonstration video
- App preview video with captions and no reliance on audio
- App icon and store metadata
- Website hero/demo aligned with the same five-part story
- Press/creator kit with founder story, product facts, and approved images

**Exit gate:** someone unfamiliar with the product can understand the outcome
from the first screenshot in a few seconds.

## Phase 7 — Controlled launch

1. Concierge beta: 20–30 homeowner households, onboarded personally.
2. Private beta: 100–200 invited households in measured batches.
3. Early access: expand the waitlist in cohorts while monitoring activation,
   scan reliability, retention, and support load.
4. Full launch: App Store, owned email list, website, founder content, and a
   small number of relevant homeowner/inspection/DIY partners.
5. Relaunch meaningful capabilities individually: Gmail import, emergency mode,
   family sharing, proactive intelligence, and home handoff.

## Explicitly excluded tactics

- A fixed 12–13-screen onboarding sequence
- A hard paywall before first value
- Weekly pricing copied from unrelated apps
- Artificial scarcity or countdowns
- Misleading trial presentation
- Cancellation obstruction or surprise retention offers
- Notification spam
- Review prompts after errors or at first launch
- Final screenshots before product and identity freeze
- A logo commissioned before name clearance

## Immediate implementation order

1. Analytics event dictionary and `/admin` activation funnel
2. Scan reliability test set and failure feedback
3. First-value onboarding redesign
4. Contextual Home Briefing and notification preferences
5. Review-prompt eligibility engine
6. Beta recruitment and feedback operations
7. GatheredOS trademark/domain/handle clearance
8. Domain, email, legal, and metadata lock
9. Final identity system and app icon validation
10. Final App Store assets and controlled launch
