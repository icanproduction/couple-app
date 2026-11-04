import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { parseLiveInviteResult } from '@/components/games/samakan/logic'
import { GENERIC_ERROR, UUID_RE, codeError, jsonError, nameOf, rpcError, samakanPush, type Db, type PushOutcome } from '../../../_lib/server'

export const dynamic = 'force-dynamic'

/**
 * "Play now together": ask the partner to open this set right now.
 * samakan_live_invite decides (10-minute invite, 3 a day per sender); only a
 * newly created invite sends the one "live" push. Asking again while yours is
 * live, or answering an invite your partner sent (joined), sends nothing.
 *
 * Reply: 200 { invite, created, joined, push }
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return codeError('SK_AUTH')
    const setId = params.id
    if (!UUID_RE.test(setId ?? '')) return codeError('SK_NOT_FOUND')

    const reply = await supabase.rpc('samakan_live_invite', { p_set_id: setId })
    if (reply.error) return rpcError(reply.error, 'live invite')
    const { invite, created, joined } = parseLiveInviteResult(reply.data)

    let push: PushOutcome | null = null
    if (created && invite.recipientId) {
      const admin = createServiceRoleClient() as unknown as Db
      push = await samakanPush(admin, {
        setId, recipientId: invite.recipientId, kind: 'live', name: await nameOf(admin, user.id), inviteId: invite.id,
      })
    }
    return NextResponse.json({ invite, created, joined, push })
  } catch (err) {
    console.error('[samakan/live] error:', err instanceof Error ? err.message : 'unknown')
    return jsonError(500, GENERIC_ERROR)
  }
}
