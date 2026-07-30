/**
 * Step 3 runtime test — REAL haiku vision extraction end to end.
 * Uploads a rendered test receipt to storage, runs ingestFile, and asserts
 * the full cascade: extraction row, care_event cost, item suggestion queued,
 * warranty row, timeline event. Costs ~1 haiku call. Cleans up after itself.
 *
 * Usage: pnpm dlx tsx scripts/test-extraction.ts <path-to-receipt.png>
 */
import { readFileSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'

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

async function main() {
  const pngPath = process.argv[2]
  if (!pngPath) throw new Error('usage: test-extraction.ts <receipt.png>')
  const syntheticFixture = /scripts\/fixtures\/receipt\.png$/.test(pngPath)
  const expectedItem = syntheticFixture ? 'rheem' : 'traeger'
  const expectedModel = syntheticFixture ? 'XE50T10H45U0' : 'TFB89'
  const expectedCost = syntheticFixture ? 1732.92 : 1650.58
  const { createAdminClient } = await import('../lib/supabase/admin')
  const { ingestFile, autoApply } = await import('../lib/ingest/pipeline')
  const db = createAdminClient()

  const assert = (cond: unknown, msg: string) => {
    if (!cond) throw new Error(`ASSERT FAILED: ${msg}`)
    console.log(`ok: ${msg}`)
  }

  const { data: profile } = await db.from('profiles').select('id').eq('email', 'dev@gatheredos.local').single()
  if (!profile) throw new Error('dev@gatheredos.local not found')
  const { data: member } = await db.from('home_members').select('home_id').eq('user_id', profile.id).limit(1).single()
  if (!member) throw new Error('dev user has no home')
  const homeId = member.home_id
  const TAG = 'extract-test'

  const cleanup = async () => {
    const { data: files } = await db.from('files').select('id, storage_path').eq('home_id', homeId).like('name', `${TAG}%`)
    for (const f of files ?? []) {
      await db.from('suggestions').delete().eq('home_id', homeId).like('provenance->>file_id', f.id)
      await db.from('warranties').delete().eq('home_id', homeId).eq('file_id', f.id)
      await db.from('care_events').delete().eq('home_id', homeId).eq('provenance->>file_id', f.id)
      // home_facts before extractions: the FK is ON DELETE SET NULL, so dropping the
      // extraction first would orphan (not remove) the facts it minted.
      const { data: exRows } = await db.from('extractions').select('id').eq('file_id', f.id)
      for (const e of exRows ?? []) await db.from('home_facts').delete().eq('home_id', homeId).eq('source_extraction_id', e.id)
      await db.from('extractions').delete().eq('file_id', f.id)
      await db.storage.from('home-files').remove([f.storage_path])
    }
    await db.from('suggestions').delete().eq('home_id', homeId).ilike('dedupe_key', '%traeger%')
    await db.from('suggestions').delete().eq('home_id', homeId).eq('target', 'home_facts').ilike('summary', '%traeger%')
    await db.from('timeline_events').delete().eq('home_id', homeId).ilike('title', '%traeger%')
    await db.from('timeline_events').delete().eq('home_id', homeId).ilike('title', '%pellet grill%')
    // synthetic self-check facts + any model facts orphaned by a crashed prior run
    await db.from('home_facts').delete().eq('home_id', homeId).ilike('statement', `${TAG}%`)
    await db.from('home_facts').delete().eq('home_id', homeId).ilike('statement', '%traeger%')
    await db.from('home_facts').delete().eq('home_id', homeId).ilike('statement', '%pellet grill%')
    await db.from('files').delete().eq('home_id', homeId).like('name', `${TAG}%`)
  }
  await cleanup()

  // upload the receipt image to storage
  const png = readFileSync(pngPath)
  const hash = createHash('sha256').update(png).digest('hex')
  const storagePath = `${homeId}/${TAG}-receipt.png`
  const { error: upErr } = await db.storage.from('home-files').upload(storagePath, png, { contentType: 'image/png', upsert: true })
  if (upErr) throw upErr

  const { data: file, error: fErr } = await db
    .from('files')
    .insert({
      home_id: homeId,
      type: 'receipt',
      name: `${TAG}-ace-receipt`,
      storage_path: storagePath,
      content_hash: hash,
      extraction_status: 'pending',
    })
    .select('id')
    .single()
  if (fErr || !file) throw fErr ?? new Error('file insert failed')

  console.log('running ingestFile (real haiku vision extraction)...')
  const t0 = Date.now()
  await ingestFile(file.id)
  console.log(`ingest took ${((Date.now() - t0) / 1000).toFixed(1)}s`)

  const { data: f1 } = await db.from('files').select('extraction_status').eq('id', file.id).single()
  assert(f1?.extraction_status === 'done', 'file stamped done')

  const { data: exs } = await db.from('extractions').select('*').eq('file_id', file.id)
  assert(exs?.length === 1 && exs[0].status === 'done', 'extraction row done')
  const ex = exs![0]
  assert(ex.doc_type === 'receipt', `classified as receipt (got ${ex.doc_type})`)
  assert(ex.model === 'claude-haiku-4-5', 'model recorded')
  assert((ex.raw_text ?? '').toLowerCase().includes(expectedItem), `raw_text transcribed ${expectedItem}`)
  console.log(`   confidence: ${ex.confidence}`)

  const { data: ce } = await db.from('care_events').select('cost, title').eq('home_id', homeId).eq('provenance->>file_id', file.id)
  assert(ce?.length === 1, 'care_event written')
  assert(Math.abs(Number(ce![0].cost) - expectedCost) < 0.01, `cost = ${expectedCost} (got ${ce![0].cost})`)

  const { data: sg } = await db
    .from('suggestions')
    .select('summary, target, status, payload')
    .eq('home_id', homeId)
    .eq('target', 'items')
    .eq('status', 'pending')
    .ilike('dedupe_key', `%${expectedItem}%`)
  assert(sg?.length === 1, `item suggestion queued: "${sg?.[0]?.summary}"`)
  const payload = sg![0].payload as Record<string, unknown>
  assert(String(payload.model ?? '').toUpperCase().includes(expectedModel), `model captured (got ${payload.model})`)

  const { data: wt } = await db.from('warranties').select('provider, term_months, ends_on').eq('home_id', homeId).eq('file_id', file.id)
  if (wt?.length) {
    console.log(`ok: warranty row — ${wt[0].provider}, ${wt[0].term_months} months, ends ${wt[0].ends_on}`)
  } else {
    const { data: wsg } = await db.from('suggestions').select('summary').eq('home_id', homeId).eq('target', 'warranties').eq('status', 'pending')
    assert(wsg?.length, 'warranty queued as suggestion (below auto threshold)')
  }

  const { data: tl } = await db.from('timeline_events').select('year, title').eq('home_id', homeId).eq('year', 2026).ilike('title', '%purchas%')
  console.log(tl?.length ? `ok: timeline event — "${tl[0].title}" (${tl[0].year})` : 'note: timeline event queued or skipped (confidence-gated)')

  // home_facts: the document must yield at least one durable, citable fact —
  // auto-applied (conf ≥ 0.85) or queued for review (0.50–0.85).
  const { data: facts } = await db
    .from('home_facts')
    .select('statement, predicate, category, confidence, source_kind')
    .eq('home_id', homeId)
    .eq('source_extraction_id', ex.id)
  const { data: factSug } = await db
    .from('suggestions')
    .select('summary')
    .eq('home_id', homeId)
    .eq('target', 'home_facts')
    .eq('status', 'pending')
  assert((facts?.length ?? 0) > 0 || (factSug?.length ?? 0) > 0, `home_facts captured (${facts?.length ?? 0} auto, ${factSug?.length ?? 0} queued)`)
  for (const f of facts ?? []) console.log(`   fact: "${f.statement}" [${f.category ?? '—'}, ${f.source_kind}, conf ${f.confidence}]`)
  for (const s of factSug ?? []) console.log(`   fact (queued): ${s.summary}`)

  // Deterministic dedupe + supersession self-check (no model call). This is the
  // "no duplicate rows on re-ingest" guarantee — it holds regardless of how the
  // extractor phrases a fact between runs. Synthetic statements are TAG-prefixed
  // so cleanup removes them.
  const prov = { pipeline: 'test', model: 'test', file_id: file.id, extraction_id: ex.id, depth: 1, confidence: 1 }
  const factProposal = (statement: string, extra: Record<string, unknown> = {}): Parameters<typeof autoApply>[2] => ({
    target: 'home_facts',
    action: 'insert',
    payload: { statement, predicate: null, object_value: null, category: 'spec', subject_table: null, subject_id: null, ...extra },
    dedupeKey: 'selfcheck',
    confidence: 1,
    summary: statement,
  })

  const S1 = `${TAG} freeform fact alpha`
  await autoApply(db, homeId, factProposal(S1), prov)
  await autoApply(db, homeId, factProposal(S1), prov) // identical statement → must skip
  const { data: dupRows } = await db.from('home_facts').select('id').eq('home_id', homeId).eq('statement', S1).eq('is_current', true)
  assert(dupRows?.length === 1, `exact-statement dedupe holds (1 row for repeated fact, got ${dupRows?.length})`)

  const subjId = randomUUID()
  const slot = { predicate: 'test_slot', subject_table: 'items', subject_id: subjId }
  const P1 = `${TAG} slot value A`
  const P2 = `${TAG} slot value B`
  await autoApply(db, homeId, factProposal(P1, slot), prov)
  await autoApply(db, homeId, factProposal(P2, slot), prov) // different value, same slot → supersede
  const { data: slotRows } = await db
    .from('home_facts')
    .select('statement, is_current, superseded_by')
    .eq('home_id', homeId)
    .eq('subject_id', subjId)
    .eq('predicate', 'test_slot')
  assert(slotRows?.length === 2, `supersession kept history (2 rows, got ${slotRows?.length})`)
  const current = (slotRows ?? []).filter((r) => r.is_current)
  assert(current.length === 1 && current[0].statement === P2, 'only the newest slot fact is current')
  const superseded = (slotRows ?? []).find((r) => !r.is_current)
  assert(superseded?.superseded_by != null, 'superseded fact points to its replacement')
  await autoApply(db, homeId, factProposal(P2, slot), prov) // identical slot value → no-op
  const { data: slotRows2 } = await db.from('home_facts').select('id').eq('home_id', homeId).eq('subject_id', subjId).eq('predicate', 'test_slot')
  assert(slotRows2?.length === 2, `identical slot value is a no-op (still 2 rows, got ${slotRows2?.length})`)
  // remove the synthetic self-check facts so re-runs stay clean
  await db.from('home_facts').delete().eq('home_id', homeId).ilike('statement', `${TAG}%`)

  if (process.argv.includes('--cleanup')) {
    await cleanup()
    console.log('\nEXTRACTION E2E PASSED — cleanup complete')
  } else {
    console.log('\nEXTRACTION E2E PASSED — leaving suggestion pending for UI test (cleanup deferred)')
    console.log(`file_id: ${file.id}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
