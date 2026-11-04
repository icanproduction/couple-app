import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { claudeConfigured } from '@/lib/claude'
import {
  MIN_PERSONAL_FACTS, SAMAKAN_AI_TIMEOUT_MS, bankPlan, claimRoundsSlot, fitsDailyCap, loadPersonalContext,
  roundsWorstCaseUsd, samakanBudget, writePersonalSet, type SetPlan,
} from '@/lib/samakan-ai'
import { BANK_THEMES, errorCode, parseHistory, parseHub, parseLiveInviteResult } from '@/components/games/samakan/logic'
import type {
  SamakanBankTheme, SamakanFallbackReason, SamakanHistory, SamakanLiveInvite, SamakanSource, SamakanTheme,
} from '@/types/samakan'
import { codeError, jsonError, nameOf, rpcError, samakanPush, type Db, type PushOutcome } from '../_lib/server'

export const dynamic = 'force-dynamic'
// The personal set waits up to 12 s on the model.
export const maxDuration = 30

const START_ERROR = 'Couldn\'t start the set. Try again.'
const MIXED_NOTICE = 'Couldn\'t write personal rounds this time, so here\'s a mixed set.'

/** The line the hub shows when "For you two" became a bank set. */
const NOTICE: Readonly<Record<SamakanFallbackReason, string>> = {
  daily_limit: 'Today\'s personal set is done. Back tomorrow. Here\'s a mixed set for now.',
  personal_off: 'Personal rounds are off for you two, so here\'s a mixed set.',
  no_data: 'Answer a few Daily Questions first and these get personal. Here\'s a mixed set for now.',
  cap: MIXED_NOTICE,
  timeout: MIXED_NOTICE,
  error: MIXED_NOTICE,
  refusal: MIXED_NOTICE,
  max_tokens: MIXED_NOTICE,
  invalid: MIXED_NOTICE,
}

type StartBody = {
  id: string
  existing: boolean
  source: SamakanSource
  theme: SamakanTheme
  fallbackReason: SamakanFallbackReason | null
  notice: string | null
  push: PushOutcome | null
  invite: SamakanLiveInvite | null
}

/** A personal request that should end on the set another request is writing. */
type Wait = { wait: true }

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function openSetId(admin: Db, coupleId: string): Promise<string | null> {
  const { data } = await admin.from('samakan_sets').select('id')
    .eq('couple_id', coupleId).eq('status', 'open').maybeSingle()
  return (data as { id?: string } | null)?.id ?? null
}

/** A double tap (or both partners at once): wait for the other request's set. */
async function waitForOpenSet(admin: Db, coupleId: string, until: number): Promise<string | null> {
  while (Date.now() < until) {
    const id = await openSetId(admin, coupleId)
    if (id) return id
    await sleep(400)
  }
  return openSetId(admin, coupleId)
}

async function existingReply(admin: Db, id: string) {
  const { data } = await admin.from('samakan_sets').select('id, source, theme, fallback_reason').eq('id', id).maybeSingle()
  const row = (data ?? { id, source: 'bank', theme: 'mixed', fallback_reason: null }) as {
    id: string; source: SamakanSource; theme: SamakanTheme; fallback_reason: SamakanFallbackReason | null
  }
  const body: StartBody = {
    id: row.id, existing: true, source: row.source, theme: row.theme, fallbackReason: row.fallback_reason,
    notice: null, push: null, invite: null,
  }
  return NextResponse.json(body)
}

/**
 * Start a Samakan set (or land on the open one).
 *
 * Body: { theme: 'personal' | 'food' | 'weekends' | 'home' | 'travel' | 'habits' | 'plans' | 'mixed', playNow?: boolean }
 *
 * Order: the hub first (an open set, either partner's, comes back as is with
 * no AI call and no push), then for "personal": the couple switch, today's
 * personal set, today's Samakan budget, the couple's facts, one Sonnet call.
 * Every failure becomes a bank set with a fallback reason. Rounds are written
 * once (samakan_insert_set) before any push, so both phones get the same set.
 * Then one push to the partner: "start", or with playNow a live invite and
 * only the "live" push.
 */
export async function POST(req: Request) {
  const started = Date.now()
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return codeError('SK_AUTH')

    const body = (await req.json().catch(() => null)) as { theme?: unknown; playNow?: unknown } | null
    const theme = typeof body?.theme === 'string' ? body.theme : ''
    const isBankTheme = (BANK_THEMES as readonly string[]).includes(theme) || theme === 'mixed'
    if (theme !== 'personal' && !isBankTheme) return jsonError(400, 'Pick a set to start.', { code: 'SK_INVALID' })
    const playNow = body?.playNow === true

    const hubReply = await supabase.rpc('samakan_hub')
    if (hubReply.error) return rpcError(hubReply.error, 'hub')
    const hub = parseHub(hubReply.data)
    if (!hub.coupleId) return codeError('SK_NO_PARTNER')
    if (hub.closed) return codeError('SK_CLOSED')
    if (!hub.hasPartner || !hub.partnerId) return codeError('SK_NO_PARTNER')
    const coupleId = hub.coupleId
    const partnerId = hub.partnerId

    const admin = createServiceRoleClient() as unknown as Db
    if (hub.openSet) return existingReply(admin, hub.openSet.id)

    const historyReply = await admin.rpc('samakan_history', { p_couple: coupleId })
    if (historyReply.error) return rpcError(historyReply.error, 'history')
    const history = parseHistory(historyReply.data)

    let plan: SetPlan | Wait
    if (theme === 'personal') {
      plan = await planPersonal(admin, { coupleId, userId: user.id, partnerId, history, hub, started })
    } else {
      plan = bankPlan(theme as SamakanBankTheme | 'mixed', history, null)
    }

    if ('wait' in plan) {
      const id = await waitForOpenSet(admin, coupleId, started + 14_000)
      if (id) return existingReply(admin, id)
      plan = bankPlan('mixed', history, 'daily_limit')
    }

    let insert = await insertSet(admin, coupleId, user.id, plan)
    if (insert.error && plan.source === 'ai') {
      // The partner switched personal rounds off, or an AI set already landed today.
      const code = errorCode(insert.error)
      if (code === 'SK_DAILY_LIMIT' || code === 'SK_PERSONAL_OFF') {
        plan = bankPlan('mixed', history, code === 'SK_DAILY_LIMIT' ? 'daily_limit' : 'personal_off')
        insert = await insertSet(admin, coupleId, user.id, plan)
      }
    }
    if (insert.error) return rpcError(insert.error, 'insert')
    const inserted = (insert.data ?? {}) as { id?: string; existing?: boolean }
    if (typeof inserted.id !== 'string') return jsonError(500, START_ERROR)
    if (inserted.existing) return existingReply(admin, inserted.id)
    const setId = inserted.id

    // One push to the partner. With "Play now together" the live push replaces
    // the start push; if the invite can't be made (3 a day), the start push goes.
    const name = await nameOf(admin, user.id)
    let invite: SamakanLiveInvite | null = null
    let push: PushOutcome | null = null
    if (playNow) {
      const live = await supabase.rpc('samakan_live_invite', { p_set_id: setId })
      if (!live.error) {
        const parsed = parseLiveInviteResult(live.data)
        invite = parsed.invite
        if (parsed.created) {
          push = await samakanPush(admin, { setId, recipientId: partnerId, kind: 'live', name, inviteId: invite.id })
        }
      }
    }
    if (!invite) push = await samakanPush(admin, { setId, recipientId: partnerId, kind: 'start', name })

    const reply: StartBody = {
      id: setId,
      existing: false,
      source: plan.source,
      theme: plan.theme,
      fallbackReason: plan.reason,
      notice: theme === 'personal' && plan.reason ? NOTICE[plan.reason] : null,
      push,
      invite,
    }
    return NextResponse.json(reply, { status: 201 })
  } catch (err) {
    console.error('[samakan/sets] error:', err instanceof Error ? err.message : 'unknown')
    return jsonError(500, START_ERROR)
  }
}

function insertSet(admin: Db, coupleId: string, creator: string, plan: SetPlan) {
  return admin.rpc('samakan_insert_set', {
    p_couple: coupleId,
    p_creator: creator,
    p_source: plan.source,
    p_theme: plan.theme,
    p_reason: plan.reason,
    p_rounds: plan.rounds,
  })
}

/**
 * "For you two". No couple data is read unless the switch is on, today's
 * personal set is unused, the budget allows a call and the key is set.
 */
async function planPersonal(
  admin: Db,
  o: { coupleId: string; userId: string; partnerId: string; history: SamakanHistory; hub: ReturnType<typeof parseHub>; started: number },
): Promise<SetPlan | Wait> {
  if (!o.hub.personal.enabled) return bankPlan('mixed', o.history, 'personal_off')
  if (o.hub.personal.usedToday) return bankPlan('mixed', o.history, 'daily_limit')

  // A database hiccup here never blocks the game: no call without a checked
  // budget ("cap"), no call without facts ("no_data"). Neither uses up the day.
  let budget: Awaited<ReturnType<typeof samakanBudget>>
  try {
    budget = await samakanBudget(admin, o.coupleId)
  } catch (err) {
    console.error('[samakan/sets] budget check failed:', err instanceof Error ? err.message : 'unknown')
    return bankPlan('mixed', o.history, 'cap')
  }
  if (budget.roundsInFlight > 0) return { wait: true }
  if (budget.roundsCalls > 0) return bankPlan('mixed', o.history, 'daily_limit')
  if (!claudeConfigured()) return bankPlan('mixed', o.history, 'error')

  let context: Awaited<ReturnType<typeof loadPersonalContext>>
  try {
    context = await loadPersonalContext(admin, {
      coupleId: o.coupleId, firstId: o.userId, secondId: o.partnerId, history: o.history,
    })
  } catch (err) {
    console.error('[samakan/sets] context read failed:', err instanceof Error ? err.message : 'unknown')
    return bankPlan('mixed', o.history, 'no_data')
  }
  if (context.facts < MIN_PERSONAL_FACTS) return bankPlan('mixed', o.history, 'no_data')
  if (!fitsDailyCap(budget, roundsWorstCaseUsd(context))) return bankPlan('mixed', o.history, 'cap')

  // One call per couple at a time: a second tap waits for the first one's set.
  let slot: Awaited<ReturnType<typeof claimRoundsSlot>>
  try {
    slot = await claimRoundsSlot(admin, o.coupleId)
  } catch (err) {
    console.error('[samakan/sets] rounds slot failed:', err instanceof Error ? err.message : 'unknown')
    return bankPlan('mixed', o.history, 'cap')
  }
  if (slot === 'busy') return { wait: true }
  if (slot === 'cap') return bankPlan('mixed', o.history, 'cap')
  await slot.release()

  // The whole request stays near 12 s, context reads included.
  const timeoutMs = Math.max(2_000, Math.min(SAMAKAN_AI_TIMEOUT_MS, SAMAKAN_AI_TIMEOUT_MS - (Date.now() - o.started)))
  const result = await writePersonalSet({ coupleId: o.coupleId, context, history: o.history, timeoutMs })
  if ('busy' in result) return { wait: true }
  // Reason codes only: never the context or the model's text.
  if (result.reason) console.warn('[samakan/sets] personal set fell back to the bank:', result.reason)
  return result
}
