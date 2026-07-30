import { getApiUser } from '@/lib/supabase/api-auth'
import { logUsage } from '@/lib/usage'
import { rateLimited } from '@/lib/rate-limit'

export const runtime = 'nodejs'

export type AddressSuggestion = {
  label: string
  street: string
  city: string
  state: string
  zip: string
}

// Photon (keyless OSM geocoder) feature shape — only the fields we read.
type PhotonProps = {
  countrycode?: string
  country?: string
  housenumber?: string
  street?: string
  city?: string
  town?: string
  village?: string
  state?: string
  postcode?: string
}

// Mapbox Geocoding v6 forward feature shape — only the fields we read.
type MapboxContextEntry = { name?: string }
type MapboxFeature = {
  properties?: {
    name?: string
    context?: {
      address?: { name?: string }
      postcode?: MapboxContextEntry
      place?: MapboxContextEntry
      region?: MapboxContextEntry
    }
  }
}

/**
 * Best-effort US address autocomplete used by onboarding. Auth is required (no
 * open proxy) but a home is NOT — this runs before the home row exists. Any
 * upstream failure/timeout falls back to an empty list; autocomplete augments
 * manual typing and must never surface an error or block the form.
 */
export async function GET(req: Request) {
  const auth = await getApiUser(req)
  if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const q = new URL(req.url).searchParams.get('q')?.trim() ?? ''
  if (q.length < 3) return Response.json({ suggestions: [] })

  if (await rateLimited({ event: 'address_search', userId: auth.user.id, limit: 120, windowMinutes: 60 })) {
    return Response.json(
      { success: false, error: 'Rate limit reached. Try again soon.' },
      { status: 429, headers: { 'Retry-After': '3600' } },
    )
  }
  // Log AFTER passing the limit check so a blocked request doesn't extend the window.
  void logUsage('address_search')

  // Two upstreams: Mapbox first for real house-number coverage (needs a token),
  // Photon as the keyless fallback when Mapbox is unconfigured or unreachable.
  const token = process.env.MAPBOX_TOKEN
  if (token) {
    try {
      return Response.json({ suggestions: await fetchMapbox(q, token) })
    } catch {
      // Mapbox failed/timed out — fall through to Photon below.
    }
  }

  try {
    return Response.json({ suggestions: await fetchPhoton(q) })
  } catch {
    // Timeout, network error, or bad JSON — degrade silently to no suggestions.
    return Response.json({ suggestions: [] })
  }
}

async function fetchMapbox(q: string, token: string): Promise<AddressSuggestion[]> {
  const res = await fetch(
    `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(q)}` +
      `&autocomplete=true&country=us&types=address&limit=5&access_token=${token}`,
    { signal: AbortSignal.timeout(4000) },
  )
  if (!res.ok) throw new Error(`mapbox ${res.status}`)
  const data = (await res.json()) as { features?: MapboxFeature[] }
  return toMapboxSuggestions(data.features ?? [])
}

async function fetchPhoton(q: string): Promise<AddressSuggestion[]> {
  const res = await fetch(
    `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6&lang=en`,
    {
      signal: AbortSignal.timeout(4000),
      headers: { 'User-Agent': 'GatheredOS/1.0 (gatheredos.com)' },
    },
  )
  if (!res.ok) throw new Error(`photon ${res.status}`)
  const data = (await res.json()) as { features?: { properties?: PhotonProps }[] }
  return toSuggestions(data.features ?? [])
}

export function toMapboxSuggestions(features: MapboxFeature[]): AddressSuggestion[] {
  const seen = new Set<string>()
  const out: AddressSuggestion[] = []
  for (const f of features) {
    const p = f.properties ?? {}
    const ctx = p.context ?? {}
    // types=address puts the full street line (incl. house number) on properties.name.
    const street = p.name ?? ctx.address?.name ?? ''
    if (!street) continue
    const city = ctx.place?.name ?? ''
    const state = ctx.region?.name ?? ''
    const zip = ctx.postcode?.name ?? ''
    // "street, city, state zip", skipping any missing part.
    const stateZip = [state, zip].filter(Boolean).join(' ')
    const label = [street, city, stateZip].filter(Boolean).join(', ')
    if (seen.has(label)) continue
    seen.add(label)
    out.push({ label, street, city, state, zip })
    if (out.length >= 5) break
  }
  return out
}

function toSuggestions(features: { properties?: PhotonProps }[]): AddressSuggestion[] {
  const seen = new Set<string>()
  const out: AddressSuggestion[] = []
  for (const f of features) {
    const p = f.properties ?? {}
    if (p.countrycode !== 'US' && p.country !== 'United States') continue
    const street = [p.housenumber, p.street].filter(Boolean).join(' ')
    if (!street) continue
    const city = p.city ?? p.town ?? p.village ?? ''
    const state = p.state ?? ''
    const zip = p.postcode ?? ''
    // "street, city, state zip", skipping any missing part.
    const stateZip = [state, zip].filter(Boolean).join(' ')
    const label = [street, city, stateZip].filter(Boolean).join(', ')
    if (seen.has(label)) continue
    seen.add(label)
    out.push({ label, street, city, state, zip })
    if (out.length >= 5) break
  }
  return out
}
