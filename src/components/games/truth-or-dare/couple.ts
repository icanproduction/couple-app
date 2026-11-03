// Who is playing: the signed-in user, their couple and their partner.

import { createClient, getClientUser } from '@/lib/supabase'
import { getMyCouple } from '@/lib/couple'

export interface TodCouple {
  userId: string
  coupleId: string
  /** Someone left this couple: it keeps its archive but takes no new writes. */
  closed: boolean
  partnerId: string | null
  names: Record<string, string>
}

export type TodCoupleLoad =
  | { status: 'signedout' }
  | { status: 'nocouple' }
  | { status: 'ok'; couple: TodCouple }

export async function loadTodCouple(): Promise<TodCoupleLoad> {
  const user = await getClientUser()
  if (!user) return { status: 'signedout' }
  const couple = await getMyCouple(user.id)
  if (!couple) return { status: 'nocouple' }

  const supabase = createClient()
  const { data: members, error } = await supabase
    .from('couple_members')
    .select('profile_id')
    .eq('couple_id', couple.id)
  if (error) throw new Error(error.message)
  const ids = Array.from(new Set([user.id, ...(members ?? []).map((m) => m.profile_id)]))

  const { data: profiles, error: profileError } = await supabase.from('profiles').select('id, name').in('id', ids)
  if (profileError) throw new Error(profileError.message)
  const names: Record<string, string> = {}
  for (const p of profiles ?? []) {
    const name = p.name?.trim()
    if (name) names[p.id] = name
  }

  return {
    status: 'ok',
    couple: {
      userId: user.id,
      coupleId: couple.id,
      closed: !!couple.closedAt,
      partnerId: ids.find((id) => id !== user.id) ?? null,
      names,
    },
  }
}
