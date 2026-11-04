// Shared by the Samakan v2 routes (server-only): error replies, couple
// lookups and the one way a Samakan push goes out.
//
// Push order, every time: the recipient's notification switch and quiet
// hours first (a held push is dropped, not queued, and isn't counted), then
// samakan_claim_push (once per set for start, finish and nudge, once per live
// invite, 3 a day per recipient), then the send. Nothing is sent without a
// granted claim, so a double tap or a retry can't push twice.
import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendPushToProfile } from '@/lib/push-server'
import { isPushMuted, type MutePrefs } from '@/lib/quiet-hours'
import { firstName } from '@/lib/samakan-ai'
import { errorCode, errorMessage, setPath } from '@/components/games/samakan/logic'
import type { SamakanClientError, SamakanPushKind } from '@/types/samakan'

if (typeof window !== 'undefined') {
  throw new Error('samakan route helpers are server-only')
}

/** Untyped service-role view: these routes call RPCs whose JSON they parse themselves. */
export type Db = SupabaseClient

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const GENERIC_ERROR = 'Something went wrong. Try again.'

export function jsonError(status: number, error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, ...extra }, { status })
}

const HINT_STATUS: Partial<Record<SamakanClientError, number>> = {
  SK_AUTH: 401,
  SK_NOT_FOUND: 404,
  SK_NO_PARTNER: 409,
  SK_CLOSED: 409,
  SK_ENDED: 409,
  SK_INVALID: 400,
  SK_LOCKED: 409,
  SK_SKIPPED: 409,
  SK_ANSWERED: 409,
  SK_SKIP_LIMIT: 409,
  SK_LIMIT: 429,
  SK_EXPIRED: 410,
  SK_DAILY_LIMIT: 429,
  SK_PERSONAL_OFF: 409,
}

/** An RPC error as a reply: SK_* hints get their status and English line; anything else is logged. */
export function rpcError(error: unknown, where: string) {
  const code = errorCode(error)
  const status = HINT_STATUS[code]
  if (status) return jsonError(status, errorMessage(code), { code })
  const message = (error as { message?: unknown } | null)?.message
  console.error(`[samakan] ${where} failed:`, typeof message === 'string' ? message : code)
  return jsonError(500, GENERIC_ERROR, { code: 'UNKNOWN' })
}

export function codeError(code: SamakanClientError) {
  return jsonError(HINT_STATUS[code] ?? 500, errorMessage(code), { code })
}

/** The other member of the couple, or null. */
export async function partnerOf(db: Db, coupleId: string, me: string): Promise<string | null> {
  const { data, error } = await db.from('couple_members').select('profile_id')
    .eq('couple_id', coupleId).neq('profile_id', me).limit(1)
  if (error) throw new Error(`couple lookup failed: ${error.message}`)
  return ((data ?? []) as Array<{ profile_id: string }>)[0]?.profile_id ?? null
}

/** A first name for pushes ("Your partner" when the profile has none). */
export async function nameOf(db: Db, profileId: string): Promise<string> {
  const { data } = await db.from('profiles').select('name').eq('id', profileId).maybeSingle()
  return firstName((data as { name?: string | null } | null)?.name) ?? 'Your partner'
}

// ---------- pushes ----------

export type PushOutcome = {
  kind: SamakanPushKind
  sent: boolean
  /** null when sent; otherwise why not (a samakan_claim_push refusal, 'muted', 'no_device', ...). */
  reason: string | null
}

/** Where a push opens. A live invite carries its id so the set screen can accept it. */
export function pushUrl(setId: string, inviteId?: string | null): string {
  return inviteId ? `${setPath(setId)}?live=${inviteId}` : setPath(setId)
}

export function pushBody(kind: SamakanPushKind, name: string): string {
  switch (kind) {
    case 'start': return `${name} started a Samakan set. Seven quick rounds, answer whenever.`
    case 'finish': return `${name} finished Samakan. See how you matched.`
    case 'nudge': return `${name}'s still waiting on your Samakan answers.`
    case 'live': return `${name} is on Samakan right now. Open it to play together.`
  }
}

const vapidConfigured = () => !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() && !!process.env.VAPID_PRIVATE_KEY?.trim()

/**
 * Sends one Samakan push (kind 'games') if every rule allows it. Never throws.
 * `name` is the person the push is about (the sender, or the finisher).
 */
export async function samakanPush(
  db: Db,
  opts: { setId: string; recipientId: string; kind: SamakanPushKind; name: string; inviteId?: string | null },
): Promise<PushOutcome> {
  const { kind } = opts
  try {
    if (!vapidConfigured()) return { kind, sent: false, reason: 'not_configured' }

    const { data: prefs, error: prefsError } = await db.from('notification_prefs')
      .select('kangen, letters, moments, reminders, activity, games, quiet_start, quiet_end')
      .eq('profile_id', opts.recipientId).maybeSingle()
    // A lookup error fails open, like push-server does.
    if (!prefsError && isPushMuted(prefs as MutePrefs | null, 'games')) return { kind, sent: false, reason: 'muted' }

    const claim = await db.rpc('samakan_claim_push', { p_set_id: opts.setId, p_recipient: opts.recipientId, p_kind: kind })
    if (claim.error) {
      console.error('[samakan] push claim failed:', claim.error.message)
      return { kind, sent: false, reason: 'error' }
    }
    const granted = (claim.data ?? {}) as { ok?: boolean; reason?: string | null }
    if (granted.ok !== true) return { kind, sent: false, reason: granted.reason ?? 'refused' }

    const result = await sendPushToProfile(
      opts.recipientId,
      { title: 'Samakan', body: pushBody(kind, opts.name), url: pushUrl(opts.setId, opts.inviteId) },
      'games',
    )
    if (!result) return { kind, sent: false, reason: 'not_configured' }
    if (result.muted) return { kind, sent: false, reason: 'muted' }
    return result.sent > 0 ? { kind, sent: true, reason: null } : { kind, sent: false, reason: 'no_device' }
  } catch (err) {
    console.error('[samakan] push failed:', err instanceof Error ? err.message : 'unknown')
    return { kind, sent: false, reason: 'error' }
  }
}
