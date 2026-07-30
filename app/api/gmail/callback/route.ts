import { cookies } from 'next/headers'
import { requireUser } from '@/lib/supabase/home'
import { createAdminClient } from '@/lib/supabase/admin'
import { logUsage } from '@/lib/usage'
import { encryptToken, exchangeCode, googleEmail } from '@/lib/gmail/oauth'

const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://gatheredos.com'

export async function GET(req: Request) {
  const { user } = await requireUser()
  const url = new URL(req.url)
  const jar = await cookies()
  const expected = jar.get('gmail_oauth_state')?.value
  jar.delete('gmail_oauth_state')
  if (!expected || url.searchParams.get('state') !== expected) return Response.redirect(`${site}/settings?gmail=invalid_state`)
  const code = url.searchParams.get('code')
  if (!code) return Response.redirect(`${site}/settings?gmail=denied`)
  try {
    const tokens = await exchangeCode(code)
    if (!tokens.refresh_token) return Response.redirect(`${site}/settings?gmail=no_refresh_token`)
    const db = createAdminClient()
    await db.from('external_connections' as never).upsert({
      user_id: user.id,
      provider: 'gmail',
      account_email: await googleEmail(tokens.access_token),
      refresh_token_ciphertext: encryptToken(tokens.refresh_token),
      scopes: (tokens.scope ?? '').split(' ').filter(Boolean),
      status: 'active',
    } as never, { onConflict: 'user_id,provider' } as never)
    await logUsage('gmail_connected')
    return Response.redirect(`${site}/settings?gmail=connected`)
  } catch {
    return Response.redirect(`${site}/settings?gmail=failed`)
  }
}

