import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { sendPushToProfile } from '@/lib/push-server'
import { todayJakarta } from '@/lib/dates'
import { reminderBody, reminderDueOn, reminderRecipients, reminderTitle } from '@/lib/reminders'

export const dynamic = 'force-dynamic'
// supabase-js reads are GET fetches: without this Next's fetch cache replays an
// earlier run's events (even deleted ones) and stale couple memberships.
export const fetchCache = 'force-no-store'
export const revalidate = 0

const PAGE = 1000

type Admin = ReturnType<typeof createServiceRoleClient>
type Claim = { event_id: string; occurrence_date: string }

/**
 * Inserts the (event, occurrence) rows not sent yet and returns the event ids
 * this run inserted. Falls back to one row at a time if the batch fails (an
 * event deleted since the query breaks the foreign key for the whole batch).
 */
async function claimReminders(admin: Admin, rows: Claim[]): Promise<Set<string> | null> {
  const opts = { onConflict: 'event_id,occurrence_date', ignoreDuplicates: true }
  const { data, error } = await admin.from('event_reminders_sent').upsert(rows, opts).select('event_id')
  if (!error) return new Set((data ?? []).map((c) => c.event_id))
  console.error('[cron/event-reminders] batch claim failed, retrying per event:', error.message)
  const claimed = new Set<string>()
  let failures = 0
  for (const row of rows) {
    const one = await admin.from('event_reminders_sent').upsert([row], opts).select('event_id')
    if (one.error) { failures++; continue }
    for (const c of one.data ?? []) claimed.add(c.event_id)
  }
  return failures === rows.length ? null : claimed
}

interface EventRow {
  id: string
  couple_id: string
  title: string
  location: string | null
  event_date: string
  event_scope: string | null
  is_recurring: boolean
  is_completed: boolean | null
  remind_days_before: number | null
  created_by: string | null
}

/**
 * Sends calendar reminders (F09). Run daily by Vercel Cron at 00:00 UTC
 * (07:00 WIB) with `Authorization: Bearer $CRON_SECRET`.
 * An event is due when today (Jakarta) == its occurrence − remind_days_before.
 * Each (event, occurrence) is claimed in event_reminders_sent before sending,
 * so a re-run the same day (or an overlapping run) never sends twice.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createServiceRoleClient()
  const today = todayJakarta()

  // Recurring events, plus one-off events that haven't passed yet.
  const events: EventRow[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from('couple_events')
      .select('id, couple_id, title, location, event_date, event_scope, is_recurring, is_completed, remind_days_before, created_by')
      .not('remind_days_before', 'is', null)
      .or(`is_recurring.eq.true,event_date.gte.${today}`)
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) {
      console.error('[cron/event-reminders] query failed:', error.message)
      return NextResponse.json({ error: 'query failed' }, { status: 500 })
    }
    events.push(...(data ?? []))
    if (!data || data.length < PAGE) break
  }

  const due = events
    .map((ev) => ({ ev, occurrence: reminderDueOn(ev, today) }))
    .filter((d): d is { ev: EventRow; occurrence: string } => d.occurrence !== null)
  if (due.length === 0) return NextResponse.json({ today, checked: events.length, due: 0, sent: 0, reminded: [] })

  // Claim first; only rows this run actually inserted get a push.
  const claimedIds = await claimReminders(admin, due.map((d) => ({ event_id: d.ev.id, occurrence_date: d.occurrence })))
  if (!claimedIds) return NextResponse.json({ error: 'claim failed' }, { status: 500 })
  const toSend = due.filter((d) => claimedIds.has(d.ev.id))
  if (toSend.length === 0) return NextResponse.json({ today, checked: events.length, due: 0, sent: 0, reminded: [] })

  const coupleIds = Array.from(new Set(toSend.map((d) => d.ev.couple_id)))
  const { data: members, error: membersError } = await admin
    .from('couple_members')
    .select('couple_id, profile_id')
    .in('couple_id', coupleIds)
  if (membersError) console.error('[cron/event-reminders] members lookup failed:', membersError.message)
  const membersOf = new Map<string, string[]>()
  for (const m of members ?? []) {
    membersOf.set(m.couple_id, [...(membersOf.get(m.couple_id) ?? []), m.profile_id])
  }

  let sent = 0
  for (const { ev, occurrence } of toSend) {
    const recipients = reminderRecipients(ev.event_scope, ev.created_by, membersOf.get(ev.couple_id) ?? [])
    const payload = {
      title: reminderTitle(ev.title, ev.remind_days_before ?? 0),
      body: reminderBody(occurrence, ev.location),
      url: '/app/calendar',
    }
    for (const profileId of recipients) {
      try {
        // ignoreQuietHours: this occurrence is claimed above and never retried,
        // so holding it back for quiet hours would drop the reminder for good.
        // The calendar reminders switch still applies.
        const result = await sendPushToProfile(profileId, payload, 'reminders', { ignoreQuietHours: true })
        sent += result?.sent ?? 0
      } catch (err) {
        console.error('[cron/event-reminders] push failed:', err)
      }
    }
  }

  return NextResponse.json({
    today,
    checked: events.length,
    due: toSend.length,
    sent,
    reminded: toSend.map((d) => d.ev.id),
  })
}
