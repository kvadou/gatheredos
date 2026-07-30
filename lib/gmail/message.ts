/**
 * Gmail message types and pure decode helpers. No network, no secrets, no
 * 'server-only' — scripts and tests import this directly.
 */

export type GmailHeader = { name?: string; value?: string }
export type GmailPart = {
  partId?: string
  mimeType?: string
  filename?: string
  headers?: GmailHeader[]
  body?: { size?: number; data?: string; attachmentId?: string }
  parts?: GmailPart[]
}
export type GmailMessage = {
  id: string
  threadId?: string
  internalDate?: string
  snippet?: string
  payload?: GmailPart
}

export type GmailAttachment = {
  filename: string
  mimeType: string
  attachmentId: string
  size: number
}

export function header(msg: GmailMessage, name: string): string {
  const want = name.toLowerCase()
  const found = msg.payload?.headers?.find((h) => h.name?.toLowerCase() === want)
  return found?.value ?? ''
}

function walk(part: GmailPart | undefined, visit: (p: GmailPart) => void): void {
  if (!part) return
  visit(part)
  for (const child of part.parts ?? []) walk(child, visit)
}

function decode(data: string | undefined): string {
  return data ? Buffer.from(data, 'base64url').toString('utf8') : ''
}

/**
 * Readable body text. Prefers text/plain; falls back to stripping tags off
 * text/html, which is what the field-service platforms actually send.
 *
 * SECURITY: entity decoding deliberately does NOT restore `<` and `>`. An
 * attacker who writes `&lt;/untrusted_email&gt;` in an HTML body would
 * otherwise get a literal closing tag through tag-stripping and could break
 * out of the prompt fence downstream. Angle brackets are decoded to their
 * fullwidth lookalikes: still readable to a model, inert as markup.
 */
export function bodyText(msg: GmailMessage): string {
  let plain = ''
  let html = ''
  walk(msg.payload, (p) => {
    if (p.filename) return // attachment, not body
    if (p.mimeType === 'text/plain' && !plain) plain = decode(p.body?.data)
    if (p.mimeType === 'text/html' && !html) html = decode(p.body?.data)
  })
  if (plain.trim()) return plain
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h[1-6])>/gi, '\n')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '＜')
    .replace(/&gt;/gi, '＞')
    .replace(/&#0*60;?/g, '＜')
    .replace(/&#0*62;?/g, '＞')
    .replace(/&#x0*3c;?/gi, '＜')
    .replace(/&#x0*3e;?/gi, '＞')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    // &amp; last: decoding it earlier would let &amp;lt; become &lt; and then <.
    .replace(/&amp;/gi, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Attachments worth ingesting as documents: PDFs and images only. */
export function ingestableAttachments(msg: GmailMessage): GmailAttachment[] {
  const out: GmailAttachment[] = []
  walk(msg.payload, (p) => {
    const mime = (p.mimeType ?? '').toLowerCase()
    const ok = mime === 'application/pdf' || mime.startsWith('image/')
    if (!p.filename || !p.body?.attachmentId || !ok) return
    // Inline logos and signature images are attachments too — size gate skips them.
    if ((p.body.size ?? 0) < 20_000) return
    out.push({
      filename: p.filename,
      mimeType: mime,
      attachmentId: p.body.attachmentId,
      size: p.body.size ?? 0,
    })
  })
  return out
}

export function senderName(from: string): string {
  const match = from.match(/^\s*"?([^"<]*?)"?\s*</)
  return (match?.[1] ?? '').trim()
}

export function senderEmail(from: string): string {
  const match = from.match(/<([^>]+)>/)
  return (match?.[1] ?? from).trim().toLowerCase()
}
