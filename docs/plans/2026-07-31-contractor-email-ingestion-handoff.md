# Contractor email ingestion — session handoff

**Dates:** 2026-07-30 → 2026-08-03
**Branch:** master (all pushed, Vercel deploys from master)
**Commits:** `e4ee752`, `53033c2`, `beae2fe`, `3523584`, `812de89`, `b0dca47`, `6e3405d`, `88b1380`,
`2483143`, `792cd34`, `5d6c630`
**Status:** live on gatheredos.com, verified against Doug's real inbox. Forward-in address shipped
but dark pending DNS — see `docs/plans/2026-08-03-forward-in-address.md`.

---

## Why this exists

Came out of watching a Phlash Consulting video ("Your Website Won't Matter in 3 Years"). Its
thesis is supply-side — contractors should publish pricing, enable agentic booking, and build
"knowledge catalogs" so AI recommends them. GatheredOS sits on the **demand side**: it is the
homeowner's agent in that picture, not a website being disintermediated.

The wedge: field-service platforms (ServiceTitan, Jobber, Housecall Pro) already mail the
homeowner a structured record of every appointment and invoice. That mail is the cheapest source
of real service history there is — no partner API, no BD deal, no scraping. Doug's own
ServiceTitan confirmation from Lebrun Electric was the trigger.

Strategic value, in order:
1. Onboarding stops being data entry (connect Gmail, get years of history).
2. Accumulates a dataset nobody has: verified job records across many homes and contractors.
3. Makes a future ServiceTitan/Jobber partner conversation possible — empty schema is not a reason
   for them to talk; N thousand verified jobs is.

---

## What shipped

### Ingestion pipeline
- `supabase/migrations/20260730120000_email_ingestion.sql` — `imported_messages` (dedupe + audit,
  unique on `home_id,provider,external_id`); `extractions` gained `source_kind`/`source_ref` and a
  nullable `file_id` so email reuses the same provenance chain and FTS index as documents.
- `lib/gmail/client.ts` — token refresh + three read endpoints (`server-only`).
- `lib/gmail/message.ts` — pure message decode (types, `bodyText`, `header`, sender parsing). Split
  from the client so scripts/tests can import it without tripping `server-only` under tsx.
- `lib/ingest/email.ts` — vendor detection, both Gmail queries, one Haiku call per message,
  proposal building.
- `lib/ingest/email-pipeline.ts` — `syncContractorEmail()`: list → dedupe → batch → cascade →
  attachments.
- `lib/actions/gmail.ts` — `syncContractorEmailNow()` server action (role gate + rate limit,
  `batchSize: 6`, `withinYears: 10`).
- `components/settings/settings-panel.tsx` — `ContractorImportRow` under Gmail in Connected Sources.
- `scripts/test-email-ingest.ts` + `pnpm test:email-ingest` — 37 checks, real Haiku.

### Key design decisions (and why)

**Reuse the existing ingest cascade, don't build a parallel one.** `lib/ingest/pipeline.ts` already
had confidence gating, dedupe keys, a review queue, and appliers for exactly the targets needed.
`applyCascade` was refactored from `(db, file, extractionId, env, depth)` to
`(db, source: CascadeSource, env, depth)` so both document and email sources share one gate.
`care_events` dedupes on `provenance->>source_key` with a `file_id` fallback for rows written
before `source_key` existed.

**Historical visits deliberately do NOT enter `service_cases` / `service_appointments`.** That layer
models a live operator-coordinated case with authorization gates and offer/appointment FKs. A 2021
plumbing invoice has no case, offer, or authorization. History goes to the memory tables:
`contractors`, `care_events`, `care_tasks`, `timeline_events`, `home_facts`, `files`.

**Routing rules.** Past visit → `care_events`. Future visit → `care_tasks` (shows in /care).
Priced work → `timeline_events`. Contractor → `contractors` (always queued, never auto-created).
Estimate → contractor + facts only, never a care_event (no work happened). Attachments → real
`files` rows, which re-enter the document extraction engine.

**Batched, client-looped sync.** 65 Claude calls will not survive one serverless invocation. Each
action call processes 6 messages and returns `truncated`; the client loops up to 20 rounds showing
a running count. Do not "simplify" this back into one long request.

**Identity confidence ≠ field confidence.** This was the single most important lesson from real
mail — see below.

---

## The bugs real mail found (fixtures did not)

1. **Dropped contractors.** Two Hero Plumbing invoices are the "your invoice is ready, click to
   view" shape — no date or amount in the body. The model scored the whole extraction 0.35, under
   the 0.5 floor, so the contractor was discarded along with the unreadable fields. But the company
   is in the sender address and subject. Fix: contractor proposals score on identity evidence
   (known platform vendor, or display name matching extracted company), floored at 0.8.
2. **Dropped visit records.** Same flaw one level down: seven processed messages produced only one
   `care_event`. Fix: `recordConf` — visit records from an identified contractor score on identity,
   capped at 0.84 so they always land in the review queue rather than auto-applying.
3. **Estimates discarded.** A message subject `7263 Little Ave NE, Otsego` (Elander Mechanical) was
   classified `estimate` and dropped. An estimate is not a visit but IS a contractor who engaged
   with the home — which is the actual question the feature answers.
4. **Wide-pass cost.** 22 of 24 model calls were spent rejecting newsletters. Gmail's own
   `-category:promotions -category:social -category:forums` removes that traffic server-side, free.
5. **Misleading empty state.** After a run that only re-checked known mail, the panel said "No
   contractor email found in the last five years" — wrong on both counts. Nothing-new and
   nothing-found now read differently.

### Security fixes (from a background review of `e4ee752`)
- **Prompt fence escape.** `bodyText` decoded HTML entities *after* stripping tags, so a body
  containing `&lt;/untrusted_email&gt;` reached the model as a real closing tag and everything after
  it read as instructions. Angle brackets now decode to fullwidth lookalikes, comments are stripped,
  `&amp;` decodes last. Second layer: `sanitize()` rewrites any literal `untrusted_email` tag.
- **Authorization.** Guests are read-only but could trigger writes to a home they only view. Added
  the owner/family role gate `updateHome` uses.
- **Abuse cap.** `rateLimited` at 60/hour/home (every batch spends Gmail quota + Claude calls).
- **Attachment paths.** Dot-runs collapsed so `..` cannot enter a storage key; `upsert: false`.

---

## Current state (verified 2026-07-31 ~07:25 CDT)

**4 contractors pending confirmation on the dashboard:**

| Contractor | Source | Year |
|---|---|---|
| B&D Plumbing, Heating & Air Conditioning | ServiceTitan | 2020 |
| Hero Plumbing, Heating & Cooling | ServiceTitan | 2021 |
| Lebrun Electric LLC | ServiceTitan | 2022 |
| Elander Mechanical Inc | direct email | 2026 |

7 messages `done`, 24 `skipped`, 1 `care_event` written so far (Lebrun, 2023-01-03). The other three
contractors' visit records should appear after a re-run on `812de89` — that is the fix that has not
yet been exercised against real mail.

**Google OAuth is configured** (project `homebase-ai-487323`, personal Gmail account):
- Vercel prod: `GOOGLE_GMAIL_CLIENT_ID`, `GOOGLE_GMAIL_CLIENT_SECRET` (both marked **Sensitive** —
  write-only, `vercel env pull` returns them empty, this is expected and not a bug),
  `GOOGLE_TOKEN_ENCRYPTION_KEY` (also in `.env.local`).
- Redirect URI: `https://gatheredos.com/api/gmail/callback` (must match `NEXT_PUBLIC_SITE_URL`).
- Test users: `dougkvamme@gmail.com`, `Alexis.Kvamme@gmail.com`.
- **Publishing status: Testing.** `gmail.readonly` is a restricted scope, so refresh tokens expire
  after **7 days** — expect to reconnect weekly. Escaping that needs Google verification (privacy
  policy, homepage, demo video, and a CASA assessment for restricted scopes). Hard gate before any
  other user can connect Gmail.

---

## Next session — start here

**All code work is committed and pushed. Two things are waiting on Doug, one is waiting on DNS.**

1. **Accept or reject the 8 pending cards** (`/` dashboard). The queue is finally short and real:
   4 contractors, 1 water heater, 2 people-facts, 1 Hero care_event. A contractor that never touched
   the house is a false positive and the failure mode that matters most here.
   - Note: the water heater card's `installed_on` (2021-02-04) came off an *estimate*, before the
     quote rule landed. Reject the date if nothing was installed that day.
2. **Turn on the forward-in address.** Code shipped and verified end to end, dark until the Resend
   MX records and `INBOUND_WEBHOOK_SECRET` exist. Four steps, all in
   `docs/plans/2026-08-03-forward-in-address.md`. This is the one that unblocks users who are not
   Doug — Gmail OAuth cannot serve them until Google verification.
3. **Multi-property.** The 2020 B&D estimates name 7064 Peony Lane N, not the current home.
   `service_address` is recorded but never routed on, so pre-move mail lands in the current home.
   Decide before onboarding anyone who has moved.
4. **Deferred by design:** MCP server over the home (read tools + `open_service_case`), A2A endpoint,
   Google verification itself (privacy policy, homepage, demo video, CASA assessment).

### Smaller, known, not urgent
- **`processing` rows only get swept by a Gmail sync.** `sweepStranded()` runs at the top of
  `syncContractorEmail`, so a home that only ever forwards never sweeps.
- **No "we got it" feedback on forwarding.** Forwarded mail shows in "What we read", but nothing
  confirms receipt at the moment of forwarding. The outbound sender is already configured.
- **`database.types.ts` was regenerated** on 2026-08-03 after drifting badly (it was missing
  `imported_messages` and several other tables — the reason the codebase is littered with
  `as never` casts). It drops in clean. Removing those casts is a standalone tidy-up.

---

## Retrospective — 2026-07-31 → 2026-08-03

Six commits: `6e3405d`, `88b1380`, `2483143`, `792cd34`, `5d6c630` (plus `b0dca47`, this doc).

**One bug class, found at four different layers.** Nearly everything fixed this session was the same
mistake wearing different clothes: *identity keyed on the source rather than on the thing*, and its
sibling, *one confidence score for a whole extraction rather than per claim*.

| Layer | Symptom | Root cause |
|---|---|---|
| Contractors (prior session) | known contractor discarded | one confidence for the whole email |
| Visit records (prior session) | 7 messages, 1 care_event | same, one level down |
| Spend | $26,631 recorded against $168.87 paid | quotes indistinguishable from invoices; key was the file |
| Review queue | 37 cards, 26 of them noise | key was the model's prose; findings ungated |

The spend number is the one to remember: **$26,631.09 → $168.87**. Three good/better/best option
sheets from one plumbing visit, each counted as a completed purchase, each duplicated because
ServiceTitan re-renders the PDF per send so the content hash never matched.

**What actually found the bugs: looking at the data.** Not review, not tests. The fixtures were
green the whole time. Every real defect this session surfaced by querying what was actually in the
tables and reading it — the 37-card queue, the 13 care_events, the five spellings of one water
heater. The lesson is cheap to apply: after any extraction feature ships, go read the rows.

**What worked, worth repeating:**
- **Dry run by default, `--apply` to commit.** All three repair scripts (`reprocess:email`,
  `cleanup:spend`, `cleanup:queue`) print what they would do and change nothing. Every one of them
  found something worth checking before deletion.
- **Verify the flagged rows, not the count.** `cleanup:spend` wanted to delete $1,941 of B&D. Before
  running it, checked *which marker fired* — both PDFs said `ESTIMATE #` in the header. True
  positives, but the check is what made deleting them safe.
- **Write the test with the real strings.** `test-review-queue.ts` uses the literal five spellings
  from the queue. It immediately caught a false positive in the *first* draft of the service rule:
  "Maintenance hatch" is a real fixture, and a leading-keyword match would have silently dropped it.
- **Asymmetric rules, stated out loud.** `looksLikeEstimate` biases toward calling things estimates
  (a missed one corrupts money); `looksLikeService` biases toward keeping (a dropped fixture never
  reaches the user). Both directions are written in the comments so the next change does not flip one.

**Tooling gotchas that cost real time:**
- `pnpm start` does **not** die to `pkill -f "next start"` — the listener is `next-server`. Killing
  the wrong name leaves a server running against a rebuilt `.next`, which serves stale markup and
  500s on chunks. Looks exactly like "my change did not build."
- Verifying a logged-in route locally: Supabase's redirect allowlist has no localhost entry, so a
  magic link always bounces to prod. `generateLink` → `verifyOtp` → write the session as a
  `sb-<ref>-auth-token` cookie into a playwright storage-state file. Delete it after.
- `import 'server-only'` makes a module unimportable from a tsx script. Same resolution as
  `lib/gmail/message.ts`: keep the marker off modules the checks need to reach.

---

## What the 2026-08-01 re-import found

The re-run confirmed the identity-confidence fix: the reprocessed Hero invoice produced a
`care_events` proposal at 0.80, queued for review exactly as designed. But the visit records already
in the home came almost entirely from the **PDF attachments**, and that path had two defects the
email path had already learned about:

1. **Quotes counted as spend.** The Hero email carried `Good.pdf`, `Better.pdf`, `Best.pdf` (a
   good/better/best option sheet) plus the real `Invoice_458842.pdf`. Each option became a completed
   purchase. Both B&D PDFs said `ESTIMATE #` in the header and did the same. Recorded spend was
   $26,631.09 against $168.87 actually paid.
2. **One purchase, N rows.** ServiceTitan re-renders the invoice PDF per send, so two messages
   carrying the same invoice produced two `files` rows with different content hashes — the
   content-hash dedupe cannot see they are the same document.

Fixes (2026-08-01):
- `is_estimate` in the extraction schema, plus `looksLikeEstimate()` — a deterministic marker list
  that forces it true regardless of what the model said. Asymmetric on purpose: a missed estimate
  corrupts the money, a false positive loses one spend row the real invoice usually carries anyway.
  A quote still yields its contractor, item and facts; only the money is withheld. It also no longer
  sets `installed_on`.
- `spendKey(vendor, date, total)` is the `care_events` dedupe key when all three are known (falling
  back to `file:<id>`), and `autoApply` matches on title+date+cost as a last resort so rows already
  written converge.
- `pnpm cleanup:spend` repairs existing data, replaying `looksLikeEstimate()` over stored
  `extractions.raw_text` so it needs no new Claude calls. Recomputes `projects.spent`, which is a
  stored rollup off `care_events`.

Open question, not chased: the 2020 B&D estimates name **7064 Peony Lane N**, not the home's
7263 Little Ave NE. Multi-property routing is still deliberately unimplemented (`service_address` is
recorded but not routed on), so pre-move mail lands in the current home.

## Review-queue quality (2026-08-01)

The same defect class one layer up: 37 pending cards, of which 26 were noise.

1. **Findings off non-inspection documents.** A plumber describing what he saw
   ("water supply lines: corroded") on an invoice is not handing over a punch list, but the model
   reports both shapes in `findings`. One Hero visit produced 18 to-dos and 2 projects. The §7.4
   inspection *summary* in `pipeline.ts` always carried a `docType === 'inspection'` guard; the
   proposals feeding it did not. Now they do.
2. **Keys built from model prose.** One Rheem water heater became five cards because the key
   preferred `model` ("40 gallon natural gas power-vent water heater", four ways) over `item_name`
   ("Water heater"), which never drifted. `itemKey` now keys on category + name only. Manufacturer
   is out of the key too: it is often absent, and a null must not fork a second card. The trade is
   that two real water heaters in one home propose one card — better than five for one.
3. **Work performed, filed as an owned thing.** "Plumbing repair service" and "Kitchen plumbing
   installation and repairs" reached the Library, which is a register of what the home HAS.
   `looksLikeService()` matches by position, not by keyword anywhere: a work noun at the END is the
   signal, and at the start it needs "of" behind it. The obvious keyword list is a trap — "Service
   panel", "Water service line", "Maintenance hatch" and "Installation kit" are all real fixtures.
   Biased toward keeping, opposite to `looksLikeEstimate`: a service wrongly kept is one card the
   user rejects, a fixture wrongly dropped never reaches them.
4. **Two key formats for one contractor.** The document path built `contractor:<raw lowercase>`,
   the email path `email:contractor:<slug>`, so B&D could never dedupe against itself across
   sources. Both now call `contractorKey()`, which also strips legal suffixes (Inc/LLC/Co) and
   folds `&` into `and` — the same drift that split one invoice into two vendors in `spendKey`.

`lib/ingest/keys.ts` is now the single home for every prose-derived dedupe key.
`pnpm cleanup:queue` repairs existing cards (pending only — accepted and rejected are user
decisions), keeping the most confident card and, on a tie, the one with the most fields filled.

## Verification

```bash
pnpm test:review-queue    # 20 checks, no Claude calls, instant
pnpm test:spend-rules     # 19 checks, no Claude calls, seconds
pnpm test:email-ingest    # 37 checks, real haiku, ~2 min, costs a few cents
pnpm tsc --noEmit
pnpm lint
pnpm build
```

The test suite covers: ServiceTitan appointment, Jobber invoice, marketing rejection, prompt
injection, plain-text fence escape, HTML-entity fence escape, estimate handling, the opaque-invoice
shape that failed in production, idempotency, and the document path's legacy dedupe.

---

## Environment gotchas hit this session

- **Dev server HMR reload loop.** `pnpm dev` fell into a Turbopack panic + ~27 reloads/sec, making
  browser automation impossible. Verified against `pnpm build && pnpm start` instead. Root cause not
  chased; unrelated to this work.
- **`playwright-cli` writes `.playwright-cli/` into the project root**, which the Next watcher picks
  up. Run it with `cd` into a scratch dir. Now gitignored.
- **Verifying a logged-in route locally.** Supabase's redirect allowlist has no localhost entry, so a
  magic link always bounces to prod. What works: `generateLink` → `verifyOtp` with the hashed token →
  write the session as a `sb-<ref>-auth-token` cookie (`base64-` + base64 JSON, chunked at 3180) into
  a playwright storage-state file → `pw-verify <url> --state <file>`. Delete the state file after.
- **`pnpm start` does not die with `pkill -f "next start"`** — the listener is `next-server`. Killing
  the wrong name leaves a server running against a `.next` that was rebuilt underneath it, which
  serves the old markup and 500s on chunk requests. Looks exactly like "my change didn't build".
- **`.env.local` cannot be `source`d** — a multi-line value breaks zsh parsing. Parse it with Python
  or pass vars explicitly (`SUPABASE_DB_PASSWORD="$(...)" supabase db push`).
- **Never paste a secret into a `vercel env add` command via clipboard** while the clipboard holds
  the command itself — did exactly that, stored the command text as the credential, and only caught
  it with a shape check. Use the dashboard, or get the command on the prompt first.
