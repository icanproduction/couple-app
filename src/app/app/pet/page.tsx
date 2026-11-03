import { redirect } from 'next/navigation'
import { createServerSupabaseClient, getServerUser } from '@/lib/supabase-server'
import { ensureCareRoles } from '@/lib/pet'
import PetRoom from '@/components/app/PetRoom'

export default async function PetPage() {
  const supabase = await createServerSupabaseClient()
  const user = await getServerUser(supabase)
  if (!user) redirect('/auth/login')

  // Get couple
  const { data: membership } = await supabase
    .from('couple_members')
    .select('couple_id')
    .eq('profile_id', user.id)
    .maybeSingle()

  if (!membership) redirect('/app/home')

  // Get pet (one per couple — unique index). Only a successful empty result
  // means "adopt"; a failed query must not bounce between /pet and /pet/adopt.
  const { data: pet, error: petError } = await supabase
    .from('couple_pets')
    .select('*')
    .eq('couple_id', membership.couple_id)
    .maybeSingle()

  if (petError) throw new Error("Couldn't load your pet")
  if (!pet) redirect('/app/pet/adopt')

  // Get mood state (may be missing — the first care action creates it)
  const { data: moodState } = await supabase
    .from('pet_mood_state')
    .select('*')
    .eq('pet_id', pet.id)
    .maybeSingle()

  // Care roles for both members; a partner who joined after adoption gets a
  // share instead of an empty list
  const { data: members } = await supabase
    .from('couple_members')
    .select('profile_id')
    .eq('couple_id', membership.couple_id)
  const memberIds = Array.from(new Set([user.id, ...(members ?? []).map(m => m.profile_id)]))
  const roles = await ensureCareRoles(supabase, pet.id, membership.couple_id, memberIds)

  return (
    <PetRoom
      pet={pet}
      moodState={moodState}
      myActions={roles[user.id] ?? []}
      userId={user.id}
      coupleId={membership.couple_id}
    />
  )
}
