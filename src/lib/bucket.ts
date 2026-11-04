// Bucket list (F17): things the couple wants to do together. Items can be
// added by hand or from AI date ideas (source 'ai'), checked off, and turned
// into a Moment. Each item can also carry one reference link and one picture.
// Pictures live in the PRIVATE `bucket-items` storage bucket at
//   <couple_id>/<item_id>/<file>.jpg
// and are shown through short-lived signed URLs, like Moments photos.
// Runtime-import-free so scripts/verify can load it with node.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type Client = SupabaseClient<Database>

// The generated types predate the link + picture columns
// (20261104091000_bucket_reference): rows are widened here, payloads are
// narrowed back to the generated shape where they enter the query builder.
type BucketTable = Database['public']['Tables']['bucket_items']
interface BucketExtra {
  reference_url: string | null
  image_path: string | null
}
type BucketInsert = BucketTable['Insert'] & Partial<BucketExtra>
type BucketUpdate = BucketTable['Update'] & Partial<BucketExtra>
/** A column name the generated types don't know yet (typed as plain string for the filter overloads). */
const IMAGE_PATH_COLUMN: string = 'image_path'

export type BucketItem = BucketTable['Row'] & BucketExtra

export const BUCKET_TITLE_MAX = 120
export const BUCKET_NOTE_MAX = 500
/** Same limit as the DB check on bucket_items.reference_url */
export const BUCKET_LINK_MAX = 2000
/** Moments cap their title at 100 characters */
const MOMENT_TITLE_MAX = 100

/** Same keys as the DB check on bucket_items.category (stored values, keep them) */
export const BUCKET_CATEGORIES = [
  { key: 'petualangan', emoji: '🧗', label: 'Adventure' },
  { key: 'kuliner', emoji: '🍜', label: 'Food' },
  { key: 'traveling', emoji: '✈️', label: 'Travel' },
  { key: 'romantis', emoji: '💕', label: 'Romantic' },
  { key: 'belajar', emoji: '📚', label: 'Learning' },
  { key: 'rumah', emoji: '🏡', label: 'At home' },
  { key: 'lainnya', emoji: '✨', label: 'Other' },
] as const

export type BucketCategory = (typeof BUCKET_CATEGORIES)[number]['key']

export function categoryInfo(key: string | null | undefined) {
  return BUCKET_CATEGORIES.find((c) => c.key === key) ?? BUCKET_CATEGORIES[BUCKET_CATEGORIES.length - 1]
}

export interface BucketInput {
  title: string
  note: string | null
  category: BucketCategory
  estimated_cost: number | null
  /**
   * Optional http(s) link. Empty or null clears it. Leave the key out to keep
   * an item's current link when updating.
   */
  reference_url?: string | null
}

// ============================================================
// Reference link
// ============================================================

const LINK_SHAPE_ERROR = 'That link doesn\'t look right. Paste the full web address.'
const LINK_SCHEME_ERROR = 'Only web links work here, starting with http:// or https://'
const LINK_LONG_ERROR = `Links can be up to ${BUCKET_LINK_MAX} characters`

/**
 * Turns what someone typed or pasted into the link to save. Trims it, adds
 * https:// to a bare "instagram.com/p/..." and keeps only the link from a
 * pasted share text ("Look at this https://..."). Only http and https links
 * with a real host pass. An empty field means no link (url null, no error).
 */
export function normalizeReferenceUrl(raw: string | null | undefined): { url: string | null; error: string | null } {
  let text = (raw ?? '').trim()
  if (!text) return { url: null, error: null }
  if (text.length > BUCKET_LINK_MAX * 2) return { url: null, error: LINK_LONG_ERROR }

  if (/\s/.test(text)) {
    const found = text.match(/https?:\/\/[^\s<>"'`]+/i)
    if (!found) return { url: null, error: LINK_SHAPE_ERROR }
    // "...at https://x.com/abc." : the full stop belongs to the sentence
    text = found[0].replace(/[.,;:!?)\]}]+$/, '')
  }

  // A bare domain ("www.x.com/menu", "x.com:8080/a") gets https://. Anything
  // else with a "scheme:" in front keeps it, so javascript: or ftp: is refused.
  const bareDomain = /^[\p{L}\p{N}-]+(\.[\p{L}\p{N}-]+)+(:\d{1,5})?([/?#]|$)/iu.test(text)
  if (bareDomain) text = `https://${text}`
  else if (!/^[a-z][a-z0-9+.-]*:/i.test(text)) return { url: null, error: LINK_SHAPE_ERROR }

  let parsed: URL
  try {
    parsed = new URL(text)
  } catch {
    return { url: null, error: LINK_SHAPE_ERROR }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return { url: null, error: LINK_SCHEME_ERROR }
  const labels = parsed.hostname.split('.')
  if (labels.length < 2 || labels.some((l) => !l) || parsed.username || parsed.password) {
    return { url: null, error: LINK_SHAPE_ERROR }
  }
  const url = parsed.href
  if (url.length > BUCKET_LINK_MAX) return { url: null, error: LINK_LONG_ERROR }
  return { url, error: null }
}

/** Google Maps or Apple Maps place link (shown with a pin instead of a link icon). */
export function isMapLink(url: string): boolean {
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase().replace(/^www\./, '')
    if (host === 'maps.apple.com' || host === 'maps.app.goo.gl' || /^maps\.google\.[a-z.]+$/.test(host)) return true
    return (host === 'goo.gl' || /^google\.[a-z.]+$/.test(host)) && u.pathname.startsWith('/maps')
  } catch {
    return false
  }
}

/** Short name for a link chip: "instagram.com", "tiktok.com", "Google Maps". */
export function linkLabel(url: string): string {
  try {
    const u = new URL(url)
    if (isMapLink(url)) return u.hostname.toLowerCase().endsWith('apple.com') ? 'Apple Maps' : 'Google Maps'
    return u.hostname.toLowerCase().replace(/^(www|m|mobile)\./, '') || 'Link'
  } catch {
    return 'Link'
  }
}

// ============================================================
// Items
// ============================================================

/** Trims and checks an input; returns an English error message or null */
export function validateBucketInput(input: BucketInput): string | null {
  const title = input.title.trim()
  if (!title) return 'Add a title first'
  if (title.length > BUCKET_TITLE_MAX) return `Titles can be up to ${BUCKET_TITLE_MAX} characters`
  if ((input.note?.trim().length ?? 0) > BUCKET_NOTE_MAX) return `Notes can be up to ${BUCKET_NOTE_MAX} characters`
  if (input.estimated_cost !== null && (!Number.isFinite(input.estimated_cost) || input.estimated_cost < 0)) {
    return 'That cost estimate doesn\'t look right'
  }
  if (input.reference_url != null) {
    const link = normalizeReferenceUrl(input.reference_url)
    if (link.error) return link.error
  }
  return null
}

function clean(input: BucketInput) {
  const row: BucketUpdate = {
    title: input.title.trim(),
    note: input.note?.trim() || null,
    category: input.category,
    estimated_cost: input.estimated_cost,
  }
  if (input.reference_url !== undefined) {
    const link = normalizeReferenceUrl(input.reference_url)
    // Never save "no link" for a link that was typed but is invalid.
    if (link.error) throw new Error(link.error)
    row.reference_url = link.url
  }
  return row
}

/** Newest first */
export async function listBucketItems(client: Client, coupleId: string): Promise<BucketItem[]> {
  const { data, error } = await client
    .from('bucket_items')
    .select('*')
    .eq('couple_id', coupleId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as BucketItem[]
}

/**
 * `opts.id` lets a caller pick the new item's id up front (so a picture can be
 * uploaded into its folder before the row exists); `opts.imagePath` is that
 * picture, see saveBucketItem.
 */
export async function createBucketItem(
  client: Client,
  coupleId: string,
  userId: string,
  input: BucketInput,
  opts: { id?: string; imagePath?: string | null } = {}
): Promise<BucketItem> {
  const row: BucketInsert = {
    ...clean(input),
    title: input.title.trim(),
    couple_id: coupleId,
    created_by: userId,
    source: 'manual',
  }
  if (opts.id) row.id = opts.id
  if (opts.imagePath) row.image_path = opts.imagePath
  const { data, error } = await client.from('bucket_items').insert(row as BucketTable['Insert']).select().single()
  if (error) throw error
  return data as BucketItem
}

/** Thrown when the picture changed on the partner's phone while this edit was open. */
export class BucketPictureConflictError extends Error {
  constructor() {
    super('Your partner just changed this picture. Check it and save again.')
    this.name = 'BucketPictureConflictError'
  }
}

/**
 * `opts.image` swaps the picture in the same write, but only if the row still
 * has `from` (otherwise BucketPictureConflictError, nothing changes). The
 * caller removes the replaced file afterwards, see saveBucketItem.
 */
export async function updateBucketItem(
  client: Client,
  id: string,
  input: BucketInput,
  opts: { image?: { from: string | null; to: string | null } } = {}
): Promise<BucketItem> {
  const row = clean(input)
  if (!opts.image) {
    const { data, error } = await client.from('bucket_items').update(row as BucketTable['Update']).eq('id', id).select().single()
    if (error) throw error
    return data as BucketItem
  }
  row.image_path = opts.image.to
  const base = client.from('bucket_items').update(row as BucketTable['Update']).eq('id', id)
  const guarded = opts.image.from === null
    ? base.is(IMAGE_PATH_COLUMN, null)
    : base.eq(IMAGE_PATH_COLUMN, opts.image.from)
  const { data, error } = await guarded.select()
  if (error) throw error
  if (!data?.length) throw new BucketPictureConflictError()
  return data[0] as BucketItem
}

/** Checks an item off (done_at = now) or puts it back on the list */
export async function setBucketDone(client: Client, id: string, done: boolean): Promise<BucketItem> {
  const { data, error } = await client
    .from('bucket_items')
    .update({ is_done: done, done_at: done ? new Date().toISOString() : null })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as BucketItem
}

/**
 * Deletes the item, then every file in its picture folder (the current
 * picture and any leftover from an interrupted edit). The files go best
 * effort: the item is already gone, and a deleted couple's folder is swept
 * again by removeCoupleBucketPictures.
 */
export async function deleteBucketItem(client: Client, id: string): Promise<void> {
  const { data, error } = await client.from('bucket_items').delete().eq('id', id).select('couple_id')
  if (error) throw error
  const coupleId = data?.[0]?.couple_id
  if (!coupleId) return
  try {
    await removeBucketItemFolder(client, coupleId, id)
  } catch {
    // Orphan files only; nobody can see them without the row.
  }
}

/** Moment form prefilled from this item; saving it links the moment and marks the item done */
export function momentPrefillHref(item: Pick<BucketItem, 'id' | 'title'>): string {
  const params = new URLSearchParams({ title: item.title.trim().slice(0, MOMENT_TITLE_MAX), bucket: item.id })
  return `/app/moments/baru?${params.toString()}`
}

export function bucketProgress(items: Pick<BucketItem, 'is_done'>[]): { done: number; total: number; percent: number } {
  const total = items.length
  const done = items.filter((i) => i.is_done).length
  return { done, total, percent: total ? Math.round((done / total) * 100) : 0 }
}

// ============================================================
// Picture
// ============================================================

/** Storage bucket id (private). */
export const BUCKET_PICTURES = 'bucket-items'
/** Same as the bucket's file_size_limit; the browser shrinks pictures well below it. */
export const BUCKET_PICTURE_MAX_BYTES = 5 * 1024 * 1024
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const SIGN_TTL_SECONDS = 60 * 60
const BATCH = 100

function assertUuid(...values: string[]) {
  if (!values.every((v) => UUID_RE.test(v))) throw new Error('Invalid picture location')
}

/** Where a new picture of this item goes. Every segment must be a uuid, so no path tricks get through. */
export function bucketPicturePath(coupleId: string, itemId: string, fileId: string = crypto.randomUUID()): string {
  assertUuid(coupleId, itemId, fileId)
  return `${coupleId}/${itemId}/${fileId}.jpg`
}

/** Puts one JPEG at `path`, never overwriting. Throws on failure. */
export type PictureUpload = (path: string, blob: Blob) => Promise<void>

/** Upload through supabase-js (no progress events). The page brings its own with progress. */
export function storagePictureUpload(client: Client): PictureUpload {
  return async (path, blob) => {
    const { error } = await client.storage
      .from(BUCKET_PICTURES)
      .upload(path, blob, { contentType: 'image/jpeg', cacheControl: '3600', upsert: false })
    if (error) throw error
  }
}

/** What the form did with the picture: left it, removed it, or picked a new one. */
export type PictureChange = { kind: 'keep' } | { kind: 'remove' } | { kind: 'set'; blob: Blob }

export interface SaveBucketItemArgs {
  coupleId: string
  userId: string
  /** The item being edited as the form saw it, or null for a new one */
  existing: Pick<BucketItem, 'id' | 'image_path'> | null
  input: BucketInput
  picture?: PictureChange
  upload?: PictureUpload
}

/**
 * Creates or updates an item together with its picture, in an order that
 * never leaves a row pointing at a missing file: upload the new file first
 * (under a fresh name), then write the row, then remove the file it
 * replaced. If the row write fails, the new upload is removed again.
 */
export async function saveBucketItem(client: Client, args: SaveBucketItemArgs): Promise<BucketItem> {
  const { coupleId, userId, existing, input } = args
  const picture = args.picture ?? { kind: 'keep' }
  const invalid = validateBucketInput(input)
  if (invalid) throw new Error(invalid)
  if (picture.kind === 'set' && picture.blob.size > BUCKET_PICTURE_MAX_BYTES) {
    throw new Error('That picture is too big. Try a smaller one.')
  }

  const id = existing?.id ?? crypto.randomUUID()
  let uploaded: string | null = null
  if (picture.kind === 'set') {
    const path = bucketPicturePath(coupleId, id)
    try {
      await (args.upload ?? storagePictureUpload(client))(path, picture.blob)
    } catch (e) {
      // The file may have landed even though the reply got lost (a dropped
      // connection, a stalled upload we gave up on): don't leave it behind.
      await removeBucketPictures(client, [path]).catch(() => undefined)
      throw e
    }
    uploaded = path
  }

  let saved: BucketItem
  try {
    if (!existing) {
      saved = await createBucketItem(client, coupleId, userId, input, { id, imagePath: uploaded })
    } else if (picture.kind === 'keep') {
      saved = await updateBucketItem(client, id, input)
    } else {
      saved = await updateBucketItem(client, id, input, { image: { from: existing.image_path, to: uploaded } })
    }
  } catch (e) {
    if (uploaded) await removeBucketPictures(client, [uploaded]).catch(() => undefined)
    throw e
  }

  const replaced = existing?.image_path
  if (picture.kind !== 'keep' && replaced && replaced !== saved.image_path) {
    await removeBucketPictures(client, [replaced]).catch(() => undefined)
  }
  return saved
}

/** Removes picture files by path, 100 per request. */
export async function removeBucketPictures(client: Client, paths: string[]): Promise<number> {
  let removed = 0
  for (let i = 0; i < paths.length; i += BATCH) {
    const { data, error } = await client.storage.from(BUCKET_PICTURES).remove(paths.slice(i, i + BATCH))
    if (error) throw error
    removed += data?.length ?? 0
  }
  return removed
}

/** Every entry directly inside `prefix`; folders come back with id null. */
async function listFolder(client: Client, prefix: string): Promise<{ name: string; folder: boolean }[]> {
  const entries: { name: string; folder: boolean }[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client.storage.from(BUCKET_PICTURES).list(prefix, { limit: 1000, offset })
    if (error) throw error
    for (const e of data ?? []) entries.push({ name: e.name, folder: e.id === null })
    if ((data?.length ?? 0) < 1000) break
  }
  return entries
}

/** Removes every file under <couple_id>/<item_id>/. */
export async function removeBucketItemFolder(client: Client, coupleId: string, itemId: string): Promise<number> {
  assertUuid(coupleId, itemId)
  const folder = `${coupleId}/${itemId}`
  const files = (await listFolder(client, folder)).filter((e) => !e.folder).map((e) => `${folder}/${e.name}`)
  return files.length ? removeBucketPictures(client, files) : 0
}

/**
 * Removes a deleted couple's bucket pictures: <couple_id>/<item_id>/<file>.
 * Pass the service-role client (the couple's rows, and so its members' access,
 * are already gone). Used by /api/couple/leave and /api/account/delete.
 */
export async function removeCoupleBucketPictures(admin: Client, coupleId: string): Promise<number> {
  assertUuid(coupleId)
  let removed = 0
  let failed = 0
  // One bad folder must not keep the others: try them all, then report.
  for (const entry of await listFolder(admin, coupleId)) {
    try {
      removed += entry.folder
        ? await removeBucketItemFolder(admin, coupleId, entry.name)
        : await removeBucketPictures(admin, [`${coupleId}/${entry.name}`])
    } catch {
      failed++
    }
  }
  if (failed) throw new Error(`${failed} bucket picture folder(s) of couple ${coupleId} could not be removed`)
  return removed
}

/** Signed URLs (1 hour) for picture paths, 100 per request; paths that fail are left out. */
export async function signBucketPictures(
  client: Client,
  paths: string[]
): Promise<Record<string, { url: string; expiresAt: number }>> {
  const unique = Array.from(new Set(paths.filter(Boolean)))
  const out: Record<string, { url: string; expiresAt: number }> = {}
  const expiresAt = Date.now() + SIGN_TTL_SECONDS * 1000
  for (let i = 0; i < unique.length; i += BATCH) {
    const { data, error } = await client.storage.from(BUCKET_PICTURES).createSignedUrls(unique.slice(i, i + BATCH), SIGN_TTL_SECONDS)
    if (error) throw error
    for (const item of data ?? []) {
      if (item.path && item.signedUrl && !item.error) out[item.path] = { url: item.signedUrl, expiresAt }
    }
  }
  return out
}
