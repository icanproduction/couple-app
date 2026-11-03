// Bucket list (F17): things the couple wants to do together. Items can be
// added by hand or from AI date ideas (source 'ai'), checked off, and turned
// into a Moment. Runtime-import-free so scripts/verify can load it with node.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type Client = SupabaseClient<Database>
export type BucketItem = Database['public']['Tables']['bucket_items']['Row']

export const BUCKET_TITLE_MAX = 120
export const BUCKET_NOTE_MAX = 500
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
}

/** Trims and checks an input; returns an English error message or null */
export function validateBucketInput(input: BucketInput): string | null {
  const title = input.title.trim()
  if (!title) return 'Add a title first'
  if (title.length > BUCKET_TITLE_MAX) return `Titles can be up to ${BUCKET_TITLE_MAX} characters`
  if ((input.note?.trim().length ?? 0) > BUCKET_NOTE_MAX) return `Notes can be up to ${BUCKET_NOTE_MAX} characters`
  if (input.estimated_cost !== null && (!Number.isFinite(input.estimated_cost) || input.estimated_cost < 0)) {
    return 'That cost estimate doesn\'t look right'
  }
  return null
}

function clean(input: BucketInput) {
  return {
    title: input.title.trim(),
    note: input.note?.trim() || null,
    category: input.category,
    estimated_cost: input.estimated_cost,
  }
}

/** Newest first */
export async function listBucketItems(client: Client, coupleId: string): Promise<BucketItem[]> {
  const { data, error } = await client
    .from('bucket_items')
    .select('*')
    .eq('couple_id', coupleId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function createBucketItem(client: Client, coupleId: string, userId: string, input: BucketInput): Promise<BucketItem> {
  const { data, error } = await client
    .from('bucket_items')
    .insert({ ...clean(input), couple_id: coupleId, created_by: userId, source: 'manual' })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateBucketItem(client: Client, id: string, input: BucketInput): Promise<BucketItem> {
  const { data, error } = await client.from('bucket_items').update(clean(input)).eq('id', id).select().single()
  if (error) throw error
  return data
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
  return data
}

export async function deleteBucketItem(client: Client, id: string): Promise<void> {
  const { error } = await client.from('bucket_items').delete().eq('id', id)
  if (error) throw error
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
