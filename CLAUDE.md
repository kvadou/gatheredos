# GatheredOS — Project Guide

AI operating system for homeowners. The home's digital memory: devices, documents, maintenance, projects, and an AI assistant that reasons over all of it. Business plan: `docs/business-plan.md`. Roadmap: `docs/roadmap.md`.

## Tech Stack
- **Framework**: Next.js 16 (App Router) with React 19 — flat single app, no monorepo
- **Language**: TypeScript (strict — all new files must be .ts/.tsx)
- **Database + Auth + Storage**: Supabase (Postgres, Supabase Auth via `@supabase/ssr`, `home-files` storage bucket)
- **Styling**: Tailwind CSS v4 (`@tailwindcss/postcss`) + Base UI (`@base-ui/react`) / shadcn-style components
- **AI**: Anthropic Claude API (`@anthropic-ai/sdk`) for Ask GatheredOS
- **Package manager**: pnpm
- **Deployment**: Vercel (repo: `kvadou/gatheredos`, push to master deploys) — prod: https://gatherroot.vercel.app

## Dev Notes
- Next 16 renamed `middleware.ts` to `proxy.ts` (export `proxy`) — do not "fix" it back.
- RSC rule: never pass Lucide icon components (any function) from server to client components.
  Pass icon NAME strings; resolve client-side via the `iconFor()` registries in `lib/*-data.ts`.
- Demo data: `pnpm dlx tsx scripts/seed.ts --email <email> --wipe` (service role; dev account dev@gatheredos.local).
- Supabase project ref: gpncqcnklcmqiakvdibg. Migrations push: `supabase db push` (needs SUPABASE_DB_PASSWORD from .env).
- /admin is direct-URL only, gated by `profiles.is_admin` (service-role queries after the gate).

## Run / build / test
```bash
pnpm install
pnpm dev                       # http://localhost:3000
pnpm build                     # next build (prod)
pnpm lint                      # eslint .
```
No unit-test framework. The checks are scripted TypeScript run through tsx:
```bash
pnpm verify:service-completion   # node --env-file=.env.local --import tsx scripts/...
pnpm verify:provider-pilot
pnpm verify:monetization
pnpm test:scan                   # pnpm dlx tsx scripts/test-scan-reliability.ts
pnpm test:service-coordination
```
Browser-verify UI/route changes with `pw-verify <route>` before marking done.

## Structure
```
app/                — routes: / (dashboard), /care, /projects, /library, /ask,
                      /worth-knowing, /settings, /onboarding, /login, /signup, /admin
components/         — per-section components (care/, projects/, library/, ask/, ui/, ...)
lib/                — shared types + data access (per-section *-data.ts), utils
lib/supabase/       — browser client, server client, middleware helpers
lib/actions/        — server actions (mutations)
supabase/migrations — SQL schema migrations (source of truth for DB)
scripts/            — seed script (service role)
docs/               — business plan, roadmap, GTM, plans
```

## Conventions
- Server components by default; `"use client"` only for hooks/events/browser APIs.
- Mutations via server actions in `lib/actions/`, always scoped to the user's home via `home_members`.
- RLS is on for every table — never query with the service-role key outside `/admin` and `scripts/seed.ts`.
- Presentational maps (icons, tints, tones) live client-side in `lib/*-data.ts` keyed by category — not in the DB.
- No native browser dialogs (`alert`/`confirm`/`prompt`) — use custom dialogs.
- Log meaningful user actions with `logUsage()` (feeds `/admin` analytics).
- Import app-local modules via `@/...`.

## Database
- Schema lives in `supabase/migrations/*.sql`. Core tables: profiles, homes, home_members,
  rooms, items (devices/systems), files, contractors, care_tasks, care_events, projects,
  insights, timeline_events, conversations, messages, usage_events.
- Home ownership check: membership row in `home_members` (role: owner/family/guest).
- Admin: `profiles.is_admin` gates `/admin` (server-side check, service-role queries).

## Environment Variables
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY   — server-only (admin + seed)
ANTHROPIC_API_KEY           — Ask GatheredOS
```

## Rules
- Always TypeScript (.ts/.tsx) for new files
- One phase at a time; verify (build + pw-verify affected routes) before marking done
- After fixing a bug, re-run the affected path and check the same code path for related bugs
- Named `git add` only; push straight to master (Vercel deploys from master)
- When work can't finish in one session, end with explicit handoff

## Later roadmap (context, not current work)
- Native iOS app (SwiftUI + supabase-swift) in `ios/` once web is verified live
- Product Phase 2: document ingestion, OCR, knowledge graph, AI memory, citations, proactive insights
- Agentic layer: contractor matching / two-sided home-service marketplace (`contractors` is the seed)
