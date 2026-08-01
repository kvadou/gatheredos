/**
 * Repair spend history written before quotes were told apart from invoices.
 *
 * Two defects put money in `care_events` that was never spent:
 *   1. A good/better/best option sheet extracted as three paid purchases. One
 *      plumbing visit that cost $118.87 booked ~$12,000 of work.
 *   2. Field-service platforms re-render the same invoice PDF for every message
 *      they attach it to, so the bytes differ, the content-hash dedupe on
 *      `files` never fires, and one purchase lands once per copy.
 *
 * Both are found without a second extraction pass: `extractions.raw_text` is
 * already stored, so `looksLikeEstimate()` — the same predicate the live
 * extractor now runs — is replayed over it.
 *
 * Dry run by default. Nothing is deleted without --apply.
 *
 *   pnpm cleanup:spend --email doug@example.com
 *   pnpm cleanup:spend --email doug@example.com --apply
 */
import { createAdminClient } from '../lib/supabase/admin'
import { looksLikeEstimate } from '../lib/ingest/extract'
import { recomputeProjectSpend } from '../lib/ingest/pipeline'

type Event = {
  id: string
  title: string
  note: string | null
  cost: number | null
  occurred_on: string | null
  created_at: string
  provenance: Record<string, unknown> | null
  project_id: string | null
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}
const has = (name: string) => process.argv.includes(`--${name}`)

async function main() {
  const db = createAdminClient()
  const apply = has('apply')

  let homeId = arg('home')
  const email = arg('email')
  if (!homeId && !email) {
    console.error('usage: cleanup-spend --email <user email> | --home <home uuid> [--apply]')
    process.exit(1)
  }
  if (!homeId) {
    const { data: profile } = await db.from('profiles').select('id').eq('email', email!).maybeSingle()
    if (!profile) throw new Error(`no profile for ${email}`)
    const { data: membership } = await db
      .from('home_members').select('home_id').eq('user_id', profile.id).limit(1).maybeSingle()
    if (!membership) throw new Error(`no home for ${email}`)
    homeId = membership.home_id
  }

  const { data: rows, error } = await db
    .from('care_events')
    .select('id,title,note,cost,occurred_on,created_at,provenance,project_id')
    .eq('home_id', homeId)
    .order('created_at')
  if (error) throw error
  const events = (rows ?? []) as Event[]
  const spend = events.filter((e) => e.cost != null && e.cost > 0)
  console.log(`\nHome ${homeId} — ${events.length} care_events, ${spend.length} carrying a cost\n`)

  // ---- pass 1: rows whose source document was a quote ----
  const estimates: { event: Event; why: string }[] = []
  for (const e of spend) {
    const extractionId = e.provenance?.extraction_id ? String(e.provenance.extraction_id) : null
    const fileId = e.provenance?.file_id ? String(e.provenance.file_id) : null
    let fileName: string | null = null
    if (fileId) {
      const { data: file } = await db.from('files').select('name').eq('id', fileId).maybeSingle()
      fileName = file?.name ?? null
    }
    let rawText = ''
    if (extractionId) {
      const { data: ex } = await db.from('extractions').select('raw_text').eq('id', extractionId).maybeSingle()
      rawText = ex?.raw_text ?? ''
    }
    // The note is the extracted line items — a real signal even when the
    // extraction row is gone.
    const haystack = `${rawText}\n${e.note ?? ''}`
    if (looksLikeEstimate(haystack, fileName)) {
      estimates.push({ event: e, why: fileName ?? 'text markers' })
    }
  }

  // ---- pass 2: same vendor, same day, same amount ----
  const seen = new Map<string, Event>()
  const dupes: { event: Event; keeps: Event }[] = []
  const doomed = new Set(estimates.map((x) => x.event.id))
  for (const e of spend) {
    if (doomed.has(e.id)) continue
    const key = `${e.title}|${e.occurred_on}|${e.cost}`
    const first = seen.get(key)
    if (first) dupes.push({ event: e, keeps: first })
    else seen.set(key, e)
  }

  const money = (n: number | null) => `$${(n ?? 0).toFixed(2)}`
  const line = (e: Event) =>
    `${e.occurred_on}  ${money(e.cost).padStart(10)}  ${e.title.slice(0, 46).padEnd(46)}  ${(e.note ?? '').slice(0, 34)}`

  console.log(`Quotes recorded as spend (${estimates.length}):`)
  for (const { event, why } of estimates) console.log(`  ${line(event)}  [${why}]`)
  console.log(`\nDuplicate purchases (${dupes.length}, keeping the first of each):`)
  for (const { event } of dupes) console.log(`  ${line(event)}`)

  const removing = [...estimates.map((x) => x.event), ...dupes.map((x) => x.event)]
  const reclaimed = removing.reduce((sum, e) => sum + (e.cost ?? 0), 0)
  const before = spend.reduce((sum, e) => sum + (e.cost ?? 0), 0)
  console.log(`\nRecorded spend: ${money(before)} → ${money(before - reclaimed)} (removing ${money(reclaimed)} across ${removing.length} rows)`)

  if (!removing.length) return
  if (!apply) {
    console.log('\nDry run. Re-run with --apply to delete these rows.')
    return
  }

  const ids = removing.map((e) => e.id)
  for (let i = 0; i < ids.length; i += 100) {
    const { error: delError } = await db
      .from('care_events').delete().eq('home_id', homeId).in('id', ids.slice(i, i + 100))
    if (delError) throw delError
  }
  console.log(`\nDeleted ${ids.length} care_event(s).`)

  // projects.spent is a stored rollup off care_events — stale the moment a row
  // goes away.
  const projectIds = [...new Set(removing.map((e) => e.project_id).filter((id): id is string => Boolean(id)))]
  for (const projectId of projectIds) await recomputeProjectSpend(db, homeId, projectId)
  if (projectIds.length) console.log(`Recomputed spend on ${projectIds.length} project(s).`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
