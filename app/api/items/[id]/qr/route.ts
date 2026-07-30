import QRCode from 'qrcode'
import { requireHome } from '@/lib/supabase/home'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

/** Authenticated, high-contrast SVG locator. The item UUID is a locator, never an authorization token. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const home = await requireHome()
  const { id } = await context.params
  const supabase = await createClient()
  const { data: item } = await supabase.from('items').select('id').eq('id', id).eq('home_id', home.id).maybeSingle()
  if (!item) return new Response('Not found', { status: 404 })

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://gatheredos.com'
  const svg = await QRCode.toString(`${site}/library/item/${item.id}`, {
    type: 'svg', errorCorrectionLevel: 'H', margin: 2,
    color: { dark: '#0A2E4D', light: '#FFFFFF' }, width: 512,
  })
  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'private, max-age=3600',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
    },
  })
}
