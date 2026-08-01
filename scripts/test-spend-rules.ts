/**
 * Spend-integrity checks: a quote must never count as money spent, and one
 * purchase must produce one row however many copies of the document arrive.
 *
 * Both rules exist because of real data. A good/better/best option sheet from
 * one $118.87 plumbing visit booked ~$12,000 of work the homeowner never
 * bought, and every ServiceTitan invoice arrived twice because the platform
 * re-renders the PDF per send, so the content-hash dedupe on `files` saw two
 * different files.
 *
 * No Claude calls — the estimate predicate is deterministic and the dedupe is
 * exercised through applyCascade against a scratch home.
 *
 * Run: pnpm test:spend-rules
 */
import { createAdminClient } from '../lib/supabase/admin'
import { looksLikeEstimate, spendKey } from '../lib/ingest/extract'
import { applyCascade, type Proposal } from '../lib/ingest/pipeline'

const db = createAdminClient()
let failures = 0

function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) {
    failures += 1
    if (detail !== undefined) console.log('       got:', JSON.stringify(detail))
  }
}

async function scratchHome() {
  const { data: profile } = await db.from('profiles').select('id').limit(1).maybeSingle()
  if (!profile) throw new Error('no profile in the database — run scripts/seed.ts first')
  const { data: home, error } = await db
    .from('homes')
    .insert({ name: 'Spend rules test home', created_by: profile.id })
    .select('*')
    .single()
  if (error || !home) throw error ?? new Error('home insert failed')
  return home
}

/** A paid-invoice proposal, at auto-apply confidence so it writes straight through. */
function purchase(vendor: string, date: string, total: number): Proposal {
  return {
    target: 'care_events',
    action: 'insert',
    payload: { title: `Purchase — ${vendor}`, note: 'Diagnostic Charge', cost: total, occurred_on: date, item_id: null },
    dedupeKey: spendKey(vendor, date, total) ?? 'fallback',
    confidence: 0.95,
    summary: `Record $${total} from ${vendor}?`,
  }
}

async function main() {
  // ---- the estimate predicate ----
  const estimates: [string, string, string | null][] = [
    ['option-sheet filename', '', 'Good.pdf'],
    ['option-sheet filename (Best)', '', 'Best.pdf'],
    ['numbered option filename', '', 'Option_2.pdf'],
    ['the word estimate', 'ESTIMATE for water heater replacement', 'x.pdf'],
    ['the word proposal', 'Proposal — total $4,241.87', null],
    ['explicit disclaimer', 'This is not an invoice.', null],
    ['expiry language', 'Pricing valid until 03/01', null],
    ['good/better/best in body', 'Good, Better, Best options below', null],
  ]
  for (const [label, text, name] of estimates) {
    check(`estimate: ${label}`, looksLikeEstimate(text, name) === true)
  }

  const invoices: [string, string, string | null][] = [
    ['paid invoice', 'INVOICE 458842\nDiagnostic Charge $99.00\nAmount paid $118.87', 'Invoice_458842.pdf'],
    ['store receipt', 'THE HOME DEPOT\nTOTAL $89.99\nVISA', 'receipt.jpg'],
    // "Goodyear" starts with "good" — the filename rule must be anchored.
    ['vendor named Goodyear', 'Goodyear tire receipt total $412', 'goodyear.pdf'],
  ]
  for (const [label, text, name] of invoices) {
    check(`invoice: ${label} is not an estimate`, looksLikeEstimate(text, name) === false)
  }

  // ---- the spend key ----
  check('spendKey normalizes vendor', spendKey('  Hero Plumbing  ', '2021-02-04', 118.87) === 'spend:hero plumbing:2021-02-04:118.87')
  check('spendKey is null without a vendor', spendKey(null, '2021-02-04', 10) === null)
  check('spendKey is null without a cost', spendKey('X', '2021-02-04', null) === null)

  // ---- semantic dedupe through the real cascade ----
  const home = await scratchHome()
  console.log(`\nscratch home ${home.id}\n`)
  try {
    const env = (p: Proposal) => ({
      docType: 'receipt' as const, rawText: '', confidence: 0.95, model: 'test',
      scopeStatus: 'in_scope' as const, scopeReason: null, proposals: [p],
    })
    const src = (key: string) => ({ homeId: home.id, extractionId: null, sourceKey: key, pipeline: 'test' })

    // The same invoice arriving as two byte-different PDFs: two sources.
    await applyCascade(db, src('file:copy-a'), env(purchase('Hero Plumbing', '2021-02-04', 118.87)), 1)
    await applyCascade(db, src('file:copy-b'), env(purchase('Hero Plumbing', '2021-02-04', 118.87)), 1)
    const { data: same } = await db.from('care_events').select('id').eq('home_id', home.id).eq('cost', 118.87)
    check('two copies of one invoice write one row', same?.length === 1, same?.length)

    // A genuinely different amount on the same day is a different purchase.
    await applyCascade(db, src('file:copy-c'), env(purchase('Hero Plumbing', '2021-02-04', 4241.87)), 1)
    const { data: all } = await db.from('care_events').select('id,cost').eq('home_id', home.id)
    check('a different amount is still its own row', all?.length === 2, all?.map((r) => r.cost))

    // Re-extracting the SAME source with a corrected total must update in
    // place, not add a row — the property the old file-scoped key protected.
    await applyCascade(db, src('file:copy-c'), env(purchase('Hero Plumbing', '2021-02-04', 4000)), 1)
    const { data: corrected } = await db.from('care_events').select('id,cost').eq('home_id', home.id)
    check('re-extraction corrects in place', corrected?.length === 2, corrected?.map((r) => r.cost))
    check('the corrected cost landed', corrected?.some((r) => Number(r.cost) === 4000) === true, corrected?.map((r) => r.cost))
  } finally {
    await db.from('homes').delete().eq('id', home.id)
    console.log(`\nscratch home ${home.id} deleted`)
  }

  console.log(failures === 0 ? '\nSPEND RULES PASSED' : `\n${failures} CHECK(S) FAILED`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
