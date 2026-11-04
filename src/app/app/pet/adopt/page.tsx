import { redirect } from 'next/navigation'
import { createServerSupabaseClient, getServerUser } from '@/lib/supabase-server'
import { parseStatus } from '@/components/pet/parse'
import PetAdoptScreen from '@/components/app/PetAdoptScreen'

export const metadata = { title: 'Adopt Pet Kita · Nanti Kita' }

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

  // Already has a pet: go to it. Only a real pet redirects, so a failed query
  // can't loop between /pet and /pet/adopt.
  const { data: raw, error } = await supabase.rpc('pet_status', {})
  if (error) throw new Error("Couldn't load your pet")
  if (parseStatus(raw)) redirect('/app/pet')

  const { data: members } = await supabase
    .from('couple_members')
    .select('profile_id')
    .eq('couple_id', membership.couple_id)
  const partnerId = (members ?? []).map((m) => m.profile_id).find((id) => id !== user.id) ?? null
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name')
    .in('id', partnerId ? [partnerId] : [])
  const nameOf = (id: string | null) => profiles?.find((p) => p.id === id)?.name ?? null

  return (
    <PetAdoptScreen
      coupleId={membership.couple_id}
      partnerId={partnerId}
      partnerName={nameOf(partnerId)}
    />
  )
}
