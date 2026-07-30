import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { decryptToken } from '@/lib/gmail/oauth'
import { accessTokenFrom, getAttachment, getMessage, listMessageIds } from '@/lib/gmail/client'
import {
  header, ingestableAttachments, senderEmail, senderName, type GmailMessage,
} from '@/lib/gmail/message'
import { applyCascade, ingestFile } from '@/lib/ingest/pipeline'
import { extractEmail, gmailQuery, vendorFor } from '@/lib/ingest/email'
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

/** Cap per run: one Claude call per message, so the ceiling is the cost ceiling. */
const DEFAULT_LIMIT = 40

export type SyncResult = {
  scanned: number
  imported: number
  skipped: number
  failed: number
  attachments: number
}

export async function syncContractorEmail(input: {
  userId: string
  home: HomeRow
  limit?: number
  withinYears?: number
}): Promise<SyncResult> {
  const db = createAdminClient()
  const limit = input.limit ?? DEFAULT_LIMIT
  const result: SyncResult = { scanned: 0, imported: 0, skipped: 0, failed: 0, attachments: 0 }

  const { data: connection } = await db
    .from('external_connections' as never)
    .select('refresh_token_ciphertext')
    .eq('user_id', input.userId)
    .eq('provider', 'gmail')
    .eq('status', 'active')
    .maybeSingle() as { data: { refresh_token_ciphertext: string } | null }
  if (!connection) throw new Error('no active gmail connection')

  const accessToken = await accessTokenFrom(decryptToken(connection.refresh_token_ciphertext))
  const ids = await listMessageIds(accessToken, gmailQuery(input.withinYears ?? 5), limit)
  result.scanned = ids.length

  // Layer-1 dedupe: skip anything this home already processed, before any
  // Gmail fetch or Claude call.
  const { data: seen } = await db
    .from('imported_messages' as never)
    .select('external_id')
    .eq('home_id', input.home.id)
    .in('external_id', ids)
    .in('status', ['done', 'skipped']) as { data: { external_id: string }[] | null }
  const done = new Set((seen ?? []).map((row) => row.external_id))

  for (const id of ids) {
    if (done.has(id)) {
      result.skipped += 1
      continue
    }
    try {
      const outcome = await ingestMessage(db, accessToken, input.userId, input.home, id)
      if (outcome.status === 'done') result.imported += 1
      else result.skipped += 1
      result.attachments += outcome.attachments
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

async function ingestMessage(
  db: Admin,
  accessToken: string,
  userId: string,
  home: HomeRow,
  messageId: string,
): Promise<{ status: 'done' | 'skipped'; attachments: number }> {
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
    return { status: 'skipped', attachments: 0 }
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

  const fileIds = await fileAttachments(db, accessToken, home.id, msg)

  await upsertLog(db, {
    ...base,
    status: 'done',
    skip_reason: null,
    extraction_id: extraction.id,
    proposal_count: envelope.proposals.length,
    attachment_file_ids: fileIds,
    service_address: extract.service_address?.slice(0, 300) ?? null,
  })
  return { status: 'done', attachments: fileIds.length }
}

async function upsertLog(db: Admin, row: Record<string, unknown>): Promise<void> {
  const { error } = await db
    .from('imported_messages' as never)
    .upsert(row as never, { onConflict: 'home_id,provider,external_id' } as never)
  if (error) throw error
}

/**
 * Attached invoices and photos become real library files, which routes them
 * into the document extraction engine that already reads receipts and
 * warranties. Content-hash dedupe means re-syncing never stores twice.
 */
async function fileAttachments(
  db: Admin,
  accessToken: string,
  homeId: string,
  msg: GmailMessage,
): Promise<string[]> {
  const ids: string[] = []
  for (const att of ingestableAttachments(msg)) {
    const bytes = await getAttachment(accessToken, msg.id, att.attachmentId)
    const hash = createHash('sha256').update(bytes).digest('hex')

    const { data: existing } = await db
      .from('files')
      .select('id')
      .eq('home_id', homeId)
      .eq('content_hash', hash)
      .maybeSingle()
    if (existing) {
      ids.push(existing.id)
      continue
    }

    const safeName = att.filename.replace(/[^\w.\-]+/g, '_').slice(0, 120)
    const path = `${homeId}/email/${msg.id}/${safeName}`
    const { error: upErr } = await db.storage
      .from('home-files')
      .upload(path, bytes, { contentType: att.mimeType, upsert: true })
    if (upErr) {
      console.error(`[email-ingest] attachment upload failed (${path}):`, upErr)
      continue
    }

    const { data: file, error } = await db
      .from('files')
      .insert({
        home_id: homeId,
        type: att.mimeType.startsWith('image/') ? 'photo' : 'receipt',
        name: safeName,
        storage_path: path,
        content_hash: hash,
        meta: { source: 'email', gmail_message_id: msg.id },
        extraction_status: 'pending',
      } as never)
      .select('id')
      .single()
    if (error || !file) {
      console.error('[email-ingest] attachment file insert failed:', error)
      continue
    }
    ids.push(file.id)
    // Sequential, not fire-and-forget: a sync is already a background job, and
    // one Claude call at a time keeps the cost per run predictable.
    await ingestFile(file.id).catch((err) => console.error('[email-ingest] attachment ingest failed:', err))
  }
  return ids
}
