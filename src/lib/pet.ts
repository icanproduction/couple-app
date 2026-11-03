import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase'
import { todayJakarta } from '@/lib/dates'
import { ALL_CARE_ACTIONS, CARE_ACTION_META } from '@/types/pet'
import type { CareAction, PetType, PetMood, PetWithMood, PetMoodState } from '@/types/pet'
import type { Database } from '@/types/database'

type Client = SupabaseClient<Database>
type MoodRow = Database['public']['Tables']['pet_mood_state']['Row']
type PetRow = Database['public']['Tables']['couple_pets']['Row']

const supabase = createClient()

const UNIQUE_VIOLATION = '23505'

/**
 * Points every stat loses per hour without care. Tuned to the copy on the
 * mood screen: a well-cared pet (~80) turns "lonely" (<40 avg) after about a
 * day and "sad" (<20 avg) after about two days of neglect.
 */
export const DECAY_PER_HOUR = 1.25

export const XP_PER_ACTION = 10

export interface PetStats {
  hunger: number
  happiness: number
  cleanliness: number
  mood: PetMood
}

export async function getCouplePet(coupleId: string): Promise<PetWithMood | null> {
  const { data: pet } = await supabase
    .from('couple_pets')
    .select('*')
    .eq('couple_id', coupleId)
    .maybeSingle()

  if (!pet) return null

  const moodState = await ensureMoodState(pet.id)
  return { ...pet, mood_state: moodState } as PetWithMood
}

export async function getCareRoles(petId: string) {
  const { data } = await supabase
    .from('pet_care_roles')
    .select('*')
    .eq('pet_id', petId)
  return data || []
}

/** Care logs since 00:00 WIB today (not the device's local midnight) */
export async function getCareLogsToday(petId: string) {
  const startOfDay = new Date(`${todayJakarta()}T00:00:00+07:00`).toISOString()

  const { data } = await supabase
    .from('pet_care_logs')
    .select('*')
    .eq('pet_id', petId)
    .gte('done_at', startOfDay)
    .order('done_at', { ascending: false })

  return data || []
}

export async function getLastCareAction(petId: string, actionType: CareAction) {
  const { data } = await supabase
    .from('pet_care_logs')
    .select('done_at')
    .eq('pet_id', petId)
    .eq('action_type', actionType)
    .order('done_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return data?.done_at ? new Date(data.done_at) : null
}

/**
 * The pet's mood row, created if it is missing (an adoption that died half
 * way, or an old pet). One row per pet is enforced by a unique index, so a
 * concurrent create (23505) just means the row exists now.
 */
export async function ensureMoodState(petId: string): Promise<MoodRow> {
  const { data: existing, error: readError } = await supabase
    .from('pet_mood_state').select('*').eq('pet_id', petId).maybeSingle()
  if (readError) throw readError
  if (existing) return existing

  const { data: created, error } = await supabase
    .from('pet_mood_state')
    .insert({ pet_id: petId, updated_at: new Date().toISOString() })
    .select('*')
    .single()
  if (created) return created
  if (error?.code !== UNIQUE_VIOLATION) throw error ?? new Error('Gagal menyiapkan status pet')

  const { data: again, error: againError } = await supabase
    .from('pet_mood_state').select('*').eq('pet_id', petId).single()
  if (againError || !again) throw againError ?? new Error('Gagal menyiapkan status pet')
  return again
}

export interface AdoptResult {
  pet: PetRow
  /** true when the partner adopted first (simultaneous adoption) */
  alreadyAdopted: boolean
}

export async function adoptPet(
  coupleId: string,
  petType: PetType,
  name: string,
  userId: string,
  partnerId: string | null
): Promise<AdoptResult> {
  // One pet per couple is enforced by a unique index; if the partner adopted
  // at the same moment, load theirs instead of failing.
  const { data: pet, error: petError } = await supabase
    .from('couple_pets')
    .insert({ couple_id: coupleId, pet_type: petType, name })
    .select()
    .single()

  if (petError?.code === UNIQUE_VIOLATION) {
    const { data: existing } = await supabase
      .from('couple_pets').select('*').eq('couple_id', coupleId).maybeSingle()
    if (existing) return { pet: existing, alreadyAdopted: true }
  }
  if (petError || !pet) throw petError || new Error('Failed to create pet')

  // Mood row (23505 = it already exists, which is fine)
  const { error: moodError } = await supabase
    .from('pet_mood_state')
    .insert({ pet_id: pet.id, updated_at: new Date().toISOString() })

  if (moodError && moodError.code !== UNIQUE_VIOLATION) {
    // Cleanup pet if mood state fails
    await supabase.from('couple_pets').delete().eq('id', pet.id)
    throw moodError
  }

  // Assign care roles — split 6 actions between partners
  const shuffled = [...ALL_CARE_ACTIONS].sort(() => Math.random() - 0.5)
  const rows = partnerId
    ? [
        { couple_id: coupleId, pet_id: pet.id, profile_id: userId, actions: shuffled.slice(0, 3) },
        { couple_id: coupleId, pet_id: pet.id, profile_id: partnerId, actions: shuffled.slice(3) },
      ]
    : [{ couple_id: coupleId, pet_id: pet.id, profile_id: userId, actions: [...ALL_CARE_ACTIONS] }]

  const { error: rolesError } = await supabase.from('pet_care_roles').insert(rows)
  if (rolesError) {
    // Not fatal: the pet exists. The pet pages run ensureCareRoles() on every
    // load, which recreates missing roles (and never leaves anyone with none).
    await ensureCareRoles(supabase, pet.id, coupleId, partnerId ? [userId, partnerId] : [userId])
  }

  return { pet, alreadyAdopted: false }
}

/**
 * Who does which care action. Pure — the same input gives the same split on
 * both partners' devices.
 *  - duplicate role rows of one person are merged, unknown actions dropped
 *  - a member with no actions (e.g. joined after adoption) first gets actions
 *    nobody owns, otherwise half of the busiest member's actions
 *  - when nobody has anything, every member may do every action (shared)
 *  - actions owned by nobody are handed to the member with the fewest
 * Never returns an empty list for a member (memberIds must not be empty).
 */
export function resolveCareRoles(
  roles: { profile_id: string; actions: string[] | null }[],
  memberIds: string[]
): Record<string, CareAction[]> {
  const isAction = (a: string): a is CareAction => (ALL_CARE_ACTIONS as string[]).includes(a)
  const byMember: Record<string, CareAction[]> = {}
  if (memberIds.length === 0) return byMember
  for (const id of memberIds) byMember[id] = []
  for (const role of roles) {
    const list = byMember[role.profile_id]
    if (!list) continue // a former member's row
    for (const a of role.actions ?? []) if (isAction(a) && !list.includes(a)) list.push(a)
  }

  const assigned = new Set(memberIds.flatMap(id => byMember[id]))
  if (assigned.size === 0) {
    for (const id of memberIds) byMember[id] = [...ALL_CARE_ACTIONS]
    return byMember
  }

  for (const id of memberIds) {
    if (byMember[id].length > 0) continue
    const unowned = ALL_CARE_ACTIONS.filter(a => !assigned.has(a))
    if (unowned.length > 0) {
      byMember[id] = unowned
      unowned.forEach(a => assigned.add(a))
      continue
    }
    const donor = memberIds
      .filter(m => m !== id)
      .reduce((best, m) => (byMember[m].length > byMember[best].length ? m : best))
    const list = byMember[donor]
    if (list.length >= 2) {
      const keep = Math.ceil(list.length / 2)
      byMember[donor] = list.slice(0, keep)
      byMember[id] = list.slice(keep)
    } else {
      byMember[id] = [...list] // a single action is shared
    }
  }

  // Actions nobody owns any more (e.g. a former member's share) go to
  // whoever currently has the fewest, so every need can still be cared for
  for (const action of ALL_CARE_ACTIONS) {
    if (memberIds.some(id => byMember[id].includes(action))) continue
    const target = memberIds.reduce((least, m) => (byMember[m].length < byMember[least].length ? m : least))
    byMember[target].push(action)
  }
  return byMember
}

/**
 * Reads the pet's care roles, rebalances them when a member has none (partner
 * joined after adoption, failed role insert) and saves the result. Returns the
 * effective roles even if saving fails, so nobody is ever left without actions.
 */
export async function ensureCareRoles(
  client: Client,
  petId: string,
  coupleId: string,
  memberIds: string[]
): Promise<Record<string, CareAction[]>> {
  const { data: roles, error } = await client
    .from('pet_care_roles').select('id, profile_id, actions').eq('pet_id', petId)
  if (error || !roles) return resolveCareRoles([], memberIds)

  const resolved = resolveCareRoles(roles, memberIds)
  const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every(x => b.includes(x))

  for (const id of memberIds) {
    const mine = roles.filter(r => r.profile_id === id)
    const current = Array.from(new Set(mine.flatMap(r => r.actions ?? [])))
    if (mine.length === 1 && sameSet(current, resolved[id])) continue
    if (mine.length === 0) {
      await client.from('pet_care_roles').insert({ couple_id: coupleId, pet_id: petId, profile_id: id, actions: resolved[id] })
    } else {
      await client.from('pet_care_roles').update({ actions: resolved[id] }).eq('id', mine[0].id)
      const extra = mine.slice(1).map(r => r.id)
      if (extra.length > 0) await client.from('pet_care_roles').delete().in('id', extra)
    }
  }
  return resolved
}

/**
 * Applies a care action on the server (perform_pet_care RPC): it checks the
 * caller's role and the cooldown, starts from the DECAYED stats, restores one
 * stat, saves all three, logs the action and adds XP — atomically, so two
 * taps or two devices can't double-count. Returns the new stats for the UI.
 * The rules live in public.pet_care_rules(); CARE_ACTION_META and
 * DECAY_PER_HOUR mirror them for display (scripts/verify/pet-rules.mjs).
 */
export async function performCareAction(
  petId: string,
  actionType: CareAction,
  // Kept for call-site compatibility; the server uses the signed-in user.
  _profileId?: string,
  _meta?: typeof CARE_ACTION_META[CareAction]
): Promise<PetStats> {
  const { data, error } = await supabase.rpc('perform_pet_care', { p_pet_id: petId, p_action: actionType })
  if (error) throw new Error(error.message)
  const next = data as { hunger: number; happiness: number; cleanliness: number; mood: PetMood }
  return { hunger: next.hunger, happiness: next.happiness, cleanliness: next.cleanliness, mood: next.mood }
}

export function calculateMood(hunger: number, happiness: number, cleanliness: number): PetMood {
  const avg = (hunger + happiness + cleanliness) / 3
  if (avg >= 80) return 'thriving'
  if (avg >= 60) return 'happy'
  if (avg >= 40) return 'neutral'
  if (avg >= 20) return 'lonely'
  return 'sad'
}

export function getDecayedStats(moodState: Pick<PetMoodState, 'hunger' | 'happiness' | 'cleanliness' | 'updated_at'>): PetStats {
  const now = Date.now()
  const lastUpdate = new Date(moodState.updated_at).getTime()
  const hoursPassed = Number.isNaN(lastUpdate) ? 0 : (now - lastUpdate) / (1000 * 60 * 60)
  const decay = Math.max(0, Math.floor(hoursPassed * DECAY_PER_HOUR)) // clamped to non-negative

  const hunger = Math.max(0, moodState.hunger - decay)
  const happiness = Math.max(0, moodState.happiness - decay)
  const cleanliness = Math.max(0, moodState.cleanliness - decay)
  const mood = calculateMood(hunger, happiness, cleanliness)

  return { hunger, happiness, cleanliness, mood }
}
