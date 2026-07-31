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
    const result = await syncContractorEmail({ userId: user.id, home, batchSize: 6, withinYears: 10 })
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

export type ImportLogEntry = {
  id: string
  status: string
  skipReason: string | null
  from: string
  subject: string | null
  sentAt: string | null
  recorded: number
  attachments: number
}

/**
 * What the importer actually read, most recent mail first.
 *
 * Without this the only record of a run lives in `imported_messages`, readable
 * by SQL alone — so a wrongly-imported contractor (the failure mode that
 * matters most here) is invisible to the person who would recognize it. Read
 * through the user's own client: RLS scopes the log to homes they belong to.
 */
export async function listImportLog(limit = 40): Promise<ImportLogEntry[]> {
  const { supabase } = await requireUser()
  const home = await requireHome()

  const { data } = await supabase
    .from('imported_messages' as never)
    .select('id,status,skip_reason,from_name,from_email,subject,sent_at,proposal_count,attachment_file_ids')
    .eq('home_id', home.id)
    .order('sent_at', { ascending: false, nullsFirst: false })
    .limit(limit) as {
      data: {
        id: string
        status: string
        skip_reason: string | null
        from_name: string | null
        from_email: string | null
        subject: string | null
        sent_at: string | null
        proposal_count: number
        attachment_file_ids: string[] | null
      }[] | null
    }

  return (data ?? []).map((row) => ({
    id: row.id,
    status: row.status,
    skipReason: row.skip_reason,
    from: row.from_name || row.from_email || 'Unknown sender',
    subject: row.subject,
    sentAt: row.sent_at,
    recorded: row.proposal_count,
    attachments: row.attachment_file_ids?.length ?? 0,
  }))
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

