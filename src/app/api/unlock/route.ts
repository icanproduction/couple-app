import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'

/**
 * Unlock premium for the current user's couple.
 *
 * DUMMY PAYMENT MODE is opt-in: only when PAYMENT_DUMMY=true does this unlock
 * instantly with no charge (QA / soft launch). Unset or anything else fails
 * closed with 501 until a real gateway (Midtrans/Xendit) is wired: an
 * order/redirect here plus a verified webhook that flips `couples.is_premium`.
 */
export async function POST() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: membership } = await supabase
      .from('couple_members').select('couple_id').eq('profile_id', user.id).maybeSingle()
    if (!membership?.couple_id) {
      return NextResponse.json({ error: 'You\'re not connected with a partner yet' }, { status: 400 })
    }

    if (process.env.PAYMENT_DUMMY?.trim() !== 'true') {
      return NextResponse.json(
        { error: 'Payments aren\'t available yet. Try again later.' },
        { status: 501 }
      )
    }

    // Service role: members have no UPDATE policy on couples by design.
    const admin = createServiceRoleClient()
    const { error } = await admin
      .from('couples')
      .update({ is_premium: true, unlocked_at: new Date().toISOString() })
      .eq('id', membership.couple_id)

    if (error) {
      console.error('[unlock] update failed:', error.message)
      return NextResponse.json({ error: 'Couldn\'t turn on Premium. Try again.' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, isPremium: true })
  } catch (err) {
    console.error('[unlock] unhandled:', err)
    return NextResponse.json({ error: 'Couldn\'t turn on Premium. Try again.' }, { status: 500 })
  }
}
