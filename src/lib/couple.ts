import { createClient } from './supabase'

export interface MyCouple {
  id: string
  inviteCode: string
  /** ISO timestamp; the code stops working after this (7 days, renewable). */
  inviteExpiresAt: string
  memberCount: number
  /**
   * Set once a partner left: the remaining member keeps the archive, but the
   * couple can't be joined or get a new invite code anymore.
   */
  closedAt: string | null
}

/** True once the invite code can no longer be used to join. */
export function isInviteExpired(expiresAt: string, now: Date = new Date()): boolean {
  return new Date(expiresAt).getTime() <= now.getTime()
}

/** "3 November 2026, 14.05 WIB" */
export function formatInviteExpiry(expiresAt: string): string {
  const d = new Date(expiresAt)
  const date = d.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'long', year: 'numeric' })
  const time = d.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  return `${date}, ${time} WIB`
}

/** The join error for an expired code, so forms can explain it instead of just showing it. */
export function isExpiredInviteError(message: string | null | undefined): boolean {
  return /kedaluwarsa/i.test(message ?? '')
}

/** The caller's couple (one per person), or null when they have none yet. */
export async function getMyCouple(userId: string): Promise<MyCouple | null> {
  const supabase = createClient()

  const { data: membership, error } = await supabase
    .from('couple_members')
    .select('couple_id')
    .eq('profile_id', userId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!membership) return null

  const { data: couple, error: coupleError } = await supabase
    .from('couples')
    .select('id, invite_code, invite_expires_at, closed_at, couple_members(profile_id)')
    .eq('id', membership.couple_id)
    .single()
  if (coupleError || !couple) throw new Error(coupleError?.message ?? 'Pasangan tidak ditemukan')

  return {
    id: couple.id,
    inviteCode: couple.invite_code,
    inviteExpiresAt: couple.invite_expires_at,
    memberCount: couple.couple_members.length,
    closedAt: couple.closed_at,
  }
}

/**
 * A fresh invite code, valid 7 more days. Only while still waiting for a
 * partner — the database refuses once the couple is full.
 */
export async function regenerateInviteCode(): Promise<Pick<MyCouple, 'id' | 'inviteCode' | 'inviteExpiresAt'>> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('regenerate_invite_code')
  if (error || !data) throw new Error(error?.message ?? 'Gagal membuat kode baru')
  return { id: data.id, inviteCode: data.invite_code, inviteExpiresAt: data.invite_expires_at }
}

/**
 * Leave my couple through /api/couple/leave (which also clears the photos
 * when I was the last member). `deleted`: the couple is gone.
 */
export async function leaveCouple(): Promise<{ deleted: boolean }> {
  const res = await fetch('/api/couple/leave', { method: 'POST' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Gagal keluar dari pasangan')
  return { deleted: !!data.deleted }
}

/**
 * Create the caller's couple, or return the one they already have — the
 * database generates the invite code and allows one couple per person.
 */
export async function createCouple(userId: string) {
  const supabase = createClient()

  const { data: couple, error } = await supabase.rpc('create_couple')
  if (error || !couple) throw new Error(error?.message ?? 'Gagal membuat pasangan')

  // Best effort: the couple exists either way, and a profile save re-syncs.
  await seedCalendarEvents(userId, couple.id).catch((e) => console.warn('seedCalendarEvents', e))

  return couple
}

/** Same value as COUPLE_HAS_DATA in ./account (server-only, not importable here). */
const COUPLE_HAS_DATA = 'COUPLE_HAS_DATA'

/** A join that failed; `needsDiscard` = retry with { discard: true } after the user confirms. */
export class JoinCoupleError extends Error {
  constructor(message: string, readonly needsDiscard: boolean) {
    super(message)
  }
}

/** True when joining would delete the caller's current couple and its memories. */
export function isCoupleHasDataError(e: unknown): boolean {
  return e instanceof JoinCoupleError && e.needsDiscard
}

/**
 * Join the couple behind an invite code through /api/couple/join; returns its
 * id. If the caller was alone in their own couple, the database removes that
 * couple only after the join is known to succeed (and the route clears its
 * photos). When that couple still holds memories the first try throws a
 * JoinCoupleError with `needsDiscard`; retry with `{ discard: true }` once
 * the user has confirmed.
 */
export async function joinCouple(inviteCode: string, userId: string, options: { discard?: boolean } = {}): Promise<string> {
  const res = await fetch('/api/couple/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: inviteCode.trim(), discard: options.discard === true }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || typeof data.coupleId !== 'string') {
    const message = typeof data.error === 'string' ? data.error : 'Gagal bergabung'
    throw new JoinCoupleError(message, res.status === 409 && data.code === COUPLE_HAS_DATA)
  }
  const coupleId: string = data.coupleId

  await seedCalendarEvents(userId, coupleId).catch((e) => console.warn('seedCalendarEvents', e))

  return coupleId
}

interface ProfileDates {
  birthday: string | null
  relationship_start_date: string | null
}

/**
 * Create or update the birthday + anniversary events that mirror the user's
 * profile. Safe to call repeatedly — an existing event is updated, never
 * duplicated. Pass `previous` (the profile before an edit) so the events
 * seeded from the old dates are the ones that move.
 */
export async function seedCalendarEvents(userId: string, coupleId: string, previous?: ProfileDates | null) {
  const supabase = createClient()

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('name, birthday, relationship_start_date')
    .eq('id', userId)
    .single()
  if (profileError) throw new Error(profileError.message)
  if (!profile) return

  const fail = (e: { message: string } | null) => { if (e) throw new Error(e.message) }

  // Birthday: one per person, created by them.
  const oldBirthday = previous?.birthday ?? null
  const birthdayDates = Array.from(new Set([oldBirthday, profile.birthday].filter((d): d is string => !!d)))
  if (birthdayDates.length > 0) {
    const { data: rows, error } = await supabase
      .from('couple_events')
      .select('id, event_date')
      .eq('couple_id', coupleId)
      .eq('created_by', userId)
      .eq('event_type', 'birthday')
      .in('event_date', birthdayDates)
    fail(error)
    const row = rows?.find((r) => r.event_date === oldBirthday) ?? rows?.find((r) => r.event_date === profile.birthday)
    const title = `Ulang Tahun ${profile.name ?? 'Pasangan'}`

    if (!profile.birthday) {
      if (row) fail((await supabase.from('couple_events').delete().eq('id', row.id)).error)
    } else if (row) {
      fail((await supabase.from('couple_events')
        .update({ title, event_date: profile.birthday })
        .eq('id', row.id)).error)
    } else {
      fail((await supabase.from('couple_events').insert({
        couple_id: coupleId,
        title,
        event_date: profile.birthday,
        event_type: 'birthday',
        is_recurring: true,
        event_scope: 'couple',
        remind_days_before: 1,
        created_by: userId,
      })).error)
    }
  }

  // Anniversary: one per couple — whichever partner fills it in first seeds it.
  // Clearing the date leaves the shared event alone.
  const start = profile.relationship_start_date
  if (start) {
    const { data: rows, error } = await supabase
      .from('couple_events')
      .select('id, event_date')
      .eq('couple_id', coupleId)
      .eq('event_type', 'anniversary')
    fail(error)
    const oldStart = previous?.relationship_start_date ?? null
    const row = rows?.find((r) => r.event_date === oldStart) ?? rows?.find((r) => r.event_date === start)

    if (row) {
      if (row.event_date !== start) {
        fail((await supabase.from('couple_events').update({ event_date: start }).eq('id', row.id)).error)
      }
    } else if ((rows?.length ?? 0) === 0) {
      fail((await supabase.from('couple_events').insert({
        couple_id: coupleId,
        title: 'Anniversary',
        event_date: start,
        event_type: 'anniversary',
        is_recurring: true,
        event_scope: 'couple',
        remind_days_before: 1,
        created_by: userId,
      })).error)
    }
  }
}
