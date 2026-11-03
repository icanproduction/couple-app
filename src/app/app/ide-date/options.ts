// AI date ideas (F21): option lists, limits and the idea shape. Client-safe:
// shared by the /app/ide-date page and the server code in src/lib/date-ideas.ts.

export const DATE_IDEA_DAILY_LIMIT = 5
export const CITY_MAX = 40

export const BUDGETS = ['hemat', 'sedang', 'spesial'] as const
export const VIBES = ['santai', 'romantis', 'seru', 'kuliner', 'produktif'] as const
export const SETTINGS = ['indoor', 'outdoor', 'bebas'] as const
/** Same list as the DB check on bucket_items.category */
export const IDEA_CATEGORIES = ['petualangan', 'kuliner', 'traveling', 'romantis', 'belajar', 'rumah', 'lainnya'] as const

export type Budget = (typeof BUDGETS)[number]
export type Vibe = (typeof VIBES)[number]
export type Setting = (typeof SETTINGS)[number]
export type IdeaCategory = (typeof IDEA_CATEGORIES)[number]

// Type aliases (not interfaces) so they are assignable to the Json column type.
export type DateIdeaInput = {
  budget: Budget
  vibe: Vibe
  setting: Setting
  city: string | null
}

export type DateIdea = {
  title: string
  description: string
  estimated_cost_idr: number
  category: IdeaCategory
  tips: string
}

export const IDEA_LIMITS = { title: 80, description: 300, tips: 160 } as const

export const BUDGET_LABELS: Record<Budget, { label: string; hint: string }> = {
  hemat: { label: 'Hemat', hint: '< Rp 100rb' },
  sedang: { label: 'Sedang', hint: 'Rp 100–500rb' },
  spesial: { label: 'Spesial', hint: '> Rp 500rb' },
}

export const VIBE_LABELS: Record<Vibe, string> = {
  santai: 'Santai',
  romantis: 'Romantis',
  seru: 'Seru',
  kuliner: 'Kuliner',
  produktif: 'Produktif',
}

export const SETTING_LABELS: Record<Setting, string> = {
  indoor: 'Indoor',
  outdoor: 'Outdoor',
  bebas: 'Bebas',
}

export const CATEGORY_LABELS: Record<IdeaCategory, string> = {
  petualangan: 'Petualangan',
  kuliner: 'Kuliner',
  traveling: 'Traveling',
  romantis: 'Romantis',
  belajar: 'Belajar',
  rumah: 'Di rumah',
  lainnya: 'Lainnya',
}

// Any letter (incl. accented), space, dot, comma, hyphen. Built at runtime:
// the TS target predates the /u regex flag.
const CITY_PATTERN = new RegExp('^[\\p{L} .,-]+$', 'u')

/** Trimmed city, null when empty, or an error message. */
export function cleanCity(raw: unknown): { ok: true; city: string | null } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, city: null }
  if (typeof raw !== 'string') return { ok: false, error: 'Kota tidak valid' }
  const city = raw.trim().replace(/\s+/g, ' ')
  if (!city) return { ok: true, city: null }
  if (city.length > CITY_MAX) return { ok: false, error: `Nama kota maksimal ${CITY_MAX} karakter` }
  if (!CITY_PATTERN.test(city)) return { ok: false, error: 'Nama kota cukup huruf, spasi, titik, koma, atau tanda hubung' }
  return { ok: true, city }
}

function oneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value)
}

/** Validates the POST body of /api/ai/date-ideas. */
export function parseDateIdeaInput(body: unknown): { ok: true; input: DateIdeaInput } | { ok: false; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'Data tidak valid' }
  const b = body as Record<string, unknown>
  if (!oneOf(BUDGETS, b.budget)) return { ok: false, error: 'Pilih budget dulu' }
  if (!oneOf(VIBES, b.vibe)) return { ok: false, error: 'Pilih suasana dulu' }
  if (!oneOf(SETTINGS, b.setting)) return { ok: false, error: 'Pilih tempat dulu' }
  const city = cleanCity(b.city)
  if (!city.ok) return city
  return { ok: true, input: { budget: b.budget, vibe: b.vibe, setting: b.setting, city: city.city } }
}

/** Reads a stored run's ideas defensively (jsonb from the DB). */
export function readStoredIdeas(value: unknown): DateIdea[] {
  if (!Array.isArray(value)) return []
  return value.filter((i): i is DateIdea =>
    !!i && typeof i === 'object'
    && typeof (i as DateIdea).title === 'string'
    && typeof (i as DateIdea).description === 'string'
    && typeof (i as DateIdea).estimated_cost_idr === 'number'
    && oneOf(IDEA_CATEGORIES, (i as DateIdea).category)
    && typeof (i as DateIdea).tips === 'string')
}

/** Reads a stored run's input defensively. */
export function readStoredInput(value: unknown): DateIdeaInput | null {
  const parsed = parseDateIdeaInput(value)
  return parsed.ok ? parsed.input : null
}
