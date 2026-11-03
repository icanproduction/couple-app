// Monthly recap (F25): counts for one Jakarta calendar month, aggregated in
// the browser from RLS-scoped reads. The headline is built from the numbers
// (no AI).
import { createClient } from '@/lib/supabase'
import { formatRupiah } from '@/lib/utils'
import { MOMENTS_BUCKET, type CoupleInfo } from '@/lib/moments'

export interface PartnerRecap {
  id: string
  name: string
  isMe: boolean
  kangenSent: number
  kangenReceived: number
  /** mood key → days */
  moods: Record<string, number>
  moodDays: number
}

export interface MonthRecap {
  /** "YYYY-MM" */
  month: string
  moments: number
  photos: number
  places: string[]
  kangenTotal: number
  /** Me first, then my partner */
  partners: PartnerRecap[]
  /** Days both partners answered the daily question */
  dailyBothDays: number
  bucketDone: number
  bucketDoneTitles: string[]
  savingsIn: number
  savingsOut: number
  lettersWritten: number
  gratitudeNotes: number
  gamesCompleted: number
  bestPhoto: { url: string; momentId: string; title: string } | null
  headline: string
}

/** Date keys and Jakarta-midnight timestamps bounding the month [start, end). */
export function monthRange(monthKey: string) {
  const next = shiftMonth(monthKey, 1)
  return {
    startDate: `${monthKey}-01`,
    endDate: `${next}-01`,
    startTs: `${monthKey}-01T00:00:00+07:00`,
    endTs: `${next}-01T00:00:00+07:00`,
  }
}

export function shiftMonth(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split('-').map(Number)
  const total = y * 12 + (m - 1) + delta
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

/** "October 2026" (en-GB) */
export function monthLabelID(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

/** The earliest month worth showing: the relationship start date or when the couple was created. */
export async function earliestRecapMonth(info: CoupleInfo): Promise<string | null> {
  if (!info.coupleId) return null
  const supabase = createClient()
  const ids = Object.keys(info.names)
  const [{ data: couple }, { data: profiles }] = await Promise.all([
    supabase.from('couples').select('created_at').eq('id', info.coupleId).maybeSingle(),
    supabase.from('profiles').select('relationship_start_date').in('id', ids.length ? ids : [info.userId]),
  ])
  const candidates = [
    couple?.created_at ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit' }).format(new Date(couple.created_at)) : null,
    ...(profiles ?? []).map((p) => p.relationship_start_date?.slice(0, 7) ?? null),
  ].filter((k): k is string => !!k && /^\d{4}-\d{2}$/.test(k))
  return candidates.sort()[0] ?? null
}

/** "a", "a and b", "a, b and c" */
function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? ''
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

/** "1 photo", "3 photos" */
function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

type HeadlineInput = Omit<MonthRecap, 'headline' | 'bestPhoto' | 'month' | 'partners' | 'places' | 'bucketDoneTitles'> & { places: number }

/** A short line made from the month's numbers. */
export function recapHeadline(r: HeadlineInput): string {
  const parts: string[] = []
  if (r.moments) parts.push(count(r.moments, 'moment'))
  if (r.photos) parts.push(count(r.photos, 'photo'))
  if (r.kangenTotal) parts.push(`${r.kangenTotal}x Kangen`)
  if (r.dailyBothDays) parts.push(`${count(r.dailyBothDays, 'day')} of answering together`)
  if (r.bucketDone) parts.push(`${count(r.bucketDone, 'dream')} ticked off`)
  if (r.gamesCompleted) parts.push(`${count(r.gamesCompleted, 'game')} of Samakan`)
  if (r.lettersWritten) parts.push(count(r.lettersWritten, 'letter'))
  if (r.gratitudeNotes) parts.push(count(r.gratitudeNotes, 'Jar note'))
  if (r.savingsIn) parts.push(`savings up ${formatRupiah(r.savingsIn)}`)
  if (parts.length === 0) return 'A quiet month. Time to make some new stories together.'

  const theme =
    r.moments >= 3 || r.places >= 3 ? 'A month of adventures'
    : r.kangenTotal >= 20 ? 'A month of missing each other'
    : r.dailyBothDays >= 15 ? 'A month in sync'
    : r.bucketDone >= 2 ? 'A month of wins'
    : r.savingsIn > r.savingsOut && r.savingsIn > 0 && r.moments === 0 ? 'A month of saving up'
    : 'A sweet month'
  return `${theme}: ${joinList(parts.slice(0, 3))}`
}

export async function loadRecap(info: CoupleInfo, monthKey: string): Promise<MonthRecap> {
  const coupleId = info.coupleId
  if (!coupleId) throw new Error('no couple')
  const supabase = createClient()
  const { startDate, endDate, startTs, endTs } = monthRange(monthKey)

  const [moments, kangen, daily, moods, bucket, tx, letters, gratitude, games] = await Promise.all([
    supabase.from('moments')
      .select('id, title, location_name, is_favorite, moment_date, moment_photos(storage_path, sort_order, created_at)')
      .eq('couple_id', coupleId).gte('moment_date', startDate).lt('moment_date', endDate),
    supabase.from('miss_you').select('sender_id, receiver_id')
      .eq('couple_id', coupleId).gte('created_at', startTs).lt('created_at', endTs),
    // RLS shows the partner's answer only on days I answered too, which is
    // exactly the "both answered" set.
    supabase.from('daily_responses').select('profile_id, answered_date')
      .eq('couple_id', coupleId).gte('answered_date', startDate).lt('answered_date', endDate),
    supabase.from('mood_checkins').select('profile_id, mood')
      .eq('couple_id', coupleId).gte('checkin_date', startDate).lt('checkin_date', endDate),
    supabase.from('bucket_items').select('title')
      .eq('couple_id', coupleId).eq('is_done', true).gte('done_at', startTs).lt('done_at', endTs),
    supabase.from('couple_transactions').select('amount, type')
      .eq('couple_id', coupleId).gte('created_at', startTs).lt('created_at', endTs),
    supabase.from('letters').select('id', { count: 'exact', head: true })
      .eq('couple_id', coupleId).gte('created_at', startTs).lt('created_at', endTs),
    supabase.from('gratitude_notes').select('id', { count: 'exact', head: true })
      .eq('couple_id', coupleId).gte('created_at', startTs).lt('created_at', endTs),
    supabase.from('game_sessions').select('id', { count: 'exact', head: true })
      .eq('couple_id', coupleId).eq('status', 'completed').gte('completed_at', startTs).lt('completed_at', endTs),
  ])
  for (const r of [moments, kangen, daily, moods, bucket, tx, letters, gratitude, games]) if (r.error) throw r.error

  // Moments, photos, places, best photo
  const momentRows = moments.data ?? []
  const photos = momentRows.reduce((sum, m) => sum + (m.moment_photos?.length ?? 0), 0)
  const placeMap = new Map<string, string>()
  for (const m of momentRows) {
    const name = m.location_name?.trim()
    if (name && !placeMap.has(name.toLowerCase())) placeMap.set(name.toLowerCase(), name)
  }
  const best = momentRows
    .filter((m) => (m.moment_photos?.length ?? 0) > 0)
    .sort((a, b) =>
      Number(b.is_favorite) - Number(a.is_favorite)
      || b.moment_photos.length - a.moment_photos.length
      || b.moment_date.localeCompare(a.moment_date))[0]
  let bestPhoto: MonthRecap['bestPhoto'] = null
  if (best) {
    const cover = [...best.moment_photos].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))[0]
    const { data: signed } = await supabase.storage.from(MOMENTS_BUCKET).createSignedUrl(cover.storage_path, 60 * 60)
    if (signed?.signedUrl) bestPhoto = { url: signed.signedUrl, momentId: best.id, title: best.title }
  }

  // Per partner: me first
  const ids = [info.userId, ...(info.partnerId ? [info.partnerId] : [])]
  const partners: PartnerRecap[] = ids.map((id) => ({
    id,
    name: id === info.userId ? 'You' : info.names[id] ?? 'Your partner',
    isMe: id === info.userId,
    kangenSent: 0,
    kangenReceived: 0,
    moods: {},
    moodDays: 0,
  }))
  const byId = new Map(partners.map((p) => [p.id, p]))
  const kangenRows = kangen.data ?? []
  for (const k of kangenRows) {
    const sender = byId.get(k.sender_id)
    if (sender) sender.kangenSent++
    const receiver = byId.get(k.receiver_id)
    if (receiver) receiver.kangenReceived++
  }
  for (const m of moods.data ?? []) {
    const p = byId.get(m.profile_id)
    if (!p) continue
    p.moods[m.mood] = (p.moods[m.mood] ?? 0) + 1
    p.moodDays++
  }

  const answeredBy = new Map<string, Set<string>>()
  for (const d of daily.data ?? []) {
    const set = answeredBy.get(d.answered_date) ?? new Set<string>()
    set.add(d.profile_id)
    answeredBy.set(d.answered_date, set)
  }
  const dailyBothDays = Array.from(answeredBy.values()).filter((s) => s.size >= 2).length

  let savingsIn = 0
  let savingsOut = 0
  for (const t of tx.data ?? []) {
    const amount = Number(t.amount)
    if (t.type === 'deposit') savingsIn += Math.abs(amount)
    else if (t.type === 'withdrawal') savingsOut += Math.abs(amount)
  }

  const numbers = {
    moments: momentRows.length,
    photos,
    kangenTotal: kangenRows.length,
    dailyBothDays,
    bucketDone: bucket.data?.length ?? 0,
    savingsIn,
    savingsOut,
    lettersWritten: letters.count ?? 0,
    gratitudeNotes: gratitude.count ?? 0,
    gamesCompleted: games.count ?? 0,
  }

  return {
    month: monthKey,
    ...numbers,
    places: Array.from(placeMap.values()),
    partners,
    bucketDoneTitles: (bucket.data ?? []).map((b) => b.title),
    bestPhoto,
    headline: recapHeadline({ ...numbers, places: placeMap.size }),
  }
}

/** Plain-text summary for sharing. */
export function recapShareText(r: MonthRecap, partnerNames: Record<string, string>): string {
  const name = (p: PartnerRecap) => (p.isMe ? partnerNames[p.id] ?? 'Me' : p.name)
  const lines = [`Our ${monthLabelID(r.month)} recap on Nanti Kita`, r.headline, '']
  if (r.moments) {
    lines.push(`• ${count(r.moments, 'moment')}, ${count(r.photos, 'photo')}${r.places.length ? `, ${count(r.places.length, 'place')}` : ''}`)
  }
  if (r.kangenTotal) lines.push(`• Kangen: ${r.partners.map((p) => `${name(p)} ${p.kangenSent}x`).join(', ')}`)
  if (r.dailyBothDays) lines.push(`• ${count(r.dailyBothDays, 'day')} we both answered the daily question`)
  if (r.bucketDone) lines.push(`• ${count(r.bucketDone, 'bucket list item')} ticked off`)
  if (r.savingsIn || r.savingsOut) {
    lines.push(`• Savings: ${formatRupiah(r.savingsIn)} in${r.savingsOut ? `, ${formatRupiah(r.savingsOut)} out` : ''}`)
  }
  const extras = [
    r.lettersWritten ? count(r.lettersWritten, 'letter') : '',
    r.gratitudeNotes ? count(r.gratitudeNotes, 'Jar note') : '',
    r.gamesCompleted ? `${count(r.gamesCompleted, 'game')} of Samakan` : '',
  ].filter(Boolean)
  if (extras.length) lines.push(`• ${joinList(extras)}`)
  return lines.join('\n').trim()
}
