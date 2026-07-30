---
marp: true
theme: stc
paginate: true
---

<!-- _class: title -->
<!-- _footer: "Doug Kvamme · 7/12/26" -->

# GatheredOS
## Where we are, and where we're going

---

<!-- _class: quote -->

> GatheredOS is not software for houses.
> GatheredOS is confidence for homeowners.

---

<!-- _class: section -->

# 01
## Shipped

---

# Web v1 is live

**gatherroot.vercel.app**

- All 7 sections on real data: Dashboard, Care, Projects, Library, Ask, Worth Knowing, Settings
- Signup, login, password reset, 9-step onboarding
- Ask GatheredOS answers from your home's actual records
- Stack: Next.js + Supabase, deploys on every push

---

# The design is Alexis's v0 work

- The shipped UI is the v0 design, rebuilt on live data
- Full responsive sweep this week: 11 routes, 5 screen sizes (phone to desktop)
- Every layout bug fixed, all tap targets thumb-sized
- iPhone notch + iPad verified

---

# iOS app is on TestFlight

- Native SwiftUI app, same account + same data as web
- On Doug's phone today, build 1
- Passed native-design review: feels like an Apple app, dark mode included
- Home + Library tabs working end to end

---

<!-- _class: stat -->

# 70/100

homeowner questions the AI can already answer with today's data model

---

# Phase 2 is fully designed

- **Constitution** — the product's rules: honesty, citations, never spammy
- **Object model** — warranties, document extractions, home memory
- **Intelligence engine** — upload a receipt, everything updates
- **Reasoning playbook** — 100 real questions, mapped to answers

---

<!-- _class: section -->

# 02
## Next

---

# The magic moment we're building

Photograph one receipt →

- Appliance added to Library, with model + install date
- Cost logged, project budget updates
- Maintenance schedule created
- Warranty tracked, "Worth Knowing" forecast appears
- Ask GatheredOS can now answer "when did we replace it?"

---

# Build order

- **Web:** database migration → ingestion pipeline → receipt extraction → cited answers
- **iOS:** Care tab → Ask tab → Projects → **camera receipt capture**
- Phone camera becomes the front door for the whole ingestion engine

---

<!-- _class: section -->

# 03
## Building it together

---

# Roles

- **Alexis** — design + UX, in v0, exactly the flow that built this UI
- **Doug + Claude** — production code, data, AI engine, iOS, deploys
- **One source of truth:** the GitHub repo → auto-deploys to gatherroot.vercel.app
- v0 is the design lab; the repo is the product

---

# The loop

1. Alexis designs or refines a screen in v0
2. Shares the v0 link (or export) — one screen at a time
3. Claude ports it into production, wired to real data
4. Live on gatherroot.vercel.app, usually same day
5. Alexis reviews the real thing, iterates

---

# Setup this week

- Invite Alexis: GitHub repo + Vercel + TestFlight
- Both read the Constitution (10 min) — it's the product's rulebook
- Pick the first v0 → production screen to run the loop on
- Weekly 30-min roadmap sync

---

<!-- _class: end -->

# Let's build.

dougkvamme@gmail.com
