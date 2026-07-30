/**
 * Sub-phase 3b sonnet-reasoning verification — REAL model calls exercising the
 * four depth-2 passes in lib/ingest/reason.ts (docs/plans/2026-07-13-phase3-
 * engine-completion.md §3b):
 *
 *   a. forecastForItem   → a `forecast:<itemId>` insight (auto) or suggestion
 *                          (queued); headline names a $ range or a year.
 *   b. inspectionSummary → an `inspection:<fileId>` insight referencing
 *                          attention/roof (extractionId null tolerated).
 *   c. captureAskFacts   → a stated fact QUEUES (target home_facts, ask-fact:%),
 *                          writes ZERO home_facts rows directly (queue-only), and
 *                          a plain question adds no new ask-fact suggestions.
 *   d. onboardingCascade → a throwaway home: care tasks seeded per item, a
 *                          year-built timeline marker, ≤3 starter insights.
 *
 * Costs ~3 sonnet + ~2 haiku calls. Cleans up FULLY at start (crashed prior
 * runs) and end; the throwaway home is deleted (cascades everything under it).
 *
 * Usage: pnpm dlx tsx scripts/test-reasoning.ts
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

const TAG = 'reason-test'
// A fixed fake file id for the inspection insight dedupe (insights has no FK to files).
const FAKE_FILE_ID = '00000000-0000-0000-0000-0000000000fb'

async function main() {
  const { createAdminClient } = await import('../lib/supabase/admin')
  const { forecastForItem, inspectionSummary, captureAskFacts, onboardingCascade } = await import(
    '../lib/ingest/reason'
  )
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

  let throwawayHomeId: string | null = null

  // ---- full cleanup (runs at start against crashed prior runs, and at end) ----
  const cleanup = async () => {
    const { data: items } = await db.from('items').select('id').eq('home_id', homeId).like('name', `${TAG}%`)
    for (const it of items ?? []) {
      await db.from('insights').delete().eq('home_id', homeId).eq('dedupe_slug', `forecast:${it.id}`)
      await db.from('suggestions').delete().eq('home_id', homeId).eq('dedupe_key', `forecast:${it.id}`)
      await db.from('care_tasks').delete().eq('home_id', homeId).eq('item_id', it.id)
      await db.from('field_provenance').delete().eq('entity_table', 'items').eq('entity_id', it.id)
      await db.from('home_facts').delete().eq('home_id', homeId).eq('subject_id', it.id)
    }
    await db.from('items').delete().eq('home_id', homeId).like('name', `${TAG}%`)
    // inspection insight/suggestion (fixed fake file id)
    await db.from('insights').delete().eq('home_id', homeId).eq('dedupe_slug', `inspection:${FAKE_FILE_ID}`)
    await db.from('suggestions').delete().eq('home_id', homeId).eq('dedupe_key', `inspection:${FAKE_FILE_ID}`)
    // ask-fact suggestions on the dev home
    await db.from('suggestions').delete().eq('home_id', homeId).like('dedupe_key', 'ask-fact:%')
    // throwaway onboarding home → delete cascades items/tasks/timeline/insights/members
    if (throwawayHomeId) {
      await db.from('homes').delete().eq('id', throwawayHomeId)
      throwawayHomeId = null
    } else {
      const { data: homes } = await db.from('homes').select('id').eq('created_by', devUserId).eq('name', `${TAG} Home`)
      for (const h of homes ?? []) await db.from('homes').delete().eq('id', h.id)
    }
  }
  await cleanup()

  try {
    // ============================ a. FORECAST =========================
    console.log('\n=== a. forecastForItem (water heater, installed 8y ago) ===')
    const installed = new Date()
    installed.setUTCFullYear(installed.getUTCFullYear() - 8)
    const installedOn = installed.toISOString().slice(0, 10)
    const { data: item, error: itErr } = await db
      .from('items')
      .insert({ home_id: homeId, name: `${TAG} Water Heater`, category: 'system', status: 'good', installed_on: installedOn })
      .select('id')
      .single()
    if (itErr || !item) throw itErr ?? new Error('forecast item insert failed')

    await forecastForItem(db, homeId, item.id)
    const { data: fIns } = await db
      .from('insights')
      .select('headline, detail')
      .eq('home_id', homeId)
      .eq('dedupe_slug', `forecast:${item.id}`)
      .maybeSingle()
    const { data: fSug } = await db
      .from('suggestions')
      .select('summary, payload')
      .eq('home_id', homeId)
      .eq('dedupe_key', `forecast:${item.id}`)
      .eq('status', 'pending')
      .maybeSingle()
    assert(fIns || fSug, 'forecast landed as an insight (auto) or a suggestion (queued)')
    const fHead = fIns?.headline ?? (fSug?.payload as Record<string, unknown>)?.headline ?? fSug?.summary
    assert(/\$|\b20\d{2}\b/.test(String(fHead ?? '')), 'forecast headline names a $ range or a year')
    console.log(`   forecast: "${fHead}"`)

    // ============================ b. INSPECTION SUMMARY ===============
    console.log('\n=== b. inspectionSummary (3 findings, roof HIGH) ===')
    const findings = [
      { system: 'Roof', condition: 'Missing and lifted shingles on the south slope', severity: 'high', recommendation: 'Have a roofer repair before the next storm' },
      { system: 'Gutters', condition: 'Loose downspout at the NE corner', severity: 'medium', recommendation: 'Re-secure the downspout' },
      { system: 'Water heater', condition: 'Minor corrosion at the base', severity: 'low', recommendation: null },
    ]
    await inspectionSummary(db, homeId, FAKE_FILE_ID, null, findings)
    const { data: iIns } = await db
      .from('insights')
      .select('headline')
      .eq('home_id', homeId)
      .eq('dedupe_slug', `inspection:${FAKE_FILE_ID}`)
      .maybeSingle()
    const { data: iSug } = await db
      .from('suggestions')
      .select('summary, payload')
      .eq('home_id', homeId)
      .eq('dedupe_key', `inspection:${FAKE_FILE_ID}`)
      .eq('status', 'pending')
      .maybeSingle()
    assert(iIns || iSug, 'inspection summary landed (auto or queued)')
    const iHead = iIns?.headline ?? (iSug?.payload as Record<string, unknown>)?.headline ?? iSug?.summary
    assert(/attention|roof|urgent/i.test(String(iHead ?? '')), 'summary references attention/roof/urgent')
    console.log(`   summary: "${iHead}"`)

    // ============================ c. ASK FACT-CAPTURE =================
    console.log('\n=== c. captureAskFacts (queue-only + empty-bias) ===')
    const { count: hfBefore } = await db
      .from('home_facts')
      .select('id', { count: 'exact', head: true })
      .eq('home_id', homeId)
    await captureAskFacts(homeId, devUserId, 'My roof is a 2015 GAF architectural shingle roof')
    const { data: askSug } = await db
      .from('suggestions')
      .select('id, summary')
      .eq('home_id', homeId)
      .eq('target', 'home_facts')
      .eq('status', 'pending')
      .like('dedupe_key', 'ask-fact:%')
    assert((askSug?.length ?? 0) >= 1, `≥1 pending ask-fact home_facts suggestion (got ${askSug?.length ?? 0})`)
    for (const s of askSug ?? []) console.log(`   queued fact: "${s.summary}"`)
    const { count: hfAfter } = await db
      .from('home_facts')
      .select('id', { count: 'exact', head: true })
      .eq('home_id', homeId)
    assert(hfAfter === hfBefore, `ZERO home_facts written directly — queue-only guarantee (before ${hfBefore}, after ${hfAfter})`)

    const before = askSug?.length ?? 0
    await captureAskFacts(homeId, devUserId, 'when should I flush my water heater?')
    const { data: askSug2 } = await db
      .from('suggestions')
      .select('id')
      .eq('home_id', homeId)
      .eq('target', 'home_facts')
      .eq('status', 'pending')
      .like('dedupe_key', 'ask-fact:%')
    assert((askSug2?.length ?? 0) === before, `a question adds no new ask-fact suggestions — empty-bias (was ${before}, now ${askSug2?.length ?? 0})`)

    // ============================ d. ONBOARDING CASCADE ===============
    console.log('\n=== d. onboardingCascade (throwaway home) ===')
    const { data: thome, error: hErr } = await db
      .from('homes')
      .insert({
        created_by: devUserId,
        name: `${TAG} Home`,
        city: 'Denver',
        state: 'CO',
        year_built: 1998,
        property_type: 'single_family',
        sqft: 2100,
        features: ['garage', 'deck'],
        goals: ['save_money'],
      })
      .select('id')
      .single()
    if (hErr || !thome) throw hErr ?? new Error('throwaway home insert failed')
    throwawayHomeId = thome.id // on_home_created trigger adds the dev user as owner

    await db.from('items').insert([
      { home_id: throwawayHomeId, name: 'Water Heater', category: 'system', status: 'good', installed_on: '2016-01-01' },
      { home_id: throwawayHomeId, name: 'Furnace', category: 'system', status: 'good' },
    ])

    await onboardingCascade(throwawayHomeId)

    const { data: ct } = await db.from('care_tasks').select('id').eq('home_id', throwawayHomeId)
    assert((ct?.length ?? 0) >= 1, `care_tasks seeded for onboarding items (got ${ct?.length ?? 0})`)
    const { data: tl } = await db
      .from('timeline_events')
      .select('id')
      .eq('home_id', throwawayHomeId)
      .eq('year', 1998)
      .eq('title', 'Home built')
    assert((tl?.length ?? 0) === 1, `year-built timeline marker seeded (got ${tl?.length ?? 0})`)
    const { data: oIns } = await db.from('insights').select('id, headline').eq('home_id', throwawayHomeId).like('dedupe_slug', 'onboarding:%')
    const { data: oSug } = await db.from('suggestions').select('id').eq('home_id', throwawayHomeId).like('dedupe_key', 'onboarding:%')
    const starterCount = (oIns?.length ?? 0) + (oSug?.length ?? 0)
    assert(starterCount >= 1 && starterCount <= 3, `1-3 starter insights (auto+queued) — got ${starterCount}`)
    for (const i of oIns ?? []) console.log(`   starter insight: "${i.headline}"`)

    console.log('\nREASONING 3b E2E PASSED — forecast, inspection summary, ask fact-capture, onboarding cascade verified')
  } finally {
    await cleanup().catch((e) => console.error('[cleanup] failed:', e))
    console.log('cleanup done — nothing left behind')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
