import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { leaveCoupleAs } from '@/lib/account'
import { removeCoupleBucketPictures } from '@/lib/bucket'

export const dynamic = 'force-dynamic'

/**
 * Leave my couple (F01). Shared data stays with my partner, and the couple
 * is closed for good (no invite code, nobody can join it). If I was the last
 * member, including "Start fresh" on a closed couple, the couple is
 * deleted and its photos (Moments and bucket list pictures) are removed from
 * storage.
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
        { error: e instanceof Error ? e.message : 'Couldn\'t leave this couple' },
        { status: 400 }
      )
    }
    if (result.deleted) {
      // Best effort, like the Moments photos: the rows are already gone.
      try {
        await removeCoupleBucketPictures(createServiceRoleClient(), result.coupleId)
      } catch (e) {
        console.error('[couple/leave] bucket picture cleanup failed:', result.coupleId, e instanceof Error ? e.message : e)
      }
    }
    return NextResponse.json({ ok: true, deleted: result.deleted, coupleId: result.coupleId })
  } catch (err) {
    console.error('[couple/leave] unhandled:', err)
    return NextResponse.json({ error: 'Couldn\'t leave this couple. Try again.' }, { status: 500 })
  }
}
