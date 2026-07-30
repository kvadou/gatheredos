import { createClient as createTokenClient } from '@supabase/supabase-js'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { createClient as createCookieClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/database.types'
import type { HomeRow } from '@/lib/supabase/home'

export type ApiUser = {
  supabase: SupabaseClient<Database>
  user: User
}

export type ApiContext = ApiUser & {
  home: HomeRow
}

/**
 * Authenticate an API route from either transport: the session cookie (web) or
 * an `Authorization: Bearer <jwt>` header (iOS). Returns null when the caller is
 * unauthenticated, so the route answers 401. RLS runs as the resolved user for
 * every query made with the returned client — the cookie client via the SSR
 * session, the bearer client via the token on each request. No home required,
 * so this is safe to call mid-onboarding (the home row is created only at
 * completeOnboarding); use getApiContext when the route needs a home.
 */
export async function getApiUser(req: Request): Promise<ApiUser | null> {
  const bearer = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]

  if (bearer) {
    // Stateless token-bound client: the JWT rides on every PostgREST/GoTrue
    // request as the Authorization header, so RLS sees this user. persistSession
    // false keeps supabase-js from swapping that header for a stored session.
    const supabase = createTokenClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    )
    // getUser(jwt) validates the token against GoTrue (signature + expiry).
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(bearer)
    if (error || !user) return null
    return { supabase, user }
  }

  const supabase = await createCookieClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  return { supabase, user }
}

/**
 * As getApiUser, but also resolves the caller's home — returns null (→ 401)
 * when unauthenticated or the user has no home yet.
 */
export async function getApiContext(req: Request): Promise<ApiContext | null> {
  const auth = await getApiUser(req)
  if (!auth) return null
  const selected = req.headers.get('authorization') ? null : cookieValue(req.headers.get('cookie'), 'homeos_current_home')
  return resolveHome(auth.supabase, auth.user, selected)
}

/** First home by membership (created_at) — same rule as requireHome/getCurrentHome. */
async function resolveHome(
  supabase: SupabaseClient<Database>,
  user: User,
  selected: string | null,
): Promise<ApiContext | null> {
  if (selected) {
    const { data: chosen } = await supabase.from('homes').select('*').eq('id', selected).maybeSingle()
    if (chosen) return { supabase, user, home: chosen }
  }
  const { data: home } = await supabase
    .from('homes')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!home) return null
  return { supabase, user, home }
}

function cookieValue(header: string | null, name: string): string | null {
  const entry = header?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : null
}
