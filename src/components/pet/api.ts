// Browser data layer for the Pet Kita screens. Every rule lives in the
// database (adopt_pet, pet_say_hi, pet_status, pet_mark_visit); this file only
// calls those RPCs, reads the couple's own rows for the living items, and
// shapes the JSON. The daily note comes from GET /api/pet/today.
import { createClient } from '@/lib/supabase'
import { daysUntil, getNextOccurrence, monthKeyJakarta, todayJakarta } from '@/lib/dates'
import { signPhotoPaths } from '@/lib/moments'
import {
  PET_RULES,
  type Gesture, type HiResult, type PetRow, type PetStatus, type PetType, type PetVisitResult, type PetWarmthEvent,
} from '@/types/pet'
import { asGesture, num, parseHi, parseNote, parseStatus, parseVisit, str, type Obj, type ShownNote } from './parse'

export { parseHi, parseNote, parseStatus, parseVisit, type ShownNote }

/** An error the screens can explain: offline, a closed couple, or anything else. */
export class PetError extends Error {
  constructor(public kind: 'offline' | 'closed' | 'no_pet' | 'invalid' | 'failed', message: string) {
    super(message)
  }
}

export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

function toPetError(error: { message?: string; hint?: string | null; code?: string } | null | undefined, fallback: string): PetError {
  if (isOffline()) return new PetError('offline', "You're offline. Try again when you're back online.")
  const hint = error?.hint ?? ''
  if (hint === 'PET_CLOSED') return new PetError('closed', error?.message || 'This couple space is closed, so the pet is resting.')
  if (hint === 'PET_NOT_FOUND') return new PetError('no_pet', 'Adopt Pet Kita first.')
  if (hint === 'PET_INVALID') return new PetError('invalid', error?.message || fallback)
  return new PetError('failed', fallback)
}


export async function fetchStatus(): Promise<PetStatus | null> {
  const { data, error } = await createClient().rpc('pet_status', {})
  if (error) throw toPetError(error, "Couldn't load your pet. Try again.")
  return parseStatus(data)
}

export async function sayHi(gesture: Gesture): Promise<HiResult> {
  if (isOffline()) throw new PetError('offline', "You're offline. Your hi goes through once you're back.")
  const { data, error } = await createClient().rpc('pet_say_hi', { p_gesture: gesture })
  if (error) throw toPetError(error, "Couldn't say hi just now. Try again.")
  return parseHi(data)
}

export interface MarkVisitOptions {
  petId?: string
  celebratedLevel?: number
  introSeen?: boolean
}

export async function markVisit(opts: MarkVisitOptions = {}): Promise<PetVisitResult | null> {
  const args: { p_pet_id?: string; p_celebrated_level?: number; p_intro_seen?: boolean } = {}
  if (opts.petId) args.p_pet_id = opts.petId
  if (opts.celebratedLevel) args.p_celebrated_level = opts.celebratedLevel
  if (opts.introSeen) args.p_intro_seen = true
  const { data, error } = await createClient().rpc('pet_mark_visit', args)
  if (error) throw toPetError(error, "Couldn't save your visit.")
  return parseVisit(data)
}

export interface AdoptOutcome {
  pet: PetRow
  /** The partner adopted first: this is their pet, not the one just picked. */
  partnerWasFaster: boolean
}

export async function adopt(type: PetType, name: string): Promise<AdoptOutcome> {
  if (isOffline()) throw new PetError('offline', "You're offline. Try again when you're back online.")
  const clean = name.replace(/\s+/g, ' ').trim()
  // /api/pet/adopt calls adopt_pet with this session and sends the partner the
  // one adoption push (kind "pet"); alreadyAdopted = the partner was faster.
  let res: Response
  try {
    res = await fetch('/api/pet/adopt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, name: clean }),
    })
  } catch {
    throw new PetError(isOffline() ? 'offline' : 'failed', "Couldn't adopt just now. Check your connection and try again.")
  }
  const json = (await res.json().catch(() => ({}))) as { pet?: PetRow; alreadyAdopted?: boolean; error?: string }
  if (!res.ok || !json.pet) {
    const kind = res.status === 409 ? 'closed' : res.status === 400 ? 'invalid' : 'failed'
    throw new PetError(kind, json.error || "Couldn't adopt just now. Try again.")
  }
  const row = json.pet
  return {
    pet: { ...row, pet_type: row.pet_type === 'dog' ? 'dog' : 'cat' },
    partnerWasFaster: !!json.alreadyAdopted,
  }
}

export async function rename(petId: string, name: string): Promise<string> {
  if (isOffline()) throw new PetError('offline', "You're offline. Try again when you're back online.")
  const clean = name.trim()
  const { data, error } = await createClient()
    .from('couple_pets').update({ name: clean }).eq('id', petId).select('name').maybeSingle()
  if (error || !data) throw toPetError(error, "Couldn't rename just now. Try again.")
  return data.name
}

/** Today's note. The API writes it (AI or template); a ready row is the fallback. */
export async function fetchTodayNote(petId: string): Promise<ShownNote | null> {
  try {
    const res = await fetch('/api/pet/today', { cache: 'no-store' })
    if (res.ok) {
      const note = parseNote(await res.json().catch(() => null))
      if (note) return note
    }
  } catch {
    // Fall through to the stored row.
  }
  const { data } = await createClient()
    .from('pet_daily_notes')
    .select('note_date, kind, title, line, status')
    .eq('pet_id', petId).eq('note_date', todayJakarta()).eq('status', 'ready')
    .maybeSingle()
  return parseNote(data)
}

/** Ready notes, newest first (the Notes sheet). */
export async function fetchNotes(petId: string): Promise<ShownNote[]> {
  const { data, error } = await createClient()
    .from('pet_daily_notes')
    .select('note_date, kind, title, line, status')
    .eq('pet_id', petId).eq('status', 'ready')
    .order('note_date', { ascending: false })
    .limit(PET_RULES.limits.notes_max)
  if (error) throw toPetError(error, "Couldn't load the notes. Try again.")
  return (data ?? []).map(parseNote).filter((n): n is ShownNote => !!n)
}

const EVENT_COLUMNS = 'id, pet_id, couple_id, actor_id, source, ref_id, gesture, detail, points, day, created_at'

function asEvent(row: Obj): PetWarmthEvent {
  return {
    id: String(row.id),
    pet_id: String(row.pet_id),
    couple_id: String(row.couple_id),
    actor_id: str(row.actor_id),
    source: (str(row.source) ?? 'legacy') as PetWarmthEvent['source'],
    ref_id: str(row.ref_id),
    gesture: asGesture(row.gesture),
    detail: (str(row.detail) as PetWarmthEvent['detail']) ?? null,
    points: num(row.points),
    day: str(row.day) ?? '',
    created_at: str(row.created_at) ?? '',
  }
}

/**
 * Up to 3 newest warmth events after `since` (the visit before this one).
 * First visit (no `since`): the newest 3 of the last week.
 */
export async function fetchSinceVisit(petId: string, since: string | null): Promise<PetWarmthEvent[]> {
  const from = since ?? new Date(Date.now() - 7 * 86_400_000).toISOString()
  const { data, error } = await createClient()
    .from('pet_warmth_events')
    .select(EVENT_COLUMNS)
    .eq('pet_id', petId)
    .neq('source', 'legacy')
    .gt('created_at', from)
    .order('created_at', { ascending: false })
    .limit(PET_RULES.limits.since_visit_max)
  if (error) throw toPetError(error, "Couldn't load what's new.")
  return (data ?? []).map((r) => asEvent(r as Obj))
}

/** Members who have ever said hi; only needed while the pet is still in its box. */
export async function fetchEverSaidHi(petId: string): Promise<string[]> {
  const { data } = await createClient()
    .from('pet_warmth_events')
    .select('actor_id')
    .eq('pet_id', petId).eq('source', 'hi')
    .limit(50)
  return Array.from(new Set((data ?? []).map((r) => r.actor_id).filter((x): x is string => !!x)))
}

/** Live values for the room's items. null = couldn't read it (the item still shows). */
export interface RoomData {
  jarNotesThisMonth: number | null
  latestMoment: { id: string; title: string; date: string; photoUrl: string | null; photoPath: string | null } | null
  /** Letters still sealed (opening time not reached yet). */
  lettersSealed: number | null
  bothHiDaysThisMonth: number | null
  nextEvent: { title: string; days: number } | null
  mapPins: number | null
  gamesThisMonth: number | null
}

export const EMPTY_ROOM: RoomData = {
  jarNotesThisMonth: null,
  latestMoment: null,
  lettersSealed: null,
  bothHiDaysThisMonth: null,
  nextEvent: null,
  mapPins: null,
  gamesThisMonth: null,
}

/** Reads only what the earned items need. Each read fails on its own. */
export async function fetchRoomData(coupleId: string, petId: string, level: number): Promise<RoomData> {
  const supabase = createClient()
  const month = monthKeyJakarta()
  const monthStart = new Date(`${month}-01T00:00:00+07:00`).toISOString()
  const today = todayJakarta()
  const has = (lv: number) => level >= lv
  const skip = Promise.resolve(null)

  const jar = has(3)
    ? supabase.from('gratitude_notes').select('id', { count: 'exact', head: true })
        .eq('couple_id', coupleId).gte('created_at', monthStart)
        .then(({ count, error }) => (error ? null : count ?? 0))
    : skip

  const moment = has(4)
    ? supabase.from('moments').select('id, title, moment_date, moment_photos(storage_path, sort_order)')
        .eq('couple_id', coupleId)
        .order('moment_date', { ascending: false }).order('created_at', { ascending: false })
        .limit(1).maybeSingle()
        .then(async ({ data, error }) => {
          if (error || !data) return null
          const photos = ((data as { moment_photos?: { storage_path: string; sort_order: number }[] }).moment_photos ?? [])
            .slice().sort((a, b) => a.sort_order - b.sort_order)
          const path = photos[0]?.storage_path ?? null
          let url: string | null = null
          if (path) {
            try { url = (await signPhotoPaths([path]))[path]?.url ?? null } catch { url = null }
          }
          return { id: data.id, title: data.title, date: data.moment_date, photoUrl: url, photoPath: path }
        })
    : skip

  const letters = has(6)
    ? supabase.from('letters').select('id', { count: 'exact', head: true })
        .eq('couple_id', coupleId).eq('is_opened', false).gt('unlock_date', new Date().toISOString())
        .then(({ count, error }) => (error ? null : count ?? 0))
    : skip

  const plant = has(7)
    ? supabase.from('pet_warmth_events').select('id', { count: 'exact', head: true })
        .eq('pet_id', petId).eq('source', 'hi_both').gte('day', `${month}-01`)
        .then(({ count, error }) => (error ? null : count ?? 0))
    : skip

  const calendar = has(8)
    ? supabase.from('couple_events').select('title, event_date, is_recurring, is_completed, event_scope')
        .eq('couple_id', coupleId)
        .or(`is_recurring.eq.true,event_date.gte.${today}`)
        .limit(200)
        .then(({ data, error }) => {
          if (error) return null
          let best: { title: string; days: number } | null = null
          for (const e of data ?? []) {
            if (e.event_scope === 'personal' || (!e.is_recurring && e.is_completed)) continue
            const date = e.is_recurring ? getNextOccurrence(e.event_date) : e.event_date
            const days = daysUntil(date)
            if (days < 0 || days > PET_RULES.limits.calendar_days_max) continue
            if (!best || days < best.days) best = { title: e.title, days }
          }
          return best
        })
    : skip

  const pins = has(13)
    ? supabase.from('moments').select('latitude, longitude, location_name')
        .eq('couple_id', coupleId).not('latitude', 'is', null)
        .limit(500)
        .then(({ data, error }) => {
          if (error) return null
          const places = new Set((data ?? []).map((m) =>
            m.location_name?.trim().toLowerCase() || `${Number(m.latitude).toFixed(3)},${Number(m.longitude).toFixed(3)}`))
          return Math.min(places.size, PET_RULES.limits.map_pins_max)
        })
    : skip

  const games = has(14)
    ? supabase.from('pet_warmth_events').select('id', { count: 'exact', head: true })
        .eq('pet_id', petId).eq('source', 'game').gte('day', `${month}-01`)
        .then(({ count, error }) => (error ? null : count ?? 0))
    : skip

  const settle = async <T,>(p: PromiseLike<T>): Promise<T | null> => {
    try { return await p } catch { return null }
  }
  const [j, m, l, p, c, mp, g] = await Promise.all([
    settle(jar), settle(moment), settle(letters), settle(plant), settle(calendar), settle(pins), settle(games),
  ])
  return {
    jarNotesThisMonth: j as number | null,
    latestMoment: m as RoomData['latestMoment'],
    lettersSealed: l as number | null,
    bothHiDaysThisMonth: p as number | null,
    nextEvent: c as RoomData['nextEvent'],
    mapPins: mp as number | null,
    gamesThisMonth: g as number | null,
  }
}
