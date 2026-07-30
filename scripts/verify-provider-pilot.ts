import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !anon || !serviceRole) throw new Error('Supabase environment is incomplete')

const admin = createClient(url, serviceRole, { auth: { persistSession: false } })
const household = createClient(url, anon, { auth: { persistSession: false } })
let providerId: string | undefined

async function main() {
  const email = process.env.SERVICE_TEST_EMAIL ?? 'dev@gatheredos.local'
  const password = process.env.SERVICE_TEST_PASSWORD ?? 'gatheredos-dev-2026!'
  const { data: login, error: loginError } = await household.auth.signInWithPassword({ email, password })
  if (loginError) throw loginError
  const userId = login.user.id
  const suffix = crypto.randomUUID().slice(0, 8)

  const { data: provider, error: providerError } = await admin.from('provider_businesses').insert({
    legal_name: `Pilot Verification ${suffix}`, display_name: `Pilot Verification ${suffix}`,
    status: 'active', services: ['appliance_repair'], brands: ['ge appliances'],
    service_area: { zipCodes: ['55401'] }, booking_modes: ['phone'],
  }).select('id').single()
  if (providerError) throw providerError
  providerId = provider.id

  const now = new Date()
  const { error: verificationError } = await admin.from('provider_verifications').insert([
    { provider_id: provider.id, kind: 'contact', status: 'verified', value: 'Test contact', source: 'direct_confirmation', verified_at: now.toISOString(), verified_by: userId },
    { provider_id: provider.id, kind: 'service_area', status: 'verified', value: '55401', source: 'direct_confirmation', verified_at: now.toISOString(), verified_by: userId },
    { provider_id: provider.id, kind: 'insurance', status: 'verified', value: 'Test policy', source: 'direct_confirmation', verified_at: now.toISOString(), expires_at: new Date(now.getTime() + 30 * 86400000).toISOString(), verified_by: userId },
  ])
  if (verificationError) throw verificationError

  const { error: availabilityError } = await admin.from('provider_availability').insert({
    provider_id: provider.id, status: 'accepting', source: 'operator_call', confirmed_at: now.toISOString(),
    valid_until: new Date(now.getTime() + 72 * 3600000).toISOString(), confirmed_by: userId,
    typical_response_minutes: 30, capacity_notes: 'Verification fixture',
  })
  if (availabilityError) throw availabilityError
  const { error: simulationError } = await admin.from('provider_pilot_simulations').insert({
    provider_id: provider.id, scenario: 'routine_appliance', result: 'passed', response_minutes: 12,
    notes: 'Verified exact availability, response, and booking-change handling.', performed_by: userId,
  })
  if (simulationError) throw simulationError

  const [checks, pulse, simulation, householdAvailability, householdSimulation] = await Promise.all([
    admin.from('provider_verifications').select('kind,expires_at').eq('provider_id', provider.id).eq('status', 'verified'),
    admin.from('provider_availability').select('status,valid_until').eq('provider_id', provider.id).single(),
    admin.from('provider_pilot_simulations').select('result').eq('provider_id', provider.id).eq('result', 'passed'),
    household.from('provider_availability').select('id').eq('provider_id', provider.id),
    household.from('provider_pilot_simulations').select('id').eq('provider_id', provider.id),
  ])
  if (checks.error || pulse.error || simulation.error) throw checks.error ?? pulse.error ?? simulation.error
  const kinds = new Set(checks.data.filter((row) => !row.expires_at || new Date(row.expires_at) > now).map((row) => row.kind))
  const ready = ['contact', 'service_area', 'insurance'].every((kind) => kinds.has(kind))
    && ['accepting', 'limited'].includes(pulse.data.status) && new Date(pulse.data.valid_until) > now
    && simulation.data.length > 0
  if (!ready) throw new Error('Provider did not satisfy the pilot readiness gate')
  if (householdAvailability.error || householdAvailability.data.length !== 0) throw new Error('Availability operations data leaked through RLS')
  if (householdSimulation.error || householdSimulation.data.length !== 0) throw new Error('Simulation operations data leaked through RLS')

  console.log(JSON.stringify({ passed: true, readinessGate: true, expiringAvailability: true, householdRLS: true }, null, 2))
}

main().finally(async () => {
  if (providerId) await admin.from('provider_businesses').delete().eq('id', providerId)
  await household.auth.signOut()
}).catch((error) => {
  console.error(error)
  process.exitCode = 1
})
