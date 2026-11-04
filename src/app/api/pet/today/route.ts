import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { PET_NOTE_WAIT_MS, resolvePetNote } from '@/lib/pet-ai'
import type { PetStatus } from '@/types/pet'

export const dynamic = 'force-dynamic'
// supabase-js reads are GET fetches: never replay a cached note or claim.
export const fetchCache = 'force-no-store'
export const revalidate = 0
// One model call (8 s at most) or a wait for another request's note (9 s).
export const maxDuration = 30

/**
 * Today's note from the pet (spec 5.4), for PetPeek on Home and the pet
 * screen. The first request after 05:00 WIB claims the day's row and makes the
 * one model call; everyone else reads that row (or waits a few seconds for
 * it). Any AI problem gives a template note with status 200.
 *
 * 200 { note: PetTodayNote } · 200 { note: null } without a pet · 401 signed out
 */
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // The caller's own pet; null while the couple has none (or no couple).
    const { data, error } = await supabase.rpc('pet_status', {})
    if (error) throw new Error(`pet_status failed: ${error.message}`)
    const status = data as unknown as PetStatus | null
    if (!status) return NextResponse.json({ note: null }, { headers: { 'Cache-Control': 'no-store' } })

    const { note } = await resolvePetNote({
      admin: createServiceRoleClient(),
      reader: supabase,
      status,
      waitMs: PET_NOTE_WAIT_MS,
    })
    return NextResponse.json({ note }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('[pet/today] error:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Couldn\'t load today\'s note. Try again.' }, { status: 500 })
  }
}
