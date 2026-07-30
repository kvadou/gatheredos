import 'server-only'
import { gmailClientCredentials } from '@/lib/gmail/oauth'
import type { GmailMessage } from '@/lib/gmail/message'

/**
 * Gmail REST client: token refresh plus the three read endpoints this app uses.
 * Pure message parsing lives in ./message.ts so scripts can use it without
 * pulling in server-only code.
 * ponytail: raw fetch, no googleapis SDK — three endpoints do not need 40 MB.
 */

const API = 'https://gmail.googleapis.com/gmail/v1/users/me'

export async function accessTokenFrom(refreshToken: string): Promise<string> {
  const c = gmailClientCredentials()
  if (!c) throw new Error('Gmail is not configured')
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: c.clientId,
      client_secret: c.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) throw new Error(`gmail token refresh failed (${res.status})`)
  const body = await res.json() as { access_token?: string }
  if (!body.access_token) throw new Error('gmail token refresh returned no access_token')
  return body.access_token
}

async function api<T>(accessToken: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { authorization: `Bearer ${accessToken}` } })
  if (!res.ok) throw new Error(`gmail ${path} failed (${res.status})`)
  return await res.json() as T
}

/** Message ids matching a Gmail search query, newest first, capped. */
export async function listMessageIds(
  accessToken: string,
  query: string,
  limit: number,
): Promise<string[]> {
  const ids: string[] = []
  let pageToken: string | undefined
  do {
    const q = new URLSearchParams({ q: query, maxResults: String(Math.min(100, limit - ids.length)) })
    if (pageToken) q.set('pageToken', pageToken)
    const page = await api<{ messages?: { id: string }[]; nextPageToken?: string }>(
      accessToken,
      `/messages?${q}`,
    )
    for (const m of page.messages ?? []) ids.push(m.id)
    pageToken = page.nextPageToken
  } while (pageToken && ids.length < limit)
  return ids.slice(0, limit)
}

export async function getMessage(accessToken: string, id: string): Promise<GmailMessage> {
  return await api<GmailMessage>(accessToken, `/messages/${encodeURIComponent(id)}?format=full`)
}

export async function getAttachment(
  accessToken: string,
  messageId: string,
  attachmentId: string,
): Promise<Buffer> {
  const body = await api<{ data?: string }>(
    accessToken,
    `/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
  )
  return Buffer.from(body.data ?? '', 'base64url')
}
