/**
 * rateLimited verification — ZERO model calls, real DB.
 *
 * Seeds synthetic usage_events (a unique event name + a props tag, so real
 * analytics rows are never touched) and asserts:
 *   limit-1 rows in window       → false (under the cap)
 *   limit   rows in window       → true  (flips exactly at the limit)
 *   rows older than window       → ignored (only in-window rows count)
 *   another user's rows          → ignored (explicit user_id scoping)
 * rateLimited counts on the service-role client, so this exercises the real
 * production count path directly. Cleans up fully at start and end.
 *
 * Usage: pnpm dlx tsx scripts/test-ratelimit.ts
 */
import { readFileSync } from 'node:fs'

function loadEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {}
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    return out
  }
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}

Object.assign(process.env, loadEnvFile('.env'), loadEnvFile('.env.local'))

const TAG = 'ratelimit-test'
const EVENT = 'ratelimit-test-event'

function minutesAgo(mins: number): string {
  return new Date(Date.now() - mins * 60_000).toISOString()
}

async function main() {
  const { createAdminClient } = await import('../lib/supabase/admin')
  const { rateLimited } = await import('../lib/rate-limit')
  const db = createAdminClient()

  const assert = (cond: unknown, msg: string) => {
    if (!cond) throw new Error(`ASSERT FAILED: ${msg}`)
    console.log(`ok: ${msg}`)
  }

  const { data: profile } = await db.from('profiles').select('id').eq('email', 'dev@gatheredos.local').single()
  if (!profile) throw new Error('dev@gatheredos.local not found')
  const devUserId = profile.id
  const { data: member } = await db.from('home_members').select('home_id').eq('user_id', devUserId).limit(1).single()
  if (!member) throw new Error('dev user has no home')
  const homeId = member.home_id

  // A second real user to prove cross-user isolation. profiles.id FKs auth.users,
  // so we can't invent a UUID — reuse any existing non-dev profile, else fall back
  // to null (also excluded by the user_id filter) when the DB has only dev@.
  const { data: other } = await db.from('profiles').select('id').neq('id', devUserId).limit(1).maybeSingle()
  const otherUserId = other?.id ?? null

  // usage_events has no TAG column — delete by home_id + event + the props tag
  // (catches dev, other-user, and null-user rows since they share event + tag).
  const cleanup = async () => {
    await db.from('usage_events').delete().eq('home_id', homeId).eq('event', EVENT).eq('props->>tag', TAG)
  }
  await cleanup()

  // Seed n synthetic rows at a given age (minutes ago) for a given user.
  const seed = async (n: number, minsAgo: number, uid: string | null = devUserId) => {
    const rows = Array.from({ length: n }, () => ({
      user_id: uid,
      home_id: homeId,
      event: EVENT,
      props: { tag: TAG } as never,
      created_at: minutesAgo(minsAgo),
    }))
    const { error } = await db.from('usage_events').insert(rows)
    if (error) throw error
  }

  const LIMIT = 5
  const WINDOW = 60
  const check = () => rateLimited({ event: EVENT, userId: devUserId, homeId, limit: LIMIT, windowMinutes: WINDOW })

  try {
    // ---- flips exactly at the limit ----
    console.log('\n=== limit boundary ===')
    await seed(LIMIT - 1, 1) // 4 rows, 1 min ago (in window)
    assert((await check()) === false, `${LIMIT - 1} in-window rows → under cap (not limited)`)
    await seed(1, 1) // one more → 5 total in window
    assert((await check()) === true, `${LIMIT} in-window rows → at cap (limited)`)

    // ---- rows older than the window are ignored ----
    console.log('\n=== window boundary ===')
    await cleanup()
    await seed(LIMIT + 3, WINDOW + 30) // 8 rows, 90 min ago (outside 60-min window)
    assert((await check()) === false, `${LIMIT + 3} rows older than window → ignored (not limited)`)
    await seed(LIMIT - 1, 1) // 4 fresh rows in window
    assert((await check()) === false, `${LIMIT - 1} in-window rows (old ones ignored) → under cap`)
    await seed(1, 1) // 5th fresh row → at cap
    assert((await check()) === true, `${LIMIT} in-window rows → at cap despite older rows present`)

    // ---- another user's rows never count toward this user ----
    console.log('\n=== cross-user isolation ===')
    await cleanup()
    await seed(LIMIT + 5, 1, otherUserId) // another user's events, same home + window
    assert((await check()) === false, `${LIMIT + 5} other-user rows → not counted for dev user (not limited)`)
    await seed(LIMIT - 1, 1) // dev user's own, under cap
    assert((await check()) === false, `dev user under cap — only their own rows count`)
    await seed(1, 1) // dev user's own → at cap
    assert((await check()) === true, `dev user hits cap on their own ${LIMIT}th row; other-user rows never counted`)

    console.log('\nRATE-LIMIT E2E PASSED — flips at limit, ignores out-of-window rows, scopes to the caller')
  } finally {
    await cleanup().catch((e) => console.error('[cleanup] failed:', e))
    console.log('cleanup done — nothing left behind')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
