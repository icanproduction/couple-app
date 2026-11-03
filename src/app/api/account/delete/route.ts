import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { DELETE_ACCOUNT_CONFIRM, isDeleteAccountConfirm, leaveCoupleAs, removeAvatarFiles } from '@/lib/account'

export const dynamic = 'force-dynamic'

/**
 * Delete my account for good (F02). Body: { confirm: 'DELETE ACCOUNT' }
 * (the pre-English phrase 'HAPUS AKUN' is still accepted).
 *
 * 1. Leave the couple as myself (so auth.uid() works in leave_couple); if I
 *    was the last member that deletes the couple and its photos.
 * 2. Remove my avatar files.
 * 3. Delete the auth user. The profile cascades away with it; shared rows I
 *    wrote (moments, transactions, events, bucket list) keep their data with
 *    the author set to null, so my partner keeps them.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { confirm } = await req.json().catch(() => ({}))
    if (!isDeleteAccountConfirm(confirm)) {
      return NextResponse.json({ error: `Type ${DELETE_ACCOUNT_CONFIRM} to confirm` }, { status: 400 })
    }

    const { data: membership, error: memberError } = await supabase
      .from('couple_members').select('couple_id').eq('profile_id', user.id).maybeSingle()
    if (memberError) {
      return NextResponse.json({ error: 'Couldn\'t check your couple. Try again.' }, { status: 500 })
    }
    if (membership) {
      try {
        await leaveCoupleAs(supabase)
      } catch (e) {
        return NextResponse.json(
          { error: e instanceof Error ? e.message : 'Couldn\'t leave this couple' },
          { status: 400 }
        )
      }
    }

    try {
      await removeAvatarFiles(user.id)
    } catch (e) {
      // Not worth keeping the account over: the avatar is a public file the
      // user asked to have gone, so log it for a manual sweep.
      console.error('[account/delete] avatar cleanup failed:', user.id, e instanceof Error ? e.message : e)
    }

    const admin = createServiceRoleClient()
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id)
    if (deleteError) {
      console.error('[account/delete] deleteUser failed:', deleteError.message)
      return NextResponse.json({ error: 'Couldn\'t delete your account. Try again.' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[account/delete] unhandled:', err)
    return NextResponse.json({ error: 'Couldn\'t delete your account. Try again.' }, { status: 500 })
  }
}
