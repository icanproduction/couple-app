import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { isPushKind, isSafeAppPath, sendPushToProfile } from '@/lib/push-server'

const MAX_TITLE = 80
const MAX_BODY = 240
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Notify one person. Allowed only to your own partner, or to anyone when the
 * caller is an admin (broadcast from /admin/notifications). Non-admins must
 * say which `kind` it is, so the recipient's switches in /app/profile/notifikasi apply.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { recipientId, title, body, url, kind } = await req.json().catch(() => ({}))
    if (kind !== undefined && !isPushKind(kind)) {
      return NextResponse.json({ error: 'Unknown notification type' }, { status: 400 })
    }
    if (typeof recipientId !== 'string' || !UUID.test(recipientId) ||
        typeof title !== 'string' || !title.trim() ||
        typeof body !== 'string' || !body.trim()) {
      return NextResponse.json({ error: 'The notification is missing some details' }, { status: 400 })
    }
    if (url !== undefined && !isSafeAppPath(url)) {
      return NextResponse.json({ error: 'The notification link must point to a page in this app' }, { status: 400 })
    }

    const [{ data: isAdmin }, { data: isPartner }] = await Promise.all([
      supabase.rpc('is_admin'),
      supabase.rpc('shares_couple_with', { pid: recipientId }),
    ])
    // Without a kind the recipient's per-kind switches can't apply, so only
    // admins may leave it out.
    if (kind === undefined && !isAdmin) {
      return NextResponse.json({ error: 'A notification type is required' }, { status: 400 })
    }
    if (!isAdmin && (!isPartner || recipientId === user.id)) {
      return NextResponse.json({ error: 'You can only send notifications to your partner' }, { status: 403 })
    }
    // 'admin' skips the recipient's per-kind switches, so only admins may use it.
    if (kind === 'admin' && !isAdmin) {
      return NextResponse.json({ error: 'This notification type isn\'t allowed' }, { status: 403 })
    }

    const result = await sendPushToProfile(recipientId, {
      title: title.trim().slice(0, MAX_TITLE),
      body: body.trim().slice(0, MAX_BODY),
      url: url ?? '/app/home',
    }, kind)
    if (!result) {
      return NextResponse.json({ error: 'Notifications aren\'t set up yet' }, { status: 503 })
    }
    return NextResponse.json(result)
  } catch (err) {
    console.error('[push/send] unhandled:', err)
    return NextResponse.json({ error: 'Couldn\'t send the notification' }, { status: 500 })
  }
}
