// Activity feed (F23). Rows are written only by DB triggers; both partners
// read them. "Unread" = the partner's activities newer than my
// activity_reads.last_seen_at (no row yet = all of them).
import { createClient } from '@/lib/supabase'
import { todayJakarta } from '@/lib/dates'
import type { Database } from '@/types/database'

export type Activity = Database['public']['Tables']['activities']['Row']

export const ACTIVITY_PAGE_SIZE = 20

export interface ActivityPage {
  items: Activity[]
  hasMore: boolean
}

/**
 * Newest first. Pass the last item of the previous page as `after` to get
 * the next page (keyset on created_at, id — stable while new rows arrive).
 */
export async function fetchActivities(
  coupleId: string,
  after?: Pick<Activity, 'created_at' | 'id'> | null,
  limit = ACTIVITY_PAGE_SIZE,
): Promise<ActivityPage> {
  let query = createClient()
    .from('activities')
    .select('*')
    .eq('couple_id', coupleId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1)
  if (after) {
    query = query.or(`created_at.lt."${after.created_at}",and(created_at.eq."${after.created_at}",id.lt.${after.id})`)
  }
  const { data, error } = await query
  if (error) throw error
  const rows = data ?? []
  return { items: rows.slice(0, limit), hasMore: rows.length > limit }
}

/**
 * Activities created at or after `since`, newest first, for live updates.
 * Inclusive so rows sharing the newest timestamp aren't missed: dedupe by id.
 */
export async function fetchActivitiesSince(coupleId: string, since: string, limit = 50): Promise<Activity[]> {
  const { data, error } = await createClient()
    .from('activities')
    .select('*')
    .eq('couple_id', coupleId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data ?? []
}

// What this tab already marked as seen, and the activity_reads write still on
// its way. The bell counts against these too, so leaving /app/aktivitas right
// away (or a failed write) doesn't bring back a badge for rows already shown.
let seenLocally: { userId: string; at: string } | null = null
let seenWrite: Promise<void> | null = null

function later(a: string | null, b: string | null): string | null {
  if (!a || !b) return a ?? b
  return Date.parse(a) >= Date.parse(b) ? a : b
}

export async function getLastSeen(userId: string): Promise<string | null> {
  if (seenWrite) await seenWrite.catch(() => {})
  const { data, error } = await createClient()
    .from('activity_reads').select('last_seen_at').eq('profile_id', userId).maybeSingle()
  if (error) throw error
  return later(data?.last_seen_at ?? null, seenLocally?.userId === userId ? seenLocally.at : null)
}

/** The partner's activities I haven't seen yet. */
export async function getUnreadCount(coupleId: string, userId: string): Promise<number> {
  const lastSeen = await getLastSeen(userId)
  let query = createClient()
    .from('activities')
    .select('id', { count: 'exact', head: true })
    .eq('couple_id', coupleId)
    // A partner who deleted their account leaves actor_id null: still not mine.
    .or(`actor_id.is.null,actor_id.neq.${userId}`)
  if (lastSeen) query = query.gt('created_at', lastSeen)
  const { count, error } = await query
  if (error) throw error
  return count ?? 0
}

/**
 * Marks everything up to `seenAt` as seen. Pass the newest activity's
 * created_at (a server timestamp) so a skewed phone clock can't hide a newer
 * row; without it, now is used. Takes effect for this tab's unread count right
 * away (optimistic); callers needn't await it before navigating.
 */
export async function markSeen(userId: string, seenAt?: string | null): Promise<void> {
  const at = seenAt ?? new Date().toISOString()
  seenLocally = { userId, at: later(seenLocally?.userId === userId ? seenLocally.at : null, at) ?? at }
  const write = (async () => {
    const { error } = await createClient()
      .from('activity_reads')
      .upsert({ profile_id: userId, last_seen_at: at }, { onConflict: 'profile_id' })
    if (error) throw error
  })()
  seenWrite = write
  try {
    await write
  } finally {
    if (seenWrite === write) seenWrite = null
  }
}

/** "You", the partner's name, or a fallback. */
export function activityActor(activity: Pick<Activity, 'actor_id'>, userId: string, names: Record<string, string>): string {
  if (activity.actor_id === userId) return 'You'
  if (activity.actor_id && names[activity.actor_id]) return names[activity.actor_id]
  return 'Your partner'
}

const SHORT_DATE = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short' })
const SHORT_DATE_YEAR = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', year: 'numeric' })

function dayIndex(key: string): number {
  const [y, m, d] = key.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000)
}

/** "just now", "5 min ago", "3 h ago", "yesterday", "4 days ago", "12 Oct" (Jakarta days) */
export function relativeTimeID(iso: string, now: number = Date.now()): string {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return ''
  const minutes = Math.floor(Math.max(0, now - then) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const today = todayJakarta(new Date(now))
  const day = todayJakarta(new Date(then))
  const days = dayIndex(today) - dayIndex(day)
  if (days === 0) return `${Math.floor(minutes / 60)} h ago`
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  return (day.slice(0, 4) === today.slice(0, 4) ? SHORT_DATE : SHORT_DATE_YEAR).format(new Date(then))
}
