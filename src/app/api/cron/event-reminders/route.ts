import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { sendPushToProfile } from '@/lib/push-server'
import { todayJakarta } from '@/lib/dates'
import { reminderBody, reminderDueOn, reminderRecipients, reminderTitle } from '@/lib/reminders'
import { noteKindFor, petAiEnabled, resolvePetNote } from '@/lib/pet-ai'
import type { PetStatus } from '@/types/pet'

export const dynamic = 'force-dynamic'
// supabase-js reads are GET fetches: without this Next's fetch cache replays an
// earlier run's events (even deleted ones) and stale couple memberships.
export const fetchCache = 'force-no-store'
export const revalidate = 0
// Monday: one model call per couple (8 s at most each), after the reminders.
export const maxDuration = 60

const PAGE = 1000
/** Monday notes start only within this much of the run's start; the rest are made on first visit. */
const PET_WEEKLY_BUDGET_MS = 40_000

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

type Report = { status: number; body: Record<string, unknown> }

/**
 * Calendar reminders (F09). An event is due when today (Jakarta) == its
 * occurrence − remind_days_before. Each (event, occurrence) is claimed in
 * event_reminders_sent before sending, so a re-run the same day (or an
 * overlapping run) never sends twice.
 */
async function sendReminders(admin: Admin, today: string): Promise<Report> {
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
      return { status: 500, body: { error: 'query failed' } }
    }
    events.push(...(data ?? []))
    if (!data || data.length < PAGE) break
  }

  const due = events
    .map((ev) => ({ ev, occurrence: reminderDueOn(ev, today) }))
    .filter((d): d is { ev: EventRow; occurrence: string } => d.occurrence !== null)
  if (due.length === 0) return { status: 200, body: { today, checked: events.length, due: 0, sent: 0, reminded: [] } }

  // Claim first; only rows this run actually inserted get a push.
  const claimedIds = await claimReminders(admin, due.map((d) => ({ event_id: d.ev.id, occurrence_date: d.occurrence })))
  if (!claimedIds) return { status: 500, body: { error: 'claim failed' } }
  const toSend = due.filter((d) => claimedIds.has(d.ev.id))
  if (toSend.length === 0) return { status: 200, body: { today, checked: events.length, due: 0, sent: 0, reminded: [] } }

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

  return {
    status: 200,
    body: { today, checked: events.length, due: toSend.length, sent, reminded: toSend.map((d) => d.ev.id) },
  }
}

interface PetWeeklyReport {
  ran: boolean
  /** Why it didn't run: not Monday in Jakarta, or the pet AI is off (PET_AI_ENABLED / no key). */
  reason?: 'not_monday' | 'ai_off' | 'error'
  pets?: number
  notes_ai?: number
  notes_other?: number
  pushed?: number
  muted?: number
  /** Pets left for the time budget: their Monday note is made on first visit, without a push. */
  deferred?: number
}

/**
 * Pet Kita's Monday note (spec 5.4, 5.6). Runs inside this cron because
 * Vercel Hobby allows two cron jobs. Couples go one after another, so the
 * system prompt stays in the prompt cache. Only a couple with warmth in the
 * last 7 days gets a model call (pet_claim_note says 'quiet' otherwise).
 *
 * Push: "A note from Mochi" to both partners, kind 'pet', and only for a note
 * this run wrote with the model. pet_claim_note gives the day's note to one
 * caller and a ready note is written once, so a re-run, an overlapping run or
 * a partner who opened the pet first never causes a second push. The Pet Kita
 * switch and quiet hours apply: a held-back Monday push is skipped, not
 * delayed (no ignoreQuietHours).
 */
async function petWeekly(admin: Admin, now: Date, deadline: number): Promise<PetWeeklyReport> {
  if (noteKindFor(todayJakarta(now)) !== 'weekly') return { ran: false, reason: 'not_monday' }
  if (!petAiEnabled()) return { ran: false, reason: 'ai_off' }

  const pets: Array<{ id: string; couple_id: string }> = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from('couple_pets').select('id, couple_id').order('created_at').order('id').range(from, from + PAGE - 1)
    if (error) {
      console.error('[cron/event-reminders] pet query failed:', error.message)
      return { ran: false, reason: 'error' }
    }
    pets.push(...(data ?? []))
    if (!data || data.length < PAGE) break
  }
  const coupleIds = Array.from(new Set(pets.map((p) => p.couple_id)))
  const [couples, members] = coupleIds.length
    ? await Promise.all([
        admin.from('couples').select('id, closed_at').in('id', coupleIds),
        admin.from('couple_members').select('couple_id, profile_id').in('couple_id', coupleIds),
      ])
    : [{ data: [], error: null }, { data: [], error: null }]
  if (couples.error || members.error) {
    console.error('[cron/event-reminders] pet couples lookup failed:', (couples.error ?? members.error)?.message)
    return { ran: false, reason: 'error' }
  }
  const closed = new Set((couples.data ?? []).filter((c) => c.closed_at).map((c) => c.id))
  const membersOf = new Map<string, string[]>()
  for (const m of members.data ?? []) membersOf.set(m.couple_id, [...(membersOf.get(m.couple_id) ?? []), m.profile_id])

  const open = pets.filter((p) => !closed.has(p.couple_id) && (membersOf.get(p.couple_id)?.length ?? 0) > 0)
  let done = 0, notesAi = 0, notesOther = 0, pushed = 0, muted = 0
  for (const pet of open) {
    if (Date.now() > deadline) break
    done++
    try {
      const { data: statusData, error } = await admin.rpc('pet_status', { p_pet_id: pet.id })
      if (error || !statusData) throw new Error(error?.message ?? 'no status')
      const status = statusData as unknown as PetStatus
      const result = await resolvePetNote({ admin, reader: admin, status, now, waitMs: 0 })
      if (result.outcome !== 'written_ai' || result.note.kind !== 'weekly') {
        notesOther++
        continue
      }
      notesAi++
      const payload = {
        title: `A note from ${status.name}`,
        body: `Your week, written by a ${status.pet_type} who was paying attention.`,
        url: '/app/pet',
      }
      for (const profileId of membersOf.get(pet.couple_id) ?? []) {
        try {
          const sent = await sendPushToProfile(profileId, payload, 'pet')
          if (sent?.muted) muted++
          else if (sent && sent.sent > 0) pushed++
        } catch (err) {
          console.error('[cron/event-reminders] pet push failed:', err)
        }
      }
    } catch (err) {
      notesOther++
      console.error('[cron/event-reminders] pet note failed:', err instanceof Error ? err.message : err)
    }
  }
  return {
    ran: true, pets: done, notes_ai: notesAi, notes_other: notesOther, pushed, muted, deferred: open.length - done,
  }
}

/**
 * Daily at 00:00 UTC (07:00 WIB) by Vercel Cron with
 * `Authorization: Bearer $CRON_SECRET`: calendar reminders, then on Mondays
 * Pet Kita's weekly note. The pet part never changes the reminders' answer.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const started = Date.now()
  const now = new Date(started)
  const admin = createServiceRoleClient()
  const reminders = await sendReminders(admin, todayJakarta(now))

  let pet: PetWeeklyReport
  try {
    pet = await petWeekly(admin, now, started + PET_WEEKLY_BUDGET_MS)
  } catch (err) {
    console.error('[cron/event-reminders] pet weekly failed:', err instanceof Error ? err.message : err)
    pet = { ran: false, reason: 'error' }
  }

  return NextResponse.json({ ...reminders.body, pet_weekly: pet }, { status: reminders.status })
}
