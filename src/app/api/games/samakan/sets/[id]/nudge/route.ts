import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { NUDGE_AFTER_HOURS, parseSetState } from '@/components/games/samakan/logic'
import {
  GENERIC_ERROR, UUID_RE, codeError, jsonError, nameOf, partnerOf, rpcError, samakanPush, type Db,
} from '../../../_lib/server'

export const dynamic = 'force-dynamic'

/**
 * The one nudge per set: "{name}'s still waiting on your Samakan answers."
 * Allowed 3 hours after the set started, while it's open and the partner
 * still has rounds left. samakan_claim_push holds the same rules (and the
 * 3-a-day cap), so racing taps can't send two.
 *
 * Reply: 200 { push } when sent, or held by the partner's settings
 * (push.reason 'muted': switched off or quiet hours; nothing is used up, so
 * it can be tried again later) · 409/429 { error, code } when not allowed.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return codeError('SK_AUTH')
    const setId = params.id
    if (!UUID_RE.test(setId ?? '')) return codeError('SK_NOT_FOUND')

    const stateReply = await supabase.rpc('samakan_set_state', { p_set_id: setId })
    if (stateReply.error) return rpcError(stateReply.error, 'set state')
    const { set } = parseSetState(stateReply.data)
    if (set.status !== 'open') return codeError('SK_ENDED')

    const admin = createServiceRoleClient() as unknown as Db
    const { data: row } = await admin.from('samakan_sets').select('couple_id').eq('id', setId).single()
    const coupleId = (row as { couple_id?: string } | null)?.couple_id
    const partnerId = coupleId ? await partnerOf(admin, coupleId, user.id) : null
    if (!partnerId) return codeError('SK_NO_PARTNER')
    const partnerName = await nameOf(admin, partnerId)

    const refusal = (reason: string | null) => {
      switch (reason) {
        case 'too_soon':
          return jsonError(409, `You can nudge ${NUDGE_AFTER_HOURS} hours after the set starts.`, { code: 'TOO_SOON', nudgeAt: set.nudgeAt })
        case 'duplicate':
          return jsonError(409, 'You\'ve already nudged for this set.', { code: 'NUDGED' })
        case 'finished':
          return jsonError(409, `${partnerName} has answered every round already.`, { code: 'FINISHED' })
        case 'daily_cap':
          return jsonError(429, `${partnerName} has had enough Samakan notifications today. Try again tomorrow.`, { code: 'DAILY_CAP' })
        case 'not_open':
          return codeError('SK_ENDED')
        default:
          return null
      }
    }

    // The same rules the claim enforces, answered before touching it.
    if (Date.now() < new Date(set.nudgeAt).getTime()) return refusal('too_soon')!
    if (set.nudged) return refusal('duplicate')!
    if (set.progress.partner >= set.total) return refusal('finished')!

    const push = await samakanPush(admin, { setId, recipientId: partnerId, kind: 'nudge', name: await nameOf(admin, user.id) })
    if (!push.sent) {
      const refused = refusal(push.reason)
      if (refused) return refused
    }
    return NextResponse.json({ push })
  } catch (err) {
    console.error('[samakan/nudge] error:', err instanceof Error ? err.message : 'unknown')
    return jsonError(500, GENERIC_ERROR)
  }
}
