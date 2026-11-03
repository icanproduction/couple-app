import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { COUPLE_HAS_DATA, JoinError, joinCoupleAs } from '@/lib/account'
import { cleanInviteCode } from '@/app/onboarding/steps'

export const dynamic = 'force-dynamic'

/**
 * Join my partner's couple with their invite code: { code, discard? }.
 * If I'm waiting alone in a couple that already holds memories, the first
 * call answers 409 { code: 'COUPLE_HAS_DATA' }; the app asks me to confirm
 * and retries with discard: true. The couple I leave behind is deleted by
 * the database and its photos are removed from storage here.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => null)
    const code = cleanInviteCode(typeof body?.code === 'string' ? body.code : '')
    if (!code) return NextResponse.json({ error: 'Enter an invite code' }, { status: 400 })
    if (body.discard !== undefined && typeof body.discard !== 'boolean') {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    try {
      const result = await joinCoupleAs(supabase, user.id, code, body.discard === true)
      return NextResponse.json({ ok: true, coupleId: result.coupleId, discarded: result.discardedCoupleId !== null })
    } catch (e) {
      if (e instanceof JoinError && e.code === COUPLE_HAS_DATA) {
        return NextResponse.json({ error: e.message, code: COUPLE_HAS_DATA }, { status: 409 })
      }
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Couldn\'t join' }, { status: 400 })
    }
  } catch (err) {
    console.error('[couple/join] unhandled:', err)
    return NextResponse.json({ error: 'Couldn\'t join. Try again.' }, { status: 500 })
  }
}
