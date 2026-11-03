'use client'

// Live refresh between partners (F24). Pages keep their own loader and call
// it again when the other partner (or another tab) changes a row.
import { useEffect, useRef } from 'react'
import { createClient } from './supabase'

/** Tables in the supabase_realtime publication that carry couple_id. */
export type RealtimeTable =
  | 'activities'
  | 'moments'
  | 'moment_comments'
  | 'moment_reactions'
  | 'mood_checkins'
  | 'bucket_items'
  | 'gratitude_notes'
  | 'couple_events'
  | 'couple_transactions'
  | 'savings_goals'

/**
 * Calls `onChange` (debounced) after an INSERT or UPDATE on any of `tables`
 * for this couple. Rows are filtered by couple_id on the server and by RLS.
 * DELETEs are not delivered (Supabase can't filter them by column), and a
 * backgrounded PWA misses events and day changes, so it also fires when the
 * app becomes visible again. A page still refreshes after its own deletes.
 */
export function useCoupleRealtime(
  coupleId: string | null | undefined,
  tables: RealtimeTable[],
  onChange: () => void,
  debounceMs = 400,
) {
  const callback = useRef(onChange)
  callback.current = onChange
  const key = tables.join(',')

  useEffect(() => {
    if (!coupleId || !key) return
    const supabase = createClient()
    let timer: ReturnType<typeof setTimeout> | null = null
    const fire = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => callback.current(), debounceMs)
    }

    // A unique name per mount: two components may watch the same tables.
    const channel = supabase.channel(`couple:${coupleId}:${key}:${Math.random().toString(36).slice(2, 8)}`)
    for (const table of key.split(',')) {
      for (const event of ['INSERT', 'UPDATE'] as const) {
        channel.on('postgres_changes', { event, schema: 'public', table, filter: `couple_id=eq.${coupleId}` }, fire)
      }
    }
    // Refetch once the channel is live (and after every reconnect): changes
    // made between the page's first load and SUBSCRIBED are never replayed.
    channel.subscribe((status) => { if (status === 'SUBSCRIBED') fire() })

    const onVisible = () => { if (document.visibilityState === 'visible') fire() }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      supabase.removeChannel(channel)
    }
  }, [coupleId, key, debounceMs])
}
