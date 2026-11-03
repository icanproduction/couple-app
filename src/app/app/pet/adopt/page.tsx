import { redirect } from 'next/navigation'
import { createServerSupabaseClient, getServerUser } from '@/lib/supabase-server'
import PetAdoptScreen from '@/components/app/PetAdoptScreen'

export default async function AdoptPage() {
  const supabase = await createServerSupabaseClient()
  const user = await getServerUser(supabase)
  if (!user) redirect('/auth/login')

  const { data: membership } = await supabase
    .from('couple_members')
    .select('couple_id')
    .eq('profile_id', user.id)
    .maybeSingle()

  if (!membership) redirect('/app/home')

  // Already has pet? Go to pet room. (maybeSingle: only an actual pet row
  // redirects, so a query error can't create a /pet <-> /pet/adopt loop.)
  const { data: pet, error: petError } = await supabase
    .from('couple_pets')
    .select('id')
    .eq('couple_id', membership.couple_id)
    .maybeSingle()

  if (petError) throw new Error("Couldn't load your pet")
  if (pet) redirect('/app/pet')

  // Get partner ID
  const { data: partnerMember } = await supabase
    .from('couple_members')
    .select('profile_id')
    .eq('couple_id', membership.couple_id)
    .neq('profile_id', user.id)
    .maybeSingle()

  return (
    <PetAdoptScreen
      coupleId={membership.couple_id}
      userId={user.id}
      partnerId={partnerMember?.profile_id || null}
    />
  )
}
