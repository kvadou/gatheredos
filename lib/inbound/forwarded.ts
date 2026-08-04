/**
 * Recover the original message from a forwarded one.
 *
 * This is the whole reason forwarding needs its own layer. When a homeowner
 * forwards a ServiceTitan confirmation, the envelope sender becomes *them*, not
 * the platform — and the contractor-identity rule that rescued dropped
 * contractors (`vendorFor(senderEmail(...))`, see lib/ingest/email.ts) keys on
 * exactly that sender. Ingesting a forward as-is reintroduces the first bug
 * real mail ever found: the invoice is unreadable, the sender is the homeowner,
 * so the contractor scores below the floor and is discarded.
 *
 * Every mail client announces the quoted original the same way, then lists the
 * original headers as plain text. Parse those back out and the message can be
 * handed to the normal pipeline as though it arrived directly.
 *
 * TRUST: the recovered headers are body text, so they are attacker-controlled
 * in a way a real envelope sender is not — a contractor could mail a homeowner
 * a fake "From: noreply@servicetitan.com" block. This is accepted, narrowly:
 * a human chose to forward the message, the recovered sender only raises an
 * identity confidence score, and contractors are ALWAYS queued for confirmation
 * and never auto-created. It must not become an auto-apply path.
 */

export type ForwardedMessage = {
  from: string
  subject: string | null
  date: string | null
  /** The forwarded message's own body, with the quoted header block removed. */
  body: string
}

/**
 * The banner each client writes above the quoted original. Gmail and Apple Mail
 * are explicit; Outlook's "-----Original Message-----" is shared with replies,
 * which is fine — a reply we cannot parse simply returns null.
 */
const BANNERS = [
  /-{2,}\s*forwarded message\s*-{2,}/i,
  /begin forwarded message:?/i,
  /-{2,}\s*original message\s*-{2,}/i,
]

/** `From: Name <addr@host>` in the quoted block. Also matches Outlook's `Sent:`. */
const FIELD = (name: string) => new RegExp(`^\\s*${name}\\s*:\\s*(.+)$`, 'im')

export function unwrapForwarded(body: string): ForwardedMessage | null {
  if (!body) return null

  let start = -1
  for (const banner of BANNERS) {
    const match = banner.exec(body)
    if (match && (start === -1 || match.index < start)) start = match.index + match[0].length
  }
  if (start === -1) return null

  // The header block runs until the first blank line after the fields. Cap the
  // window so a message that merely quotes the word "forwarded" cannot drag the
  // whole body into header parsing.
  const rest = body.slice(start)
  const window = rest.slice(0, 1200)

  const from = FIELD('from').exec(window)?.[1]?.trim()
  if (!from || !/@/.test(from)) return null

  const subject = FIELD('subject').exec(window)?.[1]?.trim() || null
  const rawDate = (FIELD('date').exec(window)?.[1] ?? FIELD('sent').exec(window)?.[1])?.trim() ?? null

  return {
    from,
    subject,
    date: normalizeDate(rawDate),
    body: stripHeaderBlock(rest),
  }
}

/**
 * Drop the quoted `From:/Date:/Subject:/To:/Cc:` lines so the body handed to
 * the model is the original message, not the client's header echo. Stops at the
 * first line that is not a header, which is where the real content starts.
 */
function stripHeaderBlock(text: string): string {
  const lines = text.split('\n')
  let i = 0
  while (i < lines.length) {
    const line = lines[i].trim()
    if (!line) { i += 1; continue }
    if (/^(from|to|cc|bcc|date|sent|subject|reply-to)\s*:/i.test(line)) { i += 1; continue }
    break
  }
  return lines.slice(i).join('\n').trim()
}

/**
 * Mail clients write dates in their own locale format ("Mon, Dec 19, 2022 at
 * 3:04 PM"). Date.parse handles the common ones; anything it cannot read
 * becomes null and the pipeline falls back to the received time.
 */
function normalizeDate(raw: string | null): string | null {
  if (!raw) return null
  // "at" is Gmail's separator and is not valid in a parseable date string.
  const cleaned = raw.replace(/\s+at\s+/i, ' ').trim()
  const ms = Date.parse(cleaned)
  if (Number.isNaN(ms)) return null
  // A forwarded message cannot be from the future, and a misparse usually lands
  // far away — reject anything implausible rather than dating a visit wrongly.
  const year = new Date(ms).getUTCFullYear()
  if (year < 1990 || ms > Date.now() + 86_400_000) return null
  return new Date(ms).toISOString()
}
