# GatheredOS Reasoning Engine Playbook

**Roadmap ref:** Claude Prompt #3 (Build the AI Playbook). **Status:** product spec for Phase 2 answer generation. **Date:** 2026-07-12.

This is the spec for how "Ask GatheredOS" reasons over a home's records to answer real homeowner questions with grounded, cited answers. It defines the universal answer pipeline, 12 reasoning archetypes worked end to end, 100 realistic questions mapped to objects and data needs, and a gap analysis that turns into build priority.

Today's Ask route (`app/api/ask/route.ts`) blind-dumps five tables (items, care_tasks, care_events, projects, insights) into the system prompt and streams prose with inline name-drops but no machine-resolvable citations, no intent routing, no retrieval, and no confidence tiers. This playbook is the target that route evolves toward.

---

## 1. Answer Architecture

### 1.1 The universal pipeline

Every question runs the same seven stages. Archetypes (Section 2) only change the retrieval plan and the reasoning template; the skeleton is fixed.

| Stage | What happens | Today | Phase 2 |
|---|---|---|---|
| 1. Intent classification | Map question to archetype + pillar; extract entities (which system, room, vendor, project, season, dollar amount) | none (one prompt for all) | fast classifier call or rules on keywords + entity extraction |
| 2. Object retrieval | Pull only the objects the archetype needs, ranked | dump 50 items / 25 tasks / 12 events / 20 projects / 12 insights | hybrid: keyword filter + vector top-k over items, files(extracted text), care_events, projects, insights, home_facts |
| 3. Reasoning | Apply the archetype's reasoning template (lifespan math, cost rollup, prioritization score, symptom-to-cause) | model does it implicitly, ungrounded | explicit template with computed intermediate values (age, remaining life, annual spend) |
| 4. Answer composition | Headline-first, then reasoning, then one recommended next action; short plain-prose paragraphs | already this shape | same, plus inline citation markers bound to retrieved objects |
| 5. Citation binding | Attach every factual claim to its source object or flag as general | none (prose name-drops only) | typed citation objects, UI resolves each to a card |
| 6. Confidence tagging | Label each claim as known / estimated / general | none | per-claim tier drives hedging language and chip color |
| 7. Follow-ups + actions | Offer 1-3 clarifying follow-ups and 1-3 recommended actions that map to real mutations | none | structured suggestions: create care_task, create project idea, prep contractor, add missing fact/file |

### 1.2 Citation format (concrete)

The model emits inline markers in the streamed text, and a parallel array of citation objects the client resolves to cards. Markers look like `[c1]` in prose ("Your water heater [c1], installed in 2019...").

```ts
type Citation = {
  id: string                    // "c1", "c2" — matches the inline [c1] marker
  type:
    | 'item'                    // a system/appliance (items table)
    | 'file'                    // a document/receipt/manual/warranty (files)
    | 'care_event'              // a logged service/repair (care_events)
    | 'care_task'               // an open/completed maintenance task
    | 'project'                 // a renovation/improvement
    | 'contractor'              // a vendor on file
    | 'timeline'                // a home timeline event
    | 'home_fact'               // Phase 2: an atomic recalled fact (paint color, shutoff location)
    | 'warranty'                // Phase 2: a first-class warranty record (warranties table)
    | 'extraction'              // Phase 2: a field pulled from a document (via extractions table)
    | 'home_profile'            // an attribute of the home itself (year_built, sqft, location)
    | 'general'                 // not from this home — general knowledge, flagged
  ref_id: string | null         // uuid of the source row; null for general/home_profile
  label: string                 // "Rheem water heater"
  detail?: string               // "installed 2019-04, 12-yr typical life"
  confidence: 'known' | 'estimated' | 'general'
}
```

Rules:
- Every dollar figure, date, brand, model, person, or location in the answer carries a marker, or the sentence is explicitly hedged as general.
- `type: 'general'` citations are allowed and encouraged for how-to steps and typical-lifespan facts, but they must render visually distinct ("general guidance, not from your records") so the user never mistakes a rule of thumb for a fact about their home.
- A claim with no citation and no hedge is a bug. The composition prompt forbids it.

### 1.3 Confidence tiers

Three tiers, each with a fixed voice. The tier is chosen per claim, not per answer, so one answer routinely mixes all three.

| Tier | Meaning | Chip | Voice pattern | Example |
|---|---|---|---|---|
| **known-from-records** | Grounded in ≥1 cited home object | green | State it plainly | "Your furnace is a Carrier installed in 2011 [c1]." |
| **estimated-from-home-profile** | Derived from home attributes + lifespan/cost tables, not directly logged | amber | "Based on X, likely Y" | "Based on that 2011 install and a typical 15-20 year furnace life, you likely have 4-9 years left [c1]." |
| **general-knowledge** | Not specific to this home, flagged as such | grey | "In general..." / "As a rule of thumb..." | "In general, flushing a tank water heater once a year prevents sediment buildup." |

Degradation is graceful and honest: when records are missing, the answer drops from known to estimated to general, and says which. "I don't have your furnace's install date on file, so this is a general estimate. Add it and I can be specific."

### 1.4 Recommended actions (map to real mutations)

Follow-through is the product. Every archetype can propose actions that resolve to existing (or Phase 2) mutations:

| Action | Mutation | Table |
|---|---|---|
| Schedule this maintenance | create care_task (source='ai') | care_tasks |
| Log that you did this | create care_event | care_events |
| Save this as a project idea | create project (kind='idea' or 'recommended') | projects |
| Prep to hire | generate contractor brief + surface vendors on file | contractors + projects |
| Fill a knowledge gap | prompt to add an item / home_fact / upload a file | items / home_facts / files |
| Remember this answer | pin as an insight | insights |

---

## 2. The 12 Reasoning Archetypes

Each archetype is worked from a representative question through the full pipeline. These are the reasoning templates the engine dispatches to after intent classification.

### A1 — Replacement Timing
**Representative Q:** "When do I need to replace my roof?"
- **Needed knowledge:** the system's install date, its expected lifespan, condition signals (repairs, inspection notes), and the home's climate/exposure.
- **Objects searched:** `items` (the roof, via category match) → `care_events` (repairs on that item) → `files` (inspection reports, Phase 2 extraction) → `home_profile` (year_built as install fallback, location for climate).
- **Reasoning:** remaining_life = (installed_on + lifespan_years) − today; adjust down for logged repairs or inspection flags; adjust for climate. If no install date, fall back to year_built (estimated) or general lifespan (general).
- **Evidence cited:** roof item [c1: item, known], last repair [c2: care_event], typical asphalt life [c3: general].
- **Confidence:** known if install date logged; estimated if inferred from year_built; general if neither.
- **Follow-ups:** "Do you know the roofing material (asphalt, metal, tile)?" "Any leaks or missing shingles lately?"
- **Actions:** create a care_task to get a roof inspection this year; save "roof replacement" as a recommended project with a budget estimate; surface roofers on file.

### A2 — Cost & Budget Forecasting
**Representative Q:** "How much should I budget for the house over the next five years?"
- **Needed knowledge:** upcoming replacements and their costs, historical annual spend, and a benchmark for a home of this size/age/region.
- **Objects searched:** `items` (ages → replacement timeline) → `care_events.cost` + `projects.spent/cost` (historical spend) → `cost_ref` (Phase 2: regional replacement costs) → `home_profile` (sqft, value for % rules).
- **Reasoning:** roll up historical annual spend; project replacements landing in the window (from A1 math on each system); attach costs (own past cost if available, else reference, else the 1-4% of home value rule); sum into a year-by-year forecast.
- **Evidence cited:** each aging system [c1..cn: item], past spend [care_event/project], reference cost [extraction/general].
- **Confidence:** known for logged spend; estimated for forecasted replacements with reference costs; general for the % rule fallback.
- **Follow-ups:** "Any big projects you're already planning?" "Want this as a conservative or aggressive estimate?"
- **Actions:** create a project idea per forecasted replacement; pin the 5-year number as an insight; set reminders as the years approach.

### A3 — Prioritization ("What should I do next?")
**Representative Q:** "I've got a free Saturday — what's the highest-value thing to do around the house?"
- **Needed knowledge:** what's open and overdue, what's seasonally urgent, and what carries the most risk if ignored.
- **Objects searched:** `care_tasks` (open, by due_on/priority/season) → `insights` (active) → `items` (systems nearing end of life or with no recent care) → `home_profile` (location → season).
- **Reasoning:** score each candidate on urgency (overdue > due-soon), consequence (water/safety > cosmetic), effort (fits a Saturday), and season fit; rank; return the top 1-3.
- **Evidence cited:** overdue task [c1: care_task], at-risk system [c2: item], seasonal insight [c3: insight].
- **Confidence:** known for the task/system facts; estimated for the risk ranking.
- **Follow-ups:** "Are you up for a physical job or something lighter?" "Indoor or outdoor today?"
- **Actions:** mark the chosen task in progress; log a care_event when done; snooze the rest with a new due date.

### A4 — Diagnosis ("Why is X happening?")
**Representative Q:** "My basement smells musty — what's going on?"
- **Needed knowledge:** what systems and conditions in this home cause that symptom, and which ones are present/aging here.
- **Objects searched:** `items` (sump pump, dehumidifier, water heater, foundation notes — Phase 2 semantic retrieval to map "musty" → moisture systems) → `care_events` (recent water/moisture events) → `files` (inspection moisture flags) → `home_profile` (basement, age, region).
- **Reasoning:** map symptom to a ranked list of likely causes; check which candidate causes have supporting evidence in this home (old sump, no dehumidifier, past leak); lead with the most likely grounded cause, then general causes.
- **Evidence cited:** sump pump age [c1: item], past basement leak [c2: care_event], general musty-basement causes [c3: general].
- **Confidence:** estimated where grounded in this home's systems; general for the differential.
- **Follow-ups:** "Is it worse after rain?" "Do you have a working dehumidifier down there?"
- **Actions:** create a care_task to test the sump pump; suggest a dehumidifier as a project idea; recommend a moisture inspection if signs point to intrusion.

### A5 — How-To / Maintenance Guidance
**Representative Q:** "How do I change my furnace filter, and what size do I need?"
- **Needed knowledge:** the general procedure, plus this home's specific filter size and furnace location.
- **Objects searched:** `items` (furnace: model, location) → `home_facts` (Phase 2: recorded filter size) → `files` (manual, Phase 2 extraction for size) → `care_events` (last filter change).
- **Reasoning:** give the general steps; personalize with the recorded size/location if known; if size unknown, tell them exactly where to read it (the old filter's frame) and offer to save it.
- **Evidence cited:** furnace [c1: item], filter size [c2: home_fact], manual [c3: file], last change [c4: care_event].
- **Confidence:** general for the steps; known for the size/location if on file.
- **Follow-ups:** "Want me to remind you every 90 days?" "Is this a 1-inch or a 4-inch filter slot?"
- **Actions:** save the filter size as a home_fact; create a recurring care_task; log the change as a care_event.

### A6 — Home-History Lookup
**Representative Q:** "What paint color is in the guest bedroom, and who did the last remodel?"
- **Needed knowledge:** the specific recorded fact — no reasoning, pure recall with provenance.
- **Objects searched:** `home_facts` (Phase 2: paint color/brand/finish) → `rooms` (guest bedroom summary) → `projects` + `contractors` (remodel + who did it) → `files` (receipts/photos) → `timeline`.
- **Reasoning:** retrieve the atomic fact; if absent, say so plainly and offer to record it — never guess a color or a name.
- **Evidence cited:** paint fact [c1: home_fact], remodel project [c2: project], contractor [c3: contractor].
- **Confidence:** known if recorded; otherwise an honest "not on file."
- **Follow-ups:** "Want me to save the paint color now so it's here next time?"
- **Actions:** add the fact/contractor; attach a photo; this archetype is the backbone of the "what do I need to remember" and family-handoff use cases.

### A7 — ROI / Investment Decision
**Representative Q:** "Is finishing the basement worth it?"
- **Needed knowledge:** cost to do it here, resale value uplift in this market, and the homeowner's actual goal (resale vs. living in it).
- **Objects searched:** `home_profile` (value, sqft, location) → `projects` (any existing estimate) → `cost_ref` (Phase 2: regional cost + recoup %) → `homes.goals`.
- **Reasoning:** estimate project cost (reference or their quote); estimate value added (recoup % × cost, or reference $/sqft); compare against the goal; state payback and the honest "it depends on how long you'll stay."
- **Evidence cited:** home value [c1: home_profile], recoup benchmark [c2: cost_ref/general], their goal [c3: home_profile.goals].
- **Confidence:** estimated at best; general without cost_ref. Never present ROI as known.
- **Follow-ups:** "Are you thinking resale or more living space?" "How long do you plan to stay?"
- **Actions:** save as a recommended project with cost + value_added fields; prep a contractor brief; add to the 5-year budget forecast (A2).

### A8 — Seasonal Planning
**Representative Q:** "What should I do to get ready for winter?"
- **Needed knowledge:** the seasonal task set for this home's systems and climate, minus what's already done.
- **Objects searched:** `care_tasks` (season='winter', open) → `items` (systems needing seasonal prep: furnace, hose bibs, gutters) → `care_events` (what's already done this season) → `home_profile` (location → climate severity).
- **Reasoning:** assemble the seasonal checklist from tasks + system-derived items; subtract completed events; order by deadline (first freeze) and consequence.
- **Evidence cited:** winter tasks [c1..cn: care_task], furnace [c2: item], climate [c3: home_profile].
- **Confidence:** known for tasks/systems; estimated for the "before first freeze" timing.
- **Follow-ups:** "When does it usually first freeze where you are?" "Do you have outdoor faucets to shut off?"
- **Actions:** bulk-create the missing seasonal tasks; set due dates ahead of the freeze; log as completed when done.

### A9 — Emergency Response
**Representative Q:** "Water's coming out everywhere — what do I shut off?"
- **Needed knowledge:** the location of this home's main water shutoff (and relevant local valves), fast, and the safe general procedure.
- **Objects searched:** `home_facts` (Phase 2: main shutoff location — the highest-value fact in the whole system) → `items` (water heater, sump) → `contractors` (emergency plumber).
- **Reasoning:** lead with the immediate action in one line; give the recorded shutoff location if known, else the general "find the main near the meter / where the line enters." Safety first, brevity over completeness. For gas: universal safety (leave, call 911/utility) leads, location second.
- **Evidence cited:** shutoff location [c1: home_fact], plumber [c2: contractor], general shutoff guidance [c3: general].
- **Confidence:** known if the location is on file (this is why recording it matters); general otherwise, and say so.
- **Follow-ups (after the crisis):** "Want to save your shutoff valve's location so it's instant next time?"
- **Actions:** one-tap call the plumber on file; post-incident, prompt to record shutoff locations and log a care_event; this archetype is the strongest argument for the home_facts store.

### A10 — Warranty & Document Lookup
**Representative Q:** "Is my water heater still under warranty?"
- **Needed knowledge:** the warranty record (coverage, term, expiry) tied to the specific unit, and the document behind it.
- **Objects searched:** `warranties` (Phase 2: first-class record — provider, ends_on, status, linked item_id) → `files`/`extraction` (the source doc it was derived from) → `items` (install date as fallback).
- **Reasoning:** if a warranties row exists, compare `ends_on` to today (the row's status already encodes active/expiring/expired); if only the install date is known, estimate against the typical term for that product; if nothing, say what's missing and how to find it.
- **Evidence cited:** warranty record [c1: warranty], source doc [c2: file], install date [c3: item].
- **Confidence:** known if a warranties row exists; estimated from install + typical term; general otherwise.
- **Follow-ups:** "Want to upload the warranty so I can track the exact date?"
- **Actions:** upload prompt; create a care_task to file a claim before expiry; extraction mints the warranties row automatically.

### A11 — Buying / Product Comparison
**Representative Q:** "Tankless or tank for my next water heater?"
- **Needed knowledge:** this home's constraints (fuel type, household size, existing hookups) and the general tradeoffs.
- **Objects searched:** `items` (current water heater: fuel, capacity) → `home_profile` (beds/baths → household size) → `home_facts` (Phase 2: gas line, 240v availability) → `cost_ref` (Phase 2: install cost delta).
- **Reasoning:** lay out the general tradeoffs, then filter and weight them by this home's constraints; give a recommendation, not a neutral survey.
- **Evidence cited:** current unit [c1: item], household size [c2: home_profile], general tradeoffs [c3: general].
- **Confidence:** known for the home's constraints; general for the product comparison; estimated for cost/payback.
- **Follow-ups:** "Do you have a gas line at the heater?" "How many people take showers back-to-back?"
- **Actions:** save the decision as a project idea; prep a contractor brief with the chosen spec; add the new unit to items after install.

### A12 — Vendor / Contractor Selection
**Representative Q:** "I need a roofer — do I have one on file, and who did good work before?"
- **Needed knowledge:** vendors on file, which ones did which jobs, and how those jobs went.
- **Objects searched:** `contractors` (on file) → `projects` (completed, linked contractor + outcome) → `care_events` (who serviced what).
- **Reasoning:** match the needed trade to vendors on file; rank by relevant past work; if none, give vetting guidance (licensed, insured, 3 quotes) rather than a dead end.
- **Evidence cited:** contractor [c1: contractor], prior roof project [c2: project].
- **Confidence:** known for who's on file; estimated for "did good work" unless a rating is recorded.
- **Follow-ups:** "Want their number?" "Was the last job with them a good experience?"
- **Actions:** surface contact + one-tap call; generate a project brief to send for quotes; add a new contractor if they hire someone new.

---

## 3. The 100 Questions

Realistic homeowner voice, spanning all five pillars, four seasons, budgets, emergencies, and mundane lookups. Objects listed are the primary ones searched. "Data that must exist" is what a *great* (grounded) answer needs; "degraded answer" is what the engine says when that data is missing.

Archetype key: A1 replacement timing · A2 cost/budget · A3 prioritization · A4 diagnosis · A5 how-to · A6 history lookup · A7 ROI · A8 seasonal · A9 emergency · A10 warranty/doc · A11 buying · A12 vendor.

| # | Question | Arch | Primary objects | Data that must exist | Degraded answer if missing |
|---|---|---|---|---|---|
| 1 | When do I need to replace my roof? | A1 | items, care_events, files | Roof item w/ install date + lifespan | General asphalt life (20-30y); "add your roof's age" |
| 2 | Can I get another year out of my water heater? | A1 | items, care_events | Install date, lifespan, leak history | General tank life (8-12y) |
| 3 | Is my furnace near the end of its life? | A1 | items, care_events | Install date, service history | General furnace life (15-20y) |
| 4 | Should I be worried about how old my AC is? | A1 | items | Install date, lifespan | General AC life (15-20y) |
| 5 | What's the oldest system in my house? | A1 | items | Install dates across systems | "Add install dates to compare" |
| 6 | Which of my systems is most likely to fail first? | A1 | items, care_events | Install dates + repair frequency | General reliability by system |
| 7 | My windows are original — how long will they last? | A1 | items, home_profile | Window age / year_built | General window life (20-40y) |
| 8 | Is it time to replace my garage door opener? | A1 | items | Install date, lifespan | General opener life (10-15y) |
| 9 | How much should I budget for maintenance next year? | A2 | care_events, items, care_tasks | Past annual spend + upcoming tasks | "1-4% of home value" rule |
| 10 | What big-ticket replacements are coming in 5 years? | A2 | items, cost_ref | System ages + replacement costs | Ages only, costs general |
| 11 | What will owning this home cost me over the next decade? | A2 | items, care_events, projects, cost_ref | Spend history + forecast + reference costs | General % rules only |
| 12 | How much have I spent on the house this year? | A2 | care_events, projects | Dated costs this year | "Log costs to see totals" |
| 13 | What did the kitchen remodel end up costing? | A2 | projects, files | project.cost + linked receipts | Project name only |
| 14 | Am I spending more on upkeep than a typical home like mine? | A2 | care_events, home_profile, cost_ref | Own spend vs regional benchmark | Own spend, no benchmark |
| 15 | What's my most expensive system to maintain? | A2 | care_events, items | Cost summed by item | "Log service costs" |
| 16 | What should I do next around the house? | A3 | care_tasks, insights, items | Open tasks + system risks | "Add tasks and systems" |
| 17 | Free Saturday — highest-value thing to do? | A3 | care_tasks, insights | Open tasks by priority/season | Generic seasonal chores |
| 18 | What's the most urgent thing I've been putting off? | A3 | care_tasks | Overdue tasks | "Nothing overdue on file" |
| 19 | If I fix one thing this month, what should it be? | A3 | care_tasks, insights, items | Prioritized risks | General advice |
| 20 | Am I taking good care of my home? | A3 | care_tasks, care_events, items, insights | Completion rate, overdue count, ages | "Add data for a health read" |
| 21 | What am I forgetting to maintain? | A3 | items, care_tasks | Systems w/ no recent care | General maintenance checklist |
| 22 | What maintenance is overdue right now? | A3 | care_tasks | Open tasks past due_on | "Nothing overdue" |
| 23 | I have $2,000 for the house — where should it go? | A3 | care_tasks, items, insights | Prioritized needs | General allocation advice |
| 24 | What should I tackle before winter? | A8 | care_tasks, items, home_profile | Winter tasks + climate | Generic winter checklist |
| 25 | My basement smells musty — what's going on? | A4 | items, care_events, files, embeddings | Moisture systems + history | General musty-basement causes |
| 26 | Why is my upstairs always colder than downstairs? | A4 | items, rooms, home_profile | HVAC zoning + insulation facts | General HVAC balancing |
| 27 | My water pressure suddenly dropped — why? | A4 | items, care_events, embeddings | Plumbing systems + recent events | General pressure-loss causes |
| 28 | Brown stain spreading on my ceiling — should I worry? | A4 | items, files, embeddings | What's above that room | General (likely leak) |
| 29 | Why was my energy bill so high this month? | A4 | items, care_events, home_profile | System efficiency/age + season | General bill drivers |
| 30 | My dishwasher won't drain — what's wrong? | A4 | items, files | Model + manual troubleshooting | General drain steps |
| 31 | Why does my furnace keep short-cycling? | A4 | items, care_events | Furnace model, filter history | General short-cycle causes |
| 32 | How do I change my furnace filter? | A5 | items, home_facts | Filter size + location | General how-to |
| 33 | What size furnace filter do I need? | A5 | items, home_facts, files | Recorded size or model lookup | "Check the old filter's frame" |
| 34 | How often to flush my water heater, and when did I last? | A5 | items, care_events | Last flush event + interval | General interval (annual) |
| 35 | How do I winterize my outdoor faucets? | A5 | items, home_profile | Hose bibs + climate | General steps |
| 36 | What maintenance does my tankless water heater need? | A5 | items, care_events | Model + descaling history | General tankless upkeep |
| 37 | How do I safely clean my gutters? | A5 | items, home_profile | Stories / roof height | General steps |
| 38 | How do I reset my garbage disposal? | A5 | items | Model/brand | General reset steps |
| 39 | Who installed my roof? | A6 | projects, contractors, items | Roof project w/ contractor | "No record — add it" |
| 40 | What paint color is in the guest bedroom? | A6 | home_facts, rooms | Recorded color/brand/finish | "Not recorded" |
| 41 | When was the water heater last replaced? | A6 | items, care_events, timeline | Install date or replacement event | "Not recorded" |
| 42 | What's the model number of my furnace? | A6 | items | items.model / serial | "Not recorded" |
| 43 | Who did our bathroom remodel — how do I reach them? | A6 | projects, contractors | project.contractor_id → contact | "No contractor on file" |
| 44 | When did we last have the septic pumped? | A6 | care_events, items | Septic care_event | "Not recorded" |
| 45 | What brand is my dishwasher? | A6 | items | items.manufacturer | "Not recorded" |
| 46 | Where's the water shutoff valve? | A6/A9 | home_facts | Recorded location | General (near meter/street side) |
| 47 | Which breaker controls the garage? | A6 | home_facts | Recorded panel mapping | "Label your panel" |
| 48 | What do I need to remember about this home? | A6 | home_facts, items, timeline, contractors | Curated key-facts memory | Items/timeline summary only |
| 49 | If something happened to me, would my family know how to run this house? | A6 | home_facts, contractors, items, files | Handoff pack: shutoffs, vendors, systems | Partial from items/contractors |
| 50 | I just moved in — what should I know about this house? | A6 | items, timeline, home_facts, files | Systems + history + facts | Profile + seeded items only |
| 51 | Is finishing the basement worth it? | A7 | projects, home_profile, cost_ref | Local ROI %, cost, home value | General recoup ranges |
| 52 | Will a kitchen remodel pay off when we sell? | A7 | projects, home_profile, cost_ref | Cost vs resale uplift by region | General (~70-80% recoup) |
| 53 | Should I add solar panels? | A7 | home_profile, items, cost_ref | Roof/orientation, local rates, payback | General solar guidance |
| 54 | Worth replacing my windows for energy savings? | A7 | items, home_profile, cost_ref | Window age/type, climate, savings | General payback (long) |
| 55 | Does adding a deck add value? | A7 | projects, home_profile, cost_ref | Cost vs value by market | General recoup % |
| 56 | Should I switch to a heat pump? | A7 | items, home_profile, cost_ref | Current system, climate, incentives | General tradeoffs |
| 57 | How have my projects affected the home's value? | A7 | projects | value_added vs cost per project | "Log value added" |
| 58 | What have I invested in this house in total? | A2/A6 | projects, care_events | Sum of project + event costs | Partial from logged data |
| 59 | What should I do to get ready for winter? | A8 | care_tasks, items, home_profile | Winter tasks + climate | Generic winter list |
| 60 | What's on my spring maintenance list? | A8 | care_tasks, items | Spring tasks | Generic spring list |
| 61 | It's getting cold — anything I need to handle now? | A8 | care_tasks, items, home_profile | Seasonal + system prep | Generic list |
| 62 | What summer maintenance am I forgetting? | A8 | care_tasks, items | Summer tasks (AC service) | Generic summer list |
| 63 | Fall's here — what should I prep? | A8 | care_tasks, items | Fall tasks | Generic fall list |
| 64 | Should I be worried about ice dams this winter? | A8/A4 | items, home_profile | Insulation/roof facts + climate | General ice-dam guidance |
| 65 | Water's coming out everywhere — what do I shut off? | A9 | home_facts, items | Main shutoff location | General (find main near meter) |
| 66 | I smell gas — what do I do? | A9 | home_facts, contractors | Gas shutoff + utility contact | General safety (leave, call 911) |
| 67 | My basement is flooding — help! | A9 | home_facts, items, contractors | Shutoff, sump, plumber | General emergency steps |
| 68 | Power's out — what should I check? | A9 | home_facts, items | Panel location, generator | General (breakers/utility) |
| 69 | A pipe burst — how do I stop the water fast? | A9 | home_facts, items | Main + local shutoffs | General shutoff steps |
| 70 | No heat and it's freezing — what now? | A9 | items, home_facts, contractors, files | Furnace reset, thermostat, HVAC vendor | General troubleshooting |
| 71 | Is my water heater still under warranty? | A10 | files, extraction, items | Warranty doc w/ dates | Install + typical term estimate |
| 72 | Where's the manual for my dishwasher? | A10 | files | Manual linked to item | "Not uploaded" |
| 73 | Do I have the receipt for the roof? | A10 | files | Receipt linked to project | "Not uploaded" |
| 74 | What's covered under my HVAC warranty? | A10 | files, extraction | Extracted warranty terms | "Upload the warranty" |
| 75 | When does my appliance warranty expire? | A10 | files, extraction, items | Extracted expiry date | Install + typical term |
| 76 | Where's my home inspection report? | A10 | files | Inspection file | "Not uploaded" |
| 77 | What did my inspection flag that I haven't fixed? | A10/A4 | files, extraction, care_tasks | Extracted findings vs done tasks | "Upload/enter findings" |
| 78 | What dishwasher should I buy to replace mine? | A11 | items, home_profile | Current dims/fuel/brand | General recommendations |
| 79 | Tankless or tank for my next water heater? | A11 | items, home_profile, cost_ref | Household size, fuel, usage | General tradeoffs |
| 80 | Should I get a smart thermostat, and which? | A11 | items | HVAC compatibility (C-wire) | General recommendations |
| 81 | What paint should I use in the bathroom? | A11/A5 | rooms, home_facts | Prior paint + surface | General (satin, mold-resistant) |
| 82 | Gas or electric range for my kitchen? | A11 | items, home_profile | Existing hookups (gas/240v) | General tradeoffs |
| 83 | What's a fair price for a water heater replacement here? | A11/A2 | home_profile, cost_ref | Regional install cost | General national range |
| 84 | Is this contractor's quote reasonable? | A2 | projects, cost_ref, home_profile | Scope vs benchmark cost | General "get 3 quotes" |
| 85 | Who should I call to fix my furnace? | A12 | contractors, items | HVAC vendor on file | "None on file — vetting tips" |
| 86 | Do I have a plumber I've used before? | A12 | contractors, care_events, projects | Plumber contact + past jobs | "None on file" |
| 87 | Who did the best work for me — could they do this next job? | A12 | contractors, projects | Vendors on completed projects | List contractors on file |
| 88 | I need a roofer — do I have one on file? | A12 | contractors, projects | Roofer from roof project | "None — vetting tips" |
| 89 | Which contractor handled the deck — could they do the fence? | A12 | contractors, projects | Deck project's contractor | "No record" |
| 90 | When is my next maintenance task due? | A3/A8 | care_tasks | Soonest open due_on | "No tasks scheduled" |
| 91 | What's the status of my bathroom renovation? | A6/A3 | projects | project status/progress/spent | "No such project" |
| 92 | Do I have any active projects right now? | A6 | projects | Projects kind='active' | "None active" |
| 93 | My AC is freezing up — what's happening? | A4 | items, care_events | Filter/coil history | General (airflow/refrigerant) |
| 94 | The disposal hums but won't spin — what do I do? | A4/A5 | items | Model | General (jam; hex key) |
| 95 | How do I bleed my radiators? | A5 | items | Boiler/radiator system type | General steps |
| 96 | When should I schedule my annual HVAC service? | A8/A5 | care_tasks, items, care_events | Last service date + season | General (spring AC/fall furnace) |
| 97 | What appliances and systems came with the house? | A6 | items | Systems inventory | "Add your systems" |
| 98 | How much life is left across all my major systems? | A1/A2 | items | Ages vs lifespans, aggregate | "Add install dates" |
| 99 | What's my home health score — what's dragging it down? | A3 | items, care_tasks, care_events, insights | Overdue + ages + gaps → score | "Add data for a score" |
| 100 | Can I wait another year on the roof, or is that risky? | A1 | items, care_events, files | Roof age + inspection condition | General lifespan risk |

---

## 4. Gap Analysis → Build Priority

The question is not "can Claude produce prose" (it always can) but "can the engine produce the *grounded* answer in the 'data that must exist' column?" A question is **answerable today** if its great answer maps to existing tables. It **needs Phase 2** if the great answer fundamentally requires an object the schema doesn't have.

### 4.1 Headline count

- **Answerable with today's schema: 70 of 100.**
- **Need a new Phase 2 object: 30 of 100.**

### 4.2 The 30 that need Phase 2 objects, by object

| Phase 2 object | What it is | Questions | Count |
|---|---|---|---|
| **home_facts** (AI memory) | Atomic recallable facts with provenance: shutoff/panel locations, paint colors, filter sizes, breaker maps, handoff knowledge | 33, 40, 46, 47, 48, 49, 50, 64, 65, 67, 69 | 11 |
| **cost_ref** (benchmark data) | Regional replacement costs, ROI/recoup %, lifespan tables — turns general % rules into estimated-from-profile numbers | 11, 14, 51, 52, 53, 54, 55, 56, 83, 84 | 10 |
| **embeddings** (semantic retrieval) | Vector index to map a symptom ("musty", "stain") to the relevant systems in *this* home, so diagnosis is grounded not generic | 25, 26, 27, 28, 29 | 5 |
| **extractions** (document parsing) | OCR + field extraction from files (warranty term/expiry, inspection findings). Files today store only path + freeform meta | 71, 74, 75, 77 | 4 |

**Build-priority read:** `home_facts` unlocks the most questions (11) *and* the highest-stakes ones (emergency shutoffs, family handoff, the "what do I need to remember" core value-prop question). It is also the cheapest to build (a typed key/value/provenance table plus capture prompts). Build it first. `cost_ref` is second by volume (10) and turns the entire ROI/budget pillar from hand-waving into numbers — per the object-model decision it ships as a static data file in `lib/`, not a table, so it is days not weeks. `embeddings` and `extractions` are heavier lifts that unlock fewer questions but are prerequisites for the document-ingestion roadmap regardless.

### 4.3 The 70 "answerable today" have a wiring caveat

Schema-supported is not the same as wired. The current Ask route only retrieves 5 of the 14 tables. These "today" questions need the retrieval broadened before they actually work, even though no new schema is required:

- **contractors** (not currently retrieved): Q43, 85, 86, 87, 88, 89 — every vendor-selection answer.
- **files** (not currently retrieved): Q72, 73, 76 — manual/receipt/inspection lookups.
- **timeline_events** (not currently retrieved): Q41, 50, 97.
- **rooms** (not currently retrieved): Q81.
- **home_profile beyond a few fields** (features/goals jsonb unused): Q7, 51-56 goal matching.

Additionally, every "today" answer depends on the data actually being *entered* — `items.lifespan_years`, `installed_on`, `care_events.cost`, `projects.value_added` are all nullable and often empty. The graceful-degradation language in the "degraded answer" column is therefore not an edge case; at launch it is the *common* case, and the recommended actions (prompt to fill the gap) are how the home's records get populated over time. That data-capture loop is the product's flywheel, not an afterthought.

### 4.4 What the current route already gets right

Keep these; they're on-spec: headline-first plain prose, strict grounding ("only from the home's own records"), honest "I don't have that on file" instead of invention, and a recommended-next-action close. The evolution is additive: intent routing (Stage 1), targeted retrieval (Stage 2), machine-resolvable citations (Stage 5), and confidence tiers (Stage 6) layer on top of a composition style that already matches this spec.
