# Security Audit — homebase-ai
**Date:** 2026-04-08
**Stack:** Next.js 15 (App Router) + TypeScript + Prisma 6 + PostgreSQL (Neon) + Clerk v6 + Vercel + Turborepo monorepo
**Auditor:** Claude Code (security-audit skill)

---

## Stack Detection

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15, App Router, React 19 |
| Language | TypeScript 5.8, strict mode ON |
| ORM | Prisma 6 |
| Auth | Clerk v6 (`@clerk/nextjs`) |
| Database | PostgreSQL (Neon in prod, local dev) |
| Deployment | Vercel + Neon |
| Monorepo | Turborepo + pnpm workspaces |

---

## TRACK A — OWASP & Auth Security

### #1 — Rate Limiting (CRITICAL) — FAIL

No rate limiting middleware exists on any API route. Searched across all `*.ts`/`*.tsx` files — zero matches for `rateLimit`, `@upstash/ratelimit`, `express-rate-limit`, or `throttle` in application code. The `middleware.ts` only handles Clerk auth routing.

Exposed attack surface includes: `/api/chat` (expensive AI calls), `/api/scan` (AI vision), `/api/billing/*`, `/api/admin/*`, and 60+ other routes.

**Risk:** API abuse, AI cost exhaustion ($$$), brute force, DDoS.

**Fix:**
```typescript
// apps/web/middleware.ts — add Upstash rate limiting
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(20, "10 s"),
});
```
**Effort:** Moderate (1-2 hrs)

---

### #2 — Auth Token Storage (CRITICAL) — PASS

`localStorage` is used only for UI preferences (theme, notification dismissal). No auth tokens stored client-side. Clerk handles auth via httpOnly cookies and managed sessions. Clean.

---

### #3 — Input Sanitization (CRITICAL) — PASS

Zod validation is used consistently. `@gatheredos/shared` exports validators used in API routes (`createItemSchema`, `createProviderSchema`, etc.). No raw SQL string interpolation found. Prisma parameterizes all queries.

---

### #4 — Hardcoded API Keys (CRITICAL) — FAIL

**Active secrets found in `.env` (committed to repo):**

- `apps/web/.env:4` — `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_[REDACTED]` (test key, but still)
- `apps/web/.env:5` — `CLERK_SECRET_KEY=sk_test_[REDACTED]` (LIVE Clerk secret)
- `apps/web/.env:13` — `ANTHROPIC_API_KEY=sk-ant-api03-[REDACTED]` (LIVE Anthropic key)

`.gitignore` includes `.env` and `.env*.local` — but `.env` is still present in the working tree (not tracked by git per `git status`, which shows it as modified but not staged). However, these keys are plaintext on disk and were likely committed at some point. The `.env.example` file ALSO contains the live Anthropic key.

**Risk:** If `.env` was ever committed, these keys are in git history. The `.env.example` with real keys is especially dangerous — it IS committed.

**Immediate actions:**
1. Rotate `CLERK_SECRET_KEY`, `ANTHROPIC_API_KEY` NOW
2. Remove live keys from `.env.example` — replace with `sk_test_xxx` placeholders
3. Verify `.env` was never committed: `git log --all --full-history -- .env`

**Effort:** Quick fix (30 min) — but requires immediate key rotation

---

### #5 — Webhook Verification (HIGH) — PASS

Stripe webhook at `apps/web/app/api/billing/webhook/route.ts:55` correctly calls `stripe.webhooks.constructEvent(body, signature, webhookSecret)`. The route is excluded from Clerk middleware (line 24 of `middleware.ts`) so the raw body is available. Cron routes use `CRON_SECRET` bearer token verification.

---

### #8 — Session Expiry (HIGH) — PASS (via Clerk)

Clerk manages all session lifecycle including expiry. Invitation tokens expire at 7 days (`members/route.ts:142`). Passport share links expire at 30 days (`realtor/gift-passport/route.ts:56`). Invitation expiry is checked on acceptance (`invitations/[token]/route.ts:63`). No custom JWT implementation.

---

### #10 — Password Reset Expiry (HIGH) — N/A

No custom password reset flow. Clerk handles this entirely (managed auth provider). Clerk's password reset tokens are time-limited by default.

---

### #16 — Admin Role Checks (CRITICAL) — PASS

`requireAdmin()` is defined in `apps/web/lib/auth.ts` and correctly chains `requireAuth()` + `user.isAdmin` check. It is called in all 18 admin API routes (verified: 42 `requireAdmin` invocations across admin route files). Admin routes are also protected by Clerk middleware at the route-matcher level.

---

## TRACK B — Data & Performance

### #6 — Database Indexing (MEDIUM) — PARTIAL

Indexes present:
- `Notification`: `@@index([userId, read])`, `@@index([userId, createdAt])` ✓
- `HomeInvitation`: `@@index([email, status])`, `@@index([token])` ✓
- `PushSubscription`: `@@index([userId])` ✓
- `SupportTicket`: `@@index([userId])`, `@@index([status])` ✓
- `Subscription`: `@@index([stripeCustomerId])` ✓

Missing indexes on frequently queried fields:
- `Item.homeId` — queried in nearly every item fetch, no index
- `Item.roomId` — queried in room-scoped views, no index
- `MaintenanceTask.itemId` + `status` — queried in cron jobs for overdue tasks
- `ChatSession.userId` — queried on every chat session load
- `HomeUser.userId` + `homeId` — has `@@unique` which covers this, OK
- `ManualChunk.manualId` — no index for RAG chunk lookups
- `ProviderProfile.specialty` — filtered in provider search, no index

**Effort:** Quick fix (< 30 min) — add `@@index` directives to schema.prisma

---

### #9 — Pagination (HIGH) — PARTIAL

Paginated correctly:
- `GET /api/admin/users` — page/limit with max 100 ✓
- `GET /api/admin/support/tickets` — paginated ✓

Missing pagination (unbounded queries):
- `GET /api/items` — `apps/web/app/api/items/route.ts` returns ALL items for a user's homes with no limit
- `GET /api/providers` — `apps/web/app/api/providers/route.ts` returns ALL providers with no limit
- `apps/web/app/(admin)/admin/support/page.tsx:55` — fetches with `limit=10000` (effectively unlimited)
- Multiple `findMany` in `packages/ai/src/home-queries.ts` (lines 243, 295, 360, 412, 446, 547, 596, 657) — no limits on AI context queries

**Risk:** As data grows, these will cause timeouts and memory pressure.

**Effort:** Moderate (1-2 hrs)

---

### #15 — Connection Pooling (MEDIUM) — FAIL

No connection pooling configured. `DATABASE_URL` in `.env.example` is a direct PostgreSQL connection string with no pooler parameters. Neon provides Supavisor-style pooling via a separate pooler URL (`-pooler.neon.tech`) but it is not configured. Prisma client has no `connection_limit` set.

**Fix:** In production, use Neon's pooled connection string:
```
DATABASE_URL="postgresql://user:pass@ep-xxx-pooler.us-east-1.aws.neon.tech/dbname?pgbouncer=true&connection_limit=1"
```
**Effort:** Quick fix (< 30 min)

---

### #19 — Backup Strategy (CRITICAL) — FAIL

No backup strategy documented or configured anywhere in the codebase. No backup scripts, no reference to Neon PITR settings, no `pg_dump` cron, no documentation. Deployment is Vercel + Neon — Neon does provide PITR on paid plans but there is no evidence it's enabled or monitored.

**Risk:** Data loss with no recovery path.

**Fix:** 
1. Verify Neon PITR is enabled on the project dashboard
2. Document backup strategy in `docs/ops-runbook.md`
3. Set up weekly `pg_dump` export to S3/R2 as belt-and-suspenders

**Effort:** Moderate (1-2 hrs)

---

## TRACK C — Frontend & Resilience

### #7 — Error Boundaries (MEDIUM) — PASS

`ErrorBoundary` class component exists at `apps/web/components/error-boundary.tsx` with proper `getDerivedStateFromError` implementation. It is used in both the dashboard layout (`app/(dashboard)/layout.tsx:23`) and the admin layout (`app/(admin)/layout.tsx:21`). Root app layout does not have one but Next.js App Router `error.tsx` convention covers that.

---

### #11 — Env Variable Validation (MEDIUM) — FAIL

No `@t3-oss/env-nextjs`, `envalid`, or custom env validation file found. `process.env` values are accessed directly throughout:
- `packages/ai/src/claude.ts:7` — `process.env.ANTHROPIC_API_KEY` used directly with a runtime throw
- `packages/ai/src/embeddings.ts:15` — silent fallback chaining `||` without validation
- `apps/web/app/api/calendar/token/route.ts:7` — `process.env.NEXT_PUBLIC_APP_URL` used raw

Missing env vars will cause runtime errors rather than clear startup failures.

**Fix:** Add `@t3-oss/env-nextjs`:
```typescript
// apps/web/lib/env.ts
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";
export const env = createEnv({ ... });
```
**Effort:** Moderate (1-2 hrs)

---

### #12 — Image Upload Strategy (MEDIUM) — FAIL

`apps/web/app/api/upload/route.ts` writes files directly to the local filesystem (`./public/uploads`). This is incompatible with Vercel (ephemeral filesystem — files disappear on redeploy). No MIME type validation exists — only size limit (10MB). Any file type can be uploaded.

**Risk:** Files lost on every deployment. No file type validation allows potentially malicious file uploads.

**Fix:** Migrate to Vercel Blob, Cloudflare R2, or uploadthing. Add MIME type allowlist.

**Effort:** Significant (half day+)

---

### #13 — CORS Policy (HIGH) — PASS

Next.js 15 App Router is same-origin by default. No `Access-Control-Allow-Origin: *` found. No custom CORS headers configured. The calendar feed endpoint (`/api/calendar/feed`) uses token-based auth and is intentionally public, which is appropriate.

---

### #14 — Async Email (MEDIUM) — N/A

No email sending code found in the codebase. No nodemailer, Resend, SendGrid, or Postmark. Notifications are handled via push notifications (web push). This check is not applicable.

---

### #18 — Production Logging (HIGH) — FAIL

26 files in `apps/web/app/api` use `console.log`/`console.error`. No structured logging library (Pino, Winston) and no error tracking service (Sentry, Datadog, LogRocket) found in `package.json` or anywhere in the codebase.

**Risk:** Errors are invisible in production. No alerting when API routes fail.

**Fix:** Add Sentry (free tier covers this):
```bash
pnpm add @sentry/nextjs
```
Then `npx @sentry/wizard@latest -i nextjs`

**Effort:** Quick fix (< 30 min)

---

## TRACK D — Infrastructure & TypeScript

### #17 — Health Check Endpoint (MEDIUM) — FAIL

No `/api/health`, `/api/ping`, or `/api/status` endpoint exists. Vercel does its own health checking but there's no application-level health endpoint to verify DB connectivity, AI client availability, etc.

**Fix:**
```typescript
// apps/web/app/api/health/route.ts
export async function GET() {
  const db = await prisma.$queryRaw`SELECT 1`;
  return NextResponse.json({ status: "ok", db: "ok", ts: new Date() });
}
```
**Effort:** Quick fix (< 30 min)

---

### #20 — TypeScript Strict Mode (HIGH) — PARTIAL

`strict: true` is set in both root `tsconfig.json` and `apps/web/tsconfig.json`. Good.

However, **381 `any` usages** found in source files (excluding `.next/` generated types). Concentrated in:
- `packages/ai/src/home-queries.ts` — 10+ uses of `: any` on Prisma result maps
- `packages/ai/src/rag.ts` — `any[]` on `$queryRawUnsafe` args

The `.js` files found are all in `.next/` (build output) — no source `.js` files exist. That's correct.

**Assessment:** Strict mode is on but `any` overuse in the AI package undermines it.

---

## Scorecard

```
=================================================================
SECURITY AUDIT SCORECARD — homebase-ai
Date: 2026-04-08
Stack: Next.js 15 + Clerk + Prisma + Neon + Vercel
=================================================================

TRACK A — OWASP & Auth Security
 #1  Rate Limiting .............. FAIL     CRITICAL
 #2  Auth Token Storage ......... PASS     CRITICAL
 #3  Input Sanitization ......... PASS     CRITICAL
 #4  Hardcoded API Keys ......... FAIL     CRITICAL
 #5  Webhook Verification ....... PASS     HIGH
 #8  Session Expiry ............. PASS     HIGH
 #10 Password Reset Expiry ...... N/A      HIGH
 #16 Admin Role Checks .......... PASS     CRITICAL

TRACK B — Data & Performance
 #6  Database Indexing ........... PARTIAL  MEDIUM
 #9  Pagination .................. PARTIAL  HIGH
 #15 Connection Pooling ........... FAIL    MEDIUM
 #19 Backup Strategy ............. FAIL     CRITICAL

TRACK C — Frontend & Resilience
 #7  Error Boundaries ........... PASS     MEDIUM
 #11 Env Var Validation ......... FAIL     MEDIUM
 #12 Image Upload Strategy ...... FAIL     MEDIUM
 #13 CORS Policy ................ PASS     HIGH
 #14 Async Email Sending ........ N/A      MEDIUM
 #18 Production Logging ......... FAIL     HIGH

TRACK D — Infrastructure & TypeScript
 #17 Health Check Endpoint ...... FAIL     MEDIUM
 #20 TypeScript Strict Mode ..... PARTIAL  HIGH

=================================================================
SCORE: 7/18 passed (2 N/A) | 2 critical FAIL | 2 high FAIL | 3 medium FAIL | 2 partial
=================================================================
```

---

## Top 3 Fixes (Priority Order)

### Fix #1 — Rotate & Remove Live API Keys (CRITICAL, < 30 min)

**What's wrong:** Live `CLERK_SECRET_KEY` and `ANTHROPIC_API_KEY` are present in `.env` and `.env.example`. The `.env.example` with real keys is the immediate danger — it is likely committed to git.

**Actions (do these NOW, in order):**
1. `git log --all --full-history -- .env .env.example` — check if ever committed
2. Rotate `ANTHROPIC_API_KEY` at console.anthropic.com
3. Rotate `CLERK_SECRET_KEY` in Clerk dashboard
4. Replace `.env.example` contents with `xxx` placeholders only
5. Run `git-filter-repo` or BFG Repo Cleaner if keys were committed

---

### Fix #2 — Add Rate Limiting to AI/Auth Routes (CRITICAL, 1-2 hrs)

**What's wrong:** No rate limiting on any API route. `/api/chat` and `/api/scan` call Claude API on every request — an attacker can exhaust your Anthropic budget in minutes.

**Fix:**
```bash
pnpm add @upstash/ratelimit @upstash/redis --filter web
```
Add to `middleware.ts` — rate limit `/api/chat` at 10 req/min, `/api/scan` at 5 req/min, all other `/api/*` at 60 req/min per user.

---

### Fix #3 — Migrate Image Upload Off Local Filesystem (CRITICAL for Vercel, half day)

**What's wrong:** `apps/web/app/api/upload/route.ts` writes to `./public/uploads` — this is an ephemeral filesystem on Vercel. Every deployment wipes all uploaded files. Additionally no MIME type validation exists.

**Fix:** Migrate to Vercel Blob Storage:
```bash
pnpm add @vercel/blob --filter web
```
```typescript
import { put } from "@vercel/blob";
const blob = await put(filename, file, { access: "public" });
return NextResponse.json({ url: blob.url });
```

Add MIME type allowlist: `["image/jpeg", "image/png", "image/webp", "application/pdf"]`

---

## Other Quick Wins (< 30 min each)

- **#17 Health check:** Add `apps/web/app/api/health/route.ts` (5 min)
- **#15 Connection pooling:** Update `DATABASE_URL` in Vercel env vars to use Neon pooler URL
- **#18 Sentry:** `npx @sentry/wizard@latest -i nextjs` (15 min)
- **#6 Indexes:** Add `@@index([homeId])`, `@@index([itemId])`, `@@index([userId])` to Item, MaintenanceTask, ChatSession in schema.prisma (10 min + migration)
- **#19 Backup:** Enable PITR in Neon dashboard, add to ops runbook (10 min)
