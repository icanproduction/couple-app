import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { leaveCoupleAs } from '@/lib/account'

export const dynamic = 'force-dynamic'

/**
 * Leave my couple (F01). Shared data stays with my partner, and the couple
 * is closed for good (no invite code, nobody can join it). If I was the last
 * member — including "Mulai lembaran baru" on a closed couple — the couple is
 * deleted and its photos are removed from storage.
 */
export async function POST() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let result
    try {
      result = await leaveCoupleAs(supabase)
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Gagal keluar dari pasangan' },
        { status: 400 }
      )
    }
    return NextResponse.json({ ok: true, deleted: result.deleted, coupleId: result.coupleId })
  } catch (err) {
    console.error('[couple/leave] unhandled:', err)
    return NextResponse.json({ error: 'Gagal keluar dari pasangan, coba lagi' }, { status: 500 })
  }
}
