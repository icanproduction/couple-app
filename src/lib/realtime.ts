'use client'

// Live refresh between partners (F24). Pages keep their own loader and call
// it again when the other partner (or another tab) changes a row.
import { useEffect, useRef } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from './supabase'

/**
 * Leaves `channel` without ever closing the shared socket. supabase.removeChannel
 * disconnects when the list is empty at the moment its leave reply lands; on a
 * page change that is often before the next page has added its channels, which
 * then join a closing socket and never hear another change (manual disconnects
 * don't reconnect). A closed channel drops itself from the client's list.
 */
export function leaveChannel(channel: RealtimeChannel): void {
  void channel.unsubscribe().then((status) => { if (status === 'ok') channel.teardown() })
}

/**
 * Subscribes `channel` once the realtime client carries the signed-in user's
 * token, and returns a cleanup that leaves it. On a fresh page load the join
 * otherwise races the session load and goes out with only the anon key: the
 * server then checks each postgres_changes filter against anon's column
 * grants, and the pet and Samakan tables grant anon nothing, so the join
 * fails with "invalid column for filter" and the screen never updates.
 */
export function subscribeAsUser(
  supabase: ReturnType<typeof createClient>,
  channel: RealtimeChannel,
  onStatus?: Parameters<RealtimeChannel['subscribe']>[0],
): () => void {
  let removed = false
  void supabase.realtime.setAuth()
    .catch(() => { /* join anyway; the visibility refetch still covers */ })
    .then(() => { if (!removed) channel.subscribe(onStatus) })
  return () => {
    removed = true
    leaveChannel(channel)
  }
}

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
  // Pet Kita (20261104120000_pet_remake): a partner's hi, a level, a rename,
  // and today's note show up on an open pet screen without a reload.
  | 'couple_pets'
  | 'pet_warmth_events'
  | 'pet_daily_notes'
  // Samakan v2 (20261104121000_samakan_v2): set progress and live invites.
  // Both carry counts and status only, never answer values.
  | 'samakan_sets'
  | 'samakan_live_invites'

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
    const unsubscribe = subscribeAsUser(supabase, channel, (status) => { if (status === 'SUBSCRIBED') fire() })

    const onVisible = () => { if (document.visibilityState === 'visible') fire() }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      unsubscribe()
    }
  }, [coupleId, key, debounceMs])
}
