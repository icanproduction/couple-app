// "Our Story" (F22, route /app/perjalanan): one newest-first timeline merging the couple's
// start date, passed milestones, moments, finished bucket items, opened
// letters (metadata only), completed date/anniversary/milestone events, the
// day the partner joined, and pet adoptions.
import { createClient } from '@/lib/supabase'
import { todayJakarta } from '@/lib/dates'
import { milestoneStatus } from '@/lib/milestones'
import { listMoments, type CoupleInfo } from '@/lib/moments'

export type TimelineKind = 'start' | 'milestone' | 'moment' | 'bucket' | 'letter' | 'event' | 'joined' | 'pet'

export interface TimelineEntry {
  id: string
  kind: TimelineKind
  /** Jakarta date "YYYY-MM-DD" */
  date: string
  /** Sort key (ms); date-only items sit at Jakarta noon */
  at: number
  title: string
  subtitle: string | null
  href: string | null
  imageUrl: string | null
}

export interface Timeline {
  entries: TimelineEntry[]
  /** Earliest relationship_start_date of the two partners */
  startDate: string | null
}

const COMPLETED_EVENT_TYPES = ['date_plan', 'anniversary', 'milestone']
const EVENT_SUBTITLE: Record<string, string> = {
  date_plan: 'Date plan done',
  anniversary: 'Anniversary celebrated',
  milestone: 'Milestone reached',
}
const PET_TYPES: Record<string, string> = { cat: 'cat', dog: 'dog' }

const atDate = (date: string, time = '12:00:00') => Date.parse(`${date}T${time}+07:00`)
const jakartaDate = (iso: string) => todayJakarta(new Date(iso))

export async function loadTimeline(info: CoupleInfo): Promise<Timeline> {
  const coupleId = info.coupleId
  if (!coupleId) return { entries: [], startDate: null }
  const supabase = createClient()
  const memberIds = Object.keys(info.names)
  const nameOf = (id: string | null, fallback = 'Your partner') => (id && info.names[id]) || fallback

  const [profiles, members, moments, bucket, letters, events, pets] = await Promise.all([
    supabase.from('profiles').select('id, relationship_start_date').in('id', memberIds.length ? memberIds : [info.userId]),
    supabase.from('couple_members').select('profile_id, joined_at').eq('couple_id', coupleId).order('joined_at'),
    listMoments(coupleId),
    supabase.from('bucket_items').select('id, title, done_at').eq('couple_id', coupleId).eq('is_done', true).not('done_at', 'is', null),
    // Metadata columns only: letter content is never selected here.
    supabase.from('letters').select('id, sender_id, receiver_id, opened_at').eq('couple_id', coupleId).not('opened_at', 'is', null),
    supabase.from('couple_events').select('id, title, event_date, event_type, event_scope')
      .eq('couple_id', coupleId).eq('is_completed', true).in('event_type', COMPLETED_EVENT_TYPES),
    supabase.from('couple_pets').select('id, name, pet_type, created_at').eq('couple_id', coupleId),
  ])
  for (const r of [profiles, members, bucket, letters, events, pets]) if (r.error) throw r.error

  const entries: TimelineEntry[] = []
  const today = todayJakarta()

  const startDate = (profiles.data ?? [])
    .map((p) => p.relationship_start_date)
    .filter((d): d is string => !!d)
    .sort()[0] ?? null

  if (startDate && startDate <= today) {
    entries.push({
      id: 'start', kind: 'start', date: startDate, at: atDate(startDate, '00:00:00'),
      title: 'The day you got together', subtitle: 'Where your story began', href: null, imageUrl: null,
    })
    const { passed, next } = milestoneStatus(startDate, today)
    const reached = next && next.daysLeft === 0 ? [...passed, next] : passed
    for (const m of reached) {
      entries.push({
        id: `milestone-${m.key}`, kind: 'milestone', date: m.date, at: atDate(m.date, '00:00:01'),
        title: m.caption, subtitle: m.kind === 'years' ? `${m.label} together` : `${m.label} since you got together`,
        href: null, imageUrl: null,
      })
    }
  }

  const joined = members.data ?? []
  if (joined.length >= 2) {
    const second = joined[1]
    entries.push({
      id: `joined-${second.profile_id}`, kind: 'joined', date: jakartaDate(second.joined_at), at: Date.parse(second.joined_at),
      title: 'Connected on Nanti Kita', subtitle: `${nameOf(second.profile_id)} joined`, href: null, imageUrl: null,
    })
  }

  for (const m of moments) {
    entries.push({
      id: `moment-${m.id}`, kind: 'moment', date: m.moment_date, at: atDate(m.moment_date),
      title: m.title,
      subtitle: m.location_name || (m.photos.length ? `${m.photos.length} ${m.photos.length === 1 ? 'photo' : 'photos'}` : null),
      href: `/app/moments/${m.id}`,
      imageUrl: m.photos[0]?.url ?? null,
    })
  }

  for (const b of bucket.data ?? []) {
    if (!b.done_at) continue
    entries.push({
      id: `bucket-${b.id}`, kind: 'bucket', date: jakartaDate(b.done_at), at: Date.parse(b.done_at),
      title: b.title, subtitle: 'Ticked off the bucket list', href: '/app/bucket-list', imageUrl: null,
    })
  }

  for (const l of letters.data ?? []) {
    if (!l.opened_at) continue
    entries.push({
      id: `letter-${l.id}`, kind: 'letter', date: jakartaDate(l.opened_at), at: Date.parse(l.opened_at),
      title: 'Letter opened', subtitle: `From ${nameOf(l.sender_id)} to ${nameOf(l.receiver_id, 'your partner')}`,
      href: `/app/letters/${l.id}`, imageUrl: null,
    })
  }

  for (const e of events.data ?? []) {
    if (e.event_scope === 'personal' || e.event_date > today) continue
    entries.push({
      id: `event-${e.id}`, kind: 'event', date: e.event_date, at: atDate(e.event_date, '18:00:00'),
      title: e.title, subtitle: EVENT_SUBTITLE[e.event_type] ?? 'Event done', href: '/app/calendar', imageUrl: null,
    })
  }

  for (const p of pets.data ?? []) {
    if (!p.created_at) continue
    entries.push({
      id: `pet-${p.id}`, kind: 'pet', date: jakartaDate(p.created_at), at: Date.parse(p.created_at),
      title: `Adopted ${p.name}`, subtitle: PET_TYPES[p.pet_type] ? `Your pet ${PET_TYPES[p.pet_type]}` : 'Your pet',
      href: '/app/pet', imageUrl: null,
    })
  }

  entries.sort((a, b) => b.date.localeCompare(a.date) || b.at - a.at)
  return { entries, startDate }
}

/** Newest year first, keeping the entries' order. */
export function groupByYear(entries: TimelineEntry[]): { year: string; items: TimelineEntry[] }[] {
  const groups: { year: string; items: TimelineEntry[] }[] = []
  for (const e of entries) {
    const year = e.date.slice(0, 4)
    const last = groups[groups.length - 1]
    if (last?.year === year) last.items.push(e)
    else groups.push({ year, items: [e] })
  }
  return groups
}
