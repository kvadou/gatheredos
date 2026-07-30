'use server'

import { revalidatePath } from 'next/cache'
import { requireHome, requireUser } from '@/lib/supabase/home'
import { createAdminClient } from '@/lib/supabase/admin'
import { logUsage } from '@/lib/usage'
import { decryptToken, revokeGoogleToken } from '@/lib/gmail/oauth'

/**
 * Import contractor mail (ServiceTitan, Jobber, Housecall Pro, ...) into the
 * home's memory. Membership is proved here; the pipeline runs service-role
 * against that one home_id.
 */
export async function syncContractorEmailNow() {
  const { user } = await requireUser()
  const home = await requireHome()
  try {
    const { syncContractorEmail } = await import('@/lib/ingest/email-pipeline')
    const result = await syncContractorEmail({ userId: user.id, home })
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

