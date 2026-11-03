// Event reminder date logic (F09). Import-free on purpose so it runs in plain
// node (scripts/verify/finance-calendar.mjs) as well as in the cron route.
// Dates are calendar keys "YYYY-MM-DD"; "today" is passed in (Jakarta).

/** remind_days_before values the form and the DB accept (null = no reminder). */
export const REMIND_OPTIONS: ReadonlyArray<{ value: number | null; label: string }> = [
  { value: null, label: 'Tidak' },
  { value: 0, label: 'Hari H' },
  { value: 1, label: 'H-1' },
  { value: 3, label: 'H-3' },
  { value: 7, label: 'H-7' },
]

export interface ReminderEvent {
  event_date: string
  is_recurring: boolean
  remind_days_before: number | null
  is_completed?: boolean | null
}

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
}

function keyToUTC(key: string): number {
  const [y, m, d] = key.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

function utcToKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/** `key` shifted by `days` calendar days. */
export function addDays(key: string, days: number): string {
  return utcToKey(keyToUTC(key) + days * 86_400_000)
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((keyToUTC(to) - keyToUTC(from)) / 86_400_000)
}

/** The yearly occurrence of `eventDate` in `year` (Feb 29 → Mar 1 in non-leap years). */
function occurrenceInYear(eventDate: string, year: number): string {
  const md = eventDate.slice(5)
  if (md === '02-29' && !isLeapYear(year)) return `${year}-03-01`
  return `${year}-${md}`
}

/**
 * Same rule as the calendar page: one-off events fall on event_date only;
 * recurring ones every year on their month/day from their first date on.
 */
export function occursOn(eventDate: string, isRecurring: boolean, dateKey: string): boolean {
  if (!isRecurring) return eventDate === dateKey
  if (dateKey < eventDate) return false
  return occurrenceInYear(eventDate, Number(dateKey.slice(0, 4))) === dateKey
}

/**
 * The occurrence a reminder sent today would be about: one-off → event_date;
 * recurring → the next occurrence on/after `today` (the first date itself
 * while it is still ahead).
 */
export function nextOccurrenceFrom(eventDate: string, isRecurring: boolean, today: string): string {
  if (!isRecurring || eventDate >= today) return eventDate
  const year = Number(today.slice(0, 4))
  const thisYear = occurrenceInYear(eventDate, year)
  return thisYear >= today ? thisYear : occurrenceInYear(eventDate, year + 1)
}

/**
 * The occurrence date to remind about today, or null when no reminder is due:
 * due when today == occurrence − remind_days_before. Completed one-off events
 * (a date plan already marked done) are skipped.
 */
export function reminderDueOn(ev: ReminderEvent, today: string): string | null {
  const n = ev.remind_days_before
  if (n === null || n === undefined || n < 0) return null
  if (!ev.is_recurring && ev.is_completed) return null
  const occurrence = nextOccurrenceFrom(ev.event_date, ev.is_recurring, today)
  return daysBetween(today, occurrence) === n ? occurrence : null
}

/**
 * Who gets the push: a 'personal' event only its creator (when still in the
 * couple); 'couple' and 'partner' events both members.
 */
export function reminderRecipients(scope: string | null, createdBy: string | null, members: string[]): string[] {
  if (scope === 'personal') return members.filter((id) => id === createdBy)
  return Array.from(new Set(members))
}

/**
 * event_scope is stored from the creator's point of view ("personal" = the
 * creator's own, "partner" = for the creator's partner). For an event my
 * partner created, swapping personal ↔ partner gives MY point of view, and the
 * same swap turns my choice in the form back into theirs before saving.
 */
export function flipScopeForViewer(scope: string, createdByPartner: boolean): string {
  if (!createdByPartner) return scope
  if (scope === 'personal') return 'partner'
  if (scope === 'partner') return 'personal'
  return scope
}

/** "Hari ini: X" / "Besok: X" / "3 hari lagi: X" */
export function reminderTitle(title: string, daysBefore: number): string {
  const prefix = daysBefore <= 0 ? 'Hari ini' : daysBefore === 1 ? 'Besok' : `${daysBefore} hari lagi`
  return `${prefix}: ${title}`
}

const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
const MONTH_NAMES = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

/** "Jumat, 30 Oktober 2026" (+ " · lokasi"), the notification body. */
export function reminderBody(occurrence: string, location?: string | null): string {
  const d = new Date(keyToUTC(occurrence))
  const label = `${DAY_NAMES[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`
  const place = location?.trim()
  return place ? `${label} · ${place}` : label
}

/** Short badge for the event list: "Hari H", "H-1", … */
export function remindLabel(daysBefore: number | null): string | null {
  const opt = REMIND_OPTIONS.find((o) => o.value === daysBefore)
  return opt && opt.value !== null ? opt.label : null
}
