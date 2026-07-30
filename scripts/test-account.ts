/**
 * deleteUserData verification — real DB + real storage, ZERO model calls.
 *
 * Scenario A (sole owner): throwaway user owns a home with one item and one file
 *   (a real tiny object uploaded to the bucket). After deleteUserData:
 *     home gone, item gone (cascade), storage object gone, auth user gone,
 *     profile row gone (auth-user cascade).
 * Scenario B (shared): two throwaway users co-own a home. deleteUserData on the
 *   first must LEAVE the home standing — only user 1's membership and auth user
 *   go; user 2 stays owner and homes.created_by is repointed to them.
 *
 * Uses unique timestamped emails so runs never collide; sweeps any leftover
 * trust-test users at start and end.
 *
 * Usage: NODE_OPTIONS='--conditions=react-server' pnpm dlx tsx scripts/test-account.ts
 * (the react-server condition no-ops lib/account-admin.ts's `import 'server-only'`
 * guard, which otherwise throws outside Next — that throw is the guard working)
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

const PASSWORD = 'trust-test-pw-8x24!'
const EMAIL_RE = /^trust-test-.*@gatheredos\.local$/

async function main() {
  const { createAdminClient } = await import('../lib/supabase/admin')
  const { deleteUserData } = await import('../lib/account-admin')
  const db = createAdminClient()

  const assert = (cond: unknown, msg: string) => {
    if (!cond) throw new Error(`ASSERT FAILED: ${msg}`)
    console.log(`ok: ${msg}`)
  }

  // Best-effort sweep of leftovers from crashed prior runs.
  const sweep = async () => {
    const { data } = await db.auth.admin.listUsers({ perPage: 200 })
    for (const u of data?.users ?? []) {
      if (u.email && EMAIL_RE.test(u.email)) {
        await deleteUserData(u.id).catch((e) => console.error('[sweep]', u.email, e))
      }
    }
  }

  const createUser = async (tag: string) => {
    const email = `trust-test-${tag}-${Date.now()}@gatheredos.local`
    const { data, error } = await db.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    })
    if (error || !data.user) throw error ?? new Error('createUser failed')
    return data.user.id
  }

  const createHome = async (ownerId: string, name: string) => {
    const { data, error } = await db
      .from('homes')
      .insert({ name, created_by: ownerId })
      .select('id, created_by')
      .single()
    if (error || !data) throw error ?? new Error('home insert failed')
    // on_home_created trigger inserts the creator as owner — verify, add if absent.
    const { data: mem } = await db
      .from('home_members')
      .select('user_id')
      .eq('home_id', data.id)
      .eq('user_id', ownerId)
      .maybeSingle()
    if (!mem) {
      await db.from('home_members').insert({ home_id: data.id, user_id: ownerId, role: 'owner' })
    }
    return data.id
  }

  await sweep()

  try {
    // ==================== Scenario A: sole owner ====================
    console.log('\n=== Scenario A: sole owner deletes account ===')
    const userA = await createUser('a')
    const homeA = await createHome(userA, 'trust-test home A')

    const { data: item, error: itemErr } = await db
      .from('items')
      .insert({ home_id: homeA, name: 'trust-test furnace', category: 'system' })
      .select('id')
      .single()
    if (itemErr || !item) throw itemErr ?? new Error('item insert failed')

    // one flat (web-style) + one NESTED (iOS uploads to {homeId}/receipts/...) —
    // the nested one is the regression case for the recursive storage cleanup.
    const storagePath = `${homeA}/${crypto.randomUUID()}-trust-test.txt`
    const nestedPath = `${homeA}/receipts/${crypto.randomUUID()}-trust-test.jpg`
    for (const [p, ct] of [
      [storagePath, 'text/plain'],
      [nestedPath, 'image/jpeg'],
    ] as const) {
      const { error: upErr } = await db.storage
        .from('home-files')
        .upload(p, new Blob(['trust-test payload']), { contentType: ct })
      if (upErr) throw upErr
    }
    const { error: fileErr } = await db.from('files').insert([
      { home_id: homeA, name: 'trust-test.txt', storage_path: storagePath, type: 'document' },
      { home_id: homeA, name: 'trust-test.jpg', storage_path: nestedPath, type: 'receipt' },
    ])
    if (fileErr) throw fileErr

    // sanity: flat object + receipts/ folder both visible before deletion
    const preList = await db.storage.from('home-files').list(homeA)
    assert((preList.data?.length ?? 0) === 2, 'storage entries present before deletion (file + folder)')

    await deleteUserData(userA)

    const homeGone = await db.from('homes').select('id').eq('id', homeA).maybeSingle()
    assert(!homeGone.data, 'home row deleted')

    const itemsGone = await db.from('items').select('id').eq('home_id', homeA)
    assert((itemsGone.data?.length ?? 0) === 0, 'items cascade-deleted with home')

    const postList = await db.storage.from('home-files').list(homeA)
    assert((postList.data?.length ?? 0) === 0, 'storage objects removed (flat)')
    const postNested = await db.storage.from('home-files').list(`${homeA}/receipts`)
    assert((postNested.data?.length ?? 0) === 0, 'nested receipts/ objects removed (iOS path regression)')

    const authGone = await db.auth.admin.getUserById(userA)
    assert(authGone.error || !authGone.data.user, 'auth user deleted')

    const profGone = await db.from('profiles').select('id').eq('id', userA).maybeSingle()
    assert(!profGone.data, 'profile row deleted (auth-user cascade)')

    // ==================== Scenario B: shared home survives ====================
    console.log('\n=== Scenario B: shared home survives, one owner leaves ===')
    const userB1 = await createUser('b1')
    const userB2 = await createUser('b2')
    const homeB = await createHome(userB1, 'trust-test home B')
    // Add user 2 as a second owner (invites can't grant owner, so insert directly).
    const { error: coErr } = await db
      .from('home_members')
      .insert({ home_id: homeB, user_id: userB2, role: 'owner' })
    if (coErr) throw coErr

    await deleteUserData(userB1)

    const homeSurvives = await db.from('homes').select('id, created_by').eq('id', homeB).maybeSingle()
    assert(!!homeSurvives.data, 'shared home SURVIVES after co-owner deletes account')
    assert(homeSurvives.data?.created_by === userB2, 'homes.created_by repointed to remaining owner')

    const b1Mem = await db
      .from('home_members')
      .select('user_id')
      .eq('home_id', homeB)
      .eq('user_id', userB1)
      .maybeSingle()
    assert(!b1Mem.data, "leaving user's membership removed")

    const b2Mem = await db
      .from('home_members')
      .select('user_id')
      .eq('home_id', homeB)
      .eq('user_id', userB2)
      .maybeSingle()
    assert(!!b2Mem.data, 'remaining owner keeps membership')

    const b1AuthGone = await db.auth.admin.getUserById(userB1)
    assert(b1AuthGone.error || !b1AuthGone.data.user, 'leaving user auth deleted')

    const b1ProfGone = await db.from('profiles').select('id').eq('id', userB1).maybeSingle()
    assert(!b1ProfGone.data, 'leaving user profile deleted')

    // Teardown: user 2 is now sole owner → deleting them erases home B too.
    await deleteUserData(userB2)
    const homeBGone = await db.from('homes').select('id').eq('id', homeB).maybeSingle()
    assert(!homeBGone.data, 'home B erased when last owner deleted (teardown)')

    console.log('\nACCOUNT-DELETION E2E PASSED — sole-owner erase + shared-home survival verified')
  } finally {
    await sweep().catch((e) => console.error('[sweep] failed:', e))
    console.log('sweep done — nothing left behind')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
