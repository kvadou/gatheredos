'use server'

import { revalidatePath } from 'next/cache'
import { requireHome, requireUser } from '@/lib/supabase/home'
import { createAdminClient } from '@/lib/supabase/admin'
import { logUsage } from '@/lib/usage'
import { rateLimited } from '@/lib/rate-limit'
import { decryptToken, revokeGoogleToken } from '@/lib/gmail/oauth'

/**
 * Import contractor mail (ServiceTitan, Jobber, Housecall Pro, ...) into the
 * home's memory. Membership is proved here; the pipeline runs service-role
 * against that one home_id.
 */
export async function syncContractorEmailNow() {
  const { supabase, user } = await requireUser()
  const home = await requireHome()

  // Role gate: guests are read-only, and this writes care history to a home
  // they only have view access to. Same enforcement point as updateHome.
  const { data: membership } = await supabase
    .from('home_members')
    .select('role')
    .eq('home_id', home.id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (membership?.role !== 'owner' && membership?.role !== 'family') {
    return { success: false as const, error: 'Only editors can import mail into this home.' }
  }

  // Abuse cap: every batch spends Gmail quota and one Claude call per message.
  // The client loops, so the ceiling has to be well above a single sync.
  if (await rateLimited({ event: 'contractor_email_synced', userId: user.id, homeId: home.id, limit: 60, windowMinutes: 60 })) {
    return { success: false as const, error: 'That is a lot of importing for one hour. Try again a little later.' }
  }

  try {
    const { syncContractorEmail } = await import('@/lib/ingest/email-pipeline')
    // One batch per request: each message costs a Gmail fetch plus a Claude
    // call, and the client loops while `truncated` comes back true.
    const result = await syncContractorEmail({ userId: user.id, home, batchSize: 6 })
    await logUsage('contractor_email_synced', { ...result }, home.id)
    revalidatePath('/care')
    revalidatePath('/library')
    revalidatePath('/settings')
    return { success: true as const, ...result }
  } catch (err) {
    console.error('[gmail] contractor email sync failed:', err)
    return { success: false as const, error: 'Could not read your mailbox. Reconnect Gmail and try again.' }
  }
}

export async function disconnectGmail() {
  const { user } = await requireUser()
  const db = createAdminClient()
  const { data } = await db.from('external_connections' as never)
    .select('refresh_token_ciphertext').eq('user_id', user.id).eq('provider', 'gmail').maybeSingle() as { data: { refresh_token_ciphertext: string } | null }
  if (data) await revokeGoogleToken(decryptToken(data.refresh_token_ciphertext))
  await db.from('external_connections' as never).delete().eq('user_id', user.id).eq('provider', 'gmail')
  await logUsage('gmail_disconnected')
  revalidatePath('/settings')
  return { success: true }
}

