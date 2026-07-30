---
marp: true
theme: stc
paginate: true
---

<!-- _class: title -->
<!-- _footer: "Doug Kvamme · 7/13/26" -->

# GatheredOS
## The memory your home never had — full briefing, 7/13/26

---

# What GatheredOS is

Upload anything about your house — receipts, manuals, warranties, inspection reports, photos.

GatheredOS reads them, remembers everything, schedules the upkeep, and answers questions **about your specific home** — with receipts to prove it.

Live today: **gatherroot.vercel.app** + iPhone app (TestFlight).

---

<!-- _class: section -->

# 01
## What we built

---

# The product surface

- **Web + iPhone at full parity** — 7 sections: Home, Care, Projects, Library, Worth Knowing, Ask, Settings
- Onboarding with real address autocomplete
- Household sharing — invite family by link, roles
- Camera receipt capture on iPhone → straight into the brain

---

# The intelligence engine

One photo of a receipt becomes, automatically:

- The **appliance** in your Library
- Its **maintenance schedule** on the calendar
- The **spend** on your investment ledger
- A **warranty** with an expiry reminder
- A **replacement forecast** with real cost ranges

Works for receipts, manuals, warranties, inspection reports, and photos of data plates.

---

# It checks before it writes

- Confident findings apply automatically — with cited sources
- Uncertain ones queue for **one-tap review** — nothing invents itself
- Ask answers carry inline citations + confidence levels
- Every AI write traceable to the document that proved it

---

# The proactive layer

- Daily automatic sweep, live in production
- Warranty status rolls itself: active → expiring → expired
- Every appliance checked against **CPSC safety recalls**
- Full email spine built: invites, warranty alerts, safety alerts, care reminders, weekly digest
- **One API key from sending** — dispatch loop already proven live

---

# Trust + safety

- Export everything you own as one file, any time
- Delete your account yourself — permanent, verified clean
- Rate limits on everything that costs money
- Terms + privacy policy drafted (16 decisions pending)
- Security-audited twice this weekend — two real bugs caught **before** users could hit them

---

<!-- _class: stat -->

# 53
## commits shipped this weekend — every feature runtime-tested before push

---

<!-- _class: section -->

# 02
## Where it stands

---

# Live right now

- Full product, web + iPhone, real data, honest UI
- Engine complete: all document types, all reasoning passes
- Daily cron sweeping warranties + recalls in production
- Search, home switching, emergency mode, printable home record, guided capture, barcode scanner

---

# Waiting on keys (build done)

| Feature | Needs |
|---|---|
| All outbound email | Domain + Resend key (~20 min) |
| Gmail receipt import | Google OAuth creds |
| House-number autocomplete | Mapbox key |
| Property record prefill | RentCast key |

---

<!-- _class: section -->

# 03
## Next steps + testing

---

# This week

1. **Domain + Resend** → the app finally speaks first
2. Alexis accepts her invite → household of two
3. Both phones on TestFlight, real receipts weekly
4. Publish terms + privacy after review

---

# We are beta household #1

- Every receipt, manual, and warranty in the house goes in
- Ask it real questions — "when did we buy the grill?"
- Accept/reject its suggestions — that tunes the engine
- Friction goes in a shared note → becomes next build list
- Usage analytics already flowing to the admin dashboard

---

<!-- _class: section -->

# 04
## Go to market

---

# Who it's for first

**The Recent Buyer** — closed within 18 months, inherited a house with zero documentation and a 40-page inspection report.

Their inspection report is the perfect first upload — GatheredOS already turns it into a task list.

Second wave: DIY maintainers — spreadsheet keepers, repair-YouTube watchers.

---

# How we reach them

- **Reddit first** — value-first answers in homeowner subs, 20-spot beta ask. $0, 30 min/day
- Build-in-public on X
- SEO pages generated from our own maintenance data
- Realtor closing-gift channel — "gift GatheredOS pre-loaded with the inspection report"
- Product Hunt only after retention proves out

---

# Launch gates (no vanity launches)

- Private beta: 20 households from Reddit
- Public beta when activation ≥ 40% — signup → first document uploaded
- Product Hunt when day-30 retention ≥ 25%
- Year-1 north star: **weekly active households**

---

# Future build

- **Now** — outbound email, household polish, publish legal
- **Next** — Gmail auto-import, clickable citations, member management, Stripe + Premium
- **Later** — iPhone push + App Store 1.0, photo vision, Move Mode, contractor marketplace

---

<!-- _class: end -->

# The house finally remembers.
## gatherroot.vercel.app · doug@storytimechess.com
