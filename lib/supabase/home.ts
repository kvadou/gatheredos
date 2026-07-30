import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import type { Database } from "@/lib/supabase/database.types"
import { cookies } from "next/headers"

export type HomeRow = Database["public"]["Tables"]["homes"]["Row"]
export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"]

/** Current auth user or redirect to /login. */
export async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")
  return { supabase, user }
}

/**
 * The user's current home (first membership) or null.
 * Pages that need a home should redirect to /onboarding when null.
 *
 * "First by created_at" resolves an invitee with no home of their own to the
 * home they were invited into (the Alexis path). A member who ALSO owns their
 * own older home would land on that one instead — when someone genuinely runs
 * two homes, a current-home picker (persisted selection) slots in here.
 * ponytail: single-home resolution until a real multi-home user shows up.
 */
export async function getCurrentHome(): Promise<HomeRow | null> {
  const { supabase } = await requireUser()
  const selected = (await cookies()).get('homeos_current_home')?.value
  if (selected) {
    const { data } = await supabase.from('homes').select('*').eq('id', selected).maybeSingle()
    if (data) return data
  }
  const { data } = await supabase
    .from("homes")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  return data
}

/** Current home or redirect to /onboarding. Most pages use this. */
export async function requireHome(): Promise<HomeRow> {
  const home = await getCurrentHome()
  if (!home) redirect("/onboarding")
  return home
}
