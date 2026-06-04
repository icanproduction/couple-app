import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'

/**
 * Unlock premium for the current user's couple.
 *
 * DUMMY PAYMENT MODE: while `PAYMENT_DUMMY` !== 'false' (default ON), this
 * unlocks instantly with no real charge — for QA / soft launch. To wire a real
 * gateway later (Midtrans/Xendit), set PAYMENT_DUMMY=false and implement the
 * order/redirect + webhook that flips `couples.is_premium` on payment success.
 */
export async function POST() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: membership } = await supabase
      .from('couple_members').select('couple_id').eq('profile_id', user.id).single()
    if (!membership?.couple_id) {
      return NextResponse.json({ error: 'Belum punya pasangan' }, { status: 400 })
    }

    const dummy = process.env.PAYMENT_DUMMY !== 'false' // default ON
    if (!dummy) {
      return NextResponse.json(
        { error: 'Payment gateway belum dikonfigurasi' },
        { status: 501 }
      )
    }

    // Service role: flip premium regardless of couples RLS update policy.
    const admin = createServiceRoleClient()
    const { error } = await admin
      .from('couples')
      .update({ is_premium: true, unlocked_at: new Date().toISOString() })
      .eq('id', membership.couple_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true, isPremium: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
