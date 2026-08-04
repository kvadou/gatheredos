import type { Metadata } from 'next'
import { AppShell } from '@/components/app-shell'
import { SettingsPanel } from '@/components/settings/settings-panel'
import { requireUser, requireHome } from '@/lib/supabase/home'
import { listInvites } from '@/lib/actions/invites'
import { createAdminClient } from '@/lib/supabase/admin'
import { gmailConfigured } from '@/lib/gmail/oauth'
import { inboundAddress } from '@/lib/inbound/address'
import { defaultNotificationPreferences, type NotificationPreferences } from '@/lib/notifications'

export const metadata: Metadata = {
  title: 'Settings · GatheredOS',
  description:
    'Tune your Home Intelligence, manage your homes and family, and control connected sources.',
}

export default async function SettingsPage() {
  const { supabase, user } = await requireUser()

  const home = await requireHome()

  const [{ data: memberRows }, { data: systems }] = await Promise.all([
    supabase
      .from('home_members')
      .select('user_id, role, created_at')
      .eq('home_id', home.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('items')
      .select('name, manufacturer, installed_on')
      .eq('home_id', home.id)
      .eq('category', 'system')
      .order('created_at', { ascending: true }),
  ])

  // Resolve member profiles in one query (RLS decides what's visible).
  const userIds = (memberRows ?? []).map((m) => m.user_id)
  const { data: profileRows } = userIds.length
    ? await supabase.from('profiles').select('id, name, email').in('id', userIds)
    : { data: [] }
  const profileById = new Map((profileRows ?? []).map((p) => [p.id, p]))

  const members = (memberRows ?? []).map((m) => {
    const p = profileById.get(m.user_id)
    return { userId: m.user_id, role: m.role, name: p?.name ?? null, email: p?.email ?? '' }
  })
  const isOwner = members.find((m) => m.userId === user.id)?.role === 'owner'
  // Read through the user's client on purpose: the editor-only policy on
  // home_inbound_addresses is the gate, so a guest sees nothing without this
  // page having to re-derive who may see a write credential.
  const { data: inboundRow } = await supabase
    .from('home_inbound_addresses')
    .select('token')
    .eq('home_id', home.id)
    .maybeSingle()
  const inboundToken = inboundRow?.token ?? null
  const invites = isOwner ? await listInvites() : []
  const { data: gmailConnection } = await createAdminClient()
    .from('external_connections' as never)
    .select('account_email,status')
    .eq('user_id', user.id)
    .eq('provider', 'gmail')
    .maybeSingle() as { data: { account_email: string | null; status: string } | null }
  // ponytail: 'as never' + result cast until database.types.ts is regenerated
  // after the notifications migration lands in prod (supabase gen types).
  const { data: notificationRow, error: notificationError } = (await supabase
    .from('notification_preferences' as never)
    .select('safety_alerts,care_reminders,warranty_alerts,weekly_digest')
    .eq('user_id', user.id)
    .eq('home_id', home.id)
    .maybeSingle()) as { data: NotificationPreferences | null; error: { message: string } | null }

  return (
    <AppShell showSearch={false}>
      <SettingsPanel
        home={home}
        members={members}
        systems={systems ?? []}
        currentUserId={user.id}
        isOwner={isOwner}
        invites={invites}
        gmail={{ configured: gmailConfigured(), connected: gmailConnection?.status === 'active', email: gmailConnection?.account_email ?? null }}
        notifications={notificationRow ?? defaultNotificationPreferences}
        emailConfigured={Boolean(process.env.RESEND_API_KEY && process.env.WELCOME_FROM_EMAIL)}
        notificationsAvailable={!notificationError}
        inboundAddress={inboundToken ? inboundAddress(inboundToken) : null}
      />
    </AppShell>
  )
}
