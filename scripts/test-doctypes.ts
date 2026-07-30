/**
 * Sub-phase 3a doc-type extraction verification — REAL haiku extraction of four
 * fixture documents (owner's manual, warranty certificate, inspection report,
 * photographed data plate) end to end. Asserts the doc-type branches from the
 * 3a plan (docs/plans/2026-07-13-phase3-engine-completion.md §3a):
 *
 *   a. Manual   → maintenance intervals QUEUE as care tasks (manual: slugs),
 *                 never auto-applied; a filter-size fact is captured.
 *   b. Warranty → warranties row (term_months=72, ends ~2032-03), an AUTO
 *                 warranty_expiry care task due ~30d before expiry, and a
 *                 QUEUED contractor. Then simulates the accept the way
 *                 suggestions.ts does (autoApply) and asserts a contractors ROW
 *                 lands — the contractor-accept bug regression check.
 *   c. Inspection → 3 inspection: care-task suggestions + a recommended-project
 *                 suggestion for the HIGH roof finding; autoApply writes a
 *                 projects ROW.
 *   d. Photo    → the plate links to a pre-seeded item (files.item_id AUTO path)
 *                 and its serial is filled (or queued).
 *
 * Costs ~4 haiku vision calls. Cleans up FULLY — leaves nothing behind, at both
 * start (crashed prior runs) and end.
 *
 * Usage: pnpm dlx tsx scripts/test-doctypes.ts
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'

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

const TAG = 'doctype-test'

/** Whole days from a→b (both 'YYYY-MM-DD'); positive when b is later. */
function daysBetween(a: string, b: string): number {
  const ta = new Date(`${a}T00:00:00Z`).getTime()
  const tb = new Date(`${b}T00:00:00Z`).getTime()
  return Math.round((tb - ta) / 86_400_000)
}

async function main() {
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

  // ---- full cleanup (runs at start against crashed prior runs, and at end) ----
  const cleanup = async () => {
    const { data: files } = await db.from('files').select('id, storage_path').eq('home_id', homeId).like('name', `${TAG}%`)
    for (const f of files ?? []) {
      // AUTO care tasks (e.g. warranty_expiry) carry the file id in provenance
      await db.from('care_tasks').delete().eq('home_id', homeId).eq('provenance->>file_id', f.id)
      await db.from('suggestions').delete().eq('home_id', homeId).eq('provenance->>file_id', f.id)
      await db.from('warranties').delete().eq('home_id', homeId).eq('file_id', f.id)
      await db.from('care_events').delete().eq('home_id', homeId).eq('provenance->>file_id', f.id)
      // facts + insights FK to extractions is ON DELETE SET NULL — drop them
      // before the extraction or they orphan instead of delete.
      const { data: exRows } = await db.from('extractions').select('id').eq('file_id', f.id)
      for (const e of exRows ?? []) {
        await db.from('home_facts').delete().eq('home_id', homeId).eq('source_extraction_id', e.id)
        await db.from('insights').delete().eq('home_id', homeId).eq('source_extraction_id', e.id)
      }
      await db.from('extractions').delete().eq('file_id', f.id)
      await db.storage.from('home-files').remove([f.storage_path])
    }
    // rows created by the simulated accepts (autoApply writes them directly, so
    // they carry no TAG in the name) — keyed by their deterministic identity.
    // ponytail: name match; a real dev-home entity by these exact names is a non-event.
    await db.from('contractors').delete().eq('home_id', homeId).ilike('name', 'Rheem%')
    await db.from('projects').delete().eq('home_id', homeId).eq('kind', 'recommended').ilike('name', 'Address: Roof%')
    // the pre-seeded plate-match item + anything hanging off it
    const { data: items } = await db.from('items').select('id').eq('home_id', homeId).like('name', `${TAG}%`)
    for (const it of items ?? []) {
      await db.from('field_provenance').delete().eq('entity_table', 'items').eq('entity_id', it.id)
      await db.from('home_facts').delete().eq('home_id', homeId).eq('subject_id', it.id)
    }
    await db.from('items').delete().eq('home_id', homeId).like('name', `${TAG}%`)
    await db.from('files').delete().eq('home_id', homeId).like('name', `${TAG}%`)
  }
  await cleanup()

  // ---- ingest one fixture PNG directly through the pipeline ----
  const ingestFixture = async (png: string, type: string, label: string) => {
    const bytes = readFileSync(resolve('scripts/fixtures', png))
    const hash = createHash('sha256').update(bytes).digest('hex')
    const storagePath = `${homeId}/${TAG}-${png}`
    const { error: upErr } = await db.storage.from('home-files').upload(storagePath, bytes, { contentType: 'image/png', upsert: true })
    if (upErr) throw upErr
    const { data: file, error: fErr } = await db
      .from('files')
      .insert({
        home_id: homeId,
        type,
        name: `${TAG}-${label}`,
        storage_path: storagePath,
        content_hash: hash,
        extraction_status: 'pending',
      })
      .select('id')
      .single()
    if (fErr || !file) throw fErr ?? new Error(`${label}: file insert failed`)

    const t0 = Date.now()
    await ingestFile(file.id)
    console.log(`   ${label} ingest took ${((Date.now() - t0) / 1000).toFixed(1)}s`)

    const { data: f1 } = await db.from('files').select('extraction_status, item_id').eq('id', file.id).single()
    assert(f1?.extraction_status === 'done', `${label}: file stamped done`)
    const { data: exs } = await db.from('extractions').select('*').eq('file_id', file.id)
    assert(exs?.length === 1 && exs[0].status === 'done', `${label}: extraction row done`)
    return { fileId: file.id, ex: exs![0] }
  }

  // reconstruct a queued proposal and apply it exactly like acceptSuggestion's
  // else-branch (suggestions.ts) — autoApply, then mark accepted.
  const simulateAccept = async (s: Record<string, unknown>) => {
    await autoApply(
      db,
      homeId,
      {
        target: s.target,
        action: s.action,
        targetId: s.target_id ?? undefined,
        payload: s.payload as Record<string, unknown>,
        dedupeKey: s.dedupe_key,
        confidence: s.confidence,
        summary: s.summary,
      } as Parameters<typeof autoApply>[2],
      (s.provenance ?? {}) as Record<string, unknown>,
    )
    await db.from('suggestions').update({ status: 'accepted' }).eq('id', s.id as string)
  }

  try {
    // ============================ a. MANUAL ============================
    console.log('\n=== a. MANUAL (Carrier 59TP6 furnace) ===')
    const manual = await ingestFixture('manual.png', 'manual', 'manual')
    assert(manual.ex.doc_type === 'manual', `classified manual (got ${manual.ex.doc_type})`)

    const { data: manualTasks } = await db
      .from('suggestions')
      .select('dedupe_key, summary, payload')
      .eq('home_id', homeId)
      .eq('target', 'care_tasks')
      .eq('status', 'pending')
      .ilike('dedupe_key', 'manual:%')
      .eq('provenance->>file_id', manual.fileId)
    assert((manualTasks?.length ?? 0) >= 1, `≥1 manual: care task QUEUED (got ${manualTasks?.length ?? 0})`)
    for (const t of manualTasks ?? []) console.log(`   queued task: ${t.dedupe_key} — "${t.summary}"`)

    // manufacturer schedules are never auto-applied — user vets them
    const { data: manualRows } = await db.from('care_tasks').select('id, template_slug').eq('home_id', homeId).ilike('template_slug', 'manual:%')
    assert((manualRows?.length ?? 0) === 0, `no manual: care task auto-applied (got ${manualRows?.length ?? 0} rows)`)

    // filter size captured as a fact (auto or queued)
    const { data: mFacts } = await db.from('home_facts').select('statement').eq('home_id', homeId).eq('source_extraction_id', manual.ex.id)
    const { data: mFactSug } = await db
      .from('suggestions')
      .select('summary')
      .eq('home_id', homeId)
      .eq('target', 'home_facts')
      .eq('status', 'pending')
      .eq('provenance->>file_id', manual.fileId)
    const filterHit = [...(mFacts ?? []).map((f) => f.statement), ...(mFactSug ?? []).map((s) => s.summary)].find((t) => /filter|16\s*x\s*25/i.test(t ?? ''))
    assert(Boolean(filterHit), `filter-size fact captured (${(mFacts?.length ?? 0)} auto, ${(mFactSug?.length ?? 0)} queued)`)
    console.log(`   filter fact: "${filterHit}"`)

    // ============================ b. WARRANTY =========================
    console.log('\n=== b. WARRANTY (Rheem water heater, 72mo) ===')
    const warranty = await ingestFixture('warranty.png', 'warranty', 'warranty')

    // warranties row auto-applied, else queued — either way term=72, ends ~2032-03
    let endsOn: string | null = null
    const { data: wRows } = await db.from('warranties').select('term_months, ends_on, provider').eq('home_id', homeId).eq('file_id', warranty.fileId)
    if (wRows?.length) {
      assert(wRows[0].term_months === 72, `warranty term_months=72 (got ${wRows[0].term_months})`)
      assert(String(wRows[0].ends_on ?? '').startsWith('2032'), `warranty ends 2032 (got ${wRows[0].ends_on})`)
      endsOn = wRows[0].ends_on
      console.log(`   warranty ROW: ${wRows[0].provider}, ${wRows[0].term_months}mo, ends ${wRows[0].ends_on}`)
    } else {
      const { data: wSug } = await db.from('suggestions').select('payload').eq('home_id', homeId).eq('target', 'warranties').eq('status', 'pending').eq('provenance->>file_id', warranty.fileId)
      assert((wSug?.length ?? 0) > 0, 'warranty queued (below auto threshold)')
      const pl = wSug![0].payload as Record<string, unknown>
      assert(Number(pl.term_months) === 72, `queued warranty term_months=72 (got ${pl.term_months})`)
      assert(String(pl.ends_on ?? '').startsWith('2032'), `queued warranty ends 2032 (got ${pl.ends_on})`)
      endsOn = pl.ends_on as string
      console.log(`   warranty QUEUED: term ${pl.term_months}mo, ends ${pl.ends_on}`)
    }

    // warranty_expiry reminder: AUTO care task due ~30d before expiry, else queued
    const { data: expRows } = await db.from('care_tasks').select('due_on, title').eq('home_id', homeId).like('template_slug', 'warranty_expiry%').eq('provenance->>file_id', warranty.fileId)
    if (expRows?.length) {
      assert(expRows[0].due_on != null, 'warranty_expiry task has due_on')
      if (endsOn && expRows[0].due_on) {
        const gap = daysBetween(expRows[0].due_on, endsOn)
        assert(gap >= 25 && gap <= 35, `warranty_expiry due ~30d before ends_on (gap ${gap}d)`)
      }
      console.log(`   warranty_expiry ROW: "${expRows[0].title}" due ${expRows[0].due_on}`)
    } else {
      const { data: expSug } = await db.from('suggestions').select('payload, summary').eq('home_id', homeId).eq('target', 'care_tasks').eq('status', 'pending').eq('provenance->>file_id', warranty.fileId)
      const match = (expSug ?? []).find((s) => String((s.payload as Record<string, unknown>)?.template_slug ?? '').startsWith('warranty_expiry'))
      assert(Boolean(match), 'warranty_expiry queued (below auto threshold)')
      console.log(`   warranty_expiry QUEUED: "${match!.summary}"`)
    }

    // contractor QUEUED (provider + claim phone present)
    const { data: cSug } = await db.from('suggestions').select('*').eq('home_id', homeId).eq('target', 'contractors').eq('status', 'pending').eq('provenance->>file_id', warranty.fileId)
    assert((cSug?.length ?? 0) > 0, `contractor suggestion queued (provider+claim phone)`)
    console.log(`   contractor suggestion: "${cSug![0].summary}" [dedupe ${cSug![0].dedupe_key}]`)

    // simulate the accept → contractor ROW must land (contractor-accept bug regression)
    await simulateAccept(cSug![0] as Record<string, unknown>)
    const { data: cRow } = await db.from('contractors').select('name, phone').eq('home_id', homeId).ilike('name', 'Rheem%')
    assert((cRow?.length ?? 0) > 0, `contractor ROW written on accept — BUG REGRESSION CHECK (got ${cRow?.length ?? 0})`)
    console.log(`   contractor ROW: ${cRow![0].name} / ${cRow![0].phone ?? '—'}`)

    // ============================ c. INSPECTION =======================
    console.log('\n=== c. INSPECTION (3 findings, 1 HIGH) ===')
    const inspection = await ingestFixture('inspection.png', 'document', 'inspection')
    assert(inspection.ex.doc_type === 'inspection', `classified inspection (got ${inspection.ex.doc_type})`)

    const { data: inspTasks } = await db.from('suggestions').select('dedupe_key, summary').eq('home_id', homeId).eq('target', 'care_tasks').eq('status', 'pending').ilike('dedupe_key', 'inspection:%').eq('provenance->>file_id', inspection.fileId)
    assert((inspTasks?.length ?? 0) >= 3, `3 inspection: care tasks queued (got ${inspTasks?.length ?? 0})`)
    for (const t of inspTasks ?? []) console.log(`   inspection task: ${t.dedupe_key} — "${t.summary}"`)

    const { data: projSug } = await db.from('suggestions').select('*').eq('home_id', homeId).eq('target', 'projects').eq('status', 'pending').eq('provenance->>file_id', inspection.fileId)
    assert((projSug?.length ?? 0) >= 1, `≥1 recommended-project suggestion for the HIGH finding (got ${projSug?.length ?? 0})`)
    const proj = projSug![0]
    assert((proj.payload as Record<string, unknown>)?.kind === 'recommended', `project payload kind='recommended' (got ${(proj.payload as Record<string, unknown>)?.kind})`)
    console.log(`   project suggestion: "${proj.summary}"`)

    // autoApply the project proposal → a projects ROW must land (post-3a insert path)
    await simulateAccept(proj as Record<string, unknown>)
    const projName = String((proj.payload as Record<string, unknown>)?.name ?? '')
    const { data: pRow } = await db.from('projects').select('name, kind').eq('home_id', homeId).eq('kind', 'recommended').eq('name', projName)
    assert((pRow?.length ?? 0) > 0, `project ROW written on accept (got ${pRow?.length ?? 0})`)
    console.log(`   project ROW: "${pRow![0].name}" [${pRow![0].kind}]`)

    // ============================ d. PHOTO ============================
    console.log('\n=== d. PHOTO (Lennox data plate → item link) ===')
    // seed the item the plate should match (matchItem keys on model)
    const { data: item, error: itErr } = await db
      .from('items')
      .insert({ home_id: homeId, name: `${TAG} Furnace`, category: 'system', status: 'good', manufacturer: 'Lennox', model: 'ML195UH045XE36B' })
      .select('id')
      .single()
    if (itErr || !item) throw itErr ?? new Error('plate-match item insert failed')

    const photo = await ingestFixture('photo-plate.png', 'photo', 'photo')
    console.log(`   photo doc_type: ${photo.ex.doc_type}, confidence: ${photo.ex.confidence}`)

    // files.item_id linked via the AUTO files-update path, else a files suggestion
    const { data: pFile } = await db.from('files').select('item_id').eq('id', photo.fileId).single()
    const linked = pFile?.item_id === item.id
    const { data: fSug } = await db.from('suggestions').select('summary').eq('home_id', homeId).eq('target', 'files').eq('status', 'pending').eq('provenance->>file_id', photo.fileId)
    assert(linked || (fSug?.length ?? 0) > 0, `photo file linked to item (AUTO) or files suggestion queued`)
    console.log(linked ? `   files.item_id linked → ${item.id}` : `   files link QUEUED: "${fSug?.[0]?.summary}"`)

    // serial filled on the item, else queued as an items suggestion
    const { data: item2 } = await db.from('items').select('serial').eq('id', item.id).single()
    const { data: iSug } = await db.from('suggestions').select('payload').eq('home_id', homeId).eq('target', 'items').eq('status', 'pending').eq('provenance->>file_id', photo.fileId)
    const serialOnItem = item2?.serial != null && String(item2.serial).trim().length > 0
    const serialQueued = (iSug ?? []).some((s) => (s.payload as Record<string, unknown>)?.serial != null)
    assert(serialOnItem || serialQueued, `plate serial captured on item or queued`)
    console.log(serialOnItem ? `   item serial filled: ${item2!.serial}` : `   item serial QUEUED (${iSug?.length ?? 0} suggestion)`)

    console.log('\nDOC-TYPE 3a E2E PASSED — all four branches + contractor-accept regression verified')
  } finally {
    await cleanup().catch((e) => console.error('[cleanup] failed:', e))
    console.log('cleanup done — nothing left behind')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
