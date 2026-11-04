import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { sendPushToProfile } from '@/lib/push-server'
import { PET_RULES, PET_TYPES, type PetErrorHint, type PetRow, type PetType } from '@/types/pet'

export const dynamic = 'force-dynamic'

const STATUS_FOR_HINT: Record<PetErrorHint, number> = {
  PET_AUTH: 401,
  PET_NO_COUPLE: 400,
  PET_CLOSED: 409,
  PET_NOT_FOUND: 404,
  PET_INVALID: 400,
}

/**
 * Adopt the couple's pet (adopt_pet RPC, the caller's own session), then tell
 * the partner: the one adoption push (spec 5.6, kind 'pet', so the partner's
 * Pet Kita switch and quiet hours apply). When the partner was faster, the
 * existing pet comes back with alreadyAdopted: true and nobody is notified.
 *
 * POST { type: 'cat' | 'dog', name } → 200 { pet, alreadyAdopted }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const type = typeof body?.type === 'string' ? body.type.trim().toLowerCase() : ''
    const name = typeof body?.name === 'string' ? body.name.replace(/\s+/g, ' ').trim() : ''
    if (!(PET_TYPES as readonly string[]).includes(type)) {
      return NextResponse.json({ error: 'Pick a cat or a dog' }, { status: 400 })
    }
    if (name.length < 1 || name.length > PET_RULES.limits.name_max) {
      return NextResponse.json({ error: 'Give your pet a name of 1 to 20 characters' }, { status: 400 })
    }

    const { data: membership, error: memberError } = await supabase
      .from('couple_members').select('couple_id').eq('profile_id', user.id).maybeSingle()
    if (memberError) throw new Error(memberError.message)
    if (!membership) return NextResponse.json({ error: 'You\'re not connected with a partner yet' }, { status: 400 })
    const coupleId = membership.couple_id

    // Whether a pet was already there decides who gets credit (and the push).
    const { data: before, error: beforeError } = await supabase
      .from('couple_pets').select('id').eq('couple_id', coupleId).maybeSingle()
    if (beforeError) throw new Error(beforeError.message)

    const { data: pet, error } = await supabase.rpc('adopt_pet', { p_type: type as PetType, p_name: name })
    if (error || !pet) {
      const hint = error?.hint as PetErrorHint | undefined
      if (hint && hint in STATUS_FOR_HINT) {
        return NextResponse.json({ error: error!.message }, { status: STATUS_FOR_HINT[hint] })
      }
      throw new Error(error?.message ?? 'adopt_pet returned nothing')
    }

    // The insert trigger writes "adopted a ..." with the inserting user as
    // actor, so this tells "I adopted it just now" apart from "my partner was
    // faster" even when both tapped at the same moment.
    let created = false
    if (!before) {
      const { data: mine } = await supabase
        .from('activities').select('id')
        .eq('couple_id', coupleId).eq('kind', 'pet').eq('ref_id', pet.id).eq('actor_id', user.id)
        .like('summary', 'adopted %')
        .limit(1)
      created = (mine?.length ?? 0) > 0
    }

    if (created) await notifyPartner(coupleId, user.id, pet as PetRow)
    return NextResponse.json({ pet, alreadyAdopted: !created })
  } catch (err) {
    console.error('[pet/adopt] error:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Couldn\'t adopt the pet. Try again.' }, { status: 500 })
  }
}

/** "Meet Mochi · Eric adopted a cat called Mochi. Come say hi." Never fails the adoption. */
async function notifyPartner(coupleId: string, userId: string, pet: PetRow) {
  try {
    const admin = createServiceRoleClient()
    const [{ data: members }, { data: me }] = await Promise.all([
      admin.from('couple_members').select('profile_id').eq('couple_id', coupleId),
      admin.from('profiles').select('name').eq('id', userId).maybeSingle(),
    ])
    const first = me?.name?.trim().split(/\s+/)[0] || 'Your partner'
    const payload = {
      title: `Meet ${pet.name}`,
      body: `${first} adopted a ${pet.pet_type} called ${pet.name}. Come say hi.`,
      url: '/app/pet',
    }
    for (const m of members ?? []) {
      if (m.profile_id === userId) continue
      await sendPushToProfile(m.profile_id, payload, 'pet')
    }
  } catch (err) {
    console.error('[pet/adopt] push failed:', err instanceof Error ? err.message : err)
  }
}
