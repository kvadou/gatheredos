'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/supabase/home'
import { logUsage } from '@/lib/usage'
import type { NotificationPreferences } from '@/lib/notifications'

export type HomePatch = {
  name?: string
  street?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  year_built?: number | null
  sqft?: number | null
  beds?: number | null
  baths?: number | null
  property_type?: string | null
}

/** Persist the selected home only after RLS proves the caller is a member. */
export async function switchHome(homeId: string) {
  const supabase = await createClient()
  const { data: home } = await supabase.from('homes').select('id').eq('id', homeId).maybeSingle()
  if (!home) return
  const jar = await cookies()
  jar.set('homeos_current_home', home.id, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 365 })
  revalidatePath('/', 'layout')
  redirect('/')
}

/** Home-profile keys a member is allowed to edit — never trust the raw patch. */
const EDITABLE_HOME_KEYS = new Set<keyof HomePatch>([
  'name', 'street', 'city', 'state', 'zip',
  'year_built', 'sqft', 'beds', 'baths', 'property_type',
])

/**
 * Edit the home profile. App-level role gate: only owner + family (the editor
 * tier) may change it — guests are read-only. The `homes` UPDATE policy today
 * still allows any member, so this is the real enforcement point; the matching
 * DB-level tightening (an is_home_writer UPDATE policy on `homes`) rides the
 * next migration. Only whitelisted profile keys reach the write.
 */
export async function updateHome(homeId: string, patch: HomePatch) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'You are not signed in.' }

  const { data: membership } = await supabase
    .from('home_members')
    .select('role')
    .eq('home_id', homeId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (membership?.role !== 'owner' && membership?.role !== 'family') {
    return { error: 'Only editors can change the home profile.' }
  }

  const clean = Object.fromEntries(
    (Object.keys(patch) as (keyof HomePatch)[])
      .filter((key) => EDITABLE_HOME_KEYS.has(key))
      .map((key) => [key, patch[key]]),
  ) as HomePatch
  if (!Object.keys(clean).length) return { error: 'No changes were provided.' }

  const { error } = await supabase.from('homes').update(clean).eq('id', homeId)
  if (error) return { error: error.message }
  await logUsage('home_updated', { fields: Object.keys(clean) }, homeId)
  revalidatePath('/settings')
  revalidatePath('/', 'layout')
  return { success: true as const }
}

/** Owner-only: remove another member. RLS also enforces owner. */
export async function removeMember(homeId: string, userId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'You are not signed in.' }
  if (userId === user.id) return { error: 'You cannot remove yourself.' }

  const { data: isOwner } = await supabase.rpc('is_home_owner', { home: homeId })
  if (!isOwner) return { error: 'Only owners can remove members.' }

  const { error } = await supabase
    .from('home_members')
    .delete()
    .eq('home_id', homeId)
    .eq('user_id', userId)
  if (error) return { error: error.message }
  await logUsage('member_removed', { userId }, homeId)
  revalidatePath('/settings')
  return { success: true as const }
}

/** Update the current user's own display name (the only editable profile field). */
export async function updateProfileName(name: string) {
  const trimmed = name.trim()
  if (!trimmed) return { error: 'Name cannot be empty.' }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'You are not signed in.' }
  const { error } = await supabase.from('profiles').update({ name: trimmed }).eq('id', user.id)
  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return { success: true as const }
}

/** Store the current user's notification choices for one home. */
export async function updateNotificationPreferences(homeId: string, patch: Partial<NotificationPreferences>) {
  const { supabase, user } = await requireUser()
  const allowed = ['safety_alerts', 'care_reminders', 'warranty_alerts', 'weekly_digest'] as const
  const clean = Object.fromEntries(allowed.filter((key) => typeof patch[key] === 'boolean').map((key) => [key, patch[key]]))
  if (!Object.keys(clean).length) return { error: 'No notification changes were provided.' }
  const { error } = await supabase.from('notification_preferences' as never).upsert({
    user_id: user.id,
    home_id: homeId,
    ...clean,
  } as never, { onConflict: 'user_id,home_id' })
  if (error) return { error: error.message }
  await logUsage('notification_preferences_updated', { fields: Object.keys(clean) }, homeId)
  revalidatePath('/settings')
  return { success: true as const }
}
