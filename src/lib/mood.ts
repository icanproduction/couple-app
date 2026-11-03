// Mood check-in (F16): one mood per person per Jakarta day, visible to the
// partner. Runtime-import-free (type imports only) so scripts/verify can load
// it with plain node; callers pass their Supabase client and today's date.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type Client = SupabaseClient<Database>
export type MoodCheckin = Database['public']['Tables']['mood_checkins']['Row']

/** Same list, same order as the DB check on mood_checkins.mood */
export const MOOD_KEYS = ['senang', 'semangat', 'biasa', 'capek', 'sedih', 'kesal', 'cemas', 'kangen'] as const
export type MoodKey = (typeof MOOD_KEYS)[number]

export const MOOD_NOTE_MAX = 140

export interface MoodInfo {
  key: MoodKey
  emoji: string
  label: string
  /** Strong colour (text, bars) as hex: src/lib is outside Tailwind's content globs */
  color: string
  /** Soft background */
  soft: string
  /** What the partner could do, shown on the partner's side */
  suggestion: string
}

export const MOODS: Record<MoodKey, MoodInfo> = {
  senang: {
    key: 'senang', emoji: '😊', label: 'Senang', color: '#C98A1E', soft: '#FFF4DB',
    suggestion: 'Ikut senang bareng dia. Tanya apa yang bikin harinya cerah.',
  },
  semangat: {
    key: 'semangat', emoji: '🔥', label: 'Semangat', color: '#E0702F', soft: '#FFEBDD',
    suggestion: 'Dukung semangatnya, kasih pujian atau rayakan kecil-kecilan.',
  },
  biasa: {
    key: 'biasa', emoji: '😐', label: 'Biasa aja', color: '#8A7E7E', soft: '#F3EFEA',
    suggestion: 'Sapaan kecil darimu bisa bikin harinya lebih hangat.',
  },
  capek: {
    key: 'capek', emoji: '😩', label: 'Capek', color: '#7E6CB8', soft: '#EFEBFA',
    suggestion: 'Mungkin dia butuh dipeluk & istirahat.',
  },
  sedih: {
    key: 'sedih', emoji: '😢', label: 'Sedih', color: '#4F7FBF', soft: '#E6EFFA',
    suggestion: 'Dengarkan dulu tanpa buru-buru kasih solusi. Kehadiranmu sudah cukup.',
  },
  kesal: {
    key: 'kesal', emoji: '😤', label: 'Kesal', color: '#D04848', soft: '#FDE4E4',
    suggestion: 'Kasih ruang sebentar, lalu tanya pelan-pelan apa yang terjadi.',
  },
  cemas: {
    key: 'cemas', emoji: '😟', label: 'Cemas', color: '#3E8F86', soft: '#E0F2EF',
    suggestion: 'Ajak ngobrol santai dan bantu pecah masalahnya jadi kecil-kecil.',
  },
  kangen: {
    key: 'kangen', emoji: '🥺', label: 'Kangen', color: '#D9487F', soft: '#FDE6EF',
    suggestion: 'Dia lagi kangen kamu. Telepon atau kirim pesan manis sekarang.',
  },
}

export function isMoodKey(value: unknown): value is MoodKey {
  return typeof value === 'string' && (MOOD_KEYS as readonly string[]).includes(value)
}

/** Display info for a stored mood, or null for an unknown value */
export function moodInfo(value: string | null | undefined): MoodInfo | null {
  return isMoodKey(value) ? MOODS[value] : null
}

/** "YYYY-MM-DD" shifted by whole days (timezone independent) */
export function shiftDate(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** The `count` date keys ending at `endDate`, oldest first */
export function dateRange(endDate: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => shiftDate(endDate, i - count + 1))
}

/** How often each mood appears, most frequent first (zero counts left out) */
export function countMoods(rows: Pick<MoodCheckin, 'mood'>[]): { mood: MoodInfo; count: number }[] {
  const counts = new Map<MoodKey, number>()
  for (const r of rows) {
    if (isMoodKey(r.mood)) counts.set(r.mood, (counts.get(r.mood) ?? 0) + 1)
  }
  return MOOD_KEYS.filter((k) => counts.has(k))
    .map((k) => ({ mood: MOODS[k], count: counts.get(k) ?? 0 }))
    .sort((a, b) => b.count - a.count)
}

/** Every check-in of the couple from `fromDate` (inclusive), newest first */
export async function listCheckins(client: Client, coupleId: string, fromDate: string): Promise<MoodCheckin[]> {
  const { data, error } = await client
    .from('mood_checkins')
    .select('*')
    .eq('couple_id', coupleId)
    .gte('checkin_date', fromDate)
    .order('checkin_date', { ascending: false })
  if (error) throw error
  return data ?? []
}

export interface SaveCheckinInput {
  coupleId: string
  userId: string
  mood: MoodKey
  note: string | null
  /** Jakarta "YYYY-MM-DD"; one row per person per date, later saves replace it */
  date: string
}

/** Sets (or changes) my mood for `date` */
export async function saveCheckin(client: Client, input: SaveCheckinInput): Promise<MoodCheckin> {
  const note = input.note?.trim() || null
  if (note && note.length > MOOD_NOTE_MAX) throw new Error(`Catatan maksimal ${MOOD_NOTE_MAX} karakter`)
  const { data, error } = await client
    .from('mood_checkins')
    .upsert(
      { couple_id: input.coupleId, profile_id: input.userId, mood: input.mood, note, checkin_date: input.date },
      { onConflict: 'profile_id,checkin_date' }
    )
    .select()
    .single()
  if (error) throw error
  return data
}
