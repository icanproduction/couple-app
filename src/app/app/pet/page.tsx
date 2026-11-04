import { redirect } from 'next/navigation'
import { createServerSupabaseClient, getServerUser } from '@/lib/supabase-server'
import { parseStatus } from '@/components/pet/parse'
import PetHome from '@/components/app/PetHome'

export const metadata = { title: 'Pet Kita · Nanti Kita' }

export default async function PetPage() {
  const supabase = await createServerSupabaseClient()
  const user = await getServerUser(supabase)
  if (!user) redirect('/auth/login')

  const { data: membership } = await supabase
    .from('couple_members')
    .select('couple_id')
    .eq('profile_id', user.id)
    .maybeSingle()
  if (!membership) redirect('/app/home')

  // pet_status() is the only source of the pet's state (computed in the
  // database, Jakarta time). Null = no pet yet; an error must not bounce
  // between /pet and /pet/adopt, so it goes to the error page instead.
  const { data: raw, error } = await supabase.rpc('pet_status', {})
  if (error) throw new Error("Couldn't load your pet")
  const status = parseStatus(raw)
  if (!status) redirect('/app/pet/adopt')

  const [{ data: couple }, { data: members }] = await Promise.all([
    supabase.from('couples').select('closed_at').eq('id', membership.couple_id).maybeSingle(),
    supabase.from('couple_members').select('profile_id').eq('couple_id', membership.couple_id),
  ])
  const ids = Array.from(new Set([user.id, ...(members ?? []).map((m) => m.profile_id)]))
  const { data: profiles } = await supabase.from('profiles').select('id, name, gender').in('id', ids)

  const names: Record<string, string> = {}
  let partnerGender: string | null = null
  for (const p of profiles ?? []) {
    names[p.id] = p.name ?? (p.id === user.id ? 'You' : 'Your partner')
    if (p.id !== user.id) partnerGender = p.gender ?? null
  }
  const partnerId = ids.find((id) => id !== user.id) ?? null

  return (
    <PetHome
      initialStatus={status}
      userId={user.id}
      coupleId={membership.couple_id}
      names={names}
      partnerId={partnerId}
      partnerGender={partnerGender}
      closed={!!couple?.closed_at}
    />
  )
}
