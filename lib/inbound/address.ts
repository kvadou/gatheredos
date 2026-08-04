/**
 * The forward-in address: `<token>@<INBOUND_EMAIL_DOMAIN>`.
 *
 * The token is the credential — anything that can post to the address writes to
 * that home's memory — so it is random, not derived from the home id, and long
 * enough that the address space cannot be walked. Base32-ish alphabet with the
 * ambiguous characters removed, because people read these off a screen and
 * retype them into a mail client's forwarding settings.
 *
 * No secrets, no network: safe to import from a client component for display.
 */

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789' // no i/l/o/0/1
const TOKEN_LENGTH = 16

/** ~78 bits. Unguessable, and still short enough to retype. */
export function generateInboundToken(randomBytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < TOKEN_LENGTH; i += 1) {
    out += ALPHABET[randomBytes[i] % ALPHABET.length]
  }
  return `h-${out}`
}

export function inboundDomain(): string {
  return process.env.INBOUND_EMAIL_DOMAIN ?? 'in.gatheredos.com'
}

export function inboundAddress(token: string): string {
  return `${token}@${inboundDomain()}`
}

/**
 * The token out of a recipient address, or null when the address is not one of
 * ours. Accepts a bare address or a `Name <addr>` header value, and normalizes
 * the plus-addressing some clients append when forwarding.
 */
export function localPartOf(recipient: string): string | null {
  const address = (recipient.match(/<([^>]+)>/)?.[1] ?? recipient).trim().toLowerCase()
  const [local, domain] = address.split('@')
  if (!local || !domain) return null
  if (domain !== inboundDomain().toLowerCase()) return null
  const token = local.split('+')[0]
  return /^h-[a-z2-9]{16}$/.test(token) ? token : null
}
