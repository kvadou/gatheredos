import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !anon || !serviceRole) throw new Error('Supabase environment is incomplete')

const admin = createClient(url, serviceRole, { auth: { persistSession: false } })
const household = createClient(url, anon, { auth: { persistSession: false } })
const email = process.env.SERVICE_TEST_EMAIL ?? 'dev@gatheredos.local'
const password = process.env.SERVICE_TEST_PASSWORD ?? 'gatheredos-dev-2026!'

const inserted: { caseId?: string; providerId?: string; careEventId?: string } = {}

async function main() {
  const { data: login, error: loginError } = await household.auth.signInWithPassword({ email, password })
  if (loginError) throw loginError

  const userId = login.user.id
  const { data: membership, error: membershipError } = await admin.from('home_members')
    .select('home_id').eq('user_id', userId).limit(1).single()
  if (membershipError) throw membershipError

  const { data: item, error: itemError } = await admin.from('items')
    .select('id').eq('home_id', membership.home_id).limit(1).single()
  if (itemError) throw itemError

  const suffix = crypto.randomUUID().slice(0, 8)
  const { data: provider, error: providerError } = await admin.from('provider_businesses').insert({
    legal_name: `Completion Verification ${suffix}`,
    display_name: `Completion Verification ${suffix}`,
    status: 'active',
  }).select('id').single()
  if (providerError) throw providerError
  inserted.providerId = provider.id

  const { data: serviceCase, error: caseError } = await admin.from('service_cases').insert({
    home_id: membership.home_id,
    item_id: item.id,
    opened_by: userId,
    status: 'confirmed',
    symptom_summary: 'Automated completion verification',
    sharing_status: 'approved',
  }).select('id').single()
  if (caseError) throw caseError
  inserted.caseId = serviceCase.id

  const { data: providerRequest, error: requestError } = await admin.from('provider_requests').insert({
    home_id: membership.home_id,
    service_case_id: serviceCase.id,
    provider_id: provider.id,
    status: 'responded',
  }).select('id').single()
  if (requestError) throw requestError

  const start = new Date(Date.now() - 2 * 60 * 60 * 1000)
  const end = new Date(Date.now() - 60 * 60 * 1000)
  const { data: offer, error: offerError } = await admin.from('service_offers').insert({
    home_id: membership.home_id,
    service_case_id: serviceCase.id,
    provider_request_id: providerRequest.id,
    status: 'selected',
    window_start: start.toISOString(),
    window_end: end.toISOString(),
    confirmed_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  }).select('id').single()
  if (offerError) throw offerError

  const { data: authorization, error: authorizationError } = await admin.from('service_authorizations').insert({
    home_id: membership.home_id,
    service_case_id: serviceCase.id,
    user_id: userId,
    kind: 'book_appointment',
    scope: { verification: true },
    scope_hash: `verification-${suffix}`,
    status: 'consumed',
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    consumed_at: new Date().toISOString(),
  }).select('id').single()
  if (authorizationError) throw authorizationError

  const { data: appointment, error: appointmentError } = await admin.from('service_appointments').insert({
    home_id: membership.home_id,
    service_case_id: serviceCase.id,
    provider_id: provider.id,
    offer_id: offer.id,
    authorization_id: authorization.id,
    status: 'confirmed',
    window_start: start.toISOString(),
    window_end: end.toISOString(),
    confirmed_at: start.toISOString(),
  }).select('id').single()
  if (appointmentError) throw appointmentError

  const payload = {
    p_case_id: serviceCase.id,
    p_resolution: 'resolved',
    p_work_performed: 'Verified completion transaction',
    p_final_cost: 125,
    p_parts_summary: 'Verification part',
    p_labor_warranty: '90 days',
    p_invoice_file_id: null,
    p_provider_timeliness: 5,
    p_provider_communication: 5,
    p_private_feedback: 'Automated live verification',
    p_occurred_on: new Date().toISOString().slice(0, 10),
  }
  const first = await household.rpc('record_household_service_outcome', payload)
  if (first.error) throw first.error
  inserted.careEventId = first.data.care_event_id

  const second = await household.rpc('record_household_service_outcome', payload)
  if (second.error) throw second.error
  if (first.data.id !== second.data.id) throw new Error('Outcome retry was not idempotent')

  const [outcomes, events, finalCase, finalAppointment] = await Promise.all([
    admin.from('service_outcomes').select('id').eq('service_case_id', serviceCase.id),
    admin.from('care_events').select('id').eq('id', first.data.care_event_id),
    admin.from('service_cases').select('status').eq('id', serviceCase.id).single(),
    admin.from('service_appointments').select('status').eq('id', appointment.id).single(),
  ])
  if (outcomes.error || outcomes.data.length !== 1) throw outcomes.error ?? new Error('Expected one outcome')
  if (events.error || events.data.length !== 1) throw events.error ?? new Error('Expected one care event')
  if (finalCase.error || finalCase.data.status !== 'completed') throw finalCase.error ?? new Error('Case did not complete')
  if (finalAppointment.error || finalAppointment.data.status !== 'completed') throw finalAppointment.error ?? new Error('Appointment did not complete')

  console.log(JSON.stringify({
    passed: true,
    outcomeId: first.data.id,
    idempotentRetry: true,
    careEventCreated: true,
    caseStatus: finalCase.data.status,
    appointmentStatus: finalAppointment.data.status,
  }, null, 2))
}

main().finally(async () => {
  if (inserted.caseId) await admin.from('service_cases').delete().eq('id', inserted.caseId)
  if (inserted.careEventId) await admin.from('care_events').delete().eq('id', inserted.careEventId)
  if (inserted.providerId) await admin.from('provider_businesses').delete().eq('id', inserted.providerId)
  await household.auth.signOut()
}).catch((error) => {
  console.error(error)
  process.exitCode = 1
})
