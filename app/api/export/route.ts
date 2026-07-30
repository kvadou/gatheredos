import { getApiUser } from '@/lib/supabase/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { logUsage } from '@/lib/usage'
import { rateLimited } from '@/lib/rate-limit'

export const runtime = 'nodejs'

type Admin = ReturnType<typeof createAdminClient>

/**
 * Full data export for the signed-in user: one JSON document covering every home
 * they belong to (not just the current one — hence getApiUser, not
 * getApiContext). Auth resolves the caller; the membership read runs on their own
 * RLS-scoped client; every heavy read then runs on service role but is scoped to
 * those verified home ids and .eq('home_id', id) (constitution §3.6). File rows
 * carry a fresh 24h signed URL so the export is self-contained.
 *
 * ponytail: JSON with signed URLs, not a zip — no archiver dep. Add a zip
 *   (stream the signed URLs into an archive) when a customer actually asks.
 */
export async function GET(req: Request) {
  const auth = await getApiUser(req)
  if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { supabase, user } = auth

  if (await rateLimited({ event: 'data_export', userId: user.id, limit: 5, windowMinutes: 60 })) {
    return Response.json(
      { error: 'Rate limit reached. Try again later.' },
      { status: 429, headers: { 'Retry-After': '3600' } },
    )
  }

  void logUsage('data_export')

  const { data: memberships } = await supabase
    .from('home_members')
    .select('home_id')
    .eq('user_id', user.id)
  const homeIds = [...new Set((memberships ?? []).map((m) => m.home_id))]

  const admin = createAdminClient()
  const homes = await Promise.all(homeIds.map((id) => exportHome(admin, id)))

  const date = new Date().toISOString().slice(0, 10)
  const doc = {
    exported_at: new Date().toISOString(),
    user: { id: user.id, email: user.email ?? null },
    homes,
  }

  return new Response(JSON.stringify(doc, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="gatheredos-export-${date}.json"`,
    },
  })
}

/** Every row of one home, scoped by home_id; files get a fresh 24h signed URL. */
async function exportHome(admin: Admin, homeId: string) {
  const [
    home,
    rooms,
    items,
    filesRes,
    contractors,
    careTasks,
    careEvents,
    projects,
    insights,
    timeline,
    warranties,
    homeFactsRes,
    conversations,
    suggestions,
  ] = await Promise.all([
    admin.from('homes').select('*').eq('id', homeId).maybeSingle(),
    admin.from('rooms').select('*').eq('home_id', homeId),
    admin.from('items').select('*').eq('home_id', homeId),
    admin.from('files').select('*').eq('home_id', homeId),
    admin.from('contractors').select('*').eq('home_id', homeId),
    admin.from('care_tasks').select('*').eq('home_id', homeId),
    admin.from('care_events').select('*').eq('home_id', homeId),
    admin.from('projects').select('*').eq('home_id', homeId),
    admin.from('insights').select('*').eq('home_id', homeId),
    admin.from('timeline_events').select('*').eq('home_id', homeId),
    admin.from('warranties').select('*').eq('home_id', homeId),
    admin.from('home_facts').select('*').eq('home_id', homeId),
    admin.from('conversations').select('*').eq('home_id', homeId),
    admin.from('suggestions').select('*').eq('home_id', homeId),
  ])

  const files = filesRes.data ?? []
  const paths = files.map((f) => f.storage_path).filter(Boolean)
  const { data: signed } = paths.length
    ? await admin.storage.from('home-files').createSignedUrls(paths, 60 * 60 * 24)
    : { data: [] }
  const urlByPath = new Map((signed ?? []).map((s) => [s.path ?? '', s.signedUrl]))
  const filesWithUrls = files.map((f) => ({
    ...f,
    signed_url: urlByPath.get(f.storage_path) ?? null,
  }))

  const convIds = (conversations.data ?? []).map((c) => c.id)
  const { data: messages } = convIds.length
    ? await admin.from('messages').select('*').in('conversation_id', convIds)
    : { data: [] }

  // ponytail: drop embedding — a 1024-float vector is derived, not user data,
  //   and bloats the file. Everything else exports verbatim.
  const home_facts = (homeFactsRes.data ?? []).map(({ embedding: _embedding, ...rest }) => rest)

  return {
    home: home.data,
    rooms: rooms.data ?? [],
    items: items.data ?? [],
    files: filesWithUrls,
    contractors: contractors.data ?? [],
    care_tasks: careTasks.data ?? [],
    care_events: careEvents.data ?? [],
    projects: projects.data ?? [],
    insights: insights.data ?? [],
    timeline_events: timeline.data ?? [],
    warranties: warranties.data ?? [],
    home_facts,
    conversations: conversations.data ?? [],
    messages: messages ?? [],
    suggestions: suggestions.data ?? [],
  }
}
