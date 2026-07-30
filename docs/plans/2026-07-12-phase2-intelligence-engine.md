# GatheredOS Intelligence Engine — Phase 2 Design

**Date:** 2026-07-12
**Status:** Design spec (pre-build). Source of truth for the cascade layer.
**Scope:** For every user action, the downstream actions GatheredOS performs automatically so the product feels proactive and compounds knowledge instead of storing records.

The archetype is the roadmap's receipt cascade: `upload receipt → parsed → warranty updated → project cost updated → investment recalculated → maintenance updated → insight generated → Ask GatheredOS gains knowledge`. This spec makes that real for the live stack (Next.js 16 server actions + Supabase + Claude on Vercel) without introducing a queue, a worker, or a new service.

---

## 1. Execution model (real for this stack)

Two tiers, nothing else.

| Tier | Mechanism | Runs | Used for |
|---|---|---|---|
| **Inline** | the server action body itself (already how `recordUpload`, `completeTask`, `createProject` work) | user waits for it | the one authoritative DB write, cheap dedupe check, `revalidatePath`, redirect |
| **Deferred** | `after(() => cascade(...))` from `next/server`, called at the end of the same server action | after the response flushes, same Vercel invocation (Vercel keeps the function alive via `waitUntil`) | Claude extraction, cascade object creation, forecast reasoning |

`after()` is the whole async story. No Kafka, no Inngest, no cron, no DB-polling worker. It is fire-and-forget, runs post-response, and on Vercel the function stays alive until the callback resolves. One Claude call plus a handful of inserts fits comfortably inside the function budget.

**Ceiling (named, with upgrade path):** `after()` holds the invocation open for the callback. Budget it to one extraction call + one optional reasoning call (~3–8s). If a pipeline ever needs more (multi-page inspection PDF, batch photo album), the callback becomes `after(() => fetch('/api/ingest', { body: fileId }))` — fire the same `ingestFile` behind a route so the response returns instantly and the route owns the long work. Do not build the route until a timeout is actually observed. `// ponytail: after() inline callback; promote to /api/ingest route only when extraction exceeds function timeout`

### One shared pipeline

Every document type routes through a single function. There is no per-type upload handler.

```ts
// lib/ingest/pipeline.ts  (service-role client — runs outside the request's RLS session;
// sanctioned by constitution §3.6, always scoped to the triggering file's home_id)
export async function ingestFile(fileId: string): Promise<void> {
  const file = await loadFile(fileId)                    // 1. load row + home
  if (await alreadyProcessed(file)) return               // 2. dedupe on content_hash
  const ex = await startExtraction(file)                 // 3. insert extractions row (status='processing')
  const envelope = await extract(file)                   // 4. ONE Claude vision call → structured JSON
  await finishExtraction(ex.id, envelope)                // 5. extractions row: data, raw_text, confidence, status='done'
  await applyCascade(file, ex.id, envelope)              // 6. confidence-gated writes, provenance cites ex.id
  await stampFile(fileId, 'done')                        // 7. files.extraction_status flag for the Library UI
}
```

`extract()` classifies the document (receipt / manual / warranty / inspection / photo) and returns the same envelope shape regardless of type: `{ docType, fields, proposals[], confidences }`. `applyCascade()` is type-agnostic — it walks `proposals[]`, each of which names a `target` table, a `payload`, a `dedupeKey`, and a `confidence`. Adding a new document type = a new branch in the extraction prompt, zero new plumbing.

The hook point already exists: `recordUpload()` (lib/actions/library.ts) inserts the `files` row today. Append `after(() => ingestFile(fileId))` to it. Every upload path in the app funnels through `recordUpload`, so this is the only wiring change for all five document actions.

---

## 2. Provenance + confidence gating (designed once, reused everywhere)

**Every AI write carries provenance.** The mechanism is the object-model doc's two-pattern design (`2026-07-12-phase2-object-model.md` §1 — canonical for schema); this doc only states which pattern each cascade write uses:

| Write target | Pattern | Mechanism |
|---|---|---|
| `home_facts`, `insights` | A (row is wholly AI) | row columns: `source_kind`, `confidence`, `source_extraction_id`, `evidence` |
| `items`, `projects`, `warranties` | B (row mixes user + AI fields) | one `field_provenance` row per AI-filled field, citing the extraction |
| `care_tasks`, `care_events`, `timeline_events` | A-lite (row is wholly AI or wholly user) | `provenance jsonb` column: `{pipeline, model, file_id, extraction_id, confidence, depth}` |

The `depth` value used by the cascade cap (§4) lives in Pattern A-lite's jsonb and in `field_provenance.model`-adjacent metadata for Pattern B writes; `home_facts`/`insights` writes are always terminal (depth 2 max) so they need no depth column.

`care_tasks.source` and `insights.source` columns already distinguish `ai` vs `user` — provenance is the detail behind that flag. User edits to an AI-filled field delete/supersede its `field_provenance` row (the field becomes user-authored, the default trust state) and AI never overwrites a field that has no provenance row or a user-superseded one. That per-field freeze rule is exactly why Pattern B exists: a row-level flag cannot express "the user corrected `installed_on` but the AI still owns `lifespan_years`".

**Confidence gate — one threshold pattern for all proposals:**

| Confidence | Action |
|---|---|
| **≥ 0.85** | auto-apply: write straight to the target table, `source='ai'`, provenance stamped |
| **0.50 – 0.85** | queue: insert into `suggestions`, surface in the review queue for one-tap confirm |
| **< 0.50** | drop: not written, not shown; logged to `usage_events` (`event='ai_low_confidence'`) for tuning |

**The review queue (the confirm UX, built once):** a single polymorphic `suggestions` table is the entire confirm surface. Everything below threshold lands here; the user confirms or dismisses; confirm applies the payload to the real table with provenance.

```sql
create table public.suggestions (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references homes(id) on delete cascade,
  target text not null,            -- 'items' | 'care_tasks' | 'insights' | 'timeline_events' | 'contractors' | 'item_fact'
  action text not null default 'insert' check (action in ('insert','update')),
  target_id uuid,                  -- set for updates (which row to patch)
  payload jsonb not null,          -- the exact columns to write
  summary text not null,           -- human line: "Add water heater (Rheem, installed Jul 2026)?"
  confidence numeric not null,
  provenance jsonb not null default '{}',
  dedupe_key text not null,        -- (home_id, target, dedupe_key) unique — see §4
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  created_at timestamptz not null default now(),
  unique (home_id, target, dedupe_key)
);
```

One `<ReviewQueue>` component reads `status='pending'`, renders `summary` with Accept / Dismiss. Two server actions — `acceptSuggestion(id)` (apply `payload` to `target`, stamp provenance, mark accepted) and `rejectSuggestion(id)` — serve every document type and every action. No per-type confirm modal, ever. Surfaced as a badge on the dashboard and inline on the relevant page (a suggested item shows in Library greyed with a confirm chip).

---

## 3. Idempotency / dedupe keys (per pipeline)

Re-uploading the same receipt must not double-count cost or duplicate tasks. Two layers.

**Layer 1 — skip extraction entirely.** Client computes `SHA-256` of the file bytes (`crypto.subtle.digest`) before upload and passes it; server stores `files.content_hash`. `alreadyProcessed()` short-circuits `ingestFile` when a processed file in the same home already has that hash. Identical bytes = zero Claude calls, zero writes.

**Layer 2 — natural dedupe key per proposal.** Even for a genuinely new file (photo of the same receipt, different bytes), each cascade write carries a stable key so a re-run upserts instead of stacking:

| Pipeline / write | Dedupe key | On conflict |
|---|---|---|
| Document extraction | `files.content_hash` (unique per home) | skip |
| Item from document | fuzzy match `(category, manufacturer, model)` in home; else create | match-or-create, never blind insert |
| care_event (cost) from receipt | `(home_id, provenance.file_id)` | **update** (so cost is corrected, never added twice) |
| care_task from item template | `(home_id, item_id, template_slug)` | do nothing |
| insight | `(home_id, category, dedupe_slug)` | update headline/detail in place |
| timeline_event | `(home_id, year, title)` | do nothing |
| suggestion | `(home_id, target, dedupe_key)` | do nothing (no duplicate pending cards) |

Cost is the sharp edge: a receipt's dollar amount writes exactly one `care_event` keyed by `file_id` and updates it on re-extract. Project `spent` is **recomputed** as `sum(care_events.cost where project_id=…)`, never incremented — so recomputation is idempotent by construction.

---

## 4. Cascade depth cap (no runaway chains)

**Structural rule (primary):** cascades fire only from user-initiated triggers — a server action or a document ingestion. **AI writes never re-enter the pipeline.** Inserting an AI insight does not run `after()`; inserting an AI care_task does not run `after()`. There is exactly one reasoning pass per trigger. This makes "insight → task → insight → …" impossible because no AI-written row has a trigger attached to it.

**Numeric guard (belt-and-suspenders):** every AI record stamps `provenance.depth`. User/document trigger = depth 0; its direct AI writes = depth 1; a reasoning pass that reads depth-1 records may write depth 2; **the pipeline refuses to read or write anything at depth ≥ 2 as a trigger.** `applyCascade` asserts `depth < 2` before writing. If it ever trips, that is a bug, logged loudly — not a silent loop.

Net effect: max chain length is `user action → extract → { direct facts (d1), one forecast/insight (d2) }`. Bounded, always.

---

## 5. Cost discipline — which steps call Claude

Claude is called **only** to turn unstructured input into structure (vision extraction) or to write genuine narrative reasoning (a replacement forecast sentence). Everything a lookup table can do — "flush water heater annually," "HVAC filter every 90 days" — is a rule-based map in `lib/care-data.ts`, **no Claude call**.

| Step | Model | Tier rationale | Calls |
|---|---|---|---|
| Classify + extract a document | `claude-haiku-4-5` (vision) | cheap, structured extraction is not a reasoning task | 1 per upload |
| Caption / detect object in a photo | `claude-haiku-4-5` (vision) | same | 1 per photo |
| Replacement forecast / ROI narrative | `claude-sonnet-5` | genuine reasoning over home context | 0–1 per ingest |
| Answer a question | `claude-sonnet-5` | already live in `/api/ask` | 1 per question |
| Maintenance schedule from item category | **none** (static template map) | pure lookup | 0 |
| Project cost recompute, timeline write | **none** (SQL) | arithmetic | 0 |

**Rough calls-per-action:** receipt/manual/warranty/inspection upload = **1 haiku + at most 1 sonnet**. Photo = **1 haiku**. Add item / add contractor / complete task / log event / create project = **0** (rule-based), except a first-of-its-kind item may trigger 1 sonnet forecast. Onboarding finish = **1 sonnet** (one batch pass over all answers). Ask = **1 sonnet**.

---

## 6. Schema additions (one migration)

**The canonical Phase 2 migration lives in the object-model doc** (`2026-07-12-phase2-object-model.md` §4): `extractions`, `field_provenance`, `warranties`, `home_facts`, insight provenance columns, `files.extraction_status`. Extraction results persist in the `extractions` table (one row per run, the citation hub), NOT in a `files.extracted` jsonb — the file row keeps only the cheap status flag.

This engine adds on top of that migration:

```sql
-- A-lite row provenance (see §2) + engine keys
alter table care_tasks      add column provenance jsonb not null default '{}',
                            add column template_slug text;
alter table care_events     add column provenance jsonb not null default '{}',
                            add column project_id uuid references projects(id) on delete set null;
alter table timeline_events add column provenance jsonb not null default '{}';
alter table insights        add column dedupe_slug text;

-- byte-level dedupe on files (Layer 1, §3)
alter table files add column content_hash text;
create unique index files_home_hash_idx on files (home_id, content_hash)
  where content_hash is not null;

-- the review queue (see §2 for full DDL)
create table suggestions ( … );

-- allow 'suggested' item status so a queued item can render greyed in Library
-- (items.status is free-text today — no constraint change needed)
```

Note on the hash index: because `(home_id, content_hash)` is unique, re-uploading identical bytes fails at insert, before the pipeline ever runs. `recordUpload` must catch the conflict and respond "already in your library" (linking the existing file) — a custom notice, not an error state. The pipeline's `alreadyProcessed()` check then only guards re-runs and near-duplicates.

RLS: `suggestions` gets the same `is_home_member(home_id)` FOR ALL policy as every other home-scoped table (one line in the existing `do $$ … foreach` block). `insights.source` values are unconstrained (free text) so `'ai'` needs no change.

`ingestFile` runs with the **service-role** client (it executes in `after()`, outside the user's request/RLS session) and always filters by the file's own `home_id` — the same discipline `scripts/seed.ts` uses. It never trusts an id it wasn't handed.

---

## 7. Cascades per action

Each section: **trigger** (where it hooks) → **inline** vs **deferred** → **objects touched** → **user-visible effect**. `[AUTO]` = applied when confidence ≥ 0.85, else `[QUEUE]` into suggestions.

### 7.1 Upload receipt

**Trigger:** `recordUpload({type:'receipt'})` → `after(ingestFile)`. **Claude:** 1 haiku extract + 1 sonnet forecast.

| Step | Where | Object | Detail |
|---|---|---|---|
| Insert file row | inline | `files` | already happens; add `content_hash` |
| Dedupe | deferred | — | skip if hash seen |
| Extract | deferred | — | haiku vision → vendor, total, date, line items, detected appliance |
| Link/create appliance | deferred | `items` | match `(category,mfr,model)` → update `installed_on` + link file `[AUTO]`; no match → create item `[QUEUE]` |
| Record spend | deferred | `care_events` | one event, cost = total, keyed by `file_id` (upsert), `project_id` if receipt matches an active project |
| Recompute project | deferred | `projects.spent` | `sum(care_events.cost)` for the project — idempotent |
| Schedule maintenance | deferred | `care_tasks` | from category template map (no Claude), keyed by `(item_id, template_slug)` `[AUTO]` |
| Warranty window | deferred | `care_tasks` | "Rheem 6-yr warranty expires 2032" reminder if warranty term inferable `[QUEUE]` |
| Forecast | deferred | `insights` | sonnet: "Water heater new (2026); budget replacement ~2038" `[AUTO/QUEUE]` |
| Timeline | deferred | `timeline_events` | year = purchase year, "Replaced water heater" |

**User sees:** Library gains/updates the appliance, Care gains maintenance tasks, Investment page cost updates, Worth Knowing shows the forecast, timeline gains an entry, Ask can now answer "when did I replace my water heater?" — all from one photo.

### 7.2 Upload manual

**Trigger:** `recordUpload({type:'manual'})`. **Claude:** 1 haiku extract.

| Step | Where | Object | Detail |
|---|---|---|---|
| Extract | deferred | — | haiku → brand, model, spec facts, maintenance intervals stated in the manual |
| Link to item | deferred | `items` / `files.item_id` | match on model → link `[AUTO]`; ambiguous → `[QUEUE]` |
| Enrich item facts | deferred | `items.facts` / `knowledge` | append spec facts (capacity, filter size, fuel type) with provenance `[AUTO]` |
| Maintenance from manual | deferred | `care_tasks` | intervals the manual states, overriding the generic template, keyed by `template_slug` `[QUEUE]` |

**User sees:** the appliance's profile fills in (specs, "uses a 16x25x1 filter"), Care schedule sharpens to manufacturer intervals, Ask can quote the manual ("your furnace filter is 16x25x1").

### 7.3 Upload warranty doc

**Trigger:** `recordUpload({type:'warranty'})`. **Claude:** 1 haiku extract.

| Step | Where | Object | Detail |
|---|---|---|---|
| Extract | deferred | — | haiku → covered item, provider, term, start, expiry, claim phone |
| Link to item | deferred | `items` / `files.item_id` | `[AUTO]` on match |
| Warranty record | deferred | `warranties` | first-class row (provider, kind, starts_on, ends_on, term_months) linked to item + file + extraction — the queryable object expiry insights run on `[AUTO]` high-confidence, else `[QUEUE]` |
| Expiry reminder | deferred | `care_tasks` | "Roof warranty expires 2034 — inspect before then" keyed by `(item_id,'warranty_expiry')` `[AUTO]` |
| Provider as contractor | deferred | `contractors` | if a service provider is named, add with claim phone `[QUEUE]` |
| Insight | deferred | `insights` | "You're covered on the roof until 2034", `evidence` cites the warranty row |

Receipts and manuals that *contain* warranty terms (§7.1, §7.2) also mint a `warranties` row through this same proposal type — the warranty object is extraction-derived regardless of the file's `type`.

**User sees:** warranty expiry lands on the Care calendar, the item shows "under warranty until …", Ask answers "is my roof still under warranty?"

### 7.4 Upload inspection report

**Trigger:** `recordUpload({type:'document'})` classified as inspection. **Claude:** 1 haiku extract (multi-page) + 1 sonnet triage.

| Step | Where | Object | Detail |
|---|---|---|---|
| Extract findings | deferred | — | haiku → list of {system, condition, severity, recommendation} |
| Item conditions | deferred | `items.status` / `facts` | set status per named system `[AUTO]` high-confidence, else `[QUEUE]` |
| Repair tasks | deferred | `care_tasks` | one task per flagged finding, priority from severity, keyed by `(home_id,'inspection',finding_slug)` `[QUEUE]` (user vets a batch) |
| Recommended projects | deferred | `projects` | major findings → `kind='recommended'` project stub `[QUEUE]` |
| Health summary | deferred | `insights` | sonnet: "3 items need attention, roof most urgent" |

**User sees:** a review-queue batch of repair tasks and recommended projects from one PDF, Care/Projects populate on confirm, Home Health Score drops to reflect findings, Ask answers "what did the inspection flag?"

### 7.5 Upload photo

**Trigger:** `recordUpload({type:'photo'})`. **Claude:** 1 haiku vision.

| Step | Where | Object | Detail |
|---|---|---|---|
| Caption/detect | deferred | — | haiku → subject, room guess, any visible model/serial plate |
| Attach to item/room | deferred | `files.item_id` | link to matched appliance or room `[AUTO]` on strong match, else `[QUEUE]` |
| Model plate OCR | deferred | `items` | if a data plate is legible → fill `manufacturer/model/serial` `[QUEUE]` |
| Paint/measurement fact | deferred | `items.facts` | "guest bedroom — Sherwin Williams Agreeable Gray" if a paint can/label is visible `[QUEUE]` |

**User sees:** photos self-file to the right appliance/room, a serial plate photo silently fills the appliance's model — the "which paint was that?" knowledge gets captured. Lazy default: photos with no confident subject just attach to the home gallery, no queue spam. `// ponytail: photo with no confident match → gallery only, don't queue noise`

### 7.6 Add item (device/system)

**Trigger:** `createItem` (lib/actions/library.ts). **Claude:** 0–1 sonnet (only for the forecast).

| Step | Where | Object | Detail |
|---|---|---|---|
| Insert item | inline | `items` | already happens |
| Seed maintenance | deferred | `care_tasks` | category template map (no Claude), e.g. water heater → flush annually, anode ~5yr, keyed by `template_slug` `[AUTO]` |
| Replacement forecast | deferred | `insights` | if `installed_on` + `lifespan_years` known → sonnet narrative "budget replacement ~YEAR" `[AUTO]` |
| Timeline | deferred | `timeline_events` | if `installed_on` set → install year entry |

**User sees:** adding "Water Heater, installed 2019" instantly yields a maintenance schedule and a replacement-year forecast — the app reacted, not just saved.

### 7.7 Add contractor

**Trigger:** `createContractor` (to add in lib/actions). **Claude:** 0.

| Step | Where | Object | Detail |
|---|---|---|---|
| Insert contractor | inline | `contractors` | — |
| Backlink history | deferred | — (read) | surface past `care_events`/`projects` mentioning this name so the profile shows "installed your roof (2021)" |

**User sees:** a contractor profile that already knows what they've done here. No Claude — pure join. Rule-based; skip until a second real use proves the backlink is wanted. `// ponytail: backlink is a read-time join, not a write cascade — add when Contractors page needs it`

### 7.8 Complete a care task

**Trigger:** `completeTask` (lib/actions/care.ts — already writes a `care_event`). **Claude:** 0.

| Step | Where | Object | Detail |
|---|---|---|---|
| Mark done + log event | inline | `care_tasks`, `care_events` | already happens |
| Schedule next occurrence | deferred | `care_tasks` | if `recurrence` set → create next task at `due + interval`, keyed by `(item_id,template_slug,next_due)` `[AUTO]` |
| Health score bump | deferred | derived | recompute Home Health Score (SQL over task on-time rate) |

**User sees:** completing a task rolls the recurring one forward automatically and nudges the health score — maintenance feels alive. (An earlier draft added a "3 years on schedule" streak insight here; cut — the constitution §6.4 bans streak/vanity noise, and the health score already carries the signal.)

### 7.9 Log a service event

**Trigger:** `logServiceEvent` (care_events insert; UI to add). **Claude:** 0–1 sonnet.

| Step | Where | Object | Detail |
|---|---|---|---|
| Insert event | inline | `care_events` | with cost, item, contractor |
| Recompute project | deferred | `projects.spent` | if linked, sum-recompute |
| Update forecast | deferred | `insights` | a repair may shift replacement timing → sonnet re-forecast `[AUTO/QUEUE]` |
| Timeline | deferred | `timeline_events` | notable events (replacement, major repair) |

**User sees:** logging "replaced compressor $600" updates spend, may extend the AC's forecast, and lands on the timeline.

### 7.10 Create project

**Trigger:** `createProject` / `createIdea` (lib/actions/projects.ts). **Claude:** 0–1 sonnet.

| Step | Where | Object | Detail |
|---|---|---|---|
| Insert project | inline | `projects` | already happens |
| ROI estimate | deferred | `projects.metadata` / `insights` | sonnet: rough value-added + payback for the project type `[QUEUE]` (money → user confirms) |
| Prep checklist | deferred | `care_tasks` or metadata | contractor-prep / material items, rule-based where possible |

**User sees:** a new "kitchen remodel" idea comes back with a ballpark ROI and a prep list — evaluation, not just a title.

### 7.11 Complete project

**Trigger:** `completeProject` (already writes a `timeline_event`). **Claude:** 0.

| Step | Where | Object | Detail |
|---|---|---|---|
| Mark completed + timeline | inline | `projects`, `timeline_events` | already happens |
| Roll cost into value | deferred | derived | project `cost`/`value_added` feed the Investment page total (SQL) |
| New maintenance | deferred | `care_tasks` | a finished deck → "seal deck annually" from a project→maintenance map `[AUTO]` |
| Insight | deferred | `insights` | "Kitchen remodel added ~$X in estimated value" |

**User sees:** finishing a project updates the Investment total, spawns upkeep tasks for what was just built, and records the value.

### 7.12 Answer onboarding questions

**Trigger:** end of `/onboarding` (lib/actions/onboarding.ts). **Claude:** 1 sonnet (single batch pass).

| Step | Where | Object | Detail |
|---|---|---|---|
| Save home profile | inline | `homes`, `rooms` | already happens |
| Seed items | deferred | `items` | from stated systems/appliances → item stubs `[QUEUE]` batch |
| Seed maintenance | deferred | `care_tasks` | template schedules for each seeded system `[AUTO]` |
| First insights | deferred | `insights` | sonnet: 2–3 starter insights from age/location (e.g. "1998 home — check for polybutylene plumbing") `[AUTO]` |
| Timeline seed | deferred | `timeline_events` | year built |

**User sees:** the home isn't empty after onboarding — it arrives with appliances to confirm, a maintenance calendar, and its first Worth Knowing cards. Single sonnet pass over all answers keeps cost to one call.

### 7.13 Ask a question (Ask GatheredOS)

**Trigger:** `POST /api/ask` (already live, streams sonnet). **Claude:** 1 sonnet (answer) + optional 1 for fact capture.

| Step | Where | Object | Detail |
|---|---|---|---|
| Build context + stream answer | inline | `conversations`, `messages` | already happens — reads live tables, so every prior cascade is already visible with no re-index |
| Capture durable facts | deferred | `suggestions` | if the user *stated* a fact ("my roof is a 2015 GAF") → propose an item/fact update `[QUEUE]` |
| Follow-up nudge | deferred | `care_tasks` / `insights` | a question like "should I replace my roof?" with no roof record → queue "add your roof so I can answer this" |

**User sees:** Ask stays grounded in the freshest state automatically (no embedding refresh — the read is live), and volunteered facts get offered back as one-tap saves so the conversation *builds* the home's memory. Fact capture is the only new piece; keep it `[QUEUE]`-only so a chat never silently rewrites records.

**Why no re-index:** Ask reads `items/care_tasks/care_events/projects/insights` directly at question time (see `app/api/ask/route.ts` `buildHomeContext`). There is nothing to invalidate — the cascade writes rows, the next question reads them. `// ponytail: no vector store yet; live table reads mean zero index maintenance. add embeddings only when context exceeds the token budget`

---

## 8. Worked example — user uploads a water-heater receipt photo

End to end, every object touched, matching the roadmap cascade.

```
User photographs Home Depot receipt in the app
        │
[INLINE — user waits ~300ms]
        │
1. Client computes SHA-256 of the JPEG, uploads to Storage: {home_id}/receipts/{uuid}.jpg
2. recordUpload({type:'receipt', storagePath, contentHash}) inserts:
     files { id:F1, type:'receipt', content_hash:'ab12…', extraction_status:'pending' }
3. after(() => ingestFile('F1'))   ← response returns, page shows "Processing…"
        │
[DEFERRED — after(), same invocation, service-role client]
        │
4. alreadyProcessed(F1)? no hash match → continue
5. extractions row X1 inserted (file_id:F1, status:'processing'), then
   extract(F1): claude-haiku-4-5 vision on the signed URL →
     { docType:'receipt', fields:{ vendor:'Home Depot', total:1450.00, date:'2026-07-10' },
       proposals:[
         { target:'items', payload:{category:'water_heater', manufacturer:'Rheem',
             model:'XE50T10', installed_on:'2026-07-10'}, dedupeKey:'water_heater|rheem|xe50t10',
             confidence:0.88 },
         { target:'care_events', payload:{title:'Water heater replaced', cost:1450,
             occurred_on:'2026-07-10'}, dedupeKey:'F1', confidence:0.95 },
       ] }
6. applyCascade(F1, X1, envelope), asserting depth < 2:
     • items:        no existing water_heater → conf 0.88 ≥ 0.85 → INSERT item I1,
                     + field_provenance rows (manufacturer/model/installed_on → extraction X1, conf 0.88),
                     link files.item_id = I1
     • care_events:  conf 0.95 → INSERT E1 { cost:1450, item_id:I1,
                     provenance{extraction_id:X1, file_id:F1, depth:1} },
                     keyed by file_id (re-upload updates E1, never adds a second)
     • projects:     receipt matched no active project → skip spend rollup
     • care_tasks:   category template 'water_heater' → INSERT (no Claude):
                       T1 "Flush water heater" recurrence=annual, template_slug='wh_flush'
                       T2 "Replace anode rod" due +5yr, template_slug='wh_anode'   (depth 1)
     • insights:     claude-sonnet-5 forecast over {installed 2026, lifespan 12} →
                       N1 "Your water heater is new (2026). Budget replacement around 2038;
                           flush it yearly to hit the high end of its life." conf 0.9 → active (depth 2)
     • timeline_events: TE1 { year:2026, title:'Replaced water heater', kind:'appliance' }
     • suggestions:  none queued (all writes cleared 0.85)
7. X1 updated: data=<envelope>, confidence, status='done'; files.extraction_status='done'
        │
[USER-VISIBLE RESULT — next page load / revalidate]
        │
  Library      → new "Water Heater (Rheem, 2026)" with the receipt attached
  Care         → "Flush water heater" (annual) + "Replace anode rod" (2031) on the calendar
  Investment   → $1,450 logged against home spend
  Worth Knowing→ "Water heater is new — budget replacement ~2038"
  Timeline     → 2026 "Replaced water heater"
  Ask GatheredOS   → "When did I replace my water heater?" → "July 2026, a Rheem XE50T10 ($1,450)."
```

Depth chain: `upload (d0) → item/event/tasks (d1) → forecast insight (d2)`. Stops at 2. Re-uploading the identical JPEG: step 4 finds the hash, returns immediately — zero calls, zero new rows, cost stays $1,450.

---

## 9. Build order (phase discipline)

1. **Migration** — provenance/confidence columns, `files` extraction cache + hash index, `suggestions` table + RLS. Verifiable alone (`supabase db push`).
2. **Pipeline skeleton** — `lib/ingest/pipeline.ts` (`ingestFile`, `extract`, `applyCascade`), template maps in `lib/care-data.ts`, `after()` hook in `recordUpload`. Stub `extract` returns fixed JSON → prove the cascade + gating + dedupe with no Claude cost.
3. **Extraction** — wire haiku vision into `extract` for receipt first (highest value), then manual/warranty/inspection/photo as prompt branches.
4. **Review queue UI** — `<ReviewQueue>` + `acceptSuggestion`/`rejectSuggestion`, dashboard badge.
5. **Reasoning passes** — sonnet forecast/ROI, onboarding batch, Ask fact-capture.

Each phase ships and is verified (build + `pw-verify` the affected route) before the next. Nothing here needs a queue, a cron, or a new dependency — `after()` + one service-role function + one table is the whole engine.
