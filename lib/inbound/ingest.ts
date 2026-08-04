// No 'server-only' marker: it is what makes this module unimportable from a
// tsx script, and the end-to-end check in scripts/test-inbound.ts is the only
// thing that proves unwrapping rescues the identity path for real. Same
// resolution as lib/gmail/message.ts. Nothing here is a secret — the
// service-role client it uses is guarded at its own module.
import { createAdminClient } from '@/lib/supabase/admin'
import { applyCascade } from '@/lib/ingest/pipeline'
import { fileAttachments } from '@/lib/ingest/attachments'
import { extractEmail, vendorFor } from '@/lib/ingest/email'
import { header, senderEmail, senderName } from '@/lib/gmail/message'
import { adaptInbound, type InboundEmail } from '@/lib/inbound/message'
import { localPartOf } from '@/lib/inbound/address'
import type { Database } from '@/lib/supabase/database.types'

/**
 * Ingest one forwarded message.
 *
 * Deliberately the same path as the Gmail sync from `extractEmail` onward: same
 * prompt, same identity-confidence rules, same proposal routing, same cascade,
 * same review queue. Forwarding is a delivery mechanism, not a second product,
 * and the rules that took real mail to discover should not be re-derived here.
 *
 * Runs service-role. The only thing that authorizes a write is the secret token
 * in the recipient address, so resolving that token to a home is the security
 * boundary and happens before anything else.
 */

type HomeRow = Database['public']['Tables']['homes']['Row']

export type InboundResult =
  | { status: 'ignored'; reason: string }
  | { status: 'duplicate'; homeId: string }
  | { status: 'skipped'; homeId: string; reason: string }
  | { status: 'done'; homeId: string; company: string | null; attachments: number }

/**
 * A forwarded mailbox is a firehose if someone learns the address. Every
 * message costs a Claude call, so cap what one home can spend per hour. The
 * cap is generous: a first-time user forwarding a year of history in one sitting
 * is the behaviour we want.
 */
const HOURLY_LIMIT = 120

export async function ingestInboundEmail(email: InboundEmail): Promise<InboundResult> {
  const db = createAdminClient()

  const home = await resolveHome(db, email.to)
  if (!home) return { status: 'ignored', reason: 'no home matches the recipient address' }

  // Layer-1 dedupe: providers retry webhooks, and a retry must not write a
  // second visit. Unique on (home_id, provider, external_id).
  const { data: seen } = await db
    .from('imported_messages' as never)
    .select('status')
    .eq('home_id', home.id)
    .eq('provider', 'forward')
    .eq('external_id', email.messageId)
    .maybeSingle() as { data: { status: string } | null }
  if (seen && seen.status !== 'failed') return { status: 'duplicate', homeId: home.id }

  const { count } = await db
    .from('imported_messages' as never)
    .select('id', { count: 'exact', head: true })
    .eq('home_id', home.id)
    .eq('provider', 'forward')
    .gte('created_at', new Date(Date.now() - 3_600_000).toISOString()) as { count: number | null }
  if ((count ?? 0) >= HOURLY_LIMIT) {
    return { status: 'ignored', reason: 'hourly limit reached for this home' }
  }

  const adapted = adaptInbound(email)
  const msg = adapted.message
  const from = header(msg, 'from')
  const fromEmail = senderEmail(from)

  const base = {
    home_id: home.id,
    user_id: home.created_by,
    provider: 'forward',
    external_id: email.messageId,
    vendor: vendorFor(fromEmail),
    from_email: fromEmail,
    from_name: senderName(from).slice(0, 200) || null,
    subject: header(msg, 'subject').slice(0, 500) || null,
    sent_at: msg.internalDate ? new Date(Number(msg.internalDate)).toISOString() : null,
  }
  await upsertLog(db, { ...base, status: 'processing', error: null })

  try {
    const { envelope, extract } = await extractEmail(db, msg, home)

    const { data: extraction, error: exError } = await db
      .from('extractions')
      .insert({
        home_id: home.id,
        file_id: null,
        source_kind: 'email',
        source_ref: email.messageId,
        status: 'done',
        doc_type: envelope.docType,
        raw_text: envelope.rawText,
        data: {
          proposals: envelope.proposals,
          scope_status: envelope.scopeStatus,
          scope_reason: envelope.scopeReason,
          email: extract,
          forwarded: adapted.unwrapped,
        },
        confidence: envelope.confidence,
        model: envelope.model,
      } as never)
      .select('id')
      .single()
    if (exError || !extraction) throw exError ?? new Error('extraction insert failed')

    if (envelope.scopeStatus !== 'in_scope' || envelope.proposals.length === 0) {
      await upsertLog(db, {
        ...base,
        status: 'skipped',
        skip_reason: envelope.scopeReason ?? 'nothing to record',
        extraction_id: extraction.id,
        service_address: extract.service_address?.slice(0, 300) ?? null,
      })
      return { status: 'skipped', homeId: home.id, reason: envelope.scopeReason ?? 'nothing to record' }
    }

    await applyCascade(
      db,
      {
        homeId: home.id,
        extractionId: extraction.id,
        sourceKey: `forward:${email.messageId}`,
        pipeline: 'ingestInboundEmail',
      },
      envelope,
      1,
    )

    const fileIds = await fileAttachments({
      db,
      homeId: home.id,
      messageId: email.messageId,
      source: 'forward',
      attachments: adapted.attachments.map((att) => ({
        filename: att.filename,
        mimeType: att.contentType,
        bytes: async () => att.content,
      })),
    })

    await upsertLog(db, {
      ...base,
      status: 'done',
      skip_reason: null,
      extraction_id: extraction.id,
      proposal_count: envelope.proposals.length,
      attachment_file_ids: fileIds,
      service_address: extract.service_address?.slice(0, 300) ?? null,
    })
    return {
      status: 'done',
      homeId: home.id,
      company: extract.company?.trim() || null,
      attachments: fileIds.length,
    }
  } catch (err) {
    console.error(`[inbound] message ${email.messageId} failed:`, err)
    await upsertLog(db, { ...base, status: 'failed', error: String(err).slice(0, 500) })
    throw err
  }
}

/**
 * The security boundary: the secret local-part of the recipient address is the
 * only thing that says which home may be written to. Checked against every
 * recipient, since the address is often in Cc or Bcc rather than To.
 */
async function resolveHome(
  db: ReturnType<typeof createAdminClient>,
  recipients: string[],
): Promise<HomeRow | null> {
  for (const recipient of recipients) {
    const token = localPartOf(recipient)
    if (!token) continue
    const { data: row } = await db
      .from('home_inbound_addresses')
      .select('home_id')
      .eq('token', token)
      .maybeSingle()
    if (!row) continue
    const { data } = await db.from('homes').select('*').eq('id', row.home_id).maybeSingle()
    if (data) return data as HomeRow
  }
  return null
}

async function upsertLog(
  db: ReturnType<typeof createAdminClient>,
  row: Record<string, unknown>,
): Promise<void> {
  const { error } = await db
    .from('imported_messages' as never)
    .upsert(row as never, { onConflict: 'home_id,provider,external_id' } as never)
  if (error) throw error
}
