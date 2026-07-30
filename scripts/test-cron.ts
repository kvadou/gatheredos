/**
 * refreshWarrantyStatus verification — ZERO model calls, real DB.
 *
 * Seeds three warranties into the dev home (ends_on +30d / +90d / -5d, all
 * `active`) plus a fake coverage insight linked to the lapsed one's file, then:
 *   +30d → `expiring` AND a `warranty-expiring:<id>` insight appears
 *   +90d → still `active`
 *   -5d  → `expired` AND its seeded `warranty:<file>` insight is dismissed
 * Runs the job AGAIN and asserts idempotency (statuses hold, no duplicate
 * insight). Cleans up fully at start (crashed prior runs) and end.
 *
 * Usage: pnpm dlx tsx scripts/test-cron.ts
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

const TAG = 'cron-test'

function dateOffset(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

async function main() {
  const { createAdminClient } = await import('../lib/supabase/admin')
  const { refreshWarrantyStatus } = await import('../lib/cron/jobs')
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

  // ---- full cleanup (runs at start against crashed prior runs, and at end) ----
  const cleanup = async () => {
    const { data: ws } = await db
      .from('warranties')
      .select('id, file_id')
      .eq('home_id', homeId)
      .like('provider', `${TAG}%`)
    for (const w of ws ?? []) {
      await db.from('insights').delete().eq('home_id', homeId).eq('dedupe_slug', `warranty-expiring:${w.id}`)
      if (w.file_id) await db.from('insights').delete().eq('home_id', homeId).eq('dedupe_slug', `warranty:${w.file_id}`)
    }
    await db.from('warranties').delete().eq('home_id', homeId).like('provider', `${TAG}%`)
    const { data: fs } = await db.from('files').select('id').eq('home_id', homeId).like('name', `${TAG}%`)
    for (const f of fs ?? []) {
      await db.from('insights').delete().eq('home_id', homeId).eq('dedupe_slug', `warranty:${f.id}`)
    }
    await db.from('files').delete().eq('home_id', homeId).like('name', `${TAG}%`)
  }
  await cleanup()

  try {
    // ---- seed: a file for the lapsed warranty (dismiss path keys on file_id) ----
    const { data: file, error: fErr } = await db
      .from('files')
      .insert({
        home_id: homeId,
        name: `${TAG} warranty C.pdf`,
        storage_path: `${TAG}/warranty-c.pdf`, // fake — the job never downloads it
        type: 'warranty',
      })
      .select('id')
      .single()
    if (fErr || !file) throw fErr ?? new Error('file seed failed')

    // ---- seed: three active warranties + a fake coverage insight for C ----
    const { data: warranties, error: wErr } = await db
      .from('warranties')
      .insert([
        { home_id: homeId, provider: `${TAG} Provider A`, status: 'active', ends_on: dateOffset(30) },
        { home_id: homeId, provider: `${TAG} Provider B`, status: 'active', ends_on: dateOffset(90) },
        { home_id: homeId, provider: `${TAG} Provider C`, status: 'active', ends_on: dateOffset(-5), file_id: file.id },
      ])
      .select('id, provider')
    if (wErr || warranties?.length !== 3) throw wErr ?? new Error('warranty seed failed')
    const idOf = (suffix: string) => warranties.find((w) => w.provider === `${TAG} Provider ${suffix}`)!.id
    const [aId, bId, cId] = [idOf('A'), idOf('B'), idOf('C')]

    // fake coverage insight the ingest pipeline would have minted for C's file
    const { error: iErr } = await db.from('insights').insert({
      home_id: homeId,
      category: 'protection',
      headline: `${TAG} coverage insight`,
      dedupe_slug: `warranty:${file.id}`,
      source: 'ai',
    })
    if (iErr) throw iErr

    // ============================ RUN 1 ============================
    console.log('\n=== run 1: refreshWarrantyStatus ===')
    const res1 = await refreshWarrantyStatus()
    console.log('  result:', JSON.stringify(res1))
    assert(res1.name === 'refreshWarrantyStatus', 'job returns its name')
    assert(res1.expiring === 1, `1 warranty flipped to expiring (got ${res1.expiring})`)
    assert(res1.expired === 1, `1 warranty flipped to expired (got ${res1.expired})`)

    const status = async (id: string) =>
      (await db.from('warranties').select('status').eq('id', id).single()).data?.status

    assert((await status(aId)) === 'expiring', '+30d warranty → expiring')
    assert((await status(bId)) === 'active', '+90d warranty → still active')
    assert((await status(cId)) === 'expired', '-5d warranty → expired')

    const { data: aIns } = await db
      .from('insights')
      .select('status')
      .eq('home_id', homeId)
      .eq('dedupe_slug', `warranty-expiring:${aId}`)
      .maybeSingle()
    assert(aIns?.status === 'active', 'expiring insight minted (active) for +30d warranty')

    const { data: cCov } = await db
      .from('insights')
      .select('status')
      .eq('home_id', homeId)
      .eq('dedupe_slug', `warranty:${file.id}`)
      .maybeSingle()
    assert(cCov?.status === 'dismissed', 'lapsed warranty dismissed its coverage insight')

    // ============================ RUN 2 (idempotency) ============================
    console.log('\n=== run 2: refreshWarrantyStatus (idempotency) ===')
    const res2 = await refreshWarrantyStatus()
    console.log('  result:', JSON.stringify(res2))
    assert(res2.expiring === 0 && res2.expired === 0, `second run flips nothing (got ${JSON.stringify(res2)})`)
    assert((await status(aId)) === 'expiring', '+30d warranty still expiring after re-run')
    assert((await status(bId)) === 'active', '+90d warranty still active after re-run')
    assert((await status(cId)) === 'expired', '-5d warranty still expired after re-run')
    const { data: aInsAll } = await db
      .from('insights')
      .select('id')
      .eq('home_id', homeId)
      .eq('dedupe_slug', `warranty-expiring:${aId}`)
    assert((aInsAll?.length ?? 0) === 1, `exactly one expiring insight after re-run (got ${aInsAll?.length ?? 0})`)

    console.log('\nCRON WARRANTY-REFRESH E2E PASSED — expiring/expired transitions + insight mint/dismiss + idempotency verified')
  } finally {
    await cleanup().catch((e) => console.error('[cleanup] failed:', e))
    console.log('cleanup done — nothing left behind')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
