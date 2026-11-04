'use client'

// Samakan v2, the client data layer. Everything the screens need from
// Supabase or the Samakan API routes goes through this file.
//
// RPCs (supabase/migrations/20261104121000_samakan_v2.sql) are the source of
// truth: the screens call one, then refetch samakan_set_state when the
// realtime row on samakan_sets (or samakan_live_invites) changes. There is no
// host and no broadcast game protocol.
//
// API routes (src/app/api/games/samakan/**). Each one sits behind exactly one
// function below, so a contract change touches one place:
//   POST /sets               { theme, playNow? } -> 201 { id, existing, source, theme, fallbackReason, notice, push, invite }   createSet()
//   POST /sets/[id]/readout                      -> 200 { readout, push } | 202 { readout: null, pending: true }              requestReadout()
//   POST /sets/[id]/live                         -> 200 { invite, created, joined, push }                                     playLive()
//   POST /sets/[id]/nudge                        -> 200 { push: { sent, reason } }                                            nudgePartner()
// Errors come back as { error, code } (code: an SK_* hint, or a route code
// like TOO_SOON). A route that answers 404 with no JSON body doesn't exist on
// this server; each function says what it does then.

import { useEffect, useRef, useState } from 'react'
import type { PostgrestError } from '@supabase/supabase-js'
import { createClient, getClientUser } from '@/lib/supabase'
import { leaveChannel, subscribeAsUser } from '@/lib/realtime'
import { getMyCouple } from '@/lib/couple'
import {
  draftKey,
  errorCode,
  errorMessage,
  parseAnswerResult,
  parseHub,
  parseLiveInvite,
  parseLiveInviteResult,
  parseSetState,
} from '@/components/games/samakan/logic'
import type {
  GameSession,
  RoundResult,
  SamakanAnswerResult,
  SamakanClientError,
  SamakanFallbackReason,
  SamakanHub,
  SamakanLiveInvite,
  SamakanLiveInviteResult,
  SamakanReadout,
  SamakanSetState,
  SamakanSource,
  SamakanTheme,
} from '@/types/samakan'

// ---------- errors ----------

export class SamakanError extends Error {
  constructor(readonly code: SamakanClientError, message?: string) {
    super(message ?? errorMessage(code))
    this.name = 'SamakanError'
  }
}

/** A message a person can read for any thrown value. */
export function messageFor(e: unknown): string {
  if (e instanceof SamakanError) return e.message
  return errorMessage(errorCode(e))
}

/** For a load that failed (the NETWORK text is about saving answers). */
export function loadMessage(e: unknown): string {
  return codeFor(e) === 'NETWORK' ? 'Check your connection and try again.' : messageFor(e)
}

export function codeFor(e: unknown): SamakanClientError {
  if (e instanceof SamakanError) return e.code
  return errorCode(e)
}

function fail(error: PostgrestError): never {
  const code = errorCode(error)
  throw new SamakanError(code)
}

async function call<T>(run: () => PromiseLike<{ data: T; error: PostgrestError | null }>): Promise<T> {
  let reply: { data: T; error: PostgrestError | null }
  try {
    reply = await run()
  } catch (e) {
    throw new SamakanError(errorCode(e) === 'NETWORK' ? 'NETWORK' : 'UNKNOWN')
  }
  if (reply.error) fail(reply.error)
  return reply.data
}

// ---------- who is playing ----------

export interface SamakanContext {
  userId: string
  myName: string | null
  coupleId: string | null
  /** The partner left: past sets stay readable, nothing new starts. */
  closed: boolean
  partner: { id: string; name: string | null } | null
}

/** Me, my couple and my partner. null = signed out. */
export async function loadContext(): Promise<SamakanContext | null> {
  let user
  try {
    user = await getClientUser()
  } catch {
    throw new SamakanError('NETWORK')
  }
  if (!user) return null
  const supabase = createClient()
  let couple
  try {
    couple = await getMyCouple(user.id)
  } catch (e) {
    throw new SamakanError(errorCode(e))
  }
  const base = { userId: user.id, coupleId: couple?.id ?? null, closed: !!couple?.closedAt }
  const members = couple
    ? await call(() => supabase.from('couple_members').select('profile_id').eq('couple_id', couple.id))
    : []
  const partnerId = (members ?? []).map((m) => m.profile_id).find((id) => id && id !== user.id) ?? null
  const ids = partnerId ? [user.id, partnerId] : [user.id]
  const profiles = await call(() => supabase.from('profiles').select('id, name').in('id', ids))
  const nameOf = (id: string) => profiles?.find((p) => p.id === id)?.name?.trim() || null
  return {
    ...base,
    myName: nameOf(user.id),
    partner: partnerId ? { id: partnerId, name: nameOf(partnerId) } : null,
  }
}

// ---------- RPCs ----------

export async function loadHub(): Promise<SamakanHub> {
  const supabase = createClient()
  return parseHub(await call(() => supabase.rpc('samakan_hub')))
}

export async function loadSetState(setId: string): Promise<SamakanSetState> {
  const supabase = createClient()
  return parseSetState(await call(() => supabase.rpc('samakan_set_state', { p_set_id: setId })))
}

/** guess is null for a match round. */
export async function answerRound(roundId: string, pick: number, guess: number | null): Promise<SamakanAnswerResult> {
  const supabase = createClient()
  const args = guess === null ? { p_round_id: roundId, p_pick: pick } : { p_round_id: roundId, p_pick: pick, p_guess: guess }
  return parseAnswerResult(await call(() => supabase.rpc('samakan_answer', args)))
}

export async function skipRound(roundId: string): Promise<{ done: boolean; version: number | null }> {
  const supabase = createClient()
  const data = await call(() => supabase.rpc('samakan_skip', { p_round_id: roundId }))
  const o = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>
  return { done: o.done === true, version: typeof o.version === 'number' ? o.version : null }
}

export async function endSet(setId: string): Promise<void> {
  const supabase = createClient()
  await call(() => supabase.rpc('samakan_end', { p_set_id: setId }))
}

/** The couple's "Personal rounds" switch. Returns the stored value. */
export async function setPersonalRounds(on: boolean): Promise<boolean> {
  const supabase = createClient()
  const data = await call(() => supabase.rpc('samakan_set_personal', { p_on: on }))
  return data === true
}

export async function getPersonalRounds(coupleId: string): Promise<boolean> {
  const supabase = createClient()
  const data = await call(() => supabase.from('couples').select('samakan_personal').eq('id', coupleId).maybeSingle())
  return data?.samakan_personal !== false
}

export async function acceptLive(inviteId: string): Promise<SamakanLiveInvite | null> {
  const supabase = createClient()
  return parseLiveInvite(await call(() => supabase.rpc('samakan_live_accept', { p_invite_id: inviteId })))
}

// ---------- API routes ----------

interface RouteReply {
  status: number
  /** null when the body wasn't JSON (a route that doesn't exist yet). */
  body: Record<string, unknown> | null
}

async function post(path: string, body?: unknown, timeoutMs = 20_000): Promise<RouteReply> {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
      signal: controller?.signal,
    })
    let parsed: Record<string, unknown> | null = null
    try {
      const json: unknown = await res.json()
      parsed = json && typeof json === 'object' && !Array.isArray(json) ? (json as Record<string, unknown>) : null
    } catch {
      parsed = null
    }
    return { status: res.status, body: parsed }
  } catch {
    throw new SamakanError('NETWORK')
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** A route that answered with an error body: its SK_* code, else its message. */
function routeError(reply: RouteReply, fallback: string): SamakanError {
  const code = typeof reply.body?.code === 'string' ? reply.body.code : null
  const mapped = code ? errorCode({ hint: code }) : 'UNKNOWN'
  if (mapped !== 'UNKNOWN') return new SamakanError(mapped)
  const text = typeof reply.body?.error === 'string' && reply.body.error.trim() ? reply.body.error.trim() : fallback
  return new SamakanError('UNKNOWN', text)
}

const routeMissing = (reply: RouteReply) => reply.status === 404 && reply.body === null

export interface CreateSetResult {
  id: string
  /** An open set already existed (maybe the partner's); that one comes back. */
  existing: boolean
  source: SamakanSource | null
  fallbackReason: SamakanFallbackReason | null
}

/**
 * Starts a set: a bank theme, or "personal" for the AI-written "For you two"
 * set. The server writes all 7 rounds, then pushes the partner once: "start",
 * or with playNow a live invite ("I'm on Samakan right now"). The AI call has
 * a 12 s budget with a bank fallback, so 25 s here only catches a dropped line.
 * Reply 201 { id, existing, source, theme, fallbackReason, notice, push, invite }.
 */
export async function createSet(theme: Exclude<SamakanTheme, 'mixed'>, opts: { playNow?: boolean } = {}): Promise<CreateSetResult> {
  const reply = await post('/api/games/samakan/sets', { theme, playNow: opts.playNow === true }, 25_000)
  const b = reply.body
  const id = typeof b?.id === 'string' ? b.id : null
  if (reply.status >= 200 && reply.status < 300 && id) {
    const source = b?.source === 'ai' || b?.source === 'bank' ? b.source : null
    const reason = typeof b?.fallbackReason === 'string' ? (b.fallbackReason as SamakanFallbackReason) : null
    return { id, existing: b?.existing === true, source, fallbackReason: reason }
  }
  if (routeMissing(reply)) throw new SamakanError('UNKNOWN', 'Couldn\'t start a set right now. Try again in a bit.')
  throw routeError(reply, 'Couldn\'t start the set. Try again.')
}

function parseReadoutBody(v: unknown): SamakanReadout | null {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : null
  if (!o) return null
  const headline = typeof o.headline === 'string' ? o.headline : null
  const note = typeof o.note === 'string' ? o.note : null
  const ask = typeof o.ask === 'string' ? o.ask : null
  if (!headline || !note || !ask) return null
  return { headline, note, ask, by: o.by === 'ai' ? 'ai' : 'template' }
}

export interface ReadoutReply {
  readout: SamakanReadout | null
  /** The partner's phone is writing it right now; it arrives through realtime. */
  pending: boolean
}

const readoutRequests = new Map<string, Promise<ReadoutReply>>()

/**
 * Asks the server for the finished set's read-out (the final answerer's ask
 * also sends the finish push). Safe to call more than once: the server claims
 * it. Never throws. Reply 200 { readout } or 202 { readout: null, pending }.
 * { readout: null, pending: false } means "show the template read-out".
 */
export function requestReadout(setId: string): Promise<ReadoutReply> {
  // One request per set per page load, however many screens ask.
  const inFlight = readoutRequests.get(setId)
  if (inFlight) return inFlight
  const run = (async (): Promise<ReadoutReply> => {
    try {
      const reply = await post(`/api/games/samakan/sets/${encodeURIComponent(setId)}/readout`, {}, 20_000)
      if (reply.status < 200 || reply.status >= 300) return { readout: null, pending: false }
      return { readout: parseReadoutBody(reply.body?.readout), pending: reply.body?.pending === true }
    } catch {
      return { readout: null, pending: false }
    }
  })()
  readoutRequests.set(setId, run)
  // Without a read-out, a later visit may ask again.
  void run.then((r) => { if (!r.readout) readoutRequests.delete(setId) })
  return run
}

/** The route already parsed the invite (camelCase); the RPC returns snake_case. */
function liveInviteFrom(v: unknown): SamakanLiveInvite | null {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : null
  if (!o || typeof o.id !== 'string') return null
  if (!('setId' in o)) return parseLiveInvite(o)
  const s = (x: unknown) => (typeof x === 'string' ? x : null)
  return {
    id: o.id,
    setId: s(o.setId) ?? '',
    createdBy: s(o.createdBy),
    recipientId: s(o.recipientId),
    createdAt: s(o.createdAt) ?? '',
    expiresAt: s(o.expiresAt) ?? '',
    acceptedAt: s(o.acceptedAt),
  }
}

/**
 * "Play now together": asks the partner to open this set right now. The route
 * runs samakan_live_invite as me and sends the "live" push for a new invite
 * only. Reply 200 { invite, created, joined, push }. If the route is missing
 * (an older server), the RPC alone runs: the invite still shows on the
 * partner's open app through realtime, without a push.
 */
export async function playLive(setId: string): Promise<SamakanLiveInviteResult> {
  const reply = await post(`/api/games/samakan/sets/${encodeURIComponent(setId)}/live`, {})
  if (reply.status >= 200 && reply.status < 300 && reply.body) {
    const invite = liveInviteFrom(reply.body.invite)
    if (invite) return { invite, created: reply.body.created === true, joined: reply.body.joined === true }
  }
  if (routeMissing(reply)) {
    const supabase = createClient()
    return parseLiveInviteResult(await call(() => supabase.rpc('samakan_live_invite', { p_set_id: setId })))
  }
  throw routeError(reply, 'Couldn\'t send the invite. Try again.')
}

export interface NudgeReply {
  sent: boolean
  /** Why not, when not sent: 'muted' (switched off or quiet hours; try later), 'no_device', ... */
  reason: string | null
}

/**
 * The one nudge per set, 3 hours after start. Reply 200 { push: { sent,
 * reason } }; a refusal (too soon, already nudged, partner finished, daily
 * cap) comes back as 409/429 { error, code } and throws with that text.
 */
export async function nudgePartner(setId: string): Promise<NudgeReply> {
  const reply = await post(`/api/games/samakan/sets/${encodeURIComponent(setId)}/nudge`, {})
  if (reply.status >= 200 && reply.status < 300) {
    const push = reply.body?.push && typeof reply.body.push === 'object' ? (reply.body.push as Record<string, unknown>) : null
    return { sent: push?.sent === true, reason: typeof push?.reason === 'string' ? push.reason : null }
  }
  if (routeMissing(reply)) throw new SamakanError('UNKNOWN', 'Couldn\'t send the nudge right now. Try again later.')
  throw routeError(reply, 'Couldn\'t send the nudge. Try again.')
}

// ---------- older games (v1, read-only) ----------

export async function loadOlderGames(coupleId: string): Promise<GameSession[]> {
  const supabase = createClient()
  const data = await call(() => supabase
    .from('game_sessions')
    .select('*')
    .eq('couple_id', coupleId)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(100))
  return (data ?? []).map(toSession)
}

export async function loadOlderGame(id: string): Promise<GameSession | null> {
  const supabase = createClient()
  const data = await call(() => supabase.from('game_sessions').select('*').eq('id', id).maybeSingle())
  return data ? toSession(data) : null
}

function toSession(row: Record<string, unknown>): GameSession {
  return {
    id: String(row.id),
    couple_id: String(row.couple_id),
    created_by: String(row.created_by ?? ''),
    partner_id: typeof row.partner_id === 'string' ? row.partner_id : null,
    chapter_id: String(row.chapter_id ?? ''),
    status: (row.status as GameSession['status']) ?? 'expired',
    rounds: Array.isArray(row.rounds) ? (row.rounds as unknown as RoundResult[]) : [],
    round_types: Array.isArray(row.round_types) ? (row.round_types as string[]) : [],
    total_score: typeof row.total_score === 'number' ? row.total_score : 0,
    created_at: String(row.created_at ?? ''),
    started_at: typeof row.started_at === 'string' ? row.started_at : null,
    completed_at: typeof row.completed_at === 'string' ? row.completed_at : null,
  }
}

// ---------- this phone: unsent picks and seen reveals ----------

export interface DraftPick {
  pick: number | null
  guess: number | null
  /** Completed while offline: send it once the phone is back online. */
  queued?: boolean
}

type DraftMap = Record<string, DraftPick>

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    const v: unknown = JSON.parse(raw)
    return (v ?? fallback) as T
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Private mode or full storage: the pick stays in memory only.
  }
}

function removeKey(key: string): void {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // nothing to clean up
  }
}

const whole = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) ? v : null)

export function readDrafts(setId: string): DraftMap {
  const raw = readJson<Record<string, unknown>>(draftKey(setId), {})
  const out: DraftMap = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [roundId, v] of Object.entries(raw)) {
    const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : null
    if (!o) continue
    out[roundId] = { pick: whole(o.pick), guess: whole(o.guess), queued: o.queued === true }
  }
  return out
}

export function saveDraft(setId: string, roundId: string, draft: DraftPick | null): void {
  const all = readDrafts(setId)
  if (draft && (draft.pick !== null || draft.guess !== null)) all[roundId] = draft
  else delete all[roundId]
  if (Object.keys(all).length) writeJson(draftKey(setId), all)
  else removeKey(draftKey(setId))
}

const seenKey = (setId: string) => `nk:samakan:seen:${setId}`

/** Round ids whose reveal I've already stepped past on this phone. */
export function readSeen(setId: string): string[] {
  const v = readJson<unknown>(seenKey(setId), [])
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

export function writeSeen(setId: string, ids: readonly string[]): void {
  writeJson(seenKey(setId), Array.from(new Set(ids)).slice(-20))
}

// ---------- live: realtime refetch, presence, online ----------

/**
 * Calls onChange (debounced) when a Samakan row changes: the set itself (or
 * every set of the couple, for the hub) and its live invites. Also fires once
 * the channel is live, when the app comes back into view, and when the phone
 * comes back online, because a backgrounded PWA misses events.
 */
export function useSamakanRealtime(
  scope: { setId: string } | { coupleId: string } | null,
  onChange: () => void,
  debounceMs = 250,
) {
  const callback = useRef(onChange)
  callback.current = onChange
  const key = !scope ? '' : 'setId' in scope ? `set:${scope.setId}` : `couple:${scope.coupleId}`

  useEffect(() => {
    if (!key) return
    const supabase = createClient()
    let timer: ReturnType<typeof setTimeout> | null = null
    const fire = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => callback.current(), debounceMs)
    }
    const [kind, id] = key.split(':')
    const channel = supabase.channel(`samakan-rows:${key}:${Math.random().toString(36).slice(2, 8)}`)
    if (kind === 'set') {
      channel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'samakan_sets', filter: `id=eq.${id}` }, fire)
      for (const event of ['INSERT', 'UPDATE'] as const) {
        channel.on('postgres_changes', { event, schema: 'public', table: 'samakan_live_invites', filter: `set_id=eq.${id}` }, fire)
      }
    } else {
      for (const table of ['samakan_sets', 'samakan_live_invites']) {
        for (const event of ['INSERT', 'UPDATE'] as const) {
          channel.on('postgres_changes', { event, schema: 'public', table, filter: `couple_id=eq.${id}` }, fire)
        }
      }
    }
    const unsubscribe = subscribeAsUser(supabase, channel, (status) => { if (status === 'SUBSCRIBED') fire() })
    const onVisible = () => { if (document.visibilityState === 'visible') fire() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', fire)
    return () => {
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', fire)
      unsubscribe()
    }
  }, [key, debounceMs])
}

export interface PartnerPresence {
  /** The partner has this set open right now. */
  here: boolean
  /** They were here this visit and stepped away. */
  left: boolean
}

/** Presence on `samakan:<setId>`, only to show "Kezia is here". */
export function usePartnerPresence(setId: string, userId: string | null, enabled: boolean): PartnerPresence {
  const [presence, setPresence] = useState<PartnerPresence>({ here: false, left: false })

  useEffect(() => {
    if (!userId || !enabled || !setId) return
    const supabase = createClient()
    let wasHere = false
    const channel = supabase.channel(`samakan:${setId}`, { config: { presence: { key: userId } } })
    const check = () => {
      const state = channel.presenceState()
      const here = Object.keys(state).some((k) => k !== userId && (state[k]?.length ?? 0) > 0)
      if (here) wasHere = true
      setPresence({ here, left: !here && wasHere })
    }
    channel
      .on('presence', { event: 'sync' }, check)
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          try {
            await channel.track({ user_id: userId, at: new Date().toISOString() })
          } catch {
            // presence is a nicety; the game works without it
          }
          check()
        }
      })
    return () => {
      setPresence({ here: false, left: false })
      leaveChannel(channel)
    }
  }, [setId, userId, enabled])

  return presence
}

/**
 * navigator.onLine. The Samakan screens only mount after their data loaded on
 * the client, so the first value can come straight from navigator (a phone
 * that's offline at mount must not try to send queued picks first).
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false))
  useEffect(() => {
    const update = () => setOnline(typeof navigator === 'undefined' ? true : navigator.onLine !== false)
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  return online
}

/** A clock for "nudge opens at" and invite expiry; ticks every 30 s. */
export function useNow(intervalMs = 30_000): Date | null {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    setNow(new Date())
    const t = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}
