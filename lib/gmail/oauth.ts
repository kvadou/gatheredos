import 'server-only'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'

function config() {
  const clientId = process.env.GOOGLE_GMAIL_CLIENT_ID
  const clientSecret = process.env.GOOGLE_GMAIL_CLIENT_SECRET
  const encryptionKey = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://gatherroot.vercel.app'
  if (!clientId || !clientSecret || !encryptionKey) return null
  return { clientId, clientSecret, key: createHash('sha256').update(encryptionKey).digest(), redirectUri: `${site}/api/gmail/callback` }
}

export function gmailConfigured(): boolean { return config() !== null }

/** Client id/secret for flows outside this module (refresh-token exchange). */
export function gmailClientCredentials(): { clientId: string; clientSecret: string } | null {
  const c = config()
  return c ? { clientId: c.clientId, clientSecret: c.clientSecret } : null
}

export function authorizationUrl(state: string): string {
  const c = config()
  if (!c) throw new Error('Gmail is not configured')
  const q = new URLSearchParams({
    client_id: c.clientId,
    redirect_uri: c.redirectUri,
    response_type: 'code',
    scope: GMAIL_SCOPE,
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'consent',
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`
}

export async function exchangeCode(code: string) {
  const c = config()
  if (!c) throw new Error('Gmail is not configured')
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: c.clientId, client_secret: c.clientSecret, redirect_uri: c.redirectUri, grant_type: 'authorization_code' }),
  })
  if (!res.ok) throw new Error('Google token exchange failed')
  return await res.json() as { access_token: string; refresh_token?: string; scope?: string }
}

export async function googleEmail(accessToken: string): Promise<string | null> {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { authorization: `Bearer ${accessToken}` } })
  if (!res.ok) return null
  const body = await res.json() as { email?: string }
  return body.email ?? null
}

export function encryptToken(value: string): string {
  const c = config()
  if (!c) throw new Error('Gmail is not configured')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', c.key, iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), encrypted].map((b) => b.toString('base64url')).join('.')
}

export function decryptToken(value: string): string {
  const c = config()
  if (!c) throw new Error('Gmail is not configured')
  const [iv, tag, encrypted] = value.split('.').map((part) => Buffer.from(part, 'base64url'))
  const decipher = createDecipheriv('aes-256-gcm', c.key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}

export async function revokeGoogleToken(token: string): Promise<void> {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
  }).catch(() => undefined)
}

