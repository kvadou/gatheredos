import { randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import { requireUser } from '@/lib/supabase/home'
import { logUsage } from '@/lib/usage'
import { authorizationUrl, gmailConfigured } from '@/lib/gmail/oauth'

export async function GET() {
  await requireUser()
  if (!gmailConfigured()) return Response.redirect(new URL('/settings?gmail=unavailable', process.env.NEXT_PUBLIC_SITE_URL ?? 'https://gatheredos.com'))
  await logUsage('gmail_connect_started')
  const state = randomBytes(32).toString('base64url')
  const jar = await cookies()
  jar.set('gmail_oauth_state', state, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/api/gmail', maxAge: 600 })
  return Response.redirect(authorizationUrl(state))
}

