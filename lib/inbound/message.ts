/**
 * Turn an inbound (forwarded) email into the shape the contractor-email
 * pipeline already reads.
 *
 * The pipeline speaks `GmailMessage` because that is the source it was built
 * for. Rather than fork it — the extraction prompt, the identity-confidence
 * rules, the proposal routing and the cascade are all worth reusing verbatim —
 * an inbound message is adapted into the same structure. Attachments are the
 * one real difference: Gmail hands back an id to fetch later, while an inbound
 * webhook delivers the bytes inline, so they travel beside the message instead
 * of inside it.
 *
 * No network, no secrets: pure transformation, so tests import it directly.
 */
import { unwrapForwarded } from '@/lib/inbound/forwarded'
import type { GmailMessage, GmailPart } from '@/lib/gmail/message'

export type InboundAttachment = {
  filename: string
  contentType: string
  content: Buffer
}

/** The provider-shaped payload we accept, narrowed to what is actually used. */
export type InboundEmail = {
  messageId: string
  from: string
  to: string[]
  subject: string | null
  text: string | null
  html: string | null
  receivedAt: string
  attachments: InboundAttachment[]
}

export type AdaptedInbound = {
  message: GmailMessage
  attachments: InboundAttachment[]
  /** True when the original sender was recovered from a forwarded header block. */
  unwrapped: boolean
  /** Who the pipeline will treat as the sender. */
  effectiveFrom: string
}

const b64 = (text: string) => Buffer.from(text, 'utf8').toString('base64url')

/**
 * Attachments that are worth storing. Mirrors `ingestableAttachments` in the
 * Gmail path — PDFs and images only, and big enough not to be a signature logo.
 */
export function ingestableInbound(attachments: InboundAttachment[]): InboundAttachment[] {
  return attachments.filter((a) => {
    const mime = (a.contentType ?? '').toLowerCase()
    const ok = mime === 'application/pdf' || mime.startsWith('image/')
    return ok && a.content.length >= 20_000
  })
}

export function adaptInbound(email: InboundEmail): AdaptedInbound {
  const rawBody = email.text?.trim() || email.html || ''
  // Prefer the plain-text part for unwrapping: mail clients quote the original
  // headers as text there, while the HTML part wraps them in markup that the
  // field regexes cannot see through.
  const forwarded = unwrapForwarded(email.text || '') ?? unwrapForwarded(stripTags(email.html || ''))

  const from = forwarded?.from ?? email.from
  const subject = forwarded?.subject ?? email.subject ?? ''
  const sentAt = forwarded?.date ?? email.receivedAt

  // When the original was recovered, hand the model the original's body rather
  // than the forwarding wrapper ("FYI", "see below") that carries no signal.
  const body = forwarded?.body?.trim() || rawBody

  const parts: GmailPart[] = [
    { mimeType: 'text/plain', body: { data: b64(body), size: body.length } },
  ]
  if (!forwarded && email.html) {
    // Nothing was unwrapped, so keep the HTML part too — the platform mail may
    // have arrived directly (a contractor CC'ing the forwarding address), and
    // bodyText's HTML path is the one that handles those templates.
    parts.push({ mimeType: 'text/html', body: { data: b64(email.html), size: email.html.length } })
  }

  return {
    message: {
      id: email.messageId,
      internalDate: String(Date.parse(sentAt) || Date.now()),
      payload: {
        mimeType: 'multipart/mixed',
        headers: [
          { name: 'From', value: from },
          { name: 'Subject', value: subject },
          { name: 'Date', value: sentAt },
        ],
        parts,
      },
    },
    attachments: ingestableInbound(email.attachments),
    unwrapped: Boolean(forwarded),
    effectiveFrom: from,
  }
}

/** Enough tag-stripping to find a quoted header block inside an HTML forward. */
function stripTags(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/[ \t]+/g, ' ')
}
