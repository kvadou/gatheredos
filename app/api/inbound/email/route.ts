import { createHmac, timingSafeEqual } from 'node:crypto'
import { ingestInboundEmail } from '@/lib/inbound/ingest'
import type { InboundAttachment, InboundEmail } from '@/lib/inbound/message'

/**
 * Inbound contractor mail (Resend inbound → this webhook).
 *
 * A public endpoint that writes to home memory, so it is defended twice over:
 * the payload must carry a valid provider signature, and the recipient address
 * must carry a home's secret token. Neither alone is enough — the signature
 * proves the provider sent it, the token says which home consented to receive.
 *
 * Always answers 2xx once a message is accepted, including when nothing was
 * recorded. A 4xx/5xx makes the provider retry, and retrying a message that was
 * correctly judged to be a newsletter just spends the same Claude call again.
 * Genuine failures do return 5xx, because those are worth retrying.
 */
export const runtime = 'nodejs'
export const maxDuration = 60

/** Ample for an invoice with photos; anything larger is not contractor mail. */
const MAX_BYTES = 25 * 1024 * 1024
/** Providers replay old payloads on retry; refuse ones old enough to be a capture. */
const MAX_SIGNATURE_AGE_SECONDS = 5 * 60

export async function POST(request: Request) {
  const secret = process.env.INBOUND_WEBHOOK_SECRET
  if (!secret) {
    console.error('[inbound] INBOUND_WEBHOOK_SECRET is not set — refusing to accept mail')
    return new Response('Not configured', { status: 503 })
  }

  const raw = await request.text()
  if (raw.length > MAX_BYTES) return new Response('Payload too large', { status: 413 })

  if (!verifySignature(request.headers, raw, secret)) {
    return new Response('Bad signature', { status: 401 })
  }

  let email: InboundEmail
  try {
    email = parsePayload(JSON.parse(raw))
  } catch (err) {
    // Malformed bodies are not worth retrying — a retry produces the same parse
    // error forever.
    console.error('[inbound] unparseable payload:', err)
    return Response.json({ ok: false, reason: 'unparseable' }, { status: 202 })
  }

  try {
    const result = await ingestInboundEmail(email)
    if (result.status === 'ignored') {
      // Includes "no home matches this address", which is what a stale address
      // or a stranger's probe looks like. Never say which — an error that
      // distinguishes a real token from a fake one is an oracle.
      console.warn(`[inbound] ignored ${email.messageId}: ${result.reason}`)
    }
    return Response.json({ ok: true, status: result.status }, { status: 200 })
  } catch (err) {
    console.error('[inbound] ingest failed:', err)
    return new Response('Ingest failed', { status: 500 })
  }
}

/**
 * Svix-style signing, which is what Resend uses for webhooks: the signed
 * content is `<id>.<timestamp>.<body>`, and the header may carry several
 * space-separated versioned signatures during a secret rotation.
 */
function verifySignature(headers: Headers, body: string, secret: string): boolean {
  const id = headers.get('svix-id') ?? headers.get('webhook-id')
  const timestamp = headers.get('svix-timestamp') ?? headers.get('webhook-timestamp')
  const signatureHeader = headers.get('svix-signature') ?? headers.get('webhook-signature')
  if (!id || !timestamp || !signatureHeader) return false

  const age = Math.abs(Date.now() / 1000 - Number(timestamp))
  if (!Number.isFinite(age) || age > MAX_SIGNATURE_AGE_SECONDS) return false

  // The shared secret is `whsec_<base64>`; the bytes after the prefix are the key.
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest()

  return signatureHeader
    .split(' ')
    .map((part) => part.split(',')[1] ?? part)
    .some((candidate) => {
      const given = Buffer.from(candidate, 'base64')
      return given.length === expected.length && timingSafeEqual(given, expected)
    })
}

type RawPayload = {
  type?: string
  data?: Record<string, unknown>
} & Record<string, unknown>

/** Narrow the provider payload to the fields the pipeline reads. */
function parsePayload(payload: RawPayload): InboundEmail {
  const d = (payload.data ?? payload) as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' ? v : null)
  const list = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string')
      : typeof v === 'string' ? [v] : []

  const messageId = str(d.message_id) ?? str(d.messageId) ?? str(d.id)
  if (!messageId) throw new Error('payload has no message id')

  const from = str(d.from) ?? ''
  if (!from) throw new Error('payload has no sender')

  const attachments: InboundAttachment[] = []
  for (const a of Array.isArray(d.attachments) ? d.attachments : []) {
    const att = a as Record<string, unknown>
    const content = str(att.content)
    if (!content) continue
    attachments.push({
      filename: str(att.filename) ?? 'attachment',
      contentType: str(att.content_type) ?? str(att.contentType) ?? 'application/octet-stream',
      content: Buffer.from(content, 'base64'),
    })
  }

  return {
    messageId,
    from,
    // The secret address may be in any recipient field: people forward with it
    // in To, but "send a copy to my house" lands in Cc or Bcc.
    to: [...list(d.to), ...list(d.cc), ...list(d.bcc)],
    subject: str(d.subject),
    text: str(d.text),
    html: str(d.html),
    receivedAt: str(d.created_at) ?? str(d.date) ?? new Date().toISOString(),
    attachments,
  }
}
