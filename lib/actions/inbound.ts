'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { requireHome, requireUser } from '@/lib/supabase/home'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateInboundToken, inboundAddress } from '@/lib/inbound/address'
import { logUsage } from '@/lib/usage'

/**
 * The home's forward-in address.
 *
 * Minted on request rather than at signup: an unused secret address is a
 * liability, and most homes will connect Gmail instead. Rotating it is the
 * revocation story — the old address stops resolving to a home the moment the
 * column changes, so a leaked address is fixed by one click.
 */

async function requireEditor() {
  const { supabase, user } = await requireUser()
  const home = await requireHome()
  const { data: membership } = await supabase
    .from('home_members')
    .select('role')
    .eq('home_id', home.id)
    .eq('user_id', user.id)
    .maybeSingle()
  // Guests are read-only, and this address writes service history.
  if (membership?.role !== 'owner' && membership?.role !== 'family') return null
  return home
}

export async function createInboundAddress(rotate = false) {
  const home = await requireEditor()
  if (!home) return { success: false as const, error: 'Only editors can change this.' }

  const db = createAdminClient()
  const { data: current } = await db
    .from('home_inbound_addresses')
    .select('token')
    .eq('home_id', home.id)
    .maybeSingle()

  if (current?.token && !rotate) {
    return { success: true as const, address: inboundAddress(current.token) }
  }

  // Unique index on the column; a collision at 78 bits means something is very
  // wrong, so retry a few times rather than looping forever.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const token = generateInboundToken(randomBytes(16))
    const { error } = await db
      .from('home_inbound_addresses')
      .upsert(
        { home_id: home.id, token, ...(rotate ? { rotated_at: new Date().toISOString() } : {}) },
        { onConflict: 'home_id' },
      )
    if (!error) {
      await logUsage(rotate ? 'inbound_address_rotated' : 'inbound_address_created', {}, home.id)
      revalidatePath('/settings')
      return { success: true as const, address: inboundAddress(token) }
    }
    if (!String(error.message).includes('duplicate key')) {
      console.error('[inbound] could not set token:', error)
      return { success: false as const, error: 'Could not create the address. Try again.' }
    }
  }
  return { success: false as const, error: 'Could not create the address. Try again.' }
}
