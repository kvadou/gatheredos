/**
 * Re-open contractor email for a second read.
 *
 * `imported_messages` rows with status done/skipped are the dedupe layer: the
 * sync never fetches them again. That is correct until the classifier changes,
 * at which point mail that produced nothing deserves another pass with the new
 * rules. Deleting an unproductive row is what puts it back in the candidate set.
 *
 * "Unproductive" means the message left no trace anywhere: no suggestion card,
 * and no row in any memory table stamped with its source_key. A message that
 * produced a contractor card or a visit record is left alone — re-reading it
 * would only re-queue what the user already has in front of them.
 *
 * Dry run by default. Nothing is deleted without --apply.
 *
 *   pnpm reprocess:email --email doug@example.com
 *   pnpm reprocess:email --email doug@example.com --apply
 *   pnpm reprocess:email --home <uuid> --status skipped --apply
 */
import { createAdminClient } from '../lib/supabase/admin'

type Row = {
  external_id: string
  status: string
  skip_reason: string | null
  vendor: string | null
  from_name: string | null
  from_email: string | null
  subject: string | null
  sent_at: string | null
}

/**
 * The model's phrasing when it decided the message is not about work at this
 * home at all (newsletter, order shipped, bank offer). Those rejections do not
 * depend on the routing rules that get tuned, and re-reading them costs one
 * Claude call each for a near-certain second rejection — so they are held back
 * unless --include-rejected says otherwise.
 */
const CONFIDENT_REJECTION = 'not about work at this home'

/**
 * Memory tables the cascade auto-applies into, all carrying
 * provenance.source_key. `home_facts` is excluded on purpose: it stamps
 * `evidence`, not `provenance`, and a fact alone is not the kind of trace worth
 * protecting a message for.
 */
const MEMORY_TABLES = ['care_events', 'care_tasks', 'timeline_events'] as const

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}
const has = (name: string) => process.argv.includes(`--${name}`)

async function main() {
  const db = createAdminClient()
  const apply = has('apply')
  const statuses = (arg('status') ?? 'done,skipped').split(',').map((s) => s.trim())

  let homeId = arg('home')
  const email = arg('email')
  if (!homeId && !email) {
    console.error('usage: reprocess-email --email <user email> | --home <home uuid> [--status done,skipped] [--apply]')
    process.exit(1)
  }

  if (!homeId) {
    const { data: profile } = await db
      .from('profiles').select('id').eq('email', email!).maybeSingle()
    if (!profile) throw new Error(`no profile for ${email}`)
    const { data: membership } = await db
      .from('home_members').select('home_id').eq('user_id', profile.id).limit(1).maybeSingle()
    if (!membership) throw new Error(`no home for ${email}`)
    homeId = membership.home_id
  }

  const { data: rows, error } = await db
    .from('imported_messages' as never)
    .select('external_id,status,skip_reason,vendor,from_name,from_email,subject,sent_at')
    .eq('home_id', homeId)
    .in('status', statuses)
    .order('sent_at', { ascending: false }) as { data: Row[] | null; error: unknown }
  if (error) throw error
  if (!rows?.length) {
    console.log(`No ${statuses.join('/')} rows for home ${homeId}.`)
    return
  }

  const includeRejected = has('include-rejected')
  const unproductive: Row[] = []
  const kept: { row: Row; trace: string }[] = []
  const heldBack: Row[] = []

  for (const row of rows) {
    if (!includeRejected && row.skip_reason?.includes(CONFIDENT_REJECTION)) {
      heldBack.push(row)
      continue
    }
    const sourceKey = `email:${row.external_id}`
    let trace: string | null = null

    const { data: suggestion } = await db
      .from('suggestions')
      .select('id')
      .eq('home_id', homeId)
      .eq('provenance->>source_key', sourceKey)
      .limit(1)
      .maybeSingle()
    if (suggestion) trace = 'suggestions'

    if (!trace) {
      for (const table of MEMORY_TABLES) {
        const { data: hit } = await db
          .from(table)
          .select('id')
          .eq('home_id', homeId)
          .eq('provenance->>source_key', sourceKey)
          .limit(1)
          .maybeSingle()
        if (hit) { trace = table; break }
      }
    }

    if (trace) kept.push({ row, trace })
    else unproductive.push(row)
  }

  const label = (r: Row) =>
    `${(r.sent_at ?? '').slice(0, 10) || '??????????'}  ${r.status.padEnd(7)}  ${(r.from_name || r.from_email || '?').slice(0, 32).padEnd(32)}  ${(r.subject ?? '').slice(0, 60)}`

  console.log(`\nHome ${homeId} — ${rows.length} row(s) with status ${statuses.join('/')}\n`)
  console.log(`Keeping ${kept.length} (already produced something):`)
  for (const { row, trace } of kept) console.log(`  [${trace}] ${label(row)}`)
  if (heldBack.length) {
    console.log(`\nHeld back ${heldBack.length} confidently-rejected (pass --include-rejected to re-read):`)
    for (const row of heldBack) console.log(`  ${label(row)}`)
  }
  console.log(`\n${apply ? 'Deleting' : 'Would delete'} ${unproductive.length} (no trace anywhere):`)
  for (const row of unproductive) console.log(`  ${label(row)}`)

  if (!unproductive.length) return
  if (!apply) {
    console.log('\nDry run. Re-run with --apply to delete these rows so the next sync re-reads them.')
    return
  }

  // Chunked: the id list can outgrow a comfortable URL length on a big mailbox.
  const ids = unproductive.map((r) => r.external_id)
  for (let i = 0; i < ids.length; i += 100) {
    const { error: delError } = await db
      .from('imported_messages' as never)
      .delete()
      .eq('home_id', homeId)
      .in('external_id', ids.slice(i, i + 100))
    if (delError) throw delError
  }
  console.log(`\nDeleted ${ids.length} row(s). Run Import again to re-read them.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
