import { createAdminClient } from '@/lib/supabase/admin'
import { decryptToken } from '@/lib/gmail/oauth'
import { accessTokenFrom, getAttachment, getMessage, listMessageIds } from '@/lib/gmail/client'
import { header, ingestableAttachments, senderEmail, senderName } from '@/lib/gmail/message'
import { applyCascade } from '@/lib/ingest/pipeline'
import { fileAttachments } from '@/lib/ingest/attachments'
import { extractEmail, gmailQuery, vendorFor, wideQuery } from '@/lib/ingest/email'
import type { Database } from '@/lib/supabase/database.types'

/**
 * Contractor-email sync. Reads the connected mailbox for mail from
 * field-service platforms, turns each message into home memory through the
 * shared ingest cascade, and files any PDF invoice attached to it as a real
 * document so the existing extraction engine reads it too.
 *
 * Runs with the service-role client. Every write is scoped to the home_id the
 * caller already proved membership of — it never trusts an id it wasn't handed.
 */

type Admin = ReturnType<typeof createAdminClient>
type HomeRow = Database['public']['Tables']['homes']['Row']

/**
 * Caps per run: one Claude call per un-imported message, so these are the cost
 * ceiling. Platform mail is high-signal and gets the bigger budget; the wide
 * pass is speculative, so it gets less.
 */
const PLATFORM_LIMIT = 40
const WIDE_LIMIT = 25

export type SyncResult = {
  scanned: number
  imported: number
  skipped: number
  failed: number
  attachments: number
  /** Distinct contractors the run recorded or queued. */
  contractors: string[]
  /** More un-imported mail is waiting — call again to continue. */
  truncated: boolean
}

export async function syncContractorEmail(input: {
  userId: string
  home: HomeRow
  limit?: number
  withinYears?: number
  /** Also scan for contractors with no field-service platform. Default true. */
  wide?: boolean
  /** Process at most this many new messages, so one call fits one request. */
  batchSize?: number
}): Promise<SyncResult> {
  const db = createAdminClient()
  const platformLimit = input.limit ?? PLATFORM_LIMIT
  const wideLimit = input.wide === false ? 0 : Math.min(WIDE_LIMIT, input.limit ?? WIDE_LIMIT)
  const result: SyncResult = {
    scanned: 0, imported: 0, skipped: 0, failed: 0, attachments: 0,
    contractors: [], truncated: false,
  }

  const { data: connection } = await db
    .from('external_connections' as never)
    .select('refresh_token_ciphertext')
    .eq('user_id', input.userId)
    .eq('provider', 'gmail')
    .eq('status', 'active')
    .maybeSingle() as { data: { refresh_token_ciphertext: string } | null }
  if (!connection) throw new Error('no active gmail connection')

  const accessToken = await accessTokenFrom(decryptToken(connection.refresh_token_ciphertext))
  const years = input.withinYears ?? 5

  await sweepStranded(db, input.home.id)

  const platformIds = await listMessageIds(accessToken, gmailQuery(years), platformLimit)
  const wideIds = wideLimit > 0
    ? await listMessageIds(accessToken, wideQuery(years), wideLimit)
    : []
  // Platform mail first: it is the highest-signal source, so it never loses
  // budget to speculative matches.
  const candidates = [...new Set([...platformIds, ...wideIds])]
  result.scanned = candidates.length

  // Layer-1 dedupe: drop anything this home already processed, before any
  // Gmail fetch or Claude call.
  const { data: seen } = await db
    .from('imported_messages' as never)
    .select('external_id')
    .eq('home_id', input.home.id)
    .in('external_id', candidates)
    .in('status', ['done', 'skipped']) as { data: { external_id: string }[] | null }
  const done = new Set((seen ?? []).map((row) => row.external_id))
  const pending = candidates.filter((id) => !done.has(id))
  result.skipped = candidates.length - pending.length

  // One batch per call: an interactive sync must finish inside a single server
  // invocation, so the caller loops while `truncated` is true.
  const batch = input.batchSize ? pending.slice(0, input.batchSize) : pending
  result.truncated = batch.length < pending.length

  for (const id of batch) {
    try {
      const outcome = await ingestMessage(db, accessToken, input.userId, input.home, id)
      if (outcome.status === 'done') result.imported += 1
      else result.skipped += 1
      result.attachments += outcome.attachments
      if (outcome.company && !result.contractors.includes(outcome.company)) {
        result.contractors.push(outcome.company)
      }
    } catch (err) {
      result.failed += 1
      console.error(`[email-ingest] message ${id} failed:`, err)
      await db.from('imported_messages' as never).upsert({
        home_id: input.home.id,
        user_id: input.userId,
        provider: 'gmail',
        external_id: id,
        status: 'failed',
        error: String(err).slice(0, 500),
      } as never, { onConflict: 'home_id,provider,external_id' } as never)
    }
  }
  return result
}

/**
 * A batch that dies mid-message (serverless timeout, deploy, crash) leaves its
 * row stuck on `processing` forever: no run ever revisits it and the import log
 * reads as if work is still in flight. A message can never legitimately be in
 * flight this long — one message is one Claude call — so anything older is a
 * corpse. Marking it `failed` both tells the truth in the log and leaves it out
 * of the done/skipped dedupe set, so the next run picks it up again.
 */
const STRANDED_AFTER_MS = 15 * 60 * 1000

async function sweepStranded(db: Admin, homeId: string): Promise<void> {
  const cutoff = new Date(Date.now() - STRANDED_AFTER_MS).toISOString()
  const { error } = await db
    .from('imported_messages' as never)
    .update({ status: 'failed', error: 'stranded in processing — swept' } as never)
    .eq('home_id', homeId)
    .eq('status', 'processing')
    .lt('updated_at', cutoff)
  if (error) console.error('[email-ingest] stranded sweep failed:', error)
}

async function ingestMessage(
  db: Admin,
  accessToken: string,
  userId: string,
  home: HomeRow,
  messageId: string,
): Promise<{ status: 'done' | 'skipped'; attachments: number; company: string | null }> {
  const msg = await getMessage(accessToken, messageId)
  const from = header(msg, 'from')
  const fromEmail = senderEmail(from)
  const sentAt = msg.internalDate ? new Date(Number(msg.internalDate)).toISOString() : null

  const base = {
    home_id: home.id,
    user_id: userId,
    provider: 'gmail',
    external_id: messageId,
    vendor: vendorFor(fromEmail),
    from_email: fromEmail,
    from_name: senderName(from).slice(0, 200) || null,
    subject: header(msg, 'subject').slice(0, 500) || null,
    sent_at: sentAt,
  }
  await upsertLog(db, { ...base, status: 'processing', error: null })

  const { envelope, extract } = await extractEmail(db, msg, home)

  // An extraction row per message: keeps the extraction_id provenance FKs
  // valid and puts the email body in the same FTS index as documents.
  const { data: extraction, error: exError } = await db
    .from('extractions')
    .insert({
      home_id: home.id,
      file_id: null,
      source_kind: 'email',
      source_ref: messageId,
      status: 'done',
      doc_type: envelope.docType,
      raw_text: envelope.rawText,
      data: {
        proposals: envelope.proposals,
        scope_status: envelope.scopeStatus,
        scope_reason: envelope.scopeReason,
        email: extract,
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
    return { status: 'skipped', attachments: 0, company: null }
  }

  await applyCascade(
    db,
    {
      homeId: home.id,
      extractionId: extraction.id,
      sourceKey: `email:${messageId}`,
      pipeline: 'syncContractorEmail',
    },
    envelope,
    1,
  )

  const fileIds = await fileAttachments({
    db,
    homeId: home.id,
    messageId: msg.id,
    source: 'email',
    attachments: ingestableAttachments(msg).map((att) => ({
      filename: att.filename,
      mimeType: att.mimeType,
      bytes: () => getAttachment(accessToken, msg.id, att.attachmentId),
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
  return { status: 'done', attachments: fileIds.length, company: extract.company?.trim() || null }
}

async function upsertLog(db: Admin, row: Record<string, unknown>): Promise<void> {
  const { error } = await db
    .from('imported_messages' as never)
    .upsert(row as never, { onConflict: 'home_id,provider,external_id' } as never)
  if (error) throw error
}
