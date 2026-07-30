# GatheredOS — Customer-Complete Plan v2 (post-Codex absorption)

**Date:** 2026-07-13. **Supersedes** the sequencing in `2026-07-13-customer-complete-gap-analysis.md` (its tier framing + pillar definitions still stand). Two build waves landed since it was written: the 7/12-evening engine/trust wave (Claude session, 10 commits, all [runtime-tested]) and a 7/13 early-AM Codex wave (13 commits, pushed unreviewed, since audited + stabilized).

## 1. Verified state of the product (audited, not claimed)

**Engine (gap 1.3 + 1.4): CLOSED.** All doc types cascade (receipt/manual/warranty/inspection/photo); sonnet reasoning passes live (replacement forecast, inspection summary, onboarding starter insights, Ask fact-capture queue-only); cost_ref benchmarks ground price/ROI answers. Harnesses: test-doctypes, test-reasoning.

**Scheduled intelligence (gap 1.2): SKELETON LIVE [prod-verified].** Daily Vercel cron → warranty status refresh (expiring/expired transitions + insight mint/dismiss) + Codex's recall monitor (sharded, deduped). Harness: test-cron.

**Trust pack (gap 2.1/2.2): MOSTLY DONE.** Rate limits on all metered routes (429 before spend); GET /api/export (all homes, signed URLs); self-serve account deletion (sole-owner erase incl. recursive storage, shared-home survival; server-only module); ToS/privacy DRAFTS in docs/legal (16 [FOUNDER:] placeholders). Harnesses: test-ratelimit, test-account.

**Codex wave (audited 7/13 — no P0s, no security holes; verdicts below):**
| Feature | Verdict |
|---|---|
| Notification spine (prefs UI, service-only delivery ledger, email dispatch in cron, invite emails) | REAL — dark until Resend key + **unapplied migration** |
| Gmail read-only OAuth (AES-256-GCM token encryption, CSRF-protected) | REAL — dark until Google creds + **unapplied migration** |
| Home switching (persisted, RLS-gated) | REAL, live |
| Full-memory search (/api/search + topbar) | REAL, injection-safe, live |
| Emergency mode, printable handoff record, guided capture walkthrough, explainable forecast page | REAL, live |
| Live item scanner (web BarcodeDetector + iOS VisionKit) | REAL, live (note: iOS photos now always ingest → haiku cost per photo) |
| CPSC recall check + cron monitoring | REAL API — matcher had a false-positive P1, fixed 7/13 |

**Build honesty restored:** Codex had set `typescript.ignoreBuildErrors: true` (shipped a real type error). Removed; tsconfig scoped to app code; builds type-check again.

## 2. What remains, re-tiered

### Now blocked ONLY on Doug (all build work exists)
1. ~~Apply 2 migrations~~ **DONE 7/13 (Doug-named db push)** — tables live, types regenerated, full 3-job cron [prod-verified]: warranty refresh + recall monitor (0 false alerts post-fix) + notification dispatch (7 recipients evaluated, skipped cleanly sans key, ledger working).
2. ~~Resend key~~ **DONE 7/13** — key live in prod, first real email sent, dispatch attempted live (6 sandbox 403s to test accounts, ledger + retry proven). **REMAINING: domain** — Resend sandbox only delivers to the account owner; verify a domain at resend.com/domains, swap WELCOME_FROM_EMAIL to it, and every queued/failed delivery auto-retries on the next daily run.
3. **Google OAuth creds** (GOOGLE_GMAIL_CLIENT_ID/SECRET + GOOGLE_TOKEN_ENCRYPTION_KEY) → Gmail receipt import foundation lights (gap 3.3).
4. ~~RentCast + Mapbox keys~~ **DONE 7/13, [prod-verified]** — Doug's own address autocompletes with house number (Mapbox) and prefills year/sqft/beds/baths from public records (RentCast, free 50-req/mo Developer plan).
5. **Legal review** of docs/legal drafts → then /terms + /privacy pages ship (small).
6. **Better Stack**: 12/12 monitor quota — free a paused STC slot (Hub-Intel/Learn), upgrade, or skip.
7. **Pricing sign-off** → unlocks phase 5 (Stripe + free-tier caps).

### Post-gate verification work (mine, ~1 session once #1+#2 land)
- Regen database.types.ts (`supabase gen types`) → remove the ~15 `as never` casts.
- E2E the outbound spine against a real inbox: invite email, warranty alert, care reminder, digest; confirm ledger rows + dedupe.
- Tighten `homes: member update` RLS to owner/editor in the same migration wave (app-level gate already added 7/13).
- pw-verify sweep of the 6 new routes; iOS TestFlight build with scanner.

### True remaining build gaps (descoped from v1.0 unless Doug pulls them in)
- Ask v2 leftovers: clickable citation deep-links, conversation history on iOS.
- Household: member removal UI, multi-home current-home picker polish (switching exists now).
- Email-in ingest (receipts@ forwarding) — pairs with domain.
- Stripe monetization (phase 5) after pricing sign-off.
- iOS 1.0 pack: push notifications (APNs), universal links, App Store submission.

## 3. Sequenced next steps

1. Doug: db push + Resend/domain (30 min total) → me: outbound verification session → **gap 1.1 closed, product is proactive.**
2. Doug: legal placeholders → me: publish /terms + /privacy → **gap 2.1 closed.**
3. Keys (Google, RentCast, Mapbox) as Doug gets to them — each lights finished code.
4. Then either monetization (phase 5) or iOS 1.0 (phase 7) — Doug picks the race.

## 4. Standing lessons (carry to every session)
- Codex sessions ship unreviewed straight to prod: ALWAYS audit range + check migrations applied + check for ignoreBuildErrors-class bypasses on resume.
- Fake-capability audit found Codex work honest (dark features disclose themselves) — the constitution is holding across tools.
- usage_events is insert-only under RLS; app-side counters must count service-role with explicit scoping.
