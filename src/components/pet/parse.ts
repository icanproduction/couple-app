// Pure parsers for the Pet Kita RPC JSON (no Supabase client, safe on the server).
import { todayJakarta } from '@/lib/dates'
import { PET_RULES, type Gesture, type HiResult, type PetHi, type PetStatus, type PetVisitResult } from '@/types/pet'

export type Obj = Record<string, unknown>
export const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)
export const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)
export const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : d)
export const bool = (v: unknown): boolean => v === true

const GESTURES = new Set<string>(PET_RULES.gestures)
export const asGesture = (v: unknown): Gesture | null => (typeof v === 'string' && GESTURES.has(v) ? (v as Gesture) : null)

/** pet_status() JSON → PetStatus (null while the couple has no pet). */
export function parseStatus(json: unknown): PetStatus | null {
  if (!isObj(json) || !str(json.pet_id)) return null
  const his: PetHi[] = Array.isArray(json.said_hi_today)
    ? json.said_hi_today.filter(isObj).map((h) => ({
        profile_id: str(h.profile_id) ?? '',
        gesture: asGesture(h.gesture),
        at: str(h.at) ?? '',
      })).filter((h) => h.profile_id)
    : []
  const stage = str(json.stage)
  const mood = str(json.mood)
  return {
    pet_id: str(json.pet_id) ?? '',
    couple_id: str(json.couple_id) ?? '',
    name: str(json.name) ?? 'Pet Kita',
    pet_type: json.pet_type === 'dog' ? 'dog' : 'cat',
    created_at: str(json.created_at),
    level: Math.max(1, num(json.level, 1)),
    xp: Math.max(0, num(json.xp)),
    into_level: Math.max(0, num(json.into_level)),
    xp_per_level: num(json.xp_per_level, PET_RULES.xp_per_level) || PET_RULES.xp_per_level,
    stage: stage === 'growing' || stage === 'grown' || stage === 'wise' ? stage : 'little',
    mood: mood === 'glowing' || mood === 'dozy' ? mood : 'cozy',
    warmth_72h: num(json.warmth_72h),
    comfort_for: Array.isArray(json.comfort_for) ? json.comfort_for.filter((x): x is string => typeof x === 'string') : [],
    said_hi_today: his,
    both_today: bool(json.both_today),
    hatched: bool(json.hatched),
    hatched_at: str(json.hatched_at),
    migrated: bool(json.migrated),
    night: bool(json.night),
    day: str(json.day) ?? '',
  }
}

export function parseHi(json: unknown): HiResult {
  const o = isObj(json) ? json : {}
  return {
    counted: bool(o.counted),
    points: num(o.points),
    both_today: bool(o.both_today),
    level: Math.max(1, num(o.level, 1)),
    xp: num(o.xp),
    leveled_up: bool(o.leveled_up),
    hatched: bool(o.hatched),
    just_hatched: bool(o.just_hatched),
  }
}

export function parseVisit(json: unknown): PetVisitResult | null {
  if (!isObj(json)) return null
  return {
    first_visit: bool(json.first_visit),
    previous_seen_at: str(json.previous_seen_at),
    last_seen_at: str(json.last_seen_at) ?? new Date().toISOString(),
    celebrated_level: Math.max(1, num(json.celebrated_level, 1)),
    intro_seen_at: str(json.intro_seen_at),
    level: Math.max(1, num(json.level, 1)),
  }
}

/** A note the screens can show: from the API, or from a pet_daily_notes row. */
export interface ShownNote {
  date: string
  kind: 'daily' | 'weekly'
  title: string | null
  line: string
  /** A stand-in while another request is still writing today's note. */
  pending: boolean
}

export function parseNote(json: unknown): ShownNote | null {
  const o = isObj(json) && isObj(json.note) ? json.note : json
  if (!isObj(o)) return null
  const line = str(o.line)?.trim()
  if (!line) return null
  if (o.status !== undefined && o.status !== 'ready') return null
  return {
    date: str(o.note_date) ?? str(o.date) ?? todayJakarta(),
    kind: o.kind === 'weekly' ? 'weekly' : 'daily',
    title: str(o.title)?.trim() || null,
    line,
    pending: o.pending === true,
  }
}
