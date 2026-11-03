// Custom cards (table truth_or_dare_cards, migration 20261103130000). RLS lets
// members read their couple's cards, add cards as themselves while the couple
// is open, and delete only their own.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase'
import type { TodHeat, TodKind } from './deck'
import { customBodyError, type PlayCard } from './engine'

export { CUSTOM_BODY_MAX, CUSTOM_CARDS_MAX, customBodyError } from './engine'

// A type alias, not an interface: supabase-js needs rows assignable to
// Record<string, unknown>.
export type CustomCardRow = {
  id: string
  couple_id: string
  created_by: string
  kind: TodKind
  heat: TodHeat
  body: string
  created_at: string
}

// The shared Database type doesn't list this table yet, so this file carries
// its own slice of the schema.
type TodDatabase = {
  public: {
    Tables: {
      truth_or_dare_cards: {
        Row: CustomCardRow
        Insert: Pick<CustomCardRow, 'couple_id' | 'created_by' | 'kind' | 'heat' | 'body'>
        Update: Record<string, never>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

function db(): SupabaseClient<TodDatabase> {
  return createClient() as unknown as SupabaseClient<TodDatabase>
}

const COLUMNS = 'id, couple_id, created_by, kind, heat, body, created_at'

export async function listCustomCards(coupleId: string): Promise<CustomCardRow[]> {
  const { data, error } = await db()
    .from('truth_or_dare_cards')
    .select(COLUMNS)
    .eq('couple_id', coupleId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as CustomCardRow[]
}

export async function addCustomCard(input: {
  coupleId: string
  userId: string
  kind: TodKind
  heat: TodHeat
  body: string
}): Promise<CustomCardRow> {
  const problem = customBodyError(input.body)
  if (problem) throw new Error(problem)
  const { data, error } = await db()
    .from('truth_or_dare_cards')
    .insert({
      couple_id: input.coupleId,
      created_by: input.userId,
      kind: input.kind,
      heat: input.heat,
      body: input.body.trim(),
    })
    .select(COLUMNS)
    .single()
  if (error || !data) throw new Error(error?.message ?? 'No card came back')
  return data as CustomCardRow
}

/** Delete one of my cards. Resolves either way once it's gone (also when another phone got there first). */
export async function deleteCustomCard(id: string): Promise<void> {
  const { error } = await db().from('truth_or_dare_cards').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export function toPlayCard(row: CustomCardRow): PlayCard {
  return { id: 'c:' + row.id, kind: row.kind, heat: row.heat, body: row.body, custom: true, authorId: row.created_by }
}
