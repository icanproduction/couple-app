// Quick Moment: turns what the photos know (capture time, GPS) into form
// values, so a new moment can be saved right after picking photos.
// Pure and free of '@/' imports so scripts/verify/moment-autofill.mjs can
// import it under Node with type stripping. All times are read in WIB
// (Asia/Jakarta, UTC+7, no daylight saving).

/** Same limit as MAX_TITLE in src/lib/moments.ts (the verify script checks they match). */
export const MAX_TITLE = 100

/** A camera clock a few minutes fast is not "the future". */
const CLOCK_SLACK_MS = 10 * 60_000
const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS
const WIB_OFFSET_MS = 7 * HOUR_MS
const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/

/** Place phrase budget: the venue, plus the area only when both stay short. */
const VENUE_MAX = 48
const AREA_MAX = 28
const PLACE_MAX = 56

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export type TimeOfDay = 'morning' | 'afternoon' | 'late afternoon' | 'evening' | 'night'

/** Structural twin of PhotoMeta in src/lib/exif.ts */
export interface PhotoMetaLike {
  /** Capture day, YYYY-MM-DD */
  date: string | null
  /** Capture instant, ISO */
  takenAt: string | null
  latitude: number | null
  longitude: number | null
}

// ── Time ────────────────────────────────────────────────────────────

function toMs(value: string | number | Date | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const ms = value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}

/** "YYYY-MM-DD" of an instant in Jakarta. */
export function jakartaDay(at: string | number | Date): string | null {
  const ms = toMs(at)
  return ms === null ? null : new Date(ms + WIB_OFFSET_MS).toISOString().slice(0, 10)
}

/** Hour 0-23 of an instant in Jakarta. */
export function jakartaHour(at: string | number | Date): number | null {
  const ms = toMs(at)
  return ms === null ? null : new Date(ms + WIB_OFFSET_MS).getUTCHours()
}

/** UTC midnight of a real calendar day, or null for "2026-02-31" and other junk. */
function dayToUtc(key: string | null | undefined): number | null {
  const m = typeof key === 'string' ? DATE_KEY.exec(key) : null
  if (!m) return null
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return new Date(ms).toISOString().slice(0, 10) === key ? ms : null
}

function shiftDay(key: string, days: number): string {
  return new Date((dayToUtc(key) as number) + days * DAY_MS).toISOString().slice(0, 10)
}

/** A real day that is today or earlier (in Jakarta). */
function pastDay(key: string | null | undefined, today: string): string | null {
  return key && dayToUtc(key) !== null && key <= today ? key : null
}

/** A capture instant that is not in the future (allowing a slightly fast clock). */
function pastInstant(at: string | number | Date | null | undefined, nowMs: number): number | null {
  const ms = toMs(at)
  return ms !== null && ms <= nowMs + CLOCK_SLACK_MS ? ms : null
}

/**
 * WIB buckets: morning 05-11, afternoon 11-15, late afternoon 15-18,
 * evening 18-22, night 22-05.
 */
export function timeOfDay(at: string | number | Date): TimeOfDay | null {
  const h = jakartaHour(at)
  if (h === null) return null
  if (h >= 5 && h < 11) return 'morning'
  if (h >= 11 && h < 15) return 'afternoon'
  if (h >= 15 && h < 18) return 'late afternoon'
  if (h >= 18 && h < 22) return 'evening'
  return 'night'
}

/** Was the photo taken in the last `hours` hours? Unknown or future times are not recent. */
export function isRecentPhoto(
  takenAt: string | number | Date | null | undefined,
  now: Date = new Date(),
  hours = 6,
): boolean {
  const nowMs = now.getTime()
  const ms = pastInstant(takenAt, nowMs)
  return ms !== null && nowMs - ms <= hours * HOUR_MS
}

function yearOf(now: Date): number {
  return Number((jakartaDay(now) as string).slice(0, 4))
}

function dayLabel(key: string, withYear: boolean): string {
  const [y, m, d] = key.split('-').map(Number)
  return `${d} ${MONTHS[m - 1]}${withYear ? ` ${y}` : ''}`
}

/** "14 September" (en-GB order), with the year only when it isn't this year. */
export function formatDay(key: string, now: Date = new Date()): string {
  return dayLabel(key, Number(key.slice(0, 4)) !== yearOf(now))
}

/** "14 to 16 September", "30 September to 2 October", years only when needed. */
export function formatDayRange(first: string, last: string, now: Date = new Date()): string {
  if (first === last) return formatDay(first, now)
  const [y1, m1, d1] = first.split('-').map(Number)
  const [y2, m2] = last.split('-').map(Number)
  if (y1 !== y2) return `${dayLabel(first, true)} to ${dayLabel(last, true)}`
  const end = dayLabel(last, y2 !== yearOf(now))
  return m1 === m2 ? `${d1} to ${end}` : `${dayLabel(first, false)} to ${end}`
}

// ── Photos ──────────────────────────────────────────────────────────

export interface Coordinates {
  latitude: number
  longitude: number
}

export interface PhotoPick {
  /** Earliest capture day that isn't in the future */
  date: string | null
  /** Capture instant of that earliest photo, when known */
  takenAt: string | null
  /** Latest capture day (for "these photos span several days") */
  lastDate: string | null
  /** Number of different capture days */
  days: number
  /** Most recent capture instant (for "taken just now?") */
  newestTakenAt: string | null
  /** Position of the first photo that has one */
  coords: Coordinates | null
  /** Which form fields the photos can fill */
  from: { date: boolean; time: boolean; place: boolean }
}

function validCoords(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === 'number' && typeof lng === 'number' &&
    Number.isFinite(lat) && Number.isFinite(lng) &&
    Math.abs(lat) <= 90 && Math.abs(lng) <= 180 &&
    // 0,0 is what many apps write when the fix was missing.
    !(lat === 0 && lng === 0)
  )
}

/**
 * Sums up a set of photos: the earliest real capture day (future dates from a
 * wrong camera clock are ignored), the time of that photo, and the first GPS fix.
 */
export function pickPhotoMeta(photos: readonly PhotoMetaLike[], now: Date = new Date()): PhotoPick {
  const nowMs = now.getTime()
  const today = jakartaDay(now) as string
  const days = new Set<string>()
  let first: { day: string; ms: number | null } | null = null
  let lastDate: string | null = null
  let newest: number | null = null
  let coords: Coordinates | null = null

  for (const p of photos) {
    const ms = pastInstant(p.takenAt, nowMs)
    // The camera's own date first; a camera abroad can be a day ahead of
    // Jakarta, so then fall back to the Jakarta day of the instant.
    const day = pastDay(p.date, today) ?? (ms !== null ? pastDay(jakartaDay(ms), today) : null)
    if (day) {
      days.add(day)
      if (!first || day < first.day || (day === first.day && ms !== null && (first.ms === null || ms < first.ms))) {
        first = { day, ms }
      }
      if (!lastDate || day > lastDate) lastDate = day
    }
    if (ms !== null && (newest === null || ms > newest)) newest = ms
    if (!coords && validCoords(p.latitude, p.longitude)) {
      coords = { latitude: p.latitude as number, longitude: p.longitude as number }
    }
  }

  const takenAt = first?.ms != null ? new Date(first.ms).toISOString() : null
  return {
    date: first?.day ?? null,
    takenAt,
    lastDate,
    days: days.size,
    newestTakenAt: newest !== null ? new Date(newest).toISOString() : null,
    coords,
    from: { date: !!first, time: takenAt !== null, place: coords !== null },
  }
}

/** A photo just taken with the camera button may come without EXIF: it was taken now. */
export function withCaptureTime(meta: PhotoMetaLike, capturedAt: Date): PhotoMetaLike {
  if (meta.takenAt || meta.date) return meta
  return { ...meta, takenAt: capturedAt.toISOString(), date: jakartaDay(capturedAt) }
}

// ── Place names ─────────────────────────────────────────────────────

export interface PlacePhrase {
  /** "at" a venue, "on" a street, "in" a city or area */
  prep: 'at' | 'on' | 'in'
  main: string
  /** Neighborhood after the venue, when it is short and adds something */
  area: string | null
}

// Address parts that never belong in a title. Regex literals, not strings:
// these are matchers, not copy.
const NOISE_PART = /^(indonesia|republic of indonesia|\d{3,6}|(rt|rw)\b.*)$/i
// Province-level tails, dropped after the venue ("..., Jawa Barat 40115").
const PROVINCE_PART = /^((provinsi|prov\.|daerah khusus|daerah istimewa|special capital region|special region|dki|diy)\b.*|(jawa|sumatera|kalimantan|sulawesi|nusa tenggara) (barat|tengah|timur|utara|selatan)\b.*|(west|central|east|north|south) (java|sumatra|kalimantan|sulawesi|nusa tenggara)\b.*|java|banten)$/i
// Admin words in front of a name: "Kabupaten Bogor" is the area Bogor.
const ADMIN_PREFIX = /^(kota|kabupaten|kab\.|kecamatan|kec\.|kelurahan|kel\.|desa|regency of|city of)\s+/i
const ROAD_PREFIX = /^(jalan|jl\.?|jln\.?|gang|gg\.)\s/i
// Cities and areas people name on their own; anything else reads as a venue.
const KNOWN_AREA = /^(jakarta|south jakarta|north jakarta|west jakarta|east jakarta|central jakarta|jakarta (pusat|utara|barat|selatan|timur)|bandung|lembang|bogor|puncak|sentul|depok|tangerang|tangerang selatan|south tangerang|bsd|bsd city|bintaro|alam sutera|gading serpong|bekasi|cikarang|bali|ubud|canggu|seminyak|kuta|sanur|uluwatu|nusa dua|nusa penida|denpasar|lombok|gili trawangan|labuan bajo|yogyakarta|jogja|jogjakarta|solo|surakarta|semarang|malang|batu|surabaya|bromo|medan|makassar|manado|batam|bintan|palembang|balikpapan|pontianak|padang|bukittinggi|kemang|senopati|menteng|cikini|kuningan|senayan|scbd|blok m|kebayoran|cipete|tebet|kelapa gading|pik|pantai indah kapuk|kota tua|ancol|thamrin|sudirman|braga|dago)$/i

function tidy(part: string): string {
  return part.replace(/\s+/g, ' ').replace(/^[\s"']+|[\s"',.;:-]+$/g, '').trim()
}

/**
 * The area a part names, without its admin word ("Kota Bandung" → "Bandung").
 * "Kota" is also part of real names (Kota Tua, Kota Kasablanka), so it is
 * dropped only in front of a city this file knows. Null when not an area.
 */
function areaName(part: string): string | null {
  if (KNOWN_AREA.test(part)) return part
  const m = ADMIN_PREFIX.exec(part)
  if (!m) return null
  const rest = part.slice(m[0].length)
  if (/^kota$/i.test(m[1]) && !KNOWN_AREA.test(rest)) return null
  return rest
}

/** Shortens on a word boundary and drops a dangling bracket or connector. */
function clip(text: string, max: number): string {
  if (text.length <= max) return text
  let cut = text.slice(0, max + 1)
  const space = cut.lastIndexOf(' ')
  cut = space > max * 0.5 ? cut.slice(0, space) : text.slice(0, max)
  const open = cut.lastIndexOf('(')
  if (open > 0 && cut.indexOf(')', open) === -1) cut = cut.slice(0, open)
  return tidy(cut.replace(/\s+(&|and|at|in|on|of|the|-)$/i, ''))
}

/**
 * Reads a place name ("Kopi Kenangan, Selong", a pasted Google address, a
 * typed "Kota Bandung") into something a title can say.
 */
export function placePhrase(raw: string | null | undefined): PlacePhrase | null {
  const parts = (raw ?? '')
    .split(/\s*[,\n]\s*|\s+[·|]\s+/)
    .map(tidy)
    .filter((p) => p && /\p{L}/u.test(p) && !NOISE_PART.test(p))
  if (parts.length === 0) return null

  const [head, ...rest] = parts
  const headArea = areaName(head)
  if (headArea) return { prep: 'in', main: clip(headArea, VENUE_MAX), area: null }

  const main = clip(head, VENUE_MAX)
  const lower = main.toLowerCase()
  const area = rest
    .filter((p) => !PROVINCE_PART.test(p) && !ROAD_PREFIX.test(p))
    .map((p) => areaName(p) ?? p)
    .find((p) => p.length <= AREA_MAX && !lower.includes(p.toLowerCase()))
  return {
    prep: ROAD_PREFIX.test(main) ? 'on' : 'at',
    main,
    area: area && main.length + area.length + 4 <= PLACE_MAX ? area : null,
  }
}

function placeText(p: PlacePhrase, withArea: boolean): string {
  return `${p.prep} ${p.main}${withArea && p.area ? ` in ${p.area}` : ''}`
}

// ── Titles ──────────────────────────────────────────────────────────

export interface AutoTitleInput {
  /** Place name as shown in the form (typed or from GPS) */
  placeName?: string | null
  /** Capture instant: gives the time of day */
  takenAt?: string | Date | null
  /** Day of the moment, YYYY-MM-DD; defaults to the Jakarta day of takenAt */
  date?: string | null
  now?: Date
}

function article(word: string): string {
  return /^[aeiou]/i.test(word) ? 'an' : 'a'
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * An editable title such as "Saturday evening at Kopi Kenangan in Selong",
 * "Sunday morning in Bandung", "A Friday night out" or, for older photos,
 * "An evening at Kopi Kenangan on 14 September". The day name is used only
 * within the last 7 days. Never longer than MAX_TITLE, never empty.
 */
export function autoTitle({ placeName, takenAt, date, now = new Date() }: AutoTitleInput): string {
  const nowMs = now.getTime()
  const today = jakartaDay(now) as string
  const ms = pastInstant(takenAt, nowMs)
  const day = pastDay(date, today) ?? (ms !== null ? pastDay(jakartaDay(ms), today) : null)
  const tod = ms !== null ? timeOfDay(ms) : null
  // 01:00 on Sunday is still Saturday night, the way people say it.
  const afterMidnight = tod === 'night' && (jakartaHour(ms as number) as number) < 5
  const nightOf = day && afterMidnight ? shiftDay(day, -1) : day
  const ago = nightOf ? Math.round(((dayToUtc(today) as number) - (dayToUtc(nightOf) as number)) / DAY_MS) : null
  const recent = ago !== null && ago >= 0 && ago < 7
  const place = placePhrase(placeName)

  let build: (where: string | null) => string
  if (recent) {
    const weekday = WEEKDAYS[new Date(dayToUtc(nightOf as string) as number).getUTCDay()]
    const when = afterMidnight ? `late ${weekday} night` : tod ? `${weekday} ${tod}` : weekday
    build = (where) => (where ? `${when} ${where}` : `a ${when} out`)
  } else {
    const lead = afterMidnight ? 'a late night' : tod ? `${article(tod)} ${tod}` : 'a day'
    const on = day ? ` on ${formatDay(day, now)}` : ''
    build = (where) => `${lead} ${where ?? 'out'}${on}`
  }

  let title = build(place ? placeText(place, true) : null)
  if (place && title.length > MAX_TITLE) title = build(placeText(place, false))
  if (place && title.length > MAX_TITLE) {
    const room = MAX_TITLE - build(`${place.prep} `).length
    title = build(`${place.prep} ${clip(place.main, Math.max(room, 1))}`)
  }
  return capitalize(title.slice(0, MAX_TITLE).trim())
}
