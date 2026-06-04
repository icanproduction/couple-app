import { createClient } from '@/lib/supabase'

export interface CouplePremium {
  coupleId: string
  isPremium: boolean
  unlockedAt: string | null
}

/**
 * Client-side: get the current user's couple + premium status.
 * Returns null if not logged in or not in a couple.
 */
export async function getMyCouplePremium(): Promise<CouplePremium | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: membership } = await supabase
    .from('couple_members')
    .select('couple_id')
    .eq('profile_id', user.id)
    .single()
  if (!membership?.couple_id) return null

  const { data: couple } = await supabase
    .from('couples')
    .select('id, is_premium, unlocked_at')
    .eq('id', membership.couple_id)
    .single()
  if (!couple) return null

  return {
    coupleId: couple.id,
    isPremium: !!couple.is_premium,
    unlockedAt: couple.unlocked_at,
  }
}
