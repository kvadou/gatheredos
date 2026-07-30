import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !anon || !serviceRole) throw new Error('Supabase environment is incomplete')

const admin = createClient(url, serviceRole, { auth: { persistSession: false } })
const household = createClient(url, anon, { auth: { persistSession: false } })
let responseId: string | undefined
let entitlementId: string | undefined

async function main() {
  const email = process.env.SERVICE_TEST_EMAIL ?? 'dev@gatheredos.local'
  const password = process.env.SERVICE_TEST_PASSWORD ?? 'gatheredos-dev-2026!'
  const { data: login, error: loginError } = await household.auth.signInWithPassword({ email, password })
  if (loginError) throw loginError
  const userId = login.user.id
  const { data: membership, error: membershipError } = await household.from('home_members').select('home_id').limit(1).single()
  if (membershipError) throw membershipError

  const { data: response, error: responseError } = await household.from('monetization_research_responses').insert({
    user_id: userId, home_id: membership.home_id, prompt_key: 'verification', plan: 'plus', price_cents: 9900,
    billing_period: 'year', response: 'maybe', activated: true, surface: 'web',
  }).select('id').single()
  if (responseError) throw responseError
  responseId = response.id

  const forbidden = await household.from('account_entitlements').insert({ user_id: userId, plan: 'plus', source: 'founder' })
  if (!forbidden.error) throw new Error('A household user could grant their own entitlement')

  const { data: entitlement, error: entitlementError } = await admin.from('account_entitlements').upsert({
    user_id: userId, plan: 'founding', status: 'active', source: 'founder',
  }, { onConflict: 'user_id' }).select('id').single()
  if (entitlementError) throw entitlementError
  entitlementId = entitlement.id
  const { data: visible, error: visibleError } = await household.from('account_entitlements').select('plan,status').eq('id', entitlement.id).single()
  if (visibleError || visible.plan !== 'founding' || visible.status !== 'active') throw visibleError ?? new Error('Own entitlement was not readable')

  console.log(JSON.stringify({ passed: true, preferenceCapture: true, selfGrantBlocked: true, ownEntitlementReadable: true }, null, 2))
}

main().finally(async () => {
  if (responseId) await admin.from('monetization_research_responses').delete().eq('id', responseId)
  if (entitlementId) await admin.from('account_entitlements').delete().eq('id', entitlementId)
  await household.auth.signOut()
}).catch((error) => {
  console.error(error)
  process.exitCode = 1
})

