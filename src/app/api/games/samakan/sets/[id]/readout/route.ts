import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import {
  firstName, safeTemplateReadout, samakanBudget, writeReadout, type ReadoutRound,
} from '@/lib/samakan-ai'
import { parseSetState } from '@/components/games/samakan/logic'
import type { SamakanKind, SamakanReadout, SamakanTheme } from '@/types/samakan'
import { GENERIC_ERROR, UUID_RE, codeError, jsonError, nameOf, rpcError, samakanPush, type Db, type PushOutcome } from '../../../_lib/server'

export const dynamic = 'force-dynamic'
// The read-out waits up to 12 s on the model.
export const maxDuration = 30

type RoundRow = {
  id: string; position: number; kind: SamakanKind; prompt: string; options: string[] | null
  low_label: string | null; high_label: string | null; talk: string | null
  skipped_at: string | null; revealed_at: string | null
}
type AnswerRow = { round_id: string; profile_id: string | null; pick: number; guess: number | null }

/**
 * The read-out of a finished set: at most one per set (samakan_claim_readout),
 * by Sonnet within today's limits, otherwise the template. Only for sets that
 * are done, so every answer it reads is already revealed to both.
 *
 * The final answerer's client calls this; its call also sends the "finish"
 * push to the partner (skipped when they answered in the last 2 minutes,
 * because they're watching live). Results views that find no read-out call
 * it too; their calls never push.
 *
 * Reply: 200 { readout, pending: false, push } · 202 { readout: null, pending: true, push }
 * when another request is writing it (ask again in a few seconds).
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return codeError('SK_AUTH')
    const setId = params.id
    if (!UUID_RE.test(setId ?? '')) return codeError('SK_NOT_FOUND')

    // Membership and status through the caller's own view of the set.
    const stateReply = await supabase.rpc('samakan_set_state', { p_set_id: setId })
    if (stateReply.error) return rpcError(stateReply.error, 'set state')
    const state = parseSetState(stateReply.data)
    if (state.set.status !== 'done') {
      return jsonError(409, 'This set isn\'t finished yet.', { code: 'NOT_DONE' })
    }

    const admin = createServiceRoleClient() as unknown as Db
    const { data: setRow, error: setError } = await admin.from('samakan_sets')
      .select('couple_id, theme, finished_by').eq('id', setId).single()
    if (setError || !setRow) return rpcError(setError, 'set row')
    const row = setRow as { couple_id: string; theme: SamakanTheme; finished_by: string | null }

    let readout: SamakanReadout | null = state.set.readout
    let pending = false
    if (!readout) {
      const claim = await admin.rpc('samakan_claim_readout', { p_set_id: setId })
      if (claim.error) return rpcError(claim.error, 'readout claim')
      if (claim.data === true) {
        readout = await composeAndSave(admin, { setId, coupleId: row.couple_id, theme: row.theme, me: user.id })
      } else {
        readout = await savedReadout(admin, setId)
        pending = !readout
      }
    }

    let push: PushOutcome | null = null
    if (row.finished_by === user.id) {
      const { data: members } = await admin.from('couple_members').select('profile_id')
        .eq('couple_id', row.couple_id).neq('profile_id', user.id).limit(1)
      const partnerId = ((members ?? []) as Array<{ profile_id: string }>)[0]?.profile_id
      if (partnerId) {
        push = await samakanPush(admin, { setId, recipientId: partnerId, kind: 'finish', name: await nameOf(admin, user.id) })
      }
    }

    return NextResponse.json({ readout, pending, push }, { status: pending ? 202 : 200 })
  } catch (err) {
    console.error('[samakan/readout] error:', err instanceof Error ? err.message : 'unknown')
    return jsonError(500, GENERIC_ERROR)
  }
}

async function savedReadout(admin: Db, setId: string): Promise<SamakanReadout | null> {
  const { data } = await admin.from('samakan_sets').select('readout, readout_status').eq('id', setId).maybeSingle()
  const r = data as { readout: SamakanReadout | null; readout_status: string } | null
  return r?.readout_status === 'done' && r.readout ? r.readout : null
}

/** Holds the claim: writes the read-out (AI or template) and saves it. */
async function composeAndSave(
  admin: Db,
  o: { setId: string; coupleId: string; theme: SamakanTheme; me: string },
): Promise<SamakanReadout | null> {
  let rounds: ReadoutRound[] = []
  let readout: SamakanReadout
  try {
    const [roundsReply, answersReply, membersReply] = await Promise.all([
      admin.from('samakan_rounds')
        .select('id, position, kind, prompt, options, low_label, high_label, talk, skipped_at, revealed_at')
        .eq('set_id', o.setId).order('position'),
      admin.from('samakan_answers').select('round_id, profile_id, pick, guess').eq('set_id', o.setId),
      admin.from('couple_members').select('profile_id').eq('couple_id', o.coupleId),
    ])
    for (const r of [roundsReply, answersReply, membersReply]) {
      if (r.error) throw new Error(r.error.message)
    }
    const answers = (answersReply.data ?? []) as AnswerRow[]
    rounds = ((roundsReply.data ?? []) as RoundRow[]).map((r) => {
      const mine = answers.find((a) => a.round_id === r.id && a.profile_id === o.me)
      const theirs = answers.find((a) => a.round_id === r.id && a.profile_id !== o.me)
      const revealed = !!r.revealed_at && !!mine && !!theirs
      return {
        position: r.position,
        kind: r.kind,
        prompt: r.prompt,
        options: r.options ?? [],
        low: r.low_label,
        high: r.high_label,
        talk: r.talk ?? '',
        skipped: !!r.skipped_at,
        first: revealed && mine ? { pick: mine.pick, guess: mine.guess } : null,
        second: revealed && theirs ? { pick: theirs.pick, guess: theirs.guess } : null,
      }
    })
    const memberIds = ((membersReply.data ?? []) as Array<{ profile_id: string }>).map((m) => m.profile_id)
    const partnerId = memberIds.find((id) => id !== o.me) ?? null
    const { data: profiles } = await admin.from('profiles').select('id, name').in('id', [o.me, ...(partnerId ? [partnerId] : [])])
    const names = new Map(((profiles ?? []) as Array<{ id: string; name: string | null }>).map((p) => [p.id, firstName(p.name)]))

    const budget = await samakanBudget(admin, o.coupleId)
    const result = await writeReadout({
      coupleId: o.coupleId,
      input: { names: { first: names.get(o.me) ?? null, second: partnerId ? names.get(partnerId) ?? null : null }, theme: o.theme, rounds },
      budget,
    })
    if (result.fallback && result.fallback !== 'limit' && result.fallback !== 'empty') {
      console.warn('[samakan/readout] template used:', result.fallback)
    }
    readout = result.readout
  } catch (err) {
    console.error('[samakan/readout] compose failed:', err instanceof Error ? err.message : 'unknown')
    readout = safeTemplateReadout(rounds)
  }

  const saved = await admin.rpc('samakan_save_readout', { p_set_id: o.setId, p_readout: readout })
  if (saved.error && readout.by === 'ai') {
    // The database's rules are the last word: fall back to the template.
    readout = safeTemplateReadout(rounds)
    const retry = await admin.rpc('samakan_save_readout', { p_set_id: o.setId, p_readout: readout })
    if (retry.error) console.error('[samakan/readout] save failed:', retry.error.message)
  } else if (saved.error) {
    console.error('[samakan/readout] save failed:', saved.error.message)
  }
  // Whatever is stored wins (another request may have saved first).
  return (await savedReadout(admin, o.setId)) ?? readout
}
