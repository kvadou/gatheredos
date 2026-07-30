# GatheredOS — Gap Analysis: Path to a Customer-Complete Product

**Date:** 2026-07-13. **Frame:** pretend a paying customer signs up tomorrow expecting the business plan's promise (the home's digital memory + proactive care + grounded answers, across five pillars). What breaks that promise today, and in what order do we fix it. **Status of record:** everything in `docs/HANDOFF.md` through commit `ca801c6` is live.

## 1. What "complete" means (per pillar, customer-visible)

| Pillar | The promise the customer buys | Complete when |
|---|---|---|
| 1. Know My Home | Everything about my home in one place, captured effortlessly | Any document/photo/statement becomes structured knowledge without manual data entry |
| 2. Care For My Home | It tells ME what to do and when — I don't have to open the app | Reminders/digests arrive by push/email at the right time; schedules maintain themselves |
| 3. Improve My Home | Grounded advice with real numbers | ROI/budget answers use regional cost data, not hand-waving |
| 4. Protect My Investment | Warranties, spend, and value tracked and defended automatically | Expiries alert before they lapse; spend/value roll up without bookkeeping |
| 5. Household Intelligence | The whole household shares one brain | Every member sees/acts per role; knowledge survives handoff ("if something happened to me") |

## 2. Honest inventory — what exists and works today

- **Web**: 7 sections wired to real data; onboarding (address autofill + autocomplete + property-prefill scaffold); household invites (link-based, E2E-verified); receipt extraction cascade (haiku vision → items/cost/warranty/timeline/facts + review queue); Ask with 11-source retrieval + machine citations; recurrence roll; admin analytics; responsive + a11y swept; zero fake-capability UI remaining.
- **iOS (TestFlight)**: full 5-tab parity (Care w/ complete+snooze, Ask streaming w/ citations, Projects, Home w/ insights digest, Library w/ camera→receipt capture into the same cascade), Settings, create-home, UITest screenshot harness, Xcode Cloud auto-ship.
- **Engine**: extraction pipeline (receipts fully mapped), provenance both patterns, confidence gating + suggestions queue, home_facts w/ supersession, dedupe discipline, depth cap.
- **Infra**: Supabase RLS throughout, dual-transport API auth, Vercel + Xcode Cloud CI, security-review loop.

## 3. The gaps, tiered

### Tier 1 — Broken promises (the product implies it; nothing delivers it)

| # | Gap | Why it breaks the promise | Size |
|---|---|---|---|
| 1.1 | **No outbound channel at all.** No email (Resend key is an empty placeholder), no iOS/web push, no digest, no reminders. Password reset emails silently rate-limited via Supabase's built-in sender; invite links can't be emailed; warranty-expiry insights sit unread in a table. | Pillar 2 and 4 are *proactive* promises. Today GatheredOS only talks when opened — it's a filing cabinet, not a caretaker. **This is the single biggest gap.** | L |
| 1.2 | **Nothing runs on a schedule.** Warranty status transitions (active→expiring→expired), seasonal task generation, insight refresh/supersession, digest assembly — all designed, none scheduled. No cron exists anywhere. | Data goes stale the moment the user stops uploading | M |
| 1.3 | **Engine steps 5–6 unfinished.** Manuals/warranties/inspections/photos only partially mapped (receipts are the only first-class doc type); zero sonnet reasoning passes (no replacement forecasts, no onboarding batch insights, no Ask fact-capture). | "Upload anything, the home gets smarter" is only true for receipts | L |
| 1.4 | **cost_ref never built.** ROI/budget/replacement-cost answers degrade to generic ranges. | Pillar 3's "real numbers" are still hand-waving (10 of the playbook's 100 questions) | S–M |

### Tier 2 — Missing table stakes (any paid product has these)

| # | Gap | Notes | Size |
|---|---|---|---|
| 2.1 | **Trust/legal pack**: no ToS, no privacy policy, no data export, no account deletion | Deleted the fake "Data & export" toggle; the real thing is a launch blocker | M |
| 2.2 | **Auth hardening**: email confirmations OFF, password reset needs real SMTP, no rate limiting on `/api/ask` + `/api/ingest` + `/api/address-search` (every one burns money or upstream quota) | Abuse + cost exposure | S–M |
| 2.3 | **Monetization: nothing.** No Stripe, no plan gating, no free-tier limits. Business model (Free/Premium) is a doc, not code | Also required to *cap* AI spend per free user | L |
| 2.4 | **Monitoring/alerting**: no uptime checks, no error alerting, no AI-cost dashboard | We find outages via Doug's screenshots (today proved it) | S |
| 2.5 | **Custom domain + real landing page** | gatherroot.vercel.app isn't a brand a customer pays | S |
| 2.6 | **Support channel** (even just support@ + an FAQ) | — | S |

### Tier 3 — Completeness inside existing features

| # | Gap | Size |
|---|---|---|
| 3.1 | Household: member removal, role enforcement in UI (guest = read-only exists in RLS only), multi-home current-home picker, invite via email once outbound exists | M |
| 3.2 | Ask v2 (playbook stages 1/5/7): follow-up actions that mutate ("schedule this", "save as project"), clickable citations → deep links, conversation history on iOS, fact-capture queue | M–L |
| 3.3 | Capture flywheel: forward-to-ingest email address (receipts@), bulk upload, Gmail receipt import (the honest version of the deleted fake toggle), light the RentCast/Mapbox keys | M–L |
| 3.4 | iOS 1.0: push notifications, universal links (invite links should open the app), App Store submission pack (screenshots, privacy labels, review), Care/Library large-title gap fix | M |
| 3.5 | Photo vision (engine §7.5), embeddings for semantic recall (diagnosis archetype), inspection multi-page PDFs | L (post-1.0 candidates) |

### Tier 4 — Ecosystem (post-1.0, per GTM Phase 3)

Contractor marketplace (the `contractors` table seed), Move Mode, insurance/utility integrations, referral loops. Not v1.0.

## 4. Sequenced path to customer-complete v1.0

Each phase ships + verifies alone, in this order (dependency-driven: outbound spine unblocks half of everything else):

1. **Outbound spine** — Resend + verified sender domain, Supabase SMTP swap, Vercel cron skeleton. First consumers: auth emails, invite emails, warranty-expiry alert, weekly digest (assembled from existing insights/tasks). *Gates: Doug buys domain + Resend account.*
2. **Scheduled intelligence** — cron jobs: warranty status refresh, seasonal task generation, insight supersession. (Small once #1 exists.)
3. **Engine completion** — doc-type prompt branches (manual/warranty/inspection), sonnet reasoning passes (forecast, onboarding batch, Ask fact-capture), `cost_ref` static dataset. Closes intelligence-engine build order 5–6.
4. **Trust pack** — ToS/privacy pages, JSON+files export, account deletion, email confirm ON, rate limits (upstash or simple per-user counters), Better Stack monitors.
5. **Monetization** — Stripe subscription, free-tier limits (homes/uploads/asks per month), premium gates aligned to the business plan.
6. **Ask v2 + capture flywheel** — action chips → real mutations, clickable citations, email-in ingest, light the geocoding/property keys.
7. **iOS 1.0** — push (APNs via a cron-driven notifier), universal links, App Store submission.

Rough shape: 1–2 focused sessions per phase at today's cadence.

## 5. Blocked on Doug (accounts/decisions only he can make)

- Domain purchase (+ pick the name story: getgatheredos.com?) → DNS for Resend sender + universal links
- Resend account; Stripe account; RentCast + Mapbox keys (already queued from tonight)
- Apple: App Store listing assets, privacy labels sign-off
- Legal: review generated ToS/privacy before publishing
- Pricing: confirm Free/Premium boundaries from the business plan before gating

## 6. Explicit v1.0 non-goals

Marketplace/Move Mode (Tier 4), embeddings, photo vision, multi-language, Android, web push (iOS push first), MLS integrations beyond RentCast records.

---
*Superseded docs: none. Companion to `docs/HANDOFF.md` (current state) and `docs/plans/2026-07-12-phase2-intelligence-engine.md` (engine contract). The 100-question grounding for Tier 1.3/1.4 sizing lives in `2026-07-12-phase2-reasoning-playbook.md` §4.*
