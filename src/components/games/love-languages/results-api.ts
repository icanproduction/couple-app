'use client'

// Quiz results (table love_language_results, migration 20261103131000). RLS
// shows your own row and your current partner's; you write only your own,
// only into your open couple. The database rejects scores that don't match
// the answers, so nothing here has to be trusted. The answers column can be
// written but never read back, so it is never selected.

import { useEffect, useRef } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase'
import { subscribeAsUser } from '@/lib/realtime'
import { isLoveScores, scoreAnswers, type LoveScores } from './bank'

export type LoveResult = {
  profile_id: string
  couple_id: string
  scores: LoveScores
  taken_at: string
}

// The shared Database type doesn't list this table yet, so this file carries
// its own slice of the schema. Type aliases (not interfaces) so supabase-js
// accepts them as rows.
type ResultRow = {
  profile_id: string
  couple_id: string
  scores: unknown
  taken_at: string
}
type LoveDatabase = {
  public: {
    Tables: {
      love_language_results: {
        Row: ResultRow
        Insert: { profile_id: string; couple_id: string; scores: LoveScores; answers: number[] }
        Update: { profile_id?: string; couple_id?: string; scores?: LoveScores; answers?: number[] }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

function db(): SupabaseClient<LoveDatabase> {
  return createClient() as unknown as SupabaseClient<LoveDatabase>
}

const COLUMNS = 'profile_id, couple_id, scores, taken_at'

/** A row as stored, or null when it isn't a usable result (never shown half-broken). */
function toResult(row: ResultRow | null): LoveResult | null {
  if (!row || !isLoveScores(row.scores)) return null
  return { ...row, scores: row.scores }
}

/** Results for these people that belong to this couple. */
export async function loadResults(coupleId: string, profileIds: string[]): Promise<Record<string, LoveResult>> {
  const { data, error } = await db()
    .from('love_language_results')
    .select(COLUMNS)
    .in('profile_id', profileIds)
  if (error) throw new Error(error.message)
  const out: Record<string, LoveResult> = {}
  for (const row of (data ?? []) as ResultRow[]) {
    const result = toResult(row)
    // A result saved into an earlier couple doesn't count here: the partner can't see it.
    if (result && result.couple_id === coupleId) out[result.profile_id] = result
  }
  return out
}

/**
 * Save (or overwrite, on a retake) my result. Update first, insert when there
 * is no row yet: an upsert would need read access to the answers column. If
 * another tab inserts in between, the insert hits the primary key and the
 * update runs once more.
 */
export async function saveResult(input: { userId: string; coupleId: string; answers: number[] }): Promise<LoveResult> {
  const scores = scoreAnswers(input.answers)
  if (!scores) throw new Error('Answer all 20 first.')
  const table = () => db().from('love_language_results')
  const change = { couple_id: input.coupleId, scores, answers: input.answers }

  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: updated, error: updateError } = await table().update(change).eq('profile_id', input.userId).select(COLUMNS)
    if (updateError) throw new Error(updateError.message)
    const row = (updated as ResultRow[] | null)?.[0]
    if (row) return checked(row)

    const { data: inserted, error: insertError } = await table()
      .insert({ profile_id: input.userId, ...change })
      .select(COLUMNS)
      .single()
    if (!insertError) return checked(inserted as ResultRow)
    if (insertError.code !== '23505') throw new Error(insertError.message)
  }
  throw new Error('Could not save the result.')
}

function checked(row: ResultRow): LoveResult {
  const result = toResult(row)
  if (!result) throw new Error('The saved result came back unreadable.')
  return result
}

/**
 * Calls `onChange` (debounced) when a result in this couple is saved, so the
 * "Waiting for {partner}" screen moves on by itself. Also fires when the app
 * comes back to the foreground, since a backgrounded PWA misses events.
 */
export function useLiveResults(coupleId: string | null, onChange: () => void) {
  const callback = useRef(onChange)
  callback.current = onChange

  useEffect(() => {
    if (!coupleId) return
    const supabase = createClient()
    let timer: ReturnType<typeof setTimeout> | null = null
    const fire = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => callback.current(), 400)
    }
    const channel = supabase.channel(`love-languages:${coupleId}:${Math.random().toString(36).slice(2, 8)}`)
    for (const event of ['INSERT', 'UPDATE'] as const) {
      channel.on('postgres_changes', { event, schema: 'public', table: 'love_language_results', filter: `couple_id=eq.${coupleId}` }, fire)
    }
    const unsubscribe = subscribeAsUser(supabase, channel)
    const onVisible = () => { if (document.visibilityState === 'visible') fire() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      unsubscribe()
    }
  }, [coupleId])
}

/** Fire-and-forget push to the partner. A failed push never interrupts the quiz. */
export function pushPartner(recipientId: string, body: string): Promise<{ sent: number } | null> {
  return fetch('/api/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipientId, title: 'Love Languages', body, url: '/app/games/love-languages', kind: 'activity' }),
  })
    .then(async (res) => {
      if (!res.ok) return null
      const data = await res.json().catch(() => ({}))
      return { sent: typeof data.sent === 'number' ? data.sent : 0 }
    })
    .catch(() => null)
}
