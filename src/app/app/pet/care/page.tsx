import { redirect } from 'next/navigation'
import { createServerSupabaseClient, getServerUser } from '@/lib/supabase-server'
import { ensureCareRoles } from '@/lib/pet'
import PetCareScreen from '@/components/app/PetCareScreen'

export default async function CarePage() {
  const supabase = await createServerSupabaseClient()
  const user = await getServerUser(supabase)
  if (!user) redirect('/auth/login')

  const { data: membership } = await supabase
    .from('couple_members')
    .select('couple_id')
    .eq('profile_id', user.id)
    .maybeSingle()

  if (!membership) redirect('/app/home')

  const { data: pet, error: petError } = await supabase
    .from('couple_pets')
    .select('*')
    .eq('couple_id', membership.couple_id)
    .maybeSingle()

  if (petError) throw new Error("Couldn't load your pet")
  if (!pet) redirect('/app/pet/adopt')

  // Get partner profile
  const { data: partnerMember } = await supabase
    .from('couple_members')
    .select('profile_id')
    .eq('couple_id', membership.couple_id)
    .neq('profile_id', user.id)
    .maybeSingle()

  let partnerName = 'Partner'
  if (partnerMember) {
    const { data: partnerProfile } = await supabase
      .from('profiles')
      .select('name')
      .eq('id', partnerMember.profile_id)
      .maybeSingle()
    partnerName = partnerProfile?.name || 'Partner'
  }

  // Effective care roles — rebalanced when a member has none
  const memberIds = partnerMember ? [user.id, partnerMember.profile_id] : [user.id]
  const roles = await ensureCareRoles(supabase, pet.id, membership.couple_id, memberIds)

  return (
    <PetCareScreen
      pet={pet}
      myActions={roles[user.id] ?? []}
      partnerActions={partnerMember ? roles[partnerMember.profile_id] ?? [] : []}
      userId={user.id}
      partnerId={partnerMember?.profile_id || null}
      partnerName={partnerName}
    />
  )
}
