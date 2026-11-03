// Toples Apresiasi (F18): short notes of appreciation to your partner, kept
// sealed in a jar until the partner draws one at random. The DB lets only the
// recipient set opened_at (column grant) and only the sender delete a note
// while it's still unopened. Runtime-import-free so scripts/verify can load it.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type Client = SupabaseClient<Database>
export type GratitudeNote = Database['public']['Tables']['gratitude_notes']['Row']

export const GRATITUDE_MAX = 280

/** Every note I sent or received (RLS hides the rest), newest first */
export async function listNotes(client: Client, coupleId: string): Promise<GratitudeNote[]> {
  const { data, error } = await client
    .from('gratitude_notes')
    .select('*')
    .eq('couple_id', coupleId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export interface SendNoteInput {
  coupleId: string
  fromId: string
  toId: string
  body: string
}

export async function sendNote(client: Client, input: SendNoteInput): Promise<GratitudeNote> {
  const body = input.body.trim()
  if (!body) throw new Error('Tulis apresiasinya dulu ya')
  if (body.length > GRATITUDE_MAX) throw new Error(`Maksimal ${GRATITUDE_MAX} karakter`)
  const { data, error } = await client
    .from('gratitude_notes')
    .insert({ couple_id: input.coupleId, from_id: input.fromId, to_id: input.toId, body })
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * Marks a note addressed to me as opened. Returns null when it was already
 * opened (e.g. in another tab) or isn't mine to open.
 */
export async function openNote(client: Client, id: string): Promise<GratitudeNote | null> {
  const { data, error } = await client
    .from('gratitude_notes')
    .update({ opened_at: new Date().toISOString() })
    .eq('id', id)
    .is('opened_at', null)
    .select()
    .maybeSingle()
  if (error) throw error
  return data
}

/** Deletes my own note while it's unopened; returns false if nothing was deleted */
export async function deleteNote(client: Client, id: string): Promise<boolean> {
  const { data, error } = await client
    .from('gratitude_notes')
    .delete()
    .eq('id', id)
    .is('opened_at', null)
    .select('id')
  if (error) throw error
  return (data ?? []).length > 0
}

export interface JarState {
  /** Sealed notes addressed to me */
  waiting: GratitudeNote[]
  /** Notes to me I've opened, newest opened first */
  opened: GratitudeNote[]
  /** Notes I wrote, newest first */
  sent: GratitudeNote[]
  sentOpened: number
}

export function splitNotes(notes: GratitudeNote[], myId: string): JarState {
  const toMe = notes.filter((n) => n.to_id === myId)
  const sent = notes.filter((n) => n.from_id === myId).sort((a, b) => b.created_at.localeCompare(a.created_at))
  return {
    waiting: toMe.filter((n) => !n.opened_at),
    opened: toMe
      .filter((n) => !!n.opened_at)
      .sort((a, b) => (b.opened_at ?? '').localeCompare(a.opened_at ?? '')),
    sent,
    sentOpened: sent.filter((n) => !!n.opened_at).length,
  }
}

/** A random element, or null for an empty list */
export function pickRandom<T>(items: readonly T[], random: () => number = Math.random): T | null {
  if (items.length === 0) return null
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))]
}
