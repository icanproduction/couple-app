// Moments: one record per date (up to 7 photos, title, date, place + GPS,
// description). Photos live in the private `moments` bucket under
// <couple_id>/<moment_id>/ and are shown through short-lived signed URLs.
import { isAuthApiError, isAuthSessionMissingError } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase'
import { todayJakarta } from '@/lib/dates'
import type { Database } from '@/types/database'
import type { CompressedImage } from '@/lib/image'

export const MOMENTS_BUCKET = 'moments'
export const MAX_MOMENT_PHOTOS = 7
export const MAX_TITLE = 100
export const MAX_DESCRIPTION = 2000
export const MAX_LOCATION = 200
export const MAX_COMMENT = 500
/** Must match the check constraint on moment_reactions.emoji. */
export const MOMENT_REACTIONS = ['❤️', '😍', '🥹', '😂', '🔥', '👏'] as const
export type MomentReactionEmoji = (typeof MOMENT_REACTIONS)[number]
const SIGNED_URL_TTL = 60 * 60
const SIGN_BATCH = 100
/** A page that keeps signed URLs around re-signs them once less than this is left. */
export const SIGNED_URL_MIN_LIFE_MS = 10 * 60 * 1000

export type Moment = Database['public']['Tables']['moments']['Row']
export type MomentPhoto = Database['public']['Tables']['moment_photos']['Row']
export type MomentPhotoWithUrl = MomentPhoto & { url: string | null }
export interface MomentWithPhotos extends Moment {
  photos: MomentPhotoWithUrl[]
}
export type MomentReaction = Database['public']['Tables']['moment_reactions']['Row']
export type MomentComment = Database['public']['Tables']['moment_comments']['Row']

export interface MomentInput {
  title: string
  moment_date: string
  description: string | null
  location_name: string | null
  latitude: number | null
  longitude: number | null
}

export interface CoupleInfo {
  userId: string
  coupleId: string | null
  partnerId: string | null
  names: Record<string, string>
}

/** No session, or the auth server rejected it: the user is signed out (not a network failure). */
function isSignedOutError(error: unknown): boolean {
  if (isAuthSessionMissingError(error)) return true
  return isAuthApiError(error) && error.status >= 400 && error.status < 500 && error.status !== 429
}

/**
 * Who am I, which couple, and display names for both partners.
 * Returns null only when signed out, and coupleId null only when there is no
 * membership row. Any failed request (offline, server error) throws, so
 * callers show an error instead of sending the user to login or "no partner".
 */
export async function getCoupleInfo(): Promise<CoupleInfo | null> {
  const supabase = createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError && !isSignedOutError(authError)) throw authError
  if (!user) return null

  const { data: membership, error: membershipError } = await supabase
    .from('couple_members').select('couple_id').eq('profile_id', user.id).maybeSingle()
  if (membershipError) throw membershipError
  const coupleId = membership?.couple_id ?? null
  if (!coupleId) return { userId: user.id, coupleId: null, partnerId: null, names: {} }

  const { data: members, error: membersError } = await supabase
    .from('couple_members').select('profile_id').eq('couple_id', coupleId)
  if (membersError) throw membersError
  const ids = (members ?? []).map((m) => m.profile_id)
  const { data: profiles, error: profilesError } = await supabase.from('profiles').select('id, name').in('id', ids)
  if (profilesError) throw profilesError
  const names: Record<string, string> = {}
  for (const p of profiles ?? []) names[p.id] = p.name ?? 'Your partner'

  return {
    userId: user.id,
    coupleId,
    partnerId: ids.find((id) => id !== user.id) ?? null,
    names,
  }
}

export interface SignedUrl {
  url: string
  /** ms since epoch */
  expiresAt: number
}

// Reusing a still-fresh signed URL keeps the browser's image cache warm when a
// page reloads its data (live updates would otherwise re-download every photo).
// Each URL is stored with its expiry, and a cached one is only handed out with
// more life left than SIGNED_URL_MIN_LIFE_MS, so it is never already due for
// a refresh. Pages that keep URLs longer re-sign on <img> error (SignedPhoto).
const signedCache = new Map<string, SignedUrl>()
const SIGNED_REUSE_MARGIN_MS = 15 * 60 * 1000

/**
 * Signed URLs (with expiry) for photo paths, requested in batches of 100.
 * `fresh` skips the cache, e.g. after an <img> failed to load its URL.
 */
export async function signPhotoPaths(paths: string[], opts: { fresh?: boolean } = {}): Promise<Record<string, SignedUrl>> {
  const map: Record<string, SignedUrl> = {}
  const now = Date.now()
  const missing: string[] = []
  for (const path of Array.from(new Set(paths))) {
    const hit = opts.fresh ? undefined : signedCache.get(path)
    if (hit && hit.expiresAt - now > SIGNED_REUSE_MARGIN_MS) map[path] = hit
    else missing.push(path)
  }
  if (missing.length === 0) return map

  const storage = createClient().storage.from(MOMENTS_BUCKET)
  const batches: string[][] = []
  for (let i = 0; i < missing.length; i += SIGN_BATCH) batches.push(missing.slice(i, i + SIGN_BATCH))
  const results = await Promise.all(batches.map((batch) => storage.createSignedUrls(batch, SIGNED_URL_TTL)))
  const expiresAt = now + SIGNED_URL_TTL * 1000
  for (const { data } of results) {
    for (const item of data ?? []) {
      if (item.path && item.signedUrl) {
        const signed = { url: item.signedUrl, expiresAt }
        map[item.path] = signed
        signedCache.set(item.path, signed)
      }
    }
  }
  return map
}

/** A new signed URL for one photo whose old URL failed to load (expired), or null. */
export async function resignPhotoPath(path: string): Promise<string | null> {
  const signed = await signPhotoPaths([path], { fresh: true })
  return signed[path]?.url ?? null
}

async function signPaths(paths: string[]): Promise<Record<string, string>> {
  const signed = await signPhotoPaths(paths)
  const urls: Record<string, string> = {}
  for (const [path, s] of Object.entries(signed)) urls[path] = s.url
  return urls
}

export function sortPhotos(photos: MomentPhoto[] | null | undefined): MomentPhoto[] {
  return [...(photos ?? [])].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
}

type MomentRowWithPhotos = Moment & { moment_photos: MomentPhoto[] | null }

/** Sorts each moment's photos and signs only the cover (first photo). */
async function withSignedCovers(data: MomentRowWithPhotos[] | null): Promise<MomentWithPhotos[]> {
  const rows = (data ?? []).map((m) => ({ ...m, moment_photos: sortPhotos(m.moment_photos) }))
  const urls = await signPaths(rows.flatMap((m) => (m.moment_photos[0] ? [m.moment_photos[0].storage_path] : [])))
  return rows.map(({ moment_photos, ...m }) => ({
    ...m,
    photos: moment_photos.map((p, i) => ({ ...p, url: i === 0 ? urls[p.storage_path] ?? null : null })),
  }))
}

/** Newest date first; only each moment's cover gets a signed URL. */
export async function listMoments(coupleId: string): Promise<MomentWithPhotos[]> {
  const { data, error } = await createClient()
    .from('moments')
    .select('*, moment_photos(*)')
    .eq('couple_id', coupleId)
    .order('moment_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return withSignedCovers(data)
}

/** Favorite is shared by the couple: either partner can toggle it. */
export async function setMomentFavorite(momentId: string, isFavorite: boolean): Promise<void> {
  const { error } = await createClient().from('moments').update({ is_favorite: isFavorite }).eq('id', momentId)
  if (error) throw error
}

// ── Kenangan hari ini (F13) ─────────────────────────────────

function isValidDateKey(key: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false
  const [y, m, d] = key.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

/**
 * Same month-day in each of the previous `yearsBack` years. On 28 Feb of a
 * non-leap year, 29 Feb of earlier leap years counts too.
 */
export function onThisDayDates(today: string, yearsBack = 50): string[] {
  const year = Number(today.slice(0, 4))
  const monthDay = today.slice(5)
  const alsoLeapDay = monthDay === '02-28' && !isValidDateKey(`${year}-02-29`)
  const dates: string[] = []
  for (let y = year - 1; y >= year - yearsBack; y--) {
    const key = `${y}-${monthDay}`
    if (isValidDateKey(key)) dates.push(key)
    if (alsoLeapDay && isValidDateKey(`${y}-02-29`)) dates.push(`${y}-02-29`)
  }
  return dates
}

/** Same day of the previous month, or null when that day doesn't exist (31 Mar → no 31 Feb). */
export function oneMonthAgo(today: string): string | null {
  const [y, m, d] = today.split('-').map(Number)
  const py = m === 1 ? y - 1 : y
  const pm = m === 1 ? 12 : m - 1
  const key = `${py}-${String(pm).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  return isValidDateKey(key) ? key : null
}

export interface OnThisDay {
  kind: 'years' | 'month'
  moments: MomentWithPhotos[]
}

/** Moments from this day in earlier years; otherwise from exactly one month ago; otherwise null. */
export async function getOnThisDay(coupleId: string, today: string = todayJakarta()): Promise<OnThisDay | null> {
  const supabase = createClient()
  const query = (dates: string[]) =>
    supabase
      .from('moments')
      .select('*, moment_photos(*)')
      .eq('couple_id', coupleId)
      .in('moment_date', dates)
      .order('moment_date', { ascending: false })
      .order('created_at', { ascending: false })

  const { data: past, error } = await query(onThisDayDates(today))
  if (error) throw error
  if (past && past.length > 0) return { kind: 'years', moments: await withSignedCovers(past) }

  const monthAgo = oneMonthAgo(today)
  if (!monthAgo) return null
  const { data: recent, error: recentError } = await query([monthAgo])
  if (recentError) throw recentError
  if (recent && recent.length > 0) return { kind: 'month', moments: await withSignedCovers(recent) }
  return null
}

// ── Reactions + comments (F14) ──────────────────────────────

export function isMomentReaction(value: string): value is MomentReactionEmoji {
  return (MOMENT_REACTIONS as readonly string[]).includes(value)
}

export async function listMomentReactions(momentId: string): Promise<MomentReaction[]> {
  const { data, error } = await createClient().from('moment_reactions').select('*').eq('moment_id', momentId)
  if (error) throw error
  return data ?? []
}

/** One reaction per person: sets, changes, or (with null) removes yours. */
export async function setMomentReaction(
  momentId: string,
  coupleId: string,
  userId: string,
  emoji: MomentReactionEmoji | null
): Promise<void> {
  const supabase = createClient()
  if (emoji === null) {
    const { error } = await supabase.from('moment_reactions').delete().eq('moment_id', momentId).eq('profile_id', userId)
    if (error) throw error
    return
  }
  const { error } = await supabase
    .from('moment_reactions')
    .upsert({ moment_id: momentId, couple_id: coupleId, profile_id: userId, emoji }, { onConflict: 'moment_id,profile_id' })
  if (error) throw error
}

export async function listMomentComments(momentId: string): Promise<MomentComment[]> {
  const { data, error } = await createClient()
    .from('moment_comments')
    .select('*')
    .eq('moment_id', momentId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function addMomentComment(
  momentId: string,
  coupleId: string,
  userId: string,
  body: string
): Promise<MomentComment> {
  const clean = body.trim()
  if (!clean) throw new Error('Write a comment first.')
  if (clean.length > MAX_COMMENT) throw new Error(`Comments can be up to ${MAX_COMMENT} characters.`)
  const { data, error } = await createClient()
    .from('moment_comments')
    .insert({ moment_id: momentId, couple_id: coupleId, profile_id: userId, body: clean })
    .select()
    .single()
  if (error) throw error
  return data
}

/** RLS only lets you delete your own comments. */
export async function deleteMomentComment(commentId: string): Promise<void> {
  const { error } = await createClient().from('moment_comments').delete().eq('id', commentId)
  if (error) throw error
}

// ── Prefill from query params (/app/moments/baru?title=…) ───

export interface MomentPrefill {
  title?: string
  date?: string
  location?: string
  latitude?: number
  longitude?: number
  /** bucket_items id to mark done once the moment is saved */
  bucketId?: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function firstParam(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value
  return typeof v === 'string' ? v : undefined
}

function parseCoord(value: string | undefined, limit: number): number | undefined {
  if (value === undefined || !/^-?\d{1,3}(\.\d{1,12})?$/.test(value.trim())) return undefined
  const n = Number(value)
  return Number.isFinite(n) && Math.abs(n) <= limit ? n : undefined
}

/**
 * Validates query params for a new moment. Anything malformed is dropped:
 * text is trimmed and capped, the date must be a real past/today date,
 * coordinates must both be in range, and bucket must be a uuid.
 */
export function parseMomentPrefill(
  params: Record<string, string | string[] | undefined> | undefined,
  today: string = todayJakarta()
): MomentPrefill {
  const prefill: MomentPrefill = {}
  if (!params) return prefill

  const title = firstParam(params.title)?.trim()
  if (title) prefill.title = title.slice(0, MAX_TITLE)

  const date = firstParam(params.date)?.trim()
  if (date && isValidDateKey(date) && date <= today) prefill.date = date

  const location = firstParam(params.location)?.trim()
  if (location) prefill.location = location.slice(0, MAX_LOCATION)

  const lat = parseCoord(firstParam(params.lat), 90)
  const lng = parseCoord(firstParam(params.lng), 180)
  if (lat !== undefined && lng !== undefined) {
    prefill.latitude = lat
    prefill.longitude = lng
  }

  const bucket = firstParam(params.bucket)?.trim()
  if (bucket && UUID_RE.test(bucket)) prefill.bucketId = bucket
  return prefill
}

/** Marks a bucket-list item done and points it at the moment that fulfilled it. */
export async function completeBucketItemWithMoment(bucketId: string, momentId: string): Promise<void> {
  const { error } = await createClient()
    .from('bucket_items')
    .update({ moment_id: momentId, is_done: true, done_at: new Date().toISOString() })
    .eq('id', bucketId)
  if (error) throw error
}

export async function getMoment(momentId: string): Promise<MomentWithPhotos | null> {
  const { data, error } = await createClient()
    .from('moments')
    .select('*, moment_photos(*)')
    .eq('id', momentId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null

  const { moment_photos, ...moment } = data
  const photos = sortPhotos(moment_photos)
  const urls = await signPaths(photos.map((p) => p.storage_path))
  return { ...moment, photos: photos.map((p) => ({ ...p, url: urls[p.storage_path] ?? null })) }
}

export async function createMoment(coupleId: string, userId: string, input: MomentInput): Promise<Moment> {
  const { data, error } = await createClient()
    .from('moments')
    .insert({ ...input, couple_id: coupleId, created_by: userId })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateMoment(momentId: string, input: MomentInput): Promise<void> {
  const { error } = await createClient().from('moments').update(input).eq('id', momentId)
  if (error) throw error
}

/**
 * Bumps updated_at. Photo rows send no live events, so after uploading or
 * reordering photos this makes the partner's pages reload with the final
 * cover and count.
 */
export async function touchMoment(momentId: string): Promise<void> {
  const { error } = await createClient()
    .from('moments').update({ updated_at: new Date().toISOString() }).eq('id', momentId)
  if (error) throw error
}

/** Uploads one already-compressed photo and records it. Cleans up the file if the row fails. */
export async function addMomentPhoto(
  coupleId: string,
  momentId: string,
  image: CompressedImage,
  sortOrder: number,
  takenAt: string | null
): Promise<MomentPhoto> {
  const supabase = createClient()
  const path = `${coupleId}/${momentId}/${crypto.randomUUID()}.jpg`
  const { error: uploadError } = await supabase.storage
    .from(MOMENTS_BUCKET)
    .upload(path, image.blob, { contentType: 'image/jpeg', cacheControl: '3600', upsert: false })
  if (uploadError) throw uploadError

  const { data, error } = await supabase
    .from('moment_photos')
    .insert({
      moment_id: momentId,
      couple_id: coupleId,
      storage_path: path,
      width: image.width,
      height: image.height,
      taken_at: takenAt,
      sort_order: sortOrder,
    })
    .select()
    .single()
  if (error) {
    await supabase.storage.from(MOMENTS_BUCKET).remove([path])
    throw error
  }
  return data
}

export async function removeMomentPhotos(photos: Pick<MomentPhoto, 'id' | 'storage_path'>[]): Promise<void> {
  if (photos.length === 0) return
  const supabase = createClient()
  const { error } = await supabase.from('moment_photos').delete().in('id', photos.map((p) => p.id))
  if (error) throw error
  for (const p of photos) signedCache.delete(p.storage_path)
  await supabase.storage.from(MOMENTS_BUCKET).remove(photos.map((p) => p.storage_path))
}

export async function setPhotoOrder(photoIds: string[]): Promise<void> {
  const supabase = createClient()
  const results = await Promise.all(
    photoIds.map((id, index) => supabase.from('moment_photos').update({ sort_order: index }).eq('id', id))
  )
  const failed = results.find((r) => r.error)
  if (failed?.error) throw failed.error
}

/** Deletes every file in the moment's folder (including orphans), then the row. */
export async function deleteMoment(moment: Pick<Moment, 'id' | 'couple_id'>): Promise<void> {
  const supabase = createClient()
  const folder = `${moment.couple_id}/${moment.id}`
  const { data: files } = await supabase.storage.from(MOMENTS_BUCKET).list(folder, { limit: 100 })
  if (files?.length) {
    await supabase.storage.from(MOMENTS_BUCKET).remove(files.map((f) => `${folder}/${f.name}`))
  }
  const { error } = await supabase.from('moments').delete().eq('id', moment.id)
  if (error) throw error
}

/** "October 2026": section headers on the list (en-GB) */
export function monthLabel(dateKey: string): string {
  const [y, m] = dateKey.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}
