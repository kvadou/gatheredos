# GatheredOS — Session Handoff (2026-07-13)

Resume point after the 7/12 mega-session + the 7/12-evening engine-completion session. Working tree clean on `master` at `e1559c4`, all pushed, prod deployed (gatherroot.vercel.app), iOS auto-shipping via Xcode Cloud.

> **7/13 UPDATE — read `docs/plans/2026-07-13-customer-complete-v2.md` first.** A 13-commit Codex wave (notification spine, Gmail OAuth, search, home switching, scanner, recalls, emergency/handoff/forecast/capture) landed unreviewed overnight, was audited (no P0s, verdicts in the v2 plan), stabilized (ignoreBuildErrors bypass removed), and hardened (recall-matcher P1 + P2 batch). TWO MIGRATIONS AWAIT `supabase db push` (Doug must name it). Outbound spine is BUILT — domain + Resend key are the last mile.

## TL;DR — where we are and what's next
Web + iOS are at feature parity and honest. **The intelligence engine is now COMPLETE for v1 (gap-doc 1.3 + 1.4 closed 7/12 evening)**: every doc type cascades (receipt/manual/warranty/inspection/photo), sonnet reasoning passes run (replacement forecast, inspection summary, onboarding starter insights, Ask fact-capture), and cost_ref grounds price/ROI answers. Household sharing live (Alexis acceptance pending). **Forward plan: `docs/plans/2026-07-13-customer-complete-gap-analysis.md`** — next build phase is **#1 Outbound spine** (Resend + domain: auth/invite/warranty/digest emails), gated on Doug buying a domain + Resend account. Ungated work if still blocked: gap phase 2 cron jobs that need no email (warranty status refresh, insight supersession — Vercel cron only) and phase 4 trust-pack items (rate limiting, export, deletion, ToS/privacy).

## What shipped 7/12 evening (phase 3, all [runtime-tested], commits c25431b/7cfb725/e1559c4)
- **cost_ref** (`lib/cost-ref.ts`): 23 system costs + lifespans, 12 project recoups, per-state multipliers → injected into Ask as general/estimated benchmark context. Verified live: answer blended home records with the state-adjusted range.
- **Doc-type cascades** (engine §7.2–7.5): manual intervals→queued care tasks (roll-vocab normalized); warranty→expiry reminder (auto, due 30d before), coverage insight, claim-line contractor (queued); inspection→per-finding tasks + recommended project for high severity; photos now ingest (plates fill items + auto-link files.item_id). New Proposal targets projects|files; new-entity queue policy centralized in applyCascade. **Fixed: accepting a contractor suggestion silently wrote nothing** (autoApply re-queued instead of inserting).
- **Sonnet reasoning** (`lib/ingest/reason.ts`, all depth-2, gate-reused): forecastForItem (ingest/createItem/acceptSuggestion hooks, cost_ref-grounded), inspectionSummary (XOR forecast, 1 sonnet max per ingest), onboardingCascade (care seeding + year-built timeline rule-based + ≤3 starter insights — homes no longer arrive empty), captureAskFacts (haiku, queue-only, untrusted-fenced).
- **Test harnesses committed**: `scripts/test-doctypes.ts` (4 fixture docs in `scripts/fixtures/`, real haiku E2E, contractor regression check) + `scripts/test-reasoning.ts` (all 4 passes, queue-only + empty-bias guarantees). Stale stub-era `test-pipeline.ts` deleted (broken since real extraction, verified on baseline).

## What shipped later that night (gap 2.x slice, commits 674d72c → 83d55b2)
- **Cron live in prod [prod-verified]**: vercel.json daily 11:00 UTC → `/api/cron/daily` (CRON_SECRET bearer gate; secret set in Vercel prod + redeployed) → `lib/cron/jobs.ts` warranty status refresh (active→expiring at −60d + insight; →expired + coverage-insight dismissal). `scripts/test-cron.ts` incl. idempotency.
- **Rate limits (gap 2.2)**: `lib/rate-limit.ts` count-query limiter over existing usage_events (service-role, explicit user scoping — usage_events is insert-only under RLS). ask 30/hr, ingest 60/hr, address-search 120/hr, property-lookup 60/hr; 429 before any model/upstream spend. Live-429 verified.
- **Export + deletion (gap 2.1)**: `GET /api/export` (all homes, JSON attachment, signed URLs, 5/hr) + Settings "Data & privacy" card w/ type-DELETE custom dialog. Deletion in `lib/account-admin.ts` (server-only module, deliberately NOT a server action — exported fn in 'use server' would be network-callable; automated security review caught this in-flight). Sole-owner homes erased incl. recursive storage walk (iOS nests under receipts/ — flat cleanup would orphan); shared homes survive w/ owner refs repointed. `scripts/test-account.ts` (run with NODE_OPTIONS='--conditions=react-server').
- **Legal drafts (gap 2.1)**: `docs/legal/{terms-of-service,privacy-policy}.md`, DRAFT-headed, 16 [FOUNDER:] placeholders — Doug reviews before any publishing.
- **Blocked**: Better Stack uptime monitor — account at 12/12 quota (two paused STC monitors, Hub-Intel + Learn, hold slots). Doug decides: free a slot / upgrade / skip.

## What shipped 7/12 (all [runtime-tested] or better, per-commit evidence in git log)
1. **Phase 2 step 4**: extraction mints `home_facts` (supersession dedupe); Ask retrieval broadened to 11 sources w/ row ids; answers stream inline `[cN]` citations + `@@CITATIONS@@` tail; confidence-toned chips + Sources row; citations persist. Prompt-injection fix in extract.ts (file metadata fenced as untrusted).
2. **iOS parity sweep A–E** (plan: `docs/plans/2026-07-12-ios-parity-plan.md`, all done): 5 tabs — Care (swipe complete w/ care_event + recurrence roll, snooze, history), Ask (streams web `/api/ask` via Bearer, citation protocol, Sources strip), Projects (kind segments), Home (Worth Knowing carousel + digest sections), Library (search, Documents w/ status chips, camera/PhotosPicker receipt capture → `/api/ingest` → full cascade; photos skip ingest), Settings sheet, CreateHomeView (no-home dead end killed), item edit, VoiceOver labels. **Verification harness**: `ios/GatheredOSUITests/ScreenshotSweep.swift` — logs in as dev, screenshots all 5 tabs; run via `xcodebuild test`. Design review: GO; carried findings below.
3. **Web↔iOS auth**: `lib/supabase/api-auth.ts` — `getApiUser` (cookie OR Bearer, no home needed — mid-onboarding safe) + `getApiContext` (adds home). Proxy passes `/api/*` through with a credential-less 401 backstop; route-level auth is the boundary.
4. **Onboarding address step rebuilt**: the v0 fake-suggestion trap (hard-blocked real addresses, injected fabricated property data) deleted; plain honest form; native autofill attrs (web) + `.streetAddressLine1` street-first (iOS, name derives from street); **real autocomplete** via `GET /api/address-search` (Mapbox when `MAPBOX_TOKEN` set → house-number coverage; keyless Photon/OSM fallback otherwise — OSM lacks Doug's own street), dropdown/card on both surfaces, augment-never-gate, OSM attribution. Verified 9-step walkthroughs at 1440/768/390 + prod.
5. **Property prefill scaffold**: `GET /api/property-lookup` (RentCast; dark `{property:null}` until `RENTCAST_API_KEY`) → step-home fills untouched year/sqft/beds/baths with "Prefilled from public records" attribution.
6. **Household sharing live**: `home_invites` migration applied to prod; Settings → Invite family dialog (Editor/Viewer, copy link, pending list + revoke); `/invite/[token]` w/ signup redirect (hardened `next` param — URL-parse guard); service-role accept (constitution §3.6), idempotent, single-use, onboarding bypassed. E2E: fresh account joined Willow Lane. **Invite for Alexis minted from Doug's real account + iMessaged 7/12 — check acceptance** (`home_invites` token d5b3f8a6…, `home_members` for alexis).
7. **Web recurrence roll** (engine §7.8, iOS parity): completeTask inserts next occurrence (`rollRecurrence` in lib/care-data.ts; vocab yearly / twice yearly / every 3 months / monthly + synonyms; template_slug dropped on the copy to dodge the template unique index; deduped on home/title/item/due).
8. **Fake-capability purge**: settings Connected Sources / Notifications / Privacy / Home Intelligence / fake "GatheredOS Plus · Visa 4242" billing / "87% Home Knowledge" — all deleted. Settings now = real stats, home profile, homes, family+invites.

## Doug TODOs (everything below is gated on these)
1. **Check Alexis accepted** her invite (or re-mint: Settings → Invite family).
2. **TestFlight build 2+** on phone: exercise Care/Ask/receipt capture; check whether the Care/Library large-title gap reproduces on-device (sim-only so far).
3. **Accounts** (agent cannot create accounts/authenticate — hard rule): rentcast.io + mapbox.com signups → keys → `.env` + `vercel env add RENTCAST_API_KEY MAPBOX_TOKEN` → both dark features light up. For gap-doc phase 1: **buy domain + Resend account**.
4. **Test-account cleanup** (classifier blocks agent-side auth deletes): 5 accounts onboard-{desktop,tablet,mobile,prodcheck} + invite-e2e @gatheredos.local — script was in 7/12 session scratchpad; trivial to regenerate: service-role delete homes by created_by then `auth.admin.deleteUser`.
5. Later gates: Stripe account, App Store assets, legal review, pricing sign-off (gap doc §5).

## Carried findings / known ceilings
- **Care/Library iOS phantom large-title gap** — pre-existing since v1, sim-verified only; suspect serif nav appearance × large title. Check on-device before chasing.
- OSM/Photon lacks many house numbers (Doug's street included) — Mapbox key is the fix; swap is already coded.
- Corner-radius drift across iOS tabs (12 vs 20); Ask iOS has no conversation history list; member removal UI + multi-home picker deferred.
- Invitee who already owns a home gets dual membership; `getCurrentHome` picks oldest — needs a current-home picker eventually (comment in code).
- Legacy dev-data row renders literal `**` in one old Ask answer (persisted pre-fix; ignorable).

## Gotchas (don't relearn)
- Next 16: `middleware.ts` → `proxy.ts` (export `proxy`). Don't "fix" back.
- RSC: never pass icon components server→client; icon NAME strings + `iconFor()` registries.
- **Xcode Cloud builds the COMMITTED xcodeproj**: any iOS file add/remove ⇒ `xcodegen generate` + commit `ios/GatheredOS.xcodeproj/project.pbxproj` in the same push, or CI breaks (Build 4 incident).
- Migrations: `supabase db push` (SUPABASE_DB_PASSWORD in .env) — permission-gated; Doug must name prod-apply.
- haiku structured outputs failed on our schema ("Schema is too complex") — extraction uses plain JSON prompting + code validation.
- pw-verify/playwright sessions expire; a redirect to /login trivially "passes" render checks. Local dev: Next allows ONE dev server per dir (lock).
- Subagents this session repeatedly idled without delivering reports — always check the worker (diff/tests) directly; two reviewer agents died silently, one left a half-applied edit that didn't compile.
- iMessage sends + auth-user deletes + prod db push are classifier-gated: Doug runs them via `!` or names the action.
- `supabase db push`: extract SUPABASE_DB_PASSWORD via `node -e` regex, NOT cut/tr — shell mangling corrupts it and the SASL failure looks like a bad credential.
- `import 'server-only'` modules throw under plain tsx. Harness them with `NODE_OPTIONS='--conditions=react-server'`; if the import chain also has client libs (lucide), lazy-import the server-only module instead (see lib/cron/jobs.ts).
- Editor/LSP diagnostics go stale while subagents edit — false module/type errors. `pnpm exec tsc --noEmit` is ground truth.
- Every exported async fn in a `'use server'` file is a public endpoint. Admin-only helpers live in separate server-only modules (see lib/account-admin.ts); dispatch specs must state module placement.
- Codex resume checklist: audit the range, check migrations actually applied to prod, grep for ignoreBuildErrors-class bypasses, fake-capability sweep.

## Key paths
- Forward plan: `docs/plans/2026-07-13-customer-complete-gap-analysis.md` (tiers + sequenced phases). Constitution: `docs/constitution.md`. Engine contract: `docs/plans/2026-07-12-phase2-intelligence-engine.md` (+ object model, reasoning playbook same date).
- Web: `app/api/{ask,ingest,address-search,property-lookup}/route.ts`, `lib/ingest/{pipeline,extract}.ts`, `lib/actions/{invites,care,...}.ts`, `lib/supabase/{api-auth,middleware,home}.ts`, `components/onboarding/steps/step-home.tsx`, `components/settings/settings-panel.tsx`, `app/invite/[token]/`.
- iOS: `ios/GatheredOS/*.swift` (13 views + service/models/theme), `ios/GatheredOSUITests/ScreenshotSweep.swift`, `ios/project.yml` (+ committed xcodeproj).
- DB: `supabase/migrations/` through `20260712192000_home_invites.sql` — all applied to prod.

## Accounts / env
- Dev: dev@gatheredos.local / gatheredos-dev-2026! (seeded Willow Lane, is_admin). Real: dougkvamme@gmail.com (owner, home "Home"), alexis.kvamme@gmail.com (invited).
- Env now also expects (optional until keys exist): `MAPBOX_TOKEN`, `RENTCAST_API_KEY`. Existing: supabase pair, service role, `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_SITE_URL`; `RESEND_API_KEY`/`WELCOME_FROM_EMAIL` still empty placeholders (phase 1 fills them).
- Supabase ref gpncqcnklcmqiakvdibg · Vercel project gatheredos (CLI authed) · Apple team FM45AMFBNY, Xcode Cloud auto-archive on master.
