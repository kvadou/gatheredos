/**
 * Clear review-queue noise written before the queue-quality rules landed.
 *
 * Two sources of clutter, both now fixed at the source:
 *   1. Inspection findings proposed off documents that are not inspection
 *      reports. A plumber's invoice describing what he saw ("water supply
 *      lines: corroded") became a to-do; one visit produced 18 of them.
 *   2. Cards keyed on raw model prose. One Rheem water heater became five
 *      cards; one contractor became two, because the document and email
 *      pipelines built contractor keys in different formats.
 *
 * Only PENDING suggestions are touched — an accepted card is already a real row
 * in the home, and a rejected one is a decision the user made.
 *
 * Dry run by default. Nothing is deleted without --apply.
 *
 *   pnpm cleanup:queue --email doug@example.com
 *   pnpm cleanup:queue --email doug@example.com --apply
 */
import { createAdminClient } from '../lib/supabase/admin'
import { contractorKey, itemKey } from '../lib/ingest/keys'

type Suggestion = {
  id: string
  target: string
  dedupe_key: string
  summary: string
  confidence: number
  payload: Record<string, unknown> | null
  provenance: Record<string, unknown> | null
  created_at: string
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
    console.error('usage: cleanup-queue --email <user email> | --home <home uuid> [--apply]')
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
    .from('suggestions')
    .select('id,target,dedupe_key,summary,confidence,payload,provenance,created_at')
    .eq('home_id', homeId)
    .eq('status', 'pending')
    .order('created_at')
  if (error) throw error
  const pending = (rows ?? []) as Suggestion[]
  console.log(`\nHome ${homeId} — ${pending.length} pending suggestion(s)\n`)

  // ---- pass 1: findings proposed off a document that is not an inspection ----
  const docTypes = new Map<string, string>()
  const strayFindings: Suggestion[] = []
  for (const s of pending) {
    const isFinding = s.dedupe_key.startsWith('inspection:') || s.dedupe_key.startsWith('inspection-project:')
    if (!isFinding) continue
    const extractionId = s.provenance?.extraction_id ? String(s.provenance.extraction_id) : null
    if (!extractionId) continue
    if (!docTypes.has(extractionId)) {
      const { data: ex } = await db.from('extractions').select('doc_type').eq('id', extractionId).maybeSingle()
      docTypes.set(extractionId, ex?.doc_type ?? 'unknown')
    }
    if (docTypes.get(extractionId) !== 'inspection') strayFindings.push(s)
  }

  // ---- pass 2: cards that collapse onto one key under the new rules ----
  const doomed = new Set(strayFindings.map((s) => s.id))
  const best = new Map<string, Suggestion>()
  const collapsed: { loser: Suggestion; winner: Suggestion }[] = []
  for (const s of pending) {
    if (doomed.has(s.id)) continue
    const key = rekey(s)
    if (!key) continue
    const winner = best.get(key)
    if (!winner) {
      best.set(key, s)
      continue
    }
    // Keep the most confident card, and on a tie the one that knows most about
    // the thing — otherwise a bare "Water heater" can beat the card carrying
    // the manufacturer and model, and the survivor is the emptiest of the set.
    if (rank(s) > rank(winner)) {
      best.set(key, s)
      collapsed.push({ loser: winner, winner: s })
    } else {
      collapsed.push({ loser: s, winner })
    }
  }

  const line = (s: Suggestion) => `${s.target.padEnd(12)} ${String(s.confidence).slice(0, 4).padEnd(5)} ${s.summary.slice(0, 58)}`
  console.log(`Findings from documents that are not inspections (${strayFindings.length}):`)
  for (const s of strayFindings) console.log(`  ${line(s)}`)
  console.log(`\nDuplicate cards for one thing (${collapsed.length}):`)
  for (const { loser, winner } of collapsed) {
    console.log(`  ${line(loser)}`)
    console.log(`      folds into: ${line(winner)}`)
  }

  const removing = [...strayFindings, ...collapsed.map((c) => c.loser)]
  console.log(`\nPending: ${pending.length} → ${pending.length - removing.length} (removing ${removing.length})`)
  if (!removing.length) return
  if (!apply) {
    console.log('\nDry run. Re-run with --apply to delete these cards.')
    return
  }

  const ids = removing.map((s) => s.id)
  for (let i = 0; i < ids.length; i += 100) {
    const { error: delError } = await db
      .from('suggestions').delete().eq('home_id', homeId).eq('status', 'pending').in('id', ids.slice(i, i + 100))
    if (delError) throw delError
  }
  console.log(`\nDeleted ${ids.length} pending suggestion(s).`)
}

/** Confidence first, then how many payload fields the card actually filled. */
function rank(s: Suggestion): number {
  const filled = Object.values(s.payload ?? {}).filter((v) => v !== null && v !== undefined && v !== '').length
  return s.confidence * 100 + filled
}

/**
 * The key this card would get today. Null for targets whose keys were never
 * prose-derived (facts, warranties, timeline), which are left alone.
 */
function rekey(s: Suggestion): string | null {
  const p = s.payload ?? {}
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  if (s.target === 'contractors') {
    const name = str(p.company) ?? str(p.name)
    return name ? contractorKey(name) : null
  }
  if (s.target === 'items') {
    // Only insert-shaped cards carry an identity; "fill in details from X"
    // cards are keyed to an existing item and a specific file.
    if (s.dedupe_key.startsWith('item-fill:') || s.dedupe_key.startsWith('catalog-item:')) return null
    const name = str(p.name) ?? str(p.model)
    return name ? itemKey(str(p.category), name) : null
  }
  return null
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
