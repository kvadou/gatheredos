import { createHash } from 'node:crypto'
import type { createAdminClient } from '@/lib/supabase/admin'
import { ingestFile } from '@/lib/ingest/pipeline'

/**
 * File an email attachment as a real library document.
 *
 * Attached invoices and photos become `files` rows, which routes them into the
 * document extraction engine that already reads receipts and warranties.
 * Content-hash dedupe means re-delivering the same message never stores twice.
 *
 * Shared by both mail sources. They differ only in how the bytes are obtained —
 * Gmail returns an id to fetch, an inbound webhook delivers the bytes inline —
 * so the caller resolves bytes and this owns everything after: hashing,
 * filename safety, storage layout, the files row, and handing off to extraction.
 */

type Admin = ReturnType<typeof createAdminClient>

export type PendingAttachment = {
  filename: string
  mimeType: string
  /** Resolved lazily so a duplicate is never downloaded. */
  bytes: () => Promise<Buffer>
}

export async function fileAttachments(input: {
  db: Admin
  homeId: string
  /** Groups the objects in storage and identifies the message they came from. */
  messageId: string
  source: 'email' | 'forward'
  attachments: PendingAttachment[]
}): Promise<string[]> {
  const { db, homeId, messageId, source } = input
  const ids: string[] = []

  for (const att of input.attachments) {
    const bytes = await att.bytes()
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

    // Attacker-controlled filename. Collapse to word chars, then strip any
    // remaining dot run so `..` can never appear in the object key, and fall
    // back to a fixed name when nothing usable survives.
    const safeName = (att.filename.replace(/[^\w.\-]+/g, '_').replace(/\.{2,}/g, '.').replace(/^\.+/, '') || 'attachment')
      .slice(0, 120)
    const path = `${homeId}/email/${messageId}/${safeName}`
    const { error: upErr } = await db.storage
      .from('home-files')
      .upload(path, bytes, { contentType: att.mimeType, upsert: false })
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
        meta: source === 'forward'
          ? { source: 'forward', inbound_message_id: messageId }
          : { source: 'email', gmail_message_id: messageId },
        extraction_status: 'pending',
      } as never)
      .select('id')
      .single()
    if (error || !file) {
      console.error('[email-ingest] attachment file insert failed:', error)
      continue
    }
    ids.push(file.id)
    // Sequential, not fire-and-forget: ingestion is already a background job,
    // and one Claude call at a time keeps the cost per run predictable.
    await ingestFile(file.id).catch((err) => console.error('[email-ingest] attachment ingest failed:', err))
  }
  return ids
}
