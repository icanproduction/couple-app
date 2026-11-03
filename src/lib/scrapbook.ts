// Scrapbook (F11): pick a range of moments and print them as an A4 album.
// Data is loaded once without URLs; only the photos of the moments actually
// in the scrapbook get signed (in batches, see signPhotoPaths).
import { createClient } from '@/lib/supabase'
import { monthKeyJakarta } from '@/lib/dates'
import { monthLabel, sortPhotos, type Moment, type MomentPhoto } from '@/lib/moments'

export type ScrapbookStyle = 'polaroid' | 'majalah'

export const SCRAPBOOK_STYLES: { id: ScrapbookStyle; label: string; hint: string }[] = [
  { id: 'polaroid', label: 'Polaroid', hint: 'Warm, instant-photo look' },
  { id: 'majalah', label: 'Magazine', hint: 'Clean, like a special edition' },
]

export type RangeKind = 'this-month' | 'month' | 'year' | 'all' | 'manual'

export interface ScrapbookRange {
  kind: RangeKind
  /** "YYYY-MM" for kind 'month' */
  month: string
  /** for kind 'year' */
  year: number
  /** for kind 'manual' */
  ids: Set<string>
}

export interface ScrapbookMoment extends Moment {
  photos: MomentPhoto[]
}

export const MAX_COVER_TITLE = 60

/** Every moment of the couple, oldest first (a scrapbook reads like a story). */
export async function listScrapbookMoments(coupleId: string): Promise<ScrapbookMoment[]> {
  const { data, error } = await createClient()
    .from('moments')
    .select('*, moment_photos(*)')
    .eq('couple_id', coupleId)
    .order('moment_date', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map(({ moment_photos, ...m }) => ({ ...m, photos: sortPhotos(moment_photos) }))
}

export function filterByRange(moments: ScrapbookMoment[], range: ScrapbookRange, now: Date = new Date()): ScrapbookMoment[] {
  switch (range.kind) {
    case 'this-month': {
      const key = monthKeyJakarta(now)
      return moments.filter((m) => m.moment_date.startsWith(`${key}-`))
    }
    case 'month':
      return moments.filter((m) => m.moment_date.startsWith(`${range.month}-`))
    case 'year':
      return moments.filter((m) => m.moment_date.startsWith(`${range.year}-`))
    case 'manual':
      return moments.filter((m) => range.ids.has(m.id))
    default:
      return moments
  }
}

/** "Sep 2026" */
function shortMonth(dateKey: string): string {
  const [y, m] = dateKey.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
}

/** Human label for the cover: "October 2026", "2025", "Jan 2025 – Oct 2026". */
export function rangeLabel(range: ScrapbookRange, selected: ScrapbookMoment[], now: Date = new Date()): string {
  if (range.kind === 'this-month') return monthLabel(`${monthKeyJakarta(now)}-01`)
  if (range.kind === 'month') return monthLabel(`${range.month}-01`)
  if (range.kind === 'year') return String(range.year)
  if (selected.length === 0) return ''
  const first = selected[0].moment_date
  const last = selected[selected.length - 1].moment_date
  if (first.slice(0, 7) === last.slice(0, 7)) return monthLabel(first)
  if (first.slice(0, 4) === last.slice(0, 4) && first.slice(5, 7) === '01' && last.slice(5, 7) === '12') {
    return first.slice(0, 4)
  }
  return `${shortMonth(first)} – ${shortMonth(last)}`
}

/** Photo used on the cover: a favorite's cover if there is one, else the first cover. */
export function coverPhoto(selected: ScrapbookMoment[]): MomentPhoto | null {
  const withPhotos = selected.filter((m) => m.photos.length > 0)
  return (withPhotos.find((m) => m.is_favorite) ?? withPhotos[0])?.photos[0] ?? null
}

/**
 * Resolves once every <img> under `root` has loaded or failed (or after the
 * timeout). Returns how many images are still missing.
 */
export async function waitForImages(root: ParentNode, timeoutMs = 25_000): Promise<number> {
  const images = Array.from(root.querySelectorAll('img'))
  const settle = (img: HTMLImageElement) =>
    new Promise<boolean>((resolve) => {
      if (img.complete) { resolve(img.naturalWidth > 0); return }
      img.addEventListener('load', () => resolve(true), { once: true })
      img.addEventListener('error', () => resolve(false), { once: true })
    })
  const all = Promise.all(images.map(settle)).then((results) => results.filter((ok) => !ok).length)
  const timeout = new Promise<number>((resolve) =>
    setTimeout(() => resolve(images.filter((img) => !img.complete || img.naturalWidth === 0).length), timeoutMs)
  )
  return Promise.race([all, timeout])
}
