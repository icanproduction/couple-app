import { redirect } from 'next/navigation'
import { createServerSupabaseClient, getServerUser } from '@/lib/supabase-server'
import PetMoodScreen from '@/components/app/PetMoodScreen'

export default async function MoodPage() {
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

  const { data: moodState } = await supabase
    .from('pet_mood_state')
    .select('*')
    .eq('pet_id', pet.id)
    .maybeSingle()

  return (
    <PetMoodScreen
      pet={pet}
      moodState={moodState}
    />
  )
}
